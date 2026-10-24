-- P58b — `fn_caixa_sistema_pontas` so' le' o periodo (migration 20261028111950). TERMINA EM RAISE: nada fica.
-- A versao de ANTES (o corpo da 20261027191700, md5 do prosrc ce53914e…) entra como pg_temp.pontas_antiga; a publica e' a nova.
--   P1 IGUALDADE em todo conta-mes (e por ano, e a historia inteira), nos dois modos (p_detalhe falso e verdadeiro), linha a linha
--      (EXCEPT ALL nos dois sentidos): NJ (18 contas), Vera (6) e o par mae/interna do unico cliente com interna (as linhas
--      `interna` exercitadas). Exigido: 0 diferencas.
--   P2 O CASO QUE SO' A BUSCA PELO VINCULO PEGA (nao existe hoje no proto: todo vinculo vivo tem o extrato no mes do pagamento):
--      dentro desta transacao, um lancamento de 3b9a set/26 vinculado (extrato 21/09) passa a ter pagamento em 03/10, e outro vira
--      programado sem data de pagamento com o valor dobrado (parcial). Antiga = nova em set, out e no ano, nos dois modos.
--   MUTACAO pg_temp.pontas_mut = a nova SEM as duas buscas pelo vinculo (so' o pago no periodo): no P2 tem de diferir.
-- Rodado em 24/10/2026 (por partes, no canal do proto: o arquivo inteiro passa do limite de uma chamada), antiga x nova, 0 diferencas:
--   NJ 3b9a 264 meses-chamadas (43.010 linhas) + 24 de ano/historia (86.020); NJ as outras 17 contas 1.322 chamadas (79.653 linhas); Vera 6 contas 632;
--   par mae/interna 402 (69.354 linhas, 1.653 de interna). P2: nova = antiga em set, out e no ano, nos dois modos; MUTACAO difere
--   em set/26 (2 linhas) e no ano (1 linha), nada no detalhe — derrubada. O efeito da conta (P58) = status do ano: NJ 17 e Vera 6, 0.
-- Gatilhos desligados SO' na transacao do P2 (`session_replication_role = replica`), para editar o lancamento vinculado; o RAISE desfaz.
begin;
set local statement_timeout = '1800s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

CREATE FUNCTION pg_temp.pontas_antiga(p_cliente uuid, p_conta uuid, p_de date, p_ate date, p_detalhe boolean DEFAULT false)
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
  WITH pontas AS (
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
        SELECT l1.* FROM financeiro_lancamentos_v2 l1
         WHERE l1.cliente_id = p_cliente AND l1.conta_bancaria_id = p_conta
           AND (l1.sinal IN ('1', '-1') OR (l1.tipo_operacao = '3-Transferências' AND l1.conta_destino_id = p_conta))
        UNION ALL
        SELECT l2.* FROM financeiro_lancamentos_v2 l2
         WHERE l2.cliente_id = p_cliente AND l2.conta_destino_id = p_conta AND l2.conta_bancaria_id IS DISTINCT FROM p_conta
           AND (l2.sinal = '1' OR l2.tipo_operacao = '3-Transferências')
      ) l
     WHERE l.cancelado = false AND l.sem_movimentacao_caixa = false
       AND COALESCE(l.cenario, 'realizado') = 'realizado'
       AND l.status_transacao IN ('realizado', 'programado', 'agendado')
  ),
  extratos AS (
    -- os extratos DESTA conta, vivos (nem cancelados nem ignorados) — de qualquer mes
    SELECT e.id AS eid, e.data_movimento AS d, e.valor AS ev
      FROM extrato_bancario_v2 e
     WHERE e.cliente_id = p_cliente AND e.conta_bancaria_id = p_conta AND e.cancelado_em IS NULL AND e.ignorado_em IS NULL
  ),
  vivos AS (
    -- os vinculos vivos desta ponta: so' extratos DESTA conta, vivos (nem cancelados nem ignorados)
    SELECT c.lancamento_id AS lid, x.d AS d, c.valor_aplicado AS ap, x.eid, x.ev
      FROM conciliacao_bancaria_itens c JOIN extratos x ON x.eid = c.extrato_id
     WHERE c.desfeito_em IS NULL
  ),
  aplic AS (SELECT v.lid, sum(v.ap) AS total FROM vivos v GROUP BY v.lid),
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

