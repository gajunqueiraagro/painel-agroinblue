-- 20260922120000_agri_barter_01_contratos.sql
-- AGRI-BARTER-01: o contrato de barter — a primeira camada da venda de grão em permuta.
--
-- ⚠ ESTE ARQUIVO VERSIONA O QUE JA' ESTA' VIVO NO PROTO. A tabela foi aplicada pelo Chat via
--   Management API sob GO, antes de existir migration; o arquivo existe para o historico deixar
--   de mentir. Nao se reaplica por ele.
--   Conferido em 13/09/2026: 16 colunas com estes mesmos defaults, `relrowsecurity = true`, as
--   QUATRO policies com estes nomes, e o comentario da tabela identico ao de baixo.
--
-- O QUE O CONTRATO AMARRA: o que o produtor RECEBE (insumos) e o que ENTREGA (grão), com um
-- parceiro — a Casul, que mora em `financeiro_fornecedores` como qualquer contraparte.
-- ⚠ A SAFRA NAO ESTA' AQUI, e e' decisao de modelo: ela vive em CADA PERNA. Um contrato de
--   barter atravessa safras — o insumo entra numa e o grão sai na seguinte —, e prendê-lo a uma
--   safra so' obrigaria a abrir um contrato por safra para a mesma negociação.
-- ⚠ `conta_permuta_id` E' NULAVEL DE PROPOSITO: a conta de permuta do parceiro nasce ao abrir o
--   contrato, pela tela, e por um instante o contrato existe sem ela. Exigi-la na criação faria
--   a tela ter de criar a conta antes de saber se o contrato vai ser salvo.
--
-- ⚠ RLS ABERTA, COMO OS VIZINHOS `agri_` DO PROTO. Nao e' descuido nem "fica para depois": e' o
--   estado declarado das tabelas de agricultura neste ambiente. O fechamento por tenant e'
--   frente propria — PR-ACESSOS-01 —, e quando ela chegar estas quatro policies caem junto com
--   as das outras. Registrado aqui para a proxima auditoria de RLS nao tratar como achado novo.
--
-- CAMADAS SEGUINTES (nao entram neste arquivo): `agri_operacoes_comerciais` (a OC de venda),
-- `agri_oc_entregas` (liga a `agri_colheita`) e a liquidação.

create table if not exists public.agri_barter_contratos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null,
  fazenda_id uuid,
  parceiro_fornecedor_id uuid not null,
  conta_permuta_id uuid,
  nome text not null,
  descricao text,
  status text not null default 'aberto' check (status in ('aberto','fechado','cancelado')),
  data_abertura date not null default current_date,
  data_fechamento date,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.agri_barter_contratos enable row level security;

create policy agri_barter_contratos_select_open on public.agri_barter_contratos for select using (true);
create policy agri_barter_contratos_insert_open on public.agri_barter_contratos for insert with check (true);
create policy agri_barter_contratos_update_open on public.agri_barter_contratos for update using (true);
create policy agri_barter_contratos_delete_open on public.agri_barter_contratos for delete using (true);

comment on table public.agri_barter_contratos is 'Contrato de barter (troca): amarra o que o produtor recebe (insumos) e o que entrega (grao) com um parceiro. Conta de permuta por parceiro. Safra vive em cada perna, nao no contrato.';
