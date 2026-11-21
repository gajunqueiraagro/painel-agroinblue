-- OPENFINANCE-CLIENTE-01 · teste (roda como postgres; termina em RAISE 'OK…'; nada fica no banco). Fixture sintético no cliente Teste;
-- T10 usa um gestor real (não admin, de 1 cliente) só para LER com a RLS, numa linha sintética que o RAISE desfaz.
do $$
declare
  A uuid := '43f32d07-dba8-4670-900c-bf645440c04a';   -- cliente Teste
  B uuid;                                              -- outro cliente
  U uuid := gen_random_uuid();
  G uuid; GC uuid;                                     -- o gestor real e o cliente dele
  h1 text := md5('c01-a') || md5('c01-b'); h2 text := md5('c01-c') || md5('c01-d'); h3 text := md5('c01-e') || md5('c01-f');
  m text; r jsonb; ok boolean; n int; c1 uuid; c2 uuid; c3 uuid;
begin
  select id into B from clientes where id <> A order by id limit 1;
  select texto_md5 into m from openfinance_termo_versoes where versao = 1;
  -- T1 o termo v1 existe e o md5 é o do texto
  if m is null or m <> (select md5(texto) from openfinance_termo_versoes where versao = 1) then raise exception 'T1'; end if;

  -- T2 aceite: md5 errado recusa; o certo grava "pelo sistema" com trilha
  ok := false; begin perform _fn_openfinance_termo_aceitar(A, 1, md5('outro'), U, null); exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception 'T2a'; end if;
  r := _fn_openfinance_termo_aceitar(A, 1, m, U, null);
  if (select via from openfinance_termos_aceites where id = (r->>'id')::uuid) <> 'sistema'
     or not exists (select 1 from openfinance_eventos where evento = 'agroinblue/termo_aceito' and autor = U) then raise exception 'T2b %', r; end if;
  -- T3 autor E link juntos (ou nenhum) = inválido
  ok := false; begin perform _fn_openfinance_termo_aceitar(A, 1, m, null, null); exception when sqlstate '22023' then ok := true; end;
  if not ok then raise exception 'T3'; end if;

  -- T4 gerar: a prévia não grava; gerar grava 24 h; gerar de novo revoga o vivo
  r := _fn_openfinance_convite_gerar(A, h1, U, true);
  if exists (select 1 from openfinance_convites where token_hash = h1) or (r->>'revoga')::int <> 0 then raise exception 'T4a %', r; end if;
  r := _fn_openfinance_convite_gerar(A, h1, U, false); c1 := (r->>'id')::uuid;
  if (select expira_em - criado_em from openfinance_convites where id = c1) <> interval '24 hours' then raise exception 'T4b'; end if;
  r := _fn_openfinance_convite_gerar(A, h2, U, false); c2 := (r->>'id')::uuid;
  if (select revogado_em from openfinance_convites where id = c1) is null or (r->>'revoga')::int <> 1 then raise exception 'T4c %', r; end if;

  -- T5 abrir: o revogado e o desconhecido recusam IGUAL; o vivo abre com o nome curto; contar até 10, a 11ª recusa
  ok := false; begin perform _fn_openfinance_convite_abrir(h1, false); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T5a'; end if;
  ok := false; begin perform _fn_openfinance_convite_abrir(md5('x') || md5('y'), false); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T5b'; end if;
  r := _fn_openfinance_convite_abrir(h2, false);
  if (r->>'cliente_id')::uuid <> A or (r->>'nome') <> 'Teste C.' or (r->>'aberturas_restantes')::int <> 10 then raise exception 'T5c %', r; end if;
  for n in 1..10 loop r := _fn_openfinance_convite_abrir(h2, true); end loop;
  if (r->>'aberturas_restantes')::int <> 0 then raise exception 'T5d %', r; end if;
  ok := false; begin perform _fn_openfinance_convite_abrir(h2, true); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T5e'; end if;

  -- T6 vencido recusa
  r := _fn_openfinance_convite_gerar(A, h3, U, false); c3 := (r->>'id')::uuid;
  update openfinance_convites set criado_em = now() - interval '25 hours', expira_em = now() - interval '1 hour' where id = c3;
  ok := false; begin perform _fn_openfinance_convite_abrir(h3, false); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T6'; end if;
  update openfinance_convites set criado_em = now(), expira_em = now() + interval '24 hours' where id = c3;

  -- T7 concluir: sem o aviso do banco espera (55000); com o item/created deste cliente fica usado; depois não abre; repetir não duplica
  ok := false; begin perform _fn_openfinance_convite_concluir(h3, 'item-c01'); exception when sqlstate '55000' then ok := true; end;
  if not ok then raise exception 'T7a'; end if;
  perform _fn_openfinance_evento_registrar(jsonb_build_object('origem','pluggy_webhook','evento','item/created','event_id','t-c01-1',
    'item_id','item-c01-b','client_user_id', B::text));
  ok := false; begin perform _fn_openfinance_convite_concluir(h3, 'item-c01-b'); exception when sqlstate '55000' then ok := true; end;
  if not ok then raise exception 'T7b (item de outro cliente)'; end if;
  perform _fn_openfinance_evento_registrar(jsonb_build_object('origem','pluggy_webhook','evento','item/created','event_id','t-c01-2',
    'item_id','item-c01','client_user_id', A::text));
  r := _fn_openfinance_convite_concluir(h3, 'item-c01');
  if not (r->>'novo')::boolean or (select item_id from openfinance_convites where id = c3) <> 'item-c01' then raise exception 'T7c %', r; end if;
  ok := false; begin perform _fn_openfinance_convite_abrir(h3, false); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T7d'; end if;
  r := _fn_openfinance_convite_concluir(h3, 'item-c01');
  if (r->>'novo')::boolean then raise exception 'T7e %', r; end if;

  -- T8 aceite pelo link: grava "pelo link" sem autor; link de outro cliente recusa
  r := _fn_openfinance_termo_aceitar(A, 1, m, null, c3);
  if (select via from openfinance_termos_aceites where id = (r->>'id')::uuid) <> 'link' then raise exception 'T8a'; end if;
  ok := false; begin perform _fn_openfinance_termo_aceitar(B, 1, m, null, c3); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T8b'; end if;

  -- T9 revogar: de outro cliente recusa; o já revogado/usado não muda
  ok := false; begin perform _fn_openfinance_convite_revogar(B, c2, U); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'T9a'; end if;
  r := _fn_openfinance_convite_revogar(A, c3, U);
  if (r->>'mudou')::boolean then raise exception 'T9b %', r; end if;
  r := _fn_openfinance_convite_gerar(A, md5('c01-g') || md5('c01-h'), U, false);
  r := _fn_openfinance_convite_revogar(A, (r->>'id')::uuid, U);
  if not (r->>'mudou')::boolean then raise exception 'T9c %', r; end if;

  -- T10 a RLS nova dos eventos: o gestor real lê o aviso do cliente DELE, não o do Teste; não lê os links
  select m2.user_id, m2.cliente_id into G, GC from cliente_membros m2
   where m2.ativo and m2.perfil = 'gestor_cliente' and m2.cliente_id <> A
     and not exists (select 1 from cliente_membros a where a.user_id = m2.user_id and a.perfil = 'admin_agroinblue')
     and (select count(*) from cliente_membros x where x.user_id = m2.user_id and x.ativo) = 1
   order by m2.user_id limit 1;
  if G is null then raise exception 'T10: sem gestor para provar'; end if;
  perform _fn_openfinance_evento_registrar(jsonb_build_object('origem','pluggy_webhook','evento','item/created','event_id','t-c01-3',
    'item_id','item-c01-g','client_user_id', GC::text));
  perform set_config('request.jwt.claims', json_build_object('sub', G, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not exists (select 1 from openfinance_eventos where item_id = 'item-c01-g') then reset role; raise exception 'T10a'; end if;
  if exists (select 1 from openfinance_eventos where item_id = 'item-c01') then reset role; raise exception 'T10b'; end if;
  if exists (select 1 from openfinance_convites) then reset role; raise exception 'T10c'; end if;
  if exists (select 1 from openfinance_termos_aceites where cliente_id = A) then reset role; raise exception 'T10d'; end if;
  if not exists (select 1 from openfinance_termo_versoes where versao = 1) then reset role; raise exception 'T10e'; end if;
  reset role;

  -- T11 portas fechadas
  if has_function_privilege('authenticated', '_fn_openfinance_termo_aceitar(uuid,integer,text,uuid,uuid)', 'execute')
     or has_function_privilege('anon', '_fn_openfinance_convite_abrir(text,boolean)', 'execute')
     or has_function_privilege('authenticated', '_fn_openfinance_convite_gerar(uuid,text,uuid,boolean)', 'execute')
     or has_function_privilege('authenticated', '_fn_openfinance_convite_concluir(text,text)', 'execute')
     or has_function_privilege('authenticated', '_fn_openfinance_convite_revogar(uuid,uuid,uuid)', 'execute')
     or has_table_privilege('authenticated', 'openfinance_convites', 'insert')
     or has_table_privilege('authenticated', 'openfinance_termos_aceites', 'insert')
     or has_table_privilege('authenticated', 'openfinance_termo_versoes', 'update')
     or has_table_privilege('anon', 'openfinance_termo_versoes', 'select')
     or exists (select 1 from pg_class where oid in ('public.openfinance_convites'::regclass, 'public.openfinance_termos_aceites'::regclass,
                'public.openfinance_termo_versoes'::regclass) and not relrowsecurity)
     or (select bool_or(prosecdef) from pg_proc where proname like '\_fn\_openfinance\_convite\_%' or proname = '_fn_openfinance_termo_aceitar')
     then raise exception 'T11'; end if;
  raise exception 'OK OPENFINANCE-CLIENTE-01 T1–T11';
end $$;
