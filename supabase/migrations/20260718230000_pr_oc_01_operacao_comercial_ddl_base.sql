-- PR-OC-01 — Contratos e DDL-base da Operação Comercial Soberana (doc v2, emendas E1-E7).
-- Cria as 5 tabelas soberanas (operações, vínculos de movimentações, partes financeiras,
--   documentos, eventos append-only) com FKs compostas tenant-safe, RLS no padrão vigente e
--   grants mínimos. NÃO adiciona lógica dinâmica: triggers de validação/transição, RPCs e
--   comandos transacionais pertencem ao PR-OC-02. Sem escrita da aplicação.
-- A migration NÃO deve ser aplicada por este PR — aplicação é etapa separada sob autorização.


-- ─────────────────────────────────────────────────────────────────────────────
-- §A — Alvos tenant-safe para FKs compostas nas tabelas legadas.
--   As FKs compostas exigem alvo UNIQUE (id, cliente_id); as três legadas só têm
--   PRIMARY KEY (id). Como id já é PK, o par é automaticamente único — a constraint
--   apenas o torna referenciável.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.lancamentos
  ADD CONSTRAINT lancamentos_id_cliente_uniq UNIQUE (id, cliente_id);
ALTER TABLE public.financeiro_fornecedores
  ADD CONSTRAINT financeiro_fornecedores_id_cliente_uniq UNIQUE (id, cliente_id);
