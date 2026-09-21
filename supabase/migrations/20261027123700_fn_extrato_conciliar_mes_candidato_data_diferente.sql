-- CANDIDATO DA DATA DIFERENTE — o ramo v_n = 1 passa a DIZER QUEM e' o candidato.
--
-- O ESTADO ANTES:
--   Desde PR-CONCILIACAO-CRUS-01 (a migration 20261027123000, logo acima desta), o movimento com
--   UM unico candidato no sistema deixou de ser casado por esta funcao e passou a sair na chave
--   'aguardando_exatos', com quatro campos: extrato_id, data_banco, valor_banco, historico_banco,
--   mais 'candidatos' = 1. Quatro campos do lado do BANCO, e nenhum do lado do SISTEMA.
--   A tela mostrava, no lugar do candidato, a frase fixa "o botao nao casa datas diferentes —
--   resolva na Estacao": ela sabia que EXISTIA um candidato e nao tinha como dizer QUAL.
--
-- ⚠ E A FUNCAO JA' TINHA A LINHA NA MAO. O `SELECT count(*) INTO v_n` que decide entre os tres
--   ramos varre exatamente esse lancamento — contava e descartava a identidade. Nao foi preciso
--   consulta nova nem criterio novo: o SELECT do candidato repete, campo a campo, o WHERE do
--   count(*) logo acima, e acrescenta LIMIT 1 (redundante por construcao, porque so' se entra
--   neste ramo quando a contagem deu exatamente 1 — esta' ali como cinto de seguranca).
--
-- O QUE MUDA:
--   v_n = 1 -> 'aguardando_exatos' ganha QUATRO campos novos, todos do candidato:
--              cand_lancamento_id (uuid), cand_descricao (text), cand_valor (numeric),
--              cand_data (date, que e' COALESCE(data_pagamento, data_vencimento)).
--
-- O QUE NAO MUDA — e e' o ponto desta migration:
--   v_n = 0  -> intacto. Continua criando cru, e SO' para os extratos listados em p_extratos.
--   v_n > 1  -> intacto. Continua so' contando em 'ambiguos', sem criar nada.
--   Nenhum UPDATE, INSERT ou DELETE novo. Nenhum vinculo. Nenhum lancamento criado.
--   Esta funcao NAO voltou a casar: ela so' acrescenta INFORMACAO ao que ja' devolvia.
--
-- ⚠ `cand_valor` VAI SEM SINAL, e quem consumir precisa saber: e' `financeiro_lancamentos_v2.valor`,
--   que e' absoluto — a direcao mora em `sinal`, a parte. O sinal do candidato e' necessariamente
--   o do movimento, porque `l.sinal = (CASE WHEN v_ext.valor < 0 THEN '-1' ELSE '1' END)` e'
--   criterio de SELECAO dele, nao coincidencia. A tela aplica o sinal do movimento.
--   (Comparar com fn_vincular_exatos_mes, que emite 'valor_sistema' JA' com o sinal aplicado. As
--   duas convencoes convivem no mesmo retorno de tela, e essa diferenca ja' custou uma correcao.)
--
-- ⚠ SEM DROP: a assinatura nao mudou (os mesmos seis argumentos da 20261027123000), entao o
--   CREATE OR REPLACE substitui de verdade e nao cria sobrecarga. O REVOKE/GRANT do rodape fica
--   assim mesmo — ele e' barato, e a ACL conferida no proto e' exatamente essa:
--   {postgres=X/postgres, service_role=X/postgres, authenticated=X/postgres}, sem PUBLIC.
--
-- Aplicada no proto pelo arquiteto em 21/09/2026; esta migration e' REGISTRO HISTORICO e NAO foi
-- reaplicada ao ser escrita. Copiada do pg_get_functiondef do proto:
--   corpo (prosrc):     md5 a1bc82d5c547fa2efdefcd07450d1abc, len 8926
--   definicao completa: md5 1db808c05fc67d9b16812639c48b0669, len 9262
--   antes (prosrc):     md5 7005b76082c725db3f360d1a159d06a1, len 7936

CREATE OR REPLACE FUNCTION public.fn_extrato_conciliar_mes(p_cliente_id uuid, p_conta_bancaria_id uuid, p_ano_mes text, p_simular boolean DEFAULT true, p_limite integer DEFAULT NULL::integer, p_extratos uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_conta financeiro_contas_bancarias%ROWTYPE;
  v_de date; v_ate date;
  v_ext record; v_cand record; v_n int;
  v_crus jsonb := '[]'::jsonb; v_subs jsonb := '[]'::jsonb; v_aguard jsonb := '[]'::jsonb; v_sem_par jsonb := '[]'::jsonb; v_amb jsonb := '[]'::jsonb;
  v_ja int := 0; v_saldo_ini numeric; v_saldo_dig numeric; v_soma_ext numeric := 0;
  v_usados uuid[] := '{}'::uuid[];
  v_r jsonb; v_cbi uuid; v_lanc_id uuid;
  v_soma_cru numeric := 0; v_soma_sub numeric := 0; v_soma_sem numeric := 0;
  v_feitas int := 0; v_restantes int := 0;
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_uid) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem permissao para este cliente';
  END IF;
  IF p_ano_mes !~ '^[0-9]{4}-[0-9]{2}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='p_ano_mes deve ser AAAA-MM';
  END IF;
  SELECT * INTO v_conta FROM financeiro_contas_bancarias WHERE id = p_conta_bancaria_id AND cliente_id = p_cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='conta nao encontrada para o cliente'; END IF;
  IF v_conta.fazenda_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='conta sem fazenda: nao e possivel criar lancamento cru'; END IF;
  v_de := to_date(p_ano_mes||'-01','YYYY-MM-DD'); v_ate := (v_de + interval '1 month' - interval '1 day')::date;
  IF NOT p_simular AND EXISTS (SELECT 1 FROM financeiro_fechamentos f WHERE f.cliente_id = p_cliente_id AND f.fazenda_id = v_conta.fazenda_id AND f.ano_mes = p_ano_mes AND f.status_fechamento = 'fechado') THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='mes fechado: conciliacao bloqueada';
  END IF;

  -- ja conciliados e soma do extrato
  SELECT count(*) FILTER (WHERE status = 'conciliado'), COALESCE(sum(valor),0)
    INTO v_ja, v_soma_ext
  FROM extrato_bancario_v2
  WHERE cliente_id = p_cliente_id AND conta_bancaria_id = p_conta_bancaria_id
    AND data_movimento BETWEEN v_de AND v_ate AND cancelado_em IS NULL AND ignorado_em IS NULL;

  -- lancamentos ja vinculados no mes ficam fora do casamento
  SELECT COALESCE(array_agg(DISTINCT c.lancamento_id), '{}'::uuid[]) INTO v_usados
  FROM conciliacao_bancaria_itens c JOIN extrato_bancario_v2 x ON x.id = c.extrato_id
  WHERE x.cliente_id = p_cliente_id AND x.conta_bancaria_id = p_conta_bancaria_id AND c.desfeito_em IS NULL;

  FOR v_ext IN
    SELECT * FROM extrato_bancario_v2
    WHERE cliente_id = p_cliente_id AND conta_bancaria_id = p_conta_bancaria_id
      AND data_movimento BETWEEN v_de AND v_ate AND status = 'nao_conciliado'
      AND cancelado_em IS NULL AND ignorado_em IS NULL
    ORDER BY data_movimento, created_at
  LOOP
    IF NOT p_simular AND p_limite IS NOT NULL AND v_feitas >= p_limite THEN
      v_restantes := v_restantes + 1; CONTINUE;
    END IF;
    v_feitas := v_feitas + 1;
    -- candidatos: mesma conta pela regra entrada/saida, mesmo valor e sinal, ate 5 dias, sem vinculo ativo
    SELECT count(*) INTO v_n FROM financeiro_lancamentos_v2 l
    WHERE l.cliente_id = p_cliente_id AND l.cancelado IS NOT TRUE AND l.sem_movimentacao_caixa IS NOT TRUE
      AND COALESCE(l.cenario,'realizado') <> 'meta'
      AND (CASE WHEN l.tipo_operacao = '1-Entradas' THEN l.conta_destino_id ELSE l.conta_bancaria_id END) = p_conta_bancaria_id
      AND round(l.valor,2) = round(abs(v_ext.valor),2)
      AND l.sinal = (CASE WHEN v_ext.valor < 0 THEN '-1' ELSE '1' END)
      AND abs(COALESCE(l.data_pagamento, l.data_vencimento) - v_ext.data_movimento) <= 5
      AND NOT (l.id = ANY(v_usados))
      AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL);

    IF v_n = 1 THEN
      -- PR-CONCILIACAO-CRUS-01: NAO casa mais aqui. Casar e o passo 2a
      -- (fn_vincular_exatos_mes / "Vincular os exatos"), que pede aprovacao.
      -- FASE 2 (CANDIDATO-DATA-DIFERENTE): captura a identidade do candidato unico,
      -- mesmos criterios do count(*) acima, so pra MOSTRAR na tela. Nao casa.
      SELECT l.id, l.descricao, l.valor, COALESCE(l.data_pagamento, l.data_vencimento) AS dt
        INTO v_cand
      FROM financeiro_lancamentos_v2 l
      WHERE l.cliente_id = p_cliente_id AND l.cancelado IS NOT TRUE AND l.sem_movimentacao_caixa IS NOT TRUE
        AND COALESCE(l.cenario,'realizado') <> 'meta'
        AND (CASE WHEN l.tipo_operacao = '1-Entradas' THEN l.conta_destino_id ELSE l.conta_bancaria_id END) = p_conta_bancaria_id
        AND round(l.valor,2) = round(abs(v_ext.valor),2)
        AND l.sinal = (CASE WHEN v_ext.valor < 0 THEN '-1' ELSE '1' END)
        AND abs(COALESCE(l.data_pagamento, l.data_vencimento) - v_ext.data_movimento) <= 5
        AND NOT (l.id = ANY(v_usados))
        AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL)
      LIMIT 1;
      v_aguard := v_aguard || jsonb_build_object('extrato_id', v_ext.id,
        'data_banco', v_ext.data_movimento, 'valor_banco', v_ext.valor,
        'historico_banco', v_ext.descricao, 'candidatos', 1,
        'cand_lancamento_id', v_cand.id, 'cand_descricao', v_cand.descricao,
        'cand_valor', v_cand.valor, 'cand_data', v_cand.dt);
    ELSE
      IF v_n > 1 THEN
        -- PR-CONCILIACAO-CRUS-01: com 2+ candidatos NAO se cria cru. O movimento
        -- fica em aberto esperando o agrupamento (passo 2b). Antes virava
        -- lancamento novo sem perguntar, e os candidatos ficavam sem par.
        v_amb := v_amb || jsonb_build_object('extrato_id', v_ext.id, 'data_banco', v_ext.data_movimento, 'valor_banco', v_ext.valor, 'historico_banco', v_ext.descricao, 'candidatos', v_n);
        CONTINUE;
      END IF;
      -- so chega aqui quem tem ZERO candidatos
      IF p_extratos IS NOT NULL AND NOT (v_ext.id = ANY(p_extratos)) THEN
        CONTINUE;
      END IF;
      v_soma_cru := v_soma_cru + v_ext.valor;
      v_lanc_id := NULL;
      IF NOT p_simular THEN
        v_r := public.fn_criar_lancamento_de_extrato(v_ext.id, v_conta.fazenda_id);
        v_lanc_id := (v_r->>'lancamento_id')::uuid; v_cbi := (v_r->>'cbi_id')::uuid;
        UPDATE conciliacao_bancaria_itens SET tipo_aprovacao = 'ofx_cru' WHERE id = v_cbi;
        v_usados := v_usados || v_lanc_id;
      END IF;
      v_crus := v_crus || jsonb_build_object('extrato_id', v_ext.id, 'lancamento_id', v_lanc_id, 'data_banco', v_ext.data_movimento, 'valor_banco', v_ext.valor,
        'historico_banco', v_ext.descricao, 'documento_banco', v_ext.documento, 'importacao_id', v_ext.importacao_id, 'ambiguo', (v_n > 1));
    END IF;
  END LOOP;

  -- sem par: lancamentos com caixa da conta no mes que continuam sem vinculo
  SELECT COALESCE(jsonb_agg(jsonb_build_object('lancamento_id', l.id, 'data', COALESCE(l.data_pagamento, l.data_vencimento), 'valor', l.valor * l.sinal::numeric,
           'descricao', l.descricao, 'subcentro', l.subcentro, 'status_transacao', l.status_transacao, 'origem_lancamento', l.origem_lancamento) ORDER BY COALESCE(l.data_pagamento, l.data_vencimento)), '[]'::jsonb),
         COALESCE(sum(l.valor * l.sinal::numeric),0)
    INTO v_sem_par, v_soma_sem
  FROM financeiro_lancamentos_v2 l
  WHERE l.cliente_id = p_cliente_id AND l.cancelado IS NOT TRUE AND l.sem_movimentacao_caixa IS NOT TRUE
    AND COALESCE(l.cenario,'realizado') <> 'meta'
    AND (CASE WHEN l.tipo_operacao = '1-Entradas' THEN l.conta_destino_id ELSE l.conta_bancaria_id END) = p_conta_bancaria_id
    AND COALESCE(l.data_pagamento, l.data_vencimento) BETWEEN v_de AND v_ate
    AND NOT (l.id = ANY(v_usados))
    AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL);

  SELECT s.saldo_inicial, s.saldo_final INTO v_saldo_ini, v_saldo_dig
  FROM financeiro_saldos_bancarios_v2 s WHERE s.conta_bancaria_id = p_conta_bancaria_id AND s.ano_mes = p_ano_mes LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true, 'simulado', p_simular, 'processados', v_feitas, 'restantes', v_restantes, 'conta_bancaria_id', p_conta_bancaria_id, 'ano_mes', p_ano_mes,
    'movimentos_extrato', v_ja + jsonb_array_length(v_crus) + jsonb_array_length(v_aguard) + jsonb_array_length(v_amb) + v_restantes,
    'ja_conciliados', v_ja,
    'crus', v_crus, 'crus_total', v_soma_cru,
    'substituidos', v_subs, 'substituidos_total', v_soma_sub,
    'sem_par', v_sem_par, 'sem_par_total', v_soma_sem,
    'ambiguos', v_amb,
    'aguardando_exatos', v_aguard,
    'saldo', jsonb_build_object('inicial', v_saldo_ini, 'movimentos_extrato', v_soma_ext,
       'final_calculado', CASE WHEN v_saldo_ini IS NULL THEN NULL ELSE v_saldo_ini + v_soma_ext END,
       'final_digitado', v_saldo_dig,
       'confere', CASE WHEN v_saldo_ini IS NULL OR v_saldo_dig IS NULL THEN NULL ELSE abs(v_saldo_ini + v_soma_ext - v_saldo_dig) <= 0.01 END));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_extrato_conciliar_mes(uuid, uuid, text, boolean, integer, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_extrato_conciliar_mes(uuid, uuid, text, boolean, integer, uuid[]) TO authenticated;
