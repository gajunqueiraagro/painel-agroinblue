-- ROLLBACK MANUAL DE EMERGÊNCIA
-- NÃO É MIGRATION.
-- NÃO EXECUTAR AUTOMATICAMENTE.
-- Reabre acesso anônimo às RPCs contidas pela SEC-RPC-P0-01B.
-- Exige autorização explícita e registro do incidente.

GRANT EXECUTE ON FUNCTION public.reabrir_pilar_fechamento(uuid, text, text, text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.gerar_snapshot_area(uuid, date, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_reverter_desconsideracao_extrato(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.refresh_zoot_cache(uuid, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.refresh_zoot_cache(uuid, integer, text) TO anon;
GRANT EXECUTE ON FUNCTION public.refresh_zoot_cache(uuid, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_apply(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_endividamento_mensal(uuid, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_status_pilares_fechamento(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.buscar_duplicados_retroativo(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.auditar_integridade_classificacao(uuid) TO anon;