ALTER TABLE public.financeiro_lancamentos_v2
  ADD CONSTRAINT financeiro_lancamentos_v2_id_cliente_uniq UNIQUE (id, cliente_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- §B — Tabela soberana da negociação.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.zoo_operacoes_comerciais (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id               uuid NOT NULL,
  -- [E1] SEM fazenda_id: fazendas derivam das movimentações vinculadas.
  tipo_operacao            text NOT NULL CHECK (tipo_operacao IN ('compra','venda','abate')),
  data_operacao            date NOT NULL,
  responsavel              text,
  cenario                  text NOT NULL DEFAULT 'realizado' CHECK (cenario IN ('realizado','meta')),
  contraparte_id           uuid,
  -- negociação
  tipo_precificacao        text,
  preco_unitario           numeric,
  condicao_pagamento       text,
  data_pagamento_prevista  date,
  valor_bruto              numeric,
  descontos                numeric NOT NULL DEFAULT 0,
  acrescimos               numeric NOT NULL DEFAULT 0,
  valor_total              numeric,
  observacoes              text,
  -- [E4] dois eixos de estado
  status_comercial         text NOT NULL DEFAULT 'rascunho'
                             CHECK (status_comercial IN ('rascunho','confirmada','cancelada')),
  status_financeiro        text NOT NULL DEFAULT 'nao_aplicavel'
                             CHECK (status_financeiro IN ('nao_aplicavel','pendente','sincronizado','divergente','erro')),
  -- [E6] concorrência/idempotência (estrutura; lógica no PR-OC-02)
  versao                   integer NOT NULL DEFAULT 1 CHECK (versao >= 1),
  sincronizado_em          timestamptz,
  ultima_tentativa_em      timestamptz,
  erro_sincronizacao       text,
  hash_financeiro_esperado text,
  -- trilha
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  updated_by               uuid,
  cancelado_em             timestamptz,
  cancelado_por            uuid,
  cancelado_motivo         text,
  -- alvo tenant-safe para as filhas
  CONSTRAINT zoo_operacoes_comerciais_id_cliente_uniq UNIQUE (id, cliente_id),
  -- FK composta tenant-safe da contraparte (nullable em rascunho)
  CONSTRAINT zoo_operacoes_comerciais_contraparte_fk
    FOREIGN KEY (contraparte_id, cliente_id)
    REFERENCES public.financeiro_fornecedores (id, cliente_id)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- §C — Vínculo com movimentações zootécnicas.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.zoo_operacao_movimentacoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      uuid NOT NULL,
  operacao_id     uuid NOT NULL,
  movimentacao_id uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  CONSTRAINT zoo_operacao_mov_operacao_fk
    FOREIGN KEY (operacao_id, cliente_id)
    REFERENCES public.zoo_operacoes_comerciais (id, cliente_id) ON DELETE CASCADE,
  CONSTRAINT zoo_operacao_mov_movimentacao_fk
    FOREIGN KEY (movimentacao_id, cliente_id)
    REFERENCES public.lancamentos (id, cliente_id),
  CONSTRAINT zoo_operacao_mov_movimentacao_uniq UNIQUE (movimentacao_id)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- §D — Partes financeiras da operação.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.zoo_operacao_partes (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id               uuid NOT NULL,
  operacao_id              uuid NOT NULL,
  natureza                 text NOT NULL CHECK (natureza IN ('principal','deducao','acrescimo')),
  -- [refinamento 1] slug técnico obrigatório, normalizado, imutável após vínculo
  componente               text NOT NULL DEFAULT 'principal'
                             CHECK (componente ~ '^[a-z0-9_]+$'),
  sequencia_parcela        integer NOT NULL DEFAULT 1 CHECK (sequencia_parcela >= 1),
  quantidade_parcelas      integer NOT NULL DEFAULT 1 CHECK (quantidade_parcelas >= 1),
  valor                    numeric NOT NULL CHECK (valor >= 0),
  data_vencimento          date,
  descricao                text,
  incluso_no_total         boolean NOT NULL DEFAULT true,
  plano_conta_id           uuid,          -- sem FK neste PR (nome do mestre não verificado)
  macro_custo              text,
  grupo_custo              text,
  centro_custo             text,
  subcentro                text,
  financeiro_lancamento_id uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zoo_operacao_partes_parcela_coerente CHECK (sequencia_parcela <= quantidade_parcelas),
  CONSTRAINT zoo_operacao_partes_operacao_fk
    FOREIGN KEY (operacao_id, cliente_id)
    REFERENCES public.zoo_operacoes_comerciais (id, cliente_id) ON DELETE CASCADE,
  -- [E3] vínculo normativo ÚNICO ao título, tenant-safe
  CONSTRAINT zoo_operacao_partes_titulo_fk
    FOREIGN KEY (financeiro_lancamento_id, cliente_id)
    REFERENCES public.financeiro_lancamentos_v2 (id, cliente_id),
  CONSTRAINT zoo_operacao_partes_titulo_uniq UNIQUE (financeiro_lancamento_id),
  -- [E5 + componente aprovado] identidade da parte
  CONSTRAINT zoo_operacao_partes_identidade_uniq
    UNIQUE (operacao_id, natureza, componente, sequencia_parcela)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- §E — Documentos e eventos.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.zoo_operacao_documentos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    uuid NOT NULL,
  operacao_id   uuid NOT NULL,
  nome          text NOT NULL,
  tipo          text,
  url           text NOT NULL,
  tamanho_bytes bigint,
  uploaded_em   timestamptz NOT NULL DEFAULT now(),
  uploaded_por  uuid,
  CONSTRAINT zoo_operacao_doc_operacao_fk
    FOREIGN KEY (operacao_id, cliente_id)
    REFERENCES public.zoo_operacoes_comerciais (id, cliente_id) ON DELETE CASCADE
);

CREATE TABLE public.zoo_operacao_eventos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       uuid NOT NULL,
  operacao_id      uuid NOT NULL,
  acao             text NOT NULL,
  detalhes         jsonb,
  dados_anteriores jsonb,
  dados_novos      jsonb,
  usuario_id       uuid,
  origem           text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- RESTRICT: trilha imutável impede delete físico de operação com histórico
  CONSTRAINT zoo_operacao_evt_operacao_fk
    FOREIGN KEY (operacao_id, cliente_id)
    REFERENCES public.zoo_operacoes_comerciais (id, cliente_id) ON DELETE RESTRICT
);


-- ─────────────────────────────────────────────────────────────────────────────
-- §F — Índices.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX idx_zoo_oc_cliente ON public.zoo_operacoes_comerciais (cliente_id);
CREATE INDEX idx_zoo_oc_cliente_tipo_data ON public.zoo_operacoes_comerciais (cliente_id, tipo_operacao, data_operacao);
CREATE INDEX idx_zoo_oc_mov_operacao ON public.zoo_operacao_movimentacoes (operacao_id);
CREATE INDEX idx_zoo_oc_partes_operacao ON public.zoo_operacao_partes (operacao_id);
CREATE INDEX idx_zoo_oc_doc_operacao ON public.zoo_operacao_documentos (operacao_id);
CREATE INDEX idx_zoo_oc_evt_operacao_data ON public.zoo_operacao_eventos (operacao_id, created_at);


-- ─────────────────────────────────────────────────────────────────────────────
-- §G — RLS e grants (padrão de tenant vigente; expressão copiada verbatim da inspeção).
-- ─────────────────────────────────────────────────────────────────────────────

-- zoo_operacoes_comerciais (CRUD completo)
ALTER TABLE public.zoo_operacoes_comerciais ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zoo_operacoes_comerciais FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zoo_operacoes_comerciais TO authenticated;
CREATE POLICY zoo_operacoes_comerciais_select ON public.zoo_operacoes_comerciais
  FOR SELECT TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacoes_comerciais_insert ON public.zoo_operacoes_comerciais
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacoes_comerciais_update ON public.zoo_operacoes_comerciais
  FOR UPDATE TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))))
  WITH CHECK (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacoes_comerciais_delete ON public.zoo_operacoes_comerciais
  FOR DELETE TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));

