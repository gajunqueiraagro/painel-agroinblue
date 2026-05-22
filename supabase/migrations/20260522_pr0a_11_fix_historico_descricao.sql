-- PR0.A · Fix histórico → descrição em fn_snapshot_conciliacao
-- Correção: extrato_bancario_v2 não tem coluna `historico`, apenas `descricao`.
-- A coluna `historico` está em financeiro_lancamentos_v2.
-- Esta migration já foi aplicada manualmente no proto via Chrome MCP em 22/05/2026.
-- Existe aqui para manter o histórico do repositório consistente com o estado do banco.

CREATE OR REPLACE FUNCTION fn_snapshot_conciliacao()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_extrato RECORD; v_lanc RECORD;
BEGIN
  SELECT id, valor, data_movimento, descricao
    INTO v_extrato
  FROM extrato_bancario_v2 WHERE id = NEW.extrato_id;

  SELECT id, valor, data_pagamento, favorecido_id
    INTO v_lanc
  FROM financeiro_lancamentos_v2 WHERE id = NEW.lancamento_id;

  NEW.snapshot_extrato_valor     := v_extrato.valor;
  NEW.snapshot_extrato_data      := v_extrato.data_movimento;
  NEW.snapshot_historico_banco   := v_extrato.descricao;
  NEW.snapshot_lancamento_valor  := v_lanc.valor;
  NEW.snapshot_lancamento_data   := v_lanc.data_pagamento;
  NEW.snapshot_favorecido_id     := v_lanc.favorecido_id;
  NEW.snapshot_flags_no_momento  := jsonb_build_object(
    'extrato_suspeita_valor',     COALESCE((SELECT flag_suspeita_valor FROM extrato_bancario_v2 WHERE id = NEW.extrato_id), false),
    'extrato_suspeita_fornecedor', COALESCE((SELECT flag_suspeita_fornecedor FROM extrato_bancario_v2 WHERE id = NEW.extrato_id), false),
    'lanc_editado_manual',         COALESCE((SELECT editado_manual FROM financeiro_lancamentos_v2 WHERE id = NEW.lancamento_id), false),
    'lanc_orfao_definitivo',       COALESCE((SELECT orfao_definitivo FROM financeiro_lancamentos_v2 WHERE id = NEW.lancamento_id), false)
  );
  NEW.aprovado_em := COALESCE(NEW.aprovado_em, now());

  RETURN NEW;
END $$;

-- Remove índice que tentava usar coluna inexistente (idempotente)
DROP INDEX IF EXISTS idx_extrato_historico_trgm;

-- Adiciona índice trigram em historico de LANCAMENTOS (onde a coluna realmente existe)
CREATE INDEX IF NOT EXISTS idx_lanc_historico_trgm
  ON financeiro_lancamentos_v2 USING gin (historico gin_trgm_ops)
  WHERE cancelado = false;
