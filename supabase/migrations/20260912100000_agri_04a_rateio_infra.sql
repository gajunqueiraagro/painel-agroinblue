-- 20260912100000_agri_04a_rateio_infra.sql
-- AGRI-04A: infraestrutura do rateio para o DRE por cultura. (1) lancamento ganha cultura
-- e fase, opcionais: preenchido = custo direto, NULL = compartilhado que rateia (cultura
-- por area, fase por % declarado). (2) tabela agri_rateio_admin: % por atividade por ano
-- e cliente, um % para todo o administrativo (custo fixo/investimento/juros iguais, opcao A).
-- RLS no padrao dos vizinhos, anon revogado. APLICADA no proto em 2026-09-12.
alter table financeiro_lancamentos_v2
  add column if not exists cultura text
    check (cultura is null or cultura in ('amendoim','mandioca','milho','soja','cana','eucalipto','outras')),
  add column if not exists fase text
    check (fase is null or fase in ('cria','recria','engorda'));
comment on column financeiro_lancamentos_v2.cultura is 'Cultura da lavoura (custo direto). NULL = compartilhado, rateia entre culturas por area. So faz sentido em escopo agricultura.';
comment on column financeiro_lancamentos_v2.fase is 'Fase da pecuaria (cria/recria/engorda). NULL = compartilhado, rateia. So faz sentido em escopo pecuaria.';
create table if not exists agri_rateio_admin (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null,
  ano int not null,
  atividade text not null check (atividade in ('pecuaria','agricultura','silvicultura')),
  percentual numeric not null check (percentual >= 0 and percentual <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cliente_id, ano, atividade)
);
create index if not exists idx_rateio_admin_cliente_ano on agri_rateio_admin(cliente_id, ano);
alter table agri_rateio_admin enable row level security;
create policy agri_rateio_admin_select_open on agri_rateio_admin for select using (true);
create policy agri_rateio_admin_insert_open on agri_rateio_admin for insert with check (true);
create policy agri_rateio_admin_update_open on agri_rateio_admin for update using (true) with check (true);
create policy agri_rateio_admin_delete_open on agri_rateio_admin for delete using (true);
revoke all on agri_rateio_admin from anon;
