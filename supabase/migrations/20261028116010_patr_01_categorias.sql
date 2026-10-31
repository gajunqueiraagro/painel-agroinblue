-- PATR-01 · 116010 — Patrimonio: as CATEGORIAS do bem (Gabriel 16/09 e 30/10/2026; esquema aprovado pelo Chat 30/10).
-- Uma categoria da' a SUGESTAO de vida util e residual (editavel em cada bem), diz se deprecia, se tem valor de mercado (e em que
-- base: terra ou bem), se o bem se liga a PASTOS, e quais subcentros de Investimento do plano a sugerem (pela `ordem_exibicao`).
-- Global = `cliente_id` nulo (o seed abaixo); override por cliente = linha do cliente com o MESMO `codigo` (a do cliente vence).
-- Leitura: global para todos; a do cliente pelo `tenant_ok`. Escrita: nenhuma pela tela neste briefing (so' o seed).
-- Seed: as 13 categorias (decisao 2 + D6). De-para de subcentro (ajuste 1 do Chat): 22010 → benfeitorias; 9020/14020 → instalacoes.
-- `tem_mercado` (escolha do Code, declarada na previa): maquinas, implementos, veiculos, benfeitorias, instalacoes e terra; as obras
-- incorporadas a' terra (cercas, rede de agua, estradas, pastagem, formacao, correcao) e equipamentos/informatica nao.
-- Nenhum dado de cliente e' alterado por esta migration.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

create table if not exists public.patrimonio_categorias (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id),
  codigo text not null check (codigo ~ '^[a-z][a-z_]*$'),
  nome text not null check (btrim(nome) <> ''),
  vida_util_anos numeric(5,2) check (vida_util_anos is null or vida_util_anos > 0),
  residual_pct numeric(5,2) not null default 0 check (residual_pct >= 0 and residual_pct < 100),
  deprecia boolean not null,
  tem_mercado boolean not null,
  base_mercado text check (base_mercado in ('terra', 'bem')),
  tem_pastos boolean not null default false,
  subcentros_sugeridos integer[] not null default '{}',
  ordem integer not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  alterado_em timestamptz,
  alterado_por uuid,
  constraint patrimonio_categoria_vida_chk check (deprecia = (vida_util_anos is not null)),
  constraint patrimonio_categoria_mercado_chk check (tem_mercado = (base_mercado is not null))
);
create unique index if not exists patrimonio_categorias_codigo_uq
  on public.patrimonio_categorias (coalesce(cliente_id, '00000000-0000-0000-0000-000000000000'::uuid), codigo);

alter table public.patrimonio_categorias enable row level security;
drop policy if exists patrimonio_categorias_select on public.patrimonio_categorias;
create policy patrimonio_categorias_select on public.patrimonio_categorias for select to authenticated
  using (cliente_id is null or public.tenant_ok(cliente_id));
revoke all on public.patrimonio_categorias from public, anon;
revoke insert, update, delete on public.patrimonio_categorias from authenticated;
grant select on public.patrimonio_categorias to authenticated;
grant all on public.patrimonio_categorias to service_role;

insert into public.patrimonio_categorias
  (cliente_id, codigo, nome, vida_util_anos, residual_pct, deprecia, tem_mercado, base_mercado, tem_pastos, subcentros_sugeridos, ordem)
values
  (null, 'maquinas',                 'Máquinas',                        10, 20, true,  true,  'bem',   false, '{9030,14040,20630}', 10),
  (null, 'implementos',              'Implementos',                     10, 10, true,  true,  'bem',   false, '{14030}',            20),
  (null, 'veiculos',                 'Veículos',                         5, 30, true,  true,  'bem',   false, '{22030}',            30),
  (null, 'equipamentos_informatica', 'Equipamentos e informática',       5,  0, true,  false, null,    false, '{22020}',            40),
  (null, 'benfeitorias',             'Benfeitorias',                    25,  0, true,  true,  'bem',   false, '{22010}',            50),
  (null, 'instalacoes',              'Instalações',                     20,  0, true,  true,  'bem',   false, '{9020,14020}',       60),
  (null, 'rede_agua',                'Rede de água e bebedouros',       15,  0, true,  false, null,    false, '{}',                 70),
  (null, 'cercas',                   'Cercas',                          10,  0, true,  false, null,    false, '{9010,14010}',       80),
  (null, 'estradas_aceiros',         'Estradas e aceiros',              10,  0, true,  false, null,    false, '{20620}',            90),
  (null, 'pastagens',                'Pastagens',                        5,  0, true,  false, null,    true,  '{9040}',            100),
  (null, 'formacao_area',            'Formação de área agrícola',        5,  0, true,  false, null,    false, '{14090,20610}',     110),
  (null, 'correcao_solo',            'Correção de solo',                 3,  0, true,  false, null,    false, '{14080}',           120),
  (null, 'terra',                    'Terra',                         null,  0, false, true,  'terra', false, '{}',                130)
on conflict do nothing;
