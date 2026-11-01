-- FECH-ROTACAO-01 · GRUPO DE PASTEJO · FATIA 1 (banco) · Code 1
-- Decisões do Gabriel (31/10): G1 piquete = pasto do cadastro + pasto_grupos (grupo_id nulo = como hoje;
-- área do grupo calculada, nunca gravada); G2 (b) cada lote no card de um piquete seu, sem mexer na chave
-- do item; G3 rateio por área; G4 (lotação da fazenda) fica para depois.
-- Sem grupo e sem alocação, nada muda: fn_lotacao_do_mes devolve, pasto a pasto, a mesma conta de hoje
-- (Σ itens do card ÷ area_produtiva_ha). Nenhuma tela lê nada disto ainda.

-- 1) O grupo de pastejo: só o nome; a área é a soma dos pastos membros, calculada na leitura.
CREATE TABLE public.pasto_grupos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  uuid NOT NULL REFERENCES public.clientes(id),
  fazenda_id  uuid NOT NULL REFERENCES public.fazendas(id),
  nome        text NOT NULL CHECK (btrim(nome) <> ''),
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, fazenda_id)
);
CREATE UNIQUE INDEX pasto_grupos_nome_uq ON public.pasto_grupos (fazenda_id, lower(btrim(nome)));

ALTER TABLE public.pasto_grupos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pasto_grupos_select_tenant ON public.pasto_grupos FOR SELECT USING (tenant_ok(cliente_id));
CREATE POLICY pasto_grupos_insert_tenant ON public.pasto_grupos FOR INSERT
  WITH CHECK (tenant_ok(cliente_id) AND cliente_id = (SELECT f.cliente_id FROM public.fazendas f WHERE f.id = fazenda_id));
CREATE POLICY pasto_grupos_update_tenant ON public.pasto_grupos FOR UPDATE USING (tenant_ok(cliente_id))
  WITH CHECK (tenant_ok(cliente_id) AND cliente_id = (SELECT f.cliente_id FROM public.fazendas f WHERE f.id = fazenda_id));
CREATE POLICY pasto_grupos_delete_tenant ON public.pasto_grupos FOR DELETE USING (tenant_ok(cliente_id));
REVOKE ALL ON public.pasto_grupos FROM anon;

-- 2) O pasto entra no grupo. A chave composta garante grupo e pasto da MESMA fazenda (nulo = sem grupo).
ALTER TABLE public.pastos ADD COLUMN grupo_id uuid;
ALTER TABLE public.pastos ADD CONSTRAINT pastos_grupo_mesma_fazenda_fk
  FOREIGN KEY (grupo_id, fazenda_id) REFERENCES public.pasto_grupos (id, fazenda_id);
CREATE INDEX pastos_grupo_id_idx ON public.pastos (grupo_id) WHERE grupo_id IS NOT NULL;

-- 3) Onde o lote do card esteve no mês. Chave = (card, texto do lote), nunca o id do item
--    (fn_fechamento_pasto_salvar troca os ids a cada salvar). lote '' = o card inteiro.
--    Sem linha = como hoje: o lote está só no pasto do card. Grava só fn_fechamento_alocacoes_salvar.
CREATE TABLE public.fechamento_alocacoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id     uuid NOT NULL REFERENCES public.clientes(id),
  fazenda_id     uuid NOT NULL REFERENCES public.fazendas(id),
  ano_mes        text NOT NULL,
  fechamento_id  uuid NOT NULL REFERENCES public.fechamento_pastos(id) ON DELETE CASCADE,
  lote           text NOT NULL DEFAULT '',
  pasto_id       uuid NOT NULL REFERENCES public.pastos(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid DEFAULT auth.uid(),
  UNIQUE (fechamento_id, lote, pasto_id)
);
CREATE INDEX fechamento_alocacoes_fazenda_mes_idx ON public.fechamento_alocacoes (fazenda_id, ano_mes);
CREATE INDEX fechamento_alocacoes_pasto_idx ON public.fechamento_alocacoes (pasto_id);

ALTER TABLE public.fechamento_alocacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY fechamento_alocacoes_select_tenant ON public.fechamento_alocacoes FOR SELECT USING (tenant_ok(cliente_id));
REVOKE ALL ON public.fechamento_alocacoes FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.fechamento_alocacoes FROM authenticated;

