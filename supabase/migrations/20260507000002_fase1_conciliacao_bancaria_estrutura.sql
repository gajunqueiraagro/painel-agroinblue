-- Fase 1 — Conciliação bancária profissional (estrutura base)
-- Tabelas:
--   extrato_bancario_v2: espelho do banco (movimentos brutos importados via OFX/CSV)
--   conciliacao_bancaria_itens: vínculo N:N entre extrato e financeiro_lancamentos_v2
--
-- NÃO altera: financeiro_extrato_bancario (legacy), financeiro_lancamentos_v2,
--             financeiro_saldos_bancarios_v2, financeiro_importacoes_v2, conciliação atual.
-- NÃO cria lançamentos automaticamente. NÃO faz matching automático.

-- ════════════════════════════════════════════════════════════════════════
-- TABELA: extrato_bancario_v2
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.extrato_bancario_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  conta_bancaria_id uuid NOT NULL REFERENCES public.financeiro_contas_bancarias(id) ON DELETE RESTRICT,
  importacao_id uuid NULL REFERENCES public.financeiro_importacoes_v2(id) ON DELETE SET NULL,
  data_movimento date NOT NULL,
  descricao text NULL,
  documento text NULL,
  valor numeric(14,2) NOT NULL,
  tipo_movimento text NOT NULL CHECK (tipo_movimento IN ('credito', 'debito')),
  saldo_apos numeric(14,2) NULL,
  hash_movimento text NOT NULL,
  status text NOT NULL DEFAULT 'nao_conciliado'
    CHECK (status IN ('nao_conciliado', 'parcial', 'conciliado', 'ignorado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unicidade por cliente — impede duplicar mesmo movimento na importação.
CREATE UNIQUE INDEX idx_extrato_v2_hash_unico
  ON public.extrato_bancario_v2 (cliente_id, hash_movimento);

CREATE INDEX idx_extrato_v2_cliente_id      ON public.extrato_bancario_v2 (cliente_id);
CREATE INDEX idx_extrato_v2_conta_data      ON public.extrato_bancario_v2 (conta_bancaria_id, data_movimento);
CREATE INDEX idx_extrato_v2_importacao_id   ON public.extrato_bancario_v2 (importacao_id);
CREATE INDEX idx_extrato_v2_status          ON public.extrato_bancario_v2 (status);

ALTER TABLE public.extrato_bancario_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros do cliente podem ver extrato_bancario_v2"
  ON public.extrato_bancario_v2 FOR SELECT TO authenticated
  USING (
    cliente_id IN (
      SELECT cm.cliente_id FROM public.cliente_membros cm
      WHERE cm.user_id = auth.uid() AND cm.ativo = true
    )
  );

CREATE POLICY "Membros do cliente podem inserir extrato_bancario_v2"
  ON public.extrato_bancario_v2 FOR INSERT TO authenticated
  WITH CHECK (
    cliente_id IN (
      SELECT cm.cliente_id FROM public.cliente_membros cm
      WHERE cm.user_id = auth.uid() AND cm.ativo = true
    )
  );

CREATE POLICY "Membros do cliente podem atualizar extrato_bancario_v2"
  ON public.extrato_bancario_v2 FOR UPDATE TO authenticated
  USING (
    cliente_id IN (
      SELECT cm.cliente_id FROM public.cliente_membros cm
      WHERE cm.user_id = auth.uid() AND cm.ativo = true
    )
  );

CREATE POLICY "Membros do cliente podem deletar extrato_bancario_v2"
  ON public.extrato_bancario_v2 FOR DELETE TO authenticated
  USING (
    cliente_id IN (
      SELECT cm.cliente_id FROM public.cliente_membros cm
      WHERE cm.user_id = auth.uid() AND cm.ativo = true
    )
  );

CREATE TRIGGER trg_extrato_v2_updated_at
  BEFORE UPDATE ON public.extrato_bancario_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ════════════════════════════════════════════════════════════════════════
-- TABELA: conciliacao_bancaria_itens (vínculo N:N)
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.conciliacao_bancaria_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  extrato_id uuid NOT NULL REFERENCES public.extrato_bancario_v2(id) ON DELETE CASCADE,
  lancamento_id uuid NOT NULL REFERENCES public.financeiro_lancamentos_v2(id) ON DELETE CASCADE,
  valor_aplicado numeric(14,2) NOT NULL,
  criado_por uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Impede duplicar mesma associação extrato↔lançamento.
CREATE UNIQUE INDEX idx_conciliacao_itens_par_unico
  ON public.conciliacao_bancaria_itens (extrato_id, lancamento_id);

CREATE INDEX idx_conciliacao_itens_cliente    ON public.conciliacao_bancaria_itens (cliente_id);
CREATE INDEX idx_conciliacao_itens_extrato    ON public.conciliacao_bancaria_itens (extrato_id);
CREATE INDEX idx_conciliacao_itens_lancamento ON public.conciliacao_bancaria_itens (lancamento_id);

ALTER TABLE public.conciliacao_bancaria_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros do cliente podem ver conciliacao_bancaria_itens"
  ON public.conciliacao_bancaria_itens FOR SELECT TO authenticated
  USING (
    cliente_id IN (
      SELECT cm.cliente_id FROM public.cliente_membros cm
      WHERE cm.user_id = auth.uid() AND cm.ativo = true
    )
  );

CREATE POLICY "Membros do cliente podem inserir conciliacao_bancaria_itens"
  ON public.conciliacao_bancaria_itens FOR INSERT TO authenticated
  WITH CHECK (
    cliente_id IN (
      SELECT cm.cliente_id FROM public.cliente_membros cm
      WHERE cm.user_id = auth.uid() AND cm.ativo = true
    )
  );

CREATE POLICY "Membros do cliente podem atualizar conciliacao_bancaria_itens"
  ON public.conciliacao_bancaria_itens FOR UPDATE TO authenticated
  USING (
    cliente_id IN (
      SELECT cm.cliente_id FROM public.cliente_membros cm
      WHERE cm.user_id = auth.uid() AND cm.ativo = true
    )
  );

CREATE POLICY "Membros do cliente podem deletar conciliacao_bancaria_itens"
  ON public.conciliacao_bancaria_itens FOR DELETE TO authenticated
  USING (
    cliente_id IN (
      SELECT cm.cliente_id FROM public.cliente_membros cm
      WHERE cm.user_id = auth.uid() AND cm.ativo = true
    )
  );
