-- PR-OC-LIQ-02A — CORRETIVA de ACL das views de liquidação (ADR-2026-16 §2.4 / ADR-2026-14).
--   Motivo: a homologação runtime do PR-OC-LIQ-02 (20/07/2026) reprovou UM item — as views
--   vw_oc_titulos_liquidacao e vw_oc_operacao_liquidacao nasceram com o pacote pleno herdado do
--   default-ACL permissivo do Proto para authenticated (arwdDxt: INSERT+SELECT+UPDATE+DELETE+
--   TRUNCATE+REFERENCES+TRIGGER); a M1 do LIQ-02 revogou apenas anon/PUBLIC e concedeu SELECT,
--   sem antes zerar o herdado de authenticated. Reduz a ACL das DUAS views a EXATAMENTE SELECT.
--   Terceira ocorrencia do mesmo vicio de default-ACL. Precedentes: M2b de zoo_operacao_liquidacoes
--   (20260720100150) e PR-OC-CATALOGO-01A (20260720170000). Saneamento global = frente SEC-RPC-P0.
--   NAO altera definicao, colunas, filtros, security_invoker, comentarios ou semantica das views.
-- NAO aplicar por este PR (aplicacao e etapa separada sob autorizacao).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- vw_oc_titulos_liquidacao: zera o herdado de authenticated e reconcede so SELECT.
REVOKE ALL PRIVILEGES ON TABLE public.vw_oc_titulos_liquidacao FROM authenticated;
GRANT SELECT ON TABLE public.vw_oc_titulos_liquidacao TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.vw_oc_titulos_liquidacao FROM anon, PUBLIC;

-- vw_oc_operacao_liquidacao: idem.
REVOKE ALL PRIVILEGES ON TABLE public.vw_oc_operacao_liquidacao FROM authenticated;
GRANT SELECT ON TABLE public.vw_oc_operacao_liquidacao TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.vw_oc_operacao_liquidacao FROM anon, PUBLIC;

-- service_role permanece intocado (privilegios de plataforma preservados).
