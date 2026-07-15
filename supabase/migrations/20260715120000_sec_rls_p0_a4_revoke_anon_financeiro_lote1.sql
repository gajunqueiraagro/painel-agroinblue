-- SEC-RLS-P0-A4 — Escalada ACL anônima: financeiro restante (lote 1, 15 relações)
--
-- Continuação de SEC-RLS-P0-A1/A2/A3 (decisão de produto: allowlist anon = ∅).
-- Fonte-verdade = catálogo ao vivo do homolog sbwfacryawstuvhlaezm (rows.json/01A não
--   existe no repo). Fase 1 (aclexplode/relacl): as 15 são relkind='r', anon=8 DIRETO
--   (grantor postgres), grantee=PUBLIC = 0, authenticated=8, service_role=8.
-- Gates estáticos: zero consumidores pré-login (todos os .from sob o gate do AppRouter;
--   nenhum acima do gate/AuthPage; nenhum em nível de módulo). A Edge Function
--   reset-boitel-teste referencia lancamentos/financeiros mas usa SERVICE_ROLE_KEY
--   (imune ao REVOKE anon; ação pós-auth).
--
-- Ação: REVOKE ALL do role anon, por tabela, nas 15 tabelas do lote.
-- PRESERVADOS (não referenciados): authenticated, service_role, postgres.
-- NÃO faz: policies, funções, helpers, triggers, auth, frontend, Edge Functions,
--   default privileges, PUBLIC, outras tabelas. Sem CASCADE. Sem REVOKE global.
-- REVOKE é DCL, idempotente.

BEGIN;

REVOKE ALL ON TABLE public.financeiro_lancamentos          FROM anon;
REVOKE ALL ON TABLE public.lancamentos                     FROM anon;
REVOKE ALL ON TABLE public.financeiro_contas               FROM anon;
REVOKE ALL ON TABLE public.financeiro_contratos            FROM anon;
REVOKE ALL ON TABLE public.financeiro_rateio_adm           FROM anon;
REVOKE ALL ON TABLE public.financeiro_rateio_adm_itens     FROM anon;
REVOKE ALL ON TABLE public.financeiro_safras               FROM anon;
REVOKE ALL ON TABLE public.financeiro_classificacao_regras FROM anon;
REVOKE ALL ON TABLE public.financeiro_mapa_classificacao   FROM anon;
REVOKE ALL ON TABLE public.financeiro_subcentro_aliases    FROM anon;
REVOKE ALL ON TABLE public.financeiro_saldos_bancarios_v2  FROM anon;
REVOKE ALL ON TABLE public.financeiro_saldos_audit         FROM anon;
REVOKE ALL ON TABLE public.financeiros                     FROM anon;
REVOKE ALL ON TABLE public.financiamento_destinacoes       FROM anon;
REVOKE ALL ON TABLE public.financiamento_parcelas          FROM anon;

COMMIT;
