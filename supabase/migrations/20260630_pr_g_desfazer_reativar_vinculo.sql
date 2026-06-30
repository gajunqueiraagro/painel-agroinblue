-- 20260630_pr_g_desfazer_reativar_vinculo.sql
-- PR G (problema B + reverter-desfeito) — desfazer / reativar vínculo de conciliação por extrato.
--
-- Hoje não há ação manual de desfazer um vínculo (CBI só vira desfeito por cancelamento do
-- lançamento, que não recalcula extrato.status). Estas 2 RPCs cobrem:
--   - fn_desfazer_vinculo_extrato: desfaz o único CBI ativo do extrato (seta desfeito_em/_por/
--     _motivo='desfeito_manual'), recalcula extrato.status e audita 'conciliacao_desfeita'.
--   - fn_reativar_vinculo_extrato: reativa (Opção A = a MESMA linha; desfeito_em=NULL) quando há
--     exatamente 1 CBI desfeito_manual e 0 ativos; status->'conciliado'; audita 'conciliacao_criada'.
-- Reativa a MESMA linha — NÃO cria CBI novo (não viola idx_conciliacao_itens_par_unico).
-- NÃO toca índice, trigger de cancelamento, D1 nem read-model. Saneamento dos 337 extratos
-- contraditórios e re-vínculo de par diferente são frentes separadas.
-- Validadas em BEGIN/ROLLBACK (T1..T5). Forward-only (repo não usa par *_down.sql).

-- RPC 1 — desfazer vínculo ativo por extrato
CREATE OR REPLACE FUNCTION fn_desfazer_vinculo_extrato(
  p_extrato_id uuid,
  p_motivo text DEFAULT 'desfeito_manual'
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_cbi record; v_n int; v_cli uuid; v_alvo text;
BEGIN
  SELECT count(*) INTO v_n FROM conciliacao_bancaria_itens
   WHERE extrato_id = p_extrato_id AND desfeito_em IS NULL;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'extrato % nao possui vinculo ativo para desfazer', p_extrato_id;
  END IF;
  IF v_n > 1 THEN
    RAISE EXCEPTION 'extrato % possui % vinculos ativos; desfazer bloqueado por seguranca', p_extrato_id, v_n;
  END IF;

  SELECT * INTO v_cbi FROM conciliacao_bancaria_itens
   WHERE extrato_id = p_extrato_id AND desfeito_em IS NULL;

  UPDATE conciliacao_bancaria_itens
     SET desfeito_em = now(), desfeito_por = auth.uid(),
         desfeito_motivo = COALESCE(p_motivo, 'desfeito_manual')
   WHERE id = v_cbi.id;

  v_alvo := CASE WHEN EXISTS(
              SELECT 1 FROM conciliacao_bancaria_itens
               WHERE extrato_id = p_extrato_id AND desfeito_em IS NULL)
            THEN 'conciliado' ELSE 'nao_conciliado' END;
  UPDATE extrato_bancario_v2 SET status = v_alvo WHERE id = p_extrato_id;

  SELECT cliente_id INTO v_cli FROM extrato_bancario_v2 WHERE id = p_extrato_id;
  INSERT INTO conciliacao_audit_log
    (acao, actor_user_id, cliente_id, extrato_id, lancamento_id, conciliacao_id, motivo, payload_depois)
  VALUES ('conciliacao_desfeita', auth.uid(), v_cli, p_extrato_id,
          v_cbi.lancamento_id, v_cbi.id, COALESCE(p_motivo,'desfeito_manual'),
          jsonb_build_object('status', v_alvo, 'valor_aplicado', v_cbi.valor_aplicado));
  RETURN v_alvo;
END $fn$;

-- RPC 2 — reativar vínculo desfeito MANUALMENTE por extrato
CREATE OR REPLACE FUNCTION fn_reativar_vinculo_extrato(
  p_extrato_id uuid
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_cbi record; v_na int; v_nm int; v_cli uuid;
BEGIN
  SELECT count(*) INTO v_na FROM conciliacao_bancaria_itens
   WHERE extrato_id = p_extrato_id AND desfeito_em IS NULL;
  IF v_na > 0 THEN
    RAISE EXCEPTION 'extrato % ja possui vinculo ativo; reativar bloqueado', p_extrato_id;
  END IF;

  SELECT count(*) INTO v_nm FROM conciliacao_bancaria_itens
   WHERE extrato_id = p_extrato_id AND desfeito_em IS NOT NULL
     AND desfeito_motivo = 'desfeito_manual';
  IF v_nm = 0 THEN
    RAISE EXCEPTION 'extrato % nao possui vinculo desfeito_manual para reativar', p_extrato_id;
  END IF;
  IF v_nm > 1 THEN
    RAISE EXCEPTION 'extrato % possui % vinculos desfeito_manual; reativar bloqueado por seguranca', p_extrato_id, v_nm;
  END IF;

  SELECT * INTO v_cbi FROM conciliacao_bancaria_itens
   WHERE extrato_id = p_extrato_id AND desfeito_em IS NOT NULL
     AND desfeito_motivo = 'desfeito_manual';

  UPDATE conciliacao_bancaria_itens
     SET desfeito_em = NULL, desfeito_por = NULL, desfeito_motivo = NULL
   WHERE id = v_cbi.id;

  UPDATE extrato_bancario_v2 SET status = 'conciliado' WHERE id = p_extrato_id;

  SELECT cliente_id INTO v_cli FROM extrato_bancario_v2 WHERE id = p_extrato_id;
  INSERT INTO conciliacao_audit_log
    (acao, actor_user_id, cliente_id, extrato_id, lancamento_id, conciliacao_id, motivo, payload_depois)
  VALUES ('conciliacao_criada', auth.uid(), v_cli, p_extrato_id,
          v_cbi.lancamento_id, v_cbi.id, 'reativacao_manual',
          jsonb_build_object('status','conciliado','valor_aplicado', v_cbi.valor_aplicado));
  RETURN 'conciliado';
END $fn$;

-- GRANTS (lição do PR F: NÃO deixar anon/PUBLIC)
REVOKE EXECUTE ON FUNCTION fn_desfazer_vinculo_extrato(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION fn_reativar_vinculo_extrato(uuid)       FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_desfazer_vinculo_extrato(uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION fn_reativar_vinculo_extrato(uuid)       TO authenticated;
