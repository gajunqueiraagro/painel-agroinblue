-- Drop the existing FK and recreate with ON DELETE CASCADE
ALTER TABLE public.financeiro_lancamentos_v2
  DROP CONSTRAINT IF EXISTS financeiro_lancamentos_v2_movimentacao_rebanho_id_fkey;

ALTER TABLE public.financeiro_lancamentos_v2
  ADD CONSTRAINT financeiro_lancamentos_v2_movimentacao_rebanho_id_fkey
  FOREIGN KEY (movimentacao_rebanho_id)
  REFERENCES public.lancamentos(id)
  ON DELETE CASCADE;