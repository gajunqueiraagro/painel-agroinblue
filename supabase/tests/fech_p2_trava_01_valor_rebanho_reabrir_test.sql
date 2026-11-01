-- FECH-P2-TRAVA-01 D2 — teste da fn_valor_rebanho_reabrir. Roda depois da migration 20261028115160, numa query só,
-- e termina em RAISE 'OK…' (nada fica no banco). Fixture sintético no cliente Teste (43f32d07), meses de 2030/2031.
-- T1 sem usuário = 42501 · T2 usuário fora do cliente = 42501 · T3 mês inválido = 22007
-- T4 como `authenticated` (claims de um membro real do cliente Teste): abre o fechamento, invalida o mês, cadeia_quebrada
--    nos seguintes, o mês anterior fica validado, 3 linhas de trilha com o autor, e o salvar dos pastos destrava
-- T5 a segunda chamada não muda nada (nenhuma_alteracao, 0 trilha) · T6 nasce fechada (PUBLIC/anon sem EXECUTE)
do $$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v_faz uuid; v_pasto uuid; v_membro uuid; v_fora uuid; r jsonb; v_n int; v_st text;
begin
  select id into strict v_faz from public.fazendas where cliente_id = c_cli and nome = 'Fazenda Teste Cana';
  select id into v_pasto from public.pastos where fazenda_id = v_faz and ativo order by id limit 1;
  if v_pasto is null then raise exception 'fixture: a fazenda Teste não tem pasto ativo'; end if;
  select m.user_id into v_membro from public.cliente_membros m
   where m.cliente_id = c_cli and m.ativo and not public.is_admin_agroinblue(m.user_id) limit 1;
  if v_membro is null then
    select m.user_id into v_membro from public.cliente_membros m where m.cliente_id = c_cli and m.ativo limit 1;
  end if;
  if v_membro is null then raise exception 'fixture: o cliente Teste não tem membro ativo'; end if;
  select m.user_id into v_fora from public.cliente_membros m
   where m.ativo and not public.is_admin_agroinblue(m.user_id)
     and not exists (select 1 from public.cliente_membros x where x.user_id = m.user_id and x.cliente_id = c_cli and x.ativo)
   limit 1;
  if v_fora is null then raise exception 'fixture: nenhum usuário fora do cliente Teste'; end if;
  if exists (select 1 from public.valor_rebanho_fechamento where fazenda_id = v_faz and ano_mes between '2030-12' and '2031-03')
     or exists (select 1 from public.valor_rebanho_realizado_validado where fazenda_id = v_faz and ano_mes between '2030-12' and '2031-03') then
    raise exception 'fixture: já há dado em 2030-12..2031-03 na fazenda Teste';
  end if;

  -- P1 oficial em 2031-01 (o card do único pasto fechado), para o banco aceitar o P2 fechado.
  insert into public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status)
  values (v_pasto, v_faz, c_cli, '2031-01', 'fechado');
  insert into public.valor_rebanho_fechamento (fazenda_id, cliente_id, ano_mes, status, valor_total, peso_total_kg)
  values (v_faz, c_cli, '2031-01', 'fechado', 1000, 450);
  insert into public.valor_rebanho_realizado_validado (fazenda_id, cliente_id, ano_mes, valor_total, cabecas, status)
  select v_faz, c_cli, m, 1000, 1, 'validado' from unnest(array['2030-12','2031-01','2031-02','2031-03']) m;
  if not public._fn_fechamento_p2_travado(v_faz, '2031-01') then raise exception 'fixture: 2031-01 deveria travar'; end if;

  -- T1
  begin
    perform public.fn_valor_rebanho_reabrir(v_faz, '2031-01', 't1');
    raise exception 'T1 sem usuário passou';
  exception when insufficient_privilege then null;
  end;

  -- T2
  perform set_config('request.jwt.claims', json_build_object('sub', v_fora, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.fn_valor_rebanho_reabrir(v_faz, '2031-01', 't2');
    raise exception 'T2 usuário fora do cliente passou';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  -- T3 e T4 como membro
  perform set_config('request.jwt.claims', json_build_object('sub', v_membro, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.fn_valor_rebanho_reabrir(v_faz, '2031-13', 't3');
    raise exception 'T3 mês inválido passou';
  exception when invalid_datetime_format then null;
  end;
  r := public.fn_valor_rebanho_reabrir(v_faz, '2031-01', 'teste FECH-P2-TRAVA-01');
  execute 'reset role';

  if (r->>'fechamento_aberto')::boolean is distinct from true then raise exception 'T4 fechamento não abriu: %', r; end if;
  if (r->>'realizados_alterados')::int <> 3 then raise exception 'T4 esperava 3 realizados alterados: %', r; end if;
  if (r->>'logs_gravados')::int <> 3 then raise exception 'T4 esperava 3 linhas de trilha: %', r; end if;
  if (r->>'travado_depois')::boolean then raise exception 'T4 o salvar dos pastos segue travado: %', r; end if;
  if public._fn_fechamento_p2_travado(v_faz, '2031-01') then raise exception 'T4 _fn_fechamento_p2_travado ainda true'; end if;
  select status into v_st from public.valor_rebanho_fechamento where fazenda_id = v_faz and ano_mes = '2031-01'
     and reaberto_por = v_membro and reaberto_em is not null;
  if v_st is distinct from 'aberto' then raise exception 'T4 fechamento: % (autor gravado?)', v_st; end if;
  select string_agg(ano_mes || '=' || status, ',' order by ano_mes) into v_st
    from public.valor_rebanho_realizado_validado where fazenda_id = v_faz and ano_mes between '2030-12' and '2031-03';
  if v_st <> '2030-12=validado,2031-01=invalidado,2031-02=cadeia_quebrada,2031-03=cadeia_quebrada' then
    raise exception 'T4 realizados: %', v_st;
  end if;
  select count(*) into v_n from public.fechamento_reaberturas_log
   where fazenda_id = v_faz and pilar = 'p2_valor_rebanho' and reaberto_por = v_membro
     and motivo like 'Reabertura do Valor do Rebanho: teste FECH-P2-TRAVA-01%';
  if v_n <> 3 then raise exception 'T4 trilha com autor: % linhas', v_n; end if;

  -- T5
  perform set_config('request.jwt.claims', json_build_object('sub', v_membro, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.fn_valor_rebanho_reabrir(v_faz, '2031-01', 'de novo');
  execute 'reset role';
  if (r->>'nenhuma_alteracao')::boolean is distinct from true or (r->>'logs_gravados')::int <> 0 then
    raise exception 'T5 a segunda chamada mudou algo: %', r;
  end if;

  -- T6
  if has_function_privilege('anon', 'public.fn_valor_rebanho_reabrir(uuid,text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.fn_valor_rebanho_reabrir(uuid,text,text)', 'execute')
     or exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                 where p.oid = 'public.fn_valor_rebanho_reabrir(uuid,text,text)'::regprocedure
                   and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'T6 a função não nasceu fechada';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public.fn_valor_rebanho_reabrir(uuid,text,text)'::regprocedure) then
    raise exception 'T6 a função não é SECURITY DEFINER';
  end if;

  raise exception 'OK FECH-P2-TRAVA-01 D2: T1–T6 (membro não admin? %)', not public.is_admin_agroinblue(v_membro);
end $$;
