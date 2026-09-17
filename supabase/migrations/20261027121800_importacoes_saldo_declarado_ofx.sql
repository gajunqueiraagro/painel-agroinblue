-- Guarda o saldo que o arquivo do banco declara (OFX LEDGERBAL), hoje lido na
-- previa e descartado. E conferencia: nao prevalece sobre o saldo manual do
-- saldos_v2. Nulo = arquivo sem saldo declarado (CSV, importacao antiga).
ALTER TABLE public.financeiro_importacoes_v2
  ADD COLUMN IF NOT EXISTS saldo_declarado numeric(14,2) NULL,
  ADD COLUMN IF NOT EXISTS saldo_declarado_data date NULL;
COMMENT ON COLUMN public.financeiro_importacoes_v2.saldo_declarado
  IS 'Saldo que o arquivo do banco declara (OFX LEDGERBAL). E conferencia, nao prevalece sobre o saldo manual do saldos_v2.';
COMMENT ON COLUMN public.financeiro_importacoes_v2.saldo_declarado_data
  IS 'Data da posicao do saldo declarado no arquivo (OFX DTASOF).';
