-- PR-OC-MODEL-01 parte 1 — ADITIVA. Novas colunas de negociação/estado + fazenda soberana.
--   NÃO troca o vocabulário de status_comercial (isso é atômico na parte 4, junto com a
--   revisão de todas as RPCs dependentes) — assim o banco fica funcional ao fim desta migration:
--   as RPCs vigentes (vocabulário antigo) continuam executáveis; as novas colunas são
--   nullable/DEFAULT e não quebram inserts existentes.
-- NÃO aplicar por este PR.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- §A — Fazenda soberana da operação (Decisão 4). Alvo tenant-safe (fazendas tem cliente_id).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.fazendas
  ADD CONSTRAINT fazendas_id_cliente_uniq UNIQUE (id, cliente_id);

ALTER TABLE public.zoo_operacoes_comerciais
  ADD COLUMN fazenda_id uuid;  -- nullable: rascunho salva sem; exigida p/ fechar e p/ movimentar

ALTER TABLE public.zoo_operacoes_comerciais
  ADD CONSTRAINT zoo_operacoes_comerciais_fazenda_fk
  FOREIGN KEY (fazenda_id, cliente_id)
  REFERENCES public.fazendas (id, cliente_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- §B — Rascunho técnico ≠ situação comercial (Decisão 1). Flag ortogonal.
--   DEFAULT false: linhas existentes (vocabulário antigo) permanecem operacionais;
--   o remap correto rascunho/programada é feito na parte 4 (atômica).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.zoo_operacoes_comerciais
  ADD COLUMN rascunho boolean NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────────
-- §C — Dados negociados próprios (Decisão 3). Pertencem à NEGOCIAÇÃO; independem das
--   movimentações efetivas. Unidade/preço reutilizam tipo_precificacao/preco_unitario.
--   valor_final = valor_total já existente (derivado das partes). NÃO duplicar.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.zoo_operacoes_comerciais
  ADD COLUMN qtd_negociada            integer,
  ADD COLUMN categoria_negociada      text,
  ADD COLUMN peso_medio_negociado_kg  numeric,
  ADD COLUMN peso_total_negociado_kg  numeric,
  ADD COLUMN peso_negociado_soberano  text,
  ADD COLUMN valor_estimado           numeric,
  ADD COLUMN valor_acordado           numeric;

ALTER TABLE public.zoo_operacoes_comerciais
  ADD CONSTRAINT zoo_oc_qtd_negociada_pos  CHECK (qtd_negociada IS NULL OR qtd_negociada > 0),
  ADD CONSTRAINT zoo_oc_peso_medio_pos     CHECK (peso_medio_negociado_kg IS NULL OR peso_medio_negociado_kg > 0),
  ADD CONSTRAINT zoo_oc_peso_total_pos     CHECK (peso_total_negociado_kg IS NULL OR peso_total_negociado_kg > 0),
  ADD CONSTRAINT zoo_oc_peso_soberano_dom  CHECK (peso_negociado_soberano IS NULL OR peso_negociado_soberano IN ('medio','total'));
-- NOTA (auditoria): lancamentos.categoria NÃO tem CHECK no banco (domínio só em cattle.ts).
--   Para não criar segundo vocabulário, NÃO adiciono CHECK de categoria aqui; a movimentação
--   escreve em lancamentos (fonte única), com a mesma (não-)restrição de sempre.

-- ─────────────────────────────────────────────────────────────────────────────
-- §D — Encerramento explícito da entrega (Decisão 4). Sem movimentação compensatória.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.zoo_operacoes_comerciais
  ADD COLUMN entrega_encerrada        boolean NOT NULL DEFAULT false,
  ADD COLUMN entrega_encerrada_em     timestamptz,
  ADD COLUMN entrega_encerrada_por    uuid,
  ADD COLUMN entrega_encerrada_motivo text;

COMMENT ON COLUMN public.zoo_operacoes_comerciais.fazenda_id IS
  'PR-OC-MODEL-01: fazenda soberana da operação; origem da fazenda das movimentações efetivas. Nullable em rascunho; obrigatória para fechar/movimentar.';
COMMENT ON COLUMN public.zoo_operacoes_comerciais.rascunho IS
  'PR-OC-MODEL-01: estado TÉCNICO de edição incompleta (não operacional). NÃO é situação comercial; nunca equivale a Programada.';
COMMENT ON COLUMN public.zoo_operacoes_comerciais.valor_total IS
  'PR-OC-MODEL-01: valor_final soberano = derivado das partes (Σ principal incluído + Σ acréscimo incluído − Σ dedução incluído). Base do saldo SOMENTE quando há principal incluído com valor>0.';
