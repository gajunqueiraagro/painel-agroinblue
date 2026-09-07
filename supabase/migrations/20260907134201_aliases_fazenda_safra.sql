-- 20260907134201 aliases_fazenda_safra (aplicada no proto via Management API em 07/09/2026)

ALTER TABLE public.fazendas ADD COLUMN IF NOT EXISTS aliases jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.financeiro_safras ADD COLUMN IF NOT EXISTS aliases jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.fazendas.aliases IS 'Apelidos vindos de planilhas do cliente (de-para memorizado). Mesmo padrao de financeiro_fornecedores.aliases.';
COMMENT ON COLUMN public.financeiro_safras.aliases IS 'Apelidos vindos de planilhas do cliente (de-para memorizado). Mesmo padrao de financeiro_fornecedores.aliases.';

