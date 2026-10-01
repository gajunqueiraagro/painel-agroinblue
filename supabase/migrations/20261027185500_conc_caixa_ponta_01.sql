-- CONC-CAIXA-PONTA-01 (PR A do CONC-SALDO-PARCIAL-01) — UMA regra de caixa do sistema, no banco.
--
-- O caixa do sistema numa conta e' a soma das PONTAS (lancamento x conta, sinal da direcao). Regra refinada (FASE 0):
--   (1) programado/agendado com vinculo vivo PARCIAL (0 < aplicado < valor): o aplicado, na data de cada extrato;
--   (2) realizado cujo aplicado soma o valor dele: o aplicado, distribuido pelas datas dos extratos (so' muda o dia);
--   (3) sem vinculo, ou com aplicado que nao bate (as 7 pontas sobre-aplicadas legadas): como hoje — valor cheio na data
--       de pagamento, exatamente o lv2 de fn_extratos_espelhados.
--   Programado/agendado SEM vinculo, ou vinculado por INTEIRO sem ter sido promovido (o estorno 426aeeb0 do BB do NJ,
--   mai/26 — ver o relatorio), fica fora do caixa, como hoje.
-- Medido em 01/10 no proto: o Sicredi Lavoura ago/26 passa a bater com o banco nos 19 dias (30.150,70); os demais
-- conta-meses ficam com o total identico ao de hoje (o relatorio diz quantos).
--
-- fn_extratos_espelhados passa a emitir tambem `sistema_caixa` (vindo da funcao nova); `sistema_completo` fica — as
-- telas so' trocam no PR B. Corpo integral; prosrc md5 8d53a889f1b3e5f4f13fcacddf525403 -> afbded55cee6f52fbfd978e944e18313.
-- Nao muda dado, tela, DRE nem vinculo.
-- GESTO CONTRARIO: recriar fn_extratos_espelhados com o corpo da migration 20261027122100 (md5 8d53a889) e
--   DROP FUNCTION public.fn_caixa_sistema_pontas(uuid, uuid, date, date).

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_extratos_espelhados(uuid, uuid, text)'::regprocedure) <> '8d53a889f1b3e5f4f13fcacddf525403' THEN
    RAISE EXCEPTION 'CONC-CAIXA-PONTA-01: corpo de origem de fn_extratos_espelhados divergente — abortado';
  END IF;
  IF to_regprocedure('public.fn_caixa_sistema_pontas(uuid, uuid, date, date)') IS NOT NULL THEN
    RAISE EXCEPTION 'CONC-CAIXA-PONTA-01: fn_caixa_sistema_pontas ja existe — abortado';
  END IF;
END $guarda$;

CREATE FUNCTION public.fn_caixa_sistema_pontas(p_cliente uuid, p_conta uuid, p_de date, p_ate date)
 RETURNS TABLE(lancamento_id uuid, data date, valor numeric, origem text, parcial boolean, falta numeric)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
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
                 WHEN l.sinal = '1' THEN 1 ELSE -1 END) AS s
      FROM financeiro_lancamentos_v2 l
     WHERE l.cliente_id = p_cliente AND l.cancelado = false AND l.sem_movimentacao_caixa = false
       AND COALESCE(l.cenario, 'realizado') = 'realizado'
       AND l.status_transacao IN ('realizado', 'programado', 'agendado')
       AND ((l.sinal = '1' AND (l.conta_destino_id = p_conta OR l.conta_bancaria_id = p_conta))
         OR (l.sinal = '-1' AND l.conta_bancaria_id = p_conta)
         OR (l.tipo_operacao = '3-Transferências' AND l.conta_destino_id = p_conta))
  ),
  vivos AS (
    -- os vinculos vivos desta ponta: so' extratos DESTA conta, vivos (nem cancelados nem ignorados)
    SELECT c.lancamento_id AS lid, e.data_movimento AS d, c.valor_aplicado AS ap
      FROM conciliacao_bancaria_itens c JOIN extrato_bancario_v2 e ON e.id = c.extrato_id
     WHERE c.desfeito_em IS NULL AND e.cliente_id = p_cliente AND e.conta_bancaria_id = p_conta
       AND e.cancelado_em IS NULL AND e.ignorado_em IS NULL
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
  )
  SELECT m.id, m.dp, (m.s * m.bruto)::numeric, 'pagamento'::text, false, 0::numeric
    FROM modo m WHERE m.md = 'pagamento' AND m.dp BETWEEN p_de AND p_ate
  UNION ALL
  SELECT m.id, v.d, (m.s * sum(v.ap))::numeric, 'aplicado'::text, (m.md = 'parcial'),
         (CASE WHEN m.md = 'parcial' THEN round(m.mag - m.total, 2) ELSE 0 END)::numeric
    FROM modo m JOIN vivos v ON v.lid = m.id
   WHERE m.md IN ('parcial', 'aplicado') AND v.d BETWEEN p_de AND p_ate
   GROUP BY m.id, v.d, m.s, m.md, m.mag, m.total;