-- 4) O escritor único: troca os pastos de UM lote do card. Lista vazia (ou só o pasto do card) = volta a como hoje.
CREATE FUNCTION public.fn_fechamento_alocacoes_salvar(p_fechamento_id uuid, p_lote text, p_pasto_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fp    public.fechamento_pastos%ROWTYPE;
  v_lote  text := coalesce(btrim(p_lote), '');
  v_ids   uuid[];
  v_nome  text;
  v_n     integer := 0;
  v_aviso text;
BEGIN
  PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[(
    SELECT f.cliente_id FROM public.fechamento_pastos fp JOIN public.fazendas f ON f.id = fp.fazenda_id WHERE fp.id = p_fechamento_id)]);
  SELECT * INTO v_fp FROM public.fechamento_pastos WHERE id = p_fechamento_id FOR UPDATE;
  IF v_fp.status = 'fechado' THEN
    RAISE EXCEPTION 'O pasto está fechado neste mês. Reabra o pasto antes de alterar.' USING ERRCODE = 'P0001';
  END IF;
  IF public._fn_fechamento_p2_travado(v_fp.fazenda_id, v_fp.ano_mes) THEN
    RAISE EXCEPTION 'Mês % possui Valor do Rebanho validado ou P2 fechado. Reabra o pilar P2 antes de alterar pastos.', v_fp.ano_mes
      USING ERRCODE = 'P0001';
  END IF;

  v_ids := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_pasto_ids, '{}'::uuid[])) x WHERE x IS NOT NULL);

  IF cardinality(v_ids) > 0 AND NOT (v_fp.pasto_id = ANY (v_ids)) THEN
    RAISE EXCEPTION 'O pasto do card tem de estar entre os pastos do lote.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_ids) x LEFT JOIN public.pastos p ON p.id = x
              WHERE p.id IS NULL OR p.fazenda_id <> v_fp.fazenda_id) THEN
    RAISE EXCEPTION 'Só dá para usar pastos desta fazenda.' USING ERRCODE = 'P0001';
  END IF;
  SELECT p.nome INTO v_nome FROM unnest(v_ids) x JOIN public.pastos p ON p.id = x
   WHERE NOT public.fn_pasto_vigente_no_mes(p.ativo, p.data_inicio, p.data_fim, v_fp.ano_mes) ORDER BY p.nome LIMIT 1;
  IF v_nome IS NOT NULL THEN
    RAISE EXCEPTION 'O pasto % não está ativo em %.', v_nome, v_fp.ano_mes USING ERRCODE = 'P0001';
  END IF;
  IF cardinality(v_ids) > 1 THEN
    SELECT p.nome INTO v_nome FROM unnest(v_ids) x JOIN public.pastos p ON p.id = x
     WHERE coalesce(p.area_produtiva_ha, 0) <= 0 ORDER BY p.nome LIMIT 1;
    IF v_nome IS NOT NULL THEN
      RAISE EXCEPTION 'O pasto % está sem área no cadastro; sem área não dá para dividir o lote.', v_nome USING ERRCODE = 'P0001';
    END IF;
  END IF;
  SELECT p.nome INTO v_nome FROM unnest(v_ids) x JOIN public.pastos p ON p.id = x
    JOIN public.fechamento_pastos o ON o.pasto_id = x AND o.fazenda_id = v_fp.fazenda_id AND o.ano_mes = v_fp.ano_mes
   WHERE x <> v_fp.pasto_id AND o.tipo_uso_mes = 'vedado' ORDER BY p.nome LIMIT 1;
  IF v_nome IS NOT NULL THEN
    RAISE EXCEPTION 'O pasto % está vedado em %.', v_nome, v_fp.ano_mes USING ERRCODE = 'P0001';
  END IF;
  SELECT p.nome INTO v_nome FROM unnest(v_ids) x JOIN public.pastos p ON p.id = x
    JOIN public.fechamento_pastos o ON o.pasto_id = x AND o.fazenda_id = v_fp.fazenda_id AND o.ano_mes = v_fp.ano_mes
   WHERE x <> v_fp.pasto_id AND o.status = 'fechado' ORDER BY p.nome LIMIT 1;
  IF v_nome IS NOT NULL THEN
    RAISE EXCEPTION 'O pasto % está fechado neste mês. Reabra o pasto antes de alterar.', v_nome USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.fechamento_alocacoes WHERE fechamento_id = p_fechamento_id AND lote = v_lote;
  IF cardinality(v_ids) > 1 THEN
    INSERT INTO public.fechamento_alocacoes (cliente_id, fazenda_id, ano_mes, fechamento_id, lote, pasto_id)
    SELECT f.cliente_id, v_fp.fazenda_id, v_fp.ano_mes, p_fechamento_id, v_lote, x
      FROM unnest(v_ids) x CROSS JOIN public.fazendas f WHERE f.id = v_fp.fazenda_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  IF v_lote <> '' AND v_n > 0 AND NOT EXISTS (
       SELECT 1 FROM public.fechamento_pasto_itens i WHERE i.fechamento_id = p_fechamento_id AND btrim(coalesce(i.lote, '')) = v_lote) THEN
    v_aviso := format('Alocação sem lote: nenhum item do card tem o lote "%s".', v_lote);
  END IF;
  RETURN jsonb_build_object('ok', true, 'fechamento_id', p_fechamento_id, 'lote', v_lote, 'pastos', v_n, 'aviso', v_aviso);
