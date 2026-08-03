-- PR-CONC-GRUPO-FASE-1 — Migration 01: schema (aditivo, A+)
-- Adiciona grupo_id (nullable) em conciliacao_bancaria_itens + vocabulário de tipo_aprovacao + índice.
-- SEM tabela conciliacao_grupos. Status permanece DERIVADO dos itens (desfeito_em) + extrato.status.
-- Verificado: SELECT DISTINCT tipo_aprovacao = {'manual'} → ambos os CHECKs passam no dado atual.

ALTER TABLE public.conciliacao_bancaria_itens
  ADD COLUMN IF NOT EXISTS grupo_id uuid;   -- 1:1 individual = NULL; membro de grupo = uuid do grupo

-- Vocabulário fechado de tipo_aprovacao.
ALTER TABLE public.conciliacao_bancaria_itens
  ADD CONSTRAINT chk_cbi_tipo_aprovacao
  CHECK (tipo_aprovacao IN ('manual','agrupamento_manual','agrupamento_legado'));

-- Coerência: grupo_id presente <=> tipo de agrupamento; ausente <=> 'manual'.
ALTER TABLE public.conciliacao_bancaria_itens
  ADD CONSTRAINT chk_cbi_grupo_tipo
  CHECK (
    (grupo_id IS NULL     AND tipo_aprovacao = 'manual') OR
    (grupo_id IS NOT NULL AND tipo_aprovacao IN ('agrupamento_manual','agrupamento_legado'))
  );

CREATE INDEX IF NOT EXISTS idx_cbi_grupo
  ON public.conciliacao_bancaria_itens (grupo_id) WHERE grupo_id IS NOT NULL;

-- ───────────────────────── ROLLBACK (metadado apenas; NUNCA desfaz vínculo) ─────────────────────────
-- UPDATE public.conciliacao_bancaria_itens SET tipo_aprovacao='manual'
--   WHERE tipo_aprovacao IN ('agrupamento_manual','agrupamento_legado');
-- ALTER TABLE public.conciliacao_bancaria_itens DROP CONSTRAINT chk_cbi_grupo_tipo;
-- ALTER TABLE public.conciliacao_bancaria_itens DROP CONSTRAINT chk_cbi_tipo_aprovacao;
-- DROP INDEX IF EXISTS public.idx_cbi_grupo;
-- ALTER TABLE public.conciliacao_bancaria_itens DROP COLUMN grupo_id;
