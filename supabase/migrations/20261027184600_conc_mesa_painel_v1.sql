-- PR-CONC-MESA-PAINEL-V1 — a Mesa grava Tipo de documento e Forma de pagamento.
--
-- ⚠ FASE 0 (30/09): as colunas `tipo_documento` e `forma_pagamento` existem em financeiro_lancamentos_v2 (text, sem CHECK),
--   e so' o Novo Lancamento (LancamentoV2Dialog) e o fn_criar_lancamento_de_extrato as gravam. Na Mesa, o
--   fn_classificacao_editar_proposto as recusava ('campo_nao_editavel') e o fn_classificacao_apply_row nem as lia —
--   um campo editavel cujo valor some no Salvar, o silencio mais caro que a Mesa pode ter. GO do Gabriel, 30/09.
-- ⚠ O QUE MUDA:
--   1. editar_proposto aceita as duas chaves (texto livre, como no Novo Lancamento; vazio tira a proposta).
--   2. apply_row grava as duas com COALESCE(proposta, lancamento) no overwrite e COALESCE(lancamento, proposta) no
--      conservador — ausente = sistema, NUNCA apaga — e as guarda no estado_anterior.
--      ⚠ O `fn_classificacao_reverter_row` NAO restaura estes dois (nem a observacao e as datas do 129c): divida antiga,
--        registrada no CLAUDE.md.
--   3. a view expoe proposta e valor do lancamento para a tela.
-- ⚠ PATCHES GUARDADOS POR md5 (editar 41a08704…, apply 8f40915d…, viewdef deaddb75…): cada ancora 1x, destino conferido.
--   Nenhum UPDATE novo (os dois UPDATEs do apply ja' tem WHERE); ACL como hoje (authenticated, sem anon).

-- ═══ 1. editar_proposto ═════════════════════════════════════════════════════════════════════════════════════════════
DO $patch$
DECLARE
  v_src text; v_novo text; n int; i int;
  anc text[] := ARRAY[
$e1o$'safra_id','data_competencia','data_vencimento','data_pagamento','conta_bancaria_id','observacao','tipo_operacao','conta_destino_id'];$e1o$,
$e2o$  IF array_length(v_aplicados, 1) IS NULL THEN$e2o$];
  novos text[] := ARRAY[
$e1n$'safra_id','data_competencia','data_vencimento','data_pagamento','conta_bancaria_id','observacao','tipo_operacao','conta_destino_id',
    'tipo_documento','forma_pagamento'];$e1n$,
$e2n$  -- PR-CONC-MESA-PAINEL-V1: tipo de documento e forma de pagamento (texto, a lista do Novo Lancamento). Vazio tira a proposta.
  FOREACH v_k IN ARRAY ARRAY['tipo_documento','forma_pagamento'] LOOP
    IF p_patch ? v_k THEN
      IF NULLIF(trim(p_patch->>v_k), '') IS NULL THEN v_prop := v_prop - v_k;
      ELSE v_prop := v_prop || jsonb_build_object(v_k, trim(p_patch->>v_k)); END IF;
      v_aplicados := array_append(v_aplicados, v_k);
    END IF;
  END LOOP;

  IF array_length(v_aplicados, 1) IS NULL THEN$e2n$];
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.fn_classificacao_editar_proposto(uuid,jsonb)'::regprocedure;
  IF md5(v_src) <> '41a08704ebe781a421667f79ce2f9bd2' THEN
    RAISE EXCEPTION 'editar_proposto: corpo de origem divergente (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;
  FOR i IN 1..array_length(anc, 1) LOOP
    n := (length(v_novo) - length(replace(v_novo, anc[i], ''))) / length(anc[i]);
    IF n <> 1 THEN RAISE EXCEPTION 'editar_proposto: ancora % casou % vezes', i, n; END IF;
    v_novo := replace(v_novo, anc[i], novos[i]);
  END LOOP;
  IF md5(v_novo) <> '02984aadd0c2192da98c8ac43acda61d' THEN
    RAISE EXCEPTION 'editar_proposto: corpo de destino divergente (md5 %)', md5(v_novo);
  END IF;
  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_classificacao_editar_proposto(p_staging_id uuid, p_patch jsonb) '
       || 'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS ' || quote_literal(v_novo);
END
$patch$;

