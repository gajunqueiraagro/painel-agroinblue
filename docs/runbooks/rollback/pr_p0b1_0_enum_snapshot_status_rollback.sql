-- ROLLBACK R1 (Migração 0 - ENUM snapshot_status). Ultimo na ordem de rollback.
-- NI-2: detecta uso via pg_depend (nao pg_attribute); so dropa se zero dependencias
--   nao-internas; senao RAISE NOTICE. Nao reabre anon/PUBLIC.
DO $$
DECLARE v_uso int;
BEGIN
  SELECT count(*) INTO v_uso
  FROM pg_depend d
  JOIN pg_type t ON t.oid = d.refobjid
  WHERE t.typname='snapshot_status'
    AND t.typnamespace='public'::regnamespace
    AND d.deptype <> 'i';
  IF v_uso = 0 THEN
    DROP TYPE IF EXISTS public.snapshot_status;
  ELSE
    RAISE NOTICE 'snapshot_status em uso (% dependencias) — rollback do ENUM bloqueado', v_uso;
  END IF;
END $$;
