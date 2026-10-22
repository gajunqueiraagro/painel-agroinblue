-- CONC-SEM-TRAVA-01 — valor diferente do previsto nunca trava. Sobre o CASO REAL (OC 0731374f: Pix 30/06/2026 R$ 375.000 x
-- "Venda 118 vacas - 1/2" R$ 215.000 + Receb. 3/3 R$ 160.000), admin simulado; cada opcao numa subtransacao desfeita e o todo termina
-- em RAISE 'OK' (NADA do cliente fica conciliado).
--   T1 simular 375.000 x 215.000: sobra R$ 160.000,00; opcoes (a) acrescentar, (b) sobra na OC, (c) criar a diferenca; frase pronta
--   T2 (c) cria o lancamento da diferenca (favorecido, classificacao, data do extrato) e liga; desfazer o bloco o cancela
--   T3 (b) a sobra entra na OC (parte viva) e liga; desfazer tira da OC
--   T4 a menos (375.000 x 215.000 + 160.000 + 375.000): ligar com a falta; o extrato fica conciliado e sobra aberto no lancamento
--   T5 (a) acrescentar o 3/3: 375.000 x 215.000 + 160.000 = igual -> ligar
--   T6 sem acesso -> 42501; opcao que nao vale -> frase com as opcoes
set local statement_timeout = '120s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

DO $t$
DECLARE
  pix constant uuid := '3a99eede-25fa-42a7-a10d-abcc6f58bd97';
  r1 constant uuid := 'eabe167e-edd4-4f9f-ab16-a680e820406f';   -- 215.000
  r3 constant uuid := '75ce0726-f1ef-498d-aabc-b119cb8f6317';   -- 160.000
  r2 constant uuid := '54465071-387d-477e-b51d-b317e0d40b47';   -- 375.000
  s jsonb; x jsonb; novo uuid; bloco uuid; msg text; ops text;
