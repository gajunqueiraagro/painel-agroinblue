-- P108 (Gabriel 26/10/2026) — a META da Visao Geral = a do DRE (conserto A). Causa: fn_vg_meta (111901) le' so' o
-- planejamento_financeiro; as metas CALCULADAS so' existem na fn_meta_calculada_pecuaria (que o DRE usa).
-- (1) fn_meta_calculada_pecuaria(cliente, ano, p_regime): 'competencia' | 'caixa' (receita e reposicao pela data de RECEBIMENTO,
--     parcelas do detalhes_snapshot, regra transcrita do TS da tela de meta). Corpo de 131000 (md5 do banco ae4b2e11); plpgsql so'
--     para recusar regime invalido. A de DOIS argumentos (a que o DRE chama) vira a mesma em 'competencia' — o padrao; o DRE nao muda.
-- (2) fn_vg_meta = planejamento + calculada(caixa) no subcentro da ordem_exibicao (o join do DRE) + espelho v2 so' na deducao. A regra
--     de nao dobrar e' a do DRE: manual e calculada SOMAM; o espelho v2 sai de venda/reposicao (a VG nunca o leu) e fica na deducao.
-- Fora (registrado): o "Adiantamento de Boitel" do TS (Vera, 2 vendas boitel) — nem na funcao calculada nem no DRE.
SET LOCAL lock_timeout = '2s';
DO $g$ BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_meta_calculada_pecuaria(uuid, integer)'::regprocedure)
     IS DISTINCT FROM 'ae4b2e11f4c8b317bcd530eda449f6b4' THEN RAISE EXCEPTION 'fn_meta_calculada_pecuaria: corpo de origem inesperado.'; END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_vg_meta(uuid, date, date, uuid[], text)'::regprocedure)
     IS DISTINCT FROM '40796c1e357a609388a4c484b9bfd642' THEN RAISE EXCEPTION 'fn_vg_meta: corpo de origem inesperado.'; END IF;
END $g$;

CREATE FUNCTION public.fn_meta_calculada_pecuaria(p_cliente uuid, p_ano integer, p_regime text)
RETURNS TABLE(fazenda_id uuid, mes integer, ordem integer, valor numeric)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
#variable_conflict use_column
BEGIN
  IF p_regime IS NULL OR p_regime NOT IN ('competencia', 'caixa') THEN
    RAISE EXCEPTION 'Regime inválido: use competencia ou caixa.' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY

