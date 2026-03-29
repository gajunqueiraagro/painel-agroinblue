
-- =============================================
-- ETAPA 2: Lançamentos v2 + Importações v2
-- =============================================

-- 1. financeiro_importacoes_v2
CREATE TABLE public.financeiro_importacoes_v2 (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  conta_bancaria_id uuid REFERENCES public.financeiro_contas_bancarias(id),
  nome_arquivo text NOT NULL,
  tipo_arquivo text DEFAULT 'excel',
  data_importacao timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pendente',
  total_linhas integer NOT NULL DEFAULT 0,
  total_validas integer NOT NULL DEFAULT 0,
  total_com_erro integer NOT NULL DEFAULT 0,
  observacao text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fin_import_v2_cliente ON public.financeiro_importacoes_v2(cliente_id);
CREATE INDEX idx_fin_import_v2_fazenda ON public.financeiro_importacoes_v2(fazenda_id);

ALTER TABLE public.financeiro_importacoes_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.financeiro_importacoes_v2 FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.financeiro_importacoes_v2 FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.financeiro_importacoes_v2 FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.financeiro_importacoes_v2 FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));

-- 2. financeiro_lancamentos_v2
CREATE TABLE public.financeiro_lancamentos_v2 (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  conta_bancaria_id uuid REFERENCES public.financeiro_contas_bancarias(id),
  ano_mes text NOT NULL,
  data_competencia date NOT NULL,
  data_pagamento date,
  tipo_operacao text NOT NULL,
  status_transacao text DEFAULT 'pendente',
  descricao text,
  documento text,
  historico text,
  valor numeric NOT NULL DEFAULT 0,
  sinal smallint NOT NULL DEFAULT -1,
  macro_custo text,
  centro_custo text,
  subcentro text,
  escopo_negocio text,
  plano_conta_id uuid REFERENCES public.financeiro_plano_contas(id),
  favorecido_id uuid REFERENCES public.financeiro_fornecedores(id),
  origem_lancamento text NOT NULL DEFAULT 'manual',
  lote_importacao_id uuid REFERENCES public.financeiro_importacoes_v2(id),
  transferencia_grupo_id uuid,
  conciliado_em timestamptz,
  observacao text,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fin_lanc_v2_cliente ON public.financeiro_lancamentos_v2(cliente_id);
CREATE INDEX idx_fin_lanc_v2_fazenda ON public.financeiro_lancamentos_v2(fazenda_id);
CREATE INDEX idx_fin_lanc_v2_ano_mes ON public.financeiro_lancamentos_v2(ano_mes);
CREATE INDEX idx_fin_lanc_v2_tipo ON public.financeiro_lancamentos_v2(tipo_operacao);
CREATE INDEX idx_fin_lanc_v2_status ON public.financeiro_lancamentos_v2(status_transacao);
CREATE INDEX idx_fin_lanc_v2_macro ON public.financeiro_lancamentos_v2(macro_custo);
CREATE INDEX idx_fin_lanc_v2_data_pag ON public.financeiro_lancamentos_v2(data_pagamento);
CREATE INDEX idx_fin_lanc_v2_conta ON public.financeiro_lancamentos_v2(conta_bancaria_id);
CREATE INDEX idx_fin_lanc_v2_lote ON public.financeiro_lancamentos_v2(lote_importacao_id);

ALTER TABLE public.financeiro_lancamentos_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.financeiro_lancamentos_v2 FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.financeiro_lancamentos_v2 FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.financeiro_lancamentos_v2 FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.financeiro_lancamentos_v2 FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));

CREATE TRIGGER update_fin_lanc_v2_updated_at
  BEFORE UPDATE ON public.financeiro_lancamentos_v2
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
