-- PR-CONC-SALDO-UMA-REGUA-01b — o dono do resumo fica COMPLETO (a tela do PR 02 so' renderiza)
--
-- POR QUE (o PARE do PR-CONC-SALDO-UMA-REGUA-02, 03/10): a tela ainda teria de calcular abertura terceiros x transferencias,
-- subtotais por tipo e o total do mes (com o 'parcial' que ninguem definia), a origem do saldo inicial, a posicao do meio do
-- mes, os dias da Evolucao, a lista do sistema e o selo dos 12 meses. Cada um viraria uma segunda regua no front.
--
-- O QUE MUDA (tudo ADITIVO: os campos de hoje das linhas de conta sao identicos, provado por md5 nos 69 conta-meses)
-- D1. Indice `idx_fin_lanc_v2_cliente_destino` (cliente_id, conta_destino_id) e o filtro de conta de `fn_caixa_sistema_pontas`
--     em DUAS buscas indexadas (conta bancaria | destino sem a bancaria). So' o FROM/WHERE do CTE `pontas` muda; corpo
--     guardado pelo md5 de origem (56a28f30…) e conferido no destino; ACL, SECURITY DEFINER, search_path, plan_cache_mode e
--     `p_detalhe` mantidos (CREATE OR REPLACE, mesma assinatura). Saida identica nos 69 conta-meses, com e sem p_detalhe.
--     ⚠ O indice e' SEM predicado: o parcial `WHERE cancelado IS NOT TRUE` (o do irmao `idx_fin_lanc_v2_cliente_conta_vivo`)
--     NAO e' usado por `cancelado = false` — o planner nao prova a implicacao (medido: bitmap no cliente inteiro, 3.716 buffers).
-- D2. Cada linha ganha entradas/saidas abertas em terceiros x transferencias (tipo 3- nas duas grafias), das MESMAS pecas do
--     caixa: as partes somam o total no valor cru.
-- D3. Depois das linhas de conta (`nivel` = 'conta'), um subtotal por tipo de conta ('tipo', a regra de `grupoDaConta`) e o
--     TOTAL ('total'). Status do agregado: 'conciliado' so' com TODAS as contas com extrato conciliadas; senao 'nao_conciliado'
--     com cada conta e os motivos dela; nenhuma com extrato: 'pendente' (sem_extrato). NAO EXISTE 'parcial'. `sem_conta` na
--     linha do total, com o motivo 'lancamentos_sem_conta' quando ha' (informa; nao muda o status, que e' das contas).
-- D4. `saldo_inicial_origem` 'informado' | 'herdado' | 'ausente' (a regra de `perContaSaldos`).
-- D5. Com UMA conta: `dias` (todos os dias com movimento: banco, sistema, acumulados e o saldo de cada lado). Com o saldo
--     declarado no meio do mes: `posicao` {data, saldo_sistema_na_data, diferenca_na_data, realizados_apos}. A diferenca e o
--     status do mes continuam no FIM do mes.
-- D6. Com UMA conta: `linhas_sistema`, a lista pela regra da mesa (vinculo no dia do extrato, realizado sem par, resto do
--     sub-aplicado; parcial com a falta; interna fora). Saldo inicial + soma = saldo_sistema por construcao.
-- D7. `fn_conciliacao_status_ano(p_cliente_id, p_ano)`: status e motivos por conta/mes (so' contas com extrato ou lancamento
--     no mes) e o do total do mes, pela MESMA interna do resumo.
-- O corpo do resumo virou `_fn_conciliacao_resumo` (interna, so' service_role); a publica e o status do ano a chamam.
-- Nenhuma escrita em dado; nenhuma tela.

-- ═══════════════════ guardas de origem ═══════════════════
DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_caixa_sistema_pontas(uuid, uuid, date, date, boolean)'::regprocedure)
       IS DISTINCT FROM '56a28f300cec6ffa324868ffc51cf4ff'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_conciliacao_dias_conta(uuid, uuid, date, date)'::regprocedure)
       IS DISTINCT FROM '66faca989b88ffd8ebec1acdaccdd020'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliacao_resumo_mes(uuid, text, uuid[])'::regprocedure)
       IS DISTINCT FROM 'fe3c16e49c53c8ba7ce155d204d19b76' THEN
    RAISE EXCEPTION 'corpo de origem inesperado (pontas/dias/resumo). Migration abortada.';
  END IF;
END $guarda$;

-- ═══════════════════ D1 — indice e o filtro de conta em duas buscas ═══════════════════
CREATE INDEX IF NOT EXISTS idx_fin_lanc_v2_cliente_destino ON public.financeiro_lancamentos_v2 USING btree (cliente_id, conta_destino_id);

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

-- ═══════════════════ D2/D5/D6 — o dia da mesa, por conta (interna: so' service_role) ═══════════════════
DROP FUNCTION public._fn_conciliacao_dias_conta(uuid, uuid, date, date);

CREATE FUNCTION public._fn_conciliacao_dias_conta(p_cliente uuid, p_conta uuid, p_de date, p_ate date,
                                                   p_detalhe boolean DEFAULT false, p_posicao date DEFAULT NULL,
                                                   p_saldo_inicial numeric DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
-- O DIA DA CONFERENCIA, no banco — ESPELHO DECLARADO de `montarMesa` (ancora do extrato). Tudo sai do detalhe do dono das
-- pontas (`fn_caixa_sistema_pontas(..., p_detalhe => true)`); aqui so' se soma.
-- PR-CONC-SALDO-UMA-REGUA-01b: + a abertura terceiros x transferencias (sempre), a posicao (com `p_posicao`), e os dias com
-- acumulados e a lista do sistema (so' com `p_detalhe`). As chaves de antes nao mudaram.
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
      ) x GROUP BY x.data),
  -- ── PR-CONC-SALDO-UMA-REGUA-01b: as PECAS do sistema (as mesmas tres parcelas do `sistema_total`), uma linha cada ──
  pecas AS (
    SELECT 'vinculo'::text AS tipo, vin.lancamento_id, vin.data, vin.contrib AS valor, (vin.extrato_valor > 0) AS entrada,
           vin.extrato_id, vin.extrato_valor
      FROM vin
    UNION ALL SELECT 'sem_par'::text, semvinc.lancamento_id, semvinc.data, semvinc.valor, (semvinc.valor > 0), NULL::uuid, NULL::numeric
      FROM semvinc
    UNION ALL SELECT 'resto_sub_aplicado'::text, restos.lancamento_id, restos.data, restos.r, (restos.r > 0), NULL::uuid, NULL::numeric
      FROM restos),
  -- o lancamento de cada peca: transferencia = tipo 3- nas duas grafias (a regra de `isTransferenciaTipo`)
  tip AS (
    SELECT l.id, (l.tipo_operacao IN ('3-Transferência', '3-Transferências')) AS transf, l.descricao, l.favorecido_id, l.subcentro,
           l.tipo_operacao, l.status_transacao, l.data_pagamento, l.valor, l.numero_documento
      FROM financeiro_lancamentos_v2 l WHERE l.id IN (SELECT pecas.lancamento_id FROM pecas)),
  pecas2 AS (SELECT pecas.*, coalesce(tip.transf, false) AS transf FROM pecas LEFT JOIN tip ON tip.id = pecas.lancamento_id),
  -- o dia CRU (sem arredondar), para acumular sem deriva de centavo
  dias_crus AS (
    SELECT x.data, sum(x.b) AS b, sum(x.s) AS s
      FROM (SELECT ext.data, ext.valor AS b, 0::numeric AS s FROM ext
            UNION ALL SELECT pecas.data, 0::numeric, pecas.valor FROM pecas) x
     GROUP BY x.data)
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
    'legado_saidas', coalesce((SELECT sum(lan.valor) FROM lan WHERE lan.valor < 0), 0),
    -- ── PR-CONC-SALDO-UMA-REGUA-01b ──
    -- D2: as MESMAS pecas de 'entradas'/'saidas', abertas em terceiros x transferencias (as partes somam o total, cru)
    'entradas_terceiros', coalesce((SELECT sum(pecas2.valor) FROM pecas2 WHERE pecas2.entrada AND NOT pecas2.transf), 0),
    'entradas_transferencias', coalesce((SELECT sum(pecas2.valor) FROM pecas2 WHERE pecas2.entrada AND pecas2.transf), 0),
    'saidas_terceiros', coalesce((SELECT sum(pecas2.valor) FROM pecas2 WHERE NOT pecas2.entrada AND NOT pecas2.transf), 0),
    'saidas_transferencias', coalesce((SELECT sum(pecas2.valor) FROM pecas2 WHERE NOT pecas2.entrada AND pecas2.transf), 0),
    -- D5: a posicao declarada no meio do mes — o sistema ate' a data (cru) e o que veio depois dela
    'posicao_sistema', CASE WHEN p_posicao IS NOT NULL THEN coalesce((SELECT sum(pecas.valor) FROM pecas WHERE pecas.data <= p_posicao), 0) END,
    'apos', CASE WHEN p_posicao IS NOT NULL THEN jsonb_build_object(
        'qtde', (SELECT count(DISTINCT pecas.lancamento_id) FROM pecas WHERE pecas.data > p_posicao),
        'valor', coalesce((SELECT sum(pecas.valor) FROM pecas WHERE pecas.data > p_posicao), 0)) END,
    -- D5 (so' com p_detalhe): todos os dias, o dia da mesa + os acumulados (do cru) e o saldo de cada lado no fim do dia
    'dias_detalhe', CASE WHEN p_detalhe THEN coalesce((
        SELECT jsonb_agg(jsonb_build_object('data', dc.data, 'banco', dias.banco, 'sistema', dias.sistema,
                 'diferenca', round(dias.banco - dias.sistema, 2), 'motivos', to_jsonb(dias.motivos),
                 'banco_acum', round(dc.ab, 2), 'sistema_acum', round(dc.asis, 2),
                 'saldo_banco', round(p_saldo_inicial + dc.ab, 2), 'saldo_sistema', round(p_saldo_inicial + dc.asis, 2)) ORDER BY dc.data)
          FROM (SELECT dias_crus.data, sum(dias_crus.b) OVER w AS ab, sum(dias_crus.s) OVER w AS asis
                  FROM dias_crus WINDOW w AS (ORDER BY dias_crus.data)) dc
          JOIN dias ON dias.data = dc.data), '[]'::jsonb) END,
    -- D6 (so' com p_detalhe): a lista do sistema pela regra da mesa — uma linha por peca, valor CRU com o sinal; a soma e'
    -- o `sistema_total` por construcao. Parcial (programado/agendado que nao quitou) vem do dono das pontas, sem copia.
    'linhas_sistema', CASE WHEN p_detalhe THEN coalesce((
        SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                 'tipo', p.tipo, 'data', p.data, 'valor', p.valor, 'lancamento_id', p.lancamento_id,
                 'extrato_id', p.extrato_id, 'extrato_valor', p.extrato_valor,
                 'transferencia', CASE WHEN p.transf THEN true END,
                 'parcial', CASE WHEN car.lancamento_id IS NOT NULL THEN true END, 'falta', car.falta,
                 'sobre_aplicado', CASE WHEN EXISTS (SELECT 1 FROM sobre WHERE sobre.lancamento_id = p.lancamento_id) THEN true END,
                 'descricao', t.descricao, 'fornecedor', f.nome, 'subcentro', t.subcentro, 'tipo_operacao', t.tipo_operacao,
                 'status_transacao', t.status_transacao, 'data_pagamento', t.data_pagamento, 'valor_lancamento', t.valor,
                 'numero_documento', t.numero_documento))
                 ORDER BY p.data, p.tipo DESC, p.extrato_id, p.lancamento_id)
          FROM pecas2 p
          LEFT JOIN tip t ON t.id = p.lancamento_id
          LEFT JOIN financeiro_fornecedores f ON f.id = t.favorecido_id
          LEFT JOIN (SELECT c.lancamento_id, max(c.falta) AS falta
                       FROM public.fn_caixa_sistema_pontas(p_cliente, p_conta, p_de, p_ate) c
                      WHERE c.parcial GROUP BY c.lancamento_id) car
                 ON car.lancamento_id = p.lancamento_id AND p.tipo = 'vinculo'), '[]'::jsonb) END
  ) INTO v;
  RETURN v;
