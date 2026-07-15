-- SEC-RLS-P0-A6 — ACL anônima: zootécnico (lote 1, 14 relações)
--
-- Continuação de SEC-RLS-P0-A1..A5 (decisão de produto: allowlist anon = ∅).
-- Fase A (aclexplode/relacl no homolog sbwfacryawstuvhlaezm): as 14 são relkind='r',
--   RLS on, anon=8 DIRETO (grantor postgres), grantee=PUBLIC = 0, authenticated=8,
--   service_role=8. Nenhuma exclusão.
-- Gates estáticos: zero consumidores pré-login (todos os .from sob o gate do AppRouter;
--   nenhum acima do gate/AuthPage; nenhum em nível de módulo). Edge: reset-boitel-teste
--   toca boitel_* via SERVICE_ROLE_KEY (imune); extract-caderno cita 'categorias' apenas
--   no prompt de extração (não é query, sem client Supabase). Nenhuma Edge usa o papel anon.
--
-- Ação: REVOKE ALL do role anon, por tabela, nas 14 tabelas do lote.
-- PRESERVADOS (não referenciados): authenticated, service_role, postgres.
-- NÃO faz: policies, funções, helpers, triggers, auth, frontend, Edge Functions,
--   default privileges, PUBLIC, outras tabelas. Sem CASCADE. Sem REVOKE global.
-- REVOKE é DCL, idempotente.

BEGIN;

REVOKE ALL ON TABLE public.boitel_adiantamentos          FROM anon;
REVOKE ALL ON TABLE public.boitel_lotes                  FROM anon;
REVOKE ALL ON TABLE public.boitel_operacoes              FROM anon;
REVOKE ALL ON TABLE public.boitel_planejamento           FROM anon;
REVOKE ALL ON TABLE public.boitel_planejamento_historico FROM anon;
REVOKE ALL ON TABLE public.categorias                    FROM anon;
REVOKE ALL ON TABLE public.categorias_rebanho            FROM anon;
REVOKE ALL ON TABLE public.cfg_categoria_parametros      FROM anon;
REVOKE ALL ON TABLE public.pasto_condicoes               FROM anon;
REVOKE ALL ON TABLE public.pasto_geometrias              FROM anon;
REVOKE ALL ON TABLE public.pasto_movimentacoes           FROM anon;
REVOKE ALL ON TABLE public.pastos                        FROM anon;
REVOKE ALL ON TABLE public.meta_gmd_mensal               FROM anon;
REVOKE ALL ON TABLE public.meta_parametros_nutricao      FROM anon;

COMMIT;
