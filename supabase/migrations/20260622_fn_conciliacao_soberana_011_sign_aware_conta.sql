-- ============================================================================
-- SOBERANA-01.1  |  fn_conciliacao_soberana(p_cliente, p_conta, p_mes)
-- CORRECAO DE CHAVE SIGN-AWARE (substitui v1.0 / migration 20260622_fn_conciliacao_soberana_01)
-- ----------------------------------------------------------------------------
-- Bug corrigido: v1.0 usava conta_bancaria_id para TODO lancamento. Para ENTRADA
-- a conta correta e conta_destino_id (dinheiro que CHEGA); conta_bancaria_id e a
-- origem (NULL numa entrada externa). A tela de Conciliacao Bancaria ja usa essa
-- regra (conciliacaoCalc.ts L88/204-210). v1.0 classificava ~R$7M de entradas
-- legitimas como "conta NULL/orfao".
--
-- REGRA DE PERTENCIMENTO A CONTA (sign-aware), identica a tela:
--   ENTRADA (sinal='1'): pertence se conta_destino_id = p_conta OR conta_bancaria_id = p_conta
--   SAIDA   (sinal='-1'): pertence se conta_bancaria_id = p_conta
--
-- Demais regras inalteradas (read-only, sem DML, sem UI, evidencia = rastro):
--   per-conta, sign-aware, ignora cancelado, ignora sem_movimentacao_caixa=true,
--   cenario='realizado'. Veredito estrito: conciliado=true so com os 6 contadores zero.
--
-- Validado ao vivo contra BB / NJ / 2026-05 (read-only) antes de versionar:
--   OFX 263 | entradas 811.666,27 | saidas 893.718,31
--   LV2 258 | entradas 11.666,27  | saidas 892.772,84   (era 251 / 0 / 892.772,84)
--   ofx_sem_lancamento 6    (era 13)
--   lancamento_sem_ofx 0
--   agrupamento_candidato 1 (OFX 20.888,15 = 6.266,45 + 14.621,70)
--   divergencia_valor 0 | divergencia_data 0
--   vinculo_invalido 11     (era 18): 8 cancelado + 3 sinal_cruzado
--   links validos 252       (era 245; os 7 conta-destino agora validos)
--   veredito.conciliado = false
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_conciliacao_soberana(
  p_cliente uuid,
  p_conta   uuid,
  p_mes     text          -- formato 'YYYY-MM'
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH pp AS (
  SELECT
    p_cliente AS cli,
    p_conta   AS conta,
    p_mes     AS mes,
    TO_DATE(p_mes || '-01', 'YYYY-MM-DD') AS d1,
    (TO_DATE(p_mes || '-01', 'YYYY-MM-DD') + INTERVAL '1 month' - INTERVAL '1 day')::date AS d2
),

-- universo OFX (valor ja vem com sinal: credito +, debito -)
ofx AS (
  SELECT e.id, e.data_movimento AS dt, e.valor AS v,
         e.tipo_movimento AS tp, e.descricao, e.status
  FROM extrato_bancario_v2 e JOIN pp ON true
  WHERE e.cliente_id = pp.cli
    AND e.conta_bancaria_id = pp.conta
    AND e.data_movimento BETWEEN pp.d1 AND pp.d2
),

-- universo LV2 (signed = sinal * valor) -- CHAVE SIGN-AWARE:
--   entrada (sinal='1'): conta_destino_id OU conta_bancaria_id = p_conta
--   saida   (sinal='-1'): conta_bancaria_id = p_conta
lv2 AS (
  SELECT l.id, l.data_pagamento AS dt,
         (CASE WHEN l.sinal = '1' THEN l.valor ELSE -l.valor END) AS v,
         l.valor AS mag, l.sinal,
         COALESCE(l.descricao, l.historico) AS descricao
  FROM financeiro_lancamentos_v2 l JOIN pp ON true
  WHERE l.cliente_id = pp.cli
    AND l.ano_mes = pp.mes
    AND l.cancelado = false
    AND l.sem_movimentacao_caixa = false
    AND COALESCE(l.cenario, 'realizado') = 'realizado'
    AND (
      (l.sinal = '1'  AND (l.conta_destino_id = pp.conta OR l.conta_bancaria_id = pp.conta))
      OR
      (l.sinal = '-1' AND l.conta_bancaria_id = pp.conta)
    )
),

-- reconciliacao independente por valor-com-sinal (multiset)
ofx_r AS (SELECT o.*, ROW_NUMBER() OVER (PARTITION BY o.v ORDER BY o.dt, o.id) rn FROM ofx o),
lv2_r AS (SELECT l.*, ROW_NUMBER() OVER (PARTITION BY l.v ORDER BY l.dt, l.id) rn FROM lv2 l),
grp AS (
  SELECT COALESCE(o.v, s.v) v, COALESCE(o.n,0) on_, COALESCE(s.n,0) sn
  FROM (SELECT v, COUNT(*) n FROM ofx GROUP BY v) o
  FULL JOIN (SELECT v, COUNT(*) n FROM lv2 GROUP BY v) s ON o.v = s.v
),

matched AS (
  SELECT o.id ofx_id, o.dt ofx_dt, o.v, l.id lanc_id, l.dt lanc_dt
  FROM ofx_r o
  JOIN lv2_r l ON l.v = o.v AND l.rn = o.rn
  JOIN grp g   ON g.v = o.v
  WHERE o.rn <= LEAST(g.on_, g.sn)
),
ofx_left AS (SELECT o.* FROM ofx_r o JOIN grp g ON g.v = o.v WHERE o.rn > LEAST(g.on_, g.sn)),
lv2_left AS (SELECT l.* FROM lv2_r l JOIN grp g ON g.v = l.v WHERE l.rn > LEAST(g.on_, g.sn)),

-- PASSO 4: agrupamento pairwise (1 OFX = 2 lancamentos de mesmo sinal)  [v1: par]
agr AS (
  SELECT o.id ofx_id, o.v ofx_v, a.id l1, a.v v1, b.id l2, b.v v2
  FROM ofx_left o
  JOIN lv2_left a ON true
  JOIN lv2_left b ON b.id > a.id AND b.v = o.v - a.v
),
agr_lanc AS (SELECT l1 AS id FROM agr UNION SELECT l2 FROM agr),

ofx_sem  AS (SELECT * FROM ofx_left WHERE id NOT IN (SELECT ofx_id FROM agr)),
lanc_sem AS (SELECT * FROM lv2_left WHERE id NOT IN (SELECT id FROM agr_lanc)),

div_data AS (
  SELECT m.ofx_id, m.ofx_dt, m.lanc_id, m.lanc_dt,
         ABS(m.ofx_dt - m.lanc_dt) AS dias
  FROM matched m WHERE m.ofx_dt <> m.lanc_dt
),
div_valor AS (
  SELECT o.id ofx_id, o.v ofx_v, l.id lanc_id, l.v lanc_v, (o.v - l.v) delta, o.dt
  FROM ofx_sem o
  JOIN lanc_sem l ON l.dt = o.dt AND l.v <> o.v
                 AND ABS(o.v - l.v) <= 1.00 AND SIGN(o.v) = SIGN(l.v)
),

-- AUDITORIA DE EVIDENCIA (rastro, nunca verdade) -- validade SIGN-AWARE:
--   credito valido: sinal='1' E (conta_destino_id = p_conta OU conta_bancaria_id = p_conta)
--   debito  valido: sinal='-1' E conta_bancaria_id = p_conta
links AS (
  SELECT cbi.id AS link_id, cbi.extrato_id, cbi.lancamento_id,
         e.v AS ofx_v, e.tp AS ofx_tp,
         l.conta_bancaria_id AS lanc_conta, l.conta_destino_id AS lanc_destino,
         l.sinal AS lanc_sinal, l.cancelado AS lanc_cancelado, l.valor AS lanc_valor,
         CASE
           WHEN l.id IS NULL THEN 'sem_lancamento'
           WHEN l.cancelado THEN 'cancelado'
           WHEN (e.tp='credito' AND l.sinal <> '1')
             OR (e.tp='debito'  AND l.sinal <> '-1') THEN 'sinal_cruzado'
           WHEN e.tp='credito'
                AND COALESCE(l.conta_destino_id = pp.conta, false) = false
                AND COALESCE(l.conta_bancaria_id = pp.conta, false) = false THEN 'conta_divergente'
           WHEN e.tp='debito'
                AND l.conta_bancaria_id IS DISTINCT FROM pp.conta THEN 'conta_divergente'
           WHEN ABS(e.v) <> l.valor THEN 'valor_divergente'
           ELSE 'valido'
         END AS motivo
  FROM conciliacao_bancaria_itens cbi
  JOIN ofx e ON e.id = cbi.extrato_id
  JOIN pp ON true
  LEFT JOIN financeiro_lancamentos_v2 l ON l.id = cbi.lancamento_id
),

cnt AS (
  SELECT
    (SELECT COUNT(*) FROM ofx_sem)                        AS ofx_sem_n,
    (SELECT COUNT(*) FROM lanc_sem)                       AS lanc_sem_n,
    (SELECT COUNT(*) FROM div_valor)                      AS div_valor_n,
    (SELECT COUNT(*) FROM div_data)                       AS div_data_n,
    (SELECT COUNT(*) FROM agr)                            AS agr_n,
    (SELECT COUNT(*) FROM links WHERE motivo <> 'valido') AS vinc_inv_n
),

bloqueios AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('tipo', tipo, 'count', n) ORDER BY ord), '[]'::jsonb) AS arr
  FROM (
    SELECT 'ofx_sem_lancamento'    tipo, ofx_sem_n  n, 1 ord FROM cnt WHERE ofx_sem_n  > 0
    UNION ALL SELECT 'lancamento_sem_ofx',   lanc_sem_n,  2 FROM cnt WHERE lanc_sem_n  > 0
    UNION ALL SELECT 'vinculo_invalido',     vinc_inv_n,  3 FROM cnt WHERE vinc_inv_n  > 0
    UNION ALL SELECT 'agrupamento_candidato',agr_n,       4 FROM cnt WHERE agr_n       > 0
    UNION ALL SELECT 'divergencia_valor',    div_valor_n, 5 FROM cnt WHERE div_valor_n > 0
    UNION ALL SELECT 'divergencia_data',     div_data_n,  6 FROM cnt WHERE div_data_n  > 0
  ) z
)

