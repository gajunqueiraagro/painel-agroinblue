-- O DRE DA LAVOURA PARA DE SOMAR ORCAMENTO — e as tres irmas que alimentam as mesmas telas.
--
-- ⚠ MESMO DEFEITO DA PECUARIA (20261027125000), MESMO CONSERTO. `financeiro_lancamentos_v2`
--   guarda o orcamento (`cenario='meta'`) na mesma tabela da operacao (`cenario='realizado'`), e
--   nenhuma funcao do DRE agricola separava os dois. Medido em 22/09/2026: das 12 leituras de
--   `financeiro_lancamentos_v2` nestas quatro funcoes, nenhuma filtrava `cenario`.
--
-- ⚠ HOJE O NUMERO NAO MUDA, e isso foi medido, nao presumido. As 52 linhas de meta do banco sao
--   TODAS de escopo `pecuaria` (5 clientes; o NJ tem 2). Nas 9 safras agricolas do NJ, os dois
--   CTEs da `fn_dre_lavoura` recebem ZERO linhas de meta. O filtro e' defensivo: fecha a porta
--   antes do primeiro orcamento de lavoura, que entraria no DRE como custo realizado.
--
-- O FILTRO E' `cenario`, NUNCA `status_transacao` — a mesma razao da pecuaria: o cenario
--   `realizado` tem `previsto`/`programado`/`agendado`, que e' operacao real a pagar. Eles seguem
--   entrando, como "a pagar".
--
-- AS QUATRO FUNCOES, 12 leituras, e a unica mudanca e' `and l.cenario='realizado'` logo apos o
-- `coalesce(l.cancelado,false)=false` de cada leitura:
--   fn_dre_lavoura             2  (CTE lanc, CTE admin_por_ano)         SECURITY INVOKER
--   fn_dre_agricola_por_safra  2  (CTE lanc, CTE admin_por_ano)         SECURITY INVOKER
--   fn_painel_rateio_detalhe   5  (drill do centro + 4 do pool admin)   SECURITY DEFINER
--   fn_painel_safra            3  (natureza, fora do custeio, invest.)  SECURITY DEFINER
--
-- ⚠ O MODO DE SEGURANCA DE CADA UMA FOI PRESERVADO, e isso corrige o briefing: `fn_dre_lavoura`
--   e `fn_dre_agricola_por_safra` sao SECURITY INVOKER (`prosecdef=false`), nao DEFINER. Rodam
--   como quem chama, com a RLS por tenant valendo. Recria-las como DEFINER passaria por cima da
--   RLS. Os cabecalhos abaixo sao os das migrations vigentes, sem alteracao.
--
-- ⚠ OS CORPOS VIERAM DO REPO, CONFERIDOS CONTRA O BANCO ANTES DE EDITAR (md5 do prosrc):
--   fn_dre_lavoura             20261027121100  0adcf1a0  igual
--   fn_dre_agricola_por_safra  20260918120000  77f1d587  igual
--   fn_painel_rateio_detalhe   20261027120800  14efb502  igual
--   fn_painel_safra            20261027121300  8846ef61  igual
--   A edicao foi feita por substituicao contada: o padrao aparece exatamente o numero de leituras
--   de cada funcao, e nenhum outro trecho mudou.
--
-- ⚠ FICARAM DE FORA DUAS IRMAS, e por motivo, nao por esquecimento:
--   fn_painel_safra_entrega     le lancamentos pelo ELO da colheita (agri_colheita_lancamentos);
--                               um orcamento nao tem elo, entao o filtro nao mudaria nada.
--   fn_painel_safra_comparativo tem dois defeitos alem deste na mesma leitura: nao filtra
--                               `cliente_id` nem `cancelado`. Acrescentar so' o cenario seria meio
--                               conserto; ela vira PR proprio. (O DRE que ela consome vem de
--                               fn_dre_agricola_por_safra, que este arquivo ja' corrige.)
--
-- ⚠ ACL: `fn_dre_lavoura` estava com EXECUTE para PUBLIC (anon=true). O rodape fecha as quatro:
--   REVOKE de PUBLIC e GRANT so' para authenticated. As chamadas internas (fn_painel_safra e
--   fn_painel_safra_comparativo chamam fn_dre_agricola_por_safra) rodam como o dono, e nao
--   dependem do grant de PUBLIC.
--
-- ⚠ ACENTOS NOS CORPOS ('2-Saídas', 'Receita Agrícola', 'Deduções Agricultura', 'Transferências',
--   'Saída Financeira'...) sao valores comparados em WHERE/FILTER. Conferir o md5 do prosrc depois
--   de aplicar: um acento engolido pelo canal faria a comparacao falhar em silencio.

