-- FIN-FINANC-28 · PASSO 4 — liberacoes, destinacoes e documentos do contrato. Roda depois da 20261027200200, numa transacao que
-- TERMINA EM RAISE (nada fica). Admin simulado; sintetico no cliente Teste: um financiamento de 1.000,00, um credor, uma entrada.
-- L1 liberacao "em conta" sem lancamento: nasce "a casar"; o saldo passa a ter liberado 400 (era nulo, "sem_liberacao").
-- L2 liberacao "em conta" com o lancamento: APONTA (nao cria lancamento); a entrada sai das captacoes livres; outra liberacao no
--    mesmo lancamento e' recusada.
-- L3 GESTO CONTRARIO: remover cancela a liberacao; a entrada volta a' lista; o liberado volta a 400.
-- L4 recusas: compra parcelada, liquidacao do proprio contrato, fornecedor sem fornecedor, em conta com fornecedor.
-- D1 destinacao: salvar, editar; remover com liberacao viva recusa; tirada a liberacao, remove (GESTO CONTRARIO).
-- C1 documento: "sem_documento" nas pendencias ate' a cedula; registrar devolve o caminho no cliente; remover cancela e a
--    pendencia volta (GESTO CONTRARIO).
-- G1 outro usuario e sem usuario: 42501 nas sete; anon nao executa nenhuma; a guarda interna fechada a authenticated.
set local statement_timeout = '60s';
set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  v_cred uuid; v_fin uuid; v_parc uuid; v_lanc uuid; v_plano uuid;
  v_l1 uuid; v_l2 uuid; v_d1 uuid; v_doc uuid; r jsonb; v_n int; v_ok boolean; v_lanc_antes int; v_lanc_depois int;
