-- PARC-CADEIA-01 (passo 1) — a parcela de parcelamento e o lancamento dela mudam juntos.
-- Roda depois da 20261027194800, numa transacao que TERMINA EM RAISE (nada fica). Admin simulado; sintetico no cliente Teste:
-- contrato de 4 parcelas (100 cada).
-- C1 TRAVA: UPDATE direto e fn_cancelar_lancamento_auditoria sobre o lancamento de parcela viva sao recusados com a frase
--    (tambem como `authenticated`); nada muda.
-- C2 'so_esta': simulacao = gravacao e a simulacao nao escreve; gravado, a parcela vira 'cancelado', o lancamento e' cancelado
--    com o MOTIVO DO OPERADOR, o contrato vai a 3 parcelas / 300,00 e o i/N das demais e' renumerado.
-- C3 paga recusada (simulacao devolve a recusa; a gravacao levanta e nada muda).  C4 ultima viva recusada.
-- C5 'todas' com paga: recusada dizendo QUAIS.  C6 'todas': lancamentos e parcelas cancelados, contrato 'cancelado', nada apagado.
-- C7 recriar: parcela viva sem lancamento vivo ganha lancamento NOVO (classificacao do molde, nome do dono, NF herdada); o
--    cancelado nao volta; recusas (ja' tem lancamento).  C8 retirar pelo id da parcela quando o lancamento ja' estava cancelado.
-- C9 FORA: lancamento comum e lancamento de FINANCIAMENTO com juros cancelam como sempre; depois de retirada/cancelada a compra,
--    a trava nao pega mais.  C10 recusas de entrada: sem usuario, escopo, motivo vazio, financiamento.
set local statement_timeout = '90s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  v_p1 uuid; v_fin uuid; v_fin2 uuid; v_fj uuid; l uuid[]; pp uuid[]; j jsonb; s jsonb; v_txt text; v_comum uuid; v_lj uuid; v_doc uuid; v_novo uuid;
  v_foto text;
BEGIN
  select id into v_p1 from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao='2-Saídas' and escopo_negocio='pecuaria' order by ordem_exibicao limit 1;
  v_fin := fn_parcelamento_cadastrar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'descricao', 'SINT CADEIA', 'tipo_operacao', '2-Saídas',
     'plano_conta_id', v_p1, 'data_competencia', '2031-02-20', 'intervalo_meses', 1, 'valor_total', 400, 'total_parcelas', 4, 'data_primeira_parcela', '2031-03-10', 'conta_bancaria_id', c_cta));
  select array_agg(lancamento_id order by numero_parcela), array_agg(id order by numero_parcela) into l, pp from financiamento_parcelas where financiamento_id = v_fin;
  -- a nota da compra: a NF na 1a parcela, ligada a's outras tres
  insert into financeiro_lancamento_documentos (lancamento_id, cliente_id, especie, numero, nome) values (l[1], c_cli, 'nf', '777', 'NF 777') returning id into v_doc;
  insert into financeiro_documento_vinculos (documento_id, documento_lancamento_id, lancamento_id, cliente_id)
    select v_doc, l[1], x, c_cli from unnest(l[2:4]) x;

  -- C1: a trava
  BEGIN
    update financeiro_lancamentos_v2 set cancelado = true where id = l[2];
    RAISE EXCEPTION 'C1: o UPDATE direto cancelou a parcela';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF sqlerrm NOT LIKE 'Este lançamento é a parcela 2/4 da compra parcelada «SINT CADEIA». Cancele pela tela%' THEN RAISE EXCEPTION 'C1 frase: %', sqlerrm; END IF;
  END;
  BEGIN
    perform fn_cancelar_lancamento_auditoria(l[2], 'por fora');
    RAISE EXCEPTION 'C1: o dono do cancelamento cancelou a parcela por fora';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF sqlerrm NOT LIKE 'Este lançamento é a parcela 2/4%' THEN RAISE EXCEPTION 'C1 frase (dono): %', sqlerrm; END IF;
  END;
  BEGIN
    execute 'set local role authenticated';
    update financeiro_lancamentos_v2 set cancelado = true where id = l[2];
    execute 'reset role';
    RAISE EXCEPTION 'C1: como authenticated o UPDATE direto cancelou a parcela';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    execute 'reset role';
    IF sqlerrm NOT LIKE 'Este lançamento é a parcela 2/4%' THEN RAISE EXCEPTION 'C1 frase (authenticated): %', sqlerrm; END IF;
  END;
  IF exists (select 1 from financeiro_lancamentos_v2 x where x.id = any (l) and x.cancelado) THEN RAISE EXCEPTION 'C1: algo foi cancelado'; END IF;
  -- a chave nao fica ligada depois de uma recusa
  IF coalesce(current_setting('app.parcelamento_escritor', true), '') = 'on' THEN RAISE EXCEPTION 'C1: a chave do escritor ficou ligada'; END IF;

  -- C2: so' esta — simulacao
  select md5(string_agg(to_jsonb(x)::text, '|' order by x.id)) into v_foto from financeiro_lancamentos_v2 x where x.id = any (l);
  s := fn_parcelamento_cancelar_parcela(l[2], 'so_esta', '', true);
  IF (s->>'ok', s->'parcela'->>'numero', s->'parcela'->>'total', s->'antes'->>'parcelas', (s->'antes'->>'valor_total')::numeric, s->'depois'->>'parcelas', (s->'depois'->>'valor_total')::numeric, s->>'nota', s->'contrato'->>'descricao')
     IS DISTINCT FROM ('true', '2', '4', '4', 400::numeric, '3', 300::numeric, '777', 'SINT CADEIA') THEN RAISE EXCEPTION 'C2 simulacao: %', s; END IF;
  IF jsonb_typeof(s->'recusa') <> 'null' THEN RAISE EXCEPTION 'C2: simulacao com recusa: %', s->'recusa'; END IF;
  IF (select md5(string_agg(to_jsonb(x)::text, '|' order by x.id)) from financeiro_lancamentos_v2 x where x.id = any (l)) <> v_foto
     OR (select count(*) from financiamento_parcelas where financiamento_id = v_fin and status <> 'cancelado') <> 4
     OR (select (valor_total, total_parcelas) from financiamentos where id = v_fin) IS DISTINCT FROM (400::numeric, 4) THEN
    RAISE EXCEPTION 'C2: a simulacao escreveu'; END IF;
  -- gravado
  j := fn_parcelamento_cancelar_parcela(l[2], 'so_esta', 'cancelei por engano de compra', false);
  IF (j->'depois') IS DISTINCT FROM (s->'depois') OR (j->'antes') IS DISTINCT FROM (s->'antes') THEN RAISE EXCEPTION 'C2: gravacao % x simulacao %', j, s; END IF;
  IF (select (status) from financiamento_parcelas where id = pp[2]) <> 'cancelado' THEN RAISE EXCEPTION 'C2: a parcela nao foi cancelada'; END IF;
  IF (select (cancelado, cancelado_motivo) from financeiro_lancamentos_v2 where id = l[2]) IS DISTINCT FROM (true, 'cancelei por engano de compra'::text) THEN
    RAISE EXCEPTION 'C2: lancamento nao cancelado com o motivo do operador: %', (select cancelado_motivo from financeiro_lancamentos_v2 where id = l[2]); END IF;
  IF (select (valor_total, total_parcelas, data_primeira_parcela) from financiamentos where id = v_fin) IS DISTINCT FROM (300::numeric, 3, date '2031-03-10') THEN
    RAISE EXCEPTION 'C2: contrato nao recalculado: %', (select (valor_total, total_parcelas) from financiamentos where id = v_fin); END IF;
  IF (select string_agg(x.descricao, ' | ' order by q.numero_parcela) from financiamento_parcelas q join financeiro_lancamentos_v2 x on x.id = q.lancamento_id
       where q.financiamento_id = v_fin and q.status <> 'cancelado') IS DISTINCT FROM 'SINT CADEIA 1/3 | SINT CADEIA 2/3 | SINT CADEIA 3/3' THEN
    RAISE EXCEPTION 'C2: renumeracao: %', (select string_agg(x.descricao, ' | ') from financeiro_lancamentos_v2 x where x.id = any (l)); END IF;
  IF coalesce(current_setting('app.parcelamento_escritor', true), '') = 'on' OR coalesce(current_setting('app.parcelamento_motivo', true), '') <> '' THEN
    RAISE EXCEPTION 'C2: chave ou motivo ficaram ligados depois do gesto'; END IF;
  -- a parcela retirada nao e' mais travada nem cancelavel por aqui
  BEGIN
    perform fn_parcelamento_cancelar_parcela(l[2], 'so_esta', 'de novo', false);
    RAISE EXCEPTION 'C2: retirou duas vezes';
  EXCEPTION WHEN sqlstate '22023' THEN IF sqlerrm NOT LIKE 'Esta parcela já foi retirada%' THEN RAISE EXCEPTION 'C2 frase da repeticao: %', sqlerrm; END IF; END;

  -- C3: paga recusada
  update financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = date '2031-03-09' where id = l[1];
  s := fn_parcelamento_cancelar_parcela(l[1], 'so_esta', 'x', true);
  IF (s->>'ok', s->'recusa'->>'motivo', s->'recusa'->>'frase') IS DISTINCT FROM ('false', 'paga', 'A parcela 1 já está paga: desfaça o pagamento antes.') THEN RAISE EXCEPTION 'C3 simulacao: %', s; END IF;
  BEGIN
    perform fn_parcelamento_cancelar_parcela(l[1], 'so_esta', 'x', false);
    RAISE EXCEPTION 'C3: cancelou a paga';
  EXCEPTION WHEN sqlstate '22023' THEN IF sqlerrm NOT LIKE 'A parcela 1 já está paga: desfaça o pagamento antes. Nada foi gravado.' THEN RAISE EXCEPTION 'C3 frase: %', sqlerrm; END IF; END;
  IF (select cancelado from financeiro_lancamentos_v2 where id = l[1]) OR (select total_parcelas from financiamentos where id = v_fin) <> 3 THEN RAISE EXCEPTION 'C3: a paga mudou'; END IF;

  -- C5: 'todas' com paga — recusada dizendo quais
  s := fn_parcelamento_cancelar_parcela(l[3], 'todas', 'x', true);
  IF (s->>'ok', s->'recusa'->>'motivo', s->'recusa'->>'frase') IS DISTINCT FROM ('false', 'ha_paga', 'A parcela 1 já está paga: desfaça o pagamento antes de cancelar a compra.') THEN RAISE EXCEPTION 'C5 simulacao: %', s; END IF;
  BEGIN
    perform fn_parcelamento_excluir(v_fin, 'x', false);
    RAISE EXCEPTION 'C5: excluiu com paga';
  EXCEPTION WHEN sqlstate '22023' THEN IF sqlerrm NOT LIKE 'A parcela 1 já está paga:%Nada foi gravado.' THEN RAISE EXCEPTION 'C5 frase: %', sqlerrm; END IF; END;
  IF (select status from financiamentos where id = v_fin) = 'cancelado' OR exists (select 1 from financeiro_lancamentos_v2 x where x.id in (l[3], l[4]) and x.cancelado) THEN
    RAISE EXCEPTION 'C5: algo foi cancelado'; END IF;
  update financeiro_lancamentos_v2 set status_transacao = 'programado', data_pagamento = null where id = l[1];

  -- C8: o lancamento da parcela 3 ja' cancelado (a quebra que existe hoje) — retirar pelo id da PARCELA
  perform set_config('app.parcelamento_escritor', 'on', true);
  update financeiro_lancamentos_v2 set cancelado = true, cancelado_em = now(), cancelado_motivo = 'legado' where id = l[4];
  perform set_config('app.parcelamento_escritor', 'off', true);
  -- C7: recriar o lancamento da parcela (era a 4a, hoje 3/3)
  s := fn_parcelamento_recriar_lancamento(pp[4], true);
  IF (s->>'ok', s->>'descricao', s->>'molde', s->'parcela'->>'numero') IS DISTINCT FROM ('true', 'SINT CADEIA 3/3', 'vizinha', '3') OR jsonb_typeof(s->'lancamento_id') <> 'null' THEN RAISE EXCEPTION 'C7 simulacao: %', s; END IF;
  IF (select lancamento_id from financiamento_parcelas where id = pp[4]) <> l[4] THEN RAISE EXCEPTION 'C7: a simulacao escreveu'; END IF;
  j := fn_parcelamento_recriar_lancamento(pp[4], false);
  v_novo := (j->>'lancamento_id')::uuid;
  IF v_novo is null OR v_novo = l[4] OR (select lancamento_id from financiamento_parcelas where id = pp[4]) <> v_novo THEN RAISE EXCEPTION 'C7: nao recriou: %', j; END IF;
  IF (select (descricao, valor, data_vencimento, status_transacao, plano_conta_id, conta_bancaria_id, fazenda_id, financiamento_id, origem_tipo, cancelado)
        from financeiro_lancamentos_v2 where id = v_novo)
     IS DISTINCT FROM ('SINT CADEIA 3/3'::text, 100::numeric, date '2031-06-10', 'programado'::text, v_p1, c_cta, c_faz, v_fin, 'parcela_principal'::text, false) THEN
    RAISE EXCEPTION 'C7: lancamento recriado errado: %', (select to_jsonb(x) from financeiro_lancamentos_v2 x where x.id = v_novo); END IF;
  IF NOT (select cancelado from financeiro_lancamentos_v2 where id = l[4]) THEN RAISE EXCEPTION 'C7: o cancelado foi reativado'; END IF;
  IF NOT exists (select 1 from vw_lancamento_documentos d where d.lancamento_id = v_novo and d.especie = 'nf' and d.numero = '777') THEN RAISE EXCEPTION 'C7: a NF da compra nao foi herdada'; END IF;
  s := fn_parcelamento_recriar_lancamento(pp[4], true);
  IF (s->>'ok', s->'recusa'->>'motivo') IS DISTINCT FROM ('false', 'tem_lancamento') THEN RAISE EXCEPTION 'C7: recriou onde ja ha lancamento: %', s; END IF;
  -- o recriado e' travado como qualquer parcela viva
  BEGIN
    update financeiro_lancamentos_v2 set cancelado = true where id = v_novo;
    RAISE EXCEPTION 'C7: o recriado nao esta travado';
  EXCEPTION WHEN sqlstate 'P0001' THEN null; END;

  -- C8: retirar pelo id da parcela, com o lancamento ja' cancelado por fora
  perform set_config('app.parcelamento_escritor', 'on', true);
  update financeiro_lancamentos_v2 set cancelado = true, cancelado_em = now(), cancelado_motivo = 'por fora' where id = l[3];
  perform set_config('app.parcelamento_escritor', 'off', true);
  j := fn_parcelamento_cancelar_parcela(null, 'so_esta', 'retirar a quebrada', false, pp[3]);
  IF (j->>'ok', j->'depois'->>'parcelas', (j->'depois'->>'valor_total')::numeric) IS DISTINCT FROM ('true', '2', 200::numeric) THEN RAISE EXCEPTION 'C8: %', j; END IF;
  IF (select status from financiamento_parcelas where id = pp[3]) <> 'cancelado' OR (select cancelado_motivo from financeiro_lancamentos_v2 where id = l[3]) <> 'por fora' THEN
    RAISE EXCEPTION 'C8: a parcela nao saiu, ou o motivo do cancelamento antigo foi reescrito'; END IF;
  IF (select (valor_total, total_parcelas) from financiamentos where id = v_fin) IS DISTINCT FROM (200::numeric, 2) THEN RAISE EXCEPTION 'C8: contrato'; END IF;

  -- C4: ultima viva — num contrato de 2, retira uma e tenta a outra
  v_fin2 := fn_parcelamento_cadastrar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'descricao', 'SINT CADEIA DOIS', 'tipo_operacao', '2-Saídas',
     'plano_conta_id', v_p1, 'data_competencia', '2031-02-20', 'intervalo_meses', 1, 'valor_total', 200, 'total_parcelas', 2, 'data_primeira_parcela', '2031-03-10', 'conta_bancaria_id', c_cta));
  perform fn_parcelamento_cancelar_parcela((select lancamento_id from financiamento_parcelas where financiamento_id = v_fin2 and numero_parcela = 2), 'so_esta', 'm', false);
  s := fn_parcelamento_cancelar_parcela((select lancamento_id from financiamento_parcelas where financiamento_id = v_fin2 and status <> 'cancelado'), 'so_esta', 'm', true);
  IF (s->>'ok', s->'recusa'->>'motivo') IS DISTINCT FROM ('false', 'ultima_viva') OR s->'recusa'->>'frase' NOT LIKE '%cancele a compra inteira.' THEN RAISE EXCEPTION 'C4: %', s; END IF;
  BEGIN
    perform fn_parcelamento_cancelar_parcela((select lancamento_id from financiamento_parcelas where financiamento_id = v_fin2 and status <> 'cancelado'), 'so_esta', 'm', false);
    RAISE EXCEPTION 'C4: retirou a ultima viva';
  EXCEPTION WHEN sqlstate '22023' THEN null; END;

  -- C6: 'todas' — simulacao = gravacao; nada e' apagado
  s := fn_parcelamento_cancelar_parcela(l[1], 'todas', '', true);
  IF (s->>'ok', s->'todas'->>'lancamentos', s->'todas'->>'parcelas', s->'depois'->>'parcelas') IS DISTINCT FROM ('true', '2', '2', '0') THEN RAISE EXCEPTION 'C6 simulacao: %', s; END IF;
  IF (select status from financiamentos where id = v_fin) = 'cancelado' OR (select cancelado from financeiro_lancamentos_v2 where id = l[1]) THEN RAISE EXCEPTION 'C6: a simulacao escreveu'; END IF;
  j := fn_parcelamento_cancelar_parcela(l[1], 'todas', 'compra desfeita', false);
  IF (j->'todas') IS DISTINCT FROM (s->'todas') THEN RAISE EXCEPTION 'C6: gravacao % x simulacao %', j->'todas', s->'todas'; END IF;
  IF (select status from financiamentos where id = v_fin) <> 'cancelado' OR (select observacao from financiamentos where id = v_fin) NOT LIKE '%compra desfeita%'
     OR exists (select 1 from financiamento_parcelas where financiamento_id = v_fin and status <> 'cancelado')
     OR (select count(*) from financiamento_parcelas where financiamento_id = v_fin) <> 4
     OR exists (select 1 from financeiro_lancamentos_v2 x where x.financiamento_id = v_fin and not x.cancelado)
     OR (select cancelado_motivo from financeiro_lancamentos_v2 where id = l[1]) <> 'compra desfeita' THEN
    RAISE EXCEPTION 'C6: a compra inteira nao ficou cancelada com a trilha'; END IF;
  IF coalesce(current_setting('app.parcelamento_escritor', true), '') = 'on' THEN RAISE EXCEPTION 'C6: a chave do escritor ficou ligada depois de cancelar a compra'; END IF;
  BEGIN
    perform fn_parcelamento_excluir(v_fin, 'de novo', false);
    RAISE EXCEPTION 'C6: cancelou duas vezes';
  EXCEPTION WHEN sqlstate '22023' THEN IF sqlerrm NOT LIKE '%já está cancelada.' THEN RAISE EXCEPTION 'C6 frase: %', sqlerrm; END IF; END;

  -- C9: fora da trava — lancamento comum e lancamento de FINANCIAMENTO com juros
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento, status_transacao, cenario, cancelado, plano_conta_id, conta_bancaria_id)
  values (c_cli, c_faz, -1, '2-Saídas', 10, 'SINT COMUM', date '2031-03-01', date '2031-03-10', 'programado', 'realizado', false, v_p1, c_cta) returning id into v_comum;
  update financeiro_lancamentos_v2 set cancelado = true where id = v_comum;
  IF NOT (select cancelado from financeiro_lancamentos_v2 where id = v_comum) THEN RAISE EXCEPTION 'C9: lancamento comum nao cancelou'; END IF;
  insert into financiamentos (cliente_id, fazenda_id, tipo_financiamento, descricao, valor_total, natureza, status, total_parcelas, data_contrato, data_primeira_parcela)
  values (c_cli, c_faz, 'pecuaria', 'SINT FIN COM JUROS', 100, 'financiamento', 'ativo', 1, date '2031-02-01', date '2031-03-10') returning id into v_fj;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento, status_transacao, cenario, cancelado, plano_conta_id, conta_bancaria_id, financiamento_id, origem_lancamento, origem_tipo)
  values (c_cli, c_faz, -1, '2-Saídas', 100, 'Parcela 1/1 SINT FIN COM JUROS', date '2031-03-01', date '2031-03-10', 'programado', 'realizado', false, v_p1, c_cta, v_fj, 'parcela_financiamento', 'parcela_principal') returning id into v_lj;
  insert into financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status, lancamento_id)
  values (v_fj, c_cli, 1, date '2031-03-10', 100, 0, 100, 'pendente', v_lj);
  update financeiro_lancamentos_v2 set cancelado = true where id = v_lj;
  IF NOT (select cancelado from financeiro_lancamentos_v2 where id = v_lj) THEN RAISE EXCEPTION 'C9: lancamento de financiamento com juros nao cancelou'; END IF;

  -- C10: recusas de entrada
  BEGIN perform fn_parcelamento_cancelar_parcela(v_lj, 'so_esta', 'm', true); RAISE EXCEPTION 'C10: aceitou parcela de financiamento';
  EXCEPTION WHEN sqlstate '42501' THEN null; END;
  BEGIN perform fn_parcelamento_excluir(v_fj, 'm', true); RAISE EXCEPTION 'C10: excluiu financiamento com juros';
  EXCEPTION WHEN sqlstate '22023' THEN null; END;
  BEGIN perform fn_parcelamento_recriar_lancamento((select id from financiamento_parcelas where financiamento_id = v_fj), true); RAISE EXCEPTION 'C10: recriou em financiamento';
  EXCEPTION WHEN sqlstate '22023' THEN null; END;
  BEGIN perform fn_parcelamento_cancelar_parcela((select lancamento_id from financiamento_parcelas where financiamento_id = v_fin2 and status <> 'cancelado'), 'outra', 'm', true); RAISE EXCEPTION 'C10: escopo invalido aceito';
  EXCEPTION WHEN sqlstate '22023' THEN null; END;
  BEGIN perform fn_parcelamento_cancelar_parcela((select lancamento_id from financiamento_parcelas where financiamento_id = v_fin2 and status <> 'cancelado'), 'todas', '  ', false); RAISE EXCEPTION 'C10: gravou sem motivo';
  EXCEPTION WHEN sqlstate '22023' THEN IF sqlerrm <> 'Informe o motivo do cancelamento.' THEN RAISE EXCEPTION 'C10 motivo: %', sqlerrm; END IF; END;
  BEGIN perform fn_parcelamento_cancelar_parcela(gen_random_uuid(), 'so_esta', 'm', true); RAISE EXCEPTION 'C10: lancamento inexistente aceito';
  EXCEPTION WHEN sqlstate '42501' THEN null; END;
  perform set_config('request.jwt.claims', '', true);
  BEGIN perform fn_parcelamento_excluir(v_fin2, 'm', true); RAISE EXCEPTION 'C10: sem usuario passou (excluir)';
  EXCEPTION WHEN sqlstate '42501' THEN null; END;
  BEGIN perform fn_parcelamento_cancelar_parcela(null, 'so_esta', 'm', true, (select id from financiamento_parcelas where financiamento_id = v_fin2 and status <> 'cancelado')); RAISE EXCEPTION 'C10: sem usuario passou (cancelar)';
  EXCEPTION WHEN sqlstate '42501' THEN null; END;
  BEGIN perform fn_parcelamento_recriar_lancamento((select id from financiamento_parcelas where financiamento_id = v_fin2 and status <> 'cancelado'), true); RAISE EXCEPTION 'C10: sem usuario passou (recriar)';
  EXCEPTION WHEN sqlstate '42501' THEN null; END;

  RAISE EXCEPTION 'OK PARC-CADEIA-01 passo 1: C1 a C10';
END
$t$;
