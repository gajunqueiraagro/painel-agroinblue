-- PARC-LIVRES-01 (passo 4) — `fn_financiamento_situacao`: a situacao da parcela e' a do LANCAMENTO.
-- Roda depois da 20261027194300, numa transacao que TERMINA EM RAISE (nada fica gravado). Sintetico no cliente Teste, admin simulado.
-- S1 nada pago: pendente / vencida pela data; cartoes fecham no total.  S2 lancamento realizado -> PAGA, com a parcela ainda
-- 'pendente' (diverge).  S3 parcela 'pago' com lancamento programado -> NAO paga (vale o lancamento).  S4 a cancelada nao entra;
-- parcela SEM lancamento vale a propria.  S5 com juros: so' o principal realizado = 'parcial'; os dois = paga.  S6 sem usuario: 42501.
set local statement_timeout = '60s';
set local lock_timeout = '3s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

DO $t$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v_faz uuid; v_plano uuid; v_fin uuid; r jsonb; c jsonb; p1 record; p2 record; p3 record; v_lj uuid;
BEGIN
  select id into v_faz from fazendas where cliente_id = c_cli order by nome limit 1;
  select id into v_plano from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao = '2-Saídas'
     and escopo_negocio = 'pecuaria' order by ordem_exibicao limit 1;
  v_fin := fn_parcelamento_cadastrar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', v_faz, 'descricao', 'SINT parc-4', 'tipo_operacao', '2-Saídas',
     'plano_conta_id', v_plano, 'data_competencia', '2031-01-10', 'intervalo_meses', 1, 'valor_total', 300, 'total_parcelas', 3, 'data_primeira_parcela', '2031-02-10'));
  select q.id, q.lancamento_id into p1 from financiamento_parcelas q where q.financiamento_id = v_fin and q.numero_parcela = 1;
  select q.id, q.lancamento_id into p2 from financiamento_parcelas q where q.financiamento_id = v_fin and q.numero_parcela = 2;
  select q.id, q.lancamento_id into p3 from financiamento_parcelas q where q.financiamento_id = v_fin and q.numero_parcela = 3;

  -- S1
  r := fn_financiamento_situacao(v_fin, date '2031-03-15'); c := r->'cartoes';
  IF (select string_agg(e->>'situacao', ',' order by (e->>'numero')::int) from jsonb_array_elements(r->'parcelas') e) <> 'vencida,vencida,pendente' THEN RAISE EXCEPTION 'S1: situacoes %', r->'parcelas'; END IF;
  IF (c->>'pago', c->>'a_vencer', c->>'vencido', c->>'pagas', c->>'parcelas', c->>'valor_contrato') IS DISTINCT FROM ('0.00', '100.00', '200.00', '0', '3', '300.00') THEN RAISE EXCEPTION 'S1: cartoes %', c; END IF;

  -- S2: pagou pelo Financeiro (o lancamento realizado); a parcela continua 'pendente' na coluna
  update financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = date '2031-02-09' where id = p1.lancamento_id;
  r := fn_financiamento_situacao(v_fin, date '2031-03-15'); c := r->'cartoes';
  IF (r->'parcelas'->0->>'situacao', r->'parcelas'->0->>'pago_em', r->'parcelas'->0->>'valor_pago', r->'parcelas'->0->>'fonte', r->'parcelas'->0->>'diverge')
     IS DISTINCT FROM ('paga', '2031-02-09', '100.00', 'lancamento', 'true') THEN RAISE EXCEPTION 'S2: parcela 1 %', r->'parcelas'->0; END IF;
  IF (c->>'pago', c->>'a_vencer', c->>'vencido', c->>'pagas', c->>'divergentes') IS DISTINCT FROM ('100.00', '100.00', '100.00', '1', '1') THEN RAISE EXCEPTION 'S2: cartoes %', c; END IF;
  IF (c->>'pago')::numeric + (c->>'a_vencer')::numeric + (c->>'vencido')::numeric <> 300 THEN RAISE EXCEPTION 'S2: pago + a vencer + vencido nao fecha'; END IF;
  IF (select status from financiamento_parcelas where id = p1.id) <> 'pendente' THEN RAISE EXCEPTION 'S2: a leitura escreveu na parcela'; END IF;
  -- conciliado conta igual
  update financeiro_lancamentos_v2 set status_transacao = 'conciliado' where id = p1.lancamento_id;
  IF fn_financiamento_situacao(v_fin, date '2031-03-15')->'parcelas'->0->>'situacao' <> 'paga' THEN RAISE EXCEPTION 'S2: conciliado nao contou'; END IF;

  -- S3: a coluna diz 'pago' e o lancamento esta' programado -> vale o lancamento
  update financiamento_parcelas set status = 'pago', data_pagamento = date '2031-03-01' where id = p2.id;
  r := fn_financiamento_situacao(v_fin, date '2031-03-15');
  IF (r->'parcelas'->1->>'situacao', r->'parcelas'->1->>'diverge', r->'parcelas'->1->>'valor_pago') IS DISTINCT FROM ('vencida', 'true', '0.00') THEN RAISE EXCEPTION 'S3: parcela 2 %', r->'parcelas'->1; END IF;

  -- S4: sem lancamento vivo vale a parcela; a cancelada nao entra
  update financeiro_lancamentos_v2 set cancelado = true where id = p2.lancamento_id;
  r := fn_financiamento_situacao(v_fin, date '2031-03-15');
  IF (r->'parcelas'->1->>'situacao', r->'parcelas'->1->>'fonte', r->'parcelas'->1->>'pago_em', r->'parcelas'->1->>'diverge') IS DISTINCT FROM ('paga', 'parcela', '2031-03-01', 'false') THEN RAISE EXCEPTION 'S4: parcela sem lancamento %', r->'parcelas'->1; END IF;
  update financiamento_parcelas set status = 'cancelado' where id = p3.id;
  r := fn_financiamento_situacao(v_fin, date '2031-03-15'); c := r->'cartoes';
  IF jsonb_array_length(r->'parcelas') <> 2 OR (c->>'parcelas', c->>'soma_total', c->>'pago') IS DISTINCT FROM ('2', '200.00', '200.00') THEN RAISE EXCEPTION 'S4: a cancelada entrou: %', c; END IF;

  -- S5: financiamento com juros — dois lancamentos por parcela
  update financiamento_parcelas set status = 'pendente', data_pagamento = null, valor_juros = 10, valor_total = 110 where id = p1.id;
  update financeiro_lancamentos_v2 set status_transacao = 'realizado' where id = p1.lancamento_id;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento, status_transacao, cenario, cancelado, financiamento_id, origem_tipo)
    values (c_cli, v_faz, -1, '2-Saídas', 10, 'SINT juros', '2031-01-10', '2031-02-10', 'programado', 'realizado', false, v_fin, 'parcela_juros') returning id into v_lj;
  update financiamento_parcelas set lancamento_juros_id = v_lj where id = p1.id;
  r := fn_financiamento_situacao(v_fin, date '2031-03-15');
  IF (r->'parcelas'->0->>'situacao', r->'parcelas'->0->>'valor_pago', r->'parcelas'->0->>'lancamento_juros_id') IS DISTINCT FROM ('parcial', '100.00', v_lj::text) THEN RAISE EXCEPTION 'S5: so o principal realizado: %', r->'parcelas'->0; END IF;
  IF (r->'cartoes'->>'vencido') <> '10.00' THEN RAISE EXCEPTION 'S5: o resto do parcial nao foi para o vencido: %', r->'cartoes'; END IF;
  update financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = date '2031-02-12' where id = v_lj;
  r := fn_financiamento_situacao(v_fin, date '2031-03-15');
  IF (r->'parcelas'->0->>'situacao', r->'parcelas'->0->>'valor_pago', r->'parcelas'->0->>'pago_em') IS DISTINCT FROM ('paga', '110.00', '2031-02-12') THEN RAISE EXCEPTION 'S5: os dois realizados: %', r->'parcelas'->0; END IF;

  -- S6
  perform set_config('request.jwt.claims', '', true);
  BEGIN
    perform fn_financiamento_situacao(v_fin, null);
    RAISE EXCEPTION 'S6: leu sem usuario';
  EXCEPTION WHEN sqlstate '42501' THEN null; END;

  RAISE EXCEPTION 'OK parc_livres_01_4 (S1-S6)';
END
$t$;
