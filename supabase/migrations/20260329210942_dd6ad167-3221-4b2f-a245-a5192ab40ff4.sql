
ALTER TABLE public.financeiro_contas_bancarias
  ADD COLUMN IF NOT EXISTS codigo_conta text,
  ADD COLUMN IF NOT EXISTS nome_exibicao text;

COMMENT ON COLUMN public.financeiro_contas_bancarias.tipo_conta IS 'cc, inv, cartao';
COMMENT ON COLUMN public.financeiro_contas_bancarias.codigo_conta IS 'Código legível: cc-001, inv-002, cartao-001';
COMMENT ON COLUMN public.financeiro_contas_bancarias.nome_exibicao IS 'Nome simplificado para exibição no app';
