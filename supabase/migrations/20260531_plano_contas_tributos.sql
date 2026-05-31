-- Migration: 20260531_plano_contas_tributos.sql
-- PR-256 — TRIBUTOS (seed do plano de contas).
-- 5 subcentros globais (cliente_id = NULL), idempotentes (WHERE NOT EXISTS por
-- macro + centro + subcentro + cliente_id IS NULL). NÃO altera tabelas, RPCs,
-- nem dados existentes. Não cria IPVA / Licenciamento / Taxas de Veículos.

BEGIN;

-- 1) ITR (Tributos Patrimoniais) — ordem 19010
INSERT INTO public.financeiro_plano_contas
  (cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ativo, ordem_exibicao)
SELECT NULL, '2-Saídas', 'Tributos', 'Tributos e Impostos', 'Tributos Patrimoniais', 'ITR', 'administrativo', true, 19010
WHERE NOT EXISTS (
  SELECT 1 FROM public.financeiro_plano_contas
   WHERE cliente_id IS NULL
     AND macro_custo  = 'Tributos'
     AND centro_custo = 'Tributos Patrimoniais'
     AND subcentro    = 'ITR'
);

-- 2) Taxas Patrimoniais (Tributos Patrimoniais) — ordem 19020
INSERT INTO public.financeiro_plano_contas
  (cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ativo, ordem_exibicao)
SELECT NULL, '2-Saídas', 'Tributos', 'Tributos e Impostos', 'Tributos Patrimoniais', 'Taxas Patrimoniais', 'administrativo', true, 19020
WHERE NOT EXISTS (
  SELECT 1 FROM public.financeiro_plano_contas
   WHERE cliente_id IS NULL
     AND macro_custo  = 'Tributos'
     AND centro_custo = 'Tributos Patrimoniais'
     AND subcentro    = 'Taxas Patrimoniais'
);

-- 3) IRPJ (Impostos sobre Lucro) — ordem 19030
INSERT INTO public.financeiro_plano_contas
  (cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ativo, ordem_exibicao)
SELECT NULL, '2-Saídas', 'Tributos', 'Tributos e Impostos', 'Impostos sobre Lucro', 'IRPJ', 'administrativo', true, 19030
WHERE NOT EXISTS (
  SELECT 1 FROM public.financeiro_plano_contas
   WHERE cliente_id IS NULL
     AND macro_custo  = 'Tributos'
     AND centro_custo = 'Impostos sobre Lucro'
     AND subcentro    = 'IRPJ'
);

-- 4) CSLL (Impostos sobre Lucro) — ordem 19040
INSERT INTO public.financeiro_plano_contas
  (cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ativo, ordem_exibicao)
SELECT NULL, '2-Saídas', 'Tributos', 'Tributos e Impostos', 'Impostos sobre Lucro', 'CSLL', 'administrativo', true, 19040
WHERE NOT EXISTS (
  SELECT 1 FROM public.financeiro_plano_contas
   WHERE cliente_id IS NULL
     AND macro_custo  = 'Tributos'
     AND centro_custo = 'Impostos sobre Lucro'
     AND subcentro    = 'CSLL'
);

-- 5) IRPF (Impostos sobre Lucro) — ordem 19050
INSERT INTO public.financeiro_plano_contas
  (cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio, ativo, ordem_exibicao)
SELECT NULL, '2-Saídas', 'Tributos', 'Tributos e Impostos', 'Impostos sobre Lucro', 'IRPF', 'administrativo', true, 19050
WHERE NOT EXISTS (
  SELECT 1 FROM public.financeiro_plano_contas
   WHERE cliente_id IS NULL
     AND macro_custo  = 'Tributos'
     AND centro_custo = 'Impostos sobre Lucro'
     AND subcentro    = 'IRPF'
);

COMMIT;
