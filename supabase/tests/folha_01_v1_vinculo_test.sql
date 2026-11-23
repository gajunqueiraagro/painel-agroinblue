-- FOLHA-01 · teste do V1 (118400). Roda como postgres DEPOIS da 118400; termina em RAISE 'OK…'; nada fica no banco.
-- Fixture no cliente Teste (43f32d07) com nome inventado; o "outro cliente" é um funcionário real do NJ, só lido (nunca gravado).
do $t$
declare
  T uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; ADM uuid; L uuid; fa uuid; fo uuid; la uuid; r jsonb; ok boolean;
begin
  select user_id into ADM from cliente_membros where perfil = 'admin_agroinblue' and ativo order by user_id limit 1;
  select m.user_id into L from cliente_membros m where m.ativo and m.perfil <> 'admin_agroinblue' and m.cliente_id <> T
     and not exists (select 1 from cliente_membros a where a.user_id = m.user_id and (a.perfil = 'admin_agroinblue' or a.cliente_id = T)) order by m.user_id limit 1;
  select id into fo from folha_funcionarios where cliente_id <> T order by id limit 1;
  select id into la from financeiro_lancamentos_v2 where cliente_id = T and not coalesce(cancelado, false) order by id limit 1;
  if ADM is null or L is null or fo is null or la is null then raise exception 'sem fixture'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);
  fa := (fn_folha_funcionario_gravar(T, '{"nome":"Fulano Teste Vinculo"}', false)->>'id')::uuid;

  -- V1a prévia não grava
  r := fn_lancamento_funcionario_ligar(array[la], fa, 'teste', true);
  if (r->>'mudam')::int <> 1 or (select funcionario_id from financeiro_lancamentos_v2 where id = la) is not null then raise exception 'V1a %', r; end if;
  -- V1b liga, com trilha
  r := fn_lancamento_funcionario_ligar(array[la], fa, 'teste', false);
  if (select funcionario_id from financeiro_lancamentos_v2 where id = la) is distinct from fa then raise exception 'V1b %', r; end if;
  if not exists (select 1 from audit_log where registro_id = la and via = 'folha-vinculo') then raise exception 'V1b trilha'; end if;
  -- V1c funcionário de outro cliente pela função: recusa
  ok := false; begin perform fn_lancamento_funcionario_ligar(array[la], fo, 'x', false); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'V1c (ligou funcionário de outro cliente pela função)'; end if;
  -- V1d o mesmo por UPDATE direto: o gatilho recusa
  ok := false; begin update financeiro_lancamentos_v2 set funcionario_id = fo where id = la; exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'V1d (o gatilho deixou ligar funcionário de outro cliente)'; end if;
  -- V1e sem acesso à folha deste cliente: recusa
  perform set_config('request.jwt.claims', json_build_object('sub', L, 'role', 'authenticated')::text, true);
  ok := false; begin perform fn_lancamento_funcionario_ligar(array[la], null, 'x', false); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'V1e (sem acesso desligou)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);
  -- V1f desligar (null) volta ao vazio
  perform fn_lancamento_funcionario_ligar(array[la], null, 'teste', false);
  if (select funcionario_id from financeiro_lancamentos_v2 where id = la) is not null then raise exception 'V1f'; end if;
  -- V1g fechada para anon; o gatilho não abre para authenticated
  if has_function_privilege('anon', 'public.fn_lancamento_funcionario_ligar(uuid[],uuid,text,boolean)', 'execute')
     or has_function_privilege('authenticated', 'public._fn_trg_lancamento_funcionario_cliente()', 'execute') then raise exception 'V1g'; end if;
  raise exception 'OK FOLHA-01 V1: V1a–V1g (nada gravado)';
end $t$;
