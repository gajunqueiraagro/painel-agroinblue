
-- Add status_mes column (aberto/fechado/travado) replacing boolean fechado
ALTER TABLE public.financeiro_saldos_bancarios_v2 
  ADD COLUMN IF NOT EXISTS status_mes text NOT NULL DEFAULT 'aberto';

-- Migrate existing data: fechado=true → 'fechado', fechado=false → 'aberto'
UPDATE public.financeiro_saldos_bancarios_v2 SET status_mes = CASE WHEN fechado THEN 'fechado' ELSE 'aberto' END;

-- Add origin for saldo_inicial tracking
ALTER TABLE public.financeiro_saldos_bancarios_v2 
  ADD COLUMN IF NOT EXISTS origem_saldo_inicial text NOT NULL DEFAULT 'manual';

-- Add updated_by for audit
ALTER TABLE public.financeiro_saldos_bancarios_v2 
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- Create audit log table for saldos changes
CREATE TABLE IF NOT EXISTS public.financeiro_saldos_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saldo_id uuid NOT NULL REFERENCES public.financeiro_saldos_bancarios_v2(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  acao text NOT NULL,
  campo_alterado text,
  valor_anterior text,
  valor_novo text,
  usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financeiro_saldos_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.financeiro_saldos_audit FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));

CREATE POLICY "cliente_insert" ON public.financeiro_saldos_audit FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
