-- ============================================================================
-- SOBERANA-01  |  fn_conciliacao_soberana(p_cliente, p_conta, p_mes)
-- ----------------------------------------------------------------------------
-- Read-model READ-ONLY de auditoria de conciliacao OFX x LV2.
-- NAO tem UI, NAO altera dado, NAO toca conciliacao_bancaria_itens, NAO toca
-- Mesa/staging/promocao/matchEngine. So LE e retorna JSON com os buckets.
--
-- Verdade soberana:
--   OFX (extrato_bancario_v2) = o que aconteceu no banco.
--   LV2 (financeiro_lancamentos_v2) = o que foi lancado.
--   conciliacao_bancaria_itens = EVIDENCIA/rastro, nunca verdade.
--
-- Criterios do motor (inviolaveis):
--   * per-conta (universo OFX e LV2 sao da MESMA conta)
--   * sign-aware (credito/debito vs sinal '1'/'-1')
--   * ignora cancelado=true
--   * ignora sem_movimentacao_caixa=true
--   * cenario='realizado' (COALESCE NULL->realizado)
--   * vinculo so e valido se: mesma conta + nao cancelado + conta nao nula
--                              + sinal coerente + valor igual
--
-- VEREDITO ESTRITO (ajuste Gabriel 22/06): conciliado=true SOMENTE quando os
-- SEIS contadores forem zero:
--   ofx_sem_lancamento=0 AND lancamento_sem_ofx=0 AND divergencia_valor=0
--   AND divergencia_data=0 AND agrupamento_candidato=0 AND vinculo_invalido=0
-- Agrupamento candidato e explicacao provavel, NAO confirmada -> bloqueia.
-- Vinculo invalido contamina o rastro -> bloqueia.
--
-- Validado ao vivo contra BB / NJ / 2026-05 (reproduz a auditoria F0):
--   OFX 263 | entradas 811.666,27 | saidas 893.718,31
--   LV2 251 | entradas 0,00       | saidas 892.772,84
--   ofx_sem_lancamento 13 (12 cred 811.666,27 + 1 deb 945,47) = 812.611,74
--   lancamento_sem_ofx 0
--   agrupamento_candidato 1  (OFX 20.888,15 = 6.266,45 + 14.621,70)
--   divergencia_valor 0 | divergencia_data 0
--   vinculo_invalido 18 (8 cancelado + 7 conta_null + 3 cross_conta)
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

-- universo LV2 (signed = sinal * valor), criterios estritos
lv2 AS (
  SELECT l.id, l.data_pagamento AS dt,
         (CASE WHEN l.sinal = '1' THEN l.valor ELSE -l.valor END) AS v,
         l.valor AS mag, l.sinal,
         COALESCE(l.descricao, l.historico) AS descricao
  FROM financeiro_lancamentos_v2 l JOIN pp ON true
  WHERE l.cliente_id = pp.cli
    AND l.conta_bancaria_id = pp.conta
    AND l.ano_mes = pp.mes
    AND l.cancelado = false
    AND l.sem_movimentacao_caixa = false
    AND COALESCE(l.cenario, 'realizado') = 'realizado'
),

-- reconciliacao independente por valor-com-sinal (multiset)
ofx_r AS (SELECT o.*, ROW_NUMBER() OVER (PARTITION BY o.v ORDER BY o.dt, o.id) rn FROM ofx o),
lv2_r AS (SELECT l.*, ROW_NUMBER() OVER (PARTITION BY l.v ORDER BY l.dt, l.id) rn FROM lv2 l),
grp AS (
  SELECT COALESCE(o.v, s.v) v, COALESCE(o.n,0) on_, COALESCE(s.n,0) sn
  FROM (SELECT v, COUNT(*) n FROM ofx GROUP BY v) o
  FULL JOIN (SELECT v, COUNT(*) n FROM lv2 GROUP BY v) s ON o.v = s.v
),

