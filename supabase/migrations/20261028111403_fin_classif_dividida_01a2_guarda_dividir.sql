-- FIN-CLASSIF-DIVIDIDA-01a-2 — SEG-DRE-TENANT-01: a funcao exposta `fn_lancamento_dividir` tem a guarda de cliente no PROPRIO corpo
-- (pelo cliente da linha: tenant_ok + 42501), e nao so' no nucleo `_fn_fin_dividir`. Mesmo comportamento.
CREATE OR REPLACE FUNCTION public.fn_lancamento_dividir(p_lancamento_id uuid, p_partes jsonb, p_motivo text, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce(public.tenant_ok((SELECT l.cliente_id FROM public.financeiro_lancamentos_v2 l WHERE l.id = p_lancamento_id)), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Você não tem acesso a este lançamento.', DETAIL = p_lancamento_id::text;
  END IF;
  RETURN public._fn_fin_dividir(p_lancamento_id, p_partes, 'manual', 'dividir', p_motivo, p_simular);
END $$;
