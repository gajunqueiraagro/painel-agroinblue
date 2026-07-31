-- PR-OC-ESTRUTURAL-01 — modelo COMPROMISSO -> PROGRACAO -> PARCELAS DA PROGRAMACAO -> Materializacao.
--   ESTRUTURA PURA: apenas tabelas/constraints/indices/RLS. NENHUM writer, trigger, RPC, mudanca de
--   comportamento ou migracao de dados. As partes existentes permanecem com programacao_parcela_id=NULL.
--
--   Cadeia (soberania): Compromisso (tipo/favorecido/classificacao/valor_total/vinculo) -> Programacao
--   (qual plano esta ativo) -> Parcela da Programacao (valor/vencimento/conta/forma/sequencia — a DECISAO
--   de pagamento) -> zoo_operacao_partes (materializacao: SNAPSHOT congelado + vinculo ao titulo).
--
--   DIVIDA SEMANTICA (registrada, NAO resolvida aqui): o catalogo zoo_componentes_financeiros modela
--   frete/comissao/funrural/imposto como DEDUCAO DE PRECO (pensado sobretudo para VENDA). No modelo de
--   Compromissos, um frete pago a transportadora e um COMPROMISSO A PAGAR, nao uma deducao do preco
--   negociado dos animais. Este PR apenas REUTILIZA a FK existente (natureza,componente)->(natureza,codigo)
--   para nao expandir escopo. A natureza semantica correta (novo tipo / novo catalogo / reorganizacao)
--   fica ADIADA para o primeiro PR comportamental. Nenhuma decisao de dados nesta migration.
--
--   Vinculo do compromisso: lote_id NULL = compromisso da OPERACAO inteira (ex.: frete/comissao/taxa);
--   lote_id preenchido = compromisso atribuido ao lote (ex.: compra das desmamas). Safra: gancho futuro
--   NAO criado (REGRA DE OURO: sem abstracao nao usada pelo caso de compra).
--
--   Requer PROTO (binbcdfbisgscrifztia). NUNCA em producao.

-- =====================================================================================================
-- T1) COMPROMISSOS — o que se deve, a quem, quanto no total, classificacao, vinculo.
-- =====================================================================================================
CREATE TABLE public.zoo_operacao_compromissos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    uuid NOT NULL,
  operacao_id   uuid NOT NULL,
  natureza      text NOT NULL CHECK (natureza IN ('principal','deducao','acrescimo')),
  componente    text NOT NULL CHECK (componente ~ '^[a-z0-9_]+$'),
  favorecido_id uuid,
  macro_custo   text,
  grupo_custo   text,
  centro_custo  text,
  subcentro     text,
  plano_conta_id uuid,                              -- sem FK (mestre nao versionado neste modelo; idioma do ddl_base)
  lote_id       uuid,                               -- NULL = compromisso da operacao inteira
  valor_total   numeric NOT NULL CHECK (valor_total > 0),
  descricao     text,
  status        text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','programado','cancelado')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zoo_operacao_compromissos_id_cliente_uniq UNIQUE (id, cliente_id),
  CONSTRAINT zoo_operacao_compromissos_operacao_fk
    FOREIGN KEY (operacao_id, cliente_id) REFERENCES public.zoo_operacoes_comerciais (id, cliente_id) ON DELETE CASCADE,
  CONSTRAINT zoo_operacao_compromissos_lote_fk
    FOREIGN KEY (lote_id, operacao_id) REFERENCES public.zoo_operacao_lotes (id, operacao_id),
  CONSTRAINT zoo_operacao_compromissos_componente_fk
    FOREIGN KEY (natureza, componente) REFERENCES public.zoo_componentes_financeiros (natureza, codigo)
);
CREATE INDEX idx_zoo_oc_compromissos_operacao ON public.zoo_operacao_compromissos (operacao_id);
CREATE INDEX idx_zoo_oc_compromissos_lote     ON public.zoo_operacao_compromissos (lote_id) WHERE lote_id IS NOT NULL;

