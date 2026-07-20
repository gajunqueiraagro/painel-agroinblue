-- PR-OC-MODEL-01 parte 3 — RPCs NOVAS dos eixos Animais e Liquidação + helper de peso +
--   oc_derivar_status (leitura). Nenhuma destas grava status_comercial → são compatíveis
--   com o vocabulário antigo (parte 4 troca o vocabulário atomicamente). Banco funcional
--   ao fim desta migration. NÃO aplicar por este PR.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- _oc_conciliar_peso (INTERNA) — concilia peso médio × total × quantidade.
--   Tolerância: 1% do total calculado (mín. 1 kg). Regras (Decisão 5):
--     só médio  -> total = qtd × médio;  só total -> médio = total ÷ qtd;
--     ambos     -> valida coerência dentro da tolerância (senão P0001);
--     nunca aceita peso <= 0. Retorna jsonb {medio, total} (nulos se peso ausente).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._oc_conciliar_peso(
  p_qtd integer, p_medio numeric, p_total numeric)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE v_tol numeric;
BEGIN
  IF p_medio IS NULL AND p_total IS NULL THEN
    RETURN jsonb_build_object('medio', NULL, 'total', NULL);  -- peso ausente é permitido
  END IF;
  IF p_qtd IS NULL OR p_qtd <= 0 THEN
    RAISE EXCEPTION 'Peso informado exige quantidade > 0' USING ERRCODE = 'P0001'; END IF;
  IF (p_medio IS NOT NULL AND p_medio <= 0) OR (p_total IS NOT NULL AND p_total <= 0) THEN
    RAISE EXCEPTION 'Peso deve ser > 0' USING ERRCODE = 'P0001'; END IF;

  IF p_medio IS NOT NULL AND p_total IS NOT NULL THEN
    v_tol := GREATEST(1.0, 0.01 * (p_qtd::numeric * p_medio));
    IF abs(p_total - p_qtd::numeric * p_medio) > v_tol THEN
      RAISE EXCEPTION 'Peso médio (%) e total (%) incompatíveis com quantidade % (tolerância 1%%)',
        p_medio, p_total, p_qtd USING ERRCODE = 'P0001'; END IF;
    RETURN jsonb_build_object('medio', p_medio, 'total', p_total);
  ELSIF p_medio IS NOT NULL THEN
    RETURN jsonb_build_object('medio', p_medio, 'total', round(p_qtd::numeric * p_medio, 3));
  ELSE
    RETURN jsonb_build_object('medio', round(p_total / p_qtd::numeric, 3), 'total', p_total);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._oc_conciliar_peso(integer, numeric, numeric) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- oc_registrar_movimentacao (eixo ANIMAIS). Programada OU fechada podem receber fato
