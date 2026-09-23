-- ════════════════════════════════════════════════════════════════════════════════════════════
-- DRE-CASCATA-02 — "= Lucro líquido" nas três funções do DRE, e os juros da pecuária por fazenda
-- Aplicado no proto em 23/09/2026 (ledger: dre_cascata_lucro_liquido). Registro histórico.
--
-- POR QUE ESTA MIGRATION EXISTE
-- O DRE fechava no "Resultado de caixa" (lavoura) e no "Resultado com mercado" (pecuária), e o
-- Investimento ficava ABAIXO da linha — uma nota de rodapé de seis dígitos. A cascata passa a
-- fechar no LUCRO LÍQUIDO, que é o que sobra depois de investir, e as duas atividades passam a
-- dizer a mesma coisa com o mesmo nome.
--
-- ⚠ O NOME TÉCNICO DAS CHAVES ANTIGAS NÃO MUDOU (decisão do Gabriel, 23/09 07:47):
-- `resultado_caixa`, `resultado_periodo` e `resultado_com_mercado` continuam como estão — renomear
-- quebraria `fn_dre_lavoura_historico` (que deriva o `resultado_ha` de `resultado_caixa`),
-- `fn_painel_safra` (que o publica como `saldo`) e os parsers do front, tudo em silêncio. O que
-- entra é a chave NOVA `lucro_liquido`.
--
-- ⚠ OS JUROS DA PECUÁRIA PASSAM A SER DESCONTADOS POR FAZENDA, e o critério não é escolha de
-- gosto: é o mesmo do rateio administrativo. MEDIDO em 23/09, safra 25/26, nos cinco clientes:
-- 99,9% dos juros estão lançados na fazenda "Administrativo", que NÃO É COLUNA do DRE (a CTE `faz`
-- só admite fazenda com fechamento de rebanho ou com movimento de bloco ≠ juros). Na NJ são
-- R$ 1.472.429,90 no Administrativo contra R$ 684,00 na Faz. Pureza; na Santa Rita,
-- R$ 2.261.206,53 contra R$ 25.973,72. Descontá-los "onde estão" jogaria o dinheiro numa coluna
-- que não existe e o Total perderia 1,47 milhão.
-- Por isso: juros da fazenda da grade ficam nela (`juros_proprio`); os de fora são RATEADOS por
-- cabeça média, com o MESMO denominador do `rateio_adm` (a soma da `cab_media` das fazendas da
-- grade), e a sobra do arredondamento cai na fazenda de MAIOR cabeça média, para a soma das
-- fazendas fechar com o Total ao centavo. A RPC devolve `juros_proprio` e `juros_rateado`
-- separados, para o front poder marcar a parcela estimada.
-- ⚠ E O TOTAL NÃO MUDOU DE VALOR: antes ele subtraía os juros fora da cascata
-- (`sum(resultado_periodo) - (select valor from jur)`); agora eles já vêm dentro de cada fazenda e
-- o Total é a soma. Provado nos cinco clientes, realizado e meta: o jsonb do total é idêntico ao
-- de antes, exceto pelas chaves novas.
--
-- ⚠ A LAVOURA NÃO PRECISOU DE RATEIO DE JUROS: medido no prosrc — um lançamento sem cultura cai no
-- bucket `__compartilhado__` e JÁ É rateado por área (CTE `rateado`, peso = area_ha/total), para
-- todos os blocos, inclusive `juros`. Ali o lucro líquido é só a subtração nova.
--
-- ⚠ O QUE ESTA MIGRATION NÃO FAZ: não toca `fn_dre_lavoura_historico`, `fn_dre_pecuaria_lancamentos`,
-- `fn_meta_calculada_pecuaria` nem `fn_painel_safra`.
-- ⚠ E FICA REGISTRADO O QUE ISSO CUSTA: `fn_painel_safra` monta o JSON dele com chaves NOMEADAS
-- (`'saldo', (v_dre->>'resultado_caixa')`), não repassa o agregado — então a chave `lucro_liquido`
-- de `fn_dre_agricola_por_safra` NÃO chega ao PC-100 sem editá-lo, ao contrário do que o briefing
-- supôs. Medido depois de aplicar: `fn_painel_safra(...) ? 'lucro_liquido'` = false. Decisão do
-- Gabriel pendente.
--
-- PROVAS (rodadas em BEGIN/ROLLBACK antes de aplicar e repetidas depois, sobre o que está no ar):
--   NJ pecuária 25/26 · juros 1.473.113,90 · resultado_periodo 3.588.464,44 ·
--     resultado_com_mercado 6.207.026,44 · investimento 1.113.797,04 · lucro_liquido 5.093.229,40
--     e a soma das fazendas == Total ao centavo em juros, resultado_periodo e lucro_liquido.
--   Santa Rita, Agnaldo, RRCC, Vera Ligia · realizado e meta · diferença soma-fazendas × Total = 0,00
--     em todos; `juros_nao_rateado` = 0 em todos (ninguém caiu no caso de denominador zero).
--   Lavoura NJ 24/25 · resultado_caixa 183.052,68 − investimento 361.577,82 =
--     lucro_liquido −178.525,14 · por_ha −755,50 · amendoim −112.767,99 · mandioca −65.757,15;
--     todas as demais chaves idênticas por md5 (total e culturas).
--   fn_dre_lavoura_historico: 0 linhas diferentes (EXCEPT nos dois sentidos).
--   anon EXECUTE = false nas três; authenticated = true.
--
-- md5(prosrc) ANTES → DEPOIS
--   fn_dre_pecuaria            ccab3e12f3c7e6f5c8db693a5616f379 → eb104da372127fe5d3d3fa9d10ff7ce2
--   fn_dre_lavoura             13efb6cbdeeb25380e7004e1e95100b1 → 3698ef1504298a83f3bb0a2e447235c1
--   fn_dre_agricola_por_safra  503efff61620b8b205f2f65f510616e4 → 7aad0a266d7b8eadae903a576b9573ac
--
-- ⚠ O CORPO ABAIXO É O prosrc INTEGRAL das três funções como estão no banco depois da aplicação —
-- não um diff. Reaplicar este arquivo num banco limpo produz exatamente o que o proto tem.
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- ════════════════════ 1/3 · fn_dre_agricola_por_safra ════════════════════
CREATE OR REPLACE FUNCTION public.fn_dre_agricola_por_safra(p_cliente_id uuid, p_safra_id uuid)
 RETURNS TABLE(cultura text, area_ha numeric, area_cadastrada boolean, ordem integer, linha text, rotulo text, valor numeric, rateio_admin_declarado boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
with safra as (
  select s.id, s.data_inicio, s.data_fim from financeiro_safras s
   where s.id = p_safra_id and s.cliente_id = p_cliente_id
),
areas as (
  select a.cultura, sum(a.area_plantada_ha)::numeric as area_ha
    from agri_safra_area a
   where a.safra_id = p_safra_id and a.cliente_id = p_cliente_id and a.ativo and a.status = 'plantada'
   group by a.cultura
),
area_total as (select coalesce(sum(area_ha),0)::numeric as total from areas),
plantadas as (select cultura from areas),
lanc as (
  select
    case
      when l.cultura in (select cultura from plantadas) then l.cultura
      when l.cultura is null and l.grupo_custo in ('Receita Agrícola','Deduções Agricultura') then '__nao_apropriado__'
      when l.cultura is null then '__compartilhado__'
      else '__nao_apropriado__'
    end as bucket,
    l.grupo_custo, l.tipo_operacao, l.valor
  from financeiro_lancamentos_v2 l
  where l.cliente_id = p_cliente_id and l.safra_id = p_safra_id and coalesce(l.cancelado,false)=false and l.cenario='realizado'
),
agg as (
  select bucket,
    coalesce(sum(valor) filter (where grupo_custo='Receita Agrícola' and tipo_operacao='1-Entradas'),0) receita,
    coalesce(sum(valor) filter (where grupo_custo='Deduções Agricultura' and tipo_operacao='2-Saídas'),0) deducoes,
    coalesce(sum(valor) filter (where grupo_custo='Custo Variável Agricultura' and tipo_operacao='2-Saídas'),0) cv,
    coalesce(sum(valor) filter (where grupo_custo='Custo Fixo Agricultura' and tipo_operacao='2-Saídas'),0) cf,
    coalesce(sum(valor) filter (where grupo_custo='Juros de Financiamento Agricultura' and tipo_operacao='2-Saídas'),0) juros,
    coalesce(sum(valor) filter (where grupo_custo='Investimento Agricultura' and tipo_operacao='2-Saídas'),0) inv
  from lanc group by bucket
),
comp as (
  select coalesce(cv+cf+juros,0) custos, coalesce(inv,0) inv from agg where bucket='__compartilhado__'
  union all select 0,0 where not exists (select 1 from agg where bucket='__compartilhado__')
),
na as (
  select receita, deducoes, cv, cf, juros, inv from agg where bucket='__nao_apropriado__'
  union all select 0,0,0,0,0,0 where not exists (select 1 from agg where bucket='__nao_apropriado__')
),
admin_por_ano as (
  select extract(year from l.data_competencia)::int ano, sum(l.valor) total
  from financeiro_lancamentos_v2 l, safra s
  where l.cliente_id=p_cliente_id and coalesce(l.cancelado,false)=false and l.cenario='realizado'
    and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas'
    and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências')
    and s.data_inicio is not null and s.data_fim is not null
    and l.data_competencia between s.data_inicio and s.data_fim
  group by 1
),
admin_rateado as (
  select coalesce(sum(a.total*(r.percentual/100.0)),0)::numeric valor,
         coalesce(bool_and(r.percentual is not null),true) declarado
  from admin_por_ano a
  left join agri_rateio_admin r on r.cliente_id=p_cliente_id and r.ano=a.ano and r.atividade='agricultura'
),
base as (
  select a.cultura, a.area_ha,
    case when (select total from area_total)>0 then a.area_ha/(select total from area_total) else 0 end peso
  from areas a
),
sum_peso as (select coalesce(sum(peso),0) sp from base),
por_cultura as (
  select b.cultura, b.area_ha, true area_cadastrada,
    coalesce(g.receita,0) receita, coalesce(g.deducoes,0) deducoes,
    coalesce(g.cv,0) cv, coalesce(g.cf,0) cf, coalesce(g.juros,0) juros, coalesce(g.inv,0) inv,
    (select custos from comp)*b.peso rat_comp,
    (select valor from admin_rateado)*b.peso rat_adm,
    (select inv from comp)*b.peso inv_rat
  from base b left join agg g on g.bucket=b.cultura
),
linhas as (
  select p.cultura, p.area_ha, p.area_cadastrada, v.ordem, v.linha, v.rotulo, v.valor
  from por_cultura p cross join lateral (values
    (1,'receita_bruta','Receita bruta', p.receita),
    (2,'deducoes','(-) Deduções', p.deducoes),
    (3,'receita_liquida','= Receita líquida', p.receita-p.deducoes),
    (4,'custo_variavel','(-) Custo variável direto', p.cv),
    (5,'custo_fixo','(-) Custo fixo', p.cf),
    (6,'juros','(-) Juros de financiamento', p.juros),
    (7,'rateio_compartilhado','(-) Rateio compartilhado', p.rat_comp),
    (8,'rateio_admin','(-) Rateio administrativo', p.rat_adm),
    (9,'resultado_caixa','= Resultado de caixa', p.receita-p.deducoes-p.cv-p.cf-p.juros-p.rat_comp-p.rat_adm),
    (10,'investimento','Investimento no período', p.inv+p.inv_rat),
    (11,'depreciacao','Depreciação', null::numeric),
    (12,'lucro_liquido','= Lucro líquido', p.receita-p.deducoes-p.cv-p.cf-p.juros-p.rat_comp-p.rat_adm-(p.inv+p.inv_rat))
  ) v(ordem,linha,rotulo,valor)
),
na_linhas as (
  select '__nao_apropriado__'::text, null::numeric, null::boolean, v.ordem, v.linha, v.rotulo, v.valor
  from na n cross join lateral (values
    (1,'receita_bruta','Receita bruta', n.receita),
    (2,'deducoes','(-) Deduções', n.deducoes),
    (3,'receita_liquida','= Receita líquida', n.receita-n.deducoes),
    (4,'custo_variavel','(-) Custo variável direto', n.cv),
    (5,'custo_fixo','(-) Custo fixo', n.cf),
    (6,'juros','(-) Juros de financiamento', n.juros),
    (7,'rateio_compartilhado','(-) Rateio compartilhado', 0::numeric),
    (8,'rateio_admin','(-) Rateio administrativo', 0::numeric),
    (9,'resultado_caixa','= Resultado de caixa', n.receita-n.deducoes-n.cv-n.cf-n.juros),
    (10,'investimento','Investimento no período', n.inv),
    (11,'depreciacao','Depreciação', null::numeric),
    (12,'lucro_liquido','= Lucro líquido', n.receita-n.deducoes-n.cv-n.cf-n.juros-n.inv)
  ) v(ordem,linha,rotulo,valor)
),
residuo as (
  select v.ordem, v.valor from (select (1-(select sp from sum_peso)) f) x cross join lateral (values
    (7, (select custos from comp)*x.f),
    (8, (select valor from admin_rateado)*x.f),
    (10, (select inv from comp)*x.f),
    (12, -((select inv from comp)*x.f))
  ) v(ordem,valor)
),
esqueleto as (
  select v.ordem, v.linha, v.rotulo from (values
    (1,'receita_bruta','Receita bruta'),(2,'deducoes','(-) Deduções'),(3,'receita_liquida','= Receita líquida'),
    (4,'custo_variavel','(-) Custo variável direto'),(5,'custo_fixo','(-) Custo fixo'),(6,'juros','(-) Juros de financiamento'),
    (7,'rateio_compartilhado','(-) Rateio compartilhado'),(8,'rateio_admin','(-) Rateio administrativo'),
    (9,'resultado_caixa','= Resultado de caixa'),(10,'investimento','Investimento no período'),(11,'depreciacao','Depreciação'),(12,'lucro_liquido','= Lucro líquido')
  ) v(ordem,linha,rotulo)
),
soma_cult as (select ordem, sum(valor) v from linhas group by ordem)
select l.cultura, l.area_ha, l.area_cadastrada, l.ordem, l.linha, l.rotulo, l.valor, (select declarado from admin_rateado)
  from linhas l
union all
select '__nao_apropriado__', null, null, x.ordem, x.linha, x.rotulo, x.valor, (select declarado from admin_rateado)
  from na_linhas x(cultura,area_ha,area_cadastrada,ordem,linha,rotulo,valor)
union all
select '__total__', (select total from area_total), null, e.ordem, e.linha, e.rotulo,
  case when e.linha='depreciacao' then null
       else coalesce(sc.v,0)+coalesce(nl.valor,0)+coalesce(r.valor,0) end,
  (select declarado from admin_rateado)
  from esqueleto e
  left join soma_cult sc on sc.ordem=e.ordem
  left join na_linhas nl(cultura,area_ha,area_cadastrada,ordem,linha,rotulo,valor) on nl.ordem=e.ordem
  left join residuo r on r.ordem=e.ordem
order by 4,1
$function$;

-- ════════════════════ 2/3 · fn_dre_lavoura ════════════════════
CREATE OR REPLACE FUNCTION public.fn_dre_lavoura(p_cliente_id uuid, p_safra_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH safra AS (
  SELECT s.id, s.codigo, s.data_inicio, s.data_fim FROM financeiro_safras s
   WHERE s.id = p_safra_id AND s.cliente_id = p_cliente_id
),
areas AS (
  SELECT a.cultura, sum(a.area_plantada_ha)::numeric AS area_ha
    FROM agri_safra_area a
   WHERE a.safra_id = p_safra_id AND a.cliente_id = p_cliente_id AND a.ativo AND a.status = 'plantada'
   GROUP BY a.cultura
),
area_total AS (SELECT coalesce(sum(area_ha),0)::numeric AS total FROM areas),
colheita AS (
  SELECT a.cultura, coalesce(sum(coalesce(c.toneladas, c.sacas_boas + c.grao_roca_sacas)),0)::numeric AS producao
    FROM agri_colheita c JOIN agri_safra_area a ON a.id = c.safra_area_id
   WHERE a.safra_id = p_safra_id AND a.cliente_id = p_cliente_id AND c.ativo AND c.cliente_id = p_cliente_id
   GROUP BY a.cultura
),
lanc AS (
  SELECT
    CASE WHEN l.cultura IN (SELECT cultura FROM areas) THEN l.cultura
         WHEN coalesce(l.cultura,'') = '' THEN '__compartilhado__'
         ELSE '__nao_apropriado__' END AS bucket,
    p.bloco_dre AS bloco, p.centro_custo AS centro,
    l.valor,
    CASE WHEN l.status_transacao <> 'realizado' THEN l.valor ELSE 0 END AS a_pagar
  FROM financeiro_lancamentos_v2 l
  JOIN financeiro_plano_contas p ON p.id = l.plano_conta_id
  WHERE l.cliente_id = p_cliente_id AND l.safra_id = p_safra_id AND coalesce(l.cancelado,false) = false and l.cenario='realizado'
    AND p.bloco_dre IS NOT NULL
    AND ((p.bloco_dre = 'receita' AND l.tipo_operacao = '1-Entradas') OR (p.bloco_dre <> 'receita' AND l.tipo_operacao = '2-Saídas'))
),
leaf AS (SELECT bucket, bloco, centro, sum(valor) AS valor, sum(a_pagar) AS a_pagar FROM lanc GROUP BY 1,2,3),
share AS (
  SELECT a.cultura, a.area_ha,
         CASE WHEN t.total > 0 THEN a.area_ha / t.total ELSE 0 END AS peso,
         row_number() OVER (ORDER BY a.area_ha DESC, a.cultura) AS rn
    FROM areas a, area_total t
),
comp AS (SELECT bloco, centro, valor, a_pagar FROM leaf WHERE bucket = '__compartilhado__'),
rateado_raw AS (
  SELECT s.cultura, c.bloco, c.centro, s.rn, c.valor AS pool, c.a_pagar AS pool_ap,
         round(c.valor * s.peso, 2) AS valor, round(c.a_pagar * s.peso, 2) AS a_pagar
    FROM comp c CROSS JOIN share s
),
rateado AS (
  SELECT cultura, bloco, centro,
         valor + CASE WHEN rn = 1 THEN pool - sum(valor) OVER (PARTITION BY bloco, centro) ELSE 0 END AS valor,
         a_pagar + CASE WHEN rn = 1 THEN pool_ap - sum(a_pagar) OVER (PARTITION BY bloco, centro) ELSE 0 END AS a_pagar
    FROM rateado_raw
),
direto AS (
  SELECT bucket AS cultura, bloco, centro, round(valor,2) AS valor, round(a_pagar,2) AS a_pagar
    FROM leaf WHERE bucket NOT IN ('__compartilhado__','__nao_apropriado__')
),
cel AS (
  SELECT cultura, bloco, centro, sum(d) AS direto, sum(r) AS rateado, sum(ap) AS a_pagar
    FROM (SELECT cultura, bloco, centro, valor AS d, 0::numeric AS r, a_pagar AS ap FROM direto
          UNION ALL SELECT cultura, bloco, centro, 0, valor, a_pagar FROM rateado) u
   GROUP BY 1,2,3
),
admin_por_ano AS (
  SELECT extract(year FROM l.data_competencia)::int AS ano, sum(l.valor) AS total
    FROM financeiro_lancamentos_v2 l, safra s
   WHERE l.cliente_id = p_cliente_id AND coalesce(l.cancelado,false) = false and l.cenario='realizado'
     AND l.escopo_negocio = 'administrativo' AND l.tipo_operacao = '2-Saídas'
     AND l.macro_custo NOT IN ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências','Tributos')
     AND s.data_inicio IS NOT NULL AND s.data_fim IS NOT NULL
     AND l.data_competencia BETWEEN s.data_inicio AND s.data_fim
   GROUP BY 1
),
admin_pool AS (
  SELECT coalesce(sum(a.total * (r.percentual/100.0)),0)::numeric AS valor,
         coalesce(bool_and(r.percentual IS NOT NULL), true) AS declarado,
         coalesce(sum(a.total),0)::numeric AS admin_total
    FROM admin_por_ano a
    LEFT JOIN agri_rateio_admin r ON r.cliente_id = p_cliente_id AND r.ano = a.ano AND r.atividade = 'agricultura'
),
admin_rat AS (
  SELECT s.cultura,
         round(ap.valor * s.peso, 2) + CASE WHEN s.rn = 1 THEN round(ap.valor,2) - sum(round(ap.valor * s.peso, 2)) OVER () ELSE 0 END AS valor
    FROM admin_pool ap CROSS JOIN share s
),
bl AS (SELECT cultura, bloco, sum(direto) AS direto, sum(rateado) AS rateado, sum(a_pagar) AS a_pagar FROM cel GROUP BY 1,2),
cult AS (
  SELECT s.cultura, s.area_ha, s.peso, coalesce(c.producao,0) AS producao,
    coalesce((SELECT direto FROM bl b WHERE b.cultura=s.cultura AND b.bloco='receita'),0) AS receita_bruta,
    coalesce((SELECT direto FROM bl b WHERE b.cultura=s.cultura AND b.bloco='deducao'),0) AS deducoes,
    coalesce((SELECT direto  FROM bl b WHERE b.cultura=s.cultura AND b.bloco='custeio'),0)      AS custeio_d,
    coalesce((SELECT rateado FROM bl b WHERE b.cultura=s.cultura AND b.bloco='custeio'),0)      AS custeio_r,
    coalesce((SELECT direto  FROM bl b WHERE b.cultura=s.cultura AND b.bloco='pos_colheita'),0) AS pos_d,
    coalesce((SELECT rateado FROM bl b WHERE b.cultura=s.cultura AND b.bloco='pos_colheita'),0) AS pos_r,
    coalesce((SELECT direto  FROM bl b WHERE b.cultura=s.cultura AND b.bloco='fixo'),0)         AS fixo_d,
    coalesce((SELECT rateado FROM bl b WHERE b.cultura=s.cultura AND b.bloco='fixo'),0)         AS fixo_r,
    coalesce((SELECT direto  FROM bl b WHERE b.cultura=s.cultura AND b.bloco='juros'),0)        AS juros_d,
    coalesce((SELECT rateado FROM bl b WHERE b.cultura=s.cultura AND b.bloco='juros'),0)        AS juros_r,
    coalesce((SELECT direto  FROM bl b WHERE b.cultura=s.cultura AND b.bloco='investimento'),0) AS inv_d,
    coalesce((SELECT rateado FROM bl b WHERE b.cultura=s.cultura AND b.bloco='investimento'),0) AS inv_r,
    coalesce((SELECT sum(a_pagar) FROM bl b WHERE b.cultura=s.cultura AND b.bloco IN ('custeio','pos_colheita','fixo','juros')),0) AS a_pagar_op,
    coalesce((SELECT sum(a_pagar) FROM bl b WHERE b.cultura=s.cultura AND b.bloco = 'investimento'),0) AS a_pagar_inv,
    coalesce((SELECT valor FROM admin_rat a WHERE a.cultura=s.cultura),0) AS rateio_admin
  FROM share s LEFT JOIN colheita c ON c.cultura = s.cultura
),
calc AS (
  SELECT *,
    receita_bruta - deducoes AS receita_liquida,
    custeio_d + custeio_r + pos_d + pos_r AS custo_variavel,
    custeio_r + pos_r AS rateio_variavel,
    fixo_d + fixo_r AS custo_fixo,
    juros_d + juros_r AS juros,
    inv_d + inv_r AS investimento
  FROM cult
),
calc2 AS (
  SELECT *,
    receita_liquida - custo_variavel AS margem_contribuicao,
    receita_liquida - custo_variavel - custo_fixo - rateio_admin AS resultado_operacional,
    receita_liquida - custo_variavel - custo_fixo - rateio_admin - juros AS resultado_caixa,
    receita_liquida - custo_variavel - custo_fixo - rateio_admin - juros - investimento AS lucro_liquido,
    custo_variavel + custo_fixo + rateio_admin + juros AS custo_operacional,
    custeio_d + pos_d + fixo_d + juros_d AS custo_direto
  FROM calc
),
cult_json AS (
  SELECT jsonb_agg(jsonb_build_object(
    'cultura', cultura, 'area_ha', area_ha, 'peso_area', round(peso,6), 'producao', producao,
    'produtividade', CASE WHEN area_ha > 0 THEN round(producao/area_ha,2) END,
    'linhas', jsonb_build_object(
      'receita_bruta',        jsonb_build_object('valor', receita_bruta),
      'deducoes',             jsonb_build_object('valor', deducoes),
      'receita_liquida',      jsonb_build_object('valor', receita_liquida),
      'custeio',              jsonb_build_object('valor', custeio_d + custeio_r, 'direto', custeio_d, 'rateado', custeio_r),
      'pos_colheita',         jsonb_build_object('valor', pos_d + pos_r, 'direto', pos_d, 'rateado', pos_r),
      'rateio_compartilhado', jsonb_build_object('valor', rateio_variavel),
      'custo_variavel',       jsonb_build_object('valor', custo_variavel),
      'margem_contribuicao',  jsonb_build_object('valor', margem_contribuicao, 'pct_receita', CASE WHEN receita_liquida <> 0 THEN round(100*margem_contribuicao/receita_liquida,1) END),
      'custo_fixo',           jsonb_build_object('valor', custo_fixo, 'direto', fixo_d, 'rateado', fixo_r),
      'rateio_admin',         jsonb_build_object('valor', rateio_admin),
      'resultado_operacional',jsonb_build_object('valor', resultado_operacional, 'pct_receita', CASE WHEN receita_liquida <> 0 THEN round(100*resultado_operacional/receita_liquida,1) END),
      'juros',                jsonb_build_object('valor', juros, 'direto', juros_d, 'rateado', juros_r),
      'resultado_caixa',      jsonb_build_object('valor', resultado_caixa, 'por_ha', CASE WHEN area_ha > 0 THEN round(resultado_caixa/area_ha,2) END),
      'investimento',         jsonb_build_object('valor', investimento, 'direto', inv_d, 'rateado', inv_r),
      'lucro_liquido',        jsonb_build_object('valor', lucro_liquido, 'por_ha', CASE WHEN area_ha > 0 THEN round(lucro_liquido/area_ha,2) END),
      'depreciacao',          jsonb_build_object('valor', NULL)
    ),
    'a_pagar', jsonb_build_object('operacional', a_pagar_op, 'investimento', a_pagar_inv),
    'custo_operacional', custo_operacional,
    'pct_direto', CASE WHEN custo_direto + custeio_r + pos_r + fixo_r + juros_r + rateio_admin > 0 THEN round(100*custo_direto/(custo_direto + custeio_r + pos_r + fixo_r + juros_r + rateio_admin),0) END,
    'equilibrio', jsonb_build_object(
      'preco_realizado',  CASE WHEN producao > 0 THEN round(receita_bruta/producao,2) END,
      'preco_equilibrio', CASE WHEN producao > 0 THEN round(custo_operacional/producao,2) END,
      'produtividade_equilibrio', CASE WHEN area_ha > 0 AND producao > 0 AND receita_bruta > 0 THEN round((custo_operacional/area_ha)/(receita_bruta/producao),1) END
    )
  ) ORDER BY area_ha DESC, cultura) AS j FROM calc2
),
tot AS (
  SELECT
    coalesce(sum(area_ha),0) AS area_ha, coalesce(sum(receita_bruta),0) AS receita_bruta, coalesce(sum(deducoes),0) AS deducoes,
    coalesce(sum(receita_liquida),0) AS receita_liquida, coalesce(sum(custeio_d+custeio_r),0) AS custeio, coalesce(sum(pos_d+pos_r),0) AS pos_colheita,
    coalesce(sum(rateio_variavel),0) AS rateio_compartilhado, coalesce(sum(custo_variavel),0) AS custo_variavel, coalesce(sum(margem_contribuicao),0) AS margem_contribuicao,
    coalesce(sum(custo_fixo),0) AS custo_fixo, coalesce(sum(rateio_admin),0) AS rateio_admin, coalesce(sum(resultado_operacional),0) AS resultado_operacional,
    coalesce(sum(juros),0) AS juros, coalesce(sum(resultado_caixa),0) AS resultado_caixa, coalesce(sum(investimento),0) AS investimento,
    coalesce(sum(lucro_liquido),0) AS lucro_liquido,
    coalesce(sum(custo_operacional),0) AS custo_operacional, coalesce(sum(a_pagar_op),0) AS a_pagar_op, coalesce(sum(a_pagar_inv),0) AS a_pagar_inv,
    coalesce(sum(custo_direto),0) AS custo_direto, coalesce(sum(custeio_r+pos_r+fixo_r+juros_r),0) AS rateado_op
  FROM calc2
),
centros_json AS (
  SELECT jsonb_agg(jsonb_build_object('bloco', bloco, 'centro', centro, 'por_cultura', pc, 'total', jsonb_build_object('valor', td + tr, 'direto', td, 'rateado', tr, 'a_pagar', ta)) ORDER BY bloco, td + tr DESC) AS j
  FROM (
    SELECT bloco, centro,
      jsonb_object_agg(cultura, jsonb_build_object('valor', direto + rateado, 'direto', direto, 'rateado', rateado, 'a_pagar', a_pagar)) AS pc,
      sum(direto) AS td, sum(rateado) AS tr, sum(a_pagar) AS ta
    FROM cel WHERE bloco IN ('custeio','pos_colheita','fixo','investimento') GROUP BY 1,2
  ) x
),
nao_aprop AS (
  SELECT coalesce(jsonb_object_agg(bloco, round(valor,2)), '{}'::jsonb) AS j, coalesce(sum(valor),0) AS total FROM leaf WHERE bucket = '__nao_apropriado__'
)
SELECT jsonb_build_object(
  'versao', 'dre-lavoura-01',
  'safra', (SELECT jsonb_build_object('id', id, 'codigo', codigo, 'data_inicio', data_inicio, 'data_fim', data_fim) FROM safra),
  'culturas', coalesce((SELECT j FROM cult_json), '[]'::jsonb),
  'total', (SELECT jsonb_build_object(
      'area_ha', area_ha,
      'linhas', jsonb_build_object(
        'receita_bruta', jsonb_build_object('valor', receita_bruta), 'deducoes', jsonb_build_object('valor', deducoes), 'receita_liquida', jsonb_build_object('valor', receita_liquida),
        'custeio', jsonb_build_object('valor', custeio), 'pos_colheita', jsonb_build_object('valor', pos_colheita), 'rateio_compartilhado', jsonb_build_object('valor', rateio_compartilhado),
        'custo_variavel', jsonb_build_object('valor', custo_variavel), 'margem_contribuicao', jsonb_build_object('valor', margem_contribuicao, 'pct_receita', CASE WHEN receita_liquida <> 0 THEN round(100*margem_contribuicao/receita_liquida,1) END),
        'custo_fixo', jsonb_build_object('valor', custo_fixo), 'rateio_admin', jsonb_build_object('valor', rateio_admin), 'resultado_operacional', jsonb_build_object('valor', resultado_operacional, 'pct_receita', CASE WHEN receita_liquida <> 0 THEN round(100*resultado_operacional/receita_liquida,1) END),
        'juros', jsonb_build_object('valor', juros), 'resultado_caixa', jsonb_build_object('valor', resultado_caixa, 'por_ha', CASE WHEN area_ha > 0 THEN round(resultado_caixa/area_ha,2) END),
        'investimento', jsonb_build_object('valor', investimento),
        'lucro_liquido', jsonb_build_object('valor', lucro_liquido, 'por_ha', CASE WHEN area_ha > 0 THEN round(lucro_liquido/area_ha,2) END),
        'depreciacao', jsonb_build_object('valor', NULL)),
      'custo_operacional', custo_operacional,
      'a_pagar', jsonb_build_object('operacional', a_pagar_op, 'investimento', a_pagar_inv),
      'pct_direto', CASE WHEN custo_direto + rateado_op + rateio_admin > 0 THEN round(100*custo_direto/(custo_direto + rateado_op + rateio_admin),0) END
    ) FROM tot),
  'centros', coalesce((SELECT j FROM centros_json), '[]'::jsonb),
  'rateio_admin', (SELECT jsonb_build_object('admin_total', round(admin_total,2), 'parcela_agricultura', round(valor,2), 'declarado', declarado) FROM admin_pool),
  'pool_compartilhado', (SELECT coalesce(jsonb_object_agg(bloco, round(valor,2)), '{}'::jsonb) FROM (SELECT bloco, sum(valor) valor FROM comp GROUP BY 1) q),
  'nao_apropriado', (SELECT jsonb_build_object('por_bloco', j, 'total', round(total,2)) FROM nao_aprop),
  'gerado_em', now()
);
$function$;

-- ════════════════════ 3/3 · fn_dre_pecuaria ════════════════════
CREATE OR REPLACE FUNCTION public.fn_dre_pecuaria(p_cliente uuid, p_de text, p_ate text, p_cenario text DEFAULT 'realizado'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_ini date; v_fim date; v_p0 text; v_res jsonb;
begin
  v_ini := to_date(p_de||'-01','YYYY-MM-DD');
  v_fim := (to_date(p_ate||'-01','YYYY-MM-DD') + interval '1 month' - interval '1 day')::date;
  v_p0 := to_char(v_ini - interval '1 month','YYYY-MM');
  with plm as (
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
  faz as (
    select f.id, f.nome from fazendas f where f.cliente_id=p_cliente
      and (exists(select 1 from valor_rebanho_fechamento_itens i where i.fazenda_id=f.id and i.ano_mes between v_p0 and p_ate)
        or exists(select 1 from financeiro_lancamentos_v2 l join financeiro_plano_contas p on p.id=l.plano_conta_id where l.fazenda_id=f.id and coalesce(l.cancelado,false)=false and p.escopo_negocio='pecuaria' and p.bloco_dre is not null and p.bloco_dre<>'juros' and l.cenario=p_cenario and l.data_competencia between v_ini and v_fim and not (p_cenario='meta' and l.origem_lancamento='movimentacao_rebanho' and p.bloco_dre in ('venda','reposicao')))
        or exists(select 1 from plm where plm.fazenda_id=f.id and plm.escopo_negocio='pecuaria' and plm.bloco_dre is not null and plm.bloco_dre<>'juros'))
  ),
  fin as (
    select fazenda_id, bloco, sum(valor) valor, sum(a_pagar) a_pagar from (
    select l.fazenda_id, p.bloco_dre bloco, l.valor, case when l.status_transacao<>'realizado' then l.valor else 0 end a_pagar
    from financeiro_lancamentos_v2 l join financeiro_plano_contas p on p.id=l.plano_conta_id
    where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario and p.escopo_negocio='pecuaria' and p.bloco_dre is not null
      and l.data_competencia between v_ini and v_fim
      and not (p_cenario='meta' and l.origem_lancamento='movimentacao_rebanho' and p.bloco_dre in ('venda','reposicao'))
      and ((p.bloco_dre in ('venda','receita') and l.tipo_operacao='1-Entradas') or (p.bloco_dre not in ('venda','receita') and l.tipo_operacao='2-Saídas'))
    union all
    select fazenda_id, bloco_dre, valor, 0 from plm
    where escopo_negocio='pecuaria' and bloco_dre is not null and ((bloco_dre in ('venda','receita') and tipo_operacao='1-Entradas') or (bloco_dre not in ('venda','receita') and tipo_operacao='2-Saídas'))
    ) u
    group by 1,2
  ),
  jurc as (
    select bloco, centro, sum(valor) valor, sum(a_pagar) a_pagar from (
    select p.bloco_dre bloco, coalesce(p.centro_custo,'(sem)') centro, l.valor, case when l.status_transacao<>'realizado' then l.valor else 0 end a_pagar
    from financeiro_lancamentos_v2 l join financeiro_plano_contas p on p.id=l.plano_conta_id
    where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario and p.escopo_negocio='pecuaria' and p.bloco_dre='juros'
      and l.data_competencia between v_ini and v_fim and l.tipo_operacao='2-Saídas'
    union all
    select bloco_dre, coalesce(centro_custo,'(sem)'), valor, 0 from plm
    where escopo_negocio='pecuaria' and bloco_dre='juros' and tipo_operacao='2-Saídas'
    ) u
    group by 1,2
  ),
  jur as (select coalesce(sum(valor),0) valor, coalesce(sum(a_pagar),0) a_pagar from jurc),
  jurl as (
    select l.fazenda_id, l.valor
    from financeiro_lancamentos_v2 l join financeiro_plano_contas p on p.id=l.plano_conta_id
    where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario and p.escopo_negocio='pecuaria' and p.bloco_dre='juros'
      and l.data_competencia between v_ini and v_fim and l.tipo_operacao='2-Saídas'
    union all
    select fazenda_id, valor from plm
    where escopo_negocio='pecuaria' and bloco_dre='juros' and tipo_operacao='2-Saídas'
  ),
  jurf as (select fazenda_id, coalesce(sum(valor),0) valor from jurl where fazenda_id in (select id from faz) group by 1),
  jurx as (select coalesce(sum(valor),0) valor from jurl where fazenda_id is null or fazenda_id not in (select id from faz)),
  cabm as (
    select fazenda_id,
      round(sum(case when ano_mes in (v_p0, p_ate) then q/2.0 else q end)
            / (extract(year from age(v_fim+1,v_ini))*12+extract(month from age(v_fim+1,v_ini))),0) cab_media
    from (select fazenda_id, ano_mes, sum(saldo_final) q from zoot_mensal_cache where cliente_id=p_cliente and cenario=p_cenario and ano_mes between v_p0 and p_ate group by 1,2) m
    group by 1
  ),
  p0 as (select fazenda_id, categoria, quantidade q, peso_medio_kg pm, preco_kg pk from valor_rebanho_fechamento_itens where cliente_id=p_cliente and ano_mes=v_p0 and p_cenario='realizado'),
  p1 as (select fazenda_id, categoria, quantidade q, peso_medio_kg pm, preco_kg pk from valor_rebanho_fechamento_itens where cliente_id=p_cliente and ano_mes=p_ate and p_cenario='realizado'),
  pat as (
    select k.fazenda_id,
      round(sum(coalesce(p0.q*p0.pm*p0.pk,0)),2) v_ini_p0,
      round(sum(coalesce(p1.q*p1.pm,0)*coalesce(p0.pk,p1.pk)),2) v_fim_p0,
      round(sum(coalesce(p1.q*p1.pm*p1.pk,0)),2) v_fim_p1,
      sum(coalesce(p0.q,0)) cab_ini, sum(coalesce(p1.q,0)) cab_fim,
      bool_or(p0.categoria is not null) tem_p0, bool_or(p1.categoria is not null) tem_p1
    from (select fazenda_id, categoria from p0 union select fazenda_id, categoria from p1) k
    left join p0 on p0.fazenda_id=k.fazenda_id and p0.categoria=k.categoria
    left join p1 on p1.fazenda_id=k.fazenda_id and p1.categoria=k.categoria
    group by 1
  ),
  patm as (
    select f.id fazenda_id,
      round((case when extract(month from v_ini)=1
        then (select sum(r.valor_total) from valor_rebanho_realizado_validado r
              where r.cliente_id=p_cliente and r.fazenda_id=f.id and r.ano_mes=v_p0 and r.status='validado')
        else (select sum(m.valor_total) from valor_rebanho_meta_validada m
              where m.cliente_id=p_cliente and m.fazenda_id=f.id and m.ano_mes=v_p0) end)::numeric, 2) v_ini,
      round((select sum(m.valor_total) from valor_rebanho_meta_validada m
             where m.cliente_id=p_cliente and m.fazenda_id=f.id and m.ano_mes=p_ate)::numeric, 2) v_fim
    from faz f where p_cenario<>'realizado'
  ),
  adm as (
    select coalesce(sum(a.total*coalesce(r.percentual,0)/100.0),0) pool, coalesce(sum(a.total),0) bruto
    from (select ano, sum(valor) total from (
          select extract(year from l.data_competencia)::int ano, l.valor from financeiro_lancamentos_v2 l
          where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas'
            and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências','Tributos')
            and l.data_competencia between v_ini and v_fim
          union all
          select extract(year from comp)::int, valor from plm
          where escopo_negocio='administrativo' and tipo_operacao='2-Saídas'
            and macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências','Tributos')
          ) u group by 1) a
    left join agri_rateio_admin r on r.cliente_id=p_cliente and r.ano=a.ano and r.atividade='pecuaria'
  ),
  areap as (
    select fp.fazenda_id, fp.ano_mes, sum(pa.area_produtiva_ha) a
    from fechamento_pastos fp join pastos pa on pa.id=fp.pasto_id
    where fp.cliente_id=p_cliente and fp.ano_mes between p_de and p_ate and pa.area_produtiva_ha > 0
      and coalesce(fp.tipo_uso_mes, pa.tipo_uso) in ('cria','recria','engorda','vedado','reforma_pecuaria')
    group by 1,2
  ),
  arear as (
    select s.fazenda_id, round(avg(x.a) filter (where x.a > 0),1) ha
    from fechamento_area_snapshot s
    left join areap ap on ap.fazenda_id=s.fazenda_id and ap.ano_mes=to_char(s.ano_mes,'YYYY-MM')
    cross join lateral (select coalesce(ap.a, nullif(s.area_pecuaria_ha,0), 0) a) x
    where s.cliente_id=p_cliente and s.ano_mes between v_ini and v_fim
    group by 1
  ),
  aream as (
    select fazenda_id, round(avg(area_pecuaria_ha) filter (where area_pecuaria_ha > 0),1) ha
    from planejamento_area_meta
    where cliente_id=p_cliente and make_date(ano, mes, 1) between v_ini and v_fim
    group by 1
  ),
  prod as (
    select fazenda_id, round(sum(producao_biologica)/30.0,2) at
    from zoot_mensal_cache
    where cliente_id=p_cliente and cenario='realizado' and p_cenario='realizado' and ano_mes between p_de and p_ate
    group by 1
  ),
  movz as (
    select l.fazenda_id,
      round(sum(case when l.tipo='abate' then l.quantidade*coalesce(l.peso_carcaca_kg,0)/15.0
                     else l.quantidade*coalesce(l.peso_medio_kg,0)*0.5/15.0 end)
            filter (where l.tipo in ('abate','venda','venda_pe','consumo')),2) at_desf,
      sum(l.quantidade) filter (where l.tipo in ('abate','venda','venda_pe','consumo')) cab_desf,
      round(sum(l.quantidade*coalesce(l.peso_medio_kg,0)/30.0) filter (where l.tipo='compra'),2) at_comp,
      sum(l.quantidade) filter (where l.tipo='compra') cab_comp
    from lancamentos l
    where l.cliente_id=p_cliente and l.cenario=p_cenario and coalesce(l.cancelado,false)=false
      and l.data between v_ini and v_fim and l.tipo in ('abate','venda','venda_pe','consumo','compra')
    group by 1
  ),
  finc as (
    select fazenda_id, bloco, centro, sum(valor) valor, sum(a_pagar) a_pagar from (
    select l.fazenda_id, p.bloco_dre bloco, coalesce(p.centro_custo,'(sem)') centro, l.valor, case when l.status_transacao<>'realizado' then l.valor else 0 end a_pagar
    from financeiro_lancamentos_v2 l join financeiro_plano_contas p on p.id=l.plano_conta_id
    where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario and p.escopo_negocio='pecuaria' and p.bloco_dre is not null
      and l.data_competencia between v_ini and v_fim
      and not (p_cenario='meta' and l.origem_lancamento='movimentacao_rebanho' and p.bloco_dre in ('venda','reposicao'))
      and ((p.bloco_dre in ('venda','receita') and l.tipo_operacao='1-Entradas') or (p.bloco_dre not in ('venda','receita') and l.tipo_operacao='2-Saídas'))
      and p.bloco_dre<>'juros'
    union all
    select fazenda_id, bloco_dre, coalesce(centro_custo,'(sem)'), valor, 0 from plm
    where escopo_negocio='pecuaria' and bloco_dre is not null and bloco_dre<>'juros' and ((bloco_dre in ('venda','receita') and tipo_operacao='1-Entradas') or (bloco_dre not in ('venda','receita') and tipo_operacao='2-Saídas'))
    ) u
    group by 1,2,3
  ),
  base as (
    select f.id fazenda_id, f.nome,
      case when p_cenario='realizado' then coalesce(pt.v_ini_p0,0) else coalesce(pm.v_ini,0) end v_ini_p0,
      case when p_cenario='realizado' then coalesce(pt.v_fim_p0,0) end v_fim_p0,
      case when p_cenario='realizado' then coalesce(pt.v_fim_p1,0) else coalesce(pm.v_fim,0) end v_fim_p1,
      coalesce(pt.cab_ini,0) cab_ini, coalesce(pt.cab_fim,0) cab_fim, coalesce(cm.cab_media,0) cab_media,
      case when p_cenario='realizado' then coalesce(pt.tem_p0,false) else pm.v_ini is not null end tem_p0,
      case when p_cenario='realizado' then coalesce(pt.tem_p1,false) else pm.v_fim is not null end tem_p1,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='venda'),0) vendas,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='receita'),0) outras_receitas,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='deducao'),0) deducoes,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='reposicao'),0) reposicao,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='variavel'),0) custo_variavel,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='fixo'),0) custo_fixo,
      coalesce((select valor from jurf where jurf.fazenda_id=f.id),0) juros_proprio,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='investimento'),0) investimento,
      coalesce((select sum(a_pagar) from fin where fin.fazenda_id=f.id and bloco in ('deducao','reposicao','variavel','fixo')),0) a_pagar,
      case when p_cenario='realizado' then ar.ha else am.ha end ha_medio,
      pr.at at_produzida, mz.at_desf at_desfrutada, mz.cab_desf cab_desfrutada, mz.at_comp at_comprada, mz.cab_comp cab_comprada
    from faz f left join pat pt on pt.fazenda_id=f.id left join cabm cm on cm.fazenda_id=f.id
      left join patm pm on pm.fazenda_id=f.id
      left join arear ar on ar.fazenda_id=f.id left join aream am on am.fazenda_id=f.id
      left join prod pr on pr.fazenda_id=f.id left join movz mz on mz.fazenda_id=f.id
  ),
  calc as (
    select b.*,
      (select pool from adm) pool_adm, (select bruto from adm) adm_bruto,
      case when (select sum(cab_media) from base)>0 then round((select pool from adm) * b.cab_media / (select sum(cab_media) from base),2) else 0 end rateio_adm,
      case when (select sum(cab_media) from base)>0 then round((select valor from jurx) * b.cab_media / (select sum(cab_media) from base),2) else 0 end juros_rateado_bruto,
      case when (select sum(cab_media) from base)>0 and b.fazenda_id=(select fazenda_id from base order by cab_media desc, fazenda_id limit 1)
        then round((select valor from jurx),2) - coalesce((select sum(round((select valor from jurx) * b2.cab_media / (select sum(cab_media) from base),2)) from base b2),0)
        else 0 end juros_sobra,
      case when b.tem_p0 and b.tem_p1 then
        (case when p_cenario='realizado' then b.v_fim_p0 - b.v_ini_p0 else b.v_fim_p1 - b.v_ini_p0 end) else null end vpb_operacional,
      case when b.tem_p0 and b.tem_p1 and p_cenario='realizado' then b.v_fim_p1 - b.v_fim_p0 else null end efeito_mercado
    from base b
  ),
  jcalc as (
    select c.*, c.juros_rateado_bruto + c.juros_sobra juros_rateado,
      c.juros_proprio + c.juros_rateado_bruto + c.juros_sobra juros
    from calc c
  ),
  linhas as (
    select c.*, vendas+outras_receitas receita_bruta, vendas+outras_receitas-deducoes receita_liquida,
      vendas+outras_receitas-deducoes+coalesce(vpb_operacional,0)-reposicao vbp,
      vendas+outras_receitas-deducoes+coalesce(vpb_operacional,0)-reposicao-custo_variavel margem,
      vendas+outras_receitas-deducoes+coalesce(vpb_operacional,0)-reposicao-custo_variavel-custo_fixo-rateio_adm resultado_operacional,
      vendas+outras_receitas-deducoes+coalesce(vpb_operacional,0)-reposicao-custo_variavel-custo_fixo-rateio_adm-juros resultado_periodo,
      vendas+outras_receitas-deducoes+coalesce(vpb_operacional,0)-reposicao-custo_variavel-custo_fixo-rateio_adm-juros+coalesce(efeito_mercado,0) resultado_com_mercado,
      vendas+outras_receitas-deducoes+coalesce(vpb_operacional,0)-reposicao-custo_variavel-custo_fixo-rateio_adm-juros+coalesce(efeito_mercado,0)-coalesce(investimento,0) lucro_liquido
    from jcalc c
  ),
  js as (
    select fazenda_id, nome, jsonb_build_object(
      'vendas',vendas,'outras_receitas',outras_receitas,'receita_bruta',receita_bruta,'deducoes',deducoes,'receita_liquida',receita_liquida,
      'vpb_operacional',vpb_operacional,'reposicao',reposicao,'vbp',vbp,'custo_variavel',custo_variavel,'margem',margem,
      'custo_fixo',custo_fixo,'rateio_adm',rateio_adm,'resultado_operacional',resultado_operacional,'juros',juros,'resultado_periodo',resultado_periodo,
      'efeito_mercado',efeito_mercado,'resultado_com_mercado',resultado_com_mercado,'investimento',investimento,'lucro_liquido',lucro_liquido,'juros_proprio',juros_proprio,'juros_rateado',juros_rateado,'a_pagar',a_pagar,
      'patrimonio',jsonb_build_object('v_ini_p0',v_ini_p0,'v_fim_p0',v_fim_p0,'v_fim_p1',v_fim_p1,'cab_ini',cab_ini,'cab_fim',cab_fim,'cab_media',cab_media)
        || case when p_cenario<>'realizado' then jsonb_build_object('criterio','variacao total (PC-100)') else '{}'::jsonb end,
      'sem_p0',not tem_p0,'sem_p1',not tem_p1,
      'producao',jsonb_build_object('ha_medio',ha_medio,'at_produzida',at_produzida,'at_desfrutada',at_desfrutada,
        'cab_desfrutada',cab_desfrutada,'at_comprada',at_comprada,'cab_comprada',cab_comprada),
      'centros', coalesce((select jsonb_agg(jsonb_build_object('bloco',bloco,'centro',centro,'valor',valor,'a_pagar',a_pagar) order by bloco, centro) from finc where finc.fazenda_id=linhas.fazenda_id),'[]'::jsonb)) l
    from linhas
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('de',p_de,'ate',p_ate,'p0',v_p0,'meses',(extract(year from age(v_fim+1,v_ini))*12+extract(month from age(v_fim+1,v_ini)))::int),
    'rateio_adm', jsonb_build_object('pool',(select pool from adm),'bruto',(select bruto from adm),'criterio','cabecas medias no periodo'),
    'fazendas', coalesce((select jsonb_agg(jsonb_build_object('fazenda_id',fazenda_id,'nome',nome,'linhas',l) order by nome) from js),'[]'::jsonb),
    'total', (select jsonb_build_object(
      'vendas',sum(vendas),'outras_receitas',sum(outras_receitas),'receita_bruta',sum(receita_bruta),'deducoes',sum(deducoes),'receita_liquida',sum(receita_liquida),
      'vpb_operacional',sum(vpb_operacional),'reposicao',sum(reposicao),'vbp',sum(vbp),'custo_variavel',sum(custo_variavel),'margem',sum(margem),
      'custo_fixo',sum(custo_fixo),'rateio_adm',sum(rateio_adm),'resultado_operacional',sum(resultado_operacional),'juros',sum(juros),'resultado_periodo',sum(resultado_periodo),
      'efeito_mercado',sum(efeito_mercado),'resultado_com_mercado',sum(resultado_com_mercado),'investimento',sum(investimento),'lucro_liquido',sum(lucro_liquido),'juros_proprio',sum(juros_proprio),'juros_rateado',sum(juros_rateado),'juros_nao_rateado',(case when (select sum(cab_media) from base)>0 then 0 else (select valor from jurx) end),'a_pagar',sum(a_pagar)+(select a_pagar from jur),
      'patrimonio',jsonb_build_object('v_ini_p0',sum(v_ini_p0),'v_fim_p0',sum(v_fim_p0),'v_fim_p1',sum(v_fim_p1),'cab_ini',sum(cab_ini),'cab_fim',sum(cab_fim),'cab_media',sum(cab_media))
        || case when p_cenario<>'realizado' then jsonb_build_object('criterio','variacao total (PC-100)') else '{}'::jsonb end,
      'producao',jsonb_build_object('ha_medio',sum(ha_medio),'at_produzida',sum(at_produzida),'at_desfrutada',sum(at_desfrutada),
        'cab_desfrutada',sum(cab_desfrutada),'at_comprada',sum(at_comprada),'cab_comprada',sum(cab_comprada)),
      'centros', coalesce((select jsonb_agg(jsonb_build_object('bloco',bloco,'centro',centro,'valor',valor,'a_pagar',a_pagar) order by bloco, centro) from (select bloco, centro, sum(valor) valor, sum(a_pagar) a_pagar from finc group by 1,2 union all select bloco, centro, valor, a_pagar from jurc) t),'[]'::jsonb),
      'centros_juros', coalesce((select jsonb_agg(jsonb_build_object('bloco',bloco,'centro',centro,'valor',valor,'a_pagar',a_pagar) order by bloco, centro) from jurc),'[]'::jsonb))
      from linhas)
  ) into v_res;
  return v_res;
end $function$;

-- ════════════════════ ACL — o rodapé de toda função desta casa ════════════════════
REVOKE ALL ON FUNCTION public.fn_dre_pecuaria(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_dre_pecuaria(uuid, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_dre_lavoura(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_dre_lavoura(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_dre_agricola_por_safra(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_dre_agricola_por_safra(uuid, uuid) TO authenticated;
