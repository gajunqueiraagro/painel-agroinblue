-- SEC-RLS-P0-A3 — Terceiro lote ACL anônima: tabelas financeiras sensíveis
--
-- Continuação de SEC-RLS-P0-A1/A2 (mesma decisão de produto: allowlist anon = ∅).
-- Seleção (fonte-verdade = catálogo ao vivo; não existe rows.json/01A no repo): 5
--   relações do módulo financeiro, uma por prioridade — plano de contas, fechamentos,
--   fornecedores, centros de custo, importações financeiras.
-- Fase A (aclexplode/relacl no homolog sbwfacryawstuvhlaezm): as 5 são relkind='r'
--   (tabelas), RLS on com policies SELECT USING(true), relacl
--   {postgres,anon,authenticated,service_role = arwdDxtm/postgres}. anon é DIRETO
--   (grantor postgres); grantee=PUBLIC = 0 → REVOKE ... FROM anon é EFETIVO.
-- Gates estáticos: zero consumidores pré-login (todos os .from sob o gate do AppRouter;
--   nenhum acima do gate/AuthPage; nenhum em nível de módulo; nenhum em Edge Function).
--
-- Ação: REVOKE ALL do role anon, por tabela, nas CINCO tabelas do lote.
--   'ALL' é simétrico ao GRANT ALL original (arwdDxtm) e remove somente as ACEs de anon.
-- PRESERVADOS (não referenciados): authenticated, service_role, postgres.
-- NÃO faz: policies, funções, helpers, triggers, auth, frontend, Edge Functions,
--   default privileges, PUBLIC, outras tabelas. Sem CASCADE. Sem REVOKE global.
-- REVOKE é DCL, idempotente.

BEGIN;

REVOKE ALL ON TABLE public.financeiro_plano_contas   FROM anon;
REVOKE ALL ON TABLE public.financeiro_fechamentos    FROM anon;
REVOKE ALL ON TABLE public.financeiro_fornecedores   FROM anon;
REVOKE ALL ON TABLE public.financeiro_centros_custo  FROM anon;
REVOKE ALL ON TABLE public.financeiro_importacoes_v2 FROM anon;

COMMIT;
