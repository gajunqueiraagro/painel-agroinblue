-- ============================================================================
-- P0-CLEANUP-LINKS — Migration 1/3 (trigger)
-- Ao cancelar um lançamento (financeiro_lancamentos_v2.cancelado false->true),
-- desfaz automaticamente os vínculos vivos (conciliacao_bancaria_itens) daquele
-- lançamento, preenchendo desfeito_em/por/motivo. Só age em cancelamentos
-- FUTUROS (não retroage — o backfill 2/3 trata os 363 mortos existentes).
-- Ordem obrigatória: 1.trigger -> 2.backfill -> 3.RPC 01.8.
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_cbi_desfazer_on_cancelamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.cancelado IS DISTINCT FROM true) AND (NEW.cancelado = true) THEN
    UPDATE conciliacao_bancaria_itens cbi
       SET desfeito_em     = COALESCE(NEW.cancelado_em, now()),
           desfeito_por    = NEW.cancelado_por,
           desfeito_motivo = 'lancamento_cancelado'
     WHERE cbi.lancamento_id = NEW.id
       AND cbi.desfeito_em IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cbi_desfazer_on_cancelamento ON financeiro_lancamentos_v2;
CREATE TRIGGER trg_cbi_desfazer_on_cancelamento
  AFTER UPDATE OF cancelado ON financeiro_lancamentos_v2
  FOR EACH ROW
  EXECUTE FUNCTION fn_cbi_desfazer_on_cancelamento();
