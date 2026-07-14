-- SEC-RLS-P0-A2 — Segundo lote ACL anônima: tabelas financeiras sensíveis
--
-- Continuação do canário SEC-RLS-P0-A1 (mesma decisão de produto: allowlist anon = ∅).
-- Fase A (aclexplode/relacl no homolog sbwfacryawstuvhlaezm): as 5 tabelas são
--   relkind='r' (tabelas), RLS on com policies USING(true), e têm
--   relacl = {postgres,anon,authenticated,service_role = arwdDxtm/postgres}.
--   Privilégio de anon é DIRETO (grantor postgres); grantee=PUBLIC = 0 nas 5.
--   Logo REVOKE ... FROM anon é EFETIVO (não há herança de PUBLIC nesta camada).
-- Gates estáticos+dinâmicos: zero consumidores pré-login (todos os .from estão sob o
--   gate de auth do AppRouter; nenhum acima do gate/AuthPage; nenhum em nível de módulo;
--   nenhum em Edge Function). Validação deslogada no frontend homolog: 0 requisições
--   REST às 5 tabelas.
--
-- Ação: REVOKE ALL do role anon, por tabela, nas CINCO tabelas do lote.
--   'ALL' é simétrico ao GRANT ALL original (arwdDxtm) e remove somente as ACEs de anon.
-- PRESERVADOS (não referenciados): authenticated, service_role, postgres.
-- NÃO faz: policies, funções, helpers, triggers, auth, frontend, Edge Functions,
--   default privileges, PUBLIC, outras tabelas. Sem CASCADE. Sem REVOKE global.
-- REVOKE é DCL, idempotente.

BEGIN;

REVOKE ALL ON TABLE public.financeiro_contas_bancarias FROM anon;
REVOKE ALL ON TABLE public.financiamentos              FROM anon;
REVOKE ALL ON TABLE public.financeiro_saldos_bancarios FROM anon;
REVOKE ALL ON TABLE public.financeiro_resumo_caixa     FROM anon;
REVOKE ALL ON TABLE public.financeiro_dividendos       FROM anon;

COMMIT;
