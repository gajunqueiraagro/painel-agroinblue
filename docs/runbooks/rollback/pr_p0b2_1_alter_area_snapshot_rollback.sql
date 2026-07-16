-- ROLLBACK R1 (Migração 1 - ALTER fechamento_area_snapshot). Ultimo na ordem de rollback.
-- Gate de uso: so remove as colunas se NENHUMA linha estiver vinculada a snapshot
--   (fechamento_p1_snapshot_id IS NOT NULL); senao RAISE NOTICE. Nao reabre anon/PUBLIC.
DO $$ BEGIN
  IF (SELECT count(*) FROM public.fechamento_area_snapshot WHERE fechamento_p1_snapshot_id IS NOT NULL)=0 THEN
    ALTER TABLE public.fechamento_area_snapshot
      DROP COLUMN IF EXISTS fechamento_p1_snapshot_id,
      DROP COLUMN IF EXISTS schema_version;
  ELSE
    RAISE NOTICE 'fechamento_p1_snapshot_id em uso — rollback de coluna bloqueado';
  END IF;
END $$;
