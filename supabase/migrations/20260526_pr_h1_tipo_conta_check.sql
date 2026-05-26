-- ====================================================================
-- PR-H1 — CHECK constraint em financeiro_contas_bancarias.tipo_conta
-- ====================================================================
-- Vocabulário oficial CURTO (decisão consolidada): cc | inv | cartao.
--   cc      = conta corrente, caixa físico, dinheiro
--   inv     = investimento, corretora, CDB, aplicação
--   cartao  = cartão de crédito/débito
--
-- Banco hoje está 100% populado em vocabulário curto. A normalização
-- defensiva abaixo só age se houver alguma linha em vocabulário longo
-- (corrente/investimento/caixa/outro) — é idempotente: sem-op quando
-- não há nada a corrigir.
--
-- NÃO adicionar NOT NULL nesta migration. NÃO mudar default ('corrente'
-- da migration original NÃO bate com o vocabulário atual, mas a coluna
-- já é populada pelo UI — front passa o valor explícito. Default só
-- afeta INSERT sem coluna, o que não acontece nos paths atuais).
-- Trocar default fica para um PR futuro junto com NOT NULL e form
-- obrigatório.

-- 1. Normalização defensiva (idempotente — só age em valores longos).
UPDATE public.financeiro_contas_bancarias
SET tipo_conta = CASE tipo_conta
  WHEN 'corrente'      THEN 'cc'
  WHEN 'investimento'  THEN 'inv'
  WHEN 'caixa'         THEN 'cc'
  WHEN 'outro'         THEN 'cc'
  ELSE tipo_conta
END
WHERE tipo_conta IN ('corrente', 'investimento', 'caixa', 'outro');

-- 2. CHECK constraint enforcing vocabulário oficial curto.
ALTER TABLE public.financeiro_contas_bancarias
  DROP CONSTRAINT IF EXISTS financeiro_contas_bancarias_tipo_conta_check;
ALTER TABLE public.financeiro_contas_bancarias
  ADD CONSTRAINT financeiro_contas_bancarias_tipo_conta_check
  CHECK (
    tipo_conta IS NULL
    OR tipo_conta IN ('cc', 'inv', 'cartao')
  );

-- 3. COMMENT atualizado.
COMMENT ON COLUMN public.financeiro_contas_bancarias.tipo_conta IS
  'Classificacao oficial da conta: cc = conta corrente/caixa/dinheiro; inv = investimento; cartao = cartao.';
