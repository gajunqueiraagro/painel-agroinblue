-- SEC-RPC-P0-PROTO-RUNTIME — Migration P0-3: helpers e leituras (23 funcoes)
-- Somente DCL. Nenhum corpo alterado nesta migration.
-- Estado observado antes (gate de catalogo): as 23 tinham EXECUTE para
--   PUBLIC, anon, authenticated e service_role.
-- Padrao aplicado a todas: revoke dos 4 roles e grant explicito do estado final.
--   O revoke previo de todos torna o resultado independente do ACL anterior
--   (idempotente) e neutraliza as DUAS origens de acesso anonimo: grant direto a
--   anon E heranca via PUBLIC (has_function_privilege('anon',...) retorna true
--   para privilegio herdado de PUBLIC — ver 20260714120000_sec_rpc_p0_01b2).
-- Assinaturas completas: REVOKE/GRANT falha com erro claro se a assinatura nao existir.
-- Sem DROP FUNCTION. Sem alteracao de owner/corpo/proconfig/policies/triggers/dados.
--
-- DELTA vs. plano inicial (divergencia confirmada em gate pre-implementacao):
--   public.get_user_cliente_ids(uuid) e public.get_user_perfil(uuid, uuid) RECEBEM
--   authenticated. Motivo: public.cancel_zoot_importacao(uuid) e SECURITY INVOKER
--   (prosecdef=false), e chamada pelo frontend como authenticated
--   (src/pages/HistoricoImportacoesZootTab.tsx) e, no caminho NAO-admin, executa
--   get_user_cliente_ids(auth.uid()) e get_user_perfil(auth.uid(), cliente_id).
--   Por ser INVOKER, o corpo roda com o privilegio do chamador: sem authenticated
--   nessas duas, um gestor_cliente receberia 42501 permission denied for function
--   ao cancelar importacao zootecnica. Admin nao regride (curto-circuito em
--   IF NOT is_admin_agroinblue). cancel_zoot_importacao NAO e alterada nesta frente.
--   get_user_cliente_ids fica SEM service_role: nenhuma Edge Function a invoca
--   (nem invoca cancel_zoot_importacao) — verificado por grep em supabase/functions/.
--   Risco residual registrado: as duas seguem executaveis por qualquer autenticado
--   com parametro controlavel. Correcao exige helpers orientados ao ator
--   (current_user_*) — dependencia bloqueada para SEC-AUTHZ-V2-PROFILES-01 Fase 1.

BEGIN;

