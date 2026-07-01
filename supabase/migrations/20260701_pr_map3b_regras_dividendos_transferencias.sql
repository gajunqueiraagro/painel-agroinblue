-- ============================================================================
-- PR-MAP-3b — Regras contextuais para os grandes bloqueadores (Santa Rita).
--
-- Dividendos e Transferências são categorias sensíveis: viram REGRA CONTEXTUAL
-- (cond_subcentro + cond_tipo_operacao), nunca alias simples. Assim, se a linha
-- vier com tipo_operacao diferente do esperado, a regra NÃO dispara → linha fica
-- órfã para revisão (falso negativo > classificação errada).
--
-- Reprocessamento (fn_classificacao_reresolver_sessao) é passo de dados, após.
-- Não toca financeiro_lancamentos_v2.
-- ============================================================================

INSERT INTO public.financeiro_classificacao_regras
  (cliente_id, cond_subcentro, cond_tipo_operacao, plano_conta_id, origem, prioridade, observacao_regra)
SELECT
  '77d37bbf-a440-4fca-bf1a-eac60cf91bc4'::uuid, v.cond_subcentro, v.cond_tipo, pc.id, 'seed', 100, v.nota
FROM (VALUES
  ('Dividendos/Dividendos/Despesas Pessoais', '2-Saídas',         'Dividendos Despesas Pessoais',          'PR-MAP-3b: só resolve como Saída'),
  ('Dividendos/Dividendos/Pessoal Fazenda',   '2-Saídas',         'Dividendos Pessoal Fazenda',            'PR-MAP-3b: só resolve como Saída'),
  ('Transferiencias entre contas',            '3-Transferências', 'Transferência entre Contas Bancárias',  'PR-MAP-3b: só resolve como Transferência')
) AS v(cond_subcentro, cond_tipo, canonico, nota)
JOIN public.financeiro_plano_contas pc
  ON unaccent(lower(trim(pc.subcentro))) = unaccent(lower(v.canonico))
  AND pc.ativo
  AND (pc.cliente_id = '77d37bbf-a440-4fca-bf1a-eac60cf91bc4'::uuid OR pc.cliente_id IS NULL)
WHERE NOT EXISTS (
  SELECT 1 FROM public.financeiro_classificacao_regras r
  WHERE r.cliente_id = '77d37bbf-a440-4fca-bf1a-eac60cf91bc4'::uuid
    AND r.cond_subcentro = v.cond_subcentro
    AND r.cond_tipo_operacao = v.cond_tipo
);
