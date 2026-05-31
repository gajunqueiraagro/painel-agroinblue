-- ====================================================================
-- PR-MESA-SUBCENTRO-ALIASES-RLS-UI (31/05/2026)
-- ====================================================================
-- Destrava escrita via anon/public na tela de FinV2SubcentroAliasesTab.
-- Hoje só `service_role` escreve (alias_all_service_role) + authenticated
-- só lê (alias_select_authenticated). A tela usa anon/public e por isso
-- INSERT/UPDATE silenciam (mesmo padrão que afetava saldos bancários).
--
-- ESCOPO ESTRITO (FASE 2A):
--   - Adicionar 3 policies `public` (SELECT/INSERT/UPDATE).
--   - NÃO criar policy de DELETE — UI usa soft toggle (ativo=false).
--   - MANTER as 2 policies existentes (não conflitam — public é superset).
--
-- NÃO altera: schema, dados, fn_classificacao_populate_staging, Mesa,
-- nem qualquer RPC. Não popula aliases.
-- ====================================================================

BEGIN;

-- Idempotência: DROP antes de CREATE (preserva apenas as 3 novas; as
-- duas existentes — alias_select_authenticated e alias_all_service_role —
-- não são tocadas).
DROP POLICY IF EXISTS alias_select_public ON public.financeiro_subcentro_aliases;
DROP POLICY IF EXISTS alias_insert_public ON public.financeiro_subcentro_aliases;
DROP POLICY IF EXISTS alias_update_public ON public.financeiro_subcentro_aliases;

CREATE POLICY alias_select_public
  ON public.financeiro_subcentro_aliases
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY alias_insert_public
  ON public.financeiro_subcentro_aliases
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY alias_update_public
  ON public.financeiro_subcentro_aliases
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

-- SEM policy de DELETE — UI usa toggle ativo=false; deleção física não
-- é permitida pelo fluxo da aplicação.

COMMIT;
