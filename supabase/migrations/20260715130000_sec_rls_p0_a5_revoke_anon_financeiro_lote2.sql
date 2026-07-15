-- SEC-RLS-P0-A5 — ACL anônima: financeiro restante (lote 2, 16 relações)
--
-- Continuação de SEC-RLS-P0-A1..A4 (decisão de produto: allowlist anon = ∅).
-- Reconciliação: a lista candidata tinha 17 nomes; 'fechamento_pasto' (singular) NÃO
--   EXISTE no catálogo (só existem fechamento_pasto_itens e fechamento_pastos) → excluído
--   por inexistência, sem substituição. Lote final = 16.
-- Fase A (aclexplode/relacl no homolog sbwfacryawstuvhlaezm): as 16 são relkind='r',
--   anon=8 DIRETO (grantor postgres), grantee=PUBLIC = 0, authenticated=8, service_role=8.
--   Obs.: fechamento_area_snapshot tem RLS off (snapshot financeiro; REVOKE anon fecha
--   independentemente de RLS).
-- Gates estáticos: zero consumidores pré-login (todos os .from sob o gate do AppRouter;
--   nenhum acima do gate/AuthPage; nenhum em nível de módulo; nenhum em Edge Function).
--
-- Ação: REVOKE ALL do role anon, por tabela, nas 16 tabelas do lote.
-- PRESERVADOS (não referenciados): authenticated, service_role, postgres.
-- NÃO faz: policies, funções, helpers, triggers, auth, frontend, Edge Functions,
--   default privileges, PUBLIC, outras tabelas. Sem CASCADE. Sem REVOKE global.
-- REVOKE é DCL, idempotente.

BEGIN;

REVOKE ALL ON TABLE public.bancos_referencia              FROM anon;
REVOKE ALL ON TABLE public.competencia_fechamento         FROM anon;
REVOKE ALL ON TABLE public.reclassificacoes               FROM anon;
REVOKE ALL ON TABLE public.planejamento_financeiro        FROM anon;
REVOKE ALL ON TABLE public.valor_rebanho_fechamento       FROM anon;
REVOKE ALL ON TABLE public.valor_rebanho_fechamento_itens FROM anon;
REVOKE ALL ON TABLE public.fechamento_area_snapshot       FROM anon;
REVOKE ALL ON TABLE public.fechamento_execucoes           FROM anon;
REVOKE ALL ON TABLE public.fechamento_executivo           FROM anon;
REVOKE ALL ON TABLE public.fechamento_graficos            FROM anon;
REVOKE ALL ON TABLE public.fechamento_indicadores         FROM anon;
REVOKE ALL ON TABLE public.fechamento_pasto_itens         FROM anon;
REVOKE ALL ON TABLE public.fechamento_pastos              FROM anon;
REVOKE ALL ON TABLE public.fechamento_reaberturas_log     FROM anon;
REVOKE ALL ON TABLE public.fechamento_textos              FROM anon;
REVOKE ALL ON TABLE public.fechamentos_executivos         FROM anon;

COMMIT;