-- =====================================================================================================
-- T2) PROGRAMACOES — qual plano de pagamento esta ativo para um compromisso (uma ativa por compromisso).
-- =====================================================================================================
CREATE TABLE public.zoo_operacao_programacoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id     uuid NOT NULL,
  compromisso_id uuid NOT NULL,
  condicoes      text,
  status         text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','renegociada','cancelada')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zoo_operacao_programacoes_id_cliente_uniq UNIQUE (id, cliente_id),
  CONSTRAINT zoo_operacao_programacoes_compromisso_fk
    FOREIGN KEY (compromisso_id, cliente_id) REFERENCES public.zoo_operacao_compromissos (id, cliente_id) ON DELETE CASCADE
);
CREATE INDEX idx_zoo_oc_programacoes_compromisso ON public.zoo_operacao_programacoes (compromisso_id);
-- uma programacao ATIVA por compromisso
CREATE UNIQUE INDEX zoo_operacao_programacoes_ativa_uniq
  ON public.zoo_operacao_programacoes (compromisso_id) WHERE status = 'ativa';

-- =====================================================================================================
-- T3) PARCELAS DA PROGRAMACAO — a DECISAO de pagamento (valor/vencimento/conta/forma/sequencia).
-- =====================================================================================================
CREATE TABLE public.zoo_operacao_parcelas_programacao (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       uuid NOT NULL,
  programacao_id   uuid NOT NULL,
  sequencia        integer NOT NULL CHECK (sequencia >= 1),
  valor            numeric NOT NULL CHECK (valor > 0),
  vencimento       date,
  conta_bancaria_id uuid,                           -- sem FK (mestre de contas nao versionado neste PR)
  forma            text,
  status           text NOT NULL DEFAULT 'prevista' CHECK (status IN ('prevista','materializada','paga','cancelada')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zoo_operacao_parcelas_programacao_id_cliente_uniq UNIQUE (id, cliente_id),
  CONSTRAINT zoo_operacao_parcelas_programacao_seq_uniq UNIQUE (programacao_id, sequencia),
  CONSTRAINT zoo_operacao_parcelas_programacao_prog_fk
    FOREIGN KEY (programacao_id, cliente_id) REFERENCES public.zoo_operacao_programacoes (id, cliente_id) ON DELETE CASCADE
);
CREATE INDEX idx_zoo_oc_parcelas_programacao ON public.zoo_operacao_parcelas_programacao (programacao_id);

-- =====================================================================================================
-- T4) MATERIALIZACAO — zoo_operacao_partes ancora a parcela da programacao (snapshot congelado + titulo).
--     Preserva o legado: partes existentes ficam com programacao_parcela_id = NULL. `origem` ja e texto
--     livre (o CHECK legado foi removido em PR-OC-LIQ-MODEL-01), portanto 'programacao' ja e aceito.
-- =====================================================================================================
ALTER TABLE public.zoo_operacao_partes
  ADD COLUMN programacao_parcela_id uuid;
ALTER TABLE public.zoo_operacao_partes
  ADD CONSTRAINT zoo_operacao_partes_parcela_prog_fk
  FOREIGN KEY (programacao_parcela_id, cliente_id)
  REFERENCES public.zoo_operacao_parcelas_programacao (id, cliente_id);
-- uma parte ATIVA por parcela da programacao (NULLs do legado nao entram no indice)
CREATE UNIQUE INDEX zoo_operacao_partes_parcela_prog_ativa_uniq
  ON public.zoo_operacao_partes (programacao_parcela_id)
  WHERE programacao_parcela_id IS NOT NULL AND cancelada = false;

