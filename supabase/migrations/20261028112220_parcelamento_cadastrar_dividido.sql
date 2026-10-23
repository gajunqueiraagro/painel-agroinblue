-- NOTA-CONTAS-NA-CRIACAO-01 · A (P77, Gabriel 23/10/2026) — a aba "Contas" dos Itens da nota tambem no NOVO lancamento: a divisao
-- escolhida antes de salvar e' gravada junto com a criacao, sem ficar pela metade. No PARCELADO isso e' uma transacao so': esta funcao
-- chama as DUAS que ja' existem — `fn_parcelamento_cadastrar` (pai, N parcelas e N lancamentos) e `fn_financiamento_dividir_classificacao`
-- (a divisao no cadastro: todas as parcelas na mesma proporcao, por percentual) — dentro da MESMA chamada. Se a divisao recusar (conta
-- inativa, de outro tipo, percentuais que nao somam 100, motivo vazio, mes fechado), a excecao desfaz o cadastro inteiro: nada nasce.
-- SECURITY INVOKER: cada uma das duas faz a sua guarda (`tenant_ok`) como sempre; esta nao amplia nada.
SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.fn_parcelamento_cadastrar_dividido(p_payload jsonb, p_partes jsonb, p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_fin uuid;
BEGIN
  IF p_partes IS NULL OR jsonb_typeof(p_partes) <> 'array' OR jsonb_array_length(p_partes) < 2 THEN
    RAISE EXCEPTION USING MESSAGE = 'A divisão precisa de pelo menos duas contas. Nada foi criado.';
  END IF;
  v_fin := public.fn_parcelamento_cadastrar(p_payload);
  PERFORM public.fn_financiamento_dividir_classificacao(v_fin, p_partes, p_motivo, false);
  RETURN v_fin;
END $$;

REVOKE ALL ON FUNCTION public.fn_parcelamento_cadastrar_dividido(jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_parcelamento_cadastrar_dividido(jsonb, jsonb, text) TO authenticated, service_role;
