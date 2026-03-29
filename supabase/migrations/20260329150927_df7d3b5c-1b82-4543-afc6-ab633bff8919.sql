
-- =============================================
-- VIEWS FINANCEIRAS v2
-- =============================================

-- 1. FLUXO DE CAIXA MENSAL
CREATE OR REPLACE VIEW public.vw_financeiro_fluxo_caixa_mensal AS
SELECT
  l.cliente_id,
  l.fazenda_id,
  l.ano_mes,
  SUM(CASE WHEN l.tipo_operacao LIKE '1%' THEN ABS(l.valor) ELSE 0 END) AS total_entradas,
  SUM(CASE WHEN l.tipo_operacao LIKE '2%' THEN ABS(l.valor) ELSE 0 END) AS total_saidas,
  SUM(CASE WHEN l.tipo_operacao LIKE '1%' THEN ABS(l.valor) ELSE 0 END)
  - SUM(CASE WHEN l.tipo_operacao LIKE '2%' THEN ABS(l.valor) ELSE 0 END) AS saldo_mes
FROM public.financeiro_lancamentos_v2 l
WHERE lower(l.status_transacao) IN ('conciliado', 'confirmado')
  AND l.tipo_operacao NOT LIKE '3%'
GROUP BY l.cliente_id, l.fazenda_id, l.ano_mes;

-- 2. DASHBOARD FINANCEIRO MENSAL
CREATE OR REPLACE VIEW public.vw_financeiro_dashboard_mensal AS
SELECT
  l.cliente_id,
  l.fazenda_id,
  l.ano_mes,
  -- ENTRADAS
  SUM(CASE WHEN l.tipo_operacao LIKE '1%' AND lower(l.macro_custo) = 'receitas'
    AND (lower(l.centro_custo) LIKE '%pecuári%' OR lower(l.centro_custo) LIKE '%pecuaria%' OR lower(l.centro_custo) LIKE '%pec%')
    THEN ABS(l.valor) ELSE 0 END) AS receitas_pecuaria,

  SUM(CASE WHEN l.tipo_operacao LIKE '1%' AND lower(l.macro_custo) = 'receitas'
    AND (lower(l.centro_custo) LIKE '%agri%')
    THEN ABS(l.valor) ELSE 0 END) AS receitas_agricultura,

  SUM(CASE WHEN l.tipo_operacao LIKE '1%' AND lower(l.macro_custo) = 'receitas'
    AND NOT (lower(l.centro_custo) LIKE '%pecuári%' OR lower(l.centro_custo) LIKE '%pecuaria%' OR lower(l.centro_custo) LIKE '%pec%')
    AND NOT (lower(l.centro_custo) LIKE '%agri%')
    THEN ABS(l.valor) ELSE 0 END) AS outras_receitas,

  SUM(CASE WHEN l.tipo_operacao LIKE '1%'
    AND (lower(l.macro_custo) LIKE '%aporte%' OR lower(l.centro_custo) LIKE '%aporte%' OR lower(l.subcentro) LIKE '%aporte%')
    THEN ABS(l.valor) ELSE 0 END) AS aportes,

  SUM(CASE WHEN l.tipo_operacao LIKE '1%'
    AND lower(l.macro_custo) != 'receitas'
    AND NOT (lower(l.macro_custo) LIKE '%aporte%' OR lower(l.centro_custo) LIKE '%aporte%' OR lower(l.subcentro) LIKE '%aporte%')
    THEN ABS(l.valor) ELSE 0 END) AS captacao_financeira,

  -- SAÍDAS
  SUM(CASE WHEN l.tipo_operacao LIKE '2%'
    AND lower(l.macro_custo) IN ('custeio produtivo', 'investimento na fazenda')
    AND (lower(l.centro_custo) LIKE '%pecuári%' OR lower(l.centro_custo) LIKE '%pecuaria%' OR lower(l.centro_custo) LIKE '%pec%'
         OR NOT (lower(l.centro_custo) LIKE '%agri%'))
    AND NOT (lower(l.macro_custo) LIKE '%dedu%' AND lower(l.macro_custo) LIKE '%receita%')
    AND NOT (lower(l.centro_custo) LIKE '%dedução%' OR lower(l.centro_custo) LIKE '%deducao%')
    THEN ABS(l.valor) ELSE 0 END) AS desembolso_produtivo_pec,

  SUM(CASE WHEN l.tipo_operacao LIKE '2%'
    AND lower(l.macro_custo) IN ('custeio produtivo', 'investimento na fazenda')
    AND lower(l.centro_custo) LIKE '%agri%'
    THEN ABS(l.valor) ELSE 0 END) AS desembolso_produtivo_agri,

  SUM(CASE WHEN l.tipo_operacao LIKE '2%'
    AND (lower(l.macro_custo) = 'investimento em bovinos' OR lower(l.centro_custo) LIKE '%reposição%' OR lower(l.centro_custo) LIKE '%reposicao%')
    THEN ABS(l.valor) ELSE 0 END) AS reposicao_bovinos,

  SUM(CASE WHEN l.tipo_operacao LIKE '2%'
    AND (lower(l.macro_custo) LIKE '%dedu%' AND lower(l.macro_custo) LIKE '%receita%'
      OR lower(l.centro_custo) LIKE '%dedução%' OR lower(l.centro_custo) LIKE '%deducao%')
    THEN ABS(l.valor) ELSE 0 END) AS deducao_receitas,

  SUM(CASE WHEN l.tipo_operacao LIKE '2%'
    AND lower(l.macro_custo) LIKE '%amortiza%'
    THEN ABS(l.valor) ELSE 0 END) AS amortizacoes,

  SUM(CASE WHEN l.tipo_operacao LIKE '2%'
    AND (lower(l.macro_custo) = 'dividendos' OR lower(l.centro_custo) = 'dividendos' OR lower(l.subcentro) LIKE '%dividendo%')
    THEN ABS(l.valor) ELSE 0 END) AS dividendos

