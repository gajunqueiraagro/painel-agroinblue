-- SEC-RLS-P0-AS1 — ACL anônima: Conciliação/Staging (15 relações) — trilha especial
--
-- Continuação da onda SEC-RLS-P0-A (decisão de produto: allowlist anon = ∅). Trilha
--   separada por conter objetos com RLS OFF (perícia dedicada AS1).
-- Fase A (aclexplode/relacl no homolog sbwfacryawstuvhlaezm): as 15 são relkind='r',
--   anon=8 DIRETO (grantor postgres), grantee=PUBLIC = 0, authenticated=8, service_role=8.
--   RLS: 12 ON, 3 OFF (conciliacao_audit_log, extrato_bancario_staging,
--   extrato_bancario_staging_itens — sem policies).
-- Sustentação dos fluxos legítimos (OFX/CSV/Mesa), sem depender de anon:
--   - tabelas com .from direto (extrato_bancario_v2, conciliacao_bancaria_itens, mesa_*,
--     etc.) são acessadas por AUTHENTICATED sob policies tenant-scoped (grant preservado);
--   - staging/audit RLS OFF são escritas por RPCs SECURITY DEFINER owner=postgres e por
--     trigger functions SECURITY INVOKER que disparam em DML de authenticated (rodam como
--     o autor do DML = authenticated) ou por cron (postgres). Nenhum caminho legítimo anon.
-- Gates estáticos: zero consumidores pré-login (0 acima do gate, 0 em nível de módulo,
--   0 em Edge Function).
-- NÃO altera RLS (ENABLE/FORCE), policies, funções, triggers, Edge, frontend.
--   A superfície residual de EXECUTE anon via PUBLIC em funções pertence a
--   SEC-RPC-ACL-FROTA-01, fora deste pacote.
--
-- Ação: REVOKE ALL do role anon, por tabela, nas 15 relações.
-- PRESERVADOS (não referenciados): authenticated, service_role, postgres.
-- Sem CASCADE. Sem REVOKE global. Sem PUBLIC. Sem default privileges. REVOKE é DCL, idempotente.

BEGIN;

REVOKE ALL ON TABLE public.conciliacao_audit_log            FROM anon;
REVOKE ALL ON TABLE public.conciliacao_bancaria_itens       FROM anon;
REVOKE ALL ON TABLE public.extrato_bancario_staging         FROM anon;
REVOKE ALL ON TABLE public.extrato_bancario_staging_itens   FROM anon;
REVOKE ALL ON TABLE public.extrato_bancario_v2              FROM anon;
REVOKE ALL ON TABLE public.financeiro_classificacao_staging FROM anon;
REVOKE ALL ON TABLE public.financeiro_conciliacoes          FROM anon;
REVOKE ALL ON TABLE public.financeiro_duplicidade_log       FROM anon;
REVOKE ALL ON TABLE public.financeiro_extrato_bancario      FROM anon;
REVOKE ALL ON TABLE public.financeiro_importacoes           FROM anon;
REVOKE ALL ON TABLE public.mesa_lancamento_staging          FROM anon;
REVOKE ALL ON TABLE public.mesa_ofx_validacao               FROM anon;
REVOKE ALL ON TABLE public.transferencia_ofx_pares          FROM anon;
REVOKE ALL ON TABLE public.zoot_importacoes                 FROM anon;
REVOKE ALL ON TABLE public.zoot_importacoes_staging         FROM anon;

COMMIT;