CREATE OR REPLACE FUNCTION public.fn_dre_lavoura(p_cliente_id uuid, p_safra_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $fn$
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
        'investimento', jsonb_build_object('valor', investimento), 'depreciacao', jsonb_build_object('valor', NULL)),
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
$fn$;

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
    (11,'depreciacao','Depreciação', null::numeric)
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
    (11,'depreciacao','Depreciação', null::numeric)
  ) v(ordem,linha,rotulo,valor)
),
residuo as (
  select v.ordem, v.valor from (select (1-(select sp from sum_peso)) f) x cross join lateral (values
    (7, (select custos from comp)*x.f),
    (8, (select valor from admin_rateado)*x.f),
    (10, (select inv from comp)*x.f)
  ) v(ordem,valor)
),
esqueleto as (
  select v.ordem, v.linha, v.rotulo from (values
    (1,'receita_bruta','Receita bruta'),(2,'deducoes','(-) Deduções'),(3,'receita_liquida','= Receita líquida'),
    (4,'custo_variavel','(-) Custo variável direto'),(5,'custo_fixo','(-) Custo fixo'),(6,'juros','(-) Juros de financiamento'),
    (7,'rateio_compartilhado','(-) Rateio compartilhado'),(8,'rateio_admin','(-) Rateio administrativo'),
    (9,'resultado_caixa','= Resultado de caixa'),(10,'investimento','Investimento no período'),(11,'depreciacao','Depreciação')
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

CREATE OR REPLACE FUNCTION public.fn_painel_rateio_detalhe(p_cliente uuid, p_safra_id uuid, p_cultura text, p_tipo text, p_chave text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_pool numeric:=0; v_direto numeric:=0; v_bruto numeric:=0; v_pct numeric; v_fat_atv jsonb; v_fatias jsonb; v_lanc jsonb; v_ini date; v_fim date;
begin
  select data_inicio, data_fim into v_ini, v_fim from financeiro_safras where id=p_safra_id;
  if p_tipo in ('natureza','investimento','pool_fixo','pool_investimento') then
    with lc as (
      select l.id lid, l.data_competencia dt, l.descricao ds, coalesce(f.nome_favorecido,f.nome,'-') fav, l.valor vl, (l.cultura is null) comp, l.centro_custo ctr
      from financeiro_lancamentos_v2 l left join financeiro_fornecedores f on f.id=l.favorecido_id
      where l.cliente_id=p_cliente and l.safra_id=p_safra_id and coalesce(l.cancelado,false)=false and l.cenario='realizado'
        and (l.cultura is null or l.cultura=p_cultura)
        and ((p_tipo in ('natureza','pool_fixo','pool_investimento') and (p_tipo='pool_investimento' or l.compoe_dre) and l.tipo_operacao='2-Saídas' and (p_tipo='pool_investimento' or coalesce(l.macro_custo,'') not ilike '%investimento%')
                and (p_chave is null or coalesce(l.centro_custo,'(sem)')=p_chave)
                and (p_chave is not null or (l.cultura is null and exists (select 1 from financeiro_plano_contas pc where pc.id=l.plano_conta_id and pc.bloco_dre = any(case p_tipo when 'pool_fixo' then array['fixo'] when 'pool_investimento' then array['investimento'] else array['custeio','pos_colheita'] end)))))
          or (p_tipo='investimento' and coalesce(l.macro_custo,'') ilike '%investimento%' and (coalesce(l.centro_custo,'(sem)')=p_chave or coalesce(l.subcentro,'(sem)')=p_chave))))
    select coalesce(sum(vl) filter (where comp),0), coalesce(sum(vl) filter (where not comp),0),
      coalesce(jsonb_agg(jsonb_build_object('id',lid,'data',dt,'descricao',ds,'favorecido',fav,'valor',vl,'compartilhado',comp,'centro',ctr) order by dt),'[]'::jsonb)
      into v_pool, v_direto, v_lanc from lc;
  elsif p_tipo='admin' then
    select coalesce(sum(a.total*coalesce(r.percentual,0)/100.0),0) into v_pool
      from (select extract(year from l.data_competencia)::int ano, sum(l.valor) total
            from financeiro_lancamentos_v2 l where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario='realizado'
              and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas' and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências','Tributos') and l.data_competencia between v_ini and v_fim group by 1) a
      left join agri_rateio_admin r on r.cliente_id=p_cliente and r.ano=a.ano and r.atividade='agricultura';
    select coalesce(sum(l.valor),0) into v_bruto from financeiro_lancamentos_v2 l where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario='realizado' and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas' and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências','Tributos') and l.data_competencia between v_ini and v_fim;
    v_pct := round(100*v_pool/nullif(v_bruto,0),1);
    select coalesce(jsonb_agg(jsonb_build_object('atividade', atividade, 'valor', round(valor,2)) order by valor desc),'[]'::jsonb) into v_fat_atv from (select r.atividade, sum(a.total*coalesce(r.percentual,0)/100.0) valor from (select extract(year from l.data_competencia)::int ano, sum(l.valor) total from financeiro_lancamentos_v2 l where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario='realizado' and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas' and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências','Tributos') and l.data_competencia between v_ini and v_fim group by 1) a join agri_rateio_admin r on r.cliente_id=p_cliente and r.ano=a.ano group by r.atividade) t;
    select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'data',l.data_competencia,'descricao',l.descricao,'favorecido',coalesce(f.nome_favorecido,f.nome,'-'),'valor',l.valor,'compartilhado',true) order by l.data_competencia),'[]'::jsonb)
      into v_lanc from financeiro_lancamentos_v2 l left join financeiro_fornecedores f on f.id=l.favorecido_id
      where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario='realizado' and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas' and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências','Tributos') and l.data_competencia between v_ini and v_fim;
  end if;
  with areas as (select cultura, sum(area_plantada_ha) ha from agri_safra_area where safra_id=p_safra_id and cliente_id=p_cliente and ativo and status='plantada' group by cultura), tot as (select coalesce(sum(ha),0) t from areas)
  select coalesce(jsonb_agg(jsonb_build_object('cultura',cultura,'area_ha',ha,
      'peso',case when (select t from tot)>0 then round(100*ha/(select t from tot),1) else 0 end,
      'valor',case when (select t from tot)>0 then round(v_pool*ha/(select t from tot),2) else 0 end,
      'atual',(cultura=p_cultura)) order by ha desc),'[]'::jsonb) into v_fatias from areas;
  return jsonb_build_object('pool',round(v_pool,2),'direto_cultura',round(v_direto,2),'fatias',v_fatias,'lancamentos',coalesce(v_lanc,'[]'::jsonb),'pct_agricultura',v_pct,'fatias_atividade',v_fat_atv);
