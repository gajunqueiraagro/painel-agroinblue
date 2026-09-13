-- 20260923120000_agri_barter_02_operacoes.sql
-- AGRI-BARTER-02: a operação de venda de grão e as três tabelas que a sustentam.
--
-- ⚠ ESTE ARQUIVO VERSIONA O QUE JA' ESTA' VIVO NO PROTO. As quatro tabelas foram aplicadas
--   pelo Chat via Management API sob GO, antes de existir migration. Nao se reaplica por ele.
--   Conferido em 13/09/2026: 22, 18, 13 e 17 colunas; `relrowsecurity = true` nas quatro; 4
--   policies em cada; e os SEIS checks com exatamente estes conjuntos de valores.
--
-- ── A ARQUITETURA: RAZÃO + DETALHE ──────────────────────────────────────────────────────
-- `agri_operacoes_comerciais` e' a OC de venda: contrato, contraparte, cultura, safra do grão,
--   precificação (fixo/a_fixar), pagamento (dinheiro/barter) e os dois status — o comercial e o
--   financeiro, que andam separados porque entregar não é receber.
-- `agri_oc_partes` e' o RAZÃO, e e' a mecânica ÚNICA: cada perna financeira — receita da venda,
--   custo do insumo, desconto, imposto, frete — vira UM `financeiro_lancamento`, com vínculo
--   1:1 em `financeiro_lancamento_id`. E' isso que faz o barter aparecer no DRE sem ninguém
--   relançar nada à mão.
--   ⚠ NAO SE DUPLICA MECANICA AQUI: quem quiser uma perna nova acrescenta uma `natureza`, não
--   uma tabela. O `incluso_no_total` existe para a perna que o documento traz mas que não soma
--   no líquido (retenção informativa, por exemplo) — ela continua no razão, fora da conta.
-- `agri_oc_entregas` e' o DETALHE DO GRÃO: liga a carga (`agri_colheita`), a classe de
--   aflatoxina, as sacas e o preço por saca. É por aqui que a colheita encontra a venda.
-- `agri_oc_insumos` e' o DETALHE DO INSUMO: produto, NF, quantidade e valor.
--   ⚠ ELE TEM `safra_id` PROPRIO, e essa e' a razão de o contrato não ter safra: o barter
--   atravessa safras — o insumo entra numa e o grão sai na seguinte. Cada perna diz a sua.
--   ⚠ E ELE PENDURA NO CONTRATO, nao na operação: o insumo é recebido antes de existir venda.
--
-- ⚠ RLS ABERTA, COMO OS VIZINHOS `agri_` DO PROTO — estado declarado destas tabelas neste
--   ambiente, não descuido. O fechamento por tenant é frente propria (PR-ACESSOS-01) e leva as
--   dezesseis policies junto. Registrado para a proxima auditoria nao tratar como achado novo.
--
-- CAMADA 3 (nao entra aqui): o trigger que gera o lançamento ao liquidar, a criação da conta de
-- permuta ao abrir o contrato, e a tela.

create table if not exists public.agri_operacoes_comerciais (
  id uuid primary key default gen_random_uuid(), cliente_id uuid not null, fazenda_id uuid,
  contrato_barter_id uuid, contraparte_fornecedor_id uuid not null,
  tipo_operacao text not null default 'venda_grao' check (tipo_operacao in ('venda_grao')),
  cultura text not null, safra_id uuid, data_operacao date not null default current_date,
  tipo_precificacao text not null default 'fixo' check (tipo_precificacao in ('fixo','a_fixar')),
  condicao_pagamento text not null default 'barter' check (condicao_pagamento in ('dinheiro','barter')),
  valor_bruto numeric, descontos numeric, valor_liquido numeric,
  status_comercial text not null default 'aberto' check (status_comercial in ('aberto','entregue','fechado','cancelado')),
  status_financeiro text not null default 'pendente' check (status_financeiro in ('pendente','parcial','liquidado')),
  observacoes text, ativo boolean not null default true,
  created_at timestamptz not null default now(), created_by uuid, updated_at timestamptz not null default now(), updated_by uuid );

create table if not exists public.agri_oc_partes (
  id uuid primary key default gen_random_uuid(), cliente_id uuid not null, operacao_id uuid not null,
  natureza text not null check (natureza in ('receita_venda','custo_insumo','desconto','imposto','frete')),
  descricao text, valor numeric not null, data_vencimento date, plano_conta_id uuid,
  macro_custo text, grupo_custo text, centro_custo text, subcentro text,
  financeiro_lancamento_id uuid, incluso_no_total boolean not null default true,
  created_at timestamptz not null default now(), created_by uuid, updated_at timestamptz not null default now(), updated_by uuid );

create table if not exists public.agri_oc_entregas (
  id uuid primary key default gen_random_uuid(), cliente_id uuid not null, operacao_id uuid not null,
  colheita_id uuid, classe_aflatoxina text, sacas numeric, preco_saca numeric, valor numeric, observacoes text,
  created_at timestamptz not null default now(), created_by uuid, updated_at timestamptz not null default now(), updated_by uuid );

create table if not exists public.agri_oc_insumos (
  id uuid primary key default gen_random_uuid(), cliente_id uuid not null, contrato_barter_id uuid not null,
  safra_id uuid, produto text not null, nf_numero text, quantidade numeric, unidade text, valor numeric not null,
  plano_conta_id uuid, financeiro_lancamento_id uuid, observacoes text, ativo boolean not null default true,
  created_at timestamptz not null default now(), created_by uuid, updated_at timestamptz not null default now(), updated_by uuid );

-- ⚠ O LAÇO E' O MESMO DO BANCO, copiado: quatro tabelas × quatro policies, geradas por
--   `format` com o nome derivado da tabela. Escrever as dezesseis à mão abriria espaço para uma
--   sair com nome ou comando trocado, e é justamente isso que uma auditoria de RLS procura.
do $$ declare t text; begin
  foreach t in array array['agri_operacoes_comerciais','agri_oc_partes','agri_oc_entregas','agri_oc_insumos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (true)', t||'_select_open', t);
    execute format('create policy %I on public.%I for insert with check (true)', t||'_insert_open', t);
    execute format('create policy %I on public.%I for update using (true)', t||'_update_open', t);
    execute format('create policy %I on public.%I for delete using (true)', t||'_delete_open', t);
  end loop;
end $$;