-- ============================================================
-- Grupo 1 — authenticated (11 leituras/helpers)
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.can_close_valor_rebanho(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_close_valor_rebanho(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_close_valor_rebanho(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.can_close_valor_rebanho(uuid, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.can_close_valor_rebanho(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_auditoria_consistencia_zoot(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_auditoria_consistencia_zoot(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_auditoria_consistencia_zoot(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_auditoria_consistencia_zoot(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.fn_auditoria_consistencia_zoot(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_classificacao_candidatos_ambiguo(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_candidatos_ambiguo(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_candidatos_ambiguo(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_candidatos_ambiguo(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_candidatos_ambiguo(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_classificacao_candidatos_grupo(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_candidatos_grupo(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_candidatos_grupo(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_candidatos_grupo(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_candidatos_grupo(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_classificacao_candidatos_proximos(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_candidatos_proximos(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_candidatos_proximos(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_candidatos_proximos(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_candidatos_proximos(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_classificacao_composicao_sugerida(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_composicao_sugerida(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_composicao_sugerida(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_composicao_sugerida(uuid, uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_composicao_sugerida(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_classificacao_sistema_nao_explicado(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_sistema_nao_explicado(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_sistema_nao_explicado(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_sistema_nao_explicado(uuid, uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_sistema_nao_explicado(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_saldo_inicial_pasto(uuid, integer, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_saldo_inicial_pasto(uuid, integer, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_saldo_inicial_pasto(uuid, integer, integer, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_saldo_inicial_pasto(uuid, integer, integer, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.fn_saldo_inicial_pasto(uuid, integer, integer, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_zoot_categoria_mensal(uuid, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_zoot_categoria_mensal(uuid, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_zoot_categoria_mensal(uuid, integer, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_zoot_categoria_mensal(uuid, integer, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.fn_zoot_categoria_mensal(uuid, integer, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_anos_financeiro_v2(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_anos_financeiro_v2(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_anos_financeiro_v2(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_anos_financeiro_v2(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_anos_financeiro_v2(uuid) TO authenticated;

-- DELTA: authenticated exigido por cancel_zoot_importacao (SECURITY INVOKER).
REVOKE EXECUTE ON FUNCTION public.get_user_cliente_ids(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_cliente_ids(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_cliente_ids(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_cliente_ids(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_user_cliente_ids(uuid) TO authenticated;

-- ============================================================
-- Grupo 2 — authenticated + service_role (2)
-- ============================================================

-- authenticated: ClienteContext (rpc is_admin_agroinblue) + 12 policies sobre
--   conciliacao_bancaria_itens / extrato_bancario_v2 / transferencia_ofx_pares,
--   definidas FOR role public e avaliadas com o privilegio do chamador.
-- service_role: Edge criar-usuario, remover-membro, redefinir-senha.
REVOKE EXECUTE ON FUNCTION public.is_admin_agroinblue(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin_agroinblue(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_agroinblue(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin_agroinblue(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_agroinblue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_agroinblue(uuid) TO service_role;

-- DELTA: authenticated exigido por cancel_zoot_importacao (SECURITY INVOKER).
-- service_role: Edge criar-usuario e remover-membro (adminClient.rpc get_user_perfil).
REVOKE EXECUTE ON FUNCTION public.get_user_perfil(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_perfil(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_perfil(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_perfil(uuid, uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_user_perfil(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_perfil(uuid, uuid) TO service_role;

-- ============================================================
-- Grupo 3 — sem grant externo (10). Somente o owner (postgres) executa.
-- Chamadas apenas por outras SECURITY DEFINER owner postgres (resolvem como owner)
-- ou por triggers; nenhuma tem caller externo autenticado localizado.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.can_manage_financeiro_importacao_v2(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_financeiro_importacao_v2(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_financeiro_importacao_v2(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.can_manage_financeiro_importacao_v2(uuid) FROM service_role;

REVOKE EXECUTE ON FUNCTION public.can_manage_financeiro_lancamento_v2(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_financeiro_lancamento_v2(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_financeiro_lancamento_v2(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.can_manage_financeiro_lancamento_v2(uuid, text) FROM service_role;

REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resolver_contexto(uuid, jsonb, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resolver_contexto(uuid, jsonb, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resolver_contexto(uuid, jsonb, boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resolver_contexto(uuid, jsonb, boolean) FROM service_role;

REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resolver_subcentro(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resolver_subcentro(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resolver_subcentro(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resolver_subcentro(uuid, text) FROM service_role;

REVOKE EXECUTE ON FUNCTION public.get_anos_lancamentos(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_anos_lancamentos(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_anos_lancamentos(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_anos_lancamentos(uuid) FROM service_role;

REVOKE EXECUTE ON FUNCTION public.get_user_cliente_id(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_cliente_id(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_cliente_id(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_cliente_id(uuid) FROM service_role;

REVOKE EXECUTE ON FUNCTION public.is_cliente_member(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_cliente_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_cliente_member(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_cliente_member(uuid, uuid) FROM service_role;

REVOKE EXECUTE ON FUNCTION public.is_fazenda_member(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_fazenda_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_fazenda_member(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_fazenda_member(uuid, uuid) FROM service_role;

REVOKE EXECUTE ON FUNCTION public.resolve_transfer_destination_fazenda(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_transfer_destination_fazenda(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_transfer_destination_fazenda(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_transfer_destination_fazenda(uuid, text) FROM service_role;

REVOKE EXECUTE ON FUNCTION public.shares_fazenda(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.shares_fazenda(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.shares_fazenda(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.shares_fazenda(uuid, uuid) FROM service_role;

COMMIT;
