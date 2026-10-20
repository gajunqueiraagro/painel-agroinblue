-- FIN-CONTRATO-NC-SALVAR-01 — correcao do 8.233.040 (RRCC, Sicoob, 74567fe0) pelo "Extrato de Operação de Crédito" do Sicoob de
-- 05/10/2026, com o OK do Gabriel de 20/10/2026 (itens 2 e 3; o item 1, a liberacao de 600.022,50, espera decisao — ver o relatorio).
--   1. Cabecalho pelo dono (`fn_financiamento_salvar_cabecalho`): SAC, anual, pos, 5 parcelas, 1o vencimento 15/08/2026 (data do contrato
--      26/09/2025 e valor 600.022,50 ja' gravados).
--   2. Parcelas pelo dono (`fn_financiamento_parcelas_editar`, trilha em `financiamento_parcelas_operacoes`): parcela 1 em 15/08/2026,
--      principal 120.004,50, juros 116.304,73 (= 236.309,23 − 120.004,50); parcelas 2–5 em 15/08/2027–2030, principal 120.004,50 e os
--      juros ESTIMADOS pelo gerador (SAC anual 7,43% a.a. sobre 480.018,00 — a marca "estimado · pós-fixado" vem no FIN-POS-FIXADO-01).
--      A competencia acompanha o vencimento (o motor, 20261027203800).
--   3. Observacao da parcela 1 (gravada direto; trilha = este arquivo): "juros 39.538,67 + 76.766,06 a identificar (pendência com o cliente)".
--   4. Parcela 1 PAGA em 17/08/2026: os dois lancamentos dela a realizado com pagamento em 17/08/2026 (o gatilho de quitacao marca a
--      parcela), observacao "pago conforme extrato da operação Sicoob de 05/10/2026; conciliar quando o extrato da conta da RRCC for
--      importado". Trilha no `audit_log` do lancamento.
-- Guarda: o contrato no estado medido em 20/10 (price, mensal, 1 parcela viva em 01/10/2026 de 592.000,00 + 118.400,00), senao aborta.

set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

do $mig$
declare
  fin constant uuid := '74567fe0-3e09-4f22-84a5-2513d6557d27';
  p1 uuid; r jsonb; n int;
  c_obs_lanc constant text := 'pago conforme extrato da operação Sicoob de 05/10/2026; conciliar quando o extrato da conta da RRCC for importado';
begin
  if (select count(*) from financiamentos where id = fin and sistema_amortizacao = 'price' and periodicidade = 'mensal' and tipo_taxa = 'pos'
        and valor_total = 600022.50 and data_contrato = date '2025-09-26' and total_parcelas = 5) <> 1
     or (select count(*) from financiamento_parcelas where financiamento_id = fin and status <> 'cancelado') <> 1
     or (select count(*) from financiamento_parcelas where financiamento_id = fin and status <> 'cancelado' and data_vencimento = date '2026-10-01'
           and valor_principal = 592000 and valor_juros = 118400) <> 1
  then raise exception '8233040: estado diferente do medido em 20/10'; end if;
  select id into p1 from financiamento_parcelas where financiamento_id = fin and status <> 'cancelado';

  -- 1. cabecalho
  r := public.fn_financiamento_salvar_cabecalho(fin, jsonb_build_object('sistema_amortizacao', 'sac', 'periodicidade', 'anual', 'tipo_taxa', 'pos',
         'data_primeira_parcela', '2026-08-15'), false);
  if r ? 'recusa' and r->'recusa' <> 'null'::jsonb then raise exception '8233040 cabecalho: %', r; end if;

  -- 2. parcelas
  r := public.fn_financiamento_parcelas_editar(fin, jsonb_build_object(
    'alterar', jsonb_build_array(jsonb_build_object('id', p1, 'data_vencimento', '2026-08-15', 'valor_principal', 120004.50, 'valor_juros', 116304.73)),
    'acrescentar', jsonb_build_array(
      jsonb_build_object('data_vencimento', '2027-08-15', 'valor_principal', 120004.50, 'valor_juros', 35665.34),
      jsonb_build_object('data_vencimento', '2028-08-15', 'valor_principal', 120004.50, 'valor_juros', 26749.00),
      jsonb_build_object('data_vencimento', '2029-08-15', 'valor_principal', 120004.50, 'valor_juros', 17832.67),
      jsonb_build_object('data_vencimento', '2030-08-15', 'valor_principal', 120004.50, 'valor_juros', 8916.33))), false);
  if (select count(*) from financiamento_parcelas where financiamento_id = fin and status <> 'cancelado' and valor_principal = 120004.50) <> 5
  then raise exception '8233040 parcelas: %', r; end if;

  -- 3. observacao da parcela 1
  update financiamento_parcelas set observacao = 'juros 39.538,67 + 76.766,06 a identificar (pendência com o cliente)' where id = p1;

  -- 4. parcela 1 paga em 17/08/2026
  update financeiro_lancamentos_v2 l
     set status_transacao = 'realizado', data_pagamento = date '2026-08-17',
         observacao = case when coalesce(l.observacao, '') = '' then c_obs_lanc else l.observacao || ' · ' || c_obs_lanc end,
         updated_by = '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', updated_at = now()
    from financiamento_parcelas p
   where p.id = p1 and l.id in (p.lancamento_id, p.lancamento_juros_id) and l.cancelado is not true;
  get diagnostics n = row_count;
  if n <> 2 then raise exception '8233040 pagamento em % lancamentos', n; end if;
  if (select status from financiamento_parcelas where id = p1) <> 'pago'
     and not public._fn_parcela_esta_paga(p1) then raise exception '8233040: a parcela 1 nao ficou paga'; end if;
end $mig$;
