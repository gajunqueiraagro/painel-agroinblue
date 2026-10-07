-- PARC-LIVRES-01 (passo 2B) — `fn_parcelamento_editar_parcelas`.
-- Roda depois da 20261027194200, numa transacao que TERMINA EM RAISE (nada fica gravado). Sintetico no cliente Teste, admin simulado.
-- E1 editar valor e data de uma nao paga, retirar uma e acrescentar outra: parcela = lancamento; o RESTO do lancamento intacto;
--    a paga intocada; a retirada cancelada; a acrescentada herda classificacao, safra, forma e a NF da compra; contrato coerente.
-- E2 recusas (22023), todas sem gravar nada: mudar valor da paga, mudar data da paga, retirar a paga, soma diferente, parcela de
--    outro contrato, valor zero, data vazia, lista vazia, parcela repetida.
-- E3 paga pelos tres caminhos: lancamento realizado, parcela 'pago', vinculo vivo ao extrato (a funcao interna).
-- E4 financiamento com juros: recusado. Sem usuario: 42501.
set local statement_timeout = '60s';
set local lock_timeout = '3s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

DO $t$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v_faz uuid; v_plano uuid; v_safra uuid; v_fin uuid; v_doc uuid; v_r jsonb; v_txt text; v_antes text; v_depois text; v_msg text; v_caso text; v_lista jsonb;
  p1 record; p2 record; p3 record; p4 record; v_novo record; v_l2_antes text; v_l2_depois text; v_p1_antes text; v_total numeric; v_fin_j uuid;
