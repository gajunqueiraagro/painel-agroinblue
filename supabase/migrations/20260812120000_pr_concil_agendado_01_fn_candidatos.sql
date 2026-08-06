-- 20260812120000_pr_concil_agendado_01_fn_candidatos.sql
-- PR-CONCIL-AGENDADO-01 — fn_ws_candidatos_financeiros: paridade de status
-- (realizado, programado, agendado) e âncora de data padronizada
-- COALESCE(data_pagamento, data_vencimento, data_competencia) na janela ±5d.
--
-- BASE: texto VIGENTE no banco proto (md5 prosrc 983e855773e180ab82f29b80ac1e48b4),
-- idêntico ao materializado em 20260630_pr_transferir_vinculo.sql (inclui a
-- chave 'extrato_vinculado_id'). NÃO partir do 20260629 — está desatualizado.
--
-- Mudanças vs. vigente (todas dentro do CTE cand / ORDER BY):
--   1. status IN ('realizado','programado')            → + 'agendado'
--   2. janela  (pagamento ±5d OR competencia ±5d)      → âncora COALESCE ±5d (PURA, sem OR)
--   3. l.cancelado = false                             → l.cancelado IS NOT TRUE
--   4. data_pgto_exata / dist_dias                      → mesmas expressões sobre a âncora
--      (dist_dias deixa de usar LEAST com competência — âncora única)
--   6. l.sem_movimentacao_caixa = false             → IS NOT TRUE (coluna anulável SEM default;
--      apenas TRUE deve excluir — recupera 136 lançamentos vivos com NULL)
--   4b. qual_data — semântica NOVA aprovada (a antiga tinha ramo 'competencia' morto):
--       'competencia' = pagamento E vencimento nulos (competência foi o último fallback);
--       'ambas'       = âncora prioritária + competência também na janela ±5d;
--       'pagamento'   = somente a âncora prioritária na janela.
--   5. ORDER BY ... s.data_pagamento ASC               → s.data_ancora ASC (âncora projetada no cand)
--   6. + COALESCE(l.cenario,'realizado') <> 'meta'      → paridade com os funis front (a fn vigente
--      NÃO filtrava cenário e podia oferecer lançamentos META como candidatos)
--
-- CONTRATO DE SAÍDA: chaves JSON inalteradas (data_ancora é coluna interna do
-- CTE, não projetada no jsonb). fn_ws_conciliacao NÃO é tocada.
-- Rollback: reaplicar o bloco vigente (ver relatório pre-commit do PR).

CREATE OR REPLACE FUNCTION public.fn_ws_candidatos_financeiros(p_extrato_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH ofx AS (
  SELECT e.id, e.cliente_id, e.valor, e.data_movimento AS data_mov,
         e.conta_bancaria_id AS conta,
         CASE WHEN e.tipo_movimento = 'credito' THEN 1 ELSE -1 END AS sinal_ofx
  FROM extrato_bancario_v2 e
  WHERE e.id = p_extrato_id
),
cand AS (
  SELECT
    l.id, l.valor, l.sinal, l.data_pagamento, l.data_competencia,
    COALESCE(l.data_pagamento, l.data_vencimento, l.data_competencia) AS data_ancora,
    l.tipo_operacao, l.status_transacao, l.origem_lancamento, l.descricao,
    l.conta_bancaria_id, l.conta_destino_id,
    o.conta AS ofx_conta, o.data_mov, o.sinal_ofx,
    CASE WHEN l.conta_destino_id = o.conta THEN 'destino'
         WHEN l.conta_bancaria_id = o.conta THEN 'origem' END AS lado_match,
    (COALESCE(l.data_pagamento, l.data_vencimento, l.data_competencia) = o.data_mov) AS data_pgto_exata,
    abs(COALESCE(COALESCE(l.data_pagamento, l.data_vencimento, l.data_competencia) - o.data_mov, 999)) AS dist_dias,
    CASE
      WHEN l.data_pagamento IS NULL
       AND l.data_vencimento IS NULL
        THEN 'competencia'
      WHEN l.data_competencia BETWEEN o.data_mov - 5 AND o.data_mov + 5
        THEN 'ambas'
      ELSE 'pagamento'
    END AS qual_data,
    EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c
            WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL
              AND c.extrato_id = p_extrato_id) AS cbi_neste,
    EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c
            WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL
              AND c.extrato_id <> p_extrato_id) AS cbi_outro,
    EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c
            WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL) AS cbi_qualquer
  FROM ofx o
  JOIN financeiro_lancamentos_v2 l
    ON l.cliente_id = o.cliente_id
   AND l.cancelado IS NOT TRUE
   AND l.sem_movimentacao_caixa IS NOT TRUE
   AND COALESCE(l.cenario, 'realizado') <> 'meta'
   AND l.status_transacao IN ('realizado','programado','agendado')
   AND abs(l.valor) = abs(o.valor)
   AND COALESCE(l.data_pagamento, l.data_vencimento, l.data_competencia) BETWEEN o.data_mov-5 AND o.data_mov+5
   AND (
        ( l.tipo_operacao = '3-Transferências' AND (
            (o.sinal_ofx > 0 AND l.conta_destino_id  = o.conta)
         OR (o.sinal_ofx < 0 AND l.conta_bancaria_id = o.conta)
        ))
        OR
        ( l.tipo_operacao <> '3-Transferências'
          AND l.conta_bancaria_id = o.conta
          AND l.sinal::int = o.sinal_ofx )
       )
),
scored AS (
  SELECT cand.*,
    LEAST(100,
      40 + 30
      + GREATEST(0, 20 - 4*dist_dias)
      + CASE WHEN tipo_operacao = '3-Transferências' THEN 10 ELSE 0 END
    ) AS score,
    CASE WHEN NOT cbi_qualquer THEN 'livre'
         WHEN cbi_neste THEN 'alerta_mesmo_extrato'
         ELSE 'alerta_outro_extrato' END AS classificacao
  FROM cand
)
SELECT COALESCE(jsonb_agg(
  jsonb_build_object(
    'lancamento_id', s.id,
    'valor', s.valor,
    'sinal', s.sinal,
    'data_pagamento', s.data_pagamento,
    'data_competencia', s.data_competencia,
    'tipo_operacao', s.tipo_operacao,
    'status_transacao', s.status_transacao,
    'origem_lancamento', s.origem_lancamento,
    'descricao', s.descricao,
    'conta_bancaria_id', s.conta_bancaria_id,
    'conta_bancaria_nome', (SELECT nome_exibicao FROM financeiro_contas_bancarias WHERE id = s.conta_bancaria_id),
    'conta_destino_id', s.conta_destino_id,
    'conta_destino_nome', (SELECT nome_exibicao FROM financeiro_contas_bancarias WHERE id = s.conta_destino_id),
    'lado_match', s.lado_match,
    'qual_data', s.qual_data,
    'classificacao', s.classificacao,
    'score', s.score,
    'extrato_vinculado_id', (SELECT c.extrato_id FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = s.id AND c.desfeito_em IS NULL LIMIT 1),
    'criterios', jsonb_build_object(
      'valor_exato', true,
      'conta_lado_ok', true,
      'data_exata', s.data_pgto_exata,
      'tipo_transferencia', (s.tipo_operacao = '3-Transferências')
    )
  )
  ORDER BY (s.classificacao = 'livre') DESC, s.score DESC, s.data_ancora ASC
), '[]'::jsonb)
FROM scored s;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ws_candidatos_financeiros(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_ws_candidatos_financeiros(uuid) TO authenticated;
