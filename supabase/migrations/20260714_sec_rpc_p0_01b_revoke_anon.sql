-- SEC-RPC-P0-01B — Contenção da superfície RPC anônima prioritária
-- Incidente: 11 funções SECURITY DEFINER (owner=postgres) executáveis por anon,
--   sem call-site anônimo legítimo. Permitiam mutação de estado soberano
--   (fechamento/snapshot/extrato/cache) e leitura de dados financeiros/operacionais
--   sensíveis por chamador não autenticado. Uma função SECURITY DEFINER executa com
--   os privilégios do owner; o owner possui atributos que contornam RLS.
-- Ação: REVOKE EXECUTE FROM anon, por assinatura exata. Nada além disso.
-- authenticated PRESERVADO: todo fluxo real do frontend é autenticado (call-sites
--   mapeados em SEC-RPC-P0-01A); revogar authenticated quebraria a aplicação.
-- is_admin_agroinblue NÃO é tocada: é referenciada por policies sobre role public
--   (conciliacao_bancaria_itens/extrato_bancario_v2/transferencia_ofx_pares);
--   revogá-la causaria deny-all. Fora de escopo (pacote G).
-- Helpers de identidade (get_user_cliente_ids/get_user_perfil/shares_fazenda) NÃO
--   são tocados neste pacote.
-- Correção de autorização/autoria/search_path NÃO entra aqui (pacotes C–F).
-- REVOKE é comando de controle de privilégios (DCL), não DML. Idempotente.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.reabrir_pilar_fechamento(uuid, text, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.gerar_snapshot_area(uuid, date, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_reverter_desconsideracao_extrato(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_zoot_cache(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_zoot_cache(uuid, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_zoot_cache(uuid, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_apply(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_endividamento_mensal(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_status_pilares_fechamento(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.buscar_duplicados_retroativo(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.auditar_integridade_classificacao(uuid) FROM anon;

COMMIT;
