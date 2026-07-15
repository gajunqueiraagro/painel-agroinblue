-- SEC-RLS-P0-A7 — ACL anônima: zootécnico lote 2 + planejamento/patrimônio (14 relações)
--
-- Continuação de SEC-RLS-P0-A1..A6 (decisão de produto: allowlist anon = ∅).
-- Fase A (aclexplode/relacl no homolog sbwfacryawstuvhlaezm): as 14 são relkind='r',
--   RLS on, anon=8 DIRETO (grantor postgres), grantee=PUBLIC = 0, authenticated=8,
--   service_role=8. Nenhuma exclusão.
-- Gates estáticos: zero consumidores pré-login (todos os .from sob o gate do AppRouter;
--   nenhum acima do gate/AuthPage; nenhum em nível de módulo; nenhum em Edge Function).
--
-- Ação: REVOKE ALL do role anon, por tabela, nas 14 tabelas do lote.
-- PRESERVADOS (não referenciados): authenticated, service_role, postgres.
-- NÃO faz: policies, funções, helpers, triggers, auth, frontend, Edge Functions,
--   default privileges, PUBLIC, outras tabelas. Sem CASCADE. Sem REVOKE global.
-- REVOKE é DCL, idempotente.

BEGIN;

-- Zootécnico lote 2
REVOKE ALL ON TABLE public.valor_rebanho_mensal             FROM anon;
REVOKE ALL ON TABLE public.valor_rebanho_meta               FROM anon;
REVOKE ALL ON TABLE public.valor_rebanho_meta_itens         FROM anon;
REVOKE ALL ON TABLE public.valor_rebanho_meta_validada      FROM anon;
REVOKE ALL ON TABLE public.valor_rebanho_realizado_validado FROM anon;
REVOKE ALL ON TABLE public.meta_valor_rebanho_precos        FROM anon;
REVOKE ALL ON TABLE public.meta_valor_rebanho_status        FROM anon;
REVOKE ALL ON TABLE public.zoot_mensal_cache                FROM anon;

-- Planejamento/patrimônio
REVOKE ALL ON TABLE public.meta_aprovacoes                  FROM anon;
REVOKE ALL ON TABLE public.meta_preco_mercado               FROM anon;
REVOKE ALL ON TABLE public.meta_preco_mercado_status        FROM anon;
REVOKE ALL ON TABLE public.meta_projetos_investimento       FROM anon;
REVOKE ALL ON TABLE public.meta_versoes                     FROM anon;
REVOKE ALL ON TABLE public.planejamento_area_meta           FROM anon;

COMMIT;
