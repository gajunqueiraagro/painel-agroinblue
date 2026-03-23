
CREATE TABLE public.valor_rebanho_mensal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  ano_mes text NOT NULL,
  categoria text NOT NULL,
  preco_kg numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fazenda_id, ano_mes, categoria)
);

ALTER TABLE public.valor_rebanho_mensal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view valor_rebanho" ON public.valor_rebanho_mensal
  FOR SELECT TO authenticated
  USING (is_fazenda_member(auth.uid(), fazenda_id));

CREATE POLICY "Members can insert valor_rebanho" ON public.valor_rebanho_mensal
  FOR INSERT TO authenticated
  WITH CHECK (is_fazenda_member(auth.uid(), fazenda_id));

CREATE POLICY "Members can update valor_rebanho" ON public.valor_rebanho_mensal
  FOR UPDATE TO authenticated
  USING (is_fazenda_member(auth.uid(), fazenda_id));

CREATE POLICY "Members can delete valor_rebanho" ON public.valor_rebanho_mensal
  FOR DELETE TO authenticated
  USING (is_fazenda_member(auth.uid(), fazenda_id));

CREATE TRIGGER update_valor_rebanho_updated_at
  BEFORE UPDATE ON public.valor_rebanho_mensal
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
