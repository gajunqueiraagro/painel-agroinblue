-- PR0.A · Mesa Operacional v2 · Alter conciliacao_bancaria_itens
-- Snapshot de match (princípio 9: contexto histórico preservado) + reversibilidade.

ALTER TABLE conciliacao_bancaria_itens
  ADD COLUMN IF NOT EXISTS sugestao_score_aprovado NUMERIC(5,2) NULL,
  ADD COLUMN IF NOT EXISTS snapshot_extrato_valor NUMERIC(15,2) NULL,
  ADD COLUMN IF NOT EXISTS snapshot_lancamento_valor NUMERIC(15,2) NULL,
  ADD COLUMN IF NOT EXISTS snapshot_extrato_data DATE NULL,
  ADD COLUMN IF NOT EXISTS snapshot_lancamento_data DATE NULL,
  ADD COLUMN IF NOT EXISTS snapshot_favorecido_id UUID NULL,
  ADD COLUMN IF NOT EXISTS snapshot_historico_banco TEXT NULL,
  ADD COLUMN IF NOT EXISTS snapshot_flags_no_momento JSONB NULL,
  ADD COLUMN IF NOT EXISTS tipo_aprovacao TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS aprovado_por UUID NULL,
  ADD COLUMN IF NOT EXISTS aprovado_em TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS desfeito_em TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS desfeito_por UUID NULL,
  ADD COLUMN IF NOT EXISTS desfeito_motivo TEXT NULL;

DO $$ BEGIN
  ALTER TABLE conciliacao_bancaria_itens
    ADD CONSTRAINT chk_tipo_aprovacao
    CHECK (tipo_aprovacao IN (
      'manual','sugestao_forte_aprovada','sugestao_fraca_aprovada','staging_auto'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN conciliacao_bancaria_itens.snapshot_extrato_valor IS
'Mesa Operacional v2. Valor do extrato no momento da conciliação.
Preserva contexto histórico mesmo se extrato for editado depois. Criada PR0.A.';

COMMENT ON COLUMN conciliacao_bancaria_itens.snapshot_lancamento_valor IS
'Mesa Operacional v2. Valor do lançamento no momento da conciliação.
Preserva contexto histórico mesmo se lançamento for editado depois. Criada PR0.A.';

COMMENT ON COLUMN conciliacao_bancaria_itens.snapshot_flags_no_momento IS
'Mesa Operacional v2. JSONB com flags ortogonais ativas no momento da
conciliação (suspeita_valor, suspeita_fornecedor, etc). Permite auditoria
posterior do contexto. Criada PR0.A.';

COMMENT ON COLUMN conciliacao_bancaria_itens.tipo_aprovacao IS
'Mesa Operacional v2. Como esta conciliação foi aprovada:
manual / sugestao_forte_aprovada / sugestao_fraca_aprovada / staging_auto.
Criada PR0.A.';

COMMENT ON COLUMN conciliacao_bancaria_itens.desfeito_em IS
'Mesa Operacional v2. Soft delete da conciliação. NUNCA DELETE físico.
Audit log registra desfazimento. Criada PR0.A.';
