
CREATE TABLE public.meta_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  ano integer NOT NULL,
  nome text NOT NULL,
  descricao text,
  criado_por text,
  created_at timestamptz DEFAULT now(),
  dados jsonb NOT NULL DEFAULT '[]'
);

CREATE INDEX idx_meta_versoes_cliente_ano ON public.meta_versoes(cliente_id, ano);

ALTER TABLE public.meta_versoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros do cliente podem ver versões"
  ON public.meta_versoes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cliente_membros cm
      WHERE cm.cliente_id = meta_versoes.cliente_id
        AND cm.user_id = auth.uid()
        AND cm.ativo = true
    )
  );

CREATE POLICY "Membros do cliente podem criar versões"
  ON public.meta_versoes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cliente_membros cm
      WHERE cm.cliente_id = meta_versoes.cliente_id
        AND cm.user_id = auth.uid()
        AND cm.ativo = true
    )
  );

CREATE POLICY "Membros do cliente podem excluir versões"
  ON public.meta_versoes FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cliente_membros cm
      WHERE cm.cliente_id = meta_versoes.cliente_id
        AND cm.user_id = auth.uid()
        AND cm.ativo = true
    )
  );
