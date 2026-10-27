-- P109 (FIN-META-01, decisao 2 do Gabriel 26/10) — o DRE le' a meta da fn_meta_linhas (regime 'competencia'), casando a digitada
-- pela plano_conta_id (fim do casamento por TEXTO subcentro + escopo). O espelho da v2 nao vem daqui (o DRE ja' o le' por conta
-- propria, no `fin`/`ln`). ENSAIO (26/10, NJ, Agnaldo, Vera, Raul e os outros 2 clientes com meta; 2024, 2025, 2026 e out/26): o DRE
-- IGUAL ao de antes, escalar a escalar e centro a centro, e o drill de 2026 com as mesmas linhas e somas — as ~200 linhas digitadas cujo
-- texto difere da plano_conta_id (dividendos digitados como pecuaria, entradas de financiamento) caem em contas SEM bloco do DRE, entao
-- nao o mudam (a lista vai no relatorio; nenhum texto nem chave foi corrigido).
--   · fn_dre_pecuaria: o `plm` (digitada por texto + calculada) vira UMA leitura da fn_meta_linhas.
--   · O DRE NAO le^ os PROJETOS de investimento (nunca leu; entrariam no bloco investimento — NJ 2026 R$ 761.000,00): fica para a
--     decisao do Gabriel; nem o espelho (ja' lido pelo `fin`).
--   · fn_dre_pecuaria_lancamentos (o drill): o `pl` (digitada por texto) e o `pc` (calculada) viram UMA leitura; a linha leva o
--     id da fonte (`origem_id`) e a origem de antes ('planejamento' ou 'calculado').
-- Aplicada por ANCORA sobre o pg_get_functiondef do banco (os corpos sao grandes): cada ancora tem de casar UMA vez e o corpo de
-- partida e' conferido pelo md5 (dre 5a60b80e, drill a20ccf43).
SET LOCAL lock_timeout = '2s';
DO $p$
DECLARE d text; v_old text; v_new text; n int;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_dre_pecuaria(uuid, text, text, text)'::regprocedure) IS DISTINCT FROM '5a60b80e5ad9ded68f5d4c3e1e45fd83'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_dre_pecuaria_lancamentos(uuid, uuid, text, text, text, text, text)'::regprocedure) IS DISTINCT FROM 'a20ccf43fd540164fe7880fc1c0d7236' THEN
    RAISE EXCEPTION 'DRE: corpo de origem inesperado.';
  END IF;

  -- ── fn_dre_pecuaria: o plm ──
  d := pg_get_functiondef('public.fn_dre_pecuaria(uuid, text, text, text)'::regprocedure);
  v_old := $a$  with plm as (
    select pf.id, pf.fazenda_id, make_date(pf.ano, pf.mes, 1) comp, pf.valor_planejado valor, pf.subcentro,
           p.bloco_dre, p.centro_custo, p.escopo_negocio, p.tipo_operacao, p.macro_custo
    from planejamento_financeiro pf
    join financeiro_plano_contas p on p.subcentro=pf.subcentro and p.escopo_negocio=pf.escopo_negocio
         and (p.cliente_id is null or p.cliente_id=pf.cliente_id) and p.ativo
    where p_cenario='meta' and pf.cenario='meta' and pf.cliente_id=p_cliente
      and make_date(pf.ano, pf.mes, 1) between v_ini and v_fim
    union all
    select null::uuid as id, c.fazenda_id, make_date(y.ano, c.mes, 1) comp, c.valor valor, p.subcentro,
           p.bloco_dre, p.centro_custo, p.escopo_negocio, p.tipo_operacao, p.macro_custo
    from generate_series(extract(year from v_ini)::int, extract(year from v_fim)::int) as y(ano)
    cross join lateral public.fn_meta_calculada_pecuaria(p_cliente, y.ano) c
    join financeiro_plano_contas p on p.ordem_exibicao=c.ordem and p.escopo_negocio='pecuaria'
         and p.cliente_id is null and p.ativo
    where p_cenario='meta' and make_date(y.ano, c.mes, 1) between v_ini and v_fim
  ),
