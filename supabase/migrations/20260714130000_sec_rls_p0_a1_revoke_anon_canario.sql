-- SEC-RLS-P0-A1 — Canário ACL anônima: fechamento das 5 tabelas comprovadas
--
-- Evidência (SECURITY-RLS-01B): anon (Publishable Key, sem login) lê cross-tenant
--   clientes, cliente_membros, fazendas e financeiro_lancamentos_v2; fazenda_membros
--   retorna 0 por RLS (auth.uid()=user_id), mas mantém o grant anon aberto.
-- Evidência (FASE A, aclexplode/relacl no homolog): as 5 tabelas têm
--   relacl = {postgres,anon,authenticated,service_role = arwdDxtm/postgres}.
--   O privilégio de anon é DIRETO (grantor postgres), NÃO herdado de PUBLIC
--   (aclexplode: grantee=PUBLIC = 0 nas 5). Logo REVOKE ... FROM anon é EFETIVO
--   aqui — ao contrário do SEC-RPC-P0-01B, cujo vazamento vinha de PUBLIC em FUNÇÃO.
--
-- Decisão de produto (SEC-RLS-P0-A): allowlist anônima de relações = ∅. O AGROinBLUE
--   não tem conteúdo/config de negócio público antes do login; o Supabase Auth não
--   depende de grant anon nas tabelas public.
--
-- Ação: REVOKE ALL do role anon, por tabela, nas CINCO tabelas do canário.
--   'ALL' é simétrico ao GRANT ALL original (arwdDxtm) e remove somente as ACEs de
--   anon — nenhum outro grantee é afetado.
-- PRESERVADOS integralmente (não referenciados aqui): authenticated, service_role,
--   postgres. A isolação por tenant do usuário logado é feita por RLS (ADR-2026-13),
--   não por ACL; remover authenticated causaria deny-all (ADR-2026-15).
-- NÃO faz: policies, funções, helpers, triggers, auth, frontend, Edge Functions,
--   default privileges, PUBLIC (já é 0 em relações), outras tabelas. Sem CASCADE.
--   Sem REVOKE global.
-- REVOKE é DCL (controle de privilégio), não DML. Idempotente.

BEGIN;

REVOKE ALL ON TABLE public.clientes                  FROM anon;
REVOKE ALL ON TABLE public.cliente_membros           FROM anon;
REVOKE ALL ON TABLE public.fazendas                  FROM anon;
REVOKE ALL ON TABLE public.fazenda_membros           FROM anon;
REVOKE ALL ON TABLE public.financeiro_lancamentos_v2 FROM anon;

COMMIT;
