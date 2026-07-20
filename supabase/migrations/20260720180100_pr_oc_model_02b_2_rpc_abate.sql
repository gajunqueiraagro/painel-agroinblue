-- PR-OC-MODEL-02B parte 2 — wiring dos campos de abate em oc_salvar_rascunho (ADR-2026-16 D3.B).
--   Base = cópia VERBATIM da versão vigente no banco (corpo 7.561 chars; contém numero_documento
--   e _oc_aplicar_partes). Adições exclusivas:
--     (a) 7 campos no INSERT e no CASE do UPDATE (preservam valor atual quando a chave é omitida);
--     (b) guarda de aplicabilidade: os 6 campos exclusivos de abate são recusados quando
--         tipo_operacao <> 'abate'; modalidade_comercial é recusada em compra (aceita em abate/venda).
--   Nenhuma outra alteração de comportamento.
-- NÃO aplicar por este PR (aplicação é etapa separada sob autorização).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.oc_salvar_rascunho(p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_id uuid; v_nome text; v_mov text; v_completo boolean; v_peso jsonb;
  v_tipo_efetivo text;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501';
  END IF;
  v_nome := public.resolver_nome_usuario(v_actor);

  -- Aplicabilidade dos campos estruturados de abate (ADR-2026-16 Decisao 3.B).
  --   tipo_operacao efetivo: no create vem do payload; no update, o payload sobrepoe o existente.
  IF p_operacao_id IS NULL THEN
    v_tipo_efetivo := p_payload->>'tipo_operacao';
  ELSE
    SELECT o.tipo_operacao INTO v_tipo_efetivo
      FROM public.zoo_operacoes_comerciais o WHERE o.id = p_operacao_id AND o.cliente_id = p_cliente_id;
    v_tipo_efetivo := COALESCE(p_payload->>'tipo_operacao', v_tipo_efetivo);
  END IF;
  IF v_tipo_efetivo IS DISTINCT FROM 'abate' THEN
    IF p_payload ? 'tipo_peso'             THEN RAISE EXCEPTION 'Campo tipo_peso exclusivo de operacao de abate' USING ERRCODE = 'P0001'; END IF;
    IF p_payload ? 'rendimento_carcaca'    THEN RAISE EXCEPTION 'Campo rendimento_carcaca exclusivo de operacao de abate' USING ERRCODE = 'P0001'; END IF;
    IF p_payload ? 'peso_carcaca_kg_total' THEN RAISE EXCEPTION 'Campo peso_carcaca_kg_total exclusivo de operacao de abate' USING ERRCODE = 'P0001'; END IF;
    IF p_payload ? 'peso_carcaca_fonte'    THEN RAISE EXCEPTION 'Campo peso_carcaca_fonte exclusivo de operacao de abate' USING ERRCODE = 'P0001'; END IF;
    IF p_payload ? 'data_embarque'         THEN RAISE EXCEPTION 'Campo data_embarque exclusivo de operacao de abate' USING ERRCODE = 'P0001'; END IF;
    IF p_payload ? 'data_abate'            THEN RAISE EXCEPTION 'Campo data_abate exclusivo de operacao de abate' USING ERRCODE = 'P0001'; END IF;
  END IF;
  IF (p_payload ? 'modalidade_comercial') AND v_tipo_efetivo = 'compra' THEN
    RAISE EXCEPTION 'Campo modalidade_comercial nao se aplica a operacao de compra' USING ERRCODE = 'P0001';
  END IF;

  IF p_operacao_id IS NULL THEN
    INSERT INTO public.zoo_operacoes_comerciais (
      cliente_id, fazenda_id, tipo_operacao, data_operacao, responsavel, responsavel_nome_snapshot,
      cenario, contraparte_id, tipo_precificacao, preco_unitario, condicao_pagamento, data_pagamento_prevista,
      qtd_negociada, categoria_negociada, peso_medio_negociado_kg, peso_total_negociado_kg, peso_negociado_soberano,
      valor_estimado, valor_acordado, numero_documento,
      data_embarque, data_abate, modalidade_comercial, tipo_peso, rendimento_carcaca, peso_carcaca_kg_total, peso_carcaca_fonte,
      observacoes, status_comercial, rascunho, status_financeiro, versao, created_by, updated_by)
    VALUES (
      p_cliente_id, NULLIF(p_payload->>'fazenda_id','')::uuid, p_payload->>'tipo_operacao', (p_payload->>'data_operacao')::date,
      v_nome, v_nome, COALESCE(p_payload->>'cenario','realizado'), NULLIF(p_payload->>'contraparte_id','')::uuid,
      p_payload->>'tipo_precificacao', NULLIF(p_payload->>'preco_unitario','')::numeric,
      p_payload->>'condicao_pagamento', NULLIF(p_payload->>'data_pagamento_prevista','')::date,
      NULLIF(p_payload->>'qtd_negociada','')::integer, p_payload->>'categoria_negociada',
      NULLIF(p_payload->>'peso_medio_negociado_kg','')::numeric, NULLIF(p_payload->>'peso_total_negociado_kg','')::numeric,
      NULLIF(p_payload->>'peso_negociado_soberano',''),
      NULLIF(p_payload->>'valor_estimado','')::numeric, NULLIF(p_payload->>'valor_acordado','')::numeric,
      p_payload->>'numero_documento',
      NULLIF(p_payload->>'data_embarque','')::date, NULLIF(p_payload->>'data_abate','')::date,
      p_payload->>'modalidade_comercial', p_payload->>'tipo_peso',
      NULLIF(p_payload->>'rendimento_carcaca','')::numeric, NULLIF(p_payload->>'peso_carcaca_kg_total','')::numeric,
      p_payload->>'peso_carcaca_fonte',
      p_payload->>'observacoes', 'programada', true, 'nao_aplicavel', 1, v_actor, v_actor)
    RETURNING id INTO v_id;
    FOR v_mov IN SELECT value FROM jsonb_array_elements_text(COALESCE(p_payload->'movimentacoes','[]'::jsonb))
    LOOP
      INSERT INTO public.zoo_operacao_movimentacoes (cliente_id, operacao_id, movimentacao_id, created_by)
      VALUES (p_cliente_id, v_id, v_mov::uuid, v_actor);
    END LOOP;
    PERFORM public._oc_aplicar_partes(v_id, p_cliente_id, COALESCE(p_payload->'partes','[]'::jsonb));
    INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
    VALUES (p_cliente_id, v_id, 'criar_rascunho', p_payload, v_actor, 'rpc');
    p_operacao_id := v_id;
  ELSE
    SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
      WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
    IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'Operacao cancelada nao pode ser editada' USING ERRCODE = 'P0001'; END IF;
    IF v_op.status_comercial = 'fechada' THEN RAISE EXCEPTION 'Negociacao fechada; reabra para editar (oc_reabrir)' USING ERRCODE = 'P0001'; END IF;
    IF v_op.versao <> p_versao_esperada THEN
      RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
    UPDATE public.zoo_operacoes_comerciais SET
      fazenda_id              = CASE WHEN p_payload ? 'fazenda_id' THEN NULLIF(p_payload->>'fazenda_id','')::uuid ELSE fazenda_id END,
      tipo_operacao           = COALESCE(p_payload->>'tipo_operacao', tipo_operacao),
      data_operacao           = COALESCE(NULLIF(p_payload->>'data_operacao','')::date, data_operacao),
      contraparte_id          = CASE WHEN p_payload ? 'contraparte_id' THEN NULLIF(p_payload->>'contraparte_id','')::uuid ELSE contraparte_id END,
      tipo_precificacao       = CASE WHEN p_payload ? 'tipo_precificacao' THEN p_payload->>'tipo_precificacao' ELSE tipo_precificacao END,
      preco_unitario          = CASE WHEN p_payload ? 'preco_unitario' THEN NULLIF(p_payload->>'preco_unitario','')::numeric ELSE preco_unitario END,
      condicao_pagamento      = CASE WHEN p_payload ? 'condicao_pagamento' THEN p_payload->>'condicao_pagamento' ELSE condicao_pagamento END,
      data_pagamento_prevista = CASE WHEN p_payload ? 'data_pagamento_prevista' THEN NULLIF(p_payload->>'data_pagamento_prevista','')::date ELSE data_pagamento_prevista END,
      qtd_negociada           = CASE WHEN p_payload ? 'qtd_negociada' THEN NULLIF(p_payload->>'qtd_negociada','')::integer ELSE qtd_negociada END,
      categoria_negociada     = CASE WHEN p_payload ? 'categoria_negociada' THEN p_payload->>'categoria_negociada' ELSE categoria_negociada END,
      peso_medio_negociado_kg = CASE WHEN p_payload ? 'peso_medio_negociado_kg' THEN NULLIF(p_payload->>'peso_medio_negociado_kg','')::numeric ELSE peso_medio_negociado_kg END,
      peso_total_negociado_kg = CASE WHEN p_payload ? 'peso_total_negociado_kg' THEN NULLIF(p_payload->>'peso_total_negociado_kg','')::numeric ELSE peso_total_negociado_kg END,
      peso_negociado_soberano = CASE WHEN p_payload ? 'peso_negociado_soberano' THEN NULLIF(p_payload->>'peso_negociado_soberano','') ELSE peso_negociado_soberano END,
      valor_estimado          = CASE WHEN p_payload ? 'valor_estimado' THEN NULLIF(p_payload->>'valor_estimado','')::numeric ELSE valor_estimado END,
      valor_acordado          = CASE WHEN p_payload ? 'valor_acordado' THEN NULLIF(p_payload->>'valor_acordado','')::numeric ELSE valor_acordado END,
      numero_documento        = CASE WHEN p_payload ? 'numero_documento' THEN p_payload->>'numero_documento' ELSE numero_documento END,
      data_embarque           = CASE WHEN p_payload ? 'data_embarque' THEN NULLIF(p_payload->>'data_embarque','')::date ELSE data_embarque END,
      data_abate              = CASE WHEN p_payload ? 'data_abate' THEN NULLIF(p_payload->>'data_abate','')::date ELSE data_abate END,
      modalidade_comercial    = CASE WHEN p_payload ? 'modalidade_comercial' THEN p_payload->>'modalidade_comercial' ELSE modalidade_comercial END,
      tipo_peso               = CASE WHEN p_payload ? 'tipo_peso' THEN p_payload->>'tipo_peso' ELSE tipo_peso END,
      rendimento_carcaca      = CASE WHEN p_payload ? 'rendimento_carcaca' THEN NULLIF(p_payload->>'rendimento_carcaca','')::numeric ELSE rendimento_carcaca END,
      peso_carcaca_kg_total   = CASE WHEN p_payload ? 'peso_carcaca_kg_total' THEN NULLIF(p_payload->>'peso_carcaca_kg_total','')::numeric ELSE peso_carcaca_kg_total END,
      peso_carcaca_fonte      = CASE WHEN p_payload ? 'peso_carcaca_fonte' THEN p_payload->>'peso_carcaca_fonte' ELSE peso_carcaca_fonte END,
      observacoes             = CASE WHEN p_payload ? 'observacoes' THEN p_payload->>'observacoes' ELSE observacoes END,
      versao = versao + 1, updated_at = now(), updated_by = v_actor
    WHERE id = p_operacao_id;
    PERFORM public._oc_aplicar_partes(p_operacao_id, p_cliente_id, COALESCE(p_payload->'partes','[]'::jsonb));
    INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, dados_novos, usuario_id, origem)
    VALUES (p_cliente_id, p_operacao_id, 'salvar_rascunho', to_jsonb(v_op), p_payload, v_actor, 'rpc');
  END IF;

  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;
  IF v_op.qtd_negociada IS NOT NULL AND (v_op.peso_medio_negociado_kg IS NOT NULL OR v_op.peso_total_negociado_kg IS NOT NULL) THEN
    v_peso := public._oc_conciliar_peso(v_op.qtd_negociada, v_op.peso_medio_negociado_kg, v_op.peso_total_negociado_kg);
    UPDATE public.zoo_operacoes_comerciais
      SET peso_medio_negociado_kg = NULLIF(v_peso->>'medio','')::numeric,
          peso_total_negociado_kg = NULLIF(v_peso->>'total','')::numeric
    WHERE id = p_operacao_id;
  END IF;

  SELECT (o.fazenda_id IS NOT NULL AND o.tipo_operacao IS NOT NULL AND o.contraparte_id IS NOT NULL
          AND o.data_operacao IS NOT NULL AND o.qtd_negociada IS NOT NULL AND o.categoria_negociada IS NOT NULL
          AND o.tipo_precificacao IS NOT NULL AND o.preco_unitario IS NOT NULL)
    INTO v_completo FROM public.zoo_operacoes_comerciais o WHERE o.id = p_operacao_id;
  UPDATE public.zoo_operacoes_comerciais SET rascunho = NOT v_completo WHERE id = p_operacao_id;

  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;
  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao,
    'status_comercial', v_op.status_comercial, 'rascunho', v_op.rascunho, 'valor_total', v_op.valor_total);
END;
$function$;
