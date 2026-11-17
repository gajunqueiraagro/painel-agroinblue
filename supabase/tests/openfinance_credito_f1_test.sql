-- OPENFINANCE-FINANCIAMENTOS-01 · F1 — teste da 118170. Roda como postgres, fixture SINTÉTICO no cliente Teste (43f32d07), termina
-- em RAISE 'OK…' (nada fica no banco). As funções da tela leem auth.uid() dos claims: o admin e um membro de OUTRO cliente.
do $$
declare
  c_teste constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  u_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  u_fora  constant uuid := '0e422659-9272-4ece-aee8-20e59ca75c8d';   -- membro ativo de outro cliente, não admin
  v_fin uuid; v_fin2 uuid; v_fin_outro uuid; r jsonb; n int; e text;
  loan jsonb := jsonb_build_object(
    'id', 'loan-t1', 'kind', 'FINANCING', 'type', 'CUSTEIO', 'productName', 'Custeio', 'contractNumber', '40/01234-5',
    'contractDate', '2025-04-15T00:00:00Z', 'dueDate', '2027-04-05T00:00:00Z', 'contractAmount', 800000, 'CET', 0.0861,
    'amortizationScheduled', 'WITHOUT_AMORTIZATION_SYSTEM', 'installmentPeriodicity', 'YEARLY',
    'interestRates', jsonb_build_array(jsonb_build_object('taxPeriodicity', 'YEARLY', 'preFixedRate', 0.08)),
    'installments', jsonb_build_object('totalNumberOfInstallments', 2, 'paidInstallments', 1, 'dueInstallments', 1, 'pastDueInstallments', 0,
      'balloonPayments', jsonb_build_array(
        jsonb_build_object('dueDate', '2026-04-05', 'amount', jsonb_build_object('value', 432000, 'currencyCode', 'BRL')),
        jsonb_build_object('dueDate', '2027-04-05', 'amount', jsonb_build_object('value', 433600, 'currencyCode', 'BRL')))),
    'payments', jsonb_build_object('contractOutstandingBalance', 431885.20,
      'releases', jsonb_build_array(jsonb_build_object('paidDate', '2026-04-05', 'paidAmount', 432000, 'isOverParcelPayment', false),
                                    jsonb_build_object('paidDate', '2025-10-01', 'paidAmount', 999.99, 'isOverParcelPayment', true))));
