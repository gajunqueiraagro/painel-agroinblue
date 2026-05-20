-- ============================================================================
-- PR Z1 — fornecedor_id soberano no zoo + snapshot imutavel de nome.
-- Backfill conservador (TASK 0 ja executada, resultados conhecidos):
--   - 137 com match unico → migram com fornecedor_id + nome do mestre
--   - 2 ambiguos + 313 sem match → fornecedor_id NULL, snapshot = texto legado
--   - 71 sem texto → fornecedor_id NULL, snapshot = '[nao informado]'
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Adicionar colunas (snapshot NULLABLE durante backfill)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE lancamentos
  ADD COLUMN fornecedor_id uuid
  REFERENCES financeiro_fornecedores(id)
  ON DELETE RESTRICT;

ALTER TABLE lancamentos
  ADD COLUMN fornecedor_nome_snapshot text;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Indice parcial (lookup eficiente quando UUID populado)
--    NOTA: em producao avaliar CREATE INDEX CONCURRENTLY em migration separada
--    porque CONCURRENTLY nao pode rodar dentro de transacao.
-- ────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_lancamentos_fornecedor_id
  ON lancamentos(fornecedor_id)
  WHERE fornecedor_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) Backfill fornecedor_id — APENAS match unico (qtd_matches = 1).
--    Match ambiguo: NAO migra, fica NULL para correcao manual posterior.
--    Esperado: 137 registros atualizados (NJ + Agnaldo + outros).
-- ────────────────────────────────────────────────────────────────────────────

WITH match_unico AS (
  SELECT
    l.id AS lanc_id,
    (array_agg(DISTINCT f.id))[1] AS fornecedor_id_match,
    (array_agg(DISTINCT f.nome))[1] AS fornecedor_nome_match
  FROM lancamentos l
  JOIN financeiro_fornecedores f
    ON LOWER(TRIM(l.comprador_fornecedor)) =
       LOWER(TRIM(COALESCE(f.nome_normalizado, f.nome)))
    AND f.cliente_id = l.cliente_id
    AND f.ativo = true
  WHERE l.tipo = 'compra'
    AND l.cancelado = false
    AND l.fornecedor_id IS NULL
    AND l.comprador_fornecedor IS NOT NULL
    AND l.comprador_fornecedor != ''
  GROUP BY l.id
  HAVING COUNT(DISTINCT f.id) = 1
)
UPDATE lancamentos l
SET
  fornecedor_id = m.fornecedor_id_match,
  fornecedor_nome_snapshot = m.fornecedor_nome_match
FROM match_unico m
WHERE l.id = m.lanc_id;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) Backfill snapshot dos nao-migrados (sem match OU match ambiguo).
--    Preserva texto legado para auditoria.
--    Esperado: 315 registros atualizados (313 sem match + 2 ambiguos).
-- ────────────────────────────────────────────────────────────────────────────

UPDATE lancamentos
SET fornecedor_nome_snapshot = comprador_fornecedor
WHERE tipo = 'compra'
  AND cancelado = false
  AND fornecedor_nome_snapshot IS NULL
  AND comprador_fornecedor IS NOT NULL
  AND comprador_fornecedor != '';

-- ────────────────────────────────────────────────────────────────────────────
-- 5) Sentinel explicito para lancamentos sem texto original.
--    AJUSTE Gabriel: usar '[nao informado]' ao inves de ''.
--    Diferencia explicitamente:
--      - fornecedor migrado (UUID + nome real)
--      - fornecedor legado nao migrado (UUID NULL + texto legado)
--      - fornecedor nunca informado (UUID NULL + '[nao informado]')
--    Esperado: 71 registros + qualquer outro residual.
-- ────────────────────────────────────────────────────────────────────────────

UPDATE lancamentos
SET fornecedor_nome_snapshot = '[nao informado]'
WHERE fornecedor_nome_snapshot IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 6) Validacao pos-backfill — se algum NULL escapou, falhar a migration.
-- ────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  null_count int;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM lancamentos
  WHERE fornecedor_nome_snapshot IS NULL;

  IF null_count > 0 THEN
    RAISE EXCEPTION
      'Backfill incompleto: % registros com fornecedor_nome_snapshot NULL. Migration abortada.',
      null_count;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7) Promover snapshot para NOT NULL (com schema garantido)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE lancamentos
  ALTER COLUMN fornecedor_nome_snapshot SET NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 8) Comentarios arquiteturais inline (documentacao no banco)
-- ────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN lancamentos.fornecedor_id IS
  'Fornecedor operacional soberano da movimentacao zoo. Pode divergir dos favorecidos das parcelas financeiras (barter, cessao, permuta, terceiro). FK ON DELETE RESTRICT preserva auditoria.';

COMMENT ON COLUMN lancamentos.fornecedor_nome_snapshot IS
  'Snapshot imutavel do nome do fornecedor no momento do save. Preserva auditoria mesmo se fornecedor mestre renomear/desativar/mesclar. Valor "[nao informado]" indica ausencia explicita de fornecedor no original. Aplicacao garante imutabilidade.';

COMMENT ON COLUMN lancamentos.comprador_fornecedor IS
  'LEGADO — texto livre. Sera removido em PR futuro apos transicao completa para fornecedor_id.';
