-- ============================================================================
-- SOBERANA-01.8  |  fn_conciliacao_soberana(p_cliente, p_conta, p_mes)
-- DELTA 01.8 (cirurgico, sobre 01.7): links_raw passa a considerar SO vinculos
--   ATIVOS (conciliacao_bancaria_itens.desfeito_em IS NULL). Vinculo desfeito
--   nao prende OFX nem gera divergencia 'cancelado'; OFX so com vinculo desfeito
--   cai em 'extrato_sem_sistema' (sem vinculo). SEM bucket novo, SEM delete.
--   Buckets/resumo/extrato_cru/chaves internas idênticos ao 01.7.
-- ----------------------------------------------------------------------------
-- SOBERANA-01.7  |  fn_conciliacao_soberana(p_cliente, p_conta, p_mes)
-- DELTA 01.7 (aditivo, sobre 01.6): adiciona resumo.extrato_cru — totais do
--   extrato CRU a partir de ofx_base, SEM filtrar status='ignorado'. Base p/
--   Camada 1 (Extrato Soberano). NAO altera ofx, desc_ofx, links_raw nem buckets.
-- ----------------------------------------------------------------------------
-- SOBERANA-01.6  |  fn_conciliacao_soberana(p_cliente, p_conta, p_mes)
-- DELTA 01.6 (cirurgico, sobre 01.5): resumo.lv2.entradas passa a incluir
--   transferencias recebidas (3-Transferências com conta_destino_id = conta),
--   espelhando a regra da Conciliacao Bancaria. CTE lv2, saidas e buckets
--   intactos. Eixo ano_mes.
-- ----------------------------------------------------------------------------
-- SOBERANA-01.5  |  fn_conciliacao_soberana(p_cliente, p_conta, p_mes)
-- DELTA 01.5 (cirurgico, sobre 01.4): corrige sinal_cruzado em TRANSFERENCIAS.
--   Em '3-Transferências' (linha unica, sinal do ponto de vista da ORIGEM):
--     conta auditada = DESTINO -> OFX credito e' o par correto (nao e' cruzado);
--     conta auditada = ORIGEM  -> OFX debito  e' o par correto.
--   So permanece 'sinal_cruzado' quando o papel da conta nao explica o sinal.
--   Inserido ANTES da regra generica de sinal no CASE de links_raw.
--   NAO altera resumo, buckets, nem a regra de vinculo/status da 01.4.
-- ----------------------------------------------------------------------------
-- SOBERANA-01.4  |  fn_conciliacao_soberana(p_cliente, p_conta, p_mes)
-- DELTA 01.4 (cirurgico, sobre 01.3): H1 so considera REALIZADO (defesa total).
--   (1) CTE lv2 base filtra l.status_transacao='realizado' (alem de cancelado,
--       sem_movimentacao_caixa, cenario). Afeta sistema_sem_extrato E resumo.lv2.
--   (2) links_raw: vinculo a lancamento nao-realizado -> 'status_nao_realizado'
--       (cai em divergencias_vinculo). Fecha o caminho lateral pelo qual um
--       'programado' vinculado virava 'valido'/Correto.
--   (3) NULL-safety (herdada da 01.3): ofx_status IS DISTINCT FROM 'ignorado'
--       em ofx_valid/div/corretos; data_pagamento NULL -> 'data_ausente'.
--   (4) Expoe status_transacao em sistema_sem_extrato e divergencias_vinculo.
-- ----------------------------------------------------------------------------
-- SOBERANA-01.3  |  fn_conciliacao_soberana(p_cliente, p_conta, p_mes)
-- REESCRITA DA REGUA: o VINCULO (conciliacao_bancaria_itens) governa a
-- classificacao; valor/soma vira APENAS candidato de agrupamento (sugestao),
-- nunca "explicado". Substitui 01.2 (matching por valor gerava fantasma +
-- sobreposicao de buckets). Read-only / diagnostico. Sem DML.
-- ----------------------------------------------------------------------------
-- PROBLEMA DA 01.2 (corrigido aqui):
--   - "matched" pareava OFX x LV2 por COINCIDENCIA DE VALOR, ignorando o cbi.
--     LV2 sem vinculo real sumia das excecoes (matching fantasma).
--   - desconsiderado (OFX ignorado) orfanava o LV2 de mesmo valor -> o valor
--     aparecia em dois blocos.
--
-- REGUA 01.3 (classificacao exclusiva, governada por vinculo):
--   Corretos              = vinculo VALIDO (cbi).
--   Divergencias Vinculo  = vinculo EXISTENTE porem invalido
--                           (status_nao_realizado | cancelado | sinal_cruzado |
--                            conta_divergente | valor_divergente | data_divergente |
--                            data_ausente).
--   Sistema sem Extrato   = LV2 reconciliavel SEM vinculo.
--   Extrato sem Sistema   = OFX reconciliavel SEM vinculo.
--   Desconsiderados       = OFX status='ignorado' + LV2 vinculado a ele
--                           (fora do pool, do veredito e dos blocos de problema).
--   Agrupamentos          = candidato valor/soma (1 OFX = 2 LV2); OVERLAY/sugestao,
--                           NAO remove item dos blocos de problema, NAO vira correto.
--
-- PARAMETROS (decisao de produto):
--   - data_divergente: |data_movimento - data_pagamento| > 3 dias corridos
--     (ate 3 dias o vinculo pode ser valido se conta/sinal/valor ok).
--   - LV2 vinculado a OFX desconsiderado e puxado para Desconsiderados (resolve
--     o vazamento do R$256.239,48); nao gera item em Sistema/Extrato sem.
--   - saldo OFX = saldo_apos bruto da 1a/ultima linha do mes; NULL -> "nao
--     disponivel" (parser atual grava NULL; fora do escopo H1 corrigir).
--   - Sistema sem saldo de proposito; NUNCA usar financeiro_saldos_bancarios_v2.
--
-- Exclusividade: cada OFX/LV2 cai em UM bloco (Agrupamentos e overlay, nao bloco).
-- VALIDAR READ-ONLY (Santa Rita / Bradesco / 2026-04) ANTES DE VERSIONAR.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_conciliacao_soberana(
  p_cliente uuid,
  p_conta   uuid,
  p_mes     text          -- 'YYYY-MM'
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
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
),
ofx      AS (SELECT * FROM ofx_base WHERE status IS DISTINCT FROM 'ignorado'),
desc_ofx AS (SELECT * FROM ofx_base WHERE status = 'ignorado'),

