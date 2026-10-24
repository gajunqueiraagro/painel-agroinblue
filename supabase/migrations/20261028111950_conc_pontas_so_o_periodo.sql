-- P58b (Gabriel 24/10/2026) — `fn_caixa_sistema_pontas` so' le' o PERIODO. So' desempenho: a saida e' IGUAL (a regra da
-- conciliacao nao muda; dono unico). FASE 0 (NJ, a conta de 72 meses conciliaveis): o "Efeito na Conciliacao" levava 10,8 s, dos
-- quais 6,9 s nas pontas — a CTE `pontas` lia TODOS os lancamentos da conta (21,5 mil) a cada mes, porque e' usada duas vezes
-- (materializada) e o filtro de data so' vinha no fim. Agora cada busca leva o periodo: pago nele, ou com vinculo vivo num extrato
-- dele (`vlid`); os extratos e vinculos, so' os do periodo. Por que e' igual: as linhas de saida sao (a) 'pagamento' com data de
-- pagamento no periodo; (b) 'aplicado'/'parcial' de um vinculo vivo no periodo (o lancamento esta' no `vlid`); (c) no detalhe, os
-- extratos do periodo, o lv2 (pago no periodo) e os vinculos do periodo, que so' consultam o lv2; o `vinculo_fora` le' a tabela de
-- vinculos direto (inalterado). O `modo` de cada lancamento depende so' dele e do `aplic` = todos os vinculos vivos dele em extratos
-- vivos da conta, de QUALQUER mes (o mesmo de antes, agora lido so' para as pontas do periodo).
-- Prova: `conc_pontas_periodo_test.sql` (antiga x nova em todo conta-mes do NJ, da Vera e do par mae/interna; mutacao).
SET LOCAL lock_timeout = '2s';

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_caixa_sistema_pontas(uuid, uuid, date, date, boolean)'::regprocedure)
       IS DISTINCT FROM 'ce53914eef1f3628abd3ce3abcf18619' THEN
    RAISE EXCEPTION 'fn_caixa_sistema_pontas: corpo de origem inesperado. Migration abortada.';
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public.fn_caixa_sistema_pontas(p_cliente uuid, p_conta uuid, p_de date, p_ate date, p_detalhe boolean DEFAULT false)
 RETURNS TABLE(lancamento_id uuid, data date, valor numeric, origem text, parcial boolean, falta numeric,
               tipo_linha text, extrato_id uuid, extrato_valor numeric, sinal_lancamento integer, no_lv2 boolean,
               interna boolean, aplicado_no_periodo numeric, vinculo_fora boolean)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
#variable_conflict use_column
BEGIN
  -- Tenant: quem chama pela API so' le' o proprio cliente (sem sessao de usuario — service_role, migration — passa).
  IF auth.uid() IS NOT NULL AND NOT public.tenant_ok(p_cliente) THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'sem_permissao: operacao nao autorizada para este cliente.';
  END IF;
  RETURN QUERY
  WITH extratos AS (
    -- os extratos DESTA conta, vivos (nem cancelados nem ignorados) — P58b: so' os DO PERIODO (todo uso deles e' no periodo;
    -- o total aplicado de cada lancamento, que olha qualquer mes, sai do `aplic`)
    SELECT e.id AS eid, e.data_movimento AS d, e.valor AS ev
      FROM extrato_bancario_v2 e
     WHERE e.cliente_id = p_cliente AND e.conta_bancaria_id = p_conta AND e.cancelado_em IS NULL AND e.ignorado_em IS NULL
       AND e.data_movimento BETWEEN p_de AND p_ate
  ),
  vivos AS (
    -- os vinculos vivos desta ponta: so' extratos DESTA conta, vivos (nem cancelados nem ignorados) — do periodo
    SELECT c.lancamento_id AS lid, x.d AS d, c.valor_aplicado AS ap, x.eid, x.ev
      FROM conciliacao_bancaria_itens c JOIN extratos x ON x.eid = c.extrato_id
     WHERE c.desfeito_em IS NULL
  ),
  -- P58b: os lancamentos com vinculo vivo num extrato DO PERIODO (os que podem sair 'aplicado'/'parcial' nele)
  vlid AS (SELECT DISTINCT v.lid FROM vivos v),
  pontas AS (
    -- A PONTA do lancamento NESTA conta, com o sinal da direcao: o MESMO predicado e o MESMO sinal do lv2 de
    -- fn_extratos_espelhados (transferencia: destino +, origem -; entrada +; saida -). Por ponta, para nao perder perna
    -- de transferencia.
    SELECT l.id, l.data_pagamento AS dp, l.status_transacao AS st, abs(l.valor) AS mag, l.valor AS bruto,
           (CASE WHEN l.tipo_operacao = '3-Transferências' AND l.conta_destino_id = p_conta THEN 1
                 WHEN l.tipo_operacao = '3-Transferências' AND l.conta_bancaria_id = p_conta THEN -1
                 WHEN l.sinal = '1' THEN 1 ELSE -1 END) AS s,
           -- PR-CONC-SALDO-UMA-REGUA-01: a transferencia com uma conta CONSOLIDADA nesta (a interna, `useEspelhoInternas`)
           (l.tipo_operacao = '3-Transferências' AND EXISTS (
              SELECT 1 FROM financeiro_contas_bancarias ci
               WHERE ci.consolida_em_conta_id = p_conta AND ci.cliente_id = p_cliente
                 AND ci.id = (CASE WHEN l.conta_bancaria_id = p_conta THEN l.conta_destino_id ELSE l.conta_bancaria_id END))) AS eh_interna
      FROM (
        -- PR-CONC-SALDO-UMA-REGUA-01b (D1): o MESMO filtro de conta em DUAS buscas indexadas, sem OR entre colunas —
        -- (a) pela conta bancaria (`idx_fin_lanc_v2_conta`); (b) pelo destino (`idx_fin_lanc_v2_cliente_destino`), sem a
        -- linha que (a) ja' trouxe. Com conta_bancaria_id = p_conta o predicado de antes se reduz ao de (a); senao, so' os
        -- ramos do destino valem, que sao os de (b). Nenhum lancamento entra duas vezes.
        -- P58b (so' desempenho, saida IGUAL): cada busca so' no que o PERIODO usa — pago nele (o 'pagamento' e o lv2) ou com
        -- vinculo vivo num extrato dele (`vlid`: o 'aplicado'/'parcial'). Toda linha de saida sai de um desses; o `aplic` segue
        -- somando TODOS os vinculos vivos do lancamento (de qualquer mes). Antes lia a historia inteira da conta a cada chamada
        -- (NJ: 21,5 mil lancamentos numa conta, por mes).
        SELECT l1.* FROM financeiro_lancamentos_v2 l1
         WHERE l1.cliente_id = p_cliente AND l1.conta_bancaria_id = p_conta
           AND (l1.sinal IN ('1', '-1') OR (l1.tipo_operacao = '3-Transferências' AND l1.conta_destino_id = p_conta))
           AND l1.data_pagamento BETWEEN p_de AND p_ate
        UNION ALL
        SELECT l1.* FROM financeiro_lancamentos_v2 l1
         WHERE l1.id IN (SELECT vlid.lid FROM vlid) AND l1.cliente_id = p_cliente AND l1.conta_bancaria_id = p_conta
           AND (l1.sinal IN ('1', '-1') OR (l1.tipo_operacao = '3-Transferências' AND l1.conta_destino_id = p_conta))
           AND (l1.data_pagamento BETWEEN p_de AND p_ate) IS NOT TRUE
        UNION ALL
        SELECT l2.* FROM financeiro_lancamentos_v2 l2
         WHERE l2.cliente_id = p_cliente AND l2.conta_destino_id = p_conta AND l2.conta_bancaria_id IS DISTINCT FROM p_conta
           AND (l2.sinal = '1' OR l2.tipo_operacao = '3-Transferências')
           AND l2.data_pagamento BETWEEN p_de AND p_ate
        UNION ALL
        SELECT l2.* FROM financeiro_lancamentos_v2 l2
         WHERE l2.id IN (SELECT vlid.lid FROM vlid) AND l2.cliente_id = p_cliente AND l2.conta_destino_id = p_conta
           AND l2.conta_bancaria_id IS DISTINCT FROM p_conta
           AND (l2.sinal = '1' OR l2.tipo_operacao = '3-Transferências')
           AND (l2.data_pagamento BETWEEN p_de AND p_ate) IS NOT TRUE
      ) l
     WHERE l.cancelado = false AND l.sem_movimentacao_caixa = false
       AND COALESCE(l.cenario, 'realizado') = 'realizado'
       AND l.status_transacao IN ('realizado', 'programado', 'agendado')
  ),
  -- o total aplicado de cada lancamento das pontas: TODOS os vinculos vivos dele em extratos vivos desta conta, de qualquer mes
  -- (o mesmo de antes, lido pelo indice do lancamento so' para as pontas do periodo)
  aplic AS (SELECT c.lancamento_id AS lid, sum(c.valor_aplicado) AS total
              FROM conciliacao_bancaria_itens c
              JOIN extrato_bancario_v2 e ON e.id = c.extrato_id AND e.cliente_id = p_cliente AND e.conta_bancaria_id = p_conta
               AND e.cancelado_em IS NULL AND e.ignorado_em IS NULL
             WHERE c.desfeito_em IS NULL AND c.lancamento_id IN (SELECT pontas.id FROM pontas) GROUP BY c.lancamento_id),
  modo AS (
    SELECT p.*, a.total,
      CASE
        -- (1) PARCIAL: programado/agendado com vinculo vivo que ainda nao quitou — o aplicado na data de cada extrato
        WHEN p.st IN ('programado', 'agendado') AND a.total > 0.005 AND a.total < p.mag - 0.005 THEN 'parcial'
        -- (2) REALIZADO cujo aplicado soma o valor dele — o aplicado distribuido pelas datas dos extratos
        WHEN p.st = 'realizado' AND a.total IS NOT NULL AND abs(a.total - p.mag) <= 0.005 THEN 'aplicado'
        -- (3) sem vinculo, ou com aplicado que nao bate (as pontas sobre-aplicadas legadas) — como hoje: valor cheio
        --     na data de pagamento (exatamente o lv2)
        WHEN p.st = 'realizado' THEN 'pagamento'
        -- programado/agendado sem vinculo, ou vinculado por inteiro sem ter sido promovido: fora do caixa, como hoje
        ELSE NULL
      END AS md
      FROM pontas p LEFT JOIN aplic a ON a.lid = p.id
  ),
  -- PR-CONC-SALDO-UMA-REGUA-01 (p_detalhe): o lv2 do periodo — os realizados pagos nele, desta conta
  lv2 AS (SELECT p.* FROM pontas p WHERE p.st = 'realizado' AND p.dp BETWEEN p_de AND p_ate),
  vin_periodo AS (SELECT v.* FROM vivos v WHERE v.d BETWEEN p_de AND p_ate)
  -- ── as pontas do caixa (p_detalhe = false): as linhas de sempre, as colunas novas nulas ──
  SELECT m.id, m.dp, (m.s * m.bruto)::numeric, 'pagamento'::text, false, 0::numeric,
         NULL::text, NULL::uuid, NULL::numeric, NULL::integer, NULL::boolean, NULL::boolean, NULL::numeric, NULL::boolean
    FROM modo m WHERE NOT p_detalhe AND m.md = 'pagamento' AND m.dp BETWEEN p_de AND p_ate
  UNION ALL
  SELECT m.id, v.d, (m.s * sum(v.ap))::numeric, 'aplicado'::text, (m.md = 'parcial'),
         (CASE WHEN m.md = 'parcial' THEN round(m.mag - m.total, 2) ELSE 0 END)::numeric,
         NULL::text, NULL::uuid, NULL::numeric, NULL::integer, NULL::boolean, NULL::boolean, NULL::numeric, NULL::boolean
    FROM modo m JOIN vivos v ON v.lid = m.id
   WHERE NOT p_detalhe AND m.md IN ('parcial', 'aplicado') AND v.d BETWEEN p_de AND p_ate
   GROUP BY m.id, v.d, m.s, m.md, m.mag, m.total
  -- ── o detalhe da mesa (p_detalhe = true) ──
  UNION ALL
  SELECT NULL::uuid, x.d, x.ev, 'extrato'::text, false, 0::numeric,
         'extrato'::text, x.eid, x.ev, NULL::integer, NULL::boolean, NULL::boolean, NULL::numeric, NULL::boolean
    FROM extratos x WHERE p_detalhe AND x.d BETWEEN p_de AND p_ate
  UNION ALL
  SELECT v.lid, v.d, v.ap, 'vinculo'::text, false, 0::numeric,
         'vinculo'::text, v.eid, v.ev,
         (SELECT sign(l.s * l.bruto)::integer FROM lv2 l WHERE l.id = v.lid),
         EXISTS (SELECT 1 FROM lv2 l WHERE l.id = v.lid), NULL::boolean, NULL::numeric, NULL::boolean
    FROM vin_periodo v WHERE p_detalhe
  UNION ALL
  SELECT l.id, l.dp, (l.s * l.bruto)::numeric, 'lancamento'::text, false, 0::numeric,
         'lancamento'::text, NULL::uuid, NULL::numeric, sign(l.s * l.bruto)::integer, true, l.eh_interna,
         (SELECT sum(v.ap) FROM vin_periodo v WHERE v.lid = l.id),
         EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c2
                  WHERE c2.lancamento_id = l.id AND c2.desfeito_em IS NULL
                    AND NOT EXISTS (SELECT 1 FROM vin_periodo v WHERE v.eid = c2.extrato_id))
    FROM lv2 l WHERE p_detalhe;
END
$function$;
