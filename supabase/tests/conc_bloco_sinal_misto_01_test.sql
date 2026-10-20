-- CONC-BLOCO-SINAL-MISTO-01 — o bloco aceita extrato com entrada E saida quando a soma COM SINAL fecha. Roda depois da 20261027203700, numa
-- transacao que TERMINA EM RAISE (nada fica gravado). Conta, extratos e lancamentos SINTETICOS no cliente Teste, em jun/2031. Admin simulado.
-- B1 o caso do consorcio (PIX −2.893,37 + reembolso +89,71 contra −2.309,64 e −494,02, previstos): fecha; o reembolso fica NEGATIVO no
--    lancamento mais antigo; cada extrato aplicado pelo valor inteiro; cada lancamento fecha no valor dele (aplicado vivo); os dois passam
--    de previsto a realizado com a data do PIX; os extratos 'conciliado'; o valor do lancamento nao muda.
-- B2 desfazer o bloco volta tudo, o reembolso inclusive.
-- B3 liquido zero recusa com a frase.   B4 'mais_antigo_primeiro' com sinal misto recusa com a frase nova.
-- B5 sinal unico: o resultado de sempre (matriz e quitados).
set local statement_timeout = '60s';
set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
create function pg_temp.conta() returns uuid language sql as $f$
  insert into financeiro_contas_bancarias (cliente_id, nome_conta, nome_exibicao, tipo_conta, ativa)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', 'SINT BLOCO MISTO', 'SINT BLOCO MISTO', 'cc', true) returning id $f$;
create function pg_temp.ext(p_conta uuid, p_d date, p_v numeric) returns uuid language sql as $f$
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao, documento)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', p_conta, p_d, p_v, case when p_v > 0 then 'credito' else 'debito' end,
          md5(random()::text), 'SINT', 'SINT-' || gen_random_uuid()) returning id $f$;
