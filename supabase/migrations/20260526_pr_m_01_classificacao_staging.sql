-- ====================================================================
-- PR-M (26/05/2026) — Staging de classificação a partir de Excel referência
-- ====================================================================
-- Tabela dedicada ao caso "operador envia Excel com classificação rica
-- (subcentro, fornecedor, etc.) e queremos APLICAR essa classificação
-- em lançamentos JÁ existentes em financeiro_lancamentos_v2 que estão
-- sem classificação útil".
--
-- SEPARADA de mesa_lancamento_staging porque a semântica é oposta:
--   mesa_lancamento_staging → PROMOVE (cria lanc novo a partir do Excel)
--   financeiro_classificacao_staging → APLICA (UPDATE em lanc existente)
--
-- Fluxo operacional (CRÍTICO — leia antes de usar):
--   1. Operador converte Excel → JSON (script local, sem UI nesta fase)
--   2. Chama fn_classificacao_populate_staging(sessao_id, cliente_id, rows)
--   3. CONSULTA staging para revisão manual:
--        SELECT match_status, COUNT(*) FROM financeiro_classificacao_staging
--        WHERE sessao_id = $1 GROUP BY match_status;
--   4. Inspeciona amostras de 'exato', 'ambiguo', 'sem_match', 'divergente'
--   5. (aprovação manual fora do sistema)
--   6. Chama fn_classificacao_apply(sessao_id) — UPDATE só em 'exato' + subcentro NULL
--
-- Rollback cirúrgico: cada UPDATE preserva estado_anterior em jsonb na
-- staging row. Operador pode reverter por sessão via SQL ad-hoc.
-- ====================================================================

CREATE TABLE IF NOT EXISTS financeiro_classificacao_staging (
  staging_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Sessão livre (sem FK). Mesma sessao_id agrupa todas as linhas de
  -- uma importação Excel. Permite rollback cirúrgico por sessão.
  sessao_id           uuid NOT NULL,
  cliente_id          uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,

  -- Dados crus do Excel (auditoria + matching)
  excel_linha_origem      int,                  -- número da linha no XLSX (1-based)
  excel_subcentro         text,
  excel_fornecedor        text,
  excel_produto           text,
  excel_conta_origem      text,                 -- string original: "cc-001 | banco do brasil pecuária"
  excel_conta_destino     text,
  excel_ano_mes           text,                 -- 'YYYY-MM'
  excel_data              date,
  excel_valor             numeric,              -- abs do Excel (positivo)
  excel_tipo_operacao     text,                 -- normalizado: 1-Entradas / 2-Saídas / 3-Transferências
  excel_fazenda_codigo    text,                 -- ADM / SR / BR (matched contra fazendas.codigo_importacao)

  -- Resultado do matching contra financeiro_lancamentos_v2
  match_lancamento_id     uuid REFERENCES financeiro_lancamentos_v2(id) ON DELETE SET NULL,
  match_status            text NOT NULL
                          CHECK (match_status IN (
                            'exato',           -- 1 lanc bate todos os critérios + subcentro NULL → candidato UPDATE
                            'ambiguo',         -- 2+ lanc batem → não atualizar, revisão manual
                            'sem_match',       -- nenhum lanc bate → revisão manual
                            'ja_classificado', -- match único + lanc já tem subcentro = Excel → no-op
                            'divergente'       -- match único + lanc tem subcentro DIFERENTE do Excel → relatório, NÃO atualizar
                          )),

  -- Payload do UPDATE proposto (apenas para 'exato'). Estrutura jsonb:
  --   { subcentro, macro_custo, grupo_custo, centro_custo,
  --     plano_conta_id, favorecido_id }
  -- Campos que não puderam ser resolvidos por lookup determinístico
  -- ficam NULL no jsonb (apply NÃO sobrescreve com NULL).
  update_proposto         jsonb,

  -- Snapshot do estado pré-UPDATE para rollback cirúrgico.
  -- Populado por fn_classificacao_apply imediatamente antes do UPDATE.
  -- NULL enquanto aplicado=false.
  estado_anterior         jsonb,

  -- Controle de aplicação
  aplicado                boolean NOT NULL DEFAULT false,
  aplicado_em             timestamptz,
  aplicado_por            uuid,
  erro_apply              text,                 -- mensagem de erro se UPDATE falhar

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- Evita duplicar a mesma linha do Excel na mesma sessão
  CONSTRAINT financeiro_classificacao_staging_chave_unica
    UNIQUE (sessao_id, excel_linha_origem)
);

COMMENT ON TABLE financeiro_classificacao_staging IS
  'PR-M (26/05/2026): staging Excel→UPDATE. Cada sessao_id agrupa uma importacao. Consultar antes de aplicar via fn_classificacao_apply. Rollback via estado_anterior.';

COMMENT ON COLUMN financeiro_classificacao_staging.match_status IS
  'exato=UPDATE elegivel; ambiguo/sem_match/divergente=apenas relatorio; ja_classificado=no-op.';

COMMENT ON COLUMN financeiro_classificacao_staging.update_proposto IS
  'jsonb com subcentro/macro/grupo/centro/plano_conta_id/favorecido_id. Apply usa COALESCE para nao sobrescrever com NULL.';

COMMENT ON COLUMN financeiro_classificacao_staging.estado_anterior IS
  'Snapshot pre-UPDATE. Permite rollback cirurgico via UPDATE ... SET subcentro=estado_anterior->>''subcentro'' WHERE id=match_lancamento_id.';

-- Índices
CREATE INDEX IF NOT EXISTS idx_fin_classif_staging_sessao
  ON financeiro_classificacao_staging (sessao_id);
CREATE INDEX IF NOT EXISTS idx_fin_classif_staging_status
  ON financeiro_classificacao_staging (sessao_id, match_status);
CREATE INDEX IF NOT EXISTS idx_fin_classif_staging_cliente
  ON financeiro_classificacao_staging (cliente_id, aplicado);
CREATE INDEX IF NOT EXISTS idx_fin_classif_staging_lanc
  ON financeiro_classificacao_staging (match_lancamento_id)
  WHERE match_lancamento_id IS NOT NULL;

-- Trigger updated_at (reusa função genérica do projeto se existir,
-- senão define uma inline).
CREATE OR REPLACE FUNCTION fin_classif_staging_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_classif_staging_updated_at
  ON financeiro_classificacao_staging;
CREATE TRIGGER trg_fin_classif_staging_updated_at
  BEFORE UPDATE ON financeiro_classificacao_staging
  FOR EACH ROW EXECUTE FUNCTION fin_classif_staging_set_updated_at();

-- RLS — espelha o padrão do projeto (mesa_lancamento_staging usa
-- USING(true) WITH CHECK(true)). Como esta tabela só é manipulada via
-- RPCs SECURITY DEFINER no piloto, a policy permissiva não é problema
-- de segurança real. Pode ser endurecida em PR futuro.
ALTER TABLE financeiro_classificacao_staging ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='financeiro_classificacao_staging'
      AND policyname='financeiro_classificacao_staging_all'
  ) THEN
    CREATE POLICY financeiro_classificacao_staging_all
      ON financeiro_classificacao_staging
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
