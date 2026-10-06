-- CONC-SEM-CLASSIFICACAO-01 — regra unica de "sem plano de contas", os dois avisos da Conciliacao, a leitura do DRE e a lista.
-- Roda depois da 20261027193900, numa transacao que TERMINA EM RAISE (nada fica gravado). Conta e lancamentos SINTETICOS no
-- cliente Teste, em jan/2031 (mes sem dado real), com o admin simulado (as duas leituras novas recusam sem usuario).
-- T0 a busca sabe achar: o mes nasce SEM aviso e ganha o aviso com o primeiro lancamento sem plano.
-- T1 predicado: cru conta; Dividendos por texto conta; cancelado, transferencia e lancamento com plano NAO contam.
-- T2 aviso 'sem_classificacao' {qtde, valor_entradas, valor_saidas} na conta, no tipo e no total = contagem direta.
-- T3 'sem_fornecedor' e' aviso SEPARADO: so' lancamento COM plano e sem fornecedor.
-- T4 so' REALIZADO pago no mes: o previsto sem plano nao conta na Conciliacao (e conta no DRE, pela competencia).
-- T5 o aviso NAO muda status nem motivos, e fica fora de `contas_com_aviso`.
-- T6 regua do ano = resumo, nos dois avisos.
-- T7 lista: mesma quantidade do aviso; `falta`; `aguarda_conta` no texto sem conta; sugestao so' de conta ativa do mesmo tipo.
-- T8 DRE: {qtde, valor_entradas, valor_saidas} pela competencia; sem usuario e de outro cliente -> 42501.
-- T9 contrato: ACL (authenticated sim, anon nao; internas fechadas).
set local statement_timeout = '120s';
set local lock_timeout = '3s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

create function pg_temp.lan(p_conta uuid, p_tipo text, p_v numeric, p_st text, p_dp date, p_plano uuid default null,
                            p_sub text default null, p_macro text default null, p_forn uuid default null,
                            p_dest uuid default null, p_cancelado boolean default false) returns uuid language sql as $f$
  insert into financeiro_lancamentos_v2 (cliente_id, conta_bancaria_id, conta_destino_id, tipo_operacao, sinal, valor, status_transacao,
                                         data_pagamento, data_competencia, data_vencimento, cenario, descricao, plano_conta_id,
                                         subcentro, macro_custo, favorecido_id, cancelado)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', case when p_tipo = '1-Entradas' then null else p_conta end,
          case when p_tipo = '1-Entradas' then p_conta else p_dest end, p_tipo, case when p_tipo = '1-Entradas' then '1' else '-1' end,
          p_v, p_st, p_dp, date '2031-01-10', date '2031-01-10', 'realizado', 'SINT csc01', p_plano, p_sub, p_macro, p_forn, p_cancelado)
  returning id $f$;
create function pg_temp.aviso(p_avisos jsonb, p_motivo text) returns jsonb language sql as $f$
  select x from jsonb_array_elements(p_avisos) x where x->>'motivo' = p_motivo $f$;

