-- FIN-CONTRATO-JUNTAR-01 — juntar dois cadastros do mesmo contrato. Sintetico no Teste, admin simulado; termina em RAISE 'OK'.
--   J1 simular nao grava
--   J2 juntar: contratado soma; cronograma soma por vencimento; lancamentos regerados um por parcela; liberacao, destinacao (de mesmo nome
--      soma) e captacao passam; o absorvido fica 'cancelado' com o link (nunca deletado); historico tem o evento
--   J3 desfazer volta ao antes (os dois contratos, parcelas, liberacoes, destinacoes)
--   J4 recusa parcela paga (com a lista) e credor diferente
--   J5 ACL e tenant
set local statement_timeout = '60s';
set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  fz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  cred uuid; cred2 uuid; m uuid; a uuid; x uuid; i int; r jsonb; jid uuid; le1 uuid; le2 uuid; cap uuid; plano uuid;
  fm jsonb; fa jsonb; s text; foto_m text; foto_a text;
BEGIN
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'SINT BANCO JUNTAR', true) returning id into cred;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'SINT OUTRO BANCO', true) returning id into cred2;
  insert into financiamentos (cliente_id, fazenda_id, natureza, tipo_financiamento, descricao, numero_contrato, valor_total, valor_entrada,
    data_contrato, data_primeira_parcela, total_parcelas, status, conta_bancaria_id, credor_id, taxa_juros_mensal)
  values (k, fz, 'financiamento', 'agricultura', 'SINT JUNTAR', 'SINT-78.192', 300, 0, date '2025-11-21', date '2031-10-01', 3, 'ativo', cta, cred, 0.6) returning id into m;
  insert into financiamentos (cliente_id, fazenda_id, natureza, tipo_financiamento, descricao, numero_contrato, valor_total, valor_entrada,
    data_contrato, data_primeira_parcela, total_parcelas, status, conta_bancaria_id, credor_id, taxa_juros_mensal)
  values (k, fz, 'financiamento', 'agricultura', 'SINT JUNTAR', 'SINT-78.192', 600, 0, date '2025-12-22', date '2031-10-01', 3, 'ativo', cta, cred, 0.6) returning id into a;
  FOR i IN 1..3 LOOP
    insert into financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status)
    values (m, k, i, (date '2031-10-01' + make_interval(years => i - 1))::date, case when i = 1 then 0 else 150 end, 10, case when i = 1 then 10 else 160 end, 'pendente');
    insert into financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status)
    values (a, k, i, (date '2031-10-01' + make_interval(years => i - 1))::date, case when i = 1 then 0 else 300 end, 20, case when i = 1 then 20 else 320 end, 'pendente');
  END LOOP;
  /* uma parcela do absorvido SEM par de vencimento: passa inteira ao mantido */
  insert into financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status)
  values (a, k, 4, date '2034-10-01', 0, 5, 5, 'pendente');
  r := public.fn_reconciliar_financiamento(m, false, true); r := public.fn_reconciliar_financiamento(a, false, true);
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, descricao, valor, data_competencia, data_pagamento, status_transacao, conta_destino_id, cenario, origem_lancamento)
  values (k, fz, '1-Entradas', 'SINT LIB 1', 300, date '2025-11-21', date '2025-11-21', 'realizado', cta, 'realizado', 'manual') returning id into le1;
  insert into financiamento_liberacoes (cliente_id, financiamento_id, data, valor, forma, lancamento_id) values (k, m, date '2025-11-21', 300, 'conta', le1);
  /* o absorvido tem CAPTACAO (nao liberacao) de 609,00: vira liberacao com o valor REAL */
  select id into plano from financeiro_plano_contas where cliente_id is null and ativo and tipo_operacao = '1-Entradas' order by ordem_exibicao limit 1;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, descricao, valor, data_competencia, data_pagamento, status_transacao, conta_destino_id,
    cenario, origem_lancamento, origem_tipo, financiamento_id, plano_conta_id)
  values (k, fz, '1-Entradas', 'SINT CAP 2', 609, date '2025-12-22', date '2025-12-22', 'realizado', cta, 'realizado', 'financiamento', 'financiamento_captacao', a, plano) returning id into cap;
  update financiamentos set lancamento_captacao_id = cap, gerar_lancamento_captacao = true, plano_conta_captacao_id = plano where id = a;
  insert into financiamento_destinacoes (cliente_id, financiamento_id, descricao, valor, valor_orcado) values (k, m, 'Recuperação de Solo', 300, 300);
  insert into financiamento_destinacoes (cliente_id, financiamento_id, descricao, valor, valor_orcado) values (k, a, 'recuperação de solo ', 609, 609);
  foto_m := public._fn_juncao_foto(m)::text; foto_a := public._fn_juncao_foto(a)::text;

  /* J1 */
  r := public.fn_financiamento_juntar(m, a);
  IF r -> 'recusa' <> 'null'::jsonb or (r #>> '{depois,contratado}')::numeric <> 900 or public._fn_juncao_foto(m)::text <> foto_m
     or public._fn_juncao_foto(a)::text <> foto_a THEN RAISE EXCEPTION 'J1: %', r; END IF;

  /* J2 */
  r := public.fn_financiamento_juntar(m, a, false);
  jid := (r ->> 'juncao_id')::uuid;
  IF (select valor_total from financiamentos where id = m) <> 900
     or (select count(*) from financiamento_parcelas where financiamento_id = m and status <> 'cancelado') <> 4
     or (select valor_juros from financiamento_parcelas where financiamento_id = m and data_vencimento = date '2031-10-01' and status <> 'cancelado') <> 30
     or (select valor_principal from financiamento_parcelas where financiamento_id = m and data_vencimento = date '2033-10-01' and status <> 'cancelado') <> 450
     or (select status from financiamentos where id = a) <> 'cancelado' or (select contrato_sucessor_id from financiamentos where id = a) <> m
     or (select baixa_motivo from financiamentos where id = a) not like 'juntado ao SINT-78.192 (%'
     or (select coalesce(sum(valor), 0) from financiamento_liberacoes where financiamento_id = m and cancelado_em is null) <> 909
     or (select count(*) from financiamento_destinacoes where financiamento_id = m) <> 1
     or (select valor_orcado from financiamento_destinacoes where financiamento_id = m) <> 909
     or exists (select 1 from financiamento_parcelas q join financeiro_lancamentos_v2 l on l.id in (q.lancamento_id, q.lancamento_juros_id)
                 where q.financiamento_id = m and q.status <> 'cancelado' and (l.cancelado or l.valor <> case when l.id = q.lancamento_id then q.valor_principal else q.valor_juros end))
     or (select count(*) from financiamento_parcelas where financiamento_id = m and status <> 'cancelado' and lancamento_juros_id is null) <> 0
     or (r #>> '{lancamentos,cancelados}')::int <> 11
     or not exists (select 1 from jsonb_array_elements(public.fn_contrato_tela(m, null) -> 'historico') e where e ->> 'evento' = 'Juntado com SINT-78.192' and (e ->> 'desfazivel')::boolean)
  THEN RAISE EXCEPTION 'J2: % %', r, public._fn_juncao_resumo(m); END IF;

  /* J3 */
  r := public.fn_financiamento_juntar_desfazer(jid, false);
  fm := public._fn_juncao_foto(m); fa := public._fn_juncao_foto(a);
  IF (fm -> 'contrato') <> (foto_m::jsonb -> 'contrato') or (fa -> 'contrato') <> (foto_a::jsonb -> 'contrato')
     or (select jsonb_agg(e - 'numero_parcela' order by e->>'id') from jsonb_array_elements(fm -> 'parcelas') e) is distinct from (select jsonb_agg(e - 'numero_parcela' order by e->>'id') from jsonb_array_elements(foto_m::jsonb -> 'parcelas') e)
     or (select jsonb_agg(e - 'numero_parcela' order by e->>'id') from jsonb_array_elements(fa -> 'parcelas') e) is distinct from (select jsonb_agg(e - 'numero_parcela' order by e->>'id') from jsonb_array_elements(foto_a::jsonb -> 'parcelas') e)
     or (select jsonb_agg(e order by e->>'id') from jsonb_array_elements(fm -> 'destinacoes') e) is distinct from (select jsonb_agg(e order by e->>'id') from jsonb_array_elements(foto_m::jsonb -> 'destinacoes') e)
     or (select jsonb_agg(e order by e->>'id') from jsonb_array_elements(fa -> 'destinacoes') e) is distinct from (select jsonb_agg(e order by e->>'id') from jsonb_array_elements(foto_a::jsonb -> 'destinacoes') e)
     or (select count(*) from financiamento_liberacoes where financiamento_id = m and cancelado_em is null) <> 1
     or exists (select 1 from financiamento_parcelas q where q.financiamento_id in (m, a) and q.status <> 'cancelado' and q.lancamento_juros_id is null)
     or (select desfeita_em from financiamento_juncoes where id = jid) is null
  THEN RAISE EXCEPTION 'J3: m % x % | a % x %', fm, foto_m, fa, foto_a; END IF;

  /* J4 */
  update financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = date '2031-10-01'
   where id in (select lancamento_juros_id from financiamento_parcelas where financiamento_id = a and data_vencimento = date '2031-10-01' and status <> 'cancelado');
  r := public.fn_financiamento_juntar(m, a);
  IF coalesce(r #>> '{recusa,frase}', '') not like 'Não dá para juntar: SINT-78.192 (absorvido): A parcela 1 já está paga.%' THEN RAISE EXCEPTION 'J4 paga: %', r; END IF;
  update financiamentos set credor_id = cred2 where id = a;
  r := public.fn_financiamento_juntar(m, a);
  IF r #>> '{recusa,frase}' is distinct from 'Os contratos têm credores diferentes.' THEN RAISE EXCEPTION 'J4 credor: %', r; END IF;
  BEGIN
    r := public.fn_financiamento_juntar(m, m, false);
    RAISE EXCEPTION 'J4 mesmo passou';
  EXCEPTION WHEN sqlstate 'P0001' THEN IF sqlerrm not like 'Escolha dois contratos diferentes.%' THEN RAISE EXCEPTION 'J4 mesmo: %', sqlerrm; END IF;
  END;

  /* J5 */
  FOREACH s IN ARRAY array['public.fn_financiamento_juntar(uuid, uuid, boolean)', 'public.fn_financiamento_juntar_desfazer(uuid, boolean)'] LOOP
    IF has_function_privilege('anon', s, 'execute') or not has_function_privilege('authenticated', s, 'execute') THEN RAISE EXCEPTION 'J5 publica %', s; END IF;
  END LOOP;
  IF has_function_privilege('authenticated', 'public._fn_financiamento_juntar_exec(uuid, uuid)', 'execute') THEN RAISE EXCEPTION 'J5 interna'; END IF;
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  BEGIN
    r := public.fn_financiamento_juntar(m, a);
    RAISE EXCEPTION 'J5 tenant passou';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE EXCEPTION 'OK';
END $t$;
