-- PR-CONC-EXCEL-PLANILHA-COMPLETA-01 — a planilha entra inteira (Safra, Tipo de documento, Forma de pagamento, Status) e a
-- Safra define a Atividade; o apelido de subcentro com contexto e' a chave COMPOSTA "conta ⟂ safra" (B-22d).
--
-- ⚠ FASE 0 (30/09): o `parserClassificacao` descartava Safra, Tipo de documento, Forma de pagamento e Status, e a staging
--   nao tinha onde guarda-los. A Descricao JA e' o `excel_produto` (o parser le 'Descricao'/'Historico'/'Produto'), por
--   isso NAO ha `excel_descricao`.
-- ⚠ DECISAO DO GABRIEL (item 4, opcao A): o mecanismo UNICO de contexto de apelido de subcentro e' a chave composta
--   "conta ⟂ texto da safra", a mesma que o importador de lancamentos grava. O resolvedor da Mesa a tenta ANTES do apelido
--   simples. Sem coluna nova de atividade. No proxy (Observacao = Safra, sessao 32c52f5c) os 44 planos de outra
--   atividade resolvem todos pelo composto.
-- ⚠ O QUE MUDA:
--   1. staging: excel_safra, excel_tipo_documento, excel_forma_pagamento, excel_status (texto cru; "-" e' vazio).
--   2. tres resolvedores internos: safra (so' ATIVAS, apelido/nome/codigo normalizados; mais de uma ou so' inativa = NULL,
--      "(nao resolvido)"), tipo de documento (a lista do Novo Lancamento) e forma de pagamento (a lista + o mapa dos legados:
--      PIX/Transferencia Bancaria -> PIX; Cartao de Credito/Credito -> Cartao; Debito em Conta -> Debito).
--   3. populate grava as quatro colunas e poe safra_id/tipo_documento/forma_pagamento resolvidos em `_planilha`; manda o
--      texto da safra ao motor como `safra_texto` (nao como `safra`: esta chave alimenta o `cond_safra` das regras, que
--      hoje le o ano_mes — zero regras usam cond_safra, e o comportamento delas nao muda).
--   4. resolver_contexto: apelido COMPOSTO antes do simples (tier 'alias_composto').
--   5. precedencia do cru: leva safra, tipo de documento e forma ao topo (com o resto da planilha); plano de OUTRA atividade
--      que a safra (fora administrativo) NAO sobe — a conta fica pendente, nunca se grava plano incoerente; plano
--      administrativo NAO leva safra.
--   6. a view expoe as quatro colunas e os tres resolvidos de `_planilha`.
-- ⚠ PATCHES GUARDADOS POR md5 (populate e0061022…, resolver_contexto faf382a6…, viewdef ce3529e9…), cada ancora 1x, destino
--   conferido. A precedencia vai INTEIRA (corpo pequeno), com guarda da origem 0848559c…. Nenhum UPDATE/DELETE novo sem WHERE.

-- === 1. colunas ===
ALTER TABLE public.financeiro_classificacao_staging
  ADD COLUMN excel_safra text,
  ADD COLUMN excel_tipo_documento text,
  ADD COLUMN excel_forma_pagamento text,
  ADD COLUMN excel_status text;

-- === 2. resolvedores internos ===
CREATE FUNCTION public._fn_classificacao_resolver_safra(p_cliente_id uuid, p_texto text)
RETURNS uuid LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $f$
DECLARE v_alvo text := public._fn_normalizar_texto(p_texto); v_ids uuid[];
BEGIN
  IF v_alvo IS NULL THEN RETURN NULL; END IF;
  -- so' as ATIVAS: apelido que aponta para safra inativa (25/26-AMD) fica "(nao resolvido)", nunca vira safra morta
  SELECT array_agg(DISTINCT sf.id) INTO v_ids FROM financeiro_safras sf
   WHERE sf.cliente_id = p_cliente_id AND sf.ativa
     AND (public._fn_normalizar_texto(sf.nome) = v_alvo OR public._fn_normalizar_texto(sf.codigo) = v_alvo
          OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(
                       CASE WHEN jsonb_typeof(sf.aliases) = 'array' THEN sf.aliases ELSE '[]'::jsonb END) a
                      WHERE public._fn_normalizar_texto(a) = v_alvo));
  IF cardinality(v_ids) = 1 THEN RETURN v_ids[1]; END IF;
  RETURN NULL;
END;
$f$;

