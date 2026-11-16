-- OPENFINANCE-P3a · teste (roda como postgres; termina em RAISE 'OK…'; nada fica no banco). Fixture sintético no cliente Teste.
do $$
declare
  A uuid := '43f32d07-dba8-4670-900c-bf645440c04a';         -- cliente Teste
  B uuid := (select id from clientes where id <> '43f32d07-dba8-4670-900c-bf645440c04a' order by id limit 1);
  U uuid := gen_random_uuid();
  r jsonb; n int; ok boolean;
  contas2 jsonb := '[{"account_id":"acc-1","tipo":"BANK","subtipo":"CHECKING_ACCOUNT","final4":"1234","rotulo":"Itaú · Conta corrente · 1234"},
                     {"account_id":"acc-2","tipo":"CREDIT","subtipo":"CREDIT_CARD","final4":"9876","rotulo":"Itaú · Cartão · 9876"}]';
begin
  perform _fn_openfinance_evento_registrar(jsonb_build_object('origem','pluggy_webhook','evento','item/created','event_id','t-p3a-1',
    'item_id','item-t','client_user_id', A::text));

  -- T1 prévia não grava
  r := _fn_openfinance_contas_gravar(A, 'item-t', contas2, U, true);
  if (r->>'ligar')::int <> 2 or exists (select 1 from openfinance_contas_permitidas where item_id = 'item-t') then raise exception 'T1 %', r; end if;
  -- T2 grava as 2 + trilha
  r := _fn_openfinance_contas_gravar(A, 'item-t', contas2, U, false);
  select count(*) into n from openfinance_contas_permitidas where item_id = 'item-t' and ativo;
  if n <> 2 or not exists (select 1 from openfinance_eventos where evento = 'agroinblue/contas_permitidas' and item_id = 'item-t') then raise exception 'T2 %', r; end if;
  -- T3 a pergunta da P3: marcada = o cliente; não marcada = nulo
  if _fn_openfinance_conta_permitida('item-t', 'acc-1') is distinct from A or _fn_openfinance_conta_permitida('item-t', 'acc-x') is not null then raise exception 'T3'; end if;
  -- T4 desmarcar acc-2: desliga (não apaga), mantém acc-1
  r := _fn_openfinance_contas_gravar(A, 'item-t', jsonb_build_array(contas2->0), U, false);
  if (r->>'desligar')::int <> 1 or (r->>'manter')::int <> 1 or _fn_openfinance_conta_permitida('item-t', 'acc-2') is not null
     or not exists (select 1 from openfinance_contas_permitidas where account_id = 'acc-2' and not ativo and desligado_por = U) then raise exception 'T4 %', r; end if;
  -- T5 outro cliente não grava no item de A
  ok := false; begin perform _fn_openfinance_contas_gravar(B, 'item-t', contas2, U, false); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T5'; end if;
  -- T6 item sem item/created com cliente: recusa
  ok := false; begin perform _fn_openfinance_contas_gravar(A, 'item-desconhecido', contas2, U, false); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T6'; end if;
  -- T7 conta repetida / tipo inválido
  ok := false; begin perform _fn_openfinance_contas_gravar(A, 'item-t', contas2 || jsonb_build_array(contas2->0), U, false); exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception 'T7a'; end if;
  ok := false; begin perform _fn_openfinance_contas_gravar(A, 'item-t', '[{"account_id":"z","tipo":"OUTRO","rotulo":"x"}]', U, false); exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception 'T7b'; end if;
  -- T8 a mesma conta da Pluggy não liga em outra conexão
  perform _fn_openfinance_evento_registrar(jsonb_build_object('origem','pluggy_webhook','evento','item/created','event_id','t-p3a-2',
    'item_id','item-t2','client_user_id', A::text));
  ok := false; begin perform _fn_openfinance_contas_gravar(A, 'item-t2', jsonb_build_array(contas2->0), U, false); exception when sqlstate '23505' then ok := true; end;
  if not ok then raise exception 'T8'; end if;
  -- T9 portas fechadas: authenticated não executa as internas nem escreve na tabela
  if has_function_privilege('authenticated', '_fn_openfinance_contas_gravar(uuid,text,jsonb,uuid,boolean)', 'execute')
     or has_function_privilege('authenticated', '_fn_openfinance_conta_permitida(text,text)', 'execute')
     or has_table_privilege('authenticated', 'openfinance_contas_permitidas', 'insert')
     or has_table_privilege('anon', 'openfinance_contas_permitidas', 'select') then raise exception 'T9'; end if;
  raise exception 'OK OPENFINANCE-P3a T1–T9';
end $$;
