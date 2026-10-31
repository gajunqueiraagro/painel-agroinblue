-- PATR-01 · 116090 — as categorias do Patrimonio sugerem pela CONTA do plano (o id), nunca pela ordem_exibicao (Gabriel 31/10/2026).
-- O P176 (PLANO-INVESTIMENTOS-PADRAO-01, migration 114050, commit b26c92a6) renumerou a `ordem_exibicao` das contas de Investimento (o id
-- nao mudou). `patrimonio_categorias.subcentros_sugeridos` guardava NUMEROS de `ordem_exibicao`: 9 das 11 categorias com numero passaram
-- a apontar para outra conta ("Pastagens" = 9040, hoje "Investimento em Implementos Pecuaria") e a aba "Investimentos sem bem" sugeria a
-- categoria errada. O numero muda; o id nao. Esta migration:
--   1. guarda: o corpo de hoje da `fn_investimentos_sem_bem` (md5) e o array de hoje de cada categoria global (diferente = aborta);
--   2. cria `contas_sugeridas uuid[]` e a preenche com os ids das contas globais (Pec/Agri/Silv/Adm de cada tema) — cada id tem de
--      existir, ser global, ATIVO, de "Investimento na Fazenda", fora de RH e com o NOME esperado (diferente = aborta inteira);
--   3. a `fn_investimentos_sem_bem` passa a casar a categoria pela conta do lancamento (`plano_conta_id`); o resto do corpo e' o da
--      116060 byte a byte (conferido por md5 antes e depois);
--   4. apaga a coluna velha `subcentros_sugeridos` (so' a funcao do passo 3 a lia; nenhuma tela; catalogo, nenhum dado de cliente).
-- O T17 do `patr_01_test.sql` reprova se uma sugestao deixar de ser conta de investimento do tema; o T18 renumera a ordem de duas contas
-- e prova que a sugestao nao muda.
-- GESTO CONTRARIO: recriar `subcentros_sugeridos` com os numeros do plano NOVO (os do P176) e voltar o corpo da 116060.

set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $guarda$
declare r record;
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.fn_investimentos_sem_bem(uuid,uuid,numeric)'::regprocedure)
     is distinct from '835a13db3427c21d570b54b6cd474e38' then
    raise exception '116090: a fn_investimentos_sem_bem nao e'' a da 116060; nada foi alterado';
  end if;
  for r in select * from (values
    ('maquinas', '{9030,14040,20630}'::integer[]), ('implementos', '{14030}'::integer[]), ('veiculos', '{22030}'::integer[]),
    ('equipamentos_informatica', '{22020}'::integer[]), ('benfeitorias', '{22010}'::integer[]), ('instalacoes', '{9020,14020}'::integer[]),
    ('rede_agua', '{}'::integer[]), ('cercas', '{9010,14010}'::integer[]), ('estradas_aceiros', '{20620}'::integer[]),
    ('pastagens', '{9040}'::integer[]), ('formacao_area', '{14090,20610}'::integer[]), ('correcao_solo', '{14080}'::integer[]),
    ('terra', '{}'::integer[])
  ) t(codigo, hoje) loop
    if not exists (select 1 from public.patrimonio_categorias where cliente_id is null and codigo = r.codigo and subcentros_sugeridos = r.hoje) then
      raise exception '116090: a categoria % nao tem hoje %; nada foi alterado', r.codigo, r.hoje;
    end if;
  end loop;
  if (select count(*) from public.patrimonio_categorias where cliente_id is null) <> 13
     or exists (select 1 from public.patrimonio_categorias where cliente_id is not null and cardinality(subcentros_sugeridos) > 0) then
    raise exception '116090: as categorias nao sao as 13 globais de hoje (ou ha'' categoria de cliente com sugestao); nada foi alterado';
  end if;
end $guarda$;

alter table public.patrimonio_categorias add column contas_sugeridas uuid[] not null default '{}';
comment on column public.patrimonio_categorias.contas_sugeridas is
  'PATR-01 116090: as contas do plano (id de financeiro_plano_contas) cujo lancamento sugere esta categoria em "Investimentos sem bem". Pelo id, nunca pela ordem_exibicao (o P176 a renumerou).';

do $preenche$
declare r record; v_n int;
begin
  for r in select * from (values
    ('maquinas', 'cb586f4f-8373-403d-95dc-dbc43d83f176'::uuid, 'Investimento em Máquinas e Equipamentos Pecuária'),
    ('maquinas', '2ab34811-6823-4e6a-8df0-db60355ba29f', 'Investimento em Máquinas e Equipamentos Agricultura'),
    ('maquinas', 'f74dd0f7-1e0f-4186-a5f4-ae92dd1d6c8e', 'Investimento em Máquinas e Equipamentos Silvicultura'),
    ('implementos', '4b0b8e8f-81ff-42ac-b407-3ed437cf64cc', 'Investimento em Implementos Pecuária'),
    ('implementos', 'fb52ef42-b147-41df-a601-e7167ed9270c', 'Investimento em Implementos Agricultura'),
    ('implementos', '2641a1fc-361c-4f28-a8ff-af461bdef7ad', 'Investimento em Implementos Silvicultura'),
    ('veiculos', 'd864f966-6a75-4766-93b6-54a671e0c1d7', 'Investimento em Veículos Administrativo'),
    ('veiculos', 'ee89957a-1c59-4504-9770-bd64ff41cc4c', 'Investimento em Veículos Pecuária'),
    ('veiculos', 'd6a333bd-290c-4f00-956e-e12e368361b4', 'Investimento em Veículos Agricultura'),
    ('veiculos', '5a4c5af6-0723-410d-9920-66d3ed529836', 'Investimento em Veículos Silvicultura'),
    ('equipamentos_informatica', '44391d6a-786a-4b57-b54b-e085c2c61750', 'Investimento em Máquinas e Equipamentos Administrativo'),
    ('benfeitorias', '8f253633-da4d-4c2f-aa35-a8f71e64442a', 'Investimento em Instalações Administrativo'),
    ('instalacoes', 'f4fec107-569a-42a1-b413-bf133474c7fa', 'Investimento em Instalações Pecuária'),
    ('instalacoes', 'eca4260f-f596-413c-93db-6c558a58ff40', 'Investimento em Instalações Agricultura'),
    ('instalacoes', '9fcbf114-40bb-4de3-9043-4348ae4b3199', 'Investimento em Instalações Silvicultura'),
    ('cercas', '9b10cc50-858a-4fa4-94c9-337e8258f81f', 'Investimento em Cercas Pecuária'),
    ('cercas', '3ca87aff-aad4-49bd-965c-73dced44c430', 'Investimento em Cercas Agricultura'),
    ('cercas', '7c863a0a-4043-4849-97e5-51fb8f28c490', 'Investimento em Cercas Silvicultura'),
    ('estradas_aceiros', '59fb0a7b-2827-468e-9aeb-e08954cfc537', 'Investimento em Estradas e Aceiros Silvicultura'),
    ('pastagens', '08c28ca4-c776-4493-8ef8-0e056d7c9196', 'Investimento em Formação de Pasto Pecuária'),
    ('formacao_area', 'd9e176f6-d4dc-452b-8061-b33eb4ee0e1f', 'Investimento em Formação de Área Agricultura'),
    ('formacao_area', 'f1fef085-5d32-4d2f-94c5-ccbef0a0b441', 'Investimento em Formação de Floresta Silvicultura'),
    ('correcao_solo', '7639e3da-45ec-4664-a3c2-ae4f1d9e6549', 'Investimento em Correção de Solo Pecuária'),
    ('correcao_solo', '46e7ae03-1b4a-42b9-9127-cd8498a0e726', 'Investimento em Correção de Solo Agricultura'),
    ('correcao_solo', '1cb7d5d9-dc08-408d-87a1-01819a4b2269', 'Investimento em Correção de Solo Silvicultura')
  ) e(codigo, conta_id, nome) loop
    select count(*) into v_n from public.financeiro_plano_contas p
     where p.id = r.conta_id and p.cliente_id is null and p.ativo and p.macro_custo = 'Investimento na Fazenda'
       and coalesce(p.centro_custo, '') <> 'RH' and p.subcentro = r.nome;
    if v_n <> 1 then
      raise exception '116090: a conta % nao e'' a global ativa de investimento «%» — nada foi alterado', r.conta_id, r.nome;
    end if;
    update public.patrimonio_categorias set contas_sugeridas = contas_sugeridas || r.conta_id, alterado_em = now()
     where cliente_id is null and codigo = r.codigo and not (r.conta_id = any (contas_sugeridas));
    if not found then raise exception '116090: a categoria % nao recebeu a conta %; nada foi alterado', r.codigo, r.conta_id; end if;
  end loop;
end $preenche$;

create or replace function public.fn_investimentos_sem_bem(p_cliente uuid, p_fazenda uuid default null,
                                                           p_corte_individual numeric default 20000)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public set plan_cache_mode = force_custom_plan
as $$
declare v_out jsonb;
begin
  if not coalesce(public.tenant_ok(p_cliente), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  with l as (
    select v.lancamento_id, v.parte_ordem, v.partes_total, v.plano_conta_id, p.subcentro, p.ordem_exibicao, v.fazenda_id,
           case when ct.de_contrato then public._fn_patrimonio_data_do_contrato(v.financiamento_id)
                else coalesce(v.data_competencia, v.data_pagamento) end data,
           case when v.tipo_operacao like '1%' then -abs(v.valor) else abs(v.valor) end valor,
           v.descricao, v.favorecido_id, coalesce(v.status_duplicidade = 'pendente', false) repetida, v.financiamento_id,
           ct.de_contrato, v.status_transacao is distinct from 'realizado' a_realizar
      from public.vw_fin_classificacao_por_parte v
      join public.financeiro_plano_contas p on p.id = v.plano_conta_id
      cross join lateral (
        select coalesce(v.financiamento_id is not null and v.origem_tipo = 'parcela_principal'
                 and exists (select 1 from public.financiamentos f where f.id = v.financiamento_id and f.natureza in ('parcelamento', 'consorcio')),
               false) as de_contrato) ct
     where v.cliente_id = p_cliente and v.cancelado is not true and (v.status_transacao = 'realizado' or ct.de_contrato)
       and p.macro_custo = 'Investimento na Fazenda' and coalesce(p.centro_custo, '') <> 'RH'
       and (p_fazenda is null or v.fazenda_id = p_fazenda)
       and not exists (select 1 from public.patrimonio_bem_lancamentos k
                        where k.lancamento_id = v.lancamento_id and k.parte_ordem = v.parte_ordem and k.desligado_em is null)
  ), cat as (
    select distinct on (o.conta_id) o.conta_id, c.id, c.codigo, c.nome
      from public.patrimonio_categorias c cross join lateral unnest(c.contas_sugeridas) o(conta_id)
     where c.ativo and (c.cliente_id is null or c.cliente_id = p_cliente)
     order by o.conta_id, (c.cliente_id is not null) desc, c.ordem
  ), lc as (
    select l.*, cat.id cat_id, cat.codigo cat_codigo, cat.nome cat_nome, f.codigo fazenda_codigo, fo.nome fornecedor,
           coalesce(cat.codigo in ('maquinas', 'implementos', 'veiculos') and l.valor >= coalesce(p_corte_individual, 0), false) individual
      from l
      left join cat on cat.conta_id = l.plano_conta_id
      left join public.fazendas f on f.id = l.fazenda_id and f.cliente_id = p_cliente
      left join public.financeiro_fornecedores fo on fo.id = l.favorecido_id and fo.cliente_id = p_cliente
  ), it as (
    select lc.*, jsonb_build_object('lancamento_id', lc.lancamento_id, 'parte_ordem', lc.parte_ordem, 'partes_total', lc.partes_total,
             'data', lc.data, 'valor', lc.valor, 'descricao', lc.descricao, 'favorecido_id', lc.favorecido_id,
             'fornecedor', lc.fornecedor, 'repetida', lc.repetida, 'financiamento_id', lc.financiamento_id,
             'de_contrato', lc.de_contrato, 'a_realizar', lc.a_realizar) j
      from lc
  ), g as (
    select extract(year from it.data)::int ano, it.plano_conta_id, it.subcentro, it.ordem_exibicao, it.fazenda_id, it.fazenda_codigo,
           it.cat_id, it.cat_codigo, it.cat_nome,
           count(*)::int n, sum(it.valor) valor, coalesce(sum(it.valor) filter (where not it.repetida), 0) valor_sem_repetidas,
           count(*) filter (where it.repetida)::int n_repetidas, min(it.data) primeira, max(it.data) ultima,
           jsonb_agg(it.j order by it.data, it.lancamento_id, it.parte_ordem) itens
      from it where not it.individual
     group by 1, 2, 3, 4, 5, 6, 7, 8, 9
  ), gf as (
    select g.*, (select coalesce(jsonb_agg(jsonb_build_object('favorecido_id', t.favorecido_id, 'fornecedor', t.fornecedor, 'valor', t.v)
                                             order by t.v desc), '[]'::jsonb)
                   from (select it.favorecido_id, it.fornecedor, sum(it.valor) v from it
                          where not it.individual and it.favorecido_id is not null
                            and extract(year from it.data)::int = g.ano and it.plano_conta_id = g.plano_conta_id
                            and it.fazenda_id is not distinct from g.fazenda_id
                          group by 1, 2 order by sum(it.valor) desc limit 3) t) fornecedores
      from g
  )
  select jsonb_build_object(
    'total', jsonb_build_object('n', (select count(*) from it), 'valor', coalesce((select sum(valor) from it), 0)),
    'grupos', coalesce((select jsonb_agg(jsonb_build_object(
                 'ano', gf.ano, 'plano_conta_id', gf.plano_conta_id, 'subcentro', gf.subcentro, 'ordem_exibicao', gf.ordem_exibicao,
                 'fazenda_id', gf.fazenda_id, 'fazenda_codigo', gf.fazenda_codigo,
                 'categoria', case when gf.cat_id is null then null
                                   else jsonb_build_object('id', gf.cat_id, 'codigo', gf.cat_codigo, 'nome', gf.cat_nome) end,
                 'n', gf.n, 'valor', gf.valor, 'valor_sem_repetidas', gf.valor_sem_repetidas, 'n_repetidas', gf.n_repetidas,
                 'primeira_data', gf.primeira, 'ultima_data', gf.ultima, 'fornecedores', gf.fornecedores, 'itens', gf.itens)
               order by gf.ano desc, gf.ordem_exibicao, gf.fazenda_codigo) from gf), '[]'::jsonb),
    'individuais', coalesce((select jsonb_agg(it.j || jsonb_build_object(
                 'plano_conta_id', it.plano_conta_id, 'subcentro', it.subcentro, 'ordem_exibicao', it.ordem_exibicao,
                 'fazenda_id', it.fazenda_id, 'fazenda_codigo', it.fazenda_codigo,
                 'categoria', jsonb_build_object('id', it.cat_id, 'codigo', it.cat_codigo, 'nome', it.cat_nome))
               order by it.data desc, it.lancamento_id) from it where it.individual), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;

do $confere$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.fn_investimentos_sem_bem(uuid,uuid,numeric)'::regprocedure)
     is distinct from '2bb299079d0db20fbc3d9b4a950d8d26' then
    raise exception '116090: o corpo novo da fn_investimentos_sem_bem nao e'' o esperado';
  end if;
  if (select count(*) from public.patrimonio_categorias where cliente_id is null and cardinality(contas_sugeridas) > 0) <> 11
     or (select sum(cardinality(contas_sugeridas)) from public.patrimonio_categorias where cliente_id is null) <> 25 then
    raise exception '116090: esperava 11 categorias com 25 contas sugeridas';
  end if;
end $confere$;

alter table public.patrimonio_categorias drop column subcentros_sugeridos;
