-- PR0.A · Mesa Operacional v2 · Novas tabelas
-- Staging OFX, itens de staging e audit log append-only.

CREATE TABLE IF NOT EXISTS extrato_bancario_staging (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id         UUID NOT NULL,
  cliente_id            UUID NOT NULL REFERENCES clientes(id),
  conta_bancaria_id     UUID NOT NULL REFERENCES financeiro_contas_bancarias(id),
  nome_arquivo          TEXT NOT NULL,
  hash_arquivo          TEXT NOT NULL,
  tamanho_bytes         INTEGER NULL,
  periodo_inicio        DATE NOT NULL,
  periodo_fim           DATE NOT NULL,
  saldo_inicial_arquivo NUMERIC(15,2) NULL,
  saldo_final_arquivo   NUMERIC(15,2) NULL,
  status                TEXT NOT NULL DEFAULT 'aberto'
                        CHECK (status IN ('aberto','confirmado','descartado','expirado')),
  total_linhas          INTEGER NOT NULL DEFAULT 0,
  total_ja_importadas   INTEGER NOT NULL DEFAULT 0,
  total_novas           INTEGER NOT NULL DEFAULT 0,
  total_aguardando      INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em             TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours',
  confirmado_em         TIMESTAMPTZ NULL,
  descartado_em         TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS extrato_bancario_staging_itens (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staging_id            UUID NOT NULL REFERENCES extrato_bancario_staging(id) ON DELETE CASCADE,
  data_movimento        DATE NOT NULL,
  valor                 NUMERIC(15,2) NOT NULL,
  historico             TEXT NOT NULL,
  documento_ofx         TEXT NULL,
  hash_movimento        TEXT NOT NULL,
  status_staging        TEXT NOT NULL DEFAULT 'aguardando_decisao'
                        CHECK (status_staging IN (
                          'ja_importado',
                          'aguardando_decisao',
                          'decidido_auto_conciliar',
                          'decidido_revisar',
                          'decidido_orfao'
                        )),
  lancamento_sugerido_id   UUID NULL REFERENCES financeiro_lancamentos_v2(id),
  sugestao_score           NUMERIC(5,2) NULL,
  sugestao_calculada_em    TIMESTAMPTZ NULL,
  extrato_final_id      UUID NULL REFERENCES extrato_bancario_v2(id),
  conciliacao_final_id  UUID NULL REFERENCES conciliacao_bancaria_itens(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conciliacao_audit_log (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acao                    TEXT NOT NULL CHECK (acao IN (
                            'conciliacao_criada',
                            'conciliacao_desfeita',
                            'conciliacao_substituida',
                            'extrato_marcado_orfao',
                            'extrato_desmarcado_orfao',
                            'lancamento_marcado_orfao',
                            'lancamento_desmarcado_orfao',
                            'importacao_revertida',
                            'mes_reaberto',
                            'mes_fechado',
                            'warning_mes_fechado',
                            'warning_delete_extrato'
                          )),
  actor_user_id           UUID NULL,
  cliente_id              UUID NOT NULL REFERENCES clientes(id),
  extrato_id              UUID NULL,
  lancamento_id           UUID NULL,
  conciliacao_id          UUID NULL,
  importacao_id           UUID NULL,
  ano_mes                 TEXT NULL,
  payload_antes           JSONB NULL,
  payload_depois          JSONB NULL,
  motivo                  TEXT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE extrato_bancario_staging IS
'Mesa Operacional v2. Staging persistente da importação OFX antes da gravação
em extrato_bancario_v2. TTL 24h via fn_expirar_stagings_antigos.
Princípio 9 da Constituição: operador no controle. Criada PR0.A.';

COMMENT ON TABLE extrato_bancario_staging_itens IS
'Mesa Operacional v2. Linhas em staging de uma importação OFX, cada uma com
decisão do operador (auto-conciliar / revisar / órfão) antes do confirm. Criada PR0.A.';

COMMENT ON TABLE conciliacao_audit_log IS
'Mesa Operacional v2. Append-only audit log de todas as ações reversíveis.
DELETE e UPDATE proibidos via trigger (trg_audit_bloqueia_update / _delete).
Princípio 8 da Constituição: reversibilidade obrigatória. Criada PR0.A.';

COMMENT ON COLUMN conciliacao_audit_log.actor_user_id IS
'Mesa Operacional v2. UUID do usuário que executou a ação.
Sem FK para auth.users (acoplamento). Criada PR0.A.';

COMMENT ON COLUMN conciliacao_audit_log.payload_antes IS
'Mesa Operacional v2. Snapshot JSONB do estado antes da ação.
Permite reconstrução do estado anterior em caso de auditoria. Criada PR0.A.';
