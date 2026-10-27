-- P108 — a META da Visao Geral = a do DRE (migration 20261028111955). Como `authenticated` (admin); TERMINA EM RAISE: nada fica.
-- NJ, Agnaldo, Vera e Raul.
--   T1 o DRE nao muda: a fn_meta_calculada_pecuaria de DOIS argumentos (a que o DRE chama) = a de 'competencia', 2025–2027, linha a
--      linha (o DRE antes x depois, por md5 do jsonb, foi provado no ensaio: 0 diferencas nos 4, ano e out/26).
--   T2 NJ 2026: a meta da Nutricao na Visao Geral = R$ 3.920.235,00 no ano e, mes a mes, a 8045 da funcao calculada.
--   T3 NAO DOBRA (a regra do DRE): toda meta de subcentro x mes da fn_vg_meta (2026) = planejamento (pelo plano) + calculada em CAIXA
--      (pela ordem_exibicao do plano padrao) + espelho v2 da deducao — recontado aqui, por fora; manual e calculada no mesmo
--      subcentro/mes SOMAM (como no `plm` do DRE): NJ Abates de Machos e de Femeas e Vera 5030 sao os casos reais.
--   T4 o CAIXA recontado por fora, direto dos lancamentos: avista na `data`, prazo nas parcelas validas (mes da parcela) — 2026.
--   MUTACOES (no proprio teste): m1 a esperada em COMPETENCIA (a VG de outro regime); m2 a calculada em DOBRO; m3 sem o espelho da
--      deducao; m4 o DRE lendo o CAIXA (T1). Cada uma tem de acusar diferenca.
-- Rodado em 26/10/2026: T1 0 em 12 (m4: 3 em 12); T2 3.920.235,00 e 0 meses diferentes; T3 0 diferentes em NJ 417 / Agnaldo 186 /
-- Vera 391 / Raul 201 celulas (m1 6/2/6/0 — o Raul nao tem prazo; m2 33/32/35/22; m3 1/5/2/3); T4 0 diferentes nos quatro. NJ: a
-- ponte competencia → caixa e' valor_total − parcelas dos prazo = R$ 378.839,99 (nenhuma parcela da NJ cai em 2027).
-- P109 (27/10/2026): a VG le' a fn_meta_linhas; o T3 soma as fontes novas (projetos, adiantamento de boitel, financiamento) como a
-- funcao as devolve (recontadas por fora em fn_meta_linhas_test.sql). Rodado: T3 0 diferentes em NJ 444 / Agnaldo 195 / Vera 407 /
-- Raul 205 (m1 6/2/6/0; m2 33/32/35/22; m3 1/5/2/3); T2 3.920.235,00.
-- P120 (111963): a VG nao le^ mais o espelho da v2 meta — o T3 conta SEM ele (espelho = false) e o m3 passa a ser "com o espelho" (tem
-- de diferir onde houver lancamento META de deducao no financeiro).
set local statement_timeout = '600s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

