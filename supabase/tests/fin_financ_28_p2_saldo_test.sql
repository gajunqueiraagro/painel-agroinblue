-- FIN-FINANC-28-P2 — a fonte unica do saldo devedor. Termina em RAISE 'OK'; transacao revertida, sem sobra.
-- Exige a migration 20261027200000 aplicada. Sintetico no cliente Teste; compara com `is distinct from`.
--   S1 contrato com 2 liberacoes (21/11 e 22/12) e 10 parcelas, 2 pagas: liberado, amortizado e saldo certos antes da 1a
--      liberacao, entre as duas e no fim; juros previstos a parte, fora do saldo; a situacao (com e sem detalhe) traz o mesmo
--   S2 rolado e cancelado: saldo 0 e fora das somas
--   S3 quitado com parcela 'pago' de principal zero e sem lancamento: saldo 0 + 'amortizacao_sem_lancamento'
--   S4 sem liberacao: saldo NULO + 'sem_liberacao'; numero sem digito: 'sem_numero_contrato'
--   S5 outro cliente nao le (42501); anon e authenticated nao executam a interna; anon nao executa a publica
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_admin constant text := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_user_nj constant text := '9200e0d0-095f-4ab8-a31a-3052a0faaf56';
  fin uuid; rol uuid; can uuid; qui uuid; sem uuid; v jsonb; ok boolean;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);

  /* S1 */
  insert into public.financiamentos (cliente_id, fazenda_id, natureza, tipo_financiamento, descricao, numero_contrato,
                                     valor_total, valor_entrada, data_contrato, total_parcelas, status)
  values (k, f, 'financiamento', 'pecuaria', 'SINT P2', 'SINT-P2-001', 1000000, 0, date '2025-11-20', 10, 'ativo') returning id into fin;
  insert into public.financiamento_liberacoes (cliente_id, financiamento_id, data, valor, forma) values
    (k, fin, date '2025-11-21', 400000, 'conta'), (k, fin, date '2025-12-22', 600000, 'conta');
  insert into public.financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento,
                                             valor_principal, valor_juros, valor_total, status)
  select fin, k, g, (date '2026-01-15' + make_interval(months => g - 1))::date, 100000, 10000, 110000, 'pendente'
    from generate_series(1, 10) g;
  perform public.fn_reconciliar_financiamento(fin, false, true);
  -- pagas pelo Financeiro (o lancamento decide): as parcelas 1 e 2, principal e juros
  update public.financeiro_lancamentos_v2 l set status_transacao = 'realizado', data_pagamento = q.data_vencimento
    from public.financiamento_parcelas q
   where q.financiamento_id = fin and q.numero_parcela in (1, 2) and l.id in (q.lancamento_id, q.lancamento_juros_id);

  v := public.fn_financiamento_saldo(fin, date '2025-11-01');
  if (v->>'liberado')::numeric is distinct from 0 or (v->>'saldo')::numeric is distinct from 0
     or (v->>'amortizado')::numeric is distinct from 0 then raise exception 'S1 antes da 1a liberacao: %', v; end if;
  v := public.fn_financiamento_saldo(fin, date '2025-12-01');
  if (v->>'liberado')::numeric is distinct from 400000 or (v->>'saldo')::numeric is distinct from 400000 then
    raise exception 'S1 entre as liberacoes: %', v; end if;
  v := public.fn_financiamento_saldo(fin, date '2026-10-17');
  if (v->>'contratado')::numeric is distinct from 1000000 or (v->>'liberado')::numeric is distinct from 1000000
     or (v->>'amortizado')::numeric is distinct from 200000 or (v->>'saldo')::numeric is distinct from 800000
     or (v->>'juros_pagos')::numeric is distinct from 20000 or (v->>'juros_previstos')::numeric is distinct from 80000
     or v->>'regra' is distinct from 'calculado' or jsonb_array_length(v->'pendencias') is distinct from 0 then
    raise exception 'S1 no fim: %', v; end if;
  v := public.fn_financiamento_saldo(fin, date '2026-01-31');
  if (v->>'amortizado')::numeric is distinct from 100000 or (v->>'saldo')::numeric is distinct from 900000 then
    raise exception 'S1 depois da 1a parcela: %', v; end if;
  v := public.fn_financiamento_situacao(fin, date '2026-10-17');
  if (v->'saldo'->>'saldo')::numeric is distinct from 800000 then raise exception 'S1 situacao sem o saldo: %', v->'saldo'; end if;
  v := public.fn_financiamento_situacao(fin, date '2026-10-17', true);
  if (v->'saldo'->>'saldo')::numeric is distinct from 800000 then raise exception 'S1 situacao detalhe sem o saldo'; end if;
  v := public.fn_financiamentos_situacao_lote(k, date '2026-10-17');
  if (v->(fin::text)->'saldo'->>'saldo')::numeric is distinct from 800000 then raise exception 'S1 lote sem o saldo'; end if;

  /* S2 */
  insert into public.financiamentos (cliente_id, fazenda_id, natureza, tipo_financiamento, descricao, numero_contrato,
                                     valor_total, data_contrato, status)
  values (k, f, 'financiamento', 'pecuaria', 'SINT P2 rolado', 'SINT-P2-002', 500000, date '2025-01-10', 'ativo') returning id into rol;
  insert into public.financiamento_liberacoes (cliente_id, financiamento_id, data, valor, forma) values (k, rol, date '2025-01-12', 500000, 'conta');
  update public.financiamentos set status = 'rolado', contrato_sucessor_id = fin where id = rol;
  v := public.fn_financiamento_saldo(rol, date '2026-10-17');
  if (v->>'saldo')::numeric is distinct from 0 or (v->>'fora_das_somas')::boolean is distinct from true then raise exception 'S2 rolado: %', v; end if;
  insert into public.financiamentos (cliente_id, fazenda_id, natureza, tipo_financiamento, descricao, numero_contrato,
                                     valor_total, data_contrato, status)
  values (k, f, 'financiamento', 'pecuaria', 'SINT P2 cancelado', 'SINT-P2-003', 300000, date '2025-02-10', 'cancelado') returning id into can;
  v := public.fn_financiamento_saldo(can, date '2026-10-17');
  if (v->>'saldo')::numeric is distinct from 0 or (v->>'fora_das_somas')::boolean is distinct from true then raise exception 'S2 cancelado: %', v; end if;

  /* S3 */
  insert into public.financiamentos (cliente_id, fazenda_id, natureza, tipo_financiamento, descricao, numero_contrato,
                                     valor_total, data_contrato, status)
  values (k, f, 'financiamento', 'pecuaria', 'SINT P2 quitado', 'SINT-P2-004', 200000, date '2024-01-10', 'quitado') returning id into qui;
  insert into public.financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento, data_pagamento,
                                             valor_principal, valor_juros, valor_total, status)
  values (qui, k, 1, date '2024-07-10', date '2024-07-10', 0, 0, 0, 'pago');
  v := public.fn_financiamento_saldo(qui, date '2026-10-17');
  if (v->>'saldo')::numeric is distinct from 0 or v->>'regra' is distinct from 'quitado'
     or not (v->'pendencias' ? 'amortizacao_sem_lancamento') then raise exception 'S3 quitado: %', v; end if;

  /* S4 */
  insert into public.financiamentos (cliente_id, fazenda_id, natureza, tipo_financiamento, descricao, numero_contrato,
                                     valor_total, data_contrato, status)
  values (k, f, 'financiamento', 'pecuaria', 'SINT P2 sem liberacao', 'Sem dados', 150000, date '2026-03-10', 'ativo') returning id into sem;
  v := public.fn_financiamento_saldo(sem, date '2026-10-17');
  if v->'saldo' is distinct from 'null'::jsonb or v->'liberado' is distinct from 'null'::jsonb
     or not (v->'pendencias' ? 'sem_liberacao') or not (v->'pendencias' ? 'sem_numero_contrato') then
    raise exception 'S4 sem liberacao: %', v; end if;

  /* S5 */
  perform set_config('request.jwt.claims', json_build_object('sub', c_user_nj, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.fn_financiamento_saldo(fin, date '2026-10-17');
    exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'S5 outro cliente leu o saldo'; end if;
  perform set_config('request.jwt.claims', '{}', true);
  ok := false; begin perform public.fn_financiamento_saldo(fin, date '2026-10-17');
    exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'S5 sem usuario leu o saldo'; end if;
  if has_function_privilege('anon', 'public.fn_financiamento_saldo(uuid,date)', 'EXECUTE')
     or has_function_privilege('anon', 'public._fn_financiamento_saldo(uuid,date)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._fn_financiamento_saldo(uuid,date)', 'EXECUTE') then
    raise exception 'S5 ACL aberta';
  end if;

  raise exception 'FIN-FINANC-28-P2: OK';
end
$teste$;
ROLLBACK;
