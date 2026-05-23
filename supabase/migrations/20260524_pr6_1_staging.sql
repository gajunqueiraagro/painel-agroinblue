-- ============================================================================
-- PR6.1 — Staging seguro (zero gravação no financeiro real)
-- ============================================================================
-- Camada intermediária entre Mesa finalizada e financeiro real.
-- Não escreve em financeiro_lancamentos_v2 nem cria fornecedores.
-- PR6.2 vai promover via RPC. PR6.3 vai reverter.
-- ============================================================================

-- 1. mesa_lancamento_staging
CREATE TABLE IF NOT EXISTS mesa_lancamento_staging (
  staging_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id uuid NOT NULL REFERENCES mesa_sessao(id) ON DELETE CASCADE,
  excel_key text NOT NULL,

  -- Espelho dos campos essenciais de financeiro_lancamentos_v2
  cliente_id uuid NOT NULL,
  fazenda_id uuid,
  conta_bancaria_id uuid,                 -- NULL se excel_orfao
  ano_mes text NOT NULL,
  data_pagamento date NOT NULL,
  data_competencia date,
  valor numeric NOT NULL CHECK (valor >= 0),
  sinal text CHECK (sinal IN ('1','-1','0')),
  tipo_operacao text CHECK (tipo_operacao IN ('1-Entradas','2-Saídas','3-Transferências')),
  macro_custo text,
  grupo_custo text,
  centro_custo text,
  subcentro text,
  escopo_negocio text,
  descricao text,
  observacao text,

  -- Fornecedor: ou ID existente ou nome para criar em PR6.2
  favorecido_id uuid,
  favorecido_nome_marcado_novo text,

  -- Vínculo Mesa
  ofx_extrato_id uuid,                    -- NULL se excel_orfao; FK suave
  produto text,
  origem_aprovacao text NOT NULL
    CHECK (origem_aprovacao IN ('sugestao_direta','corrigido','excel_orfao')),

  -- Proveniência / status
  status_promocao text NOT NULL DEFAULT 'pendente'
    CHECK (status_promocao IN ('pendente','promovido','descartado','erro')),
  lancamento_v2_id uuid,                  -- NULL até PR6.2 promover
  promovido_em timestamptz,
  promovido_por uuid,
  erro_promocao text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mesa_lancamento_staging_chave_unica
    UNIQUE (sessao_id, excel_key)
);

COMMENT ON TABLE mesa_lancamento_staging IS
  'Staging de lancamentos pre-promocao. Gerado por PR6.1 a partir de mesa_par aprovados/excel_orfao. PR6.2 promove para financeiro_lancamentos_v2. PR6.3 reverte.';
COMMENT ON COLUMN mesa_lancamento_staging.conta_bancaria_id IS
  'NULL quando origem_aprovacao=excel_orfao (lancamento sem OFX correspondente).';
COMMENT ON COLUMN mesa_lancamento_staging.ofx_extrato_id IS
  'NULL quando origem_aprovacao=excel_orfao. Referencia extrato_bancario_v2.id.';
COMMENT ON COLUMN mesa_lancamento_staging.favorecido_nome_marcado_novo IS
  'Nome do fornecedor a criar em PR6.2 (quando operador marcou como novo via fornecedorMarcadoNovo na Mesa).';

CREATE INDEX IF NOT EXISTS idx_mesa_staging_sessao_status
  ON mesa_lancamento_staging (sessao_id, status_promocao);
CREATE INDEX IF NOT EXISTS idx_mesa_staging_cliente
  ON mesa_lancamento_staging (cliente_id, status_promocao);
CREATE INDEX IF NOT EXISTS idx_mesa_staging_lancamento_v2
  ON mesa_lancamento_staging (lancamento_v2_id) WHERE lancamento_v2_id IS NOT NULL;

-- 2. Trigger updated_at (reusa funcao criada em PR5)
DROP TRIGGER IF EXISTS trg_mesa_staging_updated_at ON mesa_lancamento_staging;
CREATE TRIGGER trg_mesa_staging_updated_at
  BEFORE UPDATE ON mesa_lancamento_staging
  FOR EACH ROW EXECUTE FUNCTION mesa_trg_updated_at();

-- 3. RLS permissivo (segue padrao do projeto no proto)
ALTER TABLE mesa_lancamento_staging ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='mesa_lancamento_staging' AND policyname='mesa_lancamento_staging_all'
  ) THEN
    CREATE POLICY mesa_lancamento_staging_all ON mesa_lancamento_staging
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
