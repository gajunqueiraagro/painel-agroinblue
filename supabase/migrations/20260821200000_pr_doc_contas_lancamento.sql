-- 20260821200000_pr_doc_contas_lancamento.sql
-- PR-DOC-CONTAS-LANCAMENTO-01 — documenta qual coluna de conta vale em cada tipo.
--
-- O INCIDENTE QUE MOTIVOU ESTA MIGRATION (2026-08-21).
-- financeiro_lancamentos_v2 tem DUAS colunas de conta e nenhuma delas estava
-- documentada — col_description devolvia NULL para as tres colunas envolvidas.
-- Consultando apenas conta_bancaria_id, encontram-se 3.471 entradas com NULL, e a
-- conclusao imediata e' que metade do fluxo financeiro esta orfa: R$ 17 mi sem conta.
-- Chegou-se a propor uma frente de correcao com backfill.
--
-- ERA DIAGNOSTICO ERRADO. As entradas usam conta_destino_id, e 100% delas a tem
-- preenchida. O que denunciou o engano foi o comportamento do sistema: fluxo de caixa,
-- conciliacao e dashboard financeiro BATEM — e batem porque o modelo esta correto.
--
-- O DESENHO E COERENTE: saida tem ORIGEM, entrada tem DESTINO, transferencia tem as
-- DUAS. Cada lancamento carrega a conta que faz sentido para ele. O que faltava era
-- alguem dizer isso a quem le o esquema.
--
-- MEDIDO NO PROTO, realizados e nao cancelados:
--     tipo                total    sem conta_bancaria   sem conta_destino   sem NENHUMA
--     2-Saidas           59.750               26              59.750             26
--     1-Entradas          3.496            3.471                  15              0
--     3-Transferencias    4.554                0                   0              0
--     3-Transferencia          6                0                   0              0
--
-- POR QUE NAO RENOMEAR A COLUNA. conta_bancaria_id existe em 18 tabelas e esta CERTA em
-- 17: em financeiro_saldos_bancarios_v2, extrato_bancario_v2 e financeiro_importacoes_v2
-- ela e' simplesmente "a conta", sem papel de origem ou destino. Renomear so' aqui daria
-- dois nomes ao mesmo conceito e quebraria a leitura de qualquer join entre elas. Custo
-- medido: 36 funcoes do banco, 3 views, 74 arquivos de src/ e 617 ocorrencias em
-- migrations — risco alto para ganho de nomenclatura. A duvida que causou o erro se
-- resolve com tres COMMENT.
--
-- ESCOPO. SOMENTE COMMENT ON COLUMN. Nenhuma coluna renomeada, criada, removida ou
-- alterada. Nenhum dado, nenhuma funcao, view, trigger, indice ou constraint. As outras
-- 17 tabelas com conta_bancaria_id nao sao tocadas.
--
-- Migration PREPARADA — aplicar somente pelo processo autorizado.

COMMENT ON COLUMN public.financeiro_lancamentos_v2.conta_bancaria_id IS
  'Conta de ORIGEM do recurso. Saída: de onde o dinheiro sai. Transferência: a conta que envia. Entrada: fica NULL — a conta é conta_destino_id. Medido em 2026-08-21 (realizados, não cancelados): NULL em 3.471 de 3.496 entradas, por desenho.';

COMMENT ON COLUMN public.financeiro_lancamentos_v2.conta_destino_id IS
  'Conta de DESTINO do recurso. Entrada: para onde o dinheiro entra. Transferência: a conta que recebe. Saída: fica NULL por desenho.';

COMMENT ON COLUMN public.financeiro_lancamentos_v2.transferencia_grupo_id IS
  'Agrupador de transferência. UM registro por transferência, NÃO um par: transferência é um único lançamento carregando origem e destino. O invariante medido é grupos distintos = registros com grupo, em qualquer recorte — 4.189/4.189 nos realizados não cancelados, 4.718/4.718 em todos os status. Nem toda transferência tem grupo: 371 sem grupo nos realizados (522 em todos). A razão não foi investigada.';


-- ================================================================================================
-- MANUAL ROLLBACK — NAO EXECUTA. Bloco integralmente comentado.
-- Reverter apaga a documentacao e devolve o esquema ao estado em que o engano acima foi
-- cometido. Nenhum dado e' afetado: COMMENT nao toca linha.
-- ------------------------------------------------------------------------------------------------
-- COMMENT ON COLUMN public.financeiro_lancamentos_v2.conta_bancaria_id IS NULL;
-- COMMENT ON COLUMN public.financeiro_lancamentos_v2.conta_destino_id IS NULL;
-- COMMENT ON COLUMN public.financeiro_lancamentos_v2.transferencia_grupo_id IS NULL;
-- ================================================================================================
