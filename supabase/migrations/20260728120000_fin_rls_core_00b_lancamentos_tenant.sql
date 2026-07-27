-- FIN-RLS-CORE-00B — Isolamento multitenant de public.financeiro_lancamentos_v2 (SOMENTE policies).
--   Substitui as 3 policies permissivas (fin_lanc_select/insert/update, USING/CHECK literais `true`,
--   role PUBLIC) por policies tenant-safe no padrão canônico homologado (PR-SAFRA-RLS-00):
--     is_admin_agroinblue(auth.uid()) OR (cliente_id IN (SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id)))
--   Contrato preservado: SEM policy DELETE (cancelamento é soft-delete via `cancelado=true`).
--   NÃO altera tabela/colunas/constraints/grants/funções/triggers/dados.
--   Requer aplicação no PROTO (binbcdfbisgscrifztia). NUNCA em produção.
--
--   RESSALVA (fora deste lote): funções SECURITY DEFINER que escrevem em financeiro_lancamentos_v2
--   bypassam RLS; ao menos fn_cancelar_lancamento_auditoria permite cancelamento CROSS-TENANT sem
--   validação de tenant (comprovado por execução). Esta migration NÃO corrige RPCs — ver frente
--   SEC-RPC-TENANT-01. E as views vw_* (SEC-VIEWS-TENANT-01B) também seguem em aberto.

-- RLS já habilitado; reforço idempotente (não desabilita).
ALTER TABLE public.financeiro_lancamentos_v2 ENABLE ROW LEVEL SECURITY;

-- Remove as 3 policies permissivas antigas (fecha o acesso direto cross-tenant à tabela).
DROP POLICY IF EXISTS fin_lanc_select ON public.financeiro_lancamentos_v2;
DROP POLICY IF EXISTS fin_lanc_insert ON public.financeiro_lancamentos_v2;
DROP POLICY IF EXISTS fin_lanc_update ON public.financeiro_lancamentos_v2;

-- Policies tenant-safe (admin AGROinBLUE mantém bypass; usuário comum só seus clientes).
-- SEM policy DELETE por design (contrato vigente = soft-delete via `cancelado`).
CREATE POLICY financeiro_lancamentos_v2_select ON public.financeiro_lancamentos_v2
  FOR SELECT
  USING (
    is_admin_agroinblue(auth.uid())
    OR (cliente_id IN (SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id)))
  );

CREATE POLICY financeiro_lancamentos_v2_insert ON public.financeiro_lancamentos_v2
  FOR INSERT
  WITH CHECK (
    is_admin_agroinblue(auth.uid())
    OR (cliente_id IN (SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id)))
  );

CREATE POLICY financeiro_lancamentos_v2_update ON public.financeiro_lancamentos_v2
  FOR UPDATE
  USING (
    is_admin_agroinblue(auth.uid())
    OR (cliente_id IN (SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id)))
  )
  WITH CHECK (
    is_admin_agroinblue(auth.uid())
    OR (cliente_id IN (SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id)))
  );
