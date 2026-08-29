-- PR-OC-FIX-EXCLUIR-LOG-TIPO-01
--
-- `oc_excluir_definitivamente` gravava o literal 'compra' na coluna `modulo` do
-- `audit_log`. Hoje nao mente, porque as 32 operacoes comerciais sao todas de compra —
-- mas mente no dia em que a venda entrar na OC, e o log e' justamente o que sobra
-- depois que a operacao e' apagada.
--
-- ⚠ `audit_log.modulo` E' O TIPO DO LANCAMENTO, e nao um nome de modulo. Medido:
-- financeiro, morte, reclassificacao, compra, abate, nascimento, chuva, consumo, venda,
-- transferencia, saldo_inicial, zootecnico. 'venda' e 'abate' JA sao valores em uso,
-- com as mesmas acoes (criou/editou/cancelou/excluiu) — entao `v_op.tipo_operacao`
-- encaixa na taxonomia existente em vez de criar uma nova.
--
-- ⚠ CORPO VIGENTE, ALTERADO EM UM PONTO SO'. Transcrito de `pg_get_functiondef` e
-- conferido por md5 ANTES da alteracao:
--     f8fae5809363ea89fff691ddc6c1d19a · 6041 bytes
-- O literal casava EXATAMENTE UMA VEZ (medido), e nenhum outro campo do log assume o
-- tipo: `resumo` e' o motivo digitado e `dados_anteriores` e' o snapshot da operacao.
--
-- Nada mais muda: nem as guardas, nem o que se apaga, nem o retorno.