--   (Decisão 4); vedado rascunho/cancelada/entrega encerrada. Sem pasto. Reusa lancamentos.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_registrar_movimentacao(
  p_operacao_id uuid, p_cliente_id uuid, p_data date, p_categoria text,
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
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501';        -- guard: tenant
  END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;  -- guard: pertencimento
  IF v_op.rascunho OR v_op.status_comercial = 'rascunho' THEN                                                       -- guard: rascunho (técnico + legado)
    RAISE EXCEPTION 'Rascunho (tecnico ou legado) nao permite movimentacao' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'Operacao cancelada' USING ERRCODE = 'P0001'; END IF;  -- guard: cancelada
  IF v_op.entrega_encerrada THEN RAISE EXCEPTION 'Entrega ja encerrada' USING ERRCODE = 'P0001'; END IF;             -- guard: entrega encerrada
  IF v_op.fazenda_id IS NULL THEN RAISE EXCEPTION 'Operacao sem fazenda soberana' USING ERRCODE = 'P0001'; END IF;   -- guard: fazenda
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN RAISE EXCEPTION 'Quantidade deve ser > 0' USING ERRCODE = 'P0001'; END IF; -- guard: qtd
  v_tipo := CASE v_op.tipo_operacao WHEN 'compra' THEN 'compra' WHEN 'venda' THEN 'venda'
                                    WHEN 'abate' THEN 'abate' ELSE NULL END;
  IF v_tipo IS NULL THEN RAISE EXCEPTION 'tipo_operacao % sem mapa zootecnico', v_op.tipo_operacao USING ERRCODE = 'P0001'; END IF; -- guard: mapa tipo
  v_peso := public._oc_conciliar_peso(p_quantidade, p_peso_medio_kg, p_peso_total_kg);  -- guard: coerência de peso

  -- status_operacional='realizado' é OBRIGATÓRIO para cenario='realizado'
  --   (trigger validate_cenario_status: cenario=realizado exige status_operacional ∈
  --   programado|agendado|realizado). Fato efetivo ⇒ 'realizado'.
  INSERT INTO public.lancamentos (
    cliente_id, fazenda_id, tipo, categoria, quantidade, data,
    peso_medio_kg, peso_vivo_total, cenario, status_operacional, origem_registro, created_by, updated_by, observacao)
  VALUES (
    p_cliente_id, v_op.fazenda_id, v_tipo, p_categoria, p_quantidade, p_data,
    NULLIF(v_peso->>'medio','')::numeric, NULLIF(v_peso->>'total','')::numeric,
    'realizado', 'realizado', 'operacao_comercial', v_actor, v_actor, p_observacao)
  RETURNING id INTO v_lanc;

  INSERT INTO public.zoo_operacao_movimentacoes (cliente_id, operacao_id, movimentacao_id, created_by)
  VALUES (p_cliente_id, p_operacao_id, v_lanc, v_actor) RETURNING id INTO v_link;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'registrar_movimentacao',
          jsonb_build_object('lancamento_id', v_lanc, 'tipo', v_tipo, 'categoria', p_categoria, 'quantidade', p_quantidade), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'lancamento_id', v_lanc, 'movimentacao_id', v_link);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- oc_encerrar_entrega (eixo ANIMAIS). Exige motivo quando efetivo <> negociado. Sem
--   movimentação compensatória. Veda rascunho/cancelada/reencerrar; versão otimista.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_encerrar_entrega(
  p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_soma numeric;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;              -- guard: tenant
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF; -- guard: pertencimento
  IF v_op.rascunho OR v_op.status_comercial = 'rascunho' THEN                                                    -- guard: rascunho (técnico + legado)
    RAISE EXCEPTION 'Rascunho (tecnico ou legado) nao encerra entrega' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'Operacao cancelada' USING ERRCODE = 'P0001'; END IF; -- guard: cancelada
  IF v_op.entrega_encerrada THEN RAISE EXCEPTION 'Entrega ja encerrada' USING ERRCODE = 'P0001'; END IF;        -- guard: reencerrar
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF; -- guard: versão

  SELECT COALESCE(sum(l.quantidade),0) INTO v_soma
    FROM public.zoo_operacao_movimentacoes m JOIN public.lancamentos l ON l.id=m.movimentacao_id
   WHERE m.operacao_id = p_operacao_id AND l.cancelado IS NOT TRUE;
  IF (v_op.qtd_negociada IS NULL OR v_soma <> v_op.qtd_negociada)
     AND (p_motivo IS NULL OR btrim(p_motivo) = '') THEN
    RAISE EXCEPTION 'Encerramento com diferenca exige motivo' USING ERRCODE = 'P0001'; END IF;                  -- guard: motivo p/ diferença

  UPDATE public.zoo_operacoes_comerciais
    SET entrega_encerrada = true, entrega_encerrada_em = now(), entrega_encerrada_por = v_actor,
        entrega_encerrada_motivo = p_motivo, versao = versao + 1, updated_at = now(), updated_by = v_actor
  WHERE id = p_operacao_id;
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'encerrar_entrega',
          jsonb_build_object('motivo', p_motivo, 'efetivo', v_soma, 'negociado', v_op.qtd_negociada), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao + 1, 'entrega_encerrada', true);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- oc_registrar_liquidacao (eixo LIQUIDAÇÃO). Programada OU fechada (sinal antecipado);
