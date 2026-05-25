-- ====================================================================
-- PR-H1 — tipo_conta oficial em financeiro_contas_bancarias
-- ====================================================================
-- Padroniza o vocabulário do campo tipo_conta para 5 valores oficiais:
--   corrente | investimento | cartao | caixa | outro
--
-- Backfill determinístico (sem heurística por nome): mapeia o vocabulário
-- legado em uso no front (cc/inv) para o novo. Valores desconhecidos viram
-- 'outro' (operador reclassifica manualmente depois). NULL permanece NULL.
-- Após o backfill, CHECK constraint enforce o vocabulário oficial.

-- 1. Backfill determinístico (somente por valor exato, sem nome/fuzzy).
UPDATE public.financeiro_contas_bancarias
SET tipo_conta = CASE tipo_conta
  WHEN 'cc'           THEN 'corrente'
  WHEN 'corrente'     THEN 'corrente'
  WHEN 'inv'          THEN 'investimento'
  WHEN 'investimento' THEN 'investimento'
  WHEN 'cartao'       THEN 'cartao'
  WHEN 'caixa'        THEN 'caixa'
  WHEN 'outro'        THEN 'outro'
  ELSE                     'outro'  -- valores legados desconhecidos
END
WHERE tipo_conta IS NOT NULL;

-- 2. CHECK constraint enforcando vocabulário oficial.
ALTER TABLE public.financeiro_contas_bancarias
  ADD CONSTRAINT financeiro_contas_bancarias_tipo_conta_check
  CHECK (
    tipo_conta IS NULL
    OR tipo_conta IN ('corrente', 'investimento', 'cartao', 'caixa', 'outro')
  );

-- 3. COMMENT atualizado (estava desatualizado: 'cc, inv, cartao').
COMMENT ON COLUMN public.financeiro_contas_bancarias.tipo_conta IS
  'Classificacao oficial da conta: corrente | investimento | cartao | caixa | outro. Default ''corrente''. NULL permitido apenas para registros legados.';

-- Default ja eh 'corrente' (migration original 20260329145921). Mantido.
