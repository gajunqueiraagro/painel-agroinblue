-- Add grupo_custo column to financeiro_plano_contas
ALTER TABLE public.financeiro_plano_contas
ADD COLUMN grupo_custo text;

-- Add index for performance on grouping queries
CREATE INDEX idx_plano_contas_grupo_custo ON public.financeiro_plano_contas (cliente_id, grupo_custo);
