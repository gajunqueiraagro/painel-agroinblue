-- FIN-FINANC-28-P1 (Gabriel 16/10/2026) — item 28, passo 1: ESTRUTURA do financiamento no desenho aprovado (mock v1.1):
-- linha de credito (opcional) -> contrato -> destinacoes + liberacoes N -> cronograma; situacao ativo / quitado / rolado /
-- cancelado; a prorrogacao guarda o vencimento original. SO' ACRESCENTA: nenhuma linha existente muda, nenhuma tela, nenhuma
-- funcao. As 13 decisoes de PARE da 28b seguem com o Gabriel.
-- ⚠ DDL EM TABELA QUENTE (financiamentos, financiamento_parcelas; e a validacao da FK nova toca financeiro_lancamentos_v2):
--   aplicar so' antes das 07h ou depois das 20h, com GO.
-- MEDIDO em 16/10 (FASE 0): status do contrato so' ativo/quitado/cancelado; status da parcela so' pendente/pago/cancelado;
--   0 parcela com lancamento_id orfao; financiamento_destinacoes com 0 linhas. Por isso os CHECKs e a FK nascem VALIDADOS.
-- RLS das tabelas novas: tenant_ok(cliente_id) (a funcao da casa; equivale ao admin OU membro das policies *_sec01); anon nada.
-- ⚠ POSTGREST: as tabelas novas tem PK so' em `id` — nenhuma FK entra em chave composta, entao nao viram tabela de juncao
--   (o que deixaria ambiguos os embeds `financeiro_fornecedores(...)` sem dica que a tela faz a partir de lancamentos).
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- 1. linha de credito
CREATE TABLE public.financiamento_linhas_credito (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       uuid NOT NULL REFERENCES public.clientes(id),
  credor_id        uuid REFERENCES public.financeiro_fornecedores(id),
  programa         text,
  descricao        text,
  limite           numeric CHECK (limite IS NULL OR limite >= 0),
  vigencia_inicio  date,
  vigencia_fim     date,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES auth.users(id),
  CONSTRAINT fin_linha_credito_vigencia_chk CHECK (vigencia_fim IS NULL OR vigencia_inicio IS NULL OR vigencia_fim >= vigencia_inicio)
);
CREATE INDEX idx_fin_linhas_credito_cliente ON public.financiamento_linhas_credito (cliente_id);
CREATE INDEX idx_fin_linhas_credito_credor ON public.financiamento_linhas_credito (credor_id);
CREATE TRIGGER trg_fin_linhas_credito_updated_at BEFORE UPDATE ON public.financiamento_linhas_credito
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. contrato: colunas novas, todas opcionais, sem default
ALTER TABLE public.financiamentos
  ADD COLUMN linha_credito_id     uuid REFERENCES public.financiamento_linhas_credito(id),
  ADD COLUMN sistema_amortizacao  text,
  ADD COLUMN carencia_ate         date,
  ADD COLUMN vencimento_final     date,
  ADD COLUMN finalidade           text,
  ADD COLUMN contrato_sucessor_id uuid REFERENCES public.financiamentos(id),
  ADD COLUMN baixa_em             timestamptz,
  ADD COLUMN baixa_por            uuid,
  ADD COLUMN baixa_motivo         text,
  ADD CONSTRAINT chk_financiamentos_sistema_amortizacao CHECK (sistema_amortizacao IN ('sac', 'price', 'bullet', 'livre')),
  ADD CONSTRAINT chk_financiamentos_finalidade CHECK (finalidade IN ('custeio', 'investimento', 'comercializacao', 'outro')),
  ADD CONSTRAINT chk_financiamentos_sucessor_outro CHECK (contrato_sucessor_id IS NULL OR contrato_sucessor_id <> id),
  -- 3. situacao do contrato (medido: 0 linha fora da lista)
  ADD CONSTRAINT chk_financiamentos_status CHECK (status IN ('ativo', 'quitado', 'rolado', 'cancelado'));
CREATE INDEX idx_financiamentos_linha_credito ON public.financiamentos (linha_credito_id) WHERE linha_credito_id IS NOT NULL;
CREATE INDEX idx_financiamentos_sucessor ON public.financiamentos (contrato_sucessor_id) WHERE contrato_sucessor_id IS NOT NULL;

