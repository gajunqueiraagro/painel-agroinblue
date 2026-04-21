-- Adiciona coluna cenario para segregar lançamentos realizado/programado vs meta.
-- Default 'realizado' preserva comportamento dos registros existentes.
ALTER TABLE financeiro_lancamentos_v2
  ADD COLUMN IF NOT EXISTS cenario text DEFAULT 'realizado';

CREATE INDEX IF NOT EXISTS idx_lancamentos_v2_cenario
  ON financeiro_lancamentos_v2(cenario);
