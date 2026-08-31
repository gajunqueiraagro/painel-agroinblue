-- FIN-CONCIL-PORTAR-01 — o indice que o EXPLAIN pediu.
--
-- ⚠ VERSIONAMENTO DE ALGO JA APLICADO. Registro 20260831180434.
--
-- A MEDICAO QUE O ESCOLHEU (EXPLAIN ANALYZE no Proto, agosto/2026, conta com
-- 1.378 lancamentos vivos). Uma chamada de `fn_candidatos_conciliacao` custava
-- 91 ms, e 92% deles estavam num lugar so:
--
--     BitmapAnd                                    83,8 ms
--       ├─ idx_fin_lanc_v2_conta      1.378 linhas   0,1 ms
--       └─ idx_fin_lanc_v2_cliente   30.460 linhas  83,6 ms   <- aqui
--
-- O indice de CONTA ja existia e ja era seletivo; o de CLIENTE nao e', e o
-- planejador varria os 30.460 so' para intersectar os dois. O composto dispensa
-- o cruzamento: uma leitura, ja seletiva.
--
-- ⚠ A HIPOTESE INICIAL ERA OUTRA, e a medicao a corrigiu: o pedido falava em
-- incluir `data_vencimento`/`data_pagamento` na chave. Elas NAO ajudariam — o
-- filtro da janela e' sobre `coalesce(data_pagamento, data_vencimento,
-- data_competencia)`, uma EXPRESSAO, e indice comum nao cobre expressao. Se um
-- dia a janela virar o gargalo, o remedio e' indice DE EXPRESSAO, nao mais
-- colunas nesta chave.
--
-- ⚠ PARCIAL POR `cancelado is not true`: a condicao esta em TODO filtro do motor
-- (e no da tela), entao o indice so' guarda o que alguem consulta — menor, mais
-- quente em cache, e sem paginas de lancamento cancelado no caminho.
--
-- ⚠ A RE-MEDICAO PELO CANAL DE GERENCIA SAIU RUIDOSA (240 ms a 5 s, variancia do
-- proprio canal) e NAO e' prova. A que vale e' a do APP pos-deploy; ate' la o
-- placar de sugestoes fica sob demanda, atras do botao que diz por que existe.

create index if not exists idx_fin_lanc_v2_cliente_conta_vivo
  on public.financeiro_lancamentos_v2 using btree (cliente_id, conta_bancaria_id)
  where (cancelado is not true);