create function pg_temp.esperada(k uuid, regime text, vezes int, espelho boolean)
returns table(grupo text, sub text, am text, v numeric) language sql as $f$
  select g, s, am, round(sum(v), 2) from (
    select coalesce(pc.grupo_fluxo, 'x') g, pc.subcentro s, to_char(make_date(pf.ano, pf.mes, 1), 'YYYY-MM') am, abs(pf.valor_planejado) v
      from planejamento_financeiro pf join financeiro_plano_contas pc on pc.id = pf.plano_conta_id
     where pf.cliente_id = k and pf.cenario = 'meta' and pc.tipo_operacao in ('1-Entradas', '2-Saídas') and pf.ano = 2026
    union all
    select coalesce(pc.grupo_fluxo, 'x'), pc.subcentro, to_char(make_date(2026, c.mes, 1), 'YYYY-MM'), abs(c.valor) * vezes
      from fn_meta_calculada_pecuaria(k, 2026, regime) c
      join financeiro_plano_contas pc on pc.ordem_exibicao = c.ordem and pc.escopo_negocio = 'pecuaria' and pc.cliente_id is null and pc.ativo
    union all
    select coalesce(pc.grupo_fluxo, 'x'), pc.subcentro, to_char(coalesce(l.data_vencimento, l.data_competencia), 'YYYY-MM'), abs(l.valor)
      from financeiro_lancamentos_v2 l join financeiro_plano_contas pc on pc.id = l.plano_conta_id
     where espelho and l.cliente_id = k and l.cenario = 'meta' and coalesce(l.cancelado, false) = false
       and l.origem_lancamento = 'movimentacao_rebanho' and pc.bloco_dre = 'deducao'
       and coalesce(l.data_vencimento, l.data_competencia) between '2026-01-01' and '2026-12-31'
    /* P109 — a VG passou a ler a fn_meta_linhas, que traz TAMBEM projetos, adiantamento de boitel e parcelas de financiamento (caixa);
       recontados por fora em `fn_meta_linhas_test.sql` (T1). Aqui entram como vem, para o T3 seguir provando as tres fontes do P108. */
    union all
    select coalesce(pc.grupo_fluxo, 'x'), pc.subcentro, to_char(make_date(2026, ml.mes, 1), 'YYYY-MM'), abs(ml.valor)
      from fn_meta_linhas(k, 2026, 'caixa') ml join financeiro_plano_contas pc on pc.id = ml.plano_conta_id
     where pc.tipo_operacao in ('1-Entradas', '2-Saídas')
       and (ml.origem = 'calculada:financiamento' or ml.origem_detalhe like 'projeto%' or ml.origem_detalhe = 'adiantamento de boitel')) z
  group by 1, 2, 3
$f$;

create function pg_temp.t3(k uuid, regime text default 'caixa', vezes int default 1, espelho boolean default false) returns text language sql as $f$
  with vg as (select coalesce(grupo, 'x') g, subcentro s, ano_mes am, meta v from fn_vg_meta(k, '2026-01-01', '2026-12-31') where nivel = 'subcentro'),
       e as (select * from pg_temp.esperada(k, regime, vezes, espelho))
  select format('%s celulas, %s diferentes', count(*), count(*) filter (where vg.v is distinct from e.v))
    from vg full join e on e.grupo = vg.g and e.sub = vg.s and e.am = vg.am
$f$;

create function pg_temp.t4(k uuid) returns text language sql as $f$
  with l as (
    select l.*, coalesce(l.detalhes_snapshot ->> 'formaReceb', l.detalhes_snapshot ->> 'formaPag') forma,
           case when l.tipo = 'abate' and l.categoria in ('touros','bois','garrotes','machos','bezerros_m','mamotes_m','desmama_m') then 1020
                when l.tipo = 'abate' and l.categoria in ('vacas','novilhas','bezerras_f','desmama_f','femeas','mamotes_f') then 1010
                when l.tipo = 'venda' and (l.boitel_lote_id is not null or jsonb_typeof(l.detalhes_snapshot -> 'boitelSnapshot') = 'object') then 1150
                when l.tipo = 'venda' and l.categoria in ('desmama_m','bezerros_m') then 1120
                when l.tipo = 'venda' and l.categoria in ('desmama_f','bezerras_f') then 1110
                when l.tipo = 'venda' and l.categoria in ('garrotes','touros','bois','machos_adultos','mamotes_m') then 1140
                when l.tipo = 'venda' and l.categoria in ('novilhas','vacas','femeas_adultas','mamotes_f') then 1130
                when l.tipo = 'compra' and l.categoria in ('garrotes','touros','bois','machos','bezerros_m','mamotes_m','desmama_m') then 15020
                when l.tipo = 'compra' and l.categoria in ('novilhas','vacas','femeas','bezerras_f','mamotes_f','desmama_f') then 15010 end ordem
      from lancamentos l join fazendas f on f.id = l.fazenda_id and f.cliente_id = k
     where l.cliente_id = k and l.cenario = 'meta' and not l.cancelado and l.valor_total is not null and l.tipo in ('abate','venda','compra')
  ), d as (
    select ordem, to_char(data, 'YYYY-MM') am, abs(valor_total) v from l where forma = 'avista'
    union all
    select ordem, left(p ->> 'data', 7), abs((p ->> 'valor')::numeric) from l, jsonb_array_elements(l.detalhes_snapshot -> 'parcelas') p
     where forma = 'prazo' and jsonb_typeof(l.detalhes_snapshot -> 'parcelas') = 'array'
       and jsonb_typeof(p -> 'data') = 'string' and length(p ->> 'data') >= 10 and jsonb_typeof(p -> 'valor') = 'number'
  ), e as (select ordem, am, round(sum(v), 2) v from d where ordem is not null and left(am, 4) = '2026' group by 1, 2),
     f as (select ordem, to_char(make_date(2026, mes, 1), 'YYYY-MM') am, sum(valor) v from fn_meta_calculada_pecuaria(k, 2026, 'caixa')
            where ordem between 1000 and 1999 or ordem between 15000 and 15999 group by 1, 2)
  select format('%s celulas, %s diferentes, caixa R$ %s', count(*), count(*) filter (where e.v is distinct from f.v), sum(f.v))
    from e full join f on f.ordem = e.ordem and f.am = e.am
