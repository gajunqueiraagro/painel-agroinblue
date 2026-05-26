-- ====================================================================
-- PR-M4 (26/05/2026) — fn_classificacao_candidatos_ambiguo
-- ====================================================================
-- Lista candidatos de match para uma staging row marcada 'ambiguo'.
--
-- Reproduz EXATAMENTE o critério da fn_classificacao_populate_staging:
--   cliente + cancelado=false + ano_mes + data_pagamento + valor±0.005
--   + tipo_operacao + conta resolvida (origem/destino conforme tipo).
--
-- LIMIT 10 para evitar drawer com 100 itens em caso de explosão.
-- SECURITY DEFINER (mesma estratégia das outras RPCs PR-M).
-- ====================================================================

CREATE OR REPLACE FUNCTION public.fn_classificacao_candidatos_ambiguo(
  p_staging_id uuid
)
RETURNS TABLE (
  lanc_id uuid,
  descricao text,
  observacao text,
  data_pagamento date,
  valor numeric,
  tipo_operacao text,
  subcentro_atual text,
  macro_atual text,
  grupo_atual text,
  favorecido_id uuid,
  favorecido_nome text,
  conta_bancaria_nome text,
  conta_destino_nome text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_s RECORD;
  v_conta_origem_id uuid;
  v_conta_destino_id uuid;
  v_ano_mes text;
BEGIN
  SELECT * INTO v_s FROM public.financeiro_classificacao_staging
   WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_conta_origem_id  := public.fn_classificacao_resolver_conta(v_s.cliente_id, v_s.excel_conta_origem);
  v_conta_destino_id := public.fn_classificacao_resolver_conta(v_s.cliente_id, v_s.excel_conta_destino);
  v_ano_mes := COALESCE(v_s.excel_ano_mes, to_char(v_s.excel_data, 'YYYY-MM'));

  RETURN QUERY
  SELECT
    l.id, l.descricao, l.observacao, l.data_pagamento, l.valor,
    l.tipo_operacao, l.subcentro, l.macro_custo, l.grupo_custo,
    l.favorecido_id, fo.nome, cb.nome_exibicao, cd.nome_exibicao
  FROM public.financeiro_lancamentos_v2 l
  LEFT JOIN public.financeiro_fornecedores     fo ON fo.id = l.favorecido_id
  LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id = l.conta_bancaria_id
  LEFT JOIN public.financeiro_contas_bancarias cd ON cd.id = l.conta_destino_id
  WHERE l.cliente_id = v_s.cliente_id
    AND l.cancelado = false
    AND l.ano_mes = v_ano_mes
    AND l.data_pagamento = v_s.excel_data
    AND ABS(l.valor) BETWEEN v_s.excel_valor - 0.005 AND v_s.excel_valor + 0.005
    AND l.tipo_operacao = v_s.excel_tipo_operacao
    AND (
      (l.tipo_operacao = '1-Entradas'        AND l.conta_destino_id  = v_conta_destino_id) OR
      (l.tipo_operacao = '2-Saídas'          AND l.conta_bancaria_id = v_conta_origem_id) OR
      (l.tipo_operacao = '3-Transferências'  AND l.conta_bancaria_id = v_conta_origem_id
                                              AND l.conta_destino_id = v_conta_destino_id)
    )
  ORDER BY l.data_pagamento, l.id
  LIMIT 10;
END;
$func$;

COMMENT ON FUNCTION public.fn_classificacao_candidatos_ambiguo(uuid) IS
'PR-M4: lista candidatos de match para staging row ambígua. Reproduz critério da fn_classificacao_populate_staging.';
