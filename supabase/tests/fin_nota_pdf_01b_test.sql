-- FIN-NOTA-PDF-01b — `fn_parcelamento_a_partir_do_lancamento` (migration 20261028110600): o lancamento a' vista que existe vira a parcela
-- 1/N da nota (o MESMO id) e nascem as demais. Roda como `authenticated` com as claims de um admin, no cliente Teste, e TERMINA EM RAISE:
-- nada fica no banco. Fixture sintetico (valores da NF 937: 4 × 491,64 = 1.966,56).
-- P0 o catalogo: SECURITY DEFINER; `authenticated` executa, `anon` nao.
-- P1 simular nao grava · P2 aberto de 1.966,56 -> parcela 1/4 de 491,64 (mesmo id, vencimento da nota) + 3 novas; o contrato com as 4
-- P3 PAGO com valor diferente da parcela 1: recusa com a diferenca em R$ (o valor pago nao muda) · P4 PAGO de 500,00 com a parcela 1 =
--    500,00 e o resto repartido: o valor, o pagamento e o status ficam; a parcela 1 nasce paga · P5 o que ja' e' parcela recusa.
-- Mutacao: tirar o `case when v_pago` do valor (o pago receberia o valor da parcela) derruba P4; tirar a recusa da diferenca derruba P3.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v_faz uuid; v_plano uuid; a uuid; b uuid; r jsonb; t text; v record; n int;
  parcelas4 constant jsonb := '[{"numero":1,"data_vencimento":"2026-10-20","valor":491.64},{"numero":2,"data_vencimento":"2026-11-20","valor":491.64},
                               {"numero":3,"data_vencimento":"2026-12-20","valor":491.64},{"numero":4,"data_vencimento":"2027-01-20","valor":491.64}]';
  base jsonb;
begin
  -- P0
  if not (select prosecdef from pg_proc where proname = 'fn_parcelamento_a_partir_do_lancamento') then raise exception 'P0 INVOKER'; end if;
  if not has_function_privilege('authenticated', 'public.fn_parcelamento_a_partir_do_lancamento(uuid,jsonb,boolean)', 'EXECUTE') then raise exception 'P0 sem EXECUTE'; end if;
  if has_function_privilege('anon', 'public.fn_parcelamento_a_partir_do_lancamento(uuid,jsonb,boolean)', 'EXECUTE') then raise exception 'P0 anon executa'; end if;

  select id into v_faz from fazendas where cliente_id = c_cli order by id limit 1;
  select id into v_plano from financeiro_plano_contas where (cliente_id = c_cli or cliente_id is null) and tipo_operacao like '2-%'
     and escopo_negocio = 'pecuaria' and coalesce(ativo, true) order by id limit 1;
  base := jsonb_build_object('cliente_id', c_cli, 'fazenda_id', v_faz, 'descricao', 'Sintq NF 937', 'valor_total', 1966.56, 'data_competencia', '2026-09-15',
    'tipo_operacao', '2-Saídas', 'plano_conta_id', v_plano, 'tipo_financiamento', 'pecuaria', 'parcelas', parcelas4);

  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento,
    status_transacao, cenario, plano_conta_id)
  values (c_cli, v_faz, '-1', '2-Saídas', 1966.56, 'Sintq compra do extrato', '2026-09-15', '2026-09-20', 'programado', 'realizado', v_plano)
  returning id into a;

  -- P1
  r := public.fn_parcelamento_a_partir_do_lancamento(a, base, true);
  if (r->>'parcelas')::int <> 4 or (r->>'financiamento_id') is not null then raise exception 'P1: %', r; end if;
  if (select valor from financeiro_lancamentos_v2 where id = a) <> 1966.56 or (select financiamento_id from financeiro_lancamentos_v2 where id = a) is not null then
    raise exception 'P1 simular gravou'; end if;

  -- P2
  r := public.fn_parcelamento_a_partir_do_lancamento(a, base, false);
  select * into v from financeiro_lancamentos_v2 where id = a;
  if v.valor <> 491.64 or v.data_vencimento <> '2026-10-20' or v.financiamento_id is distinct from (r->>'financiamento_id')::uuid or v.origem_tipo <> 'parcela_principal'
     or v.descricao not like 'Sintq NF 937%1/4%' then raise exception 'P2 parcela 1: % % % %', v.valor, v.data_vencimento, v.origem_tipo, v.descricao; end if;
  select count(*) into n from financeiro_lancamentos_v2 where financiamento_id = v.financiamento_id and cancelado = false;
  if n <> 4 then raise exception 'P2 lancamentos do parcelamento: %', n; end if;
  if (select sum(valor) from financeiro_lancamentos_v2 where financiamento_id = v.financiamento_id) <> 1966.56 then raise exception 'P2 soma'; end if;
  if (select lancamento_id from financiamento_parcelas where financiamento_id = v.financiamento_id and numero_parcela = 1) <> a then raise exception 'P2 parcela 1 nao e o existente'; end if;
  if (select count(*) from financiamento_parcelas where financiamento_id = v.financiamento_id) <> 4 then raise exception 'P2 contrato'; end if;

  -- P3
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento, data_pagamento,
    status_transacao, cenario, plano_conta_id)
  values (c_cli, v_faz, '-1', '2-Saídas', 1966.57, 'Sintq pago a vista', '2026-09-15', '2026-09-21', '2026-09-21', 'realizado', 'realizado', v_plano)
  returning id into b;
  begin
    r := public.fn_parcelamento_a_partir_do_lancamento(b, base, false);
    t := 'PASSOU';
  exception when others then t := sqlstate || ' ' || sqlerrm; end;
  if t not like 'P0001%já está pago com R$ 1.966,57%diferença R$ 1.474,93%Nada foi gravado.%' then raise exception 'P3: %', t; end if;

  -- P4
  update financeiro_lancamentos_v2 set valor = 500.00 where id = b;
  r := public.fn_parcelamento_a_partir_do_lancamento(b, base || jsonb_build_object('parcelas',
    '[{"numero":1,"data_vencimento":"2026-10-20","valor":500.00},{"numero":2,"data_vencimento":"2026-11-20","valor":488.85},
      {"numero":3,"data_vencimento":"2026-12-20","valor":488.85},{"numero":4,"data_vencimento":"2027-01-20","valor":488.86}]'::jsonb), false);
  select * into v from financeiro_lancamentos_v2 where id = b;
  if v.valor <> 500.00 or v.status_transacao <> 'realizado' or v.data_pagamento <> '2026-09-21' or v.data_vencimento <> '2026-09-21' or v.financiamento_id is null then
    raise exception 'P4 o pago mudou: % % % %', v.valor, v.status_transacao, v.data_pagamento, v.data_vencimento; end if;
  if (select status from financiamento_parcelas where lancamento_id = b) <> 'pago' then raise exception 'P4 parcela 1 nao nasceu paga'; end if;

  -- P5
  begin
    r := public.fn_parcelamento_a_partir_do_lancamento(b, base, true);
    t := 'PASSOU';
  exception when others then t := sqlstate || ' ' || sqlerrm; end;
  if t not like 'P0001%já é parcela%' then raise exception 'P5: %', t; end if;

  raise exception 'OK fin_nota_pdf_01b (P0–P5)';
end $teste$;
rollback;
