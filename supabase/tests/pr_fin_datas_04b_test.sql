-- PR-FIN-DATAS-04B — teste do VENCIMENTO no título da Operação Comercial.
--   Valida a alteração aditiva de public.oc_gerar_obrigacoes (writer oficial e ativo):
--   o INSERT em financeiro_lancamentos_v2 passa a gravar
--     data_vencimento := COALESCE(v_venc, v_op.data_pagamento_prevista)
--   preservando a expressão legada de data_pagamento (COALESCE de três níveis com data_operacao).
--
--   ESTRUTURA: BEGIN ... ROLLBACK (transacional, NADA persiste). Requer a migration
--   20260730120000_pr_fin_datas_04b_oc_vencimento aplicada. Rodar SOMENTE no PROTO
--   (binbcdfbisgscrifztia). Falha ⇒ RAISE EXCEPTION (aborta a transação).
--
--   PARTE A — contrato de catálogo (inspeção de pg_catalog + information_schema).
--   PARTE B — comportamental (fixtures isoladas + execução real do writer):
--     S1 vencimento próprio · S2 fallback data_pagamento_prevista · S3 sem fonte real
--     S4 idempotência (IDs preservados) · S5 múltiplas obrigações/múltiplos vencimentos
--     S6 retenção sem movimentação de caixa (não materializa título).
--
--   FORA DE ESCOPO (create-only): alteração posterior de vencimento, reprojeção de título
--   existente, cancela+recria, oc_sincronizar, baixa/liquidação/estorno, complementos, backfill.

BEGIN;

-- ============================================================================
-- PARTE A — CONTRATO DE CATÁLOGO
-- ============================================================================
DO $a$
DECLARE
  v_oid     regprocedure := 'public.oc_gerar_obrigacoes(uuid,uuid,integer,jsonb)'::regprocedure;
  v_args    text;
  v_secdef  boolean;
  v_cfg     text[];
  v_def     text;
  v_hascol  int;
BEGIN
  -- (1)(2) função existe + assinatura oficial (por TIPOS, imune a nomes/formatação de identity_arguments)
  SELECT string_agg(format_type(a.arg_type, NULL), ', ' ORDER BY a.ord)
    INTO v_args
    FROM pg_proc AS p
    CROSS JOIN LATERAL unnest(p.proargtypes::oid[])
      WITH ORDINALITY AS a(arg_type, ord)
   WHERE p.oid = v_oid;
  IF v_args IS DISTINCT FROM 'uuid, uuid, integer, jsonb' THEN
    RAISE EXCEPTION 'PR-FIN-DATAS-04B A2: assinatura inesperada = %', v_args; END IF;

  SELECT p.prosecdef, p.proconfig, pg_get_functiondef(p.oid)
    INTO v_secdef, v_cfg, v_def
    FROM pg_proc p WHERE p.oid = v_oid;

  -- (3) SECURITY DEFINER preservado
  IF NOT v_secdef THEN
    RAISE EXCEPTION 'PR-FIN-DATAS-04B A3: função deixou de ser SECURITY DEFINER'; END IF;

  -- (4) search_path public, pg_temp preservado
  IF NOT EXISTS (SELECT 1 FROM unnest(COALESCE(v_cfg,'{}')) c
                  WHERE c LIKE 'search_path=%public%pg_temp%') THEN
    RAISE EXCEPTION 'PR-FIN-DATAS-04B A4: search_path inesperado = %', v_cfg; END IF;

  -- (5) financeiro_lancamentos_v2 possui data_vencimento
  SELECT count(*) INTO v_hascol FROM information_schema.columns
   WHERE table_schema='public' AND table_name='financeiro_lancamentos_v2'
     AND column_name='data_vencimento';
  IF v_hascol <> 1 THEN
    RAISE EXCEPTION 'PR-FIN-DATAS-04B A5: coluna financeiro_lancamentos_v2.data_vencimento ausente'; END IF;

  -- (6) a materialização do título inclui data_vencimento na lista de colunas
  IF position('data_pagamento, data_vencimento, ano_mes' in v_def) = 0 THEN
    RAISE EXCEPTION 'PR-FIN-DATAS-04B A6: data_vencimento ausente na lista de colunas do INSERT do título'; END IF;

  -- (7)(8) a expressão de data_vencimento inclui v_venc e v_op.data_pagamento_prevista (COALESCE de 2 níveis)
  IF position('COALESCE(v_venc, v_op.data_pagamento_prevista)' in v_def) = 0 THEN
    RAISE EXCEPTION 'PR-FIN-DATAS-04B A7/A8: expressão COALESCE(v_venc, v_op.data_pagamento_prevista) ausente'; END IF;

  -- (9)(10)(11) o VALOR de data_vencimento vem logo após data_pagamento (v_data_pag) e é a
  --   COALESCE de 2 níveis — sem v_op.data_operacao e não derivado da variável final de pagamento.
  IF position('v_data_pag, COALESCE(v_venc, v_op.data_pagamento_prevista),' in v_def) = 0 THEN
    RAISE EXCEPTION 'PR-FIN-DATAS-04B A9/A10/A11: valor de data_vencimento mal posicionado ou derivado de pagamento/competência'; END IF;

  -- (12) a lógica legada de data_pagamento permanece com os três níveis (v_venc → prevista → data_operacao)
  IF position('v_data_pag := COALESCE(v_venc, v_op.data_pagamento_prevista, v_op.data_operacao);' in v_def) = 0 THEN
    RAISE EXCEPTION 'PR-FIN-DATAS-04B A12: expressão legada de data_pagamento (três níveis) foi alterada'; END IF;

  RAISE NOTICE 'PR-FIN-DATAS-04B Parte A: OK — contrato de catálogo válido.';
