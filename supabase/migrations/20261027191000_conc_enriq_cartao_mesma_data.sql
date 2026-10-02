-- PR-CONC-ENRIQ-CARTAO-MESMA-DATA — o par herdado do cartao passa a exigir a MESMA data de pagamento, como toda conta.
--
-- POR QUE
-- O PR-CONC-ENRIQ-CASADOR-MES (af79307d) deu ao cartao a excecao D2 no validador do par herdado: "conta de cartao dispensa a
-- data (a do lancamento e' a da compra; a da planilha, a da fatura)". A premissa era FALSA e foi decidida sem medir. Medido
-- em 02/10 por conta de cartao (lancamentos nao cancelados com data de pagamento; % no dia mais frequente do mes):
--   Agnaldo Cartao Elo 2.031 lanc. 99,8% · Mastercard Bradesco 76 lanc. 100% · NJ Ourocard 286 lanc. 99,7% ·
--   NJ Visa Infinite 80 lanc. 100% · NJ Cartao Sicredi Lavoura 158 lanc. 100% · Santa Rita Cartao Sicredi 11 lanc. 100% ·
--   Santa Rita Cartao Bradesco 44 lanc. 93,2% · Santa Rita Itau Black 2.443 lanc. 78,1% (2021 43,6%, 2022 56,3%, 2023 89,6%,
--   2024 90,2%, 2026 95,7% — datado na fatura desde 2025) · Santa Rita Nubank 100 lanc. 70,0%.
-- O lancamento de cartao e' datado na FATURA, a mesma data que a planilha traz. Com a excecao, a parcela da fatura de
-- setembro herdava a de agosto (mesma competencia, valor e fornecedor): NJ Imp 04 (dfd0f02c), Cartao BB Ourocard, linhas
-- 274/275/278/286/294/305 pagas em 16/09 presas em lancamentos de 17/08, com o lancamento de 16/09 livre ao lado.
--
-- O QUE MUDA (decisao do Gabriel, opcao 1, 02/10)
-- D1  Sai a excecao do cartao: com data de pagamento na linha, exige `l.data_pagamento` = a data da linha em QUALQUER conta;
--     sem data, a janela do mes (como hoje). A mesma regra para todas as contas — nenhuma marca por conta, nenhuma regra nova.
-- D2  O casamento normal (PASSO 1 em diante do casar_sessao) nao muda. Os dois consumidores (populate e casar_sessao) nao mudam.
-- D3  Linha aplicada nunca e' reaberta (regra vigente).
-- ⚠ Divida registrada: cartao historicamente datado pela COMPRA (Santa Rita 2021–2024, parte do Nubank) nao casa por data
--   exata quando a planilha traz a data da fatura; se virar caso real, pede regra propria com decisao do Gabriel.
--
-- METODO: patch guardado por md5 (origem, ancora contada — e o CONCEITO 'cartao' contado —, destino). Assinatura, defaults,
-- LANGUAGE sql, STABLE, search_path e ACL ficam como estao (CREATE OR REPLACE pelo proprio pg_get_functiondef).
-- Nenhum UPDATE em dado de cliente: o conserto das sessoes e' o Recasar, na tela.
--   _fn_classificacao_par_herdado_valido  cd12b3e28ca72a93f013d503211b37ed -> 0224916d34eb19f8ad3cb9fcff6b69a7

DO $mig$
DECLARE
  v_oid oid; v_antes text; v_novo text;
  a text; b text;
BEGIN
  v_oid := 'public._fn_classificacao_par_herdado_valido(uuid,uuid,date,date,date)'::regprocedure;
  SELECT prosrc INTO v_antes FROM pg_proc WHERE oid = v_oid;
  IF md5(v_antes) <> 'cd12b3e28ca72a93f013d503211b37ed' THEN
    RAISE EXCEPTION '_fn_classificacao_par_herdado_valido nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  END IF;
  -- o CONCEITO: 'cartao' aparece 2x (o comentario e o literal), as duas dentro da ancora
  IF (length(v_antes) - length(replace(v_antes, 'cartao', ''))) / length('cartao') <> 2 THEN
    RAISE EXCEPTION '_fn_classificacao_par_herdado_valido: o conceito cartao nao aparece exatamente 2x';
  END IF;
  a := $t$       AND (
         -- D2: conta de cartao dispensa a data (a do lancamento e' a da compra; a da planilha, a da fatura)
         EXISTS (SELECT 1 FROM public.financeiro_contas_bancarias cb WHERE cb.id = p_conta_linha AND cb.tipo_conta = 'cartao')
         -- (b) a data exata; sem data, a janela de mes (so' quem a passa: o casar, com o mes da sessao)
         OR COALESCE(CASE WHEN p_data_pagamento IS NOT NULL THEN l.data_pagamento = p_data_pagamento
                          ELSE l.data_pagamento BETWEEN p_mes_de AND p_mes_ate END, false)
       )
$t$;
  b := $t$       -- (b) a data exata, em QUALQUER conta — o cartao inclusive: o lancamento de cartao e' datado na fatura, a mesma data
       --     que a planilha traz (PR-CONC-ENRIQ-CARTAO-MESMA-DATA revogou a excecao do cartao); sem data, a janela de mes (so'
       --     quem a passa: o casar, com o mes da sessao)
       AND COALESCE(CASE WHEN p_data_pagamento IS NOT NULL THEN l.data_pagamento = p_data_pagamento
                         ELSE l.data_pagamento BETWEEN p_mes_de AND p_mes_ate END, false)
$t$;
  IF (length(v_antes) - length(replace(v_antes, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION '_fn_classificacao_par_herdado_valido: a ancora da excecao do cartao nao casa exatamente 1x';
  END IF;
  v_novo := replace(v_antes, a, b);
  IF position('tipo_conta' IN v_novo) > 0 THEN
    RAISE EXCEPTION '_fn_classificacao_par_herdado_valido: a excecao do cartao sobrou no corpo';
  END IF;
  EXECUTE replace(pg_get_functiondef(v_oid), v_antes, v_novo);
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid)) <> '0224916d34eb19f8ad3cb9fcff6b69a7' THEN
    RAISE EXCEPTION '_fn_classificacao_par_herdado_valido: corpo resultante inesperado (md5 %).',
      md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid));
  END IF;
END $mig$;
