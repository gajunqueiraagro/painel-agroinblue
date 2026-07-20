-- PR-OC-LIQ-02 parte 1 — leitura soberana de saldo/estado de liquidação (ADR-2026-16 §2.4).
--   Duas views tenant-safe (ADR-2026-14: security_invoker=on + revoke anon/PUBLIC; a view herda
--   a RLS das tabelas-base, todas com RLS ativa). Estados são SEMPRE derivados em leitura —
--   nunca coluna editável. "Válida" = estornado=false; estorno fica fora de todas as somas.
--   Nenhuma leitura de caixa/disponibilidade é produzida (§2.4): permuta reduz saldo, não compõe caixa.
--   Igualdade numérica exata para "quitado" — nenhuma tolerância.
-- NÃO aplicar por este PR (aplicação é etapa separada sob autorização).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── Saldo por TÍTULO vinculado à operação (via partes.financeiro_lancamento_id, vínculo E3) ──
--   Inclusão: título não cancelado sempre aparece; título cancelado só aparece se tiver
--   liquidação válida aplicada (e então com estado excedente/divergente).
CREATE VIEW public.vw_oc_titulos_liquidacao WITH (security_invoker = true) AS
WITH titulos AS (
  SELECT DISTINCT pt.cliente_id, pt.operacao_id, pt.financeiro_lancamento_id AS titulo_id
    FROM public.zoo_operacao_partes pt
   WHERE pt.financeiro_lancamento_id IS NOT NULL
),
liq AS (
  SELECT l.operacao_id, l.financeiro_lancamento_id AS titulo_id, sum(l.valor) AS total_liquidado_valido
    FROM public.zoo_operacao_liquidacoes l
   WHERE l.estornado = false AND l.financeiro_lancamento_id IS NOT NULL
   GROUP BY l.operacao_id, l.financeiro_lancamento_id
)
SELECT
  t.cliente_id,
  t.operacao_id,
  t.titulo_id,
  f.valor                                        AS valor_titulo,
  f.cancelado                                    AS titulo_cancelado,
  COALESCE(liq.total_liquidado_valido, 0)        AS total_liquidado_valido,
  f.valor - COALESCE(liq.total_liquidado_valido, 0) AS saldo_titulo,
  CASE
    WHEN f.cancelado IS TRUE                              THEN 'excedente_divergente'
    WHEN COALESCE(liq.total_liquidado_valido,0) = 0       THEN 'nao_liquidado'
    WHEN COALESCE(liq.total_liquidado_valido,0) < f.valor THEN 'parcial'
    WHEN COALESCE(liq.total_liquidado_valido,0) = f.valor THEN 'quitado'
    ELSE 'excedente_divergente'
  END                                            AS estado
FROM titulos t
JOIN public.financeiro_lancamentos_v2 f ON f.id = t.titulo_id
LEFT JOIN liq ON liq.operacao_id = t.operacao_id AND liq.titulo_id = t.titulo_id
WHERE f.cancelado IS NOT TRUE
   OR COALESCE(liq.total_liquidado_valido,0) > 0;

COMMENT ON VIEW public.vw_oc_titulos_liquidacao IS
  'ADR-2026-16 §2.4: saldo por título (financeiro_lancamentos_v2 vinculado à operação via zoo_operacao_partes). saldo_titulo = valor_titulo - Σ liquidações válidas (estornado=false) aplicadas ao título. Estado derivado (nao_liquidado|parcial|quitado|excedente_divergente); igualdade exata p/ quitado. Título cancelado só aparece se tiver liquidação válida (estado excedente_divergente). Tenant-safe (ADR-2026-14, security_invoker). Sem leitura de caixa.';

-- ── Agregado por OPERAÇÃO: todas as liquidações válidas (vinculadas ou não) ──
CREATE VIEW public.vw_oc_operacao_liquidacao WITH (security_invoker = true) AS
WITH liq AS (
  SELECT l.operacao_id, sum(l.valor) AS total_liquidado_valido
    FROM public.zoo_operacao_liquidacoes l
   WHERE l.estornado = false
   GROUP BY l.operacao_id
)
SELECT
  o.cliente_id,
  o.id                                           AS operacao_id,
  o.valor_total,
  COALESCE(liq.total_liquidado_valido, 0)        AS total_liquidado_valido,
  COALESCE(o.valor_total,0) - COALESCE(liq.total_liquidado_valido, 0) AS saldo_operacao,
  CASE
    WHEN COALESCE(liq.total_liquidado_valido,0) = 0                            THEN 'nao_liquidada'
    WHEN COALESCE(liq.total_liquidado_valido,0) < COALESCE(o.valor_total,0)    THEN 'parcial'
    WHEN COALESCE(liq.total_liquidado_valido,0) = COALESCE(o.valor_total,0)    THEN 'quitada'
    ELSE 'excedente'
  END                                            AS estado_liquidacao
FROM public.zoo_operacoes_comerciais o
LEFT JOIN liq ON liq.operacao_id = o.id;

COMMENT ON VIEW public.vw_oc_operacao_liquidacao IS
  'ADR-2026-16 §2.4: saldo comercial da operação (eixo 4 da Situação). saldo_operacao = valor_total - Σ TODAS as liquidações válidas (estornado=false), vinculadas ou não. Estado agregado derivado (nao_liquidada|parcial|quitada|excedente); igualdade exata p/ quitada. Tenant-safe (ADR-2026-14, security_invoker). Sem leitura de caixa/disponibilidade.';

-- ── Grants tenant-safe (ADR-2026-14): SELECT a authenticated; zero anon/PUBLIC ──
REVOKE ALL ON TABLE public.vw_oc_titulos_liquidacao   FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.vw_oc_operacao_liquidacao  FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.vw_oc_titulos_liquidacao  TO authenticated;
GRANT SELECT ON TABLE public.vw_oc_operacao_liquidacao TO authenticated;
