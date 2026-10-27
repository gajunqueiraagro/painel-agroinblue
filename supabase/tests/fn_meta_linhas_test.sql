-- P109 (FIN-META-01) — a META tem UM dono: fn_meta_linhas (migrations 111956..111959). Como `authenticated` (admin); TERMINA EM RAISE.
-- NJ, Agnaldo, Vera e Raul, 2026.
--   T1 a Visao Geral (fn_vg_meta, caixa) = TODAS as fontes recontadas POR FORA, direto das tabelas: planejamento (pela conta do
--      plano) + calculada do rebanho em caixa (P120: SEM o espelho da v2 — nada de lancamento META do financeiro) + PROJETOS (macro/grupo/centro/subcentro,
--      conta unica) + ADIANTAMENTO DE BOITEL (5010, mes do adiantamento) + PARCELAS de natureza 'financiamento'/'consorcio' (principal
--      na conta da parcela, juros em 7010/12010), pelo vencimento. MUTACOES: m1 com a compra parcelada ('parcelamento'); m2 sem os
--      projetos; m3 o adiantamento em dobro. Cada uma tem de acusar diferenca onde a fonte existe.
--   T2 NJ: a Nutricao da Visao Geral (caixa) = R$ 3.920.235,00 (criterio 1: a compra parcelada nao entra).
--   T3 COMPETENCIA (o DRE): nenhum projeto, adiantamento ou parcela; a digitada = as linhas do planejamento, uma a uma.
--   T4 a TELA DE META = a Visao Geral: a soma da fn_meta_linhas(caixa) por subcentro x mes (a regra unica de juntar do front: tudo
--      soma, pela conta do plano) = a fn_vg_meta no subcentro (criterio 3).
--   T6 (P120) nenhuma linha da meta vem de lancamento META do financeiro (pelo origem_id, nos dois regimes) e a DEDUCAO do DRE Meta = a
--      deducao calculada da fn_meta_linhas (competencia). Mutacao m6: somar de volta a deducao da v2 meta tem de diferir (difere nos 4).
--   T5 o adiantamento NAO DOBRA a venda: a "Venda em Boitel" (1150) da VG = a calculada 1150 em caixa (as parcelas da venda), e o
--      5010 = os adiantamentos; nada do adiantamento cai no 1150.
-- Rodado em 27/10/2026: T1 0 diferentes em NJ 444 / Agnaldo 195 / Vera 407 / Raul 205 celulas (m1 69/40/28/0 — o Raul nao tem compra
-- parcelada em 2026; m2 20/0/8/4 — o Agnaldo nao tem projeto; m3 0/0/2/0 — so' a Vera tem adiantamento); T2 3.920.235,00; T3 0 fora e 0
-- digitadas diferentes nos quatro; T4 0 nos quatro (m4 1/5/2/3); T5 Vera 1150 1.298.987,53 = calculada, 5010 220.662,20 = adiantamentos;
-- (antes do P120 o espelho entrava: 12 linhas em caixa.) Rodado de novo em 27/10, depois da 111963: T1 0 nos quatro (m1 69/40/28/0; m2
-- 20/0/8/4; m3 0/0/2/0); T4 0 (444/195/407/205); T6 0 linhas da v2 meta; DRE deducoes = calculada: NJ 96.255, Agnaldo 54.945, Vera
-- 21.840, Raul 15.255 (m6: 97.137,82 / 128.152,17 / 27.763,55 / 24.555 — todas diferentes).
set local statement_timeout = '600s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

create function pg_temp.esperada(k uuid, nat text[], projetos boolean, boitel numeric)
returns table(grupo text, sub text, am text, v numeric) language sql as $f$
  select g, s, am, round(sum(v), 2) from (
    select coalesce(pc.grupo_fluxo, 'x') g, pc.subcentro s, to_char(make_date(pf.ano, pf.mes, 1), 'YYYY-MM') am, abs(pf.valor_planejado) v, pc.tipo_operacao t
      from planejamento_financeiro pf join financeiro_plano_contas pc on pc.id = pf.plano_conta_id
     where pf.cliente_id = k and pf.cenario = 'meta' and pf.ano = 2026
    union all
    select coalesce(pc.grupo_fluxo, 'x'), pc.subcentro, to_char(make_date(2026, c.mes, 1), 'YYYY-MM'), abs(c.valor), pc.tipo_operacao
      from fn_meta_calculada_pecuaria(k, 2026, 'caixa') c
      join financeiro_plano_contas pc on pc.ordem_exibicao = c.ordem and pc.escopo_negocio = 'pecuaria' and pc.cliente_id is null and pc.ativo
    union all
    select coalesce(pc.grupo_fluxo, 'x'), pc.subcentro, to_char(make_date(2026, x.mes, 1), 'YYYY-MM'), abs(x.v), pc.tipo_operacao
      from meta_projetos_investimento m
      cross join lateral (values (1, m.jan), (2, m.fev), (3, m.mar), (4, m.abr), (5, m.mai), (6, m.jun),
                                 (7, m.jul), (8, m.ago), (9, m."set"), (10, m."out"), (11, m.nov), (12, m.dez)) x(mes, v)
      join financeiro_plano_contas pc on pc.ativo and (pc.cliente_id is null or pc.cliente_id = m.cliente_id) and pc.macro_custo = m.macro_custo
           and pc.grupo_custo = m.grupo_custo and pc.centro_custo = m.centro_custo and pc.subcentro = m.subcentro
     where projetos and m.cliente_id = k and m.ano = 2026 and m.status is distinct from 'cancelado' and coalesce(x.v, 0) <> 0
    union all
    select coalesce(pc.grupo_fluxo, 'x'), pc.subcentro, left(l.detalhes_snapshot -> 'boitelSnapshot' ->> 'dataAdiantamento', 7),
           boitel * (l.detalhes_snapshot -> 'boitelSnapshot' ->> 'valorTotalAntecipado')::numeric, pc.tipo_operacao
      from lancamentos l join fazendas f on f.id = l.fazenda_id and f.cliente_id = k
      join financeiro_plano_contas pc on pc.ordem_exibicao = 5010 and pc.escopo_negocio = 'pecuaria' and pc.cliente_id is null and pc.ativo
     where l.cliente_id = k and l.cenario = 'meta' and not l.cancelado and l.tipo = 'venda' and l.valor_total is not null
       and (l.detalhes_snapshot -> 'boitelSnapshot' ->> 'possuiAdiantamento') = 'true'
       and jsonb_typeof(l.detalhes_snapshot -> 'boitelSnapshot' -> 'valorTotalAntecipado') = 'number'
       and (l.detalhes_snapshot -> 'boitelSnapshot' ->> 'valorTotalAntecipado')::numeric > 0
       and left(l.detalhes_snapshot -> 'boitelSnapshot' ->> 'dataAdiantamento', 4) = '2026'
    union all
    select coalesce(pc.grupo_fluxo, 'x'), pc.subcentro, to_char(fp.data_vencimento, 'YYYY-MM'), y.v, pc.tipo_operacao
      from financiamento_parcelas fp join financiamentos fi on fi.id = fp.financiamento_id and fi.cliente_id = k and fi.natureza = any (nat)
      cross join lateral (values (fi.plano_conta_parcela_id, abs(coalesce(fp.valor_principal, 0))),
                                 ((select j.id from financeiro_plano_contas j where j.cliente_id is null and j.ativo
                                    and j.ordem_exibicao = case when fi.tipo_financiamento = 'agricultura' then 12010 else 7010 end), abs(coalesce(fp.valor_juros, 0)))) y(conta, v)
      join financeiro_plano_contas pc on pc.id = y.conta
     where fp.status is distinct from 'cancelado' and y.v > 0 and fp.data_vencimento between '2026-01-01' and '2026-12-31') z
  where t in ('1-Entradas', '2-Saídas')
  group by 1, 2, 3
$f$;

create function pg_temp.t1(k uuid, nat text[] default array['financiamento','consorcio'], projetos boolean default true, boitel numeric default 1)
returns int language sql as $f$
  with vg as (select coalesce(grupo, 'x') g, subcentro s, ano_mes am, meta v from fn_vg_meta(k, '2026-01-01', '2026-12-31') where nivel = 'subcentro'),
       e as (select * from pg_temp.esperada(k, nat, projetos, boitel))
  select count(*)::int from vg full join e on e.grupo = vg.g and e.sub = vg.s and e.am = vg.am where vg.v is distinct from e.v
$f$;

create function pg_temp.t4(k uuid) returns text language sql as $f$
  with tela as (select pc.subcentro s, to_char(make_date(2026, ml.mes, 1), 'YYYY-MM') am, round(sum(abs(ml.valor)), 2) v
                  from fn_meta_linhas(k, 2026, 'caixa') ml join financeiro_plano_contas pc on pc.id = ml.plano_conta_id
                 where pc.tipo_operacao in ('1-Entradas', '2-Saídas') group by 1, 2),
       vg as (select subcentro s, ano_mes am, sum(meta) v from fn_vg_meta(k, '2026-01-01', '2026-12-31') where nivel = 'subcentro' group by 1, 2)
  select format('%s/%s', count(*) filter (where tela.v is distinct from vg.v), count(*)) from tela full join vg using (s, am)
$f$;

do $$
declare
  k uuid; r text := ''; nut numeric; c3 int; d3 int; v1150 numeric; c1150 numeric; v5010 numeric; a5010 numeric; esp int := 0;
  dre numeric; calc numeric; v2 numeric; t6 text := '';
  ks uuid[] := array['f2d67cd4-24d0-456f-a079-a3281dcce7fd','a2d41cda-eb1e-4527-a6cf-a1b9663339e2',
                     'a1b2c3d4-e5f6-7890-abcd-ef1234567890','a6793f65-7005-458f-95e5-d195f8cf7631']::uuid[];
begin
  foreach k in array ks loop
    select count(*) into c3 from fn_meta_linhas(k, 2026, 'competencia')
     where origem = 'calculada:financiamento' or origem_detalhe like 'projeto%' or origem_detalhe = 'adiantamento de boitel';
    select count(*) into d3 from (select origem_id, mes, valor from fn_meta_linhas(k, 2026, 'competencia') where origem = 'digitada'
                                  except all select id, mes, valor_planejado from planejamento_financeiro where cliente_id = k and cenario = 'meta' and ano = 2026) z;
    d3 := d3 + (select count(*) from (select id, mes, valor_planejado from planejamento_financeiro where cliente_id = k and cenario = 'meta' and ano = 2026
                                      except all select origem_id, mes, valor from fn_meta_linhas(k, 2026, 'competencia') where origem = 'digitada') z);
    /* T6 (P120): nenhuma linha da meta vem de um lancamento META do financeiro (pelo origem_id), nos dois regimes */
    esp := esp + (select count(*) from (select origem_id from fn_meta_linhas(k, 2026, 'caixa') union all select origem_id from fn_meta_linhas(k, 2026, 'competencia')) m
                   join financeiro_lancamentos_v2 l on l.id = m.origem_id and l.cenario = 'meta');
    /* T6: a deducao do DRE Meta = a deducao CALCULADA da fn_meta_linhas (competencia); m6: somar a v2 meta de volta tem de diferir */
    dre := (fn_dre_pecuaria(k, '2026-01', '2026-12', 'meta') -> 'total' ->> 'deducoes')::numeric;
    select coalesce(sum(ml.valor), 0) into calc from fn_meta_linhas(k, 2026, 'competencia') ml join financeiro_plano_contas p on p.id = ml.plano_conta_id
     where p.bloco_dre = 'deducao' and p.escopo_negocio = 'pecuaria';
    select coalesce(sum(abs(l.valor)), 0) into v2 from financeiro_lancamentos_v2 l join financeiro_plano_contas p on p.id = l.plano_conta_id
     where l.cliente_id = k and l.cenario = 'meta' and coalesce(l.cancelado, false) = false and p.bloco_dre = 'deducao' and l.data_competencia between '2026-01-01' and '2026-12-31';
    t6 := format('DRE %s = calculada %s (%s); m6 com a v2 meta %s (%s)', dre, calc, dre = calc, calc + v2, (calc + v2) = dre);
    r := r || format(' | %s: T1 %s (m1 %s, m2 %s, m3 %s); T3 %s fora, digitada %s diferentes; T4 %s; T6 %s', left(k::text, 4),
                     pg_temp.t1(k), pg_temp.t1(k, array['financiamento','consorcio','parcelamento']), pg_temp.t1(k, projetos => false),
                     pg_temp.t1(k, boitel => 2), c3, d3, pg_temp.t4(k), t6);
  end loop;
  select sum(meta) into nut from fn_vg_meta(ks[1], '2026-01-01', '2026-12-31') where nivel = 'subcentro' and centro = 'Nutrição' and subcentro = 'Nutrição';
  select coalesce(sum(meta), 0) into v1150 from fn_vg_meta(ks[3], '2026-01-01', '2026-12-31') where nivel = 'subcentro' and subcentro = 'Venda em Boitel';
  select coalesce(sum(valor), 0) into c1150 from fn_meta_calculada_pecuaria(ks[3], 2026, 'caixa') where ordem = 1150;
  select coalesce(sum(meta), 0) into v5010 from fn_vg_meta(ks[3], '2026-01-01', '2026-12-31') where nivel = 'subcentro' and subcentro = 'Adiantamento de Boitel';
  select coalesce(sum(valor), 0) into a5010 from fn_meta_linhas(ks[3], 2026, 'caixa') where origem_detalhe = 'adiantamento de boitel';
  raise exception 'P109 | T2 NJ nutricao caixa % | T5 Vera 1150 VG % = calculada % ; 5010 VG % = adiantamentos % | T6 linhas vindas de lancamento META do financeiro: % %',
    nut, v1150, c1150, v5010, a5010, esp, r;
end $$;
