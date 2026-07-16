-- PR-P1-SNAPSHOT-AREA-P0B2 — Migração 1: vincula fechamento_area_snapshot ao conjunto
-- ALTER aditivo (colunas nullable/com default). fechamento_p1_snapshot_id NULL = LEGADO.

ALTER TABLE public.fechamento_area_snapshot
  ADD COLUMN IF NOT EXISTS fechamento_p1_snapshot_id uuid NULL
    REFERENCES public.fechamento_p1_snapshot(id),
  ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS ix_fas_p1snap
  ON public.fechamento_area_snapshot(fechamento_p1_snapshot_id);
COMMENT ON COLUMN public.fechamento_area_snapshot.fechamento_p1_snapshot_id IS
  'Vinculo ao conjunto operacional (P0-B.1). NULL = LEGADO (pre-P0-B.2). Leitura vigente exige este vinculo apontando snapshot status=vigente.';
COMMENT ON COLUMN public.fechamento_area_snapshot.schema_version IS
  'Versao da ESTRUTURA do snapshot de area. Modelo 1 = 1.';
