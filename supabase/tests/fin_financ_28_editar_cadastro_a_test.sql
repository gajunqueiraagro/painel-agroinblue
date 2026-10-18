-- FIN-FINANC-28 · EDITAR = CADASTRO NOVO v2 — parte A: editar parcelas. Sintetico no Teste, admin simulado; termina em RAISE 'OK'.
--   A1 simular nao grava; gravar marca "ajustada", o motor leva o valor ao lancamento e a operacao entra na trilha
--   A2 parcela paga recusa (simulacao devolve a frase; gravacao levanta P0001 "… Nada foi gravado.")
--   A3 parcela com pagamento vinculado recusa
--   A4 acrescentar e retirar: o numero segue o vencimento, total e vencimento final no contrato, o lancamento da retirada sai
set local statement_timeout = '60s';
set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  fz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  fin uuid; p1 uuid; p2 uuid; p3 uuid; r jsonb; v numeric; lp uuid; foto text; ok boolean;
BEGIN
  insert into financiamentos (cliente_id, fazenda_id, natureza, tipo_financiamento, descricao, numero_contrato, valor_total, valor_entrada,
                              data_contrato, data_primeira_parcela, total_parcelas, status, conta_bancaria_id, taxa_juros_mensal, sistema_amortizacao)
  values (k, fz, 'financiamento', 'pecuaria', 'SINT EDITAR', 'SINT-5511', 3000, 0, date '2031-01-10', date '2031-02-15', 3, 'ativo', cta, 1, 'sac')
  returning id into fin;
  insert into financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status)
  values (fin, k, 1, date '2031-02-15', 1000, 30, 1030, 'pendente') returning id into p1;
  insert into financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status)
  values (fin, k, 2, date '2031-03-15', 1000, 20, 1020, 'pendente') returning id into p2;
  insert into financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status)
  values (fin, k, 3, date '2031-04-15', 1000, 10, 1010, 'pendente') returning id into p3;
  r := public.fn_reconciliar_financiamento(fin, false, true);

  /* A1 */
  foto := public._fn_parcelas_foto(fin)::text;
  r := public.fn_financiamento_parcelas_editar(fin, jsonb_build_object('alterar', jsonb_build_array(jsonb_build_object('id', p2, 'valor_principal', 1500))));
  IF (r ->> 'simulado')::boolean is not true or r -> 'recusa' <> 'null'::jsonb or public._fn_parcelas_foto(fin)::text <> foto THEN RAISE EXCEPTION 'A1 simular: %', r; END IF;
  r := public.fn_financiamento_parcelas_editar(fin, jsonb_build_object('alterar', jsonb_build_array(jsonb_build_object('id', p2, 'valor_principal', 1500))), false);
  select lancamento_id into lp from financiamento_parcelas where id = p2;
  select valor into v from financeiro_lancamentos_v2 where id = lp;
  IF not (select ajustada from financiamento_parcelas where id = p2) or v is distinct from 1500
     or (select valor_total from financiamento_parcelas where id = p2) is distinct from 1520
     or not exists (select 1 from financiamento_parcelas_operacoes where financiamento_id = fin and tipo = 'editar' and desfeita_em is null)
     or (select ajustada from financiamento_parcelas where id = p1) THEN RAISE EXCEPTION 'A1: % lanc %', r, v; END IF;

  /* A2 */
  update financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = date '2031-02-15'
   where id in (select lancamento_id from financiamento_parcelas where id = p1 union select lancamento_juros_id from financiamento_parcelas where id = p1);
  r := public.fn_financiamento_parcelas_editar(fin, jsonb_build_object('alterar', jsonb_build_array(jsonb_build_object('id', p1, 'valor_principal', 900))));
  IF r #>> '{recusa,frase}' is distinct from 'A parcela 1 já está paga.' THEN RAISE EXCEPTION 'A2 simular: %', r; END IF;
  BEGIN
    r := public.fn_financiamento_parcelas_editar(fin, jsonb_build_object('retirar', jsonb_build_array(p1)), false);
    RAISE EXCEPTION 'A2 passou';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF sqlerrm not like 'A parcela 1 já está paga.%Nada foi gravado.' THEN RAISE EXCEPTION 'A2 frase: %', sqlerrm; END IF;
  END;

  /* A3 */
  insert into financiamento_parcela_vinculos (cliente_id, financiamento_id, parcela_id, lancamento_id, papel, antes)
  select k, fin, p3, lancamento_id, 'principal', '{}'::jsonb from financiamento_parcelas where id = p3;
  r := public.fn_financiamento_parcelas_editar(fin, jsonb_build_object('alterar', jsonb_build_array(jsonb_build_object('id', p3, 'valor_juros', 5))));
  IF r #>> '{recusa,frase}' not like 'A parcela 3 tem pagamento vinculado%' THEN RAISE EXCEPTION 'A3: %', r; END IF;
  delete from financiamento_parcela_vinculos where parcela_id = p3;

  /* A4 */
  select lancamento_id into lp from financiamento_parcelas where id = p3;
  r := public.fn_financiamento_parcelas_editar(fin, jsonb_build_object(
         'acrescentar', jsonb_build_array(jsonb_build_object('data_vencimento', '2031-03-01', 'valor_principal', 500, 'valor_juros', 0)),
         'retirar', jsonb_build_array(p3)), false);
  IF (select status from financiamento_parcelas where id = p3) <> 'cancelado'
     or not (select cancelado from financeiro_lancamentos_v2 where id = lp)
     or (select total_parcelas from financiamentos where id = fin) <> 3
     or (select vencimento_final from financiamentos where id = fin) <> date '2031-03-15'
     or (select numero_parcela from financiamento_parcelas where id = p2) <> 3
     or (select count(*) from financiamento_parcelas q join financeiro_lancamentos_v2 l on l.id = q.lancamento_id and not l.cancelado
          where q.financiamento_id = fin and q.data_vencimento = date '2031-03-01' and q.numero_parcela = 2 and q.ajustada and l.valor = 500) <> 1
  THEN RAISE EXCEPTION 'A4: %', public._fn_parcelas_foto(fin); END IF;
  RAISE EXCEPTION 'OK';
END $t$;
