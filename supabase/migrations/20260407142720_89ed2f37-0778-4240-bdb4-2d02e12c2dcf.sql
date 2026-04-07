
CREATE TABLE public.meta_valor_rebanho_precos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  ano_mes text NOT NULL,
  categoria text NOT NULL,
  preco_arroba numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cliente_id, ano_mes, categoria)
);

ALTER TABLE public.meta_valor_rebanho_precos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage meta_valor_rebanho_precos"
  ON public.meta_valor_rebanho_precos
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TABLE public.meta_valor_rebanho_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  ano_mes text NOT NULL,
  status text NOT NULL DEFAULT 'rascunho',
  validado_por uuid,
  validado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cliente_id, ano_mes)
);

ALTER TABLE public.meta_valor_rebanho_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage meta_valor_rebanho_status"
  ON public.meta_valor_rebanho_status
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
