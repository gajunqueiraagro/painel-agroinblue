-- MAPA-EDITAR-POLIGONO-01 (Gabriel 01/11/2026): editar os polígonos da fazenda (Geo Pastos › Validação) com trilha e desfazer.
-- A geometria (área, lados, dividir, unir, sobreposição) é calculada no front, numa lib só (a mesma conta de área do mapa); o banco
-- guarda, confere (cliente, fazenda, versão, formato, vínculo com pasto) e registra. Nenhuma área de cadastro muda aqui: a área
-- OFICIAL é a do pasto; o polígono é a "área do mapa".
--   1. fazenda_geometrias ganha `versao` (o gatilho soma 1 a cada UPDATE: quem grava manda a versão que leu) e `origem`
--      ('kmz' | 'editado' | 'desenhado') + `editado_em/editado_por`. Mudar a geometria de um polígono do KMZ o marca 'editado'.
--   2. fazenda_geometria_edicoes: a trilha da GEOMETRIA, uma linha por polígono tocado, antes → depois (a linha inteira), agrupadas por
--      gesto. Nome próprio porque a `fazenda_geometria_trilha` (MAPA-AREA-TIPO-01, Code 6, 117030) é a trilha da CLASSIFICAÇÃO (de/para
--      obrigatórios, sem polígono criado nem removido); juntar as duas é decisão à parte.
--   3. fn_geometria_gravar(fazenda, gesto, simular): editar · redesenhar · dividir · unir · apagar (motivo) · desenhar.
--      A prévia é a própria função com simular = true (aplica e desfaz numa subtransação: o efeito é exatamente o real).
--   4. fn_geometria_desfazer(gesto, simular): volta cada polígono do gesto ao "antes", se ninguém mexeu depois.
--   5. fn_mapa_fazenda_substituir ("Atualizar mapa" pelo KMZ), da definição VIVA (a do Code 6, 117030, com a memória da classificação)
--      + três blocos: só apaga o que veio do KMZ e ninguém editou; polígono editado ou desenhado FICA e o do arquivo com o mesmo nome
--      (ou o mesmo pasto) é ignorado; o polígono APAGADO (ou absorvido num "unir") não volta pelo arquivo (lápide pela trilha). Tipo e
--      vínculo continuam voltando pela memória do Code 6. Piquetes e grupos moram em pastos/grupos: o KMZ nunca os tocou.

-- 1. Colunas -----------------------------------------------------------------------------------------------------------------
SET LOCAL lock_timeout = '2s';
ALTER TABLE public.fazenda_geometrias
  ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'kmz',
  ADD COLUMN IF NOT EXISTS editado_em timestamptz,
  ADD COLUMN IF NOT EXISTS editado_por uuid;
ALTER TABLE public.fazenda_geometrias
  ADD CONSTRAINT fazenda_geometrias_origem_chk CHECK (origem IN ('kmz', 'editado', 'desenhado'));

CREATE OR REPLACE FUNCTION public._fn_fazenda_geometrias_versao()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  NEW.versao := OLD.versao + 1;
  IF NEW.geojson IS DISTINCT FROM OLD.geojson THEN
    IF OLD.origem = 'kmz' AND NEW.origem = 'kmz' THEN NEW.origem := 'editado'; END IF;
    NEW.editado_em := now();
    NEW.editado_por := auth.uid();
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public._fn_fazenda_geometrias_versao() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS trg_fazenda_geometrias_versao ON public.fazenda_geometrias;
CREATE TRIGGER trg_fazenda_geometrias_versao BEFORE UPDATE ON public.fazenda_geometrias
  FOR EACH ROW EXECUTE FUNCTION public._fn_fazenda_geometrias_versao();

