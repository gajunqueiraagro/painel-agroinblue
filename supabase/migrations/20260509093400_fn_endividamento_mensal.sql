-- Migration: versionar fn_endividamento_mensal aplicada via Management API em 2026-05-09
-- Aplicada manualmente em proto (binbcdfbisgscrifztia) durante implementação do bloco
-- Endividamento Soberano do PC-100. Esta migration apenas registra a definição no repo.

CREATE OR REPLACE FUNCTION public.fn_endividamento_mensal(p_cliente_id uuid, p_ano integer)
 RETURNS TABLE(mes integer, divida_inicial_pec numeric, captacao_pec numeric, amortizacao_pec numeric, juros_pec numeric, divida_final_pec numeric, divida_inicial_agri numeric, captacao_agri numeric, amortizacao_agri numeric, juros_agri numeric, divida_final_agri numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH
    meses AS (SELECT generate_series(1, 12) AS mes),
    fin AS (
      SELECT id, tipo_financiamento, data_contrato, valor_total, valor_entrada, status
      FROM financiamentos
      WHERE cliente_id = p_cliente_id
        AND status <> 'cancelado'
    ),
    parc AS (
      SELECT p.financiamento_id, p.valor_principal, p.valor_juros,
             p.data_pagamento, p.status,
             f.tipo_financiamento, f.data_contrato
      FROM financiamento_parcelas p
      JOIN fin f ON f.id = p.financiamento_id
      WHERE p.cliente_id = p_cliente_id
    ),
    cortes AS (
      SELECT
        m.mes,
        (p_ano::text || '-' || lpad(m.mes::text, 2, '0') || '-01')::date AS dia1,
        (date_trunc('month', (p_ano::text || '-' || lpad(m.mes::text, 2, '0') || '-01')::date)
          + interval '1 month - 1 day')::date AS ultimo_dia,
        (date_trunc('month', (p_ano::text || '-' || lpad(m.mes::text, 2, '0') || '-01')::date)
          - interval '1 day')::date AS dia_anterior
      FROM meses m
    ),
    divida_inicial AS (
      SELECT c.mes, p.tipo_financiamento, SUM(p.valor_principal) AS v
      FROM cortes c
      JOIN parc p
        ON p.data_contrato <= c.dia_anterior
       AND (p.data_pagamento IS NULL OR p.data_pagamento > c.dia_anterior)
      GROUP BY 1, 2
    ),
    divida_final AS (
      SELECT c.mes, p.tipo_financiamento, SUM(p.valor_principal) AS v
      FROM cortes c
      JOIN parc p
        ON p.data_contrato <= c.ultimo_dia
       AND (p.data_pagamento IS NULL OR p.data_pagamento > c.ultimo_dia)
      GROUP BY 1, 2
    ),
    captacao AS (
      SELECT EXTRACT(MONTH FROM f.data_contrato)::int AS mes,
             f.tipo_financiamento,
             SUM(f.valor_total - COALESCE(f.valor_entrada, 0)) AS v
      FROM fin f
      WHERE EXTRACT(YEAR FROM f.data_contrato) = p_ano
      GROUP BY 1, 2
    ),
    amortizacao AS (
      SELECT EXTRACT(MONTH FROM p.data_pagamento)::int AS mes,
             p.tipo_financiamento,
             SUM(p.valor_principal) AS v
      FROM parc p
      WHERE p.status = 'pago'
        AND EXTRACT(YEAR FROM p.data_pagamento) = p_ano
      GROUP BY 1, 2
    ),
    juros AS (
      SELECT EXTRACT(MONTH FROM p.data_pagamento)::int AS mes,
             p.tipo_financiamento,
             SUM(p.valor_juros) AS v
      FROM parc p
      WHERE p.status = 'pago'
        AND EXTRACT(YEAR FROM p.data_pagamento) = p_ano
      GROUP BY 1, 2
    )
  SELECT
    m.mes,
    COALESCE(di_p.v, 0)::numeric AS divida_inicial_pec,
    COALESCE(c_p.v,  0)::numeric AS captacao_pec,
    COALESCE(a_p.v,  0)::numeric AS amortizacao_pec,
    COALESCE(j_p.v,  0)::numeric AS juros_pec,
    COALESCE(df_p.v, 0)::numeric AS divida_final_pec,
    COALESCE(di_a.v, 0)::numeric AS divida_inicial_agri,
    COALESCE(c_a.v,  0)::numeric AS captacao_agri,
    COALESCE(a_a.v,  0)::numeric AS amortizacao_agri,
    COALESCE(j_a.v,  0)::numeric AS juros_agri,
    COALESCE(df_a.v, 0)::numeric AS divida_final_agri
  FROM meses m
  LEFT JOIN divida_inicial di_p ON di_p.mes = m.mes AND di_p.tipo_financiamento = 'pecuaria'
  LEFT JOIN divida_inicial di_a ON di_a.mes = m.mes AND di_a.tipo_financiamento = 'agricultura'
  LEFT JOIN captacao       c_p  ON c_p.mes  = m.mes AND c_p.tipo_financiamento  = 'pecuaria'
  LEFT JOIN captacao       c_a  ON c_a.mes  = m.mes AND c_a.tipo_financiamento  = 'agricultura'
  LEFT JOIN amortizacao    a_p  ON a_p.mes  = m.mes AND a_p.tipo_financiamento  = 'pecuaria'
  LEFT JOIN amortizacao    a_a  ON a_a.mes  = m.mes AND a_a.tipo_financiamento  = 'agricultura'
  LEFT JOIN juros          j_p  ON j_p.mes  = m.mes AND j_p.tipo_financiamento  = 'pecuaria'
  LEFT JOIN juros          j_a  ON j_a.mes  = m.mes AND j_a.tipo_financiamento  = 'agricultura'
  LEFT JOIN divida_final   df_p ON df_p.mes = m.mes AND df_p.tipo_financiamento = 'pecuaria'
  LEFT JOIN divida_final   df_a ON df_a.mes = m.mes AND df_a.tipo_financiamento = 'agricultura'
  ORDER BY m.mes;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_endividamento_mensal(uuid, integer) TO authenticated, anon, service_role;
