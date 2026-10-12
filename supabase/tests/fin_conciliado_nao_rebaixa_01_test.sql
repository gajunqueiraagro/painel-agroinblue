-- FIN-CONCILIADO-NAO-REBAIXA-01 — teste da trava do lancamento casado com o extrato.
-- Sintetico no cliente Teste, numa transacao revertida; termina em RAISE 'OK …'. Compara com `is distinct from`, nunca `<>`.
--   R1 lancamento casado: status -> previsto, pagamento -> nulo, pagamento -> outra data, valor e conta RECUSADOS (P0001 + a frase)
--   R2 lancamento casado: descricao, observacao, vencimento e regravar os MESMOS valores PASSAM
--   R3 a promocao do proprio vincular (programado sem data -> realizado com a data do extrato) PASSA
--   R4 lancamento NAO casado: tudo passa
--   R5 desfeita a conciliacao, mudar status, pagamento e valor PASSA
--   R6 entrada casada: a conta da direcao e' conta_destino_id
--   R7 a leitura da tela: casado / nao casado; sem usuario e id inexistente -> 42501; interna fechada a `authenticated`
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  c_frase constant text := 'Lancamento casado com o extrato: desfaca a conciliacao no Espelho para alterar';
  ps record; pe record; l1 uuid; l2 uuid; l3 uuid; e1 uuid := gen_random_uuid(); e3 uuid := gen_random_uuid();
  q record; v_st text; v_msg text; v_cmd text; v_b boolean;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);
  select id, subcentro into ps from financeiro_plano_contas where cliente_id is null and ativo and tipo_operacao = '2-Saídas' and macro_custo <> 'Dividendos' order by ordem_exibicao limit 1;
  select id, subcentro into pe from financeiro_plano_contas where cliente_id is null and ativo and tipo_operacao = '1-Entradas' and macro_custo <> 'Dividendos' order by ordem_exibicao limit 1;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento)
  values (k, f, c, '2031-03-10', '2031-03-15', 500, '-1', '2-Saídas', 'programado', 'SINT casado', ps.id, ps.subcentro, 'realizado', 'manual') returning id into l1;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, data_pagamento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento)
  values (k, f, c, '2031-03-10', '2031-03-15', '2031-03-15', 300, '-1', '2-Saídas', 'realizado', 'SINT solto', ps.id, ps.subcentro, 'realizado', 'manual') returning id into l2;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_destino_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento)
  values (k, f, c, '2031-03-10', '2031-03-15', 700, '1', '1-Entradas', 'programado', 'SINT entrada', pe.id, pe.subcentro, 'realizado', 'manual') returning id into l3;
  insert into extrato_bancario_v2 (id, cliente_id, conta_bancaria_id, data_movimento, descricao, documento, valor, tipo_movimento, hash_movimento, status)
  values (e1, k, c, '2031-03-16', 'SINT', 'sint-' || e1, -500, 'debito', 'sint-' || e1, 'nao_conciliado'),
         (e3, k, c, '2031-03-17', 'SINT', 'sint-' || e3, 700, 'credito', 'sint-' || e3, 'nao_conciliado');

  -- R7 (antes de casar) e R3
  if public.fn_lancamento_casado_com_extrato(l1) is distinct from false then raise exception 'R7 antes: deveria ser nao casado'; end if;
  perform public.fn_vincular_extrato_lancamento(e1, l1);
  select status_transacao s, data_pagamento d into q from financeiro_lancamentos_v2 where id = l1;
  if q.s is distinct from 'realizado' or q.d is distinct from date '2031-03-16' then raise exception 'R3 promocao: % / %', q.s, q.d; end if;
  if public.fn_lancamento_casado_com_extrato(l1) is distinct from true then raise exception 'R7 depois: deveria ser casado'; end if;

  -- R1: cada saida do estado e' recusada, como a tela grava (papel authenticated)
  set local role authenticated;
  foreach v_cmd in array array[
    $$status_transacao = 'previsto'$$, $$status_transacao = 'programado', data_pagamento = null$$, $$data_pagamento = null$$,
    $$data_pagamento = '2031-03-20'$$, $$valor = 500.01$$, $$conta_bancaria_id = null$$ ] loop
    v_st := null; v_msg := null;
    begin
      execute 'update public.financeiro_lancamentos_v2 set ' || v_cmd || ' where id = $1' using l1;
      v_st := 'PASSOU';
    exception when others then get stacked diagnostics v_st = returned_sqlstate, v_msg = message_text; end;
    if v_st is distinct from 'P0001' or v_msg is distinct from c_frase then
      reset role; raise exception 'R1 [%]: esperava P0001 + a frase, veio % %', v_cmd, v_st, v_msg;
    end if;
  end loop;
  -- R2: o que nao e' do banco passa, e regravar os mesmos valores tambem
  update public.financeiro_lancamentos_v2 set descricao = 'SINT casado editado', observacao = 'obs', data_vencimento = '2031-03-18' where id = l1;
  update public.financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = '2031-03-16', valor = 500.00, conta_bancaria_id = c where id = l1;
  -- R4: o nao casado muda tudo
  update public.financeiro_lancamentos_v2 set status_transacao = 'previsto', data_pagamento = null, valor = 310 where id = l2;
  reset role;
  select status_transacao s, data_pagamento d, valor v, descricao t into q from financeiro_lancamentos_v2 where id = l1;
  if q.s is distinct from 'realizado' or q.d is distinct from date '2031-03-16' or q.v is distinct from 500::numeric or q.t is distinct from 'SINT casado editado' then
    raise exception 'R1/R2 estado final do casado: % / % / % / %', q.s, q.d, q.v, q.t; end if;
  select status_transacao s, data_pagamento d, valor v into q from financeiro_lancamentos_v2 where id = l2;
  if q.s is distinct from 'previsto' or q.d is not null or q.v is distinct from 310::numeric then raise exception 'R4 nao casado: % / % / %', q.s, q.d, q.v; end if;

  -- R6: entrada casada — a conta da direcao e' a de destino
  perform public.fn_vincular_extrato_lancamento(e3, l3);
  v_st := null;
  begin update financeiro_lancamentos_v2 set conta_destino_id = null where id = l3; v_st := 'PASSOU';
  exception when others then get stacked diagnostics v_st = returned_sqlstate; end;
  if v_st is distinct from 'P0001' then raise exception 'R6 entrada casada, conta de destino: %', v_st; end if;

  -- R5: desfeita a conciliacao, o lancamento volta a ser editavel
  perform public.fn_desfazer_vinculo_extrato(e1, 'teste');
  if public.fn_lancamento_casado_com_extrato(l1) is distinct from false then raise exception 'R5: ainda casado depois de desfazer'; end if;
  update financeiro_lancamentos_v2 set status_transacao = 'previsto', data_pagamento = null, valor = 480 where id = l1;
  select status_transacao s, data_pagamento d, valor v into q from financeiro_lancamentos_v2 where id = l1;
  if q.s is distinct from 'previsto' or q.d is not null or q.v is distinct from 480::numeric then raise exception 'R5 depois de desfeito: % / % / %', q.s, q.d, q.v; end if;

  -- R7: tenant e ACL
  v_st := null;
  begin perform public.fn_lancamento_casado_com_extrato(gen_random_uuid()); v_st := 'PASSOU';
  exception when others then get stacked diagnostics v_st = returned_sqlstate; end;
  if v_st is distinct from '42501' then raise exception 'R7 id inexistente: %', v_st; end if;
  perform set_config('request.jwt.claims', '', true);
  v_st := null;
  begin perform public.fn_lancamento_casado_com_extrato(l3); v_st := 'PASSOU';
  exception when others then get stacked diagnostics v_st = returned_sqlstate; end;
  if v_st is distinct from '42501' then raise exception 'R7 sem usuario: %', v_st; end if;
  if has_function_privilege('authenticated', 'public._fin_lancamento_casado_com_extrato(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_lancamento_casado_com_extrato(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.fn_lancamento_casado_com_extrato(uuid)', 'EXECUTE') then
    raise exception 'R7 ACL'; end if;

  raise exception 'OK fin_conciliado_nao_rebaixa_01 (R1-R7)';
end $teste$;
ROLLBACK;