END
$function$;
REVOKE ALL ON FUNCTION public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric) TO service_role;

-- ═══════════════════ D3/D4/D5 — o corpo do resumo (interna) ═══════════════════
DROP FUNCTION public.fn_conciliacao_resumo_mes(uuid, text, uuid[]);

CREATE FUNCTION public._fn_conciliacao_resumo(p_cliente_id uuid, p_ano_mes text, p_conta_ids uuid[], p_detalhe boolean,
                                              p_sem_conta boolean)
 RETURNS TABLE(conta_id uuid, conta_nome text, consolida_em_conta_id uuid, tem_extrato boolean,
               saldo_inicial numeric, entradas numeric, saidas numeric, saldo_sistema numeric,
               saldo_extrato numeric, saldo_extrato_data date, diferenca numeric,
               banco jsonb, extratos_sem_par jsonb, lancamentos_sem_par jsonb, retido_em_depositos jsonb,
               dias_com_diferenca jsonb, status text, motivos jsonb, legado jsonb,
               nivel text, tipo_conta text, entradas_terceiros numeric, entradas_transferencias numeric,
               saidas_terceiros numeric, saidas_transferencias numeric, saldo_inicial_origem text,
               posicao jsonb, dias jsonb, linhas_sistema jsonb, sem_conta jsonb)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
