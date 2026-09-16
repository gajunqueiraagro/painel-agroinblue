-- PR-AGRI-MANDIOCA-01 — a producao do DRE deixa de ser sempre em sacas.
--
-- ⚠ UMA TROCA, UMA OCORRENCIA: `sum(c.sacas_boas + c.grao_roca_sacas)` vira
--   `sum(coalesce(c.toneladas, c.sacas_boas + c.grao_roca_sacas))`. O `coalesce` e' a peca toda —
--   o amendoim nao tem `toneladas` e continua somando sacas, byte a byte como antes; a mandioca
--   tem, e passa a somar tonelada. Nenhuma cultura precisa ser nomeada em lugar nenhum.
-- ⚠ E' ISSO QUE FAZ `R$/un` E `t/ha` PASSAREM A EXISTIR para a mandioca: eles ja' dividiam por
--   `producao`; o que faltava era `producao` querer dizer a unidade certa.
-- ⚠ JA APLICADA NO PROTO (16/09, GO do Gabriel). Delta conferido nas duas pontas —
--   reconstrucao e `md5(prosrc)` do banco: 0adcf1a0c596839f9290959432bd165f (13.599 chars),
--   sobre a base e7d7ab74161428f7509b3f167b561034 (13.576) de 20261027120800.
-- ⚠ `fn_dre_lavoura` E' INVOKER (medido: `security definer` = false) e nao leva revoke/grant.

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
  WHERE l.cliente_id = p_cliente_id AND l.safra_id = p_safra_id AND coalesce(l.cancelado,false) = false
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
   WHERE l.cliente_id = p_cliente_id AND coalesce(l.cancelado,false) = false
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