CREATE FUNCTION pg_temp.pontas_mut(p_cliente uuid, p_conta uuid, p_de date, p_ate date, p_detalhe boolean DEFAULT false)
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
  IF auth.uid() IS NOT NULL AND NOT public.tenant_ok(p_cliente) THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'sem_permissao: operacao nao autorizada para este cliente.';
  END IF;
  RETURN QUERY
  WITH extratos AS (
    SELECT e.id AS eid, e.data_movimento AS d, e.valor AS ev
      FROM extrato_bancario_v2 e
     WHERE e.cliente_id = p_cliente AND e.conta_bancaria_id = p_conta AND e.cancelado_em IS NULL AND e.ignorado_em IS NULL
       AND e.data_movimento BETWEEN p_de AND p_ate
  ),
  vivos AS (
    SELECT c.lancamento_id AS lid, x.d AS d, c.valor_aplicado AS ap, x.eid, x.ev
      FROM conciliacao_bancaria_itens c JOIN extratos x ON x.eid = c.extrato_id
     WHERE c.desfeito_em IS NULL
  ),
  vlid AS (SELECT DISTINCT v.lid FROM vivos v),
  pontas AS (
    SELECT l.id, l.data_pagamento AS dp, l.status_transacao AS st, abs(l.valor) AS mag, l.valor AS bruto,
           (CASE WHEN l.tipo_operacao = '3-Transferências' AND l.conta_destino_id = p_conta THEN 1
                 WHEN l.tipo_operacao = '3-Transferências' AND l.conta_bancaria_id = p_conta THEN -1
                 WHEN l.sinal = '1' THEN 1 ELSE -1 END) AS s,
           (l.tipo_operacao = '3-Transferências' AND EXISTS (
              SELECT 1 FROM financeiro_contas_bancarias ci
               WHERE ci.consolida_em_conta_id = p_conta AND ci.cliente_id = p_cliente
                 AND ci.id = (CASE WHEN l.conta_bancaria_id = p_conta THEN l.conta_destino_id ELSE l.conta_bancaria_id END))) AS eh_interna
      FROM (
        SELECT l1.* FROM financeiro_lancamentos_v2 l1
         WHERE l1.cliente_id = p_cliente AND l1.conta_bancaria_id = p_conta
           AND (l1.sinal IN ('1', '-1') OR (l1.tipo_operacao = '3-Transferências' AND l1.conta_destino_id = p_conta))
           AND l1.data_pagamento BETWEEN p_de AND p_ate
        UNION ALL
        SELECT l2.* FROM financeiro_lancamentos_v2 l2
         WHERE l2.cliente_id = p_cliente AND l2.conta_destino_id = p_conta AND l2.conta_bancaria_id IS DISTINCT FROM p_conta
           AND (l2.sinal = '1' OR l2.tipo_operacao = '3-Transferências')
           AND l2.data_pagamento BETWEEN p_de AND p_ate
      ) l
     WHERE l.cancelado = false AND l.sem_movimentacao_caixa = false
       AND COALESCE(l.cenario, 'realizado') = 'realizado'
       AND l.status_transacao IN ('realizado', 'programado', 'agendado')
  ),
  aplic AS (SELECT c.lancamento_id AS lid, sum(c.valor_aplicado) AS total
              FROM conciliacao_bancaria_itens c
              JOIN extrato_bancario_v2 e ON e.id = c.extrato_id AND e.cliente_id = p_cliente AND e.conta_bancaria_id = p_conta
               AND e.cancelado_em IS NULL AND e.ignorado_em IS NULL
             WHERE c.desfeito_em IS NULL AND c.lancamento_id IN (SELECT pontas.id FROM pontas) GROUP BY c.lancamento_id),
  modo AS (
    SELECT p.*, a.total,
      CASE
        WHEN p.st IN ('programado', 'agendado') AND a.total > 0.005 AND a.total < p.mag - 0.005 THEN 'parcial'
        WHEN p.st = 'realizado' AND a.total IS NOT NULL AND abs(a.total - p.mag) <= 0.005 THEN 'aplicado'
        WHEN p.st = 'realizado' THEN 'pagamento'
        ELSE NULL
      END AS md
      FROM pontas p LEFT JOIN aplic a ON a.lid = p.id
  ),
  lv2 AS (SELECT p.* FROM pontas p WHERE p.st = 'realizado' AND p.dp BETWEEN p_de AND p_ate),
  vin_periodo AS (SELECT v.* FROM vivos v WHERE v.d BETWEEN p_de AND p_ate)
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


