-- FIN-FORMA-CARTAO-AUTO-01 · 20261028115520 — CONTA CARTÃO ⇒ FORMA "Cartão de crédito", no BANCO, para todo escritor (Gabriel 17/11 07:44, D1–D5).
-- Antes: a regra (CARTAO-LANCAMENTO-01, `formaPelaConta` na tela) valia só no lançamento NOVO e só com a forma vazia; editar, o fornecedor
-- escolhido depois, criar pelo extrato, importação, recorrência e parcelado escapavam (FASE 0: 4.919 saídas em conta-cartão com outra forma;
-- 22 nasceram nos últimos 30 dias).
-- · D1 FORÇA: saída (2-…) em conta do tipo cartão grava SEMPRE 'Cartão de crédito', diga o que disser quem grava (nota, fornecedor, planilha).
-- · D2 trocar de conta-cartão para conta que não é cartão: a forma volta a vazia SÓ se era 'Cartão de crédito' (quem grava escolhe a nova).
-- · D5 só SAÍDAS: entrada e transferência na conta-cartão ficam como vierem.
-- · `app.forma_pela_conta_off` = 'on' desliga a regra na transação: só o DESFAZER do lote (20261028115530) o usa.
-- · Depois de `trg_00_conta_por_direcao` (a ordem alfabética dos BEFORE): a regra vê a conta já normalizada pela direção.
set local lock_timeout = '2s';

create or replace function public._fn_forma_pela_conta_trg()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_novo_cartao boolean; v_velho_cartao boolean;
begin
  if coalesce(current_setting('app.forma_pela_conta_off', true), '') = 'on' then return new; end if;
  if coalesce(new.tipo_operacao, '') not like '2-%' then return new; end if;
  select cb.tipo_conta = 'cartao' into v_novo_cartao from public.financeiro_contas_bancarias cb where cb.id = new.conta_bancaria_id;
  if coalesce(v_novo_cartao, false) then
    new.forma_pagamento := 'Cartão de crédito';
  elsif tg_op = 'UPDATE' and old.conta_bancaria_id is distinct from new.conta_bancaria_id
        and new.forma_pagamento = 'Cartão de crédito' then
    select cb.tipo_conta = 'cartao' into v_velho_cartao from public.financeiro_contas_bancarias cb where cb.id = old.conta_bancaria_id;
    if coalesce(v_velho_cartao, false) then new.forma_pagamento := null; end if;
  end if;
  return new;
end $$;
revoke all on function public._fn_forma_pela_conta_trg() from public, anon, authenticated;

create trigger trg_00_forma_pela_conta
  before insert or update of conta_bancaria_id, tipo_operacao, forma_pagamento on public.financeiro_lancamentos_v2
  for each row execute function public._fn_forma_pela_conta_trg();
