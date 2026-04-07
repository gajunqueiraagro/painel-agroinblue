
-- Tabela oficial: snapshot validado do Valor do Rebanho META
CREATE TABLE public.valor_rebanho_meta_validada (
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
  validado_por UUID,
  validado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fazenda_id, ano_mes)
);

-- Timestamps automáticos
CREATE TRIGGER update_valor_rebanho_meta_validada_updated_at
  BEFORE UPDATE ON public.valor_rebanho_meta_validada
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.valor_rebanho_meta_validada ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros podem ler valor_rebanho_meta_validada"
  ON public.valor_rebanho_meta_validada FOR SELECT TO authenticated
  USING (is_cliente_member(auth.uid(), cliente_id));

CREATE POLICY "Membros podem inserir valor_rebanho_meta_validada"
  ON public.valor_rebanho_meta_validada FOR INSERT TO authenticated
  WITH CHECK (is_cliente_member(auth.uid(), cliente_id));

CREATE POLICY "Membros podem atualizar valor_rebanho_meta_validada"
  ON public.valor_rebanho_meta_validada FOR UPDATE TO authenticated
  USING (is_cliente_member(auth.uid(), cliente_id));

CREATE POLICY "Membros podem excluir valor_rebanho_meta_validada"
  ON public.valor_rebanho_meta_validada FOR DELETE TO authenticated
  USING (is_cliente_member(auth.uid(), cliente_id));

-- Índice por fazenda + ano_mes
CREATE INDEX idx_valor_rebanho_meta_validada_fazenda_mes
  ON public.valor_rebanho_meta_validada (fazenda_id, ano_mes);
