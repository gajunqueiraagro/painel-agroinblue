-- PR-OC-COM-1 — Contrato de LOTES COMERCIAIS da Operação Comercial (SPIKE-COMPRA-MULTILOTE-01).
--   zoo_operacao_lotes é entidade EXCLUSIVAMENTE COMERCIAL: nasce na Negociação e INDEPENDE de
--   fato físico. Um lote pode existir sem lancamento e, depois, gerar 0..N movimentações via o
--   fluxo de Recebimento (frente FÍSICA — fora deste PR). Por isso NÃO há movimentacao_id aqui.
--   Escopo COM-1: só o contrato de dados. Sem status_lote generico (estados serao DERIVADOS de
--   fatos distintos — eixos comercial/fisico/financeiro independentes). Sem derivados persistidos
--   (peso_total/valor_total sao derivados em view/RPC posterior). Escrita soberana sera via RPC
--   (COM-2, SECURITY DEFINER); nesta tabela authenticated recebe SOMENTE SELECT.
--   Integridade de tenant ESTRUTURAL (nao so RLS) via FK composta (operacao_id,cliente_id) ->
--   zoo_operacoes_comerciais(id,cliente_id) — padrao homologado dos filhos OC.
-- NAO aplicar por este PR (aplicacao e etapa separada sob autorizacao).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.zoo_operacao_lotes (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id              uuid NOT NULL,
  operacao_id             uuid NOT NULL,
  ordem                   integer NOT NULL CHECK (ordem >= 1),
  -- categoria: mesmo contrato TEXT de lancamentos.categoria / zoo_operacoes_comerciais.categoria_negociada
  --   (dominio validado no app: type Categoria + CATEGORIAS). Nao ha enum/dominio/CHECK no banco hoje.
  categoria_negociada     text,
  qtd_negociada           integer       CHECK (qtd_negociada IS NULL OR qtd_negociada > 0),
  peso_medio_negociado_kg numeric(10,3) CHECK (peso_medio_negociado_kg IS NULL OR peso_medio_negociado_kg > 0),
  criterio_valor          text          CHECK (criterio_valor IS NULL OR criterio_valor IN ('kg','cabeca','total')),
  valor_informado         numeric(14,2) CHECK (valor_informado IS NULL OR valor_informado >= 0),
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid,
  -- Integridade de tenant estrutural + vinculo a operacao (padrao dos filhos OC).
  --   ON DELETE CASCADE: coerente com os filhos transacionais (partes/movimentacoes/liquidacoes);
  --   o fluxo soberano NAO apaga operacao fisicamente (cancelamento e LOGICO via status_comercial),
  --   e a auditoria imutavel vive em zoo_operacao_eventos (RESTRICT). Ver relatorio (justificativa).
  CONSTRAINT zoo_operacao_lotes_operacao_fk
    FOREIGN KEY (operacao_id, cliente_id)
    REFERENCES public.zoo_operacoes_comerciais (id, cliente_id) ON DELETE CASCADE,
  -- Ordem unica por operacao (inclui cliente_id por coerencia tenant-safe; operacao_id ja implica cliente_id).
  CONSTRAINT zoo_operacao_lotes_ordem_uniq UNIQUE (operacao_id, cliente_id, ordem)
);

CREATE INDEX zoo_operacao_lotes_operacao_idx ON public.zoo_operacao_lotes (operacao_id);
CREATE INDEX zoo_operacao_lotes_cliente_idx  ON public.zoo_operacao_lotes (cliente_id);

COMMENT ON TABLE public.zoo_operacao_lotes IS
  'PR-OC-COM-1 (SPIKE-MULTILOTE): identidade COMERCIAL do lote de uma operacao. Independe de lancamentos; nasce na Negociacao e gera 0..N movimentacoes depois (Recebimento). Sem movimentacao_id, sem status_lote generico, sem derivados persistidos (peso_total/valor_total = derivados em view/RPC posterior). Escrita soberana via RPC (COM-2); leitura por RLS de tenant. Integridade tenant estrutural via FK composta (operacao_id,cliente_id).';
COMMENT ON COLUMN public.zoo_operacao_lotes.categoria_negociada IS 'TEXT (mesmo contrato de lancamentos.categoria/zoo_oc.categoria_negociada; dominio validado no app).';
COMMENT ON COLUMN public.zoo_operacao_lotes.criterio_valor IS 'kg|cabeca|total — unidade comercial do valor_informado (Negociacao).';
COMMENT ON COLUMN public.zoo_operacao_lotes.valor_informado IS 'numeric(14,2). peso_total e valor_total NAO persistem: derivados posteriormente (kg: peso_total*valor; cabeca: qtd*valor; total: valor).';

-- ── RLS + grants MINIMOS ─────────────────────────────────────────────────────
--   Escrita ocorrera EXCLUSIVAMENTE via RPC soberana (COM-2, SECURITY DEFINER, que roda como
--   owner e ignora grants/RLS). Portanto authenticated recebe SOMENTE SELECT. O REVOKE zera o
--   pacote herdado do default-ACL permissivo do Proto (pre-empte o vicio corrigido em M2b/
--   CATALOGO-01A). service_role intocado.
ALTER TABLE public.zoo_operacao_lotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.zoo_operacao_lotes FROM authenticated, anon, PUBLIC;
GRANT SELECT ON TABLE public.zoo_operacao_lotes TO authenticated;
CREATE POLICY zoo_operacao_lotes_select ON public.zoo_operacao_lotes
  FOR SELECT TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN (
    SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
