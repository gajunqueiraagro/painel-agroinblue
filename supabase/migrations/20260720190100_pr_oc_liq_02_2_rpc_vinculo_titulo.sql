-- PR-OC-LIQ-02 parte 2 — integridade do vínculo título↔operação em oc_registrar_liquidacao.
--   Base = cópia VERBATIM da versão vigente (corpo 2.803 chars; contém o bloco de permuta; sem DELETE).
--   Única adição: quando financeiro_lancamento_id é informado, valida com erro controlado P0001 que o
--   título pertence à operação — i.e., existe em zoo_operacao_partes.financeiro_lancamento_id daquela
--   operacao_id (fecha o gap: hoje aceita título de outra operação do mesmo tenant). Vínculo segue
--   OPCIONAL (liquidação pode existir sem título). Nada mais muda: estorno intocado, ACL intocada.
-- NÃO aplicar por este PR (aplicação é etapa separada sob autorização).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.oc_registrar_liquidacao(p_operacao_id uuid, p_cliente_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_forma text := p_payload->>'forma';
  v_nat text := p_payload->>'natureza';
  v_esperada text;
  v_valor numeric := COALESCE(NULLIF(p_payload->>'valor','')::numeric, 0);
  v_perm_val numeric := NULLIF(p_payload->>'permuta_valor_atribuido','')::numeric;
  v_id uuid;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.rascunho OR v_op.status_comercial = 'rascunho' THEN
    RAISE EXCEPTION 'Rascunho (tecnico ou legado) nao permite liquidacao' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'Operacao cancelada' USING ERRCODE = 'P0001'; END IF;
  IF v_valor <= 0 THEN RAISE EXCEPTION 'Valor da liquidacao deve ser > 0' USING ERRCODE = 'P0001'; END IF;
  v_esperada := CASE v_op.tipo_operacao WHEN 'compra' THEN 'pagamento' ELSE 'recebimento' END;
  IF v_nat <> v_esperada THEN
    RAISE EXCEPTION 'Natureza % incompativel com tipo % (esperada %)', v_nat, v_op.tipo_operacao, v_esperada USING ERRCODE = 'P0001'; END IF;
  IF v_forma = 'permuta' AND (v_perm_val IS NULL OR (p_payload->>'permuta_tipo_bem') IS NULL) THEN
    RAISE EXCEPTION 'Permuta exige tipo do bem e valor atribuido' USING ERRCODE = 'P0001'; END IF;
  IF v_forma <> 'permuta' AND (v_perm_val IS NOT NULL OR (p_payload->>'permuta_tipo_bem') IS NOT NULL) THEN
    RAISE EXCEPTION 'Campos de permuta so em forma=permuta' USING ERRCODE = 'P0001'; END IF;

  -- PR-OC-LIQ-02: vinculo, quando informado, deve pertencer a operacao (titulo via partes).
  IF NULLIF(p_payload->>'financeiro_lancamento_id','') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.zoo_operacao_partes pt
        WHERE pt.operacao_id = p_operacao_id
          AND pt.financeiro_lancamento_id = NULLIF(p_payload->>'financeiro_lancamento_id','')::uuid) THEN
    RAISE EXCEPTION 'Titulo financeiro % nao pertence a operacao %', p_payload->>'financeiro_lancamento_id', p_operacao_id USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.zoo_operacao_liquidacoes (
    cliente_id, operacao_id, data, natureza, forma, valor, descricao, observacao, financeiro_lancamento_id,
    permuta_tipo_bem, permuta_descricao_bem, permuta_valor_atribuido, permuta_documento_url, created_by, updated_by)
  VALUES (
    p_cliente_id, p_operacao_id, (p_payload->>'data')::date, v_nat, v_forma, v_valor,
    p_payload->>'descricao', p_payload->>'observacao', NULLIF(p_payload->>'financeiro_lancamento_id','')::uuid,
    p_payload->>'permuta_tipo_bem', p_payload->>'permuta_descricao_bem', v_perm_val, p_payload->>'permuta_documento_url', v_actor, v_actor)
  RETURNING id INTO v_id;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'registrar_liquidacao', p_payload, v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'liquidacao_id', v_id);
END;
$function$;