CREATE FUNCTION public._fn_classificacao_tipo_documento(p_texto text)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $f$
  -- a lista do Novo Lancamento (TIPOS_DOCUMENTO, documentoHelper.ts); fora dela, NULL
  SELECT t FROM unnest(ARRAY['Nota Fiscal', 'Fatura', 'Recibo', 'Contrato', 'Folha de Pagamento', 'Outros']) t
   WHERE public._fn_normalizar_texto(t) = public._fn_normalizar_texto(p_texto)
   LIMIT 1
$f$;

CREATE FUNCTION public._fn_classificacao_forma_pagamento(p_texto text)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $f$
  -- a lista do Novo Lancamento (FORMAS_PAGAMENTO_V2) + o mapa dos legados decidido pelo Gabriel; fora disso, NULL
  SELECT CASE public._fn_normalizar_texto(p_texto)
    WHEN 'pix' THEN 'PIX'
    WHEN 'pix/transferencia bancaria' THEN 'PIX'
    WHEN 'cartao' THEN 'Cartão'
    WHEN 'cartao de credito' THEN 'Cartão'
    WHEN 'cartao de credito/credito' THEN 'Cartão'
    WHEN 'credito' THEN 'Cartão'
    WHEN 'boleto' THEN 'Boleto'
    WHEN 'debito automatico' THEN 'Débito Automático'
    WHEN 'debito' THEN 'Débito'
    WHEN 'debito em conta' THEN 'Débito'
    WHEN 'transferencia' THEN 'Transferência'
    WHEN 'ted' THEN 'Transferência'
    WHEN 'dinheiro' THEN 'Dinheiro'
    WHEN 'outro' THEN 'Outro'
    ELSE NULL END
$f$;

REVOKE ALL ON FUNCTION public._fn_classificacao_resolver_safra(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_classificacao_tipo_documento(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_classificacao_forma_pagamento(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_classificacao_resolver_safra(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public._fn_classificacao_tipo_documento(text) TO service_role;
GRANT EXECUTE ON FUNCTION public._fn_classificacao_forma_pagamento(text) TO service_role;

-- === 3. populate ===
DO $patch$
DECLARE
  v_src text; v_novo text; n int; i int;
  anc text[] := ARRAY[
$p1o$  v_tipo_op text; v_fazenda_codigo text; v_observacao text; v_documento text;$p1o$,
$p2o$    v_documento := NULLIF(trim(v_row->>'documento'), '');$p2o$,
$p3o$'fazenda_codigo', v_fazenda_codigo, 'ano_mes', v_ano_mes, 'tipo_operacao', v_tipo_op, 'data', v_data, 'valor', v_valor);$p3o$,
$p4o$'plano_conta_id', v_plano_conta_id, 'favorecido_id', v_favorecido_id, 'fazenda_id', v_fazenda_id)));$p4o$,
$p5o$excel_data_pagamento, excel_data_vencimento
    ) VALUES$p5o$,
$p6o$NULLIF(v_row->>'data_pagamento','')::date, NULLIF(v_row->>'data_vencimento','')::date
    ) ON CONFLICT$p6o$];
  novos text[] := ARRAY[
$p1n$  v_tipo_op text; v_fazenda_codigo text; v_observacao text; v_documento text;
  -- PR-CONC-EXCEL-PLANILHA-COMPLETA-01
  v_safra_txt text; v_tipo_doc_txt text; v_forma_txt text; v_status_txt text; v_safra_id uuid;$p1n$,
$p2n$    v_documento := NULLIF(trim(v_row->>'documento'), '');
    -- PR-CONC-EXCEL-PLANILHA-COMPLETA-01: as quatro colunas que o parser descartava ("-" e' o vazio da planilha)
    v_safra_txt := NULLIF(NULLIF(trim(v_row->>'safra'), ''), '-');
    v_tipo_doc_txt := NULLIF(NULLIF(trim(v_row->>'tipo_documento'), ''), '-');
    v_forma_txt := NULLIF(NULLIF(trim(v_row->>'forma_pagamento'), ''), '-');
    v_status_txt := NULLIF(NULLIF(trim(v_row->>'status'), ''), '-');
    v_safra_id := public._fn_classificacao_resolver_safra(p_cliente_id, v_safra_txt);$p2n$,
$p3n$'fazenda_codigo', v_fazenda_codigo, 'ano_mes', v_ano_mes, 'tipo_operacao', v_tipo_op, 'data', v_data, 'valor', v_valor,
      'safra_texto', v_safra_txt);$p3n$,
$p4n$'plano_conta_id', v_plano_conta_id, 'favorecido_id', v_favorecido_id, 'fazenda_id', v_fazenda_id,
           'safra_id', v_safra_id, 'tipo_documento', public._fn_classificacao_tipo_documento(v_tipo_doc_txt),
           'forma_pagamento', public._fn_classificacao_forma_pagamento(v_forma_txt))));$p4n$,
