
-- Create contracts table
CREATE TABLE public.financeiro_contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id),
  fornecedor_id uuid REFERENCES public.financeiro_fornecedores(id),
  produto text,
  valor numeric NOT NULL DEFAULT 0,
  frequencia text NOT NULL DEFAULT 'mensal',
  data_inicio date NOT NULL,
  data_fim date,
  dia_pagamento integer NOT NULL DEFAULT 1,
  forma_pagamento text,
  dados_pagamento text,
  conta_bancaria_id uuid REFERENCES public.financeiro_contas_bancarias(id),
  subcentro text,
  centro_custo text,
  macro_custo text,
  observacao text,
  status text NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

-- Enable RLS
ALTER TABLE public.financeiro_contratos ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "cliente_select" ON public.financeiro_contratos FOR SELECT TO authenticated
  USING ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));

CREATE POLICY "cliente_insert" ON public.financeiro_contratos FOR INSERT TO authenticated
  WITH CHECK ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));

CREATE POLICY "cliente_update" ON public.financeiro_contratos FOR UPDATE TO authenticated
  USING ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));

CREATE POLICY "cliente_delete" ON public.financeiro_contratos FOR DELETE TO authenticated
  USING ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));

-- Add contrato_id to lancamentos_v2
ALTER TABLE public.financeiro_lancamentos_v2
  ADD COLUMN contrato_id uuid REFERENCES public.financeiro_contratos(id) ON DELETE SET NULL;

-- Updated_at trigger
CREATE TRIGGER set_updated_at_financeiro_contratos
  BEFORE UPDATE ON public.financeiro_contratos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