end $function$;

CREATE OR REPLACE FUNCTION public.fn_painel_safra(p_cliente uuid, p_safra_id uuid, p_cultura text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_area numeric; v_sacas numeric; v_res jsonb; v_dre jsonb; v_natureza jsonb; v_fora numeric;
  v_inv_tipos jsonb; v_talhoes jsonb; v_peso numeric := 0;
begin
  select coalesce(sum(a.area_plantada_ha),0) into v_area
    from agri_safra_area a where a.safra_id=p_safra_id and a.cultura=p_cultura and a.ativo and a.cliente_id=p_cliente;
  select case when coalesce((select sum(area_plantada_ha) from agri_safra_area where safra_id=p_safra_id and cliente_id=p_cliente and ativo and status='plantada'),0)>0 then coalesce((select sum(area_plantada_ha) from agri_safra_area where safra_id=p_safra_id and cliente_id=p_cliente and cultura=p_cultura and ativo and status='plantada'),0) / (select sum(area_plantada_ha) from agri_safra_area where safra_id=p_safra_id and cliente_id=p_cliente and ativo and status='plantada') else 0 end into v_peso;
  select coalesce(sum(coalesce(col.toneladas, col.sacas_boas+col.grao_roca_sacas)),0) into v_sacas
    from agri_colheita col join agri_safra_area a on a.id=col.safra_area_id
    where a.safra_id=p_safra_id and a.cultura=p_cultura and col.ativo and col.cliente_id=p_cliente;

  select jsonb_object_agg(d.linha, d.valor) into v_dre
    from public.fn_dre_agricola_por_safra(p_cliente, p_safra_id) d where d.cultura=p_cultura;

  select jsonb_agg(jsonb_build_object('centro', centro, 'n', n, 'valor', valor, 'direto', direto, 'compartilhado', compartilhado) order by valor desc) into v_natureza
    from (select coalesce(l.centro_custo,'(sem)') centro, count(*) n, coalesce(sum(l.valor) filter (where l.cultura=p_cultura),0) + coalesce(sum(l.valor) filter (where coalesce(l.cultura,'')=''),0)*v_peso valor, coalesce(sum(l.valor) filter (where l.cultura=p_cultura),0) direto, coalesce(sum(l.valor) filter (where coalesce(l.cultura,'')=''),0) compartilhado
      from financeiro_lancamentos_v2 l
      where l.cliente_id=p_cliente and l.safra_id=p_safra_id and coalesce(l.cancelado,false)=false and l.cenario='realizado' and coalesce(l.cultura,'') in (p_cultura,'')
        and l.compoe_dre=true and l.tipo_operacao='2-Saídas' and coalesce(l.macro_custo,'') not ilike '%investimento%'
      group by l.centro_custo) t;

  select coalesce(sum(l.valor),0) into v_fora
    from financeiro_lancamentos_v2 l
    where l.cliente_id=p_cliente and l.safra_id=p_safra_id and coalesce(l.cancelado,false)=false and l.cenario='realizado' and coalesce(l.cultura,'') in (p_cultura,'')
      and l.tipo_operacao='2-Saídas' and l.compoe_dre=false and coalesce(l.macro_custo,'') not ilike '%investimento%';

  select jsonb_agg(jsonb_build_object('tipo', subcentro, 'valor', valor,
           'valor_ha', case when v_area>0 then round(valor/v_area,2) else 0 end, 'direto', direto, 'compartilhado', compartilhado) order by valor desc) into v_inv_tipos
    from (select l.subcentro, coalesce(sum(l.valor) filter (where l.cultura=p_cultura),0) + coalesce(sum(l.valor) filter (where coalesce(l.cultura,'')=''),0)*v_peso valor, coalesce(sum(l.valor) filter (where l.cultura=p_cultura),0) direto, coalesce(sum(l.valor) filter (where coalesce(l.cultura,'')=''),0) compartilhado
      from financeiro_lancamentos_v2 l
      where l.cliente_id=p_cliente and l.safra_id=p_safra_id and coalesce(l.cancelado,false)=false and l.cenario='realizado' and coalesce(l.cultura,'') in (p_cultura,'')
        and l.macro_custo ilike '%investimento%'
      group by l.subcentro) t;

  -- CORRIGIDO: area e sacas somadas SEPARADO antes de juntar (senao o join multiplica a area)
  select jsonb_agg(jsonb_build_object('talhao', talhao, 'variedade', variedade, 'area_ha', ha,
           'sacas', sacas, 'sacas_boas', boas, 'roca_sacas', roca, 'pct_afla20', pct_afla20, 'sacas_ha', case when ha>0 then round(sacas/ha,2) else 0 end, 'cargas', cargas)
           order by (case when ha>0 then sacas/ha else 0 end) desc) into v_talhoes
    from (
      select coalesce(p.nome,'(sem talhao)') talhao, ar.variedade, ar.ha,
             coalesce(c.sacas,0) sacas, coalesce(c.boas,0) boas, coalesce(c.roca,0) roca, coalesce(c.pct_afla20,0) pct_afla20, coalesce(c.cargas,0) cargas
      from (
        select a.pasto_id, a.variedade, sum(a.area_plantada_ha) ha
        from agri_safra_area a
        where a.safra_id=p_safra_id and a.cultura=p_cultura and a.ativo and a.cliente_id=p_cliente
        group by a.pasto_id, a.variedade
      ) ar
      left join pastos p on p.id=ar.pasto_id
      left join lateral (
        select sum(coalesce(col.toneladas, col.sacas_boas+col.grao_roca_sacas)) sacas, sum(col.sacas_boas) boas, sum(col.grao_roca_sacas) roca, round(100*coalesce(sum(col.sacas_boas) filter (where col.aflatoxina_ppb>20),0)/nullif(sum(col.sacas_boas),0),1) pct_afla20, count(col.id) cargas
        from agri_colheita col join agri_safra_area a2 on a2.id=col.safra_area_id
        where a2.pasto_id=ar.pasto_id and coalesce(a2.variedade,'')=coalesce(ar.variedade,'')
          and a2.safra_id=p_safra_id and a2.cultura=p_cultura and col.ativo
      ) c on true
    ) t;

  v_res := jsonb_build_object(
    'area_ha', v_area, 'total_sacas', v_sacas,
    'sacas_ha', case when v_area>0 then round(v_sacas/v_area,2) else 0 end,
    'faturamento', coalesce((v_dre->>'receita_bruta')::numeric,0),
    'deducoes', coalesce((v_dre->>'deducoes')::numeric,0),
    'custo_variavel', coalesce((v_dre->>'custo_variavel')::numeric,0),
    'custo_fixo', coalesce((v_dre->>'custo_fixo')::numeric,0),
    'juros', coalesce((v_dre->>'juros')::numeric,0),
    'rateio_compartilhado', coalesce((v_dre->>'rateio_compartilhado')::numeric,0),
    'rateio_admin', coalesce((v_dre->>'rateio_admin')::numeric,0),
    'saldo', coalesce((v_dre->>'resultado_caixa')::numeric,0),
    'investimento', coalesce((v_dre->>'investimento')::numeric,0),
    'investimento_tipos', coalesce(v_inv_tipos,'[]'::jsonb),
    'entrega', fn_painel_safra_entrega(p_cliente, p_safra_id, p_cultura), 'talhoes', coalesce(v_talhoes,'[]'::jsonb),
    'natureza', coalesce(v_natureza,'[]'::jsonb),
    'fora_do_custeio', v_fora
  );
  return v_res;
end $function$;

revoke all on function public.fn_dre_lavoura(uuid, uuid) from public;
grant execute on function public.fn_dre_lavoura(uuid, uuid) to authenticated;
revoke all on function public.fn_dre_agricola_por_safra(uuid, uuid) from public;
grant execute on function public.fn_dre_agricola_por_safra(uuid, uuid) to authenticated;
revoke all on function public.fn_painel_rateio_detalhe(uuid, uuid, text, text, text) from public;
grant execute on function public.fn_painel_rateio_detalhe(uuid, uuid, text, text, text) to authenticated;
revoke all on function public.fn_painel_safra(uuid, uuid, text) from public;
grant execute on function public.fn_painel_safra(uuid, uuid, text) to authenticated;