CREATE OR REPLACE FUNCTION public.oc_excluir_definitivamente(p_operacao_id uuid, p_cliente_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_is_service boolean;
  v_op public.zoo_operacoes_comerciais;
  v_mov_ativa int; v_titulo_ativo int; v_liq_ativa int; v_concil_ativa int;
  v_impedimentos text;
  v_n_lotes int; v_n_compromissos int; v_n_documentos int; v_n_liquidacoes int;
  v_n_movimentacoes int; v_n_partes int; v_n_eventos int;
  v_n_programacoes int; v_n_parcelas int; v_n_doc_comp int; v_n_doc_lotes int;
  v_removidos jsonb; v_snapshot jsonb;
BEGIN
  v_is_service := (COALESCE(auth.role(), '') = 'service_role');
  IF NOT (v_is_service OR (v_actor IS NOT NULL AND public.is_admin_agroinblue(v_actor))) THEN
    RAISE EXCEPTION 'Exclusao definitiva e restrita a administrador.' USING ERRCODE = '42501'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Exclusao exige motivo' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.status_comercial IS DISTINCT FROM 'cancelada' THEN
    RAISE EXCEPTION 'Somente operacao CANCELADA pode ser excluida (estado atual: %).', v_op.status_comercial
      USING ERRCODE = 'P0001'; END IF;
  SELECT count(*) INTO v_mov_ativa FROM public.zoo_operacao_movimentacoes m
    JOIN public.lancamentos l ON l.id = m.movimentacao_id
   WHERE m.operacao_id = p_operacao_id AND l.cancelado IS NOT TRUE;
  SELECT count(*) INTO v_titulo_ativo FROM public.zoo_operacao_partes p
    JOIN public.financeiro_lancamentos_v2 fl ON fl.id = p.financeiro_lancamento_id
   WHERE p.operacao_id = p_operacao_id AND p.financeiro_lancamento_id IS NOT NULL AND fl.cancelado IS NOT TRUE;
  SELECT count(*) INTO v_liq_ativa FROM public.zoo_operacao_liquidacoes lq
   WHERE lq.operacao_id = p_operacao_id AND lq.estornado IS NOT TRUE;
  SELECT count(*) INTO v_concil_ativa FROM public.conciliacao_bancaria_itens cbi
    JOIN public.zoo_operacao_partes p ON p.financeiro_lancamento_id = cbi.lancamento_id
   WHERE p.operacao_id = p_operacao_id AND cbi.desfeito_em IS NULL;
  IF v_mov_ativa > 0 OR v_titulo_ativo > 0 OR v_liq_ativa > 0 OR v_concil_ativa > 0 THEN
    v_impedimentos := array_to_string(ARRAY[
      CASE WHEN v_mov_ativa    > 0 THEN v_mov_ativa    || ' movimentacao(oes) com lancamento zootecnico ativo' END,
      CASE WHEN v_titulo_ativo > 0 THEN v_titulo_ativo || ' titulo(s) financeiro(s) ativo(s)' END,
      CASE WHEN v_liq_ativa    > 0 THEN v_liq_ativa    || ' liquidacao(oes) nao estornada(s)' END,
      CASE WHEN v_concil_ativa > 0 THEN v_concil_ativa || ' conciliacao(oes) bancaria(s) ativa(s)' END], ', ');
    RAISE EXCEPTION 'Exclusao bloqueada: a operacao ainda tem efeitos ativos (%). Estorne esses efeitos antes de excluir.', v_impedimentos
      USING ERRCODE = 'P0001'; END IF;
  SELECT count(*) INTO v_n_lotes         FROM public.zoo_operacao_lotes         WHERE operacao_id = p_operacao_id;
  SELECT count(*) INTO v_n_compromissos  FROM public.zoo_operacao_compromissos  WHERE operacao_id = p_operacao_id;
  SELECT count(*) INTO v_n_documentos    FROM public.zoo_operacao_documentos    WHERE operacao_id = p_operacao_id;
  SELECT count(*) INTO v_n_liquidacoes   FROM public.zoo_operacao_liquidacoes   WHERE operacao_id = p_operacao_id;
  SELECT count(*) INTO v_n_movimentacoes FROM public.zoo_operacao_movimentacoes WHERE operacao_id = p_operacao_id;
  SELECT count(*) INTO v_n_partes        FROM public.zoo_operacao_partes        WHERE operacao_id = p_operacao_id;
  SELECT count(*) INTO v_n_eventos       FROM public.zoo_operacao_eventos       WHERE operacao_id = p_operacao_id;
  SELECT count(*) INTO v_n_programacoes  FROM public.zoo_operacao_programacoes pr
    JOIN public.zoo_operacao_compromissos c ON c.id = pr.compromisso_id WHERE c.operacao_id = p_operacao_id;
  SELECT count(*) INTO v_n_parcelas      FROM public.zoo_operacao_parcelas_programacao pp
    JOIN public.zoo_operacao_programacoes pr ON pr.id = pp.programacao_id
    JOIN public.zoo_operacao_compromissos c ON c.id = pr.compromisso_id WHERE c.operacao_id = p_operacao_id;
  SELECT count(*) INTO v_n_doc_comp      FROM public.zoo_operacao_documento_componentes dc
    JOIN public.zoo_operacao_documentos d ON d.id = dc.documento_id WHERE d.operacao_id = p_operacao_id;
  SELECT count(*) INTO v_n_doc_lotes     FROM public.zoo_operacao_documento_lotes dl
    JOIN public.zoo_operacao_documentos d ON d.id = dl.documento_id WHERE d.operacao_id = p_operacao_id;
  v_removidos := jsonb_build_object(
    'zoo_operacao_lotes', v_n_lotes, 'zoo_operacao_compromissos', v_n_compromissos,
    'zoo_operacao_documentos', v_n_documentos, 'zoo_operacao_liquidacoes', v_n_liquidacoes,
    'zoo_operacao_movimentacoes', v_n_movimentacoes, 'zoo_operacao_partes', v_n_partes,
    'zoo_operacao_eventos', v_n_eventos, 'zoo_operacao_programacoes', v_n_programacoes,
    'zoo_operacao_parcelas_programacao', v_n_parcelas,
    'zoo_operacao_documento_componentes', v_n_doc_comp, 'zoo_operacao_documento_lotes', v_n_doc_lotes);
  v_snapshot := jsonb_build_object('operacao', to_jsonb(v_op), 'removidos', v_removidos, 'motivo', btrim(p_motivo));
  INSERT INTO public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores)
  VALUES (p_cliente_id, v_op.fazenda_id, v_actor, v_op.tipo_operacao, 'excluir_operacao_definitivamente',
          'zoo_operacoes_comerciais', p_operacao_id, btrim(p_motivo), v_snapshot);
  DELETE FROM public.zoo_operacao_eventos WHERE operacao_id = p_operacao_id;
  DELETE FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id AND cliente_id = p_cliente_id;
  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'removidos', v_removidos);
END;
$function$
;
