-- ROLLBACK R1 — Migration 1 (fechamento_p1). NIVEL IMEDIATO (com gate de vazio).
-- Destrutivo somente se a tabela estiver vazia. Se contiver dados (ja usada por
--   P0-B/C), o DROP e BLOQUEADO e deve-se usar o rollback posterior que preserva
--   dados. Nunca reabre grants anon/PUBLIC (a tabela nem os concede).
DO $$ BEGIN
  IF (SELECT count(*) FROM public.fechamento_p1) = 0 THEN
    DROP TABLE public.fechamento_p1;
  ELSE
    RAISE NOTICE 'fechamento_p1 contem dados — rollback destrutivo bloqueado; usar rollback posterior';
  END IF;
END $$;
