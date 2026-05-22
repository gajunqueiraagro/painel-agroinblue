-- PR0.A · Mesa Operacional v2 · Enums
-- Granularidade de origem do apontamento financeiro.
-- Fase A: coluna NULL aceita. Backfill em PR0.B. NOT NULL em PR0.D.

DO $$ BEGIN
  CREATE TYPE origem_apontamento_enum AS ENUM (
    'excel_historico',
    'excel_operacional',
    'manual',
    'ajuste_operacional',
    'programado',
    'ofx_direto',
    'financiamento',
    'zoot'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TYPE origem_apontamento_enum IS
'Mesa Operacional v2. Origem estrutural do apontamento financeiro.
Valores: excel_historico (carga única migração), excel_operacional (rotina mensal),
manual (operador digitou), ajuste_operacional (correção/saneamento),
programado (futuro virou realizado), ofx_direto (nasceu de extrato sem apontamento),
financiamento (módulo de financiamento), zoot (movimentação zootécnica).
Criada PR0.A em 2026-05-22.';
