-- =====================================================================
-- PR-OC-LOTE-VALOR-01
-- `oc_salvar_lotes` ganha DOIS CAMINHOS. Ate aqui, corrigir o preco de um
-- lote exigia estornar o recebimento inteiro — e o estorno cancela
-- MOVIMENTACAO DE REBANHO, que e alteracao estrutural e bate no guard P1
-- quando o mes ja fechou no Mapa de Pastos. Uma correcao puramente
-- ECONOMICA ficava impossivel sem reabrir o periodo.
--
-- A CAUSA e' a estrategia de escrita, nao o guard: a funcao faz DELETE de
-- todos os lotes e reinsere com ids novos. Com recebimento registrado isso
-- e' impossivel — tres FKs apontam para o lote e DUAS sao ON DELETE
-- RESTRICT (`zoo_operacao_movimentacoes`, `zoo_oc_doc_lote`). O guard do
-- topo apenas dava mensagem legivel para um erro que o banco produziria de
-- qualquer forma.
--
--   CAMINHO A — sem movimentacao: DELETE + INSERT, ids novos. INALTERADO.
--   CAMINHO B — com movimentacao: UPDATE de criterio_valor e
--               valor_informado, casando por (operacao_id, ordem).
--               NENHUM DELETE, ids preservados, FKs intactas.
--
-- ⚠ O CAMINHO B RECUSA QUALQUER MUDANCA FISICA: contagem de lotes,
-- categoria, quantidade e peso. Quem quiser mudar o fisico estorna o
-- recebimento — que e' o que de fato desfaz a movimentacao de rebanho.
-- Deixar passar seria pior que o problema original: o financeiro diria uma
-- coisa e o rebanho outra, sem nada no meio para reconciliar.
--
-- ⚠ A DETECCAO e' cedo, a BIFURCACAO e' tarde. O `EXISTS` de movimentacao
-- fica onde o guard estava, mas so grava uma flag; quem bifurca e' o bloco
-- de escrita. Assim tenant guard, not-found, cancelada, fechada e
-- version-lock ficam EXATAMENTE onde estavam, na mesma ordem, e o payload
-- passa pelas mesmas validacoes nos dois caminhos.
--
-- ⚠ PESO COMPARADO COM `IS DISTINCT FROM`, nao `<>`: `peso_medio` e
-- nullable, e `NULL <> NULL` devolve NULL, que num IF nao dispara. Com `<>`
-- um lote sem peso passaria batido pela verificacao.
--
-- ⚠ `criterio_valor` aceita 'kg', 'cabeca' e 'total' — NAO existe 'arroba'.
-- A lista foi copiada da funcao vigente, nao redigitada de memoria.
--
-- Assinatura e envelope de retorno preservados; nenhum chamador muda.
-- Requer PROTO (binbcdfbisgscrifztia). NUNCA em producao.
-- Base: md5 do corpo vigente 12a5940dc80b6a84a7dddb5ea1fb3362 (5447 chars).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.oc_salvar_lotes(p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_lotes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_lote jsonb;
  v_ordem int; v_crit text; v_qtd int; v_peso numeric; v_valor numeric;
  v_ordens int[] := '{}';
  v_count int := 0;
  v_total_acordado numeric := 0;
  v_total_qtd int := 0;
  v_tem_receb boolean;
  v_lotes_gravados int;
  v_lotes_payload int;
  v_grav public.zoo_operacao_lotes;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'Operacao cancelada nao pode ser editada' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'fechada' THEN RAISE EXCEPTION 'Negociacao fechada; reabra para editar (oc_reabrir)' USING ERRCODE = 'P0001'; END IF;

  /* DETECCAO no lugar do antigo RAISE. A bifurcacao acontece no bloco de
     escrita, mais abaixo — aqui so se registra o fato. */
  v_tem_receb := EXISTS (SELECT 1 FROM public.zoo_operacao_movimentacoes WHERE operacao_id = p_operacao_id);

  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;

  FOR v_lote IN SELECT value FROM jsonb_array_elements(COALESCE(p_lotes, '[]'::jsonb))
  LOOP
    v_ordem := NULLIF(v_lote->>'ordem','')::int;
    IF v_ordem IS NULL OR v_ordem < 1 THEN RAISE EXCEPTION 'Lote sem ordem valida (>=1)' USING ERRCODE = 'P0001'; END IF;
    IF v_ordem = ANY (v_ordens) THEN RAISE EXCEPTION 'Ordem % duplicada no payload de lotes', v_ordem USING ERRCODE = 'P0001'; END IF;
    v_ordens := array_append(v_ordens, v_ordem);
    v_crit := NULLIF(v_lote->>'criterio_valor','');
    IF v_crit IS NOT NULL AND v_crit NOT IN ('kg','cabeca','total') THEN
      RAISE EXCEPTION 'Criterio de valor invalido (lote ordem %): %', v_ordem, v_crit USING ERRCODE = 'P0001'; END IF;
    v_qtd := NULLIF(v_lote->>'qtd_negociada','')::int;
    IF v_qtd IS NOT NULL AND v_qtd <= 0 THEN RAISE EXCEPTION 'Quantidade do lote ordem % deve ser > 0', v_ordem USING ERRCODE = 'P0001'; END IF;
    v_peso := NULLIF(v_lote->>'peso_medio_negociado_kg','')::numeric;
    IF v_peso IS NOT NULL AND v_peso <= 0 THEN RAISE EXCEPTION 'Peso medio do lote ordem % deve ser > 0', v_ordem USING ERRCODE = 'P0001'; END IF;
    v_valor := NULLIF(v_lote->>'valor_informado','')::numeric;
    IF v_valor IS NOT NULL AND v_valor < 0 THEN RAISE EXCEPTION 'Valor informado do lote ordem % nao pode ser negativo', v_ordem USING ERRCODE = 'P0001'; END IF;
  END LOOP;

  IF v_tem_receb THEN
    /* ── CAMINHO B — so o economico muda ─────────────────────────────── */
    SELECT count(*) INTO v_lotes_gravados
      FROM public.zoo_operacao_lotes
     WHERE operacao_id = p_operacao_id AND cliente_id = p_cliente_id;
    v_lotes_payload := jsonb_array_length(COALESCE(p_lotes, '[]'::jsonb));

    IF v_lotes_payload <> v_lotes_gravados THEN
      RAISE EXCEPTION 'Compra com recebimento registrado: nao e possivel adicionar ou remover lotes. Estorne o recebimento primeiro.'
        USING ERRCODE = 'P0001';
    END IF;

    FOR v_lote IN SELECT value FROM jsonb_array_elements(COALESCE(p_lotes, '[]'::jsonb))
    LOOP
      v_ordem := (v_lote->>'ordem')::int;
      SELECT * INTO v_grav FROM public.zoo_operacao_lotes
       WHERE operacao_id = p_operacao_id AND cliente_id = p_cliente_id AND ordem = v_ordem;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Compra com recebimento registrado: nao e possivel adicionar ou remover lotes. Estorne o recebimento primeiro.'
          USING ERRCODE = 'P0001';
      END IF;

      /* ⚠ `IS DISTINCT FROM` nos tres: categoria e peso sao nullable, e
         `NULL <> NULL` devolve NULL — num IF isso NAO dispara, e a mudanca
         passaria batida. */
      IF NULLIF(v_lote->>'categoria_negociada','')        IS DISTINCT FROM v_grav.categoria_negociada
         OR NULLIF(v_lote->>'qtd_negociada','')::int      IS DISTINCT FROM v_grav.qtd_negociada
         OR NULLIF(v_lote->>'peso_medio_negociado_kg','')::numeric IS DISTINCT FROM v_grav.peso_medio_negociado_kg THEN
        RAISE EXCEPTION 'Compra com recebimento registrado: categoria, quantidade e peso nao podem mudar. Estorne o recebimento para alterar o fisico.'
          USING ERRCODE = 'P0001';
      END IF;
    END LOOP;

    /* Passou a verificacao: UPDATE apenas do economico. Sem DELETE, ids
       preservados, e as FKs RESTRICT nem chegam a ser exercitadas. */
    FOR v_lote IN SELECT value FROM jsonb_array_elements(COALESCE(p_lotes, '[]'::jsonb))
    LOOP
      UPDATE public.zoo_operacao_lotes
         SET criterio_valor  = NULLIF(v_lote->>'criterio_valor',''),
             valor_informado = NULLIF(v_lote->>'valor_informado','')::numeric,
             updated_by      = v_actor
       WHERE operacao_id = p_operacao_id AND cliente_id = p_cliente_id
         AND ordem = (v_lote->>'ordem')::int;
    END LOOP;

    /* `v_count` e `v_total_qtd` saem da TABELA, nao do payload: no caminho A
       eles nascem do loop de INSERT, e ler a tabela produz exatamente o mesmo
       numero sem duplicar a regra. */
    SELECT count(*), COALESCE(SUM(COALESCE(qtd_negociada, 0)), 0)
      INTO v_count, v_total_qtd
      FROM public.zoo_operacao_lotes
     WHERE operacao_id = p_operacao_id AND cliente_id = p_cliente_id;
  ELSE
    /* ── CAMINHO A — inalterado ───────────────────────────────────────── */
    DELETE FROM public.zoo_operacao_lotes WHERE operacao_id = p_operacao_id AND cliente_id = p_cliente_id;
    FOR v_lote IN SELECT value FROM jsonb_array_elements(COALESCE(p_lotes, '[]'::jsonb))
    LOOP
      v_qtd   := NULLIF(v_lote->>'qtd_negociada','')::int;
      INSERT INTO public.zoo_operacao_lotes (
        cliente_id, operacao_id, ordem, categoria_negociada, qtd_negociada,
        peso_medio_negociado_kg, criterio_valor, valor_informado, created_by, updated_by)
      VALUES (
        p_cliente_id, p_operacao_id, (v_lote->>'ordem')::int, NULLIF(v_lote->>'categoria_negociada',''),
        v_qtd, NULLIF(v_lote->>'peso_medio_negociado_kg','')::numeric,
        NULLIF(v_lote->>'criterio_valor',''), NULLIF(v_lote->>'valor_informado','')::numeric,
        v_actor, v_actor);
      v_total_qtd := v_total_qtd + COALESCE(v_qtd, 0);
      v_count := v_count + 1;
    END LOOP;
  END IF;

  /* PR-OC-VALOR-02 — o CASE por criterio saiu daqui. O total do acordo e a
     SOMA DOS LOTES pela funcao unica; lote sem `valor_informado` devolve
     total NULL e o SUM o ignora, como o `IF v_valor IS NOT NULL` fazia.
     ⚠ Roda IGUAL nos dois caminhos: opera sobre os lotes da operacao, nao
     sobre o payload. */
  SELECT COALESCE(SUM((public._oc_valor_do_lote(l.id) ->> 'total')::numeric), 0)
    INTO v_total_acordado
    FROM public.zoo_operacao_lotes l
   WHERE l.operacao_id = p_operacao_id AND l.cliente_id = p_cliente_id;

  UPDATE public.zoo_operacoes_comerciais o
     SET versao = versao + 1, updated_at = now(), updated_by = v_actor,
         valor_acordado = NULLIF(v_total_acordado, 0),
         qtd_negociada  = NULLIF(v_total_qtd, 0),
         rascunho = NOT (
           o.fazenda_id IS NOT NULL AND o.contraparte_id IS NOT NULL
           AND o.tipo_operacao IS NOT NULL AND o.data_operacao IS NOT NULL
           AND v_count > 0 AND v_total_qtd > 0 AND v_total_acordado > 0)
   WHERE o.id = p_operacao_id;
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'salvar_lotes',
          jsonb_build_object('lotes', p_lotes, 'valor_acordado', NULLIF(v_total_acordado, 0), 'qtd_negociada', NULLIF(v_total_qtd,0)), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao + 1,
                            'lotes', v_count, 'valor_acordado', NULLIF(v_total_acordado, 0), 'qtd_negociada', NULLIF(v_total_qtd,0),
                            'rascunho', NOT (v_op.fazenda_id IS NOT NULL AND v_op.contraparte_id IS NOT NULL
                                             AND v_op.tipo_operacao IS NOT NULL AND v_op.data_operacao IS NOT NULL
                                             AND v_count > 0 AND v_total_qtd > 0 AND v_total_acordado > 0));
END;
$function$;
