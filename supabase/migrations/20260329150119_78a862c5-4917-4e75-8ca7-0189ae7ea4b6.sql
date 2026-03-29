
-- =============================================
-- ETAPA 4: Rateio ADM + Fechamentos
-- =============================================

-- 1. financeiro_rateio_adm
CREATE TABLE public.financeiro_rateio_adm (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  ano_mes text NOT NULL,
  criterio_rateio text NOT NULL DEFAULT 'rebanho',
  valor_total_rateado numeric NOT NULL DEFAULT 0,
  observacao text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fin_rateio_cliente ON public.financeiro_rateio_adm(cliente_id);
CREATE INDEX idx_fin_rateio_anomes ON public.financeiro_rateio_adm(ano_mes);

ALTER TABLE public.financeiro_rateio_adm ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.financeiro_rateio_adm FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.financeiro_rateio_adm FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.financeiro_rateio_adm FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.financeiro_rateio_adm FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));

CREATE TRIGGER update_fin_rateio_updated_at
  BEFORE UPDATE ON public.financeiro_rateio_adm
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. financeiro_rateio_adm_itens
CREATE TABLE public.financeiro_rateio_adm_itens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rateio_id uuid NOT NULL REFERENCES public.financeiro_rateio_adm(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  percentual_rateio numeric NOT NULL DEFAULT 0,
  valor_rateado numeric NOT NULL DEFAULT 0,
  base_rateio text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fin_rateio_itens_rateio ON public.financeiro_rateio_adm_itens(rateio_id);
CREATE INDEX idx_fin_rateio_itens_cliente ON public.financeiro_rateio_adm_itens(cliente_id);
CREATE INDEX idx_fin_rateio_itens_fazenda ON public.financeiro_rateio_adm_itens(fazenda_id);

ALTER TABLE public.financeiro_rateio_adm_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.financeiro_rateio_adm_itens FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.financeiro_rateio_adm_itens FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.financeiro_rateio_adm_itens FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.financeiro_rateio_adm_itens FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));

-- 3. financeiro_fechamentos
CREATE TABLE public.financeiro_fechamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  ano_mes text NOT NULL,
  status_fechamento text NOT NULL DEFAULT 'aberto',
  fechado_por uuid REFERENCES auth.users(id),
  fechado_em timestamptz,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fin_fechamentos_cliente ON public.financeiro_fechamentos(cliente_id);
CREATE INDEX idx_fin_fechamentos_fazenda ON public.financeiro_fechamentos(fazenda_id);
CREATE INDEX idx_fin_fechamentos_anomes ON public.financeiro_fechamentos(ano_mes);
CREATE UNIQUE INDEX idx_fin_fechamentos_unique ON public.financeiro_fechamentos(cliente_id, fazenda_id, ano_mes);

ALTER TABLE public.financeiro_fechamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.financeiro_fechamentos FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.financeiro_fechamentos FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.financeiro_fechamentos FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.financeiro_fechamentos FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));

CREATE TRIGGER update_fin_fechamentos_updated_at
  BEFORE UPDATE ON public.financeiro_fechamentos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
