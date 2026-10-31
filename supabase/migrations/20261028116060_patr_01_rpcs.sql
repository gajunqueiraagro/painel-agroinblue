-- PATR-01 · 116060 — Patrimonio: as RPCs (leitura e escrita). Esquema aprovado pelo Chat 30/10/2026 (D1–D8 + ajustes 1–4).
--
-- RECONHECIMENTO DE INVESTIMENTO (D5): conta do plano com macro_custo = 'Investimento na Fazenda' e centro_custo <> 'RH' (pega a
-- silvicultura 20610–20630, que tem bloco_dre nulo). Leitura SEMPRE por parte: `vw_fin_classificacao_por_parte` pelo par
-- (lancamento_id, parte_ordem) — o lancamento dividido fica com a conta da MAIOR parte e somar o inteiro superconta.
-- DATA DO LANCAMENTO para o bem = coalesce(data_competencia, data_pagamento) (3.6: a data da nota/compra). Parcela de principal de
-- contrato de PARCELAMENTO/CONSORCIO (ajuste do Gabriel 30/10 19h): a data do contrato (sem ela, a competencia da 1a parcela).
-- VINCULO (D1, ajuste 3): 'soma' = realizado, parte de investimento viva; tambem a parcela de principal de contrato de
-- parcelamento/consorcio, PREVISTA INCLUSIVE (o bem entra pelo valor total do contrato desde a compra). 'a_realizar' = previsto /
-- programado / agendado ligado fora de contrato (aparece a' parte, nao soma); 'a_conferir' = a parte sumiu, deixou de ser
-- investimento ou o lancamento foi cancelado (valor nulo = "—", nao soma, nao some). SELO "a conferir" que SOMA: o lancamento
-- tem outro numero de partes do que tinha ao ligar. Ligar uma parcela de contrato propoe e exige o contrato inteiro.
-- CORRECAO (3.5): situacao / mes do "em uso" de bem que ja' depreciou mudam com motivo; a previa mostra a acumulada antes x
-- depois e a gravacao vai a' `patrimonio_bem_trilha`.
-- AQUISICAO = valor sem lancamento ou estimativa (R$/ha × area), se marcado + soma dos vinculos 'soma'. Ninguem digita.
-- DEPRECIACAO (decisao 1, ajuste 2, D3, D4): linear, mensal, DERIVADA (nunca gravada), desde o mes de `em_uso_desde`, ate' o mes
-- anterior ao da baixa. A serie e' feita de SEGMENTOS; um segmento novo comeca no 1o mes, no mes de cada lancamento que entra
-- depois do "em uso" (D3) e no mes de cada mudanca de vida/residual (D4). No segmento que comeca em s:
--   A_ini = acumulada ate' s−1 (congelada) · R = max(vida_total_meses − meses ja' decorridos desde o "em uso", 1)
--   acumulada(s+j−1) = A_ini + round(max(base(s)·(1 − residual) − A_ini, 0) × min(j, R) ÷ R, 2) · quota = diferenca das acumuladas
-- Sem mudancas, isso e' exatamente round(depreciavel × min(meses, vida) ÷ vida, 2): trator 388.400 · 120 m · 20 % desde 03/2022 →
-- R$ 145.002,67 em 10/2026 (somar quotas arredondadas daria 145.002,48).
--
-- SEGURANCA (FUNCAO NOVA NASCE FECHADA): todas SECURITY DEFINER, search_path = pg_catalog, public; guarda `tenant_ok` do cliente do
-- registro (42501 "sem acesso a este registro", nunca vazio); REVOKE de PUBLIC e anon; GRANT a authenticated e service_role.
-- As internas (`_fn_patrimonio_*`) so' para service_role. Recusas com P0001 e frase pronta. Escrita sempre com `p_simular`
-- (padrao true = previa; nada gravado). Todo UPDATE com WHERE (pg_safeupdate).
-- Nenhum dado de cliente e' alterado por esta migration.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- 0. Internas ------------------------------------------------------------------------------------------------------------------
create or replace function public._fn_patrimonio_hoje()
returns date language sql stable set search_path = pg_catalog, public
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function public._fn_patrimonio_conta_investimento(p_plano_conta_id uuid)
returns boolean language sql stable set search_path = pg_catalog, public
as $$
  select coalesce((select p.macro_custo = 'Investimento na Fazenda' and coalesce(p.centro_custo, '') <> 'RH'
                     from public.financeiro_plano_contas p where p.id = p_plano_conta_id), false)
$$;

create or replace function public._fn_patrimonio_meses(p_de date, p_ate date)
returns integer language sql immutable set search_path = pg_catalog, public
as $$ select ((extract(year from p_ate) - extract(year from p_de)) * 12 + extract(month from p_ate) - extract(month from p_de))::int $$;

