-- 20260630_pr_readmodel_transferencia_entrada.sql
-- PR-ReadModel-TransferenciaEntrada — o read-model reconhece a perna de ENTRADA de
-- transferência por POSIÇÃO da conta (conta_destino_id), não por sinal.
--
-- Diagnóstico (read-only, P0-H.2→P0-H.6b): toda transferência tem sinal='-1' (convenção
-- universal). O "lado Sistema" exigia sinal='1' para reconhecer entrada por conta_destino_id,
-- descartando a perna de entrada (conta auditada = destino). Efeito: Espelhado "SEM LANÇAMENTO",
-- Evolução acusando divergência, lv2 contando 132 em vez de 146. Dado correto; read-model estreito.
--
-- Correção 100% server-side, sem alteração de dados. DUAS funções, 5 patches cirúrgicos +
-- saneamento de grants. Corpos materializados do banco VIVO (pg_get_functiondef após aplicar
-- os str_replace no proto), não reconstruídos de memória. Forward-only.
--
-- Regra de valor por posição (CTE lv2 de ambas):
--   transferência + conta_destino_id = conta analisada -> +valor (ENTRADA)
--   transferência + conta_bancaria_id = conta analisada -> -valor (SAÍDA)
--   senão: sinal='1' -> +valor, senão -valor.
-- Filtro lv2 ganha: OR (3-Transferências AND conta_destino_id = conta).
-- Soberana: resumo.lv2.saidas passa de WHERE sinal='-1' para WHERE v<0 (a entrada recém-incluída,
--   v>0, NÃO cai em saídas). resumo.lv2.entradas já era amplo (inalterado).
--
-- Validado (proto, cliente Santa Rita, 2026-04): BB 132->146; Bradesco 43->58 (15 transfer-
-- entradas legítimas, 0 degeneradas); saídas/entradas BB inalteradas; transf-saída segue negativa.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_conciliacao_soberana(p_cliente uuid, p_conta uuid, p_mes text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
WITH pp AS (
  SELECT p_cliente AS cli, p_conta AS conta, p_mes AS mes,
    TO_DATE(p_mes||'-01','YYYY-MM-DD') AS d1,
    (TO_DATE(p_mes||'-01','YYYY-MM-DD') + INTERVAL '1 month' - INTERVAL '1 day')::date AS d2
),

ofx_base AS (
  SELECT e.id, e.data_movimento AS dt, e.valor AS v, e.tipo_movimento AS tp,
         e.descricao, e.status, e.saldo_apos
  FROM extrato_bancario_v2 e JOIN pp ON true
  WHERE e.cliente_id = pp.cli AND e.conta_bancaria_id = pp.conta
    AND e.data_movimento BETWEEN pp.d1 AND pp.d2
    AND e.cancelado_em IS NULL
),
ofx      AS (SELECT * FROM ofx_base WHERE status IS DISTINCT FROM 'ignorado'),
desc_ofx AS (SELECT * FROM ofx_base WHERE status = 'ignorado'),

lv2 AS (
  SELECT l.id, l.data_pagamento AS dt,
         (CASE
            WHEN l.tipo_operacao = '3-Transferências' AND l.conta_destino_id  = pp.conta THEN  l.valor
            WHEN l.tipo_operacao = '3-Transferências' AND l.conta_bancaria_id = pp.conta THEN -l.valor
            WHEN l.sinal = '1' THEN l.valor ELSE -l.valor
          END) AS v,
         l.valor AS mag, l.sinal,
         COALESCE(l.descricao, l.historico) AS descricao,
         l.origem_lancamento AS origem_lancamento,
         l.status_transacao AS status_transacao
  FROM financeiro_lancamentos_v2 l JOIN pp ON true
  WHERE l.cliente_id = pp.cli AND l.ano_mes = pp.mes
    AND l.cancelado = false AND l.sem_movimentacao_caixa = false
    AND COALESCE(l.cenario,'realizado') = 'realizado'
    AND l.status_transacao = 'realizado'
    AND ((l.sinal='1'  AND (l.conta_destino_id = pp.conta OR l.conta_bancaria_id = pp.conta))
      OR (l.sinal='-1' AND l.conta_bancaria_id = pp.conta)
      OR (l.tipo_operacao = '3-Transferências' AND l.conta_destino_id = pp.conta))
),

-- VINCULO GOVERNA: todo link cbi de um OFX nosso, com motivo.
-- Ordem do CASE: cancelado > sinal > conta > valor > data (data e o ultimo/mais fraco).
links_raw AS (
  SELECT cbi.id AS link_id, cbi.extrato_id, cbi.lancamento_id,
         e.dt AS ofx_dt, e.v AS ofx_v, e.tp AS ofx_tp, e.descricao AS ofx_desc, e.status AS ofx_status,
         l.data_pagamento AS lanc_dt, l.valor AS lanc_valor, l.sinal AS lanc_sinal,
         COALESCE(l.descricao, l.historico) AS lanc_desc, l.origem_lancamento AS lanc_origem,
         l.status_transacao AS lanc_status,
         CASE
           WHEN l.id IS NULL THEN 'sem_lancamento'
           WHEN l.cancelado THEN 'cancelado'
           WHEN COALESCE(l.status_transacao, '') <> 'realizado' THEN 'status_nao_realizado'
           -- Transferencia (linha unica, sinal do ponto de vista da ORIGEM):
           --   conta auditada = DESTINO  -> OFX credito e o par correto;
           --   conta auditada = ORIGEM   -> OFX debito  e o par correto.
           -- So e' sinal_cruzado quando o papel da conta NAO explica o sinal.
           WHEN l.tipo_operacao = '3-Transferências'
                AND ((e.tp='credito' AND l.conta_destino_id = pp.conta)
                  OR (e.tp='debito'  AND l.conta_bancaria_id = pp.conta)) THEN 'valido'
           WHEN (e.tp='credito' AND l.sinal <> '1')
             OR (e.tp='debito'  AND l.sinal <> '-1') THEN 'sinal_cruzado'
           WHEN e.tp='credito'
                AND COALESCE(l.conta_destino_id = pp.conta, false) = false
                AND COALESCE(l.conta_bancaria_id = pp.conta, false) = false THEN 'conta_divergente'
           WHEN e.tp='debito'
                AND l.conta_bancaria_id IS DISTINCT FROM pp.conta THEN 'conta_divergente'
           WHEN ABS(e.v) <> l.valor THEN 'valor_divergente'
           WHEN l.data_pagamento IS NULL THEN 'data_ausente'
           WHEN ABS(e.dt - l.data_pagamento) > 3 THEN 'data_divergente'
           ELSE 'valido'
         END AS motivo
  FROM conciliacao_bancaria_itens cbi
  JOIN ofx_base e ON e.id = cbi.extrato_id
  JOIN pp ON true
  LEFT JOIN financeiro_lancamentos_v2 l ON l.id = cbi.lancamento_id
  WHERE cbi.desfeito_em IS NULL
),

-- DESCONSIDERADOS: OFX ignorado + LV2 vinculado a ele (par puxado junto).
desc_lanc AS (
  SELECT DISTINCT lancamento_id AS id FROM links_raw
  WHERE ofx_status = 'ignorado' AND lancamento_id IS NOT NULL
),

-- VALIDOS (somente reconciliavel).
ofx_valid AS (
  SELECT DISTINCT extrato_id FROM links_raw WHERE motivo='valido' AND ofx_status IS DISTINCT FROM 'ignorado'
),

-- DIVERGENCIAS DE VINCULO: link existente porem invalido, do OFX reconciliavel
-- que nao tem nenhum link valido. (OFX com link valido -> Corretos; particiona o lado OFX.)
div AS (
  SELECT * FROM links_raw lr
  WHERE lr.motivo <> 'valido' AND lr.ofx_status IS DISTINCT FROM 'ignorado'
    AND lr.extrato_id NOT IN (SELECT extrato_id FROM ofx_valid)
),

-- EXTRATO SEM SISTEMA: OFX reconciliavel sem NENHUM link.
ext_sem AS (
  SELECT * FROM ofx o WHERE o.id NOT IN (SELECT extrato_id FROM links_raw)
),

-- SISTEMA SEM EXTRATO: LV2 sem NENHUM link e fora dos desconsiderados.
sis_sem AS (
  SELECT * FROM lv2 l
  WHERE l.id NOT IN (SELECT lancamento_id FROM links_raw WHERE lancamento_id IS NOT NULL)
    AND l.id NOT IN (SELECT id FROM desc_lanc)
),

-- AGRUPAMENTO (overlay/sugestao): 1 OFX-sem-sistema = 2 LV2-sem-extrato, mesma soma assinada.
agr AS (
  SELECT o.id ofx_id, o.v ofx_v, a.id l1, a.v v1, b.id l2, b.v v2
  FROM ext_sem o
  JOIN sis_sem a ON true
  JOIN sis_sem b ON b.id > a.id AND b.v = o.v - a.v
),

-- CORRETOS: somente vinculo valido.
corretos AS (
  SELECT DISTINCT extrato_id, ofx_v FROM links_raw WHERE motivo='valido' AND ofx_status IS DISTINCT FROM 'ignorado'
),

-- grupos_conciliados (v01.10): vinculos REAIS do cbi, expostos como 1xN e Nx1.
-- Overlay puro: nao muta ext_sem/sis_sem/div/corretos. Ignora OFX ignorado.
grupo_links AS (
  SELECT DISTINCT lr.extrato_id, lr.lancamento_id,
         lr.ofx_dt, lr.ofx_v, lr.ofx_desc,
         lr.lanc_dt, lr.lanc_desc,
         (CASE WHEN lr.lanc_sinal = '1' THEN lr.lanc_valor ELSE -lr.lanc_valor END) AS lanc_v
  FROM links_raw lr
  WHERE lr.lancamento_id IS NOT NULL
    AND lr.ofx_status IS DISTINCT FROM 'ignorado'
),
g1xn_keys AS (
  SELECT extrato_id FROM grupo_links GROUP BY extrato_id HAVING count(DISTINCT lancamento_id) > 1
),
gnx1_keys AS (
  SELECT lancamento_id FROM grupo_links GROUP BY lancamento_id HAVING count(DISTINCT extrato_id) > 1
),
g1xn AS (
  SELECT
    gl.extrato_id AS grp_key,
    '1xN'::text AS tipo,
    jsonb_build_object('id', gl.extrato_id, 'data', max(gl.ofx_dt), 'valor', max(gl.ofx_v), 'descricao', max(gl.ofx_desc)) AS ancora,
    jsonb_agg(jsonb_build_object('id', gl.lancamento_id, 'data', gl.lanc_dt, 'valor_assinado', gl.lanc_v, 'descricao', gl.lanc_desc)
              ORDER BY (gl.lanc_v < 0) ASC, abs(gl.lanc_v) DESC) AS membros,
    max(gl.ofx_v) AS total_ofx,
    SUM(gl.lanc_v) AS total_sistema,
    max(gl.ofx_dt) AS ord_data,
    max(gl.ofx_v) AS ord_valor
  FROM grupo_links gl
  WHERE gl.extrato_id IN (SELECT extrato_id FROM g1xn_keys)
  GROUP BY gl.extrato_id
),
gnx1 AS (
  SELECT
    gl.lancamento_id AS grp_key,
    'Nx1'::text AS tipo,
    jsonb_build_object('id', gl.lancamento_id, 'data', max(gl.lanc_dt), 'valor', max(gl.lanc_v), 'descricao', max(gl.lanc_desc)) AS ancora,
    jsonb_agg(jsonb_build_object('id', gl.extrato_id, 'data', gl.ofx_dt, 'valor_assinado', gl.ofx_v, 'descricao', gl.ofx_desc)
              ORDER BY (gl.ofx_v < 0) ASC, abs(gl.ofx_v) DESC) AS membros,
    SUM(gl.ofx_v) AS total_ofx,
    max(gl.lanc_v) AS total_sistema,
    max(gl.lanc_dt) AS ord_data,
    max(gl.lanc_v) AS ord_valor
  FROM grupo_links gl
  WHERE gl.lancamento_id IN (SELECT lancamento_id FROM gnx1_keys)
  GROUP BY gl.lancamento_id
),
grupos_all AS (
  SELECT tipo, ancora, membros, total_ofx, total_sistema, ord_data, ord_valor FROM g1xn
  UNION ALL
  SELECT tipo, ancora, membros, total_ofx, total_sistema, ord_data, ord_valor FROM gnx1
),

cnt AS (
  SELECT
    (SELECT count(*) FROM ext_sem)  AS ext_sem_n,
    (SELECT count(*) FROM sis_sem)  AS sis_sem_n,
    (SELECT count(*) FROM div)      AS div_n,
    (SELECT count(*) FROM agr)      AS agr_n,
    (SELECT count(*) FROM corretos) AS corretos_n,
    (SELECT count(*) FROM desc_ofx) AS desc_n
)

SELECT jsonb_build_object(
  'gerado_em', now(),
  'versao', 'soberana-01.10-grupos-conciliados',
  'escopo', jsonb_build_object('cliente', p_cliente, 'conta', p_conta, 'mes', p_mes),

  'resumo', jsonb_build_object(
    'ofx', jsonb_build_object(
      'movimentos', (SELECT count(*) FROM ofx),
      'entradas',   (SELECT COALESCE(SUM(v),0)  FROM ofx WHERE tp='credito'),
      'saidas',     (SELECT COALESCE(SUM(-v),0) FROM ofx WHERE tp='debito'),
      'saldo_inicial', (SELECT saldo_apos FROM ofx_base ORDER BY dt ASC,  id ASC  LIMIT 1),
      'saldo_final',   (SELECT saldo_apos FROM ofx_base ORDER BY dt DESC, id DESC LIMIT 1)
    ),
    'extrato_cru', jsonb_build_object(
      'movimentos', (SELECT count(*) FROM ofx_base),
      'entradas',   (SELECT COALESCE(SUM(v),0)  FROM ofx_base WHERE tp = 'credito'),
      'saidas',     (SELECT COALESCE(SUM(-v),0) FROM ofx_base WHERE tp = 'debito'),
      'liquido',    (SELECT COALESCE(SUM(v),0)  FROM ofx_base),
      'ignorados',  (SELECT count(*) FROM ofx_base WHERE status = 'ignorado')
    ),
    'lv2', jsonb_build_object(
      'lancamentos', (SELECT count(*) FROM lv2),
      'entradas',    (SELECT COALESCE(SUM(l.valor),0)
                      FROM financeiro_lancamentos_v2 l JOIN pp ON true
                      WHERE l.cliente_id = pp.cli AND l.ano_mes = pp.mes
                        AND l.cancelado = false AND l.sem_movimentacao_caixa = false
                        AND COALESCE(l.cenario,'realizado') = 'realizado'
                        AND l.status_transacao = 'realizado'
                        AND ((l.tipo_operacao LIKE '1-%' AND (l.conta_destino_id = pp.conta OR l.conta_bancaria_id = pp.conta))
                          OR (l.tipo_operacao = '3-Transferências' AND l.conta_destino_id = pp.conta))),
      'saidas',      (SELECT COALESCE(SUM(mag),0) FROM lv2 WHERE v < 0)
    ),
    'corretos', jsonb_build_object(
      'qtd',   (SELECT corretos_n FROM cnt),
      'valor', (SELECT COALESCE(SUM(ofx_v),0) FROM corretos)
    ),
    'desconsiderados', jsonb_build_object(
      'movimentos', (SELECT desc_n FROM cnt),
      'entradas',   (SELECT COALESCE(SUM(v),0)  FROM desc_ofx WHERE tp='credito'),
      'saidas',     (SELECT COALESCE(SUM(-v),0) FROM desc_ofx WHERE tp='debito')
    )
  ),

  'veredito', jsonb_build_object(
    'conciliado', ((SELECT ext_sem_n FROM cnt)=0 AND (SELECT sis_sem_n FROM cnt)=0 AND (SELECT div_n FROM cnt)=0),
    'bloqueios', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('tipo',tipo,'count',n) ORDER BY ord),'[]'::jsonb)
      FROM (
        SELECT 'divergencias_vinculo' tipo, div_n     n, 1 ord FROM cnt WHERE div_n     > 0
        UNION ALL SELECT 'sistema_sem_extrato', sis_sem_n,  2 FROM cnt WHERE sis_sem_n > 0
        UNION ALL SELECT 'extrato_sem_sistema', ext_sem_n,  3 FROM cnt WHERE ext_sem_n > 0
      ) z
    )
  ),

  'conciliado_soberano', ((SELECT ext_sem_n FROM cnt)=0 AND (SELECT sis_sem_n FROM cnt)=0 AND (SELECT div_n FROM cnt)=0),

  'buckets', jsonb_build_object(
    -- Divergencias de Vinculo (renderavel: motivo + dados OFX e LV2 + dias)
    'divergencias_vinculo', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'link_id', link_id, 'motivo', motivo,
        'extrato_id', extrato_id, 'data_ofx', ofx_dt, 'valor', ofx_v, 'descricao', ofx_desc,
        'lancamento_id', lancamento_id, 'data_lancamento', lanc_dt, 'valor_lancamento', lanc_valor,
        'origem_lancamento', lanc_origem, 'status_transacao', lanc_status,
        'dias', CASE WHEN lanc_dt IS NOT NULL THEN ABS(ofx_dt - lanc_dt) END
      ) ORDER BY ofx_dt ASC, (ofx_v < 0) ASC, abs(ofx_v) DESC, motivo) FROM div), '[]'::jsonb),

    -- Sistema sem Extrato (LV2 sem vinculo) -- com origem_lancamento
    'sistema_sem_extrato', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'lancamento_id', id, 'data', dt, 'valor_assinado', v, 'sinal', sinal,
        'descricao', descricao, 'origem_lancamento', origem_lancamento,
        'status_transacao', status_transacao
      ) ORDER BY dt ASC, (v < 0) ASC, abs(v) DESC) FROM sis_sem), '[]'::jsonb),

    -- Extrato sem Sistema (OFX sem vinculo)
    'extrato_sem_sistema', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'extrato_id', id, 'data', dt, 'valor', v, 'tipo', tp, 'descricao', descricao
      ) ORDER BY dt ASC, (v < 0) ASC, abs(v) DESC) FROM ext_sem), '[]'::jsonb),

    -- Movimentos Desconsiderados (OFX ignorado + lancamento vinculado, se houver)
    'desconsiderados', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'extrato_id', d.id, 'data', d.dt, 'valor', d.v, 'tipo', d.tp, 'descricao', d.descricao,
        'lancamento_id', (SELECT lr.lancamento_id FROM links_raw lr WHERE lr.extrato_id = d.id LIMIT 1)
      ) ORDER BY d.dt, d.v) FROM desc_ofx d), '[]'::jsonb),

    -- Agrupamentos (overlay/sugestao -- NAO altera classificacao)
    'agrupamentos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'extrato_id', ofx_id, 'valor', ofx_v,
        'lancamentos', jsonb_build_array(
          jsonb_build_object('lancamento_id', l1, 'valor_assinado', v1),
          jsonb_build_object('lancamento_id', l2, 'valor_assinado', v2)
        )
      )) FROM agr), '[]'::jsonb),

    'grupos_conciliados', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'tipo', tipo,
        'ancora', ancora,
        'membros', membros,
        'total_ofx', total_ofx,
        'total_sistema', total_sistema,
        'diferenca', (total_ofx - total_sistema),
        'status_grupo', CASE WHEN abs(total_ofx - total_sistema) <= 0.005 THEN 'batido' ELSE 'divergente' END
      ) ORDER BY ord_data ASC, (ord_valor < 0) ASC, abs(ord_valor) DESC)
      FROM grupos_all), '[]'::jsonb)
  )
) ;
$function$;

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
         (CASE
            WHEN l.tipo_operacao = '3-Transferências' AND l.conta_destino_id  = pp.conta THEN  l.valor
            WHEN l.tipo_operacao = '3-Transferências' AND l.conta_bancaria_id = pp.conta THEN -l.valor
            WHEN l.sinal = '1' THEN l.valor ELSE -l.valor
          END) AS v,
         l.sinal,
         COALESCE(l.descricao, l.historico) AS descricao,
         l.centro_custo, l.subcentro
  FROM financeiro_lancamentos_v2 l JOIN pp ON true
  WHERE l.cliente_id = pp.cli AND l.ano_mes = pp.mes
    AND l.cancelado = false AND l.sem_movimentacao_caixa = false
    AND COALESCE(l.cenario,'realizado') = 'realizado'
    AND l.status_transacao = 'realizado'
    AND ((l.sinal='1'  AND (l.conta_destino_id = pp.conta OR l.conta_bancaria_id = pp.conta))
      OR (l.sinal='-1' AND l.conta_bancaria_id = pp.conta)
      OR (l.tipo_operacao = '3-Transferências' AND l.conta_destino_id = pp.conta))
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

-- GRANTS (saneamento: só authenticated; nasciam abertas a PUBLIC/anon)
REVOKE EXECUTE ON FUNCTION public.fn_conciliacao_soberana(uuid,uuid,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_conciliacao_soberana(uuid,uuid,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_extratos_espelhados(uuid,uuid,text)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_extratos_espelhados(uuid,uuid,text)  TO authenticated;

COMMIT;
