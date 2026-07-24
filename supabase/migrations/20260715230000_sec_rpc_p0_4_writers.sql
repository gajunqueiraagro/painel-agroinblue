-- SEC-RPC-P0-PROTO-RUNTIME — Migration P0-4: writers (14 funcoes)
-- Somente DCL. Nenhum corpo alterado nesta migration.
-- Classificacao writer confirmada por catalogo (prosrc com INSERT/UPDATE/DELETE),
--   nao por nome: 10 writers -> authenticated, 4 writers -> sem grant externo.
-- Corpos e guards internos atuais PRESERVADOS integralmente: esta frente remove
--   exposicao anonima, nao redesenha autorizacao. As writers que ja validam o ator
--   continuam validando; as que nao validam seguem sem validacao interna e passam a
--   depender do grant (authenticated) + guard proprio existente.
-- Padrao: revoke dos 4 roles e grant explicito do estado final (idempotente).
-- Assinaturas completas: falha com erro claro se a assinatura nao existir.
-- Sem DROP FUNCTION. Sem alteracao de owner/corpo/policies/triggers/dados de negocio.

BEGIN;

-- ============================================================
-- Grupo 1 — writers com authenticated (10)
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.cancel_financeiro_importacao_v2(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_financeiro_importacao_v2(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_financeiro_importacao_v2(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_financeiro_importacao_v2(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.cancel_financeiro_importacao_v2(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_classificacao_apply_row(uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_apply_row(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_apply_row(uuid, boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_apply_row(uuid, boolean) FROM service_role;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_apply_row(uuid, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_classificacao_desfazer_grupo(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_desfazer_grupo(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_desfazer_grupo(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_desfazer_grupo(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_desfazer_grupo(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_classificacao_desfazer_proximos(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_desfazer_proximos(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_desfazer_proximos(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_desfazer_proximos(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_desfazer_proximos(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_classificacao_editar_proposto(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_editar_proposto(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_editar_proposto(uuid, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_editar_proposto(uuid, jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_editar_proposto(uuid, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_classificacao_populate_staging(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_populate_staging(uuid, uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_populate_staging(uuid, uuid, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_populate_staging(uuid, uuid, jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_populate_staging(uuid, uuid, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resetar_proposto(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resetar_proposto(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resetar_proposto(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resetar_proposto(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_resetar_proposto(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resolver_grupo(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resolver_grupo(uuid, uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resolver_grupo(uuid, uuid[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resolver_grupo(uuid, uuid[]) FROM service_role;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_resolver_grupo(uuid, uuid[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resolver_proximos(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resolver_proximos(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resolver_proximos(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resolver_proximos(uuid, uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_resolver_proximos(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_classificacao_reverter_row(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_reverter_row(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_reverter_row(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_reverter_row(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_reverter_row(uuid) TO authenticated;

-- ============================================================
-- Grupo 2 — writers sem grant externo (4). Somente o owner (postgres) executa.
-- Chamadas apenas por outras SECURITY DEFINER owner postgres:
--   fn_classificacao_resolver_ambiguo / _desfazer_ambiguo / _reresolver_sessao /
--   _reresolver_match_sessao nao possuem caller externo autenticado localizado.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.fn_classificacao_desfazer_ambiguo(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_desfazer_ambiguo(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_desfazer_ambiguo(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_desfazer_ambiguo(uuid) FROM service_role;

REVOKE EXECUTE ON FUNCTION public.fn_classificacao_reresolver_match_sessao(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_reresolver_match_sessao(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_reresolver_match_sessao(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_reresolver_match_sessao(uuid) FROM service_role;

REVOKE EXECUTE ON FUNCTION public.fn_classificacao_reresolver_sessao(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_reresolver_sessao(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_reresolver_sessao(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_reresolver_sessao(uuid) FROM service_role;

REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resolver_ambiguo(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resolver_ambiguo(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resolver_ambiguo(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_resolver_ambiguo(uuid, uuid) FROM service_role;

COMMIT;
