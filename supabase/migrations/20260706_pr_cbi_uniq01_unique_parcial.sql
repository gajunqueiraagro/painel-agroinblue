-- ============================================================================
-- PR-CBI-UNIQ-01 — Unicidade de vínculo compatível com soft-delete.
-- Complementar ao PR-CBI-READ-01 (leitores). O índice antigo era UNIQUE TOTAL
-- em (extrato_id, lancamento_id); como vínculos desfeitos permanecem na tabela
-- (soft-delete via desfeito_em, = memória/trilha), recriar QUALQUER par já
-- desfeito violava a constraint ("duplicate key"). A unicidade passa a valer
-- apenas para vínculos VIVOS (desfeito_em IS NULL): máximo 1 vínculo ativo por
-- par; re-vincular um par desfeito cria linha NOVA e a memória do desfeito
-- permanece intacta como trilha.
-- Escopo: só o índice. As 4 RPCs e o hook (INSERT) NÃO mudam — a constraint
-- parcial passa a permitir o re-vínculo para todos os caminhos de uma vez.
-- Aplicado pelo Architect (Management API); o Code NÃO aplica.
-- ============================================================================

-- 1) remove o índice UNIQUE total (nome antigo)
DROP INDEX IF EXISTS idx_conciliacao_itens_par_unico;

-- 2) unicidade só entre vínculos ativos (nome novo explicita a semântica)
CREATE UNIQUE INDEX idx_conciliacao_itens_par_unico_ativo
  ON conciliacao_bancaria_itens (extrato_id, lancamento_id)
  WHERE desfeito_em IS NULL;

-- ============================================================================
-- CONFERÊNCIA (para o dry-run do Architect — NÃO executa aqui):
--   pares ATIVOS duplicados devem ser 0. Se houver, o CREATE acima falha por
--   si só (defesa natural do índice), sem precisar de guard adicional.
--     SELECT extrato_id, lancamento_id, count(*)
--       FROM conciliacao_bancaria_itens
--      WHERE desfeito_em IS NULL
--      GROUP BY extrato_id, lancamento_id
--     HAVING count(*) > 1;
--
-- REVERSIBILIDADE (script inverso documentado — NÃO executar aqui):
--   DROP INDEX IF EXISTS idx_conciliacao_itens_par_unico_ativo;
--   CREATE UNIQUE INDEX idx_conciliacao_itens_par_unico
--     ON conciliacao_bancaria_itens (extrato_id, lancamento_id);
--   Nota honesta: a reversão só é possível ENQUANTO não existir par com 1
--   vínculo vivo + N desfeitos — que é exatamente o estado que este PR passa a
--   permitir. Após o primeiro re-vínculo de um par desfeito, o índice TOTAL
--   não pode mais ser recriado (violaria unicidade nos duplicados par-morto).
-- ============================================================================
