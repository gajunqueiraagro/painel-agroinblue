-- ============================================================================
-- PR6.1C-5 — Reversão retroativa de aprovações inválidas
--
-- Pares com decisao='aprovado' mas aprovacao_json com categoria contábil
-- incompleta OU aprovacao_json IS NULL.
--
-- Schema: mesa_par.decisao text NOT NULL DEFAULT 'pendente' CHECK IN
-- ('pendente','aprovado','rejeitado','excel_orfao'). NULL proibido pelo
-- banco. Reversão usa 'pendente' (estado inicial — operador re-aprova via
-- Modo Corrigir aproveitando correcao_json existente). Mesmo valor que o
-- guard runtime do PR6.1C-4 aplica em salvarPares — consistência entre
-- write path e migration retroativa.
--
-- correcao_json é PRESERVADO em qualquer caminho (A2 — regra absoluta).
-- Operador reabre Modo Corrigir e reaproveita o que ja preencheu.
--
-- Idempotente: re-execução = 0 rows afetadas + RAISE NOTICE "Reversao OK".
-- Defensivo: DO blocks com RAISE NOTICE auditando antes/depois +
-- RAISE EXCEPTION se a reversão não convergir a zero.
--
-- NÃO toca em: mesa_lancamento_staging, financeiro_lancamentos_v2,
--              financeiro_fornecedores, mesa_sessao, mesa_ofx_validacao.
--
-- Backup recomendado antes da aplicação no proto:
--   CREATE TABLE mesa_par_backup_pr6_1c_20260525 AS
--     SELECT * FROM mesa_par WHERE decisao = 'aprovado';
-- ============================================================================

-- 1. Auditoria — quantas aprovações inválidas serão revertidas.
DO $$
DECLARE
  qt_invalidos integer;
BEGIN
  SELECT COUNT(*) INTO qt_invalidos
  FROM mesa_par
  WHERE decisao = 'aprovado'
    AND (
      aprovacao_json IS NULL
      OR COALESCE(NULLIF(aprovacao_json->>'subcentro', ''), '') = ''
      OR COALESCE(NULLIF(aprovacao_json->>'grupo', ''), '') = ''
      OR COALESCE(NULLIF(aprovacao_json->>'centro', ''), '') = ''
      OR COALESCE(NULLIF(aprovacao_json->>'macro', ''), '') = ''
      OR (aprovacao_json->>'contaId') IS NULL
      OR (aprovacao_json->>'fazendaId') IS NULL
    );
  RAISE NOTICE 'PR6.1C-5 — Aprovacoes invalidas a reverter: %', qt_invalidos;
END $$;

-- 2. UPDATE: decisao='pendente' + aprovacao_json=NULL.
--    correcao_json NÃO aparece no SET — preservado (A2).
UPDATE mesa_par
SET decisao = 'pendente',
    aprovacao_json = NULL
WHERE decisao = 'aprovado'
  AND (
    aprovacao_json IS NULL
    OR COALESCE(NULLIF(aprovacao_json->>'subcentro', ''), '') = ''
    OR COALESCE(NULLIF(aprovacao_json->>'grupo', ''), '') = ''
    OR COALESCE(NULLIF(aprovacao_json->>'centro', ''), '') = ''
    OR COALESCE(NULLIF(aprovacao_json->>'macro', ''), '') = ''
    OR (aprovacao_json->>'contaId') IS NULL
    OR (aprovacao_json->>'fazendaId') IS NULL
  );

-- 3. Validação pós-reversão — zero aprovações inválidas restantes.
DO $$
DECLARE
  qt_restantes integer;
BEGIN
  SELECT COUNT(*) INTO qt_restantes
  FROM mesa_par
  WHERE decisao = 'aprovado'
    AND (
      aprovacao_json IS NULL
      OR COALESCE(NULLIF(aprovacao_json->>'subcentro', ''), '') = ''
      OR COALESCE(NULLIF(aprovacao_json->>'grupo', ''), '') = ''
      OR COALESCE(NULLIF(aprovacao_json->>'centro', ''), '') = ''
      OR COALESCE(NULLIF(aprovacao_json->>'macro', ''), '') = ''
      OR (aprovacao_json->>'contaId') IS NULL
      OR (aprovacao_json->>'fazendaId') IS NULL
    );
  IF qt_restantes > 0 THEN
    RAISE EXCEPTION 'PR6.1C-5 — Reversao incompleta: % aprovacoes invalidas restantes', qt_restantes;
  END IF;
  RAISE NOTICE 'PR6.1C-5 — Reversao OK: zero aprovacoes invalidas';
END $$;
