
CREATE TABLE public.valor_rebanho_fechamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  ano_mes text NOT NULL,
  status text NOT NULL DEFAULT 'aberto',
  fechado_por uuid REFERENCES auth.users(id),
  fechado_em timestamp with time zone,
  reaberto_por uuid REFERENCES auth.users(id),
  reaberto_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(fazenda_id, ano_mes)
);

ALTER TABLE public.valor_rebanho_fechamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view fechamento_valor" ON public.valor_rebanho_fechamento
  FOR SELECT TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));

CREATE POLICY "Members can insert fechamento_valor" ON public.valor_rebanho_fechamento
  FOR INSERT TO authenticated WITH CHECK (is_fazenda_member(auth.uid(), fazenda_id));

CREATE POLICY "Members can update fechamento_valor" ON public.valor_rebanho_fechamento
  FOR UPDATE TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));

CREATE POLICY "Members can delete fechamento_valor" ON public.valor_rebanho_fechamento
  FOR DELETE TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));
