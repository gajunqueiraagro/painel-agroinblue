-- PLANO-SUGESTAO-01 B1b (118480) — teste. Roda como postgres DEPOIS da migration; termina em RAISE 'OK…'; nada fica no banco.
-- Fixture SINTÉTICA: 1 titular produtor no cliente Teste (43f32d07). Notas reais só LIDAS: NF 210.789 do NJ (c5ef0962).
-- T1 a ajudante é INVOKER e fechada (anon/authenticated sem EXECUTE) · T2 usuário de OUTRO cliente chamando a ajudante direto = 42501 ·
-- T3 usuário de OUTRO cliente na sugestão e na regra de uma nota do NJ = 42501 · T4 o resultado não mudou (produtor = '1-Entradas',
-- outro = '2-Saídas') · T5 membro do NJ (role authenticated) segue lendo a sugestão da NF 210.789: '2-Saídas' e Implementos.
-- Mutações (voltam conferidas por md5 e privilégio): M1 ajudante de volta a SECDEF + EXECUTE para authenticated → T2 ·
-- M2 a sugestão sem o tenant_ok → T3.

do $fx$
begin
  insert into public.fiscal_titulares (cliente_id, nome, documento, papel)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', 'SINT PS01B PRODUTOR', '11222333000181', 'produtor');
end $fx$;

create or replace function pg_temp.checa() returns text[] language plpgsql as $c$
declare
  f text[] := '{}'; v_fora uuid; v_membro uuid; v_estado text; j jsonb; v_item uuid;
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_nota constant uuid := 'c5ef0962-ef89-442a-854c-44d9c9dc8b08';
begin
  -- T1
  if (select prosecdef from pg_proc where oid = 'public._fn_nota_tipo_operacao(uuid,text)'::regprocedure)
     or has_function_privilege('anon', 'public._fn_nota_tipo_operacao(uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public._fn_nota_tipo_operacao(uuid,text)', 'execute') then
    f := f || 'T1 a ajudante não está INVOKER e fechada'::text;
  end if;
  -- T4 (como postgres)
  if public._fn_nota_tipo_operacao('43f32d07-dba8-4670-900c-bf645440c04a', '11.222.333/0001-81') <> '1-Entradas'
     or public._fn_nota_tipo_operacao('43f32d07-dba8-4670-900c-bf645440c04a', '11444777000161') <> '2-Saídas' then
    f := f || 'T4 o resultado mudou'::text;
  end if;

  select m.user_id into v_fora from public.cliente_membros m
   where m.ativo and m.perfil <> 'admin_agroinblue'
     and m.user_id not in (select user_id from public.cliente_membros where cliente_id = c_nj or perfil = 'admin_agroinblue')
     and m.user_id not in (select user_id from public.admin_agroinblue)
   limit 1;
  select m.user_id into v_membro from public.cliente_membros m
   where m.ativo and m.cliente_id = c_nj and m.user_id not in (select user_id from public.admin_agroinblue) limit 1;
  select i.id into v_item from public.nota_fiscal_itens i where i.nota_id = c_nota and i.n_item = 1;
  if v_fora is null or v_membro is null or v_item is null then return f || 'FIXTURE sem usuário de fora, membro do NJ ou item'::text; end if;

  -- T2 + T3: o usuário de fora
  perform set_config('request.jwt.claims', json_build_object('sub', v_fora, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform public._fn_nota_tipo_operacao(c_nj, '00000000000000'); v_estado := 'executou';
  exception when others then v_estado := sqlstate; end;
  if v_estado <> '42501' then f := f || ('T2 a ajudante aceitou o usuário de fora: ' || v_estado); end if;
  begin perform public.fn_nota_itens_sugerir_conta(c_nota); v_estado := 'leu';
  exception when others then v_estado := sqlstate; end;
  if v_estado <> '42501' then f := f || ('T3 a sugestão leu a nota do NJ: ' || v_estado); end if;
  begin perform public.fn_item_regra_gravar(v_item, 'fb52ef42-b147-41df-a601-e7167ed9270c', 'teste B1b', true); v_estado := 'previu';
  exception when others then v_estado := sqlstate; end;
  if v_estado <> '42501' then f := f || ('T3 a regra aceitou a nota do NJ: ' || v_estado); end if;
  execute 'reset role';

  -- T5: membro do NJ, como authenticated
  perform set_config('request.jwt.claims', json_build_object('sub', v_membro, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin j := public.fn_nota_itens_sugerir_conta(c_nota); v_estado := 'ok';
  exception when others then v_estado := sqlstate || ' ' || sqlerrm; end;
  execute 'reset role';
  if v_estado <> 'ok' or j->>'tipo_operacao' <> '2-Saídas'
     or exists (select 1 from jsonb_array_elements(j->'itens') e where e->>'subcentro' is distinct from 'Investimento em Implementos Agricultura') then
    f := f || ('T5 o membro do NJ não leu como antes: ' || v_estado || ' ' || coalesce(left(j::text, 300), ''));
  end if;
  return f;
end $c$;

do $t$
declare f text[]; v_def text; v_md5 text; v_ok text := ''; v_aj text := 'public._fn_nota_tipo_operacao(uuid,text)';
begin
  f := pg_temp.checa();
  if cardinality(f) > 0 then raise exception 'FALHAS: %', f; end if;
  v_ok := 'T1–T5 ok; ';

  -- M1: a ajudante volta a SECDEF e aberta a authenticated → T2 (e T1) caem
  v_def := pg_get_functiondef(v_aj::regprocedure); v_md5 := md5(v_def);
  execute replace(v_def, 'STABLE', 'STABLE SECURITY DEFINER');
  execute 'grant execute on function public._fn_nota_tipo_operacao(uuid, text) to authenticated';
  f := pg_temp.checa();
  execute v_def;
  execute 'revoke all on function public._fn_nota_tipo_operacao(uuid, text) from public, anon, authenticated';
  if md5(pg_get_functiondef(v_aj::regprocedure)) <> v_md5 or has_function_privilege('authenticated', v_aj, 'execute') then
    raise exception 'M1 a ajudante não voltou';
  end if;
  if not exists (select 1 from unnest(f) u where u like 'T2 %') then raise exception 'M1 NÃO derrubou T2: %', f; end if;
  v_ok := v_ok || 'M1→T2 ';

  -- M2: a sugestão sem o tenant_ok → T3 cai
  v_def := pg_get_functiondef('public.fn_nota_itens_sugerir_conta(uuid)'::regprocedure); v_md5 := md5(v_def);
  if position('if n.id is null or not coalesce(public.tenant_ok(n.cliente_id), false) then' in v_def) = 0 then raise exception 'M2 âncora'; end if;
  execute replace(v_def, 'if n.id is null or not coalesce(public.tenant_ok(n.cliente_id), false) then', 'if n.id is null then');
  f := pg_temp.checa();
  execute v_def;
  if md5(pg_get_functiondef('public.fn_nota_itens_sugerir_conta(uuid)'::regprocedure)) <> v_md5 then raise exception 'M2 a função não voltou'; end if;
  if not exists (select 1 from unnest(f) u where u like 'T3 a sugestão%') then raise exception 'M2 NÃO derrubou T3: %', f; end if;
  v_ok := v_ok || 'M2→T3 ';

  raise exception 'OK PLANO-SUGESTAO-01 B1b: % (nada gravado)', v_ok;
end $t$;
