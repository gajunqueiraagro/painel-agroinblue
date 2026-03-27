
-- ================================================================
-- RLS REFORÇO: isolamento direto por cliente_id
-- ================================================================

-- 1. Função helper: retorna todos os cliente_ids do usuário atual
CREATE OR REPLACE FUNCTION public.get_user_cliente_ids(_user_id uuid DEFAULT auth.uid())
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cliente_id FROM public.cliente_membros
  WHERE user_id = _user_id AND ativo = true
$$;

-- ================================================================
-- 2. FAZENDAS — substituir policies existentes
-- ================================================================
DROP POLICY IF EXISTS "Members can view their fazendas" ON public.fazendas;
DROP POLICY IF EXISTS "Owners can view own fazendas" ON public.fazendas;
DROP POLICY IF EXISTS "Auth users can create fazendas" ON public.fazendas;
DROP POLICY IF EXISTS "Owners can update fazendas" ON public.fazendas;
DROP POLICY IF EXISTS "Owners can delete fazendas" ON public.fazendas;

CREATE POLICY "cliente_select" ON public.fazendas FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.fazendas FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.fazendas FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.fazendas FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));

-- ================================================================
-- 3. LANCAMENTOS (zoo)
-- ================================================================
DROP POLICY IF EXISTS "Members can view lancamentos" ON public.lancamentos;
DROP POLICY IF EXISTS "Members can insert lancamentos" ON public.lancamentos;
DROP POLICY IF EXISTS "Members can update lancamentos" ON public.lancamentos;
DROP POLICY IF EXISTS "Members can delete lancamentos" ON public.lancamentos;

CREATE POLICY "cliente_select" ON public.lancamentos FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.lancamentos FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.lancamentos FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.lancamentos FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));

-- ================================================================
-- 4. FINANCEIRO_LANCAMENTOS
-- ================================================================
DROP POLICY IF EXISTS "Members can view fin_lancamentos" ON public.financeiro_lancamentos;
DROP POLICY IF EXISTS "Members can insert fin_lancamentos" ON public.financeiro_lancamentos;
DROP POLICY IF EXISTS "Members can update fin_lancamentos" ON public.financeiro_lancamentos;
DROP POLICY IF EXISTS "Members can delete fin_lancamentos" ON public.financeiro_lancamentos;

CREATE POLICY "cliente_select" ON public.financeiro_lancamentos FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.financeiro_lancamentos FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.financeiro_lancamentos FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.financeiro_lancamentos FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));

-- ================================================================
-- 5. FINANCEIRO_SALDOS_BANCARIOS
-- ================================================================
DROP POLICY IF EXISTS "Members can view saldos_bancarios" ON public.financeiro_saldos_bancarios;
DROP POLICY IF EXISTS "Members can insert saldos_bancarios" ON public.financeiro_saldos_bancarios;
DROP POLICY IF EXISTS "Members can delete saldos_bancarios" ON public.financeiro_saldos_bancarios;

CREATE POLICY "cliente_select" ON public.financeiro_saldos_bancarios FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.financeiro_saldos_bancarios FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.financeiro_saldos_bancarios FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.financeiro_saldos_bancarios FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));

-- ================================================================
-- 6. FINANCEIRO_RESUMO_CAIXA
-- ================================================================
DROP POLICY IF EXISTS "Members can view resumo_caixa" ON public.financeiro_resumo_caixa;
DROP POLICY IF EXISTS "Members can insert resumo_caixa" ON public.financeiro_resumo_caixa;
DROP POLICY IF EXISTS "Members can delete resumo_caixa" ON public.financeiro_resumo_caixa;

CREATE POLICY "cliente_select" ON public.financeiro_resumo_caixa FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.financeiro_resumo_caixa FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.financeiro_resumo_caixa FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.financeiro_resumo_caixa FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));

-- ================================================================
-- 7. FINANCEIRO_IMPORTACOES
-- ================================================================
DROP POLICY IF EXISTS "Members can view fin_importacoes" ON public.financeiro_importacoes;
DROP POLICY IF EXISTS "Members can insert fin_importacoes" ON public.financeiro_importacoes;
DROP POLICY IF EXISTS "Members can update fin_importacoes" ON public.financeiro_importacoes;
DROP POLICY IF EXISTS "Members can delete fin_importacoes" ON public.financeiro_importacoes;

CREATE POLICY "cliente_select" ON public.financeiro_importacoes FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.financeiro_importacoes FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.financeiro_importacoes FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.financeiro_importacoes FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));

-- ================================================================
-- 8. FINANCEIRO_CENTROS_CUSTO
-- ================================================================
DROP POLICY IF EXISTS "Members can view fin_centros" ON public.financeiro_centros_custo;
DROP POLICY IF EXISTS "Members can insert fin_centros" ON public.financeiro_centros_custo;
DROP POLICY IF EXISTS "Members can update fin_centros" ON public.financeiro_centros_custo;
DROP POLICY IF EXISTS "Members can delete fin_centros" ON public.financeiro_centros_custo;

