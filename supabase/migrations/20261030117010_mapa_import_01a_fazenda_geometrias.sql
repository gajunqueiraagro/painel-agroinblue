-- MAPA-IMPORT-01a (Gabriel 30/10/2026, opção A: UMA tabela de polígonos da fazenda, com tipo).
-- FASE 0 `~/Downloads/relatorios/mapa-import-01a-fase0.md` (HEAD 95d87aba).
-- ESTADO ANTERIOR (medido): `pasto_geometrias` com 5 colunas (id, pasto_id NOT NULL, geojson, created_at, updated_at), 0 constraints,
--   0 índices, 0 gatilhos; 48 linhas = 16 pastos da 3M × 3 cópias IDÊNTICAS (mesmo geojson, mesmo created_at 31/03/2026 10:41:38).
--   A tela lia/gravava fazenda_id, cliente_id, nome_original e cor, que não existiam: a leitura dava 400 e importar não gravava nada.
-- O QUE FAZ, nesta ordem:
--   1. backup das 48 linhas em `pasto_geometrias_bkp_20261030` (RLS ligada, ninguém além do postgres lê);
--   2. deixa 1 linha por pasto (a de menor ctid em cada id; as cópias são idênticas, até no id) — aborta se apagar ≠ 32 ou sobrar ≠ 16;
--   3. renomeia para `fazenda_geometrias` (polígono de pasto E de área da fazenda: reserva, APP, benfeitoria...);
--   4. colunas fazenda_id, cliente_id, tipo, nome_original, cor, preenchidas pelo pasto;
--      ⚠ O NOME DO POLÍGONO NO ARQUIVO DE MARÇO NÃO FOI GUARDADO (a coluna nunca existiu): `nome_original` das 16 = o nome do pasto;
--   5. estrutura: PK, FKs, tipo com lista fechada, (tipo = 'pasto') = (pasto_id preenchido), UM polígono por pasto, gatilho que barra
--      cliente diferente do da fazenda e fazenda/cliente diferentes dos do pasto, e carimba updated_at;
--      a ÁREA em ha NÃO é coluna: é calculada do polígono na leitura (a área cadastrada continua em pastos / fazenda_cadastros);
--   6. RLS: as 4 policies por `tenant_ok(cliente_id)`;
--   7. `fn_mapa_fazenda_substituir`: troca o mapa da fazenda inteiro numa transação (SECURITY INVOKER: a RLS vale);
--   8. conferência final (aborta tudo se algum número não bater).
-- FKs (D4, Gabriel 30/10): fazenda_id ON DELETE CASCADE (apagar a fazenda/o cliente leva os polígonos, como já leva os pastos);
--   pasto_id ON DELETE NO ACTION: apagar UM pasto com polígono é recusado; apagar a fazenda inteira passa (o polígono sai pela cascata
--   da fazenda no mesmo comando, e o NO ACTION só confere no fim).
-- Gatilho (D3, Gabriel 30/10): TODA linha tem o cliente da sua fazenda; a de pasto, também a fazenda e o cliente do pasto.

SET LOCAL lock_timeout = '2s';

-- 1. backup
CREATE TABLE public.pasto_geometrias_bkp_20261030 AS SELECT * FROM public.pasto_geometrias;
ALTER TABLE public.pasto_geometrias_bkp_20261030 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pasto_geometrias_bkp_20261030 FROM PUBLIC, anon, authenticated;

-- 2. uma linha por pasto. ⚠ As 3 cópias são idênticas INCLUSIVE NO id (a tabela nunca teve PK: 48 linhas, 16 ids — ensaio de 30/10):
--    "menor id" não as distingue. Fica a de menor ctid em cada id (Gabriel 30/10), só se as cópias de cada id forem iguais em tudo.
DO $$
DECLARE
  v_bkp int;
  v_ids_divergentes int;
  v_apagadas int;
  v_sobra int;
BEGIN
  SELECT count(*) INTO v_bkp FROM public.pasto_geometrias_bkp_20261030;
  IF v_bkp <> 48 THEN
    RAISE EXCEPTION 'MAPA-IMPORT-01a: o backup tem % linhas (esperado 48). Nada foi gravado.', v_bkp;
  END IF;
  SELECT count(*) INTO v_ids_divergentes FROM (
    SELECT g.id FROM public.pasto_geometrias g GROUP BY g.id
    HAVING count(DISTINCT (g.pasto_id::text, g.geojson::text, g.created_at::text, g.updated_at::text)) > 1) x;
  IF v_ids_divergentes <> 0 THEN
    RAISE EXCEPTION 'MAPA-IMPORT-01a: % id(s) com cópias de conteúdo diferente. Nada foi gravado.', v_ids_divergentes;
  END IF;
  DELETE FROM public.pasto_geometrias g
   WHERE EXISTS (SELECT 1 FROM public.pasto_geometrias o WHERE o.id = g.id AND o.ctid < g.ctid);
  GET DIAGNOSTICS v_apagadas = ROW_COUNT;
  SELECT count(*) INTO v_sobra FROM public.pasto_geometrias;
  IF v_apagadas <> 32 OR v_sobra <> 16 THEN
    RAISE EXCEPTION 'MAPA-IMPORT-01a: apagaria % e sobrariam % (esperado 32 e 16). Nada foi gravado.', v_apagadas, v_sobra;
  END IF;
