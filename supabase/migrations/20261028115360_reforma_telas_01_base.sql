-- REFORMA-TELAS-01 · 20261028115360 — a FONTE ÚNICA das telas da Reforma 2027 (T1 painel do consultor, T2 aba da ficha do produtor).
-- Decisões do Gabriel 14/11 16:24 (D1–D7). Depende da 115330 (contrapartes) e da 115340 (fiscal_limites).
-- · Receita = a do LIVRO CAIXA (`vw_fin_livro_caixa`, lado 'entra', '1-Entradas'); realizado pela data de pagamento; em aberto pelo
--   vencimento, só no ano corrente ou adiante (D5: o aberto vencido do ano conta). "confirmar" e "fora" à parte, fora do número (D3).
-- · Vai ao titular pela composição VIGENTE NA DATA (`fiscal_fazenda_titulares` × participação); o que não tem dono (sem fazenda = "sem
--   imóvel", D7; ou composição < 100%) fica numa linha SEM TITULAR ("a confirmar", D6).
-- · A régua do regime de um ano usa a receita do ano ANTERIOR (D2) contra o limite do ano do regime; o LCDPR usa o do próprio ano.
-- · Nenhum número de limite aqui: tudo de `fiscal_limites` (sem linha = 'pendente').
-- · Checklist: o que o sistema já sabe é LIDO; o resto é uma confirmação manual com trilha e desfazer (nada se apaga).
set local lock_timeout = '2s';

-- ── (1) as partes da receita por titular (interna) ─────────────────────────────────────────────────────────────────────────
create or replace function public._fn_fiscal_receita_partes(p_cliente uuid, p_ano int)
returns table (titular_id uuid, participacao numeric, fazenda_id uuid, mes int, lado text, realizado boolean, valor numeric, lancamento_id uuid)
language sql stable set search_path = pg_catalog, public as $$
  with b as (
    select lc.lancamento_id, lc.lado, lc.valor, p.fazenda_id,
           lc.status_transacao in ('realizado', 'conciliado') as realizado,
           case when lc.status_transacao in ('realizado', 'conciliado') then lc.data_pagamento else p.data_vencimento end as d
      from public.vw_fin_livro_caixa lc
      join public.vw_fin_classificacao_por_parte p on p.lancamento_id = lc.lancamento_id and p.parte_ordem = lc.parte_ordem
     where lc.cliente_id = p_cliente and lc.tipo_operacao = '1-Entradas'
  )
  select t.titular_id, t.participacao, b.fazenda_id, extract(month from b.d)::int, b.lado, b.realizado,
         round(b.valor * t.participacao / 100, 2), b.lancamento_id
    from b
    cross join lateral (
      with c as (select ft.titular_id, ft.participacao from public.fiscal_fazenda_titulares ft
                  where ft.cliente_id = p_cliente and ft.fazenda_id = b.fazenda_id and ft.substituida_em is null
                    and ft.vigencia_inicio <= b.d and (ft.vigencia_fim is null or ft.vigencia_fim >= b.d))
      select c.titular_id, c.participacao from c
      union all
      select null::uuid, 100 - coalesce((select sum(c.participacao) from c), 0) where coalesce((select sum(c.participacao) from c), 0) < 100
    ) t
   where b.d between make_date(p_ano, 1, 1) and make_date(p_ano, 12, 31)
     and (b.realizado or p_ano >= extract(year from (now() at time zone 'America/Sao_Paulo'))::int)
$$;

-- ── (2) limites do ano e a situação (internas) ─────────────────────────────────────────────────────────────────────────────
-- valores: o do ano exato (sem linha = nulo = 'pendente'); percentuais: o mais recente até o ano
create or replace function public._fn_fiscal_limites_do_ano(p_ano int)
returns jsonb language sql stable set search_path = pg_catalog, public as $$
  select jsonb_build_object(
    'ano', p_ano, 'regime_ano', p_ano + 1,
    'lcdpr_obrigatorio', (select l.valor from public.fiscal_limites l where l.substituida_em is null and l.chave = 'lcdpr_obrigatorio' and l.ano = p_ano),
    'ibs_cbs_nao_contribuinte', (select l.valor from public.fiscal_limites l where l.substituida_em is null and l.chave = 'ibs_cbs_nao_contribuinte' and l.ano = p_ano + 1),
    'ibs_cbs_excesso_pct', (select l.valor from public.fiscal_limites l where l.substituida_em is null and l.chave = 'ibs_cbs_excesso_pct' and l.ano <= p_ano + 1 order by l.ano desc limit 1),
    'aviso_perto_pct', (select l.valor from public.fiscal_limites l where l.substituida_em is null and l.chave = 'aviso_perto_pct' and l.ano <= p_ano + 1 order by l.ano desc limit 1),
    'credito_presumido_pct', (select l.valor from public.fiscal_limites l where l.substituida_em is null and l.chave = 'credito_presumido_pct' and l.ano = p_ano + 1),
    'fontes', (select coalesce(jsonb_object_agg(l.chave || ':' || l.ano, l.fonte), '{}'::jsonb) from public.fiscal_limites l
                where l.substituida_em is null and l.ano between p_ano - 1 and p_ano + 1))
$$;

create or replace function public._fn_fiscal_situacao(p_receita numeric, p_limite numeric, p_perto_pct numeric, p_excesso_pct numeric)
returns text language sql immutable set search_path = pg_catalog as $$
  select case
    when p_limite is null then 'pendente'
    when coalesce(p_receita, 0) > p_limite * (1 + coalesce(p_excesso_pct, 0) / 100) then 'acima'
    when coalesce(p_receita, 0) > p_limite then 'acima_ate_excesso'
    when p_perto_pct is not null and coalesce(p_receita, 0) >= p_limite * (1 - p_perto_pct / 100) then 'perto'
    else 'abaixo' end
$$;

-- ── (3) a receita do cliente por titular, num ano ──────────────────────────────────────────────────────────────────────────
create or replace function public.fn_fiscal_receita_titular(p_cliente_id uuid, p_ano int)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public set plan_cache_mode = force_custom_plan as $$
declare v_lim jsonb; v jsonb; v_fim date; v_reg date;
begin
  if p_cliente_id is null or not coalesce(public.tenant_ok(p_cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este cliente.';
  end if;
  if p_ano is null or p_ano < 2018 or p_ano > 2100 then raise exception using errcode = '22023', message = 'Ano inválido.'; end if;
  v_lim := public._fn_fiscal_limites_do_ano(p_ano);
  v_fim := make_date(p_ano, 12, 31); v_reg := make_date(p_ano + 1, 1, 1);
  with p as (select * from public._fn_fiscal_receita_partes(p_cliente_id, p_ano)),
  t as (select p.titular_id,
               sum(p.valor) filter (where p.lado = 'entra' and p.realizado) realizado,
               sum(p.valor) filter (where p.lado = 'entra' and not p.realizado) aberto,
               coalesce(sum(p.valor) filter (where p.lado = 'entra'), 0) total,
               sum(p.valor) filter (where p.lado = 'confirmar') confirmar,
               sum(p.valor) filter (where p.lado = 'fora') fora,
               count(distinct p.lancamento_id) filter (where p.lado = 'entra') lancamentos,
               sum(p.valor) filter (where p.lado = 'entra' and p.fazenda_id is null) sem_imovel
          from p group by p.titular_id),
  quem as (  -- todo produtor do cliente (mesmo sem receita) + a linha sem titular, se houver
    select x.id, x.nome, x.documento, x.tipo from public.fiscal_titulares x where x.cliente_id = p_cliente_id and x.papel = 'produtor'
    union all select null, null, null, null where exists (select 1 from p where p.titular_id is null)),
  g as (  -- empresas do grupo que entram no limite (vigentes no fim do ano), pela receita delas × participação
    select gr.titular_id, sum(coalesce(te.total, 0) * gr.participacao / 100) soma,
           jsonb_agg(jsonb_build_object('empresa_id', gr.empresa_id, 'empresa', y.nome, 'participacao', gr.participacao,
                                        'valor', round(coalesce(te.total, 0) * gr.participacao / 100, 2)) order by y.nome) empresas
      from public.fiscal_titular_grupo gr join public.fiscal_titulares y on y.id = gr.empresa_id
      left join t te on te.titular_id = gr.empresa_id
     where gr.cliente_id = p_cliente_id and gr.entra_no_limite and gr.substituida_em is null
       and gr.vigencia_inicio <= v_fim and (gr.vigencia_fim is null or gr.vigencia_fim >= v_fim)
     group by gr.titular_id)
  select coalesce(jsonb_agg(z.o order by (z.o->>'titular_id') is null, z.o->>'nome'), '[]'::jsonb) into v
    from (select jsonb_build_object(
            'titular_id', q.id, 'nome', q.nome, 'documento', q.documento, 'tipo', q.tipo, 'a_confirmar', q.id is null,
            'receita', jsonb_build_object('realizado', coalesce(t.realizado, 0), 'aberto', coalesce(t.aberto, 0), 'total', coalesce(t.total, 0),
                                          'confirmar', coalesce(t.confirmar, 0), 'fora', coalesce(t.fora, 0),
                                          'lancamentos', coalesce(t.lancamentos, 0), 'sem_imovel', coalesce(t.sem_imovel, 0)),
            'meses', (select jsonb_agg((select sum(p.valor) from p where p.titular_id is not distinct from q.id and p.lado = 'entra' and p.mes = m) order by m)
                        from generate_series(1, 12) m),
            'imoveis', (select coalesce(jsonb_agg(jsonb_build_object('fazenda_id', s.fazenda_id, 'fazenda', f.nome, 'codigo', f.codigo, 'valor', s.v)
                                                  order by s.v desc), '[]'::jsonb)
                          from (select p.fazenda_id, sum(p.valor) v from p where p.titular_id is not distinct from q.id and p.lado = 'entra'
                                 group by p.fazenda_id) s left join public.fazendas f on f.id = s.fazenda_id),
            'grupo', jsonb_build_object('soma', coalesce(round(g.soma, 2), 0), 'empresas', coalesce(g.empresas, '[]'::jsonb)),
            'base_limite', coalesce(t.total, 0) + coalesce(round(g.soma, 2), 0),
            'ibs_cbs', case when q.id is null then null else jsonb_build_object(
                'regime_ano', p_ano + 1, 'limite', v_lim->'ibs_cbs_nao_contribuinte',
                'situacao', public._fn_fiscal_situacao(coalesce(t.total, 0) + coalesce(g.soma, 0), (v_lim->>'ibs_cbs_nao_contribuinte')::numeric,
                                                       (v_lim->>'aviso_perto_pct')::numeric, (v_lim->>'ibs_cbs_excesso_pct')::numeric),
                'faltam', case when (v_lim->>'ibs_cbs_nao_contribuinte') is not null
                                and coalesce(t.total, 0) + coalesce(g.soma, 0) <= (v_lim->>'ibs_cbs_nao_contribuinte')::numeric
                               then round((v_lim->>'ibs_cbs_nao_contribuinte')::numeric - coalesce(t.total, 0) - coalesce(g.soma, 0), 2) end) end,
            'lcdpr', case when q.id is null then null else jsonb_build_object(
                'ano', p_ano, 'limite', v_lim->'lcdpr_obrigatorio',
                'situacao', public._fn_fiscal_situacao(coalesce(t.total, 0), (v_lim->>'lcdpr_obrigatorio')::numeric, (v_lim->>'aviso_perto_pct')::numeric, null)) end,
            'condicao_ibs', case when q.id is null then null else (
                select jsonb_build_object('id', c.id, 'condicao', c.condicao, 'desde', c.vigencia_inicio, 'ate', c.vigencia_fim, 'motivo', c.motivo,
                                          'por', c.criado_por, 'em', c.created_at)
                  from public.fiscal_titular_condicao_ibs c
                 where c.titular_id = q.id and c.substituida_em is null and c.vigencia_inicio <= v_reg
                   and (c.vigencia_fim is null or c.vigencia_fim >= v_reg)
                 order by c.vigencia_inicio desc limit 1) end
          ) o
          from quem q left join t on t.titular_id is not distinct from q.id left join g on g.titular_id = q.id) z;
  return jsonb_build_object('cliente_id', p_cliente_id, 'ano', p_ano, 'limites', v_lim, 'titulares', v);
end $$;

-- ── (4) o painel do consultor (T1): todos os clientes, ano corrente × anterior; só admin (D4) ──────────────────────────────
create or replace function public.fn_fiscal_reforma_painel(p_ano int)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public set plan_cache_mode = force_custom_plan as $$
declare c record; v_cli jsonb := '[]'::jsonb; a jsonb; b jsonb; l jsonb; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; v_lin jsonb;
begin
  if not coalesce(public.is_admin_agroinblue(auth.uid()), false) then
    raise exception using errcode = '42501', message = 'O painel da Reforma é do consultor AgroinBlue.';
  end if;
  if p_ano is null or p_ano < 2019 or p_ano > 2100 then raise exception using errcode = '22023', message = 'Ano inválido.'; end if;
  for c in select x.id, x.nome from public.clientes x where coalesce(public.tenant_ok(x.id), false) order by x.nome loop
    b := public.fn_fiscal_receita_titular(c.id, p_ano);
    a := public.fn_fiscal_receita_titular(c.id, p_ano - 1);
    l := public.fn_fiscal_titulares_lista(c.id);
    select coalesce(jsonb_agg((t.o - 'meses' - 'imoveis') || jsonb_build_object(
             'cadastrado', (t.o->>'titular_id') is not null,
             'receita_anterior', (select y.o->'receita'->'total' from jsonb_array_elements(a->'titulares') y(o)
                                   where (y.o->>'titular_id') is not distinct from (t.o->>'titular_id')),
             'pendencias', coalesce((select y.o->'pendencias' from jsonb_array_elements(l) y(o) where y.o->>'id' = t.o->>'titular_id'), '[]'::jsonb),
             'certificado', (select jsonb_build_object('situacao', k.situacao, 'valido_ate', k.valido_ate) from public.fiscal_certificados k
                              where k.titular_id::text = t.o->>'titular_id' and k.situacao = 'ativo' and k.valido_ate >= v_hoje
                              order by k.valido_ate desc limit 1),
             'receita_dfe', (select jsonb_build_object('nao_antes_de', d.nao_antes_de, 'ultima_busca_em', d.ultima_busca_em)
                               from public.fiscal_dfe_controle d where d.titular_id::text = t.o->>'titular_id'))), '[]'::jsonb)
      into v_lin from jsonb_array_elements(b->'titulares') t(o);
    -- cliente sem produtor e sem receita: ainda aparece (uma linha "a confirmar" com zero)
    if jsonb_array_length(v_lin) = 0 then
      v_lin := jsonb_build_array(jsonb_build_object('titular_id', null, 'a_confirmar', true, 'cadastrado', false,
                                 'receita', jsonb_build_object('total', 0), 'receita_anterior', 0, 'pendencias', '[]'::jsonb));
    end if;
    v_cli := v_cli || jsonb_build_object('cliente_id', c.id, 'cliente', c.nome, 'titulares', v_lin);
  end loop;
  return jsonb_build_object('ano', p_ano, 'limites', public._fn_fiscal_limites_do_ano(p_ano), 'clientes', v_cli,
    'totais', (select jsonb_build_object(
        'clientes', jsonb_array_length(v_cli),
        'produtores', count(*) filter (where (t.o->>'cadastrado')::boolean),
        'a_confirmar', count(*) filter (where (t.o->>'a_confirmar')::boolean),
        'receita_anterior', coalesce(sum((t.o->>'receita_anterior')::numeric), 0),
        'receita_corrente', coalesce(sum((t.o->'receita'->>'total')::numeric), 0),
        'ibs_acima', count(*) filter (where t.o->'ibs_cbs'->>'situacao' in ('acima', 'acima_ate_excesso')),
        'ibs_perto', count(*) filter (where t.o->'ibs_cbs'->>'situacao' = 'perto'),
        'lcdpr_obrigados', count(*) filter (where t.o->'lcdpr'->>'situacao' in ('acima', 'acima_ate_excesso')),
        'certificados_ativos', count(*) filter (where t.o->>'certificado' is not null),
        'pendencias', coalesce(sum(jsonb_array_length(t.o->'pendencias')), 0))
      from jsonb_array_elements(v_cli) k(o), jsonb_array_elements(k.o->'titulares') t(o)));
end $$;

-- ── (5) checklist: confirmações manuais (o que o sistema não sabe sozinho) ─────────────────────────────────────────────────
create table public.fiscal_titular_confirmacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id),
  titular_id uuid not null references public.fiscal_titulares (id),
  ano smallint not null check (ano between 2025 and 2100),
  item text not null check (item in ('a1_em_maos', 'emissor_nfe_proprio', 'regime_com_contador')),
  motivo text not null check (length(btrim(motivo)) >= 3),
  criado_em timestamptz not null default now(), criado_por uuid,
  desfeita_em timestamptz, desfeita_por uuid, desfeita_motivo text check (desfeita_motivo is null or length(btrim(desfeita_motivo)) >= 3),
  check ((desfeita_em is null) = (desfeita_motivo is null))
);
create unique index fiscal_titular_confirmacoes_viva_uq on public.fiscal_titular_confirmacoes (titular_id, ano, item) where desfeita_em is null;
comment on table public.fiscal_titular_confirmacoes is 'REFORMA-TELAS-01: itens do checklist da Reforma que só uma pessoa confirma (A1 em mãos, emissor de NF-e próprio, regime com o contador), por titular e ano. Desfazer marca desfeita_em; nada se apaga. Escrita só pelas RPCs.';
alter table public.fiscal_titular_confirmacoes enable row level security;
create policy fiscal_titular_confirmacoes_ler on public.fiscal_titular_confirmacoes for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.fiscal_titular_confirmacoes from public, anon, authenticated;
grant select on public.fiscal_titular_confirmacoes to authenticated;
grant all on public.fiscal_titular_confirmacoes to service_role;
create trigger trg_leitura_nao_grava before insert or delete or update on public.fiscal_titular_confirmacoes
  for each statement execute function public._fn_leitura_nao_grava();

create or replace function public.fn_fiscal_titular_confirmacao_gravar(p_titular_id uuid, p_ano smallint, p_item text, p_motivo text,
  p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare t public.fiscal_titulares; v_id uuid; v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  select * into t from public.fiscal_titulares where id = p_titular_id;
  if t.id is null or not coalesce(public.tenant_ok(t.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este produtor.';
  end if;
  if t.papel <> 'produtor' then raise exception 'O checklist da Reforma é do produtor.'; end if;
  if p_ano is null or p_ano < 2025 or p_ano > 2100 then raise exception 'Ano inválido.'; end if;
  if coalesce(p_item, '') not in ('a1_em_maos', 'emissor_nfe_proprio', 'regime_com_contador') then raise exception 'Item do checklist inválido.'; end if;
  if length(v_motivo) < 3 then raise exception 'Diga como foi confirmado (pelo menos 3 letras).'; end if;
  if exists (select 1 from public.fiscal_titular_confirmacoes where titular_id = t.id and ano = p_ano and item = p_item and desfeita_em is null) then
    raise exception 'Este item já está confirmado para %.', p_ano;
  end if;
  if p_simular then
    return jsonb_build_object('simulado', true, 'gravado', false, 'titular', t.nome, 'ano', p_ano, 'item', p_item, 'motivo', v_motivo);
  end if;
  insert into public.fiscal_titular_confirmacoes (cliente_id, titular_id, ano, item, motivo, criado_por)
  values (t.cliente_id, t.id, p_ano, p_item, v_motivo, auth.uid()) returning id into v_id;
  insert into public.audit_log (cliente_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  values (t.cliente_id, auth.uid(), 'fiscal', 'criou', 'fiscal_titular_confirmacoes', v_id, format('%s · Reforma %s · confirmou %s', t.nome, p_ano, p_item),
          null, jsonb_build_object('item', p_item, 'ano', p_ano, 'motivo', v_motivo), public._fn_trilha_via());
  return jsonb_build_object('simulado', false, 'gravado', true, 'id', v_id);
end $$;

create or replace function public.fn_fiscal_titular_confirmacao_desfazer(p_confirmacao_id uuid, p_motivo text, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare k public.fiscal_titular_confirmacoes; v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  select * into k from public.fiscal_titular_confirmacoes where id = p_confirmacao_id;
  if k.id is null or not coalesce(public.tenant_ok(k.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a esta confirmação.';
  end if;
  if k.desfeita_em is not null then raise exception 'Esta confirmação já foi desfeita.'; end if;
  if length(v_motivo) < 3 then raise exception 'Diga por que desfaz (pelo menos 3 letras).'; end if;
  if p_simular then return jsonb_build_object('simulado', true, 'gravado', false, 'item', k.item, 'ano', k.ano); end if;
  update public.fiscal_titular_confirmacoes set desfeita_em = now(), desfeita_por = auth.uid(), desfeita_motivo = v_motivo where id = k.id;
  insert into public.audit_log (cliente_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  values (k.cliente_id, auth.uid(), 'fiscal', 'desfez', 'fiscal_titular_confirmacoes', k.id, format('Reforma %s · desfez %s', k.ano, k.item),
          jsonb_build_object('item', k.item, 'motivo', k.motivo), jsonb_build_object('desfeita_motivo', v_motivo), public._fn_trilha_via());
  return jsonb_build_object('simulado', false, 'gravado', true);
end $$;

-- ── (6) o checklist do titular para o regime de um ano (lido + manual) ─────────────────────────────────────────────────────
create or replace function public.fn_fiscal_reforma_checklist(p_titular_id uuid, p_ano int)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare t public.fiscal_titulares; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; v_cond text; v_itens jsonb;
  v_sem_ie jsonb; v_sem_contrato jsonb; v_precisa_contrato boolean; v_tem_faz boolean;
begin
  select * into t from public.fiscal_titulares where id = p_titular_id;
  if t.id is null or not coalesce(public.tenant_ok(t.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a este produtor.';
  end if;
  if p_ano is null or p_ano < 2025 or p_ano > 2100 then raise exception using errcode = '22023', message = 'Ano inválido.'; end if;
  select c.condicao into v_cond from public.fiscal_titular_condicao_ibs c
   where c.titular_id = t.id and c.substituida_em is null and c.vigencia_inicio <= make_date(p_ano, 1, 1)
     and (c.vigencia_fim is null or c.vigencia_fim >= make_date(p_ano, 1, 1)) order by c.vigencia_inicio desc limit 1;
  with fz as (select ft.fazenda_id, ft.condicao, f.nome, f.codigo from public.fiscal_fazenda_titulares ft join public.fazendas f on f.id = ft.fazenda_id
               where ft.titular_id = t.id and ft.substituida_em is null and ft.vigencia_inicio <= v_hoje
                 and (ft.vigencia_fim is null or ft.vigencia_fim >= v_hoje))
  select exists (select 1 from fz),
         (select coalesce(jsonb_agg(coalesce(fz.codigo, fz.nome) order by fz.nome), '[]'::jsonb) from fz
           where not exists (select 1 from public.fiscal_titular_ies i where i.titular_id = t.id and i.ativo and i.fazenda_id = fz.fazenda_id)
             and not exists (select 1 from public.fazenda_cadastros fc where fc.fazenda_id = fz.fazenda_id and nullif(btrim(fc.ie), '') is not null)),
         exists (select 1 from fz where fz.condicao in ('arrendatario', 'parceiro', 'comodatario')),
         (select coalesce(jsonb_agg(coalesce(fz.codigo, fz.nome) order by fz.nome), '[]'::jsonb) from fz
           where fz.condicao in ('arrendatario', 'parceiro', 'comodatario')
             and not exists (select 1 from public.fiscal_fazenda_contrapartes cp where cp.titular_id = t.id and cp.fazenda_id = fz.fazenda_id
                               and cp.substituida_em is null and cp.vigencia_inicio <= v_hoje and (cp.vigencia_fim is null or cp.vigencia_fim >= v_hoje)))
    into v_tem_faz, v_sem_ie, v_precisa_contrato, v_sem_contrato;
  select jsonb_agg(i.o order by i.n) into v_itens from (
    select 1 n, public._fn_fiscal_item_manual(t.id, p_ano, 'a1_em_maos', true) o
    union all select 2, jsonb_build_object('item', 'certificado_enviado', 'fonte', 'sistema',
      'situacao', case when exists (select 1 from public.fiscal_certificados k where k.titular_id = t.id and k.situacao = 'ativo' and k.valido_ate >= v_hoje)
                       then 'feito' else 'pendente' end)
    union all select 3, jsonb_build_object('item', 'composicao', 'fonte', 'sistema', 'situacao', case when v_tem_faz then 'feito' else 'pendente' end)
    union all select 4, jsonb_build_object('item', 'ie_por_imovel', 'fonte', 'sistema',
      'situacao', case when v_tem_faz and jsonb_array_length(v_sem_ie) = 0 then 'feito' else 'pendente' end, 'faltam', v_sem_ie)
    union all select 5, jsonb_build_object('item', 'contratos', 'fonte', 'sistema',
      'situacao', case when not v_precisa_contrato then 'nao_se_aplica' when jsonb_array_length(v_sem_contrato) = 0 then 'feito' else 'pendente' end,
      'faltam', v_sem_contrato)
    union all select 6, public._fn_fiscal_item_manual(t.id, p_ano, 'emissor_nfe_proprio', coalesce(v_cond, '') <> 'nao_contribuinte')
    union all select 7, public._fn_fiscal_item_manual(t.id, p_ano, 'regime_com_contador', true)
  ) i;
  return jsonb_build_object('titular_id', t.id, 'ano', p_ano, 'condicao_ibs', v_cond, 'itens', v_itens,
    'feitos', (select count(*) from jsonb_array_elements(v_itens) x where x->>'situacao' = 'feito'),
    'aplicaveis', (select count(*) from jsonb_array_elements(v_itens) x where x->>'situacao' <> 'nao_se_aplica'));
end $$;

create or replace function public._fn_fiscal_item_manual(p_titular uuid, p_ano int, p_item text, p_aplica boolean)
returns jsonb language sql stable set search_path = pg_catalog, public as $$
  select jsonb_build_object('item', p_item, 'fonte', 'manual',
    'situacao', case when not p_aplica then 'nao_se_aplica' when k.id is not null then 'feito' else 'pendente' end,
    'confirmacao_id', k.id, 'por', k.criado_por, 'em', k.criado_em, 'motivo', k.motivo)
    from (select 1) um left join public.fiscal_titular_confirmacoes k
      on k.titular_id = p_titular and k.ano = p_ano and k.item = p_item and k.desfeita_em is null
$$;

-- ── (7) desfazer a última versão da condição no IBS/CBS (volta a anterior; nada se apaga) ─────────────────────────────────
create or replace function public.fn_fiscal_titular_condicao_ibs_desfazer(p_condicao_id uuid, p_motivo text, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare c public.fiscal_titular_condicao_ibs; ant public.fiscal_titular_condicao_ibs; corr public.fiscal_titular_condicao_ibs;
  v_motivo text := btrim(coalesce(p_motivo, '')); t public.fiscal_titulares; v_volta text;
begin
  select * into c from public.fiscal_titular_condicao_ibs where id = p_condicao_id;
  if c.id is null or not coalesce(public.tenant_ok(c.cliente_id), false) then
    raise exception using errcode = '42501', message = 'Você não tem acesso a esta condição.';
  end if;
  select * into t from public.fiscal_titulares where id = c.titular_id;
  if c.substituida_em is not null then raise exception 'Esta versão já não vale (foi substituída ou desfeita).'; end if;
  if exists (select 1 from public.fiscal_titular_condicao_ibs x where x.titular_id = c.titular_id and x.substituida_em is null
               and x.vigencia_inicio > c.vigencia_inicio) then
    raise exception 'Só se desfaz a versão mais recente da condição.';
  end if;
  if length(v_motivo) < 3 then raise exception 'Diga por que desfaz (pelo menos 3 letras).'; end if;
  -- a que a criou: corrigiu a da mesma data (a substituída mais recente da mesma data) ou encerrou a anterior (fim = início − 1)
  select * into corr from public.fiscal_titular_condicao_ibs x where x.titular_id = c.titular_id and x.id <> c.id
     and x.vigencia_inicio = c.vigencia_inicio and x.substituida_em is not null order by x.substituida_em desc limit 1;
  if corr.id is null then
    select * into ant from public.fiscal_titular_condicao_ibs x where x.titular_id = c.titular_id and x.substituida_em is null
       and x.vigencia_fim = c.vigencia_inicio - 1 order by x.vigencia_inicio desc limit 1;
  end if;
  v_volta := coalesce(corr.condicao, ant.condicao);
  if p_simular then
    return jsonb_build_object('simulado', true, 'gravado', false, 'titular', t.nome, 'desfaz', jsonb_build_object('condicao', c.condicao, 'desde', c.vigencia_inicio),
      'volta', case when v_volta is null then null else jsonb_build_object('condicao', v_volta, 'desde', coalesce(corr.vigencia_inicio, ant.vigencia_inicio)) end,
      'frase', case when v_volta is null then format('%s fica sem condição no IBS/CBS a partir de %s.', t.nome, to_char(c.vigencia_inicio, 'DD/MM/YYYY'))
                    else format('%s volta à condição anterior.', t.nome) end);
  end if;
  update public.fiscal_titular_condicao_ibs set substituida_em = now() where id = c.id;
  if corr.id is not null then  -- a da mesma data volta como versão nova (a substituída fica na história)
    insert into public.fiscal_titular_condicao_ibs (cliente_id, titular_id, condicao, vigencia_inicio, vigencia_fim, motivo, criado_por)
    values (corr.cliente_id, corr.titular_id, corr.condicao, corr.vigencia_inicio, c.vigencia_fim, corr.motivo, auth.uid());
  elsif ant.id is not null then
    update public.fiscal_titular_condicao_ibs set vigencia_fim = c.vigencia_fim where id = ant.id;
  end if;
  insert into public.audit_log (cliente_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  values (c.cliente_id, auth.uid(), 'fiscal', 'desfez', 'fiscal_titular_condicao_ibs', c.titular_id,
          format('%s · desfez a condição no IBS/CBS de %s', t.nome, to_char(c.vigencia_inicio, 'DD/MM/YYYY')),
          jsonb_build_object('condicao', c.condicao, 'inicio', c.vigencia_inicio), jsonb_build_object('volta', v_volta, 'motivo', v_motivo),
          public._fn_trilha_via());
  return jsonb_build_object('simulado', false, 'gravado', true, 'volta', v_volta);
end $$;

-- ── acesso: as internas fechadas; as RPCs só para quem está logado ─────────────────────────────────────────────────────────
revoke all on function public._fn_fiscal_receita_partes(uuid, int) from public, anon, authenticated;
revoke all on function public._fn_fiscal_limites_do_ano(int) from public, anon, authenticated;
revoke all on function public._fn_fiscal_situacao(numeric, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public._fn_fiscal_item_manual(uuid, int, text, boolean) from public, anon, authenticated;
revoke all on function public.fn_fiscal_receita_titular(uuid, int) from public, anon;
revoke all on function public.fn_fiscal_reforma_painel(int) from public, anon;
revoke all on function public.fn_fiscal_reforma_checklist(uuid, int) from public, anon;
revoke all on function public.fn_fiscal_titular_confirmacao_gravar(uuid, smallint, text, text, boolean) from public, anon;
revoke all on function public.fn_fiscal_titular_confirmacao_desfazer(uuid, text, boolean) from public, anon;
revoke all on function public.fn_fiscal_titular_condicao_ibs_desfazer(uuid, text, boolean) from public, anon;
grant execute on function public.fn_fiscal_receita_titular(uuid, int) to authenticated, service_role;
grant execute on function public.fn_fiscal_reforma_painel(int) to authenticated, service_role;
grant execute on function public.fn_fiscal_reforma_checklist(uuid, int) to authenticated, service_role;
grant execute on function public.fn_fiscal_titular_confirmacao_gravar(uuid, smallint, text, text, boolean) to authenticated, service_role;
grant execute on function public.fn_fiscal_titular_confirmacao_desfazer(uuid, text, boolean) to authenticated, service_role;
grant execute on function public.fn_fiscal_titular_condicao_ibs_desfazer(uuid, text, boolean) to authenticated, service_role;