--   vedado rascunho/cancelada. Natureza coerente (compra→pagamento; venda/abate→recebimento).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_registrar_liquidacao(
  p_operacao_id uuid, p_cliente_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;               -- guard: tenant
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF; -- guard: pertencimento
  IF v_op.rascunho OR v_op.status_comercial = 'rascunho' THEN                                                     -- guard: rascunho (técnico + legado)
    RAISE EXCEPTION 'Rascunho (tecnico ou legado) nao permite liquidacao' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'Operacao cancelada' USING ERRCODE = 'P0001'; END IF; -- guard: cancelada
  IF v_valor <= 0 THEN RAISE EXCEPTION 'Valor da liquidacao deve ser > 0' USING ERRCODE = 'P0001'; END IF;      -- guard: valor
  v_esperada := CASE v_op.tipo_operacao WHEN 'compra' THEN 'pagamento' ELSE 'recebimento' END;
  IF v_nat <> v_esperada THEN
    RAISE EXCEPTION 'Natureza % incompativel com tipo % (esperada %)', v_nat, v_op.tipo_operacao, v_esperada USING ERRCODE = 'P0001'; END IF; -- guard: natureza
  IF v_forma = 'permuta' AND (v_perm_val IS NULL OR (p_payload->>'permuta_tipo_bem') IS NULL) THEN
    RAISE EXCEPTION 'Permuta exige tipo do bem e valor atribuido' USING ERRCODE = 'P0001'; END IF;             -- guard: permuta completa
  IF v_forma <> 'permuta' AND (v_perm_val IS NOT NULL OR (p_payload->>'permuta_tipo_bem') IS NOT NULL) THEN
    RAISE EXCEPTION 'Campos de permuta so em forma=permuta' USING ERRCODE = 'P0001'; END IF;                   -- guard: permuta exclusiva

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
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- oc_estornar_liquidacao — exige motivo; impede estorno duplicado; preserva o fato.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_estornar_liquidacao(
  p_liquidacao_id uuid, p_cliente_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_liq public.zoo_operacao_liquidacoes;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;               -- guard: tenant
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Estorno exige motivo' USING ERRCODE = 'P0001'; END IF;                                    -- guard: motivo
  SELECT * INTO v_liq FROM public.zoo_operacao_liquidacoes
    WHERE id = p_liquidacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Liquidacao % nao encontrada', p_liquidacao_id USING ERRCODE = 'P0002'; END IF; -- guard: pertencimento
  IF v_liq.estornado THEN RAISE EXCEPTION 'Liquidacao ja estornada' USING ERRCODE = 'P0001'; END IF;           -- guard: estorno duplicado

  -- Preserva valor/dados originais; marca estorno com autor e data (sem DELETE físico).
  UPDATE public.zoo_operacao_liquidacoes
    SET estornado = true, estornado_em = now(), estornado_por = v_actor, estorno_motivo = p_motivo,
        updated_at = now(), updated_by = v_actor
  WHERE id = p_liquidacao_id;
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
  VALUES (v_liq.cliente_id, v_liq.operacao_id, 'estornar_liquidacao',
          jsonb_build_object('liquidacao_id', p_liquidacao_id, 'motivo', p_motivo, 'valor_original', v_liq.valor), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'liquidacao_id', p_liquidacao_id, 'estornado', true);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- oc_derivar_status (leitura, STABLE, sem efeitos colaterais) — três eixos.
--   "Há composição final" = existe parte principal INCLUÍDA com valor>0 (predicado exato,
--   Decisão 3). Base do saldo (precedência): final > acordado > estimado > indefinida.
--   Ignora liquidações estornadas. Tolerância monetária: R$ 0,01.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_derivar_status(p_operacao_id uuid, p_cliente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op public.zoo_operacoes_comerciais;
  v_soma_ef numeric;
  v_dif numeric;
  v_tem_final boolean;
  v_base numeric;
  v_base_origem text;
  v_liq numeric;
  v_tolm numeric := 0.01;
  v_st_animais text;
  v_st_liq text;
BEGIN
  IF NOT (public.is_admin_agroinblue(auth.uid()) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id AND cliente_id = p_cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;

  SELECT COALESCE(sum(l.quantidade), 0) INTO v_soma_ef
    FROM public.zoo_operacao_movimentacoes m JOIN public.lancamentos l ON l.id = m.movimentacao_id
   WHERE m.operacao_id = p_operacao_id AND l.cancelado IS NOT TRUE;
  v_dif := v_soma_ef - COALESCE(v_op.qtd_negociada, 0);

  -- ANIMAIS (excedente antes do encerramento continua 'parcial' — Decisão 6)
  IF NOT v_op.entrega_encerrada THEN
    v_st_animais := CASE WHEN v_soma_ef = 0 THEN 'nao_iniciado' ELSE 'parcial' END;
  ELSE
    v_st_animais := CASE WHEN v_op.qtd_negociada IS NOT NULL AND v_soma_ef = v_op.qtd_negociada
                         THEN 'concluido' ELSE 'concluido_com_diferenca' END;
  END IF;

  -- BASE DO SALDO — predicado exato de composição final
  v_tem_final := EXISTS (SELECT 1 FROM public.zoo_operacao_partes
                          WHERE operacao_id = p_operacao_id AND natureza = 'principal'
                            AND incluso_no_total IS TRUE AND valor > 0);
  IF v_tem_final THEN v_base := v_op.valor_total; v_base_origem := 'final';
  ELSIF v_op.valor_acordado IS NOT NULL THEN v_base := v_op.valor_acordado; v_base_origem := 'acordado';
  ELSIF v_op.valor_estimado IS NOT NULL THEN v_base := v_op.valor_estimado; v_base_origem := 'estimado';
  ELSE v_base := NULL; v_base_origem := 'indefinida';
  END IF;

  SELECT COALESCE(sum(valor), 0) INTO v_liq
    FROM public.zoo_operacao_liquidacoes WHERE operacao_id = p_operacao_id AND estornado IS NOT TRUE;

  IF v_base IS NULL THEN
    v_st_liq := CASE WHEN v_liq = 0 THEN 'nao_iniciada' ELSE 'base_indefinida' END;
  ELSE
    v_st_liq := CASE
      WHEN v_liq = 0                 THEN 'nao_iniciada'
      WHEN v_liq <  v_base - v_tolm  THEN 'parcial'
      WHEN v_liq <= v_base + v_tolm  THEN 'liquidada'
      ELSE 'excedente' END;
  END IF;

  RETURN jsonb_build_object(
    'comercial', v_op.status_comercial, 'rascunho', v_op.rascunho,
    'animais', jsonb_build_object(
      'status_animais', v_st_animais, 'quantidade_negociada', v_op.qtd_negociada,
      'quantidade_efetiva', v_soma_ef, 'diferenca_quantidade', v_dif, 'entrega_encerrada', v_op.entrega_encerrada),
    'liquidacao', jsonb_build_object(
      'status_liquidacao', v_st_liq, 'base', v_base, 'base_origem', v_base_origem,
      'total_liquidado', v_liq, 'saldo', CASE WHEN v_base IS NULL THEN NULL ELSE v_base - v_liq END));
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants (padrão OC).
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.oc_registrar_movimentacao(uuid,uuid,date,text,integer,numeric,numeric,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oc_encerrar_entrega(uuid,uuid,integer,text)                                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oc_registrar_liquidacao(uuid,uuid,jsonb)                                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oc_estornar_liquidacao(uuid,uuid,text)                                      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oc_derivar_status(uuid,uuid)                                                FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_registrar_movimentacao(uuid,uuid,date,text,integer,numeric,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.oc_encerrar_entrega(uuid,uuid,integer,text)                                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.oc_registrar_liquidacao(uuid,uuid,jsonb)                                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.oc_estornar_liquidacao(uuid,uuid,text)                                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.oc_derivar_status(uuid,uuid)                                                TO authenticated;