END $$;

-- 3. renomear (as policies antigas vão junto e são trocadas no passo 6)
ALTER TABLE public.pasto_geometrias RENAME TO fazenda_geometrias;

-- 4. colunas novas, preenchidas pelo pasto
ALTER TABLE public.fazenda_geometrias
  ADD COLUMN fazenda_id uuid,
  ADD COLUMN cliente_id uuid,
  ADD COLUMN tipo text,
  ADD COLUMN nome_original text,
  ADD COLUMN cor text;

UPDATE public.fazenda_geometrias g
   SET fazenda_id = p.fazenda_id, cliente_id = p.cliente_id, tipo = 'pasto', nome_original = p.nome
  FROM public.pastos p
 WHERE p.id = g.pasto_id;

-- 5. estrutura final
ALTER TABLE public.fazenda_geometrias
  ADD CONSTRAINT fazenda_geometrias_pkey PRIMARY KEY (id),
  ALTER COLUMN fazenda_id SET NOT NULL,
  ALTER COLUMN cliente_id SET NOT NULL,
  ALTER COLUMN tipo SET NOT NULL,
  ALTER COLUMN nome_original SET NOT NULL,
  ALTER COLUMN pasto_id DROP NOT NULL,
  ADD CONSTRAINT fazenda_geometrias_fazenda_id_fkey FOREIGN KEY (fazenda_id) REFERENCES public.fazendas(id) ON DELETE CASCADE,
  ADD CONSTRAINT fazenda_geometrias_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id),
  ADD CONSTRAINT fazenda_geometrias_pasto_id_fkey FOREIGN KEY (pasto_id) REFERENCES public.pastos(id) ON DELETE NO ACTION,
  ADD CONSTRAINT fazenda_geometrias_tipo_check
    CHECK (tipo IN ('pasto', 'area_sem_uso', 'reserva_legal', 'app', 'benfeitoria', 'estrada', 'area_total', 'outra')),
  ADD CONSTRAINT fazenda_geometrias_pasto_se_tipo_pasto CHECK ((tipo = 'pasto') = (pasto_id IS NOT NULL));

CREATE UNIQUE INDEX fazenda_geometrias_um_por_pasto ON public.fazenda_geometrias (pasto_id) WHERE pasto_id IS NOT NULL;
CREATE INDEX fazenda_geometrias_fazenda_id_idx ON public.fazenda_geometrias (fazenda_id);

-- Todo polígono tem o cliente DA SUA FAZENDA; o de pasto, também a fazenda e o cliente DO PASTO. Diferente é recusado (nunca corrigido
-- em silêncio). SECURITY DEFINER: lê a fazenda e o pasto mesmo de outro cliente, para a recusa dizer o motivo certo.
CREATE FUNCTION public._fn_fazenda_geometrias_conferir()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fazenda uuid;
  v_cliente uuid;
BEGIN
  SELECT f.cliente_id INTO v_cliente FROM public.fazendas f WHERE f.id = NEW.fazenda_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A fazenda do polígono "%" não existe.', NEW.nome_original USING ERRCODE = '23503';
  END IF;
  IF NEW.cliente_id IS DISTINCT FROM v_cliente THEN
    RAISE EXCEPTION 'O polígono "%" está com um cliente diferente do da fazenda.', NEW.nome_original USING ERRCODE = '23514';
  END IF;
  IF NEW.pasto_id IS NOT NULL THEN
    SELECT p.fazenda_id, p.cliente_id INTO v_fazenda, v_cliente FROM public.pastos p WHERE p.id = NEW.pasto_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'O pasto do polígono "%" não existe.', NEW.nome_original USING ERRCODE = '23503';
    END IF;
    IF NEW.fazenda_id IS DISTINCT FROM v_fazenda OR NEW.cliente_id IS DISTINCT FROM v_cliente THEN
      RAISE EXCEPTION 'O polígono "%" está numa fazenda (ou cliente) diferente da do pasto.', NEW.nome_original
        USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public._fn_fazenda_geometrias_conferir() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_fazenda_geometrias_conferir
  BEFORE INSERT OR UPDATE ON public.fazenda_geometrias
  FOR EACH ROW EXECUTE FUNCTION public._fn_fazenda_geometrias_conferir();