create function pg_temp.comparar(k uuid, filtro text) returns text language plpgsql as $f$
declare c record; p record; det boolean; ini date; x int; n int := 0; dif int := 0; msg text := '';
begin
  for c in execute format('select b.id from financeiro_contas_bancarias b where b.cliente_id = %L %s order by b.id', k, filtro) loop
    ini := least((select min(data_pagamento) from financeiro_lancamentos_v2 l where l.cliente_id = k and (l.conta_bancaria_id = c.id or l.conta_destino_id = c.id)),
                 (select min(data_movimento) from extrato_bancario_v2 e where e.cliente_id = k and e.conta_bancaria_id = c.id));
    continue when ini is null;
    for p in select g::date de, (g + interval '1 month - 1 day')::date ate from generate_series(date_trunc('month', ini)::date, '2026-12-01'::date, interval '1 month') g
             union all select g::date, (g + interval '1 year - 1 day')::date from generate_series(date_trunc('year', ini)::date, '2026-01-01'::date, interval '1 year') g
             union all select date_trunc('month', ini)::date, '2026-12-31'::date loop
      foreach det in array array[false, true] loop
        n := n + 1;
        select count(*) into x from ((select * from public.fn_caixa_sistema_pontas(k, c.id, p.de, p.ate, det) except all select * from pg_temp.pontas_antiga(k, c.id, p.de, p.ate, det))
                                     union all (select * from pg_temp.pontas_antiga(k, c.id, p.de, p.ate, det) except all select * from public.fn_caixa_sistema_pontas(k, c.id, p.de, p.ate, det))) z;
        if x > 0 then dif := dif + 1; if length(msg) < 300 then msg := msg || format(' %s %s-%s %s:%s', left(c.id::text, 4), p.de, p.ate, det, x); end if; end if;
      end loop;
    end loop;
  end loop;
  return format('%s chamadas, %s diferentes%s', n, dif, msg);
end $f$;

do $t$
declare nj text; vera text; par text; r text := ''; p record; det boolean; x int; y int; e text[] := '{}';
  k constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'; c constant uuid := '3b9afa7a-0af6-4bce-8ec9-03b91484dfd8';
begin
  -- P1
  nj := pg_temp.comparar(k, '');
  vera := pg_temp.comparar('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '');
  par := pg_temp.comparar('a2d41cda-eb1e-4527-a6cf-a1b9663339e2',
           'and (b.consolida_em_conta_id is not null or b.id in (select x.consolida_em_conta_id from financeiro_contas_bancarias x where x.cliente_id = b.cliente_id))');
  if nj not like '%, 0 diferentes' or vera not like '%, 0 diferentes' or par not like '%, 0 diferentes' then
    e := e || format('P1 NJ %s | Vera %s | par %s', nj, vera, par);
  end if;
  -- P2
  set local session_replication_role = replica;
  update financeiro_lancamentos_v2 set data_pagamento = '2026-10-03' where id = 'a47b943c-33ea-40e2-aa35-9da42b0976ab';
  update financeiro_lancamentos_v2 set status_transacao = 'programado', data_pagamento = null, valor = valor * 2 where id = 'b77cea6a-57cd-42cf-b110-99575ce2bcdb';
  set local session_replication_role = origin;
  y := 0;
  for p in select * from (values ('2026-09-01'::date, '2026-09-30'::date), ('2026-10-01', '2026-10-31'), ('2026-01-01', '2026-12-31')) t(de, ate) loop
    foreach det in array array[false, true] loop
      select count(*) into x from ((select * from public.fn_caixa_sistema_pontas(k, c, p.de, p.ate, det) except all select * from pg_temp.pontas_antiga(k, c, p.de, p.ate, det))
                                   union all (select * from pg_temp.pontas_antiga(k, c, p.de, p.ate, det) except all select * from public.fn_caixa_sistema_pontas(k, c, p.de, p.ate, det))) z;
      if x > 0 then e := e || format('P2 %s-%s %s: %s linhas', p.de, p.ate, det, x); end if;
      select count(*) into x from ((select * from pg_temp.pontas_mut(k, c, p.de, p.ate, det) except all select * from pg_temp.pontas_antiga(k, c, p.de, p.ate, det))
                                   union all (select * from pg_temp.pontas_antiga(k, c, p.de, p.ate, det) except all select * from pg_temp.pontas_mut(k, c, p.de, p.ate, det))) z;
      y := y + x;
    end loop;
  end loop;
  if y = 0 then e := e || 'MUTACAO sobreviveu (sem a busca pelo vinculo, o P2 nao mudou)'::text; end if;
  if cardinality(e) > 0 then raise exception 'FALHOU: %', array_to_string(e, ' ; '); end if;
  raise exception 'OK conc_pontas_periodo (P1 NJ %; Vera %; par %; P2 igual; mutacao: % linhas diferentes)', nj, vera, par, y;
end $t$;
rollback;