begin
  set local statement_timeout = '8s';
  -- fixture: o item chega pelo webhook (item/created com o nosso clientUserId) e um contrato do sistema com o mesmo nº
  insert into openfinance_eventos (origem, evento, item_id, cliente_id) values ('pluggy_webhook', 'item/created', 'item-t1', c_teste);
  insert into financiamentos (cliente_id, descricao, natureza, status, numero_contrato, valor_total, data_contrato, total_parcelas, taxa_juros)
  values (c_teste, 'TESTE F1 custeio', 'financiamento', 'ativo', '40.01234-5', 800000, '2025-04-15', 2, 0) returning id into v_fin;
  insert into financiamento_liberacoes (cliente_id, financiamento_id, data, valor, forma) values (c_teste, v_fin, '2025-04-15', 800000, 'conta');
  insert into financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento, valor_principal, valor_juros, valor_total, status, data_pagamento)
  values (v_fin, c_teste, 1, '2026-04-05', 400000, 32000, 432000, 'pago', '2026-04-05'),
         (v_fin, c_teste, 2, '2027-04-05', 400000, 32000, 432000, 'pendente', null);
  insert into financiamentos (cliente_id, descricao, natureza, status, numero_contrato, valor_total)
  values (c_teste, 'TESTE F1 outro', 'financiamento', 'ativo', '99/99999-9', 1000) returning id into v_fin2;
  select id into v_fin_outro from financiamentos where cliente_id <> c_teste limit 1;

  -- T1 conexão de item que não chegou para este cliente = 42501
  begin
    perform _fn_openfinance_conexao_registrar(c_teste, 'item-de-outro', 1, 'Banco', 'PF', '{ACCOUNTS}', '{}', now(), null, null, u_admin);
    raise exception 'T1 FALHOU: registrou conexão sem o item/created';
  exception when insufficient_privilege then null; end;
  -- T2 conexão sem LOANS: o crédito é recusado
  r := _fn_openfinance_conexao_registrar(c_teste, 'item-t1', 1, 'Banco A', 'PF', '{ACCOUNTS,TRANSACTIONS}', '{}', now(), null, null, u_admin);
  if not (r ->> 'novo')::boolean then raise exception 'T2 FALHOU: %', r; end if;
  begin
    perform _fn_openfinance_credito_registrar('item-t1', loan, u_admin);
    raise exception 'T2 FALHOU: gravou crédito sem LOANS';
  exception when insufficient_privilege then null; end;
  -- T3 com LOANS: grava; a mesma foto não repete; foto diferente acrescenta
  perform _fn_openfinance_conexao_registrar(c_teste, 'item-t1', 1, 'Banco A', 'PF', '{ACCOUNTS,TRANSACTIONS,LOANS}', '{CREDIT_OPERATIONS_ALL}', now(), null, null, u_admin);
  r := _fn_openfinance_credito_registrar('item-t1', loan, u_admin);
  if not (r ->> 'novo')::boolean then raise exception 'T3 FALHOU (1ª): %', r; end if;
  r := _fn_openfinance_credito_registrar('item-t1', loan, u_admin);
  if (r ->> 'novo')::boolean then raise exception 'T3 FALHOU: a mesma foto repetiu'; end if;
  r := _fn_openfinance_credito_registrar('item-t1', loan || jsonb_build_object('CET', 0.0862), u_admin);
  select count(*) into n from openfinance_credito_retratos where loan_id = 'loan-t1';
  if n <> 2 then raise exception 'T3 FALHOU: % retratos', n; end if;
  select count(*) into n from openfinance_credito_contratos where loan_id = 'loan-t1' and not conferir and financiamento_id is null;
  if n <> 1 then raise exception 'T3 FALHOU: o contrato do banco não nasceu desmarcado'; end if;
  -- T4 retrato é append-only
  begin update openfinance_credito_retratos set para_quitar = 0 where loan_id = 'loan-t1'; raise exception 'T4 FALHOU: update';
  exception when insufficient_privilege then null; end;
  begin delete from openfinance_credito_retratos where loan_id = 'loan-t1'; raise exception 'T4 FALHOU: delete';
  exception when insufficient_privilege then null; end;

  -- T5 marcar: membro de outro cliente = 42501; admin simular não grava; admin grava e casa PELO Nº ("40/01234-5" = "40.01234-5")
  perform set_config('request.jwt.claims', json_build_object('sub', u_fora, 'role', 'authenticated')::text, true);
  begin perform fn_openfinance_credito_marcar(c_teste, '{loan-t1}', true, true); raise exception 'T5 FALHOU: marcou sem ser admin';
  exception when insufficient_privilege then null; end;
  begin perform fn_openfinance_credito_conferencia(v_fin); raise exception 'T5 FALHOU: outro cliente leu a conferência';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  r := fn_openfinance_credito_marcar(c_teste, '{loan-t1}', true, true);
  if jsonb_array_length(r -> 'casados_pelo_numero') <> 1 then raise exception 'T5 FALHOU (prévia): %', r; end if;
  select count(*) into n from openfinance_credito_contratos where loan_id = 'loan-t1' and (conferir or financiamento_id is not null);
  if n <> 0 then raise exception 'T5 FALHOU: a prévia gravou'; end if;
  r := fn_openfinance_credito_marcar(c_teste, '{loan-t1}', true, false);
  select count(*) into n from openfinance_credito_contratos where loan_id = 'loan-t1' and conferir and financiamento_id = v_fin and casado_por = 'numero';
  if n <> 1 then raise exception 'T5 FALHOU: não casou pelo nº'; end if;
  begin perform fn_openfinance_credito_marcar(c_teste, '{loan-que-nao-existe}', true, true); raise exception 'T5 FALHOU: loan alheio';
  exception when insufficient_privilege then null; end;

  -- T6 casar: contrato de outro cliente = 42501; o mesmo contrato do sistema com 2 do banco = 23505
  if v_fin_outro is not null then
    begin perform fn_openfinance_credito_casar(c_teste, 'loan-t1', v_fin_outro, true); raise exception 'T6 FALHOU: casou com outro cliente';
    exception when insufficient_privilege then null; end;
  end if;
  perform _fn_openfinance_credito_registrar('item-t1', loan || jsonb_build_object('id', 'loan-t2', 'contractNumber', null), u_admin);
  begin perform fn_openfinance_credito_casar(c_teste, 'loan-t2', v_fin, false); raise exception 'T6 FALHOU: dois do banco no mesmo contrato';
  exception when unique_violation then null; end;
  r := fn_openfinance_credito_casar(c_teste, 'loan-t2', v_fin2, true);
  if (r ->> 'simulado')::boolean is not true or exists (select 1 from openfinance_credito_contratos where loan_id = 'loan-t2' and financiamento_id is not null) then
    raise exception 'T6 FALHOU: a prévia do casar gravou';
  end if;

  -- T7 a conferência (régua no banco): nº confere; finalidade/taxa/sistema/periodicidade/vencimento vazios no sistema; saldo só juros
  -- corridos (M2); balão 2/2 com valor diferente; o pagamento avulso do banco sem parcela
  r := fn_openfinance_credito_conferencia(v_fin);
  select string_agg((c ->> 'campo') || '=' || (c ->> 'situacao'), ' ' order by c ->> 'campo') into e from jsonb_array_elements(r -> 'campos') c;
  if e <> 'data_contrato=confere finalidade=vazio_no_sistema numero_contrato=confere parcelas_pagas=confere parcelas_vencidas=confere '
          'periodicidade=vazio_no_sistema saldo_devedor=diferente_juros sistema_amortizacao=vazio_no_sistema taxa_aa=vazio_no_sistema '
          'valor_contratado=confere vencimento_final=vazio_no_sistema' then
    raise exception 'T7 FALHOU (campos): %', e;
  end if;
  if (r -> 'campos') @> '[{"campo":"sistema_amortizacao","banco":"livre"}]' is not true
     or (r -> 'campos') @> '[{"campo":"finalidade","banco":"custeio"}]' is not true
     or (r -> 'campos') @> '[{"campo":"taxa_aa","banco":8.0000}]' is not true then
    raise exception 'T7 FALHOU (tradução): %', r -> 'campos';
  end if;
  select string_agg((p ->> 'parcela') || '=' || (p ->> 'situacao'), ' ' order by (p ->> 'parcela')::int) into e from jsonb_array_elements(r -> 'parcelas') p;
  if e <> '1=pago_confere 2=valor_diferente' then raise exception 'T7 FALHOU (parcelas): %', e; end if;
  if jsonb_array_length(r -> 'pagamentos_sem_parcela') <> 1 or (r ->> 'pendencias')::int <> 2 then
    raise exception 'T7 FALHOU (pagamento sem parcela / pendências): %', r;
  end if;
  -- T8 contrato não marcado: "sem banco" (D5)
  r := fn_openfinance_credito_conferencia(v_fin2);
  if (r ->> 'tem_banco')::boolean then raise exception 'T8 FALHOU: contrato sem marca mostrou o banco'; end if;

  raise exception 'OK OPENFINANCE-FIN F1: T1–T8 (conexão só do item/created; sem LOANS recusa; retrato sem repetir e append-only; marcar só admin, prévia não grava, casa pelo nº; casar recusa outro cliente e 2 do banco; régua confere/vazio/diferente_juros/valor_diferente; não marcado = sem banco)';
end $$;