-- o bem do usuario: a guarda comum das escritas (42501 se nao existe ou nao e' do usuario)
create or replace function public._fn_patrimonio_bem_do_usuario(p_bem uuid)
returns public.patrimonio_bens language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare b public.patrimonio_bens%rowtype;
begin
  select * into b from public.patrimonio_bens where id = p_bem;
  if b.id is null or not coalesce(public.tenant_ok(b.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  return b;
end $$;

-- a data em que a COMPRA PARCELADA / CONSORCIO entra no bem (ajuste do Gabriel 30/10 19h): a data do contrato; sem ela, a
-- competencia da 1a parcela de principal viva
create or replace function public._fn_patrimonio_data_do_contrato(p_financiamento_id uuid)
returns date language sql stable security definer set search_path = pg_catalog, public
as $$
  select coalesce((select f.data_contrato from public.financiamentos f where f.id = p_financiamento_id),
                  (select min(l.data_competencia) from public.financeiro_lancamentos_v2 l
                    where l.financiamento_id = p_financiamento_id and l.origem_tipo = 'parcela_principal' and l.cancelado is not true))
$$;

-- os vinculos de um cliente (ou de um bem), com o estado de cada um. p_posicao: o que tem data depois dela conta como 'a_realizar'.
-- DATA: coalesce(competencia, pagamento) (3.6); parcela de principal de contrato de parcelamento/consorcio: a data do contrato.
-- 'soma' = realizado OU parcela de principal de contrato (prevista inclusive: o bem entra pelo valor total do contrato).
-- `selo`: o lancamento tem hoje outro numero de partes do que tinha ao ligar (segue somando; aparece "a conferir").
create or replace function public._fn_patrimonio_vinculos(p_cliente uuid, p_bem uuid default null, p_posicao date default null)
returns table (vinculo_id uuid, bem_id uuid, lancamento_id uuid, parte_ordem smallint, partes_total integer, estado text, motivo text,
               valor numeric, data date, status_transacao text, descricao text, favorecido_id uuid, plano_conta_id uuid,
               subcentro text, fazenda_id uuid, repetida boolean, repetida_confirmada boolean, ligado_em timestamptz,
               financiamento_id uuid, de_contrato boolean, selo text)
language sql stable security definer set search_path = pg_catalog, public
as $$
  select k.id, k.bem_id, k.lancamento_id, k.parte_ordem, v.partes_total, e.estado, e.motivo,
         case when e.estado = 'a_conferir' then null
              when v.tipo_operacao like '1%' then -abs(v.valor) else abs(v.valor) end,
         d.data, v.status_transacao, v.descricao, v.favorecido_id, v.plano_conta_id,
         v.subcentro, v.fazenda_id, coalesce(v.status_duplicidade = 'pendente', false), k.repetida_confirmada, k.ligado_em,
         v.financiamento_id, c.de_contrato,
         case when e.estado <> 'a_conferir' and v.partes_total is distinct from k.partes_total_ao_ligar::int
              then 'O lançamento foi dividido de outro jeito depois de ligado: confira a parte.' end
    from public.patrimonio_bem_lancamentos k
    left join public.vw_fin_classificacao_por_parte v
      on v.lancamento_id = k.lancamento_id and v.parte_ordem = k.parte_ordem and v.cliente_id = k.cliente_id
    cross join lateral (
      select coalesce(v.financiamento_id is not null and v.origem_tipo = 'parcela_principal'
               and exists (select 1 from public.financiamentos f where f.id = v.financiamento_id and f.natureza in ('parcelamento', 'consorcio')),
             false) as de_contrato
    ) c
    cross join lateral (
      select case when c.de_contrato then public._fn_patrimonio_data_do_contrato(v.financiamento_id)
                  else coalesce(v.data_competencia, v.data_pagamento) end as data
    ) d
    cross join lateral (
      select case
               when v.lancamento_id is null then 'a_conferir'
               when v.cancelado is true then 'a_conferir'
               when not public._fn_patrimonio_conta_investimento(v.plano_conta_id) then 'a_conferir'
               when (c.de_contrato or v.status_transacao = 'realizado')
                    and (p_posicao is null or d.data <= p_posicao) then 'soma'
               else 'a_realizar' end as estado,
             case
               when v.lancamento_id is null then 'A parte ligada não existe mais (o lançamento foi dividido de novo ou apagado).'
               when v.cancelado is true then 'O lançamento foi cancelado.'
               when not public._fn_patrimonio_conta_investimento(v.plano_conta_id) then 'A parte deixou de ser de Investimento.'
             end as motivo
    ) e
   where k.cliente_id = p_cliente and k.desligado_em is null and (p_bem is null or k.bem_id = p_bem)
$$;

-- a serie mensal da depreciacao (a regra do cabecalho). So' bens em uso/baixados de categoria que deprecia.
create or replace function public._fn_patrimonio_serie(p_cliente uuid, p_bem uuid, p_ate date)
returns table (bem_id uuid, mes date, base numeric, depreciavel numeric, quota numeric, acumulada numeric,
               vida_util_meses integer, residual_pct numeric)
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare
  b record; u date; fim date; m date; v_extra numeric;
  c_val numeric[]; c_mes date[]; p_des date[]; p_vid integer[]; p_res numeric[];
  v_base numeric; v_dep numeric; v_vida integer; v_resid numeric; a_prev numeric; a_ini numeric; a numeric; r integer; j integer;
  i integer; v_novo boolean;
begin
  for b in
    select x.* from public.patrimonio_bens x join public.patrimonio_categorias c on c.id = x.categoria_id
     where x.cliente_id = p_cliente and (p_bem is null or x.id = p_bem)
       and x.situacao in ('em_uso', 'baixado') and x.em_uso_desde is not null and c.deprecia
     order by x.id
  loop
    u := date_trunc('month', b.em_uso_desde)::date;
    fim := date_trunc('month', p_ate)::date;
    if b.baixado_em is not null then fim := least(fim, (date_trunc('month', b.baixado_em) - interval '1 month')::date); end if;
    continue when fim < u;

    v_extra := case b.origem_valor when 'sem_lancamento' then b.valor_sem_lancamento
                                   when 'estimativa' then round(b.estimativa_rs_ha * b.estimativa_area_ha, 2) else 0 end;
    select coalesce(array_agg(z.valor order by z.data), '{}'), coalesce(array_agg(greatest(u, date_trunc('month', z.data)::date) order by z.data), '{}')
      into c_val, c_mes
      from public._fn_patrimonio_vinculos(p_cliente, b.id, null) z where z.estado = 'soma';
    select coalesce(array_agg(q.vigente_desde order by q.vigente_desde), '{}'), coalesce(array_agg(q.vida_util_meses order by q.vigente_desde), '{}'),
           coalesce(array_agg(q.residual_pct order by q.vigente_desde), '{}')
      into p_des, p_vid, p_res
      from public.patrimonio_bem_parametros q where q.bem_id = b.id;
    continue when cardinality(p_des) = 0;

    a_prev := 0; m := u;
    while m <= fim loop
      v_novo := (m = u) or (m = any (c_mes) and m > u) or (m = any (p_des) and m > u);
      if v_novo then
        v_base := v_extra;
        for i in 1 .. coalesce(cardinality(c_val), 0) loop
          if c_mes[i] <= m then v_base := v_base + c_val[i]; end if;
        end loop;
        v_vida := p_vid[1]; v_resid := p_res[1];
        for i in 1 .. cardinality(p_des) loop
          if p_des[i] <= m then v_vida := p_vid[i]; v_resid := p_res[i]; end if;
        end loop;
        v_dep := round(v_base * (1 - v_resid / 100), 2);
        a_ini := a_prev; j := 0;
        r := case when v_vida is null then 1 else greatest(v_vida - public._fn_patrimonio_meses(u, m), 1) end;
      end if;
      j := j + 1;
      if v_vida is null then a := a_ini;
      else a := a_ini + round(greatest(v_dep - a_ini, 0) * least(j, r) / r, 2); end if;
      bem_id := b.id; mes := m; base := v_base; depreciavel := v_dep; quota := a - a_prev; acumulada := a;
      vida_util_meses := v_vida; residual_pct := v_resid;
      return next;
      a_prev := a;
      m := (m + interval '1 month')::date;
    end loop;
  end loop;
end $$;

revoke all on function public._fn_patrimonio_hoje() from public, anon, authenticated;
revoke all on function public._fn_patrimonio_conta_investimento(uuid) from public, anon, authenticated;
revoke all on function public._fn_patrimonio_meses(date, date) from public, anon, authenticated;
revoke all on function public._fn_patrimonio_bem_do_usuario(uuid) from public, anon, authenticated;
revoke all on function public._fn_patrimonio_vinculos(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public._fn_patrimonio_data_do_contrato(uuid) from public, anon, authenticated;
revoke all on function public._fn_patrimonio_serie(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public._fn_patrimonio_hoje() to service_role;
grant execute on function public._fn_patrimonio_conta_investimento(uuid) to service_role;
grant execute on function public._fn_patrimonio_meses(date, date) to service_role;
grant execute on function public._fn_patrimonio_bem_do_usuario(uuid) to service_role;
grant execute on function public._fn_patrimonio_vinculos(uuid, uuid, date) to service_role;
grant execute on function public._fn_patrimonio_data_do_contrato(uuid) to service_role;
grant execute on function public._fn_patrimonio_serie(uuid, uuid, date) to service_role;

-- 1. Leitura: a lista dos bens ------------------------------------------------------------------------------------------------
create or replace function public.fn_patrimonio_lista(p_cliente uuid, p_fazenda uuid default null, p_posicao date default null)
returns table (bem_id uuid, fazenda_id uuid, fazenda_codigo text, categoria_id uuid, categoria_codigo text, categoria_nome text,
               deprecia boolean, tem_mercado boolean, tem_pastos boolean, descricao text, marca text, modelo text, identificacao text,
               situacao text, em_uso_desde date, baixado_em date, atividade text, origem_valor text, valor_extra numeric,
               valor_lancamentos numeric, aquisicao numeric, a_realizar numeric, n_lancamentos integer, n_a_realizar integer, n_a_conferir integer,
               n_selo integer, n_repetidas integer, primeira_data date, vida_util_meses integer, residual_pct numeric, depreciacao_acumulada numeric,
               depreciacao_no_ano numeric, valor_contabil numeric, mercado_valor numeric, mercado_data date, mercado_base text,
               area_pastos_ha numeric, versao integer)
language plpgsql stable security definer set search_path = pg_catalog, public set plan_cache_mode = force_custom_plan
as $$
declare v_pos date := coalesce(p_posicao, public._fn_patrimonio_hoje());
begin
  if not coalesce(public.tenant_ok(p_cliente), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  return query
  with s as (select * from public._fn_patrimonio_serie(p_cliente, null, v_pos)),
  su as (select distinct on (s.bem_id) s.bem_id, s.acumulada from s order by s.bem_id, s.mes desc),
  sa as (select s.bem_id, sum(s.quota) q from s where extract(year from s.mes) = extract(year from v_pos) group by s.bem_id),
  k as (select * from public._fn_patrimonio_vinculos(p_cliente, null, v_pos)),
  ka as (select k.bem_id,
                sum(k.valor) filter (where k.estado = 'soma') soma,
                sum(k.valor) filter (where k.estado = 'a_realizar') arealizar,
                count(*) filter (where k.estado = 'soma')::int n_soma,
                count(*) filter (where k.estado = 'a_realizar')::int n_arealizar,
                count(*) filter (where k.estado = 'a_conferir')::int n_conferir,
                count(*) filter (where k.selo is not null)::int n_selo,
                count(*) filter (where k.repetida)::int n_rep,
                min(k.data) filter (where k.estado <> 'a_conferir') primeira
           from k group by k.bem_id),
  pv as (select distinct on (q.bem_id) q.bem_id, q.vida_util_meses, q.residual_pct
           from public.patrimonio_bem_parametros q
           join public.patrimonio_bens x on x.id = q.bem_id and x.cliente_id = p_cliente
          order by q.bem_id, (q.vigente_desde <= date_trunc('month', v_pos)::date) desc,
                   case when q.vigente_desde <= date_trunc('month', v_pos)::date then q.vigente_desde end desc nulls last, q.vigente_desde),
  av as (select distinct on (a.bem_id) a.bem_id, a.valor_total, a.data, a.base
           from public.patrimonio_avaliacoes a
          where a.cliente_id = p_cliente and a.cancelado_em is null and a.data <= v_pos
          order by a.bem_id, a.data desc, a.criado_em desc),
  pa as (select bp.bem_id, sum(bp.area_ha) area from public.patrimonio_bem_pastos bp
          where bp.cliente_id = p_cliente and bp.desligado_em is null group by bp.bem_id)
  select x.id, x.fazenda_id, f.codigo, c.id, c.codigo, c.nome, c.deprecia, c.tem_mercado, c.tem_pastos,
         x.descricao, x.marca, x.modelo, x.identificacao, x.situacao, x.em_uso_desde, x.baixado_em, x.atividade, x.origem_valor,
         e.extra, coalesce(ka.soma, 0), e.extra + coalesce(ka.soma, 0), coalesce(ka.arealizar, 0),
         coalesce(ka.n_soma, 0), coalesce(ka.n_arealizar, 0), coalesce(ka.n_conferir, 0), coalesce(ka.n_selo, 0), coalesce(ka.n_rep, 0),
         ka.primeira, pv.vida_util_meses, pv.residual_pct,
         coalesce(su.acumulada, 0), coalesce(sa.q, 0), e.extra + coalesce(ka.soma, 0) - coalesce(su.acumulada, 0),
         av.valor_total, av.data, av.base, pa.area, x.versao
    from public.patrimonio_bens x
    join public.patrimonio_categorias c on c.id = x.categoria_id
    join public.fazendas f on f.id = x.fazenda_id
    cross join lateral (select case x.origem_valor when 'sem_lancamento' then x.valor_sem_lancamento
                                                   when 'estimativa' then round(x.estimativa_rs_ha * x.estimativa_area_ha, 2)
                                                   else 0::numeric end as extra) e
    left join ka on ka.bem_id = x.id
    left join su on su.bem_id = x.id
    left join sa on sa.bem_id = x.id
    left join pv on pv.bem_id = x.id
    left join av on av.bem_id = x.id
    left join pa on pa.bem_id = x.id
   where x.cliente_id = p_cliente and (p_fazenda is null or x.fazenda_id = p_fazenda)
   order by coalesce(x.em_uso_desde, ka.primeira, x.criado_em::date), x.descricao, x.id;
end $$;

-- 2. Leitura: a depreciacao mes a mes (ou ano a ano) ----------------------------------------------------------------------------
create or replace function public.fn_patrimonio_depreciacao(p_cliente uuid, p_bem uuid default null, p_ate date default null,
                                                            p_agrupar text default 'mes')
returns table (bem_id uuid, periodo text, base numeric, depreciavel numeric, quota numeric, acumulada numeric, contabil numeric,
               vida_util_meses integer, residual_pct numeric, atividade text, fazenda_id uuid)
language plpgsql stable security definer set search_path = pg_catalog, public set plan_cache_mode = force_custom_plan
as $$
declare v_ate date := coalesce(p_ate, public._fn_patrimonio_hoje());
begin
  if not coalesce(public.tenant_ok(p_cliente), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if p_bem is not null and not exists (select 1 from public.patrimonio_bens x where x.id = p_bem and x.cliente_id = p_cliente) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if p_agrupar is null or p_agrupar not in ('mes', 'ano') then
    raise exception using errcode = '22023', message = 'agrupar invalido (mes | ano)';
  end if;
  if p_agrupar = 'mes' then
    return query
      select s.bem_id, to_char(s.mes, 'YYYY-MM'), s.base, s.depreciavel, s.quota, s.acumulada, s.base - s.acumulada,
             s.vida_util_meses, s.residual_pct, x.atividade, x.fazenda_id
        from public._fn_patrimonio_serie(p_cliente, p_bem, v_ate) s join public.patrimonio_bens x on x.id = s.bem_id
       order by s.bem_id, s.mes;
  else
    return query
      select distinct on (s.bem_id, extract(year from s.mes))
             s.bem_id, to_char(s.mes, 'YYYY'), s.base, s.depreciavel,
             sum(s.quota) over (partition by s.bem_id, extract(year from s.mes)), s.acumulada, s.base - s.acumulada,
             s.vida_util_meses, s.residual_pct, x.atividade, x.fazenda_id
        from public._fn_patrimonio_serie(p_cliente, p_bem, v_ate) s join public.patrimonio_bens x on x.id = s.bem_id
       order by s.bem_id, extract(year from s.mes), s.mes desc;
  end if;
end $$;

-- 3. Leitura: investimentos sem bem -------------------------------------------------------------------------------------------
-- Realizados (e as parcelas de principal vivas de contrato de parcelamento/consorcio, previstas inclusive), nao cancelados, de
-- conta de investimento (sem RH), sem vinculo vivo. Grupos ano · subcentro · fazenda; maquina,
-- implemento e veiculo (pela categoria sugerida) com valor >= p_corte_individual saem sozinhos. Repetida? (D8) = selo.
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
    select distinct on (o.ord) o.ord, c.id, c.codigo, c.nome
      from public.patrimonio_categorias c cross join lateral unnest(c.subcentros_sugeridos) o(ord)
     where c.ativo and (c.cliente_id is null or c.cliente_id = p_cliente)
     order by o.ord, (c.cliente_id is not null) desc, c.ordem
  ), lc as (
    select l.*, cat.id cat_id, cat.codigo cat_codigo, cat.nome cat_nome, f.codigo fazenda_codigo, fo.nome fornecedor,
           coalesce(cat.codigo in ('maquinas', 'implementos', 'veiculos') and l.valor >= coalesce(p_corte_individual, 0), false) individual
      from l
      left join cat on cat.ord = l.ordem_exibicao
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

-- 4. Escrita: criar / editar o bem --------------------------------------------------------------------------------------------
-- p_bem: id (nulo = criar) · versao (obrigatoria ao editar) · cliente_id (ao criar) · fazenda_id · categoria_id · descricao · marca ·
-- modelo · ano_fabricacao · identificacao · observacao · situacao ('em_formacao' | 'em_uso') · em_uso_desde · atividade ·
-- financiamento_id · origem_valor · valor_sem_lancamento · estimativa_rs_ha · estimativa_area_ha · area_ha · matricula · nirf ·
-- seguradora · apolice · seguro_vence_em · vida_util_meses · residual_pct.
-- Vida/residual: ao criar vem da categoria se nao vier; depois que o bem ja' depreciou num mes passado, mudam SO' pela
-- `fn_patrimonio_parametros_mudar` (vale deste mes em diante). A baixa e' de PR futuro. Situacao / mes do "em uso" de bem que ja'
-- depreciou: so' como CORRECAO, com `p_motivo` (3.5).
create or replace function public.fn_patrimonio_bem_salvar(p_bem jsonb, p_simular boolean default true, p_motivo text default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_id uuid := nullif(p_bem->>'id', '')::uuid;
  o public.patrimonio_bens%rowtype;
  n public.patrimonio_bens%rowtype;
  c public.patrimonio_categorias%rowtype;
  v_hoje date := public._fn_patrimonio_hoje();
  v_mes_atual date := date_trunc('month', public._fn_patrimonio_hoje())::date;
  v_vida integer; v_res numeric; v_ini public.patrimonio_bem_parametros%rowtype; v_ult public.patrimonio_bem_parametros%rowtype;
  v_ja_deprecia boolean := false; v_corrige boolean := false; v_acum_antes numeric; v_acum_depois numeric; v_ok boolean := false;
  v_avisos jsonb := '[]'::jsonb;
begin
  if v_id is not null then
    o := public._fn_patrimonio_bem_do_usuario(v_id);
    if nullif(p_bem->>'versao', '')::int is distinct from o.versao then
      raise exception using errcode = '40001', message = 'Este bem foi alterado por outra pessoa. Feche e abra de novo.';
    end if;
    n := o;
    v_ja_deprecia := o.situacao <> 'em_formacao' and date_trunc('month', o.em_uso_desde)::date < v_mes_atual;
  else
    n.id := gen_random_uuid();
    n.cliente_id := nullif(p_bem->>'cliente_id', '')::uuid;
    if n.cliente_id is null or not coalesce(public.tenant_ok(n.cliente_id), false) then
      raise exception using errcode = '42501', message = 'sem acesso a este registro';
    end if;
    n.versao := 0;
  end if;

  n.fazenda_id := nullif(p_bem->>'fazenda_id', '')::uuid;
  n.categoria_id := nullif(p_bem->>'categoria_id', '')::uuid;
  n.descricao := nullif(btrim(coalesce(p_bem->>'descricao', '')), '');
  n.marca := nullif(btrim(coalesce(p_bem->>'marca', '')), '');
  n.modelo := nullif(btrim(coalesce(p_bem->>'modelo', '')), '');
  n.ano_fabricacao := nullif(p_bem->>'ano_fabricacao', '')::int;
  n.identificacao := nullif(btrim(coalesce(p_bem->>'identificacao', '')), '');
  n.observacao := nullif(btrim(coalesce(p_bem->>'observacao', '')), '');
  n.situacao := coalesce(nullif(p_bem->>'situacao', ''), 'em_formacao');
  n.em_uso_desde := nullif(p_bem->>'em_uso_desde', '')::date;
  n.atividade := nullif(p_bem->>'atividade', '');
  n.financiamento_id := nullif(p_bem->>'financiamento_id', '')::uuid;
  n.origem_valor := coalesce(nullif(p_bem->>'origem_valor', ''), 'lancamentos');
  n.valor_sem_lancamento := case when n.origem_valor = 'sem_lancamento' then nullif(p_bem->>'valor_sem_lancamento', '')::numeric end;
  n.estimativa_rs_ha := case when n.origem_valor = 'estimativa' then nullif(p_bem->>'estimativa_rs_ha', '')::numeric end;
  n.estimativa_area_ha := case when n.origem_valor = 'estimativa' then nullif(p_bem->>'estimativa_area_ha', '')::numeric end;
  n.area_ha := nullif(p_bem->>'area_ha', '')::numeric;
  n.matricula := nullif(btrim(coalesce(p_bem->>'matricula', '')), '');
  n.nirf := nullif(btrim(coalesce(p_bem->>'nirf', '')), '');
  n.seguradora := nullif(btrim(coalesce(p_bem->>'seguradora', '')), '');
  n.apolice := nullif(btrim(coalesce(p_bem->>'apolice', '')), '');
  n.seguro_vence_em := nullif(p_bem->>'seguro_vence_em', '')::date;

  -- recusas (frase pronta, nada gravado)
  if n.fazenda_id is null or not exists (select 1 from public.fazendas f where f.id = n.fazenda_id and f.cliente_id = n.cliente_id) then
    raise exception using errcode = 'P0001', message = 'Escolha a fazenda do bem.';
  end if;
  select * into c from public.patrimonio_categorias x
   where x.id = n.categoria_id and x.ativo and (x.cliente_id is null or x.cliente_id = n.cliente_id);
  if c.id is null then raise exception using errcode = 'P0001', message = 'Escolha a categoria do bem.'; end if;
  if n.descricao is null then raise exception using errcode = 'P0001', message = 'Informe a descrição do bem.'; end if;
  if n.atividade is null or n.atividade not in ('pecuaria', 'lavoura', 'compartilhado') then
    raise exception using errcode = 'P0001', message = 'Escolha a atividade que usa o bem (Pecuária, Lavoura ou Compartilhado).';
  end if;
  if n.situacao = 'baixado' or (o.id is not null and o.situacao = 'baixado') then
    raise exception using errcode = 'P0001', message = 'A baixa do bem ainda não se faz por aqui.';
  end if;
  if n.situacao not in ('em_formacao', 'em_uso') then raise exception using errcode = 'P0001', message = 'Situação inválida.'; end if;
  if n.situacao = 'em_uso' and n.em_uso_desde is null then
    raise exception using errcode = 'P0001', message = 'Informe desde quando o bem está em uso.';
  end if;
  if n.em_uso_desde is not null and n.em_uso_desde > v_hoje then
    raise exception using errcode = 'P0001', message = 'A data de "em uso desde" não pode ser no futuro.';
  end if;
  if n.situacao = 'em_formacao' then n.em_uso_desde := null; end if;
  -- CORRECAO (3.5): com motivo, a previa mostra a acumulada antes x depois e a gravacao vai a' trilha
  v_corrige := v_ja_deprecia and (n.situacao <> o.situacao
                 or date_trunc('month', n.em_uso_desde) is distinct from date_trunc('month', o.em_uso_desde));
  if v_corrige and nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception using errcode = 'P0001', message = format(
      'O bem já deprecia desde %s: para corrigir a situação ou o "em uso desde", informe o motivo.', to_char(o.em_uso_desde, 'MM/YYYY'));
  end if;
  if n.origem_valor not in ('lancamentos', 'sem_lancamento', 'estimativa') then
    raise exception using errcode = 'P0001', message = 'Origem do valor inválida.';
  end if;
  if n.origem_valor = 'sem_lancamento' and coalesce(n.valor_sem_lancamento, 0) <= 0 then
    raise exception using errcode = 'P0001', message = 'Informe o valor do bem sem lançamento.';
  end if;
  if n.origem_valor = 'estimativa' and (coalesce(n.estimativa_rs_ha, 0) <= 0 or coalesce(n.estimativa_area_ha, 0) <= 0) then
    raise exception using errcode = 'P0001', message = 'Informe o R$/ha e a área da estimativa.';
  end if;
  if n.financiamento_id is not null
     and not exists (select 1 from public.financiamentos f where f.id = n.financiamento_id and f.cliente_id = n.cliente_id) then
    raise exception using errcode = 'P0001', message = 'O financiamento escolhido não é deste cliente.';
  end if;
  if o.id is not null and o.categoria_id <> n.categoria_id then
    if not c.tem_pastos and exists (select 1 from public.patrimonio_bem_pastos bp where bp.bem_id = o.id and bp.desligado_em is null) then
      raise exception using errcode = 'P0001', message = 'Esta categoria não tem pastos: desmarque os pastos do bem antes.';
    end if;
    if not c.tem_mercado and exists (select 1 from public.patrimonio_avaliacoes a where a.bem_id = o.id and a.cancelado_em is null) then
      raise exception using errcode = 'P0001', message = 'Esta categoria não tem valor de mercado: cancele as avaliações do bem antes.';
    end if;
    if v_ja_deprecia and (select x.deprecia from public.patrimonio_categorias x where x.id = o.categoria_id) <> c.deprecia then
      raise exception using errcode = 'P0001', message = 'O bem já deprecia: não troca para uma categoria que deprecia de outro jeito.';
    end if;
  end if;

  -- vida / residual: antes de depreciar num mes passado, a linha inicial acompanha o formulario; depois, so' pela mudanca com vigencia
  v_vida := case when p_bem ? 'vida_util_meses' then nullif(p_bem->>'vida_util_meses', '')::int end;
  v_res := case when p_bem ? 'residual_pct' then nullif(p_bem->>'residual_pct', '')::numeric end;
  if o.id is not null then
    select * into v_ini from public.patrimonio_bem_parametros q where q.bem_id = o.id order by q.vigente_desde limit 1;
    select * into v_ult from public.patrimonio_bem_parametros q where q.bem_id = o.id order by q.vigente_desde desc limit 1;
  end if;
  if v_ja_deprecia then
    if (p_bem ? 'vida_util_meses' and v_vida is distinct from v_ult.vida_util_meses)
       or (p_bem ? 'residual_pct' and v_res is distinct from v_ult.residual_pct) then
      raise exception using errcode = 'P0001', message = 'O bem já deprecia: mude a vida útil ou o residual por "Mudar vida útil" (vale deste mês em diante).';
    end if;
    v_vida := v_ult.vida_util_meses; v_res := v_ult.residual_pct;
  elsif not c.deprecia then
    v_vida := null; v_res := 0;
  else
    v_vida := coalesce(v_vida, v_ini.vida_util_meses, round(c.vida_util_anos * 12)::int);
    v_res := coalesce(v_res, v_ini.residual_pct, c.residual_pct);
    if v_vida is null or v_vida <= 0 then raise exception using errcode = 'P0001', message = 'Informe a vida útil em meses.'; end if;
  end if;
  if v_res < 0 or v_res >= 100 then raise exception using errcode = 'P0001', message = 'O residual vai de 0 a 99,99 %.'; end if;

  if c.tem_pastos is false and n.origem_valor = 'estimativa' then
    v_avisos := v_avisos || jsonb_build_array('Estimativa por hectare é o caso do pasto antigo; confira se é isso mesmo.');
  end if;

  if v_corrige then
    v_acum_antes := coalesce((select s.acumulada from public._fn_patrimonio_serie(o.cliente_id, o.id, v_hoje) s order by s.mes desc limit 1), 0);
  end if;
  if p_simular then
    if v_corrige then
      begin
        update public.patrimonio_bens set situacao = n.situacao, em_uso_desde = n.em_uso_desde where id = o.id;
        v_acum_depois := coalesce((select s.acumulada from public._fn_patrimonio_serie(o.cliente_id, o.id, v_hoje) s order by s.mes desc limit 1), 0);
        v_ok := true;
        raise exception using errcode = 'P0001', message = 'desfaz a previa';
      exception when others then
        if not v_ok then raise; end if;
      end;
    end if;
    return jsonb_build_object('ok', true, 'simulado', true, 'id', v_id, 'novo', v_id is null, 'avisos', v_avisos,
      'correcao', case when v_corrige then jsonb_build_object(
        'de', jsonb_build_object('situacao', o.situacao, 'em_uso_desde', o.em_uso_desde),
        'para', jsonb_build_object('situacao', n.situacao, 'em_uso_desde', n.em_uso_desde),
        'acumulada_antes', v_acum_antes, 'acumulada_depois', v_acum_depois) end,
      'categoria', jsonb_build_object('id', c.id, 'codigo', c.codigo, 'nome', c.nome, 'deprecia', c.deprecia),
      'vida_util_meses', v_vida, 'residual_pct', v_res);
  end if;

  if v_id is null then
    insert into public.patrimonio_bens (id, cliente_id, fazenda_id, categoria_id, descricao, marca, modelo, ano_fabricacao, identificacao,
      observacao, situacao, em_uso_desde, atividade, financiamento_id, origem_valor, valor_sem_lancamento, estimativa_rs_ha,
      estimativa_area_ha, area_ha, matricula, nirf, seguradora, apolice, seguro_vence_em, versao, criado_por)
    values (n.id, n.cliente_id, n.fazenda_id, n.categoria_id, n.descricao, n.marca, n.modelo, n.ano_fabricacao, n.identificacao,
      n.observacao, n.situacao, n.em_uso_desde, n.atividade, n.financiamento_id, n.origem_valor, n.valor_sem_lancamento,
      n.estimativa_rs_ha, n.estimativa_area_ha, n.area_ha, n.matricula, n.nirf, n.seguradora, n.apolice, n.seguro_vence_em, 1, auth.uid());
    insert into public.patrimonio_bem_parametros (cliente_id, bem_id, vigente_desde, vida_util_meses, residual_pct, motivo, criado_por)
    values (n.cliente_id, n.id, date_trunc('month', coalesce(n.em_uso_desde, v_hoje))::date, v_vida, v_res, 'inicial (categoria)', auth.uid());
    return jsonb_build_object('ok', true, 'simulado', false, 'id', n.id, 'versao', 1);
  end if;

  update public.patrimonio_bens set
    fazenda_id = n.fazenda_id, categoria_id = n.categoria_id, descricao = n.descricao, marca = n.marca, modelo = n.modelo,
    ano_fabricacao = n.ano_fabricacao, identificacao = n.identificacao, observacao = n.observacao, situacao = n.situacao,
    em_uso_desde = n.em_uso_desde, atividade = n.atividade, financiamento_id = n.financiamento_id, origem_valor = n.origem_valor,
    valor_sem_lancamento = n.valor_sem_lancamento, estimativa_rs_ha = n.estimativa_rs_ha, estimativa_area_ha = n.estimativa_area_ha,
    area_ha = n.area_ha, matricula = n.matricula, nirf = n.nirf, seguradora = n.seguradora, apolice = n.apolice,
    seguro_vence_em = n.seguro_vence_em, versao = o.versao + 1, alterado_em = now(), alterado_por = auth.uid()
   where id = o.id and versao = o.versao;
  if not found then raise exception using errcode = '40001', message = 'Este bem foi alterado por outra pessoa. Feche e abra de novo.'; end if;
  if v_corrige then
    v_acum_depois := coalesce((select s.acumulada from public._fn_patrimonio_serie(o.cliente_id, o.id, v_hoje) s order by s.mes desc limit 1), 0);
    insert into public.patrimonio_bem_trilha (cliente_id, bem_id, acao, antes, depois, motivo, por)
    values (o.cliente_id, o.id, 'correcao_em_uso',
            jsonb_build_object('situacao', o.situacao, 'em_uso_desde', o.em_uso_desde, 'acumulada', v_acum_antes),
            jsonb_build_object('situacao', n.situacao, 'em_uso_desde', n.em_uso_desde, 'acumulada', v_acum_depois),
            btrim(p_motivo), auth.uid());
  end if;
  -- antes de depreciar num mes passado, a linha inicial acompanha o formulario (nenhum mes passado muda)
  if not v_ja_deprecia then
    update public.patrimonio_bem_parametros set vida_util_meses = v_vida, residual_pct = v_res,
           vigente_desde = date_trunc('month', coalesce(n.em_uso_desde, v_hoje))::date
     where id = v_ini.id
       and not exists (select 1 from public.patrimonio_bem_parametros q2 where q2.bem_id = o.id and q2.id <> v_ini.id
                        and q2.vigente_desde = date_trunc('month', coalesce(n.em_uso_desde, v_hoje))::date);
  end if;
  return jsonb_build_object('ok', true, 'simulado', false, 'id', o.id, 'versao', o.versao + 1);
end $$;

-- 5. Escrita: mudar vida util / residual (D4) ---------------------------------------------------------------------------------
-- So' deste mes em diante (o mes informado e' arredondado para o 1o dia; antes do mes atual = recusa). A previa devolve a quota do
-- mes da vigencia antes e depois (calculada num bloco que se desfaz).
create or replace function public.fn_patrimonio_parametros_mudar(p_bem uuid, p_vigente_desde date, p_vida_util_meses integer,
                                                                 p_residual_pct numeric, p_motivo text, p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  b public.patrimonio_bens%rowtype := public._fn_patrimonio_bem_do_usuario(p_bem);
  v_m date := date_trunc('month', p_vigente_desde)::date;
  v_mes_atual date := date_trunc('month', public._fn_patrimonio_hoje())::date;
  v_antes numeric; v_depois numeric; v_acum_antes numeric; v_acum_depois numeric; v_ok boolean := false;
begin
  if not (select c.deprecia from public.patrimonio_categorias c where c.id = b.categoria_id) then
    raise exception using errcode = 'P0001', message = 'Esta categoria não deprecia.';
  end if;
  if b.situacao <> 'em_uso' then
    raise exception using errcode = 'P0001', message = 'Só o bem em uso muda a vida útil por aqui (em formação: edite o bem).';
  end if;
  if v_m is null or v_m < v_mes_atual then
    raise exception using errcode = 'P0001', message = 'A mudança vale deste mês em diante: escolha o mês atual ou um mês futuro.';
  end if;
  if p_vida_util_meses is null or p_vida_util_meses <= 0 then raise exception using errcode = 'P0001', message = 'Informe a vida útil em meses.'; end if;
  if p_residual_pct is null or p_residual_pct < 0 or p_residual_pct >= 100 then
    raise exception using errcode = 'P0001', message = 'O residual vai de 0 a 99,99 %.';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception using errcode = 'P0001', message = 'Informe o motivo da mudança.'; end if;

  select s.quota, s.acumulada into v_antes, v_acum_antes from public._fn_patrimonio_serie(b.cliente_id, b.id, v_m) s where s.mes = v_m;

  if p_simular then
    begin
      insert into public.patrimonio_bem_parametros (cliente_id, bem_id, vigente_desde, vida_util_meses, residual_pct, motivo, criado_por)
      values (b.cliente_id, b.id, v_m, p_vida_util_meses, p_residual_pct, p_motivo, auth.uid())
      on conflict (bem_id, vigente_desde) do update set vida_util_meses = excluded.vida_util_meses, residual_pct = excluded.residual_pct;
      select s.quota, s.acumulada into v_depois, v_acum_depois from public._fn_patrimonio_serie(b.cliente_id, b.id, v_m) s where s.mes = v_m;
      v_ok := true;
      raise exception using errcode = 'P0001', message = 'desfaz a previa';
    exception when others then
      if not v_ok then raise; end if;
    end;
    return jsonb_build_object('ok', true, 'simulado', true, 'vigente_desde', v_m, 'quota_antes', v_antes, 'quota_depois', v_depois,
      'acumulada_antes', v_acum_antes, 'acumulada_depois', v_acum_depois);
  end if;

  insert into public.patrimonio_bem_parametros (cliente_id, bem_id, vigente_desde, vida_util_meses, residual_pct, motivo, criado_por)
  values (b.cliente_id, b.id, v_m, p_vida_util_meses, p_residual_pct, btrim(p_motivo), auth.uid())
  on conflict (bem_id, vigente_desde) do update set vida_util_meses = excluded.vida_util_meses, residual_pct = excluded.residual_pct,
     motivo = excluded.motivo, criado_por = excluded.criado_por, criado_em = now();
  update public.patrimonio_bens set versao = versao + 1, alterado_em = now(), alterado_por = auth.uid() where id = b.id;
  return jsonb_build_object('ok', true, 'simulado', false, 'vigente_desde', v_m);
end $$;

-- 6. Escrita: ligar lancamentos (D1, D2, D8, ajuste 3, compra parcelada/consorcio) --------------------------------------------
-- p_itens: [{lancamento_id, parte_ordem}] (parte_ordem omitida = 1). Tudo ou nada. A previa diz, item a item, 'liga',
-- 'ja_neste_bem' ou 'recusa' (com o motivo) e marca 'repetida' / 'a_realizar' / 'outra_fazenda' / 'de_contrato'.
-- COMPRA PARCELADA / CONSORCIO: ligar uma parcela de principal de contrato de parcelamento/consorcio PROPOE todas as parcelas de
-- principal vivas daquele contrato (`contratos[].faltam`); gravar exige o contrato inteiro (as que ja' estao neste bem contam).
create or replace function public.fn_patrimonio_bem_ligar(p_bem uuid, p_itens jsonb, p_confirmar_repetidas boolean default false,
                                                          p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  b public.patrimonio_bens%rowtype := public._fn_patrimonio_bem_do_usuario(p_bem);
  it jsonb; v record; v_lanc uuid; v_ord smallint; v_sit text; v_mot text; v_outro text; v_natureza text; v_contrato boolean;
  v_res jsonb := '[]'::jsonb; v_n_rec int := 0; v_n_rep int := 0; v_n_liga int := 0; v_soma numeric := 0; v_primeiro text;
  v_fin uuid; v_desc text; v_np int; v_vt numeric; v_faltam jsonb; v_nf int; v_n_falta int := 0; v_msg_falta text;
  v_contratos jsonb := '[]'::jsonb;
begin
  if b.situacao = 'baixado' then raise exception using errcode = 'P0001', message = 'Bem baixado não recebe lançamento.'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception using errcode = 'P0001', message = 'Escolha ao menos um lançamento.';
  end if;
  if (select count(*) from jsonb_array_elements(p_itens)) <> (select count(distinct (x->>'lancamento_id', coalesce(nullif(x->>'parte_ordem', ''), '1')))
                                                              from jsonb_array_elements(p_itens) x) then
    raise exception using errcode = 'P0001', message = 'Um lançamento aparece duas vezes.';
  end if;

  for it in select * from jsonb_array_elements(p_itens) loop
    v_lanc := null; v_ord := null; v_sit := 'liga'; v_mot := null;
    begin
      v_lanc := nullif(it->>'lancamento_id', '')::uuid;
      v_ord := coalesce(nullif(it->>'parte_ordem', '')::smallint, 1);
    exception when others then v_lanc := null;
    end;
    select x.* into v from public.vw_fin_classificacao_por_parte x
     where x.lancamento_id = v_lanc and x.parte_ordem = v_ord and x.cliente_id = b.cliente_id;
    v_natureza := null; v_outro := null; v_contrato := false;
    if v_lanc is null then v_sit := 'recusa'; v_mot := 'Item inválido.';
    elsif v.lancamento_id is null then v_sit := 'recusa'; v_mot := 'Lançamento não encontrado neste cliente.';
    elsif v.cancelado is true then v_sit := 'recusa'; v_mot := 'Lançamento cancelado não se liga a bem.';
    elsif v.plano_conta_id is null then v_sit := 'recusa'; v_mot := 'Lançamento sem classificação não se liga a bem.';
    elsif not public._fn_patrimonio_conta_investimento(v.plano_conta_id) then
      v_sit := 'recusa'; v_mot := 'Só lançamento de Investimento (fora RH) se liga a bem.';
    elsif coalesce(v.origem_tipo, '') in ('financiamento_captacao', 'parcela_juros') then
      v_sit := 'recusa'; v_mot := 'Captação e juros de financiamento não são custo do bem.';
    else
      if v.financiamento_id is not null then
        select f.natureza into v_natureza from public.financiamentos f where f.id = v.financiamento_id;
      end if;
      if v.financiamento_id is not null and coalesce(v_natureza, '') not in ('parcelamento', 'consorcio') then
        v_sit := 'recusa'; v_mot := 'Parcela de financiamento é pagamento da dívida: o bem é o lançamento da compra.';
      else
        v_contrato := v.financiamento_id is not null and v.origem_tipo = 'parcela_principal';
        select x.descricao into v_outro from public.patrimonio_bem_lancamentos k join public.patrimonio_bens x on x.id = k.bem_id
         where k.lancamento_id = v_lanc and k.parte_ordem = v_ord and k.desligado_em is null and k.bem_id <> b.id;
        if v_outro is not null then v_sit := 'recusa'; v_mot := format('Já está ligado ao bem «%s».', v_outro);
        elsif exists (select 1 from public.patrimonio_bem_lancamentos k
                       where k.lancamento_id = v_lanc and k.parte_ordem = v_ord and k.desligado_em is null and k.bem_id = b.id) then
          v_sit := 'ja_neste_bem';
        end if;
      end if;
    end if;
    if v_sit = 'recusa' then v_n_rec := v_n_rec + 1; v_primeiro := coalesce(v_primeiro, v_mot); end if;
    if v_sit = 'liga' then
      v_n_liga := v_n_liga + 1;
      if coalesce(v.status_duplicidade = 'pendente', false) then v_n_rep := v_n_rep + 1; end if;
      if v.status_transacao = 'realizado' or v_contrato then
        v_soma := v_soma + case when v.tipo_operacao like '1%' then -abs(v.valor) else abs(v.valor) end;
      end if;
    end if;
    v_res := v_res || jsonb_build_array(jsonb_build_object(
      'lancamento_id', v_lanc, 'parte_ordem', v_ord, 'partes_total', v.partes_total, 'situacao', v_sit, 'motivo', v_mot,
      'repetida', coalesce(v.status_duplicidade = 'pendente', false),
      'a_realizar', v.lancamento_id is not null and v.status_transacao is distinct from 'realizado' and not v_contrato,
      'outra_fazenda', v.fazenda_id is not null and v.fazenda_id <> b.fazenda_id,
      'de_contrato', v_contrato, 'financiamento_id', case when v_contrato then v.financiamento_id end,
      'valor', case when v.lancamento_id is null then null when v.tipo_operacao like '1%' then -abs(v.valor) else abs(v.valor) end,
      'data', case when v_contrato then public._fn_patrimonio_data_do_contrato(v.financiamento_id)
                   else coalesce(v.data_competencia, v.data_pagamento) end,
      'descricao', v.descricao));
  end loop;

  -- o contrato inteiro: as parcelas de principal vivas de cada contrato tocado
  for v_fin in select distinct (e->>'financiamento_id')::uuid from jsonb_array_elements(v_res) e
                where (e->>'de_contrato')::boolean and e->>'situacao' in ('liga', 'ja_neste_bem') loop
    select f.descricao into v_desc from public.financiamentos f where f.id = v_fin;
    select count(*), coalesce(sum(abs(x.valor)), 0) into v_np, v_vt
      from public.vw_fin_classificacao_por_parte x
     where x.cliente_id = b.cliente_id and x.financiamento_id = v_fin and x.origem_tipo = 'parcela_principal' and x.cancelado is not true
       and public._fn_patrimonio_conta_investimento(x.plano_conta_id);
    select coalesce(jsonb_agg(jsonb_build_object('lancamento_id', x.lancamento_id, 'parte_ordem', x.parte_ordem, 'valor', abs(x.valor),
                    'data', coalesce(x.data_competencia, x.data_pagamento), 'status_transacao', x.status_transacao)
                    order by x.data_competencia, x.lancamento_id), '[]'::jsonb), count(*)
      into v_faltam, v_nf
      from public.vw_fin_classificacao_por_parte x
     where x.cliente_id = b.cliente_id and x.financiamento_id = v_fin and x.origem_tipo = 'parcela_principal' and x.cancelado is not true
       and public._fn_patrimonio_conta_investimento(x.plano_conta_id)
       and not exists (select 1 from jsonb_array_elements(v_res) e2
                        where (e2->>'lancamento_id')::uuid = x.lancamento_id and (e2->>'parte_ordem')::int = x.parte_ordem)
       and not exists (select 1 from public.patrimonio_bem_lancamentos k
                        where k.bem_id = b.id and k.desligado_em is null and k.lancamento_id = x.lancamento_id and k.parte_ordem = x.parte_ordem);
    v_contratos := v_contratos || jsonb_build_array(jsonb_build_object('financiamento_id', v_fin, 'descricao', v_desc,
      'data_da_compra', public._fn_patrimonio_data_do_contrato(v_fin), 'n_parcelas', v_np, 'valor_total', v_vt,
      'n_faltam', v_nf, 'faltam', v_faltam));
    if v_nf > 0 then
      v_n_falta := v_n_falta + v_nf;
      v_msg_falta := coalesce(v_msg_falta, format('A compra «%s» tem %s parcelas: ligue todas juntas (faltam %s).', v_desc, v_np, v_nf));
    end if;
  end loop;

  if p_simular then
    return jsonb_build_object('ok', v_n_rec = 0 and v_n_falta = 0, 'simulado', true, 'itens', v_res, 'contratos', v_contratos,
      'n_ligar', v_n_liga, 'n_recusas', v_n_rec, 'n_repetidas', v_n_rep, 'soma_aquisicao', v_soma);
  end if;
  if v_n_rec > 0 then
    raise exception using errcode = 'P0001', message = case when v_n_rec = 1 then v_primeiro
      else format('%s lançamentos não se ligam (o primeiro: %s). Nada foi ligado.', v_n_rec, v_primeiro) end;
  end if;
  if v_n_falta > 0 then raise exception using errcode = 'P0001', message = v_msg_falta; end if;
  if v_n_rep > 0 and not coalesce(p_confirmar_repetidas, false) then
    raise exception using errcode = 'P0001', message = format(
      '%s lançamento(s) marcado(s) como possível repetição: confirme para ligar.', v_n_rep);
  end if;
  begin
    insert into public.patrimonio_bem_lancamentos (cliente_id, bem_id, lancamento_id, parte_ordem, partes_total_ao_ligar, ligado_por,
                                                   repetida_confirmada)
    select b.cliente_id, b.id, (e->>'lancamento_id')::uuid, (e->>'parte_ordem')::smallint, coalesce((e->>'partes_total')::smallint, 1),
           auth.uid(), (e->>'repetida')::boolean
      from jsonb_array_elements(v_res) e where e->>'situacao' = 'liga';
  exception when unique_violation then
    raise exception using errcode = 'P0001', message = 'Outra pessoa ligou um destes lançamentos agora. Recarregue e tente de novo.';
  end;
  update public.patrimonio_bens set versao = versao + 1, alterado_em = now(), alterado_por = auth.uid() where id = b.id;
  return jsonb_build_object('ok', true, 'simulado', false, 'n_ligados', v_n_liga, 'soma_aquisicao', v_soma);
end $$;

-- 6b. Leitura: os lancamentos ligados a um bem (a aba Lancamentos do modal; o selo e o "a conferir" vem daqui)
create or replace function public.fn_patrimonio_bem_lancamentos(p_bem uuid)
returns table (vinculo_id uuid, lancamento_id uuid, parte_ordem smallint, partes_total integer, estado text, motivo text, selo text,
               valor numeric, data date, status_transacao text, descricao text, favorecido_id uuid, fornecedor text, subcentro text,
               fazenda_id uuid, repetida boolean, repetida_confirmada boolean, financiamento_id uuid, de_contrato boolean,
               ligado_em timestamptz)
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare b public.patrimonio_bens%rowtype := public._fn_patrimonio_bem_do_usuario(p_bem);
begin
  return query
    select z.vinculo_id, z.lancamento_id, z.parte_ordem, z.partes_total, z.estado, z.motivo, z.selo, z.valor, z.data, z.status_transacao,
           z.descricao, z.favorecido_id, fo.nome, z.subcentro, z.fazenda_id, z.repetida, z.repetida_confirmada, z.financiamento_id,
           z.de_contrato, z.ligado_em
      from public._fn_patrimonio_vinculos(b.cliente_id, b.id, null) z
      left join public.financeiro_fornecedores fo on fo.id = z.favorecido_id and fo.cliente_id = b.cliente_id
     order by z.data, z.lancamento_id, z.parte_ordem;
end $$;

-- 7. Escrita: desligar (o gesto contrario) ------------------------------------------------------------------------------------
create or replace function public.fn_patrimonio_bem_desligar(p_bem uuid, p_itens jsonb, p_motivo text, p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  b public.patrimonio_bens%rowtype := public._fn_patrimonio_bem_do_usuario(p_bem);
  v_n int; v_validos int;
begin
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception using errcode = 'P0001', message = 'Informe o motivo.'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception using errcode = 'P0001', message = 'Escolha ao menos um lançamento.';
  end if;
  v_n := jsonb_array_length(p_itens);
  select count(*) into v_validos
    from jsonb_array_elements(p_itens) e
    join public.patrimonio_bem_lancamentos k
      on k.bem_id = b.id and k.desligado_em is null
     and k.lancamento_id = nullif(e->>'lancamento_id', '')::uuid and k.parte_ordem = coalesce(nullif(e->>'parte_ordem', '')::smallint, 1);
  if v_validos <> v_n then
    raise exception using errcode = 'P0001', message = 'Algum lançamento escolhido não está ligado a este bem. Nada foi desligado.';
  end if;
  if p_simular then return jsonb_build_object('ok', true, 'simulado', true, 'n_desligar', v_n); end if;
  update public.patrimonio_bem_lancamentos k set desligado_em = now(), desligado_por = auth.uid(), desligado_motivo = btrim(p_motivo)
    from jsonb_array_elements(p_itens) e
   where k.bem_id = b.id and k.desligado_em is null
     and k.lancamento_id = nullif(e->>'lancamento_id', '')::uuid and k.parte_ordem = coalesce(nullif(e->>'parte_ordem', '')::smallint, 1);
  update public.patrimonio_bens set versao = versao + 1, alterado_em = now(), alterado_por = auth.uid() where id = b.id;
  return jsonb_build_object('ok', true, 'simulado', false, 'n_desligados', v_n);
end $$;

-- 8. Escrita: os pastos do bem (D7) -------------------------------------------------------------------------------------------
-- p_pastos = o conjunto INTEIRO marcado: [{pasto_id, area_ha}]. Sai o que nao veio (desligado com motivo), entra o novo (so' pasto
-- ativo da fazenda do bem), muda a area do que ja' estava. Sem area = recusa (o campo fica vermelho na tela).
create or replace function public.fn_patrimonio_bem_pastos_salvar(p_bem uuid, p_pastos jsonb, p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  b public.patrimonio_bens%rowtype := public._fn_patrimonio_bem_do_usuario(p_bem);
  e jsonb; ps public.pastos%rowtype; v_pasto uuid; v_area numeric; v_vivo boolean; v_area_total numeric := 0;
  v_aquis numeric; v_res jsonb := '[]'::jsonb;
begin
  if not (select c.tem_pastos from public.patrimonio_categorias c where c.id = b.categoria_id) then
    raise exception using errcode = 'P0001', message = 'Esta categoria não se liga a pastos.';
  end if;
  if p_pastos is null or jsonb_typeof(p_pastos) <> 'array' then raise exception using errcode = 'P0001', message = 'Lista de pastos inválida.'; end if;
  if (select count(*) from jsonb_array_elements(p_pastos)) <> (select count(distinct x->>'pasto_id') from jsonb_array_elements(p_pastos) x) then
    raise exception using errcode = 'P0001', message = 'Um pasto aparece duas vezes.';
  end if;
  for e in select * from jsonb_array_elements(p_pastos) loop
    v_pasto := nullif(e->>'pasto_id', '')::uuid;
    v_area := nullif(e->>'area_ha', '')::numeric;
    select * into ps from public.pastos p where p.id = v_pasto;
    if ps.id is null or ps.fazenda_id <> b.fazenda_id then
      raise exception using errcode = 'P0001', message = 'Só pastos da fazenda do bem.';
    end if;
    v_vivo := exists (select 1 from public.patrimonio_bem_pastos bp where bp.bem_id = b.id and bp.pasto_id = v_pasto and bp.desligado_em is null);
    if not v_vivo and not ps.ativo then
      raise exception using errcode = 'P0001', message = format('O pasto «%s» está inativo.', ps.nome);
    end if;
    if coalesce(v_area, 0) <= 0 then
      raise exception using errcode = 'P0001', message = format('Informe a área do pasto «%s».', ps.nome);
    end if;
    v_area_total := v_area_total + v_area;
    v_res := v_res || jsonb_build_array(jsonb_build_object('pasto_id', v_pasto, 'nome', ps.nome, 'area_ha', round(v_area, 2),
      'area_produtiva_ha', ps.area_produtiva_ha, 'ja_ligado', v_vivo));
  end loop;
  select coalesce(sum(z.valor) filter (where z.estado = 'soma'), 0) into v_aquis from public._fn_patrimonio_vinculos(b.cliente_id, b.id, null) z;
  v_aquis := v_aquis + case b.origem_valor when 'sem_lancamento' then b.valor_sem_lancamento
                                           when 'estimativa' then round(b.estimativa_rs_ha * b.estimativa_area_ha, 2) else 0 end;
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'pastos', v_res, 'area_total_ha', v_area_total, 'aquisicao', v_aquis,
      'custo_por_ha', case when v_area_total > 0 then round(v_aquis / v_area_total, 2) end);
  end if;
  update public.patrimonio_bem_pastos bp set desligado_em = now(), desligado_por = auth.uid(), desligado_motivo = 'desmarcado no bem'
   where bp.bem_id = b.id and bp.desligado_em is null
     and bp.pasto_id not in (select (x->>'pasto_id')::uuid from jsonb_array_elements(p_pastos) x);
  update public.patrimonio_bem_pastos bp set area_ha = round((x->>'area_ha')::numeric, 2), alterado_em = now(), alterado_por = auth.uid()
    from jsonb_array_elements(p_pastos) x
   where bp.bem_id = b.id and bp.desligado_em is null and bp.pasto_id = (x->>'pasto_id')::uuid
     and bp.area_ha <> round((x->>'area_ha')::numeric, 2);
  insert into public.patrimonio_bem_pastos (cliente_id, bem_id, pasto_id, area_ha, criado_por)
  select b.cliente_id, b.id, (x->>'pasto_id')::uuid, round((x->>'area_ha')::numeric, 2), auth.uid()
    from jsonb_array_elements(p_pastos) x
   where not exists (select 1 from public.patrimonio_bem_pastos bp
                      where bp.bem_id = b.id and bp.pasto_id = (x->>'pasto_id')::uuid and bp.desligado_em is null);
  update public.patrimonio_bens set versao = versao + 1, alterado_em = now(), alterado_por = auth.uid() where id = b.id;
  return jsonb_build_object('ok', true, 'simulado', false, 'area_total_ha', v_area_total,
    'custo_por_ha', case when v_area_total > 0 then round(v_aquis / v_area_total, 2) end);
end $$;

-- 9. Escrita: avaliacao de mercado (registrar / cancelar) ---------------------------------------------------------------------
-- p_avaliacao: data · fonte · base · valor_ha · area_ha (terra; area padrao = a do bem) · valor_total (bem) · observacao.
create or replace function public.fn_patrimonio_avaliacao_salvar(p_bem uuid, p_avaliacao jsonb, p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  b public.patrimonio_bens%rowtype := public._fn_patrimonio_bem_do_usuario(p_bem);
  c public.patrimonio_categorias%rowtype;
  v_data date := nullif(p_avaliacao->>'data', '')::date;
  v_fonte text := nullif(btrim(coalesce(p_avaliacao->>'fonte', '')), '');
  v_base text := nullif(p_avaliacao->>'base', '');
  v_ha numeric := nullif(p_avaliacao->>'valor_ha', '')::numeric;
  v_area numeric := nullif(p_avaliacao->>'area_ha', '')::numeric;
  v_total numeric := nullif(p_avaliacao->>'valor_total', '')::numeric;
  v_id uuid;
begin
  select * into c from public.patrimonio_categorias x where x.id = b.categoria_id;
  if not c.tem_mercado then raise exception using errcode = 'P0001', message = 'Esta categoria não tem valor de mercado próprio.'; end if;
  if v_data is null or v_data > public._fn_patrimonio_hoje() then
    raise exception using errcode = 'P0001', message = 'Informe a data da avaliação (até hoje).';
  end if;
  if v_fonte is null then raise exception using errcode = 'P0001', message = 'Informe a fonte da avaliação.'; end if;
  if c.base_mercado = 'terra' then
    if v_base is null or v_base not in ('terra_nua', 'terra_formada') then
      raise exception using errcode = 'P0001', message = 'Diga a base da avaliação: terra nua (VTN do ITR) ou terra formada (laudo).';
    end if;
    v_area := coalesce(v_area, b.area_ha);
    if coalesce(v_ha, 0) <= 0 or coalesce(v_area, 0) <= 0 then
      raise exception using errcode = 'P0001', message = 'Informe o R$/ha e a área da avaliação.';
    end if;
    v_total := round(v_ha * v_area, 2);
  else
    v_base := 'bem'; v_ha := null; v_area := null;
    if coalesce(v_total, 0) <= 0 then raise exception using errcode = 'P0001', message = 'Informe o valor de mercado.'; end if;
  end if;
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'base', v_base, 'valor_ha', v_ha, 'area_ha', v_area, 'valor_total', v_total);
  end if;
  insert into public.patrimonio_avaliacoes (cliente_id, bem_id, data, fonte, base, valor_ha, area_ha, valor_total, observacao, criado_por)
  values (b.cliente_id, b.id, v_data, v_fonte, v_base, v_ha, v_area, v_total,
          nullif(btrim(coalesce(p_avaliacao->>'observacao', '')), ''), auth.uid())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'simulado', false, 'id', v_id, 'valor_total', v_total);
end $$;

create or replace function public.fn_patrimonio_avaliacao_cancelar(p_id uuid, p_motivo text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_bem uuid; b public.patrimonio_bens%rowtype;
begin
  select a.bem_id into v_bem from public.patrimonio_avaliacoes a where a.id = p_id;
  if v_bem is null then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  b := public._fn_patrimonio_bem_do_usuario(v_bem);
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception using errcode = 'P0001', message = 'Informe o motivo.'; end if;
  update public.patrimonio_avaliacoes set cancelado_em = now(), cancelado_por = auth.uid(), cancelado_motivo = btrim(p_motivo)
   where id = p_id and cancelado_em is null;
  if not found then raise exception using errcode = 'P0001', message = 'Esta avaliação já foi cancelada.'; end if;
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

-- 10. Escrita: documentos do bem (o molde de fn_financiamento_documento_*) ----------------------------------------------------
create or replace function public.fn_patrimonio_documento_registrar(p_bem uuid, p_especie text, p_nome text, p_extensao text,
                                                                    p_tipo text default null, p_tamanho bigint default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare b public.patrimonio_bens%rowtype := public._fn_patrimonio_bem_do_usuario(p_bem); v_id uuid := gen_random_uuid(); v_ext text; v_path text;
begin
  if p_especie is null or p_especie not in ('nota_fiscal', 'contrato', 'escritura', 'matricula', 'laudo', 'seguro', 'foto', 'outro') then
    raise exception using errcode = 'P0001', message = 'Escolha a espécie do documento.';
  end if;
  if nullif(btrim(coalesce(p_nome, '')), '') is null then raise exception using errcode = 'P0001', message = 'Documento sem nome.'; end if;
  v_ext := lower(regexp_replace(coalesce(p_extensao, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_ext = '' then v_ext := 'bin'; end if;
  v_path := b.cliente_id::text || '/patrimonio/' || b.id::text || '/' || v_id::text || '.' || v_ext;
  insert into public.patrimonio_bem_documentos (id, cliente_id, bem_id, especie, nome, storage_path, tipo, tamanho_bytes, enviado_por)
  values (v_id, b.cliente_id, b.id, p_especie, btrim(p_nome), v_path, p_tipo, p_tamanho, auth.uid());
  return jsonb_build_object('id', v_id, 'storage_path', v_path);
end $$;

create or replace function public.fn_patrimonio_documento_remover(p_id uuid, p_motivo text)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_bem uuid; b public.patrimonio_bens%rowtype;
begin
  select d.bem_id into v_bem from public.patrimonio_bem_documentos d where d.id = p_id;
  if v_bem is null then raise exception using errcode = '42501', message = 'sem acesso a este registro'; end if;
  b := public._fn_patrimonio_bem_do_usuario(v_bem);
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception using errcode = 'P0001', message = 'Informe o motivo da remoção.'; end if;
  update public.patrimonio_bem_documentos set cancelado_em = now(), cancelado_por = auth.uid(), cancelado_motivo = btrim(p_motivo)
   where id = p_id and cancelado_em is null;
  if not found then raise exception using errcode = 'P0001', message = 'Este documento já foi removido.'; end if;
  return jsonb_build_object('id', p_id, 'removido', true);
end $$;

-- 11. Fechadas: so' authenticated (a guarda e' o tenant_ok de cada uma) e service_role ---------------------------------------
revoke all on function public.fn_patrimonio_lista(uuid, uuid, date) from public, anon;
revoke all on function public.fn_patrimonio_depreciacao(uuid, uuid, date, text) from public, anon;
revoke all on function public.fn_investimentos_sem_bem(uuid, uuid, numeric) from public, anon;
revoke all on function public.fn_patrimonio_bem_salvar(jsonb, boolean, text) from public, anon;
revoke all on function public.fn_patrimonio_bem_lancamentos(uuid) from public, anon;
revoke all on function public.fn_patrimonio_parametros_mudar(uuid, date, integer, numeric, text, boolean) from public, anon;
revoke all on function public.fn_patrimonio_bem_ligar(uuid, jsonb, boolean, boolean) from public, anon;
revoke all on function public.fn_patrimonio_bem_desligar(uuid, jsonb, text, boolean) from public, anon;
revoke all on function public.fn_patrimonio_bem_pastos_salvar(uuid, jsonb, boolean) from public, anon;
revoke all on function public.fn_patrimonio_avaliacao_salvar(uuid, jsonb, boolean) from public, anon;
revoke all on function public.fn_patrimonio_avaliacao_cancelar(uuid, text) from public, anon;
revoke all on function public.fn_patrimonio_documento_registrar(uuid, text, text, text, text, bigint) from public, anon;
revoke all on function public.fn_patrimonio_documento_remover(uuid, text) from public, anon;
grant execute on function public.fn_patrimonio_lista(uuid, uuid, date) to authenticated, service_role;
grant execute on function public.fn_patrimonio_depreciacao(uuid, uuid, date, text) to authenticated, service_role;
grant execute on function public.fn_investimentos_sem_bem(uuid, uuid, numeric) to authenticated, service_role;
grant execute on function public.fn_patrimonio_bem_salvar(jsonb, boolean, text) to authenticated, service_role;
grant execute on function public.fn_patrimonio_bem_lancamentos(uuid) to authenticated, service_role;
grant execute on function public.fn_patrimonio_parametros_mudar(uuid, date, integer, numeric, text, boolean) to authenticated, service_role;
grant execute on function public.fn_patrimonio_bem_ligar(uuid, jsonb, boolean, boolean) to authenticated, service_role;
grant execute on function public.fn_patrimonio_bem_desligar(uuid, jsonb, text, boolean) to authenticated, service_role;
grant execute on function public.fn_patrimonio_bem_pastos_salvar(uuid, jsonb, boolean) to authenticated, service_role;
grant execute on function public.fn_patrimonio_avaliacao_salvar(uuid, jsonb, boolean) to authenticated, service_role;
grant execute on function public.fn_patrimonio_avaliacao_cancelar(uuid, text) to authenticated, service_role;
grant execute on function public.fn_patrimonio_documento_registrar(uuid, text, text, text, text, bigint) to authenticated, service_role;
grant execute on function public.fn_patrimonio_documento_remover(uuid, text) to authenticated, service_role;