-- 5. destinacoes (0 linhas; sem PK nem FK ate' hoje)
ALTER TABLE public.financiamento_destinacoes
  ADD CONSTRAINT financiamento_destinacoes_pkey PRIMARY KEY (id),
  ADD CONSTRAINT financiamento_destinacoes_financiamento_fkey FOREIGN KEY (financiamento_id) REFERENCES public.financiamentos(id) ON DELETE RESTRICT,
  ADD CONSTRAINT financiamento_destinacoes_cliente_fkey FOREIGN KEY (cliente_id) REFERENCES public.clientes(id),
  ADD COLUMN valor_orcado  numeric,
  ADD COLUMN fornecedor_id uuid REFERENCES public.financeiro_fornecedores(id),
  ADD COLUMN tipo          text;
CREATE INDEX idx_fin_destinacoes_financiamento ON public.financiamento_destinacoes (financiamento_id);
CREATE INDEX idx_fin_destinacoes_fornecedor ON public.financiamento_destinacoes (fornecedor_id) WHERE fornecedor_id IS NOT NULL;

-- 4. liberacoes (N por contrato)
CREATE TABLE public.financiamento_liberacoes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id             uuid NOT NULL REFERENCES public.clientes(id),
  financiamento_id       uuid NOT NULL REFERENCES public.financiamentos(id) ON DELETE RESTRICT,
  data                   date NOT NULL,
  valor                  numeric NOT NULL CHECK (valor > 0),
  forma                  text NOT NULL CHECK (forma IN ('conta', 'fornecedor', 'liquidacao')),
  lancamento_id          uuid REFERENCES public.financeiro_lancamentos_v2(id) ON DELETE RESTRICT,
  destinacao_id          uuid REFERENCES public.financiamento_destinacoes(id) ON DELETE RESTRICT,
  fornecedor_id          uuid REFERENCES public.financeiro_fornecedores(id),
  contrato_liquidado_id  uuid REFERENCES public.financiamentos(id) ON DELETE RESTRICT,
  observacao             text,
  cancelado_em           timestamptz,
  cancelado_por          uuid,
  cancelado_motivo       text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid REFERENCES auth.users(id),
  CONSTRAINT fin_liberacao_liquidacao_chk CHECK (forma <> 'liquidacao' OR contrato_liquidado_id IS NOT NULL),
  CONSTRAINT fin_liberacao_liquida_outro_chk CHECK (contrato_liquidado_id IS NULL OR contrato_liquidado_id <> financiamento_id),
  CONSTRAINT fin_liberacao_cancelada_chk CHECK ((cancelado_em IS NULL AND cancelado_motivo IS NULL)
                                             OR (cancelado_em IS NOT NULL AND cancelado_motivo IS NOT NULL))
);
CREATE INDEX idx_fin_liberacoes_cliente ON public.financiamento_liberacoes (cliente_id);
CREATE INDEX idx_fin_liberacoes_financiamento ON public.financiamento_liberacoes (financiamento_id);
CREATE INDEX idx_fin_liberacoes_lancamento ON public.financiamento_liberacoes (lancamento_id) WHERE lancamento_id IS NOT NULL;
CREATE INDEX idx_fin_liberacoes_destinacao ON public.financiamento_liberacoes (destinacao_id) WHERE destinacao_id IS NOT NULL;
CREATE INDEX idx_fin_liberacoes_fornecedor ON public.financiamento_liberacoes (fornecedor_id) WHERE fornecedor_id IS NOT NULL;
CREATE INDEX idx_fin_liberacoes_liquidado ON public.financiamento_liberacoes (contrato_liquidado_id) WHERE contrato_liquidado_id IS NOT NULL;

-- 6. parcelas: colunas novas opcionais, FK do lancamento (medido: 0 orfao) e status com os valores em uso
ALTER TABLE public.financiamento_parcelas
  ADD COLUMN valor_encargos      numeric,
  ADD COLUMN vencimento_original date,
  ADD COLUMN tipo                text,
  ADD CONSTRAINT chk_financiamento_parcelas_tipo CHECK (tipo IN ('amortizacao', 'juros_carencia', 'mista')),
  ADD CONSTRAINT chk_financiamento_parcelas_status CHECK (status IN ('pendente', 'pago', 'cancelado')),
  ADD CONSTRAINT financiamento_parcelas_lancamento_id_fkey FOREIGN KEY (lancamento_id)
    REFERENCES public.financeiro_lancamentos_v2(id) ON DELETE SET NULL;
-- (o indice de lancamento_id ja' existe: idx_fin_parcelas_lancamento_id)

-- 7. RLS e grants das tabelas novas
ALTER TABLE public.financiamento_linhas_credito ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financiamento_liberacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_linhas_credito_select ON public.financiamento_linhas_credito FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));
CREATE POLICY fin_linhas_credito_insert ON public.financiamento_linhas_credito FOR INSERT TO authenticated WITH CHECK (public.tenant_ok(cliente_id));
CREATE POLICY fin_linhas_credito_update ON public.financiamento_linhas_credito FOR UPDATE TO authenticated
  USING (public.tenant_ok(cliente_id)) WITH CHECK (public.tenant_ok(cliente_id));
CREATE POLICY fin_linhas_credito_delete ON public.financiamento_linhas_credito FOR DELETE TO authenticated USING (public.tenant_ok(cliente_id));
CREATE POLICY fin_liberacoes_select ON public.financiamento_liberacoes FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));
CREATE POLICY fin_liberacoes_insert ON public.financiamento_liberacoes FOR INSERT TO authenticated WITH CHECK (public.tenant_ok(cliente_id));
CREATE POLICY fin_liberacoes_update ON public.financiamento_liberacoes FOR UPDATE TO authenticated
  USING (public.tenant_ok(cliente_id)) WITH CHECK (public.tenant_ok(cliente_id));
-- liberacao nao se apaga: cancela (cancelado_em + motivo). Sem policy nem privilegio de DELETE para authenticated.
REVOKE ALL ON public.financiamento_linhas_credito FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.financiamento_liberacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financiamento_linhas_credito TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.financiamento_liberacoes TO authenticated;
GRANT ALL ON public.financiamento_linhas_credito, public.financiamento_liberacoes TO service_role;