$p5n$excel_data_pagamento, excel_data_vencimento,
      excel_safra, excel_tipo_documento, excel_forma_pagamento, excel_status
    ) VALUES$p5n$,
$p6n$NULLIF(v_row->>'data_pagamento','')::date, NULLIF(v_row->>'data_vencimento','')::date,
      v_safra_txt, v_tipo_doc_txt, v_forma_txt, v_status_txt
    ) ON CONFLICT$p6n$];
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.fn_classificacao_populate_staging(uuid,uuid,jsonb)'::regprocedure;
  IF md5(v_src) <> 'e0061022a345488424f6cd5a446da031' THEN
    RAISE EXCEPTION 'populate: corpo de origem divergente (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;
  FOR i IN 1..array_length(anc, 1) LOOP
    n := (length(v_novo) - length(replace(v_novo, anc[i], ''))) / length(anc[i]);
    IF n <> 1 THEN RAISE EXCEPTION 'populate: ancora % casou % vezes', i, n; END IF;
    v_novo := replace(v_novo, anc[i], novos[i]);
  END LOOP;
  IF md5(v_novo) <> '5fdbd8171c19ae3fb26ba0d703aa0e1a' THEN
    RAISE EXCEPTION 'populate: corpo de destino divergente (md5 %)', md5(v_novo);
  END IF;
  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_classificacao_populate_staging(p_sessao_id uuid, p_cliente_id uuid, p_rows jsonb) '
       || 'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS ' || quote_literal(v_novo);
END
$patch$;

-- === 4. resolver_contexto ===
DO $patch$
DECLARE
  v_src text; v_novo text; n int; i int;
  anc text[] := ARRAY[
$r1o$  v_faz text; v_safra text; v_tipo text; v_data date; v_valor numeric; v_folha text;$r1o$,
$r2o$  v_valor := NULLIF(p_ctx->>'valor', '')::numeric;$r2o$,
$r3o$  IF v_pc IS NULL AND v_sub IS NOT NULL THEN
    SELECT a.id AS id, a.plano_conta_id AS plano_conta_id INTO v_alias$r3o$];
  novos text[] := ARRAY[
$r1n$  v_faz text; v_safra text; v_tipo text; v_data date; v_valor numeric; v_folha text;
  v_safra_txt text; -- PR-CONC-EXCEL-PLANILHA-COMPLETA-01: o texto da safra da planilha, para o apelido composto$r1n$,
$r2n$  v_valor := NULLIF(p_ctx->>'valor', '')::numeric;
  v_safra_txt := NULLIF(trim(p_ctx->>'safra_texto'), '');$r2n$,
$r3n$  -- PR-CONC-EXCEL-PLANILHA-COMPLETA-01: o apelido COMPOSTO "conta ⟂ safra" (B-22d, o mesmo do importador de lancamentos)
  -- vem ANTES do simples: e' ele que separa "Manutencao" de pecuaria da de agricultura. chr(10178) = o separador.
  IF v_pc IS NULL AND v_sub IS NOT NULL AND v_safra_txt IS NOT NULL THEN
    SELECT a.id AS id, a.plano_conta_id AS plano_conta_id INTO v_alias
    FROM public.financeiro_subcentro_aliases a
    WHERE a.ativo = true AND (a.cliente_id = p_cliente_id OR a.cliente_id IS NULL)
      AND lower(trim(a.alias_text)) = lower(trim(v_sub || ' ' || chr(10178) || ' ' || v_safra_txt))
    ORDER BY (a.cliente_id IS NOT NULL) DESC, a.created_at DESC LIMIT 1;
    IF FOUND THEN v_pc := v_alias.plano_conta_id; v_tier := 'alias_composto'; v_alias_id := v_alias.id; END IF;
  END IF;

  IF v_pc IS NULL AND v_sub IS NOT NULL THEN
    SELECT a.id AS id, a.plano_conta_id AS plano_conta_id INTO v_alias$r3n$];
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.fn_classificacao_resolver_contexto(uuid,jsonb,boolean)'::regprocedure;
  IF md5(v_src) <> 'faf382a6aba5ed508f62e85acf21c53a' THEN
    RAISE EXCEPTION 'resolver_contexto: corpo de origem divergente (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;
  FOR i IN 1..array_length(anc, 1) LOOP
    n := (length(v_novo) - length(replace(v_novo, anc[i], ''))) / length(anc[i]);
    IF n <> 1 THEN RAISE EXCEPTION 'resolver_contexto: ancora % casou % vezes', i, n; END IF;
    v_novo := replace(v_novo, anc[i], novos[i]);
  END LOOP;
  IF md5(v_novo) <> '192a58218b0b7575acd9257b1bb331d7' THEN
    RAISE EXCEPTION 'resolver_contexto: corpo de destino divergente (md5 %)', md5(v_novo);
  END IF;
  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_classificacao_resolver_contexto(p_cliente_id uuid, p_ctx jsonb, p_skip_guard boolean DEFAULT false) '
       || 'RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''public'' AS ' || quote_literal(v_novo);
