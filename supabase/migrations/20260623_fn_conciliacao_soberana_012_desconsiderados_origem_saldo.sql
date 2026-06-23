-- ============================================================================
-- SOBERANA-01.2  |  fn_conciliacao_soberana(p_cliente, p_conta, p_mes)
-- EVOLUI 01.1 (sign-aware) para alimentar a tela P0-H1 Auditoria Bancaria Soberana.
-- Substitui 20260622_fn_conciliacao_soberana_011_sign_aware_conta.sql.
-- ----------------------------------------------------------------------------
-- Read-only / diagnostico. Sem DML, sem UI, sem tocar conciliacao_bancaria_itens,
-- Mesa, staging, promocao ou matchEngine. So LE e retorna JSON.
--
-- MUDANCAS vs 01.1 (regra de pertencimento sign-aware INALTERADA):
--   1. status='ignorado' SAI do universo de reconciliacao (CTE ofx). NAO entra em
--      veredito, ofx_sem_lancamento, divergencia_* nem vinculo_invalido.
--      (01.1 incluia ignorados -> poluiam "Extrato sem Sistema" e o veredito.)
--   2. Novo bucket buckets.desconsiderados = OFX status='ignorado' (decisao
--      consciente do operador; bloco proprio na UI, fora do fechamento).
--   3. lancamento_sem_ofx ganha 'origem' (origem_lancamento) -> rotulo legivel
--      do Bloco "Sistema sem Extrato". So rotulo; nao envolve Mesa/Excel/staging.
--   4. resumo.ofx ganha saldo_inicial/saldo_final = saldo_apos da 1a/ultima linha
--      do mes (saldo BRUTO do banco). NULL quando o parser nao trouxe saldo
--      (UI exibe "nao disponivel"). NUNCA usar saldo migrado
--      (financeiro_saldos_bancarios_v2) -- isso recairia na Conciliacao antiga.
--      Lado Sistema: saldo_inicial/final ausentes de proposito (LV2 nao tem saldo
--      corrente soberano) -> UI mostra "—".
--
-- Demais regras 01.1 inalteradas: per-conta, sign-aware, ignora cancelado, ignora
-- sem_movimentacao_caixa=true, cenario='realizado'. Veredito estrito: conciliado=true
-- so com os 6 contadores zero (desconsiderados NAO contam).
--
-- VALIDADO READ-ONLY (corpo inline, sem CREATE) contra Santa Rita Agro / Bradesco / 2026-04:
--   1. ignorado fora de ofx_sem_lancamento: ignorado_sem_vinculo = 0
--   2. buckets.desconsiderados = 1 movimento, -256.239,48
--   3. desconsiderados fora do veredito: universo reconciliavel = 54 de 55 bruto
--   4. lancamento_sem_ofx = 15 com origem (14 mesa_excel + 1 movimentacao_rebanho)
--   5. saldo_apos NULL em 55/55 -> saldo_inicial/saldo_final = null ("nao disponivel")
--   6. sem sobreposicao: 55 = 54 reconciliaveis + 1 desconsiderado
--   7. Sistema sem saldo; zero referencia a financeiro_saldos_bancarios_v2
--   Decomposicao: OFX 55 -> 1 desconsiderado + 54 reconciliaveis (Extrato sem Sistema = 0);
--                 Sistema 15 sem OFX.
--
-- LIMITACAO CONHECIDA (fora do escopo H1): o parser OFX atual grava saldo_apos NULL,
-- entao o Bloco 1 (saldo inicial/final do Extrato) fica "nao disponivel". Corrigir o
-- parser e outra frente; NUNCA suprir com saldo migrado.
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

-- universo OFX BRUTO do mes (inclui desconsiderados; base do saldo do banco)
ofx_base AS (
  SELECT e.id, e.data_movimento AS dt, e.valor AS v,
         e.tipo_movimento AS tp, e.descricao, e.status, e.saldo_apos
  FROM extrato_bancario_v2 e JOIN pp ON true
  WHERE e.cliente_id = pp.cli
    AND e.conta_bancaria_id = pp.conta
    AND e.data_movimento BETWEEN pp.d1 AND pp.d2
),

