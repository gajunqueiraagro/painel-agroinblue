-- ROLLBACK M9 (fn_ajustes_sugeridos_mes). Funcao NOVA -> drop puro. Nao reabre anon/PUBLIC.
DROP FUNCTION IF EXISTS
  public.fn_ajustes_sugeridos_mes(uuid, text);
