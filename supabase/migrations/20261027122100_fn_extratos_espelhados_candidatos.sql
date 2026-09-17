-- ESPELHO — candidatos do sistema para casar com o extrato (Etapa 1 do Espelho evoluido).
--
-- `fn_extratos_espelhados` ganha a CTE `cand` e a chave `sistema_candidatos` no jsonb:
-- lancamentos NAO realizados (previsto/agendado/programado), fora do cenario 'meta', nao
-- cancelados e com movimento de caixa, com vencimento ate o fim do mes (os vencidos em
-- aberto de meses anteriores entram, sem limite para tras; `vencido` = vencimento antes do
-- mes). Regra de conta igual a da `lv2`, MAIS os lancamentos sem conta nenhuma, que viram
-- candidatos de qualquer conta (`sem_conta`). Traz o contexto que a tela mostra: centro,
-- subcentro, status, cenario, cultura, documento, fornecedor e safra; e `ja_conciliado`.
-- `versao` passa a 'espelhados-04-candidatos'.
--
-- ⚠ AS CHAVES ANTIGAS NAO MUDAM: escopo, saldos, ofx_completo, vinculos e sistema_completo
--    saem das mesmas CTEs de 20260909205118 (conferido no banco: contagens iguais).
--
-- ⚠ ESTE ARQUIVO E' A DEFINICAO DO BANCO, NAO O RASCUNHO. A funcao foi aplicada no proto com
--    espacamento proprio (CTEs em uma linha), semanticamente igual ao rascunho revisado. Para o
--    repo bater com o banco, o texto abaixo foi copiado do `pg_get_functiondef` e conferido:
--      corpo (prosrc): md5 8d53a889f1b3e5f4f13fcacddf525403, len 6424
--      definicao completa: md5 d5b6ed8bc8d4c0b99da67196ce129939, len 6630

CREATE OR REPLACE FUNCTION public.fn_extratos_espelhados(p_cliente uuid, p_conta uuid, p_mes text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
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
'versao','espelhados-04-candidatos','gerado_em', now()) $function$;
