
-- =============================================
-- ETAPA 1: Tabelas de base (fundação)
-- =============================================

-- 1. financeiro_contas_bancarias
CREATE TABLE public.financeiro_contas_bancarias (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  nome_conta text NOT NULL,
  banco text,
  agencia text,
  numero_conta text,
  tipo_conta text DEFAULT 'corrente',
  ativa boolean NOT NULL DEFAULT true,
  ordem_exibicao integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fin_contas_bancarias_cliente ON public.financeiro_contas_bancarias(cliente_id);
CREATE INDEX idx_fin_contas_bancarias_fazenda ON public.financeiro_contas_bancarias(fazenda_id);

ALTER TABLE public.financeiro_contas_bancarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.financeiro_contas_bancarias FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.financeiro_contas_bancarias FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.financeiro_contas_bancarias FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.financeiro_contas_bancarias FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));

CREATE TRIGGER update_fin_contas_bancarias_updated_at
  BEFORE UPDATE ON public.financeiro_contas_bancarias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. financeiro_plano_contas
CREATE TABLE public.financeiro_plano_contas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo_operacao text NOT NULL,
  macro_custo text NOT NULL,
  centro_custo text NOT NULL,
  subcentro text,
  grupo_fluxo text,
  escopo_negocio text,
  ativo boolean NOT NULL DEFAULT true,
  ordem_exibicao integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fin_plano_contas_cliente ON public.financeiro_plano_contas(cliente_id);
CREATE INDEX idx_fin_plano_contas_tipo ON public.financeiro_plano_contas(tipo_operacao);
CREATE INDEX idx_fin_plano_contas_macro ON public.financeiro_plano_contas(macro_custo);

ALTER TABLE public.financeiro_plano_contas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.financeiro_plano_contas FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.financeiro_plano_contas FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.financeiro_plano_contas FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.financeiro_plano_contas FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));

CREATE TRIGGER update_fin_plano_contas_updated_at
  BEFORE UPDATE ON public.financeiro_plano_contas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. financeiro_mapa_classificacao
CREATE TABLE public.financeiro_mapa_classificacao (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo_operacao text NOT NULL,
  macro_custo text NOT NULL,
  centro_custo text NOT NULL,
  subcentro text,
  grupo_dashboard text,
  grupo_dre text,
  grupo_fluxo text,
  ativo boolean NOT NULL DEFAULT true,
  ordem_exibicao integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fin_mapa_class_cliente ON public.financeiro_mapa_classificacao(cliente_id);
CREATE INDEX idx_fin_mapa_class_tipo ON public.financeiro_mapa_classificacao(tipo_operacao);
CREATE INDEX idx_fin_mapa_class_macro ON public.financeiro_mapa_classificacao(macro_custo);

ALTER TABLE public.financeiro_mapa_classificacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.financeiro_mapa_classificacao FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.financeiro_mapa_classificacao FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.financeiro_mapa_classificacao FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.financeiro_mapa_classificacao FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));

CREATE TRIGGER update_fin_mapa_class_updated_at
  BEFORE UPDATE ON public.financeiro_mapa_classificacao
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
