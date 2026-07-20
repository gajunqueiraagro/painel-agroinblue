-- PR-OC-CATALOGO-01A — CORRETIVA de ACL do catálogo soberano (ADR-2026-16 Decisão 3).
--   Motivo: a homologação runtime do PR-OC-CATALOGO-01 (20/07/2026) reprovou UM item —
--   public.zoo_componentes_financeiros conserva para authenticated os privilégios herdados
--   do default-ACL global permissivo do Proto (arwdDxt: INSERT+SELECT+UPDATE+DELETE+TRUNCATE+
--   REFERENCES+TRIGGER), permitindo a qualquer autenticado reescrever ou TRUNCAR o catálogo.
--   TRUNCATE não é protegido por RLS — por isso authenticated não pode conservá-lo.
--   Catálogo é somente-leitura pelo app (escrita apenas por migration/service_role): reduz a
--   ACL de authenticated a EXATAMENTE SELECT. Precedente do padrão: M2b de
--   zoo_operacao_liquidacoes (20260720100150_pr_oc_model_01_2b_liquidacoes_acl.sql).
--   NÃO altera default privileges globais nem outras tabelas. Saneamento global = frente SEC-RPC-P0.
-- NÃO aplicar por este PR (aplicação é etapa separada sob autorização).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- authenticated: zera o herdado do default-ACL e reconcede só o aprovado (somente SELECT).
REVOKE ALL PRIVILEGES ON TABLE public.zoo_componentes_financeiros FROM authenticated;
GRANT SELECT ON TABLE public.zoo_componentes_financeiros TO authenticated;

-- Reafirma anon/PUBLIC sem nenhum privilégio.
REVOKE ALL PRIVILEGES ON TABLE public.zoo_componentes_financeiros FROM anon, PUBLIC;

-- service_role permanece intocado (privilégios de plataforma preservados).