-- universo de RECONCILIACAO: exclui desconsiderados (status='ignorado').
-- IS DISTINCT FROM preserva linhas com status NULL (nao desconsideradas).
ofx AS (
  SELECT id, dt, v, tp, descricao, status
  FROM ofx_base
  WHERE status IS DISTINCT FROM 'ignorado'
),

-- desconsiderados: bloco proprio; fora de veredito/divergencia/fechamento.
desconsid AS (
  SELECT id, dt, v, tp, descricao
  FROM ofx_base
  WHERE status = 'ignorado'
),

-- universo LV2 (signed = sinal * valor) -- CHAVE SIGN-AWARE + origem p/ rotulo:
--   entrada (sinal='1'): conta_destino_id OU conta_bancaria_id = p_conta
--   saida   (sinal='-1'): conta_bancaria_id = p_conta
lv2 AS (
  SELECT l.id, l.data_pagamento AS dt,
         (CASE WHEN l.sinal = '1' THEN l.valor ELSE -l.valor END) AS v,
         l.valor AS mag, l.sinal,
         COALESCE(l.descricao, l.historico) AS descricao,
         l.origem_lancamento AS origem
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

-- agrupamento pairwise (1 OFX = 2 lancamentos de mesmo sinal)
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

-- AUDITORIA DE EVIDENCIA (rastro, nunca verdade) -- validade SIGN-AWARE.
-- JOIN ofx (ja sem ignorados) => links de desconsiderado nao entram em vinculo_invalido.
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
  'versao', 'soberana-01.2-desconsiderados-origem-saldo',
  'escopo', jsonb_build_object('cliente', p_cliente, 'conta', p_conta, 'mes', p_mes),

  'resumo', jsonb_build_object(
    'ofx', jsonb_build_object(
      'movimentos', (SELECT COUNT(*) FROM ofx),
      'entradas',   (SELECT COALESCE(SUM(v),0)  FROM ofx WHERE tp='credito'),
      'saidas',     (SELECT COALESCE(SUM(-v),0) FROM ofx WHERE tp='debito'),
      -- saldo BRUTO do banco (1a/ultima linha do mes; saldo_apos). NULL => UI "nao disponivel".
      -- NUNCA substituir por saldo migrado.
      'saldo_inicial', (SELECT saldo_apos FROM ofx_base ORDER BY dt ASC,  id ASC  LIMIT 1),
      'saldo_final',   (SELECT saldo_apos FROM ofx_base ORDER BY dt DESC, id DESC LIMIT 1)
    ),
    'lv2', jsonb_build_object(
      'lancamentos', (SELECT COUNT(*) FROM lv2),
      'entradas',    (SELECT COALESCE(SUM(mag),0) FROM lv2 WHERE sinal='1'),
      'saidas',      (SELECT COALESCE(SUM(mag),0) FROM lv2 WHERE sinal='-1')
      -- saldo_inicial/final do Sistema ausentes de proposito (LV2 sem saldo corrente soberano).
    ),
    'evidencia_links', jsonb_build_object(
      'validos',   (SELECT COUNT(*) FROM links WHERE motivo='valido'),
      'invalidos', (SELECT vinc_inv_n FROM cnt)
    ),
    'desconsiderados', jsonb_build_object(
      'movimentos', (SELECT COUNT(*) FROM desconsid),
      'entradas',   (SELECT COALESCE(SUM(v),0)  FROM desconsid WHERE tp='credito'),
      'saidas',     (SELECT COALESCE(SUM(-v),0) FROM desconsid WHERE tp='debito')
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
        'lancamento_id', id, 'data', dt, 'valor_assinado', v, 'sinal', sinal,
        'descricao', descricao, 'origem', origem
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
      )) FROM agr), '[]'::jsonb),

    'desconsiderados', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'extrato_id', id, 'data', dt, 'valor', v, 'tipo', tp, 'descricao', descricao
      ) ORDER BY dt, v) FROM desconsid), '[]'::jsonb)
  )
) ;
$$;

-- Smoke test (read-only) — Santa Rita Agro / Bradesco / 2026-04:
-- SELECT fn_conciliacao_soberana('<cliente_uuid>'::uuid, '<conta_uuid>'::uuid, '2026-04');