-- =====================================================================================================
-- RLS tenant-safe (padrao das tabelas OC: is_admin_agroinblue OR cliente_id IN get_user_cliente_ids).
-- =====================================================================================================
ALTER TABLE public.zoo_operacao_compromissos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zoo_operacao_compromissos FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zoo_operacao_compromissos TO authenticated;
CREATE POLICY zoo_operacao_compromissos_select ON public.zoo_operacao_compromissos
  FOR SELECT TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacao_compromissos_insert ON public.zoo_operacao_compromissos
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacao_compromissos_update ON public.zoo_operacao_compromissos
  FOR UPDATE TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id))))
  WITH CHECK (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacao_compromissos_delete ON public.zoo_operacao_compromissos
  FOR DELETE TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));

ALTER TABLE public.zoo_operacao_programacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zoo_operacao_programacoes FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zoo_operacao_programacoes TO authenticated;
CREATE POLICY zoo_operacao_programacoes_select ON public.zoo_operacao_programacoes
  FOR SELECT TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacao_programacoes_insert ON public.zoo_operacao_programacoes
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacao_programacoes_update ON public.zoo_operacao_programacoes
  FOR UPDATE TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id))))
  WITH CHECK (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacao_programacoes_delete ON public.zoo_operacao_programacoes
  FOR DELETE TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));

ALTER TABLE public.zoo_operacao_parcelas_programacao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.zoo_operacao_parcelas_programacao FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zoo_operacao_parcelas_programacao TO authenticated;
CREATE POLICY zoo_operacao_parcelas_programacao_select ON public.zoo_operacao_parcelas_programacao
  FOR SELECT TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacao_parcelas_programacao_insert ON public.zoo_operacao_parcelas_programacao
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacao_parcelas_programacao_update ON public.zoo_operacao_parcelas_programacao
  FOR UPDATE TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id))))
  WITH CHECK (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));
CREATE POLICY zoo_operacao_parcelas_programacao_delete ON public.zoo_operacao_parcelas_programacao
  FOR DELETE TO authenticated
  USING (is_admin_agroinblue(auth.uid()) OR (cliente_id IN ( SELECT t.cliente_id FROM get_user_cliente_ids(auth.uid()) t(cliente_id))));

COMMENT ON TABLE public.zoo_operacao_compromissos IS
  'PR-OC-ESTRUTURAL-01: compromisso financeiro da OC (o que se deve, a quem, quanto no total, classificacao, vinculo lote/operacao). Soberano de tipo/favorecido/classificacao/valor_total/vinculo. Divida semantica do catalogo (deducao de preco x compromisso a pagar) ADIADA ao 1o PR comportamental.';
COMMENT ON TABLE public.zoo_operacao_programacoes IS
  'PR-OC-ESTRUTURAL-01: plano de pagamento de um compromisso; uma ativa por compromisso (indice parcial). Renegociar = nova programacao ativa; anterior vira renegociada.';
COMMENT ON TABLE public.zoo_operacao_parcelas_programacao IS
  'PR-OC-ESTRUTURAL-01: parcela da programacao — DECISAO de pagamento (valor/vencimento/conta_bancaria/forma/sequencia). Existe ANTES do titulo; a materializacao (zoo_operacao_partes) guarda snapshot congelado + vinculo ao titulo.';
COMMENT ON COLUMN public.zoo_operacao_partes.programacao_parcela_id IS
  'PR-OC-ESTRUTURAL-01: ancora da materializacao a parcela da programacao. NULL para partes legadas (nenhuma migracao de dados).';

-- ROLLBACK documentado (NAO executar aqui):
--   ALTER TABLE public.zoo_operacao_partes DROP CONSTRAINT zoo_operacao_partes_parcela_prog_fk;
--   DROP INDEX public.zoo_operacao_partes_parcela_prog_ativa_uniq;
--   ALTER TABLE public.zoo_operacao_partes DROP COLUMN programacao_parcela_id;
--   DROP TABLE public.zoo_operacao_parcelas_programacao;
--   DROP TABLE public.zoo_operacao_programacoes;
--   DROP TABLE public.zoo_operacao_compromissos;
