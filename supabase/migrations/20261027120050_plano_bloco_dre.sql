-- APLICADA no proto em 16/09/2026 (arquiteto, GO do Gabriel). Versionar sem alterar.
-- O plano de contas passa a declarar em que bloco do DRE da lavoura cada subcentro entra.
-- Fonte unica da ordem do DRE (padrao Conab): receita > deducao > custeio > pos_colheita > fixo > juros > investimento.

ALTER TABLE public.financeiro_plano_contas ADD COLUMN IF NOT EXISTS bloco_dre text;
ALTER TABLE public.financeiro_plano_contas DROP CONSTRAINT IF EXISTS financeiro_plano_contas_bloco_dre_check;
ALTER TABLE public.financeiro_plano_contas ADD CONSTRAINT financeiro_plano_contas_bloco_dre_check CHECK (bloco_dre IS NULL OR bloco_dre IN ('receita','deducao','custeio','pos_colheita','fixo','juros','investimento'));
COMMENT ON COLUMN public.financeiro_plano_contas.bloco_dre IS 'Bloco do DRE da lavoura (Conab): receita, deducao, custeio, pos_colheita, fixo, juros, investimento. NULL = fora do DRE. Fonte unica da ordem do DRE; a RPC fn_dre_lavoura agrupa por ele.';
UPDATE public.financeiro_plano_contas SET bloco_dre = CASE
  WHEN grupo_custo = 'Receita Agrícola' THEN 'receita'
  WHEN grupo_custo = 'Deduções Agricultura' THEN 'deducao'
  WHEN grupo_custo = 'Custo Variável Agricultura' AND centro_custo IN ('Logística','Pós-Colheita','Financeiro') THEN 'pos_colheita'
  WHEN grupo_custo = 'Custo Variável Agricultura' THEN 'custeio'
  WHEN grupo_custo = 'Custo Fixo Agricultura' THEN 'fixo'
  WHEN grupo_custo = 'Juros de Financiamento Agricultura' THEN 'juros'
  WHEN grupo_custo = 'Investimento Agricultura' THEN 'investimento'
  ELSE NULL END
WHERE escopo_negocio = 'agricultura';
-- Resultado no proto: custeio 15 · pos_colheita 5 · fixo 20 · investimento 9 · juros 1 · deducao 3 · receita 7 · NULL 4 (amortizacao, financiamento, adiantamentos).
