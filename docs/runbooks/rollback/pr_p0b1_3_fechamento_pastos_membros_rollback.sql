-- ROLLBACK R4 (Migração 3 - fechamento_pastos_membros). Destrutivo so se vazio.
DO $$ BEGIN
  IF (SELECT count(*) FROM public.fechamento_pastos_membros)=0 THEN
    DROP TABLE public.fechamento_pastos_membros;
  ELSE
    RAISE NOTICE 'fechamento_pastos_membros contem dados — rollback destrutivo bloqueado';
  END IF;
END $$;
