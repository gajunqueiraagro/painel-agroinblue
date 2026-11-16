-- OPENFINANCE-PILOTO-01 · P2 — teste da 118120 (a fila de avisos da Pluggy). Roda como postgres; papéis por `set local role` + claims de
-- usuário real; fixture SINTÉTICO (o cliente Teste 43f32d07 como clientUserId). Termina em RAISE 'OK…' (nada fica no banco).
do $$
declare
  c_teste constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  u_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  u_fora constant uuid := '2963b113-e61e-4764-93aa-22ee9711db44';
  r jsonb; n int;
begin
  -- T1 permissões: anon/authenticated não chamam a interna nem escrevem; a service_role chama
  if has_function_privilege('anon', 'public._fn_openfinance_evento_registrar(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public._fn_openfinance_evento_registrar(jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public._fn_openfinance_evento_registrar(jsonb)', 'execute')
     or has_table_privilege('authenticated', 'public.openfinance_eventos', 'insert')
     or has_table_privilege('anon', 'public.openfinance_eventos', 'select') then
    raise exception 'T1 permissões erradas';
  end if;

  -- T2 item/created com o cliente no clientUserId: liga o cliente; a reentrega (mesmo eventId) não duplica
  execute 'set local role service_role';
  r := public._fn_openfinance_evento_registrar(jsonb_build_object('origem', 'pluggy_webhook', 'evento', 'item/created', 'event_id', 'ev-sint-1',
    'item_id', 'item-sint-1', 'client_user_id', c_teste::text, 'triggered_by', 'USER', 'ip', '52.67.145.81'));
  if not (r->>'novo')::boolean or r->>'cliente_id' <> c_teste::text then raise exception 'T2: %', r; end if;
  r := public._fn_openfinance_evento_registrar(jsonb_build_object('origem', 'pluggy_webhook', 'evento', 'item/created', 'event_id', 'ev-sint-1',
    'item_id', 'item-sint-1', 'client_user_id', c_teste::text));
  if (r->>'novo')::boolean then raise exception 'T2 a reentrega duplicou: %', r; end if;

  -- T3 transactions/created sem clientUserId: cliente nulo, a contagem guardada
  r := public._fn_openfinance_evento_registrar(jsonb_build_object('origem', 'pluggy_webhook', 'evento', 'transactions/created', 'event_id', 'ev-sint-2',
    'item_id', 'item-sint-1', 'account_id', 'conta-sint-1', 'n_transacoes', 5));
  if r->>'cliente_id' is not null then raise exception 'T3 cliente sem clientUserId: %', r; end if;

  -- T4 aviso inválido (evento fora do formato, origem desconhecida): 22023, nada gravado
  begin perform public._fn_openfinance_evento_registrar(jsonb_build_object('origem', 'pluggy_webhook', 'evento', 'DROP TABLE')); raise exception 'T4 evento';
  exception when invalid_parameter_value then null; end;
  begin perform public._fn_openfinance_evento_registrar(jsonb_build_object('origem', 'outra', 'evento', 'item/created')); raise exception 'T4 origem';
  exception when invalid_parameter_value then null; end;
  -- T5 a Pluggy não fala em nome do AgroinBlue (e vice-versa): origem × evento conferidos (23514)
  begin perform public._fn_openfinance_evento_registrar(jsonb_build_object('origem', 'pluggy_webhook', 'evento', 'agroinblue/connect_token')); raise exception 'T5 pluggy como agroinblue';
  exception when check_violation then null; end;
  r := public._fn_openfinance_evento_registrar(jsonb_build_object('origem', 'agroinblue', 'evento', 'agroinblue/connect_token',
    'client_user_id', c_teste::text, 'autor', u_admin::text));
  -- T6 clientUserId que não é cliente (texto qualquer; uuid que não existe): cliente nulo, sem erro
  r := public._fn_openfinance_evento_registrar(jsonb_build_object('origem', 'pluggy_webhook', 'evento', 'item/updated', 'client_user_id', 'outra-coisa'));
  if r->>'cliente_id' is not null then raise exception 'T6 texto: %', r; end if;
  r := public._fn_openfinance_evento_registrar(jsonb_build_object('origem', 'pluggy_webhook', 'evento', 'item/updated', 'client_user_id', gen_random_uuid()::text));
  if r->>'cliente_id' is not null then raise exception 'T6 uuid: %', r; end if;
  execute 'reset role';
  select count(*) into n from openfinance_eventos where item_id = 'item-sint-1';
  if n <> 2 then raise exception 'T2/T3 linhas do item = %', n; end if;
  perform 1 from openfinance_eventos where evento = 'agroinblue/connect_token' and autor = u_admin and cliente_id = c_teste;
  if not found then raise exception 'T5 a trilha do connect token'; end if;

  -- T7 RLS: quem não é admin não vê nada; o admin vê
  perform set_config('request.jwt.claims', json_build_object('sub', u_fora, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from openfinance_eventos;
  if n <> 0 then raise exception 'T7 não admin vê % aviso(s)', n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  select count(*) into n from openfinance_eventos where item_id = 'item-sint-1';
  if n <> 2 then raise exception 'T7 o admin vê %', n; end if;
  execute 'reset role';

  raise exception 'OK OPENFINANCE-P2 T1–T7: permissões, item/created com cliente, reentrega, transactions/created, inválidos, origem × evento, clientUserId que não é cliente, RLS';
end $$;
