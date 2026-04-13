-- Add hierarchy columns
ALTER TABLE public.planejamento_financeiro
  ADD COLUMN IF NOT EXISTS macro_custo TEXT,
  ADD COLUMN IF NOT EXISTS grupo_custo TEXT,
  ADD COLUMN IF NOT EXISTS escopo_negocio TEXT DEFAULT 'pecuaria',
  ADD COLUMN IF NOT EXISTS unidade_driver TEXT DEFAULT 'cab/mes';

-- Drop old unique constraint and recreate with centro_custo included
ALTER TABLE public.planejamento_financeiro
  DROP CONSTRAINT IF EXISTS planejamento_financeiro_fazenda_id_ano_mes_subcentro_cenario_key;

ALTER TABLE public.planejamento_financeiro
  ADD CONSTRAINT planejamento_fin_unique_line
  UNIQUE (fazenda_id, ano, mes, centro_custo, subcentro, cenario);