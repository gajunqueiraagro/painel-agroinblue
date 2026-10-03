-- PR-CONC-SALDO-UMA-REGUA-01 — o RESUMO DA CONTA NO MES, no banco, pela regua do caixa
--
-- POR QUE (FASE 0 de 03/10 11:46 e o PARE das 12:10)
-- A Conferencia e a Evolucao fecham pelo caixa (o aplicado, na data do extrato); o Resumo da aba Conciliacao, o selo,
-- Saldos por conta, o quadro do topo do Casar e a aba Sistema fecham pelo valor cheio de lancamento realizado. No NJ Sicredi
-- Lavoura set/26 o programado parcial d320635d (2.561,60 aplicados ao extrato caecc6ec) faz o Resumo dizer "Nao Conciliado
-- · −2.561,60" com a Conferencia dizendo "confere" em todos os dias. Nao havia agregado por conta, e as regras da mesa
-- (internas, sobre/sub-aplicado, dia confere) moravam so' em `src/lib/conciliacao/mesaDoDia.ts`.
--
-- O QUE MUDA
-- D1. `fn_caixa_sistema_pontas` EVOLUI (o dono das pontas, sem copia): ganha `p_detalhe boolean DEFAULT false` e colunas
--     novas no fim do retorno. Com `p_detalhe = false` (toda chamada de hoje, `fn_extratos_espelhados` inclusive) as linhas e
--     as 6 colunas de antes sao IDENTICAS, e as novas vem nulas. Com `p_detalhe = true` ela devolve o DETALHE que a mesa
--     precisa, dos MESMOS CTEs (nenhuma terceira copia dos predicados de lancamento/extrato):
--       'extrato'    um por extrato DESTA conta no periodo (vivo): data, valor;
--       'vinculo'    um por vinculo vivo com extrato desta conta no periodo: o aplicado (magnitude), o extrato e o valor dele,
--                    e o sinal do lancamento quando ele esta' no lv2 do periodo;
--       'lancamento' um por lancamento do lv2 do periodo (realizado, pago no periodo, desta conta): valor com o sinal da
--                    direcao, a marca de INTERNA (transferencia com conta consolidada nesta, `consolida_em_conta_id`), o
--                    aplicado nos extratos do periodo e se ha' vinculo FORA (outra conta ou outro mes).
--     O retorno mudou de tipo, entao e' DROP + CREATE com o corpo INTEGRAL (3.482 chars de origem, md5 8a1cd4f9…, guardado);
--     ACL, SECURITY DEFINER, search_path e plan_cache_mode = force_custom_plan reaplicados e conferidos.
-- D2. `fn_conciliacao_resumo_mes(p_cliente_id, p_ano_mes, p_conta_ids uuid[] DEFAULT NULL)`: uma linha por conta (NULL =
--     todas as do cliente). Saldos INFORMADOS (`financeiro_saldos_bancarios_v2`) CONSOLIDADOS com as internas (a regra de
--     `useEspelhoInternas`); entradas/saidas pelo caixa; dias com diferenca; status; e a regua antiga em `legado`.
-- D3. Lado da ponta: a ponta ligada a extrato entra do LADO DO EXTRATO (a retencao num deposito liquido e' entrada
--     negativa, e vai tambem em `retido_em_depositos`); a sem extrato, do lado do proprio lancamento. O liquido nao muda.
-- D4. Dia = a mesa (`montarMesa`, ancora do extrato): banco = os extratos do dia; sistema = os vinculos com extratos do mes
--     (o aplicado, com o sinal do lancamento quando ele e' do lv2 do mes, senao o do extrato) + o realizado do mes sem vinculo
--     com extrato desta conta no mes e que nao e' interna (valor cheio na data de pagamento) + o resto de um sub-aplicado
--     (realizado sem vinculo fora, aplicado no mes < valor; no dia do lancamento). Programado/agendado parcial entra pelo
--     aplicado e nao e' diferenca. ⚠ ESPELHO DECLARADO de `montarMesa`: o banco e' o dono do STATUS e da contagem de dias; a
--     mesa continua quem desenha. A igualdade e' provada (69 conta-meses) e fica como teste permanente (vitest).
-- D5. 'conciliado' so' com as TRES condicoes fechando; senao 'nao_conciliado' com os motivos e o valor de cada um:
--     (i) dias_com_diferenca · (ii) saldo_diverge (sistema pelo caixa x informado consolidado) · (iii) extrato_nao_fecha
--     (informado − inicial − Σ extrato do mes). Sem saldo informado: 'pendente' (como hoje). Mes sem extrato: o status de hoje
--     (a regua antiga), com o motivo 'sem_extrato'.
-- Nenhuma escrita em dado; nenhuma tela neste PR.

-- ═══════════════════ D1 — o dono das pontas evolui (aditivo) ═══════════════════
DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_caixa_sistema_pontas(uuid, uuid, date, date)'::regprocedure)
       IS DISTINCT FROM '8a1cd4f9ecc02fa8eebb61a1c7093bd2' THEN
    RAISE EXCEPTION 'fn_caixa_sistema_pontas nao esta no corpo esperado. Migration abortada.';
  END IF;
END $guarda$;

DROP FUNCTION public.fn_caixa_sistema_pontas(uuid, uuid, date, date);

CREATE FUNCTION public.fn_caixa_sistema_pontas(p_cliente uuid, p_conta uuid, p_de date, p_ate date, p_detalhe boolean DEFAULT false)
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
      FROM financeiro_lancamentos_v2 l
     WHERE l.cliente_id = p_cliente AND l.cancelado = false AND l.sem_movimentacao_caixa = false
       AND COALESCE(l.cenario, 'realizado') = 'realizado'
       AND l.status_transacao IN ('realizado', 'programado', 'agendado')
       AND ((l.sinal = '1' AND (l.conta_destino_id = p_conta OR l.conta_bancaria_id = p_conta))
         OR (l.sinal = '-1' AND l.conta_bancaria_id = p_conta)
         OR (l.tipo_operacao = '3-Transferências' AND l.conta_destino_id = p_conta))
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
REVOKE ALL ON FUNCTION public.fn_caixa_sistema_pontas(uuid, uuid, date, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_caixa_sistema_pontas(uuid, uuid, date, date, boolean) TO authenticated, service_role;

-- ═══════════════════ D4 — o dia da mesa, por conta (interna: so' service_role) ═══════════════════
CREATE FUNCTION public._fn_conciliacao_dias_conta(p_cliente uuid, p_conta uuid, p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
-- O DIA DA CONFERENCIA, no banco — ESPELHO DECLARADO de `montarMesa` (ancora do extrato). Tudo sai do detalhe do dono das
-- pontas (`fn_caixa_sistema_pontas(..., p_detalhe => true)`); aqui so' se soma.
DECLARE v jsonb;
BEGIN
  WITH d AS (SELECT * FROM public.fn_caixa_sistema_pontas(p_cliente, p_conta, p_de, p_ate, true)),
  ext AS (SELECT d.extrato_id, d.data, d.valor FROM d WHERE d.tipo_linha = 'extrato'),
  lan AS (SELECT d.lancamento_id, d.data, d.valor, d.interna, d.aplicado_no_periodo, d.vinculo_fora FROM d WHERE d.tipo_linha = 'lancamento'),
  -- cada vinculo: o aplicado com o sinal do LANCAMENTO quando ele e' do lv2 do mes (`sinalDoAplicado`), senao o do extrato
  vin AS (
    SELECT d.lancamento_id, d.data, d.extrato_id, d.extrato_valor, d.valor AS ap,
           (CASE WHEN d.no_lv2 AND coalesce(d.sinal_lancamento, 0) <> 0 THEN d.sinal_lancamento
                 ELSE sign(CASE WHEN d.extrato_valor = 0 THEN 1 ELSE d.extrato_valor END)::integer END) * d.valor AS contrib
      FROM d WHERE d.tipo_linha = 'vinculo'),
  apl AS (SELECT vin.lancamento_id, sum(vin.ap) AS a FROM vin GROUP BY vin.lancamento_id),
  -- o realizado do mes SEM vinculo com extrato desta conta no mes, fora a interna: valor cheio na data de pagamento
  semvinc AS (SELECT lan.* FROM lan WHERE NOT EXISTS (SELECT 1 FROM vin WHERE vin.lancamento_id = lan.lancamento_id) AND NOT lan.interna),
  -- o resto de um sub-aplicado: realizado sem vinculo fora, aplicado no mes < valor — no dia do lancamento
  restos AS (
    SELECT lan.lancamento_id, lan.data, sign(CASE WHEN lan.valor = 0 THEN 1 ELSE lan.valor END) * round(abs(lan.valor) - apl.a, 2) AS r
      FROM lan JOIN apl ON apl.lancamento_id = lan.lancamento_id
     WHERE NOT lan.vinculo_fora AND NOT lan.interna AND abs(lan.valor) - apl.a > 0.005),
  sobre AS (SELECT lan.lancamento_id FROM lan JOIN apl ON apl.lancamento_id = lan.lancamento_id WHERE apl.a - abs(lan.valor) > 0.005),
  -- por extrato: a soma assinada dos vinculos e a diferenca na direcao do extrato (|extrato| − |soma|), como a mesa
  por_ext AS (
    SELECT ext.extrato_id, ext.data, ext.valor, coalesce(sum(vin.contrib), 0) AS soma, count(vin.lancamento_id) AS nv,
           bool_or(vin.lancamento_id IN (SELECT sobre.lancamento_id FROM sobre)) AS tem_sobre
      FROM ext LEFT JOIN vin ON vin.extrato_id = ext.extrato_id GROUP BY ext.extrato_id, ext.data, ext.valor),
  dias AS (
    SELECT x.data,
           round(sum(x.banco), 2) AS banco, round(sum(x.sistema), 2) AS sistema,
           array_remove(array_agg(DISTINCT x.motivo), NULL) AS motivos
      FROM (
        SELECT p.data, p.valor AS banco, p.soma AS sistema,
               CASE WHEN p.nv = 0 THEN 'extrato_sem_par'
                    WHEN p.tem_sobre THEN 'sobre_aplicado'
                    WHEN round(abs(p.valor) - abs(p.soma), 2) <> 0 THEN 'aplicado_diferente_do_extrato' END AS motivo
          FROM por_ext p
        UNION ALL SELECT s.data, 0, s.valor, 'lancamento_sem_par' FROM semvinc s
        UNION ALL SELECT r.data, 0, r.r, 'resto_sub_aplicado' FROM restos r
      ) x GROUP BY x.data)
  SELECT jsonb_build_object(
    'tem_extrato', EXISTS (SELECT 1 FROM ext),
    'dias', coalesce((SELECT jsonb_agg(jsonb_build_object('data', dias.data, 'banco', dias.banco, 'sistema', dias.sistema,
                              'diferenca', round(dias.banco - dias.sistema, 2), 'motivos', to_jsonb(dias.motivos)) ORDER BY dias.data) FROM dias), '[]'::jsonb),
    -- os totais CRUS (sem arredondar por dia): o saldo e o liquido saem daqui, arredondados so' no fim (valores de 3 casas)
    'banco_total', coalesce((SELECT sum(ext.valor) FROM ext), 0),
    'sistema_total', coalesce((SELECT sum(por_ext.soma) FROM por_ext), 0) + coalesce((SELECT sum(semvinc.valor) FROM semvinc), 0)
                   + coalesce((SELECT sum(restos.r) FROM restos), 0),
    'banco_entradas', coalesce((SELECT sum(ext.valor) FROM ext WHERE ext.valor > 0), 0),
    'banco_saidas', coalesce((SELECT sum(ext.valor) FROM ext WHERE ext.valor < 0), 0),
    -- D3: a ponta ligada a extrato do lado do EXTRATO; a sem extrato (e o resto), do lado dela
    'entradas', coalesce((SELECT sum(vin.contrib) FROM vin WHERE vin.extrato_valor > 0), 0)
              + coalesce((SELECT sum(semvinc.valor) FROM semvinc WHERE semvinc.valor > 0), 0)
              + coalesce((SELECT sum(restos.r) FROM restos WHERE restos.r > 0), 0),
    'saidas', coalesce((SELECT sum(vin.contrib) FROM vin WHERE vin.extrato_valor <= 0), 0)
            + coalesce((SELECT sum(semvinc.valor) FROM semvinc WHERE semvinc.valor < 0), 0)
            + coalesce((SELECT sum(restos.r) FROM restos WHERE restos.r < 0), 0),
    'retido_em_depositos', jsonb_build_object(
        'valor', coalesce((SELECT sum(abs(vin.contrib)) FROM vin WHERE vin.contrib <> 0 AND sign(vin.contrib) <> sign(vin.extrato_valor)), 0),
        'qtde', (SELECT count(*) FROM vin WHERE vin.contrib <> 0 AND sign(vin.contrib) <> sign(vin.extrato_valor))),
    'extratos_sem_par', jsonb_build_object('qtde', (SELECT count(*) FROM por_ext WHERE por_ext.nv = 0),
                                           'valor', coalesce((SELECT sum(por_ext.valor) FROM por_ext WHERE por_ext.nv = 0), 0)),
    'lancamentos_sem_par', jsonb_build_object('qtde', (SELECT count(*) FROM semvinc),
                                              'valor', coalesce((SELECT sum(semvinc.valor) FROM semvinc), 0)),
    -- a regua antiga (o Resumo de hoje): todo realizado pago no mes desta conta, pelo valor cheio
    'legado_entradas', coalesce((SELECT sum(lan.valor) FROM lan WHERE lan.valor > 0), 0),
    'legado_saidas', coalesce((SELECT sum(lan.valor) FROM lan WHERE lan.valor < 0), 0)
  ) INTO v;
  RETURN v;
END
$function$;
REVOKE ALL ON FUNCTION public._fn_conciliacao_dias_conta(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_conciliacao_dias_conta(uuid, uuid, date, date) TO service_role;

-- ═══════════════════ D2/D5 — o dono do resumo ═══════════════════
CREATE FUNCTION public.fn_conciliacao_resumo_mes(p_cliente_id uuid, p_ano_mes text, p_conta_ids uuid[] DEFAULT NULL)
 RETURNS TABLE(conta_id uuid, conta_nome text, consolida_em_conta_id uuid, tem_extrato boolean,
               saldo_inicial numeric, entradas numeric, saidas numeric, saldo_sistema numeric,
               saldo_extrato numeric, saldo_extrato_data date, diferenca numeric,
               banco jsonb, extratos_sem_par jsonb, lancamentos_sem_par jsonb, retido_em_depositos jsonb,
               dias_com_diferenca jsonb, status text, motivos jsonb, legado jsonb)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
-- PR-CONC-SALDO-UMA-REGUA-01 — o RESUMO DA CONTA NO MES. Toda tela que mostra saldo, entradas, saidas ou "conciliado" de
-- uma conta le' daqui (PR 02). O dia e' o da Conferencia (`_fn_conciliacao_dias_conta`); os saldos sao os INFORMADOS,
-- consolidados com as internas; o status so' e' 'conciliado' com as tres condicoes fechando.
#variable_conflict use_column
DECLARE
  v_d1 date; v_d2 date; v_ant text; c record; v jsonb; v_ini numeric; v_fim numeric; v_data date; v_ini_conta numeric;
  v_fim_conta numeric; v_banco numeric; v_sis numeric; v_dif numeric; v_naofecha numeric; v_dias jsonb; v_mot jsonb;
  v_status text; v_leg_sis numeric; v_leg_dif numeric; v_leg_status text; v_falta_saldo boolean;
BEGIN
  IF p_cliente_id IS NULL OR p_ano_mes !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'p_cliente_id e p_ano_mes (YYYY-MM) obrigatorios'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.tenant_ok(p_cliente_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem_permissao: operacao nao autorizada para este cliente.';
  END IF;
  v_d1 := to_date(p_ano_mes || '-01', 'YYYY-MM-DD');
  v_d2 := (v_d1 + interval '1 month' - interval '1 day')::date;
  v_ant := to_char(v_d1 - interval '1 month', 'YYYY-MM');

  FOR c IN
    SELECT b.id, coalesce(b.nome_exibicao, b.nome_conta) AS nome, b.consolida_em_conta_id AS cons
      FROM financeiro_contas_bancarias b
     WHERE b.cliente_id = p_cliente_id AND (p_conta_ids IS NULL OR b.id = ANY (p_conta_ids))
     ORDER BY b.ordem_exibicao NULLS LAST, b.nome_exibicao
  LOOP
    v := public._fn_conciliacao_dias_conta(p_cliente_id, c.id, v_d1, v_d2);

    -- saldos informados: a conta + as internas dela (`consolida_em_conta_id`); faltou um, o consolidado e' NULO
    SELECT CASE WHEN count(*) FILTER (WHERE s.saldo_final IS NULL) > 0 OR count(s.conta_bancaria_id) < count(*) THEN NULL
                ELSE sum(s.saldo_final) END
      INTO v_ini
      FROM (SELECT x.id FROM financeiro_contas_bancarias x WHERE x.id = c.id OR (x.consolida_em_conta_id = c.id AND x.cliente_id = p_cliente_id)) k
      LEFT JOIN financeiro_saldos_bancarios_v2 s ON s.conta_bancaria_id = k.id AND s.cliente_id = p_cliente_id AND s.ano_mes = v_ant;
    SELECT CASE WHEN count(*) FILTER (WHERE s.saldo_final IS NULL) > 0 OR count(s.conta_bancaria_id) < count(*) THEN NULL
                ELSE sum(s.saldo_final) END
      INTO v_fim
      FROM (SELECT x.id FROM financeiro_contas_bancarias x WHERE x.id = c.id OR (x.consolida_em_conta_id = c.id AND x.cliente_id = p_cliente_id)) k
      LEFT JOIN financeiro_saldos_bancarios_v2 s ON s.conta_bancaria_id = k.id AND s.cliente_id = p_cliente_id AND s.ano_mes = p_ano_mes;
    SELECT s.saldo_data, s.saldo_final, coalesce(s.saldo_inicial, (SELECT a.saldo_final FROM financeiro_saldos_bancarios_v2 a
             WHERE a.conta_bancaria_id = c.id AND a.cliente_id = p_cliente_id AND a.ano_mes = v_ant))
      INTO v_data, v_fim_conta, v_ini_conta
      FROM financeiro_saldos_bancarios_v2 s WHERE s.conta_bancaria_id = c.id AND s.cliente_id = p_cliente_id AND s.ano_mes = p_ano_mes;
    IF NOT FOUND THEN
      v_data := NULL; v_fim_conta := NULL;
      SELECT a.saldo_final INTO v_ini_conta FROM financeiro_saldos_bancarios_v2 a
       WHERE a.conta_bancaria_id = c.id AND a.cliente_id = p_cliente_id AND a.ano_mes = v_ant;
    END IF;

    v_banco := (v->>'banco_total')::numeric;
    v_sis := (v->>'sistema_total')::numeric;
    v_dias := coalesce((SELECT jsonb_agg(x ORDER BY x->>'data') FROM jsonb_array_elements(v->'dias') x
                         WHERE (x->>'diferenca')::numeric <> 0), '[]'::jsonb);
    v_dif := CASE WHEN v_ini IS NULL OR v_fim IS NULL THEN NULL ELSE round(v_fim - (v_ini + v_sis), 2) END;
    v_naofecha := CASE WHEN v_ini IS NULL OR v_fim IS NULL THEN NULL ELSE round(v_fim - v_ini - v_banco, 2) END;
    v_falta_saldo := v_ini IS NULL OR v_fim IS NULL;

    -- a regua antiga (o Resumo de hoje): saldo da conta sozinha, todo realizado pago no mes pelo valor cheio
    v_leg_sis := CASE WHEN v_ini_conta IS NULL THEN NULL
                      ELSE round(v_ini_conta + (v->>'legado_entradas')::numeric + (v->>'legado_saidas')::numeric, 2) END;
    v_leg_dif := CASE WHEN v_fim_conta IS NULL OR v_leg_sis IS NULL THEN NULL ELSE round(v_fim_conta - v_leg_sis, 2) END;
    v_leg_status := CASE WHEN v_fim_conta IS NULL THEN 'pendente' WHEN coalesce(v_leg_dif, 0) = 0 THEN 'conciliado' ELSE 'nao_conciliado' END;

    v_mot := '[]'::jsonb;
    IF NOT (v->>'tem_extrato')::boolean THEN
      -- mes sem extrato: o status de hoje, sem inventar
      v_status := v_leg_status;
      v_mot := jsonb_build_array(jsonb_build_object('motivo', 'sem_extrato'));
    ELSE
      IF jsonb_array_length(v_dias) > 0 THEN
        v_mot := v_mot || jsonb_build_object('motivo', 'dias_com_diferenca', 'qtde', jsonb_array_length(v_dias),
                   'dias', (SELECT jsonb_agg(x->>'data' ORDER BY x->>'data') FROM jsonb_array_elements(v_dias) x));
      END IF;
      IF v_falta_saldo THEN
        v_mot := v_mot || jsonb_build_object('motivo', 'saldo_nao_informado',
                   'falta', CASE WHEN v_ini IS NULL AND v_fim IS NULL THEN 'inicial e final' WHEN v_ini IS NULL THEN 'inicial' ELSE 'final' END);
      ELSE
        IF v_dif <> 0 THEN v_mot := v_mot || jsonb_build_object('motivo', 'saldo_diverge', 'valor', v_dif); END IF;
        IF v_naofecha <> 0 THEN v_mot := v_mot || jsonb_build_object('motivo', 'extrato_nao_fecha', 'valor', v_naofecha); END IF;
      END IF;
      v_status := CASE WHEN v_falta_saldo THEN 'pendente'
                       WHEN jsonb_array_length(v_mot) = 0 THEN 'conciliado' ELSE 'nao_conciliado' END;
    END IF;

    conta_id := c.id; conta_nome := c.nome; consolida_em_conta_id := c.cons;
    tem_extrato := (v->>'tem_extrato')::boolean;
    saldo_inicial := v_ini;
    entradas := round((v->>'entradas')::numeric, 2); saidas := round((v->>'saidas')::numeric, 2);
    saldo_sistema := CASE WHEN v_ini IS NULL THEN NULL ELSE round(v_ini + v_sis, 2) END;
    saldo_extrato := v_fim; saldo_extrato_data := v_data; diferenca := v_dif;
    banco := jsonb_build_object('entradas', round((v->>'banco_entradas')::numeric, 2), 'saidas', round((v->>'banco_saidas')::numeric, 2),
                                'extrato_nao_fecha', v_naofecha);
    extratos_sem_par := v->'extratos_sem_par'; lancamentos_sem_par := v->'lancamentos_sem_par';
    retido_em_depositos := v->'retido_em_depositos';
    dias_com_diferenca := v_dias; status := v_status; motivos := v_mot;
    legado := jsonb_build_object('saldo_inicial', v_ini_conta, 'entradas', round((v->>'legado_entradas')::numeric, 2),
                'saidas', round((v->>'legado_saidas')::numeric, 2), 'saldo_sistema', v_leg_sis, 'saldo_extrato', v_fim_conta,
                'diferenca', v_leg_dif, 'status', v_leg_status);
    RETURN NEXT;
  END LOOP;
END
$function$;
REVOKE ALL ON FUNCTION public.fn_conciliacao_resumo_mes(uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conciliacao_resumo_mes(uuid, text, uuid[]) TO authenticated, service_role;

DO $guarda$
DECLARE r record;
BEGIN
  SELECT p.oid, p.proconfig, p.prosecdef, p.proacl::text AS acl INTO r FROM pg_proc p
   WHERE p.oid = 'public.fn_caixa_sistema_pontas(uuid, uuid, date, date, boolean)'::regprocedure;
  IF NOT ('plan_cache_mode=force_custom_plan' = ANY (r.proconfig)) OR NOT ('search_path=pg_catalog, public' = ANY (r.proconfig))
     OR NOT r.prosecdef
     OR NOT has_function_privilege('authenticated', r.oid, 'EXECUTE') OR NOT has_function_privilege('service_role', r.oid, 'EXECUTE')
     OR has_function_privilege('anon', r.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_caixa_sistema_pontas: config/ACL inesperados (% · % · %)', r.proconfig, r.prosecdef, r.acl;
  END IF;
  IF has_function_privilege('authenticated', 'public._fn_conciliacao_dias_conta(uuid, uuid, date, date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_conciliacao_resumo_mes(uuid, text, uuid[])', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_conciliacao_resumo_mes(uuid, text, uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL das funcoes novas inesperada';
  END IF;
  IF to_regprocedure('public.fn_caixa_sistema_pontas(uuid, uuid, date, date)') IS NOT NULL
     AND (SELECT pronargs FROM pg_proc WHERE oid = to_regprocedure('public.fn_caixa_sistema_pontas(uuid, uuid, date, date)')) = 4 THEN
    RAISE EXCEPTION 'sobrou a assinatura antiga de fn_caixa_sistema_pontas';
  END IF;
END $guarda$;