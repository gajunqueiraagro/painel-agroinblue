-- PR1-MESA-SESSAO-TIPO — desacopla mesa_sessao do OFX para suportar sessão de classificação.
-- Migration only. Idempotente. Não toca RPCs, front, dados, conciliação ou staging.
-- Dry-run (BEGIN/ROLLBACK) com 3 asserts validado em proto antes deste commit.

BEGIN;

-- 1. discriminador de tipo (default 'ofx' faz backfill das linhas existentes)
ALTER TABLE mesa_sessao
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'ofx';

-- 2. domínio do tipo
ALTER TABLE mesa_sessao DROP CONSTRAINT IF EXISTS chk_mesa_sessao_tipo;
ALTER TABLE mesa_sessao ADD CONSTRAINT chk_mesa_sessao_tipo
  CHECK (tipo IN ('ofx','classificacao'));

-- 3 + 4. afrouxar NOT NULL (classificação não tem conta única nem OFX)
ALTER TABLE mesa_sessao ALTER COLUMN conta_bancaria_id DROP NOT NULL;
ALTER TABLE mesa_sessao ALTER COLUMN ofx_extratos_ids  DROP NOT NULL;

-- 5. consistência por tipo
ALTER TABLE mesa_sessao DROP CONSTRAINT IF EXISTS chk_mesa_sessao_tipo_consistencia;
ALTER TABLE mesa_sessao ADD CONSTRAINT chk_mesa_sessao_tipo_consistencia CHECK (
  (tipo = 'ofx' AND conta_bancaria_id IS NOT NULL AND ofx_extratos_ids IS NOT NULL)
  OR
  (tipo = 'classificacao')
);

COMMIT;
