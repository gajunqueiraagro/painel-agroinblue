-- ROLLBACK MANUAL DE EMERGÊNCIA — SEC-RPC-P0-01B2
-- NÃO É MIGRATION.
-- NÃO EXECUTAR AUTOMATICAMENTE.
--
-- Restaura o ACL REAL anterior ao B2: EXECUTE concedido a PUBLIC.
-- ATENÇÃO: reabrir para PUBLIC reabre o acesso para TODOS os roles que herdam de
--   PUBLIC — inclusive anon (anônimo). É exatamente a exposição que o B2 fechou.
-- NÃO usar o runbook antigo (sec_rpc_p0_01b_rollback.sql), que concede direto a anon:
--   as 11 funções nunca tiveram grant direto a anon; o baseline real é PUBLIC=EXECUTE.
-- authenticated/service_role/postgres não precisam de restauração: mantêm grant
--   explícito independente de PUBLIC (o B2 não os tocou).
-- Exige autorização explícita e registro do incidente. Nunca aplicar automaticamente.

GRANT EXECUTE ON FUNCTION public.reabrir_pilar_fechamento(uuid, text, text, text, uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.gerar_snapshot_area(uuid, date, uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_reverter_desconsideracao_extrato(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_zoot_cache(uuid, integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_zoot_cache(uuid, integer, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_zoot_cache(uuid, integer, integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_apply(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_endividamento_mensal(uuid, integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_status_pilares_fechamento(uuid, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.buscar_duplicados_retroativo(uuid, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.auditar_integridade_classificacao(uuid) TO PUBLIC;
