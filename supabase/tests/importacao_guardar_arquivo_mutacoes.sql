-- CONC-PAINEL-ARQUIVOS-01 (b) — as MUTAÇÕES do teste de `fn_importacao_guardar_arquivo`: o teste (o mesmo de
-- importacao_guardar_arquivo_test.sql, aqui como função) PASSA no corpo da migration (M0) e CAI em cada mutação; o corpo volta pelo md5.
-- Roda DEPOIS da migration 20261028115620, numa transação que TERMINA EM RAISE (nada fica gravado).
-- M1 sem a guarda do cliente (tenant_ok) → T5/T6 · M2 regrava por cima de outro caminho → T3 · M3 sem conferir a pasta → T4
-- M4 anon executa → T8
set local statement_timeout = '120s';
set local lock_timeout = '2s';

create function pg_temp.como(p_user uuid) returns void language sql as $f$
  select set_config('request.jwt.claims', case when p_user is null then '{"role":"authenticated"}'
                    else json_build_object('sub', p_user, 'role', 'authenticated')::text end, true) $f$;
create function pg_temp.ch(p_sql text) returns text language plpgsql as $f$
declare r text;
begin
  begin
    execute 'set local role authenticated';
    execute p_sql into r;
    execute 'reset role';
    return 'OK ' || coalesce(r, 'null');
  exception when others then
    execute 'reset role';
    return 'ERR ' || sqlstate || ' ' || sqlerrm;
  end;
end $f$;
/* o teste: 'PASSOU' ou o motivo da queda (montagem sintética própria a cada rodada; o subbloco desfaz) */
create function pg_temp.teste() returns text language plpgsql as $f$
declare
  c_t constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  ux constant uuid := '7fae9bea-286a-46e7-a109-8c7bbc8b5ed2';
  q constant text := $q$select public.fn_importacao_guardar_arquivo(%L, %L)::text$q$;
  conta uuid; i1 uuid; i2 uuid; cam1 text; cam2 text; r text; v text;
begin
  begin
    insert into financeiro_contas_bancarias (cliente_id, nome_conta, nome_exibicao, tipo_conta, ativa)
      values (c_t, 'SINT GUARDAR ARQ', 'SINT GUARDAR ARQ', 'cc', true) returning id into conta;
    insert into financeiro_importacoes_v2 (cliente_id, conta_bancaria_id, nome_arquivo, tipo_arquivo, status, total_linhas)
      values (c_t, conta, 'sint-set.ofx', 'OFX', 'processada', 3) returning id into i1;
    insert into financeiro_importacoes_v2 (cliente_id, conta_bancaria_id, nome_arquivo, tipo_arquivo, status, total_linhas)
      values (c_t, conta, 'sint-out.csv', 'CSV', 'processada', 2) returning id into i2;
    cam1 := c_t::text || '/importacoes/' || conta::text || '/' || i1::text || '.ofx';
    cam2 := c_t::text || '/importacoes/' || conta::text || '/' || i2::text || '.csv';
    perform pg_temp.como(adm);
    r := pg_temp.ch(format(q, i1, cam1));
    if r <> 'OK {"ok": true, "ja_guardado": false}' then raise exception 'T1: %', r; end if;
    r := pg_temp.ch(format(q, i1, cam1));
    if r <> 'OK {"ok": true, "ja_guardado": true}' then raise exception 'T2: %', r; end if;
    r := pg_temp.ch(format(q, i1, replace(cam1, '.ofx', '.csv')));
    if r not like 'ERR P0001 ja_guardado:%' then raise exception 'T3: %', r; end if;
    r := pg_temp.ch(format(q, i2, replace(cam2, c_t::text, c_nj::text)));
    if r not like 'ERR 22023 caminho_invalido:%' then raise exception 'T4 outro cliente: %', r; end if;
    r := pg_temp.ch(format(q, i2, cam1));
    if r not like 'ERR 22023 caminho_invalido:%' then raise exception 'T4 outra importacao: %', r; end if;
    perform pg_temp.como(ux);
    r := pg_temp.ch(format(q, i2, cam2));
    if r not like 'ERR 42501 sem_permissao:%' then raise exception 'T5: %', r; end if;
    perform pg_temp.como(null);
    r := pg_temp.ch(format(q, i2, cam2));
    if r not like 'ERR 42501 sem_permissao:%' then raise exception 'T6: %', r; end if;
    perform pg_temp.como(adm);
    r := pg_temp.ch(format(q, gen_random_uuid(), cam2));
    if r not like 'ERR P0002 importacao_nao_encontrada:%' then raise exception 'T7: %', r; end if;
    if has_function_privilege('anon', 'public.fn_importacao_guardar_arquivo(uuid,text)', 'execute') then raise exception 'T8 anon executa'; end if;
    raise exception 'PASSOU';
  exception when others then
    return sqlerrm;
  end;
end $f$;

do $m$
declare
  base text := pg_get_functiondef('public.fn_importacao_guardar_arquivo(uuid,text)'::regprocedure);
  md5_base text := md5(pg_get_functiondef('public.fn_importacao_guardar_arquivo(uuid,text)'::regprocedure));
  muts text[] := array[
    'M1', 'if v.cliente_id is null or not public.tenant_ok(v.cliente_id) then', 'if v.cliente_id is null then',
    'M2', 'raise exception using errcode = ''P0001'', message = ''ja_guardado: esta importação já tem o arquivo original.'';', 'null;',
    'M3', 'if p_caminho is null or left(p_caminho, length(v_pasta)) <> v_pasta or p_caminho !~ ''\.[a-z0-9]{1,5}$'' then', 'if p_caminho is null then'];
  i int; r text; saida text := '';
begin
  r := pg_temp.teste();
  if r <> 'PASSOU' then raise exception 'M0 (o corpo da migration) nao passou: %', r; end if;
  saida := 'M0 passa';
  for i in 0 .. 2 loop
    if position(muts[i * 3 + 2] in base) = 0 then raise exception '% ancora nao casou', muts[i * 3 + 1]; end if;
    execute replace(base, muts[i * 3 + 2], muts[i * 3 + 3]);
    r := pg_temp.teste();
    if r = 'PASSOU' then raise exception '% NAO derrubou o teste', muts[i * 3 + 1]; end if;
    saida := saida || ' · ' || muts[i * 3 + 1] || ' cai (' || split_part(r, ':', 1) || ')';
    execute base;
  end loop;
  /* M4: a ACL */
  grant execute on function public.fn_importacao_guardar_arquivo(uuid, text) to anon;
  r := pg_temp.teste();
  if r = 'PASSOU' then raise exception 'M4 NAO derrubou o teste'; end if;
  saida := saida || ' · M4 cai (' || split_part(r, ':', 1) || ')';
  revoke all on function public.fn_importacao_guardar_arquivo(uuid, text) from anon;
  if md5(pg_get_functiondef('public.fn_importacao_guardar_arquivo(uuid,text)'::regprocedure)) <> md5_base then raise exception 'o corpo nao voltou pelo md5'; end if;
  raise exception 'OK importacao_guardar_arquivo_mutacoes: % · corpo de volta (md5 %)', saida, md5_base;
end $m$;
