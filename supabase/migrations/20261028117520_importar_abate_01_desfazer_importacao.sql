-- IMPORTAR-ABATE-01 · F1 (D7, Gabriel 07/11 08:49): o caminho de volta da importacao do abate (regra soberana: tudo que se cria se desfaz).
-- oc_desfazer_importacao(p_operacao_id, p_motivo, p_simular default true):
--   - so' OC que nasceu da importacao (evento 'importar_abate' da 117510) e ainda viva;
--   - recusa se o recebimento ja' foi pago/conciliado (dinheiro no banco: isso se desfaz pela OC, nao por aqui);
--   - pelas RPCs da tela: `oc_cancelar` (no modelo conta corrente cancela entregas, deducoes, o recebimento e as saidas do rebanho,
--     tudo com motivo; nada se apaga) e `oc_documento_cancelar` em cada documento vivo (a chave da NF fica livre para importar de novo);
--   - trilha: evento 'desfazer_importacao' (aponta o evento da importacao);
--   - p_simular: faz tudo num sub-bloco que se desfaz (ZG002) e devolve o mesmo relatorio. Nada fica.
-- Medido no ensaio (07/11): o `oc_cancelar` direto, sem estornar as saidas antes, e' o caminho que a RPC aceita (estornar a saida de OC
-- fechada recusa; reabrir depois de cancelar recusa).
SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.oc_desfazer_importacao(p_operacao_id uuid, p_motivo text, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_op public.zoo_operacoes_comerciais;
  v_ev uuid; v_pago int; r jsonb; d record; v_docs int := 0; v_res jsonb; v_det text;
BEGIN
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF NOT public.tenant_ok(v_op.cliente_id) THEN
    RAISE EXCEPTION 'Desfazer a importacao: sem acesso a este cliente' USING ERRCODE = '42501'; END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Desfazer a importacao: informe o motivo' USING ERRCODE = 'P0001'; END IF;
  SELECT e.id INTO v_ev FROM public.zoo_operacao_eventos e
   WHERE e.operacao_id = p_operacao_id AND e.acao = 'importar_abate' ORDER BY e.created_at DESC LIMIT 1;
  IF v_ev IS NULL THEN
    RAISE EXCEPTION 'Desfazer a importacao: esta OC nao nasceu da importacao do abate' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Desfazer a importacao: esta OC ja'' esta'' cancelada' USING ERRCODE = 'P0001'; END IF;
  SELECT count(*) INTO v_pago FROM public.zoo_operacao_partes pt JOIN public.financeiro_lancamentos_v2 l ON l.id = pt.financeiro_lancamento_id
   WHERE pt.operacao_id = p_operacao_id AND NOT pt.cancelada AND pt.componente = 'recebimento' AND NOT l.cancelado
     AND l.status_transacao IN ('realizado', 'conciliado');
  IF v_pago > 0 THEN
    RAISE EXCEPTION 'Desfazer a importacao: o recebimento ja'' foi pago ou conciliado; desfaca pela OC' USING ERRCODE = 'P0001'; END IF;

  BEGIN
    r := public.oc_cancelar(p_operacao_id, v_op.cliente_id, v_op.versao, btrim(p_motivo));
    FOR d IN SELECT id FROM public.zoo_operacao_documentos WHERE operacao_id = p_operacao_id AND NOT cancelado ORDER BY uploaded_em, id LOOP
      PERFORM public.oc_documento_cancelar(d.id, v_op.cliente_id, btrim(p_motivo));
      v_docs := v_docs + 1;
    END LOOP;
    INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
    VALUES (v_op.cliente_id, p_operacao_id, 'desfazer_importacao',
            jsonb_build_object('frente', 'IMPORTAR-ABATE-01', 'motivo', btrim(p_motivo), 'desfaz', v_ev, 'documentos', v_docs),
            auth.uid(), 'oc_desfazer_importacao');
    v_res := jsonb_build_object('ok', true, 'simulado', p_simular IS NOT FALSE, 'operacao_id', p_operacao_id,
               'status_comercial', (SELECT status_comercial FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id),
               'documentos_cancelados', v_docs,
               'partes_canceladas', (SELECT count(*) FROM public.zoo_operacao_partes WHERE operacao_id = p_operacao_id AND cancelada),
               'saidas_canceladas', (SELECT count(*) FROM public.zoo_operacao_movimentacoes m JOIN public.lancamentos l ON l.id = m.movimentacao_id
                                      WHERE m.operacao_id = p_operacao_id AND l.cancelado));
    IF p_simular IS NOT FALSE THEN
      RAISE EXCEPTION USING ERRCODE = 'ZG002', MESSAGE = 'previa', DETAIL = v_res::text;
    END IF;
  EXCEPTION WHEN SQLSTATE 'ZG002' THEN
    GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
    RETURN v_det::jsonb;
  END;
  RETURN v_res;
END
$function$;

REVOKE ALL ON FUNCTION public.oc_desfazer_importacao(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_desfazer_importacao(uuid, text, boolean) TO authenticated;
