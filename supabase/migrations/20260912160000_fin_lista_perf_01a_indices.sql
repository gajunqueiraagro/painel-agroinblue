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
--   ⚠ CRIAR OS INDICES NAO BASTOU, E ESSE E' O PASSO QUE QUASE FICOU DE FORA. Medido logo
--   apos o CREATE, nas duas dimensoes, o planner IGNOROU os dois e seguiu no
--   `idx_fin_lanc_v2_cliente`, descartando as mesmas 26.907 linhas: `CREATE INDEX
--   CONCURRENTLY` nao atualiza as estatisticas da tabela, e sem elas o planner nao sabe o que
--   o indice novo custa. O `analyze` no fim deste arquivo e' o que fecha a conta.
--
--   DEPOIS DO ANALYZE os dois indices passaram a ser escolhidos — mas SO' para quem escreve o
--   filtro de cancelado do mesmo jeito que o predicado parcial. Medido no proto, mesma
--   consulta, mudando UMA palavra:
--     ... and cancelado is not true ... -> Index Only Scan em idx_flv2_cliente_data_comp,
--                                          "Rows Removed by Filter" 26.907 -> 0 ...... 9,6 ms
--     ... and cancelado = false ....... -> Bitmap por idx_fin_lanc_v2_cliente,
--                                          26.907 descartadas de novo ............... 225 ms
--
--   ⚠ E O APP MANDA `cancelado = false` (`.eq('cancelado', false)`, useFinanceiroV2.ts:438,
--   492 e 803). O Postgres NAO prova que `cancelado = false` implica `cancelado IS NOT TRUE`
--   numa coluna NULAVEL, entao o indice parcial fica inelegivel para a consulta da TELA —
--   conferido tambem com `enable_bitmapscan = off`, onde o planner preferiu Seq Scan a usar
--   o indice. Os 9,6 ms sao reais e nao chegam ao operador.
--
--   ⚠ A ESCOLHA DO PREDICADO FOI MINHA, e o argumento ("casar com os indices vizinhos") nao
--   foi testado contra o que o app de fato envia. O conserto e' recriar os dois com
--   `where cancelado = false` — DDL, do arquiteto, em PR proprio. Enquanto isso, os indices
--   ocupam 792 kB cada e nao servem a tela.
--
--   (Antes do ANALYZE houve um 637 ms -> 57 ms na dimensao financeira que ERA cache: o plano
--   tinha ficado identico, linha por linha. Fica registrado para ninguem reler aquele numero
--   como ganho de indice.)
create index concurrently if not exists idx_flv2_cliente_data_pag
  on financeiro_lancamentos_v2 (cliente_id, data_pagamento)
  where cancelado is not true;

create index concurrently if not exists idx_flv2_cliente_data_comp
  on financeiro_lancamentos_v2 (cliente_id, data_competencia)
  where cancelado is not true;

-- ⚠ O PASSO QUE FALTAVA, E ELE E' PARTE DA MIGRATION. `CREATE INDEX CONCURRENTLY` deixa a
-- tabela sem estatisticas dos indices novos, e sem elas o planner nao os escolhe — medido
-- acima. Rodar UMA vez, depois dos dois CREATE:
analyze financeiro_lancamentos_v2;
