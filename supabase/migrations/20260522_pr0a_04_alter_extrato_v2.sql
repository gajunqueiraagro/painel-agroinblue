-- PR0.A · Mesa Operacional v2 · Alter extrato_bancario_v2
-- Adiciona flags antifraude estruturais, marcadores de órfão e soft delete.

ALTER TABLE extrato_bancario_v2
  ADD COLUMN IF NOT EXISTS flag_suspeita_valor BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_suspeita_fornecedor BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_suspeita_motivo TEXT NULL,
  ADD COLUMN IF NOT EXISTS orfao_definitivo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS orfao_definitivo_motivo TEXT NULL,
  ADD COLUMN IF NOT EXISTS orfao_definitivo_por UUID NULL,
  ADD COLUMN IF NOT EXISTS orfao_definitivo_em TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS cancelado_por UUID NULL,
  ADD COLUMN IF NOT EXISTS cancelado_motivo TEXT NULL;

COMMENT ON COLUMN extrato_bancario_v2.flag_suspeita_valor IS
'Mesa Operacional v2. Valor fora de padrão histórico (calc estrutural via
desvio padrão, sem ML). Calibrado em PR6. Criada PR0.A.';

COMMENT ON COLUMN extrato_bancario_v2.flag_suspeita_fornecedor IS
'Mesa Operacional v2. Favorecido nunca usado antes desta movimentação.
Calc estrutural via histórico. Calibrado em PR6. Criada PR0.A.';

COMMENT ON COLUMN extrato_bancario_v2.flag_suspeita_motivo IS
'Mesa Operacional v2. Texto livre detalhando razão das flags de suspeita. Criada PR0.A.';

COMMENT ON COLUMN extrato_bancario_v2.orfao_definitivo IS
'Mesa Operacional v2. Operador marcou que este movimento bancário permanece
sem apontamento por decisão deliberada (ex: tarifa não declarável). Criada PR0.A.';

COMMENT ON COLUMN extrato_bancario_v2.cancelado_em IS
'Mesa Operacional v2. Soft delete. DELETE físico bloqueado por trigger.
Reversibilidade obrigatória (princípio 8 da Constituição). Criada PR0.A.';
