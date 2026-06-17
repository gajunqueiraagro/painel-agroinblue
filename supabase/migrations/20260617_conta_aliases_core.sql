-- PR-ContaAliases-Core — paridade repo↔banco (já aplicado no proto via Management API)
-- Resolução de conta por alias: "Banco Brasil" (Excel) → "Banco do Brasil" (cadastro NJ).
-- Mesmo padrão de financeiro_fornecedores.aliases (jsonb).

ALTER TABLE financeiro_contas_bancarias ADD COLUMN IF NOT EXISTS aliases jsonb;

UPDATE financeiro_contas_bancarias
SET aliases = '["Banco Brasil"]'::jsonb
WHERE id = '3b9afa7a-0af6-4bce-8ec9-03b91484dfd8';
