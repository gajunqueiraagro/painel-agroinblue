-- PR-OC-MODEL-01 parte 2 — Eixo LIQUIDAÇÃO (Decisão 5). Estrutura própria: o que já
--   foi efetivamente pago, recebido ou entregue em permuta. NÃO é composição do valor
--   (zoo_operacao_partes) nem título financeiro (financeiro_lancamentos_v2) nem
--   sincronização técnica (status_financeiro). Vínculo a título é OPCIONAL.
-- NÃO aplicar por este PR.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.zoo_operacao_liquidacoes (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id               uuid NOT NULL,
  operacao_id              uuid NOT NULL,
  data                     date NOT NULL,
  natureza                 text NOT NULL CHECK (natureza IN ('pagamento','recebimento')),
  forma                    text NOT NULL CHECK (forma IN ('dinheiro','pix','transferencia','boleto','cheque','permuta','outro')),
  valor                    numeric NOT NULL CHECK (valor >= 0),  -- valor que REDUZ o saldo comercial
  descricao                text,
  observacao               text,
  -- Vínculo OPCIONAL a um título FINV2 (liquidação pode existir sem título prévio,
  --   liquidar parcialmente um título, ou vários pagamentos por título).
  financeiro_lancamento_id uuid,
  -- Permuta (liquidação NÃO bancária): reduz saldo, não gera caixa.
  permuta_tipo_bem         text,
  permuta_descricao_bem    text,
  permuta_valor_atribuido  numeric CHECK (permuta_valor_atribuido IS NULL OR permuta_valor_atribuido >= 0),
  permuta_documento_url    text,
  -- Estorno preserva o fato (nunca DELETE): saldo recalcula ignorando estornadas.
  estornado                boolean NOT NULL DEFAULT false,
  estornado_em             timestamptz,
  estornado_por            uuid,
  estorno_motivo           text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  updated_by               uuid,
  -- permuta ⇔ tem valor atribuído; e nesse caso valor da liquidação = valor atribuído.
  CONSTRAINT zoo_oc_liq_permuta_coerente
    CHECK ((forma = 'permuta') = (permuta_valor_atribuido IS NOT NULL)),
  CONSTRAINT zoo_oc_liq_permuta_valor
    CHECK (forma <> 'permuta' OR valor = permuta_valor_atribuido),
  CONSTRAINT zoo_oc_liq_operacao_fk
    FOREIGN KEY (operacao_id, cliente_id)
    REFERENCES public.zoo_operacoes_comerciais (id, cliente_id) ON DELETE CASCADE,
  CONSTRAINT zoo_oc_liq_titulo_fk
    FOREIGN KEY (financeiro_lancamento_id, cliente_id)
    REFERENCES public.financeiro_lancamentos_v2 (id, cliente_id)
);

CREATE INDEX idx_zoo_oc_liq_operacao ON public.zoo_operacao_liquidacoes (operacao_id);
CREATE INDEX idx_zoo_oc_liq_titulo   ON public.zoo_operacao_liquidacoes (financeiro_lancamento_id);

-- RLS e grants no padrão vigente (tenant por cliente). Sem DELETE: fatos preservados
--   (estorno é UPDATE de flag). Escrita canônica via RPCs (parte 3).
ALTER TABLE public.zoo_operacao_liquidacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zoo_operacao_liquidacoes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.zoo_operacao_liquidacoes TO authenticated;
CREATE POLICY zoo_operacao_liquidacoes_select ON public.zoo_operacao_liquidacoes
  FOR SELECT TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacao_liquidacoes_insert ON public.zoo_operacao_liquidacoes
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacao_liquidacoes_update ON public.zoo_operacao_liquidacoes
  FOR UPDATE TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))))
  WITH CHECK (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));

COMMENT ON TABLE public.zoo_operacao_liquidacoes IS
  'PR-OC-MODEL-01: eixo LIQUIDAÇÃO — pagamentos/recebimentos/permutas efetivos da operação. Separado de partes (composição), títulos (FINV2) e sincronização. Vínculo a título opcional. Permuta reduz saldo sem gerar caixa. Estorno preserva o fato (sem DELETE).';
COMMENT ON CONSTRAINT zoo_oc_liq_operacao_fk ON public.zoo_operacao_liquidacoes IS
  'Integridade por tenant estrutural — vínculo entre clientes distintos é violação de constraint, independente de RLS.';
