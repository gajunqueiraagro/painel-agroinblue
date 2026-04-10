
ALTER TABLE public.financeiro_lancamentos_v2
ADD COLUMN grupo_custo text;

COMMENT ON COLUMN public.financeiro_lancamentos_v2.grupo_custo IS 'Grupo de custo derivado automaticamente do plano de contas oficial via trigger';
