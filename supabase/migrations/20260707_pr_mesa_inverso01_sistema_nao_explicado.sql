-- ============================================================================
-- PR-MESA-INVERSO-01 — "Sistema não explicado pelo Excel" (visão inversa, READ-ONLY).
--
-- "A Mesa deixa de procurar pares e passa a explicar diferenças." [Princípio 9]
-- Conceito NOVO: lançamento não explicado = lançamento vivo do mês/conta da sessão
-- que NENHUMA linha do staging da sessão referencia (nem match singular, nem grupo).
-- Fecha a simetria Excel→Sistema com Sistema→Excel.
--
-- READ-ONLY ABSOLUTO: só CREATE FUNCTION. Zero ALTER/UPDATE/INSERT/DELETE em dados.
-- Nenhuma escrita, nenhuma automação. Ambas SECURITY DEFINER com guard de cliente
-- (RETURN vazio sem permissão). Migration NÃO aplicada (dry-run + homologação antes).
--
-- Base: pacote Mesa (HEAD 41a98414).
-- ============================================================================

-- ── 1) sistema_nao_explicado: lançamentos vivos do mês/conta da sessão que ────
-- NENHUMA linha do staging referencia (match_lancamento_id = l.id OU l.id ∈ array).
--
-- DERIVAÇÃO mês/conta da sessão (declarada):
--   • meses  = DISTINCT COALESCE(excel_ano_mes, to_char(excel_data,'YYYY-MM')) das linhas da sessão;
--   • contas = UNIÃO de conta_origem_id e conta_destino_id (não-nulos) das linhas da sessão;
--   cobre múltiplas contas/meses automaticamente. Lançamento entra se ano_mes ∈ meses
--   E (conta_bancaria_id ∈ contas OU conta_destino_id ∈ contas).
CREATE OR REPLACE FUNCTION public.fn_classificacao_sistema_nao_explicado(p_sessao_id uuid)
 RETURNS TABLE(lanc_id uuid, data_pagamento date, valor numeric, tipo_operacao text, descricao text, favorecido_nome text, conta_nome text, documento text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_cliente uuid; v_user uuid;
BEGIN
  SELECT cliente_id INTO v_cliente FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id LIMIT 1;
  IF v_cliente IS NULL THEN RETURN; END IF;
  BEGIN v_user := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user) OR v_cliente IN (SELECT public.get_user_cliente_ids(v_user))) THEN RETURN; END IF;

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
    AND (l.conta_bancaria_id IN (SELECT conta_id FROM sess_contas)
         OR l.conta_destino_id IN (SELECT conta_id FROM sess_contas))
    AND NOT EXISTS (SELECT 1 FROM referenciados r WHERE r.id = l.id)
  ORDER BY l.data_pagamento, l.id;
END;
$function$;

-- ── 2) composicao_sugerida: SUGESTÃO read-only (subset-sum limitado) ─────────
-- Combinações de 2 a 4 linhas do staging da sessão SEM match (sem_match,
-- sem_conta_para_match ou candidatos_proximos; match singular NULL e array NULL)
-- cuja SOMA de excel_valor = ABS(valor do lançamento) ± 0,005, mesma janela ±10,
-- mesmo tipo, mesma conta.
--
-- EXPRESSÃO DE CONTA (declarada): a conta resolvida da linha
--   (conta_origem_id OU conta_destino_id) ∈ contas do lançamento
--   [array_remove(ARRAY[conta_bancaria_id, conta_destino_id], NULL)];
--   linhas SEM conta resolvida (ambas NULL) entram (o escopo já é a sessão/lançamento).
--
-- CUSTO/LIMITES (declarados): candidatos podados por excel_valor <= alvo+0,005,
-- janela ±10, tipo e conta; CAP de 40 candidatos (ORDER BY proximidade de data, valor);
-- self-joins ordenados (C(n,k), não n^k) para pares/trios/quádruplas; LIMIT 5 composições.
-- Se nenhuma composição: retorno vazio (a UI diz "sem composição" — nunca inventa).
CREATE OR REPLACE FUNCTION public.fn_classificacao_composicao_sugerida(p_lancamento_id uuid, p_sessao_id uuid)
 RETURNS TABLE(composicao_n int, staging_ids uuid[], linhas int[], soma numeric, diferenca numeric)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_cliente uuid; v_user uuid; v_lanc financeiro_lancamentos_v2%ROWTYPE;
  v_alvo numeric; v_conta_lanc uuid[];
