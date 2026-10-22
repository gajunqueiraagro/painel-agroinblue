-- FIN-CLASSIF-DIVIDIDA-01a-1 — parte 5/5: dividir pelos itens da nota (partida da 111302 pelo limite do canal).

-- pelos itens da nota: p_mapa [{n_item, plano_conta_id}] — TODOS os itens da nota do lancamento; soma por conta. Nota de valor diferente
-- do lancamento: as contas dividem pelo % da nota (a ultima absorve o centavo), e a resposta diz.
CREATE OR REPLACE FUNCTION public.fn_lancamento_dividir_pelos_itens(p_lancamento_id uuid, p_mapa jsonb, p_motivo text, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.financeiro_lancamentos_v2; v_nota public.nota_fiscal; v_n_notas int; v_faltam int; v_total_cent bigint; v_partes jsonb; v_res jsonb;
BEGIN
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento_id;
  IF l.id IS NULL OR NOT coalesce(public.tenant_ok(l.cliente_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Você não tem acesso a este lançamento.', DETAIL = p_lancamento_id::text;
  END IF;
  SELECT count(DISTINCT n.id) INTO v_n_notas FROM public.financeiro_lancamento_documentos d
    JOIN public.nota_fiscal n ON n.cliente_id = d.cliente_id AND n.chave_acesso = d.chave_acesso
   WHERE d.lancamento_id = l.id AND d.cancelado IS NOT TRUE;
  IF v_n_notas <> 1 THEN
    RAISE EXCEPTION USING MESSAGE = CASE WHEN v_n_notas = 0 THEN 'Este lançamento não tem nota com itens guardados: divida por valor ou percentual.'
      ELSE 'Este lançamento tem mais de uma nota: divida por valor ou percentual.' END, DETAIL = p_lancamento_id::text;
  END IF;
  SELECT n.* INTO v_nota FROM public.financeiro_lancamento_documentos d
    JOIN public.nota_fiscal n ON n.cliente_id = d.cliente_id AND n.chave_acesso = d.chave_acesso
   WHERE d.lancamento_id = l.id AND d.cancelado IS NOT TRUE LIMIT 1;
  SELECT count(*) INTO v_faltam FROM public.nota_fiscal_itens i
   WHERE i.nota_id = v_nota.id AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_mapa, '[]'::jsonb)) m
                                               WHERE (m->>'n_item')::int = i.n_item AND nullif(m->>'plano_conta_id', '') IS NOT NULL);
  IF v_faltam > 0 THEN
    RAISE EXCEPTION USING MESSAGE = format('Faltam %s de %s itens da nota sem conta. Escolha a conta de cada item.', v_faltam,
      (SELECT count(*) FROM public.nota_fiscal_itens i WHERE i.nota_id = v_nota.id)), DETAIL = p_lancamento_id::text;
  END IF;
  SELECT sum(i.liquido_cent) INTO v_total_cent FROM public.nota_fiscal_itens i WHERE i.nota_id = v_nota.id;
  IF coalesce(v_total_cent, 0) <= 0 THEN RAISE EXCEPTION USING MESSAGE = 'Os itens da nota não têm valor.', DETAIL = p_lancamento_id::text; END IF;
  -- soma por conta, na ordem do primeiro item de cada conta
  SELECT jsonb_agg(CASE WHEN v_total_cent = round(abs(l.valor) * 100)
                        THEN jsonb_build_object('plano_conta_id', c.plano, 'valor', c.cent / 100.0, 'nota_itens', c.itens)
                        ELSE jsonb_build_object('plano_conta_id', c.plano, 'percentual', c.cent * 100.0 / v_total_cent, 'nota_itens', c.itens) END
                   ORDER BY c.primeiro)
    INTO v_partes
    FROM (SELECT (m->>'plano_conta_id') AS plano, sum(i.liquido_cent) AS cent, min(i.n_item) AS primeiro, jsonb_agg(i.n_item ORDER BY i.n_item) AS itens
            FROM public.nota_fiscal_itens i
            JOIN jsonb_array_elements(p_mapa) m ON (m->>'n_item')::int = i.n_item
           WHERE i.nota_id = v_nota.id GROUP BY 1) c;
  IF jsonb_array_length(v_partes) < 2 THEN
    RAISE EXCEPTION USING MESSAGE = 'Todos os itens foram para a mesma conta: não há o que dividir (troque a conta do lançamento).', DETAIL = p_lancamento_id::text;
  END IF;
  -- percentuais que somam 100 com folga de arredondamento: a ultima conta fecha
  IF v_total_cent <> round(abs(l.valor) * 100) THEN
    v_partes := jsonb_set(v_partes, ARRAY[(jsonb_array_length(v_partes) - 1)::text, 'percentual'],
      to_jsonb(100 - (SELECT sum((e->>'percentual')::numeric) FROM jsonb_array_elements(v_partes) WITH ORDINALITY x(e, k) WHERE k < jsonb_array_length(v_partes))));
  END IF;
  v_res := public._fn_fin_dividir(p_lancamento_id, v_partes, 'nota', 'dividir_nota', p_motivo, p_simular);
  RETURN v_res || jsonb_build_object('nota_id', v_nota.id, 'nota_valor', v_total_cent / 100.0,
    'proporcional', v_total_cent <> round(abs(l.valor) * 100),
    'frase_nota', CASE WHEN v_total_cent <> round(abs(l.valor) * 100)
      THEN format('A nota soma %s e o lançamento é de %s: as contas dividem pela proporção da nota.', public._fn_oc_brl(v_total_cent / 100.0), public._fn_oc_brl(abs(l.valor)))
      ELSE 'A soma das contas fecha com a nota.' END);
END $$;

REVOKE ALL ON FUNCTION public.fn_lancamento_dividir_pelos_itens(uuid, jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lancamento_dividir_pelos_itens(uuid, jsonb, text, boolean) TO authenticated;
