-- PR0.A · Rollback completo
-- ATENÇÃO: NÃO aplicar no fluxo normal. Apenas em emergência.
-- Idempotente — pode rodar múltiplas vezes.

-- Triggers
DROP TRIGGER IF EXISTS trg_audit_bloqueia_update ON conciliacao_audit_log;
DROP TRIGGER IF EXISTS trg_audit_bloqueia_delete ON conciliacao_audit_log;
DROP TRIGGER IF EXISTS trg_snapshot_conciliacao ON conciliacao_bancaria_itens;
DROP TRIGGER IF EXISTS trg_audit_conciliacao ON conciliacao_bancaria_itens;
DROP TRIGGER IF EXISTS trg_guard_conciliacao_mes_fechado ON conciliacao_bancaria_itens;
DROP TRIGGER IF EXISTS trg_bloqueia_delete_extrato ON extrato_bancario_v2;

-- Funções
DROP FUNCTION IF EXISTS fn_bloqueia_mutacao_audit();
DROP FUNCTION IF EXISTS fn_snapshot_conciliacao();
DROP FUNCTION IF EXISTS fn_audit_conciliacao();
DROP FUNCTION IF EXISTS fn_guard_conciliacao_mes_fechado();
DROP FUNCTION IF EXISTS fn_bloqueia_delete_extrato();
DROP FUNCTION IF EXISTS fn_get_mesa_v2_mode();
DROP FUNCTION IF EXISTS fn_expirar_stagings_antigos();

-- Cron job
DO $$ BEGIN
  PERFORM cron.unschedule('mesa_v2_expirar_stagings');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Setting (reset apenas no nível database; sessões ativas precisam reset manual)
DO $$ BEGIN
  EXECUTE 'ALTER DATABASE ' || quote_ident(current_database()) ||
          ' RESET app.mesa_v2_triggers_enforce';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Índices (apenas os novos do PR0.A)
DROP INDEX IF EXISTS idx_extrato_descricao_trgm;
DROP INDEX IF EXISTS idx_extrato_historico_trgm;
DROP INDEX IF EXISTS idx_lanc_descricao_trgm;
DROP INDEX IF EXISTS idx_extrato_suspeitas;
DROP INDEX IF EXISTS idx_extrato_orfao_definitivo;
DROP INDEX IF EXISTS idx_lanc_orfao_definitivo;
DROP INDEX IF EXISTS idx_staging_owner_status;
DROP INDEX IF EXISTS idx_staging_expira;
DROP INDEX IF EXISTS idx_staging_hash_owner_cliente;
DROP INDEX IF EXISTS idx_staging_itens_staging;
DROP INDEX IF EXISTS idx_staging_itens_hash;
DROP INDEX IF EXISTS idx_audit_extrato_data;
DROP INDEX IF EXISTS idx_audit_lancamento_data;
DROP INDEX IF EXISTS idx_audit_cliente_acao_data;

-- Tabelas novas
DROP TABLE IF EXISTS extrato_bancario_staging_itens CASCADE;
DROP TABLE IF EXISTS extrato_bancario_staging CASCADE;
DROP TABLE IF EXISTS conciliacao_audit_log CASCADE;

-- Colunas adicionadas em conciliacao_bancaria_itens
ALTER TABLE conciliacao_bancaria_itens
  DROP CONSTRAINT IF EXISTS chk_tipo_aprovacao,
  DROP COLUMN IF EXISTS desfeito_motivo,
  DROP COLUMN IF EXISTS desfeito_por,
  DROP COLUMN IF EXISTS desfeito_em,
  DROP COLUMN IF EXISTS aprovado_em,
  DROP COLUMN IF EXISTS aprovado_por,
  DROP COLUMN IF EXISTS tipo_aprovacao,
  DROP COLUMN IF EXISTS snapshot_flags_no_momento,
  DROP COLUMN IF EXISTS snapshot_historico_banco,
  DROP COLUMN IF EXISTS snapshot_favorecido_id,
  DROP COLUMN IF EXISTS snapshot_lancamento_data,
  DROP COLUMN IF EXISTS snapshot_extrato_data,
  DROP COLUMN IF EXISTS snapshot_lancamento_valor,
  DROP COLUMN IF EXISTS snapshot_extrato_valor,
  DROP COLUMN IF EXISTS sugestao_score_aprovado;

-- Colunas adicionadas em financeiro_importacoes_v2
ALTER TABLE financeiro_importacoes_v2
  DROP COLUMN IF EXISTS cancelado_motivo,
  DROP COLUMN IF EXISTS cancelado_por,
  DROP COLUMN IF EXISTS cancelado_em,
  DROP COLUMN IF EXISTS owner_user_id,
  DROP COLUMN IF EXISTS hash_arquivo;

-- Colunas adicionadas em extrato_bancario_v2
ALTER TABLE extrato_bancario_v2
  DROP COLUMN IF EXISTS cancelado_motivo,
  DROP COLUMN IF EXISTS cancelado_por,
  DROP COLUMN IF EXISTS cancelado_em,
  DROP COLUMN IF EXISTS orfao_definitivo_em,
  DROP COLUMN IF EXISTS orfao_definitivo_por,
  DROP COLUMN IF EXISTS orfao_definitivo_motivo,
  DROP COLUMN IF EXISTS orfao_definitivo,
  DROP COLUMN IF EXISTS flag_suspeita_motivo,
  DROP COLUMN IF EXISTS flag_suspeita_fornecedor,
  DROP COLUMN IF EXISTS flag_suspeita_valor;

-- Colunas adicionadas + FK em financeiro_lancamentos_v2
ALTER TABLE financeiro_lancamentos_v2
  DROP CONSTRAINT IF EXISTS fk_flv2_lote_importacao,
  DROP COLUMN IF EXISTS orfao_definitivo_em,
  DROP COLUMN IF EXISTS orfao_definitivo_por,
  DROP COLUMN IF EXISTS orfao_definitivo_motivo,
  DROP COLUMN IF EXISTS orfao_definitivo,
  DROP COLUMN IF EXISTS origem_apontamento;

-- Enum
DROP TYPE IF EXISTS origem_apontamento_enum;

-- Extensions: deixar instaladas (custo zero, úteis depois)
-- DROP EXTENSION IF EXISTS pg_trgm;
-- DROP EXTENSION IF EXISTS pg_cron;
