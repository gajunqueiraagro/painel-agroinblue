
-- Tabela de controle mensal de fazenda ativa/inativa
CREATE TABLE public.fazenda_status_mensal (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fazenda_id UUID NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  ano_mes TEXT NOT NULL,
  ativa_no_mes BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(fazenda_id, ano_mes)
);

-- Enable RLS
ALTER TABLE public.fazenda_status_mensal ENABLE ROW LEVEL SECURITY;

-- Policy: membros do cliente podem ler
CREATE POLICY "Membros do cliente podem ver status mensal"
  ON public.fazenda_status_mensal
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cliente_membros cm
      WHERE cm.cliente_id = fazenda_status_mensal.cliente_id
        AND cm.user_id = auth.uid()
        AND cm.ativo = true
    )
  );

-- Policy: membros do cliente podem inserir
CREATE POLICY "Membros do cliente podem inserir status mensal"
  ON public.fazenda_status_mensal
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cliente_membros cm
      WHERE cm.cliente_id = fazenda_status_mensal.cliente_id
        AND cm.user_id = auth.uid()
        AND cm.ativo = true
    )
  );

-- Policy: membros do cliente podem atualizar
CREATE POLICY "Membros do cliente podem atualizar status mensal"
  ON public.fazenda_status_mensal
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cliente_membros cm
      WHERE cm.cliente_id = fazenda_status_mensal.cliente_id
        AND cm.user_id = auth.uid()
        AND cm.ativo = true
    )
  );

-- Policy: membros do cliente podem deletar
CREATE POLICY "Membros do cliente podem deletar status mensal"
  ON public.fazenda_status_mensal
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cliente_membros cm
      WHERE cm.cliente_id = fazenda_status_mensal.cliente_id
        AND cm.user_id = auth.uid()
        AND cm.ativo = true
    )
  );

-- Index para performance
CREATE INDEX idx_fazenda_status_mensal_fazenda ON public.fazenda_status_mensal(fazenda_id, ano_mes);
CREATE INDEX idx_fazenda_status_mensal_cliente ON public.fazenda_status_mensal(cliente_id);