-- PR-CONC-SALDO-UMA-REGUA-01 — o RESUMO DA CONTA NO MES. Toda tela que mostra saldo, entradas, saidas ou "conciliado" de
-- uma conta le' daqui (PR 02). O dia e' o da Conferencia (`_fn_conciliacao_dias_conta`); os saldos sao os INFORMADOS,
-- consolidados com as internas; o status so' e' 'conciliado' com as tres condicoes fechando.
-- PR-CONC-SALDO-UMA-REGUA-01b: o CORPO do resumo virou esta interna (a publica e o status do ano chamam a mesma), e ela
-- devolve, depois das linhas de conta (nivel 'conta', os campos de antes identicos), um subtotal por TIPO de conta e o
-- TOTAL. `p_detalhe` NULO = automatico (uma conta so'); `p_sem_conta` poe na linha do total os lancamentos sem conta.
#variable_conflict use_column
DECLARE
  v_d1 date; v_d2 date; v_ant text; c record; v jsonb; v_ini numeric; v_fim numeric; v_data date; v_ini_conta numeric;
  v_fim_conta numeric; v_banco numeric; v_sis numeric; v_dif numeric; v_naofecha numeric; v_dias jsonb; v_mot jsonb;
  v_status text; v_leg_sis numeric; v_leg_dif numeric; v_leg_status text; v_falta_saldo boolean;
  v_det boolean; v_origem text; v_contas jsonb := '[]'::jsonb; v_sem jsonb; g record; v_next int; v_nfal int; v_falhas jsonb;
BEGIN
  IF p_cliente_id IS NULL OR p_ano_mes !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'p_cliente_id e p_ano_mes (YYYY-MM) obrigatorios'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.tenant_ok(p_cliente_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem_permissao: operacao nao autorizada para este cliente.';
  END IF;
  v_d1 := to_date(p_ano_mes || '-01', 'YYYY-MM-DD');
  v_d2 := (v_d1 + interval '1 month' - interval '1 day')::date;
  v_ant := to_char(v_d1 - interval '1 month', 'YYYY-MM');
  v_det := coalesce(p_detalhe, (SELECT count(*) = 1 FROM financeiro_contas_bancarias b
                                 WHERE b.cliente_id = p_cliente_id AND (p_conta_ids IS NULL OR b.id = ANY (p_conta_ids))));

  FOR c IN
    SELECT b.id, coalesce(b.nome_exibicao, b.nome_conta) AS nome, b.consolida_em_conta_id AS cons,
           -- o GRUPO da conta: a regra de `grupoDaConta` (src/lib/financeiro/gruposDeConta.ts); desconhecido = 'outro'
           (CASE WHEN lower(btrim(coalesce(b.tipo_conta, ''))) IN ('cc', 'inv', 'cartao', 'permuta', 'caixa', 'outro')
                 THEN lower(btrim(b.tipo_conta)) ELSE 'outro' END) AS grupo
      FROM financeiro_contas_bancarias b
     WHERE b.cliente_id = p_cliente_id AND (p_conta_ids IS NULL OR b.id = ANY (p_conta_ids))
     ORDER BY b.ordem_exibicao NULLS LAST, b.nome_exibicao
  LOOP
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
    -- D4: a origem do saldo inicial da conta — a regra de `perContaSaldos` (ConciliacaoBancariaTab): a linha do mes
    -- existe = 'informado'; senao o saldo final do mes anterior = 'herdado'; senao 'ausente'
    v_origem := CASE WHEN EXISTS (SELECT 1 FROM financeiro_saldos_bancarios_v2 s
                                   WHERE s.conta_bancaria_id = c.id AND s.cliente_id = p_cliente_id AND s.ano_mes = p_ano_mes) THEN 'informado'
                     WHEN EXISTS (SELECT 1 FROM financeiro_saldos_bancarios_v2 a
                                   WHERE a.conta_bancaria_id = c.id AND a.cliente_id = p_cliente_id AND a.ano_mes = v_ant
                                     AND a.saldo_final IS NOT NULL) THEN 'herdado'
                     ELSE 'ausente' END;

    v := public._fn_conciliacao_dias_conta(p_cliente_id, c.id, v_d1, v_d2, v_det,
                                           CASE WHEN v_data < v_d2 THEN v_data END, v_ini);

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
    -- ── PR-CONC-SALDO-UMA-REGUA-01b ──
    nivel := 'conta'; tipo_conta := c.grupo;
    entradas_terceiros := round((v->>'entradas_terceiros')::numeric, 2);
    entradas_transferencias := round((v->>'entradas_transferencias')::numeric, 2);
    saidas_terceiros := round((v->>'saidas_terceiros')::numeric, 2);
    saidas_transferencias := round((v->>'saidas_transferencias')::numeric, 2);
    saldo_inicial_origem := v_origem;
    -- D5: posicao so' com o saldo declarado ANTES do fim do mes; a diferenca e o status do mes continuam no fim do mes
    posicao := CASE WHEN v_data IS NOT NULL AND v_data < v_d2 THEN jsonb_build_object(
                 'data', v_data,
                 'saldo_sistema_na_data', CASE WHEN v_ini IS NULL THEN NULL ELSE round(v_ini + (v->>'posicao_sistema')::numeric, 2) END,
                 'diferenca_na_data', CASE WHEN v_ini IS NULL OR v_fim IS NULL THEN NULL
                                           ELSE round(v_fim - (v_ini + (v->>'posicao_sistema')::numeric), 2) END,
                 'realizados_apos', jsonb_build_object('qtde', (v->'apos'->>'qtde')::int,
                                                       'valor', round((v->'apos'->>'valor')::numeric, 2))) END;
    dias := CASE WHEN v_det THEN v->'dias_detalhe' END;
    linhas_sistema := CASE WHEN v_det THEN v->'linhas_sistema' END;
    sem_conta := NULL;
    RETURN NEXT;
    v_contas := v_contas || jsonb_build_array(jsonb_build_object(
      'conta_id', c.id, 'conta_nome', c.nome, 'grupo', c.grupo, 'interna', c.cons IS NOT NULL, 'tem_extrato', tem_extrato,
      'status', v_status, 'motivos', v_mot, 'saldo_inicial', saldo_inicial, 'entradas', entradas, 'saidas', saidas,
      'saldo_sistema', saldo_sistema, 'saldo_extrato', saldo_extrato, 'diferenca', diferenca,
      'banco_entradas', banco->'entradas', 'banco_saidas', banco->'saidas', 'extrato_nao_fecha', banco->'extrato_nao_fecha',
      'esp_qtde', extratos_sem_par->'qtde', 'esp_valor', extratos_sem_par->'valor',
      'lsp_qtde', lancamentos_sem_par->'qtde', 'lsp_valor', lancamentos_sem_par->'valor',
      'ret_qtde', retido_em_depositos->'qtde', 'ret_valor', retido_em_depositos->'valor',
      'et', entradas_terceiros, 'etr', entradas_transferencias, 'st', saidas_terceiros, 'str', saidas_transferencias));
  END LOOP;

  -- ═══ D3: subtotal por TIPO de conta e TOTAL ═══
  -- VALORES: soma das linhas de conta, FORA as internas (o saldo delas ja' esta' consolidado na conta-mae); a soma de um
  -- saldo ignora a conta sem ele e e' NULA so' quando nenhuma o tem. STATUS: sobre TODAS as contas COM EXTRATO no mes
  -- (internas inclusive) — 'conciliado' so' com todas conciliadas; senao 'nao_conciliado' com cada conta e os motivos
  -- dela; nenhuma com extrato = 'pendente' ('sem_extrato'). Nao existe 'parcial'.
  IF p_sem_conta THEN
    SELECT jsonb_build_object('qtde', count(*),
             'entradas', coalesce(round(sum(abs(l.valor)) FILTER (WHERE l.tipo_operacao = '1-Entradas'), 2), 0),
             'saidas', coalesce(round(sum(abs(l.valor)) FILTER (WHERE l.tipo_operacao = '2-Saídas'), 2), 0))
      INTO v_sem
      FROM financeiro_lancamentos_v2 l
     WHERE l.cliente_id = p_cliente_id AND l.cancelado = false AND l.sem_movimentacao_caixa = false
       AND l.status_transacao = 'realizado' AND l.cenario = 'realizado'
       AND l.data_pagamento BETWEEN v_d1 AND v_d2 AND l.conta_bancaria_id IS NULL AND l.conta_destino_id IS NULL;
  END IF;

  FOR g IN
    SELECT t.k, t.rot FROM (VALUES ('cc', 'Conta corrente', 0), ('inv', 'Investimentos', 1), ('cartao', 'Cartão', 2),
                                   ('permuta', 'Permuta', 3), ('caixa', 'Caixa', 4), ('outro', 'Outros', 5),
                                   (NULL, 'Total', 99)) t(k, rot, o)
     WHERE t.k IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_contas) y WHERE y->>'grupo' = t.k)
     ORDER BY t.o
  LOOP
    SELECT
      coalesce(bool_or((y->>'tem_extrato')::boolean), false),
      sum((y->>'saldo_inicial')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean),
      coalesce(sum((y->>'entradas')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean), 0),
      coalesce(sum((y->>'saidas')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean), 0),
      sum((y->>'saldo_sistema')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean),
      sum((y->>'saldo_extrato')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean),
      sum((y->>'diferenca')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean),
      jsonb_build_object(
        'entradas', coalesce(sum((y->>'banco_entradas')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean), 0),
        'saidas', coalesce(sum((y->>'banco_saidas')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean), 0),
        'extrato_nao_fecha', sum((y->>'extrato_nao_fecha')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean)),
      jsonb_build_object('qtde', coalesce(sum((y->>'esp_qtde')::int) FILTER (WHERE NOT (y->>'interna')::boolean), 0),
                         'valor', coalesce(sum((y->>'esp_valor')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean), 0)),
      jsonb_build_object('qtde', coalesce(sum((y->>'lsp_qtde')::int) FILTER (WHERE NOT (y->>'interna')::boolean), 0),
                         'valor', coalesce(sum((y->>'lsp_valor')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean), 0)),
      jsonb_build_object('valor', coalesce(sum((y->>'ret_valor')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean), 0),
                         'qtde', coalesce(sum((y->>'ret_qtde')::int) FILTER (WHERE NOT (y->>'interna')::boolean), 0)),
      coalesce(sum((y->>'et')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean), 0),
      coalesce(sum((y->>'etr')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean), 0),
      coalesce(sum((y->>'st')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean), 0),
      coalesce(sum((y->>'str')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean), 0),
      count(*) FILTER (WHERE (y->>'tem_extrato')::boolean),
      count(*) FILTER (WHERE (y->>'tem_extrato')::boolean AND y->>'status' <> 'conciliado'),
      jsonb_agg(jsonb_build_object('conta_id', y->'conta_id', 'conta_nome', y->'conta_nome', 'status', y->'status',
                                   'motivos', y->'motivos') ORDER BY i)
        FILTER (WHERE (y->>'tem_extrato')::boolean AND y->>'status' <> 'conciliado')
      INTO tem_extrato, saldo_inicial, entradas, saidas, saldo_sistema, saldo_extrato, diferenca, banco,
           extratos_sem_par, lancamentos_sem_par, retido_em_depositos,
           entradas_terceiros, entradas_transferencias, saidas_terceiros, saidas_transferencias, v_next, v_nfal, v_falhas
      FROM jsonb_array_elements(v_contas) WITH ORDINALITY AS e(y, i)
     WHERE g.k IS NULL OR y->>'grupo' = g.k;

    v_mot := '[]'::jsonb;
    IF v_next = 0 THEN
      v_status := 'pendente';
      v_mot := jsonb_build_array(jsonb_build_object('motivo', 'sem_extrato'));
    ELSIF v_nfal = 0 THEN
      v_status := 'conciliado';
    ELSE
      v_status := 'nao_conciliado';
      v_mot := jsonb_build_array(jsonb_build_object('motivo', 'contas_nao_conciliadas', 'qtde', v_nfal, 'contas', v_falhas));
    END IF;
    -- os lancamentos sem conta: na linha do TOTAL, como motivo quando ha'; nao mudam o status (o status e' das contas)
    IF g.k IS NULL AND v_sem IS NOT NULL AND (v_sem->>'qtde')::int > 0 THEN
      v_mot := v_mot || jsonb_build_array(v_sem || jsonb_build_object('motivo', 'lancamentos_sem_conta'));
    END IF;

    conta_id := NULL; conta_nome := g.rot; consolida_em_conta_id := NULL; saldo_extrato_data := NULL;
    dias_com_diferenca := NULL; status := v_status; motivos := v_mot; legado := NULL;
    nivel := CASE WHEN g.k IS NULL THEN 'total' ELSE 'tipo' END; tipo_conta := g.k;
    saldo_inicial_origem := NULL; posicao := NULL; dias := NULL; linhas_sistema := NULL;
    sem_conta := CASE WHEN g.k IS NULL THEN v_sem END;
    RETURN NEXT;
  END LOOP;
