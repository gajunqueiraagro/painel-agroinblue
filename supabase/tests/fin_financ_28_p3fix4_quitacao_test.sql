-- FIN-FINANC-28 · P3-FIX4 — quitacao automatica pelo lancamento. Roda depois da 20261027200100, numa transacao que TERMINA EM
-- RAISE (nada fica). Admin simulado; sintetico no cliente Teste: compra parcelada de 2 parcelas (100 cada).
-- Q1 pagar as duas pelo Financeiro (status do lancamento) => contrato 'quitado'.
-- Q2 GESTO CONTRARIO: uma volta a programado => 'ativo'; paga de novo => 'quitado'.
-- Q3 cancelar o lancamento de uma parcela (sem lancamento vivo vale a coluna da parcela, 'pendente') => 'ativo'.
-- Q4 contrato 'cancelado' nunca e' tocado.
-- Q5 a publica recusa sem usuario e recusa contrato de outro cliente (42501); a interna e as de gatilho nao abrem a anon; a interna
--    nao abre a authenticated.
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  v_p1 uuid; v_fin uuid; l uuid[]; v_st text; v_outro uuid;
BEGIN
  select id into v_p1 from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao='2-Saídas' and escopo_negocio='pecuaria' order by ordem_exibicao limit 1;
  v_fin := fn_parcelamento_cadastrar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'descricao', 'SINT QUITA', 'tipo_operacao', '2-Saídas',
     'plano_conta_id', v_p1, 'data_competencia', '2031-02-20', 'intervalo_meses', 1, 'valor_total', 200, 'total_parcelas', 2, 'data_primeira_parcela', '2031-03-10', 'conta_bancaria_id', c_cta));
  select array_agg(lancamento_id order by numero_parcela) into l from financiamento_parcelas where financiamento_id = v_fin;
  select status into v_st from financiamentos where id = v_fin;
  IF v_st <> 'ativo' THEN RAISE EXCEPTION 'Q0: nasceu %', v_st; END IF;

  -- Q1
  update financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = '2031-03-10' where id = l[1];
  select status into v_st from financiamentos where id = v_fin;
  IF v_st <> 'ativo' THEN RAISE EXCEPTION 'Q1: com 1 de 2 pagas ficou %', v_st; END IF;
  update financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = '2031-04-10' where id = l[2];
  select status into v_st from financiamentos where id = v_fin;
  IF v_st <> 'quitado' THEN RAISE EXCEPTION 'Q1: com 2 de 2 pagas ficou %', v_st; END IF;

  -- Q2
  update financeiro_lancamentos_v2 set status_transacao = 'programado', data_pagamento = null where id = l[2];
  select status into v_st from financiamentos where id = v_fin;
  IF v_st <> 'ativo' THEN RAISE EXCEPTION 'Q2: despagar deixou %', v_st; END IF;
  update financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = '2031-04-10' where id = l[2];
  select status into v_st from financiamentos where id = v_fin;
  IF v_st <> 'quitado' THEN RAISE EXCEPTION 'Q2: repagar deixou %', v_st; END IF;

  -- Q3 (o escritor do parcelamento cancela o lancamento; a parcela fica viva e 'pendente')
  perform set_config('app.parcelamento_escritor', 'on', true);
  update financeiro_lancamentos_v2 set cancelado = true, cancelado_em = now(), cancelado_motivo = 'teste' where id = l[2];
  perform set_config('app.parcelamento_escritor', 'off', true);
  select status into v_st from financiamentos where id = v_fin;
  IF v_st <> 'ativo' THEN RAISE EXCEPTION 'Q3: lancamento cancelado deixou %', v_st; END IF;

  -- Q4
  update financiamentos set status = 'cancelado' where id = v_fin;
  update financeiro_lancamentos_v2 set status_transacao = 'programado', data_pagamento = null where id = l[1];
  update financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = '2031-03-10' where id = l[1];
  select status into v_st from financiamentos where id = v_fin;
  IF v_st <> 'cancelado' THEN RAISE EXCEPTION 'Q4: o cancelado virou %', v_st; END IF;

  -- Q5
  select id into v_outro from financiamentos where cliente_id <> c_cli limit 1;
  BEGIN
    perform set_config('request.jwt.claims', '', true);
    perform fn_financiamento_sincronizar_status(v_fin);
    RAISE EXCEPTION 'Q5: sem usuario passou';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  BEGIN
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
    perform fn_financiamento_sincronizar_status(v_outro);
    RAISE EXCEPTION 'Q5: usuario sem acesso passou';
  EXCEPTION WHEN sqlstate '42501' THEN NULL; END;
  IF has_function_privilege('anon', 'public.fn_financiamento_sincronizar_status(uuid)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('anon', 'public._fn_financiamento_status_pelas_parcelas(uuid)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('anon', 'public.trg_fn_lancamento_quita_contrato()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('anon', 'public.trg_financiamento_parcelas_status()'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'Q5: anon executa';
  END IF;
  IF has_function_privilege('authenticated', 'public._fn_financiamento_status_pelas_parcelas(uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'Q5: a interna abre a authenticated';
  END IF;

  RAISE EXCEPTION 'OK fin_financ_28_p3fix4_quitacao (Q1–Q5)';
END
$t$;
