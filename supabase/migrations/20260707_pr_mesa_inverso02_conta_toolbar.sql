-- ============================================================================
-- PR-MESA-INVERSO-02 — Card "Sistema não explicado" respeita a conta da toolbar.
--
-- "A tela não pode prometer um escopo e entregar outro." [Princípio 9]
-- Defeito: a fn 1 deriva as contas da SESSÃO INTEIRA (union de todas as contas do
-- staging); o filtro de conta da toolbar nunca chegava ao card → com "Banco do Brasil"
-- selecionado, o card listava itens de Itaú/Cartão. Este PR passa a conta selecionada
-- à fn (p_conta_id) mantendo o comportamento atual quando NULL. READ-ONLY absoluto.
--
-- Base: HEAD 8b50b032. CREATE OR REPLACE da fn 1 (corpo INVERSO-01 verbatim + p_conta_id).
-- fn_classificacao_composicao_sugerida: NÃO tocada (já filtra pela conta do lançamento).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_classificacao_sistema_nao_explicado(p_sessao_id uuid, p_conta_id uuid DEFAULT NULL)
 RETURNS TABLE(lanc_id uuid, data_pagamento date, valor numeric, tipo_operacao text, descricao text, favorecido_nome text, conta_nome text, documento text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_cliente uuid; v_user uuid;
BEGIN
  SELECT cliente_id INTO v_cliente FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id LIMIT 1;
  IF v_cliente IS NULL THEN RETURN; END IF;
  BEGIN v_user := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user) OR v_cliente IN (SELECT public.get_user_cliente_ids(v_user))) THEN RETURN; END IF;

  -- Coerência: conta informada precisa pertencer às contas da sessão; senão, escopo vazio
  -- (não inventar escopo). p_conta_id NULL = comportamento atual (todas as contas da sessão).
  IF p_conta_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM financeiro_classificacao_staging
    WHERE sessao_id = p_sessao_id AND (conta_origem_id = p_conta_id OR conta_destino_id = p_conta_id)
  ) THEN RETURN; END IF;

  RETURN QUERY
  WITH sess_meses AS (
    SELECT DISTINCT COALESCE(excel_ano_mes, to_char(excel_data, 'YYYY-MM')) AS ano_mes
    FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id
  ),
  sess_contas AS (
    SELECT conta_origem_id AS conta_id FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id AND conta_origem_id IS NOT NULL
    UNION
    SELECT conta_destino_id FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id AND conta_destino_id IS NOT NULL
  ),
  referenciados AS (
    SELECT match_lancamento_id AS id FROM financeiro_classificacao_staging
      WHERE sessao_id = p_sessao_id AND match_lancamento_id IS NOT NULL
    UNION
    SELECT unnest(match_lancamento_ids) FROM financeiro_classificacao_staging
      WHERE sessao_id = p_sessao_id AND match_lancamento_ids IS NOT NULL
  )
  SELECT l.id, l.data_pagamento, l.valor, l.tipo_operacao, l.descricao,
         fo.nome, COALESCE(cb.nome_exibicao, cd.nome_exibicao), l.numero_documento
  FROM financeiro_lancamentos_v2 l
  LEFT JOIN financeiro_fornecedores     fo ON fo.id = l.favorecido_id
  LEFT JOIN financeiro_contas_bancarias cb ON cb.id = l.conta_bancaria_id
  LEFT JOIN financeiro_contas_bancarias cd ON cd.id = l.conta_destino_id
  WHERE l.cliente_id = v_cliente
    AND l.cancelado = false
    AND l.status_transacao = 'realizado'
    AND l.ano_mes IN (SELECT ano_mes FROM sess_meses)
    -- p_conta_id informado → filtra pela conta EXATA (mesma da toolbar); NULL → todas da sessão.
    AND (
      CASE WHEN p_conta_id IS NOT NULL
        THEN (l.conta_bancaria_id = p_conta_id OR l.conta_destino_id = p_conta_id)
        ELSE (l.conta_bancaria_id IN (SELECT conta_id FROM sess_contas)
              OR l.conta_destino_id IN (SELECT conta_id FROM sess_contas))
      END
    )
    AND NOT EXISTS (SELECT 1 FROM referenciados r WHERE r.id = l.id)
  ORDER BY l.data_pagamento, l.id;
END;
$function$;
