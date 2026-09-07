-- 20260907105357 extrato_conciliar_mes (aplicada no proto via Management API em 07/09/2026)

ALTER TABLE public.conciliacao_bancaria_itens DROP CONSTRAINT IF EXISTS chk_cbi_tipo_aprovacao;
ALTER TABLE public.conciliacao_bancaria_itens ADD CONSTRAINT chk_cbi_tipo_aprovacao CHECK (tipo_aprovacao = ANY (ARRAY['manual','sugestao_forte_aprovada','sugestao_fraca_aprovada','staging_auto','agrupamento_manual','agrupamento_legado','ofx_cru','ofx_substituiu']));
ALTER TABLE public.conciliacao_bancaria_itens DROP CONSTRAINT IF EXISTS chk_cbi_grupo_tipo;
ALTER TABLE public.conciliacao_bancaria_itens ADD CONSTRAINT chk_cbi_grupo_tipo CHECK ((grupo_id IS NULL AND tipo_aprovacao = ANY (ARRAY['manual','sugestao_forte_aprovada','sugestao_fraca_aprovada','staging_auto','ofx_cru','ofx_substituiu'])) OR (grupo_id IS NOT NULL AND tipo_aprovacao = ANY (ARRAY['agrupamento_manual','agrupamento_legado'])));


CREATE OR REPLACE FUNCTION public.fn_extrato_conciliar_mes(
  p_cliente_id uuid, p_conta_bancaria_id uuid, p_ano_mes text, p_simular boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_uid uuid;
  v_conta financeiro_contas_bancarias%ROWTYPE;
  v_de date; v_ate date;
  v_ext record; v_cand record; v_n int;
  v_crus jsonb := '[]'::jsonb; v_subs jsonb := '[]'::jsonb; v_sem_par jsonb := '[]'::jsonb; v_amb jsonb := '[]'::jsonb;
  v_ja int := 0; v_saldo_ini numeric; v_saldo_dig numeric; v_soma_ext numeric := 0;
  v_usados uuid[] := '{}'::uuid[];
  v_r jsonb; v_cbi uuid; v_lanc_id uuid;
  v_soma_cru numeric := 0; v_soma_sub numeric := 0; v_soma_sem numeric := 0;
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
      SELECT l.* INTO v_cand FROM financeiro_lancamentos_v2 l
      WHERE l.cliente_id = p_cliente_id AND l.cancelado IS NOT TRUE AND l.sem_movimentacao_caixa IS NOT TRUE
        AND COALESCE(l.cenario,'realizado') <> 'meta'
        AND (CASE WHEN l.tipo_operacao = '1-Entradas' THEN l.conta_destino_id ELSE l.conta_bancaria_id END) = p_conta_bancaria_id
        AND round(l.valor,2) = round(abs(v_ext.valor),2)
        AND l.sinal = (CASE WHEN v_ext.valor < 0 THEN '-1' ELSE '1' END)
        AND abs(COALESCE(l.data_pagamento, l.data_vencimento) - v_ext.data_movimento) <= 5
        AND NOT (l.id = ANY(v_usados))
        AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL);
      v_usados := v_usados || v_cand.id;
      v_soma_sub := v_soma_sub + v_ext.valor;
      v_subs := v_subs || jsonb_build_object(
        'extrato_id', v_ext.id, 'lancamento_id', v_cand.id, 'data_banco', v_ext.data_movimento, 'valor_banco', v_ext.valor,
        'historico_banco', v_ext.descricao, 'documento_banco', v_ext.documento,
        'descricao', v_cand.descricao, 'subcentro', v_cand.subcentro, 'fazenda_id', v_cand.fazenda_id, 'origem_lancamento', v_cand.origem_lancamento,
        'antes', jsonb_build_object('data_pagamento', v_cand.data_pagamento, 'data_vencimento', v_cand.data_vencimento, 'valor', v_cand.valor, 'status_transacao', v_cand.status_transacao),
        'depois', jsonb_build_object('data_pagamento', v_ext.data_movimento, 'valor', abs(v_ext.valor), 'status_transacao', 'realizado'));
      IF NOT p_simular THEN
        UPDATE financeiro_lancamentos_v2
           SET data_pagamento = v_ext.data_movimento, valor = abs(v_ext.valor), status_transacao = 'realizado',
               updated_by = v_uid, updated_at = now()
         WHERE id = v_cand.id;
        INSERT INTO conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado, criado_por, tipo_aprovacao, aprovado_por, aprovado_em,
               snapshot_extrato_valor, snapshot_lancamento_valor, snapshot_extrato_data, snapshot_lancamento_data, snapshot_historico_banco)
        VALUES (p_cliente_id, v_ext.id, v_cand.id, abs(v_ext.valor), v_uid, 'ofx_substituiu', v_uid, now(),
               v_ext.valor, v_cand.valor, v_ext.data_movimento, COALESCE(v_cand.data_pagamento, v_cand.data_vencimento), v_ext.descricao);
        UPDATE extrato_bancario_v2 SET status = 'conciliado' WHERE id = v_ext.id;
      END IF;
    ELSE
      IF v_n > 1 THEN
        v_amb := v_amb || jsonb_build_object('extrato_id', v_ext.id, 'data_banco', v_ext.data_movimento, 'valor_banco', v_ext.valor, 'historico_banco', v_ext.descricao, 'candidatos', v_n);
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
    'ok', true, 'simulado', p_simular, 'conta_bancaria_id', p_conta_bancaria_id, 'ano_mes', p_ano_mes,
    'movimentos_extrato', v_ja + jsonb_array_length(v_crus) + jsonb_array_length(v_subs),
    'ja_conciliados', v_ja,
    'crus', v_crus, 'crus_total', v_soma_cru,
    'substituidos', v_subs, 'substituidos_total', v_soma_sub,
    'sem_par', v_sem_par, 'sem_par_total', v_soma_sem,
    'ambiguos', v_amb,
    'saldo', jsonb_build_object('inicial', v_saldo_ini, 'movimentos_extrato', v_soma_ext,
       'final_calculado', CASE WHEN v_saldo_ini IS NULL THEN NULL ELSE v_saldo_ini + v_soma_ext END,
       'final_digitado', v_saldo_dig,
       'confere', CASE WHEN v_saldo_ini IS NULL OR v_saldo_dig IS NULL THEN NULL ELSE abs(v_saldo_ini + v_soma_ext - v_saldo_dig) <= 0.01 END));
END;
$fn$;
REVOKE ALL ON FUNCTION public.fn_extrato_conciliar_mes(uuid,uuid,text,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_extrato_conciliar_mes(uuid,uuid,text,boolean) TO authenticated;

