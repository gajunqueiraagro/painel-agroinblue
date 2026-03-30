
-- Add payment fields to financeiro_fornecedores
ALTER TABLE public.financeiro_fornecedores
  ADD COLUMN IF NOT EXISTS tipo_recebimento text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pix_tipo_chave text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pix_chave text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS banco text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS agencia text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS conta text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tipo_conta text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cpf_cnpj_pagamento text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nome_favorecido text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS observacao_pagamento text DEFAULT NULL;

-- Add payment fields to financeiro_lancamentos_v2
ALTER TABLE public.financeiro_lancamentos_v2
  ADD COLUMN IF NOT EXISTS forma_pagamento text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS dados_pagamento text DEFAULT NULL;
