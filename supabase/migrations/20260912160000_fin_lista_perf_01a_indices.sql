-- FIN-LISTA-PERF-01a — dois indices compostos para o filtro de periodo da lista.
--
--   ⚠ NAO ENVOLVER EM TRANSACAO. `CREATE INDEX CONCURRENTLY` falha dentro de um bloco
--   BEGIN/COMMIT. Aplicar esta migration isolada, sem wrapper — mesmo aviso do
--   20260829160000 (PR-PERF-FLV2-INDICE-LISTAGEM-01), que e o precedente da casa.
--
--   ⚠ O BRIEFING PEDIA OUTRO INDICE, e a medicao mudou a proposta. Ele supunha que a lista
--   filtrava o ano com `extract(year from data_competencia)` e pedia um indice so em
--   `data_competencia`. Medido no repo: NAO existe `extract` no caminho da lista — o front
--   ja monta faixa (`ramoDimensao`, filtrosBaseV2.ts:231) e ja respeita a dimensao escolhida.
--   E medido no banco, a dimensao PADRAO da tela e' "financeira" (COALESCE de pagamento e
--   vencimento), que nem toca `data_competencia`: um indice so naquela coluna nao seria usado
--   no caminho que a tela de fato percorre.
--
--   O QUE FOI MEDIDO (EXPLAIN ANALYZE no proto, 12/09/2026, cliente NJ, ano 2026):
--     dimensao financeira (o padrao) .... 637 ms — BitmapOr de idx_fin_lanc_v2_data_pag com
--                                          idx_flv2_venc_tenant, 7.581 linhas descartadas
--     dimensao competencia .............. 388 ms — bitmap por idx_fin_lanc_v2_cliente,
--                                          26.907 linhas descartadas pelo filtro
--   Nos dois casos o gargalo e' o mesmo: o indice corta por UMA das duas chaves e a outra
--   sobra para o filtro descartar dezenas de milhares de linhas. Dai os compostos.
--
--   POR QUE `cliente_id` NA FRENTE: e' o corte que o banco ja faz primeiro (84 mil linhas
--   para 33 mil no NJ) e o que elimina os descartes acima. A data sozinha nao separa tenants.
--
--   POR QUE `cancelado is not true` E NAO `not cancelado`: e' o idioma dos indices vizinhos
--   desta mesma tabela (idx_lanc_conta_data_ref, uniq_lanc_recorrencia_competencia), e a
--   coluna e' NULAVEL (`attnotnull = false`, ainda que hoje tenha zero nulos). O
--   `.eq('cancelado', false)` do app implica os dois predicados; casar com os vizinhos evita
--   duas convencoes na mesma tabela.
--
--   VENCIMENTO NAO ENTRA: `idx_flv2_venc_tenant` ja e' (cliente_id, data_vencimento, ...) e
--   apareceu sendo usado no plano medido. Tres indices as cegas seria um a mais.
--
--   APLICADOS no proto em 2026-09-12 pelo Chat via MCP (status 201, `indisvalid = true`
--   conferido nos dois). Este arquivo e' o registro, nao a aplicacao.
--
--   ⚠ E ELES AINDA NAO ESTAO SENDO USADOS — medido logo apos criar, nas DUAS dimensoes:
--   o planner continua escolhendo `idx_fin_lanc_v2_cliente` e descartando as mesmas 26.907
--   linhas. `CREATE INDEX CONCURRENTLY` NAO atualiza as estatisticas da tabela, e sem elas o
--   planner nao sabe o que o indice novo custa. Falta rodar, uma vez, fora desta migration:
--       analyze financeiro_lancamentos_v2;
--   Barato e sem bloqueio de escrita. So depois disso vale remedir o EXPLAIN — e se o plano
--   nao mudar nem assim, os indices nao servem para estas consultas e a conclusao honesta e'
--   derruba-los, nao mante-los por terem custado um PR.
create index concurrently if not exists idx_flv2_cliente_data_pag
  on financeiro_lancamentos_v2 (cliente_id, data_pagamento)
  where cancelado is not true;

create index concurrently if not exists idx_flv2_cliente_data_comp
  on financeiro_lancamentos_v2 (cliente_id, data_competencia)
  where cancelado is not true;