BEGIN
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (c_cli, 'SINT BANCO P4', true) returning id into v_cred;
  insert into financiamentos (cliente_id, natureza, status, descricao, valor_total, numero_contrato, data_contrato, credor_id, fazenda_id)
  values (c_cli, 'financiamento', 'ativo', 'SINT P4 CONTRATO', 1000, 'SINT-4040', '2031-01-10', v_cred, c_faz) returning id into v_fin;
  insert into financiamentos (cliente_id, natureza, status, descricao, valor_total, data_contrato, fazenda_id)
  values (c_cli, 'parcelamento', 'ativo', 'SINT P4 COMPRA', 300, '2031-01-10', c_faz) returning id into v_parc;
  select id into v_plano from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao = '1-Entradas' order by ordem_exibicao limit 1;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, descricao, valor, data_competencia, data_vencimento, data_pagamento,
    status_transacao, conta_destino_id, plano_conta_id, cenario)
  values (c_cli, c_faz, '1-Entradas', 'SINT P4 captacao', 600, '2031-01-15', '2031-01-15', '2031-01-15', 'realizado', c_cta, v_plano, 'realizado')
  returning id into v_lanc;

  -- L1
  r := public._fn_financiamento_saldo(v_fin, '2031-12-31');
  IF r->>'liberado' is not null OR NOT (r->'pendencias') ? 'sem_liberacao' THEN RAISE EXCEPTION 'L1 antes: %', r; END IF;
  r := fn_financiamento_liberacao_salvar(v_fin, null, '2031-01-12', 400, 'conta');
  v_l1 := (r->>'id')::uuid;
  r := public._fn_financiamento_saldo(v_fin, '2031-12-31');
  IF (r->>'liberado')::numeric <> 400 OR (r->'pendencias') ? 'sem_liberacao' THEN RAISE EXCEPTION 'L1 depois: %', r; END IF;

  -- L2
  r := fn_financiamento_captacoes_livres(v_fin);
  IF NOT exists (select 1 from jsonb_array_elements(r) e where (e->>'id')::uuid = v_lanc) THEN RAISE EXCEPTION 'L2 a entrada nao esta livre'; END IF;
  select count(*) into v_lanc_antes from financeiro_lancamentos_v2 where cliente_id = c_cli;
  r := fn_financiamento_liberacao_salvar(v_fin, null, '2031-01-15', 600, 'conta', v_lanc);
  v_l2 := (r->>'id')::uuid;
  select count(*) into v_lanc_depois from financeiro_lancamentos_v2 where cliente_id = c_cli;
  IF v_lanc_depois <> v_lanc_antes THEN RAISE EXCEPTION 'L2 criou lancamento'; END IF;
  r := fn_financiamento_captacoes_livres(v_fin);
  IF exists (select 1 from jsonb_array_elements(r) e where (e->>'id')::uuid = v_lanc) THEN RAISE EXCEPTION 'L2 a entrada segue livre'; END IF;
  v_ok := false;
  BEGIN
    perform fn_financiamento_liberacao_salvar(v_fin, null, '2031-01-15', 600, 'conta', v_lanc);
  EXCEPTION WHEN sqlstate 'P0001' THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'L2 o mesmo lancamento em duas liberacoes passou'; END IF;
  IF (public._fn_financiamento_saldo(v_fin, '2031-12-31')->>'liberado')::numeric <> 1000 THEN RAISE EXCEPTION 'L2 liberado <> 1000'; END IF;

  -- L3
  r := fn_financiamento_liberacao_remover(v_l2, 'teste');
  IF (select cancelado_em from financiamento_liberacoes where id = v_l2) is null THEN RAISE EXCEPTION 'L3 nao cancelou'; END IF;
  r := fn_financiamento_captacoes_livres(v_fin);
  IF NOT exists (select 1 from jsonb_array_elements(r) e where (e->>'id')::uuid = v_lanc) THEN RAISE EXCEPTION 'L3 a entrada nao voltou'; END IF;
  IF (public._fn_financiamento_saldo(v_fin, '2031-12-31')->>'liberado')::numeric <> 400 THEN RAISE EXCEPTION 'L3 liberado <> 400'; END IF;
  v_ok := false;
  BEGIN perform fn_financiamento_liberacao_remover(v_l2, 'de novo'); EXCEPTION WHEN sqlstate 'P0001' THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'L3 remover duas vezes passou'; END IF;

  -- L4
  v_n := 0;
  BEGIN perform fn_financiamento_liberacao_salvar(v_parc, null, '2031-01-12', 10, 'conta'); EXCEPTION WHEN sqlstate 'P0001' THEN v_n := v_n + 1; END;
  BEGIN perform fn_financiamento_liberacao_salvar(v_fin, null, '2031-01-12', 10, 'liquidacao', null, null, v_fin); EXCEPTION WHEN sqlstate 'P0001' THEN v_n := v_n + 1; END;
  BEGIN perform fn_financiamento_liberacao_salvar(v_fin, null, '2031-01-12', 10, 'fornecedor'); EXCEPTION WHEN sqlstate 'P0001' THEN v_n := v_n + 1; END;
  BEGIN perform fn_financiamento_liberacao_salvar(v_fin, null, '2031-01-12', 10, 'conta', null, v_cred); EXCEPTION WHEN sqlstate 'P0001' THEN v_n := v_n + 1; END;
  IF v_n <> 4 THEN RAISE EXCEPTION 'L4 recusas: % de 4', v_n; END IF;

  -- D1
  r := fn_financiamento_destinacao_salvar(v_fin, null, 'Trator', 700);
  v_d1 := (r->>'id')::uuid;
  perform fn_financiamento_destinacao_salvar(v_fin, v_d1, 'Trator novo', 750);
  IF (select valor_orcado from financiamento_destinacoes where id = v_d1) <> 750 THEN RAISE EXCEPTION 'D1 editar'; END IF;
  perform fn_financiamento_liberacao_salvar(v_fin, v_l1, '2031-01-12', 400, 'conta', null, null, null, v_d1);
  v_ok := false;
  BEGIN perform fn_financiamento_destinacao_remover(v_d1); EXCEPTION WHEN sqlstate 'P0001' THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'D1 removeu com liberacao viva'; END IF;
  perform fn_financiamento_liberacao_remover(v_l1, 'teste');
  perform fn_financiamento_destinacao_remover(v_d1);
  IF exists (select 1 from financiamento_destinacoes where id = v_d1) THEN RAISE EXCEPTION 'D1 nao removeu'; END IF;

  -- C1
  IF NOT (public._fn_financiamento_saldo(v_fin, '2031-12-31')->'pendencias') ? 'sem_documento' THEN RAISE EXCEPTION 'C1 sem a pendencia'; END IF;
  r := fn_financiamento_documento_registrar(v_fin, 'cedula', 'cedula.pdf', 'PDF', 'application/pdf', 1234);
  v_doc := (r->>'id')::uuid;
  IF r->>'storage_path' <> c_cli::text || '/financiamentos/' || v_fin::text || '/' || v_doc::text || '.pdf' THEN RAISE EXCEPTION 'C1 caminho %', r; END IF;
  IF (public._fn_financiamento_saldo(v_fin, '2031-12-31')->'pendencias') ? 'sem_documento' THEN RAISE EXCEPTION 'C1 pendencia ficou'; END IF;
  perform fn_financiamento_documento_remover(v_doc, 'teste');
  IF NOT (public._fn_financiamento_saldo(v_fin, '2031-12-31')->'pendencias') ? 'sem_documento' THEN RAISE EXCEPTION 'C1 pendencia nao voltou'; END IF;
  IF (public._fn_financiamento_saldo(v_parc, '2031-12-31')->'pendencias') ? 'sem_documento' THEN RAISE EXCEPTION 'C1 compra parcelada com sem_documento'; END IF;

  -- G1
  v_n := 0;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
  BEGIN perform fn_financiamento_liberacao_salvar(v_fin, null, '2031-01-12', 10, 'conta'); EXCEPTION WHEN sqlstate '42501' THEN v_n := v_n + 1; END;
  BEGIN perform fn_financiamento_liberacao_remover(v_l1, 'x'); EXCEPTION WHEN sqlstate '42501' THEN v_n := v_n + 1; END;
  BEGIN perform fn_financiamento_destinacao_salvar(v_fin, null, 'x', 1); EXCEPTION WHEN sqlstate '42501' THEN v_n := v_n + 1; END;
  BEGIN perform fn_financiamento_documento_registrar(v_fin, 'cedula', 'x', 'pdf'); EXCEPTION WHEN sqlstate '42501' THEN v_n := v_n + 1; END;
  BEGIN perform fn_financiamento_documento_remover(v_doc, 'x'); EXCEPTION WHEN sqlstate '42501' THEN v_n := v_n + 1; END;
  BEGIN perform fn_financiamento_captacoes_livres(v_fin); EXCEPTION WHEN sqlstate '42501' THEN v_n := v_n + 1; END;
  perform set_config('request.jwt.claims', '', true);
  BEGIN perform fn_financiamento_destinacao_remover('00000000-0000-0000-0000-000000000001'); EXCEPTION WHEN sqlstate '42501' THEN v_n := v_n + 1; END;
  BEGIN perform fn_financiamento_captacoes_livres(v_fin); EXCEPTION WHEN sqlstate '42501' THEN v_n := v_n + 1; END;
  IF v_n <> 8 THEN RAISE EXCEPTION 'G1 recusas de tenant: % de 8', v_n; END IF;
  IF exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'fn\_financiamento\_%' escape '\'
               and p.proname in ('fn_financiamento_liberacao_salvar','fn_financiamento_liberacao_remover','fn_financiamento_destinacao_salvar',
                 'fn_financiamento_destinacao_remover','fn_financiamento_documento_registrar','fn_financiamento_documento_remover','fn_financiamento_captacoes_livres')
               and has_function_privilege('anon', p.oid, 'EXECUTE')) THEN RAISE EXCEPTION 'G1 anon executa'; END IF;
  IF has_function_privilege('authenticated', 'public._fn_contrato_do_usuario(uuid)'::regprocedure, 'EXECUTE') THEN RAISE EXCEPTION 'G1 a interna abre a authenticated'; END IF;

  RAISE EXCEPTION 'OK fin_financ_28_p4_contrato (L1–L4, D1, C1, G1)';
END
$t$;
