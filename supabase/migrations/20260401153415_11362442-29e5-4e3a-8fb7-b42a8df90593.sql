-- 1. Add soft-delete columns to lancamentos
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS cancelado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por uuid;

-- Index for filtering active records
CREATE INDEX IF NOT EXISTS idx_lancamentos_cancelado ON public.lancamentos (cancelado) WHERE cancelado = false;

-- 2. Audit log table for movimentações
CREATE TABLE public.audit_log_movimentacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  usuario_id uuid,
  acao text NOT NULL,
  movimentacao_id uuid,
  financeiro_ids uuid[],
  detalhes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log_movimentacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.audit_log_movimentacoes
  FOR SELECT TO authenticated
  USING (
    cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid()))
    OR public.is_admin_agroinblue(auth.uid())
  );

CREATE POLICY "cliente_insert" ON public.audit_log_movimentacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid()))
    OR public.is_admin_agroinblue(auth.uid())
  );

CREATE INDEX idx_audit_log_mov_cliente ON public.audit_log_movimentacoes (cliente_id, created_at DESC);
CREATE INDEX idx_audit_log_mov_movimentacao ON public.audit_log_movimentacoes (movimentacao_id);