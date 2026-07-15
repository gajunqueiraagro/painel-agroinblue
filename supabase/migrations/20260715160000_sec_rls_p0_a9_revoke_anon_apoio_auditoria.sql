-- SEC-RLS-P0-A9 — ACL anônima: cadastros/apoio + documentos/auditoria (13 relações)
--   Último lote da fila principal da onda SEC-RLS-P0-A.
--
-- Continuação de SEC-RLS-P0-A1..A7 (decisão de produto: allowlist anon = ∅).
-- Fase A (aclexplode/relacl no homolog sbwfacryawstuvhlaezm): as 13 são relkind='r',
--   RLS on, anon=8 DIRETO (grantor postgres), grantee=PUBLIC = 0, authenticated=8,
--   service_role=8. Nenhuma exclusão.
-- Gates estáticos: zero consumidores pré-login (todos os .from sob o gate do AppRouter;
--   nenhum acima do gate/AuthPage; nenhum em nível de módulo). Edge: reset-boitel-teste
--   faz .from('audit_log') via SERVICE_ROLE_KEY (imune); extract-caderno cita 'chuvas'
--   só como termo (sem query/client). Nenhuma Edge usa o papel anon.
--
-- Ação: REVOKE ALL do role anon, por tabela, nas 13 tabelas do lote.
-- PRESERVADOS (não referenciados): authenticated, service_role, postgres.
-- NÃO faz: policies, funções, helpers, triggers, auth, frontend, Edge Functions,
--   default privileges, PUBLIC, outras tabelas. Sem CASCADE. Sem REVOKE global.
-- REVOKE é DCL, idempotente.

BEGIN;

-- Cadastros/apoio
REVOKE ALL ON TABLE public.analise_consultor     FROM anon;
REVOKE ALL ON TABLE public.chuvas                FROM anon;
REVOKE ALL ON TABLE public.excel_linhas_aux      FROM anon;
REVOKE ALL ON TABLE public.fazenda_cadastros     FROM anon;
REVOKE ALL ON TABLE public.fazenda_status_mensal FROM anon;
REVOKE ALL ON TABLE public.mesa_par              FROM anon;
REVOKE ALL ON TABLE public.mesa_sessao           FROM anon;
REVOKE ALL ON TABLE public.preco_mercado         FROM anon;
REVOKE ALL ON TABLE public.preco_mercado_ajuste  FROM anon;
REVOKE ALL ON TABLE public.preco_mercado_status  FROM anon;
REVOKE ALL ON TABLE public.saldos_iniciais       FROM anon;

-- Documentos/auditoria
REVOKE ALL ON TABLE public.audit_log             FROM anon;
REVOKE ALL ON TABLE public.audit_log_movimentacoes FROM anon;

COMMIT;
