
-- =============================================
-- ETAPA 3: Extrato, Conciliação, Saldos v2
-- =============================================

-- 1. financeiro_extrato_bancario
CREATE TABLE public.financeiro_extrato_bancario (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  conta_bancaria_id uuid NOT NULL REFERENCES public.financeiro_contas_bancarias(id) ON DELETE CASCADE,
  importacao_id uuid REFERENCES public.financeiro_importacoes_v2(id),
  data_movimento date NOT NULL,
  descricao_banco text,
  documento text,
  valor numeric NOT NULL DEFAULT 0,
  tipo_movimento text NOT NULL DEFAULT 'debito',
  saldo_apos numeric,
  hash_conciliacao text,
  conciliado boolean NOT NULL DEFAULT false,
  conciliado_em timestamptz,
  lancamento_id uuid REFERENCES public.financeiro_lancamentos_v2(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fin_extrato_cliente ON public.financeiro_extrato_bancario(cliente_id);
CREATE INDEX idx_fin_extrato_conta ON public.financeiro_extrato_bancario(conta_bancaria_id);
CREATE INDEX idx_fin_extrato_data ON public.financeiro_extrato_bancario(data_movimento);
CREATE INDEX idx_fin_extrato_hash ON public.financeiro_extrato_bancario(hash_conciliacao);
CREATE INDEX idx_fin_extrato_conciliado ON public.financeiro_extrato_bancario(conciliado);

ALTER TABLE public.financeiro_extrato_bancario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.financeiro_extrato_bancario FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.financeiro_extrato_bancario FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.financeiro_extrato_bancario FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.financeiro_extrato_bancario FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));

-- 2. financeiro_conciliacoes
CREATE TABLE public.financeiro_conciliacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  conta_bancaria_id uuid NOT NULL REFERENCES public.financeiro_contas_bancarias(id) ON DELETE CASCADE,
  extrato_id uuid REFERENCES public.financeiro_extrato_bancario(id),
  lancamento_id uuid REFERENCES public.financeiro_lancamentos_v2(id),
  tipo_conciliacao text NOT NULL DEFAULT 'automatica',
  observacao text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fin_concil_cliente ON public.financeiro_conciliacoes(cliente_id);
CREATE INDEX idx_fin_concil_conta ON public.financeiro_conciliacoes(conta_bancaria_id);
CREATE INDEX idx_fin_concil_extrato ON public.financeiro_conciliacoes(extrato_id);
CREATE INDEX idx_fin_concil_lanc ON public.financeiro_conciliacoes(lancamento_id);

ALTER TABLE public.financeiro_conciliacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.financeiro_conciliacoes FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.financeiro_conciliacoes FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.financeiro_conciliacoes FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.financeiro_conciliacoes FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));

-- 3. financeiro_saldos_bancarios_v2
CREATE TABLE public.financeiro_saldos_bancarios_v2 (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  conta_bancaria_id uuid NOT NULL REFERENCES public.financeiro_contas_bancarias(id) ON DELETE CASCADE,
  ano_mes text NOT NULL,
  saldo_inicial numeric NOT NULL DEFAULT 0,
  saldo_final numeric NOT NULL DEFAULT 0,
  origem_saldo text DEFAULT 'manual',
  observacao text,
  fechado boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fin_saldos_v2_cliente ON public.financeiro_saldos_bancarios_v2(cliente_id);
CREATE INDEX idx_fin_saldos_v2_fazenda ON public.financeiro_saldos_bancarios_v2(fazenda_id);
CREATE INDEX idx_fin_saldos_v2_conta ON public.financeiro_saldos_bancarios_v2(conta_bancaria_id);
CREATE INDEX idx_fin_saldos_v2_anomes ON public.financeiro_saldos_bancarios_v2(ano_mes);

ALTER TABLE public.financeiro_saldos_bancarios_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.financeiro_saldos_bancarios_v2 FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.financeiro_saldos_bancarios_v2 FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.financeiro_saldos_bancarios_v2 FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.financeiro_saldos_bancarios_v2 FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));

CREATE TRIGGER update_fin_saldos_v2_updated_at
  BEFORE UPDATE ON public.financeiro_saldos_bancarios_v2
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
