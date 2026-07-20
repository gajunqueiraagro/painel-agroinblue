-- PR-OC-MODEL-02B parte 1 — Abate estruturado (ADR-2026-16 Decisão 3.B).
--   Dados físicos/comerciais estruturados do abate como COLUNAS PRÓPRIAS de
--   zoo_operacoes_comerciais (não são componentes de valor; nada vira JSONB).
--   Carcaça canônica = peso_carcaca_kg_total + peso_carcaca_fonte; kg/cabeça, @/cabeça
--   e @/total são derivadas na UI, jamais persistidas.
--   Todas as colunas são NULLABLE; a aplicabilidade por tipo_operacao é imposta na RPC (parte 2).
-- NÃO aplicar por este PR (aplicação é etapa separada sob autorização).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.zoo_operacoes_comerciais
  ADD COLUMN data_embarque         date,
  ADD COLUMN data_abate            date,
  ADD COLUMN modalidade_comercial  text,
  ADD COLUMN tipo_peso             text,
  ADD COLUMN rendimento_carcaca    numeric,
  ADD COLUMN peso_carcaca_kg_total numeric,
  ADD COLUMN peso_carcaca_fonte    text;

ALTER TABLE public.zoo_operacoes_comerciais
  ADD CONSTRAINT zoo_oc_modalidade_comercial_chk
    CHECK (modalidade_comercial IS NULL OR modalidade_comercial IN ('escala','a_termo','spot','outro')),
  ADD CONSTRAINT zoo_oc_tipo_peso_chk
    CHECK (tipo_peso IS NULL OR tipo_peso IN ('vivo','morto')),
  ADD CONSTRAINT zoo_oc_rendimento_carcaca_chk
    CHECK (rendimento_carcaca IS NULL OR (rendimento_carcaca > 0 AND rendimento_carcaca < 100)),
  ADD CONSTRAINT zoo_oc_peso_carcaca_kg_total_chk
    CHECK (peso_carcaca_kg_total IS NULL OR peso_carcaca_kg_total > 0),
  ADD CONSTRAINT zoo_oc_peso_carcaca_fonte_chk
    CHECK (peso_carcaca_fonte IS NULL OR peso_carcaca_fonte IN ('kg_cabeca','kg_total','arroba_cabeca','arroba_total')),
  -- coerência: peso_carcaca_kg_total e peso_carcaca_fonte presentes juntos ou ausentes juntos
  ADD CONSTRAINT zoo_oc_peso_carcaca_coerencia_chk
    CHECK ((peso_carcaca_kg_total IS NULL) = (peso_carcaca_fonte IS NULL)),
  -- coerência: data_embarque <= data_abate quando ambas presentes
  ADD CONSTRAINT zoo_oc_datas_abate_coerencia_chk
    CHECK (data_embarque IS NULL OR data_abate IS NULL OR data_embarque <= data_abate);

COMMENT ON COLUMN public.zoo_operacoes_comerciais.data_embarque IS
  'ADR-2026-16 D3.B: data de embarque (abate). NULL quando não informado.';
COMMENT ON COLUMN public.zoo_operacoes_comerciais.data_abate IS
  'ADR-2026-16 D3.B: data de abate. Coerência: data_embarque <= data_abate quando ambas presentes.';
COMMENT ON COLUMN public.zoo_operacoes_comerciais.modalidade_comercial IS
  'ADR-2026-16 D3.B: modalidade comercial (escala|a_termo|spot|outro). Aplicável a abate e venda; recusada em compra (RPC).';
COMMENT ON COLUMN public.zoo_operacoes_comerciais.tipo_peso IS
  'ADR-2026-16 D3.B: tipo de peso base (vivo|morto). Exclusivo de operação de abate (RPC).';
COMMENT ON COLUMN public.zoo_operacoes_comerciais.rendimento_carcaca IS
  'ADR-2026-16 D3.B: rendimento de carcaça em % (> 0 e < 100). Exclusivo de operação de abate (RPC).';
COMMENT ON COLUMN public.zoo_operacoes_comerciais.peso_carcaca_kg_total IS
  'ADR-2026-16 D3.B: peso de carcaça CANÔNICO em kg (total). Valor persistido soberano; kg/@ por cabeça são derivadas na UI.';
COMMENT ON COLUMN public.zoo_operacoes_comerciais.peso_carcaca_fonte IS
  'ADR-2026-16 D3.B: fonte soberana da edição da carcaça (kg_cabeca|kg_total|arroba_cabeca|arroba_total). Presente junto com peso_carcaca_kg_total.';
