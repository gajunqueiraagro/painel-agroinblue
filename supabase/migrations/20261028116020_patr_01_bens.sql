-- PATR-01 · 116020 — Patrimonio: o BEM (o cadastro do ativo nao biologico).
-- O valor de aquisicao NAO mora aqui: e' a soma dos lancamentos ligados (116040), lidos do lancamento/parte. As unicas excecoes,
-- MARCADAS em `origem_valor`: 'sem_lancamento' (bem anterior ao sistema: `valor_sem_lancamento`) e 'estimativa' (pasto antigo sem
-- custo registrado: R$/ha × area). As duas se SOMAM aos lancamentos ligados, se houver.
-- Situacao: 'em_formacao' (acumula, nao deprecia) → 'em_uso' (deprecia desde o mes de `em_uso_desde`) → 'baixado' (para de
-- depreciar no mes da baixa; a tela da baixa e' de PR futuro, o estado ja' nasce aqui).
-- Vida util e residual NAO moram aqui: `patrimonio_bem_parametros` (116030), com vigencia.
-- `financiamento_id` e' so' informativo; ON DELETE SET NULL porque a tela de financiamentos ainda apaga contrato (useFinanciamentoCadastro.ts:505).
-- Escrita so' pelas RPCs (116060). Nada se apaga: o bem baixa, nunca some.
-- TRILHA (ajuste 3.5 do Chat, 30/10): corrigir a situacao ou o mes de "em uso desde" de um bem que ja' depreciou e' permitido
-- como CORRECAO, com motivo; a RPC grava em `patrimonio_bem_trilha` quem, quando, de → para (com a acumulada antes e depois) e o
-- motivo. A trilha e' imutavel (so' a RPC escreve; ninguem atualiza nem apaga).

set local lock_timeout = '2s';
set local statement_timeout = '60s';

create table if not exists public.patrimonio_bens (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  fazenda_id uuid not null references public.fazendas(id),
  categoria_id uuid not null references public.patrimonio_categorias(id),
  descricao text not null check (btrim(descricao) <> ''),
  marca text,
  modelo text,
  ano_fabricacao integer check (ano_fabricacao is null or ano_fabricacao between 1900 and 2200),
  identificacao text,
  observacao text,
  situacao text not null default 'em_formacao' check (situacao in ('em_formacao', 'em_uso', 'baixado')),
  em_uso_desde date,
  baixado_em date,
  baixa_motivo text,
  atividade text not null check (atividade in ('pecuaria', 'lavoura', 'compartilhado')),
  financiamento_id uuid references public.financiamentos(id) on delete set null,
  origem_valor text not null default 'lancamentos' check (origem_valor in ('lancamentos', 'sem_lancamento', 'estimativa')),
  valor_sem_lancamento numeric(14,2),
  estimativa_rs_ha numeric(14,2),
  estimativa_area_ha numeric(12,2),
  area_ha numeric(12,2) check (area_ha is null or area_ha > 0),
  matricula text,
  nirf text,
  seguradora text,
  apolice text,
  seguro_vence_em date,
  versao integer not null default 1,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  alterado_em timestamptz,
  alterado_por uuid,
  constraint patrimonio_bem_em_uso_chk check (situacao = 'em_formacao' or em_uso_desde is not null),
  constraint patrimonio_bem_baixa_chk check ((situacao = 'baixado') = (baixado_em is not null)),
  constraint patrimonio_bem_baixa_data_chk check (baixado_em is null or baixado_em >= em_uso_desde),
  constraint patrimonio_bem_sem_lancamento_chk check (
    (origem_valor = 'sem_lancamento') = (valor_sem_lancamento is not null)
    and (valor_sem_lancamento is null or valor_sem_lancamento > 0)),
  constraint patrimonio_bem_estimativa_chk check (
    (origem_valor = 'estimativa') = (estimativa_rs_ha is not null and estimativa_area_ha is not null)
    and (estimativa_rs_ha is null or estimativa_rs_ha > 0) and (estimativa_area_ha is null or estimativa_area_ha > 0))
);
create index if not exists patrimonio_bens_cliente_idx on public.patrimonio_bens (cliente_id, fazenda_id);

alter table public.patrimonio_bens enable row level security;
drop policy if exists patrimonio_bens_select on public.patrimonio_bens;
create policy patrimonio_bens_select on public.patrimonio_bens for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.patrimonio_bens from public, anon;
revoke insert, update, delete on public.patrimonio_bens from authenticated;
grant select on public.patrimonio_bens to authenticated;
grant all on public.patrimonio_bens to service_role;

create table if not exists public.patrimonio_bem_trilha (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  bem_id uuid not null references public.patrimonio_bens(id),
  acao text not null check (acao in ('correcao_em_uso')),
  antes jsonb not null,
  depois jsonb not null,
  motivo text not null check (btrim(motivo) <> ''),
  por uuid,
  em timestamptz not null default now()
);
create index if not exists patrimonio_bem_trilha_bem_idx on public.patrimonio_bem_trilha (bem_id, em);
alter table public.patrimonio_bem_trilha enable row level security;
drop policy if exists patrimonio_bem_trilha_select on public.patrimonio_bem_trilha;
create policy patrimonio_bem_trilha_select on public.patrimonio_bem_trilha for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.patrimonio_bem_trilha from public, anon;
revoke insert, update, delete on public.patrimonio_bem_trilha from authenticated;
grant select on public.patrimonio_bem_trilha to authenticated;
grant all on public.patrimonio_bem_trilha to service_role;
