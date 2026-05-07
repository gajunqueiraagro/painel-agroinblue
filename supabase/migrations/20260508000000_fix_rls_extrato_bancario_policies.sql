-- fix: policies com TO authenticated bloqueavam inserts + admin sem bypass
-- Versão final: roles=public + bypass is_admin_agroinblue

DROP POLICY IF EXISTS "Membros do cliente podem ver extrato_bancario_v2" ON public.extrato_bancario_v2;
DROP POLICY IF EXISTS "Membros do cliente podem inserir extrato_bancario_v2" ON public.extrato_bancario_v2;
DROP POLICY IF EXISTS "Membros do cliente podem atualizar extrato_bancario_v2" ON public.extrato_bancario_v2;
DROP POLICY IF EXISTS "Membros do cliente podem deletar extrato_bancario_v2" ON public.extrato_bancario_v2;
DROP POLICY IF EXISTS "Membros do cliente podem ver conciliacao_bancaria_itens" ON public.conciliacao_bancaria_itens;
DROP POLICY IF EXISTS "Membros do cliente podem inserir conciliacao_bancaria_itens" ON public.conciliacao_bancaria_itens;
DROP POLICY IF EXISTS "Membros do cliente podem atualizar conciliacao_bancaria_itens" ON public.conciliacao_bancaria_itens;
DROP POLICY IF EXISTS "Membros do cliente podem deletar conciliacao_bancaria_itens" ON public.conciliacao_bancaria_itens;
DROP POLICY IF EXISTS "extrato_v2_select" ON public.extrato_bancario_v2;
DROP POLICY IF EXISTS "extrato_v2_insert" ON public.extrato_bancario_v2;
DROP POLICY IF EXISTS "extrato_v2_update" ON public.extrato_bancario_v2;
DROP POLICY IF EXISTS "extrato_v2_delete" ON public.extrato_bancario_v2;
DROP POLICY IF EXISTS "conc_itens_select" ON public.conciliacao_bancaria_itens;
DROP POLICY IF EXISTS "conc_itens_insert" ON public.conciliacao_bancaria_itens;
DROP POLICY IF EXISTS "conc_itens_update" ON public.conciliacao_bancaria_itens;
DROP POLICY IF EXISTS "conc_itens_delete" ON public.conciliacao_bancaria_itens;

CREATE POLICY "extrato_v2_select" ON public.extrato_bancario_v2 FOR SELECT
  USING (public.is_admin_agroinblue(auth.uid()) OR cliente_id IN (SELECT cm.cliente_id FROM public.cliente_membros cm WHERE cm.user_id = auth.uid() AND cm.ativo = true));

CREATE POLICY "extrato_v2_insert" ON public.extrato_bancario_v2 FOR INSERT
  WITH CHECK (public.is_admin_agroinblue(auth.uid()) OR cliente_id IN (SELECT cm.cliente_id FROM public.cliente_membros cm WHERE cm.user_id = auth.uid() AND cm.ativo = true));

CREATE POLICY "extrato_v2_update" ON public.extrato_bancario_v2 FOR UPDATE
  USING (public.is_admin_agroinblue(auth.uid()) OR cliente_id IN (SELECT cm.cliente_id FROM public.cliente_membros cm WHERE cm.user_id = auth.uid() AND cm.ativo = true));

CREATE POLICY "extrato_v2_delete" ON public.extrato_bancario_v2 FOR DELETE
  USING (public.is_admin_agroinblue(auth.uid()) OR cliente_id IN (SELECT cm.cliente_id FROM public.cliente_membros cm WHERE cm.user_id = auth.uid() AND cm.ativo = true));

CREATE POLICY "conc_itens_select" ON public.conciliacao_bancaria_itens FOR SELECT
  USING (public.is_admin_agroinblue(auth.uid()) OR cliente_id IN (SELECT cm.cliente_id FROM public.cliente_membros cm WHERE cm.user_id = auth.uid() AND cm.ativo = true));

CREATE POLICY "conc_itens_insert" ON public.conciliacao_bancaria_itens FOR INSERT
  WITH CHECK (public.is_admin_agroinblue(auth.uid()) OR cliente_id IN (SELECT cm.cliente_id FROM public.cliente_membros cm WHERE cm.user_id = auth.uid() AND cm.ativo = true));

CREATE POLICY "conc_itens_update" ON public.conciliacao_bancaria_itens FOR UPDATE
  USING (public.is_admin_agroinblue(auth.uid()) OR cliente_id IN (SELECT cm.cliente_id FROM public.cliente_membros cm WHERE cm.user_id = auth.uid() AND cm.ativo = true));

CREATE POLICY "conc_itens_delete" ON public.conciliacao_bancaria_itens FOR DELETE
  USING (public.is_admin_agroinblue(auth.uid()) OR cliente_id IN (SELECT cm.cliente_id FROM public.cliente_membros cm WHERE cm.user_id = auth.uid() AND cm.ativo = true));