BEGIN
  select id into v_faz from fazendas where cliente_id = c_cli order by nome limit 1;
  select id into v_plano from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao = '2-Saídas'
     and escopo_negocio = 'pecuaria' order by ordem_exibicao limit 1;
  insert into financeiro_safras (cliente_id, nome) values (c_cli, 'SINT 2B') returning id into v_safra;
  v_fin := fn_parcelamento_cadastrar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', v_faz, 'descricao', 'SINT parc-2b', 'tipo_operacao', '2-Saídas',
     'plano_conta_id', v_plano, 'data_competencia', '2031-01-10', 'intervalo_meses', 1, 'valor_total', 400, 'total_parcelas', 4,
     'data_primeira_parcela', '2031-02-10', 'safra_id', v_safra, 'forma_pagamento', 'Boleto'));
  select q.id, q.lancamento_id, q.data_vencimento, q.valor_total into p1 from financiamento_parcelas q where q.financiamento_id = v_fin and q.numero_parcela = 1;
  select q.id, q.lancamento_id, q.data_vencimento, q.valor_total into p2 from financiamento_parcelas q where q.financiamento_id = v_fin and q.numero_parcela = 2;
  select q.id, q.lancamento_id, q.data_vencimento, q.valor_total into p3 from financiamento_parcelas q where q.financiamento_id = v_fin and q.numero_parcela = 3;
  select q.id, q.lancamento_id, q.data_vencimento, q.valor_total into p4 from financiamento_parcelas q where q.financiamento_id = v_fin and q.numero_parcela = 4;
  -- a NF da compra: dona na parcela 1, ligada a's outras tres
  insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, especie) values (c_cli, p1.lancamento_id, 'sint-nf.xml', 'nf') returning id into v_doc;
  insert into financeiro_documento_vinculos (documento_id, documento_lancamento_id, lancamento_id, cliente_id)
    select v_doc, p1.lancamento_id, x, c_cli from unnest(array[p2.lancamento_id, p3.lancamento_id, p4.lancamento_id]) x;
  -- a parcela 1 esta' PAGA pelo dono: o lancamento realizado
  update financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = date '2031-02-10' where id = p1.lancamento_id;

  select md5(row(q.*)::text) || md5(row(l.*)::text) into v_p1_antes from financiamento_parcelas q join financeiro_lancamentos_v2 l on l.id = q.lancamento_id where q.id = p1.id;
  select md5(format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s', l.descricao, l.status_transacao, l.data_competencia, l.safra_id, l.forma_pagamento, l.plano_conta_id,
           l.favorecido_id, l.conta_bancaria_id, l.fazenda_id, l.cancelado, l.origem_tipo)) into v_l2_antes from financeiro_lancamentos_v2 l where l.id = p2.lancamento_id;

  -- ── E2: recusas, sem gravar ──
  select md5(string_agg(row(q.*)::text, '' order by q.id)) || md5((select string_agg(row(l.*)::text, '' order by l.id) from financeiro_lancamentos_v2 l where l.financiamento_id = v_fin))
        || md5((select row(f.*)::text from financiamentos f where f.id = v_fin)) into v_antes from financiamento_parcelas q where q.financiamento_id = v_fin;
  FOR v_caso, v_lista, v_total IN
    select * from (values
      ('valor_da_paga', jsonb_build_array(jsonb_build_object('id', p1.id, 'data_vencimento', p1.data_vencimento, 'valor', 90), jsonb_build_object('id', p2.id, 'data_vencimento', p2.data_vencimento, 'valor', 110),
                                          jsonb_build_object('id', p3.id, 'data_vencimento', p3.data_vencimento, 'valor', 100), jsonb_build_object('id', p4.id, 'data_vencimento', p4.data_vencimento, 'valor', 100)), 400::numeric),
      ('data_da_paga', jsonb_build_array(jsonb_build_object('id', p1.id, 'data_vencimento', '2031-02-11', 'valor', 100), jsonb_build_object('id', p2.id, 'data_vencimento', p2.data_vencimento, 'valor', 100),
                                          jsonb_build_object('id', p3.id, 'data_vencimento', p3.data_vencimento, 'valor', 100), jsonb_build_object('id', p4.id, 'data_vencimento', p4.data_vencimento, 'valor', 100)), 400),
      ('retirar_a_paga', jsonb_build_array(jsonb_build_object('id', p2.id, 'data_vencimento', p2.data_vencimento, 'valor', 100),
                                          jsonb_build_object('id', p3.id, 'data_vencimento', p3.data_vencimento, 'valor', 100), jsonb_build_object('id', p4.id, 'data_vencimento', p4.data_vencimento, 'valor', 100)), 300),
      ('soma', jsonb_build_array(jsonb_build_object('id', p1.id, 'data_vencimento', p1.data_vencimento, 'valor', 100), jsonb_build_object('id', p2.id, 'data_vencimento', p2.data_vencimento, 'valor', 99.99),
                                          jsonb_build_object('id', p3.id, 'data_vencimento', p3.data_vencimento, 'valor', 100), jsonb_build_object('id', p4.id, 'data_vencimento', p4.data_vencimento, 'valor', 100)), 400),
      ('outro_contrato', jsonb_build_array(jsonb_build_object('id', p1.id, 'data_vencimento', p1.data_vencimento, 'valor', 100), jsonb_build_object('id', gen_random_uuid(), 'data_vencimento', '2031-03-10', 'valor', 300)), 400),
      ('valor_zero', jsonb_build_array(jsonb_build_object('id', p1.id, 'data_vencimento', p1.data_vencimento, 'valor', 100), jsonb_build_object('id', p2.id, 'data_vencimento', p2.data_vencimento, 'valor', 0)), 100),
      ('data_vazia', jsonb_build_array(jsonb_build_object('id', p1.id, 'data_vencimento', p1.data_vencimento, 'valor', 100), jsonb_build_object('data_vencimento', '', 'valor', 300)), 400),
      ('lista_vazia', '[]'::jsonb, 400),
      ('repetida', jsonb_build_array(jsonb_build_object('id', p1.id, 'data_vencimento', p1.data_vencimento, 'valor', 100), jsonb_build_object('id', p2.id, 'data_vencimento', p2.data_vencimento, 'valor', 150),
                                          jsonb_build_object('id', p2.id, 'data_vencimento', p2.data_vencimento, 'valor', 150)), 400)
    ) as x(caso, lista, total)
  LOOP
    BEGIN
      perform fn_parcelamento_editar_parcelas(v_fin, v_lista, v_total);
      RAISE EXCEPTION 'E2 %: a RPC aceitou', v_caso;
    EXCEPTION WHEN sqlstate '22023' THEN
      get stacked diagnostics v_msg = message_text;
      IF v_caso in ('valor_da_paga', 'data_da_paga', 'retirar_a_paga') AND v_msg NOT LIKE 'A parcela 1 já está paga:%Nada foi gravado.' THEN RAISE EXCEPTION 'E2 %: frase %', v_caso, v_msg; END IF;
      IF v_caso = 'soma' AND v_msg <> 'A soma das parcelas (R$ 399,99) não fecha com o valor do contrato (R$ 400,00). Nada foi gravado.' THEN RAISE EXCEPTION 'E2 soma: frase %', v_msg; END IF;
    END;
  END LOOP;
  select md5(string_agg(row(q.*)::text, '' order by q.id)) || md5((select string_agg(row(l.*)::text, '' order by l.id) from financeiro_lancamentos_v2 l where l.financiamento_id = v_fin))
        || md5((select row(f.*)::text from financiamentos f where f.id = v_fin)) into v_depois from financiamento_parcelas q where q.financiamento_id = v_fin;
  IF v_depois IS DISTINCT FROM v_antes THEN RAISE EXCEPTION 'E2: uma recusa gravou alguma coisa'; END IF;

  -- ── E1: a edicao que vale — parcela 2 muda valor e data; a 4 sai; entra uma nova; o contrato passa a 450 ──
  v_r := fn_parcelamento_editar_parcelas(v_fin, jsonb_build_array(
           jsonb_build_object('id', p1.id, 'data_vencimento', p1.data_vencimento, 'valor', 100),
           jsonb_build_object('id', p2.id, 'data_vencimento', '2031-03-25', 'valor', 130.55),
           jsonb_build_object('id', p3.id, 'data_vencimento', p3.data_vencimento, 'valor', 100),
           jsonb_build_object('data_vencimento', '2031-07-01', 'valor', 119.45)), 450);
  IF (v_r->>'pagas', v_r->>'alteradas', v_r->>'acrescentadas', v_r->>'retiradas', v_r->>'parcelas') IS DISTINCT FROM ('1', '1', '1', '1', '4') THEN RAISE EXCEPTION 'E1: retorno %', v_r; END IF;
  -- (a) a paga, byte a byte
  select md5(row(q.*)::text) || md5(row(l.*)::text) into v_txt from financiamento_parcelas q join financeiro_lancamentos_v2 l on l.id = q.lancamento_id where q.id = p1.id;
  IF v_txt IS DISTINCT FROM v_p1_antes THEN RAISE EXCEPTION 'E1 (a): a parcela paga (ou o lancamento dela) mudou'; END IF;
  -- (b) soma = contrato
  IF (select sum(q.valor_total) from financiamento_parcelas q where q.financiamento_id = v_fin and q.status <> 'cancelado') <> 450
     OR (select (f.valor_total, f.total_parcelas, f.data_primeira_parcela) from financiamentos f where f.id = v_fin) IS DISTINCT FROM (450::numeric, 4, date '2031-02-10') THEN
    RAISE EXCEPTION 'E1 (b): soma ou contrato'; END IF;
  -- (c) lancamento = parcela em valor e vencimento; o resto do lancamento intacto
  IF EXISTS (select 1 from financiamento_parcelas q join financeiro_lancamentos_v2 l on l.id = q.lancamento_id
              where q.financiamento_id = v_fin and q.status <> 'cancelado' and (l.cancelado or l.valor <> q.valor_total or l.data_vencimento <> q.data_vencimento)) THEN
    RAISE EXCEPTION 'E1 (c): lancamento diferente da parcela'; END IF;
  IF (select (l.valor, l.data_vencimento) from financeiro_lancamentos_v2 l where l.id = p2.lancamento_id) IS DISTINCT FROM (130.55::numeric, date '2031-03-25') THEN RAISE EXCEPTION 'E1 (c): parcela 2'; END IF;
  select md5(format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s', l.descricao, l.status_transacao, l.data_competencia, l.safra_id, l.forma_pagamento, l.plano_conta_id,
           l.favorecido_id, l.conta_bancaria_id, l.fazenda_id, l.cancelado, l.origem_tipo)) into v_l2_depois from financeiro_lancamentos_v2 l where l.id = p2.lancamento_id;
  IF v_l2_depois IS DISTINCT FROM v_l2_antes THEN RAISE EXCEPTION 'E1 (c): o resto do lancamento da parcela 2 mudou'; END IF;
  -- a retirada
  IF (select q.status from financiamento_parcelas q where q.id = p4.id) <> 'cancelado' OR NOT (select l.cancelado from financeiro_lancamentos_v2 l where l.id = p4.lancamento_id) THEN
    RAISE EXCEPTION 'E1: a parcela retirada nao foi cancelada (parcela e lancamento)'; END IF;
  -- (d) a acrescentada herda tudo, inclusive a NF
  select q.id, q.lancamento_id, q.numero_parcela into v_novo from financiamento_parcelas q where q.financiamento_id = v_fin and q.status <> 'cancelado' and q.id not in (p1.id, p2.id, p3.id);
  IF v_novo.numero_parcela <> 4 OR NOT EXISTS (select 1 from financeiro_lancamentos_v2 l where l.id = v_novo.lancamento_id and l.safra_id = v_safra and l.forma_pagamento = 'Boleto'
        and l.plano_conta_id = v_plano and l.status_transacao = 'programado' and l.data_pagamento is null and l.fazenda_id = v_faz and l.data_competencia = date '2031-01-10'
        and l.valor = 119.45 and l.data_vencimento = date '2031-07-01' and l.descricao = 'SINT parc-2b - Parcela 4/4' and l.origem_lancamento is null) THEN
    RAISE EXCEPTION 'E1 (d): a parcela acrescentada nao herdou a classificacao'; END IF;
  IF NOT EXISTS (select 1 from financeiro_documento_vinculos v where v.documento_id = v_doc and v.lancamento_id = v_novo.lancamento_id) THEN RAISE EXCEPTION 'E1 (d): a acrescentada nao herdou a NF'; END IF;
  IF (select count(*) from financeiro_documento_vinculos v where v.documento_id = v_doc) <> 4 THEN RAISE EXCEPTION 'E1 (d): os vinculos da NF mudaram (a retirada segue ligada, como toda parcela cancelada)'; END IF;
  -- nomes coerentes
  select string_agg(l.descricao, ' | ' order by q.numero_parcela) into v_txt from financiamento_parcelas q join financeiro_lancamentos_v2 l on l.id = q.lancamento_id where q.financiamento_id = v_fin and q.status <> 'cancelado';
  IF v_txt <> 'SINT parc-2b - Parcela 1/4 | SINT parc-2b - Parcela 2/4 | SINT parc-2b - Parcela 3/4 | SINT parc-2b - Parcela 4/4' THEN RAISE EXCEPTION 'E1: nomes %', v_txt; END IF;

  -- o N muda: tira a 3 -> "1/3 2/3 3/3"; na PAGA so' o trecho i/N do nome muda; nome editado a' mao fica
  update financeiro_lancamentos_v2 set descricao = 'Nome posto à mão' where id = p2.lancamento_id;
  v_r := fn_parcelamento_editar_parcelas(v_fin, jsonb_build_array(
           jsonb_build_object('id', p1.id, 'data_vencimento', p1.data_vencimento, 'valor', 100),
           jsonb_build_object('id', p2.id, 'data_vencimento', '2031-03-25', 'valor', 130.55),
           jsonb_build_object('id', v_novo.id, 'data_vencimento', '2031-07-01', 'valor', 119.45)), 350);
  select string_agg(l.descricao, ' | ' order by q.numero_parcela) into v_txt from financiamento_parcelas q join financeiro_lancamentos_v2 l on l.id = q.lancamento_id where q.financiamento_id = v_fin and q.status <> 'cancelado';
  IF v_txt <> 'SINT parc-2b - Parcela 1/3 | Nome posto à mão | SINT parc-2b - Parcela 3/3' THEN RAISE EXCEPTION 'E1: nomes depois de tirar uma: %', v_txt; END IF;
  IF (select (l.status_transacao, l.data_pagamento, l.valor, l.data_vencimento) from financeiro_lancamentos_v2 l where l.id = p1.lancamento_id) IS DISTINCT FROM ('realizado'::text, date '2031-02-10', 100::numeric, date '2031-02-10') THEN
    RAISE EXCEPTION 'E1: a paga mudou alem do nome'; END IF;

  -- ── E3: os tres caminhos de "paga" ──
  IF NOT _fn_parcela_de_parcelamento_paga('pendente', p1.lancamento_id) THEN RAISE EXCEPTION 'E3: lancamento realizado nao contou como paga'; END IF;
  IF NOT _fn_parcela_de_parcelamento_paga('pago', p2.lancamento_id) THEN RAISE EXCEPTION 'E3: parcela pago nao contou'; END IF;
  IF _fn_parcela_de_parcelamento_paga('pendente', p2.lancamento_id) THEN RAISE EXCEPTION 'E3: programado sem vinculo contou como paga (o detector tem de saber dizer NAO)'; END IF;

  -- ── E4: financiamento com juros recusado; sem usuario, 42501 ──
  select f.id into v_fin_j from financiamentos f where f.natureza <> 'parcelamento' order by f.created_at limit 1;
  IF v_fin_j IS NULL THEN RAISE EXCEPTION 'E4: nao ha financiamento para provar'; END IF;
  BEGIN
    perform fn_parcelamento_editar_parcelas(v_fin_j, jsonb_build_array(jsonb_build_object('data_vencimento', '2031-01-01', 'valor', 1)), 1);
    RAISE EXCEPTION 'E4: aceitou financiamento com juros';
  EXCEPTION WHEN sqlstate '22023' THEN
    get stacked diagnostics v_msg = message_text;
    IF v_msg NOT LIKE 'Só as parcelas de parcelamento se editam por aqui.%' THEN RAISE EXCEPTION 'E4: recusou o financiamento por outro motivo: %', v_msg; END IF;
  END;
  perform set_config('request.jwt.claims', '', true);
  BEGIN
    perform fn_parcelamento_editar_parcelas(v_fin, jsonb_build_array(jsonb_build_object('data_vencimento', '2031-01-01', 'valor', 1)), 1);
    RAISE EXCEPTION 'E4: aceitou sem usuario';
  EXCEPTION WHEN sqlstate '42501' THEN null; END;

  RAISE EXCEPTION 'OK parc_livres_01_2b (E1-E4)';
END
$t$;
