-- PATR-01 · 116040 — Patrimonio: o VINCULO bem ↔ lancamento (ou PARTE de lancamento dividido). Decisoes 4, 5, D1, D2, D8.
-- Ligar SO' LIGA: nada do lancamento muda (mesma regra do OC-VINCULO). Um bem junta N lancamentos; uma parte viva liga a no maximo
-- UM bem (indice unico parcial abaixo). Nenhum valor e' copiado: o valor e' lido de `vw_fin_classificacao_por_parte` pelo par
-- (lancamento_id, parte_ordem) — lancamento sem divisao = parte_ordem 1.
-- SEM FK para o id da parte (D1: dividir de novo APAGA e recria as partes — `_fn_fin_dividir`) e SEM FK para o lancamento (o mesmo
-- motivo: ha' gestos de outras frentes que apagam lancamento, ex. `fn_contrato_editar_e_regenerar`; uma FK quebraria esses gestos
-- com erro cru). Se a parte some, deixa de ser investimento ou o lancamento e' cancelado, o vinculo vira "a conferir": valor "—",
-- nao soma e NAO some (a leitura e' das RPCs de 116060). Desligar = marca com motivo; a linha fica (nada se apaga).
-- `partes_total_ao_ligar` (ajuste do Chat 30/10): quantas partes o lancamento tinha ao ligar; se mudar, o vinculo ganha o selo
-- "a conferir" mas SEGUE somando a parte de investimento (o caso do lancamento inteiro ligado que depois e' dividido).

set local lock_timeout = '2s';
set local statement_timeout = '60s';

create table if not exists public.patrimonio_bem_lancamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  bem_id uuid not null references public.patrimonio_bens(id),
  lancamento_id uuid not null,
  parte_ordem smallint not null default 1 check (parte_ordem >= 1),
  partes_total_ao_ligar smallint not null default 1 check (partes_total_ao_ligar >= 1),
  ligado_em timestamptz not null default now(),
  ligado_por uuid,
  repetida_confirmada boolean not null default false,
  desligado_em timestamptz,
  desligado_por uuid,
  desligado_motivo text,
  constraint patrimonio_vinculo_desligado_chk check ((desligado_em is null) = (desligado_motivo is null))
);
create unique index if not exists patrimonio_bem_lancamentos_vivo_uq
  on public.patrimonio_bem_lancamentos (lancamento_id, parte_ordem) where desligado_em is null;
create index if not exists patrimonio_bem_lancamentos_bem_idx on public.patrimonio_bem_lancamentos (bem_id) where desligado_em is null;
create index if not exists patrimonio_bem_lancamentos_cliente_idx on public.patrimonio_bem_lancamentos (cliente_id) where desligado_em is null;

alter table public.patrimonio_bem_lancamentos enable row level security;
drop policy if exists patrimonio_bem_lancamentos_select on public.patrimonio_bem_lancamentos;
create policy patrimonio_bem_lancamentos_select on public.patrimonio_bem_lancamentos for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.patrimonio_bem_lancamentos from public, anon;
revoke insert, update, delete on public.patrimonio_bem_lancamentos from authenticated;
grant select on public.patrimonio_bem_lancamentos to authenticated;
grant all on public.patrimonio_bem_lancamentos to service_role;
