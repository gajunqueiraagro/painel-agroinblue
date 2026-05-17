-- Aplicado manualmente no proto (binbcdfbisgscrifztia) em 2026-05-17 11:43 UTC.
-- Este arquivo é apenas versionamento histórico — não re-aplicar.
-- Resultado: 837 → 669 registros; UNIQUE constraint ativa.

-- A1: Remove duplicatas mantendo o registro oficial mais recente
-- Critério: updated_at DESC NULLS LAST, fallback id DESC
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY fazenda_id, ano_mes, categoria
      ORDER BY updated_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM meta_gmd_mensal
)
DELETE FROM meta_gmd_mensal
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- A2: UNIQUE constraint estrutural
ALTER TABLE meta_gmd_mensal
ADD CONSTRAINT meta_gmd_mensal_unique_categoria_mes_fazenda
UNIQUE (fazenda_id, ano_mes, categoria);
