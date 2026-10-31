-- PATR-01 · 116050 — Patrimonio: PASTOS do bem (decisao 7, D7), AVALIACOES de mercado (decisao 8) e DOCUMENTOS do bem.
-- Pastos: so' categoria com `tem_pastos`; `area_ha` obrigatoria e e' a area DA REFORMA (historico: nao segue o cadastro do pasto
-- depois). O custo do bem se divide pela area (a leitura e' das RPCs). A ficha do pasto (frente seguinte) le^ daqui a ultima reforma.
-- Avaliacoes: opcionais e historicas (data, fonte, base). Terra: base 'terra_nua' (VTN do ITR) ou 'terra_formada' (laudo), em R$/ha
-- × area; demais: base 'bem', valor total. Pastagem nao tem mercado proprio (a RPC recusa). A diferenca contabil × mercado e' efeito
-- de mercado e nunca vai ao resultado operacional (consumo do PATR-02).
-- Documentos: o molde de `financiamento_documentos` (20261027200200), no MESMO bucket `fin-documentos`, pasta
-- `<cliente>/patrimonio/<bem>/` (a 1a pasta e' o cliente: e' o que as policies do bucket conferem — sem policy nova).
-- Escrita so' pelas RPCs (116060). Nada se apaga: desliga / cancela com motivo.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- 1. Pastos do bem ------------------------------------------------------------------------------------------------------------
create table if not exists public.patrimonio_bem_pastos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  bem_id uuid not null references public.patrimonio_bens(id),
  pasto_id uuid not null references public.pastos(id),
  area_ha numeric(12,2) not null check (area_ha > 0),
  criado_em timestamptz not null default now(),
  criado_por uuid,
  alterado_em timestamptz,
  alterado_por uuid,
  desligado_em timestamptz,
  desligado_por uuid,
  desligado_motivo text,
  constraint patrimonio_bem_pasto_desligado_chk check ((desligado_em is null) = (desligado_motivo is null))
);
create unique index if not exists patrimonio_bem_pastos_vivo_uq on public.patrimonio_bem_pastos (bem_id, pasto_id) where desligado_em is null;
create index if not exists patrimonio_bem_pastos_pasto_idx on public.patrimonio_bem_pastos (pasto_id) where desligado_em is null;

alter table public.patrimonio_bem_pastos enable row level security;
drop policy if exists patrimonio_bem_pastos_select on public.patrimonio_bem_pastos;
create policy patrimonio_bem_pastos_select on public.patrimonio_bem_pastos for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.patrimonio_bem_pastos from public, anon;
revoke insert, update, delete on public.patrimonio_bem_pastos from authenticated;
grant select on public.patrimonio_bem_pastos to authenticated;
grant all on public.patrimonio_bem_pastos to service_role;

-- 2. Avaliacoes de mercado ----------------------------------------------------------------------------------------------------
create table if not exists public.patrimonio_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  bem_id uuid not null references public.patrimonio_bens(id),
  data date not null,
  fonte text not null check (btrim(fonte) <> ''),
  base text not null check (base in ('terra_nua', 'terra_formada', 'bem')),
  valor_ha numeric(14,2) check (valor_ha is null or valor_ha > 0),
  area_ha numeric(12,2) check (area_ha is null or area_ha > 0),
  valor_total numeric(16,2) not null check (valor_total > 0),
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  cancelado_em timestamptz,
  cancelado_por uuid,
  cancelado_motivo text,
  constraint patrimonio_avaliacao_terra_chk check (
    (base = 'bem') = (valor_ha is null and area_ha is null)),
  constraint patrimonio_avaliacao_cancelada_chk check ((cancelado_em is null) = (cancelado_motivo is null))
);
create index if not exists patrimonio_avaliacoes_bem_idx on public.patrimonio_avaliacoes (bem_id, data desc) where cancelado_em is null;

alter table public.patrimonio_avaliacoes enable row level security;
drop policy if exists patrimonio_avaliacoes_select on public.patrimonio_avaliacoes;
create policy patrimonio_avaliacoes_select on public.patrimonio_avaliacoes for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.patrimonio_avaliacoes from public, anon;
revoke insert, update, delete on public.patrimonio_avaliacoes from authenticated;
grant select on public.patrimonio_avaliacoes to authenticated;
grant all on public.patrimonio_avaliacoes to service_role;

-- 3. Documentos do bem --------------------------------------------------------------------------------------------------------
create table if not exists public.patrimonio_bem_documentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  bem_id uuid not null references public.patrimonio_bens(id),
  especie text not null check (especie in ('nota_fiscal', 'contrato', 'escritura', 'matricula', 'laudo', 'seguro', 'foto', 'outro')),
  nome text not null check (btrim(nome) <> ''),
  storage_path text,
  tipo text,
  tamanho_bytes bigint,
  enviado_por uuid,
  criado_em timestamptz not null default now(),
  cancelado_em timestamptz,
  cancelado_por uuid,
  cancelado_motivo text,
  constraint patrimonio_documento_cancelado_chk check ((cancelado_em is null) = (cancelado_motivo is null))
);
create index if not exists patrimonio_bem_documentos_bem_idx on public.patrimonio_bem_documentos (bem_id);

alter table public.patrimonio_bem_documentos enable row level security;
drop policy if exists patrimonio_bem_documentos_select on public.patrimonio_bem_documentos;
create policy patrimonio_bem_documentos_select on public.patrimonio_bem_documentos for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.patrimonio_bem_documentos from public, anon;
revoke insert, update, delete on public.patrimonio_bem_documentos from authenticated;
grant select on public.patrimonio_bem_documentos to authenticated;
grant all on public.patrimonio_bem_documentos to service_role;
