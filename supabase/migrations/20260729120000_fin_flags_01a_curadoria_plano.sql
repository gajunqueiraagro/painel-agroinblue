-- FIN-FLAGS-01A — Fase 2: CURADORIA de financeiro_plano_contas.compoe_dre.
--   Matriz DRE fechada (Fase 0). Centraliza a decisão no BANCO (fonte única).
--   FALSE: Transferências, Entre Contas, Dividendos, Entrada Financeira, Saída Financeira, Financeiro.
--   TRUE : Receita Operacional, Custeio Produção, Deduções de Receitas,
--          Investimento na Fazenda, Investimento em Bovinos, Tributos (ITR/CCIR/taxas/IRPF/IRPJ).
--   Remove o DEFAULT universal `true` e o NOT NULL herdados de PR-FUND-01: novos planos NÃO
--   podem nascer silenciosamente `true`; macro fora da matriz nasce NULL (decisão manual).
--   Idempotente. NÃO altera lançamentos (fato materializado à parte — backfill Fase 3).
--   Requer PROTO (binbcdfbisgscrifztia). NUNCA em produção.

-- 1) Remover o default universal e permitir NULL (natureza indecidida ⇒ NULL, nunca `true` por exclusão)
ALTER TABLE public.financeiro_plano_contas ALTER COLUMN compoe_dre DROP DEFAULT;
ALTER TABLE public.financeiro_plano_contas ALTER COLUMN compoe_dre DROP NOT NULL;

-- 2) Curadoria EXPLÍCITA por macro (somente macros da matriz; nunca por exclusão; idempotente)
UPDATE public.financeiro_plano_contas
   SET compoe_dre = false
 WHERE macro_custo IN ('Transferências','Entre Contas','Dividendos',
                       'Entrada Financeira','Saída Financeira','Financeiro')
   AND compoe_dre IS DISTINCT FROM false;

UPDATE public.financeiro_plano_contas
   SET compoe_dre = true
 WHERE macro_custo IN ('Receita Operacional','Custeio Produção','Deduções de Receitas',
                       'Investimento na Fazenda','Investimento em Bovinos','Tributos')
   AND compoe_dre IS DISTINCT FROM true;

-- 3) Macros FORA da matriz: intencionalmente NÃO tocadas. Não há hoje planos fora da matriz
--    (156/156 cobertos: 30 FALSE + 126 TRUE); planos futuros com macro fora da matriz nascerão
--    NULL após o drop do default, exigindo decisão manual (nunca `true` automático).

COMMENT ON COLUMN public.financeiro_plano_contas.compoe_dre IS
  'Classificação DRE curada (matriz FIN-FLAGS-01A). NULL = macro fora da matriz / a decidir. '
  'Sem default: novos planos exigem valor explícito ou permanecem NULL.';
