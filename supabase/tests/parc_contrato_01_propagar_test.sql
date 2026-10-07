-- PARC-CONTRATO-01 (item 2) — `fn_parcelamento_propagar`: a edicao do contrato chega a's parcelas, pelo escopo escolhido.
-- Roda depois da 20261027194700, numa transacao que TERMINA EM RAISE (nada fica). Admin simulado; sintetico no cliente Teste:
-- contrato de 4 parcelas com a 1a PAGA.
-- P1 simulacao = gravacao (as contagens da previa sao as da execucao) e a simulacao nao escreve.
-- P2 "nenhum": nenhuma parcela muda, nem o contrato.  P3 "futuros": as 3 nao pagas mudam nome, classificacao, forma e credor; a
--    PAGA fica identica BYTE A BYTE; o contrato muda junto.  P4 "todos": a paga muda SO' descricao e classificacao — data, valor,
--    forma, conta, credor, fazenda e pagamento identicos.  P5 nome posto a' mao nao e' sobrescrito, e e' contado.
-- P6 contrato renomeado ANTES sem propagar (o caso do "Lascas"): as parcelas com a descricao antiga + "i/N" sao alcancadas.
-- P7 recusas: data/valor, campo desconhecido, descricao vazia, cadastro de outro cliente, escopo invalido, financiamento, sem usuario.
set local statement_timeout = '90s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  c_for constant uuid := '085c00ce-b4bb-48d6-9881-099db7aed3e2';
  v_p1 uuid; v_p2 uuid; v_fin uuid; l uuid[]; j jsonb; s jsonb; a jsonb; b jsonb; v_antes jsonb; v_txt text; v_outro uuid;
  c_campos jsonb;
