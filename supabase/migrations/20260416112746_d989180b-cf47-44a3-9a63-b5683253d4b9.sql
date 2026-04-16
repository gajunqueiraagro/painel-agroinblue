-- Add mes column with default 1
ALTER TABLE public.saldos_iniciais ADD COLUMN IF NOT EXISTS mes integer NOT NULL DEFAULT 1;

-- Drop old unique constraint if exists and create new one including mes
DO $$
BEGIN
  -- Try to find and drop existing unique constraints on (fazenda_id, ano, categoria)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.saldos_iniciais'::regclass
    AND contype = 'u'
  ) THEN
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'public.saldos_iniciais'::regclass
        AND contype = 'u'
      LOOP
        EXECUTE 'ALTER TABLE public.saldos_iniciais DROP CONSTRAINT IF EXISTS ' || r.conname;
      END LOOP;
    END;
  END IF;
END $$;

-- Create new unique constraint including mes
ALTER TABLE public.saldos_iniciais
  ADD CONSTRAINT saldos_iniciais_fazenda_ano_mes_cat_uq
  UNIQUE (fazenda_id, ano, mes, categoria);