END
$patch$;

-- === 5. precedencia do cru (corpo INTEIRO; guarda da origem) ===
DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_classificacao_precedencia_cru(uuid)'::regprocedure)
     <> '0848559c47706402bcb0d3a3e75eef5e' THEN
    RAISE EXCEPTION 'precedencia: corpo de origem divergente';
  END IF;
END
$guarda$;

CREATE OR REPLACE FUNCTION public._fn_classificacao_precedencia_cru(p_sessao_id uuid)
RETURNS integer LANGUAGE plpgsql SET search_path TO 'public' AS $f$
DECLARE
  -- PR-CONC-EXCEL-PLANILHA-COMPLETA-01: safra, tipo de documento e forma tambem sao da planilha no cru, do sistema no classificado
  k_class CONSTANT text[] := ARRAY['subcentro','macro_custo','grupo_custo','centro_custo','plano_conta_id','favorecido_id','fazenda_id',
                                   'safra_id','tipo_documento','forma_pagamento'];
  k_plano CONSTANT text[] := ARRAY['subcentro','macro_custo','grupo_custo','centro_custo','plano_conta_id'];
  n int;
BEGIN
  WITH base AS (
    SELECT s.staging_id, s.cliente_id, s.update_proposto p, s.excel_fazenda_codigo, s.excel_fornecedor,
           -- sessao antiga (sem `_planilha`): a leitura e' a que o populate pos no topo
           COALESCE(s.update_proposto -> '_planilha', jsonb_strip_nulls(jsonb_build_object(
             'subcentro', s.update_proposto -> 'subcentro', 'macro_custo', s.update_proposto -> 'macro_custo',
             'grupo_custo', s.update_proposto -> 'grupo_custo', 'centro_custo', s.update_proposto -> 'centro_custo',
             'plano_conta_id', s.update_proposto -> 'plano_conta_id', 'favorecido_id', s.update_proposto -> 'favorecido_id'))) pl0,
           (l.origem_lancamento IN ('extrato', 'ofx') AND l.subcentro IS NULL AND l.plano_conta_id IS NULL
             AND COALESCE(l.tipo_operacao, '') NOT LIKE '3-%') AS cru,
           -- Excel vazio nunca apaga: so' entra o que a planilha tem ("-" e' o vazio da planilha, como no `vazio()` do front)
           jsonb_strip_nulls(jsonb_build_object(
             'data_competencia', s.excel_data, 'data_vencimento', s.excel_data_vencimento,
             'numero_documento', NULLIF(NULLIF(btrim(s.excel_documento), ''), '-'),
             'observacao', NULLIF(NULLIF(btrim(s.excel_observacao), ''), '-'),
             'produto', NULLIF(NULLIF(btrim(s.excel_produto), ''), '-'))) AS excel
      FROM financeiro_classificacao_staging s
      JOIN financeiro_lancamentos_v2 l ON l.id = s.match_lancamento_id
     WHERE s.sessao_id = p_sessao_id AND NOT s.aplicado
       AND COALESCE(s.update_proposto -> '_meta' ->> 'origem_resolucao', '') <> 'manual'
  ), planilha AS (
    -- fazenda e fornecedor pelos resolvedores (cobre a sessao antiga, que o populate de antes nao resolvia)
    SELECT b.*, b.pl0 || jsonb_strip_nulls(jsonb_build_object(
             'fazenda_id', COALESCE(b.pl0 ->> 'fazenda_id',
                                    public._fn_classificacao_resolver_fazenda(b.cliente_id, b.excel_fazenda_codigo)::text),
             'favorecido_id', COALESCE(b.pl0 ->> 'favorecido_id',
                                       public._fn_classificacao_resolver_fornecedor(b.cliente_id, b.excel_fornecedor)::text))) AS pl
      FROM base b
  ), escopos AS (
    -- PR-CONC-EXCEL-PLANILHA-COMPLETA-01: a atividade da safra da planilha e a da conta do plano que ela resolveu
    SELECT pl.*,
           (SELECT sf.escopo_negocio FROM financeiro_safras sf WHERE sf.id = NULLIF(pl.pl ->> 'safra_id', '')::uuid) AS saf_esc,
           (SELECT pc.escopo_negocio FROM financeiro_plano_contas pc WHERE pc.id = NULLIF(pl.pl ->> 'plano_conta_id', '')::uuid) AS pc_esc
      FROM planilha pl
  ), topo AS (
    -- no cru, plano administrativo forca a fazenda Administrativo (a planilha continua em `_planilha`)
    SELECT e.*, CASE
             WHEN e.cru AND e.pc_esc = 'administrativo'
             THEN e.pl || COALESCE((SELECT jsonb_build_object('fazenda_id', f.id) FROM fazendas f
                                     WHERE f.cliente_id = e.cliente_id AND f.nome ILIKE '%administrat%'
                                     ORDER BY f.created_at, f.id LIMIT 1), '{}'::jsonb)
             ELSE e.pl END AS pl_adm
      FROM escopos e
  ), coerente AS (
    -- ⚠ PLANO DE OUTRA ATIVIDADE QUE A SAFRA NAO SOBE: a conta fica pendente para o operador (nunca se grava plano
    --   incoerente). Plano administrativo NAO leva safra (o gatilho a zeraria; aqui ela nem sobe).
    SELECT t.*, CASE
             WHEN t.saf_esc IS NOT NULL AND t.pc_esc IS NOT NULL AND t.pc_esc <> 'administrativo' AND t.pc_esc <> t.saf_esc
               THEN t.pl_adm - k_plano
             WHEN t.pc_esc = 'administrativo' THEN t.pl_adm - 'safra_id'
             ELSE t.pl_adm END AS pl_topo
      FROM topo t
  ), novo AS (
    SELECT c.staging_id, CASE
             WHEN c.cru THEN (c.p - k_class) || c.pl_topo || c.excel || jsonb_build_object('_planilha', c.pl)
             ELSE (c.p - k_class) || jsonb_build_object('_planilha', c.pl)
           END AS proposto
      FROM coerente c
  )
  UPDATE financeiro_classificacao_staging s
     SET update_proposto = novo.proposto, updated_at = now()
    FROM novo
   WHERE s.staging_id = novo.staging_id AND s.update_proposto IS DISTINCT FROM novo.proposto;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$f$;
