BEGIN;

-- PR-OC-VALOR-02 — a regra do valor do lote passa a ter UMA implementacao no
-- banco, e o recebimento desce o valor ao lancamento.
--
-- O PROBLEMA. A regra existia TRES vezes: `oc_salvar_lotes` (inline, para somar
-- o `valor_acordado`), a migration do backfill de 24/08, e
-- `AbaNegociacaoLotes.tsx:40` (front). O backfill corrigiu 555 cabecas de
-- passado, mas o fluxo que as produziu nao mudou — `oc_registrar_movimentacao`
-- criava o lancamento SEM `valor_total`, e a proxima compra nasceria em zero.
--
-- O ALVO NAO E "uma implementacao so". Durante a DIGITACAO o lote ainda nao
-- esta salvo, entao o front precisa calcular localmente para o preview: a
-- funcao de banco nao alcanca o que ainda nao existe. O alvo e UMA no banco,
-- UMA no front, e um teste que prova que concordam.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. A FUNCAO — fonte unica do valor do lote no banco
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._oc_valor_do_lote(p_lote_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  /* SECURITY INVOKER de proposito: le `zoo_operacao_lotes`, que tem RLS.
     Chamada de dentro das RPCs SECURITY DEFINER, roda com os direitos delas;
     chamada direta, o RLS do usuario continua valendo. */
  SELECT jsonb_build_object(
    'total',      t.total,
    /* Denominador zero devolve NULL, nunca zero: R$ 0,00/cab afirmaria preco,
       e o que ha e ausencia de base para calcular. */
    'por_cabeca', CASE WHEN COALESCE(l.qtd_negociada, 0) > 0
                       THEN ROUND(t.total / l.qtd_negociada, 6) END,
    'por_kg',     CASE WHEN COALESCE(l.qtd_negociada, 0) > 0
                        AND COALESCE(l.peso_medio_negociado_kg, 0) > 0
                       THEN ROUND(t.total / (l.qtd_negociada * l.peso_medio_negociado_kg), 6) END
  )
  FROM public.zoo_operacao_lotes l
  CROSS JOIN LATERAL (
    SELECT ROUND((CASE l.criterio_valor
      WHEN 'kg'     THEN COALESCE(l.qtd_negociada,0) * COALESCE(l.peso_medio_negociado_kg,0) * l.valor_informado
      WHEN 'cabeca' THEN COALESCE(l.qtd_negociada,0) * l.valor_informado
      WHEN 'total'  THEN l.valor_informado
    END)::numeric, 2) AS total
  ) t
  WHERE l.id = p_lote_id;
$function$;

COMMENT ON FUNCTION public._oc_valor_do_lote(uuid) IS
  'PR-OC-VALOR-02 — FONTE UNICA do valor do lote no banco. Devolve total, '
  'por_cabeca e por_kg. `oc_salvar_lotes` e `oc_registrar_movimentacao` '
  'consomem; o preview do front (AbaNegociacaoLotes) e a SEGUNDA '
  'implementacao, deliberada, e ha teste provando que concordam.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. `oc_salvar_lotes` deixa de recalcular inline
-- ─────────────────────────────────────────────────────────────────────────
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
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'Operacao cancelada nao pode ser editada' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'fechada' THEN RAISE EXCEPTION 'Negociacao fechada; reabra para editar (oc_reabrir)' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_movimentacoes WHERE operacao_id = p_operacao_id) THEN
    RAISE EXCEPTION 'Operacao com movimentacao de recebimento; nao e possivel re-negociar os lotes' USING ERRCODE = 'P0001'; END IF;
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

  /* PR-OC-VALOR-02 — o CASE por criterio saiu daqui. O total do acordo e a
     SOMA DOS LOTES pela funcao unica; lote sem `valor_informado` devolve
     total NULL e o SUM o ignora, como o `IF v_valor IS NOT NULL` fazia. */
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

