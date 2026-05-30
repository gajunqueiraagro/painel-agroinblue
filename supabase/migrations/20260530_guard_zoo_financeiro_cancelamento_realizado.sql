-- Camada 2: impede a camada Zoo de cancelar/substituir financeiro oficial realizado/agendado.
-- Protege apenas lançamentos vinculados (movimentacao_rebanho_id IS NOT NULL) na transição cancelado false->true.
-- Status protegidos: realizado, agendado. Cinto técnico residual: conciliado_em IS NOT NULL.
-- Substituíveis pelo Zoo: programado, previsto, meta. Não cobre DELETE/desconciliar/editar valor.

CREATE OR REPLACE FUNCTION guard_zoo_financeiro_cancelamento_realizado()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
BEGIN
  IF NEW.cancelado IS TRUE
     AND OLD.cancelado IS DISTINCT FROM TRUE
     AND OLD.movimentacao_rebanho_id IS NOT NULL
     AND (
       OLD.status_transacao IN ('realizado','agendado')
       OR OLD.conciliado_em IS NOT NULL
     )
  THEN
    RAISE EXCEPTION
      'Lançamento financeiro vinculado ao Zoo está realizado/agendado e não pode ser cancelado. Altere pelo Financeiro Oficial.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_guard_zoo_financeiro_cancelamento_realizado ON financeiro_lancamentos_v2;
CREATE TRIGGER trg_guard_zoo_financeiro_cancelamento_realizado
  BEFORE UPDATE OF cancelado ON financeiro_lancamentos_v2
  FOR EACH ROW
  EXECUTE FUNCTION guard_zoo_financeiro_cancelamento_realizado();
