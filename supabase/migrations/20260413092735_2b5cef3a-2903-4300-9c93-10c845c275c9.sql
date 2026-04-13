
-- Tabela de planejamento financeiro (META)
CREATE TABLE public.planejamento_financeiro (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  fazenda_id UUID NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  centro_custo TEXT NOT NULL,
  subcentro TEXT,
  tipo_custo TEXT NOT NULL DEFAULT 'fixo' CHECK (tipo_custo IN ('fixo', 'variavel')),
  driver TEXT,
  valor_base NUMERIC NOT NULL DEFAULT 0,
  quantidade_driver NUMERIC NOT NULL DEFAULT 0,
  valor_planejado NUMERIC NOT NULL DEFAULT 0,
  origem TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'replicado', 'calculado')),
  cenario TEXT NOT NULL DEFAULT 'meta',
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fazenda_id, ano, mes, subcentro, cenario)
);

-- Index para queries por fazenda/ano
CREATE INDEX idx_planejamento_fin_fazenda_ano ON public.planejamento_financeiro (fazenda_id, ano, cenario);

-- Enable RLS
ALTER TABLE public.planejamento_financeiro ENABLE ROW LEVEL SECURITY;

-- Policies via fazenda_membros
CREATE POLICY "Membros podem ler planejamento da fazenda"
  ON public.planejamento_financeiro FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fazenda_membros fm
      WHERE fm.fazenda_id = planejamento_financeiro.fazenda_id
        AND fm.user_id = auth.uid()
    )
  );

CREATE POLICY "Membros podem inserir planejamento na fazenda"
  ON public.planejamento_financeiro FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.fazenda_membros fm
      WHERE fm.fazenda_id = planejamento_financeiro.fazenda_id
        AND fm.user_id = auth.uid()
    )
  );

CREATE POLICY "Membros podem atualizar planejamento da fazenda"
  ON public.planejamento_financeiro FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fazenda_membros fm
      WHERE fm.fazenda_id = planejamento_financeiro.fazenda_id
        AND fm.user_id = auth.uid()
    )
  );

CREATE POLICY "Membros podem deletar planejamento da fazenda"
  ON public.planejamento_financeiro FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fazenda_membros fm
      WHERE fm.fazenda_id = planejamento_financeiro.fazenda_id
        AND fm.user_id = auth.uid()
    )
  );

-- Trigger para updated_at
CREATE TRIGGER update_planejamento_financeiro_updated_at
  BEFORE UPDATE ON public.planejamento_financeiro
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