-- 6. RLS por tenant direto no cliente_id
DROP POLICY pasto_geometrias_select_tenant ON public.fazenda_geometrias;
DROP POLICY pasto_geometrias_insert_tenant ON public.fazenda_geometrias;
DROP POLICY pasto_geometrias_update_tenant ON public.fazenda_geometrias;
DROP POLICY pasto_geometrias_delete_tenant ON public.fazenda_geometrias;
CREATE POLICY fazenda_geometrias_select_tenant ON public.fazenda_geometrias FOR SELECT TO authenticated
  USING (public.tenant_ok(cliente_id));
CREATE POLICY fazenda_geometrias_insert_tenant ON public.fazenda_geometrias FOR INSERT TO authenticated
  WITH CHECK (public.tenant_ok(cliente_id));
CREATE POLICY fazenda_geometrias_update_tenant ON public.fazenda_geometrias FOR UPDATE TO authenticated
  USING (public.tenant_ok(cliente_id)) WITH CHECK (public.tenant_ok(cliente_id));
CREATE POLICY fazenda_geometrias_delete_tenant ON public.fazenda_geometrias FOR DELETE TO authenticated
  USING (public.tenant_ok(cliente_id));
REVOKE ALL ON TABLE public.fazenda_geometrias FROM PUBLIC, anon;

-- 7. trocar o mapa da fazenda inteiro: apaga os polígonos dela e grava os recebidos, numa transação só
--    (qualquer erro — tipo fora da lista, pasto de outra fazenda, 2 polígonos no mesmo pasto — desfaz tudo; nada se apaga sem o novo).
--    Cada item de p_poligonos: { tipo, pasto_id | null, nome_original, geojson, cor | null }; o cliente vem da fazenda.
--    Devolve { total, por_tipo: { tipo: n } }.
CREATE FUNCTION public.fn_mapa_fazenda_substituir(p_fazenda_id uuid, p_poligonos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cliente uuid;
  v_total int;
  v_por_tipo jsonb;
BEGIN
  SELECT f.cliente_id INTO v_cliente FROM public.fazendas f WHERE f.id = p_fazenda_id;
  IF v_cliente IS NULL OR NOT coalesce(public.tenant_ok(v_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a esta fazenda' USING ERRCODE = '42501';
  END IF;
  IF p_poligonos IS NULL OR jsonb_typeof(p_poligonos) <> 'array' THEN
    RAISE EXCEPTION 'a lista de polígonos não veio' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.fazenda_geometrias WHERE fazenda_id = p_fazenda_id;

  INSERT INTO public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson, cor)
  SELECT p_fazenda_id, v_cliente, e.item->>'tipo', nullif(e.item->>'pasto_id', '')::uuid, e.item->>'nome_original', e.item->'geojson',
         nullif(e.item->>'cor', '')
    FROM jsonb_array_elements(p_poligonos) AS e(item);
  GET DIAGNOSTICS v_total = ROW_COUNT;

  SELECT coalesce(jsonb_object_agg(t.tipo, t.n), '{}'::jsonb) INTO v_por_tipo
    FROM (SELECT g.tipo, count(*) AS n FROM public.fazenda_geometrias g WHERE g.fazenda_id = p_fazenda_id GROUP BY g.tipo) t;

  RETURN jsonb_build_object('total', v_total, 'por_tipo', v_por_tipo);
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_mapa_fazenda_substituir(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mapa_fazenda_substituir(uuid, jsonb) TO authenticated;

-- 8. conferência (qualquer número errado desfaz a migration inteira)
DO $$
DECLARE
  v_linhas int;
  v_repetidos int;
  v_fora int;
  v_bkp int;
  v_policies int;
BEGIN
  SELECT count(*) INTO v_linhas FROM public.fazenda_geometrias;
  SELECT count(*) INTO v_repetidos FROM (SELECT pasto_id FROM public.fazenda_geometrias GROUP BY pasto_id HAVING count(*) > 1) x;
  SELECT count(*) INTO v_fora FROM public.fazenda_geometrias
   WHERE tipo <> 'pasto' OR fazenda_id <> 'ac8a596c-e458-425f-9779-3b528ce61072'::uuid;
  SELECT count(*) INTO v_bkp FROM public.pasto_geometrias_bkp_20261030;
  SELECT count(*) INTO v_policies FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fazenda_geometrias';
  IF v_linhas <> 16 OR v_repetidos <> 0 OR v_fora <> 0 OR v_bkp <> 48 OR v_policies <> 4
     OR has_table_privilege('anon', 'public.fazenda_geometrias', 'SELECT')
     OR has_function_privilege('anon', 'public.fn_mapa_fazenda_substituir(uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MAPA-IMPORT-01a: conferência falhou (linhas %, pastos repetidos %, fora da 3M/tipo %, backup %, policies %). Nada foi gravado.',
      v_linhas, v_repetidos, v_fora, v_bkp, v_policies;
  END IF;
  RAISE NOTICE 'MAPA-IMPORT-01a OK: 16 polígonos (tipo pasto, 3M), 0 pasto repetido, backup 48, 4 policies, anon sem acesso.';
END $$;
