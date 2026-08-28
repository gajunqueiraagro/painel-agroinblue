-- PR-PERF-FLV2-INDICE-LISTAGEM-01 — indice composto para a listagem do Financeiro.
--
--   ⚠ NAO ENVOLVER EM TRANSACAO. `CREATE INDEX CONCURRENTLY` falha dentro de um bloco
--   BEGIN/COMMIT. Aplicar esta migration isolada, sem wrapper.
--
--   O ALVO, medido em pg_stat_statements (27/08): a query mais executada do banco.
--     154.626 chamadas · 323 ms de media · 49.968 s acumulados
--   Mesma forma com `fazenda_id` no lugar de `cliente_id`: 28.532 chamadas, 565 ms,
--   16.123 s. Mesma forma com recorte de ano (gte/lte data_pagamento): 16.048 chamadas,
--   488 ms, 7.830 s. As tres saem do MESMO arquivo — `src/hooks/useFinanceiro.ts`,
--   ramos Global (cliente_id) e por fazenda, com e sem `anoFiltro`.
--
--   ⚠ O NUMERO DE CHAMADAS NAO E' LOOP: e' PAGINACAO. `fetchAllPaginated`
--   (useFinanceiro.ts:181) percorre paginas de 1.000 em SEQUENCIA, e cada pagina e' uma
--   requisicao. Medido hoje: NJ Pecuaria tem 29.336 linhas nesse recorte = 31 chamadas
--   por execucao; Santa Rita 19; Agnaldo 14. O indice ataca o CUSTO de cada pagina; o
--   NUMERO de paginas e' outra frente (keyset em vez de OFFSET, ou agregacao no banco).
--
--   POR QUE ESTA ORDEM DE COLUNAS: as tres igualdades primeiro (cliente_id,
--   status_transacao, cenario), depois as duas do ORDER BY na MESMA direcao
--   (data_pagamento DESC, id DESC). Assim o planner satisfaz o WHERE pelo prefixo e le
--   a ordenacao direto do indice, sem sort — que e' o que torna o OFFSET alto caro hoje.
--
--   POR QUE PARCIAL: `cancelado = false AND sem_movimentacao_caixa = false` aparece em
--   TODA listagem do Financeiro, entao sai das colunas e vira predicado — indice menor e
--   mais quente em cache.
--
--   ⚠ COBERTURA CONFERIDA CONTRA O CODIGO, e ha DUAS consultas que este indice NAO vai
--   servir, de proposito:
--     src/lib/financeiro/matchOfxOnDemand.ts:257
--     src/pages/ConciliacaoBancariaTab.tsx:327
--   As duas usam `.not('sem_movimentacao_caixa','is',true)`, que INCLUI NULL, enquanto o
--   predicado parcial `= false` exclui NULL (PR-FIX-SMC-NULL-01). O planner nao tem como
--   provar que o parcial cobre o `NOT (x IS TRUE)`, entao elas seguem no caminho antigo.
--   Sao consultas de conciliacao, com outra forma e outro volume — nao sao o alvo.
--   Variantes que CONTINUAM aproveitando: `.in('status_transacao', [...])` (7 pontos) e
--   `.eq('cenario','meta')` (20 pontos) usam o mesmo prefixo; `.neq('status_transacao',
--   'conciliado')` (3 pontos) so aproveita `cliente_id` e filtra o resto.
--
--   CONCURRENTLY: a tabela e' a mais escrita do sistema (20.354 INSERTs medidos). Sem
--   CONCURRENTLY o CREATE INDEX trava escrita ate terminar.
--
--   Requer PROTO (binbcdfbisgscrifztia). NUNCA em producao sem medir la.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flv2_listagem_tenant
  ON public.financeiro_lancamentos_v2
     (cliente_id, status_transacao, cenario, data_pagamento DESC, id DESC)
  WHERE cancelado = false AND sem_movimentacao_caixa = false;

COMMENT ON INDEX public.idx_flv2_listagem_tenant IS
  'PR-PERF-FLV2-INDICE-LISTAGEM-01: serve a listagem paginada do Financeiro (useFinanceiro.ts, ramo Global) — 3 igualdades no prefixo + ORDER BY data_pagamento DESC, id DESC lido do indice, sem sort. Parcial em cancelado=false AND sem_movimentacao_caixa=false. NAO cobre consultas com .not(sem_movimentacao_caixa is true), que incluem NULL.';