CREATE POLICY "cliente_select" ON public.financeiro_centros_custo FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.financeiro_centros_custo FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.financeiro_centros_custo FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.financeiro_centros_custo FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));

-- ================================================================
-- 9. FINANCEIRO_CONTAS
-- ================================================================
DROP POLICY IF EXISTS "Members can view fin_contas" ON public.financeiro_contas;
DROP POLICY IF EXISTS "Members can insert fin_contas" ON public.financeiro_contas;
DROP POLICY IF EXISTS "Members can update fin_contas" ON public.financeiro_contas;
DROP POLICY IF EXISTS "Members can delete fin_contas" ON public.financeiro_contas;

CREATE POLICY "cliente_select" ON public.financeiro_contas FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.financeiro_contas FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.financeiro_contas FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.financeiro_contas FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));

-- ================================================================
-- 10. FINANCEIRO_FORNECEDORES
-- ================================================================
DROP POLICY IF EXISTS "Members can view fin_fornecedores" ON public.financeiro_fornecedores;
DROP POLICY IF EXISTS "Members can insert fin_fornecedores" ON public.financeiro_fornecedores;
DROP POLICY IF EXISTS "Members can update fin_fornecedores" ON public.financeiro_fornecedores;
DROP POLICY IF EXISTS "Members can delete fin_fornecedores" ON public.financeiro_fornecedores;

CREATE POLICY "cliente_select" ON public.financeiro_fornecedores FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.financeiro_fornecedores FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.financeiro_fornecedores FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.financeiro_fornecedores FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));

-- ================================================================
-- 11. PASTOS
-- ================================================================
DROP POLICY IF EXISTS "Members can view pastos" ON public.pastos;
DROP POLICY IF EXISTS "Members can insert pastos" ON public.pastos;
DROP POLICY IF EXISTS "Members can update pastos" ON public.pastos;
DROP POLICY IF EXISTS "Members can delete pastos" ON public.pastos;

CREATE POLICY "cliente_select" ON public.pastos FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.pastos FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.pastos FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.pastos FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));

-- ================================================================
-- 12. SALDOS_INICIAIS
-- ================================================================
DROP POLICY IF EXISTS "Members can view saldos" ON public.saldos_iniciais;
DROP POLICY IF EXISTS "Members can insert saldos" ON public.saldos_iniciais;
DROP POLICY IF EXISTS "Members can update saldos" ON public.saldos_iniciais;
DROP POLICY IF EXISTS "Members can delete saldos" ON public.saldos_iniciais;

CREATE POLICY "cliente_select" ON public.saldos_iniciais FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.saldos_iniciais FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.saldos_iniciais FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.saldos_iniciais FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));

-- ================================================================
-- 13. FECHAMENTO_PASTOS
-- ================================================================
DROP POLICY IF EXISTS "Members can view fechamento_pastos" ON public.fechamento_pastos;
DROP POLICY IF EXISTS "Members can insert fechamento_pastos" ON public.fechamento_pastos;
DROP POLICY IF EXISTS "Members can update fechamento_pastos" ON public.fechamento_pastos;
DROP POLICY IF EXISTS "Members can delete fechamento_pastos" ON public.fechamento_pastos;

CREATE POLICY "cliente_select" ON public.fechamento_pastos FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.fechamento_pastos FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.fechamento_pastos FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.fechamento_pastos FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));

-- ================================================================
-- 14. CHUVAS
-- ================================================================
DROP POLICY IF EXISTS "Members can view chuvas" ON public.chuvas;
DROP POLICY IF EXISTS "Members can insert chuvas" ON public.chuvas;
DROP POLICY IF EXISTS "Members can update chuvas" ON public.chuvas;
DROP POLICY IF EXISTS "Members can delete chuvas" ON public.chuvas;

CREATE POLICY "cliente_select" ON public.chuvas FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.chuvas FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.chuvas FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.chuvas FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));

-- ================================================================
-- 15. VALOR_REBANHO_MENSAL
-- ================================================================
DROP POLICY IF EXISTS "Members can view valor_rebanho" ON public.valor_rebanho_mensal;
DROP POLICY IF EXISTS "Members can insert valor_rebanho" ON public.valor_rebanho_mensal;
DROP POLICY IF EXISTS "Members can update valor_rebanho" ON public.valor_rebanho_mensal;
DROP POLICY IF EXISTS "Members can delete valor_rebanho" ON public.valor_rebanho_mensal;

CREATE POLICY "cliente_select" ON public.valor_rebanho_mensal FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.valor_rebanho_mensal FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.valor_rebanho_mensal FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.valor_rebanho_mensal FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));

