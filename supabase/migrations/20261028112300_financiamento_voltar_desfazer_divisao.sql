-- P72 (Gabriel 23/10/2026; achado do FIN-CLASSIF-DIVIDIDA-01b/01c) — "Voltar para 1 conta" e "Desfazer" na PARCELA de compra parcelada /
-- financiamento: pelo CADASTRO, nas N parcelas de uma vez (o espelho de `fn_financiamento_dividir_classificacao`). Uma transacao: as duas
-- chamam, parcela a parcela, as MESMAS funcoes por lancamento (`fn_lancamento_voltar_uma_conta`, `fn_lancamento_divisao_desfazer`), com as
-- guardas delas (tenant_ok, motivo, mes fechado); a primeira que recusar desfaz TUDO e a frase diz QUAL parcela ("Parcela 3/4, venc.
-- 10/12/2026: …"). A trilha: cada operacao por parcela leva o `financiamento_id` (como a do dividir pelo cadastro).
--   · voltar: a conta e' a MESMA nas N (a informada, ou a maior parte da divisao do cadastro); o cadastro perde `classificacao_partes`.
--   · desfazer: a ULTIMA operacao de cada parcela tem de ser do cadastro (financiamento_id) e a mesma acao em todas; senao recusa
--     (alguem mexeu numa parcela so': desfaca nela). Depois, `classificacao_partes` volta a ser a das parcelas (ou nulo).
SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public._fn_financiamento_parcelas_vivas(p_financiamento_id uuid)
RETURNS TABLE (lancamento_id uuid, rotulo text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT fp.lancamento_id,
         format('Parcela %s/%s, venc. %s', fp.numero_parcela, count(*) OVER (), to_char(coalesce(l.data_vencimento, fp.data_vencimento), 'DD/MM/YYYY'))
    FROM public.financiamento_parcelas fp JOIN public.financeiro_lancamentos_v2 l ON l.id = fp.lancamento_id
   WHERE fp.financiamento_id = p_financiamento_id AND fp.lancamento_id IS NOT NULL AND l.cancelado IS NOT TRUE
   ORDER BY fp.numero_parcela
$$;
REVOKE ALL ON FUNCTION public._fn_financiamento_parcelas_vivas(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_financiamento_voltar_uma_conta(p_financiamento_id uuid, p_plano_conta_id uuid, p_motivo text, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.financiamentos; r record; v_plano uuid; v_um jsonb; v_n int := 0; v_sub text;
BEGIN
  SELECT * INTO f FROM public.financiamentos WHERE id = p_financiamento_id;
  IF f.id IS NULL OR NOT coalesce(public.tenant_ok(f.cliente_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Você não tem acesso a este cadastro.', DETAIL = coalesce(p_financiamento_id::text, '');
  END IF;
  IF coalesce(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION USING MESSAGE = 'Diga o motivo.', DETAIL = f.id::text; END IF;
  -- a MESMA conta nas N: a informada, senao a maior parte da divisao do cadastro (ou, sem ela, a maior parte da 1a parcela dividida)
  v_plano := coalesce(p_plano_conta_id,
    (SELECT (e->>'plano_conta_id')::uuid FROM jsonb_array_elements(coalesce(f.classificacao_partes, '[]'::jsonb)) WITH ORDINALITY x(e, k)
      ORDER BY (e->>'percentual')::numeric DESC, k LIMIT 1),
    (SELECT p.plano_conta_id FROM public._fn_financiamento_parcelas_vivas(f.id) v JOIN public.financeiro_lancamento_partes p ON p.lancamento_id = v.lancamento_id
      ORDER BY p.valor DESC, p.ordem LIMIT 1));
  FOR r IN SELECT v.lancamento_id, v.rotulo FROM public._fn_financiamento_parcelas_vivas(f.id) v
            JOIN public.financeiro_lancamentos_v2 l ON l.id = v.lancamento_id WHERE l.classificacao_dividida LOOP
    BEGIN
      v_um := public.fn_lancamento_voltar_uma_conta(r.lancamento_id, v_plano, p_motivo, p_simular);
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION USING MESSAGE = format('%s: %s Nada foi mudado nas parcelas.', r.rotulo, sqlerrm), DETAIL = f.id::text;
    END;
    v_n := v_n + 1; v_sub := v_um->>'subcentro';
    IF NOT p_simular THEN UPDATE public.financeiro_lancamento_divisoes SET financiamento_id = f.id WHERE id = (v_um->>'divisao_id')::uuid; END IF;
  END LOOP;
  IF v_n = 0 THEN RAISE EXCEPTION USING MESSAGE = 'Nenhuma parcela deste cadastro está dividida.', DETAIL = f.id::text; END IF;
  IF NOT p_simular THEN UPDATE public.financiamentos SET classificacao_partes = NULL WHERE id = f.id; END IF;
  RETURN jsonb_build_object('ok', true, 'simulado', p_simular, 'financiamento_id', f.id, 'parcelas', v_n, 'plano_conta_id', v_plano, 'subcentro', v_sub,
    'frase', format('As %s parcelas voltam inteiras para "%s".', v_n, v_sub));
END $$;

CREATE OR REPLACE FUNCTION public.fn_financiamento_divisao_desfazer(p_financiamento_id uuid, p_motivo text, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.financiamentos; r record; v_ops uuid[] := '{}'; v_acoes text[] := '{}'; v_op public.financeiro_lancamento_divisoes; v_n int := 0;
  v_um jsonb; v_partes jsonb;
BEGIN
  SELECT * INTO f FROM public.financiamentos WHERE id = p_financiamento_id;
  IF f.id IS NULL OR NOT coalesce(public.tenant_ok(f.cliente_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Você não tem acesso a este cadastro.', DETAIL = coalesce(p_financiamento_id::text, '');
  END IF;
  IF coalesce(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION USING MESSAGE = 'Diga o motivo.', DETAIL = f.id::text; END IF;
  -- a ULTIMA operacao de cada parcela: tem de existir, ser do cadastro e ser a mesma acao nas N
  FOR r IN SELECT v.lancamento_id, v.rotulo FROM public._fn_financiamento_parcelas_vivas(f.id) v LOOP
    SELECT * INTO v_op FROM public.financeiro_lancamento_divisoes x
     WHERE x.lancamento_id = r.lancamento_id AND x.desfeita_em IS NULL AND x.acao NOT IN ('reescalar', 'desfazer')
     ORDER BY x.criado_em DESC LIMIT 1;
    IF v_op.id IS NULL THEN
      IF v_n = 0 AND NOT EXISTS (SELECT 1 FROM public.financeiro_lancamento_divisoes x JOIN public._fn_financiamento_parcelas_vivas(f.id) w ON w.lancamento_id = x.lancamento_id
                                  WHERE x.desfeita_em IS NULL AND x.acao NOT IN ('reescalar', 'desfazer')) THEN
        RAISE EXCEPTION USING MESSAGE = 'Não há divisão deste cadastro para desfazer.', DETAIL = f.id::text;
      END IF;
      RAISE EXCEPTION USING MESSAGE = format('%s não tem a operação para desfazer: as parcelas não estão na mesma divisão. Desfaça parcela a parcela.', r.rotulo), DETAIL = f.id::text;
    END IF;
    IF v_op.financiamento_id IS DISTINCT FROM f.id THEN
      RAISE EXCEPTION USING MESSAGE = format('%s foi mudada sozinha depois da divisão do cadastro: desfaça nela antes.', r.rotulo), DETAIL = f.id::text;
    END IF;
    IF cardinality(v_acoes) > 0 AND v_op.acao <> v_acoes[1] THEN
      RAISE EXCEPTION USING MESSAGE = format('%s está noutra operação que as outras parcelas: desfaça parcela a parcela.', r.rotulo), DETAIL = f.id::text;
    END IF;
    v_ops := v_ops || v_op.id; v_acoes := v_acoes || v_op.acao; v_n := v_n + 1;
  END LOOP;
  IF v_n = 0 THEN RAISE EXCEPTION USING MESSAGE = 'Este cadastro não tem parcelas lançadas.', DETAIL = f.id::text; END IF;
  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'financiamento_id', f.id, 'parcelas', v_n, 'acao', v_acoes[1],
      'frase', format('Desfaz a última operação (%s) nas %s parcelas desta compra.', CASE v_acoes[1] WHEN 'voltar' THEN 'voltar para 1 conta' ELSE 'a divisão' END, v_n));
  END IF;
  FOR r IN SELECT v.rotulo, o.id FROM unnest(v_ops) WITH ORDINALITY o(id, k)
             JOIN LATERAL (SELECT w.rotulo FROM public._fn_financiamento_parcelas_vivas(f.id) w
                            JOIN public.financeiro_lancamento_divisoes x ON x.lancamento_id = w.lancamento_id WHERE x.id = o.id) v ON true LOOP
    BEGIN
      v_um := public.fn_lancamento_divisao_desfazer(r.id, p_motivo);
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION USING MESSAGE = format('%s: %s Nada foi mudado nas parcelas.', r.rotulo, sqlerrm), DETAIL = f.id::text;
    END;
    UPDATE public.financeiro_lancamento_divisoes SET financiamento_id = f.id WHERE id = (v_um->>'divisao_id')::uuid;
  END LOOP;
  -- a divisao do cadastro volta a ser a das parcelas (a 1a, em %), ou nenhuma
  SELECT jsonb_agg(jsonb_build_object('plano_conta_id', p.plano_conta_id, 'percentual', p.percentual) ORDER BY p.ordem) INTO v_partes
    FROM public.financeiro_lancamento_partes p
   WHERE p.lancamento_id = (SELECT v.lancamento_id FROM public._fn_financiamento_parcelas_vivas(f.id) v LIMIT 1) AND p.origem = 'pai';
  UPDATE public.financiamentos SET classificacao_partes = v_partes WHERE id = f.id;
  RETURN jsonb_build_object('ok', true, 'simulado', false, 'financiamento_id', f.id, 'parcelas', v_n, 'acao', v_acoes[1]);
END $$;

REVOKE ALL ON FUNCTION public.fn_financiamento_voltar_uma_conta(uuid, uuid, text, boolean), public.fn_financiamento_divisao_desfazer(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_financiamento_voltar_uma_conta(uuid, uuid, text, boolean), public.fn_financiamento_divisao_desfazer(uuid, text, boolean) TO authenticated, service_role;
