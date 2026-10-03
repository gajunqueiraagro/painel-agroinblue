-- PR-SEG-TENANT-VARREDURA-01B — guarda de tenant em `get_anos_financeiro_v2` e `fn_extratos_espelhados`
--
-- POR QUE (FASE 0 de 03/10 e o P0 deste PR): as duas sao SECURITY DEFINER com EXECUTE para `authenticated` e atravessam a RLS.
-- `get_anos_financeiro_v2` devolvia os anos com lancamento de QUALQUER cliente a quem soubesse o id. `fn_extratos_espelhados` so'
-- recusava por tabela (a `fn_caixa_sistema_pontas` que ela chama), com codigo CBLOC; sem usuario lia tudo; e com o cliente proprio
-- e a conta de OUTRO cliente devolvia o nome daquela conta.
-- O QUE MUDA: as duas recusam com 42501 "sem acesso a este registro" antes de ler — `tenant_ok(cliente)`, e na dos espelhados a
-- conta tem de ser do cliente informado. Sem usuario: 42501. Para o membro do cliente e para o admin, o retorno e' o de antes.
-- Assinatura, retorno, STABLE, SECURITY DEFINER, search_path e ACL nao mudam. A linguagem passa de sql a plpgsql (sql nao recusa);
-- a consulta de cada uma e' a de antes, byte a byte. `fn_extratos_espelhados` ganha `plan_cache_mode = force_custom_plan`.
-- FORA: `refresh_zoot_cache` (3), `fn_zoot_categoria_mensal` e `get_status_pilares_fechamento` — tem chamador sem usuario (cron e
-- triggers) e vao no 01B2, com corpo interno + RPC publica. `fn_caixa_sistema_pontas` nao e' tocada.
-- Corpo integral, guardado por md5 de origem e de destino.

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.get_anos_financeiro_v2(uuid)'::regprocedure) IS DISTINCT FROM '7650703430edc95be55077e3c6b3636e'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_extratos_espelhados(uuid, uuid, text)'::regprocedure) IS DISTINCT FROM 'afbded55cee6f52fbfd978e944e18313' THEN
    RAISE EXCEPTION 'corpo de origem inesperado. Migration abortada.';
  END IF;
  CREATE TEMP TABLE _seg01b_acl ON COMMIT DROP AS
    SELECT p.oid, p.proacl::text AS acl FROM pg_proc p
     WHERE p.oid IN ('public.get_anos_financeiro_v2(uuid)'::regprocedure, 'public.fn_extratos_espelhados(uuid, uuid, text)'::regprocedure);
END $guarda$;

CREATE OR REPLACE FUNCTION public.get_anos_financeiro_v2(p_cliente_id uuid)
 RETURNS TABLE(ano integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- PR-SEG-TENANT-VARREDURA-01B: guarda de tenant ANTES de ler. Era LANGUAGE sql (que nao recusa); virou plpgsql so' para poder
-- recusar — a consulta abaixo e' a de antes, byte a byte. `use_column`: o `ano` do ORDER BY e' a coluna, como no SQL.
#variable_conflict use_column
BEGIN
  IF NOT COALESCE(public.tenant_ok(p_cliente_id), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT DISTINCT CAST(substring(ano_mes from 1 for 4) AS int) AS ano
  FROM financeiro_lancamentos_v2
  WHERE cliente_id = p_cliente_id
    AND status_transacao IS DISTINCT FROM 'cancelado'
  ORDER BY ano;
END
$function$;

CREATE OR REPLACE FUNCTION public.fn_extratos_espelhados(p_cliente uuid, p_conta uuid, p_mes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
-- PR-SEG-TENANT-VARREDURA-01B: guarda de tenant ANTES de ler — o cliente passa em tenant_ok (admin AgroinBlue ou membro ativo; sem
-- usuario, falso) E a conta e' DESTE cliente. Antes a recusa vinha so' de dentro de `fn_caixa_sistema_pontas` (codigo CBLOC, e
-- pulada sem usuario), e a conta de outro cliente devolvia o NOME dela. Era LANGUAGE sql (que nao recusa); virou plpgsql so' para
-- poder recusar — a consulta abaixo e' a de antes, byte a byte. `force_custom_plan`: funcao de tela com parametro de conta (a regra
-- do PR-CONC-CAIXA-PONTAS-PLANO-HOTFIX); em LANGUAGE sql nao havia plano generico a evitar.
BEGIN
  IF NOT COALESCE(public.tenant_ok(p_cliente), false)
     OR NOT EXISTS (SELECT 1 FROM public.financeiro_contas_bancarias b WHERE b.id = p_conta AND b.cliente_id = p_cliente) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  RETURN (
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
'versao','espelhados-05-caixa','gerado_em', now()) 
  );
END
$function$;

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.get_anos_financeiro_v2(uuid)'::regprocedure) IS DISTINCT FROM 'be48858d236de41da19ed9cb82aff0c3'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_extratos_espelhados(uuid, uuid, text)'::regprocedure) IS DISTINCT FROM 'a3da29058dd5f6c329c4ff51868aeb1d' THEN
    RAISE EXCEPTION 'corpo de destino inesperado';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN _seg01b_acl a ON a.oid = p.oid
              WHERE p.proacl::text IS DISTINCT FROM a.acl OR NOT p.prosecdef OR p.provolatile <> 's'
                 OR NOT ('search_path=public' = ANY (p.proconfig))
                 OR has_function_privilege('anon', p.oid, 'EXECUTE') OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'))
     OR (SELECT count(*) FROM _seg01b_acl) <> 2 THEN
    RAISE EXCEPTION 'ACL/config mudaram';
  END IF;
END $guarda$;
