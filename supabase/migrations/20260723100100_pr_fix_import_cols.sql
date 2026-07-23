-- PR-FIX-IMPORT-COLS: colunas de rastreabilidade do cabeçalho de importação
-- que o frontend envia desde 07/05 (ddc51109). Aditivas, NULL, zero impacto
-- nas 50 importações históricas e no fluxo Excel.
ALTER TABLE public.financeiro_importacoes_v2
  ADD COLUMN IF NOT EXISTS conta_bancaria_id uuid NULL
    REFERENCES public.financeiro_contas_bancarias(id),
  ADD COLUMN IF NOT EXISTS tipo_arquivo text NULL;

COMMENT ON COLUMN public.financeiro_importacoes_v2.conta_bancaria_id IS
  'Conta bancária alvo da importação de extrato (OFX/CSV/PDF). NULL em importações antigas/Excel.';
COMMENT ON COLUMN public.financeiro_importacoes_v2.tipo_arquivo IS
  'Formato do arquivo importado conforme enviado pelo app (ex.: OFX, CSV, PDF). NULL em registros antigos.';

-- ROLLBACK LITERAL (não executar; registro de reversão):
-- ALTER TABLE public.financeiro_importacoes_v2
--   DROP COLUMN IF EXISTS conta_bancaria_id,
--   DROP COLUMN IF EXISTS tipo_arquivo;
