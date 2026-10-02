-- PR-CONC-ENRIQ-CASADOR-MES — a memoria de aplicacao anterior so' herda o par que vale para a linha; o Recasar reabre o que
-- nao vale. Banco so'; nenhuma tela muda.
--
-- POR QUE
-- O PASSO 0 do `fn_classificacao_populate_staging` ("memoria de aplicacao anterior") herdava o `match_lancamento_id` de QUALQUER
-- linha aplicada do cliente pela chave valor + competencia + tipo + fornecedor — sem olhar conta, data de pagamento nem se o
-- lancamento ja' estava com outra linha da sessao — e marcava 'ja_aplicado'. O `fn_classificacao_casar_sessao` preserva
-- 'ja_aplicado', entao o Recasar nunca consertava. Parcela (mesma NF, mesma competencia, mesmo valor) paga em agosto e em
-- setembro: a linha de setembro herdava o lancamento de agosto. Medido em 02/10: NJ 130 linhas em 13 sessoes, Agnaldo 21,
-- Santa Rita 2 (FASE 0).
--
-- O QUE MUDA (decisoes D0-D4 do Gabriel)
-- 1. `_fn_conta_do_lancamento` — a regua de direcao ganha DONO: '1-Entradas' -> conta_destino_id, senao conta_bancaria_id,
--    o mesmo CASE que estava copiado. SQL IMMUTABLE e sem SET (o planner a embute no WHERE). Substitui as QUATRO copias do
--    casar_sessao (PASSO 1, PASSO 3a `a` e `b`, PASSO 3b). Fora deste PR, na fila: as 5 copias de fn_extrato_conciliar_mes,
--    fn_transferencia_aplicar e fn_transferencias_espelhadas, e a regua propria do populate no casamento por atributos.
-- 2. `_fn_classificacao_par_herdado_valido(lancamento, conta da linha, data, mes_de, mes_ate)` — o UNICO dono de (a)/(b)/D2:
--    (a) o lancamento esta' na MESMA conta da linha (pela regua do item 1); (b) data_pagamento IGUAL a' data passada — sem
--    data, a janela de mes (so' o casar a passa); D2: conta da linha com tipo_conta = 'cartao' dispensa (b).
-- 3. populate: o loop vai em ORDEM DE LINHA (posicao original como desempate) e a heranca so' fica se o validador aceitar e
--    o lancamento nao estiver com outra linha da sessao (match_lancamento_id ou match_lancamento_ids) — a de menor linha ja'
--    o tem. Sem data de pagamento na planilha, a data comparada e' a `data` (a mesma do casamento por atributos). Falhou:
--    segue o casamento normal, sem mudanca.
-- 4. casar: antes de tudo, REABRE a linha 'ja_aplicado' NAO aplicada cujo par nao vale (validador com a data de pagamento
--    da planilha, ou o mes da sessao quando nao ha data) ou perde a disputa: lancamento preso em grupo/bloco de linha
--    preservada e' usado; entre as preservadas que passam, fica a aplicada, senao a de menor linha. A reaberta e' recasada
--    pela regra normal. Linha aplicada NUNCA e' reaberta; as outras preservadas (resolvido_manual, resolvido_grupo,
--    ambiguo_resolvido, conferido_bloco) disputam mas nao sao julgadas nem reabertas. O retorno ganha 'reabertas'.
--
-- METODO: patch guardado por md5 nas duas RPCs (origem, ancoras contadas, destino). O CREATE OR REPLACE e' o
-- `pg_get_functiondef` com o corpo trocado — atributos (SECURITY DEFINER, search_path) e ACL ficam como estao.
--   casar_sessao      ANTES a6a6832f1be59a35d296d6b0b4273117 (11.613)   DEPOIS c5d725afa76d91242d2c2410984cf38c (14.179)
--   populate_staging  ANTES 5fdbd8171c19ae3fb26ba0d703aa0e1a (14.106)   DEPOIS 694ddc8baadae71b1d59de92a65c35b3 (15.430)
--
-- GRANTS: as duas internas sem EXECUTE para PUBLIC/anon/authenticated (so' service_role). Quem as chama sao as duas RPCs,
-- SECURITY DEFINER; nenhum caminho security_invoker as usa.
--
-- NENHUM UPDATE EM DADO: o conserto das sessoes e' pelo Recasar e pelo Reverter, na tela.

-- ═══ 1. o dono da regua de direcao ═══════════════════════════════════════════════════════════════════════════════════
CREATE FUNCTION public._fn_conta_do_lancamento(p_tipo_operacao text, p_conta_bancaria_id uuid, p_conta_destino_id uuid)
RETURNS uuid
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $fn$
  SELECT CASE WHEN p_tipo_operacao = '1-Entradas' THEN p_conta_destino_id ELSE p_conta_bancaria_id END
$fn$;
COMMENT ON FUNCTION public._fn_conta_do_lancamento(text, uuid, uuid) IS
  'PR-CONC-ENRIQ-CASADOR-MES: a conta efetiva do lancamento (entrada = destino; o resto = conta bancaria). Dono da regua de direcao do casar.';
REVOKE ALL ON FUNCTION public._fn_conta_do_lancamento(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_conta_do_lancamento(text, uuid, uuid) TO service_role;

-- ═══ 2. o validador do par herdado ════════════════════════════════════════════════════════════════════════════════════
CREATE FUNCTION public._fn_classificacao_par_herdado_valido(
  p_lancamento_id uuid, p_conta_linha uuid, p_data_pagamento date, p_mes_de date DEFAULT NULL, p_mes_ate date DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.financeiro_lancamentos_v2 l
     WHERE l.id = p_lancamento_id
       -- (a) mesma conta da linha
       AND public._fn_conta_do_lancamento(l.tipo_operacao, l.conta_bancaria_id, l.conta_destino_id) = p_conta_linha
       AND (
         -- D2: conta de cartao dispensa a data (a do lancamento e' a da compra; a da planilha, a da fatura)
         EXISTS (SELECT 1 FROM public.financeiro_contas_bancarias cb WHERE cb.id = p_conta_linha AND cb.tipo_conta = 'cartao')
         -- (b) a data exata; sem data, a janela de mes (so' quem a passa: o casar, com o mes da sessao)
         OR COALESCE(CASE WHEN p_data_pagamento IS NOT NULL THEN l.data_pagamento = p_data_pagamento
                          ELSE l.data_pagamento BETWEEN p_mes_de AND p_mes_ate END, false)
       )
  )
$fn$;
COMMENT ON FUNCTION public._fn_classificacao_par_herdado_valido(uuid, uuid, date, date, date) IS
  'PR-CONC-ENRIQ-CASADOR-MES: o par herdado vale para a linha? mesma conta (_fn_conta_do_lancamento) e data_pagamento igual (ou na janela de mes, sem data); cartao dispensa a data.';
REVOKE ALL ON FUNCTION public._fn_classificacao_par_herdado_valido(uuid, uuid, date, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_classificacao_par_herdado_valido(uuid, uuid, date, date, date) TO service_role;

-- ═══ 3. fn_classificacao_casar_sessao — patch guardado por md5 ═══════════════════════════════════════════════════════
DO $mig$
DECLARE
  v_oid oid := 'public.fn_classificacao_casar_sessao(uuid,text)'::regprocedure;
  v_antes text; v_novo text; v_def text;
  a_l text; b_l text; a_a text; b_a text; a_b text; b_b text;
  a_decl text; b_decl text; a_reab text; b_reab text; a_ret text; b_ret text;
  conceito text := $t$.tipo_operacao = '1-Entradas' THEN $t$;
BEGIN
  SELECT prosrc INTO v_antes FROM pg_proc WHERE oid = v_oid;
  IF md5(v_antes) <> 'a6a6832f1be59a35d296d6b0b4273117' THEN
    RAISE EXCEPTION 'fn_classificacao_casar_sessao nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  END IF;

  -- a regua: 4 copias do CONCEITO (l 2x: PASSO 1 e 3b; a e b: PASSO 3a) — conta-se o conceito, nao so' a string
  IF (length(v_antes) - length(replace(v_antes, conceito, ''))) / length(conceito) <> 4 THEN
    RAISE EXCEPTION 'casar_sessao: a regua de direcao nao aparece exatamente 4x';
  END IF;
  a_l := $t$(CASE WHEN l.tipo_operacao = '1-Entradas' THEN l.conta_destino_id ELSE l.conta_bancaria_id END) = r.conta_id$t$;
  b_l := $t$public._fn_conta_do_lancamento(l.tipo_operacao, l.conta_bancaria_id, l.conta_destino_id) = r.conta_id$t$;
  a_a := $t$(CASE WHEN a.tipo_operacao = '1-Entradas' THEN a.conta_destino_id ELSE a.conta_bancaria_id END) = r.conta_id$t$;
  b_a := $t$public._fn_conta_do_lancamento(a.tipo_operacao, a.conta_bancaria_id, a.conta_destino_id) = r.conta_id$t$;
  a_b := $t$(CASE WHEN b.tipo_operacao = '1-Entradas' THEN b.conta_destino_id ELSE b.conta_bancaria_id END) = r.conta_id$t$;
  b_b := $t$public._fn_conta_do_lancamento(b.tipo_operacao, b.conta_bancaria_id, b.conta_destino_id) = r.conta_id$t$;
  IF (length(v_antes) - length(replace(v_antes, a_l, ''))) / length(a_l) <> 2 THEN
    RAISE EXCEPTION 'casar_sessao: a regua com alias l nao casa exatamente 2x (PASSO 1 e 3b)';
  END IF;
  IF (length(v_antes) - length(replace(v_antes, a_a, ''))) / length(a_a) <> 1 THEN
    RAISE EXCEPTION 'casar_sessao: a regua com alias a nao casa exatamente 1x (PASSO 3a)';
  END IF;
  IF (length(v_antes) - length(replace(v_antes, a_b, ''))) / length(a_b) <> 1 THEN
    RAISE EXCEPTION 'casar_sessao: a regua com alias b nao casa exatamente 1x (PASSO 3a)';
  END IF;

  a_decl := $t$  v_chave_count int;
BEGIN$t$;
  b_decl := $t$  v_chave_count int;
  -- PR-CONC-ENRIQ-CASADOR-MES: as linhas 'ja_aplicado' reabertas
  v_reabrir uuid[] := '{}'::uuid[]; n_reab int := 0;
BEGIN$t$;

  a_reab := $t$  -- lancamentos ja reclamados por linhas que nao serao tocadas (aplicadas / resolvidas a mao)
$t$;
  b_reab := $t$  -- PR-CONC-ENRIQ-CASADOR-MES (D3/D4): o par HERDADO pela memoria do populate ('ja_aplicado' NAO aplicado) so' fica
  -- se valer para a linha (_fn_classificacao_par_herdado_valido: mesma conta e mesma data de pagamento da planilha, ou o
  -- mes da sessao quando a planilha nao tem data; cartao dispensa a data) e se ganhar a disputa pelo lancamento:
  -- lancamento preso em grupo/bloco de linha preservada e' usado; entre as preservadas que passam, fica a aplicada, senao
  -- a de menor linha. A que perde e' reaberta e recasada pela regra normal. Linha aplicada nunca e' reaberta; as outras
  -- preservadas disputam, mas nao sao julgadas nem reabertas.
  WITH preservadas AS (
    SELECT st.staging_id, st.excel_linha_origem, st.aplicado, st.match_status, st.match_lancamento_id,
           (st.aplicado OR st.match_status <> 'ja_aplicado'
            OR public._fn_classificacao_par_herdado_valido(st.match_lancamento_id,
                 COALESCE(st.conta_origem_id, st.conta_destino_id), st.excel_data_pagamento, v_de, v_ate)) AS passa
      FROM financeiro_classificacao_staging st
     WHERE st.sessao_id = p_sessao_id AND st.match_lancamento_id IS NOT NULL
       AND (st.aplicado OR st.match_status IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido','conferido_bloco'))
  ), disputa AS (
    SELECT p.staging_id,
           row_number() OVER (PARTITION BY p.match_lancamento_id
                              ORDER BY p.aplicado DESC, p.excel_linha_origem, p.staging_id) AS ordem
      FROM preservadas p WHERE p.passa
  )
  SELECT COALESCE(array_agg(p.staging_id), '{}'::uuid[]) INTO v_reabrir
    FROM preservadas p LEFT JOIN disputa d ON d.staging_id = p.staging_id
   WHERE NOT p.aplicado AND p.match_status = 'ja_aplicado'
     AND (NOT p.passa OR d.ordem > 1
          OR EXISTS (SELECT 1 FROM financeiro_classificacao_staging g
                      WHERE g.sessao_id = p_sessao_id AND g.staging_id <> p.staging_id
                        AND p.match_lancamento_id = ANY(g.match_lancamento_ids)
                        AND (g.aplicado OR g.match_status IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido','conferido_bloco'))));
  IF array_length(v_reabrir, 1) > 0 THEN
    UPDATE financeiro_classificacao_staging SET match_status = 'sem_match'
     WHERE staging_id = ANY(v_reabrir) AND NOT aplicado AND match_status = 'ja_aplicado';
    n_reab := array_length(v_reabrir, 1);
  END IF;

  -- lancamentos ja reclamados por linhas que nao serao tocadas (aplicadas / resolvidas a mao)
$t$;

  a_ret := $t$'sem_conta', n_semconta, 'nao_tocadas', n_pulou);$t$;
  b_ret := $t$'sem_conta', n_semconta, 'nao_tocadas', n_pulou, 'reabertas', n_reab);$t$;

  IF (length(v_antes) - length(replace(v_antes, a_decl, ''))) / length(a_decl) <> 1 THEN
    RAISE EXCEPTION 'casar_sessao: a ancora do DECLARE nao casa exatamente 1x';
  END IF;
  IF (length(v_antes) - length(replace(v_antes, a_reab, ''))) / length(a_reab) <> 1 THEN
    RAISE EXCEPTION 'casar_sessao: a ancora do v_usados nao casa exatamente 1x';
  END IF;
  IF (length(v_antes) - length(replace(v_antes, a_ret, ''))) / length(a_ret) <> 1 THEN
    RAISE EXCEPTION 'casar_sessao: a ancora do retorno nao casa exatamente 1x';
  END IF;

  v_novo := replace(replace(replace(replace(replace(replace(v_antes, a_l, b_l), a_a, b_a), a_b, b_b), a_decl, b_decl), a_reab, b_reab), a_ret, b_ret);
  IF (length(v_novo) - length(replace(v_novo, conceito, ''))) / length(conceito) <> 0 THEN
    RAISE EXCEPTION 'casar_sessao: sobrou copia da regua de direcao';
  END IF;

  v_def := pg_get_functiondef(v_oid);
  IF (length(v_def) - length(replace(v_def, v_antes, ''))) / length(v_antes) <> 1 THEN
    RAISE EXCEPTION 'casar_sessao: o corpo nao aparece exatamente 1x na definicao';
  END IF;
  EXECUTE replace(v_def, v_antes, v_novo);

  IF md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid)) <> 'c5d725afa76d91242d2c2410984cf38c' THEN
    RAISE EXCEPTION 'casar_sessao: corpo resultante inesperado (md5 %).', md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid));
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
    RAISE EXCEPTION 'casar_sessao perdeu SECURITY DEFINER';
  END IF;
END $mig$;

-- ═══ 4. fn_classificacao_populate_staging — patch guardado por md5 ═══════════════════════════════════════════════════
DO $mig$
DECLARE
  v_oid oid := 'public.fn_classificacao_populate_staging(uuid,uuid,jsonb)'::regprocedure;
  v_antes text; v_novo text; v_def text;
  a_loop text; b_loop text; a_her text; b_her text;
BEGIN
  SELECT prosrc INTO v_antes FROM pg_proc WHERE oid = v_oid;
  IF md5(v_antes) <> '5fdbd8171c19ae3fb26ba0d703aa0e1a' THEN
    RAISE EXCEPTION 'fn_classificacao_populate_staging nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  END IF;

  a_loop := $t$  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP$t$;
  b_loop := $t$  -- PR-CONC-ENRIQ-CASADOR-MES (D3): em ORDEM DE LINHA (a posicao original desempata) — a de menor linha
  -- reivindica primeiro o lancamento herdado. O casamento por atributos nao depende da ordem.
  FOR v_row IN SELECT e.value FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS e(value, ord)
                ORDER BY (e.value->>'linha')::int NULLS LAST, e.ord
  LOOP$t$;

  a_her := $t$    IF v_heranca_count = 1 AND v_heranca_lanc_id IS NOT NULL THEN
      -- herdou:$t$;
  b_her := $t$    -- PR-CONC-ENRIQ-CASADOR-MES (D1/D1b/D2/D3): o par herdado so' fica se valer PARA ESTA LINHA — mesma conta e mesma
    -- data de pagamento (sem data na planilha, a `data`, a mesma do casamento por atributos; cartao dispensa a data) — e se
    -- o lancamento nao estiver com outra linha da sessao (o loop vai em ordem de linha: a de menor linha ja' o tem).
    -- Nao vale: nao herda e segue o casamento normal.
    IF v_heranca_count = 1 AND v_heranca_lanc_id IS NOT NULL
       AND (NOT public._fn_classificacao_par_herdado_valido(v_heranca_lanc_id, COALESCE(v_conta_origem_id, v_conta_destino_id),
                  COALESCE(NULLIF(v_row->>'data_pagamento','')::date, v_data))
            OR EXISTS (SELECT 1 FROM financeiro_classificacao_staging s2
                        WHERE s2.sessao_id = p_sessao_id
                          AND (s2.match_lancamento_id = v_heranca_lanc_id OR v_heranca_lanc_id = ANY(s2.match_lancamento_ids)))) THEN
      v_heranca_count := 0; v_heranca_lanc_id := NULL;
    END IF;

    IF v_heranca_count = 1 AND v_heranca_lanc_id IS NOT NULL THEN
      -- herdou:$t$;

  IF (length(v_antes) - length(replace(v_antes, a_loop, ''))) / length(a_loop) <> 1 THEN
    RAISE EXCEPTION 'populate: a ancora do loop nao casa exatamente 1x';
  END IF;
  IF (length(v_antes) - length(replace(v_antes, 'jsonb_array_elements(p_rows)', ''))) / length('jsonb_array_elements(p_rows)') <> 1 THEN
    RAISE EXCEPTION 'populate: p_rows e'' lido mais de uma vez';
  END IF;
  IF (length(v_antes) - length(replace(v_antes, a_her, ''))) / length(a_her) <> 1 THEN
    RAISE EXCEPTION 'populate: a ancora da heranca nao casa exatamente 1x';
  END IF;

  v_novo := replace(replace(v_antes, a_loop, b_loop), a_her, b_her);

  v_def := pg_get_functiondef(v_oid);
  IF (length(v_def) - length(replace(v_def, v_antes, ''))) / length(v_antes) <> 1 THEN
    RAISE EXCEPTION 'populate: o corpo nao aparece exatamente 1x na definicao';
  END IF;
  EXECUTE replace(v_def, v_antes, v_novo);

  IF md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid)) <> '694ddc8baadae71b1d59de92a65c35b3' THEN
    RAISE EXCEPTION 'populate: corpo resultante inesperado (md5 %).', md5((SELECT prosrc FROM pg_proc WHERE oid = v_oid));
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
    RAISE EXCEPTION 'populate perdeu SECURITY DEFINER';
  END IF;
END $mig$;
