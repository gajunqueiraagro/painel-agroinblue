-- ============================================================================
-- PR5 — Persistência da Sessão da Mesa de Pareamento
-- ============================================================================
-- Cria 3 tabelas + UNIQUE + ON DELETE CASCADE + RLS permissivo + triggers
-- updated_at. NÃO promove para lançamento real (vira PR6 com staging).
--
-- Multi-tenant RLS restritivo registrado como pendência separada do roadmap
-- (ver INCIDENTE 30/04/2026). Este PR segue padrão atual do proto.
-- ============================================================================

-- 1. mesa_sessao
CREATE TABLE IF NOT EXISTS mesa_sessao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  conta_bancaria_id uuid NOT NULL,
  ano_mes text NOT NULL,
  status text NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('em_andamento', 'finalizada')),
  excel_lotes_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ofx_extratos_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT mesa_sessao_chave_unica
    UNIQUE (cliente_id, conta_bancaria_id, ano_mes)
);

COMMENT ON TABLE mesa_sessao IS
  'Sessao persistida da Mesa de Pareamento. Unica por (cliente, conta, mes). PR5.';
COMMENT ON COLUMN mesa_sessao.excel_lotes_json IS
  'Snapshot do Excel parseado (array de LoteExcel). Permite reabrir sessao sem re-upload.';
COMMENT ON COLUMN mesa_sessao.ofx_extratos_ids IS
  'IDs dos extratos OFX vinculados (referencia a extratos_bancarios_v2).';

CREATE INDEX IF NOT EXISTS idx_mesa_sessao_cliente
  ON mesa_sessao (cliente_id, status);
CREATE INDEX IF NOT EXISTS idx_mesa_sessao_atualizada
  ON mesa_sessao (updated_at DESC);

-- 2. mesa_par
CREATE TABLE IF NOT EXISTS mesa_par (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id uuid NOT NULL REFERENCES mesa_sessao(id) ON DELETE CASCADE,
  excel_key text NOT NULL,
  ofx_id_ativo uuid,
  ofx_id_sugerido_original uuid,
  decisao text NOT NULL DEFAULT 'pendente'
    CHECK (decisao IN ('pendente', 'aprovado', 'rejeitado', 'excel_orfao')),
  correcao_json jsonb,
  aprovacao_json jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mesa_par_chave_unica UNIQUE (sessao_id, excel_key)
);

COMMENT ON TABLE mesa_par IS
  'Par Excel x OFX persistido com decisao do operador. PR5.';
COMMENT ON COLUMN mesa_par.excel_key IS
  'Chave loteId:indiceLinha do par. Unica dentro da sessao.';
COMMENT ON COLUMN mesa_par.correcao_json IS
  'ParCorrecao (PR4) serializada. Null se operador nao corrigiu.';
COMMENT ON COLUMN mesa_par.aprovacao_json IS
  'AprovacaoLocal (PR4) - fotografia consolidada. Populada apenas quando decisao=aprovado.';

CREATE INDEX IF NOT EXISTS idx_mesa_par_sessao_decisao
  ON mesa_par (sessao_id, decisao);

-- 3. mesa_ofx_validacao
CREATE TABLE IF NOT EXISTS mesa_ofx_validacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id uuid NOT NULL REFERENCES mesa_sessao(id) ON DELETE CASCADE,
  ofx_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'ofx_orfao_validado')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mesa_ofx_validacao_chave_unica UNIQUE (sessao_id, ofx_id)
);

COMMENT ON TABLE mesa_ofx_validacao IS
  'Validacao manual de OFX como orfao (sem Excel correspondente). PR3.3 persistido. PR5.';

CREATE INDEX IF NOT EXISTS idx_mesa_ofx_validacao_sessao
  ON mesa_ofx_validacao (sessao_id, status);

-- 4. Trigger updated_at
CREATE OR REPLACE FUNCTION mesa_trg_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mesa_sessao_updated_at ON mesa_sessao;
CREATE TRIGGER trg_mesa_sessao_updated_at
  BEFORE UPDATE ON mesa_sessao
  FOR EACH ROW EXECUTE FUNCTION mesa_trg_updated_at();

DROP TRIGGER IF EXISTS trg_mesa_par_updated_at ON mesa_par;
CREATE TRIGGER trg_mesa_par_updated_at
  BEFORE UPDATE ON mesa_par
  FOR EACH ROW EXECUTE FUNCTION mesa_trg_updated_at();

DROP TRIGGER IF EXISTS trg_mesa_ofx_validacao_updated_at ON mesa_ofx_validacao;
CREATE TRIGGER trg_mesa_ofx_validacao_updated_at
  BEFORE UPDATE ON mesa_ofx_validacao
  FOR EACH ROW EXECUTE FUNCTION mesa_trg_updated_at();

-- 5. RLS — permissivo (segue padrao do projeto no proto)
ALTER TABLE mesa_sessao ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesa_par ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesa_ofx_validacao ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- mesa_sessao
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mesa_sessao' AND policyname='mesa_sessao_all') THEN
    CREATE POLICY mesa_sessao_all ON mesa_sessao FOR ALL USING (true) WITH CHECK (true);
  END IF;
  -- mesa_par
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mesa_par' AND policyname='mesa_par_all') THEN
    CREATE POLICY mesa_par_all ON mesa_par FOR ALL USING (true) WITH CHECK (true);
  END IF;
  -- mesa_ofx_validacao
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mesa_ofx_validacao' AND policyname='mesa_ofx_validacao_all') THEN
    CREATE POLICY mesa_ofx_validacao_all ON mesa_ofx_validacao FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