END
$a$;

-- ============================================================================
-- PARTE B — COMPORTAMENTAL (fixtures isoladas + execução real do writer)
-- ============================================================================
DO $b$
DECLARE
  -- fixtures
  v_actor   uuid := gen_random_uuid();
  v_cliente uuid := gen_random_uuid();
  v_fazenda uuid := gen_random_uuid();
  v_forn    uuid := gen_random_uuid();
  -- operações (uma por cenário)
  v_op1 uuid := gen_random_uuid();  -- S1 + S4
  v_op2 uuid := gen_random_uuid();  -- S2
  v_op3 uuid := gen_random_uuid();  -- S3
  v_op5 uuid := gen_random_uuid();  -- S5
  v_op6 uuid := gen_random_uuid();  -- S6
  -- datas de referência (distintas entre si)
  v_d_op   date := DATE '2026-03-10';  -- data_operacao / competência
  v_d_prev date := DATE '2026-05-20';  -- data_pagamento_prevista da operação
  v_d_v1   date := DATE '2026-07-15';  -- vencimento próprio (S1) — ≠ data_op e ≠ prevista
  v_d_va   date := DATE '2026-08-01';  -- vencimento A (S5)
  v_d_vb   date := DATE '2026-09-01';  -- vencimento B (S5)
  -- capturas
  v_res   jsonb;
  v_parte uuid; v_parte2 uuid;
  v_link  uuid; v_link2 uuid;
  v_venc  date; v_pag date; v_comp date; v_st text; v_am text;
  v_cnt   int;
  -- payloads reutilizados
  v_pay_class jsonb := jsonb_build_object(
    'macro_custo','OC04B_MACRO','grupo_custo','OC04B_GRUPO',
    'centro_custo','OC04B_CENTRO','subcentro','OC04B_SUB');
  v_pay_s1 jsonb;
