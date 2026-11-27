-- CUSTO-FASE-01 F1 — lote 118700 (Code 4). GO do Gabriel 25/11 14:05: B1 sim · B2 sim · B3 tabela sem escritor · B4 (a), medindo.
-- O custo da fazenda no DRE da pecuária (variável + fixo + administrativo rateado) dividido em cria · recria · engorda.
-- O leitor NÃO calcula o custo da fazenda: ele vem da fn_dre_pecuaria (B4 a) e o invariante prova que a soma das fases bate com ele.
--
-- Regras (briefing pecuaria-20261125-0721-CUSTO-FASE-01-FASE1-BRIEFING.md, decisões de 05/11 e 25/11):
--   1. fase marcada na PARTE do lançamento (vw_fin_classificacao_por_parte.fase: cria | recria | engorda) → vai inteira para ela;
--   2. conta do plano com regra 'cria' em pec_custo_fase_regra (os 3 subcentros de reprodução) → 100% cria;
--   3. o resto → rateia no mês pelas cabeças (ou UA = kg ÷ 450) de cada uso no fechamento de pastos da fazenda;
--      uso do mês = coalesce(nullif(tipo_uso_mes, ''), pastos.tipo_uso), o MESMO que a tela do Fechamento mostra (correção 08:36);
--   4. o administrativo da fazenda (rateio_adm do DRE, um número no período) → pelas cabeças-mês de cada uso no período;
--   5. sem base (nenhuma cabeça em cria/recria/engorda) → "sem fase", com motivo; nunca vai para a fase vizinha;
--   6. invariante: cria + recria + engorda + sem fase = variável + fixo + administrativo do DRE, por fazenda.
-- Fora (P8, listados em `excluidos`): reposição, juros, investimento, receita/venda/dedução; as cabeças em pasto de outro uso.
-- Só o cenário realizado (o programado entra, como no DRE — D5). A meta do financeiro é calculada (P120): recusa.

-- ═══ 1. a regra por conta do plano (D7) — referência global; escrita só por migration até existir o escritor (B3) ═══
create table public.pec_custo_fase_regra (
  id uuid primary key default gen_random_uuid(),
  plano_conta_id uuid not null references public.financeiro_plano_contas(id),
  regra text not null check (regra in ('cria')),
  vigencia_inicio date not null,
  motivo text not null check (btrim(motivo) <> ''),
  criado_por text not null default coalesce(auth.uid()::text, 'sistema:manutenção'),
  criado_em timestamptz not null default now(),
  unique (plano_conta_id, vigencia_inicio)
);
comment on table public.pec_custo_fase_regra is
  'CUSTO-FASE-01 (D7): a conta do plano que vai inteira para uma fase no custo por fase (fn_custo_por_fase). Sem linha = rateia. Escrita só por migration (B3: escritor quando precisar).';
alter table public.pec_custo_fase_regra enable row level security;
create policy pec_custo_fase_regra_leitura on public.pec_custo_fase_regra for select to authenticated using (true);
revoke all on table public.pec_custo_fase_regra from public, anon, authenticated;
grant select on table public.pec_custo_fase_regra to authenticated;

do $carga$
declare v_n int;
begin
  insert into public.pec_custo_fase_regra (plano_conta_id, regra, vigencia_inicio, motivo)
  select p.id, 'cria', date '2000-01-01', 'CUSTO-FASE-01 regra c: reprodução sem fase marcada = 100% cria (Gabriel 05/11; B3 25/11)'
    from public.financeiro_plano_contas p
   where p.cliente_id is null and p.ativo and p.escopo_negocio = 'pecuaria'
     and p.subcentro in ('Sêmen e IATF', 'Veterinário Reprodução', 'Outros Serviços de Reprodução');
  get diagnostics v_n = row_count;
  if v_n <> 3 then raise exception 'CUSTO-FASE-01: a carga da regra achou % contas de reprodução (esperava 3)', v_n; end if;
end $carga$;

