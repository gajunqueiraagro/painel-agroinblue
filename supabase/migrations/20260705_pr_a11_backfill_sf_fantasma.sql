-- ============================================================================
-- PR-A1.1 — Backfill R-B dos saldos fantasma (saldo_final=0 criado pelo botão
-- "Fechar contas sem movimento" pré-F1). SOMENTE dados: 6 UPDATE + 6 INSERT de
-- auditoria. NENHUM DDL, função ou trigger. Forward-only; aplicado pelo Architect.
--
-- R-B (censo por régua em CAIXA, Decisão 1): razão do mês = 0 e SI != 0 →
-- SF verdadeiro = SI herdado (o banco não se moveu). Régua: SI + razão_caixa − SF = 0.
-- Travas de idempotência/segurança por alvo: saldo_final=0 AND updated_by IS NULL
-- AND origem_saldo IS NULL AND saldo_inicial=<SF novo> (nunca toca linha humana/já marcada).
-- Constituição: o sistema NUNCA inventa saldo; aqui apenas herda o SI já informado.
-- ============================================================================

-- ── Alvo 1 — Santa Rita Agro · B.Brasil-Ativa Plus · 2026-05 · 130000.00 ─────
UPDATE financeiro_saldos_bancarios_v2 s
   SET saldo_final = s.saldo_inicial,
       origem_saldo = 'sem_movimento'
 WHERE s.ano_mes = '2026-05'
   AND s.conta_bancaria_id = (SELECT cb.id FROM financeiro_contas_bancarias cb
         JOIN clientes c ON c.id = cb.cliente_id
        WHERE c.nome ILIKE 'Santa Rita Agro%' AND cb.nome_conta = 'B.Brasil-Ativa Plus')
   AND s.saldo_final = 0
   AND s.updated_by IS NULL
   AND s.origem_saldo IS NULL
   AND s.saldo_inicial = 130000.00;

INSERT INTO financeiro_saldos_audit
  (saldo_id, cliente_id, acao, campo_alterado, valor_anterior, valor_novo, usuario_id)
SELECT s.id, s.cliente_id, 'backfill_e1', 'saldo_final', '0', '130000.00', NULL
  FROM financeiro_saldos_bancarios_v2 s
 WHERE s.ano_mes = '2026-05'
   AND s.conta_bancaria_id = (SELECT cb.id FROM financeiro_contas_bancarias cb
         JOIN clientes c ON c.id = cb.cliente_id
        WHERE c.nome ILIKE 'Santa Rita Agro%' AND cb.nome_conta = 'B.Brasil-Ativa Plus')
   AND s.origem_saldo = 'sem_movimento'
   AND s.saldo_final = 130000.00;

-- ── Alvo 2 — Santa Rita Agro · B.Brasil-Invest.Facil · 2026-05 · 425316.42 ───
UPDATE financeiro_saldos_bancarios_v2 s
   SET saldo_final = s.saldo_inicial,
       origem_saldo = 'sem_movimento'
 WHERE s.ano_mes = '2026-05'
   AND s.conta_bancaria_id = (SELECT cb.id FROM financeiro_contas_bancarias cb
         JOIN clientes c ON c.id = cb.cliente_id
        WHERE c.nome ILIKE 'Santa Rita Agro%' AND cb.nome_conta = 'B.Brasil-Invest.Facil')
   AND s.saldo_final = 0
   AND s.updated_by IS NULL
   AND s.origem_saldo IS NULL
   AND s.saldo_inicial = 425316.42;

INSERT INTO financeiro_saldos_audit
  (saldo_id, cliente_id, acao, campo_alterado, valor_anterior, valor_novo, usuario_id)
SELECT s.id, s.cliente_id, 'backfill_e1', 'saldo_final', '0', '425316.42', NULL
  FROM financeiro_saldos_bancarios_v2 s
 WHERE s.ano_mes = '2026-05'
   AND s.conta_bancaria_id = (SELECT cb.id FROM financeiro_contas_bancarias cb
         JOIN clientes c ON c.id = cb.cliente_id
        WHERE c.nome ILIKE 'Santa Rita Agro%' AND cb.nome_conta = 'B.Brasil-Invest.Facil')
   AND s.origem_saldo = 'sem_movimento'
   AND s.saldo_final = 425316.42;

-- ── Alvo 3 — Santa Rita Agro · Bradesco - CDB · 2026-05 · 256132.70 ──────────
UPDATE financeiro_saldos_bancarios_v2 s
   SET saldo_final = s.saldo_inicial,
       origem_saldo = 'sem_movimento'
 WHERE s.ano_mes = '2026-05'
   AND s.conta_bancaria_id = (SELECT cb.id FROM financeiro_contas_bancarias cb
         JOIN clientes c ON c.id = cb.cliente_id
        WHERE c.nome ILIKE 'Santa Rita Agro%' AND cb.nome_conta = 'Bradesco - CDB')
   AND s.saldo_final = 0
   AND s.updated_by IS NULL
   AND s.origem_saldo IS NULL
   AND s.saldo_inicial = 256132.70;

INSERT INTO financeiro_saldos_audit
  (saldo_id, cliente_id, acao, campo_alterado, valor_anterior, valor_novo, usuario_id)
SELECT s.id, s.cliente_id, 'backfill_e1', 'saldo_final', '0', '256132.70', NULL
  FROM financeiro_saldos_bancarios_v2 s
 WHERE s.ano_mes = '2026-05'
   AND s.conta_bancaria_id = (SELECT cb.id FROM financeiro_contas_bancarias cb
         JOIN clientes c ON c.id = cb.cliente_id
        WHERE c.nome ILIKE 'Santa Rita Agro%' AND cb.nome_conta = 'Bradesco - CDB')
   AND s.origem_saldo = 'sem_movimento'
   AND s.saldo_final = 256132.70;