-- ================================================================
-- 16. VALOR_REBANHO_FECHAMENTO
-- ================================================================
DROP POLICY IF EXISTS "Members can view fechamento_valor" ON public.valor_rebanho_fechamento;
DROP POLICY IF EXISTS "Members can insert fechamento_valor" ON public.valor_rebanho_fechamento;
DROP POLICY IF EXISTS "Members can update fechamento_valor" ON public.valor_rebanho_fechamento;
DROP POLICY IF EXISTS "Members can delete fechamento_valor" ON public.valor_rebanho_fechamento;

CREATE POLICY "cliente_select" ON public.valor_rebanho_fechamento FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.valor_rebanho_fechamento FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.valor_rebanho_fechamento FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.valor_rebanho_fechamento FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));

-- ================================================================
-- 17. FAZENDA_CADASTROS
-- ================================================================
DROP POLICY IF EXISTS "Members can view cadastro" ON public.fazenda_cadastros;
DROP POLICY IF EXISTS "Members can insert cadastro" ON public.fazenda_cadastros;
DROP POLICY IF EXISTS "Members can update cadastro" ON public.fazenda_cadastros;
DROP POLICY IF EXISTS "Members can delete cadastro" ON public.fazenda_cadastros;

CREATE POLICY "cliente_select" ON public.fazenda_cadastros FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.fazenda_cadastros FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.fazenda_cadastros FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.fazenda_cadastros FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())) OR public.is_admin_agroinblue(auth.uid()));

-- ================================================================
-- 18. FAZENDA_MEMBROS — manter policy existente de membros + adicionar isolamento por cliente
-- ================================================================
DROP POLICY IF EXISTS "Members can view membros" ON public.fazenda_membros;
DROP POLICY IF EXISTS "Authenticated can add membros" ON public.fazenda_membros;
DROP POLICY IF EXISTS "Owners and gerentes can update membros" ON public.fazenda_membros;
DROP POLICY IF EXISTS "Owners can remove membros" ON public.fazenda_membros;

CREATE POLICY "cliente_select" ON public.fazenda_membros FOR SELECT TO authenticated
  USING (
    fazenda_id IN (SELECT id FROM public.fazendas WHERE cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())))
    OR public.is_admin_agroinblue(auth.uid())
  );
CREATE POLICY "cliente_insert" ON public.fazenda_membros FOR INSERT TO authenticated
  WITH CHECK (
    fazenda_id IN (SELECT id FROM public.fazendas WHERE cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())))
    OR public.is_admin_agroinblue(auth.uid())
  );
CREATE POLICY "cliente_update" ON public.fazenda_membros FOR UPDATE TO authenticated
  USING (
    fazenda_id IN (SELECT id FROM public.fazendas WHERE cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())))
    OR public.is_admin_agroinblue(auth.uid())
  );
CREATE POLICY "cliente_delete" ON public.fazenda_membros FOR DELETE TO authenticated
  USING (
    fazenda_id IN (SELECT id FROM public.fazendas WHERE cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())))
    OR public.is_admin_agroinblue(auth.uid())
  );

-- ================================================================
-- 19. FECHAMENTO_PASTO_ITENS — sem cliente_id direto, isolar via fechamento_pastos
-- ================================================================
DROP POLICY IF EXISTS "Members can view fechamento_pasto_itens" ON public.fechamento_pasto_itens;
DROP POLICY IF EXISTS "Members can insert fechamento_pasto_itens" ON public.fechamento_pasto_itens;
DROP POLICY IF EXISTS "Members can update fechamento_pasto_itens" ON public.fechamento_pasto_itens;
DROP POLICY IF EXISTS "Members can delete fechamento_pasto_itens" ON public.fechamento_pasto_itens;

CREATE POLICY "cliente_select" ON public.fechamento_pasto_itens FOR SELECT TO authenticated
  USING (
    fechamento_id IN (SELECT id FROM public.fechamento_pastos WHERE cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())))
    OR public.is_admin_agroinblue(auth.uid())
  );
CREATE POLICY "cliente_insert" ON public.fechamento_pasto_itens FOR INSERT TO authenticated
  WITH CHECK (
    fechamento_id IN (SELECT id FROM public.fechamento_pastos WHERE cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())))
    OR public.is_admin_agroinblue(auth.uid())
  );
CREATE POLICY "cliente_update" ON public.fechamento_pasto_itens FOR UPDATE TO authenticated
  USING (
    fechamento_id IN (SELECT id FROM public.fechamento_pastos WHERE cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())))
    OR public.is_admin_agroinblue(auth.uid())
  );
CREATE POLICY "cliente_delete" ON public.fechamento_pasto_itens FOR DELETE TO authenticated
  USING (
    fechamento_id IN (SELECT id FROM public.fechamento_pastos WHERE cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid())))
    OR public.is_admin_agroinblue(auth.uid())
  );