END $function$;

REVOKE ALL ON FUNCTION public.fn_fechamento_alocacoes_salvar(uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fechamento_alocacoes_salvar(uuid, text, uuid[]) TO authenticated;

-- 5) A conta única, pasto a pasto (G3: rateio por área).
--    Por (card, lote): cab, kg = Σ q × peso, UA = Σ (q × peso ÷ 450, ou q quando sem peso — o calcUA).
--    S = as alocações do lote; senão as do card inteiro (lote ''); senão {pasto do card}.
--    Parte do pasto p = área_p ÷ Σ área(S); com S de 1 pasto, a parte é 1 (exata, também sem área).
--    Sem alocação, UA_p = Σ itens do card e kg/ha = kg ÷ área: a conta de hoje, linha a linha.
--    Saem os pastos com card no mês e os que receberam alocação. Lê pela RLS de quem chama.
CREATE FUNCTION public.fn_lotacao_do_mes(p_fazenda_id uuid, p_ano_mes text)
RETURNS TABLE (pasto_id uuid, grupo_id uuid, area_ha numeric, cabecas numeric, kg numeric, ua numeric,
               kg_ha numeric, ua_ha numeric, recebe_de_outro_card boolean)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH cards AS (
    SELECT fp.id, fp.pasto_id FROM public.fechamento_pastos fp
     WHERE fp.fazenda_id = p_fazenda_id AND fp.ano_mes = p_ano_mes
  ), lotes AS (
    SELECT c.id AS fechamento_id, c.pasto_id AS pasto_do_card, btrim(coalesce(i.lote, '')) AS lote,
           sum(i.quantidade)::numeric AS cab,
           sum(i.quantidade * coalesce(i.peso_medio_kg, 0))::numeric AS kg,
           sum(CASE WHEN i.peso_medio_kg > 0 THEN i.quantidade * i.peso_medio_kg / 450 ELSE i.quantidade END)::numeric AS ua
      FROM cards c JOIN public.fechamento_pasto_itens i ON i.fechamento_id = c.id
     GROUP BY 1, 2, 3
  ), destino AS (
    SELECT l.*, coalesce(a.pasto_id, l.pasto_do_card) AS pasto_id
      FROM lotes l
      LEFT JOIN public.fechamento_alocacoes a
        ON a.fechamento_id = l.fechamento_id
       AND a.lote = CASE WHEN EXISTS (SELECT 1 FROM public.fechamento_alocacoes x
                                       WHERE x.fechamento_id = l.fechamento_id AND x.lote = l.lote)
                         THEN l.lote ELSE '' END
  ), parte AS (
    SELECT d.pasto_id, d.pasto_do_card, d.cab, d.kg, d.ua,
           CASE WHEN count(*) OVER w = 1 THEN 1::numeric
                WHEN sum(CASE WHEN p.area_produtiva_ha > 0 THEN p.area_produtiva_ha END) OVER w > 0
                  THEN CASE WHEN p.area_produtiva_ha > 0 THEN p.area_produtiva_ha ELSE 0 END
                       / sum(CASE WHEN p.area_produtiva_ha > 0 THEN p.area_produtiva_ha END) OVER w
                ELSE (d.pasto_id = d.pasto_do_card)::int::numeric END AS f
      FROM destino d JOIN public.pastos p ON p.id = d.pasto_id
    WINDOW w AS (PARTITION BY d.fechamento_id, d.lote)
  ), pastos_do_mes AS (
    SELECT c.pasto_id FROM cards c UNION SELECT pt.pasto_id FROM parte pt
  )
  SELECT p.id, p.grupo_id, p.area_produtiva_ha,
         coalesce(sum(pt.cab * pt.f), 0), coalesce(sum(pt.kg * pt.f), 0), coalesce(sum(pt.ua * pt.f), 0),
         CASE WHEN p.area_produtiva_ha > 0 THEN coalesce(sum(pt.kg * pt.f), 0) / p.area_produtiva_ha END,
         CASE WHEN p.area_produtiva_ha > 0 THEN coalesce(sum(pt.ua * pt.f), 0) / p.area_produtiva_ha END,
         coalesce(bool_or(pt.pasto_do_card <> pt.pasto_id), false)
    FROM pastos_do_mes m
    JOIN public.pastos p ON p.id = m.pasto_id
    LEFT JOIN parte pt ON pt.pasto_id = m.pasto_id
   GROUP BY p.id, p.grupo_id, p.area_produtiva_ha
$function$;

REVOKE ALL ON FUNCTION public.fn_lotacao_do_mes(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lotacao_do_mes(uuid, text) TO authenticated;
