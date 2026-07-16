-- PR-P1-SNAPSHOT-CONJUNTO-P0B1 — Migração 0: ENUM snapshot_status
-- Idempotente (guarda por pg_type). Rollback via pg_depend (NI-2).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='snapshot_status') THEN
    CREATE TYPE public.snapshot_status AS ENUM ('vigente','substituido','invalidado');
  END IF;
END $$;