BEGIN
  SELECT cliente_id INTO v_cliente FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id LIMIT 1;
  IF v_cliente IS NULL THEN RETURN; END IF;
  BEGIN v_user := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user) OR v_cliente IN (SELECT public.get_user_cliente_ids(v_user))) THEN RETURN; END IF;

  SELECT * INTO v_lanc FROM financeiro_lancamentos_v2 WHERE id = p_lancamento_id AND cliente_id = v_cliente;
  IF NOT FOUND OR v_lanc.cancelado = true THEN RETURN; END IF;
  v_alvo := ABS(v_lanc.valor);
  v_conta_lanc := array_remove(ARRAY[v_lanc.conta_bancaria_id, v_lanc.conta_destino_id], NULL);

  RETURN QUERY
  WITH cand AS (
    SELECT s.staging_id, s.excel_linha_origem AS linha, s.excel_valor AS valor
    FROM financeiro_classificacao_staging s
    WHERE s.sessao_id = p_sessao_id
      AND s.match_status IN ('sem_match','sem_conta_para_match','candidatos_proximos')
      AND s.match_lancamento_id IS NULL
      AND s.match_lancamento_ids IS NULL
      AND s.excel_valor IS NOT NULL
      AND s.excel_valor <= v_alvo + 0.005
      AND s.excel_data BETWEEN v_lanc.data_pagamento - 10 AND v_lanc.data_pagamento + 10
      AND s.excel_tipo_operacao = v_lanc.tipo_operacao
      AND (
        (s.conta_origem_id = ANY(v_conta_lanc) OR s.conta_destino_id = ANY(v_conta_lanc))
        OR (s.conta_origem_id IS NULL AND s.conta_destino_id IS NULL)
      )
    ORDER BY ABS(s.excel_data - v_lanc.data_pagamento), s.excel_valor
    LIMIT 40
  ),
  combos AS (
    SELECT ARRAY[a.staging_id, b.staging_id] AS sids, ARRAY[a.linha, b.linha] AS linhas, (a.valor + b.valor) AS soma, 2 AS n
    FROM cand a JOIN cand b ON a.staging_id < b.staging_id
    WHERE ABS(a.valor + b.valor - v_alvo) <= 0.005
    UNION ALL
    SELECT ARRAY[a.staging_id, b.staging_id, c.staging_id], ARRAY[a.linha, b.linha, c.linha], (a.valor + b.valor + c.valor), 3
    FROM cand a JOIN cand b ON a.staging_id < b.staging_id JOIN cand c ON b.staging_id < c.staging_id
    WHERE ABS(a.valor + b.valor + c.valor - v_alvo) <= 0.005
    UNION ALL
    SELECT ARRAY[a.staging_id, b.staging_id, c.staging_id, d.staging_id], ARRAY[a.linha, b.linha, c.linha, d.linha], (a.valor + b.valor + c.valor + d.valor), 4
    FROM cand a JOIN cand b ON a.staging_id < b.staging_id JOIN cand c ON b.staging_id < c.staging_id JOIN cand d ON c.staging_id < d.staging_id
    WHERE ABS(a.valor + b.valor + c.valor + d.valor - v_alvo) <= 0.005
  )
  SELECT (row_number() OVER (ORDER BY n, ABS(soma - v_alvo)))::int,
         sids, linhas, soma, (soma - v_alvo)
  FROM combos
  ORDER BY n, ABS(soma - v_alvo)
  LIMIT 5;
END;
$function$;
