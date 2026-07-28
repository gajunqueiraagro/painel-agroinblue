-- PR-FIN-DATAS-01 — Fundação ADITIVA do eixo de VENCIMENTO no Financeiro V2.
--   Adiciona a coluna data_vencimento (date, NULL) em public.financeiro_lancamentos_v2.
--   ESTRITAMENTE ADITIVA e sem mudança de comportamento: sem default, sem NOT NULL,
--   sem backfill/UPDATE, sem índice, sem trigger, sem constraint adicional, sem generated
--   column, sem view/função/RPC, sem alterar grants/RLS e sem tocar qualquer outra coluna
--   (data_pagamento, data_competencia, ano_mes e status_transacao permanecem intocados).
--   ADD COLUMN date NULL sem default = alteração de catálogo (sem rewrite de tabela).
--   Alvo: PROTO (binbcdfbisgscrifztia). NÃO aplicada nesta etapa — permanece como arquivo local.
--   Rollback: ALTER TABLE public.financeiro_lancamentos_v2 DROP COLUMN data_vencimento;

ALTER TABLE public.financeiro_lancamentos_v2
  ADD COLUMN data_vencimento date;

COMMENT ON COLUMN public.financeiro_lancamentos_v2.data_vencimento IS
  'Data em que a obrigação é devida para pagamento ou recebimento. Eixo de vencimento: governa contas a pagar/receber, fluxo projetado e aging. Não confundir com data_pagamento, que representa a liquidação efetiva, nem com data_competencia, que representa o fato econômico. NULL indica vencimento ainda não definido, meta, planejamento ou registro legado.';
