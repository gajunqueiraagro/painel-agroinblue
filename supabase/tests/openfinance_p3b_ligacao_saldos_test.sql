-- OPENFINANCE-P3b · teste (roda como postgres; termina em RAISE 'OK…'; nada fica no banco). Fixture sintético no cliente Teste.
do $$
declare
  A uuid := '43f32d07-dba8-4670-900c-bf645440c04a';         -- cliente Teste
  CC uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';        -- conta corrente do Teste
  B uuid; CB uuid; CARTAO uuid;
  U uuid := gen_random_uuid();
  pb uuid; pc uuid; pd uuid;
  r jsonb; n int; ok boolean;
begin
  select cliente_id, id into B, CB from financeiro_contas_bancarias where cliente_id <> A and tipo_conta = 'cc' and ativa order by id limit 1;
  insert into financeiro_contas_bancarias (cliente_id, nome_conta, tipo_conta, ativa) values (A, 'Cartão P3b', 'cartao', true) returning id into CARTAO;
  perform _fn_openfinance_evento_registrar(jsonb_build_object('origem','pluggy_webhook','evento','item/created','event_id','t-p3b-1',
    'item_id','item-p3b','client_user_id', A::text));
  perform _fn_openfinance_contas_gravar(A, 'item-p3b',
    '[{"account_id":"p3b-b","tipo":"BANK","final4":"1111","rotulo":"Itaú · Conta corrente · 1111"},
      {"account_id":"p3b-c","tipo":"CREDIT","final4":"2222","rotulo":"Itaú · Cartão · 2222"},
      {"account_id":"p3b-d","tipo":"BANK","final4":"3333","rotulo":"Itaú · Poupança · 3333"}]', U, false);
  select id into pb from openfinance_contas_permitidas where ativo and account_id = 'p3b-b';
  select id into pc from openfinance_contas_permitidas where ativo and account_id = 'p3b-c';
  select id into pd from openfinance_contas_permitidas where ativo and account_id = 'p3b-d';

  -- T1 prévia não grava
  r := _fn_openfinance_conta_ligar_sistema(A, pb, CC, U, true);
  if not (r->>'mudou')::boolean or (select conta_bancaria_id from openfinance_contas_permitidas where id = pb) is not null then raise exception 'T1 %', r; end if;
  -- T2 liga + trilha
  r := _fn_openfinance_conta_ligar_sistema(A, pb, CC, U, false);
  if (select conta_bancaria_id from openfinance_contas_permitidas where id = pb) is distinct from CC
     or not exists (select 1 from openfinance_eventos where evento = 'agroinblue/conta_ligada' and account_id = 'p3b-b' and autor = U) then raise exception 'T2 %', r; end if;
  -- T2b ligar de novo na mesma = nada muda, sem trilha nova
  r := _fn_openfinance_conta_ligar_sistema(A, pb, CC, U, false);
  select count(*) into n from openfinance_eventos where evento = 'agroinblue/conta_ligada' and account_id = 'p3b-b';
  if (r->>'mudou')::boolean or n <> 1 then raise exception 'T2b % %', r, n; end if;
  -- T3 conta do sistema de outro cliente
  ok := false; begin perform _fn_openfinance_conta_ligar_sistema(A, pd, CB, U, false); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T3'; end if;
  -- T4 a permitida não é do cliente pedido
  ok := false; begin perform _fn_openfinance_conta_ligar_sistema(B, pb, CB, U, false); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T4'; end if;
  -- T5 cartão da Pluggy não lança; conta do sistema que não é corrente não recebe
  ok := false; begin perform _fn_openfinance_conta_ligar_sistema(A, pc, CC, U, false); exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception 'T5a'; end if;
  ok := false; begin perform _fn_openfinance_conta_ligar_sistema(A, pd, CARTAO, U, false); exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception 'T5b'; end if;
  -- T6 uma conta do sistema recebe de UMA conta do banco
  ok := false; begin perform _fn_openfinance_conta_ligar_sistema(A, pd, CC, U, false); exception when sqlstate '23505' then ok := true; end;
  if not ok then raise exception 'T6'; end if;

  -- T7 saldo: grava; a mesma foto não repete; foto nova entra
  r := _fn_openfinance_saldo_registrar('item-p3b', 'p3b-b', 1234.567, '2026-11-16 18:00-03', U);
  if not (r->>'novo')::boolean or (select saldo from openfinance_saldos where id = (r->>'id')::uuid) <> 1234.57
     or (select conta_bancaria_id from openfinance_saldos where id = (r->>'id')::uuid) <> CC then raise exception 'T7a %', r; end if;
  r := _fn_openfinance_saldo_registrar('item-p3b', 'p3b-b', 1234.57, '2026-11-16 18:00-03', U);
  if (r->>'novo')::boolean then raise exception 'T7b %', r; end if;
  r := _fn_openfinance_saldo_registrar('item-p3b', 'p3b-b', 1000, '2026-11-16 19:00-03', U);
  select count(*) into n from openfinance_saldos where conta_bancaria_id = CC and lido_por = U;
  if not (r->>'novo')::boolean or n <> 2 then raise exception 'T7c % %', r, n; end if;
  -- T8 conta não permitida / permitida sem ligação
  ok := false; begin perform _fn_openfinance_saldo_registrar('item-p3b', 'p3b-x', 1, now(), U); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T8a'; end if;
  ok := false; begin perform _fn_openfinance_saldo_registrar('item-p3b', 'p3b-d', 1, now(), U); exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception 'T8b'; end if;
  -- T9 desligar a ligação (p_conta nulo): a permitida fica, o saldo para de entrar; o desmarcar da P3a também corta
  r := _fn_openfinance_conta_ligar_sistema(A, pb, null, U, false);
  if (select conta_bancaria_id from openfinance_contas_permitidas where id = pb) is not null then raise exception 'T9a %', r; end if;
  ok := false; begin perform _fn_openfinance_saldo_registrar('item-p3b', 'p3b-b', 1, now(), U); exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception 'T9b'; end if;
  perform _fn_openfinance_conta_ligar_sistema(A, pd, CC, U, false);       -- agora a conta do sistema está livre
  perform _fn_openfinance_contas_gravar(A, 'item-p3b', '[]', U, false);
  ok := false; begin perform _fn_openfinance_saldo_registrar('item-p3b', 'p3b-d', 1, now(), U); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T9c'; end if;
  -- T10 portas fechadas
  if has_function_privilege('authenticated', '_fn_openfinance_conta_ligar_sistema(uuid,uuid,uuid,uuid,boolean)', 'execute')
     or has_function_privilege('authenticated', '_fn_openfinance_saldo_registrar(text,text,numeric,timestamptz,uuid)', 'execute')
     or has_function_privilege('anon', '_fn_openfinance_saldo_registrar(text,text,numeric,timestamptz,uuid)', 'execute')
     or has_table_privilege('authenticated', 'openfinance_saldos', 'insert')
     or has_table_privilege('anon', 'openfinance_saldos', 'select')
     or not (select relrowsecurity from pg_class where oid = 'public.openfinance_saldos'::regclass)
     or (select bool_or(prosecdef) from pg_proc where proname in ('_fn_openfinance_conta_ligar_sistema', '_fn_openfinance_saldo_registrar'))
     then raise exception 'T10'; end if;
  raise exception 'OK OPENFINANCE-P3b T1–T10';
end $$;
