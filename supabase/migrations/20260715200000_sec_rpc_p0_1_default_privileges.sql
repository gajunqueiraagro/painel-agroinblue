-- SEC-RPC-P0-PROTO-RUNTIME — Migration P0-1: default privileges
-- Objetivo: funcoes FUTURAS criadas por postgres em public nao nascem com EXECUTE
--   para PUBLIC / anon / authenticated. Sem esse passo, a limpeza das 38 seria
--   corrigida no presente e reintroduzida no proximo CREATE FUNCTION.
-- Escopo estrito: somente FOR ROLE postgres IN SCHEMA public.
--   NAO toca supabase_admin, owners de extensao, schemas gerenciados nem graphql_public.
-- service_role: default existente PRESERVADO (nao ha REVOKE para ele aqui).
-- owner postgres: preservado (ALTER DEFAULT PRIVILEGES nao afeta o owner).
-- Idempotente: ALTER DEFAULT PRIVILEGES ... REVOKE remove a entrada se existir e
--   e no-op se ja ausente. Sem DDL de objeto, sem DML, sem dados de negocio.

BEGIN;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM authenticated;

COMMIT;