-- ── Alvo 4 — Santa Rita Agro · Bradesco - Invest. Facil · 2026-05 · 632.58 ───
UPDATE financeiro_saldos_bancarios_v2 s
   SET saldo_final = s.saldo_inicial,
       origem_saldo = 'sem_movimento'
 WHERE s.ano_mes = '2026-05'
   AND s.conta_bancaria_id = (SELECT cb.id FROM financeiro_contas_bancarias cb
         JOIN clientes c ON c.id = cb.cliente_id
        WHERE c.nome ILIKE 'Santa Rita Agro%' AND cb.nome_conta = 'Bradesco - Invest. Facil')
   AND s.saldo_final = 0
   AND s.updated_by IS NULL
   AND s.origem_saldo IS NULL
   AND s.saldo_inicial = 632.58;

INSERT INTO financeiro_saldos_audit
  (saldo_id, cliente_id, acao, campo_alterado, valor_anterior, valor_novo, usuario_id)
SELECT s.id, s.cliente_id, 'backfill_e1', 'saldo_final', '0', '632.58', NULL
  FROM financeiro_saldos_bancarios_v2 s
 WHERE s.ano_mes = '2026-05'
   AND s.conta_bancaria_id = (SELECT cb.id FROM financeiro_contas_bancarias cb
         JOIN clientes c ON c.id = cb.cliente_id
        WHERE c.nome ILIKE 'Santa Rita Agro%' AND cb.nome_conta = 'Bradesco - Invest. Facil')
   AND s.origem_saldo = 'sem_movimento'
   AND s.saldo_final = 632.58;

-- ── Alvo 5 — Santa Rita Agro · Bradesco-Fundo · 2026-05 · 1191984.01 ─────────
UPDATE financeiro_saldos_bancarios_v2 s
   SET saldo_final = s.saldo_inicial,
       origem_saldo = 'sem_movimento'
 WHERE s.ano_mes = '2026-05'
   AND s.conta_bancaria_id = (SELECT cb.id FROM financeiro_contas_bancarias cb
         JOIN clientes c ON c.id = cb.cliente_id
        WHERE c.nome ILIKE 'Santa Rita Agro%' AND cb.nome_conta = 'Bradesco-Fundo')
   AND s.saldo_final = 0
   AND s.updated_by IS NULL
   AND s.origem_saldo IS NULL
   AND s.saldo_inicial = 1191984.01;

INSERT INTO financeiro_saldos_audit
  (saldo_id, cliente_id, acao, campo_alterado, valor_anterior, valor_novo, usuario_id)
SELECT s.id, s.cliente_id, 'backfill_e1', 'saldo_final', '0', '1191984.01', NULL
  FROM financeiro_saldos_bancarios_v2 s
 WHERE s.ano_mes = '2026-05'
   AND s.conta_bancaria_id = (SELECT cb.id FROM financeiro_contas_bancarias cb
         JOIN clientes c ON c.id = cb.cliente_id
        WHERE c.nome ILIKE 'Santa Rita Agro%' AND cb.nome_conta = 'Bradesco-Fundo')
   AND s.origem_saldo = 'sem_movimento'
   AND s.saldo_final = 1191984.01;

-- ── Alvo 6 — Vera Ligia · inv-001 | itaú pecuária · 2026-07 · 311388.14 ──────
UPDATE financeiro_saldos_bancarios_v2 s
   SET saldo_final = s.saldo_inicial,
       origem_saldo = 'sem_movimento'
 WHERE s.ano_mes = '2026-07'
   AND s.conta_bancaria_id = (SELECT cb.id FROM financeiro_contas_bancarias cb
         JOIN clientes c ON c.id = cb.cliente_id
        WHERE c.nome ILIKE 'Vera Ligia%' AND cb.nome_conta = 'inv-001 | itaú pecuária')
   AND s.saldo_final = 0
   AND s.updated_by IS NULL
   AND s.origem_saldo IS NULL
   AND s.saldo_inicial = 311388.14;

INSERT INTO financeiro_saldos_audit
  (saldo_id, cliente_id, acao, campo_alterado, valor_anterior, valor_novo, usuario_id)
SELECT s.id, s.cliente_id, 'backfill_e1', 'saldo_final', '0', '311388.14', NULL
  FROM financeiro_saldos_bancarios_v2 s
 WHERE s.ano_mes = '2026-07'
   AND s.conta_bancaria_id = (SELECT cb.id FROM financeiro_contas_bancarias cb
         JOIN clientes c ON c.id = cb.cliente_id
        WHERE c.nome ILIKE 'Vera Ligia%' AND cb.nome_conta = 'inv-001 | itaú pecuária')
   AND s.origem_saldo = 'sem_movimento'
   AND s.saldo_final = 311388.14;

-- ============================================================================
-- REVERSIBILIDADE (script inverso documentado — NÃO executar aqui).
-- Para desfazer o backfill de um alvo (mesmas chaves de conta+mês):
--   UPDATE financeiro_saldos_bancarios_v2 s
--      SET saldo_final = 0, origem_saldo = NULL
--    WHERE s.ano_mes = '<ano_mes>'
--      AND s.conta_bancaria_id = (SELECT cb.id FROM financeiro_contas_bancarias cb
--            JOIN clientes c ON c.id = cb.cliente_id
--           WHERE c.nome ILIKE '<cliente>%' AND cb.nome_conta = '<nome_conta>')
--      AND s.origem_saldo = 'sem_movimento'
--      AND s.saldo_final = <SF novo>;
-- A auditoria (financeiro_saldos_audit) preserva valor_anterior='0': o histórico
-- do backfill permanece rastreável mesmo após a reversão.
-- ============================================================================
