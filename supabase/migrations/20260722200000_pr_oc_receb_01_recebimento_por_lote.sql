-- PR-OC-RECEB-01 — Recebimento físico rastreável POR LOTE (aba Recebimento do modal ?oc_compra=1).
--   Escopo (gate final aprovado D1/D2/D3):
--   SCHEMA: vínculo obrigatório movimentação->lote (operacao_lote_id NOT NULL + FK composto
--     (lote,operacao,tenant) ON DELETE RESTRICT); UNIQUE(id,operacao_id,cliente_id) em lotes.
--   D1: oc_salvar_lotes agrega qtd_negociada=Σ (além de valor_acordado) e BLOQUEIA re-negociação
--     quando há movimentação vinculada; oc_confirmar aceita negociação multilote (EXISTS lote qtd>0),
--     sem forjar categoria_negociada única.
--   D2: oc_receber_lotes transacional (tudo-ou-nada): valida todos os itens antes de qualquer INSERT.
--   D3: oc_estornar_movimentacao append-only (lancamentos.cancelado=true; mantém lançamento e vínculo;
--     evento; vedado após entrega_encerrada). Cálculos ignoram cancelado IS TRUE.
--   Sem pasto, sem Documentos, sem Financeiro. Movimentação reusa lancamentos (cenario/status realizado).
-- NÃO aplicar por este PR (aplicação remota é etapa separada, sob autorização).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ═════════════════════════════════════════════════════════════════════════════
-- SCHEMA
-- ═════════════════════════════════════════════════════════════════════════════
-- Alvo do FK composto por lote (id + operação + tenant).
ALTER TABLE public.zoo_operacao_lotes
  ADD CONSTRAINT zoo_operacao_lotes_id_operacao_cliente_uniq UNIQUE (id, operacao_id, cliente_id);

-- Vínculo OBRIGATÓRIO movimentação -> lote (0 linhas hoje: NOT NULL sem default é seguro).
ALTER TABLE public.zoo_operacao_movimentacoes
  ADD COLUMN operacao_lote_id uuid NOT NULL;
ALTER TABLE public.zoo_operacao_movimentacoes
  ADD CONSTRAINT zoo_operacao_mov_lote_fk
    FOREIGN KEY (operacao_lote_id, operacao_id, cliente_id)
    REFERENCES public.zoo_operacao_lotes (id, operacao_id, cliente_id) ON DELETE RESTRICT;
CREATE INDEX zoo_operacao_mov_lote_idx ON public.zoo_operacao_movimentacoes (operacao_lote_id);

-- ═════════════════════════════════════════════════════════════════════════════
-- D1 — oc_salvar_lotes v3: rollup qtd_negociada=Σ + guarda anti re-negociação c/ movimentação.
--   (verbatim da v2 PR-OC-COMPRA-NEG-01 + as duas adições marcadas)
-- ═════════════════════════════════════════════════════════════════════════════
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
  v_total_acordado numeric := 0;   -- soma bruta -> valor_acordado (PR-OC-COMPRA-NEG-01)
  v_total_qtd int := 0;            -- soma de qtd -> qtd_negociada (PR-OC-RECEB-01 / D1)
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'Operacao cancelada nao pode ser editada' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'fechada' THEN RAISE EXCEPTION 'Negociacao fechada; reabra para editar (oc_reabrir)' USING ERRCODE = 'P0001'; END IF;
  -- D1/triade: lotes são congelados quando já há recebimento vinculado (protege o FK RESTRICT).
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_movimentacoes WHERE operacao_id = p_operacao_id) THEN
    RAISE EXCEPTION 'Operacao com movimentacao de recebimento; nao e possivel re-negociar os lotes' USING ERRCODE = 'P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;

  -- Validacao controlada dos lotes (antes de qualquer escrita).
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
    v_peso  := NULLIF(v_lote->>'peso_medio_negociado_kg','')::numeric;
    v_crit  := NULLIF(v_lote->>'criterio_valor','');
    v_valor := NULLIF(v_lote->>'valor_informado','')::numeric;
    INSERT INTO public.zoo_operacao_lotes (
      cliente_id, operacao_id, ordem, categoria_negociada, qtd_negociada,
      peso_medio_negociado_kg, criterio_valor, valor_informado, created_by, updated_by)
    VALUES (
      p_cliente_id, p_operacao_id, (v_lote->>'ordem')::int, NULLIF(v_lote->>'categoria_negociada',''),
      v_qtd, v_peso, v_crit, v_valor, v_actor, v_actor);
    IF v_valor IS NOT NULL THEN
      v_total_acordado := v_total_acordado + CASE v_crit
        WHEN 'kg'     THEN COALESCE(v_qtd,0) * COALESCE(v_peso,0) * v_valor
        WHEN 'cabeca' THEN COALESCE(v_qtd,0) * v_valor
        WHEN 'total'  THEN v_valor
        ELSE 0 END;
    END IF;
    v_total_qtd := v_total_qtd + COALESCE(v_qtd, 0);   -- D1: rollup de quantidade negociada
    v_count := v_count + 1;
  END LOOP;

  -- Bump + base financeira (valor_acordado) + quantidade agregada (qtd_negociada). Σ=0 -> NULL.
  UPDATE public.zoo_operacoes_comerciais
     SET versao = versao + 1, updated_at = now(), updated_by = v_actor,
         valor_acordado = NULLIF(v_total_acordado, 0),
         qtd_negociada  = NULLIF(v_total_qtd, 0)
   WHERE id = p_operacao_id;
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'salvar_lotes',
          jsonb_build_object('lotes', p_lotes, 'valor_acordado', NULLIF(v_total_acordado, 0), 'qtd_negociada', NULLIF(v_total_qtd,0)), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao + 1,
                            'lotes', v_count, 'valor_acordado', NULLIF(v_total_acordado, 0), 'qtd_negociada', NULLIF(v_total_qtd,0));
