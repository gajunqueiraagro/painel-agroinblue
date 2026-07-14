-- SEC-RPC-P0-01B2 — Fix-forward da contenção anônima via PUBLIC
-- Continuidade de SEC-RPC-P0-01B (migration 20260714114527 no proto: no-op de
--   segurança). Causa-raiz: o EXECUTE de anon nas 11 RPCs não vinha de grant direto
--   a anon, e sim de EXECUTE concedido a PUBLIC. Postgres: has_function_privilege
--   ('anon',...) retorna true também quando o privilégio é herdado de PUBLIC, então
--   REVOKE ... FROM anon foi inócuo (não havia entrada anon no proacl; PUBLIC intacto).
--   proacl observado nas 11: {=X/postgres, postgres=X, authenticated=X, service_role=X}
--   ( "=X" == PUBLIC=EXECUTE ).
-- Ação: REVOKE EXECUTE FROM PUBLIC, anon — neutraliza as DUAS origens possíveis
--   (herança por PUBLIC + eventual grant direto a anon), por assinatura exata.
-- authenticated / service_role / postgres PRESERVADOS: têm grant EXPLÍCITO e
--   independente de PUBLIC no proacl das 11; REVOKE de PUBLIC/anon não os afeta
--   (sem risco de deny-all para eles). Verificado por aclexplode no gate pré B2.
-- is_admin_agroinblue e helpers de identidade (get_user_*/shares_fazenda/
--   is_cliente_member/is_fazenda_member) NÃO são tocados: usados por policies sobre
--   role public; revogá-los pode trocar deny limpo por erro de função. Pacote G.
-- Sem CREATE/ALTER/DROP, sem tocar corpo/owner/proconfig/policies/triggers/dados.
-- REVOKE é DCL, não DML. Idempotente.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.reabrir_pilar_fechamento(uuid, text, text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.gerar_snapshot_area(uuid, date, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_reverter_desconsideracao_extrato(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.refresh_zoot_cache(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.refresh_zoot_cache(uuid, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.refresh_zoot_cache(uuid, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_apply(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_endividamento_mensal(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_status_pilares_fechamento(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.buscar_duplicados_retroativo(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auditar_integridade_classificacao(uuid) FROM PUBLIC, anon;

COMMIT;
