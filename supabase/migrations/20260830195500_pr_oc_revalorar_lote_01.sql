-- PR-OC-VENDA-REALIZADO-02 — o realizado corrige o rebanho sozinho.
--
-- ⚠ VERSIONAMENTO DE ALGO JA APLICADO. Registro 20260830195020. Funcao NOVA: nao ha
-- fonte anterior no repositorio, entao o corpo veio do SQL do arquiteto e foi conferido
-- pelo oraculo — md5 375b2b5dde343bca4a8e1ec5fbb517b4, 4087 caracteres.
--
-- POR QUE ELA PRECISOU EXISTIR. A FASE 0 mediu duas metades e achou UMA:
--   (a) `oc_salvar_lotes` JA tem o caminho de revalorar lote com movimentacao viva — o
--       "CAMINHO B", que aceita mexer so' no economico (`criterio_valor`,
--       `valor_informado`) e recusa categoria/quantidade/peso. Essa metade existia, e o
--       briefing supunha que nao.
--   (b) NADA propagava o valor novo ao LANCAMENTO ZOOTECNICO ja criado. Medido: nenhuma
--       trigger em `zoo_operacao_lotes`, nenhuma RPC com `UPDATE public.lancamentos`
--       tocando `valor_total`. `oc_registrar_movimentacao` grava o valor UMA VEZ, na
--       entrega (`por_cabeca x quantidade`), e nunca mais volta la'.
-- Sem (b), revalorar o lote no acerto do abate deixaria o rebanho com o valor da
-- PROJECAO enquanto o lote teria o REAL — dois numeros para o mesmo animal.
--
-- A decisao do Gabriel foi explicita: o rebanho corrige sozinho. Esta funcao faz as duas
-- metades numa transacao, pela MESMA formula do registro original — nao ha segunda regra
-- de valor por cabeca.
--
-- ⚠ SO' OS LANCAMENTOS VIVOS DO PROPRIO LOTE: o UPDATE junta por
-- `zoo_operacao_movimentacoes` (`movimentacao_id` -> `lancamentos.id`,
-- `operacao_lote_id` -> o lote) e ignora cancelados. Um lote com dois recebimentos
-- corrige os dois — e o 1:1 de hoje e' circunstancial, como a propria
-- `oc_registrar_movimentacao` ja avisa no corpo.
-- ⚠ `criterio_valor = 'total'` porque o valor que chega E' o total do lote: manter 'kg'
-- ou 'cabeca' faria o `valor_informado` ser reinterpretado pela formula antiga.
-- ⚠ Motivo OBRIGATORIO e evento com antes/depois/afetados — a correcao do rebanho tem de
-- ser auditavel, e `lancamentos_afetados` e' o numero que diz se ela alcancou algo.

CREATE OR REPLACE FUNCTION public.oc_revalorar_lote(p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_lote_id uuid, p_novo_valor numeric, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_is_service boolean := (coalesce(auth.role(),'') = 'service_role');
  v_is_admin boolean; v_tem_acesso boolean;
  v_op public.zoo_operacoes_comerciais; v_lote public.zoo_operacao_lotes;
  v_por_cab numeric; v_afetados int; v_nova int;
BEGIN
  v_is_admin := (v_actor IS NOT NULL AND public.is_admin_agroinblue(v_actor));
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.cliente_id <> p_cliente_id THEN RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;
  v_tem_acesso := (v_actor IS NOT NULL AND v_op.cliente_id IN (SELECT public.get_user_cliente_ids(v_actor)));
  IF NOT (v_is_service OR v_is_admin OR v_tem_acesso) THEN RAISE EXCEPTION 'Sem permissao nesta operacao' USING ERRCODE = '42501'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'Revalorizacao exige motivo' USING ERRCODE = 'P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  IF v_op.rascunho THEN RAISE EXCEPTION 'Operacao em rascunho' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'Operacao cancelada; recupere-a antes' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_lote FROM public.zoo_operacao_lotes WHERE id = p_lote_id AND operacao_id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote % nao encontrado nesta operacao', p_lote_id USING ERRCODE = 'P0001'; END IF;
  IF p_novo_valor IS NULL OR p_novo_valor <= 0 THEN RAISE EXCEPTION 'Novo valor deve ser maior que zero' USING ERRCODE = 'P0001'; END IF;
  IF COALESCE(v_lote.qtd_negociada, 0) <= 0 THEN RAISE EXCEPTION 'Lote sem quantidade negociada' USING ERRCODE = 'P0001'; END IF;
  IF round(p_novo_valor, 2) = round(COALESCE(v_lote.valor_informado, 0), 2) THEN
    RETURN jsonb_build_object('ok', true, 'idempotente', true, 'operacao_id', p_operacao_id, 'operacao_versao', v_op.versao,
      'lote_id', p_lote_id, 'valor_informado', v_lote.valor_informado, 'lancamentos_afetados', 0); END IF;

  -- O SIM do produtor: o realizado corrige o rebanho sozinho. O valor novo do lote
  -- propaga aos lancamentos zootecnicos VIVOS do proprio lote (via movimentacoes),
  -- pela mesma formula do registro original: por_cabeca x quantidade.
  v_por_cab := p_novo_valor / v_lote.qtd_negociada;
  UPDATE public.zoo_operacao_lotes SET valor_informado = round(p_novo_valor, 2), criterio_valor = 'total', updated_at = now(), updated_by = v_actor WHERE id = p_lote_id;
  UPDATE public.lancamentos l SET valor_total = round(v_por_cab * l.quantidade, 2)
    FROM public.zoo_operacao_movimentacoes m
   WHERE m.movimentacao_id = l.id AND m.operacao_lote_id = p_lote_id AND m.operacao_id = p_operacao_id
     AND l.cancelado IS NOT TRUE;
  GET DIAGNOSTICS v_afetados = ROW_COUNT;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'revalorar_lote', to_jsonb(v_lote),
          jsonb_build_object('motivo', p_motivo, 'lote_id', p_lote_id,
            'valor_anterior', v_lote.valor_informado, 'valor_novo', round(p_novo_valor, 2),
            'lancamentos_afetados', v_afetados,
            'versao_anterior', v_op.versao, 'versao_nova', v_op.versao + 1),
          v_actor, 'rpc');
  UPDATE public.zoo_operacoes_comerciais SET versao = versao + 1, updated_at = now(), updated_by = v_actor WHERE id = p_operacao_id;
  SELECT versao INTO v_nova FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;
  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'operacao_versao', v_nova,
    'lote_id', p_lote_id, 'valor_anterior', v_lote.valor_informado, 'valor_informado', round(p_novo_valor, 2),
    'lancamentos_afetados', v_afetados);
END;
$function$;