END
$function$;
REVOKE ALL ON FUNCTION public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean) TO service_role;

-- ═══════════════════ o resumo publico (as colunas novas no fim) ═══════════════════
CREATE FUNCTION public.fn_conciliacao_resumo_mes(p_cliente_id uuid, p_ano_mes text, p_conta_ids uuid[] DEFAULT NULL)
 RETURNS TABLE(conta_id uuid, conta_nome text, consolida_em_conta_id uuid, tem_extrato boolean,
               saldo_inicial numeric, entradas numeric, saidas numeric, saldo_sistema numeric,
               saldo_extrato numeric, saldo_extrato_data date, diferenca numeric,
               banco jsonb, extratos_sem_par jsonb, lancamentos_sem_par jsonb, retido_em_depositos jsonb,
               dias_com_diferenca jsonb, status text, motivos jsonb, legado jsonb,
               nivel text, tipo_conta text, entradas_terceiros numeric, entradas_transferencias numeric,
               saidas_terceiros numeric, saidas_transferencias numeric, saldo_inicial_origem text,
               posicao jsonb, dias jsonb, linhas_sistema jsonb, sem_conta jsonb)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
-- PR-CONC-SALDO-UMA-REGUA-01 / 01b — o RESUMO DA CONTA NO MES: uma linha por conta (NULL = todas as do cliente), um
-- subtotal por tipo e o total. Com UMA conta, tambem os dias e a lista do sistema. O corpo e' `_fn_conciliacao_resumo`.
BEGIN
  IF p_cliente_id IS NULL OR p_ano_mes !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'p_cliente_id e p_ano_mes (YYYY-MM) obrigatorios'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.tenant_ok(p_cliente_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem_permissao: operacao nao autorizada para este cliente.';
  END IF;
  RETURN QUERY SELECT * FROM public._fn_conciliacao_resumo(p_cliente_id, p_ano_mes, p_conta_ids, NULL, p_conta_ids IS NULL);
END
$function$;
REVOKE ALL ON FUNCTION public.fn_conciliacao_resumo_mes(uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conciliacao_resumo_mes(uuid, text, uuid[]) TO authenticated, service_role;

-- ═══════════════════ D7 — o status do ano ═══════════════════
CREATE FUNCTION public.fn_conciliacao_status_ano(p_cliente_id uuid, p_ano integer)
 RETURNS TABLE(ano_mes text, nivel text, conta_id uuid, conta_nome text, tipo_conta text, status text, motivos jsonb)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
-- PR-CONC-SALDO-UMA-REGUA-01b (D7) — o selo dos 12 meses: por mes, o status e os motivos de cada conta que teve extrato
-- ou lancamento no mes, e o do TOTAL do mes. Sai da MESMA interna do resumo (`_fn_conciliacao_resumo`), sem detalhe; a
-- conta sem extrato no mes nao entra no status do total, entao pula-la nao muda o total.
#variable_conflict use_column
DECLARE v_mapa jsonb; v_mes text; v_ids uuid[];
BEGIN
  IF p_cliente_id IS NULL OR p_ano IS NULL THEN RAISE EXCEPTION 'p_cliente_id e p_ano obrigatorios'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.tenant_ok(p_cliente_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem_permissao: operacao nao autorizada para este cliente.';
  END IF;
  -- as contas com movimento em cada mes do ano: extrato vivo, ou lancamento nao cancelado pago no mes (qualquer ponta)
  SELECT jsonb_object_agg(m.mes, m.contas) INTO v_mapa
    FROM (SELECT x.mes, jsonb_agg(DISTINCT x.conta) AS contas
            FROM (SELECT to_char(e.data_movimento, 'YYYY-MM') AS mes, e.conta_bancaria_id AS conta
                    FROM extrato_bancario_v2 e
                   WHERE e.cliente_id = p_cliente_id AND e.cancelado_em IS NULL AND e.ignorado_em IS NULL
                     AND e.data_movimento BETWEEN make_date(p_ano, 1, 1) AND make_date(p_ano, 12, 31)
                  UNION
                  SELECT to_char(l.data_pagamento, 'YYYY-MM'), k.conta
                    FROM financeiro_lancamentos_v2 l
                    CROSS JOIN LATERAL (VALUES (l.conta_bancaria_id), (l.conta_destino_id)) k(conta)
                   WHERE l.cliente_id = p_cliente_id AND l.cancelado = false
                     AND l.data_pagamento BETWEEN make_date(p_ano, 1, 1) AND make_date(p_ano, 12, 31)
                     AND k.conta IS NOT NULL) x
           WHERE x.conta IS NOT NULL
           GROUP BY x.mes) m;
  FOR i IN 1..12 LOOP
    v_mes := p_ano::text || '-' || lpad(i::text, 2, '0');
    v_ids := coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(v_mapa->v_mes, '[]'::jsonb))::uuid), '{}'::uuid[]);
    RETURN QUERY
      SELECT v_mes, r.nivel, r.conta_id, r.conta_nome, r.tipo_conta, r.status, r.motivos
        FROM public._fn_conciliacao_resumo(p_cliente_id, v_mes, v_ids, false, true) r
       WHERE r.nivel IN ('conta', 'total');
  END LOOP;
