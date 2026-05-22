-- PR0.A · Mesa Operacional v2 · Alter financeiro_lancamentos_v2
-- Adiciona colunas (nullable na Fase A) e FK estrutural para lote de importação.

ALTER TABLE financeiro_lancamentos_v2
  ADD COLUMN IF NOT EXISTS origem_apontamento origem_apontamento_enum NULL,
  ADD COLUMN IF NOT EXISTS orfao_definitivo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS orfao_definitivo_motivo TEXT NULL,
  ADD COLUMN IF NOT EXISTS orfao_definitivo_por UUID NULL,
  ADD COLUMN IF NOT EXISTS orfao_definitivo_em TIMESTAMPTZ NULL;

DO $$ BEGIN
  ALTER TABLE financeiro_lancamentos_v2
    ADD CONSTRAINT fk_flv2_lote_importacao
    FOREIGN KEY (lote_importacao_id)
    REFERENCES financeiro_importacoes_v2(id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN others THEN
    RAISE NOTICE 'FK fk_flv2_lote_importacao não criada: %', SQLERRM;
END $$;

COMMENT ON COLUMN financeiro_lancamentos_v2.origem_apontamento IS
'Mesa Operacional v2. Origem estrutural do apontamento financeiro.
NULL permitido até PR0.D (selagem). Backfill em PR0.B. Criada PR0.A.';

COMMENT ON COLUMN financeiro_lancamentos_v2.orfao_definitivo IS
'Mesa Operacional v2. Operador marcou que este apontamento permanece sem
correspondência bancária por decisão deliberada. NÃO é erro; é estado válido.
Criada PR0.A.';

COMMENT ON COLUMN financeiro_lancamentos_v2.orfao_definitivo_motivo IS
'Mesa Operacional v2. Motivo da decisão de marcar órfão definitivo. Criada PR0.A.';

COMMENT ON COLUMN financeiro_lancamentos_v2.orfao_definitivo_por IS
'Mesa Operacional v2. UUID do usuário que marcou órfão definitivo.
Sem FK para auth.users por decisão arquitetural (acoplamento). Criada PR0.A.';

COMMENT ON COLUMN financeiro_lancamentos_v2.orfao_definitivo_em IS
'Mesa Operacional v2. Timestamp da marcação de órfão definitivo. Criada PR0.A.';

COMMENT ON CONSTRAINT fk_flv2_lote_importacao ON financeiro_lancamentos_v2 IS
'Mesa Operacional v2. Vínculo estrutural para rastreabilidade de import.
ON DELETE SET NULL — lançamento sobrevive à reversão de importação até
decisão explícita do operador. Criada PR0.A.';
