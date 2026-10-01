-- CONC-TRANSF-SEGUNDA-PONTA-03 — extratos GEMEOS (mesma conta, data e valor) fecham meias ponta em ordem.
--
-- Fato (NJ, Itau BBA mar/2026, 01/10): livres Itau 06/03 -100.000 (ca9c09ad) e Itau 06/03 -100.000 (09157227), identicos;
-- meias abertas 1b46c5de (Itau -> Sicredi Lavoura, 06/03) e bd99294f (Itau -> BB, 06/03), cada uma ligada so' na entrada.
-- _fn_meia_ponta_compativel devolvia NULL para os dois (2 x 2 nao e' 1:1): nada aparecia e nao havia caminho na tela.
--
-- REGRA: extratos em disputa INDISTINGUIVEIS (mesma conta, data e valor) em numero IGUAL ao de transferencias abertas
-- compativeis -> atribuicao por ordem estavel (extrato por id; transferencia por data, created_at, id); qualquer uma e'
-- equivalente. Fora desse caso, a regra 1:1 de antes (que e' o caso de UM gemeo).
-- So' _fn_meia_ponta_compativel muda (mesma assinatura); a lista, a segunda ponta, a irma e o de_extratos ja' leem so' ela.
-- Corpo integral (o da 20261027185800, copiado do arquivo) com guarda de origem e de destino.
-- GESTO CONTRARIO: o corpo de origem (md5 138666ad) esta' no ledger 20261001180139.

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_meia_ponta_compativel(uuid)'::regprocedure) <> '138666adce90d37396471fcd4ea37358' THEN
    RAISE EXCEPTION 'CONC-TRANSF-SEGUNDA-PONTA-03: corpo de origem de _fn_meia_ponta_compativel divergente — abortado';
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public._fn_meia_ponta_compativel(p_extrato uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- o extrato LIVRE (os mesmos da lista: nao cancelado, nao ignorado, valor <> 0, sem vinculo vivo)
  WITH e AS (
    SELECT x.* FROM extrato_bancario_v2 x
     WHERE x.id = p_extrato AND x.cancelado_em IS NULL AND x.status <> 'ignorado' AND x.valor <> 0
       AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.extrato_id = x.id AND c.desfeito_em IS NULL)
  ), c AS (
    -- a transferencia compativel: plural, nao cancelada, nao meta, com caixa, mesmo valor, na DIRECAO do extrato,
    -- |data - extrato| <= 1, e EXATAMENTE 1 vinculo vivo, em OUTRA conta
    SELECT l.id, COALESCE(l.data_pagamento, l.data_vencimento) dl, l.created_at
      FROM e JOIN financeiro_lancamentos_v2 l
        ON l.cliente_id = e.cliente_id
       AND l.tipo_operacao = '3-Transferências'
       AND l.cancelado IS NOT TRUE
       AND COALESCE(l.cenario, 'realizado') <> 'meta'
       AND l.sem_movimentacao_caixa IS NOT TRUE
       AND round(l.valor, 2) = round(abs(e.valor), 2)
       AND ((e.valor < 0 AND l.conta_bancaria_id = e.conta_bancaria_id) OR (e.valor > 0 AND l.conta_destino_id = e.conta_bancaria_id))
       AND abs(COALESCE(l.data_pagamento, l.data_vencimento) - e.data_movimento) <= 1
     WHERE (SELECT count(*) FROM conciliacao_bancaria_itens v WHERE v.lancamento_id = l.id AND v.desfeito_em IS NULL) = 1
       AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens v JOIN extrato_bancario_v2 y ON y.id = v.extrato_id
                        WHERE v.lancamento_id = l.id AND v.desfeito_em IS NULL AND y.conta_bancaria_id = e.conta_bancaria_id)
  ), g AS (
    -- CONC-TRANSF-SEGUNDA-PONTA-03: os GEMEOS do extrato (ele incluso) — livres, mesma conta, mesma data, mesmo valor.
    -- Sao indistinguiveis: tem o mesmo conjunto de transferencias compativeis (a compatibilidade so' olha conta, data e
    -- valor), e qualquer atribuicao entre eles e' equivalente.
    SELECT o.id, row_number() OVER (ORDER BY o.id) k
      FROM e JOIN extrato_bancario_v2 o
        ON o.cliente_id = e.cliente_id AND o.conta_bancaria_id = e.conta_bancaria_id
       AND o.data_movimento = e.data_movimento AND o.valor = e.valor
     WHERE o.cancelado_em IS NULL AND o.status <> 'ignorado'
       AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens v WHERE v.extrato_id = o.id AND v.desfeito_em IS NULL)
  ), t AS (
    -- as transferencias compativeis em ordem estavel: data, created_at, id
    SELECT c.id, c.dl, row_number() OVER (ORDER BY c.dl, c.created_at, c.id) k FROM c
  )
  -- tantas transferencias quantos gemeos, e cada transferencia sem outro extrato livre compativel alem dos gemeos: a
  -- k-esima transferencia vai para o k-esimo gemeo. Com UM gemeo e' exatamente a regra 1:1 de antes (uma transferencia
  -- para o extrato, um extrato livre para a transferencia); fora disso, nada.
  SELECT t.id FROM t, e
   WHERE (SELECT count(*) FROM t) = (SELECT count(*) FROM g)
     AND t.k = (SELECT g.k FROM g WHERE g.id = e.id)
     AND NOT EXISTS (
       SELECT 1 FROM t t2
        WHERE (SELECT count(*) FROM extrato_bancario_v2 o
                WHERE o.cliente_id = e.cliente_id AND o.conta_bancaria_id = e.conta_bancaria_id
                  AND o.cancelado_em IS NULL AND o.status <> 'ignorado' AND sign(o.valor) = sign(e.valor)
                  AND round(abs(o.valor), 2) = round(abs(e.valor), 2) AND abs(t2.dl - o.data_movimento) <= 1
                  AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens v WHERE v.extrato_id = o.id AND v.desfeito_em IS NULL))
              <> (SELECT count(*) FROM g))
$function$;

REVOKE ALL ON FUNCTION public._fn_meia_ponta_compativel(uuid) FROM PUBLIC, anon, authenticated;

DO $confere$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_meia_ponta_compativel(uuid)'::regprocedure) <> '4065b0299efd4bdf8e5e9bdfb414f566' THEN
    RAISE EXCEPTION 'CONC-TRANSF-SEGUNDA-PONTA-03: corpo de destino de _fn_meia_ponta_compativel divergente';
  END IF;
END $confere$;