-- 2. Trilha ------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fazenda_geometria_edicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gesto_id uuid NOT NULL,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id),
  geometria_id uuid NOT NULL,
  acao text NOT NULL CHECK (acao IN ('editar', 'redesenhar', 'dividir', 'unir', 'apagar', 'desenhar', 'desfazer')),
  antes jsonb,
  depois jsonb,
  motivo text,
  desfaz_gesto uuid,
  por uuid,
  em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fazenda_geometria_edicoes_algo_chk CHECK (antes IS NOT NULL OR depois IS NOT NULL),
  CONSTRAINT fazenda_geometria_edicoes_motivo_chk CHECK (acao <> 'apagar' OR (motivo IS NOT NULL AND btrim(motivo) <> '')),
  CONSTRAINT fazenda_geometria_edicoes_desfaz_chk CHECK ((acao = 'desfazer') = (desfaz_gesto IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS fazenda_geometria_edicoes_gesto_idx ON public.fazenda_geometria_edicoes (gesto_id);
CREATE INDEX IF NOT EXISTS fazenda_geometria_edicoes_geo_idx ON public.fazenda_geometria_edicoes (geometria_id, em);
CREATE INDEX IF NOT EXISTS fazenda_geometria_edicoes_faz_idx ON public.fazenda_geometria_edicoes (fazenda_id, em);
ALTER TABLE public.fazenda_geometria_edicoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fazenda_geometria_edicoes_select ON public.fazenda_geometria_edicoes;
CREATE POLICY fazenda_geometria_edicoes_select ON public.fazenda_geometria_edicoes FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));
REVOKE ALL ON public.fazenda_geometria_edicoes FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.fazenda_geometria_edicoes FROM authenticated;
GRANT SELECT ON public.fazenda_geometria_edicoes TO authenticated;
GRANT ALL ON public.fazenda_geometria_edicoes TO service_role;
DROP TRIGGER IF EXISTS trg_trilha_autor ON public.fazenda_geometria_edicoes;
CREATE TRIGGER trg_trilha_autor BEFORE INSERT ON public.fazenda_geometria_edicoes
  FOR EACH ROW EXECUTE FUNCTION public._fn_trilha_autor('por', 'em');
DROP TRIGGER IF EXISTS trg_trilha_imutavel ON public.fazenda_geometria_edicoes;
CREATE TRIGGER trg_trilha_imutavel BEFORE UPDATE OR DELETE ON public.fazenda_geometria_edicoes
  FOR EACH ROW EXECUTE FUNCTION public._fn_trilha_imutavel();

