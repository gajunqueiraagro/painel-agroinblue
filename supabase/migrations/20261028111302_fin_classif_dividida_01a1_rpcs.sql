-- FIN-CLASSIF-DIVIDIDA-01a-1 — parte 3/5: o nucleo e o dividir (111303: voltar, desfazer e o pai; 111304: os itens da nota).
-- Todas as RPCs da divisao: guarda de cliente (`tenant_ok`), motivo obrigatorio, simular por padrao, mes fechado igual ao editar
-- classificacao, trilha antes/depois em `financeiro_lancamento_divisoes`. Nao tocam valor, data, conta nem conciliacao.

-- o nucleo: valida, calcula as partes e (sem simular) grava. p_partes: [{plano_conta_id, valor | percentual, safra_id?, cultura?, fase?,
-- nota_itens?}] — ou todas com valor (soma = |valor|) ou todas com percentual (soma = 100; a ultima absorve o centavo).
CREATE OR REPLACE FUNCTION public._fn_fin_dividir(p_lanc uuid, p_partes jsonb, p_origem text, p_acao text, p_motivo text, p_simular boolean,
                                                  p_financiamento uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l public.financeiro_lancamentos_v2; v_total numeric; v_n int; v_por_valor boolean; v_por_pct boolean; v_soma numeric := 0;
  v_acum numeric := 0; v_res jsonb := '[]'::jsonb; v_it jsonb; v_pc record; v_val numeric; v_pct numeric; v_k int := 0;
  v_fl record; v_antes jsonb; v_maior uuid; v_div uuid; v_txt text;
BEGIN
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = p_lanc;
  IF l.id IS NULL OR NOT coalesce(public.tenant_ok(l.cliente_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Você não tem acesso a este lançamento.', DETAIL = p_lanc::text;
  END IF;
  v_txt := format('"%s"', coalesce(l.descricao, l.historico, 'sem descrição'));
  IF coalesce(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION USING MESSAGE = 'Diga o motivo da divisão.', DETAIL = p_lanc::text; END IF;
  IF l.cancelado IS TRUE THEN RAISE EXCEPTION USING MESSAGE = format('O lançamento %s está cancelado.', v_txt), DETAIL = p_lanc::text; END IF;
  IF coalesce(l.cenario, 'realizado') = 'meta' THEN RAISE EXCEPTION USING MESSAGE = 'Lançamento de META não se divide.', DETAIL = p_lanc::text; END IF;
  IF l.tipo_operacao LIKE '3-%' THEN RAISE EXCEPTION USING MESSAGE = 'Transferência entre contas não tem classificação para dividir.', DETAIL = p_lanc::text; END IF;
  IF coalesce(abs(l.valor), 0) = 0 THEN RAISE EXCEPTION USING MESSAGE = format('O lançamento %s está com valor zero.', v_txt), DETAIL = p_lanc::text; END IF;
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt WHERE pt.financeiro_lancamento_id = l.id AND pt.cancelada IS NOT TRUE) THEN
    RAISE EXCEPTION USING MESSAGE = format('O lançamento %s é de uma operação comercial: a classificação vem da operação.', v_txt), DETAIL = p_lanc::text;
  END IF;
  IF l.financiamento_id IS NOT NULL AND p_origem <> 'pai' THEN
    RAISE EXCEPTION USING MESSAGE = format('O lançamento %s é parcela de um financiamento ou compra parcelada: divida no cadastro dele, e todas as parcelas seguem.', v_txt),
      DETAIL = p_lanc::text;
  END IF;
  IF EXISTS (SELECT 1 FROM public.financeiro_fechamentos f WHERE f.cliente_id = l.cliente_id AND f.fazenda_id = l.fazenda_id
              AND f.ano_mes = l.ano_mes AND f.status_fechamento = 'fechado') THEN
    RAISE EXCEPTION USING MESSAGE = format('%s está fechado no Financeiro para %s (competência do lançamento %s). Reabra o mês para dividir.',
      public._fn_conc_mes_txt(l.ano_mes), public._fn_conc_fazenda_txt(l.fazenda_id), v_txt), DETAIL = p_lanc::text;
  END IF;
  IF p_partes IS NULL OR jsonb_typeof(p_partes) <> 'array' OR jsonb_array_length(p_partes) < 2 THEN
    RAISE EXCEPTION USING MESSAGE = 'A divisão precisa de pelo menos duas contas.', DETAIL = p_lanc::text;
  END IF;
  v_n := jsonb_array_length(p_partes);
  v_total := abs(l.valor);
  v_por_valor := (SELECT bool_and(e ? 'valor' AND e->>'valor' IS NOT NULL) FROM jsonb_array_elements(p_partes) e);
  v_por_pct   := (SELECT bool_and(e ? 'percentual' AND e->>'percentual' IS NOT NULL) FROM jsonb_array_elements(p_partes) e);
  IF NOT v_por_valor AND NOT v_por_pct THEN
    RAISE EXCEPTION USING MESSAGE = 'Informe todas as partes por valor, ou todas por percentual.', DETAIL = p_lanc::text;
  END IF;
  IF (SELECT count(DISTINCT e->>'plano_conta_id') FROM jsonb_array_elements(p_partes) e) <> v_n THEN
    RAISE EXCEPTION USING MESSAGE = 'A mesma conta aparece duas vezes: some as duas partes numa só.', DETAIL = p_lanc::text;
  END IF;
  IF v_por_valor THEN
    SELECT sum(round((e->>'valor')::numeric, 2)) INTO v_soma FROM jsonb_array_elements(p_partes) e;
    IF abs(v_soma - v_total) > 0.005 THEN
      RAISE EXCEPTION USING MESSAGE = format('As partes somam %s e o lançamento é de %s (diferença de %s). Ajuste os valores.',
        public._fn_oc_brl(v_soma), public._fn_oc_brl(v_total), public._fn_oc_brl(abs(v_total - v_soma))), DETAIL = p_lanc::text;
    END IF;
  ELSE
    SELECT sum((e->>'percentual')::numeric) INTO v_soma FROM jsonb_array_elements(p_partes) e;
    IF abs(v_soma - 100) > 0.0001 THEN
      RAISE EXCEPTION USING MESSAGE = format('Os percentuais somam %s%% e precisam somar 100%%.', to_char(v_soma, 'FM990D0099')), DETAIL = p_lanc::text;
    END IF;
  END IF;

  FOR v_it IN SELECT e FROM jsonb_array_elements(p_partes) e LOOP
    v_k := v_k + 1;
    SELECT pc.* INTO v_pc FROM public.financeiro_plano_contas pc
     WHERE pc.id = (v_it->>'plano_conta_id')::uuid AND pc.ativo AND (pc.cliente_id IS NULL OR pc.cliente_id = l.cliente_id);
    IF v_pc.id IS NULL THEN
      RAISE EXCEPTION USING MESSAGE = format('A conta da parte %s não existe no plano de contas (ou está inativa).', v_k), DETAIL = p_lanc::text;
    END IF;
    IF v_pc.tipo_operacao IS DISTINCT FROM l.tipo_operacao THEN
      RAISE EXCEPTION USING MESSAGE = format('A conta "%s" é de %s e o lançamento é de %s.', v_pc.subcentro, v_pc.tipo_operacao, l.tipo_operacao), DETAIL = p_lanc::text;
    END IF;
    IF v_por_valor THEN
      v_val := round((v_it->>'valor')::numeric, 2);
      IF v_val <= 0 THEN RAISE EXCEPTION USING MESSAGE = format('A parte "%s" está com valor zero ou negativo.', v_pc.subcentro), DETAIL = p_lanc::text; END IF;
      v_pct := round(v_val * 100 / v_total, 8);
    ELSE
      v_pct := (v_it->>'percentual')::numeric;
      IF v_pct <= 0 THEN RAISE EXCEPTION USING MESSAGE = format('A parte "%s" está com percentual zero ou negativo.', v_pc.subcentro), DETAIL = p_lanc::text; END IF;
      v_val := CASE WHEN v_k < v_n THEN round(v_total * v_pct / 100, 2) ELSE v_total - v_acum END;
      IF v_val <= 0 THEN RAISE EXCEPTION USING MESSAGE = 'O valor do lançamento não cabe na divisão por percentual.', DETAIL = p_lanc::text; END IF;
    END IF;
    v_acum := v_acum + v_val;
    SELECT * INTO v_fl FROM public._fn_fin_parte_flags(l.tipo_operacao, v_pc.id, l.gera_lcdpr);
    v_res := v_res || jsonb_build_object(
      'ordem', v_k, 'valor', v_val, 'percentual', v_pct, 'plano_conta_id', v_pc.id,
      'macro_custo', v_pc.macro_custo, 'grupo_custo', v_pc.grupo_custo, 'centro_custo', v_pc.centro_custo, 'subcentro', v_pc.subcentro,
      'escopo_negocio', v_pc.escopo_negocio, 'bloco_dre', v_pc.bloco_dre,
      'safra_id', coalesce(nullif(v_it->>'safra_id', '')::uuid, CASE WHEN v_pc.escopo_negocio = 'administrativo' THEN NULL ELSE l.safra_id END),
      'cultura', coalesce(nullif(v_it->>'cultura', ''), l.cultura), 'fase', coalesce(nullif(v_it->>'fase', ''), l.fase),
      'compoe_dre', v_fl.compoe_dre, 'gera_lcdpr', v_fl.gera_lcdpr, 'nota_itens', v_it->'nota_itens');
  END LOOP;

  SELECT (e->>'plano_conta_id')::uuid INTO v_maior FROM jsonb_array_elements(v_res) e
   ORDER BY (e->>'valor')::numeric DESC, (e->>'ordem')::int LIMIT 1;

  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'lancamento_id', l.id, 'valor_lancamento', v_total, 'partes', v_res,
      'frase', format('%s fica dividido em %s contas; continua um lançamento só (um pagamento, uma conciliação).', v_txt, v_n));
  END IF;

  v_antes := jsonb_build_object(
    'lancamento', jsonb_build_object('plano_conta_id', l.plano_conta_id, 'safra_id', l.safra_id, 'cultura', l.cultura, 'fase', l.fase,
                                     'classificacao_dividida', l.classificacao_dividida),
    'partes', coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.ordem) FROM public.financeiro_lancamento_partes p WHERE p.lancamento_id = l.id), '[]'::jsonb));
  PERFORM set_config('app.fin_dividindo', 'on', true);
  DELETE FROM public.financeiro_lancamento_partes WHERE lancamento_id = l.id;
  INSERT INTO public.financeiro_lancamento_partes (cliente_id, lancamento_id, ordem, valor, percentual, plano_conta_id, macro_custo, grupo_custo,
    centro_custo, subcentro, escopo_negocio, safra_id, cultura, fase, compoe_dre, gera_lcdpr, origem, nota_itens, criado_por)
  SELECT l.cliente_id, l.id, (e->>'ordem')::smallint, (e->>'valor')::numeric, (e->>'percentual')::numeric, (e->>'plano_conta_id')::uuid,
         e->>'macro_custo', e->>'grupo_custo', e->>'centro_custo', e->>'subcentro', e->>'escopo_negocio', nullif(e->>'safra_id', '')::uuid,
         e->>'cultura', e->>'fase', (e->>'compoe_dre')::boolean, (e->>'gera_lcdpr')::boolean, p_origem,
         CASE WHEN jsonb_typeof(e->'nota_itens') = 'array' THEN e->'nota_itens' END, auth.uid()
    FROM jsonb_array_elements(v_res) e;
  -- o lancamento fica com a MAIOR parte (os gatilhos da casa derivam macro/grupo/centro e o DRE dele, como sempre)
  UPDATE public.financeiro_lancamentos_v2 SET plano_conta_id = v_maior, classificacao_dividida = true, updated_by = auth.uid(), updated_at = now()
   WHERE id = l.id;
  PERFORM set_config('app.fin_dividindo', 'off', true);
  INSERT INTO public.financeiro_lancamento_divisoes (cliente_id, lancamento_id, acao, antes, depois, motivo, financiamento_id, criado_por)
  VALUES (l.cliente_id, l.id, p_acao, v_antes, jsonb_build_object('partes', v_res, 'plano_conta_id', v_maior), p_motivo, p_financiamento, auth.uid())
  RETURNING id INTO v_div;
  RETURN jsonb_build_object('ok', true, 'simulado', false, 'lancamento_id', l.id, 'divisao_id', v_div, 'valor_lancamento', v_total, 'partes', v_res);
END $$;
REVOKE ALL ON FUNCTION public._fn_fin_dividir(uuid, jsonb, text, text, text, boolean, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_lancamento_dividir(p_lancamento_id uuid, p_partes jsonb, p_motivo text, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public._fn_fin_dividir(p_lancamento_id, p_partes, 'manual', 'dividir', p_motivo, p_simular)
$$;

REVOKE ALL ON FUNCTION public.fn_lancamento_dividir(uuid, jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lancamento_dividir(uuid, jsonb, text, boolean) TO authenticated;
