-- ============================================================================
-- WS1 — Homologação determinística da Estação de Conciliação (READ-ONLY).
--
-- Objetivo: levantar, de forma determinística, os lançamentos do bucket
--   sistema_sem_extrato e classificar cada um pela RPC fn_ws_conciliacao em
--   "com_candidatos" / "sem_candidatos" — para escolher os IDs dos 5 estados
--   da homologação visual (caso COM candidatos e caso SEM candidatos).
--
-- USO (rodar SOMENTE no proto binbcdfbisgscrifztia — NUNCA prod duttifnbxqtyyybjmouv):
--   1) Preencher a CTE `parametros` (cliente_id, conta_bancaria_id, ano_mes).
--   2) Executar. Cada linha traz: tipo, id, conta, competência, n_candidatos, cenário.
--   3) Escolher 1 id 'com_candidatos' e 1 id 'sem_candidatos' p/ exercitar a Estação.
--
-- GARANTIAS:
--   - 100% read-only: nenhuma escrita; fn_conciliacao_soberana e fn_ws_conciliacao
--     são apenas LIDAS (SELECT), nunca alteradas.
--   - Determinística: mesma entrada -> mesma saída (sem random, sem now()).
--   - A classificação vem EXCLUSIVAMENTE do payload da RPC
--     (jsonb_array_length(payload->'sugestoes')); nada é deduzido fora dela.
-- ============================================================================

WITH parametros AS (
  SELECT
    '00000000-0000-0000-0000-000000000000'::uuid AS cliente_id,        -- <preencher>
    '00000000-0000-0000-0000-000000000000'::uuid AS conta_bancaria_id, -- <preencher>
    'YYYY-MM'::text                              AS ano_mes            -- <preencher>
),

-- read-model soberano do mês (apenas leitura) -> fonte dos órfãos do sistema
diag AS (
  SELECT fn_conciliacao_soberana(p.cliente_id, p.conta_bancaria_id, p.ano_mes) AS j
  FROM parametros p
),

-- lançamentos do bucket sistema_sem_extrato (entrada da Estação, modo Sistema)
candidatos AS (
  SELECT (item->>'lancamento_id')::uuid AS lancamento_id
  FROM diag,
       jsonb_array_elements(diag.j->'buckets'->'sistema_sem_extrato') AS item
),

-- payload real da Estação para cada candidato (UMA chamada por id)
homolog AS (
  SELECT
    'sistema_sem_vinculo'::text                          AS tipo,
    c.lancamento_id                                      AS id,
    fn_ws_conciliacao('sistema_sem_vinculo', c.lancamento_id) AS payload
  FROM candidatos c
)

SELECT
  h.tipo,
  h.id,
  (h.payload->'contexto'->>'conta_bancaria_id')::uuid          AS conta_bancaria_id,
  h.payload->'contexto'->>'ano_mes'                            AS competencia,
  jsonb_array_length(h.payload->'sugestoes')                   AS n_candidatos,
  CASE
    WHEN jsonb_array_length(h.payload->'sugestoes') > 0 THEN 'com_candidatos'
    ELSE 'sem_candidatos'
  END                                                          AS cenario
FROM homolog h
ORDER BY n_candidatos DESC, h.id;
