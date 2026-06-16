-- Detector V2:
-- Persistência de decisões humanas sobre pares OFX detectados.
-- O detector sugerido continua on-read em useExtratoParesOfx.
-- Esta tabela guarda decisões: confirmado/rejeitado.
-- Não altera extrato_bancario_v2.status.

CREATE TABLE IF NOT EXISTS transferencia_ofx_pares (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       uuid NOT NULL,
  ano_mes          text NOT NULL,                 -- 'YYYY-MM'
  ofx_saida_id     uuid NOT NULL REFERENCES extrato_bancario_v2(id),
  ofx_entrada_id   uuid NOT NULL REFERENCES extrato_bancario_v2(id),
  conta_origem_id  uuid NOT NULL,
  conta_destino_id uuid NOT NULL,
  valor            numeric NOT NULL,              -- abs
  data_saida       date NOT NULL,
  data_entrada     date NOT NULL,
  status           text NOT NULL,                 -- só 'confirmado'|'rejeitado' inseridos (D1); 'sugerido' reservado
  confianca        text NOT NULL,                 -- 'forte'|'ambigua'
  motivo_rejeicao  text,                          -- rejeição manual; null em auto-rejeição/confirmação
  detectado_em     timestamptz NOT NULL DEFAULT now(),
  decidido_em      timestamptz,
  decidido_por     uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_tofx_contas    CHECK (conta_origem_id <> conta_destino_id),
  CONSTRAINT chk_tofx_status    CHECK (status IN ('sugerido','confirmado','rejeitado')),
  CONSTRAINT chk_tofx_confianca CHECK (confianca IN ('forte','ambigua'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tofx_par             ON transferencia_ofx_pares(ofx_saida_id, ofx_entrada_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tofx_saida_confirm   ON transferencia_ofx_pares(ofx_saida_id)   WHERE status='confirmado';
CREATE UNIQUE INDEX IF NOT EXISTS uq_tofx_entrada_confirm ON transferencia_ofx_pares(ofx_entrada_id) WHERE status='confirmado';
CREATE INDEX        IF NOT EXISTS ix_tofx_cliente_mes     ON transferencia_ofx_pares(cliente_id, ano_mes);

ALTER TABLE transferencia_ofx_pares ENABLE ROW LEVEL SECURITY;

CREATE POLICY tofx_select ON transferencia_ofx_pares FOR SELECT TO public
  USING (is_admin_agroinblue(auth.uid()) OR cliente_id IN (SELECT cm.cliente_id FROM cliente_membros cm WHERE cm.user_id=auth.uid() AND cm.ativo=true));
CREATE POLICY tofx_insert ON transferencia_ofx_pares FOR INSERT TO public
  WITH CHECK (is_admin_agroinblue(auth.uid()) OR cliente_id IN (SELECT cm.cliente_id FROM cliente_membros cm WHERE cm.user_id=auth.uid() AND cm.ativo=true));
CREATE POLICY tofx_update ON transferencia_ofx_pares FOR UPDATE TO public
  USING (is_admin_agroinblue(auth.uid()) OR cliente_id IN (SELECT cm.cliente_id FROM cliente_membros cm WHERE cm.user_id=auth.uid() AND cm.ativo=true));
CREATE POLICY tofx_delete ON transferencia_ofx_pares FOR DELETE TO public
  USING (is_admin_agroinblue(auth.uid()) OR cliente_id IN (SELECT cm.cliente_id FROM cliente_membros cm WHERE cm.user_id=auth.uid() AND cm.ativo=true));