END;
$function$;
REVOKE ALL ON FUNCTION public.oc_salvar_lotes(uuid, uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_salvar_lotes(uuid, uuid, integer, jsonb) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- D1 — oc_confirmar: aceita negociação multilote (EXISTS lote qtd>0) além do legado single-lote.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.oc_confirmar(
  p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_actor uuid := auth.uid(); v_op public.zoo_operacoes_comerciais;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.status_comercial = 'fechada' THEN
    RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao, 'status_comercial','fechada','idempotente', true); END IF;
  IF v_op.status_comercial <> 'programada' THEN
    RAISE EXCEPTION 'Operacao em estado % nao pode ser fechada', v_op.status_comercial USING ERRCODE = 'P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  IF v_op.rascunho THEN RAISE EXCEPTION 'Cadastro comercial incompleto (rascunho tecnico)' USING ERRCODE = 'P0001'; END IF;
  -- Acordo mínimo: contraparte + (negociação single-lot legada OU negociação por lote multilote).
  IF v_op.contraparte_id IS NULL
     OR NOT (
          (v_op.qtd_negociada IS NOT NULL AND v_op.categoria_negociada IS NOT NULL
           AND v_op.tipo_precificacao IS NOT NULL AND v_op.preco_unitario IS NOT NULL)
          OR EXISTS (SELECT 1 FROM public.zoo_operacao_lotes
                      WHERE operacao_id = p_operacao_id AND cliente_id = p_cliente_id AND qtd_negociada > 0)
        ) THEN
    RAISE EXCEPTION 'Acordo comercial minimo ausente' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.zoo_operacoes_comerciais
    SET status_comercial = 'fechada', versao = versao + 1, updated_at = now(), updated_by = v_actor WHERE id = p_operacao_id;
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'fechar', to_jsonb(v_op), v_actor, 'rpc');
  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao + 1, 'status_comercial','fechada');
