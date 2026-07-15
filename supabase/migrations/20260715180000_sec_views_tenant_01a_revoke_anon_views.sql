-- SEC-VIEWS-TENANT-01A — ACL anônima: 8 views técnicas
--
-- Fecha SOMENTE o acesso anon (por ACL) das 8 views. NÃO altera definição, NÃO altera
--   security_invoker, NÃO altera policies das tabelas-base, NÃO toca funções/triggers/frontend.
-- Fase A (aclexplode/relacl no homolog sbwfacryawstuvhlaezm): as 8 são relkind='v',
--   owner=postgres, security_invoker UNSET (default false → execução como owner),
--   anon=8 DIRETO, grantee=PUBLIC = 0, authenticated=8, service_role=8.
-- Motivação: como as views executam como owner (postgres), anon lendo a VIEW hoje
--   CONTORNA o REVOKE já aplicado nas tabelas-base (A1..AS1). Revogar anon nas próprias
--   views fecha esse último caminho de leitura anônima.
-- Gates estáticos: zero consumidores pré-login (0 acima do gate, 0 em nível de módulo,
--   0 em Edge Function). Fluxos legítimos rodam como authenticated (grant da view preservado;
--   a view lê as bases como owner postgres).
--
-- RISCO RESIDUAL REGISTRADO (fora deste pacote): as 8 views seguem security_invoker=false
--   e SEM filtro por ator atual (0 auth.uid/current_user_*/cliente_membros) → bypassam RLS
--   e permitem leitura CROSS-TENANT por authenticated. Correção (security_invoker=true ou
--   filtro de tenant) pertence a etapa posterior do SEC-VIEWS-TENANT. NÃO feita aqui.
--
-- Ação: REVOKE ALL do role anon, por view, nas 8 relações.
-- PRESERVADOS (não referenciados): authenticated, service_role, postgres.
-- Sem CASCADE. Sem REVOKE global. Sem PUBLIC. Sem default privileges. REVOKE é DCL, idempotente.

BEGIN;

REVOKE ALL ON TABLE public.vw_classificacao_staging_preview         FROM anon;
REVOKE ALL ON TABLE public.vw_financeiro_auditoria_competencia_caixa FROM anon;
REVOKE ALL ON TABLE public.vw_financeiro_dashboard_mensal           FROM anon;
REVOKE ALL ON TABLE public.vw_financeiro_desembolso_centro          FROM anon;
REVOKE ALL ON TABLE public.vw_financeiro_fluxo_caixa_mensal         FROM anon;
REVOKE ALL ON TABLE public.vw_valor_rebanho_realizado_global_mensal FROM anon;
REVOKE ALL ON TABLE public.vw_zoot_categoria_mensal                 FROM anon;
REVOKE ALL ON TABLE public.vw_zoot_fazenda_mensal                   FROM anon;

COMMIT;
