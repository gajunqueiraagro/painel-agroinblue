-- FINANC-CRONO-TELA-01 item 0 (Gabriel 26/11 07:47; investigação do Code 2 07:50): o FECHO do "Editar parcelas" e do Regerar
-- (_fn_parcelas_credito_fechar → fn_reconciliar_parcela_financiamento(q.id, false, true, NULL) em TODAS as parcelas) regravava a conta de toda
-- parcela aberta com a da CAPTAÇÃO do contrato: v_conta_desejada := COALESCE(p_conta_bancaria_id, v_contrato.conta_bancaria_id).
-- Às 07:10:51 um "Editar parcelas" do FCO - Curral voltou 22 lançamentos do BB para a Sicredi Pecuária assim.
-- CONSERTO (uma linha, no dono — vale para todo chamador: fecho, regerar, baixa, desvincular, pagar pelo extrato):
--   conta desejada = a pedida (p_conta_bancaria_id) → senão a do LANÇAMENTO ATUAL da parcela (amortização; sem ela, juros) → senão a do contrato
--   (só parcela nova ou sem conta). Trocar a conta das abertas passa a ser só pela "Conta de pagamento" do contrato (prévia + OK — tela, depois).
-- O corpo tem 34 KB: patch GUARDADO — só aplica se o corpo de hoje for o conferido (md5 da definição) e a âncora existir UMA vez; senão recusa.
DO $patch$
DECLARE
  v_def text := pg_get_functiondef('public.fn_reconciliar_parcela_financiamento(uuid,boolean,boolean,uuid)'::regprocedure);
  v_ancora text := 'v_conta_desejada := COALESCE(p_conta_bancaria_id, v_contrato.conta_bancaria_id);';
  v_novo text := 'v_conta_desejada := COALESCE(p_conta_bancaria_id,
    -- FINANC-CRONO-TELA-01 item 0: a conta que a parcela JÁ TEM (o lançamento atual) manda; a do contrato só na parcela nova/sem conta
    (SELECT l.conta_efetiva_id FROM public.financeiro_lancamentos_v2 l
      WHERE l.id IN (v_parcela.lancamento_id, v_parcela.lancamento_juros_id) AND l.cancelado IS NOT TRUE AND l.conta_efetiva_id IS NOT NULL
      ORDER BY (l.id = v_parcela.lancamento_id) DESC LIMIT 1),
    v_contrato.conta_bancaria_id);';
BEGIN
  IF md5(v_def) <> '596c1dfa818656711e08d6dbd448c6af' THEN
    RAISE EXCEPTION 'FINANC-CRONO-TELA-01 item 0: o corpo de fn_reconciliar_parcela_financiamento mudou (md5 %) — nada aplicado', md5(v_def);
  END IF;
  IF (SELECT count(*) FROM regexp_matches(v_def, 'v_conta_desejada := COALESCE\(p_conta_bancaria_id, v_contrato\.conta_bancaria_id\);', 'g')) <> 1 THEN
    RAISE EXCEPTION 'FINANC-CRONO-TELA-01 item 0: a âncora não está exatamente 1 vez — nada aplicado';
  END IF;
  EXECUTE replace(v_def, v_ancora, v_novo);
END $patch$;
