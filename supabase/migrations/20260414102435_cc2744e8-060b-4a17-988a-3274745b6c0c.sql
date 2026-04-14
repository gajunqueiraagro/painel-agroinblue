
-- 1. Nova tabela de destinações do financiamento
create table financiamento_destinacoes (
  id                uuid primary key default gen_random_uuid(),
  financiamento_id  uuid not null references financiamentos(id) on delete cascade,
  cliente_id        uuid not null,
  descricao         text not null,
  tipo              text not null check (tipo in (
                      'conta_propria',
                      'pagamento_fornecedor',
                      'desconto_fonte'
                    )),
  valor             numeric not null default 0,
  fornecedor_id     uuid references financeiro_fornecedores(id),
  conta_bancaria_id uuid references financeiro_contas_bancarias(id),
  plano_conta_id    uuid references financeiro_plano_contas(id),
  gerar_lancamento  boolean not null default true,
  lancamento_id     uuid references financeiro_lancamentos_v2(id),
  observacao        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table financiamento_destinacoes enable row level security;

create policy "cliente acessa próprias destinações"
  on financiamento_destinacoes for all
  using (public.is_cliente_member(auth.uid(), cliente_id));

-- 2. Nova coluna em financeiro_lancamentos_v2
alter table financeiro_lancamentos_v2
  add column if not exists sem_movimentacao_caixa boolean not null default false;
