-- PARC-LIVRES-01 (passo 2A) — REPARO DO CONTRATO "Protocolo IATF" (NJ, 65c972a5).
-- ⚠ EXECUTADO EM 06/10/2026 (07/10 UTC), com o SIM do Gabriel no prompt, depois de o ensaio revertido passar no mesmo dia.
--   REGISTRO HISTORICO: NAO SE REEXECUTA — a guarda de origem recusa (o contrato ja' nao esta' no estado medido).
--   Diferencas para o ensaio: o `raise exception 'ENSAIO OK'` final saiu (fica o NOTICE) e o ROLLBACK virou COMMIT.
--
-- O QUE ACONTECEU (06/10/2026, 23:28–23:33 UTC): o contrato nasceu com 5 parcelas de 14.553,94 (1a em 12/10). A data foi corrigida
-- pelo lapis de cada parcela (23:29:02–23:29:33): o motor do financiamento CANCELOU os 5 lancamentos do cadastro (safra 26/27-Pec,
-- Boleto, com documento) e CRIOU outros 5 ("Parcela i/5 Protocolo IATF", sem safra, sem forma, sem documento; a 1a "previsto").
-- Depois (23:29:49) o gravador do contrato deslocou as PARCELAS mais 30 dias para tras, sem tocar nos lancamentos: hoje as
-- parcelas dizem 13/08, 12/09, 13/10, 12/11, 13/12 e os lancamentos 12/09, 12/10, 12/11, 12/12, 12/01.
--
-- O REPARO, parcela a parcela (a data que vale e' a do LANCAMENTO vivo — a que o operador corrigiu e a tela mostra):
--   1. o lancamento ORIGINAL volta a valer (descancelado), com o vencimento corrigido; nome, status 'programado', safra, forma,
--      classificacao, fornecedor e documento sao os que ele nasceu tendo;
--   2. o lancamento que o motor criou e' cancelado pelo dono (`fn_cancelar_lancamento_auditoria`, com o motivo);
--   3. a parcela volta a apontar para o original e fica com a MESMA data dele.
-- Nada fora deste contrato e' tocado. As parcelas em dobro (o pago de 14/09 e a "Parcela 2 - None" da planilha) NAO entram aqui.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

do $r$
declare
  c_fin constant uuid := '65c972a5-a486-4f7f-9d17-ae5c86815bb8';
  r record; v_n int := 0; v_antes text; v_depois text; v_fora_antes text; v_fora_depois text;
begin
  -- guarda de origem: exatamente o estado medido em 06/10
  if (select count(*) from financeiro_lancamentos_v2 where financiamento_id = c_fin and cancelado and origem_lancamento is null and origem_tipo = 'parcela_principal') <> 5
     or (select count(*) from financeiro_lancamentos_v2 where financiamento_id = c_fin and not cancelado and origem_lancamento = 'parcela_financiamento') <> 5 then
    raise exception 'REPARO IATF: o contrato nao esta no estado medido (5 originais cancelados + 5 do motor vivos). Nada foi feito.';
  end if;
  select md5(string_agg(l.id::text || l.updated_at::text, ',' order by l.id)) into v_fora_antes
    from financeiro_lancamentos_v2 l where l.cliente_id = 'f2d67cd4-24d0-456f-a079-a3281dcce7fd' and l.financiamento_id is distinct from c_fin;

  select string_agg(format('  parcela %s venc %s -> lanc %s "%s" %s venc %s safra %s forma %s docs %s', p.numero_parcela, p.data_vencimento, left(l.id::text, 8),
           l.descricao, l.status_transacao, l.data_vencimento, coalesce((select codigo from financeiro_safras s where s.id = l.safra_id), '—'), coalesce(l.forma_pagamento, '—'),
           (select count(*) from financeiro_lancamento_documentos d where d.lancamento_id = l.id and not d.cancelado)), E'\n' order by p.numero_parcela) into v_antes
    from financiamento_parcelas p join financeiro_lancamentos_v2 l on l.id = p.lancamento_id where p.financiamento_id = c_fin;

  for r in
    select p.id parcela_id, p.numero_parcela, m.id motor_id, m.data_vencimento venc_certo, o.id original_id
      from financiamento_parcelas p
      join financeiro_lancamentos_v2 m on m.id = p.lancamento_id and not m.cancelado and m.origem_lancamento = 'parcela_financiamento'
      join financeiro_lancamentos_v2 o on o.financiamento_id = c_fin and o.cancelado and o.origem_lancamento is null and o.origem_tipo = 'parcela_principal'
           and o.descricao = format('Protocolo IATF - Parcela %s/5', p.numero_parcela)
     where p.financiamento_id = c_fin order by p.numero_parcela
  loop
    update financeiro_lancamentos_v2 set cancelado = false, cancelado_em = null, cancelado_por = null, cancelado_motivo = null,
           data_vencimento = r.venc_certo, updated_at = now() where id = r.original_id;
    perform fn_cancelar_lancamento_auditoria(r.motor_id, 'PARC-LIVRES-01 2A: lancamento criado pelo motor do financiamento no lugar do original do parcelamento — o original voltou a valer');
    update financiamento_parcelas set lancamento_id = r.original_id, data_vencimento = r.venc_certo, updated_at = now() where id = r.parcela_id;
    v_n := v_n + 1;
  end loop;
  if v_n <> 5 then raise exception 'REPARO IATF: esperava reparar 5 parcelas, casei %', v_n; end if;

  select string_agg(format('  parcela %s venc %s -> lanc %s "%s" %s venc %s safra %s forma %s docs %s', p.numero_parcela, p.data_vencimento, left(l.id::text, 8),
           l.descricao, l.status_transacao, l.data_vencimento, coalesce((select codigo from financeiro_safras s where s.id = l.safra_id), '—'), coalesce(l.forma_pagamento, '—'),
           (select count(*) from financeiro_lancamento_documentos d where d.lancamento_id = l.id and not d.cancelado)), E'\n' order by p.numero_parcela) into v_depois
    from financiamento_parcelas p join financeiro_lancamentos_v2 l on l.id = p.lancamento_id where p.financiamento_id = c_fin;
  select md5(string_agg(l.id::text || l.updated_at::text, ',' order by l.id)) into v_fora_depois
    from financeiro_lancamentos_v2 l where l.cliente_id = 'f2d67cd4-24d0-456f-a079-a3281dcce7fd' and l.financiamento_id is distinct from c_fin;
  if v_fora_antes is distinct from v_fora_depois then raise exception 'REPARO IATF: algo fora do contrato mudou'; end if;
  if (select count(*) from financeiro_lancamentos_v2 where financiamento_id = c_fin and not cancelado) <> 5
     or (select sum(valor) from financeiro_lancamentos_v2 where financiamento_id = c_fin and not cancelado) <> 72769.70
     or exists (select 1 from financiamento_parcelas p join financeiro_lancamentos_v2 l on l.id = p.lancamento_id
                 where p.financiamento_id = c_fin and (l.cancelado or l.data_vencimento <> p.data_vencimento or l.valor <> p.valor_total)) then
    raise exception 'REPARO IATF: o estado final nao fecha (5 vivos, 72.769,70, parcela = lancamento)';
  end if;
  raise notice E'ANTES\n%\nDEPOIS\n%\n(o resto do NJ: identico)', v_antes, v_depois;
end
$r$;
commit;