-- zoo_operacao_movimentacoes (CRUD completo)
ALTER TABLE public.zoo_operacao_movimentacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zoo_operacao_movimentacoes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zoo_operacao_movimentacoes TO authenticated;
CREATE POLICY zoo_operacao_movimentacoes_select ON public.zoo_operacao_movimentacoes
  FOR SELECT TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacao_movimentacoes_insert ON public.zoo_operacao_movimentacoes
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacao_movimentacoes_update ON public.zoo_operacao_movimentacoes
  FOR UPDATE TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))))
  WITH CHECK (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacao_movimentacoes_delete ON public.zoo_operacao_movimentacoes
  FOR DELETE TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));

-- zoo_operacao_partes (CRUD completo)
ALTER TABLE public.zoo_operacao_partes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zoo_operacao_partes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zoo_operacao_partes TO authenticated;
CREATE POLICY zoo_operacao_partes_select ON public.zoo_operacao_partes
  FOR SELECT TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacao_partes_insert ON public.zoo_operacao_partes
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacao_partes_update ON public.zoo_operacao_partes
  FOR UPDATE TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))))
  WITH CHECK (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacao_partes_delete ON public.zoo_operacao_partes
  FOR DELETE TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));

-- zoo_operacao_documentos (CRUD completo)
ALTER TABLE public.zoo_operacao_documentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zoo_operacao_documentos FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zoo_operacao_documentos TO authenticated;
CREATE POLICY zoo_operacao_documentos_select ON public.zoo_operacao_documentos
  FOR SELECT TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacao_documentos_insert ON public.zoo_operacao_documentos
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacao_documentos_update ON public.zoo_operacao_documentos
  FOR UPDATE TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))))
  WITH CHECK (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacao_documentos_delete ON public.zoo_operacao_documentos
  FOR DELETE TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));