-- ─────────────────────────────────────────────────────────────────────────
-- 3. A PONTE — o recebimento desce o valor ao lancamento
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_registrar_movimentacao(p_operacao_id uuid, p_cliente_id uuid, p_lote_id uuid, p_data date, p_categoria text, p_quantidade integer, p_peso_medio_kg numeric, p_peso_total_kg numeric, p_observacao text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_tipo text;
  v_peso jsonb;
  v_lanc uuid;
  v_link uuid;
  v_por_cab numeric;
  v_valor numeric;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;                     -- guard: tenant
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;      -- guard: pertencimento
  IF v_op.rascunho OR v_op.status_comercial = 'rascunho' THEN
    RAISE EXCEPTION 'Rascunho (tecnico ou legado) nao permite movimentacao' USING ERRCODE = 'P0001'; END IF;          -- guard: rascunho
  IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'Operacao cancelada' USING ERRCODE = 'P0001'; END IF;   -- guard: cancelada
  IF v_op.entrega_encerrada THEN RAISE EXCEPTION 'Entrega ja encerrada' USING ERRCODE = 'P0001'; END IF;              -- guard: entrega encerrada
  IF v_op.fazenda_id IS NULL THEN RAISE EXCEPTION 'Operacao sem fazenda soberana' USING ERRCODE = 'P0001'; END IF;    -- guard: fazenda
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN RAISE EXCEPTION 'Quantidade deve ser > 0' USING ERRCODE = 'P0001'; END IF; -- guard: qtd
  -- guard: lote pertence a operacao + tenant + existe (nao removido/alheio)
  IF NOT EXISTS (SELECT 1 FROM public.zoo_operacao_lotes
                  WHERE id = p_lote_id AND operacao_id = p_operacao_id AND cliente_id = p_cliente_id) THEN
    RAISE EXCEPTION 'Lote % invalido/alheio a operacao %', p_lote_id, p_operacao_id USING ERRCODE = 'P0002'; END IF;
  v_tipo := CASE v_op.tipo_operacao WHEN 'compra' THEN 'compra' WHEN 'venda' THEN 'venda'
                                    WHEN 'abate' THEN 'abate' ELSE NULL END;
  IF v_tipo IS NULL THEN RAISE EXCEPTION 'tipo_operacao % sem mapa zootecnico', v_op.tipo_operacao USING ERRCODE = 'P0001'; END IF; -- guard: mapa tipo
  v_peso := public._oc_conciliar_peso(p_quantidade, p_peso_medio_kg, p_peso_total_kg);  -- guard: coerencia de peso

  /* ── PR-OC-VALOR-02 · A PONTE ──────────────────────────────────────────
     O valor negociado desce ao lancamento AQUI, no momento em que o animal
     entra. Ate 24/08 esta funcao criava o lancamento sem `valor_total`, e
     por isso 555 cabecas ficaram em zero — o valor existia em
     `zoo_operacao_lotes` e nunca chegava.

     PROPORCIONAL A QUANTIDADE RECEBIDA, nunca o valor cheio do lote:
     `zoo_operacao_movimentacoes` tem UNIQUE em `movimentacao_id` mas NAO em
     `operacao_lote_id`, entao um lote aceita mais de um recebimento. O 1:1
     de hoje e circunstancial. Com o valor cheio, dois recebimentos do mesmo
     lote gerariam o dobro.

     `por_cabeca` serve os TRES criterios, inclusive `total`: o lote sempre
     tem R$/cab, porque `total ÷ qtd` esta definido sempre que ha quantidade.
     Sem quantidade negociada, `por_cabeca` vem NULL e o lancamento nasce sem
     valor — ausencia declarada, nunca zero. */
  v_por_cab := (public._oc_valor_do_lote(p_lote_id) ->> 'por_cabeca')::numeric;
  v_valor   := CASE WHEN v_por_cab IS NULL THEN NULL
                    ELSE ROUND(v_por_cab * p_quantidade, 2) END;

  INSERT INTO public.lancamentos (
    cliente_id, fazenda_id, tipo, categoria, quantidade, data,
    peso_medio_kg, peso_vivo_total, valor_total, cenario, status_operacional, origem_registro, created_by, updated_by, observacao)
  VALUES (
    p_cliente_id, v_op.fazenda_id, v_tipo, p_categoria, p_quantidade, p_data,
    NULLIF(v_peso->>'medio','')::numeric, NULLIF(v_peso->>'total','')::numeric, v_valor,
    'realizado', 'realizado', 'operacao_comercial', v_actor, v_actor, p_observacao)
  RETURNING id INTO v_lanc;

  INSERT INTO public.zoo_operacao_movimentacoes (cliente_id, operacao_id, operacao_lote_id, movimentacao_id, created_by)
  VALUES (p_cliente_id, p_operacao_id, p_lote_id, v_lanc, v_actor) RETURNING id INTO v_link;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'registrar_movimentacao',
          jsonb_build_object('lancamento_id', v_lanc, 'lote_id', p_lote_id, 'tipo', v_tipo, 'categoria', p_categoria, 'quantidade', p_quantidade, 'valor_total', v_valor), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'lote_id', p_lote_id, 'lancamento_id', v_lanc, 'movimentacao_id', v_link, 'valor_total', v_valor);
END;
$function$;

COMMIT;