$a$;
  v_new := $a$  with plm as (
    /* P109 — a meta do DRE e' a fn_meta_linhas em competencia (digitada pela plano_conta_id + calculada), sem o espelho da v2 */
    select ml.origem_id as id, ml.fazenda_id, make_date(y.ano, ml.mes, 1) comp, ml.valor valor, p.subcentro,
           p.bloco_dre, p.centro_custo, p.escopo_negocio, p.tipo_operacao, p.macro_custo
    from generate_series(extract(year from v_ini)::int, extract(year from v_fim)::int) as y(ano)
    cross join lateral public.fn_meta_linhas(p_cliente, y.ano, 'competencia') ml
    join financeiro_plano_contas p on p.id = ml.plano_conta_id
    where p_cenario='meta' and ml.origem <> 'espelho' and ml.origem_detalhe not like 'projeto de investimento%'
      and make_date(y.ano, ml.mes, 1) between v_ini and v_fim
  ),
$a$;
  n := (length(d) - length(replace(d, v_old, ''))) / length(v_old);
  IF n <> 1 THEN RAISE EXCEPTION 'fn_dre_pecuaria: a ancora do plm casou % vezes.', n; END IF;
  EXECUTE replace(d, v_old, v_new);

  -- ── fn_dre_pecuaria_lancamentos: o pl e o pc ──
  d := pg_get_functiondef('public.fn_dre_pecuaria_lancamentos(uuid, uuid, text, text, text, text, text)'::regprocedure);
  v_old := $a$pl as (
select jsonb_build_object('id', pf.id, 'data', make_date(pf.ano, pf.mes, 1), 'pagamento', null, 'descricao', pf.subcentro, 'favorecido', null,
  'valor', case when p.bloco_dre='venda' and p.tipo_operacao='2-Saídas' then -pf.valor_planejado else pf.valor_planejado end, 'status', null, 'fazenda', fz.nome, 'fazenda_id', pf.fazenda_id, 'centro', p.centro_custo, 'subcentro', p.subcentro, 'bloco', p.bloco_dre, 'documento', null,
  'origem', 'planejamento') j,
  make_date(pf.ano, pf.mes, 1) d, pf.subcentro s
from planejamento_financeiro pf join per on true
join financeiro_plano_contas p on p.subcentro=pf.subcentro and p.escopo_negocio=pf.escopo_negocio
     and (p.cliente_id is null or p.cliente_id=pf.cliente_id) and p.ativo
left join fazendas fz on fz.id=pf.fazenda_id
where p_cenario='meta' and pf.cenario='meta' and pf.cliente_id=p_cliente and p.escopo_negocio='pecuaria' and p.bloco_dre is not null
  and make_date(pf.ano, pf.mes, 1) between per.v_ini and per.v_fim
  and ((p.bloco_dre in ('venda','receita') and p.tipo_operacao='1-Entradas') or (p.bloco_dre<>'receita' and p.tipo_operacao='2-Saídas'))
  and (p_fazenda is null or pf.fazenda_id=p_fazenda)
  and (p_bloco is null or p.bloco_dre=p_bloco)
  and (p_centro is null or coalesce(p.centro_custo,'(sem)')=p_centro)
),
pc as (
select jsonb_build_object('id', null, 'data', make_date(y.ano, c.mes, 1), 'pagamento', null, 'descricao', p.subcentro || ' (meta calculada)', 'favorecido', null,
  'valor', case when p.bloco_dre='venda' and p.tipo_operacao='2-Saídas' then -c.valor else c.valor end, 'status', null, 'fazenda', fz.nome, 'fazenda_id', c.fazenda_id, 'centro', p.centro_custo, 'subcentro', p.subcentro, 'bloco', p.bloco_dre, 'documento', null,
  'origem', 'calculado') j,
  make_date(y.ano, c.mes, 1) d, p.subcentro s
from per
cross join lateral generate_series(extract(year from per.v_ini)::int, extract(year from per.v_fim)::int) as y(ano)
cross join lateral public.fn_meta_calculada_pecuaria(p_cliente, y.ano) c
join financeiro_plano_contas p on p.ordem_exibicao=c.ordem and p.escopo_negocio='pecuaria'
     and p.cliente_id is null and p.ativo
left join fazendas fz on fz.id=c.fazenda_id
where p_cenario='meta' and p.bloco_dre is not null
  and make_date(y.ano, c.mes, 1) between per.v_ini and per.v_fim
  and ((p.bloco_dre in ('venda','receita') and p.tipo_operacao='1-Entradas') or (p.bloco_dre<>'receita' and p.tipo_operacao='2-Saídas'))
  and (p_fazenda is null or c.fazenda_id=p_fazenda)
  and (p_bloco is null or p.bloco_dre=p_bloco)
  and (p_centro is null or coalesce(p.centro_custo,'(sem)')=p_centro)
)
select coalesce(jsonb_agg(j order by d, s), '[]'::jsonb) from (select j, d, s from ln union all select j, d, s from pl union all select j, d, s from pc) u$a$;
  v_new := $a$pl as (
/* P109 — a meta do drill e' a fn_meta_linhas em competencia (digitada pela plano_conta_id + calculada), sem o espelho da v2 */
select jsonb_build_object('id', ml.origem_id, 'data', make_date(y.ano, ml.mes, 1), 'pagamento', null,
  'descricao', case when ml.origem like 'calculada:%' then p.subcentro || ' (meta calculada)' else p.subcentro end, 'favorecido', null,
  'valor', case when p.bloco_dre='venda' and p.tipo_operacao='2-Saídas' then -ml.valor else ml.valor end, 'status', null, 'fazenda', fz.nome, 'fazenda_id', ml.fazenda_id, 'centro', p.centro_custo, 'subcentro', p.subcentro, 'bloco', p.bloco_dre, 'documento', null,
  'origem', case when ml.origem like 'calculada:%' then 'calculado' else 'planejamento' end) j,
  make_date(y.ano, ml.mes, 1) d, p.subcentro s
from per
cross join lateral generate_series(extract(year from per.v_ini)::int, extract(year from per.v_fim)::int) as y(ano)
cross join lateral public.fn_meta_linhas(p_cliente, y.ano, 'competencia') ml
join financeiro_plano_contas p on p.id = ml.plano_conta_id
left join fazendas fz on fz.id=ml.fazenda_id
where p_cenario='meta' and ml.origem <> 'espelho' and ml.origem_detalhe not like 'projeto de investimento%' and p.escopo_negocio='pecuaria' and p.bloco_dre is not null
  and make_date(y.ano, ml.mes, 1) between per.v_ini and per.v_fim
  and ((p.bloco_dre in ('venda','receita') and p.tipo_operacao='1-Entradas') or (p.bloco_dre<>'receita' and p.tipo_operacao='2-Saídas'))
  and (p_fazenda is null or ml.fazenda_id=p_fazenda)
  and (p_bloco is null or p.bloco_dre=p_bloco)
  and (p_centro is null or coalesce(p.centro_custo,'(sem)')=p_centro)
)
select coalesce(jsonb_agg(j order by d, s), '[]'::jsonb) from (select j, d, s from ln union all select j, d, s from pl) u$a$;
  n := (length(d) - length(replace(d, v_old, ''))) / length(v_old);
  IF n <> 1 THEN RAISE EXCEPTION 'fn_dre_pecuaria_lancamentos: a ancora do pl/pc casou % vezes.', n; END IF;
  EXECUTE replace(d, v_old, v_new);
END $p$;