REVOKE ALL ON FUNCTION public._fn_classificacao_precedencia_cru(uuid) FROM PUBLIC, anon, authenticated;

-- === 6. a view ===
DO $view$
DECLARE
  v_def text; v_novo text; n int;
  a_old text := $v1o$    l.forma_pagamento AS lanc_forma_pagamento
   FROM$v1o$;
  a_new text := $v1n$    l.forma_pagamento AS lanc_forma_pagamento,
    s.excel_safra,
    s.excel_tipo_documento,
    s.excel_forma_pagamento,
    s.excel_status,
    ((s.update_proposto -> '_planilha'::text) ->> 'safra_id'::text) AS planilha_safra_id,
    ((s.update_proposto -> '_planilha'::text) ->> 'tipo_documento'::text) AS planilha_tipo_documento,
    ((s.update_proposto -> '_planilha'::text) ->> 'forma_pagamento'::text) AS planilha_forma_pagamento
   FROM$v1n$;
BEGIN
  v_def := pg_get_viewdef('public.vw_classificacao_staging_preview'::regclass);
  IF md5(v_def) <> 'ce3529e91d551dbdb2c32fdac4a1f8bb' THEN
    RAISE EXCEPTION 'view: definicao de origem divergente (md5 %)', md5(v_def);
  END IF;
  n := (length(v_def) - length(replace(v_def, a_old, ''))) / length(a_old);
  IF n <> 1 THEN RAISE EXCEPTION 'view: ancora casou % vezes', n; END IF;
  v_novo := replace(v_def, a_old, a_new);
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_classificacao_staging_preview WITH (security_invoker = true) AS ' || v_novo;
END
$view$;

-- === conferencias ===
DO $conf$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'vw_classificacao_staging_preview'
                  AND reloptions::text ILIKE '%security_invoker=true%') THEN
    RAISE EXCEPTION 'view sem security_invoker';
  END IF;
  IF has_function_privilege('anon', 'public.fn_classificacao_populate_staging(uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_classificacao_resolver_contexto(uuid,jsonb,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_classificacao_resolver_safra(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_classificacao_tipo_documento(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_classificacao_forma_pagamento(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_classificacao_precedencia_cru(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL aberta numa funcao de PR-CONC-EXCEL-PLANILHA-COMPLETA-01';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_classificacao_populate_staging(uuid,uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: authenticated perdeu o EXECUTE do populate';
  END IF;
END
$conf$;