-- ═══ 2. apply_row ═══════════════════════════════════════════════════════════════════════════════════════════════════
DO $patch$
DECLARE
  v_src text; v_novo text; n int; i int;
  anc text[] := ARRAY[
$a1o$      observacao = COALESCE(NULLIF(v_proposto->>'observacao',''), observacao),
      updated_at = now() WHERE id = v_lanc.id;
  ELSE$a1o$,
$a2o$      observacao = COALESCE(observacao, NULLIF(v_proposto->>'observacao','')),
      updated_at = now() WHERE id = v_lanc.id;
  END IF;$a2o$,
$a3o$    'safra_id', v_lanc.safra_id, 'conta_bancaria_id', v_lanc.conta_bancaria_id, 'observacao', v_lanc.observacao));$a3o$];
  novos text[] := ARRAY[
$a1n$      observacao = COALESCE(NULLIF(v_proposto->>'observacao',''), observacao),
      -- PR-CONC-MESA-PAINEL-V1: ausente = sistema, nunca apaga
      tipo_documento = COALESCE(NULLIF(v_proposto->>'tipo_documento',''), tipo_documento),
      forma_pagamento = COALESCE(NULLIF(v_proposto->>'forma_pagamento',''), forma_pagamento),
      updated_at = now() WHERE id = v_lanc.id;
  ELSE$a1n$,
$a2n$      observacao = COALESCE(observacao, NULLIF(v_proposto->>'observacao','')),
      tipo_documento = COALESCE(tipo_documento, NULLIF(v_proposto->>'tipo_documento','')),
      forma_pagamento = COALESCE(forma_pagamento, NULLIF(v_proposto->>'forma_pagamento','')),
      updated_at = now() WHERE id = v_lanc.id;
  END IF;$a2n$,
$a3n$    'safra_id', v_lanc.safra_id, 'conta_bancaria_id', v_lanc.conta_bancaria_id, 'observacao', v_lanc.observacao,
    'tipo_documento', v_lanc.tipo_documento, 'forma_pagamento', v_lanc.forma_pagamento));$a3n$];
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.fn_classificacao_apply_row(uuid,boolean)'::regprocedure;
  IF md5(v_src) <> '8f40915dd723bd462f271b4942554157' THEN
    RAISE EXCEPTION 'apply_row: corpo de origem divergente (md5 %)', md5(v_src);
  END IF;
  v_novo := v_src;
  FOR i IN 1..array_length(anc, 1) LOOP
    n := (length(v_novo) - length(replace(v_novo, anc[i], ''))) / length(anc[i]);
    IF n <> 1 THEN RAISE EXCEPTION 'apply_row: ancora % casou % vezes', i, n; END IF;
    v_novo := replace(v_novo, anc[i], novos[i]);
  END LOOP;
  IF md5(v_novo) <> '44dd24be1f81203b6a1d133fc9a5ac68' THEN
    RAISE EXCEPTION 'apply_row: corpo de destino divergente (md5 %)', md5(v_novo);
  END IF;
  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_classificacao_apply_row(p_staging_id uuid, p_overwrite boolean DEFAULT false) '
       || 'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS ' || quote_literal(v_novo);
END
$patch$;

-- ═══ 3. a view ══════════════════════════════════════════════════════════════════════════════════════════════════════
DO $view$
DECLARE
  v_def text; v_novo text; n int;
  a_old text := $v1o$    l.origem_lancamento AS lanc_origem_lancamento
   FROM$v1o$;
  a_new text := $v1n$    l.origem_lancamento AS lanc_origem_lancamento,
    (s.update_proposto ->> 'tipo_documento'::text) AS proposto_tipo_documento,
    (s.update_proposto ->> 'forma_pagamento'::text) AS proposto_forma_pagamento,
    l.tipo_documento AS lanc_tipo_documento,
    l.forma_pagamento AS lanc_forma_pagamento
   FROM$v1n$;
BEGIN
  v_def := pg_get_viewdef('public.vw_classificacao_staging_preview'::regclass);
  IF md5(v_def) <> 'deaddb7573bbb2c10b8e78af2c434eb5' THEN
    RAISE EXCEPTION 'view: definicao de origem divergente (md5 %)', md5(v_def);
  END IF;
  n := (length(v_def) - length(replace(v_def, a_old, ''))) / length(a_old);
  IF n <> 1 THEN RAISE EXCEPTION 'view: ancora casou % vezes', n; END IF;
  v_novo := replace(v_def, a_old, a_new);
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_classificacao_staging_preview WITH (security_invoker = true) AS ' || v_novo;
END
$view$;

-- ═══ conferencias ═══════════════════════════════════════════════════════════════════════════════════════════════════
DO $conf$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'vw_classificacao_staging_preview'
                  AND reloptions::text ILIKE '%security_invoker=true%') THEN
    RAISE EXCEPTION 'view sem security_invoker';
  END IF;
  IF has_function_privilege('anon', 'public.fn_classificacao_editar_proposto(uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_classificacao_apply_row(uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: anon com EXECUTE';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_classificacao_editar_proposto(uuid,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_classificacao_apply_row(uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: authenticated perdeu o EXECUTE';
  END IF;
END
$conf$;
