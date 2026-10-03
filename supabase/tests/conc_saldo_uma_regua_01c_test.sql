-- PR-CONC-SALDO-UMA-REGUA-01c — testes SINTETICOS, numa transacao que TERMINA EM RAISE (nada fica gravado).
-- Roda DEPOIS da migration 20261027192200 (ou colado logo depois dela):
--   `supabase db query --linked -f supabase/tests/conc_saldo_uma_regua_01c_test.sql`
--
-- D1 sem `p_conta_ids` o conjunto e' o da tela: a conta INATIVA e a que ainda NAO EXISTIA no mes (`mes_inicio`) nao entram (nem
--    nas linhas, nem na contagem de pendentes do total); com `p_conta_ids` elas entram; o status do ano conta o mesmo universo.
-- D2 diferenca por lado, banco − sistema: extrato sem par +50 -> diferenca_entradas 50; lancamento sem par −30 -> diferenca_saidas 30.
-- D3 linhas_sistema: saldo_apos corrido fechando em saldo_sistema, centro do lancamento e o status de exibicao.
set local statement_timeout = '120s';
set local lock_timeout = '3s';

do $t$
declare
  c_cli constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  v_ina uuid; v_fut uuid; v_d uuid; e1 uuid; l1 uuid; v_plano uuid; v_faz uuid;
  r record; v_n int; v_pend_resumo int; v_pend_ano int; v_out text := ''; v_lin jsonb;
begin
  perform set_config('app.conciliar_bloco', 'on', true);
  insert into financeiro_contas_bancarias (cliente_id, nome_conta, nome_exibicao, tipo_conta, ativa)
    values (c_cli, 'SINT 01C INATIVA', 'SINT 01C INATIVA', 'cc', false) returning id into v_ina;
  insert into financeiro_contas_bancarias (cliente_id, nome_conta, nome_exibicao, tipo_conta, ativa, mes_inicio)
    values (c_cli, 'SINT 01C FUTURA', 'SINT 01C FUTURA', 'cc', true, '2031-05') returning id into v_fut;
  insert into financeiro_contas_bancarias (cliente_id, nome_conta, nome_exibicao, tipo_conta, ativa)
    values (c_cli, 'SINT 01C D', 'SINT 01C D', 'cc', true) returning id into v_d;

  -- ── D1 ──
  if exists (select 1 from fn_conciliacao_resumo_mes(c_cli, '2031-01') f where f.conta_id in (v_ina, v_fut)) then
    raise exception 'D1: inativa ou futura no resumo de todas as contas';
  end if;
  if not exists (select 1 from fn_conciliacao_resumo_mes(c_cli, '2031-06') f where f.conta_id = v_fut)
     or exists (select 1 from fn_conciliacao_resumo_mes(c_cli, '2031-06') f where f.conta_id = v_ina) then
    raise exception 'D1: a futura nao entrou no mes de inicio, ou a inativa entrou';
  end if;
  if (select count(*) from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[v_ina, v_fut]) f where f.nivel = 'conta') <> 2 then
    raise exception 'D1: com p_conta_ids as duas tinham de vir';
  end if;
  select coalesce((select (m->>'qtde')::int from fn_conciliacao_resumo_mes(c_cli, '2031-01') f, jsonb_array_elements(f.motivos) m
                    where f.nivel = 'total' and m->>'motivo' = 'contas_pendentes'), 0) into v_pend_resumo;
  select coalesce((select (m->>'qtde')::int from fn_conciliacao_status_ano(c_cli, 2031) s, jsonb_array_elements(s.motivos) m
                    where s.nivel = 'total' and s.ano_mes = '2031-01' and m->>'motivo' = 'contas_pendentes'), 0) into v_pend_ano;
  if v_pend_resumo <> v_pend_ano
     or v_pend_resumo <> (select count(*) from financeiro_contas_bancarias b where b.cliente_id = c_cli and b.ativa
                            and (b.mes_inicio is null or b.mes_inicio <= '2031-01')) then
    raise exception 'D1: pendentes do total resumo % x status do ano % x universo', v_pend_resumo, v_pend_ano;
  end if;
  v_out := v_out || format('D1 ok (inativa e futura fora; futura entra no mes de inicio; p_conta_ids inclui; pendentes %s = status do ano); ', v_pend_resumo);

  -- ── D2/D3 ──
  select id into v_faz from fazendas where cliente_id = c_cli order by created_at limit 1;
  select id into v_plano from financeiro_plano_contas
   where (cliente_id = c_cli or cliente_id is null) and tipo_operacao = '1-Entradas' and ativo order by ordem_exibicao limit 1;
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao, documento)
    values (c_cli, v_d, '2031-01-05', 100, 'credito', md5(random()::text), 'SINT', 'SINT-01C-1') returning id into e1;
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao, documento)
    values (c_cli, v_d, '2031-01-06', 50, 'credito', md5(random()::text), 'SINT', 'SINT-01C-2');
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_destino_id, tipo_operacao, sinal, valor, status_transacao, data_pagamento,
                                         data_competencia, data_vencimento, cenario, descricao, plano_conta_id)
    values (c_cli, v_faz, v_d, '1-Entradas', '1', 100, 'realizado', '2031-01-05', '2031-01-05', '2031-01-05', 'realizado', 'SINT 01C entrada', v_plano)
    returning id into l1;
  insert into conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado) values (c_cli, e1, l1, 100);
  insert into financeiro_lancamentos_v2 (cliente_id, conta_bancaria_id, tipo_operacao, sinal, valor, status_transacao, data_pagamento,
                                         data_competencia, data_vencimento, cenario, descricao)
    values (c_cli, v_d, '2-Saídas', '-1', 30, 'realizado', '2031-01-07', '2031-01-07', '2031-01-07', 'realizado', 'SINT 01C saida');
  insert into financeiro_saldos_bancarios_v2 (cliente_id, conta_bancaria_id, ano_mes, saldo_final) values (c_cli, v_d, '2030-12', 1000);

  select * into r from fn_conciliacao_resumo_mes(c_cli, '2031-01', array[v_d]) f where f.nivel = 'conta';
  if r.diferenca_entradas <> 50 or r.diferenca_saidas <> 30 then
    raise exception 'D2: diferenca por lado % / % (esperado 50 / 30)', r.diferenca_entradas, r.diferenca_saidas;
  end if;
  v_lin := r.linhas_sistema;
  if (select string_agg(format('%s|%s|%s|%s', l->>'tipo', l->>'valor', l->>'saldo_apos', l->>'status_exibicao'), ' ' order by o)
        from jsonb_array_elements(v_lin) with ordinality x(l, o)) <> 'vinculo|100.00|1100.00|conciliado sem_par|-30|1070.00|realizado'
     or (v_lin->-1->>'saldo_apos')::numeric <> r.saldo_sistema
     or (v_lin->0->>'centro') is null then
    raise exception 'D3: linhas %', v_lin;
  end if;
  v_out := v_out || format('D2 ok (+50 / +30); D3 ok (saldo_apos 1.100 -> 1.070 = saldo_sistema %s, centro "%s", status de exibicao); ',
    r.saldo_sistema, v_lin->0->>'centro');

  raise exception 'OK %', v_out using errcode = 'P0001';
end $t$;
