
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fechamento_pastos_fazenda_pasto_anomes_key'
  ) THEN
    ALTER TABLE fechamento_pastos
      ADD CONSTRAINT fechamento_pastos_fazenda_pasto_anomes_key
      UNIQUE (fazenda_id, pasto_id, ano_mes);
  END IF;
END $$;
