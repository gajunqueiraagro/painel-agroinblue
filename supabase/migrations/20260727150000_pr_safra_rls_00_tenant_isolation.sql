-- PR-SAFRA-RLS-00 — Isolamento multitenant de public.financeiro_safras (SOMENTE policies).
--   Substitui as 4 policies permissivas (USING/CHECK true) por policies tenant-safe no padrão
--   canônico do projeto (is_admin_agroinblue + get_user_cliente_ids; ADR-2026-13), idêntico ao
--   usado em zoo_operacao_documentos. NÃO altera tabela/colunas/constraints/grants/funções/dados.
--   Requer aplicação no PROTO (binbcdfbisgscrifztia). NUNCA em produção.

-- RLS já habilitado; reforço idempotente (não desabilita).
ALTER TABLE public.financeiro_safras ENABLE ROW LEVEL SECURITY;

-- Remove as 4 policies permissivas antigas (fecha o vazamento; nenhuma USING(true)/CHECK(true)
-- pode coexistir, pois policies permissivas se combinam por OR).
DROP POLICY IF EXISTS fs_sel ON public.financeiro_safras;
DROP POLICY IF EXISTS fs_ins ON public.financeiro_safras;
DROP POLICY IF EXISTS fs_update ON public.financeiro_safras;
DROP POLICY IF EXISTS fs_delete ON public.financeiro_safras;

-- Policies tenant-safe (admin AGROinBLUE mantém bypass; usuário comum só seus clientes).
CREATE POLICY financeiro_safras_select ON public.financeiro_safras
  FOR SELECT
  USING (
    is_admin_agroinblue(auth.uid())
    OR (cliente_id IN (SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id)))
  );

CREATE POLICY financeiro_safras_insert ON public.financeiro_safras
  FOR INSERT
  WITH CHECK (
    is_admin_agroinblue(auth.uid())
    OR (cliente_id IN (SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id)))
  );

CREATE POLICY financeiro_safras_update ON public.financeiro_safras
  FOR UPDATE
  USING (
    is_admin_agroinblue(auth.uid())
    OR (cliente_id IN (SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id)))
  )
  WITH CHECK (
    is_admin_agroinblue(auth.uid())
    OR (cliente_id IN (SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id)))
  );

CREATE POLICY financeiro_safras_delete ON public.financeiro_safras
  FOR DELETE
  USING (
    is_admin_agroinblue(auth.uid())
    OR (cliente_id IN (SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id)))
  );
