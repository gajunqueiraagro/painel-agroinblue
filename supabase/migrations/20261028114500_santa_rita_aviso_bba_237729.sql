-- FINANC-SANTA-RITA-01 (Gabriel 27/11) — lote 114500 · Code 2 — só o AVISO no contrato Itaú BBA 237.729.00/03 (R$ 2.000.000, 07/2025):
-- "pago ou rolado? a confirmar". A parcela está "paga" em 21/07/2025, mas o saldo segue R$ 2.000.000 (amortizado 0). Só a OBSERVAÇÃO do
-- contrato muda; saldo, parcela e lançamentos ficam intocados (conferido no fim). Confirmação: o extrato do Itaú BBA pela TecnoSpeed.
-- DESFAZER: a observação volta a vazia (estava vazia em 27/11; a guarda abaixo recusa se não estiver).

do $$
declare
  c_bba constant uuid := 'aaa00003-0000-0000-0000-000000000003';
  v_antes jsonb;
begin
  select public._fn_financiamento_saldo(c_bba, current_date) into v_antes
    from public.financiamentos
   where id = c_bba and cliente_id = '77d37bbf-a440-4fca-bf1a-eac60cf91bc4' and numero_contrato = '237.729.00/03' and valor_total = 2000000
     and status = 'ativo' and nullif(btrim(coalesce(observacao, '')), '') is null;
  if v_antes is null then raise exception 'o Itaú BBA 237.729.00/03 não confere (ou a observação já não está vazia): reler antes de aplicar'; end if;

  update public.financiamentos
     set observacao = 'AVISO (27/11/2026, FINANC-SANTA-RITA-01): pago ou rolado? a confirmar — a parcela está "paga" em 21/07/2025, mas o saldo segue R$ 2.000.000. Conferir no extrato do Itaú BBA (Open Finance/TecnoSpeed).'
   where id = c_bba;

  if public._fn_financiamento_saldo(c_bba, current_date) is distinct from v_antes then
    raise exception 'o saldo do Itaú BBA mudou: recusado';
  end if;
end $$;
