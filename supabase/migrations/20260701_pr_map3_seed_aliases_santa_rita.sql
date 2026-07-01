-- ============================================================================
-- PR-MAP-3 — Seed de aliases Santa Rita (17 aprovados da tabela dos 45).
--
-- Grupo A (folha, 8) + Grupo B1 fuzzy_alta semanticamente óbvios (9).
-- FORA do seed (decisão do operador): Dividendos×2 e Transferências (revisar),
-- Grupo B2 fuzzy_media (revisar_manual) e Grupo C sem_sugestao (plano incompleto).
--
-- Requer origem='seed' → o CHECK origem_valida é estendido para incluí-lo.
-- Reprocessamento das sessões (fn_classificacao_reresolver_sessao) é passo de
-- dados, executado APÓS este seed (não faz parte da migration de schema/seed).
-- ============================================================================

-- 1) permitir origem='seed' (auditoria: distingue linhas semeadas)
ALTER TABLE public.financeiro_subcentro_aliases DROP CONSTRAINT origem_valida;
ALTER TABLE public.financeiro_subcentro_aliases
  ADD CONSTRAINT origem_valida CHECK (origem = ANY (ARRAY['manual','importacao','migracao','seed']));

-- 2) seed dos 17 aliases aprovados (plano_conta_id resolvido por nome canônico, 1:1 confirmado)
INSERT INTO public.financeiro_subcentro_aliases (cliente_id, alias_text, plano_conta_id, ativo, origem)
SELECT '77d37bbf-a440-4fca-bf1a-eac60cf91bc4'::uuid, p.alias_text, pc.id, true, 'seed'
FROM (VALUES
  -- Grupo A — folha (8)
  ('Receitas/Rendimentos Financeiros','Rendimentos Financeiros'),
  ('Pec/Nutrição Cria','Nutrição Cria'),
  ('Receitas/Outras Receitas','Outras Receitas'),
  ('Outras Entradas/Aporte Pessoal','Aporte Pessoal'),
  ('Pec/Brincos de Identificação','Brincos de Identificação'),
  ('Pec/Veterinario Reprodução','Veterinário Reprodução'),
  ('Pec/Vacinas e Vermifugos','Vacinas e Vermífugos'),
  ('Pec/Nutrição Engorda','Nutrição Engorda'),
  -- Grupo B1 — fuzzy_alta semanticamente óbvios (9)
  ('Pec/Mão de Obra/Salarios e Encargos','Salários e Encargos Pecuária'),
  ('Pec/ADM/Despesas Financeiras','Despesas Financeiras Pecuária'),
  ('Pec/ADM/Comunicação e Energia','Comunicação e Energia Pecuária'),
  ('Pec/Sanidade Outros','Outros Serviços de Sanidade'),
  ('Pec/Manutenção Pasto','Manutenção de Pasto'),
  ('Pec/Mão de Obra/Rescisoes e Acertos','Rescisões e Acertos Pecuária'),
  ('Pec/Reprodução Outros','Outros Serviços de Reprodução'),
  ('Pec/ADM/Materiais Escritório','Materiais de Escritório Pecuária'),
  ('Pec/Custeio/Tropa de Serviço','Custo com Tropa de Serviço')
) AS p(alias_text, canonico)
JOIN public.financeiro_plano_contas pc
  ON unaccent(lower(trim(pc.subcentro))) = unaccent(lower(p.canonico))
  AND pc.ativo
  AND (pc.cliente_id = '77d37bbf-a440-4fca-bf1a-eac60cf91bc4'::uuid OR pc.cliente_id IS NULL)
ON CONFLICT (cliente_id, lower(trim(alias_text))) WHERE cliente_id IS NOT NULL DO NOTHING;
