
-- Disable the trigger temporarily to avoid interference
ALTER TABLE public.financeiro_lancamentos_v2 DISABLE TRIGGER trg_resolve_classificacao_plano;

-- Backfill grupo_custo for Distribuição/Dividendos records
UPDATE public.financeiro_lancamentos_v2
SET grupo_custo = 'Dividendos'
WHERE macro_custo = 'Distribuição'
  AND grupo_custo IS NULL
  AND cancelado = false;

-- Also fix records with macro_custo = 'Dividendos' (legacy naming)
UPDATE public.financeiro_lancamentos_v2
SET grupo_custo = 'Dividendos',
    macro_custo = 'Distribuição'
WHERE macro_custo = 'Dividendos'
  AND cancelado = false;

-- Backfill grupo_custo from plano de contas for remaining records where possible
UPDATE public.financeiro_lancamentos_v2 l
SET grupo_custo = p.grupo_custo
FROM public.financeiro_plano_contas p
WHERE l.grupo_custo IS NULL
  AND l.cancelado = false
  AND p.subcentro = l.subcentro
  AND p.ativo = true
  AND p.grupo_custo IS NOT NULL;

-- Re-enable trigger
ALTER TABLE public.financeiro_lancamentos_v2 ENABLE TRIGGER trg_resolve_classificacao_plano;
