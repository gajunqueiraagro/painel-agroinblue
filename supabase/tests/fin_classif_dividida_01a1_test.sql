-- FIN-CLASSIF-DIVIDIDA-01a-1 — prova no CASO SELLUZ (sintetico sobre o lancamento real 789a79e1, NF 3.241, R$ 9.583,00, 18 itens) e numa
-- compra parcelada real (16a49432, 4 parcelas). TUDO DESFEITO: termina em RAISE ("OK" = passou). Rodar como authenticated (jwt do admin).
--   D1 simular pelos itens nao grava; diz que fecha com a nota
--   D2 gravar pelos itens: 2 partes (Investimento em Instalacoes Pecuaria 8.528,00 bloco investimento; Manutencao de Instalacoes Pecuaria
--      1.055,00 bloco fixo), o filtro por Manutencao soma 1.055,00, o lancamento fica com a maior parte, trilha 'dividir_nota'
--   D3 reclassificar direto o dividido recusa com frase pronta
--   D4 o valor muda: as partes reescalam pelo %, soma = novo valor
--   D5 voltar para 1 conta (a maior) e D6 desfazer o voltar (volta dividido)
--   D7 recusas: soma diferente, mesma conta duas vezes, sem motivo, titulo de OC, parcela de financiamento, sem acesso (42501)
--   D8 por percentual 60/40 (a ultima absorve o centavo)
--   D9 igualdade: fora o Selluz, a visao = a tabela (linhas e grupos de classificacao com valor, md5)
--   D10 pelo PAI: compra parcelada 70/30 -> cada parcela dividida, soma de cada uma = |valor| da parcela
DO $$
DECLARE
  c_lanc constant uuid := '789a79e1-6de9-4ba0-a7f3-01171049ffea';
  c_inv  constant uuid := 'f4fec107-569a-42a1-b413-bf133474c7fa';   -- Investimento em Instalacoes Pecuaria (bloco investimento)
  c_man  constant uuid := 'cdf2efa2-5735-499f-8a85-5ae0b0d0123a';   -- Manutencao de Instalacoes Pecuaria (bloco fixo)
  c_cerca constant uuid := '9b10cc50-858a-4fa4-94c9-337e8258f81f';  -- a conta de hoje
  mapa jsonb; r jsonb; msg text; v_n int; v_s numeric; v_div uuid; v_a text; v_b text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  SELECT jsonb_agg(jsonb_build_object('n_item', n, 'plano_conta_id', CASE WHEN n <= 5 THEN c_inv ELSE c_man END)) INTO mapa FROM generate_series(1, 18) n;

  -- D1
  r := public.fn_lancamento_dividir_pelos_itens(c_lanc, mapa, 'teste', true);
  IF (r->>'simulado')::boolean IS NOT TRUE OR r->>'frase_nota' <> 'A soma das contas fecha com a nota.' THEN RAISE EXCEPTION 'D1: %', r; END IF;
  IF (SELECT classificacao_dividida FROM financeiro_lancamentos_v2 WHERE id = c_lanc) THEN RAISE EXCEPTION 'D1 simular gravou'; END IF;

  -- D2
  r := public.fn_lancamento_dividir_pelos_itens(c_lanc, mapa, 'NF 3.241: caixas/cabos/disjuntor = investimento; o resto = manutencao', false);
  SELECT string_agg(concat_ws('/', subcentro, valor, compoe_dre), ' | ' ORDER BY parte_ordem) INTO v_a FROM vw_fin_classificacao_por_parte WHERE lancamento_id = c_lanc;
  IF v_a <> 'Investimento em Instalações Pecuária/8528.00/t | Manutenção de Instalações Pecuária/1055.00/t' THEN RAISE EXCEPTION 'D2 visao: %', v_a; END IF;
  SELECT sum(valor) INTO v_s FROM vw_fin_classificacao_por_parte WHERE cliente_id = 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'
     AND subcentro = 'Manutenção de Instalações Pecuária' AND lancamento_id = c_lanc;
  IF v_s <> 1055 THEN RAISE EXCEPTION 'D2 filtro manutencao: %', v_s; END IF;
  IF (SELECT string_agg(pc.bloco_dre, ',' ORDER BY p.ordem) FROM financeiro_lancamento_partes p JOIN financeiro_plano_contas pc ON pc.id = p.plano_conta_id
       WHERE p.lancamento_id = c_lanc) <> 'investimento,fixo' THEN RAISE EXCEPTION 'D2 blocos do DRE'; END IF;
  IF (SELECT plano_conta_id FROM financeiro_lancamentos_v2 WHERE id = c_lanc) <> c_inv THEN RAISE EXCEPTION 'D2 o lancamento nao ficou com a maior parte'; END IF;
  IF (SELECT count(*) FROM financeiro_lancamento_divisoes WHERE lancamento_id = c_lanc AND acao = 'dividir_nota') <> 1 THEN RAISE EXCEPTION 'D2 trilha'; END IF;
  IF (SELECT jsonb_array_length(nota_itens) FROM financeiro_lancamento_partes WHERE lancamento_id = c_lanc AND ordem = 1) <> 5 THEN RAISE EXCEPTION 'D2 itens da parte'; END IF;

  -- D3
  msg := NULL;
  BEGIN UPDATE financeiro_lancamentos_v2 SET plano_conta_id = c_cerca WHERE id = c_lanc; EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  IF msg IS NULL OR msg NOT LIKE '%está dividido em 2 contas%' THEN RAISE EXCEPTION 'D3: %', msg; END IF;

  -- D4
  UPDATE financeiro_lancamentos_v2 SET valor = 10000 WHERE id = c_lanc;
  SELECT sum(valor), string_agg(valor::text, '+' ORDER BY ordem) INTO v_s, v_a FROM financeiro_lancamento_partes WHERE lancamento_id = c_lanc;
  IF v_s <> 10000 OR v_a <> '8899.09+1100.91' THEN RAISE EXCEPTION 'D4 reescala: % = %', v_a, v_s; END IF;
  UPDATE financeiro_lancamentos_v2 SET valor = 9583 WHERE id = c_lanc;

  -- D5 / D6
  r := public.fn_lancamento_voltar_uma_conta(c_lanc, NULL, 'teste voltar', false);
  IF (SELECT classificacao_dividida OR plano_conta_id <> c_inv FROM financeiro_lancamentos_v2 WHERE id = c_lanc)
     OR (SELECT count(*) FROM vw_fin_classificacao_por_parte WHERE lancamento_id = c_lanc) <> 1 THEN RAISE EXCEPTION 'D5: %', r; END IF;
  r := public.fn_lancamento_divisao_desfazer((r->>'divisao_id')::uuid, 'teste desfazer');
  IF NOT (SELECT classificacao_dividida FROM financeiro_lancamentos_v2 WHERE id = c_lanc)
     OR (SELECT count(*) FROM vw_fin_classificacao_por_parte WHERE lancamento_id = c_lanc) <> 2 THEN RAISE EXCEPTION 'D6: %', r; END IF;

  -- D8 (por % sobre o mesmo lancamento: dividir de novo troca as partes)
  r := public.fn_lancamento_dividir(c_lanc, jsonb_build_array(jsonb_build_object('plano_conta_id', c_inv, 'percentual', 60),
         jsonb_build_object('plano_conta_id', c_man, 'percentual', 40)), 'teste 60/40', false);
  SELECT string_agg(valor::text, '+' ORDER BY ordem) INTO v_a FROM financeiro_lancamento_partes WHERE lancamento_id = c_lanc;
  IF v_a <> '5749.80+3833.20' THEN RAISE EXCEPTION 'D8: %', v_a; END IF;

  -- D7 recusas
  FOR v_a, v_b IN SELECT * FROM (VALUES
     ('[{"plano_conta_id":"f4fec107-569a-42a1-b413-bf133474c7fa","valor":8000},{"plano_conta_id":"cdf2efa2-5735-499f-8a85-5ae0b0d0123a","valor":1055}]', '%As partes somam%'),
     ('[{"plano_conta_id":"f4fec107-569a-42a1-b413-bf133474c7fa","valor":8528},{"plano_conta_id":"f4fec107-569a-42a1-b413-bf133474c7fa","valor":1055}]', '%mesma conta aparece duas vezes%')) t LOOP
    msg := NULL;
    BEGIN PERFORM public.fn_lancamento_dividir(c_lanc, v_a::jsonb, 'x', true); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg IS NULL OR msg NOT LIKE v_b THEN RAISE EXCEPTION 'D7 % -> %', v_b, msg; END IF;
  END LOOP;
  msg := NULL;
  BEGIN PERFORM public.fn_lancamento_dividir(c_lanc, mapa, ' ', true); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  IF msg IS NULL OR msg NOT LIKE '%motivo%' THEN RAISE EXCEPTION 'D7 motivo: %', msg; END IF;
  msg := NULL;
  BEGIN PERFORM public.fn_lancamento_dividir('0c9708c0-4a03-4114-b68a-7c7b7db77fda', mapa, 'x', true); EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  IF msg IS NULL OR msg NOT LIKE '%operação comercial%' THEN RAISE EXCEPTION 'D7 OC: %', msg; END IF;
  msg := NULL;
  BEGIN PERFORM public.fn_lancamento_dividir((SELECT fp.lancamento_id FROM financiamento_parcelas fp WHERE fp.financiamento_id = '16a49432-46a4-462d-bc92-1eddece5478b' AND fp.lancamento_id IS NOT NULL LIMIT 1), mapa, 'x', true);
  EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
  IF msg IS NULL OR msg NOT LIKE '%divida no cadastro dele%' THEN RAISE EXCEPTION 'D7 parcela: %', msg; END IF;
  msg := NULL;
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
  BEGIN PERFORM public.fn_lancamento_voltar_uma_conta(c_lanc, NULL, 'x', true); EXCEPTION WHEN OTHERS THEN msg := SQLSTATE; END;
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  IF msg IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'D7 sem acesso: %', msg; END IF;

  -- D10 pelo pai (compra parcelada)
  r := public.fn_financiamento_dividir_classificacao('16a49432-46a4-462d-bc92-1eddece5478b',
         jsonb_build_array(jsonb_build_object('plano_conta_id', c_inv, 'percentual', 70), jsonb_build_object('plano_conta_id', c_man, 'percentual', 30)), 'teste pai', false);
  SELECT count(*) INTO v_n FROM financiamento_parcelas fp JOIN financeiro_lancamentos_v2 l ON l.id = fp.lancamento_id
   WHERE fp.financiamento_id = '16a49432-46a4-462d-bc92-1eddece5478b' AND l.cancelado IS NOT TRUE
     AND (NOT l.classificacao_dividida OR abs(l.valor) <> (SELECT sum(p.valor) FROM financeiro_lancamento_partes p WHERE p.lancamento_id = l.id));
  IF v_n > 0 OR (r->>'parcelas')::int < 2 THEN RAISE EXCEPTION 'D10: % parcelas erradas; %', v_n, r->>'parcelas'; END IF;

  -- D9 igualdade fora dos divididos neste teste
  SELECT md5(string_agg(x, '|' ORDER BY x)) INTO v_a FROM (SELECT concat_ws(';', cliente_id, plano_conta_id, subcentro, escopo_negocio, safra_id, compoe_dre, sum(valor), count(*)) x
     FROM vw_fin_classificacao_por_parte WHERE NOT classificacao_dividida GROUP BY cliente_id, plano_conta_id, subcentro, escopo_negocio, safra_id, compoe_dre) z;
  SELECT md5(string_agg(x, '|' ORDER BY x)) INTO v_b FROM (SELECT concat_ws(';', cliente_id, plano_conta_id, subcentro, escopo_negocio, safra_id, compoe_dre, sum(valor), count(*)) x
     FROM financeiro_lancamentos_v2 WHERE NOT classificacao_dividida GROUP BY cliente_id, plano_conta_id, subcentro, escopo_negocio, safra_id, compoe_dre) z;
  IF v_a <> v_b THEN RAISE EXCEPTION 'D9 a visao difere da tabela fora dos divididos'; END IF;

  RAISE EXCEPTION 'OK FIN-CLASSIF-DIVIDIDA-01a-1: D1-D10 passaram (tudo desfeito; parcelas do pai: %)', r->>'parcelas';
END $$;