DO $t$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v_conta uuid; v_conta2 uuid; v_plano uuid; v_forn uuid; r record; a jsonb; j jsonb; v_st text; v_mot jsonb; v_ca jsonb; v_cru uuid;
BEGIN
  insert into financeiro_contas_bancarias (cliente_id, nome_conta, nome_exibicao, tipo_conta, ativa)
    values (c_cli, 'SINT csc01 A', 'SINT csc01 A', 'cc', true) returning id into v_conta;
  insert into financeiro_contas_bancarias (cliente_id, nome_conta, nome_exibicao, tipo_conta, ativa)
    values (c_cli, 'SINT csc01 B', 'SINT csc01 B', 'cc', true) returning id into v_conta2;
  select id into v_plano from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao = '2-Saídas'
     and macro_custo is distinct from 'Dividendos' order by ordem_exibicao limit 1;
  select id into v_forn from financeiro_fornecedores where cliente_id = c_cli limit 1;
  IF v_forn IS NULL THEN
    insert into financeiro_fornecedores (cliente_id, nome) values (c_cli, 'SINT csc01 fornecedor') returning id into v_forn;
  END IF;

  -- T0: o mes nasce sem aviso (um lancamento COM plano e COM fornecedor nao acende nada)
  perform pg_temp.lan(v_conta, '2-Saídas', 10, 'realizado', date '2031-01-05', v_plano, null, null, v_forn);
  select avisos, status, motivos into a, v_st, v_mot from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[v_conta]) where nivel = 'conta';
  IF pg_temp.aviso(a, 'sem_classificacao') IS NOT NULL OR pg_temp.aviso(a, 'sem_fornecedor') IS NOT NULL THEN
    RAISE EXCEPTION 'T0: aviso sem lancamento sem plano: %', a; END IF;
  select avisos into v_ca from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[v_conta]) where nivel = 'total';

  -- o cenario: 2 crus (saida 100,005 e entrada 40), 1 Dividendos por texto (saida 7), e os que NAO contam
  v_cru := pg_temp.lan(v_conta, '2-Saídas', 100.005, 'realizado', date '2031-01-06');
  perform pg_temp.lan(v_conta, '1-Entradas', 40, 'realizado', date '2031-01-07');
  perform pg_temp.lan(v_conta, '2-Saídas', 7, 'realizado', date '2031-01-08', null, 'Dividendos SINT csc01', 'Dividendos');
  perform pg_temp.lan(v_conta, '2-Saídas', 999, 'realizado', date '2031-01-08', p_cancelado => true);            -- cancelado
  perform pg_temp.lan(v_conta, '3-Transferências', 500, 'realizado', date '2031-01-09', p_dest => v_conta2);     -- transferencia
  perform pg_temp.lan(v_conta, '2-Saídas', 55, 'previsto', date '2031-01-12');                                    -- previsto COM data (T4)
  perform pg_temp.lan(v_conta, '2-Saídas', 21, 'realizado', date '2031-01-11', v_plano);                          -- com plano, sem fornecedor (T3)
  perform pg_temp.lan(v_conta, '2-Saídas', 22, 'realizado', date '2031-02-02');                                   -- cru de OUTRO mes

  -- T1: o predicado
  IF NOT _fn_lancamento_sem_plano(false, null, '2-Saídas') OR _fn_lancamento_sem_plano(true, null, '2-Saídas')
     OR _fn_lancamento_sem_plano(false, null, '3-Transferências') OR _fn_lancamento_sem_plano(false, null, '3-Transferência')
     OR _fn_lancamento_sem_plano(false, v_plano, '2-Saídas') THEN RAISE EXCEPTION 'T1: predicado sem plano'; END IF;
  IF NOT _fn_lancamento_sem_fornecedor(false, v_plano, null, '2-Saídas') OR _fn_lancamento_sem_fornecedor(false, null, null, '2-Saídas')
     OR _fn_lancamento_sem_fornecedor(false, v_plano, v_forn, '2-Saídas') OR _fn_lancamento_sem_fornecedor(true, v_plano, null, '2-Saídas')
     OR _fn_lancamento_sem_fornecedor(false, v_plano, null, '3-Transferências') THEN RAISE EXCEPTION 'T1: predicado sem fornecedor'; END IF;

  -- T2 / T3 / T4 / T5: a linha da conta, o tipo e o total
  FOR r IN select nivel, status, motivos, avisos from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[v_conta, v_conta2])
            where nivel in ('tipo', 'total') or conta_id = v_conta LOOP
    a := pg_temp.aviso(r.avisos, 'sem_classificacao');
    IF a IS DISTINCT FROM jsonb_build_object('motivo', 'sem_classificacao', 'qtde', 3, 'valor_entradas', 40.00, 'valor_saidas', 107.01) THEN
      RAISE EXCEPTION 'T2 (%): sem_classificacao = %', r.nivel, a; END IF;
    IF pg_temp.aviso(r.avisos, 'sem_fornecedor') IS DISTINCT FROM jsonb_build_object('motivo', 'sem_fornecedor', 'qtde', 1) THEN
      RAISE EXCEPTION 'T3 (%): sem_fornecedor = %', r.nivel, pg_temp.aviso(r.avisos, 'sem_fornecedor'); END IF;
    IF r.nivel = 'conta' AND (r.status IS DISTINCT FROM v_st OR r.motivos IS DISTINCT FROM v_mot) THEN
      RAISE EXCEPTION 'T5: o aviso mudou status/motivos: % %', r.status, r.motivos; END IF;
    IF r.nivel = 'total' AND (pg_temp.aviso(r.avisos, 'contas_com_aviso')->'qtde_alem_sem_extrato') IS DISTINCT FROM
                             (pg_temp.aviso(v_ca, 'contas_com_aviso')->'qtde_alem_sem_extrato') THEN
      RAISE EXCEPTION 'T5: contas_com_aviso contou o aviso novo: %', r.avisos; END IF;
  END LOOP;
  -- a conta B (so' recebeu a transferencia) nao tem aviso
  select avisos into a from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[v_conta, v_conta2]) where conta_id = v_conta2;
  IF pg_temp.aviso(a, 'sem_classificacao') IS NOT NULL THEN RAISE EXCEPTION 'T2: a transferencia contou na conta de destino: %', a; END IF;

  -- T6: a regua do ano = o resumo (conta e total do mes)
  FOR r IN select nivel, conta_id, avisos from fn_conciliacao_status_ano(c_cli, 2031) where ano_mes = '2031-01' and (nivel = 'total' or conta_id = v_conta) LOOP
    IF (pg_temp.aviso(r.avisos, 'sem_classificacao')->>'qtde')::int IS DISTINCT FROM
         (select (pg_temp.aviso(x.avisos, 'sem_classificacao')->>'qtde')::int from fn_conciliacao_resumo_mes(c_cli, '2031-01') x
           where x.nivel = r.nivel and x.conta_id is not distinct from r.conta_id)
       OR pg_temp.aviso(r.avisos, 'sem_classificacao') IS NULL THEN
      RAISE EXCEPTION 'T6 (%): regua % ', r.nivel, r.avisos; END IF;
  END LOOP;

  -- T7: a lista
  j := fn_conciliacao_sem_classificacao_lista(c_cli, '2031-01', v_conta);
  IF j->'resumo' IS DISTINCT FROM jsonb_build_object('qtde', 3, 'valor_entradas', 40.00, 'valor_saidas', 107.01, 'com_sugestao', 0,
                                                     'sem_sugestao', 3, 'aguarda_conta', 1) THEN
    RAISE EXCEPTION 'T7: resumo da lista = %', j->'resumo'; END IF;
  IF jsonb_array_length(j->'linhas') <> 3 OR (j->'linhas'->0->>'id')::uuid <> v_cru
     OR j->'linhas'->0->'falta' IS DISTINCT FROM '{"subcentro": true, "fornecedor": true, "centro": true}'::jsonb
     OR (select count(*) from jsonb_array_elements(j->'linhas') l where (l->>'aguarda_conta')::boolean
                                                                     and l->>'subcentro_texto' = 'Dividendos SINT csc01') <> 1 THEN
    RAISE EXCEPTION 'T7: linhas = %', j->'linhas'; END IF;
  IF (fn_conciliacao_sem_classificacao_lista(c_cli, '2031-01', NULL)->'resumo'->>'qtde')::int <> 3 THEN RAISE EXCEPTION 'T7: todas as contas'; END IF;
  -- sugestao: um apelido do cliente para o TEXTO do subcentro -> a linha passa a ter sugestao, com a origem
  insert into financeiro_subcentro_aliases (cliente_id, alias_text, plano_conta_id, ativo) values (c_cli, 'Dividendos SINT csc01', v_plano, true);
  j := fn_conciliacao_sem_classificacao_lista(c_cli, '2031-01', v_conta);
  IF (j->'resumo'->>'com_sugestao')::int <> 1 OR (j->'resumo'->>'aguarda_conta')::int <> 0
     OR (select l->'sugestao'->>'origem' from jsonb_array_elements(j->'linhas') l where l->'sugestao' <> 'null'::jsonb) <> 'alias'
     OR (select (l->'sugestao'->>'plano_conta_id')::uuid from jsonb_array_elements(j->'linhas') l where l->'sugestao' <> 'null'::jsonb) <> v_plano THEN
    RAISE EXCEPTION 'T7: sugestao = %', j; END IF;
  -- conta do plano de OUTRO tipo nao vira sugestao (a direcao e' a do tipo da conta)
  update financeiro_subcentro_aliases set plano_conta_id = (select id from financeiro_plano_contas where ativo and cliente_id is null
                                                              and tipo_operacao = '1-Entradas' order by ordem_exibicao limit 1)
   where cliente_id = c_cli and alias_text = 'Dividendos SINT csc01';
  IF (fn_conciliacao_sem_classificacao_lista(c_cli, '2031-01', v_conta)->'resumo'->>'com_sugestao')::int <> 0 THEN
    RAISE EXCEPTION 'T7: sugestao de conta de outro tipo'; END IF;

  -- T8: o DRE, pela competencia (jan/2031): os 3 realizados + o previsto + o cru pago em fevereiro (competencia jan)
  j := fn_dre_sem_classificacao(c_cli, '2031-01', '2031-01');
  IF j IS DISTINCT FROM jsonb_build_object('qtde', 5, 'valor_entradas', 40.00, 'valor_saidas', 184.01) THEN RAISE EXCEPTION 'T8: dre = %', j; END IF;
  IF (fn_dre_sem_classificacao(c_cli, '2030-01', '2030-12')->>'qtde')::int <> 0 THEN RAISE EXCEPTION 'T8: periodo vazio'; END IF;
  perform set_config('request.jwt.claims', '', true);
  BEGIN perform fn_dre_sem_classificacao(c_cli, '2031-01', '2031-01'); RAISE EXCEPTION 'T8: sem usuario passou';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN perform fn_conciliacao_sem_classificacao_lista(c_cli, '2031-01', NULL); RAISE EXCEPTION 'T8: lista sem usuario passou';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  BEGIN perform fn_conciliacao_sem_classificacao_lista('f2d67cd4-24d0-456f-a079-a3281dcce7fd', '2031-01', v_conta); RAISE EXCEPTION 'T8: conta de outro cliente passou';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- T9: contrato
  IF has_function_privilege('anon', 'public.fn_dre_sem_classificacao(uuid, text, text, uuid, uuid, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_conciliacao_sem_classificacao_lista(uuid, text, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_dre_sem_classificacao(uuid, text, text, uuid, uuid, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_conciliacao_sem_classificacao_lista(uuid, text, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_lancamento_sem_plano(boolean, uuid, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_conciliacao_sem_classificacao_mes(uuid, date, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T9: ACL'; END IF;

  RAISE EXCEPTION 'OK conc_sem_classificacao_01 (T0-T9)';
END $t$;
