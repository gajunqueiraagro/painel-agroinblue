-- PATR-01 · 116030 — Patrimonio: VIDA UTIL e RESIDUAL do bem, com vigencia (decisao 2 + D4).
-- Uma linha por mudanca; `vigente_desde` e' sempre o 1o dia de um mes. A linha MAIS ANTIGA vale tambem para os meses anteriores
-- a ela (e' a inicial, nascida da categoria). Mudar vida/residual de um bem que ja' deprecia cria linha nova a partir do mes atual
-- (nunca antes): a acumulada ate' o mes anterior fica congelada e o restante se divide pelos meses que faltam da vida TOTAL
-- (contada desde o "em uso"), minimo 1 mes. `vida_util_meses` nulo = nao deprecia (terra).

set local lock_timeout = '2s';
set local statement_timeout = '60s';

create table if not exists public.patrimonio_bem_parametros (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  bem_id uuid not null references public.patrimonio_bens(id),
  vigente_desde date not null check (vigente_desde = date_trunc('month', vigente_desde)::date),
  vida_util_meses integer check (vida_util_meses is null or vida_util_meses > 0),
  residual_pct numeric(5,2) not null default 0 check (residual_pct >= 0 and residual_pct < 100),
  motivo text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  unique (bem_id, vigente_desde)
);

alter table public.patrimonio_bem_parametros enable row level security;
drop policy if exists patrimonio_bem_parametros_select on public.patrimonio_bem_parametros;
create policy patrimonio_bem_parametros_select on public.patrimonio_bem_parametros for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.patrimonio_bem_parametros from public, anon;
revoke insert, update, delete on public.patrimonio_bem_parametros from authenticated;
grant select on public.patrimonio_bem_parametros to authenticated;
grant all on public.patrimonio_bem_parametros to service_role;
