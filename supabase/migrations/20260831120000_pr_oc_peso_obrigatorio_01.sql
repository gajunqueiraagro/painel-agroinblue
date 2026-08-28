-- PR-OC-PESO-OBRIGATORIO-01 — lote sem peso deixa de ser possivel.
--
--   DECISAO (28/08): "tem que colocar algum peso e depois atualiza, mas nunca
--   permitir salvar sem peso". O peso passa a ser obrigatorio como categoria,
--   quantidade, criterio e valor.
--
--   ⚠ ISTO RESOLVE UMA DIVIDA NA RAIZ, e e' a razao de existir da migration.
--   O indicador R$/kg inflava porque `pesoTotal` soma `qtd x peso` de TODO lote
--   enquanto `valorNegociado` respeita o criterio: lote cotado por cabeca sem peso
--   entrava no valor e NAO no peso, e a divisao saia alta. Registrado em 33bc8efa
--   como PR-OC-RS-KG-DENOMINADOR-01, com a nota de que corrigir so na tela criaria
--   dois numeros para o mesmo indicador. Sem lote sem peso, o denominador fica
--   integro POR CONSTRUCAO: nao ha o que excluir da conta nem indicador parcial a
--   marcar, e os helpers `pesoMedioPorCabeca`/`valorPorKgNegociado` continuam iguais.
--
--   MEDIDO ANTES (28/08, conferido de novo por esta sessao):
--     35 lotes em operacoes nao canceladas, em 24 operacoes
--      0 com peso nulo, zero ou negativo — em qualquer criterio
--   Legado ZERO: a regra nova nao esbarra em nada existente.
--
--   ⚠ CORPO PARTIDO DO VIGENTE, NAO DE MEMORIA. A transcricao do corpo anterior foi
--   conferida por md5 antes da edicao: 9bda9aec8e911ac71a8fa401ea89e882, 8550 chars.
--   Deste corpo mudou UMA linha, a validacao do peso dentro do laco de payload.
--
--   O QUE MUDOU, exatamente:
--     DE:   IF v_peso IS NOT NULL AND v_peso <= 0 THEN ... 'Peso medio do lote ordem % deve ser > 0'
--     PARA: IF v_peso IS NULL     OR  v_peso <= 0 THEN ... nomeando CATEGORIA e ordem
--   Ou seja: peso <= 0 JA era recusado; o que faltava era o peso AUSENTE. O padrao
--   `IS NOT NULL AND ...` tornava a validacao opcional, como ainda e' para quantidade,
--   criterio e valor — de proposito, porque so o peso foi decidido obrigatorio agora.
--
--   ⚠ UM LUGAR SO COBRE OS DOIS CAMINHOS. O laco de validacao roda ANTES da bifurcacao
--   `IF v_tem_receb` (caminho A, insercao; caminho B, correcao de valor com recebimento,
--   de 9025a868). Nao ha segunda copia da regra a manter em sincronia.
--
--   ⚠ A RECUSA E' DA OPERACAO INTEIRA. O laco varre todo o payload e estoura no
--   primeiro lote invalido, antes de qualquer DELETE ou INSERT — entao um lote sem
--   peso no meio de lotes validos nao grava NADA. Gravacao parcial de negociacao seria
--   pior que a recusa: deixaria o operador com metade do acordo no banco.
--
--   POR QUE GUARD NA RPC E NAO CHECK CONSTRAINT (avaliado, ver relatorio):
--     • O CHECK passaria hoje (legado zero), entao a objecao NAO e' viabilidade.
--     • O CHECK devolve 23514 com o nome da constraint. O guard NOMEIA O LOTE pela
--       categoria e ordem — o operador precisa saber QUAL lote corrigir.
--     • Num CHECK, `peso IS NOT NULL AND peso > 0` torna a coluna efetivamente NOT NULL
--       no nivel do schema, o que engessa fixture de teste e backfill tecnico e e' bem
--       mais caro de reverter do que uma linha de funcao.
--     • A RPC e' o unico escritor da tabela pela aplicacao.
--
--   Requer PROTO (binbcdfbisgscrifztia). NAO aplicar em producao.

CREATE OR REPLACE FUNCTION public.oc_salvar_lotes(
  p_operacao_id     uuid,
  p_cliente_id      uuid,
  p_versao_esperada integer,
  p_lotes           jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    IF v_peso IS NULL OR v_peso <= 0 THEN
      RAISE EXCEPTION 'Informe o peso medio do lote % (ordem %). Lote sem peso nao pode ser salvo.',
        COALESCE(NULLIF(v_lote->>'categoria_negociada',''), 'sem categoria'), v_ordem USING ERRCODE = 'P0001'; END IF;
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
$$;

COMMENT ON FUNCTION public.oc_salvar_lotes(uuid, uuid, integer, jsonb) IS
  'PR-OC-PESO-OBRIGATORIO-01: peso medio do lote passa a ser OBRIGATORIO (> 0) nos dois caminhos (insercao e correcao com recebimento); recusa nomeia categoria e ordem do lote. Mantem o restante do contrato de 9025a868.';
