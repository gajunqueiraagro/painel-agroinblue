-- SEC-RLS-P0-A11 — ACL anônima: lote final de identidade (profiles + admin_agroinblue)
--
-- Fecha SOMENTE o acesso anon (por ACL) das 2 tabelas. NÃO altera policies, RLS,
--   funções/helpers, triggers, auth.users, security_invoker, frontend ou Edge Functions.
-- Fase A/B (medido no homolog sbwfacryawstuvhlaezm, não presumido das ADRs):
--   * ambas relkind='r', owner=postgres, RLS ON, anon=8 DIRETO, PUBLIC=0, authenticated=8,
--     service_role=8, postgres=8.
--   * profiles: 0 linhas, 0 duplicidade por user_id; policy profiles_all=ALL USING(true)
--     (permissiva); espelho de exibição (ADR-08); escrita por handle_new_user (SECDEF),
--     que NÃO está ligada a nenhum trigger em auth.users (dormente).
--   * admin_agroinblue: 0 linhas (colunas user_id, created_at); policy só SELECT self
--     (auth.uid()=user_id). NÃO é a fonte vigente de admin: is_admin_agroinblue() (SECDEF)
--     lê cliente_membros, NÃO esta tabela; nenhuma função consulta a tabela. Vestigial.
-- Fase C (estática): profiles tem 3 consumidores .from (useLancamentos, AuditoriaTab,
--   AcessosTab) — todos sob o gate (pós-login); admin_agroinblue tem 0 consumidor frontend.
--   0 acima do gate, 0 em nível de módulo. Edge (criar-usuario/redefinir-senha/
--   remover-membro/reset-boitel-teste) referencia via SERVICE_ROLE_KEY (imune). Login/
--   bootstrap não dependem destas tabelas (admin via is_admin_agroinblue→cliente_membros).
--   Nenhum fluxo legítimo usa o papel anon.
--
-- Ação: REVOKE ALL do role anon nas 2 tabelas.
-- PRESERVADOS (não referenciados): authenticated, service_role, postgres.
-- Sem CASCADE. Sem REVOKE global. Sem PUBLIC. Sem default privileges. REVOKE é DCL, idempotente.

BEGIN;

REVOKE ALL ON TABLE public.profiles         FROM anon;
REVOKE ALL ON TABLE public.admin_agroinblue FROM anon;

COMMIT;