lv2 AS (
  SELECT l.id, l.data_pagamento AS dt,
         (CASE WHEN l.sinal='1' THEN l.valor ELSE -l.valor END) AS v,
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
      OR (l.sinal='-1' AND l.conta_bancaria_id = pp.conta))
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
  'versao', 'soberana-01.8-links-ativos',
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
      'saidas',      (SELECT COALESCE(SUM(mag),0) FROM lv2 WHERE sinal='-1')
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
      ) ORDER BY motivo, ofx_v) FROM div), '[]'::jsonb),

    -- Sistema sem Extrato (LV2 sem vinculo) -- com origem_lancamento
    'sistema_sem_extrato', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'lancamento_id', id, 'data', dt, 'valor_assinado', v, 'sinal', sinal,
        'descricao', descricao, 'origem_lancamento', origem_lancamento,
        'status_transacao', status_transacao
      ) ORDER BY dt, v) FROM sis_sem), '[]'::jsonb),

    -- Extrato sem Sistema (OFX sem vinculo)
    'extrato_sem_sistema', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'extrato_id', id, 'data', dt, 'valor', v, 'tipo', tp, 'descricao', descricao
      ) ORDER BY dt, v) FROM ext_sem), '[]'::jsonb),

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
      )) FROM agr), '[]'::jsonb)
  )
) ;
$$;

-- Smoke test (read-only) -- Santa Rita Agro / Bradesco / 2026-04:
-- SELECT fn_conciliacao_soberana('<cliente_uuid>'::uuid, '<conta_uuid>'::uuid, '2026-04');
