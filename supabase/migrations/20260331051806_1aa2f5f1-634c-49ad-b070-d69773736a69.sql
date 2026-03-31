
-- Add referencia_rebanho to pastos (optional text field)
ALTER TABLE public.pastos ADD COLUMN IF NOT EXISTS referencia_rebanho text;
ALTER TABLE public.pastos ADD COLUMN IF NOT EXISTS situacao text NOT NULL DEFAULT 'ativo';

-- Table: pasto-level movements (independent, simplified)
CREATE TABLE public.pasto_movimentacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  pasto_origem_id uuid REFERENCES public.pastos(id) ON DELETE SET NULL,
  pasto_destino_id uuid REFERENCES public.pastos(id) ON DELETE SET NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  tipo text NOT NULL,
  quantidade integer NOT NULL DEFAULT 0,
  categoria text,
  peso_medio_kg numeric,
  referencia_rebanho text,
  observacoes text,
  registrado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- future: lote_id uuid REFERENCES ... (prepared for formal lot)
  lote_id uuid
);

ALTER TABLE public.pasto_movimentacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.pasto_movimentacoes FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.pasto_movimentacoes FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.pasto_movimentacoes FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.pasto_movimentacoes FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));

CREATE INDEX idx_pasto_mov_origem ON public.pasto_movimentacoes(pasto_origem_id);
CREATE INDEX idx_pasto_mov_destino ON public.pasto_movimentacoes(pasto_destino_id);
CREATE INDEX idx_pasto_mov_data ON public.pasto_movimentacoes(data DESC);
