-- 20260924120000_agri_area_variedade_na_chave.sql
-- AGRI-AREA-VARIEDADE-NA-CHAVE: a variedade entra na chave única da área plantada.
--
-- ⚠ ESTE ARQUIVO VERSIONA O QUE JA' ESTA' VIVO NO PROTO. A troca foi feita pelo Chat via
--   Management API sob GO; nao se reaplica por ele. Conferido em `pg_get_constraintdef`,
--   13/09/2026: a antiga `agri_safra_area_safra_id_pasto_id_cultura_key` NAO existe mais, e a
--   nova é exatamente `UNIQUE NULLS NOT DISTINCT (safra_id, pasto_id, cultura, variedade)`.
--
-- O MOTIVO: a chave antiga impedia DUAS VARIEDADES DA MESMA CULTURA no mesmo pasto e safra —
-- amendoim OL3 e amendoim BRS 421 no Ind 01, caso real do NJ. Variedade é característica da
-- ÁREA, não da cultura, e por isso pertence à chave.
--
-- ⚠ `NULLS NOT DISTINCT` NAO E' DETALHE — é o que mantém a proteção de pé. O `UNIQUE` padrão
--   do Postgres trata NULLs como DISTINTOS, e medido antes da troca final: as 12 linhas de
--   `agri_safra_area` têm `variedade` NULA. Com o padrão, a chave nova não impediria duas
--   linhas de (safra, pasto, cultura) sem variedade — a trava que existia antes deixaria de
--   valer justamente para todo o dado que existe hoje. Com `NULLS NOT DISTINCT`, dois nulos
--   colidem: "amendoim sem variedade" duas vezes no mesmo pasto continua bloqueado, e o
--   produtor é levado a informar a variedade para distinguir as duas.
--   Disponível porque o servidor é PostgreSQL 17.6. Zero violações na troca.

alter table public.agri_safra_area drop constraint agri_safra_area_safra_id_pasto_id_cultura_key;
alter table public.agri_safra_area add constraint agri_safra_area_safra_pasto_cultura_variedade_key
  unique nulls not distinct (safra_id, pasto_id, cultura, variedade);