-- pares casados exatos (valor+sinal); sobra de cada lado vira candidato a excecao
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

-- buckets finais (apos remover o que o agrupamento explicou)
ofx_sem  AS (SELECT * FROM ofx_left WHERE id NOT IN (SELECT ofx_id FROM agr)),
lanc_sem AS (SELECT * FROM lv2_left WHERE id NOT IN (SELECT id FROM agr_lanc)),

-- divergencia de data: par casado em valor/sinal mas com data diferente
div_data AS (
  SELECT m.ofx_id, m.ofx_dt, m.lanc_id, m.lanc_dt,
         ABS(m.ofx_dt - m.lanc_dt) AS dias
  FROM matched m WHERE m.ofx_dt <> m.lanc_dt
),
-- divergencia de valor: sobra OFX x sobra LV2, mesma data e mesmo sinal,
-- valor proximo (<= R$1,00) mas nao igual  [near-miss; tolerancia v1]
div_valor AS (
  SELECT o.id ofx_id, o.v ofx_v, l.id lanc_id, l.v lanc_v, (o.v - l.v) delta, o.dt
  FROM ofx_sem o
  JOIN lanc_sem l ON l.dt = o.dt AND l.v <> o.v
                 AND ABS(o.v - l.v) <= 1.00 AND SIGN(o.v) = SIGN(l.v)
),

-- AUDITORIA DE EVIDENCIA: classifica cada link existente (nunca como verdade)
links AS (
  SELECT cbi.id AS link_id, cbi.extrato_id, cbi.lancamento_id,
         e.v AS ofx_v, e.tp AS ofx_tp,
         l.conta_bancaria_id AS lanc_conta, l.sinal AS lanc_sinal,
         l.cancelado AS lanc_cancelado, l.valor AS lanc_valor,
         CASE
           WHEN l.id IS NULL                       THEN 'sem_lancamento'
           WHEN l.cancelado                        THEN 'cancelado'
           WHEN l.conta_bancaria_id IS NULL        THEN 'conta_null'
           WHEN l.conta_bancaria_id <> pp.conta    THEN 'cross_conta'
           WHEN (e.tp='credito' AND l.sinal='-1')
             OR (e.tp='debito'  AND l.sinal='1')   THEN 'sinal_cruzado'
           WHEN ABS(e.v) <> l.valor                THEN 'valor_divergente'
           ELSE 'valido'
         END AS motivo
  FROM conciliacao_bancaria_itens cbi
  JOIN ofx e ON e.id = cbi.extrato_id              -- so links do nosso universo OFX
  JOIN pp ON true
  LEFT JOIN financeiro_lancamentos_v2 l ON l.id = cbi.lancamento_id
),

-- contadores dos buckets (base do veredito)
cnt AS (
  SELECT
    (SELECT COUNT(*) FROM ofx_sem)                       AS ofx_sem_n,
    (SELECT COUNT(*) FROM lanc_sem)                      AS lanc_sem_n,
    (SELECT COUNT(*) FROM div_valor)                     AS div_valor_n,
    (SELECT COUNT(*) FROM div_data)                      AS div_data_n,
    (SELECT COUNT(*) FROM agr)                           AS agr_n,
    (SELECT COUNT(*) FROM links WHERE motivo <> 'valido')AS vinc_inv_n
),

-- lista de bloqueios (so entra o que tem count > 0), ordem de severidade
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

  -- veredito soberano (fonte para a UI futura)
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

  -- compat: espelha veredito.conciliado (UI futura deve usar 'veredito')
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
        'lancamento_id', lancamento_id, 'lanc_conta', lanc_conta,
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

-- Smoke test (rodar manualmente, read-only):
-- SELECT fn_conciliacao_soberana(
--   'f2d67cd4-24d0-456f-a079-a3281dcce7fd'::uuid,
--   '3b9afa7a-0af6-4bce-8ec9-03b91484dfd8'::uuid,
--   '2026-05');
