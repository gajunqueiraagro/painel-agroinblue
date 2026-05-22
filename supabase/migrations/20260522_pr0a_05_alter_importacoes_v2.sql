-- PR0.A · Mesa Operacional v2 · Alter financeiro_importacoes_v2
-- Adiciona owner, hash de arquivo para dedup e soft delete.

ALTER TABLE financeiro_importacoes_v2
  ADD COLUMN IF NOT EXISTS hash_arquivo TEXT NULL,
  ADD COLUMN IF NOT EXISTS owner_user_id UUID NULL,
  ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS cancelado_por UUID NULL,
  ADD COLUMN IF NOT EXISTS cancelado_motivo TEXT NULL;

COMMENT ON COLUMN financeiro_importacoes_v2.hash_arquivo IS
'Mesa Operacional v2. Hash SHA-256 do conteúdo do arquivo importado.
Permite dedup por arquivo inteiro (independente do nome). Criada PR0.A.';

COMMENT ON COLUMN financeiro_importacoes_v2.owner_user_id IS
'Mesa Operacional v2. Usuário responsável pela importação.
Sem FK para auth.users (acoplamento). Criada PR0.A.';

COMMENT ON COLUMN financeiro_importacoes_v2.cancelado_em IS
'Mesa Operacional v2. Soft delete da importação. Reverter importação cancela
em cascata os lançamentos derivados (via RPC futura). Criada PR0.A.';
