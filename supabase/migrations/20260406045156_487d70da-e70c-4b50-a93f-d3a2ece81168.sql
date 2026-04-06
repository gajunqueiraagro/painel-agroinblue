
-- 1. Tabela de GMD previsto por categoria/mês/fazenda
CREATE TABLE public.meta_gmd_mensal (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  ano_mes text NOT NULL,
  categoria text NOT NULL,
  gmd_previsto numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fazenda_id, ano_mes, categoria)
);

ALTER TABLE public.meta_gmd_mensal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.meta_gmd_mensal FOR SELECT TO authenticated
  USING ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.meta_gmd_mensal FOR INSERT TO authenticated
  WITH CHECK ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.meta_gmd_mensal FOR UPDATE TO authenticated
  USING ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.meta_gmd_mensal FOR DELETE TO authenticated
  USING ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));

-- 2. Tabela de preços previstos
CREATE TABLE public.meta_preco_mercado (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  ano_mes text NOT NULL,
  bloco text NOT NULL,
  categoria text NOT NULL,
  unidade text NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  agio_perc numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_preco_mercado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.meta_preco_mercado FOR SELECT TO authenticated
  USING ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.meta_preco_mercado FOR INSERT TO authenticated
  WITH CHECK ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.meta_preco_mercado FOR UPDATE TO authenticated
  USING ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.meta_preco_mercado FOR DELETE TO authenticated
  USING ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));

-- 3. Tabela de status dos preços previstos
CREATE TABLE public.meta_preco_mercado_status (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  ano_mes text NOT NULL,
  status text NOT NULL DEFAULT 'rascunho',
  validado_por uuid,
  validado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, ano_mes)
);

ALTER TABLE public.meta_preco_mercado_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.meta_preco_mercado_status FOR SELECT TO authenticated
  USING ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.meta_preco_mercado_status FOR INSERT TO authenticated
  WITH CHECK ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.meta_preco_mercado_status FOR UPDATE TO authenticated
  USING ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.meta_preco_mercado_status FOR DELETE TO authenticated
  USING ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));