with par as (
  select m.fazenda_id,
         coalesce(m.cria_custo_cab_mes, 0)::numeric   as cria,
         coalesce(m.recria_custo_cab_mes, 0)::numeric as recria,
         ( coalesce(m.engorda_periodo_dias, 0)
         * coalesce(m.engorda_consumo_kg_ms, 0)
         * coalesce(m.engorda_custo_kg_ms, 0) )::numeric as ceng,
         coalesce(m.comercial_custo_cab, 0)::numeric  as comercial,
         coalesce(m.frete_custo_cab, 0)::numeric      as frete
    from public.meta_parametros_nutricao m
    join public.fazendas f on f.id = m.fazenda_id
   where f.cliente_id = p_cliente
     and m.ano = p_ano
     and f.nome !~* 'admin'
),
meses as (
  select generate_series(1, 12) as mes
),
reb as (
  select z.fazenda_id, z.mes,
         sum(case when z.categoria_codigo = 'vacas' then z.saldo_final else 0 end)::numeric as vacas,
         sum(case when z.categoria_codigo in ('novilhas','garrotes','desmama_m','desmama_f')
                  then z.saldo_final else 0 end)::numeric as recria_cab
    from public.zoot_mensal_cache z
    join par on par.fazenda_id = z.fazenda_id
   where z.cenario = 'meta'
     and z.ano = p_ano
     and z.categoria_codigo in ('vacas','novilhas','garrotes','desmama_m','desmama_f')
   group by z.fazenda_id, z.mes
),
ev as (
  select l.fazenda_id, l.tipo,
         extract(month from l.data)::int as mes,
         abs(l.quantidade)::numeric      as q
    from public.lancamentos l
    join par on par.fazenda_id = l.fazenda_id
   where l.cliente_id = p_cliente
     and l.cenario = 'meta'
     and l.cancelado = false
     and l.data >= make_date(p_ano, 1, 1)
     and l.data <= make_date(p_ano, 12, 31)
     and l.tipo in ('abate','venda','transferencia_entrada')
),
cria_v as (
  select p.fazenda_id, m.mes, round(coalesce(r.vacas, 0) * p.cria, 2) as v
    from par p
    cross join meses m
    left join reb r on r.fazenda_id = p.fazenda_id and r.mes = m.mes
   where p.cria > 0
),
recria_v as (
  select p.fazenda_id, m.mes, round(coalesce(r.recria_cab, 0) * p.recria, 2) as v
    from par p
    cross join meses m
    left join reb r on r.fazenda_id = p.fazenda_id and r.mes = m.mes
   where p.recria > 0
),
eng_ev as (
  -- cada abate lanca 1/4 do custo em cada um dos 4 meses ANTERIORES,
  -- sem cruzar o ano (mes < 1 e descartado), igual ao TS
  select e.fazenda_id, e.mes - o as mes, e.q
    from ev e
    cross join generate_series(1, 4) as o
   where e.tipo = 'abate'
     and e.mes - o >= 1
),
eng_v as (
  select p.fazenda_id, m.mes,
         round(coalesce(sum(x.q * p.ceng / 4), 0), 2) as v
    from par p
    cross join meses m
    left join eng_ev x on x.fazenda_id = p.fazenda_id and x.mes = m.mes
   where p.ceng > 0
   group by p.fazenda_id, m.mes
),
nut as (
  select fazenda_id, mes, 8045 as ordem, round(sum(v), 2) as valor
    from ( select * from cria_v
           union all select * from recria_v
           union all select * from eng_v ) f
   group by fazenda_id, mes
),
com as (
  select p.fazenda_id, e.mes, 5030 as ordem,
         round(sum(e.q) * p.comercial, 0) as valor
    from ev e
    join par p on p.fazenda_id = e.fazenda_id
   where e.tipo in ('abate','venda')
     and p.comercial > 0
   group by p.fazenda_id, e.mes, p.comercial
),
fre as (
  select p.fazenda_id, e.mes, 8140 as ordem,
         round(sum(e.q) * p.frete, 2) as valor
    from ev e
    join par p on p.fazenda_id = e.fazenda_id
   where e.tipo = 'transferencia_entrada'
     and p.frete > 0
   group by p.fazenda_id, e.mes, p.frete
),
cx as (
  -- P108 — as linhas meta de abate/venda/compra de QUALQUER ano (no caixa a parcela de um evento de outro ano cai neste)
  select l.fazenda_id, l.data, l.valor_total, l.detalhes_snapshot as det,
         coalesce(l.detalhes_snapshot ->> 'formaReceb', l.detalhes_snapshot ->> 'formaPag') as forma,
         case
           when l.tipo = 'abate'  and l.categoria in ('touros','bois','garrotes','machos','bezerros_m','mamotes_m','desmama_m') then 1020
           when l.tipo = 'abate'  and l.categoria in ('vacas','novilhas','bezerras_f','desmama_f','femeas','mamotes_f')         then 1010
           when l.tipo = 'venda'  and ( l.boitel_lote_id is not null
                                        or ( l.detalhes_snapshot -> 'boitelSnapshot' is not null
                                             and jsonb_typeof(l.detalhes_snapshot -> 'boitelSnapshot') <> 'null' ) )            then 1150
           when l.tipo = 'venda'  and l.categoria in ('desmama_m','bezerros_m')                                                 then 1120
           when l.tipo = 'venda'  and l.categoria in ('desmama_f','bezerras_f')                                                 then 1110
           when l.tipo = 'venda'  and l.categoria in ('garrotes','touros','bois','machos_adultos','mamotes_m')                  then 1140
           when l.tipo = 'venda'  and l.categoria in ('novilhas','vacas','femeas_adultas','mamotes_f')                          then 1130
           when l.tipo = 'compra' and l.categoria in ('garrotes','touros','bois','machos','bezerros_m','mamotes_m','desmama_m') then 15020
           when l.tipo = 'compra' and l.categoria in ('novilhas','vacas','femeas','bezerras_f','mamotes_f','desmama_f')         then 15010
         end as ordem
    from public.lancamentos l
    join public.fazendas f on f.id = l.fazenda_id
   where p_regime = 'caixa'
     and l.cliente_id = p_cliente
     and f.cliente_id = p_cliente
     and l.cenario = 'meta'
     and l.cancelado = false
     and l.valor_total is not null
     and l.tipo in ('abate','venda','compra')
),
rec as (
  -- RECEITA E REPOSICAO DA META — transcricao de mapRebanhoSubcentro
  -- (usePlanejamentoFinanceiro.ts:62-79) para ordem_exibicao do plano.
  -- ⚠ NAO usa `par` (nao depende de parametro de nutricao) e NAO exclui a
  --   fazenda Administrativo: o TS da receita nao exclui.
  -- ⚠ COMPETENCIA: `data` e `valor_total` do lancamento; as parcelas NAO entram
  --   (a lista de meta e' caixa, o DRE e' competencia) — decisao do Gabriel.
  select l.fazenda_id,
         extract(month from l.data)::int as mes,
         case
           when l.tipo = 'abate'  and l.categoria in ('touros','bois','garrotes','machos','bezerros_m','mamotes_m','desmama_m') then 1020
           when l.tipo = 'abate'  and l.categoria in ('vacas','novilhas','bezerras_f','desmama_f','femeas','mamotes_f')         then 1010
           when l.tipo = 'venda'  and ( l.boitel_lote_id is not null
                                        or ( l.detalhes_snapshot -> 'boitelSnapshot' is not null
                                             and jsonb_typeof(l.detalhes_snapshot -> 'boitelSnapshot') <> 'null' ) )            then 1150
           when l.tipo = 'venda'  and l.categoria in ('desmama_m','bezerros_m')                                                 then 1120
           when l.tipo = 'venda'  and l.categoria in ('desmama_f','bezerras_f')                                                 then 1110
           when l.tipo = 'venda'  and l.categoria in ('garrotes','touros','bois','machos_adultos','mamotes_m')                  then 1140
           when l.tipo = 'venda'  and l.categoria in ('novilhas','vacas','femeas_adultas','mamotes_f')                          then 1130
           when l.tipo = 'compra' and l.categoria in ('garrotes','touros','bois','machos','bezerros_m','mamotes_m','desmama_m') then 15020
           when l.tipo = 'compra' and l.categoria in ('novilhas','vacas','femeas','bezerras_f','mamotes_f','desmama_f')         then 15010
         end as ordem,
         l.valor_total::numeric as valor
    from public.lancamentos l
    join public.fazendas f on f.id = l.fazenda_id
   where l.cliente_id = p_cliente
     and f.cliente_id = p_cliente
     and l.cenario = 'meta'
     and l.cancelado = false
     and l.valor_total is not null
     and l.tipo in ('abate','venda','compra')
     and l.data >= make_date(p_ano, 1, 1)
     and l.data <= make_date(p_ano, 12, 31)
     and p_regime = 'competencia'
  union all
  -- P108 — REGIME DE CAIXA (a Visao Geral): transcricao da regra da receita meta de usePlanejamentoFinanceiro.ts
  --   (lancamentosRebanhoQuery): forma = formaReceb, senao formaPag; 'prazo' -> cada parcela valida (data texto com 10+
  --   caracteres, valor numero) no mes da PARCELA (o ano e' o da parcela; prazo sem parcela valida nao entra); 'avista' -> a
  --   `data` do lancamento com o valor_total; outra forma nao entra. Valor em modulo (Math.abs). O mapa e' o mesmo de cima.
  select x.fazenda_id, substr(x.dt, 6, 2)::int as mes, x.ordem, abs(x.v) as valor
    from (
      select r.fazenda_id, r.ordem, p.value ->> 'data' as dt, (p.value ->> 'valor')::numeric as v
        from cx r
        cross join lateral jsonb_array_elements(case when jsonb_typeof(r.det -> 'parcelas') = 'array' then r.det -> 'parcelas' else '[]'::jsonb end) p
       where r.forma = 'prazo'
         and jsonb_typeof(p.value -> 'data') = 'string' and length(p.value ->> 'data') >= 10
         and jsonb_typeof(p.value -> 'valor') = 'number'
      union all
      select r.fazenda_id, r.ordem, r.data::text, r.valor_total::numeric
        from cx r
       where r.forma = 'avista'
    ) x
   where p_regime = 'caixa'
     and substr(x.dt, 1, 7) ~ '[0-9]{4}-(0[1-9]|1[0-2])'
     and left(x.dt, 4) = p_ano::text
),
rec_m as (
  select fazenda_id, mes, ordem, round(sum(valor), 2) as valor
    from rec
   where ordem is not null
   group by fazenda_id, mes, ordem
)
select fazenda_id, mes, ordem, valor from nut where valor <> 0
union all
select fazenda_id, mes, ordem, valor from com where valor <> 0
union all
select fazenda_id, mes, ordem, valor from fre where valor <> 0
union all
select fazenda_id, mes, ordem, valor from rec_m where valor <> 0;
END $function$;

REVOKE ALL ON FUNCTION public.fn_meta_calculada_pecuaria(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_meta_calculada_pecuaria(uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_meta_calculada_pecuaria(p_cliente uuid, p_ano integer)
RETURNS TABLE(fazenda_id uuid, mes integer, ordem integer, valor numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$ select * from public.fn_meta_calculada_pecuaria(p_cliente, p_ano, 'competencia') $$;

CREATE OR REPLACE FUNCTION public.fn_vg_meta(
  p_cliente uuid, p_de date, p_ate date, p_fazendas uuid[] DEFAULT NULL, p_atividade text DEFAULT NULL)
RETURNS TABLE(nivel text, lado text, grupo text, atividade text, centro text, subcentro text, ano_mes text, meta numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET plan_cache_mode TO 'force_custom_plan'
AS $function$
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_de IS NULL OR p_ate IS NULL OR p_ate < p_de THEN
    RAISE EXCEPTION 'Período inválido.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH m AS (
    -- o planejamento gravado (como antes)
    SELECT CASE WHEN pc.tipo_operacao = '1-Entradas' THEN 'entrada' ELSE 'saida' END AS lado_,
           coalesce(pc.grupo_fluxo, CASE WHEN pc.tipo_operacao = '1-Entradas' THEN 'Outras entradas' ELSE 'Outras saídas' END) AS grupo_,
           pc.escopo_negocio AS atividade_, pc.centro_custo AS centro_, pc.subcentro AS sub_,
           to_char(make_date(pf.ano, pf.mes, 1), 'YYYY-MM') AS am, abs(pf.valor_planejado) AS v
      FROM public.planejamento_financeiro pf
      JOIN public.financeiro_plano_contas pc ON pc.id = pf.plano_conta_id
     WHERE pf.cliente_id = p_cliente
       AND pf.cenario = 'meta'
       AND pc.tipo_operacao IN ('1-Entradas', '2-Saídas')
       AND make_date(pf.ano, pf.mes, 1) BETWEEN date_trunc('month', p_de)::date AND p_ate
       AND (p_fazendas IS NULL OR pf.fazenda_id = ANY (p_fazendas))
       AND (p_atividade IS NULL OR pc.escopo_negocio = p_atividade)
    UNION ALL
    -- P108: a CALCULADA, no regime de caixa, no subcentro do plano padrao pela ordem (o join do DRE)
    SELECT CASE WHEN pc.tipo_operacao = '1-Entradas' THEN 'entrada' ELSE 'saida' END,
           coalesce(pc.grupo_fluxo, CASE WHEN pc.tipo_operacao = '1-Entradas' THEN 'Outras entradas' ELSE 'Outras saídas' END),
           pc.escopo_negocio, pc.centro_custo, pc.subcentro,
           to_char(make_date(y.ano, c.mes, 1), 'YYYY-MM'), abs(c.valor)
      FROM generate_series(extract(year FROM p_de)::int, extract(year FROM p_ate)::int) AS y(ano)
     CROSS JOIN LATERAL public.fn_meta_calculada_pecuaria(p_cliente, y.ano, 'caixa') c
      JOIN public.financeiro_plano_contas pc ON pc.ordem_exibicao = c.ordem AND pc.escopo_negocio = 'pecuaria' AND pc.cliente_id IS NULL AND pc.ativo
     WHERE pc.tipo_operacao IN ('1-Entradas', '2-Saídas')
       AND make_date(y.ano, c.mes, 1) BETWEEN date_trunc('month', p_de)::date AND p_ate
       AND (p_fazendas IS NULL OR c.fazenda_id = ANY (p_fazendas))
       AND (p_atividade IS NULL OR pc.escopo_negocio = p_atividade)
    UNION ALL
    -- P108: o espelho da v2 so' na DEDUCAO (no DRE ele continua entrando ali), pelo vencimento
    SELECT CASE WHEN pc.tipo_operacao = '1-Entradas' THEN 'entrada' ELSE 'saida' END,
           coalesce(pc.grupo_fluxo, CASE WHEN pc.tipo_operacao = '1-Entradas' THEN 'Outras entradas' ELSE 'Outras saídas' END),
           pc.escopo_negocio, pc.centro_custo, pc.subcentro,
           to_char(coalesce(l.data_vencimento, l.data_competencia), 'YYYY-MM'), abs(l.valor)
      FROM public.financeiro_lancamentos_v2 l
      JOIN public.financeiro_plano_contas pc ON pc.id = l.plano_conta_id
     WHERE l.cliente_id = p_cliente
       AND l.cenario = 'meta'
       AND coalesce(l.cancelado, false) = false
       AND l.origem_lancamento = 'movimentacao_rebanho'
       AND pc.bloco_dre = 'deducao'
       AND pc.tipo_operacao IN ('1-Entradas', '2-Saídas')
       AND coalesce(l.data_vencimento, l.data_competencia) BETWEEN date_trunc('month', p_de)::date AND p_ate
       AND (p_fazendas IS NULL OR l.fazenda_id = ANY (p_fazendas))
       AND (p_atividade IS NULL OR pc.escopo_negocio = p_atividade)
  )
  SELECT CASE WHEN GROUPING(m.grupo_) = 1 THEN 'raiz'
              WHEN GROUPING(m.atividade_) = 1 THEN 'grupo'
              WHEN GROUPING(m.centro_) = 1 THEN 'atividade'
              WHEN GROUPING(m.sub_) = 1 THEN 'centro'
              ELSE 'subcentro' END,
         m.lado_, m.grupo_, m.atividade_, m.centro_, m.sub_, m.am, round(sum(m.v), 2)
    FROM m
   GROUP BY GROUPING SETS (
     (m.lado_, m.am),
     (m.lado_, m.grupo_, m.am),
     (m.lado_, m.grupo_, m.atividade_, m.am),
     (m.lado_, m.grupo_, m.atividade_, m.centro_, m.am),
     (m.lado_, m.grupo_, m.atividade_, m.centro_, m.sub_, m.am));
END $function$;

REVOKE ALL ON FUNCTION public.fn_vg_meta(uuid, date, date, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vg_meta(uuid, date, date, uuid[], text) TO authenticated;

COMMENT ON FUNCTION public.fn_vg_meta(uuid, date, date, uuid[], text) IS
  'FIN-VISAO-GERAL-01 PR 2 + P108: meta por no da Visao Geral x mes = planejamento_financeiro + fn_meta_calculada_pecuaria(caixa) no subcentro da ordem + espelho v2 da deducao. Sem meta: sem linha.';