SELECT jsonb_build_object(
  'gerado_em', now(),
  'versao', 'soberana-01.1-sign-aware',
  'escopo', jsonb_build_object('cliente', p_cliente, 'conta', p_conta, 'mes', p_mes),

  'resumo', jsonb_build_object(
    'ofx', jsonb_build_object(
      'movimentos', (SELECT COUNT(*) FROM ofx),
      'entradas',   (SELECT COALESCE(SUM(v),0)  FROM ofx WHERE tp='credito'),
      'saidas',     (SELECT COALESCE(SUM(-v),0) FROM ofx WHERE tp='debito')
    ),
    'lv2', jsonb_build_object(
      'lancamentos', (SELECT COUNT(*) FROM lv2),
      'entradas',    (SELECT COALESCE(SUM(mag),0) FROM lv2 WHERE sinal='1'),
      'saidas',      (SELECT COALESCE(SUM(mag),0) FROM lv2 WHERE sinal='-1')
    ),
    'evidencia_links', jsonb_build_object(
      'validos',   (SELECT COUNT(*) FROM links WHERE motivo='valido'),
      'invalidos', (SELECT vinc_inv_n FROM cnt)
    )
  ),

  'veredito', jsonb_build_object(
    'conciliado', (
      (SELECT ofx_sem_n FROM cnt)  = 0 AND
      (SELECT lanc_sem_n FROM cnt) = 0 AND
      (SELECT div_valor_n FROM cnt)= 0 AND
      (SELECT div_data_n FROM cnt) = 0 AND
      (SELECT agr_n FROM cnt)      = 0 AND
      (SELECT vinc_inv_n FROM cnt) = 0
    ),
    'bloqueios', (SELECT arr FROM bloqueios)
  ),

  'conciliado_soberano', (
    (SELECT ofx_sem_n FROM cnt)  = 0 AND
    (SELECT lanc_sem_n FROM cnt) = 0 AND
    (SELECT div_valor_n FROM cnt)= 0 AND
    (SELECT div_data_n FROM cnt) = 0 AND
    (SELECT agr_n FROM cnt)      = 0 AND
    (SELECT vinc_inv_n FROM cnt) = 0
  ),

  'buckets', jsonb_build_object(
    'ofx_sem_lancamento', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'extrato_id', id, 'data', dt, 'valor', v, 'tipo', tp, 'descricao', descricao
      ) ORDER BY dt, v) FROM ofx_sem), '[]'::jsonb),

    'lancamento_sem_ofx', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'lancamento_id', id, 'data', dt, 'valor_assinado', v, 'sinal', sinal, 'descricao', descricao
      ) ORDER BY dt, v) FROM lanc_sem), '[]'::jsonb),

    'vinculo_invalido', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'link_id', link_id, 'motivo', motivo,
        'extrato_id', extrato_id, 'ofx_valor', ofx_v, 'ofx_tipo', ofx_tp,
        'lancamento_id', lancamento_id, 'lanc_conta', lanc_conta, 'lanc_destino', lanc_destino,
        'lanc_sinal', lanc_sinal, 'lanc_cancelado', lanc_cancelado, 'lanc_valor', lanc_valor
      ) ORDER BY motivo, ofx_v) FROM links WHERE motivo <> 'valido'), '[]'::jsonb),

    'divergencia_valor', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'extrato_id', ofx_id, 'ofx_valor', ofx_v,
        'lancamento_id', lanc_id, 'lanc_valor', lanc_v, 'delta', delta, 'data', dt
      )) FROM div_valor), '[]'::jsonb),

    'divergencia_data', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'extrato_id', ofx_id, 'ofx_data', ofx_dt,
        'lancamento_id', lanc_id, 'lanc_data', lanc_dt, 'dias', dias
      )) FROM div_data), '[]'::jsonb),

    'agrupamento_candidato', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'extrato_id', ofx_id, 'ofx_valor', ofx_v,
        'lancamentos', jsonb_build_array(
          jsonb_build_object('lancamento_id', l1, 'valor_assinado', v1),
          jsonb_build_object('lancamento_id', l2, 'valor_assinado', v2)
        )
      )) FROM agr), '[]'::jsonb)
  )
) ;
$$;

-- Smoke test (read-only):
-- SELECT fn_conciliacao_soberana(
--   'f2d67cd4-24d0-456f-a079-a3281dcce7fd'::uuid,
--   '3b9afa7a-0af6-4bce-8ec9-03b91484dfd8'::uuid,
--   '2026-05');
