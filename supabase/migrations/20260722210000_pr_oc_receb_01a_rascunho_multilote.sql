-- PR-OC-RECEB-01A — correção runtime: máquina de estados multilote em oc_salvar_lotes.
--   Descoberto na homologação: v_completo de oc_salvar_rascunho exige colunas single-lot
--   (qtd_negociada/categoria_negociada/tipo_precificacao/preco_unitario) que o fluxo multilote
--   nunca preenche → a operação nunca saía de rascunho → oc_confirmar inalcançável.
--   Correção: oc_salvar_lotes recomputa rascunho pelo MODELO MULTILOTE. Completo (rascunho=false)
--   somente quando: fazenda + contraparte + tipo_operacao + data_operacao + >=1 lote válido
--   + Σ qtd_negociada > 0 + valor_acordado > 0. Não preenche nem depende das colunas single-lot.
--   oc_confirmar NÃO é alterado (já aceita multilote). Só reaplica esta função (schema/demais
--   RPCs da migration 20260722200000 permanecem).
-- NÃO aplicar por este PR (aplicação remota é etapa separada, sob autorização).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

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

  -- Bump + base financeira (valor_acordado) + quantidade agregada (qtd_negociada) + RASCUNHO multilote.
  --   Completo (rascunho=false) só com identificação + >=1 lote + Σqtd>0 + valor_acordado>0.
  --   NÃO depende das colunas single-lot antigas (categoria_negociada/tipo_precificacao/preco_unitario).
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
REVOKE ALL ON FUNCTION public.oc_salvar_lotes(uuid, uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_salvar_lotes(uuid, uuid, integer, jsonb) TO authenticated;
