-- PR-OC-VALOR-01 — as compras vindas da Operacao Comercial recebem o valor
-- que ja existia em `zoo_operacao_lotes`.
--
-- O DEFEITO. A OC cria o lancamento de chegada no RECEBIMENTO, mas nunca
-- desceu o valor negociado ate ele. Medido em 24/08/2026: 17 lancamentos de
-- compra com `valor_total = 0`, 555 cabecas, em tres clientes. A correlacao e
-- perfeita — toda compra vinda da OC esta sem valor; toda compra com valor foi
-- lancada a mao, fora da OC.
--
-- A FONTE. `zoo_operacao_lotes` guarda criterio + valor unitario por lote, e a
-- ligacao ate o lancamento e `zoo_operacao_movimentacoes.operacao_lote_id`,
-- verificada 1:1 e sem divergencia entre quantidade negociada e recebida.
--
-- SOBERANIA: a SOMA DOS LOTES manda; `zoo_operacoes_comerciais.valor_acordado`
-- NAO desce. Numa operacao do Agnaldo os lotes somam R$ 237.649,58 contra
-- R$ 237.650,00 do contrato — forcar o total criaria R$ 0,42 sem dono em
-- lancamento nenhum.
--
-- O GUARD DE MES FECHADO. `guard_lancamento_mes_fechado_p1` bloqueia por
-- COLUNA, nao por operacao: a lista dele e data, tipo, quantidade, categoria,
-- categoria_destino, fazenda_id, fazenda_destino, fazenda_origem, cancelado e
-- status_operacional — os campos que o fechamento de rebanho consome.
-- `valor_total` nao esta nela, e passa mesmo com jan-jul fechados no P1.
-- NENHUM gatilho foi desabilitado: fechamento e controle, e furar por fora
-- tiraria a garantia que ele existe para dar.
--
-- ESTE PR corrige o passado. A ponte no recebimento, para as compras futuras,
-- e frente propria.

/* A operacao de 01/03/2026 (Agnaldo, 21 garrotes) fica de fora
   DELIBERADAMENTE: e ajuste de saldo, lancado sem valor de proposito.
   Compra sem valor nao e sempre defeito — aqui e o dado correto.
   Nao "corrigir" em varredura futura. */

UPDATE lancamentos lc
SET valor_total = v.valor_lote
FROM (
  SELECT m.movimentacao_id,
         ROUND(
           CASE l.criterio_valor
             WHEN 'kg'     THEN l.qtd_negociada * l.peso_medio_negociado_kg * l.valor_informado
             WHEN 'cabeca' THEN l.qtd_negociada * l.valor_informado
             WHEN 'total'  THEN l.valor_informado
           END::numeric, 2) AS valor_lote
  FROM zoo_operacao_movimentacoes m
  JOIN zoo_operacao_lotes l ON l.id = m.operacao_lote_id
  -- o ajuste de saldo, ver o comentario acima
  WHERE m.operacao_id <> '229ac98d-f472-496d-87a8-162c976b8736'::uuid
) v
WHERE lc.id = v.movimentacao_id
  AND lc.tipo    = 'compra'
  AND lc.cenario = 'realizado'
  AND NOT lc.cancelado
  AND COALESCE(lc.valor_total, 0) = 0
  AND v.valor_lote > 0;