END
$function$;
REVOKE ALL ON FUNCTION public.fn_conciliacao_status_ano(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conciliacao_status_ano(uuid, integer) TO authenticated, service_role;

-- ═══════════════════ guardas de destino ═══════════════════
DO $guarda$
DECLARE r record; f text;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_caixa_sistema_pontas(uuid, uuid, date, date, boolean)'::regprocedure)
       IS DISTINCT FROM 'ce53914eef1f3628abd3ce3abcf18619' THEN
    RAISE EXCEPTION 'fn_caixa_sistema_pontas: corpo de destino inesperado';
  END IF;
  FOREACH f IN ARRAY ARRAY['public.fn_caixa_sistema_pontas(uuid, uuid, date, date, boolean)',
                           'public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric)',
                           'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)',
                           'public.fn_conciliacao_resumo_mes(uuid, text, uuid[])',
                           'public.fn_conciliacao_status_ano(uuid, integer)'] LOOP
    SELECT p.oid, p.proconfig, p.prosecdef INTO r FROM pg_proc p WHERE p.oid = f::regprocedure;
    IF NOT ('plan_cache_mode=force_custom_plan' = ANY (r.proconfig)) OR NOT ('search_path=pg_catalog, public' = ANY (r.proconfig))
       OR NOT r.prosecdef OR has_function_privilege('anon', r.oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION '%: config/ACL inesperados (%)', f, r.proconfig;
    END IF;
    IF has_function_privilege('authenticated', r.oid, 'EXECUTE') <> (f NOT LIKE 'public._fn%') THEN
      RAISE EXCEPTION '%: EXECUTE de authenticated inesperado', f;
    END IF;
  END LOOP;
  IF to_regprocedure('public._fn_conciliacao_dias_conta(uuid, uuid, date, date)') IS NOT NULL THEN
    RAISE EXCEPTION 'sobrou a assinatura antiga de _fn_conciliacao_dias_conta';
  END IF;
END $guarda$;