-- ═══ 2. o leitor ═══
create or replace function public.fn_custo_por_fase(
  p_cliente uuid, p_de text, p_ate text, p_cenario text default 'realizado', p_base text default 'cabecas')
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public
set plan_cache_mode = force_custom_plan
as $f$
declare v_ini date; v_fim date; v_dre jsonb; v_res jsonb;
begin
  if not coalesce(public.tenant_ok(p_cliente), false) then raise exception 'acesso negado ao cliente' using errcode = '42501'; end if;
  if p_de is null or p_ate is null or p_de !~ '^\d{4}-(0[1-9]|1[0-2])$' or p_ate !~ '^\d{4}-(0[1-9]|1[0-2])$' or p_ate < p_de then
    raise exception 'período inválido: use AAAA-MM, com o início antes do fim' using errcode = '22023'; end if;
  if p_cenario is distinct from 'realizado' then
    raise exception 'o custo por fase só existe no realizado: a meta do financeiro é calculada, não lançada (P120)' using errcode = '22023'; end if;
  if p_base not in ('cabecas', 'ua') then raise exception 'base inválida: cabecas ou ua' using errcode = '22023'; end if;
  v_ini := to_date(p_de || '-01', 'YYYY-MM-DD');
  v_fim := (to_date(p_ate || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date;

  /* B4 (a): o custo da fazenda é o do DRE — uma fonte só. */
  v_dre := public.fn_dre_pecuaria(p_cliente, p_de, p_ate, p_cenario);

  with
  dre as (
    select (x->>'fazenda_id')::uuid fazenda_id, x->>'nome' nome,
           coalesce((x->'linhas'->>'custo_variavel')::numeric, 0) variavel, coalesce((x->'linhas'->>'custo_fixo')::numeric, 0) fixo,
           coalesce((x->'linhas'->>'rateio_adm')::numeric, 0) adm, coalesce((x->'linhas'->>'reposicao')::numeric, 0) reposicao,
           coalesce((x->'linhas'->>'juros_proprio')::numeric, 0) juros, coalesce((x->'linhas'->>'investimento')::numeric, 0) investimento
      from jsonb_array_elements(coalesce(v_dre->'fazendas', '[]'::jsonb)) x
  ),
  /* AS MESMAS LINHAS do bloco `fin` da fn_dre_pecuaria para variável e fixo (saídas): a parte, com a fase DA PARTE. */
  partes as (
    select l.fazenda_id, to_char(l.data_competencia, 'YYYY-MM') am, l.valor, l.plano_conta_id, l.data_competencia,
           case when l.fase in ('cria', 'recria', 'engorda') then l.fase end fase_marcada
      from public.vw_fin_classificacao_por_parte l join public.financeiro_plano_contas p on p.id = l.plano_conta_id
     where l.cliente_id = p_cliente and coalesce(l.cancelado, false) = false and l.compoe_dre and l.cenario = p_cenario
       and p.escopo_negocio = 'pecuaria' and p.bloco_dre in ('variavel', 'fixo') and l.tipo_operacao = '2-Saídas'
       and l.data_competencia between v_ini and v_fim
  ),
  cls as (
    select pt.*,
           case when pt.fase_marcada is not null then 'direto'
                when exists (select 1 from public.pec_custo_fase_regra r
                              where r.plano_conta_id = pt.plano_conta_id and r.regra = 'cria' and r.vigencia_inicio <= pt.data_competencia) then 'reproducao'
                else 'rateado' end via
      from partes pt
     where pt.fazenda_id in (select fazenda_id from dre)
  ),
  /* a base: o fechamento de pastos do mês, com o uso que a tela mostra */
  bp as (
    select fp.fazenda_id, fp.ano_mes am, fp.pasto_id, coalesce(nullif(fp.tipo_uso_mes, ''), pa.tipo_uso) uso,
           sum(i.quantidade) cab, sum(coalesce(i.peso_total, i.quantidade * i.peso_medio_kg, 0)) kg
      from public.fechamento_pastos fp
      join public.pastos pa on pa.id = fp.pasto_id
      join public.fechamento_pasto_itens i on i.fechamento_id = fp.id
     where fp.cliente_id = p_cliente and fp.ano_mes between p_de and p_ate and i.quantidade > 0
     group by 1, 2, 3, 4
  ),
  base as (
    select fazenda_id, am, uso fase, sum(cab) cab, sum(kg) / 450.0 ua,
           case when p_base = 'ua' then sum(kg) / 450.0 else sum(cab)::numeric end w
      from bp where uso in ('cria', 'recria', 'engorda') group by 1, 2, 3
  ),
  basem as (select fazenda_id, am, sum(w) wt from base group by 1, 2),
  rat as (select fazenda_id, am, sum(valor) v from cls where via = 'rateado' group by 1, 2),
  rat_fase as (
    select r.fazenda_id, b.fase, sum(r.v * b.w / m.wt) v
      from rat r join basem m on m.fazenda_id = r.fazenda_id and m.am = r.am and m.wt > 0
      join base b on b.fazenda_id = r.fazenda_id and b.am = r.am
     group by 1, 2
  ),
  semf as (
    select r.fazenda_id, r.am, r.v,
           case when not exists (select 1 from bp where bp.fazenda_id = r.fazenda_id and bp.am = r.am)
                  then 'sem fechamento de pastos com gado no mês'
                when p_base = 'ua' and exists (select 1 from base b where b.fazenda_id = r.fazenda_id and b.am = r.am and b.cab > 0)
                  then 'sem peso no fechamento de pastos do mês'
                else 'nenhuma cabeça em cria, recria ou engorda no fechamento do mês' end motivo
      from rat r
     where coalesce((select m.wt from basem m where m.fazenda_id = r.fazenda_id and m.am = r.am), 0) = 0
  ),
  dir as (select fazenda_id, fase_marcada fase, sum(valor) v from cls where via = 'direto' group by 1, 2),
  rep as (select fazenda_id, 'cria'::text fase, sum(valor) v from cls where via = 'reproducao' group by 1, 2),
  basep as (select fazenda_id, fase, sum(cab) cab, sum(ua) ua, sum(w) w from base group by 1, 2),
  basept as (select fazenda_id, sum(w) wt from basep group by 1),
  admf as (
    select d.fazenda_id, b.fase, d.adm * b.w / t.wt v
      from dre d join basept t on t.fazenda_id = d.fazenda_id and t.wt > 0 join basep b on b.fazenda_id = d.fazenda_id
     where d.adm <> 0
  ),
  adm_semf as (
    select d.fazenda_id, d.adm v from dre d
     where d.adm <> 0 and coalesce((select t.wt from basept t where t.fazenda_id = d.fazenda_id), 0) = 0
  ),
  grade as (
    select d.fazenda_id, f.fase, f.ordem,
           coalesce((select v from dir where dir.fazenda_id = d.fazenda_id and dir.fase = f.fase), 0) direto,
           coalesce((select v from rep where rep.fazenda_id = d.fazenda_id and rep.fase = f.fase), 0) reproducao,
           coalesce((select v from rat_fase rf where rf.fazenda_id = d.fazenda_id and rf.fase = f.fase), 0) rateado,
           coalesce((select v from admf a where a.fazenda_id = d.fazenda_id and a.fase = f.fase), 0) adm,
           coalesce((select cab from basep b where b.fazenda_id = d.fazenda_id and b.fase = f.fase), 0) cab_mes,
           coalesce((select ua from basep b where b.fazenda_id = d.fazenda_id and b.fase = f.fase), 0) ua_mes
      from dre d cross join (values ('cria', 1), ('recria', 2), ('engorda', 3)) f(fase, ordem)
  ),
  fz as (
    select d.*, d.variavel + d.fixo + d.adm dre_total,
           coalesce((select sum(v) from semf s where s.fazenda_id = d.fazenda_id), 0)
             + coalesce((select sum(v) from adm_semf a where a.fazenda_id = d.fazenda_id), 0) sem_fase,
           (select sum(direto + reproducao + rateado + adm) from grade g where g.fazenda_id = d.fazenda_id) fases
      from dre d
  ),
  /* o arredondamento: cada fase a 2 casas; o resíduo de centavo (só dele) vai para a maior fase e sai declarado em `ajuste` */
  fzr as (
    select fz.*, round(fz.dre_total, 2) - (round(fz.sem_fase, 2)
             + (select sum(round(direto + reproducao + rateado + adm, 2)) from grade g where g.fazenda_id = fz.fazenda_id)) ajuste,
           (select g.fase from grade g where g.fazenda_id = fz.fazenda_id
             order by abs(g.direto + g.reproducao + g.rateado + g.adm) desc, g.ordem limit 1) fase_maior
      from fz
  ),
  fzj as (
    select r.fazenda_id, r.nome, r.dre_total, r.fases, r.sem_fase, r.ajuste,
      jsonb_build_object(
        'fazenda_id', r.fazenda_id, 'nome', r.nome,
        'dre', jsonb_build_object('variavel', round(r.variavel, 2), 'fixo', round(r.fixo, 2), 'adm', round(r.adm, 2), 'total', round(r.dre_total, 2)),
        'fases', (select jsonb_agg(jsonb_build_object(
                    'fase', g.fase, 'direto', round(g.direto, 2), 'reproducao', round(g.reproducao, 2), 'rateado', round(g.rateado, 2),
                    'adm', round(g.adm, 2),
                    'total', round(g.direto + g.reproducao + g.rateado + g.adm, 2) + case when g.fase = r.fase_maior then r.ajuste else 0 end,
                    'cab_mes', g.cab_mes, 'ua_mes', round(g.ua_mes, 1),
                    'por_cab_mes', case when g.cab_mes > 0 then round((g.direto + g.reproducao + g.rateado + g.adm) / g.cab_mes, 2) end,
                    'por_ua_mes', case when g.ua_mes > 0 then round((g.direto + g.reproducao + g.rateado + g.adm) / g.ua_mes, 2) end)
                    order by g.ordem) from grade g where g.fazenda_id = r.fazenda_id),
        'sem_fase', round(r.sem_fase, 2),
        'soma', round(r.dre_total, 2),
        'diferenca', round(r.dre_total - r.fases - r.sem_fase, 6),
        'ajuste_arredondamento', r.ajuste) j
      from fzr r
  )
  select jsonb_build_object(
    'versao', 'custo-fase-01',
    'periodo', jsonb_build_object('de', p_de, 'ate', p_ate), 'cenario', p_cenario, 'base', p_base,
    'fazendas', coalesce((select jsonb_agg(j order by nome) from fzj), '[]'::jsonb),
    'sem_fase', coalesce((select jsonb_agg(x order by x->>'ano_mes', x->>'fazenda_id') from (
        select jsonb_build_object('ano_mes', am, 'fazenda_id', fazenda_id, 'valor', round(v, 2), 'motivo', motivo) x from semf
        union all
        select jsonb_build_object('ano_mes', null, 'fazenda_id', fazenda_id, 'valor', round(v, 2),
                                  'motivo', 'administrativo sem cabeças de cria, recria ou engorda no período') from adm_semf) s), '[]'::jsonb),
    'excluidos', jsonb_build_object(
        'reposicao', (select round(coalesce(sum(reposicao), 0), 2) from dre),
        'juros', (select round(coalesce(sum(juros), 0), 2) from dre),
        'investimento', (select round(coalesce(sum(investimento), 0), 2) from dre),
        'sem_fazenda', (select round(coalesce(sum(valor), 0), 2) from partes where fazenda_id is null or fazenda_id not in (select fazenda_id from dre)),
        'cabecas_fora', coalesce((select jsonb_agg(jsonb_build_object('ano_mes', am, 'fazenda_id', fazenda_id, 'pasto_id', pasto_id, 'uso', uso, 'cab', cab)
                                   order by am, fazenda_id, pasto_id)
                                   from bp where uso is null or uso not in ('cria', 'recria', 'engorda')), '[]'::jsonb)),
    'prova', jsonb_build_object(
        'dre_total', (select round(coalesce(sum(dre_total), 0), 2) from fzj),
        'soma', (select round(coalesce(sum(fases + sem_fase), 0), 2) from fzj),
        'diferenca', (select round(coalesce(sum(dre_total - fases - sem_fase), 0), 6) from fzj),
        'ajuste_arredondamento', (select coalesce(sum(ajuste), 0) from fzj),
        'confere', (select coalesce(bool_and(abs(dre_total - fases - sem_fase) < 0.005), true) from fzj)))
  into v_res;
  return v_res;
end $f$;

comment on function public.fn_custo_por_fase(uuid, text, text, text, text) is
  'CUSTO-FASE-01: o custo da fazenda do DRE da pecuária (variável + fixo + administrativo) dividido em cria/recria/engorda + sem fase; prova = soma das fases × DRE.';
revoke all on function public.fn_custo_por_fase(uuid, text, text, text, text) from public, anon;
grant execute on function public.fn_custo_por_fase(uuid, text, text, text, text) to authenticated;
