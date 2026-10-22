-- CONC-SEM-TRAVA-01 (tela) — o que a tela "Conciliar" le do banco, no CASO REAL (OC 0731374f, Banco do Brasil), admin simulado;
-- termina em RAISE 'OK' (nada do cliente fica conciliado).
--   S1 sobra: Pix 30/06 R$ 375.000 x Receb. 1/3 R$ 215.000 -> (a) sugere o Receb. 3/3 R$ 160.000 com "fecha exato"; (b) previa com o
--      saldo da OC depois; (c) previa com data do extrato e a classificacao do original
--   F1 falta: Pix 30/07 R$ 290.000 x Receb. 2/3 R$ 375.000 -> (a) sugere o Pix de R$ 85.000 do mesmo dia com "fecha exato";
--      (b) previa recebido / em aberto / vencimento; (c) desconto na OC
--   F2 juntar o Pix de 85.000 -> igual
--   F3 (c) desconto na OC: o Receb. 2/3 fica com 290.000, a falta e' cancelada, a OC ganha o desconto, o extrato concilia; desfazer
--      volta tudo (saldo da OC como antes, falta reativada, explicacao removida)
set local statement_timeout = '120s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

DO $t$
DECLARE
  pix30_06 constant uuid := '3a99eede-25fa-42a7-a10d-abcc6f58bd97';
  pix290 constant uuid := '4478484a-c050-4a00-bada-f2d40a49d915';
  pix85 constant uuid := '3f2d7080-b2fc-4d6e-8202-08987bf1767f';
  r1 constant uuid := 'eabe167e-edd4-4f9f-ab16-a680e820406f';
  r2 constant uuid := '54465071-387d-477e-b51d-b317e0d40b47';
  r3 constant uuid := '75ce0726-f1ef-498d-aabc-b119cb8f6317';
  s jsonb; o jsonb; res jsonb; b uuid; z uuid; ex jsonb; op uuid := (SELECT id FROM public.zoo_operacoes_comerciais WHERE left(id::text, 8) = '0731374f');
  saldo0 numeric; saldo1 numeric;
BEGIN
  -- S1
  s := public.fn_conc_simular_diferenca(ARRAY[pix30_06], ARRAY[r1]);
  SELECT x INTO o FROM jsonb_array_elements(s->'opcoes') x WHERE x->>'codigo' = 'acrescentar_lancamento';
  IF s->>'frase' <> 'O banco tem R$ 375.000,00 e os lançamentos R$ 215.000,00. Escolha o destino da sobra.'
     OR (o->'sugestoes'->0->>'lancamento_id')::uuid <> r3 OR (o->'sugestoes'->0->>'fecha_exato')::boolean IS NOT TRUE
     OR o->'sugestoes'->0->>'parcela' IS NULL THEN RAISE EXCEPTION 'S1 sugestao: %', o; END IF;
  SELECT x INTO o FROM jsonb_array_elements(s->'opcoes') x WHERE x->>'codigo' = 'sobra_na_oc';
  IF (o->'previa'->>'operacao_id')::uuid <> op OR o->'previa'->>'saldo_depois' IS NULL THEN RAISE EXCEPTION 'S1 previa OC: %', o; END IF;
  SELECT x INTO o FROM jsonb_array_elements(s->'opcoes') x WHERE x->>'codigo' = 'criar_diferenca';
  IF (o->'previa'->>'data')::date <> date '2026-06-30' OR (o->'previa'->>'valor')::numeric <> 160000 THEN RAISE EXCEPTION 'S1 previa c: %', o; END IF;

  -- F1
  s := public.fn_conc_simular_diferenca(ARRAY[pix290], ARRAY[r2]);
  SELECT x INTO o FROM jsonb_array_elements(s->'opcoes') x WHERE x->>'codigo' = 'juntar_extrato';
  IF s->>'frase' <> 'O banco tem R$ 290.000,00 e os lançamentos R$ 375.000,00. Escolha o que fazer com a falta.'
     OR (o->'sugestoes'->0->>'extrato_id')::uuid <> pix85 OR (o->'sugestoes'->0->>'fecha_exato')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'F1 juntar: %', o; END IF;
  SELECT x INTO o FROM jsonb_array_elements(s->'opcoes') x WHERE x->>'codigo' = 'ligar_com_falta';
  IF (o->'previa'->>'recebido')::numeric <> 290000 OR (o->'previa'->>'em_aberto')::numeric <> 85000 OR o->'previa'->>'vencimento' IS NULL THEN
    RAISE EXCEPTION 'F1 previa b: %', o; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s->'opcoes') x WHERE x->>'codigo' = 'desconto_na_oc' AND (x->'previa'->>'desconto')::numeric = 85000) THEN
    RAISE EXCEPTION 'F1 sem desconto: %', s; END IF;

  -- F2
  s := public.fn_conc_simular_diferenca(ARRAY[pix290, pix85], ARRAY[r2]);
  IF s->>'sentido' <> 'igual' THEN RAISE EXCEPTION 'F2: %', s; END IF;

  -- F3
  saldo0 := (public.oc_conta_corrente(op)->>'saldo')::numeric;
  res := public.fn_conc_ligar_com_diferenca(ARRAY[pix290], ARRAY[r2], 'desconto_na_oc', 'comprador pagou 85 mil a menos');
  b := (res->'bloco'->>'bloco_id')::uuid;
  SELECT extras INTO ex FROM public.conciliacao_blocos WHERE id = b;
  z := (ex->'desconto'->>'lancamento_cancelado')::uuid;
  saldo1 := (public.oc_conta_corrente(op)->>'saldo')::numeric;
  IF (SELECT status FROM public.extrato_bancario_v2 WHERE id = pix290) <> 'conciliado' OR (SELECT abs(valor) FROM public.financeiro_lancamentos_v2 WHERE id = r2) <> 290000
     OR (SELECT cancelado FROM public.financeiro_lancamentos_v2 WHERE id = z) IS NOT TRUE OR saldo1 <> saldo0 + 375000
     OR NOT EXISTS (SELECT 1 FROM public.zoo_operacao_eventos e WHERE e.operacao_id = op AND e.acao = 'desconto_na_conciliacao') THEN
    RAISE EXCEPTION 'F3 desconto: % | % %', res, saldo0, saldo1; END IF;
  PERFORM public.fn_desfazer_bloco(b, 'teste');
  IF (SELECT cancelado FROM public.financeiro_lancamentos_v2 WHERE id = z) IS NOT FALSE OR (public.oc_conta_corrente(op)->>'saldo')::numeric <> saldo0
     OR (SELECT status FROM public.extrato_bancario_v2 WHERE id = pix290) <> 'nao_conciliado' THEN RAISE EXCEPTION 'F3 desfazer'; END IF;

  RAISE EXCEPTION 'OK';
END $t$;
