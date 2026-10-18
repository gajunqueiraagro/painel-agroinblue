-- FIN-FINANC-28 · TELA DO CONTRATO v3 — `fn_contrato_tela`. Sintetico no Teste, admin simulado; termina em RAISE 'OK' (nada fica).
--   V1 condicoes: taxa gravada a.m. e a taxa a.a. equivalente; sistema/carencia/tipo nulos
--   V2 liberacoes: entrou limitado a' liberacao, a identificar = valor − entrou, sem vinculo = o valor inteiro, excedente a' vista
--   V3 a resolver: vencidas (com a parcela), a identificar, cedula, credor sem documento, condicoes incompletas
--   V4 pagamentos: a parcela paga entra com principal e juros dos lancamentos realizados; historico tem o pagamento e as liberacoes
--   V5 contrato completo e em dia: a resolver vazio
--   V6 tenant: usuario sem acesso -> 42501; anon sem EXECUTE
set local statement_timeout = '60s';
set local lock_timeout = '2s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  fz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  cred uuid; fin uuid; p1 uuid; p2 uuid; le uuid; r jsonb; l1 uuid; ok boolean;
BEGIN
  insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (k, 'SINT CREDOR TELA', null, true) returning id into cred;
  insert into financiamentos (cliente_id, fazenda_id, natureza, tipo_financiamento, descricao, numero_contrato, valor_total, valor_entrada,
                              data_contrato, data_primeira_parcela, total_parcelas, status, conta_bancaria_id, credor_id, taxa_juros_mensal)
  values (k, fz, 'financiamento', 'pecuaria', 'SINT TELA', 'Atualizar', 2000, 0, date '2026-01-10', date '2026-02-15', 2, 'ativo', cta, cred, 1)
  returning id into fin;
  insert into financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status)
  values (fin, k, 1, date '2026-02-15', 1000, 50, 1050, 'pendente') returning id into p1;
  insert into financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status)
  values (fin, k, 2, date '2031-03-15', 1000, 50, 1050, 'pendente') returning id into p2;
  r := public.fn_reconciliar_financiamento(fin, false, true);
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, descricao, valor, data_competencia, data_pagamento,
                                         status_transacao, conta_destino_id, cenario, origem_lancamento)
  values (k, fz, '1-Entradas', 'SINT ENTRADA', 900, date '2026-01-12', date '2026-01-12', 'realizado', cta, 'realizado', 'manual') returning id into le;
  insert into financiamento_liberacoes (cliente_id, financiamento_id, data, valor, forma, lancamento_id) values (k, fin, date '2026-01-12', 1000, 'conta', le) returning id into l1;
  insert into financiamento_liberacoes (cliente_id, financiamento_id, data, valor, forma) values (k, fin, date '2026-01-20', 500, 'conta');

  r := public.fn_contrato_tela(fin, date '2026-06-01');
  /* V1 */
  IF (r #>> '{condicoes,unidade}') is distinct from 'a.m.' or (r #>> '{condicoes,taxa_aa}')::numeric is distinct from 12.6825
     or (r #>> '{condicoes,sistema}') is not null THEN RAISE EXCEPTION 'V1: %', r -> 'condicoes'; END IF;
  /* V2 */
  IF (r #>> '{liberacoes,0,entrou}')::numeric is distinct from 900 or (r #>> '{liberacoes,0,a_identificar}')::numeric is distinct from 100
     or (r #>> '{liberacoes,1,a_identificar}')::numeric is distinct from 500 or (r #>> '{liberacoes_total,a_identificar}')::numeric is distinct from 600
     or (r #>> '{contrato,ultima_liberacao,a_confirmar}')::boolean is not true or (r #>> '{contrato,primeira_liberacao,a_confirmar}')::boolean is not false
  THEN RAISE EXCEPTION 'V2: % %', r -> 'liberacoes', r -> 'contrato'; END IF;
  update financeiro_lancamentos_v2 set valor = 1200 where id = le;
  r := public.fn_contrato_tela(fin, date '2026-06-01');
  IF (r #>> '{liberacoes,0,entrou}')::numeric is distinct from 1000 or (r #>> '{liberacoes,0,excedente}')::numeric is distinct from 200
  THEN RAISE EXCEPTION 'V2 excedente: %', r -> 'liberacoes'; END IF;
  /* V3 */
  select bool_and(x) into ok from (select (r -> 'a_resolver') @> jsonb_build_array(jsonb_build_object('chave', c)) as x
    from unnest(array['vencidas','a_identificar','sem_cedula','credor_sem_documento','condicoes','sem_numero']) c) s;
  IF not ok or (r #>> '{a_resolver,0,parcela_id}')::uuid is distinct from p1 THEN RAISE EXCEPTION 'V3: %', r -> 'a_resolver'; END IF;
  /* V4 */
  update financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = date '2026-02-15', conta_bancaria_id = cta
  where id in (select lancamento_id from financiamento_parcelas where id = p1 union select lancamento_juros_id from financiamento_parcelas where id = p1);
  r := public.fn_contrato_tela(fin, date '2026-06-01');
  IF jsonb_array_length(r -> 'pagamentos') <> 1 or (r #>> '{pagamentos,0,principal}')::numeric is distinct from 1000
     or (r #>> '{pagamentos,0,juros}')::numeric is distinct from 50 or (r #>> '{pagamentos_total,total}')::numeric is distinct from 1050
     or not exists (select 1 from jsonb_array_elements(r -> 'historico') e where e ->> 'evento' like 'Pagamento · Parcela 1/2%')
     or (select count(*) from jsonb_array_elements(r -> 'historico') e where e ->> 'evento' like 'Liberação%') <> 2
     or (r -> 'a_resolver') @> '[{"chave":"vencidas"}]'
  THEN RAISE EXCEPTION 'V4: % %', r -> 'pagamentos', r -> 'a_resolver'; END IF;
  /* V5 */
  update financeiro_fornecedores set cpf_cnpj = '11.222.333/0001-81' where id = cred;
  update financiamentos set sistema_amortizacao = 'sac', carencia_ate = date '2026-01-31', tipo_taxa = 'pre', numero_contrato = 'SINT-9123' where id = fin;
  update financeiro_lancamentos_v2 set valor = 1000 where id = le;
  update financiamento_liberacoes set lancamento_id = le where financiamento_id = fin and lancamento_id is null and id <> l1;
  update financiamento_liberacoes set valor = 0.01 where financiamento_id = fin and id <> l1;
  update financiamento_liberacoes set cancelado_em = now(), cancelado_motivo = 'teste' where financiamento_id = fin and id <> l1;
  insert into financiamento_documentos (cliente_id, financiamento_id, especie, nome, storage_path) values (k, fin, 'cedula', 'SINT cedula.pdf', 'x');
  r := public.fn_contrato_tela(fin, date '2026-06-01');
  IF jsonb_array_length(r -> 'a_resolver') <> 0 THEN RAISE EXCEPTION 'V5: %', r -> 'a_resolver'; END IF;
  /* V6 */
  IF has_function_privilege('anon', 'public.fn_contrato_tela(uuid, date)', 'execute') THEN RAISE EXCEPTION 'V6 anon'; END IF;
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  BEGIN
    r := public.fn_contrato_tela(fin, null);
    RAISE EXCEPTION 'V6 tenant passou';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE EXCEPTION 'OK';
END $t$;
