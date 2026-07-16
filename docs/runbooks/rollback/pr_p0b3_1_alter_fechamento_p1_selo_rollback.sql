-- ROLLBACK R1 (Migração 1 - selo). Ultimo na ordem de rollback. Gate de uso: so remove
--   as colunas se NENHUM selo estiver preenchido; senao RAISE NOTICE. Nao reabre grants.
DO $$ BEGIN
  IF (SELECT count(*) FROM public.fechamento_p1
       WHERE conjunto_oficializado_snapshot_id IS NOT NULL
          OR area_oficializada_snapshot_id IS NOT NULL
          OR oficializado_em IS NOT NULL)=0 THEN
    ALTER TABLE public.fechamento_p1
      DROP COLUMN IF EXISTS conjunto_oficializado_snapshot_id,
      DROP COLUMN IF EXISTS area_oficializada_snapshot_id,
      DROP COLUMN IF EXISTS area_oficializada_payload,
      DROP COLUMN IF EXISTS area_oficializada_schema_version,
      DROP COLUMN IF EXISTS oficializado_em,
      DROP COLUMN IF EXISTS oficializado_por;
  ELSE
    RAISE NOTICE 'selo em uso — rollback de colunas bloqueado';
  END IF;
END $$;
