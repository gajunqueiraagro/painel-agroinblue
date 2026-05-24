-- ============================================================================
-- PR6.1B-5 — Limpeza retroativa de pares órfãos
--
-- Bug pré-PR6.1B (PR5 / PR6.1 / PR6.1A): criarOuRecuperarSessao sobrescrevia
-- excel_lotes_json a cada reabertura da Mesa; parser usava crypto.randomUUID()
-- pra loteId. Resultado: cada reupload gerava loteId novo e cortava o vínculo
-- com mesa_par já persistidos. Pares ficavam "aprovados visualmente" mas o
-- staging não conseguia reconstruí-los (excel_key apontando pra lote sumido).
--
-- PR6.1B-1 trocou loteId por hash determinístico. PR6.1B-2 tornou sessão
-- imutável. PR6.1B-4 colocou guard em salvarPares. Este script (PR6.1B-5)
-- limpa o estado herdado.
--
-- Estado conhecido proto antes da limpeza (observado via Chrome MCP):
--   sessao 3718ca3a: mesa_par tem pares de 8 loteIds; excel_lotes_json tem 2
--   sessao 43486331: parcialmente consistente
--
-- Idempotente: re-execução é no-op (DELETE de 0 rows + RAISE NOTICE).
-- Defensivo: RAISE EXCEPTION se a limpeza não convergir a zero órfãos.
--
-- NÃO toca em: mesa_lancamento_staging, financeiro_lancamentos_v2,
--              financeiro_fornecedores, mesa_sessao, mesa_ofx_validacao.
--
-- Backup recomendado antes da aplicação no proto:
--   pg_dump --table=mesa_par ...
-- ============================================================================

-- 1. Auditoria — quantos órfãos serão deletados.
DO $$
DECLARE
  qt_orfaos integer;
BEGIN
  SELECT COUNT(*) INTO qt_orfaos
  FROM mesa_par mp
  WHERE NOT EXISTS (
    SELECT 1
    FROM mesa_sessao s,
         jsonb_array_elements(s.excel_lotes_json) lote
    WHERE s.id = mp.sessao_id
      AND (lote->>'loteId') = split_part(mp.excel_key, ':', 1)
  );
  RAISE NOTICE 'PR6.1B-5 — Pares órfãos a deletar: %', qt_orfaos;
END $$;

-- 2. DELETE dos órfãos.
--    Critério: excel_key prefixado por loteId que NÃO existe em
--    mesa_sessao.excel_lotes_json da sessão pai.
DELETE FROM mesa_par mp
WHERE NOT EXISTS (
  SELECT 1
  FROM mesa_sessao s,
       jsonb_array_elements(s.excel_lotes_json) lote
  WHERE s.id = mp.sessao_id
    AND (lote->>'loteId') = split_part(mp.excel_key, ':', 1)
);

-- 3. Validação pós-DELETE — deve restar 0 órfãos. Caso contrário, falha
--    a transação inteira (rollback do DELETE acima).
DO $$
DECLARE
  qt_restantes integer;
BEGIN
  SELECT COUNT(*) INTO qt_restantes
  FROM mesa_par mp
  WHERE NOT EXISTS (
    SELECT 1
    FROM mesa_sessao s,
         jsonb_array_elements(s.excel_lotes_json) lote
    WHERE s.id = mp.sessao_id
      AND (lote->>'loteId') = split_part(mp.excel_key, ':', 1)
  );
  IF qt_restantes > 0 THEN
    RAISE EXCEPTION 'PR6.1B-5 — Limpeza incompleta: % pares órfãos restantes', qt_restantes;
  END IF;
  RAISE NOTICE 'PR6.1B-5 — Limpeza OK: zero pares órfãos';
END $$;
