-- CONTA POR DIRECAO — camada 2 de 3: a coluna que responde "de qual conta e esta linha?".
--
-- Quem LE nao deveria precisar saber a convencao. A regra ja existia em TS
-- (`contaEfetivaId`, src/v2/lib/mesa/enriquecimentoView.ts), e o comentario dela dizia ser "a
-- mesma regra do Conciliar". Agora ela mora no banco, uma vez, e chega de graca a todo `select`.
-- Medicao de 17/09/2026: 13 pontos de leitura podem passar a usa-la.
--
-- ⚠ O `COALESCE` NAO E ZELO EXCESSIVO — foi medido. Sem ele, um `CASE` puro devolve NULL para
-- toda entrada que so tem `conta_bancaria_id` preenchido: eram 56 linhas (42 vivas, 14
-- canceladas), e a coluna nasceria com 1.022 nulos em vez de 966. O helper de exibicao do front
-- (`contasExibidasDoLancamento`, src/lib/financeiro/contaPayload.ts) ja carregava esse mesmo
-- fallback, com o mesmo motivo escrito ao lado. As 42 vivas foram carimbadas no backfill
-- (20261027122700); o COALESCE fica porque o historico cancelado NAO se reescreve.
--
-- ⚠ ELA E `GENERATED ALWAYS ... STORED`: read-only no Postgres. Nenhum dos ~52 caminhos de
-- escrita precisa mudar, e NENHUM pode passar a escrever nela.
--
-- ⚠ O INDICE E PARCIAL (`cancelado = false`) porque toda consulta de tela le vivo. Ate aqui a
-- tabela tinha QUATRO indices em `conta_bancaria_id` e NENHUM em `conta_destino_id` — os
-- `.or(conta_bancaria_id.eq.X, conta_destino_id.eq.X)` tinham indice so numa perna.
--
-- Aplicada no proto pelo arquiteto em 17/09/2026; esta migration e REGISTRO HISTORICO.
-- Expressao copiada de information_schema.columns.generation_expression e o indice de pg_indexes.

ALTER TABLE public.financeiro_lancamentos_v2
  ADD COLUMN IF NOT EXISTS conta_efetiva_id uuid
  GENERATED ALWAYS AS (
    CASE
      WHEN (tipo_operacao ~~ '1-%'::text) THEN COALESCE(conta_destino_id, conta_bancaria_id)
      ELSE conta_bancaria_id
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_fin_lanc_v2_conta_efetiva
  ON public.financeiro_lancamentos_v2 USING btree (conta_efetiva_id)
  WHERE (cancelado = false);
