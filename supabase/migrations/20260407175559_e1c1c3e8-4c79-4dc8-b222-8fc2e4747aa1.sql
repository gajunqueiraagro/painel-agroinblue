
CREATE TABLE public.valor_rebanho_realizado_validado (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fazenda_id UUID NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  ano_mes TEXT NOT NULL,
  valor_total NUMERIC NOT NULL DEFAULT 0,
  cabecas INTEGER NOT NULL DEFAULT 0,
  peso_medio_kg NUMERIC NOT NULL DEFAULT 0,
  arrobas_total NUMERIC NOT NULL DEFAULT 0,
  preco_arroba_medio NUMERIC NOT NULL DEFAULT 0,
  valor_cabeca_medio NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'validado',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT uq_valor_reb_real_validado_fazenda_mes UNIQUE (fazenda_id, ano_mes)
);

ALTER TABLE public.valor_rebanho_realizado_validado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros podem ler valor rebanho realizado validado"
  ON public.valor_rebanho_realizado_validado FOR SELECT TO authenticated
  USING (public.is_cliente_member(auth.uid(), cliente_id));

CREATE POLICY "Membros podem inserir valor rebanho realizado validado"
  ON public.valor_rebanho_realizado_validado FOR INSERT TO authenticated
  WITH CHECK (public.is_cliente_member(auth.uid(), cliente_id));

CREATE POLICY "Membros podem atualizar valor rebanho realizado validado"
  ON public.valor_rebanho_realizado_validado FOR UPDATE TO authenticated
  USING (public.is_cliente_member(auth.uid(), cliente_id));

CREATE POLICY "Membros podem deletar valor rebanho realizado validado"
  ON public.valor_rebanho_realizado_validado FOR DELETE TO authenticated
  USING (public.is_cliente_member(auth.uid(), cliente_id));

CREATE TRIGGER update_valor_reb_real_validado_updated_at
  BEFORE UPDATE ON public.valor_rebanho_realizado_validado
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