$f$;

do $$
declare
  k uuid; t1 int := 0; t1m int := 0; r text := ''; nut numeric; nutm int; dif numeric; ano int;
  ks uuid[] := array['f2d67cd4-24d0-456f-a079-a3281dcce7fd','a2d41cda-eb1e-4527-a6cf-a1b9663339e2',
                     'a1b2c3d4-e5f6-7890-abcd-ef1234567890','a6793f65-7005-458f-95e5-d195f8cf7631']::uuid[];
begin
  foreach k in array ks loop
    foreach ano in array array[2025, 2026, 2027] loop
      if (select array_agg(c::text order by c::text) from fn_meta_calculada_pecuaria(k, ano) c)
         is distinct from (select array_agg(c::text order by c::text) from fn_meta_calculada_pecuaria(k, ano, 'competencia') c) then t1 := t1 + 1; end if;
      if (select array_agg(c::text order by c::text) from fn_meta_calculada_pecuaria(k, ano) c)
         is distinct from (select array_agg(c::text order by c::text) from fn_meta_calculada_pecuaria(k, ano, 'caixa') c) then t1m := t1m + 1; end if;
    end loop;
    r := r || format(' | %s: T3 %s; m1 %s; m2 %s; m3 %s; T4 %s', left(k::text, 4), pg_temp.t3(k), pg_temp.t3(k, 'competencia'), pg_temp.t3(k, 'caixa', 2),
                     pg_temp.t3(k, 'caixa', 1, true), pg_temp.t4(k));
  end loop;
  select sum(meta) into nut from fn_vg_meta(ks[1], '2026-01-01', '2026-12-31') where nivel = 'subcentro' and centro = 'Nutrição' and subcentro = 'Nutrição';
  select count(*) into nutm from (select ano_mes, sum(meta) v from fn_vg_meta(ks[1], '2026-01-01', '2026-12-31') where nivel = 'subcentro' and centro = 'Nutrição' and subcentro = 'Nutrição' group by 1) a
    full join (select to_char(make_date(2026, mes, 1), 'YYYY-MM') am, sum(valor) v from fn_meta_calculada_pecuaria(ks[1], 2026) where ordem = 8045 group by 1) b on b.am = a.ano_mes
   where a.v is distinct from b.v;
  /* a ponte competencia → caixa (NJ 2026): valor_total − soma das parcelas validas dos prazo do ano */
  select sum(l.valor_total - coalesce((select sum((p ->> 'valor')::numeric) from jsonb_array_elements(l.detalhes_snapshot -> 'parcelas') p
                                        where jsonb_typeof(p -> 'valor') = 'number'), 0)) into dif
    from lancamentos l where l.cliente_id = ks[1] and l.cenario = 'meta' and not l.cancelado and l.valor_total is not null and l.tipo in ('abate','venda','compra')
     and l.data between '2026-01-01' and '2026-12-31' and coalesce(l.detalhes_snapshot ->> 'formaReceb', l.detalhes_snapshot ->> 'formaPag') = 'prazo';
  raise exception 'P108 | T1 dois argumentos = competencia: % diferencas em 12 (m4 caixa: % em 12) | T2 NJ nutricao ano % (meses diferentes %) | NJ prazo valor_total − parcelas = % %',
    t1, t1m, nut, nutm, dif, r;
end $$;