FROM public.financeiro_lancamentos_v2 l
WHERE lower(l.status_transacao) IN ('conciliado', 'confirmado')
  AND l.tipo_operacao NOT LIKE '3%'
GROUP BY l.cliente_id, l.fazenda_id, l.ano_mes;

-- 3. AUDITORIA COMPETÊNCIA vs CAIXA
CREATE OR REPLACE VIEW public.vw_financeiro_auditoria_competencia_caixa AS
SELECT
  l.cliente_id,
  l.fazenda_id,
  to_char(l.data_competencia, 'YYYY-MM') AS mes_competencia,
  CASE WHEN l.data_pagamento IS NOT NULL THEN to_char(l.data_pagamento, 'YYYY-MM') ELSE NULL END AS mes_caixa,
  l.tipo_operacao,
  l.macro_custo,
  l.centro_custo,
  l.subcentro,
  COUNT(*) AS qtd_lancamentos,
  SUM(ABS(l.valor)) AS valor_total,
  SUM(CASE WHEN to_char(l.data_competencia, 'YYYY-MM') != COALESCE(to_char(l.data_pagamento, 'YYYY-MM'), '') THEN 1 ELSE 0 END) AS qtd_divergente
FROM public.financeiro_lancamentos_v2 l
WHERE lower(l.status_transacao) IN ('conciliado', 'confirmado')
  AND l.tipo_operacao NOT LIKE '3%'
GROUP BY l.cliente_id, l.fazenda_id,
  to_char(l.data_competencia, 'YYYY-MM'),
  CASE WHEN l.data_pagamento IS NOT NULL THEN to_char(l.data_pagamento, 'YYYY-MM') ELSE NULL END,
  l.tipo_operacao, l.macro_custo, l.centro_custo, l.subcentro;

-- 4. DESEMBOLSO POR CENTRO DE CUSTO
CREATE OR REPLACE VIEW public.vw_financeiro_desembolso_centro AS
SELECT
  l.cliente_id,
  l.fazenda_id,
  l.ano_mes,
  l.macro_custo,
  l.centro_custo,
  l.subcentro,
  SUM(ABS(l.valor)) AS valor_total,
  COUNT(*) AS qtd_lancamentos,
  ROUND(
    SUM(ABS(l.valor)) * 100.0 / NULLIF(
      SUM(SUM(ABS(l.valor))) OVER (PARTITION BY l.cliente_id, l.fazenda_id, l.ano_mes), 0
    ), 2
  ) AS percentual
FROM public.financeiro_lancamentos_v2 l
WHERE l.tipo_operacao LIKE '2%'
  AND lower(l.status_transacao) IN ('conciliado', 'confirmado')
GROUP BY l.cliente_id, l.fazenda_id, l.ano_mes, l.macro_custo, l.centro_custo, l.subcentro;