-- 3. Formato do polígono (interna) -------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fn_geojson_poligono_erro(p jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public
AS $$
DECLARE
  v_partes jsonb; parte jsonb; anel jsonb; pt jsonb; n int;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN 'geometria vazia'; END IF;
  IF p->>'type' = 'Polygon' THEN v_partes := jsonb_build_array(p->'coordinates');
  ELSIF p->>'type' = 'MultiPolygon' THEN v_partes := p->'coordinates';
  ELSE RETURN 'a geometria não é um polígono'; END IF;
  IF jsonb_typeof(v_partes) <> 'array' OR jsonb_array_length(v_partes) = 0 THEN RETURN 'polígono sem coordenadas'; END IF;
  FOR parte IN SELECT * FROM jsonb_array_elements(v_partes) LOOP
    IF jsonb_typeof(parte) <> 'array' OR jsonb_array_length(parte) = 0 THEN RETURN 'polígono sem anel'; END IF;
    FOR anel IN SELECT * FROM jsonb_array_elements(parte) LOOP
      n := CASE WHEN jsonb_typeof(anel) = 'array' THEN jsonb_array_length(anel) ELSE 0 END;
      IF n < 4 THEN RETURN 'um anel do polígono tem menos de 3 pontos'; END IF;
      IF anel->0 IS DISTINCT FROM anel->(n - 1) THEN RETURN 'um anel do polígono não fecha'; END IF;
      FOR pt IN SELECT * FROM jsonb_array_elements(anel) LOOP
        IF jsonb_typeof(pt) <> 'array' OR jsonb_array_length(pt) < 2
           OR jsonb_typeof(pt->0) <> 'number' OR jsonb_typeof(pt->1) <> 'number'
           OR abs((pt->>0)::numeric) > 180 OR abs((pt->>1)::numeric) > 90 THEN
          RETURN 'ponto fora do mapa';
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public._fn_geojson_poligono_erro(jsonb) FROM PUBLIC, anon;

-- 4. Gravar um gesto ---------------------------------------------------------------------------------------------------------
-- p_gesto = { acao, motivo,
--   alterar: [{ id, versao, geojson?, pasto_id? (chave presente = troca; null = desliga), nome_original? }],
--   criar:   [{ geojson, nome_original, pasto_id? }],
--   remover: [{ id, versao }] }
-- Formas aceitas: editar/redesenhar = 1 alterar com geojson · dividir = 1 alterar com geojson + 1 criar · unir = 1 alterar com
-- geojson + 1 remover · apagar = 1 remover (+ no máximo 1 alterar SEM geojson, o destino do pasto) e motivo · desenhar = 1 criar.
CREATE OR REPLACE FUNCTION public.fn_geometria_gravar(p_fazenda_id uuid, p_gesto jsonb, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cliente uuid;
  v_acao text := p_gesto->>'acao';
  v_motivo text := nullif(btrim(coalesce(p_gesto->>'motivo', '')), '');
  v_alt jsonb := coalesce(p_gesto->'alterar', '[]'::jsonb);
  v_cri jsonb := coalesce(p_gesto->'criar', '[]'::jsonb);
  v_rem jsonb := coalesce(p_gesto->'remover', '[]'::jsonb);
  v_gesto uuid := gen_random_uuid();
  v_res jsonb;
  e jsonb; g public.fazenda_geometrias; v_erro text; v_novo uuid; v_pasto uuid;
  v_antes jsonb := '{}'::jsonb;   -- id → linha antes
  v_pastos_antes uuid[]; v_pastos_depois uuid[];
  v_criados jsonb := '[]'::jsonb;
  v_forma_ok boolean;
BEGIN
  SELECT f.cliente_id INTO v_cliente FROM public.fazendas f WHERE f.id = p_fazenda_id;
  IF v_cliente IS NULL OR NOT coalesce(public.tenant_ok(v_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a esta fazenda' USING ERRCODE = '42501';
  END IF;
  IF v_acao IS NULL OR v_acao NOT IN ('editar', 'redesenhar', 'dividir', 'unir', 'apagar', 'desenhar') THEN
    RAISE EXCEPTION 'gesto desconhecido: %', coalesce(v_acao, '(vazio)') USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_alt) <> 'array' OR jsonb_typeof(v_cri) <> 'array' OR jsonb_typeof(v_rem) <> 'array' THEN
    RAISE EXCEPTION 'o gesto veio fora do formato' USING ERRCODE = '22023';
  END IF;
  -- a forma de cada gesto
  v_forma_ok := CASE v_acao
      WHEN 'editar' THEN jsonb_array_length(v_alt) = 1 AND jsonb_array_length(v_cri) = 0 AND jsonb_array_length(v_rem) = 0 AND v_alt->0 ? 'geojson'
      WHEN 'redesenhar' THEN jsonb_array_length(v_alt) = 1 AND jsonb_array_length(v_cri) = 0 AND jsonb_array_length(v_rem) = 0 AND v_alt->0 ? 'geojson'
      WHEN 'dividir' THEN jsonb_array_length(v_alt) = 1 AND jsonb_array_length(v_cri) = 1 AND jsonb_array_length(v_rem) = 0 AND v_alt->0 ? 'geojson'
      WHEN 'unir' THEN jsonb_array_length(v_alt) = 1 AND jsonb_array_length(v_cri) = 0 AND jsonb_array_length(v_rem) = 1 AND v_alt->0 ? 'geojson'
      WHEN 'apagar' THEN jsonb_array_length(v_rem) = 1 AND jsonb_array_length(v_cri) = 0 AND jsonb_array_length(v_alt) <= 1
                         AND NOT coalesce(v_alt->0 ? 'geojson', false)
      WHEN 'desenhar' THEN jsonb_array_length(v_cri) = 1 AND jsonb_array_length(v_alt) = 0 AND jsonb_array_length(v_rem) = 0
    END;
  IF NOT coalesce(v_forma_ok, false) THEN
    RAISE EXCEPTION 'o gesto "%" veio com polígonos a mais ou a menos', v_acao USING ERRCODE = '22023';
  END IF;
  IF v_acao = 'apagar' AND v_motivo IS NULL THEN
    RAISE EXCEPTION 'Diga o motivo para apagar o polígono.' USING ERRCODE = '22023';
  END IF;

  -- cada polígono tocado: desta fazenda, na versão que a tela leu (trava a linha)
  FOR e IN SELECT * FROM jsonb_array_elements(v_alt || v_rem) LOOP
    SELECT * INTO g FROM public.fazenda_geometrias WHERE id = (e->>'id')::uuid AND fazenda_id = p_fazenda_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'polígono não encontrado nesta fazenda' USING ERRCODE = 'P0002'; END IF;
    IF v_antes ? g.id::text THEN RAISE EXCEPTION 'o mesmo polígono veio duas vezes no gesto' USING ERRCODE = '22023'; END IF;
    IF g.versao IS DISTINCT FROM (e->>'versao')::int THEN
      RAISE EXCEPTION 'O polígono "%" mudou desde que a tela leu. Recarregue o mapa.', g.nome_original USING ERRCODE = '40001';
    END IF;
    v_antes := v_antes || jsonb_build_object(g.id::text, to_jsonb(g));
  END LOOP;
  FOR e IN SELECT * FROM jsonb_array_elements(v_alt || v_cri) LOOP
    IF e ? 'geojson' THEN
      v_erro := public._fn_geojson_poligono_erro(e->'geojson');
      IF v_erro IS NOT NULL THEN RAISE EXCEPTION 'Polígono inválido: %.', v_erro USING ERRCODE = '22023'; END IF;
    END IF;
    IF nullif(e->>'pasto_id', '') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.pastos p WHERE p.id = (e->>'pasto_id')::uuid AND p.fazenda_id = p_fazenda_id) THEN
      RAISE EXCEPTION 'o pasto escolhido não é desta fazenda' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOR e IN SELECT * FROM jsonb_array_elements(v_cri) LOOP
    IF btrim(coalesce(e->>'nome_original', '')) = '' THEN RAISE EXCEPTION 'o polígono novo precisa de nome' USING ERRCODE = '22023'; END IF;
  END LOOP;
  -- apagar polígono ligado a pasto: desligar antes ou escolher o destino (o alterar do gesto recebe o pasto)
  IF v_acao = 'apagar' THEN
    v_pasto := nullif(v_antes->((v_rem->0->>'id')::uuid::text)->>'pasto_id', '')::uuid;
    IF v_pasto IS NOT NULL AND NOT coalesce((v_alt->0->>'pasto_id')::uuid = v_pasto, false) THEN
      RAISE EXCEPTION 'Este polígono está ligado a um pasto: desligue o vínculo antes ou escolha o polígono que fica com o pasto.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT coalesce(array_agg(pasto_id), '{}') INTO v_pastos_antes
    FROM public.fazenda_geometrias WHERE fazenda_id = p_fazenda_id AND pasto_id IS NOT NULL;

  BEGIN
    -- A: quem troca de pasto solta o vínculo antes (o índice "um polígono por pasto" não pode ver dois no meio do gesto)
    FOR e IN SELECT * FROM jsonb_array_elements(v_alt) LOOP
      IF e ? 'pasto_id' THEN
        UPDATE public.fazenda_geometrias SET pasto_id = NULL, tipo = 'outra' WHERE id = (e->>'id')::uuid AND pasto_id IS NOT NULL;
      END IF;
    END LOOP;
    -- B: remover
    FOR e IN SELECT * FROM jsonb_array_elements(v_rem) LOOP
      DELETE FROM public.fazenda_geometrias WHERE id = (e->>'id')::uuid;
    END LOOP;
    -- C: alterar
    FOR e IN SELECT * FROM jsonb_array_elements(v_alt) LOOP
      g := jsonb_populate_record(NULL::public.fazenda_geometrias, v_antes->((e->>'id')::uuid::text));
      UPDATE public.fazenda_geometrias SET
        geojson = CASE WHEN e ? 'geojson' THEN e->'geojson' ELSE geojson END,
        pasto_id = CASE WHEN e ? 'pasto_id' THEN nullif(e->>'pasto_id', '')::uuid ELSE g.pasto_id END,
        tipo = CASE WHEN e ? 'pasto_id' THEN CASE WHEN nullif(e->>'pasto_id', '') IS NULL THEN
                      CASE WHEN g.tipo = 'pasto' THEN 'outra' ELSE g.tipo END ELSE 'pasto' END
                    ELSE g.tipo END,
        nome_original = coalesce(nullif(btrim(e->>'nome_original'), ''), nome_original)
      WHERE id = (e->>'id')::uuid;
    END LOOP;
    -- D: criar (nasce sem tipo: 'outra', ou 'pasto' se veio o vínculo)
    FOR e IN SELECT * FROM jsonb_array_elements(v_cri) LOOP
      INSERT INTO public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson, origem, editado_em, editado_por)
      VALUES (p_fazenda_id, v_cliente,
              CASE WHEN nullif(e->>'pasto_id', '') IS NULL THEN 'outra' ELSE 'pasto' END,
              nullif(e->>'pasto_id', '')::uuid, btrim(e->>'nome_original'), e->'geojson', 'desenhado', now(), auth.uid())
      RETURNING id INTO v_novo;
      v_criados := v_criados || to_jsonb(v_novo);
    END LOOP;

    -- trilha: uma linha por polígono, antes → depois
    INSERT INTO public.fazenda_geometria_edicoes (gesto_id, cliente_id, fazenda_id, geometria_id, acao, antes, depois, motivo)
    SELECT v_gesto, v_cliente, p_fazenda_id, k::uuid, v_acao, v_antes->k,
           (SELECT to_jsonb(x) FROM public.fazenda_geometrias x WHERE x.id = k::uuid), v_motivo
      FROM jsonb_object_keys(v_antes) k
    UNION ALL
    SELECT v_gesto, v_cliente, p_fazenda_id, (c #>> '{}')::uuid, v_acao, NULL,
           (SELECT to_jsonb(x) FROM public.fazenda_geometrias x WHERE x.id = (c #>> '{}')::uuid), v_motivo
      FROM jsonb_array_elements(v_criados) c;

    SELECT coalesce(array_agg(pasto_id), '{}') INTO v_pastos_depois
      FROM public.fazenda_geometrias WHERE fazenda_id = p_fazenda_id AND pasto_id IS NOT NULL;

    v_res := jsonb_build_object(
      'gesto_id', v_gesto, 'acao', v_acao, 'simulado', p_simular,
      'poligonos', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', t.geometria_id,
          'nome', coalesce(t.depois->>'nome_original', t.antes->>'nome_original'),
          'mudanca', CASE WHEN t.antes IS NULL THEN 'criado' WHEN t.depois IS NULL THEN 'removido' ELSE 'alterado' END,
          'pasto_antes', t.antes->>'pasto_id', 'pasto_depois', t.depois->>'pasto_id',
          'versao', (t.depois->>'versao')::int)), '[]'::jsonb)
        FROM public.fazenda_geometria_edicoes t WHERE t.gesto_id = v_gesto),
      'pastos_sem_poligono', (SELECT coalesce(jsonb_agg(jsonb_build_object('pasto_id', p.id, 'nome', p.nome)), '[]'::jsonb)
        FROM public.pastos p WHERE p.id = ANY (v_pastos_antes) AND NOT (p.id = ANY (v_pastos_depois))));

    IF p_simular THEN
      RAISE EXCEPTION USING ERRCODE = 'ZG001', MESSAGE = v_res::text;
    END IF;
  EXCEPTION WHEN SQLSTATE 'ZG001' THEN
    RETURN SQLERRM::jsonb;
  END;
  RETURN v_res;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_geometria_gravar(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_geometria_gravar(uuid, jsonb, boolean) TO authenticated;

-- 5. Desfazer um gesto -------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_geometria_desfazer(p_gesto_id uuid, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_fazenda uuid; v_cliente uuid; v_acao text; v_gesto uuid := gen_random_uuid(); v_res jsonb;
  t record; g public.fazenda_geometrias; a public.fazenda_geometrias;
BEGIN
  SELECT fazenda_id, cliente_id, acao INTO v_fazenda, v_cliente, v_acao
    FROM public.fazenda_geometria_edicoes WHERE gesto_id = p_gesto_id LIMIT 1;
  IF v_fazenda IS NULL THEN RAISE EXCEPTION 'gesto não encontrado' USING ERRCODE = 'P0002'; END IF;
  IF NOT coalesce(public.tenant_ok(v_cliente), false) THEN RAISE EXCEPTION 'sem acesso a esta fazenda' USING ERRCODE = '42501'; END IF;
  IF v_acao = 'desfazer' THEN RAISE EXCEPTION 'Um desfazer não se desfaz: grave o gesto de novo.' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.fazenda_geometria_edicoes WHERE desfaz_gesto = p_gesto_id) THEN
    RAISE EXCEPTION 'Este gesto já foi desfeito.' USING ERRCODE = '22023';
  END IF;
  -- ninguém mexeu depois: cada polígono está exatamente como o gesto deixou
  FOR t IN SELECT * FROM public.fazenda_geometria_edicoes WHERE gesto_id = p_gesto_id LOOP
    SELECT * INTO g FROM public.fazenda_geometrias WHERE id = t.geometria_id FOR UPDATE;
    IF (t.depois IS NULL) <> (NOT FOUND) OR (FOUND AND g.versao IS DISTINCT FROM (t.depois->>'versao')::int) THEN
      RAISE EXCEPTION 'O polígono "%" mudou depois deste gesto: desfaça primeiro o que veio depois.',
        coalesce(t.depois->>'nome_original', t.antes->>'nome_original') USING ERRCODE = '40001';
    END IF;
  END LOOP;

  BEGIN
    -- A: solta os vínculos de quem vai mudar ou sair
    UPDATE public.fazenda_geometrias SET pasto_id = NULL, tipo = 'outra'
     WHERE id IN (SELECT geometria_id FROM public.fazenda_geometria_edicoes WHERE gesto_id = p_gesto_id AND depois IS NOT NULL)
       AND pasto_id IS NOT NULL;
    -- B: o que o gesto criou sai
    DELETE FROM public.fazenda_geometrias
     WHERE id IN (SELECT geometria_id FROM public.fazenda_geometria_edicoes WHERE gesto_id = p_gesto_id AND antes IS NULL);
    -- C: o que o gesto alterou volta ao antes
    FOR t IN SELECT * FROM public.fazenda_geometria_edicoes WHERE gesto_id = p_gesto_id AND antes IS NOT NULL AND depois IS NOT NULL LOOP
      a := jsonb_populate_record(NULL::public.fazenda_geometrias, t.antes);
      UPDATE public.fazenda_geometrias SET geojson = a.geojson, pasto_id = a.pasto_id, tipo = a.tipo, nome_original = a.nome_original,
             cor = a.cor, origem = a.origem, editado_em = a.editado_em, editado_por = a.editado_por
       WHERE id = t.geometria_id;
    END LOOP;
    -- D: o que o gesto removeu volta, com o mesmo id
    FOR t IN SELECT * FROM public.fazenda_geometria_edicoes WHERE gesto_id = p_gesto_id AND depois IS NULL LOOP
      a := jsonb_populate_record(NULL::public.fazenda_geometrias, t.antes);
      INSERT INTO public.fazenda_geometrias (id, pasto_id, geojson, created_at, fazenda_id, cliente_id, tipo, nome_original, cor, origem,
                                             editado_em, editado_por, versao)
      VALUES (a.id, a.pasto_id, a.geojson, a.created_at, a.fazenda_id, a.cliente_id, a.tipo, a.nome_original, a.cor, a.origem,
              a.editado_em, a.editado_por, a.versao + 1);
    END LOOP;

    INSERT INTO public.fazenda_geometria_edicoes (gesto_id, cliente_id, fazenda_id, geometria_id, acao, antes, depois, motivo, desfaz_gesto)
    SELECT v_gesto, v_cliente, v_fazenda, t2.geometria_id, 'desfazer', t2.depois,
           (SELECT to_jsonb(x) FROM public.fazenda_geometrias x WHERE x.id = t2.geometria_id), 'desfaz o gesto ' || t2.acao, p_gesto_id
      FROM public.fazenda_geometria_edicoes t2 WHERE t2.gesto_id = p_gesto_id;

    v_res := jsonb_build_object('gesto_id', v_gesto, 'desfaz_gesto', p_gesto_id, 'acao_desfeita', v_acao, 'simulado', p_simular,
      'poligonos', (SELECT jsonb_agg(jsonb_build_object('id', geometria_id,
          'mudanca', CASE WHEN antes IS NULL THEN 'volta' WHEN depois IS NULL THEN 'sai' ELSE 'volta ao antes' END))
        FROM public.fazenda_geometria_edicoes WHERE gesto_id = v_gesto));
    IF p_simular THEN RAISE EXCEPTION USING ERRCODE = 'ZG001', MESSAGE = v_res::text; END IF;
  EXCEPTION WHEN SQLSTATE 'ZG001' THEN
    RETURN SQLERRM::jsonb;
  END;
  RETURN v_res;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_geometria_desfazer(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_geometria_desfazer(uuid, boolean) TO authenticated;

-- 6. "Atualizar mapa" (KMZ) preserva o editado — a definição viva (117030) + os blocos marcados MAPA-EDITAR-POLIGONO-01 ----------------
CREATE OR REPLACE FUNCTION public.fn_mapa_fazenda_substituir(p_fazenda_id uuid, p_poligonos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cliente uuid;
  v_total int := 0;
  v_criados int := 0;
  v_ordem int;
  v_pasto uuid;
  v_nome text;
  v_por_tipo jsonb;
  e record;
  v_mantidas int := 0;
  v_ficam_nomes text[];
  v_ficam_pastos uuid[];
  v_apagados text[];
  v_preservados int := 0;
  v_ignorados int := 0;
BEGIN
  SELECT f.cliente_id INTO v_cliente FROM public.fazendas f WHERE f.id = p_fazenda_id;
  IF v_cliente IS NULL OR NOT coalesce(public.tenant_ok(v_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a esta fazenda' USING ERRCODE = '42501';
  END IF;
  IF p_poligonos IS NULL OR jsonb_typeof(p_poligonos) <> 'array' THEN
    RAISE EXCEPTION 'a lista de polígonos não veio' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(max(p.ordem_exibicao), 0) INTO v_ordem FROM public.pastos p WHERE p.fazenda_id = p_fazenda_id;

  -- MAPA-EDITAR-POLIGONO-01: o editado e o desenhado ficam (e o do arquivo com o mesmo nome ou o mesmo pasto é ignorado); o apagado
  -- pela edição (apagar / unir) não volta pelo arquivo, enquanto não for desfeito
  SELECT coalesce(array_agg(public._fn_normalizar_texto(g.nome_original)), '{}'),
         coalesce(array_agg(g.pasto_id) FILTER (WHERE g.pasto_id IS NOT NULL), '{}'), count(*)
    INTO v_ficam_nomes, v_ficam_pastos, v_preservados
    FROM public.fazenda_geometrias g WHERE g.fazenda_id = p_fazenda_id AND g.origem <> 'kmz';
  SELECT coalesce(array_agg(DISTINCT public._fn_normalizar_texto(t.antes->>'nome_original')), '{}') INTO v_apagados
    FROM public.fazenda_geometria_edicoes t
   WHERE t.fazenda_id = p_fazenda_id AND t.depois IS NULL AND t.acao IN ('apagar', 'unir')
     AND NOT EXISTS (SELECT 1 FROM public.fazenda_geometrias x WHERE x.id = t.geometria_id);

  DELETE FROM public.fazenda_geometrias WHERE fazenda_id = p_fazenda_id AND origem = 'kmz';

  FOR e IN SELECT x.item FROM jsonb_array_elements(p_poligonos) WITH ORDINALITY AS x(item, ord) ORDER BY x.ord LOOP
    IF public._fn_normalizar_texto(coalesce(e.item->>'nome_original', '')) = ANY (v_ficam_nomes || v_apagados)
       OR nullif(e.item->>'pasto_id', '')::uuid = ANY (v_ficam_pastos) THEN
      v_ignorados := v_ignorados + 1;
      CONTINUE;
    END IF;
    IF e.item->>'tipo' = 'pasto_novo' THEN
      v_nome := btrim(coalesce(e.item->>'nome_original', ''));
      IF v_nome = '' THEN
        RAISE EXCEPTION 'pasto novo sem nome' USING ERRCODE = '22023';
      END IF;
      IF EXISTS (SELECT 1 FROM public.pastos p
                  WHERE p.fazenda_id = p_fazenda_id
                    AND public._fn_normalizar_texto(p.nome) = public._fn_normalizar_texto(v_nome)) THEN
        RAISE EXCEPTION 'Já existe um pasto com o nome "%" nesta fazenda.', v_nome USING ERRCODE = '23505';
      END IF;
      v_ordem := v_ordem + 1;
      INSERT INTO public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, observacoes, ativo, data_inicio, data_fim,
                                 ordem_exibicao)
      VALUES (p_fazenda_id, v_cliente, v_nome, round(nullif(e.item->>'area_ha', '')::numeric, 2), 'recria', NULL, true,
              date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date)::date, NULL, v_ordem)
      RETURNING id INTO v_pasto;
      v_criados := v_criados + 1;
      INSERT INTO public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson, cor)
      VALUES (p_fazenda_id, v_cliente, 'pasto', v_pasto, v_nome, e.item->'geojson', nullif(e.item->>'cor', ''));
    ELSE
      INSERT INTO public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson, cor)
      VALUES (p_fazenda_id, v_cliente, e.item->>'tipo', nullif(e.item->>'pasto_id', '')::uuid, e.item->>'nome_original', e.item->'geojson',
              nullif(e.item->>'cor', ''));
    END IF;
    v_total := v_total + 1;
  END LOOP;

  -- MAPA-AREA-TIPO-01: a classificação feita no mapa NÃO se perde no "Atualizar mapa". Polígono que chega SEM classificação ('outra')
  -- recebe a lembrada pelo nome (sem acento, caixa ou espaço: `_fn_normalizar_texto`); a escolha explícita do arquivo/tela vence. O pasto
  -- lembrado só volta se ainda é desta fazenda, se nenhum outro polígono deste import ficou com ele e se só UM polígono tem aquele nome.
  WITH lembradas AS (
    SELECT DISTINCT ON (coalesce(m.pasto_id, g.id)) g.id, m.tipo, m.pasto_id   -- um pasto lembrado sob dois nomes volta para UM (o mais recente)
      FROM public.fazenda_geometrias g
      JOIN public.fazenda_geometria_classificacoes m
        ON m.fazenda_id = g.fazenda_id AND m.chave = public._fn_normalizar_texto(g.nome_original)
     WHERE g.fazenda_id = p_fazenda_id AND g.tipo = 'outra'
       AND (m.tipo <> 'pasto' OR (
             EXISTS (SELECT 1 FROM public.pastos p WHERE p.id = m.pasto_id AND p.fazenda_id = p_fazenda_id)
             AND NOT EXISTS (SELECT 1 FROM public.fazenda_geometrias o WHERE o.pasto_id = m.pasto_id)
             AND (SELECT count(*) FROM public.fazenda_geometrias g2
                   WHERE g2.fazenda_id = p_fazenda_id AND g2.tipo = 'outra'
                     AND public._fn_normalizar_texto(g2.nome_original) = m.chave) = 1))
     ORDER BY coalesce(m.pasto_id, g.id), m.em DESC
  )
  UPDATE public.fazenda_geometrias g SET tipo = l.tipo, pasto_id = l.pasto_id FROM lembradas l WHERE g.id = l.id;
  GET DIAGNOSTICS v_mantidas = ROW_COUNT;

  SELECT coalesce(jsonb_object_agg(t.tipo, t.n), '{}'::jsonb) INTO v_por_tipo
    FROM (SELECT g.tipo, count(*) AS n FROM public.fazenda_geometrias g WHERE g.fazenda_id = p_fazenda_id GROUP BY g.tipo) t;

  RETURN jsonb_build_object('total', v_total, 'por_tipo', v_por_tipo, 'pastos_criados', v_criados,
                            'classificacoes_mantidas', v_mantidas,
                            'editados_preservados', v_preservados, 'do_arquivo_ignorados', v_ignorados);
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_mapa_fazenda_substituir(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mapa_fazenda_substituir(uuid, jsonb) TO authenticated;
