
-- Table for global market prices per month
CREATE TABLE public.preco_mercado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano_mes text NOT NULL,
  bloco text NOT NULL,
  categoria text NOT NULL,
  unidade text NOT NULL DEFAULT 'R$/kg',
  valor numeric NOT NULL DEFAULT 0,
  agio_perc numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ano_mes, bloco, categoria)
);

-- Status per month
CREATE TABLE public.preco_mercado_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano_mes text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'rascunho',
  validado_por uuid NULL,
  validado_em timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Per-farm price adjustments (optional overrides)
CREATE TABLE public.preco_mercado_ajuste (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  ano_mes text NOT NULL,
  bloco text NOT NULL,
  categoria text NOT NULL,
  agio_perc numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fazenda_id, ano_mes, bloco, categoria)
);

-- RLS
ALTER TABLE public.preco_mercado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preco_mercado_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preco_mercado_ajuste ENABLE ROW LEVEL SECURITY;

-- preco_mercado: any authenticated user can read, only admin can write
CREATE POLICY "authenticated_select" ON public.preco_mercado FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_insert" ON public.preco_mercado FOR INSERT TO authenticated WITH CHECK (is_admin_agroinblue(auth.uid()));
CREATE POLICY "admin_update" ON public.preco_mercado FOR UPDATE TO authenticated USING (is_admin_agroinblue(auth.uid()));
CREATE POLICY "admin_delete" ON public.preco_mercado FOR DELETE TO authenticated USING (is_admin_agroinblue(auth.uid()));

-- preco_mercado_status: any authenticated can read, only admin can write
CREATE POLICY "authenticated_select" ON public.preco_mercado_status FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_insert" ON public.preco_mercado_status FOR INSERT TO authenticated WITH CHECK (is_admin_agroinblue(auth.uid()));
CREATE POLICY "admin_update" ON public.preco_mercado_status FOR UPDATE TO authenticated USING (is_admin_agroinblue(auth.uid()));
CREATE POLICY "admin_delete" ON public.preco_mercado_status FOR DELETE TO authenticated USING (is_admin_agroinblue(auth.uid()));

-- preco_mercado_ajuste: client-scoped
CREATE POLICY "cliente_select" ON public.preco_mercado_ajuste FOR SELECT TO authenticated USING ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.preco_mercado_ajuste FOR INSERT TO authenticated WITH CHECK ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.preco_mercado_ajuste FOR UPDATE TO authenticated USING ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.preco_mercado_ajuste FOR DELETE TO authenticated USING ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));

-- Updated_at triggers
CREATE TRIGGER set_updated_at_preco_mercado BEFORE UPDATE ON public.preco_mercado FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_preco_mercado_status BEFORE UPDATE ON public.preco_mercado_status FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_preco_mercado_ajuste BEFORE UPDATE ON public.preco_mercado_ajuste FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