create function pg_temp.lan(p_conta uuid, p_v numeric, p_st text, p_desc text) returns uuid language sql as $f$
  insert into financeiro_lancamentos_v2 (cliente_id, conta_bancaria_id, tipo_operacao, sinal, valor, status_transacao, data_competencia,
                                         data_vencimento, cenario, descricao, plano_conta_id, favorecido_id)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', p_conta, '2-Saídas', '-1', p_v, p_st, date '2031-06-17', date '2031-06-17', 'realizado', p_desc,
          (select p.id from financeiro_plano_contas p where p.ativo and p.cliente_id is null and p.tipo_operacao = '2-Saídas' order by p.ordem_exibicao limit 1),
          (select f.id from financeiro_fornecedores f where f.cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a' order by f.created_at, f.id limit 1))
  returning id $f$;

DO $t$
DECLARE
  c uuid; e1 uuid; e2 uuid; l1 uuid; l2 uuid; r jsonb; v_b uuid; v_ok boolean; v_msg text; x uuid; y uuid; m1 uuid; m2 uuid;
BEGIN
  c := pg_temp.conta();
  e1 := pg_temp.ext(c, '2031-06-19', -2893.37); e2 := pg_temp.ext(c, '2031-06-23', 89.71);
  l1 := pg_temp.lan(c, 2309.64, 'previsto', 'SINT Consorcio Parc 1/80'); l2 := pg_temp.lan(c, 494.02, 'previsto', 'SINT Taxa adm. Parc 1/80');

  -- B1
  r := fn_conciliar_bloco(array[e1, e2], array[l1, l2], 'exato', true);
  IF (r#>>'{resumo,soma_extratos_com_sinal}')::numeric <> -2803.66 OR (r#>>'{resumo,soma_lancamentos_com_sinal}')::numeric <> -2803.66
     OR (r#>>'{resumo,diferenca_com_sinal}')::numeric <> 0 OR (r#>>'{resumo,sinal_misto}')::boolean IS DISTINCT FROM true
     OR jsonb_array_length(r->'matriz') <> 3 OR jsonb_array_length(r#>'{resumo,quitados}') <> 2 THEN RAISE EXCEPTION 'B1 simulacao: %', r; END IF;
  r := fn_conciliar_bloco(array[e1, e2], array[l1, l2], 'exato', false);
  v_b := (r->>'bloco_id')::uuid;
  IF (SELECT valor_aplicado FROM conciliacao_bancaria_itens WHERE extrato_id = e2 AND desfeito_em IS NULL) IS DISTINCT FROM -89.71
     OR (SELECT lancamento_id FROM conciliacao_bancaria_itens WHERE extrato_id = e2 AND desfeito_em IS NULL) IS DISTINCT FROM l1
     OR (SELECT sum(valor_aplicado) FROM conciliacao_bancaria_itens WHERE extrato_id = e1 AND desfeito_em IS NULL) IS DISTINCT FROM 2893.37
     OR public._fn_lancamento_aplicado_vivo(l1) IS DISTINCT FROM 2309.64 OR public._fn_lancamento_aplicado_vivo(l2) IS DISTINCT FROM 494.02
     OR (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE id IN (l1, l2) AND status_transacao = 'realizado' AND data_pagamento = '2031-06-19') <> 2
     OR (SELECT valor FROM financeiro_lancamentos_v2 WHERE id = l1) <> 2309.64 OR (SELECT valor FROM financeiro_lancamentos_v2 WHERE id = l2) <> 494.02
     OR (SELECT count(*) FROM extrato_bancario_v2 WHERE id IN (e1, e2) AND status = 'conciliado') <> 2 THEN
    RAISE EXCEPTION 'B1 gravado: %', (SELECT jsonb_agg(jsonb_build_object('e', extrato_id, 'l', lancamento_id, 'ap', valor_aplicado)) FROM conciliacao_bancaria_itens WHERE grupo_id = v_b);
  END IF;

  -- B2
  PERFORM fn_desfazer_bloco(v_b, 'teste');
  IF (SELECT count(*) FROM conciliacao_bancaria_itens WHERE grupo_id = v_b AND desfeito_em IS NULL) <> 0
     OR (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE id IN (l1, l2) AND status_transacao = 'previsto' AND data_pagamento IS NULL) <> 2
     OR (SELECT count(*) FROM extrato_bancario_v2 WHERE id IN (e1, e2) AND status = 'nao_conciliado') <> 2
     OR public._fn_lancamento_aplicado_vivo(l1) <> 0 THEN RAISE EXCEPTION 'B2 desfazer'; END IF;

  -- B3
  x := pg_temp.ext(c, '2031-06-24', -100); y := pg_temp.ext(c, '2031-06-25', 100);
  v_ok := false;
  BEGIN PERFORM fn_conciliar_bloco(array[x, y], array[l1], 'exato', true);
  EXCEPTION WHEN sqlstate 'CBLOC' THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_ok := v_msg = 'liquido_zero: o bloco soma zero: entrada e saída se anulam — use o par de estorno.'; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'B3 liquido zero: %', v_msg; END IF;

  -- B4
  v_ok := false; v_msg := null;
  BEGIN PERFORM fn_conciliar_bloco(array[e1, e2], array[l1, l2], 'mais_antigo_primeiro', true);
  EXCEPTION WHEN sqlstate 'CBLOC' THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_ok := v_msg = 'direcao_mista: Mais antigo primeiro aceita só saídas ou só entradas; para saída + reembolso use Soma exata.'; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'B4 mais antigo misto: %', v_msg; END IF;

  -- B5 sinal unico: duas saidas contra dois lancamentos — a alocacao gulosa de sempre
  m1 := pg_temp.ext(c, '2031-07-01', -1000); m2 := pg_temp.ext(c, '2031-07-02', -500);
  x := pg_temp.lan(c, 700, 'programado', 'SINT a'); y := pg_temp.lan(c, 800, 'programado', 'SINT b');
  r := fn_conciliar_bloco(array[m1, m2], array[x, y], 'exato', true);
  IF (r#>>'{resumo,soma_extratos}')::numeric <> 1500 OR (r#>>'{resumo,diferenca}')::numeric <> 0 OR (r#>>'{resumo,sinal_misto}')::boolean
     OR (SELECT jsonb_agg(jsonb_build_array(q->>'extrato_id' = m1::text, (q->>'valor_aplicado')::numeric) ORDER BY ord) FROM jsonb_array_elements(r->'matriz') WITH ORDINALITY z(q, ord))
        IS DISTINCT FROM '[[true, 800], [true, 200], [false, 500]]'::jsonb THEN
    RAISE EXCEPTION 'B5 sinal unico: %', r->'matriz';
  END IF;

  RAISE EXCEPTION 'OK';
END $t$;
