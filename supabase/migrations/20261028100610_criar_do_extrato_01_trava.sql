-- CRIAR-DO-EXTRATO-01 (Gabriel, 20/10/2026) — PARTE C, o banco: o backfill dos lançamentos VIVOS sem vencimento e a trava.
--
-- Antes dela, a 20261028100600 tira das três funções que podiam gravar vencimento nulo essa possibilidade.
-- DDL em tabela quente aplicada na hora (sem restrição de horário, Gabriel 17/10 e 20/10): lock_timeout de 2 s — sem a trava, aborta
--   e nada muda; repete-se.
--
-- 1) TRILHA PRÓPRIA do backfill (financeiro_vencimento_backfill_cde01): uma linha por lançamento tocado, com o vencimento de antes
--    (nulo), o de depois e o motivo. Só o sistema lê (RLS ligada, sem policy; nada para anon/authenticated).
-- 2) BACKFILL: vivo (não cancelado) sem vencimento -> vencimento = data de pagamento. FASE 0 (20/10): 16, todos realizados e com
--    pagamento. Se aparecer vivo sem vencimento E sem pagamento, ABORTA (a regra para ele é a competência, e isso pede o OK antes).
-- 3) TRAVA: CHECK criado NOT VALID e validado depois do backfill.
--    A trava vale para os VIVOS: `cancelado OR data_vencimento IS NOT NULL`. Os 13.521 CANCELADOS sem vencimento ficam como estão
--    (decisão do Gabriel, 20/10): um CHECK puro não validaria com eles e, mesmo NOT VALID, recusaria qualquer UPDATE numa linha
--    cancelada sem vencimento. Reativar um cancelado sem vencimento é recusado.

set local lock_timeout = '2s';

create table if not exists public.financeiro_vencimento_backfill_cde01 (
  lancamento_id          uuid primary key references public.financeiro_lancamentos_v2(id),
  cliente_id             uuid not null,
  origem_lancamento      text,
  data_vencimento_antes  date,
  data_vencimento_depois date not null,
  motivo                 text not null,
  feito_em               timestamptz not null default now()
);
alter table public.financeiro_vencimento_backfill_cde01 enable row level security;
revoke all on public.financeiro_vencimento_backfill_cde01 from public, anon, authenticated;

do $bf$
declare v_sem_pag int; v_n int; v_upd int;
begin
  select count(*) into v_sem_pag from public.financeiro_lancamentos_v2
   where not coalesce(cancelado, false) and data_vencimento is null and data_pagamento is null;
  if v_sem_pag > 0 then
    raise exception 'CRIAR-DO-EXTRATO-01: % lançamento(s) vivo(s) sem vencimento e sem pagamento — pedir o OK (competência) antes', v_sem_pag;
  end if;

  insert into public.financeiro_vencimento_backfill_cde01
    (lancamento_id, cliente_id, origem_lancamento, data_vencimento_antes, data_vencimento_depois, motivo)
  select l.id, l.cliente_id, l.origem_lancamento, l.data_vencimento, l.data_pagamento, 'vencimento = pagamento — CRIAR-DO-EXTRATO-01'
    from public.financeiro_lancamentos_v2 l
   where not coalesce(l.cancelado, false) and l.data_vencimento is null and l.data_pagamento is not null
  on conflict (lancamento_id) do nothing;
  get diagnostics v_n = row_count;

  update public.financeiro_lancamentos_v2 l
     set data_vencimento = b.data_vencimento_depois
    from public.financeiro_vencimento_backfill_cde01 b
   where l.id = b.lancamento_id and l.data_vencimento is null;
  get diagnostics v_upd = row_count;

  if v_upd <> v_n then
    raise exception 'CRIAR-DO-EXTRATO-01: trilha com % linha(s) nova(s), % lançamento(s) atualizado(s)', v_n, v_upd;
  end if;
  raise notice 'CRIAR-DO-EXTRATO-01: % lançamento(s) com vencimento = pagamento', v_upd;
end $bf$;

alter table public.financeiro_lancamentos_v2
  add constraint ck_lancamento_v2_vencimento_vivo check (coalesce(cancelado, false) or data_vencimento is not null) not valid;
alter table public.financeiro_lancamentos_v2 validate constraint ck_lancamento_v2_vencimento_vivo;