BEGIN
  -- T1
  s := public.fn_conc_simular_diferenca(ARRAY[pix], ARRAY[r1]);
  SELECT string_agg(o->>'codigo', ',' ORDER BY o->>'codigo') INTO ops FROM jsonb_array_elements(s->'opcoes') o;
  IF s->>'sentido' <> 'a_mais' OR (s->>'diferenca')::numeric <> 160000 OR ops <> 'acrescentar_lancamento,criar_diferenca,sobra_na_oc'
     OR s->>'frase' <> 'O banco tem R$ 375.000,00 e os lançamentos R$ 215.000,00: sobram R$ 160.000,00. Escolha o destino da sobra.'
    THEN RAISE EXCEPTION 'T1 simulacao: %', s; END IF;

  -- T2 (c)
  BEGIN
    x := public.fn_conc_ligar_com_diferenca(ARRAY[pix], ARRAY[r1], 'criar_diferenca', 'Pix pagou 1/3 + 3/3 juntos');
    novo := (x->>'lancamento_criado')::uuid; bloco := (x->'bloco'->>'bloco_id')::uuid;
    IF novo IS NULL OR bloco IS NULL THEN RAISE EXCEPTION 'T2 retorno: %', x; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 l, public.financeiro_lancamentos_v2 o WHERE l.id = novo AND o.id = r1
                    AND l.valor = 160000 AND l.data_competencia = date '2026-06-30' AND l.plano_conta_id IS NOT DISTINCT FROM o.plano_conta_id
                    AND l.favorecido_id IS NOT NULL AND l.origem_tipo = 'conc:diferenca' AND l.status_transacao IN ('realizado', 'conciliado'))
      THEN RAISE EXCEPTION 'T2 lancamento da diferenca errado'; END IF;
    IF (SELECT status FROM public.extrato_bancario_v2 WHERE id = pix) <> 'conciliado' THEN RAISE EXCEPTION 'T2 extrato nao conciliou'; END IF;
    PERFORM public.fn_desfazer_bloco(bloco, 'teste');
    IF (SELECT cancelado FROM public.financeiro_lancamentos_v2 WHERE id = novo) IS NOT TRUE
       OR (SELECT status FROM public.extrato_bancario_v2 WHERE id = pix) <> 'nao_conciliado' THEN RAISE EXCEPTION 'T2 desfazer'; END IF;
    RAISE EXCEPTION 'T2OK';
  EXCEPTION WHEN raise_exception THEN IF sqlerrm <> 'T2OK' THEN RAISE; END IF;
  END;

  -- T3 (b)
  BEGIN
    x := public.fn_conc_ligar_com_diferenca(ARRAY[pix], ARRAY[r1], 'sobra_na_oc', 'adiantamento do comprador');
    novo := (x->>'lancamento_criado')::uuid; bloco := (x->'bloco'->>'bloco_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt WHERE pt.financeiro_lancamento_id = novo AND pt.cancelada = false
                    AND left(pt.operacao_id::text, 8) = '0731374f') THEN RAISE EXCEPTION 'T3 nao entrou na OC: %', x; END IF;
    PERFORM public.fn_desfazer_bloco(bloco, 'teste');
    IF EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt WHERE pt.financeiro_lancamento_id = novo AND pt.cancelada = false)
       OR (SELECT cancelado FROM public.financeiro_lancamentos_v2 WHERE id = novo) IS NOT TRUE THEN RAISE EXCEPTION 'T3 desfazer'; END IF;
    RAISE EXCEPTION 'T3OK';
  EXCEPTION WHEN raise_exception THEN IF sqlerrm <> 'T3OK' THEN RAISE; END IF;
  END;

  -- T4 a menos
  BEGIN
    s := public.fn_conc_simular_diferenca(ARRAY[pix], ARRAY[r1, r3, r2]);
    IF s->>'sentido' <> 'a_menos' OR (s->>'diferenca')::numeric <> -375000
       OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s->'opcoes') o WHERE o->>'codigo' = 'ligar_com_falta') THEN RAISE EXCEPTION 'T4 sim: %', s; END IF;
    x := public.fn_conc_ligar_com_diferenca(ARRAY[pix], ARRAY[r1, r3, r2], 'ligar_com_falta', 'Pix pagou parte');
    IF (SELECT status FROM public.extrato_bancario_v2 WHERE id = pix) <> 'conciliado' THEN RAISE EXCEPTION 'T4 extrato: %', x; END IF;
    -- a ordem do bloco: o 1/3 e o 3/3 (30/06) recebem os 375.000; o 2/3 (30/07) nao recebe nada agora e fica intacto
    IF EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens c WHERE c.lancamento_id = r2 AND c.desfeito_em IS NULL)
       OR (SELECT o->>'frase' FROM jsonb_array_elements(s->'opcoes') o) NOT LIKE '%1 lançamento não recebe nada agora e continua em aberto%'
      THEN RAISE EXCEPTION 'T4 alocacao: %', s; END IF;
    RAISE EXCEPTION 'T4OK';
  EXCEPTION WHEN raise_exception THEN IF sqlerrm <> 'T4OK' THEN RAISE; END IF;
  END;

  -- T5 (a) acrescentar o 3/3: igual
  BEGIN
    s := public.fn_conc_simular_diferenca(ARRAY[pix], ARRAY[r1, r3]);
    IF s->>'sentido' <> 'igual' THEN RAISE EXCEPTION 'T5 sim: %', s; END IF;
    x := public.fn_conc_ligar_com_diferenca(ARRAY[pix], ARRAY[r1, r3], 'ligar', 'Pix de 1/3 + 3/3');
    IF (SELECT status FROM public.extrato_bancario_v2 WHERE id = pix) <> 'conciliado' THEN RAISE EXCEPTION 'T5 extrato'; END IF;
    RAISE EXCEPTION 'T5OK';
  EXCEPTION WHEN raise_exception THEN IF sqlerrm <> 'T5OK' THEN RAISE; END IF;
  END;

  -- T6
  msg := null; BEGIN PERFORM public.fn_conc_ligar_com_diferenca(ARRAY[pix], ARRAY[r1], 'ligar', 'x'); EXCEPTION WHEN OTHERS THEN msg := sqlerrm; END;
  IF msg NOT LIKE 'opcao_invalida: O banco tem R$ 375.000,00%' THEN RAISE EXCEPTION 'T6 opcao invalida: %', msg; END IF;
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  msg := null; BEGIN PERFORM public.fn_conc_simular_diferenca(ARRAY[pix], ARRAY[r1]); EXCEPTION WHEN OTHERS THEN msg := sqlstate; END;
  IF msg IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'T6 sem acesso: %', msg; END IF;

  RAISE EXCEPTION 'OK';
END $t$;
