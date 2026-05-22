-- PR0.A · Mesa Operacional v2 · Índices novos
-- NÃO recriar índices que já existem (dedup hash, par único conciliação, etc).
-- Apenas índices novos: trigram para busca textual + parciais para flags + staging/audit.

-- Busca textual estruturada (regra 14 do Manifesto Visual)
CREATE INDEX IF NOT EXISTS idx_extrato_descricao_trgm
  ON extrato_bancario_v2 USING gin (descricao gin_trgm_ops)
  WHERE cancelado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_extrato_historico_trgm
  ON extrato_bancario_v2 USING gin (historico gin_trgm_ops)
  WHERE cancelado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_lanc_descricao_trgm
  ON financeiro_lancamentos_v2 USING gin (descricao gin_trgm_ops)
  WHERE cancelado = false;

-- Flag suspeita (parcial — só linhas suspeitas indexadas)
CREATE INDEX IF NOT EXISTS idx_extrato_suspeitas
  ON extrato_bancario_v2 (cliente_id, data_movimento DESC)
  WHERE (flag_suspeita_valor OR flag_suspeita_fornecedor)
    AND cancelado_em IS NULL;

-- Órfão definitivo (parcial)
CREATE INDEX IF NOT EXISTS idx_extrato_orfao_definitivo
  ON extrato_bancario_v2 (cliente_id, data_movimento DESC)
  WHERE orfao_definitivo = true AND cancelado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_lanc_orfao_definitivo
  ON financeiro_lancamentos_v2 (cliente_id, data_pagamento DESC)
  WHERE orfao_definitivo = true AND cancelado = false;

-- Staging: lookup por owner + status
CREATE INDEX IF NOT EXISTS idx_staging_owner_status
  ON extrato_bancario_staging (owner_user_id, status);

CREATE INDEX IF NOT EXISTS idx_staging_expira
  ON extrato_bancario_staging (expira_em)
  WHERE status = 'aberto';

CREATE UNIQUE INDEX IF NOT EXISTS idx_staging_hash_owner_cliente
  ON extrato_bancario_staging (cliente_id, owner_user_id, hash_arquivo)
  WHERE status = 'aberto';

-- Staging itens: lookup por staging + hash
CREATE INDEX IF NOT EXISTS idx_staging_itens_staging
  ON extrato_bancario_staging_itens (staging_id);

CREATE INDEX IF NOT EXISTS idx_staging_itens_hash
  ON extrato_bancario_staging_itens (hash_movimento);

-- Audit: lookup por entidade
CREATE INDEX IF NOT EXISTS idx_audit_extrato_data
  ON conciliacao_audit_log (extrato_id, created_at DESC)
  WHERE extrato_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_lancamento_data
  ON conciliacao_audit_log (lancamento_id, created_at DESC)
  WHERE lancamento_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_cliente_acao_data
  ON conciliacao_audit_log (cliente_id, acao, created_at DESC);