END
$function$;

CREATE OR REPLACE FUNCTION public.fn_extratos_espelhados(p_cliente uuid, p_conta uuid, p_mes text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH pp AS (SELECT p_cliente AS cli, p_conta AS conta, p_mes AS mes, TO_DATE(p_mes||'-01','YYYY-MM-DD') AS d1, (TO_DATE(p_mes||'-01','YYYY-MM-DD') + INTERVAL '1 month' - INTERVAL '1 day')::date AS d2),
ofx_base AS (SELECT e.id, e.data_movimento AS dt, e.valor AS v, e.tipo_movimento AS tp, e.descricao, e.documento, e.status FROM extrato_bancario_v2 e JOIN pp ON true WHERE e.cliente_id = pp.cli AND e.conta_bancaria_id = pp.conta AND e.data_movimento BETWEEN pp.d1 AND pp.d2 AND e.cancelado_em IS NULL AND e.ignorado_em IS NULL),
lv2 AS (SELECT l.id, l.data_pagamento AS dt, (CASE WHEN l.tipo_operacao = '3-Transferências' AND l.conta_destino_id = pp.conta THEN l.valor WHEN l.tipo_operacao = '3-Transferências' AND l.conta_bancaria_id = pp.conta THEN -l.valor WHEN l.sinal = '1' THEN l.valor ELSE -l.valor END) AS v, l.sinal, COALESCE(l.descricao, l.historico) AS descricao, l.centro_custo, l.subcentro, l.origem_lancamento, l.favorecido_id, l.data_competencia, (SELECT f.nome FROM financeiro_fornecedores f WHERE f.id = l.favorecido_id) AS fornecedor FROM financeiro_lancamentos_v2 l JOIN pp ON true WHERE l.cliente_id = pp.cli AND l.data_pagamento BETWEEN pp.d1 AND pp.d2 AND l.cancelado = false AND l.sem_movimentacao_caixa = false AND COALESCE(l.cenario,'realizado') = 'realizado' AND l.status_transacao = 'realizado' AND ((l.sinal='1' AND (l.conta_destino_id = pp.conta OR l.conta_bancaria_id = pp.conta)) OR (l.sinal='-1' AND l.conta_bancaria_id = pp.conta) OR (l.tipo_operacao = '3-Transferências' AND l.conta_destino_id = pp.conta))),
cand AS (SELECT l.id, l.data_vencimento, l.data_competencia, (CASE WHEN l.tipo_operacao = '3-Transferências' AND l.conta_destino_id = pp.conta THEN l.valor WHEN l.tipo_operacao = '3-Transferências' AND l.conta_bancaria_id = pp.conta THEN -l.valor WHEN l.sinal = '1' THEN l.valor ELSE -l.valor END) AS v, l.valor, l.sinal, COALESCE(l.descricao, l.historico) AS descricao, l.centro_custo, l.subcentro, l.status_transacao, COALESCE(l.cenario,'realizado') AS cenario, l.cultura, l.numero_documento, l.tipo_documento, l.favorecido_id, (SELECT f.nome FROM financeiro_fornecedores f WHERE f.id = l.favorecido_id) AS fornecedor, sf.codigo AS safra_codigo, sf.descricao AS safra_descricao, (l.data_vencimento < pp.d1) AS vencido, EXISTS(SELECT 1 FROM conciliacao_bancaria_itens cbi WHERE cbi.lancamento_id = l.id AND cbi.desfeito_em IS NULL) AS ja_conciliado, (l.conta_bancaria_id IS NULL AND l.conta_destino_id IS NULL) AS sem_conta FROM financeiro_lancamentos_v2 l JOIN pp ON true LEFT JOIN financeiro_safras sf ON sf.id = l.safra_id WHERE l.cliente_id = pp.cli AND l.data_vencimento <= pp.d2 AND l.cancelado = false AND l.sem_movimentacao_caixa = false AND COALESCE(l.cenario,'realizado') <> 'meta' AND l.status_transacao IN ('previsto','agendado','programado') AND ((l.sinal='1' AND (l.conta_destino_id = pp.conta OR l.conta_bancaria_id = pp.conta)) OR (l.sinal='-1' AND l.conta_bancaria_id = pp.conta) OR (l.tipo_operacao = '3-Transferências' AND l.conta_destino_id = pp.conta) OR (l.conta_bancaria_id IS NULL AND l.conta_destino_id IS NULL))),
ofx_status AS (SELECT o.*, CASE WHEN o.status = 'ignorado' THEN 'ignorado' WHEN EXISTS(SELECT 1 FROM conciliacao_bancaria_itens cbi JOIN financeiro_lancamentos_v2 l ON l.id=cbi.lancamento_id AND l.cancelado=false WHERE cbi.extrato_id=o.id AND cbi.desfeito_em IS NULL) THEN 'conciliado' ELSE 'sem_vinculo' END AS st, (SELECT count(*) FROM ofx_base o2 WHERE o2.v = o.v AND o2.dt = o.dt) > 1 AS flag_dup, (o.descricao ~* '(cdb|invest|aplic|resg)') AS flag_inv FROM ofx_base o),
sis_status AS (SELECT s.*, CASE WHEN EXISTS(SELECT 1 FROM conciliacao_bancaria_itens cbi WHERE cbi.lancamento_id=s.id AND cbi.desfeito_em IS NULL) THEN 'conciliado' ELSE 'sem_vinculo' END AS st FROM lv2 s),
sb_ini AS (SELECT saldo_final AS v FROM financeiro_saldos_bancarios_v2 WHERE cliente_id=p_cliente AND conta_bancaria_id=p_conta AND ano_mes = to_char((TO_DATE(p_mes||'-01','YYYY-MM-DD') - INTERVAL '1 month'),'YYYY-MM') LIMIT 1),
sb_fim AS (SELECT saldo_final AS v FROM financeiro_saldos_bancarios_v2 WHERE cliente_id=p_cliente AND conta_bancaria_id=p_conta AND ano_mes=p_mes LIMIT 1),
cb AS (SELECT nome_exibicao FROM financeiro_contas_bancarias WHERE id=p_conta LIMIT 1)
SELECT jsonb_build_object('escopo', jsonb_build_object('cliente_id',p_cliente,'conta_id',p_conta,'ano_mes',p_mes,'nome_conta',(SELECT nome_exibicao FROM cb)),
'saldos', jsonb_build_object('inicial',(SELECT v FROM sb_ini),'final_oficial',(SELECT v FROM sb_fim),'periodo_ini',(SELECT d1 FROM pp),'periodo_fim',(SELECT d2 FROM pp),'extrato_ini',(SELECT min(dt) FROM ofx_base),'extrato_fim',(SELECT max(dt) FROM ofx_base)),
'ofx_completo',(SELECT COALESCE(jsonb_agg(jsonb_build_object('extrato_id',id,'data',dt,'historico',descricao,'documento',documento,'valor',v,'status',st,'flag_dup',flag_dup,'flag_investimento',flag_inv) ORDER BY dt, id),'[]'::jsonb) FROM ofx_status),
'vinculos',(SELECT COALESCE(jsonb_agg(jsonb_build_object('extrato_id',cbi.extrato_id,'lancamento_id',cbi.lancamento_id,'valor_aplicado',cbi.valor_aplicado,'tipo_aprovacao',cbi.tipo_aprovacao,'grupo_id',cbi.grupo_id) ORDER BY cbi.extrato_id, cbi.created_at),'[]'::jsonb) FROM conciliacao_bancaria_itens cbi WHERE cbi.desfeito_em IS NULL AND (cbi.extrato_id IN (SELECT id FROM ofx_base) OR cbi.lancamento_id IN (SELECT id FROM lv2))),
'sistema_completo',(SELECT COALESCE(jsonb_agg(jsonb_build_object('lancamento_id',id,'data',dt,'descricao',descricao,'centro',centro_custo,'subcentro',subcentro,'valor_assinado',v,'sinal',sinal,'status',st,'origem_lancamento',origem_lancamento,'favorecido_id',favorecido_id,'fornecedor',fornecedor,'competencia',data_competencia) ORDER BY dt, id),'[]'::jsonb) FROM sis_status),
'sistema_candidatos',(SELECT COALESCE(jsonb_agg(jsonb_build_object('lancamento_id',id,'data_vencimento',data_vencimento,'competencia',data_competencia,'valor',valor,'valor_assinado',v,'sinal',sinal,'descricao',descricao,'centro',centro_custo,'subcentro',subcentro,'status_transacao',status_transacao,'cenario',cenario,'cultura',cultura,'numero_documento',numero_documento,'tipo_documento',tipo_documento,'favorecido_id',favorecido_id,'fornecedor',fornecedor,'safra_codigo',safra_codigo,'safra_descricao',safra_descricao,'vencido',vencido,'ja_conciliado',ja_conciliado,'sem_conta',sem_conta) ORDER BY data_vencimento, id),'[]'::jsonb) FROM cand),
'sistema_caixa',(SELECT COALESCE(jsonb_agg(jsonb_build_object('lancamento_id',x.lancamento_id,'data',x.data,'valor',x.valor,'origem',x.origem,'parcial',x.parcial,'falta',x.falta) ORDER BY x.data, x.lancamento_id),'[]'::jsonb) FROM public.fn_caixa_sistema_pontas(p_cliente, p_conta, (SELECT d1 FROM pp), (SELECT d2 FROM pp)) x),
'versao','espelhados-05-caixa','gerado_em', now()) $function$;

DO $confere$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_extratos_espelhados(uuid, uuid, text)'::regprocedure) <> 'afbded55cee6f52fbfd978e944e18313' THEN
    RAISE EXCEPTION 'CONC-CAIXA-PONTA-01: corpo de destino de fn_extratos_espelhados divergente — abortado';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_caixa_sistema_pontas(uuid, uuid, date, date)'::regprocedure) <> '8a1cd4f9ecc02fa8eebb61a1c7093bd2' THEN
    RAISE EXCEPTION 'CONC-CAIXA-PONTA-01: corpo de fn_caixa_sistema_pontas divergente — abortado';
  END IF;
END $confere$;

REVOKE ALL ON FUNCTION public.fn_caixa_sistema_pontas(uuid, uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_caixa_sistema_pontas(uuid, uuid, date, date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_extratos_espelhados(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_extratos_espelhados(uuid, uuid, text) TO authenticated, service_role;
