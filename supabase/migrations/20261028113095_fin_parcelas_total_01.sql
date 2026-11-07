-- FIN-PARCELAS-TOTAL-01 (Gabriel 05/11/2026, achado (d) do FIN-FINANC-LAYOUT-01) — a parcela de FINANCIAMENTO com valor_total = 0 e
-- principal + juros > 0 recebe o total = principal + juros. As cargas de abr–jul/2026 (88 parcelas, 34 contratos: NJ 81, Santa Rita 5,
-- Agnaldo 1, RRCC 1) gravaram o total zerado; quem lê `valor_total` (fn_endividamento_mensal, fn_meta_linhas, fn_financiamento_situacao,
-- _fn_financiamento_saldo, a baixa, fn_financiamento_candidatas) via a parcela como zero (+R$ 28.120.484,35 no total do sistema).
-- SÓ ESTA COLUNA muda: a prévia por RAISE de 05/11 conferiu 0 outras colunas mudadas e nenhum gatilho de status/lançamento disparado.
-- GUARDA: se a população não for exatamente a da prévia (88 parcelas, +28.120.484,35), nada é gravado.
do $$
declare n int; soma numeric;
begin
  select count(*), coalesce(sum(round(coalesce(p.valor_principal, 0) + coalesce(p.valor_juros, 0), 2)), 0) into n, soma
    from public.financiamento_parcelas p join public.financiamentos f on f.id = p.financiamento_id
   where f.natureza = 'financiamento' and coalesce(p.valor_total, 0) = 0 and coalesce(p.valor_principal, 0) + coalesce(p.valor_juros, 0) > 0;
  if n <> 88 or soma <> 28120484.35 then
    raise exception 'FIN-PARCELAS-TOTAL-01: a população mudou desde a prévia (% parcelas, soma %); nada gravado', n, soma;
  end if;
  update public.financiamento_parcelas p set valor_total = round(coalesce(p.valor_principal, 0) + coalesce(p.valor_juros, 0), 2)
    from public.financiamentos f
   where f.id = p.financiamento_id and f.natureza = 'financiamento'
     and coalesce(p.valor_total, 0) = 0 and coalesce(p.valor_principal, 0) + coalesce(p.valor_juros, 0) > 0;
  get diagnostics n = row_count;
  if n <> 88 then raise exception 'FIN-PARCELAS-TOTAL-01: % linhas em vez de 88; nada gravado', n; end if;
end $$;
