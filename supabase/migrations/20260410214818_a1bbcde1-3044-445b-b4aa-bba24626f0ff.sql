
-- Step 1: Backfill dividendos for Vera Ligia Milani
INSERT INTO public.financeiro_dividendos (cliente_id, nome, ativo, ordem_exibicao)
SELECT
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,
  regexp_replace(subcentro, '^Distribuição de Dividendos ', ''),
  true,
  (ROW_NUMBER() OVER (ORDER BY ordem_exibicao) - 1)::int
FROM public.financeiro_plano_contas
WHERE macro_custo = 'Distribuição'
  AND grupo_custo = 'Dividendos'
  AND centro_custo = 'Pessoas'
  AND ativo = true
ON CONFLICT DO NOTHING;

-- Step 2: Disable triggers
ALTER TABLE public.financeiro_lancamentos_v2 DISABLE TRIGGER trg_resolve_classificacao_plano;
ALTER TABLE public.financeiro_lancamentos_v2 DISABLE TRIGGER trg_financeiro_lancamento_v2_editado_manual;
ALTER TABLE public.financeiro_lancamentos_v2 DISABLE TRIGGER trg_financeiro_lancamento_v2_guard_update;
ALTER TABLE public.financeiro_lancamentos_v2 DISABLE TRIGGER trg_guard_mes_fechado_lancamentos_v2;
ALTER TABLE public.financeiro_lancamentos_v2 DISABLE TRIGGER trg_audit_financeiro_v2;

-- Step 3: Unlink lancamentos
UPDATE public.financeiro_lancamentos_v2
SET plano_conta_id = NULL
WHERE plano_conta_id IN (
  SELECT id FROM public.financeiro_plano_contas
  WHERE macro_custo = 'Distribuição'
    AND grupo_custo = 'Dividendos'
    AND centro_custo = 'Pessoas'
);

-- Step 4: Delete physical dividend entries
DELETE FROM public.financeiro_plano_contas
WHERE macro_custo = 'Distribuição'
  AND grupo_custo = 'Dividendos'
  AND centro_custo = 'Pessoas';

-- Step 5: Re-enable all triggers
ALTER TABLE public.financeiro_lancamentos_v2 ENABLE TRIGGER trg_resolve_classificacao_plano;
ALTER TABLE public.financeiro_lancamentos_v2 ENABLE TRIGGER trg_financeiro_lancamento_v2_editado_manual;
ALTER TABLE public.financeiro_lancamentos_v2 ENABLE TRIGGER trg_financeiro_lancamento_v2_guard_update;
ALTER TABLE public.financeiro_lancamentos_v2 ENABLE TRIGGER trg_guard_mes_fechado_lancamentos_v2;
ALTER TABLE public.financeiro_lancamentos_v2 ENABLE TRIGGER trg_audit_financeiro_v2;