-- zoo_operacao_eventos (APPEND-ONLY: apenas SELECT e INSERT; sem UPDATE/DELETE).
--   Imutabilidade garantida por RLS + grants, sem trigger (lógica dinâmica é PR-OC-02).
ALTER TABLE public.zoo_operacao_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zoo_operacao_eventos FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.zoo_operacao_eventos TO authenticated;
CREATE POLICY zoo_operacao_eventos_select ON public.zoo_operacao_eventos
  FOR SELECT TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacao_eventos_insert ON public.zoo_operacao_eventos
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id
    FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));


-- ─────────────────────────────────────────────────────────────────────────────
-- §H — Contratos comentados (mínimo obrigatório).
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.zoo_operacoes_comerciais IS
  'Soberana da negociação [doc v2 §1]. SEM fazenda_id: fazendas derivam das movimentações vinculadas [E1]. Escrita somente via comandos transacionais a partir do PR-OC-02 [E2]. Dois eixos de estado (status_comercial, status_financeiro) [E4]. versao = concorrência otimista [E6]. Delete físico permitido apenas em rascunho sem eventos (enforcement no PR-OC-02).';

COMMENT ON COLUMN public.zoo_operacao_partes.componente IS
  'Identidade técnica (slug), não descrição de exibição. IMUTÁVEL após vínculo a título financeiro — enforcement dinâmico no PR-OC-02. Exemplos: principal, funrural, frete, comissao, bonificacao, ajuste_peso.';

COMMENT ON COLUMN public.zoo_operacao_partes.financeiro_lancamento_id IS
  'Vínculo normativo ÚNICO operação↔FINV2 [E3]. Proibido criar referência redundante no FINV2.';

COMMENT ON COLUMN public.zoo_operacao_partes.valor IS
  'Sempre ≥ 0; o sinal é semântico pela natureza.';

COMMENT ON TABLE public.zoo_operacao_eventos IS
  'Append-only; gravado exclusivamente dentro do COMMIT dos comandos [E2].';

-- FKs compostas: integridade por tenant estrutural [refinamento 2] — vínculo entre
--   clientes distintos é violação de constraint, independente de RLS ou privilégio.
COMMENT ON CONSTRAINT zoo_operacoes_comerciais_contraparte_fk ON public.zoo_operacoes_comerciais IS
  'Integridade por tenant estrutural [refinamento 2] — vínculo entre clientes distintos é violação de constraint, independente de RLS ou privilégio.';
COMMENT ON CONSTRAINT zoo_operacao_mov_operacao_fk ON public.zoo_operacao_movimentacoes IS
  'Integridade por tenant estrutural [refinamento 2] — vínculo entre clientes distintos é violação de constraint, independente de RLS ou privilégio.';
COMMENT ON CONSTRAINT zoo_operacao_mov_movimentacao_fk ON public.zoo_operacao_movimentacoes IS
  'Integridade por tenant estrutural [refinamento 2] — vínculo entre clientes distintos é violação de constraint, independente de RLS ou privilégio.';
COMMENT ON CONSTRAINT zoo_operacao_partes_operacao_fk ON public.zoo_operacao_partes IS
  'Integridade por tenant estrutural [refinamento 2] — vínculo entre clientes distintos é violação de constraint, independente de RLS ou privilégio.';
COMMENT ON CONSTRAINT zoo_operacao_partes_titulo_fk ON public.zoo_operacao_partes IS
  'Integridade por tenant estrutural [refinamento 2] — vínculo entre clientes distintos é violação de constraint, independente de RLS ou privilégio.';
COMMENT ON CONSTRAINT zoo_operacao_doc_operacao_fk ON public.zoo_operacao_documentos IS
  'Integridade por tenant estrutural [refinamento 2] — vínculo entre clientes distintos é violação de constraint, independente de RLS ou privilégio.';
COMMENT ON CONSTRAINT zoo_operacao_evt_operacao_fk ON public.zoo_operacao_eventos IS
  'Integridade por tenant estrutural [refinamento 2] — vínculo entre clientes distintos é violação de constraint, independente de RLS ou privilégio.';
