-- NOTA-CONTAS-NA-CRIACAO-01 · A — `fn_parcelamento_cadastrar_dividido` (migration 20261028112220): o parcelado nasce JA' dividido, ou nao
-- nasce. Sintetico no cliente Teste, como `authenticated` (admin); TERMINA EM RAISE: nada fica.
-- T1 4 parcelas de 100: cada parcela com 2 partes 70/30 (a mesma proporcao), o pai com `classificacao_partes`, o lancamento na MAIOR
--    parte · T2 a divisao recusa (a mesma conta duas vezes): a frase do banco E nenhum cadastro novo, nenhum lancamento novo
-- T3 menos de duas contas: recusa antes de criar · T4 anon nao executa.
-- Mutacao: trocar a ordem (dividir num cadastro inexistente) ou engolir a excecao da divisao derruba T2.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '90s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
DO $t$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  v_p1 uuid; v_p2 uuid; v_fin uuid; v_pay jsonb; e text; n_fin int; n_lan int; r record;
BEGIN
  select id into v_p1 from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao='2-Saídas' and escopo_negocio='pecuaria' order by ordem_exibicao limit 1;
  select id into v_p2 from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao='2-Saídas' and escopo_negocio='agricultura' order by ordem_exibicao limit 1;
  v_pay := jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'descricao', 'SINT DIVIDIDO NA CRIACAO', 'tipo_operacao', '2-Saídas',
     'plano_conta_id', v_p1, 'data_competencia', '2031-02-20', 'intervalo_meses', 1, 'valor_total', 400, 'total_parcelas', 4, 'data_primeira_parcela', '2031-03-10', 'conta_bancaria_id', c_cta);
  -- T1
  v_fin := fn_parcelamento_cadastrar_dividido(v_pay, jsonb_build_array(jsonb_build_object('plano_conta_id', v_p1, 'percentual', 70), jsonb_build_object('plano_conta_id', v_p2, 'percentual', 30)), 'dividido pelos itens da nota ao criar');
  IF (select count(*) from financiamento_parcelas where financiamento_id = v_fin) <> 4 THEN RAISE EXCEPTION 'T1 parcelas'; END IF;
  FOR r IN select fp.lancamento_id, l.plano_conta_id, l.classificacao_dividida,
                  (select string_agg(p.valor::text, ',' order by p.ordem) from financeiro_lancamento_partes p where p.lancamento_id = fp.lancamento_id) partes
             from financiamento_parcelas fp join financeiro_lancamentos_v2 l on l.id = fp.lancamento_id where fp.financiamento_id = v_fin LOOP
    IF r.partes IS DISTINCT FROM '70.00,30.00' OR r.plano_conta_id <> v_p1 OR NOT r.classificacao_dividida THEN RAISE EXCEPTION 'T1 parcela: %', r; END IF;
  END LOOP;
  IF (select classificacao_partes from financiamentos where id = v_fin) IS NULL THEN RAISE EXCEPTION 'T1 pai sem partes'; END IF;
  -- T2
  select count(*) into n_fin from financiamentos where cliente_id = c_cli;
  select count(*) into n_lan from financeiro_lancamentos_v2 where cliente_id = c_cli;
  BEGIN
    PERFORM fn_parcelamento_cadastrar_dividido(v_pay || '{"descricao":"SINT RECUSADO"}', jsonb_build_array(jsonb_build_object('plano_conta_id', v_p1, 'percentual', 50), jsonb_build_object('plano_conta_id', v_p1, 'percentual', 50)), 'x');
    RAISE EXCEPTION 'T2 aceitou';
  EXCEPTION WHEN others THEN e := sqlerrm; END;
  IF e <> 'A mesma conta aparece duas vezes: some as duas partes numa só.' THEN RAISE EXCEPTION 'T2 frase: %', e; END IF;
  IF (select count(*) from financiamentos where cliente_id = c_cli) <> n_fin OR (select count(*) from financeiro_lancamentos_v2 where cliente_id = c_cli) <> n_lan THEN
    RAISE EXCEPTION 'T2 ficou pela metade';
  END IF;
  -- T3
  BEGIN
    PERFORM fn_parcelamento_cadastrar_dividido(v_pay, jsonb_build_array(jsonb_build_object('plano_conta_id', v_p1, 'percentual', 100)), 'x');
    RAISE EXCEPTION 'T3 aceitou';
  EXCEPTION WHEN others THEN e := sqlerrm; END;
  IF e <> 'A divisão precisa de pelo menos duas contas. Nada foi criado.' THEN RAISE EXCEPTION 'T3: %', e; END IF;
  -- T4
  IF has_function_privilege('anon', 'public.fn_parcelamento_cadastrar_dividido(jsonb,jsonb,text)', 'EXECUTE') THEN RAISE EXCEPTION 'T4 anon'; END IF;
  RAISE EXCEPTION 'OK parcelamento_cadastrar_dividido (T1–T4)';
END $t$;
rollback;
