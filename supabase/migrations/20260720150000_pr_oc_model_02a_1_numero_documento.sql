-- PR-OC-MODEL-02A parte 1 — campo estruturado COMUM: numero_documento (NF).
--   Referência: ADR-2026-16 (BASELINE v1) Decisão 4 (numero_documento — comum — AGORA)
--   e Decisão 5 (MODEL-02A = campos estruturados comuns: numero_documento).
--   Aditiva, nullable: hoje o modal exibe o número sem persistir; passa a persistir.
-- NÃO aplicar por este PR — aplicação é etapa separada.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.zoo_operacoes_comerciais
  ADD COLUMN numero_documento text;

COMMENT ON COLUMN public.zoo_operacoes_comerciais.numero_documento IS
  'PR-OC-MODEL-02A / ADR-2026-16: numero do documento fiscal (NF) da operacao. Campo estruturado comum (compra/venda/abate); texto (aceita serie/letras); nullable.';
