-- PR-OC-VENDA-ACABAMENTO (B-10 item 1) — o denormalizado acompanha a revalorizacao.
--
-- ⚠ VERSIONAMENTO DE ALGO JA APLICADO. Registro 20260831125029.
--
-- O DEFEITO, medido em B-08. `zoo_operacoes_comerciais.valor_acordado` NAO e' uma fonte
-- independente: e' o DENORMALIZADO da soma de `zoo_operacao_lotes.valor_informado`, e quem
-- o mantinha era so' `oc_salvar_lotes` (3 mencoes) e `oc_salvar_rascunho` (8). Esta funcao
-- nao o mencionava NENHUMA vez.
-- Consequencia: aplicar o realizado do boitel subia o lote para o valor real — que e' o
-- que a doutrina dos dois mundos quer — e deixava `valor_acordado` na PROJECAO. Quem lia o
-- denormalizado (a Central, coluna Valor) mostrava a promessa; quem lia o lote (card do
-- lote, resumo lateral, rebanho) mostrava o fato. Foi o que o produtor pegou em 31/08.
--
-- ⚠ A CURA E AQUI, E NAO NO LEITOR. Consertar so' a Central deixaria os demais leitores do
-- denormalizado errados, e o proximo leitor nasceria errado tambem. Uma fonte, um escritor.
-- ⚠ SOMA DOS LOTES, e nao `p_novo_valor`: a operacao pode ter mais de um lote, e o
-- denormalizado e' da OPERACAO. Reaproveitar o valor do lote revalorado daria certo por
-- acidente no 1:1 de hoje e erraria no dia em que houvesse dois.
-- ⚠ NO MESMO UPDATE DA VERSAO, e nao num segundo: dois UPDATEs na mesma linha abririam uma
-- janela em que a versao ja subiu e o denormalizado ainda nao — e e' a versao que os
-- clientes usam para saber se o retrato deles vale.
-- ⚠ O SINTOMA SOME SOZINHO se a negociacao for re-salva depois (o `oc_salvar_lotes`
-- recalcula), e foi o que aconteceu entre o print e a medicao. Por isso o diagnostico
-- pediu medir AS DUAS FONTES, nunca so' o sintoma.
--
-- ⚠ RECONSTRUIDA A PARTIR DO REPOSITORIO: corpo de 20260830195500 (md5 375b2b5d...,
-- 4087 caracteres, reconferido nesta sessao) com o UPDATE final trocado pelo que inclui o
-- denormalizado, mais o comentario de duas linhas que o arquiteto pos junto. Nada mais foi
-- tocado. Conferido pelo oraculo — md5 96556ae072016cb78acc0347e0585d9a, 4427 caracteres,
-- byte a byte igual ao aplicado.

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
  -- O denormalizado acompanha: valor_acordado e' a soma dos lotes (oc_salvar_lotes o mantem);
  -- revalorar sem atualiza-lo deixaria Central e demais leitores na projecao (bug pego pelo produtor, 31/08).
  UPDATE public.zoo_operacoes_comerciais SET valor_acordado = (SELECT round(COALESCE(sum(valor_informado),0),2) FROM public.zoo_operacao_lotes WHERE operacao_id = p_operacao_id), versao = versao + 1, updated_at = now(), updated_by = v_actor WHERE id = p_operacao_id;
  SELECT versao INTO v_nova FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;
  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'operacao_versao', v_nova,
    'lote_id', p_lote_id, 'valor_anterior', v_lote.valor_informado, 'valor_informado', round(p_novo_valor, 2),
    'lancamentos_afetados', v_afetados);
END;
$function$;