BEGIN
  select id into v_p1 from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao='2-Saídas' and escopo_negocio='pecuaria' order by ordem_exibicao limit 1;
  select id into v_p2 from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao='2-Saídas' and escopo_negocio='pecuaria' order by ordem_exibicao offset 1 limit 1;
  v_fin := fn_parcelamento_cadastrar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'descricao', 'SINT PROPAGAR', 'tipo_operacao', '2-Saídas',
     'plano_conta_id', v_p1, 'data_competencia', '2031-02-20', 'intervalo_meses', 1, 'valor_total', 400, 'total_parcelas', 4, 'data_primeira_parcela', '2031-03-10', 'conta_bancaria_id', c_cta));
  select array_agg(lancamento_id order by numero_parcela) into l from financiamento_parcelas where financiamento_id = v_fin;
  update financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = date '2031-03-09', forma_pagamento = 'Boleto' where id = l[1];
  c_campos := jsonb_build_object('descricao', 'SINT NOME NOVO', 'plano_conta_id', v_p2, 'forma_pagamento', 'PIX', 'credor_id', c_for);
  select to_jsonb(x) into v_antes from financeiro_lancamentos_v2 x where x.id = l[1];

  -- P1: a simulacao conta e NAO escreve
  s := fn_parcelamento_propagar(v_fin, c_campos, 'todos', true);
  IF (s->'parcelas'->>'nao_pagas', s->'parcelas'->>'pagas', s->'alteradas'->>'futuros', s->'alteradas'->>'todos', s->>'gravadas') IS DISTINCT FROM ('3', '1', '3', '4', '0') THEN
    RAISE EXCEPTION 'P1 previa: %', s; END IF;
  IF (select string_agg(concat_ws(':', e->>'campo', e->>'nao_pagas', e->>'pagas', e->>'nas_pagas'), ' ') from jsonb_array_elements(s->'campos') e)
     IS DISTINCT FROM 'descricao:3:1:true credor_id:3:0:false forma_pagamento:3:0:false plano_conta_id:3:1:true' THEN
    RAISE EXCEPTION 'P1 campos: %', s->'campos'; END IF;
  IF (s->'campos'->0->>'de', s->'campos'->0->>'para') IS DISTINCT FROM ('SINT PROPAGAR', 'SINT NOME NOVO') THEN RAISE EXCEPTION 'P1 de/para: %', s->'campos'->0; END IF;
  IF exists (select 1 from financeiro_lancamentos_v2 x where x.id = any (l) and x.descricao like 'SINT NOME NOVO%')
     OR (select descricao from financiamentos where id = v_fin) <> 'SINT PROPAGAR' THEN RAISE EXCEPTION 'P1: a simulacao escreveu'; END IF;

  -- P2: "nenhum" nao escreve nada
  j := fn_parcelamento_propagar(v_fin, c_campos, 'nenhum', false);
  IF j->>'gravadas' <> '0' OR exists (select 1 from financeiro_lancamentos_v2 x where x.id = any (l) and x.descricao like 'SINT NOME NOVO%')
     OR (select descricao from financiamentos where id = v_fin) <> 'SINT PROPAGAR' THEN RAISE EXCEPTION 'P2: "nenhum" escreveu: %', j; END IF;

  -- P3: "futuros"
  j := fn_parcelamento_propagar(v_fin, c_campos, 'futuros', false);
  IF j->>'gravadas' <> (s->'alteradas'->>'futuros') THEN RAISE EXCEPTION 'P3: gravadas % x previa %', j->>'gravadas', s->'alteradas'->>'futuros'; END IF;
  IF (select string_agg(x.descricao, ' | ' order by q.numero_parcela) from financiamento_parcelas q join financeiro_lancamentos_v2 x on x.id = q.lancamento_id where q.financiamento_id = v_fin)
     IS DISTINCT FROM 'SINT PROPAGAR 1/4 | SINT NOME NOVO 2/4 | SINT NOME NOVO 3/4 | SINT NOME NOVO 4/4' THEN
    RAISE EXCEPTION 'P3 nomes: %', (select string_agg(x.descricao, ' | ') from financeiro_lancamentos_v2 x where x.id = any (l)); END IF;
  IF (select count(*) from financeiro_lancamentos_v2 x where x.id = any (l[2:4]) and x.plano_conta_id = v_p2 and x.forma_pagamento = 'PIX' and x.favorecido_id = c_for) <> 3 THEN
    RAISE EXCEPTION 'P3: as nao pagas nao levaram classificacao, forma e credor'; END IF;
  IF (select to_jsonb(x) from financeiro_lancamentos_v2 x where x.id = l[1]) IS DISTINCT FROM v_antes THEN RAISE EXCEPTION 'P3: a PAGA mudou em "futuros"'; END IF;
  IF (select (descricao, plano_conta_parcela_id, credor_id) from financiamentos where id = v_fin) IS DISTINCT FROM ('SINT NOME NOVO'::text, v_p2, c_for) THEN RAISE EXCEPTION 'P3: o contrato nao foi gravado junto'; END IF;

  -- P4: "todos" — a paga muda SO' descricao e classificacao
  s := fn_parcelamento_propagar(v_fin, c_campos, 'todos', true);
  IF (s->'alteradas'->>'futuros', s->'alteradas'->>'todos') IS DISTINCT FROM ('0', '1') THEN RAISE EXCEPTION 'P4 previa (so a paga falta): %', s->'alteradas'; END IF;
  j := fn_parcelamento_propagar(v_fin, c_campos, 'todos', false);
  select to_jsonb(x) into a from financeiro_lancamentos_v2 x where x.id = l[1];
  IF (a->>'descricao', a->>'plano_conta_id') IS DISTINCT FROM ('SINT NOME NOVO 1/4', v_p2::text) THEN RAISE EXCEPTION 'P4: a paga nao levou descricao e classificacao: %', a->>'descricao'; END IF;
  IF (a->'data_vencimento', a->'data_pagamento', a->'valor', a->'forma_pagamento', a->'conta_bancaria_id', a->'favorecido_id', a->'fazenda_id', a->'status_transacao', a->'data_competencia')
     IS DISTINCT FROM (v_antes->'data_vencimento', v_antes->'data_pagamento', v_antes->'valor', v_antes->'forma_pagamento', v_antes->'conta_bancaria_id', v_antes->'favorecido_id', v_antes->'fazenda_id', v_antes->'status_transacao', v_antes->'data_competencia') THEN
    RAISE EXCEPTION 'P4: a paga mudou data, valor, forma, conta, credor ou fazenda'; END IF;
  IF a->>'forma_pagamento' <> 'Boleto' THEN RAISE EXCEPTION 'P4: a forma da paga era Boleto e virou %', a->>'forma_pagamento'; END IF;

  -- P5: nome posto a' mao fica, e e' contado
  update financeiro_lancamentos_v2 set descricao = 'Entrada combinada com o vendedor' where id = l[3];
  s := fn_parcelamento_propagar(v_fin, jsonb_build_object('descricao', 'SINT TERCEIRO'), 'todos', true);
  IF (s->'nome_proprio'->>'nao_pagas', s->'nome_proprio'->>'pagas', s->'alteradas'->>'todos') IS DISTINCT FROM ('1', '0', '3') THEN RAISE EXCEPTION 'P5 previa: %', s; END IF;
  j := fn_parcelamento_propagar(v_fin, jsonb_build_object('descricao', 'SINT TERCEIRO'), 'todos', false);
  IF (select string_agg(x.descricao, ' | ' order by q.numero_parcela) from financiamento_parcelas q join financeiro_lancamentos_v2 x on x.id = q.lancamento_id where q.financiamento_id = v_fin)
     IS DISTINCT FROM 'SINT TERCEIRO 1/4 | SINT TERCEIRO 2/4 | Entrada combinada com o vendedor | SINT TERCEIRO 4/4' THEN
    RAISE EXCEPTION 'P5 nomes: %', (select string_agg(x.descricao, ' | ') from financeiro_lancamentos_v2 x where x.id = any (l)); END IF;

  -- P6: o contrato foi renomeado ANTES, sem propagar (as parcelas ficaram com a base antiga, na forma antiga em duas delas)
  update financiamentos set descricao = 'Lascas Novo' where id = v_fin;
  update financeiro_lancamentos_v2 set descricao = 'LASCAS VELHO - Parcela 1/4' where id = l[1];
  update financeiro_lancamentos_v2 set descricao = 'LASCAS VELHO 2/4' where id = l[2];
  update financeiro_lancamentos_v2 set descricao = 'LASCAS VELHO 4/4' where id = l[4];
  s := fn_parcelamento_propagar(v_fin, jsonb_build_object('descricao', 'Lascas Novo'), 'todos', true);
  IF (s->'alteradas'->>'futuros', s->'alteradas'->>'todos', s->'nome_proprio'->>'nao_pagas', s->'campos'->0->>'de') IS DISTINCT FROM ('2', '3', '1', 'LASCAS VELHO') THEN RAISE EXCEPTION 'P6 previa: %', s; END IF;
  j := fn_parcelamento_propagar(v_fin, jsonb_build_object('descricao', 'Lascas Novo'), 'todos', false);
  IF (select string_agg(x.descricao, ' | ' order by q.numero_parcela) from financiamento_parcelas q join financeiro_lancamentos_v2 x on x.id = q.lancamento_id where q.financiamento_id = v_fin)
     IS DISTINCT FROM 'Lascas Novo 1/4 | Lascas Novo 2/4 | Entrada combinada com o vendedor | Lascas Novo 4/4' THEN
    RAISE EXCEPTION 'P6 nomes: %', (select string_agg(x.descricao, ' | ') from financeiro_lancamentos_v2 x where x.id = any (l)); END IF;
  -- e nada a propagar depois: a previa diz zero
  s := fn_parcelamento_propagar(v_fin, jsonb_build_object('descricao', 'Lascas Novo'), 'todos', true);
  IF s->'alteradas'->>'todos' <> '0' THEN RAISE EXCEPTION 'P6: sobrou o que propagar: %', s; END IF;

  -- P7: recusas, com frase, sem gravar
  BEGIN perform fn_parcelamento_propagar(v_fin, jsonb_build_object('data_vencimento', '2031-01-01'), 'todos', false); RAISE EXCEPTION 'P7: aceitou data';
  EXCEPTION WHEN invalid_parameter_value THEN GET STACKED DIAGNOSTICS v_txt = MESSAGE_TEXT; IF v_txt NOT LIKE 'Data e valor de parcela não se propagam%' THEN RAISE EXCEPTION 'P7 frase da data: %', v_txt; END IF; END;
  BEGIN perform fn_parcelamento_propagar(v_fin, jsonb_build_object('valor', 1), 'todos', false); RAISE EXCEPTION 'P7: aceitou valor';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN perform fn_parcelamento_propagar(v_fin, jsonb_build_object('status_transacao', 'realizado'), 'todos', false); RAISE EXCEPTION 'P7: aceitou campo desconhecido';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN perform fn_parcelamento_propagar(v_fin, jsonb_build_object('descricao', '  '), 'todos', false); RAISE EXCEPTION 'P7: aceitou descricao vazia';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN perform fn_parcelamento_propagar(v_fin, jsonb_build_object('descricao', 'x'), 'alguns', false); RAISE EXCEPTION 'P7: aceitou escopo invalido';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  select id into v_outro from financeiro_fornecedores where cliente_id <> c_cli limit 1;
  BEGIN perform fn_parcelamento_propagar(v_fin, jsonb_build_object('credor_id', v_outro), 'todos', false); RAISE EXCEPTION 'P7: aceitou credor de outro cliente';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN perform fn_parcelamento_propagar((select id from financiamentos where natureza <> 'parcelamento' limit 1), jsonb_build_object('descricao', 'x'), 'todos', true); RAISE EXCEPTION 'P7: aceitou financiamento';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  perform set_config('request.jwt.claims', '', true);
  BEGIN perform fn_parcelamento_propagar(v_fin, jsonb_build_object('descricao', 'x'), 'todos', true); RAISE EXCEPTION 'P7: sem usuario devolveu';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE EXCEPTION 'OK parc_contrato_01_propagar (P1-P7)';
END $t$;
