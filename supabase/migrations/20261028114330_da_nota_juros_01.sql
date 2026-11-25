-- DA-NOTA-JUROS-01 (Gabriel 24/11 17:03) — o "+ Da nota" NÃO TRAVA quando o PAGO passa da nota por JUROS.
--
-- O caso: NJ, NF 26.185, nota R$ 3.441,75, pago 1 dia depois R$ 3.446,34 (realizado e conciliado). A guarda P167-B2 ("a soma do que FICA
-- nunca passa da nota") recusava: "Os lançamentos somam R$ 3.446,34, mais que a nota". A regra de 18/11 (FIN-BAIXA-01 / CONC-DESCONCILIAR-
-- EDSON-01, juros no casar): pago ≠ nota nunca trava; a diferença tem motivo.
--
-- O que muda em `fn_nota_completar` (patch guardado pelo md5 do corpo de hoje; nada mais muda):
--   • parâmetro novo `p_diferenca jsonb` (default nulo = tudo como antes): {"motivo": "juros"} ou {"motivo": "desconto"};
--   • motivo 'juros' e o que fica PASSA da nota: só vale se TODOS os lançamentos do pedido estão pagos e há um fora de compra parcelada
--     (o "alvo" = o pago por último). A guarda B2 não recusa; ao gravar, o alvo vira DIVIDIDO pela divisão de sempre (`_fn_fin_dividir`,
--     a mesma trilha e o mesmo desfazer `fn_lancamento_divisao_desfazer`): a parte da nota na conta dele + a diferença em
--     "Despesas Financeiras Administrativo" (a MESMA conta do juros no casar, `_fn_conc_linha_da_nf`). O VALOR, o CAIXA e a CONCILIAÇÃO
--     NÃO mudam (é a classificação do mesmo pagamento). Alvo já dividido = recusa (dividir de novo apagaria as partes de hoje).
--   • motivo 'desconto' (pago MENOR que a nota): nada no lançamento muda (a guarda nunca recusou o menor); o motivo volta no resultado.
--   • sem motivo: a guarda B2 recusa como hoje (o caso NF 119.237: R$ 135.000 de parcelas numa nota menor — a compra errada).
--   • o resultado leva `diferenca` {pago, nota, diferenca, motivo, parte_juros} para a tela.
-- A assinatura muda (7 argumentos): a de 6 sai (a tela chama por nome; com a de 6 viva, a chamada sem `p_diferenca` ficaria ambígua).
-- ACL igual à de hoje: authenticated + service_role; nunca PUBLIC/anon.

