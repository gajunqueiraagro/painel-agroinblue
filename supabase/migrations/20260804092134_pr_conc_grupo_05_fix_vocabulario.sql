-- PR-CONC-GRUPO-FASE-1 — Migration 05 (CORRETIVA): reconcilia o vocabulário de tipo_aprovacao.
-- A Migration 01 não considerou a constraint pré-existente `chk_tipo_aprovacao` (manual,
-- sugestao_forte_aprovada, sugestao_fraca_aprovada, staging_auto). Como as duas constraints se somam,
-- o permitido virou a INTERSEÇÃO (só 'manual'), bloqueando os valores de agrupamento E regredindo o
-- vocabulário legado. Esta migration unifica num único CHECK de vocabulário = SUPERSET (4 legados + 2 novos)
-- e corrige a coerência grupo_id<->tipo. Não altera dado (tudo é 'manual' hoje). Sem tocar vínculos.

ALTER TABLE public.conciliacao_bancaria_itens DROP CONSTRAINT chk_tipo_aprovacao;       -- antiga (4 valores)
ALTER TABLE public.conciliacao_bancaria_itens DROP CONSTRAINT chk_cbi_tipo_aprovacao;   -- da 01 (estreita demais)

ALTER TABLE public.conciliacao_bancaria_itens
  ADD CONSTRAINT chk_cbi_tipo_aprovacao
  CHECK (tipo_aprovacao IN (
    'manual','sugestao_forte_aprovada','sugestao_fraca_aprovada','staging_auto',
    'agrupamento_manual','agrupamento_legado'
  ));

ALTER TABLE public.conciliacao_bancaria_itens DROP CONSTRAINT chk_cbi_grupo_tipo;

ALTER TABLE public.conciliacao_bancaria_itens
  ADD CONSTRAINT chk_cbi_grupo_tipo
  CHECK (
    (grupo_id IS NULL AND tipo_aprovacao IN
       ('manual','sugestao_forte_aprovada','sugestao_fraca_aprovada','staging_auto')) OR
    (grupo_id IS NOT NULL AND tipo_aprovacao IN
       ('agrupamento_manual','agrupamento_legado'))
  );

-- ───────────────────────── ROLLBACK ─────────────────────────
-- ALTER TABLE public.conciliacao_bancaria_itens DROP CONSTRAINT chk_cbi_grupo_tipo;
-- ALTER TABLE public.conciliacao_bancaria_itens DROP CONSTRAINT chk_cbi_tipo_aprovacao;
-- ALTER TABLE public.conciliacao_bancaria_itens ADD CONSTRAINT chk_tipo_aprovacao
--   CHECK (tipo_aprovacao IN ('manual','sugestao_forte_aprovada','sugestao_fraca_aprovada','staging_auto'));
-- (re-adicionar chk_cbi_tipo_aprovacao/chk_cbi_grupo_tipo estreitas só se reverter tudo à 01.)