BEGIN
  -- ── FIXTURES (todas revertidas no ROLLBACK) ────────────────────────────────
  INSERT INTO auth.users (id, aud, role, email)
    VALUES (v_actor, 'authenticated', 'authenticated', 'oc04b-'||v_actor::text||'@test.invalid');

  INSERT INTO public.clientes (id, nome, slug)
    VALUES (v_cliente, 'OC04B Cliente Teste', 'oc04b-'||replace(v_cliente::text,'-',''));

  INSERT INTO public.fazendas (id, nome, codigo, owner_id, cliente_id)
    VALUES (v_fazenda, 'OC04B Fazenda Teste', 'OC04B', v_actor, v_cliente);

  INSERT INTO public.cliente_membros (cliente_id, user_id, perfil, ativo)
    VALUES (v_cliente, v_actor, 'gestor_cliente', true);

  INSERT INTO public.financeiro_fornecedores (id, fazenda_id, nome, cliente_id)
    VALUES (v_forn, v_fazenda, 'OC04B Favorecido Teste', v_cliente);

  -- plano de contas do cliente que resolve UNICAMENTE para a classificação usada (compra → 2-Saídas)
  INSERT INTO public.financeiro_plano_contas
    (cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, ativo)
    VALUES (v_cliente, '2-Saídas', 'OC04B_MACRO', 'OC04B_GRUPO', 'OC04B_CENTRO', 'OC04B_SUB', true);

  -- operações fechadas (não-rascunho), compra → fluxo 'pagar'
  INSERT INTO public.zoo_operacoes_comerciais
    (id, cliente_id, fazenda_id, tipo_operacao, data_operacao, data_pagamento_prevista,
     valor_acordado, contraparte_id, cenario, status_comercial, rascunho, versao)
  VALUES
    (v_op1, v_cliente, v_fazenda, 'compra', v_d_op, v_d_prev, 1000, v_forn, 'realizado', 'fechada', false, 1),
    (v_op2, v_cliente, v_fazenda, 'compra', v_d_op, v_d_prev, 1000, v_forn, 'realizado', 'fechada', false, 1),
    (v_op3, v_cliente, v_fazenda, 'compra', v_d_op, NULL,     1000, v_forn, 'realizado', 'fechada', false, 1),
    (v_op5, v_cliente, v_fazenda, 'compra', v_d_op, v_d_prev, 1000, v_forn, 'realizado', 'fechada', false, 1),
    (v_op6, v_cliente, v_fazenda, 'compra', v_d_op, v_d_prev, NULL, v_forn, 'realizado', 'fechada', false, 1);

  -- ator autenticado (o guard da RPC usa auth.uid())
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_actor::text, 'role', 'authenticated')::text, true);

  -- payload S1/S4 reutilizado (principal com vencimento próprio)
  v_pay_s1 := jsonb_build_object('obrigacoes', jsonb_build_array(
    jsonb_build_object(
      'natureza','principal','componente','principal','natureza_fluxo','pagar',
      'valor', 1000, 'data_vencimento', v_d_v1::text, 'favorecido_id', v_forn::text,
      'chave_idempotencia','OC04B-S1-PRINCIPAL', 'materializar', true) || v_pay_class));

  -- ── CENÁRIO 1 — VENCIMENTO ESPECÍFICO DA OBRIGAÇÃO ─────────────────────────
  v_res := public.oc_gerar_obrigacoes(v_op1, v_cliente, 1, v_pay_s1);

  SELECT id, data_vencimento, financeiro_lancamento_id
    INTO v_parte, v_venc, v_link
    FROM public.zoo_operacao_partes WHERE operacao_id=v_op1 AND cancelada=false;
  IF v_parte IS NULL THEN RAISE EXCEPTION 'S1.1: parte não criada'; END IF;               -- (1)
  IF v_link  IS NULL THEN RAISE EXCEPTION 'S1.2/9: título não criado / vínculo nulo'; END IF; -- (2)(9)
  IF v_venc  IS DISTINCT FROM v_d_v1 THEN RAISE EXCEPTION 'S1.3: parte.data_vencimento=%', v_venc; END IF; -- (3)

  SELECT data_vencimento, data_pagamento, data_competencia, ano_mes, status_transacao
    INTO v_venc, v_pag, v_comp, v_am, v_st
    FROM public.financeiro_lancamentos_v2 WHERE id=v_link;
  IF v_venc IS DISTINCT FROM v_d_v1 THEN RAISE EXCEPTION 'S1.4: título.data_vencimento=%', v_venc; END IF;  -- (4)
  IF v_pag  IS DISTINCT FROM v_d_v1 THEN RAISE EXCEPTION 'S1.5: título.data_pagamento=%', v_pag; END IF;    -- (5)
  IF v_comp IS DISTINCT FROM v_d_op THEN RAISE EXCEPTION 'S1.6: título.data_competencia=%', v_comp; END IF; -- (6)
  IF v_am   IS DISTINCT FROM to_char(v_d_op,'YYYY-MM') THEN RAISE EXCEPTION 'S1.7: ano_mes=%', v_am; END IF; -- (7)
  IF v_st   IS DISTINCT FROM 'programado' THEN RAISE EXCEPTION 'S1.8: status_transacao=%', v_st; END IF;    -- (8)

  -- ── CENÁRIO 4 — IDEMPOTÊNCIA (mesma chave + mesmo conteúdo) ────────────────
  PERFORM public.oc_gerar_obrigacoes(v_op1, v_cliente, 1, v_pay_s1);  -- rerun

  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes WHERE operacao_id=v_op1;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'S4.1: nova parte criada no rerun (cnt=%)', v_cnt; END IF;  -- (1)
  SELECT id, financeiro_lancamento_id INTO v_parte2, v_link2
    FROM public.zoo_operacao_partes WHERE operacao_id=v_op1;
  IF v_parte2 <> v_parte THEN RAISE EXCEPTION 'S4.3: ID da parte mudou'; END IF;                 -- (3)
  IF v_link2  <> v_link  THEN RAISE EXCEPTION 'S4.4: ID do título mudou'; END IF;                -- (4)
  SELECT count(DISTINCT f.id) INTO v_cnt
    FROM public.financeiro_lancamentos_v2 f
    JOIN public.zoo_operacao_partes p ON p.financeiro_lancamento_id=f.id
   WHERE p.operacao_id=v_op1;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'S4.2/5: cardinalidade parte:título ≠ 1:1 (cnt=%)', v_cnt; END IF; -- (2)(5)
  SELECT data_vencimento INTO v_venc FROM public.financeiro_lancamentos_v2 WHERE id=v_link;
  IF v_venc IS DISTINCT FROM v_d_v1 THEN RAISE EXCEPTION 'S4.6: vencimento alterado no rerun=%', v_venc; END IF; -- (6)

  -- ── CENÁRIO 2 — FALLBACK PARA data_pagamento_prevista DA OPERAÇÃO ──────────
  v_res := public.oc_gerar_obrigacoes(v_op2, v_cliente, 1, jsonb_build_object('obrigacoes', jsonb_build_array(
    jsonb_build_object(
      'natureza','principal','componente','principal','natureza_fluxo','pagar',
      'valor', 1000, 'favorecido_id', v_forn::text,
      'chave_idempotencia','OC04B-S2-PRINCIPAL', 'materializar', true) || v_pay_class)));

  SELECT data_vencimento, financeiro_lancamento_id INTO v_venc, v_link
    FROM public.zoo_operacao_partes WHERE operacao_id=v_op2 AND cancelada=false;
  IF v_venc IS NOT NULL THEN RAISE EXCEPTION 'S2.1: parte.data_vencimento deveria ser NULL=%', v_venc; END IF; -- (1)
  SELECT data_vencimento, data_pagamento INTO v_venc, v_pag
    FROM public.financeiro_lancamentos_v2 WHERE id=v_link;
  IF v_venc IS DISTINCT FROM v_d_prev THEN RAISE EXCEPTION 'S2.2: título.data_vencimento=%', v_venc; END IF; -- (2)
  IF v_pag  IS DISTINCT FROM v_d_prev THEN RAISE EXCEPTION 'S2.3: título.data_pagamento=%', v_pag; END IF;   -- (3)
  IF v_venc IS NOT DISTINCT FROM v_d_op THEN RAISE EXCEPTION 'S2.4: título.data_vencimento derivado de data_operacao'; END IF; -- (4)

  -- ── CENÁRIO 3 — AUSÊNCIA DE FONTE REAL DE VENCIMENTO ──────────────────────
  v_res := public.oc_gerar_obrigacoes(v_op3, v_cliente, 1, jsonb_build_object('obrigacoes', jsonb_build_array(
    jsonb_build_object(
      'natureza','principal','componente','principal','natureza_fluxo','pagar',
      'valor', 1000, 'favorecido_id', v_forn::text,
      'chave_idempotencia','OC04B-S3-PRINCIPAL', 'materializar', true) || v_pay_class)));

  SELECT financeiro_lancamento_id INTO v_link
    FROM public.zoo_operacao_partes WHERE operacao_id=v_op3 AND cancelada=false;
  SELECT data_vencimento, data_pagamento, data_competencia INTO v_venc, v_pag, v_comp
    FROM public.financeiro_lancamentos_v2 WHERE id=v_link;
  IF v_venc IS NOT NULL THEN RAISE EXCEPTION 'S3.1: título.data_vencimento deveria ser NULL=%', v_venc; END IF; -- (1)
  IF v_pag  IS DISTINCT FROM v_d_op THEN RAISE EXCEPTION 'S3.2: título.data_pagamento=%', v_pag; END IF;        -- (2)
  IF v_comp IS DISTINCT FROM v_d_op THEN RAISE EXCEPTION 'S3.3: título.data_competencia=%', v_comp; END IF;     -- (3)
  -- (4) data_operacao NÃO copiada para venc: venc IS NULL enquanto pagamento/competência = data_operacao.

  -- ── CENÁRIO 5 — MÚLTIPLAS OBRIGAÇÕES E MÚLTIPLOS VENCIMENTOS ──────────────
  v_res := public.oc_gerar_obrigacoes(v_op5, v_cliente, 1, jsonb_build_object('obrigacoes', jsonb_build_array(
    jsonb_build_object(
      'natureza','principal','componente','principal','natureza_fluxo','pagar',
      'valor', 600, 'data_vencimento', v_d_va::text, 'favorecido_id', v_forn::text,
      'chave_idempotencia','OC04B-S5-A', 'materializar', true) || v_pay_class,
    jsonb_build_object(
      'natureza','principal','componente','principal','natureza_fluxo','pagar',
      'valor', 400, 'data_vencimento', v_d_vb::text, 'favorecido_id', v_forn::text,
      'chave_idempotencia','OC04B-S5-B', 'materializar', true) || v_pay_class)));

  SELECT count(*) INTO v_cnt FROM public.zoo_operacao_partes WHERE operacao_id=v_op5 AND cancelada=false;
  IF v_cnt <> 2 THEN RAISE EXCEPTION 'S5.1: esperadas 2 partes, obtidas %', v_cnt; END IF;   -- (1)

  SELECT financeiro_lancamento_id INTO v_link
    FROM public.zoo_operacao_partes WHERE operacao_id=v_op5 AND data_vencimento=v_d_va;
  SELECT financeiro_lancamento_id INTO v_link2
    FROM public.zoo_operacao_partes WHERE operacao_id=v_op5 AND data_vencimento=v_d_vb;
  IF v_link IS NULL OR v_link2 IS NULL THEN RAISE EXCEPTION 'S5.5: vínculo financeiro_lancamento_id ausente'; END IF; -- (5)
  IF v_link = v_link2 THEN RAISE EXCEPTION 'S5.5: dois títulos com o mesmo vínculo'; END IF; -- (5)

  SELECT data_vencimento INTO v_venc FROM public.financeiro_lancamentos_v2 WHERE id=v_link;
  IF v_venc IS DISTINCT FROM v_d_va THEN RAISE EXCEPTION 'S5.3a: título A venc=%', v_venc; END IF; -- (3)(4)
  SELECT data_vencimento INTO v_venc FROM public.financeiro_lancamentos_v2 WHERE id=v_link2;
  IF v_venc IS DISTINCT FROM v_d_vb THEN RAISE EXCEPTION 'S5.3b: título B venc=%', v_venc; END IF; -- (3)(4)

  SELECT count(DISTINCT f.id) INTO v_cnt
    FROM public.financeiro_lancamentos_v2 f
    JOIN public.zoo_operacao_partes p ON p.financeiro_lancamento_id=f.id
   WHERE p.operacao_id=v_op5;
  IF v_cnt <> 2 THEN RAISE EXCEPTION 'S5.2/6: esperados 2 títulos sem duplicação, obtidos %', v_cnt; END IF; -- (2)(6)

  -- ── CENÁRIO 6 — RETENÇÃO SEM MOVIMENTAÇÃO DE CAIXA ────────────────────────
  v_res := public.oc_gerar_obrigacoes(v_op6, v_cliente, 1, jsonb_build_object('obrigacoes', jsonb_build_array(
    jsonb_build_object(
      'natureza','deducao','componente','funrural','natureza_fluxo','pagar',
      'valor', 50, 'favorecido_id', v_forn::text,
      'chave_idempotencia','OC04B-S6-RETENCAO', 'sem_movimentacao_caixa', true) || v_pay_class)));

  SELECT id, financeiro_lancamento_id INTO v_parte, v_link
    FROM public.zoo_operacao_partes WHERE operacao_id=v_op6 AND cancelada=false;
  IF v_parte IS NULL THEN RAISE EXCEPTION 'S6.1: parte de retenção não criada'; END IF;      -- (1)
  IF v_link IS NOT NULL THEN RAISE EXCEPTION 'S6.2: retenção sem caixa não deveria materializar título'; END IF; -- (2)
  SELECT count(*) INTO v_cnt
    FROM public.financeiro_lancamentos_v2 f
    JOIN public.zoo_operacao_partes p ON p.financeiro_lancamento_id=f.id
   WHERE p.operacao_id=v_op6;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'S6.3: título materializado indevidamente (cnt=%)', v_cnt; END IF; -- (3)

  RAISE NOTICE 'PR-FIN-DATAS-04B Parte B: OK — S1..S6 aprovados (fixtures serão revertidas no ROLLBACK).';
END
$b$;

-- ============================================================================
-- CENÁRIO 7 — ROLLBACK (nenhuma fixture persiste)
-- ============================================================================
ROLLBACK;