DO $mig$
DECLARE
  v_def text;
  v_src_md5 text;
  v_novo text;
  -- (âncora, troca): cada âncora tem de aparecer UMA vez no corpo de hoje
  v_trocas text[][] := ARRAY[
    ARRAY[
      'p_valor_nota numeric DEFAULT NULL::numeric)',
      'p_valor_nota numeric DEFAULT NULL::numeric, p_diferenca jsonb DEFAULT NULL::jsonb)'
    ],
    ARRAY[
      E'  v_outra text;\nBEGIN',
      E'  v_outra text;\n'
      || E'  /* DA-NOTA-JUROS-01 */\n'
      || E'  v_todos_pagos boolean := true; v_alvo uuid; v_alvo_pg date; v_dif numeric := 0; v_motivo_dif text := nullif(btrim(coalesce(p_diferenca->>''motivo'', '''')), '''');\n'
      || E'  v_plano_juros uuid; v_plano_alvo uuid; v_valor_alvo numeric; v_dividido boolean; v_dif_info jsonb;\n'
      || 'BEGIN'
    ],
    ARRAY[
      E'    v_hoje := public._fn_nota_completar_campos(l);\n    v_fica := v_hoje;\n',
      E'    /* DA-NOTA-JUROS-01 — todos pagos? e o alvo dos juros: o pago por último, fora de compra parcelada */\n'
      || E'    IF NOT v_pago THEN v_todos_pagos := false; END IF;\n'
      || E'    IF v_pago AND l.financiamento_id IS NULL\n'
      || E'       AND (v_alvo IS NULL OR coalesce(l.data_pagamento, l.data_vencimento, current_date) >= v_alvo_pg) THEN\n'
      || E'      v_alvo := l.id; v_alvo_pg := coalesce(l.data_pagamento, l.data_vencimento, current_date);\n'
      || E'    END IF;\n'
      || E'    v_hoje := public._fn_nota_completar_campos(l);\n    v_fica := v_hoje;\n'
    ],
    ARRAY[
      E'  IF p_valor_nota IS NOT NULL AND v_soma > p_valor_nota + 0.01 THEN\n',
      E'  /* DA-NOTA-JUROS-01 — pago ≠ nota com motivo: juros (pago maior, tudo pago) não recusa; desconto (pago menor) só volta no resultado */\n'
      || E'  IF p_valor_nota IS NOT NULL THEN v_dif := round(v_soma - p_valor_nota, 2); END IF;\n'
      || E'  IF v_motivo_dif IS NOT NULL AND v_motivo_dif NOT IN (''juros'', ''desconto'') THEN\n'
      || E'    v_recusas := v_recusas || jsonb_build_object(''frase'', format(''Motivo da diferença «%s» não existe: juros ou desconto.'', v_motivo_dif));\n'
      || E'  END IF;\n'
      || E'  IF v_motivo_dif = ''juros'' AND p_valor_nota IS NOT NULL AND v_dif > 0.01 THEN\n'
      || E'    IF NOT v_todos_pagos OR v_alvo IS NULL THEN\n'
      || E'      v_recusas := v_recusas || jsonb_build_object(''frase'',\n'
      || E'        ''Juros só no que já foi pago (e fora de compra parcelada): há lançamento em aberto ou de parcelamento neste pedido.'');\n'
      || E'    ELSE\n'
      || E'      SELECT pc.id INTO v_plano_juros FROM public.financeiro_plano_contas pc\n'
      || E'       WHERE pc.cliente_id IS NULL AND pc.ativo AND pc.subcentro = ''Despesas Financeiras Administrativo'';\n'
      || E'      SELECT x.classificacao_dividida INTO v_dividido FROM public.financeiro_lancamentos_v2 x WHERE x.id = v_alvo;\n'
      || E'      IF v_plano_juros IS NULL THEN\n'
      || E'        v_recusas := v_recusas || jsonb_build_object(''frase'', ''A conta "Despesas Financeiras Administrativo" não está no plano de contas.'');\n'
      || E'      ELSIF coalesce(v_dividido, false) THEN\n'
      || E'        v_recusas := v_recusas || jsonb_build_object(''id'', v_alvo, ''frase'',\n'
      || E'          ''O lançamento pago já tem a classificação dividida: separe os juros pelo "Dividir" dele.'');\n'
      || E'      ELSE\n'
      || E'        v_dif_info := jsonb_build_object(''lancamento_id'', v_alvo, ''plano_conta_id'', v_plano_juros,\n'
      || E'          ''subcentro'', ''Despesas Financeiras Administrativo'', ''valor'', v_dif);\n'
      || E'      END IF;\n'
      || E'    END IF;\n'
      || E'  ELSIF p_valor_nota IS NOT NULL AND v_soma > p_valor_nota + 0.01 THEN\n'
    ],
    ARRAY[
      E'    v_ret := jsonb_build_object(''ok'', true, ''simulado'', coalesce(p_simular, true), ''operacao'', v_op, ''financiamento_id'', v_fin,\n',
      E'    /* DA-NOTA-JUROS-01 — a diferença de juros vira a parte do MESMO pagamento (valor, caixa e conciliação não mudam) */\n'
      || E'    IF v_dif_info IS NOT NULL THEN\n'
      || E'      SELECT x.plano_conta_id, abs(x.valor) INTO v_plano_alvo, v_valor_alvo FROM public.financeiro_lancamentos_v2 x WHERE x.id = v_alvo;\n'
      || E'      IF v_plano_alvo IS NULL THEN\n'
      || E'        RAISE EXCEPTION USING ERRCODE = ''22023'', MESSAGE = ''O lançamento pago não tem classificação: classifique antes de separar os juros. Nada foi gravado.'';\n'
      || E'      END IF;\n'
      || E'      IF v_plano_alvo = v_plano_juros THEN\n'
      || E'        RAISE EXCEPTION USING ERRCODE = ''22023'', MESSAGE = ''O lançamento pago já está em Despesas Financeiras: não há o que separar. Nada foi gravado.'';\n'
      || E'      END IF;\n'
      || E'      BEGIN\n'
      || E'        PERFORM public._fn_fin_dividir(v_alvo,\n'
      || E'          jsonb_build_array(jsonb_build_object(''plano_conta_id'', v_plano_alvo, ''valor'', v_valor_alvo - v_dif),\n'
      || E'                            jsonb_build_object(''plano_conta_id'', v_plano_juros, ''valor'', v_dif)),\n'
      || E'          ''manual'', ''dividir'',\n'
      || E'          format(''Juros/multa da nota (pago R$ %s · nota R$ %s · diferença R$ %s)'', public._fn_oc_brl(v_soma), public._fn_oc_brl(p_valor_nota),\n'
      || E'                 public._fn_oc_brl(v_dif)),\n'
      || E'          false, NULL);\n'
      || E'      EXCEPTION WHEN SQLSTATE ''P0001'' THEN\n'
      || E'        RAISE EXCEPTION USING ERRCODE = ''22023'', MESSAGE = regexp_replace(SQLERRM, ''\\s*Nada foi gravado\\.\\s*$'', '''') || '' Nada foi gravado.'';\n'
      || E'      END;\n'
      || E'    END IF;\n'
      || E'    v_ret := jsonb_build_object(''ok'', true, ''simulado'', coalesce(p_simular, true), ''operacao'', v_op, ''financiamento_id'', v_fin,\n'
      || E'      ''diferenca'', CASE WHEN p_valor_nota IS NULL THEN NULL ELSE jsonb_build_object(''pago'', v_soma, ''nota'', p_valor_nota, ''diferenca'', v_dif,\n'
      || E'        ''motivo'', v_motivo_dif, ''parte_juros'', v_dif_info) END,\n'
    ]
  ];
  i int;
BEGIN
  SET LOCAL lock_timeout = '2s';
  SELECT pg_get_functiondef(p.oid), md5(p.prosrc) INTO v_def, v_src_md5
    FROM pg_proc p WHERE p.oid = 'public.fn_nota_completar(uuid,jsonb,boolean,text,boolean,numeric)'::regprocedure;
  IF v_src_md5 IS DISTINCT FROM '239b25a1a1b3e1b8a46c83891e799833' THEN
    RAISE EXCEPTION 'DA-NOTA-JUROS-01: fn_nota_completar mudou desde a leitura (md5 %): nada aplicado.', v_src_md5;
  END IF;
  v_novo := v_def;
  FOR i IN 1 .. array_length(v_trocas, 1) LOOP
    IF (length(v_novo) - length(replace(v_novo, v_trocas[i][1], ''))) / length(v_trocas[i][1]) <> 1 THEN
      RAISE EXCEPTION 'DA-NOTA-JUROS-01: a âncora % não aparece UMA vez: nada aplicado.', i;
    END IF;
    v_novo := replace(v_novo, v_trocas[i][1], v_trocas[i][2]);
  END LOOP;
  DROP FUNCTION public.fn_nota_completar(uuid, jsonb, boolean, text, boolean, numeric);
  EXECUTE v_novo;
END $mig$;

REVOKE ALL ON FUNCTION public.fn_nota_completar(uuid, jsonb, boolean, text, boolean, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_nota_completar(uuid, jsonb, boolean, text, boolean, numeric, jsonb) TO authenticated, service_role;
