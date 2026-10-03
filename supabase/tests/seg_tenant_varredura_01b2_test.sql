-- PR-SEG-TENANT-VARREDURA-01B2 — teste numa transacao que TERMINA EM RAISE (nada fica gravado).
-- Roda DEPOIS da migration 20261027192600 (ou colado logo depois dela, na mesma transacao):
--   `supabase db query --linked -f supabase/tests/seg_tenant_varredura_01b2_test.sql`
--
-- Corpo interno + RPC publica guardada para `refresh_zoot_cache` (3 assinaturas), `fn_zoot_categoria_mensal`,
-- `get_status_pilares_fechamento` e `can_close_valor_rebanho`. Usa duas fazendas REAIS (X = Faz. Pureza, da NJ; Y = Faz. Sta. Maria,
-- do Agnaldo) e usuarios reais simulados por `request.jwt.claims` + `SET LOCAL ROLE authenticated` (`cliente_membros` intocada):
--   ux = gestor so' da NJ · uy = gestor so' do Agnaldo · adm = admin AgroinBlue.
-- T1 travessia nos dois sentidos: 42501 "sem acesso a este registro" nas seis publicas (e `get_status_pilares_ano`, que ja' recusava).
-- T2 fazenda inexistente ou nula: a mesma recusa (antes respondiam).
-- T3 o membro le' o que a interna devolve (md5 igual ao da interna chamada pelo dono) e o refresh dele deixa o cache igual.
-- T4 o admin atravessa; T5 sem usuario, 42501 nas publicas.
-- T6 as internas sao fechadas: `authenticated` e `anon` recebem "permission denied".
-- T7 a cadeia SEM USUARIO continua viva: o trigger deferido de `zoot_cache_sujo` e a varredura do cron reconstroem o cache.
-- T8 a trava de mes fechado em `lancamentos` recusa e deixa passar como antes, com e sem usuario.
-- T9 config e ACL.
set local statement_timeout = '150s';
set local lock_timeout = '3s';

create function pg_temp.como(p_user uuid) returns void language sql as $f$
  select set_config('request.jwt.claims', case when p_user is null then '{"role":"authenticated"}'
                    else json_build_object('sub', p_user, 'role', 'authenticated')::text end, true) $f$;
/* a chamada, no papel pedido: 'OK <texto>' ou 'ERR <sqlstate> <mensagem>' */
create function pg_temp.ch(p_sql text, p_role text default 'authenticated') returns text language plpgsql as $f$
declare r text;
begin
  begin
    execute 'set local role ' || p_role;
    execute p_sql into r;
    execute 'reset role';
    return 'OK ' || coalesce(r, 'null');
  exception when others then
    execute 'reset role';
    return 'ERR ' || sqlstate || ' ' || sqlerrm;
  end;
end $f$;
create function pg_temp.cache(p_faz uuid, p_ano int) returns text language sql as $f$
  select count(*) || ':' || md5(coalesce(string_agg((to_jsonb(z) - 'updated_at' - 'id')::text, '|' order by (to_jsonb(z) - 'updated_at' - 'id')::text), ''))
    from zoot_mensal_cache z where z.fazenda_id = p_faz and z.ano = p_ano $f$;

do $t$
declare
  c_x constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'; c_y constant uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  fx constant uuid := 'd3396cdd-7c95-4d41-bcc5-577c0563ce87'; fy constant uuid := '2ff5d506-6bba-4cd2-9a23-3d5886e01d38';
  ux constant uuid := '9200e0d0-095f-4ab8-a31a-3052a0faaf56'; uy constant uuid := '4b7e4456-113b-45d2-a00a-83b4d1c6380a';
  adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_recusa constant text := 'ERR 42501 sem acesso a este registro';
  q_zoot constant text := $q$select count(*) || ':' || md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from public.%s(%L, 2026) t$q$;
  q_pil constant text := $q$select md5(string_agg(public.%s(%L, to_char(make_date(2026, m, 1), 'YYYY-MM'))::text, '|' order by m)) from generate_series(1, 12) m$q$;
  v_out text := ''; a text; s text; k text; v_c0 text; v_n int; v_l uuid; v_mes_fechado text := '2026-08';
  v_zoot text; v_pil text; v_can text;
begin
  if (select count(*) from cliente_membros where user_id = ux and ativo) <> 1
     or not exists (select 1 from cliente_membros where user_id = ux and ativo and cliente_id = c_x and perfil::text <> 'admin_agroinblue')
     or (select count(*) from cliente_membros where user_id = uy and ativo) <> 1
     or not exists (select 1 from cliente_membros where user_id = uy and ativo and cliente_id = c_y and perfil::text <> 'admin_agroinblue')
     or not exists (select 1 from cliente_membros where user_id = adm and ativo and perfil::text = 'admin_agroinblue')
     or (select cliente_id from fazendas where id = fx) is distinct from c_x or (select cliente_id from fazendas where id = fy) is distinct from c_y then
    raise exception 'montagem: usuarios ou fazendas de teste nao sao mais o que o teste supoe';
  end if;
  v_c0 := pg_temp.cache(fx, 2026);
  if v_c0 like '0:%' then raise exception 'montagem: a fazenda X nao tem cache em 2026 (conjunto vazio nao prova nada)'; end if;
  -- o que as internas devolvem, lido pelo dono: a referencia do T3
  v_zoot := pg_temp.ch(format(q_zoot, '_fn_zoot_categoria_mensal', fx), 'postgres');
  v_pil := pg_temp.ch(format(q_pil, '_fn_status_pilares_fechamento', fx), 'postgres');
  v_can := pg_temp.ch(format(q_pil, '_fn_can_close_valor_rebanho', fx), 'postgres');
  if v_zoot like 'ERR%' or v_zoot like 'OK 0:%' or v_pil like 'ERR%' or v_can like 'ERR%' then raise exception 'montagem: internas % · % · %', v_zoot, v_pil, v_can; end if;

  -- ── T1: travessia nos dois sentidos ──
  for k, s in select * from (values ('ux em Y', fy::text), ('uy em X', fx::text)) v(k, s) loop
    perform pg_temp.como(case when k like 'ux%' then ux else uy end);
    for a in select pg_temp.ch(q) from unnest(array[
        format(q_zoot, 'fn_zoot_categoria_mensal', s), format(q_pil, 'get_status_pilares_fechamento', s), format(q_pil, 'can_close_valor_rebanho', s),
        format('select public.refresh_zoot_cache(%L, 2026)', s), format($q$select public.refresh_zoot_cache(%L, 2026, 'realizado')$q$, s),
        format('select public.refresh_zoot_cache(%L, 2026, 8)', s)]) u(q) loop
      if a <> c_recusa then raise exception 'T1 %: %', k, a; end if;
    end loop;
    a := pg_temp.ch(format('select count(*) from public.get_status_pilares_ano(%L, 2026)', case when k like 'ux%' then c_y else c_x end));
    if a <> 'ERR 42501 sem_permissao' then raise exception 'T1 % (pilares do ano): %', k, a; end if;
  end loop;
  if pg_temp.cache(fx, 2026) <> v_c0 then raise exception 'T1: o cache de X mudou'; end if;
  v_out := v_out || 'T1 ok (ux em Y e uy em X: recusados nas seis publicas e no status do ano; cache intacto); ';

  -- ── T2: fazenda inexistente ou nula, como ux ──
  perform pg_temp.como(ux);
  for a in select pg_temp.ch(q) from unnest(array[
      format(q_zoot, 'fn_zoot_categoria_mensal', gen_random_uuid()), format(q_pil, 'get_status_pilares_fechamento', gen_random_uuid()),
      format(q_pil, 'can_close_valor_rebanho', gen_random_uuid()), format('select public.refresh_zoot_cache(%L, 2026)', gen_random_uuid()),
      'select count(*) from public.fn_zoot_categoria_mensal(NULL, 2026)', $q$select public.get_status_pilares_fechamento(NULL, '2026-08')$q$,
      $q$select public.can_close_valor_rebanho(NULL, '2026-08')$q$, 'select public.refresh_zoot_cache(NULL::uuid, 2026)',
      $q$select public.refresh_zoot_cache(NULL::uuid, 2026, 'realizado')$q$, 'select public.refresh_zoot_cache(NULL::uuid, 2026, 8)']) u(q) loop
    if a <> c_recusa then raise exception 'T2: %', a; end if;
  end loop;
  v_out := v_out || 'T2 ok (fazenda inexistente ou nula: a mesma recusa); ';

  -- ── T3: o membro, na fazenda dele ──
  a := pg_temp.ch(format(q_zoot, 'fn_zoot_categoria_mensal', fx));
  if a <> v_zoot then raise exception 'T3 categoria mensal: % <> interna %', a, v_zoot; end if;
  a := pg_temp.ch(format(q_pil, 'get_status_pilares_fechamento', fx));
  if a <> v_pil then raise exception 'T3 pilares: % <> interna %', a, v_pil; end if;
  a := pg_temp.ch(format(q_pil, 'can_close_valor_rebanho', fx));
  if a <> v_can then raise exception 'T3 can_close: % <> interna %', a, v_can; end if;
  a := pg_temp.ch(format('select count(*) from public.get_status_pilares_ano(%L, 2026)', c_x));
  if a not like 'OK %' or a = 'OK 0' then raise exception 'T3 pilares do ano: %', a; end if;
  for a in select pg_temp.ch(q) from unnest(array[format('select public.refresh_zoot_cache(%L, 2026)', fx),
      format($q$select public.refresh_zoot_cache(%L, 2026, 'realizado')$q$, fx), format('select public.refresh_zoot_cache(%L, 2026, 8)', fx)]) u(q) loop
    if a not like 'OK%' then raise exception 'T3 refresh: %', a; end if;
    if pg_temp.cache(fx, 2026) <> v_c0 then raise exception 'T3: o refresh do membro deixou o cache diferente (% x %)', pg_temp.cache(fx, 2026), v_c0; end if;
  end loop;
  v_out := v_out || format('T3 ok (ux em X: categoria mensal %s, pilares e can_close = as internas; os tres refresh deixam o cache igual); ', split_part(v_zoot, ':', 1));

  -- ── T4 / T5: o admin e ninguem ──
  perform pg_temp.como(adm);
  if pg_temp.ch(format(q_zoot, 'fn_zoot_categoria_mensal', fx)) <> v_zoot or pg_temp.ch(format(q_pil, 'get_status_pilares_fechamento', fy)) not like 'OK %'
     or pg_temp.ch(format(q_pil, 'can_close_valor_rebanho', fy)) not like 'OK %' or pg_temp.ch(format('select public.refresh_zoot_cache(%L, 2026, 8)', fx)) not like 'OK%' then
    raise exception 'T4 admin';
  end if;
  perform pg_temp.como(null);
  for a in select pg_temp.ch(q) from unnest(array[format(q_zoot, 'fn_zoot_categoria_mensal', fx), format(q_pil, 'get_status_pilares_fechamento', fx),
      format(q_pil, 'can_close_valor_rebanho', fx), format('select public.refresh_zoot_cache(%L, 2026)', fx)]) u(q) loop
    if a <> c_recusa then raise exception 'T5 sem usuario: %', a; end if;
  end loop;
  v_out := v_out || 'T4 ok (admin nas duas fazendas); T5 ok (sem usuario: recusado); ';

  -- ── T6: as internas fechadas ──
  perform pg_temp.como(ux);
  for s in select unnest(array['authenticated', 'anon']) loop
    for a in select pg_temp.ch(q, s) from unnest(array[
        format('select count(*) from public._fn_zoot_categoria_mensal(%L, 2026)', fx), format($q$select public._fn_status_pilares_fechamento(%L, '2026-08')$q$, fx),
        format($q$select public._fn_can_close_valor_rebanho(%L, '2026-08')$q$, fx), format('select public._fn_refresh_zoot_cache(%L, 2026)', fx),
        format($q$select public._fn_refresh_zoot_cache(%L, 2026, 'realizado')$q$, fx), format('select public._fn_refresh_zoot_cache(%L, 2026, 8)', fx)]) u(q) loop
      if a not like 'ERR 42501 permission denied for function %' then raise exception 'T6 % nas internas: %', s, a; end if;
    end loop;
  end loop;
  v_out := v_out || 'T6 ok (as seis internas: permission denied para authenticated e anon); ';

  -- ── T7: a cadeia sem usuario ──
  perform pg_temp.como(null);
  delete from zoot_mensal_cache where fazenda_id = fx and ano = 2026 and mes = 8;
  if pg_temp.cache(fx, 2026) = v_c0 then raise exception 'T7 montagem: o buraco nao foi aberto'; end if;
  insert into zoot_cache_sujo (fazenda_id, ano) values (fx, 2026) on conflict do nothing;
  set constraints all immediate;   -- dispara o trigger deferido agora, como o COMMIT faria
  if exists (select 1 from zoot_cache_sujo where fazenda_id = fx and ano = 2026) or pg_temp.cache(fx, 2026) <> v_c0 then
    raise exception 'T7 trigger deferido: marca % · cache % x %', exists (select 1 from zoot_cache_sujo where fazenda_id = fx and ano = 2026), pg_temp.cache(fx, 2026), v_c0;
  end if;
  set constraints all deferred;
  delete from zoot_mensal_cache where fazenda_id = fx and ano = 2026 and mes = 8;
  alter table zoot_cache_sujo disable trigger trg_zoot_cache_reconstruir;   -- a marca fica para a varredura, como quando o trigger falha
  insert into zoot_cache_sujo (fazenda_id, ano) values (fx, 2026) on conflict do nothing;
  alter table zoot_cache_sujo enable trigger trg_zoot_cache_reconstruir;
  select public.fn_zoot_cache_reconstruir_sujos() into v_n;
  if v_n < 1 or exists (select 1 from zoot_cache_sujo where fazenda_id = fx and ano = 2026) or pg_temp.cache(fx, 2026) <> v_c0 then
    raise exception 'T7 varredura do cron: reconstruidos % · cache % x %', v_n, pg_temp.cache(fx, 2026), v_c0;
  end if;
  v_out := v_out || 'T7 ok (sem usuario: o trigger deferido e a varredura do cron reconstroem o buraco e apagam a marca); ';

  -- ── T8: a trava de mes fechado em `lancamentos` ──
  if (public._fn_status_pilares_fechamento(fx, v_mes_fechado) #>> '{p1_mapa_pastos,status}') <> 'oficial'
     or (public._fn_status_pilares_fechamento(fx, '2031-01') #>> '{p1_mapa_pastos,status}') = 'oficial' then
    raise exception 'T8 montagem: % da fazenda X nao esta mais fechado (ou jan/2031 esta)', v_mes_fechado;
  end if;
  select l.id into v_l from lancamentos l where l.fazenda_id = fx and to_char(l.data, 'YYYY-MM') = v_mes_fechado and l.cenario = 'realizado'
     and coalesce(l.status_operacional, 'realizado') = 'realizado' and l.cancelado is not true order by l.data, l.id limit 1;
  if v_l is null then raise exception 'T8 montagem: sem lancamento realizado no mes fechado'; end if;
  for k, s in select * from (values ('com usuario', 'authenticated'), ('sem usuario', 'postgres')) v(k, s) loop
    perform pg_temp.como(case when s = 'authenticated' then ux end);
    a := pg_temp.ch(format('with u as (update public.lancamentos set quantidade = quantidade + 1 where id = %L returning 1) select count(*) from u', v_l), s);
    if a <> format('ERR P0001 Mês %s está fechado no Mapa de Pastos (P1 oficial). Reabra o período para alterar campos estruturais.', v_mes_fechado) then raise exception 'T8 % update estrutural: %', k, a; end if;
    a := pg_temp.ch(format('with u as (delete from public.lancamentos where id = %L returning 1) select count(*) from u', v_l), s);
    if a <> format('ERR P0001 Mês %s está fechado no Mapa de Pastos (P1 oficial). Reabra o período para excluir lançamentos.', v_mes_fechado) then raise exception 'T8 % delete: %', k, a; end if;
    a := pg_temp.ch(format($q$with u as (insert into public.lancamentos select (jsonb_populate_record(null::public.lancamentos, to_jsonb(l) || jsonb_build_object('id', gen_random_uuid()))).* from public.lancamentos l where l.id = %L returning 1) select count(*) from u$q$, v_l), s);
    if a <> format('ERR P0001 Mês %s está fechado no Mapa de Pastos (P1 oficial). Reabra o período para inserir novos lançamentos.', v_mes_fechado) then raise exception 'T8 % insert no mes fechado: %', k, a; end if;
    a := pg_temp.ch(format($q$with u as (update public.lancamentos set observacao = coalesce(observacao, '') || '' where id = %L returning 1) select count(*) from u$q$, v_l), s);
    if a <> 'OK 1' then raise exception 'T8 % update nao estrutural no mes fechado: %', k, a; end if;
    a := pg_temp.ch(format($q$with u as (insert into public.lancamentos select (jsonb_populate_record(null::public.lancamentos, to_jsonb(l) || jsonb_build_object('id', gen_random_uuid(), 'data', '2031-01-15'))).* from public.lancamentos l where l.id = %L returning 1) select count(*) from u$q$, v_l), s);
    if a <> 'OK 1' then raise exception 'T8 % insert em mes aberto: %', k, a; end if;
  end loop;
  v_out := v_out || 'T8 ok (mes fechado recusa update estrutural, delete e insert com a mensagem de sempre; update nao estrutural e insert em mes aberto passam — com e sem usuario); ';

  -- ── T9: config e ACL ──
  if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('_fn_refresh_zoot_cache', '_fn_zoot_categoria_mensal', '_fn_status_pilares_fechamento', '_fn_can_close_valor_rebanho')
        and p.prosecdef and not has_function_privilege('authenticated', p.oid, 'EXECUTE') and not has_function_privilege('anon', p.oid, 'EXECUTE')
        and has_function_privilege('service_role', p.oid, 'EXECUTE')
        and not exists (select 1 from aclexplode(p.proacl) x where x.grantee = 0)) <> 6
     or (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname in ('refresh_zoot_cache', 'fn_zoot_categoria_mensal', 'get_status_pilares_fechamento', 'can_close_valor_rebanho')
           and p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE') and not has_function_privilege('anon', p.oid, 'EXECUTE')
           and p.prosrc ~ 'PR-SEG-TENANT-VARREDURA-01B2' and p.prosrc ~ 'public\.tenant_ok\(v_cli\)') <> 6
     or not exists (select 1 from pg_proc p where p.oid = 'public.guard_lancamento_mes_fechado_p1()'::regprocedure and p.prosecdef and 'search_path=public' = any (p.proconfig))
     or exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                  and p.proname in ('fn_zoot_cache_reconstruir_sujos', 'trg_fn_zoot_cache_reconstruir', 'guard_lancamento_mes_fechado_p1', 'guard_valor_rebanho_requer_p1_fechado', 'get_status_pilares_ano')
                  and p.prosrc ~ '(public\.| )(refresh_zoot_cache|get_status_pilares_fechamento|can_close_valor_rebanho)\(') then
    raise exception 'T9: internas, publicas ou chamadores nao estao como deveriam';
  end if;
  v_out := v_out || 'T9 ok (6 internas fechadas, 6 publicas com a guarda e a ACL de antes, a trava de mes fechado SECURITY DEFINER, e nenhum dos cinco chamadores cita a publica); ';

  raise exception 'OK %', v_out using errcode = 'P0001';
end $t$;
