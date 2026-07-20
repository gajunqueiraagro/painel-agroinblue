-- PR-OC-MODEL-01 parte 2b — CORRETIVA de ACL, mínima e escopada.
--   Motivo: o Proto tem ALTER DEFAULT PRIVILEGES global permissivo (arwdDxtm) para novas
--   tabelas em public, concedendo privilégios amplos a authenticated (DELETE, TRUNCATE,
--   REFERENCES, TRIGGER...) além do SELECT/INSERT/UPDATE aprovado. A M2 já revogou anon/PUBLIC;
--   esta M2b endurece ESPECIFICAMENTE zoo_operacao_liquidacoes. TRUNCATE não é protegido por
--   RLS — por isso authenticated não pode conservá-lo.
--   NÃO altera default privileges globais nem outras tabelas. Saneamento global = frente SEC-RPC-P0.
-- NÃO aplicar por este PR (aplicação é etapa separada sob autorização).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- authenticated: zera o herdado do default-ACL e reconcede só o aprovado.
REVOKE ALL PRIVILEGES ON TABLE public.zoo_operacao_liquidacoes FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.zoo_operacao_liquidacoes TO authenticated;

-- Reafirma anon/PUBLIC sem nenhum privilégio.
REVOKE ALL PRIVILEGES ON TABLE public.zoo_operacao_liquidacoes FROM anon, PUBLIC;

-- service_role permanece intocado (privilégios de plataforma preservados).
