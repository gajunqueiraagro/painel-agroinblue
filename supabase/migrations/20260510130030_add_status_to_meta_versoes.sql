-- A2: adicionar coluna status em meta_versoes
-- Permite controle simples de aprovação executiva sem JSONB.

ALTER TABLE meta_versoes
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'rascunho';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'meta_versoes_status_check'
  ) THEN
    ALTER TABLE meta_versoes
      ADD CONSTRAINT meta_versoes_status_check
      CHECK (status IN ('rascunho', 'aprovada'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_meta_versoes_cliente_ano_status
  ON meta_versoes(cliente_id, ano, status);

COMMENT ON COLUMN meta_versoes.status IS
  'Status executivo da versão META: rascunho (default) ou aprovada. V1 do hook usePlanejamentoAprovacaoData.';
