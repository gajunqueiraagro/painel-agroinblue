-- FIN-CLASSIF-DIVIDIDA-01a-1 — parte 4/5: voltar para 1 conta, desfazer a ultima operacao e a divisao no PAI (financiamento / compra
-- parcelada / obrigacao). Partida da 111302 pelo limite do canal.

-- voltar para 1 conta: p_plano_conta_id nulo = a maior parte
CREATE OR REPLACE FUNCTION public.fn_lancamento_voltar_uma_conta(p_lancamento_id uuid, p_plano_conta_id uuid, p_motivo text, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.financeiro_lancamentos_v2; v_plano uuid; v_antes jsonb; v_div uuid; v_sub text;
BEGIN
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento_id;
  IF l.id IS NULL OR NOT coalesce(public.tenant_ok(l.cliente_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Você não tem acesso a este lançamento.', DETAIL = p_lancamento_id::text;
  END IF;
  IF coalesce(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION USING MESSAGE = 'Diga o motivo.', DETAIL = p_lancamento_id::text; END IF;
  IF NOT l.classificacao_dividida THEN RAISE EXCEPTION USING MESSAGE = 'Este lançamento não está dividido.', DETAIL = p_lancamento_id::text; END IF;
  IF EXISTS (SELECT 1 FROM public.financeiro_fechamentos f WHERE f.cliente_id = l.cliente_id AND f.fazenda_id = l.fazenda_id
              AND f.ano_mes = l.ano_mes AND f.status_fechamento = 'fechado') THEN
    RAISE EXCEPTION USING MESSAGE = format('%s está fechado no Financeiro para %s. Reabra o mês para mudar a classificação.',
      public._fn_conc_mes_txt(l.ano_mes), public._fn_conc_fazenda_txt(l.fazenda_id)), DETAIL = p_lancamento_id::text;
  END IF;
  v_plano := coalesce(p_plano_conta_id, (SELECT p.plano_conta_id FROM public.financeiro_lancamento_partes p WHERE p.lancamento_id = l.id
                                          ORDER BY p.valor DESC, p.ordem LIMIT 1));
  SELECT pc.subcentro INTO v_sub FROM public.financeiro_plano_contas pc
   WHERE pc.id = v_plano AND pc.ativo AND (pc.cliente_id IS NULL OR pc.cliente_id = l.cliente_id) AND pc.tipo_operacao = l.tipo_operacao;
  IF v_sub IS NULL THEN RAISE EXCEPTION USING MESSAGE = 'A conta escolhida não existe no plano de contas deste tipo de lançamento.', DETAIL = p_lancamento_id::text; END IF;
  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'lancamento_id', l.id, 'plano_conta_id', v_plano, 'subcentro', v_sub,
      'frase', format('Volta inteiro para "%s".', v_sub));
  END IF;
  v_antes := jsonb_build_object('lancamento', jsonb_build_object('plano_conta_id', l.plano_conta_id, 'safra_id', l.safra_id, 'cultura', l.cultura,
                                 'fase', l.fase, 'classificacao_dividida', true),
             'partes', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.ordem) FROM public.financeiro_lancamento_partes p WHERE p.lancamento_id = l.id));
  PERFORM set_config('app.fin_dividindo', 'on', true);
  DELETE FROM public.financeiro_lancamento_partes WHERE lancamento_id = l.id;
  UPDATE public.financeiro_lancamentos_v2 SET plano_conta_id = v_plano, classificacao_dividida = false, updated_by = auth.uid(), updated_at = now()
   WHERE id = l.id;
  PERFORM set_config('app.fin_dividindo', 'off', true);
  INSERT INTO public.financeiro_lancamento_divisoes (cliente_id, lancamento_id, acao, antes, depois, motivo, criado_por)
  VALUES (l.cliente_id, l.id, 'voltar', v_antes, jsonb_build_object('plano_conta_id', v_plano, 'partes', '[]'::jsonb), p_motivo, auth.uid())
  RETURNING id INTO v_div;
  RETURN jsonb_build_object('ok', true, 'simulado', false, 'lancamento_id', l.id, 'divisao_id', v_div, 'plano_conta_id', v_plano, 'subcentro', v_sub);
END $$;

-- desfazer a ULTIMA operacao (dividir / pelos itens / voltar / pai) do lancamento: volta o "antes" dela
CREATE OR REPLACE FUNCTION public.fn_lancamento_divisao_desfazer(p_divisao_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.financeiro_lancamento_divisoes; l public.financeiro_lancamentos_v2; v_div uuid; v_depois jsonb;
BEGIN
  SELECT * INTO d FROM public.financeiro_lancamento_divisoes WHERE id = p_divisao_id;
  IF d.id IS NULL OR NOT coalesce(public.tenant_ok(d.cliente_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Você não tem acesso a esta divisão.', DETAIL = p_divisao_id::text;
  END IF;
  IF coalesce(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION USING MESSAGE = 'Diga o motivo.', DETAIL = p_divisao_id::text; END IF;
  IF d.desfeita_em IS NOT NULL OR d.acao IN ('reescalar', 'desfazer') THEN
    RAISE EXCEPTION USING MESSAGE = 'Esta operação já foi desfeita (ou não se desfaz).', DETAIL = p_divisao_id::text;
  END IF;
  IF EXISTS (SELECT 1 FROM public.financeiro_lancamento_divisoes x WHERE x.lancamento_id = d.lancamento_id AND x.criado_em > d.criado_em
              AND x.desfeita_em IS NULL AND x.acao <> 'reescalar') THEN
    RAISE EXCEPTION USING MESSAGE = 'Houve outra divisão depois desta: desfaça a mais recente antes.', DETAIL = p_divisao_id::text;
  END IF;
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = d.lancamento_id;
  IF EXISTS (SELECT 1 FROM public.financeiro_fechamentos f WHERE f.cliente_id = l.cliente_id AND f.fazenda_id = l.fazenda_id
              AND f.ano_mes = l.ano_mes AND f.status_fechamento = 'fechado') THEN
    RAISE EXCEPTION USING MESSAGE = format('%s está fechado no Financeiro. Reabra o mês para desfazer.', public._fn_conc_mes_txt(l.ano_mes)), DETAIL = p_divisao_id::text;
  END IF;
  v_depois := jsonb_build_object('lancamento', jsonb_build_object('plano_conta_id', l.plano_conta_id, 'classificacao_dividida', l.classificacao_dividida),
              'partes', coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.ordem) FROM public.financeiro_lancamento_partes p WHERE p.lancamento_id = l.id), '[]'::jsonb));
  PERFORM set_config('app.fin_dividindo', 'on', true);
  DELETE FROM public.financeiro_lancamento_partes WHERE lancamento_id = l.id;
  INSERT INTO public.financeiro_lancamento_partes
  SELECT * FROM jsonb_populate_recordset(NULL::public.financeiro_lancamento_partes, coalesce(d.antes->'partes', '[]'::jsonb));
  UPDATE public.financeiro_lancamentos_v2
     SET plano_conta_id = (d.antes->'lancamento'->>'plano_conta_id')::uuid,
         classificacao_dividida = coalesce((d.antes->'lancamento'->>'classificacao_dividida')::boolean, false),
         updated_by = auth.uid(), updated_at = now()
   WHERE id = l.id;
  PERFORM set_config('app.fin_dividindo', 'off', true);
  UPDATE public.financeiro_lancamento_divisoes SET desfeita_em = now(), desfeita_por = auth.uid(), desfeita_motivo = p_motivo WHERE id = d.id;
  INSERT INTO public.financeiro_lancamento_divisoes (cliente_id, lancamento_id, acao, antes, depois, motivo, criado_por)
  VALUES (l.cliente_id, l.id, 'desfazer', v_depois, d.antes, p_motivo, auth.uid()) RETURNING id INTO v_div;
  RETURN jsonb_build_object('ok', true, 'lancamento_id', l.id, 'divisao_id', v_div, 'desfeita', d.id);
END $$;

-- a divisao no PAI (financiamento / compra parcelada / obrigacao): percentuais; cada parcela (o lancamento do principal) leva a mesma
-- proporcao, a ultima parte de cada parcela absorve o centavo. A divisao fica no pai (`financiamentos.classificacao_partes`).
ALTER TABLE public.financiamentos ADD COLUMN IF NOT EXISTS classificacao_partes jsonb;
CREATE OR REPLACE FUNCTION public.fn_financiamento_dividir_classificacao(p_financiamento_id uuid, p_partes jsonb, p_motivo text, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.financiamentos; r record; v_res jsonb := '[]'::jsonb; v_um jsonb;
BEGIN
  SELECT * INTO f FROM public.financiamentos WHERE id = p_financiamento_id;
  IF f.id IS NULL OR NOT coalesce(public.tenant_ok(f.cliente_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Você não tem acesso a este cadastro.', DETAIL = p_financiamento_id::text;
  END IF;
  IF (SELECT bool_or(NOT (e ? 'percentual')) FROM jsonb_array_elements(coalesce(p_partes, '[]'::jsonb)) e) THEN
    RAISE EXCEPTION USING MESSAGE = 'No cadastro, a divisão é por percentual (cada parcela leva a mesma proporção).', DETAIL = p_financiamento_id::text;
  END IF;
  FOR r IN SELECT DISTINCT fp.lancamento_id FROM public.financiamento_parcelas fp
            JOIN public.financeiro_lancamentos_v2 l ON l.id = fp.lancamento_id
           WHERE fp.financiamento_id = f.id AND fp.lancamento_id IS NOT NULL AND l.cancelado IS NOT TRUE
           ORDER BY fp.lancamento_id LOOP
    v_um := public._fn_fin_dividir(r.lancamento_id, p_partes, 'pai', 'pai', p_motivo, p_simular, f.id);
    v_res := v_res || jsonb_build_object('lancamento_id', r.lancamento_id, 'partes', v_um->'partes');
  END LOOP;
  IF jsonb_array_length(v_res) = 0 THEN
    RAISE EXCEPTION USING MESSAGE = 'Este cadastro não tem parcelas lançadas para dividir.', DETAIL = p_financiamento_id::text;
  END IF;
  IF NOT p_simular THEN
    UPDATE public.financiamentos SET classificacao_partes = p_partes WHERE id = f.id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'simulado', p_simular, 'financiamento_id', f.id, 'parcelas', jsonb_array_length(v_res), 'por_parcela', v_res);
END $$;

REVOKE ALL ON FUNCTION public.fn_lancamento_voltar_uma_conta(uuid, uuid, text, boolean), public.fn_lancamento_divisao_desfazer(uuid, text),
  public.fn_financiamento_dividir_classificacao(uuid, jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lancamento_voltar_uma_conta(uuid, uuid, text, boolean), public.fn_lancamento_divisao_desfazer(uuid, text),
  public.fn_financiamento_dividir_classificacao(uuid, jsonb, text, boolean) TO authenticated;
