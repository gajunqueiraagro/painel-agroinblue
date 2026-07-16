-- ROLLBACK R3 (Migração 2 - fechamento_p1_snapshot). Destrutivo so se vazio.
-- Rodar APOS R4 (fechamento_pastos_membros referencia este snapshot).
DO $$ BEGIN
  IF (SELECT count(*) FROM public.fechamento_p1_snapshot)=0 THEN
    DROP TABLE public.fechamento_p1_snapshot;
  ELSE
    RAISE NOTICE 'fechamento_p1_snapshot contem dados — rollback destrutivo bloqueado';
  END IF;
END $$;
