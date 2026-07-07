-- ============================================================================
-- PR-GRUPO-ORDER-01 — fn de grupo prioriza VALOR IGUAL na ordenação.
--
-- "Valor idêntico ao Excel vale mais que vizinhança de 1 dia." [Princípio 9]
-- Causa raiz: fn_classificacao_candidatos_grupo ordenava por distância de data + id
-- com LIMIT 10 → 10 lançamentos quaisquer a 1 dia expulsavam o valor-exato a 2 dias.
--
-- CREATE OR REPLACE — MESMA assinatura (p_staging_id uuid) → substitui in-place, sem
-- overload (não é mudança de assinatura; contraste com o caso INVERSO-02). Corpo
-- VERBATIM do PR-MESA-GRUPO-01, exceto ORDER BY (nova prioridade) e LIMIT (10→20).
-- Nenhuma outra regra muda: janela ±10 ∩ ano_mes, conta por ramo, tipo, realizado,
-- cancelado=false, valor <= excel+0,005. Não toca candidatos_proximos/resolvers/guards.
--
-- Nota de valor: financeiro_lancamentos_v2.valor é MAGNITUDE (positivo; `sinal` carrega
-- a direção — vide buildInsertRow e o WHERE `ABS(l.valor) <= excel_valor`). Logo
-- ABS(l.valor - excel_valor) é a diferença de valor correta (sem armadilha de sinal).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_classificacao_candidatos_grupo(p_staging_id uuid)
 RETURNS TABLE(lanc_id uuid, descricao text, observacao text, data_pagamento date, valor numeric, tipo_operacao text, subcentro_atual text, macro_atual text, grupo_atual text, favorecido_id uuid, favorecido_nome text, conta_bancaria_nome text, conta_destino_nome text, documento text, distancia_dias int)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_s RECORD; v_conta_origem_id uuid; v_conta_destino_id uuid; v_ano_mes text;
BEGIN
  SELECT * INTO v_s FROM public.financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_conta_origem_id  := COALESCE(v_s.conta_origem_id, public.fn_classificacao_resolver_conta(v_s.cliente_id, v_s.excel_conta_origem));
  v_conta_destino_id := COALESCE(v_s.conta_destino_id, public.fn_classificacao_resolver_conta(v_s.cliente_id, v_s.excel_conta_destino));
  v_ano_mes := COALESCE(v_s.excel_ano_mes, to_char(v_s.excel_data, 'YYYY-MM'));

  RETURN QUERY
  SELECT
    l.id, l.descricao, l.observacao, l.data_pagamento, l.valor,
    l.tipo_operacao, l.subcentro, l.macro_custo, l.grupo_custo,
    l.favorecido_id, fo.nome, cb.nome_exibicao, cd.nome_exibicao,
    l.numero_documento, ABS(l.data_pagamento - v_s.excel_data)::int
  FROM public.financeiro_lancamentos_v2 l
  LEFT JOIN public.financeiro_fornecedores     fo ON fo.id = l.favorecido_id
  LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id = l.conta_bancaria_id
  LEFT JOIN public.financeiro_contas_bancarias cd ON cd.id = l.conta_destino_id
  WHERE l.cliente_id = v_s.cliente_id
    AND l.cancelado = false
    AND l.status_transacao = 'realizado'
    AND l.ano_mes = v_ano_mes
    AND l.data_pagamento BETWEEN v_s.excel_data - 10 AND v_s.excel_data + 10
    AND ABS(l.valor) <= v_s.excel_valor + 0.005
    AND l.tipo_operacao = v_s.excel_tipo_operacao
    AND (
      (l.tipo_operacao = '1-Entradas' AND (CASE WHEN v_conta_destino_id IS NOT NULL THEN l.conta_destino_id = v_conta_destino_id
                                                ELSE (l.conta_destino_id = v_conta_origem_id OR l.conta_bancaria_id = v_conta_origem_id) END)) OR
      (l.tipo_operacao = '2-Saídas'          AND l.conta_bancaria_id = v_conta_origem_id) OR
      (l.tipo_operacao = '3-Transferências'  AND l.conta_bancaria_id = v_conta_origem_id AND l.conta_destino_id = v_conta_destino_id)
    )
  -- PR-GRUPO-ORDER-01: valor igual ao Excel PRIMEIRO; depois menor diferença de valor;
  -- depois menor distância de data; id no desempate determinístico.
  ORDER BY (ABS(l.valor - v_s.excel_valor) <= 0.005) DESC,
           ABS(l.valor - v_s.excel_valor) ASC,
           ABS(l.data_pagamento - v_s.excel_data),
           l.id
  LIMIT 20;
END;
$function$;
