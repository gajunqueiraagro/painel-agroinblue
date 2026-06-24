-- ============================================================================
-- ESPELHADOS-01.1 | fn_extratos_espelhados(p_cliente, p_conta, p_mes)
-- DELTA 01.1 (cirurgico, sobre 01.0): ofx_base passa a filtrar e.cancelado_em
--   IS NULL (OFX com soft delete saem das listas). flag_dup segue por valor
--   ASSINADO (o2.v = o.v AND o2.dt = o.dt). Resto identico a 01.0.
-- ----------------------------------------------------------------------------
-- ESPELHADOS-01.0 | fn_extratos_espelhados(p_cliente, p_conta, p_mes)
-- RPC IRMA da fn_conciliacao_soberana (NAO toca a soberana). So LEITURA, STABLE.
-- Fonte de dados da Camada C3 (Extratos Espelhados): ofx_completo[] (todas as
-- linhas do extrato, inclusive ignorado), sistema_completo[] (todos os
-- lancamentos da conta no mes, regra lv2), saldos-ancora (inicial/final_oficial),
-- status por linha (derivado dos mesmos cbi ativos da Auditoria) e flags simples
-- (flag_dup por valor ASSINADO+data; flag_investimento por descricao).
-- Saldo corrido e evolucao diaria ficam no FRONT (RPC = dados, nao motor visual).
-- Aplicada no proto via Management API e validada (gates Bradesco/Maio); versionada aqui.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_extratos_espelhados(p_cliente uuid, p_conta uuid, p_mes text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH pp AS (
  SELECT p_cliente AS cli, p_conta AS conta, p_mes AS mes,
    TO_DATE(p_mes||'-01','YYYY-MM-DD') AS d1,
    (TO_DATE(p_mes||'-01','YYYY-MM-DD') + INTERVAL '1 month' - INTERVAL '1 day')::date AS d2
),
ofx_base AS (
  SELECT e.id, e.data_movimento AS dt, e.valor AS v, e.tipo_movimento AS tp,
         e.descricao, e.documento, e.status
  FROM extrato_bancario_v2 e JOIN pp ON true
  WHERE e.cliente_id = pp.cli AND e.conta_bancaria_id = pp.conta
    AND e.data_movimento BETWEEN pp.d1 AND pp.d2
    AND e.cancelado_em IS NULL
),
lv2 AS (
  SELECT l.id, l.data_pagamento AS dt,
         (CASE WHEN l.sinal='1' THEN l.valor ELSE -l.valor END) AS v,
         l.sinal,
         COALESCE(l.descricao, l.historico) AS descricao,
         l.centro_custo, l.subcentro
  FROM financeiro_lancamentos_v2 l JOIN pp ON true
  WHERE l.cliente_id = pp.cli AND l.ano_mes = pp.mes
    AND l.cancelado = false AND l.sem_movimentacao_caixa = false
    AND COALESCE(l.cenario,'realizado') = 'realizado'
    AND l.status_transacao = 'realizado'
    AND ((l.sinal='1'  AND (l.conta_destino_id = pp.conta OR l.conta_bancaria_id = pp.conta))
      OR (l.sinal='-1' AND l.conta_bancaria_id = pp.conta))
),
ofx_status AS (
  SELECT o.*,
    CASE
      WHEN o.status = 'ignorado' THEN 'ignorado'
      WHEN EXISTS(SELECT 1 FROM conciliacao_bancaria_itens cbi
                  JOIN financeiro_lancamentos_v2 l ON l.id=cbi.lancamento_id AND l.cancelado=false
                  WHERE cbi.extrato_id=o.id AND cbi.desfeito_em IS NULL) THEN 'conciliado'
      ELSE 'sem_vinculo'
    END AS st,
    (SELECT count(*) FROM ofx_base o2 WHERE o2.v = o.v AND o2.dt = o.dt) > 1 AS flag_dup,
    (o.descricao ~* '(cdb|invest|aplic|resg)') AS flag_inv
  FROM ofx_base o
),
sis_status AS (
  SELECT s.*,
    CASE WHEN EXISTS(SELECT 1 FROM conciliacao_bancaria_itens cbi
                     WHERE cbi.lancamento_id=s.id AND cbi.desfeito_em IS NULL) THEN 'conciliado'
         ELSE 'sem_vinculo' END AS st
  FROM lv2 s
),
sb_ini AS (
  SELECT saldo_final AS v FROM financeiro_saldos_bancarios_v2
  WHERE cliente_id=p_cliente AND conta_bancaria_id=p_conta
    AND ano_mes = to_char((TO_DATE(p_mes||'-01','YYYY-MM-DD') - INTERVAL '1 month'),'YYYY-MM')
  LIMIT 1
),
sb_fim AS (
  SELECT saldo_final AS v FROM financeiro_saldos_bancarios_v2
  WHERE cliente_id=p_cliente AND conta_bancaria_id=p_conta AND ano_mes=p_mes
  LIMIT 1
),
cb AS (SELECT nome_exibicao FROM financeiro_contas_bancarias WHERE id=p_conta LIMIT 1)
SELECT jsonb_build_object(
  'escopo', jsonb_build_object('cliente_id',p_cliente,'conta_id',p_conta,'ano_mes',p_mes,
            'nome_conta',(SELECT nome_exibicao FROM cb)),
  'saldos', jsonb_build_object(
            'inicial',(SELECT v FROM sb_ini),
            'final_oficial',(SELECT v FROM sb_fim),
            'periodo_ini',(SELECT d1 FROM pp),
            'periodo_fim',(SELECT d2 FROM pp),
            'extrato_ini',(SELECT min(dt) FROM ofx_base),
            'extrato_fim',(SELECT max(dt) FROM ofx_base)),
  'ofx_completo',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'extrato_id',id,'data',dt,'historico',descricao,'documento',documento,
            'valor',v,'status',st,'flag_dup',flag_dup,'flag_investimento',flag_inv) ORDER BY dt, id),'[]'::jsonb) FROM ofx_status),
  'sistema_completo',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'lancamento_id',id,'data',dt,'descricao',descricao,'centro',centro_custo,
            'subcentro',subcentro,'valor_assinado',v,'sinal',sinal,'status',st) ORDER BY dt, id),'[]'::jsonb) FROM sis_status),
  'versao','espelhados-01.1-ofx-cancelado',
  'gerado_em', now()
)
$function$;
