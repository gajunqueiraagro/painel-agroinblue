-- ============================================================================
-- P0-OFX-DUPLICADOS / FASE 1 — soft delete dos 5 OFX orfaos duplicados de 11/05
-- Santa Rita / Banco Bradesco. ESCRITA EM DADOS (UPDATE), soft delete via
-- cancelado_em (mecanismo nativo da extrato_bancario_v2). NAO hard delete.
--
-- CONTEXTO (FASE 0 read-only): o dia 11/05 foi importado em 2 cargas (25/05 e
-- 13/06) com hashes diferentes (banco emitiu texto distinto p/ a mesma
-- transacao -> dedup por hash cego). 5 debitos ficaram com 2 copias fisicas
-- cada; em cada par 1 esta conciliada (cbi ativo) e 1 esta ORFA (sem cbi). As 5
-- orfas somam -198.262,81 = 100% da divergencia de Maio.
--
-- REGRA CRITICA: cancelar SOMENTE os 5 IDs literais abaixo. As clausulas extras
-- (cancelado_em IS NULL / conta certa / NOT EXISTS cbi ativo) sao GUARDAS de
-- seguranca: nunca AMPLIAM o conjunto, so restringem. Idempotente e reversivel
-- (UPDATE cancelado_em=NULL nos 5 ids).
-- ============================================================================

UPDATE extrato_bancario_v2
SET cancelado_em = now(),
    cancelado_por = '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e',   -- user admin proto (atendimento@agroinblue)
    cancelado_motivo = 'ofx_duplicado_carga_dupla_2026-06-24'
WHERE id IN (
  'cab668aa-d255-46d2-95d9-b1c442dc656e',
  'ae8c862a-ce0f-42c9-aff9-691a292b5ed2',
  '3ef0f8e1-bedd-4066-8a93-056caef40146',
  '11d7683e-d6fd-4c62-a157-2ee095744a5e',
  '1080d72e-11ce-4ec0-b54e-6eb092b50699'
)
AND cancelado_em IS NULL                         -- guarda: idempotente, nao re-cancela
AND conta_bancaria_id = 'dd6f1aa0-e061-40a2-bcb8-857e6d22e8cf'  -- guarda: so a conta certa
AND NOT EXISTS (                                  -- guarda: NUNCA cancelar uma com cbi ativo
  SELECT 1 FROM conciliacao_bancaria_itens cbi
  WHERE cbi.extrato_id = extrato_bancario_v2.id AND cbi.desfeito_em IS NULL
);
