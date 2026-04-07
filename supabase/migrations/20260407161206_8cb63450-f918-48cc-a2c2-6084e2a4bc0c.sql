
-- Totais do valor do rebanho META por fazenda/mês
CREATE TABLE public.valor_rebanho_meta (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fazenda_id UUID NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  ano_mes TEXT NOT NULL,
  valor_total NUMERIC NOT NULL DEFAULT 0,
  cabecas INTEGER NOT NULL DEFAULT 0,
  peso_total_kg NUMERIC NOT NULL DEFAULT 0,
  peso_medio_kg NUMERIC NOT NULL DEFAULT 0,
  arrobas_total NUMERIC NOT NULL DEFAULT 0,
  preco_arroba_medio NUMERIC NOT NULL DEFAULT 0,
  valor_cabeca_medio NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'rascunho',
  validado_por UUID,
  validado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fazenda_id, ano_mes)
);

-- Itens por categoria
CREATE TABLE public.valor_rebanho_meta_itens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meta_id UUID NOT NULL REFERENCES public.valor_rebanho_meta(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 0,
  peso_medio_kg NUMERIC NOT NULL DEFAULT 0,
  preco_arroba NUMERIC NOT NULL DEFAULT 0,
  preco_kg NUMERIC NOT NULL DEFAULT 0,
  valor_cabeca NUMERIC NOT NULL DEFAULT 0,
  valor_total_categoria NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_valor_rebanho_meta_fazenda_mes ON public.valor_rebanho_meta(fazenda_id, ano_mes);
CREATE INDEX idx_valor_rebanho_meta_cliente ON public.valor_rebanho_meta(cliente_id);
CREATE INDEX idx_valor_rebanho_meta_itens_meta ON public.valor_rebanho_meta_itens(meta_id);

-- RLS
ALTER TABLE public.valor_rebanho_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.valor_rebanho_meta_itens ENABLE ROW LEVEL SECURITY;

-- Select: membros do cliente
CREATE POLICY "Membros podem ver valor rebanho meta"
ON public.valor_rebanho_meta FOR SELECT TO authenticated
USING (public.is_cliente_member(auth.uid(), cliente_id));

CREATE POLICY "Membros podem ver itens valor rebanho meta"
ON public.valor_rebanho_meta_itens FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.valor_rebanho_meta m
  WHERE m.id = meta_id AND public.is_cliente_member(auth.uid(), m.cliente_id)
));

-- Insert/Update/Delete: apenas admin
CREATE POLICY "Admin pode inserir valor rebanho meta"
ON public.valor_rebanho_meta FOR INSERT TO authenticated
WITH CHECK (public.is_admin_agroinblue(auth.uid()));

CREATE POLICY "Admin pode atualizar valor rebanho meta"
ON public.valor_rebanho_meta FOR UPDATE TO authenticated
USING (public.is_admin_agroinblue(auth.uid()));

CREATE POLICY "Admin pode excluir valor rebanho meta"
ON public.valor_rebanho_meta FOR DELETE TO authenticated
USING (public.is_admin_agroinblue(auth.uid()));

CREATE POLICY "Admin pode inserir itens valor rebanho meta"
ON public.valor_rebanho_meta_itens FOR INSERT TO authenticated
WITH CHECK (public.is_admin_agroinblue(auth.uid()));

CREATE POLICY "Admin pode atualizar itens valor rebanho meta"
ON public.valor_rebanho_meta_itens FOR UPDATE TO authenticated
USING (public.is_admin_agroinblue(auth.uid()));

CREATE POLICY "Admin pode excluir itens valor rebanho meta"
ON public.valor_rebanho_meta_itens FOR DELETE TO authenticated
USING (public.is_admin_agroinblue(auth.uid()));

-- Trigger updated_at
CREATE TRIGGER update_valor_rebanho_meta_updated_at
BEFORE UPDATE ON public.valor_rebanho_meta
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
