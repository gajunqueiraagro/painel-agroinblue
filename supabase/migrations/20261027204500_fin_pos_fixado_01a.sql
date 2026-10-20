-- FIN-POS-FIXADO-01a (Gabriel 20/10/2026, opcao A): os juros futuros de contrato POS-FIXADO aparecem como ESTIMADOS. A marca e'
-- DERIVADA — nada se grava: pagar, casar ou realizar o lancamento de juros tira a marca sozinho.
--
-- A REGRA (uma so', nesta funcao; espelho em TS `jurosEstimadoPosFixado`, src/lib/financiamentos/jurosPosFixado.ts, presos pelos
-- MESMOS casos): os juros de uma parcela sao estimados quando
--   (1) o contrato e' `tipo_taxa = 'pos'` (pre e nulo nunca);
--   (2) a parcela nao esta' paga nem cancelada (`status` fora de 'pago' e 'cancelado');
--   (3) o lancamento de juros nao esta' realizado nem conciliado.
-- O principal nunca e' estimado.
-- ⚠ `financiamento_parcelas.ajustada` NAO ENTRA: no banco ela significa "editada a' mao, protegida no Regerar" (toda linha mexida por
--   `fn_financiamento_parcelas_editar` a ganha), NAO "valor real informado". Medido em 20/10: as parcelas 2 a 5 do 8.233.040 (RRCC)
--   estao ajustadas e os juros delas sao os do gerador (SAC anual 7,43% a.a.). Lida como "valor real", a regra nao marcaria nada.
--
-- `fn_juros_estimados_do_cliente(cliente)` -> (lancamento_id, financiamento_id, parcela_id): UMA leitura por cliente (a CPR a junta aos
-- estimados da recorrencia num dono so'). `tenant_ok` + 42501 (sem usuario tambem). Nenhuma tabela muda, nenhum dado e' tocado.
SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public._fn_juros_estimado(p_tipo_taxa text, p_status_parcela text, p_status_lancamento text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(p_tipo_taxa, '') = 'pos'
     AND coalesce(p_status_parcela, '') NOT IN ('pago', 'cancelado')
     AND coalesce(p_status_lancamento, '') NOT IN ('realizado', 'conciliado')
$$;
COMMENT ON FUNCTION public._fn_juros_estimado(text, text, text) IS
  'FIN-POS-FIXADO-01a: juros estimados = contrato pos + parcela nao paga e nao cancelada + lancamento de juros nao realizado. '
  '"ajustada" NAO entra: no banco ela significa "editada a mao, protegida no Regerar", nao "valor real informado".';
REVOKE ALL ON FUNCTION public._fn_juros_estimado(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_juros_estimado(text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_juros_estimados_do_cliente(p_cliente_id uuid)
RETURNS TABLE (lancamento_id uuid, financiamento_id uuid, parcela_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF p_cliente_id IS NULL OR NOT coalesce(public.tenant_ok(p_cliente_id), false) THEN
    RAISE EXCEPTION 'sem acesso a este cliente' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT lj.id, f.id, p.id
    FROM public.financiamentos f
    JOIN public.financiamento_parcelas p ON p.financiamento_id = f.id
    JOIN public.financeiro_lancamentos_v2 lj ON lj.id = p.lancamento_juros_id
   WHERE f.cliente_id = p_cliente_id
     AND public._fn_juros_estimado(f.tipo_taxa, p.status, lj.status_transacao);
END $$;
COMMENT ON FUNCTION public.fn_juros_estimados_do_cliente(uuid) IS
  'FIN-POS-FIXADO-01a: os lancamentos de juros ESTIMADOS do cliente (regra em _fn_juros_estimado; ajustada nao entra).';
REVOKE ALL ON FUNCTION public.fn_juros_estimados_do_cliente(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_juros_estimados_do_cliente(uuid) TO authenticated, service_role;
