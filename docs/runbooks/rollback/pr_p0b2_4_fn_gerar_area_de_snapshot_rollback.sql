-- ROLLBACK R4 (Migração 4 - fn_gerar_area_de_snapshot). Rodar APOS R5 (a fachada
--   anterior nao chama esta funcao interna, entao R5 ja removeu o unico caller).
DROP FUNCTION IF EXISTS public.fn_gerar_area_de_snapshot(uuid);