END;
$$;
REVOKE ALL ON FUNCTION public.oc_confirmar(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_confirmar(uuid, uuid, integer) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- oc_registrar_movimentacao — NOVA ASSINATURA (+p_lote_id). Substitui a de 8 args (sem caller).
-- ═════════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.oc_registrar_movimentacao(uuid, uuid, date, text, integer, numeric, numeric, text);

CREATE OR REPLACE FUNCTION public.oc_registrar_movimentacao(
  p_operacao_id uuid, p_cliente_id uuid, p_lote_id uuid, p_data date, p_categoria text,
  p_quantidade integer, p_peso_medio_kg numeric, p_peso_total_kg numeric, p_observacao text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_tipo text;
  v_peso jsonb;
  v_lanc uuid;
  v_link uuid;
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
  -- guard: lote pertence à operação + tenant + existe (não removido/alheio)
  IF NOT EXISTS (SELECT 1 FROM public.zoo_operacao_lotes
                  WHERE id = p_lote_id AND operacao_id = p_operacao_id AND cliente_id = p_cliente_id) THEN
    RAISE EXCEPTION 'Lote % invalido/alheio a operacao %', p_lote_id, p_operacao_id USING ERRCODE = 'P0002'; END IF;
  v_tipo := CASE v_op.tipo_operacao WHEN 'compra' THEN 'compra' WHEN 'venda' THEN 'venda'
                                    WHEN 'abate' THEN 'abate' ELSE NULL END;
  IF v_tipo IS NULL THEN RAISE EXCEPTION 'tipo_operacao % sem mapa zootecnico', v_op.tipo_operacao USING ERRCODE = 'P0001'; END IF; -- guard: mapa tipo
  v_peso := public._oc_conciliar_peso(p_quantidade, p_peso_medio_kg, p_peso_total_kg);  -- guard: coerência de peso

  INSERT INTO public.lancamentos (
    cliente_id, fazenda_id, tipo, categoria, quantidade, data,
    peso_medio_kg, peso_vivo_total, cenario, status_operacional, origem_registro, created_by, updated_by, observacao)
  VALUES (
    p_cliente_id, v_op.fazenda_id, v_tipo, p_categoria, p_quantidade, p_data,
    NULLIF(v_peso->>'medio','')::numeric, NULLIF(v_peso->>'total','')::numeric,
    'realizado', 'realizado', 'operacao_comercial', v_actor, v_actor, p_observacao)
  RETURNING id INTO v_lanc;

  INSERT INTO public.zoo_operacao_movimentacoes (cliente_id, operacao_id, operacao_lote_id, movimentacao_id, created_by)
  VALUES (p_cliente_id, p_operacao_id, p_lote_id, v_lanc, v_actor) RETURNING id INTO v_link;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'registrar_movimentacao',
          jsonb_build_object('lancamento_id', v_lanc, 'lote_id', p_lote_id, 'tipo', v_tipo, 'categoria', p_categoria, 'quantidade', p_quantidade), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'lote_id', p_lote_id, 'lancamento_id', v_lanc, 'movimentacao_id', v_link);
END;
$$;
REVOKE ALL ON FUNCTION public.oc_registrar_movimentacao(uuid,uuid,uuid,date,text,integer,numeric,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_registrar_movimentacao(uuid,uuid,uuid,date,text,integer,numeric,numeric,text) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- D2 — oc_receber_lotes: batch transacional (tudo-ou-nada). Valida TODOS antes de inserir.
--   p_recebimentos = [ {lote_id, data, categoria, quantidade, peso_medio_kg, observacao}, ... ]
--   Máximo um item por lote (dup lote_id no payload aborta). Lock por versão + bump.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.oc_receber_lotes(
  p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_recebimentos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_item jsonb; v_lote uuid; v_qtd int; v_tipo text;
  v_lotes uuid[] := '{}';
  v_count int := 0;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.rascunho OR v_op.status_comercial = 'rascunho' THEN
    RAISE EXCEPTION 'Rascunho (tecnico ou legado) nao permite recebimento' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'Operacao cancelada' USING ERRCODE = 'P0001'; END IF;
  IF v_op.entrega_encerrada THEN RAISE EXCEPTION 'Entrega ja encerrada' USING ERRCODE = 'P0001'; END IF;
  IF v_op.fazenda_id IS NULL THEN RAISE EXCEPTION 'Operacao sem fazenda soberana' USING ERRCODE = 'P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  IF jsonb_typeof(p_recebimentos) <> 'array' OR jsonb_array_length(COALESCE(p_recebimentos,'[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Nenhum recebimento informado' USING ERRCODE = 'P0001'; END IF;
  v_tipo := CASE v_op.tipo_operacao WHEN 'compra' THEN 'compra' WHEN 'venda' THEN 'venda'
                                    WHEN 'abate' THEN 'abate' ELSE NULL END;
  IF v_tipo IS NULL THEN RAISE EXCEPTION 'tipo_operacao % sem mapa zootecnico', v_op.tipo_operacao USING ERRCODE = 'P0001'; END IF;

  -- FASE 1 — VALIDAR TODOS os itens (nenhum INSERT ainda).
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_recebimentos)
  LOOP
    v_lote := NULLIF(v_item->>'lote_id','')::uuid;
    IF v_lote IS NULL THEN RAISE EXCEPTION 'Item sem lote_id' USING ERRCODE = 'P0001'; END IF;
    IF v_lote = ANY (v_lotes) THEN RAISE EXCEPTION 'Lote % repetido no payload (max 1 item por lote)', v_lote USING ERRCODE = 'P0001'; END IF;
    v_lotes := array_append(v_lotes, v_lote);
    IF NOT EXISTS (SELECT 1 FROM public.zoo_operacao_lotes
                    WHERE id = v_lote AND operacao_id = p_operacao_id AND cliente_id = p_cliente_id) THEN
      RAISE EXCEPTION 'Lote % invalido/alheio a operacao', v_lote USING ERRCODE = 'P0002'; END IF;
    v_qtd := NULLIF(v_item->>'quantidade','')::int;
    IF v_qtd IS NULL OR v_qtd <= 0 THEN RAISE EXCEPTION 'Quantidade do lote % deve ser > 0', v_lote USING ERRCODE = 'P0001'; END IF;
    PERFORM public._oc_conciliar_peso(v_qtd, NULLIF(v_item->>'peso_medio_kg','')::numeric, NULL);  -- coerência (só médio)
  END LOOP;

  -- FASE 2 — INSERIR TODOS (mesma transação; qualquer erro acima já teria abortado).
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_recebimentos)
  LOOP
    PERFORM public.oc_registrar_movimentacao(
      p_operacao_id, p_cliente_id, NULLIF(v_item->>'lote_id','')::uuid,
      COALESCE(NULLIF(v_item->>'data','')::date, current_date), v_item->>'categoria',
      NULLIF(v_item->>'quantidade','')::int, NULLIF(v_item->>'peso_medio_kg','')::numeric, NULL, v_item->>'observacao');
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.zoo_operacoes_comerciais
     SET versao = versao + 1, updated_at = now(), updated_by = v_actor WHERE id = p_operacao_id;
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'receber_lotes', jsonb_build_object('itens', v_count), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao + 1, 'recebidos', v_count);
END;
$$;
REVOKE ALL ON FUNCTION public.oc_receber_lotes(uuid, uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_receber_lotes(uuid, uuid, integer, jsonb) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- D3 — oc_estornar_movimentacao: append-only. Marca lancamentos.cancelado=true; mantém link.
--   Vedado após entrega_encerrada. p_movimentacao_id = zoo_operacao_movimentacoes.id (o vínculo).
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.oc_estornar_movimentacao(
  p_movimentacao_id uuid, p_cliente_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_link public.zoo_operacao_movimentacoes;
  v_op public.zoo_operacoes_comerciais;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_link FROM public.zoo_operacao_movimentacoes
    WHERE id = p_movimentacao_id AND cliente_id = p_cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimentacao % nao encontrada', p_movimentacao_id USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = v_link.operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao nao encontrada' USING ERRCODE = 'P0002'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'Operacao cancelada' USING ERRCODE = 'P0001'; END IF;
  IF v_op.entrega_encerrada THEN RAISE EXCEPTION 'Entrega ja encerrada; estorno vedado' USING ERRCODE = 'P0001'; END IF;  -- proíbe estorno pós-encerramento

  -- Append-only: cancela o lançamento (sai das somas por cancelado IS NOT TRUE); mantém link + lançamento.
  UPDATE public.lancamentos
     SET cancelado = true, updated_at = now(), updated_by = v_actor
   WHERE id = v_link.movimentacao_id AND cliente_id = p_cliente_id AND cancelado IS NOT TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimentacao ja estornada' USING ERRCODE = 'P0001'; END IF;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, v_link.operacao_id, 'estornar_movimentacao',
          jsonb_build_object('movimentacao_id', p_movimentacao_id, 'lancamento_id', v_link.movimentacao_id, 'lote_id', v_link.operacao_lote_id, 'motivo', p_motivo), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'movimentacao_id', p_movimentacao_id, 'estornado', true);
END;
$$;
REVOKE ALL ON FUNCTION public.oc_estornar_movimentacao(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_estornar_movimentacao(uuid, uuid, text) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- Leitura soberana por LOTE — negociada / recebida / diferença / estado (tenant-safe).
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.vw_oc_lotes_recebimento WITH (security_invoker = true) AS
WITH rec AS (
  SELECT m.operacao_lote_id, sum(l.quantidade) AS recebida
    FROM public.zoo_operacao_movimentacoes m
    JOIN public.lancamentos l ON l.id = m.movimentacao_id
   WHERE l.cancelado IS NOT TRUE
   GROUP BY m.operacao_lote_id
)
SELECT
  lo.cliente_id, lo.operacao_id, lo.id AS lote_id, lo.ordem,
  lo.categoria_negociada, lo.qtd_negociada,
  COALESCE(rec.recebida, 0) AS qtd_recebida,
  COALESCE(lo.qtd_negociada, 0) - COALESCE(rec.recebida, 0) AS diferenca,
  CASE
    WHEN COALESCE(rec.recebida,0) = 0                                   THEN 'nao_iniciado'
    WHEN lo.qtd_negociada IS NOT NULL AND rec.recebida > lo.qtd_negociada THEN 'excedente'
    WHEN lo.qtd_negociada IS NOT NULL AND rec.recebida = lo.qtd_negociada THEN 'completo'
    ELSE 'parcial'
  END AS estado_recebimento
FROM public.zoo_operacao_lotes lo
LEFT JOIN rec ON rec.operacao_lote_id = lo.id;

COMMENT ON VIEW public.vw_oc_lotes_recebimento IS
  'PR-OC-RECEB-01: recebimento por lote. qtd_recebida = Σ lancamentos válidos (cancelado IS NOT TRUE) vinculados ao lote; diferenca = negociada − recebida; estado nao_iniciado|parcial|completo|excedente. Tenant-safe (security_invoker).';

REVOKE ALL ON TABLE public.vw_oc_lotes_recebimento FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.vw_oc_lotes_recebimento TO authenticated;
