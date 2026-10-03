-- PR-SEG-TENANT-VARREDURA-01B — testes SINTETICOS, numa transacao que TERMINA EM RAISE (nada fica gravado).
-- Roda DEPOIS da migration 20261027192500 (ou colado logo depois dela, na mesma transacao):
--   `supabase db query --linked -f supabase/tests/seg_tenant_varredura_01b_test.sql`
--
-- `get_anos_financeiro_v2(cliente)` e `fn_extratos_espelhados(cliente, conta, mes)` so' atendem quem e' do cliente — e, na dos
-- espelhados, so' com conta DESTE cliente. Dois clientes reais (X = NJ, Y = Agnaldo), com conta, extrato e lancamento SINTETICOS
-- em jan/2031. Usuarios reais simulados por `request.jwt.claims` + `SET LOCAL ROLE authenticated` (`cliente_membros` intocada):
--   ux = gestor so' da NJ · uy = gestor so' do Agnaldo · adm = admin AgroinBlue.
-- T1 travessia: ux pedindo Y (e uy pedindo X) -> 42501 "sem acesso a este registro" nas duas.
-- T2 cruzado: cliente X com conta de Y, cliente Y com conta de X, conta inexistente, conta nula, cliente nulo -> 42501
--    (antes, cliente X + conta de Y devolvia o NOME da conta de Y).
-- T3 o caminho de sempre: ux em X e uy em Y leem o que e' deles (o ano 2031 e o movimento sintetico); o admin le' os dois.
-- T4 sem usuario: 42501 nas duas (antes liam).
-- T5 assinatura, STABLE, SECURITY DEFINER, search_path e ACL de antes; `force_custom_plan` na dos espelhados.
set local statement_timeout = '120s';
set local lock_timeout = '3s';

create function pg_temp.como(p_user uuid) returns void language sql as $f$
  select set_config('request.jwt.claims', case when p_user is null then '{"role":"authenticated"}'
                    else json_build_object('sub', p_user, 'role', 'authenticated')::text end, true) $f$;
/* a chamada, como `authenticated`: 'OK <texto>' ou 'ERR <sqlstate> <mensagem>' */
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

do $t$
declare
  c_x constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd'; c_y constant uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  ux constant uuid := '9200e0d0-095f-4ab8-a31a-3052a0faaf56'; uy constant uuid := '4b7e4456-113b-45d2-a00a-83b4d1c6380a';
  adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_recusa constant text := 'ERR 42501 sem acesso a este registro';
  q_anos constant text := $q$select string_agg(a.ano::text, ',' order by a.ano) from public.get_anos_financeiro_v2(%L) a where a.ano >= 2031$q$;
  q_esp constant text := $q$select (j->'escopo'->>'nome_conta') || '|ofx=' || jsonb_array_length(j->'ofx_completo') || '|sis=' || jsonb_array_length(j->'sistema_completo')
                               || '|v=' || (j->'ofx_completo'->0->>'valor') || '|' || (j->>'versao') from public.fn_extratos_espelhados(%L, %L, %L) j$q$;
  bx uuid; b_y uuid; v_out text := ''; a text; s text; k text; v_anos_x text; v_anos_y text;
begin
  if (select count(*) from cliente_membros where user_id = ux and ativo) <> 1
     or not exists (select 1 from cliente_membros where user_id = ux and ativo and cliente_id = c_x and perfil::text <> 'admin_agroinblue')
     or (select count(*) from cliente_membros where user_id = uy and ativo) <> 1
     or not exists (select 1 from cliente_membros where user_id = uy and ativo and cliente_id = c_y and perfil::text <> 'admin_agroinblue')
     or not exists (select 1 from cliente_membros where user_id = adm and ativo and perfil::text = 'admin_agroinblue') then
    raise exception 'montagem: os usuarios de teste nao sao mais (membro so de X, membro so de Y, admin)';
  end if;

  -- ── montagem: uma conta, um extrato de credito e uma entrada realizada em jan/2031, em cada cliente ──
  insert into financeiro_contas_bancarias (cliente_id, nome_conta, nome_exibicao, tipo_conta, ativa) values (c_x, 'SINT SEG B X', 'SINT SEG B X', 'cc', true) returning id into bx;
  insert into financeiro_contas_bancarias (cliente_id, nome_conta, nome_exibicao, tipo_conta, ativa) values (c_y, 'SINT SEG B Y', 'SINT SEG B Y', 'cc', true) returning id into b_y;
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao, documento)
    values (c_x, bx, date '2031-01-05', 111, 'credito', md5(random()::text), 'SINT SEG B', 'SINT-B-X'),
           (c_y, b_y, date '2031-01-05', 222, 'credito', md5(random()::text), 'SINT SEG B', 'SINT-B-Y');
  insert into financeiro_lancamentos_v2 (cliente_id, conta_destino_id, tipo_operacao, sinal, valor, status_transacao, data_pagamento, data_competencia, data_vencimento, cenario, descricao)
    values (c_x, bx, '1-Entradas', '1', 111, 'realizado', date '2031-01-05', date '2031-01-05', date '2031-01-05', 'realizado', 'SINT SEG B'),
           (c_y, b_y, '1-Entradas', '1', 222, 'realizado', date '2031-01-05', date '2031-01-05', date '2031-01-05', 'realizado', 'SINT SEG B');

  -- os anos que cada cliente TEM de 2031 em diante, lidos direto da tabela (a NJ tem financiamento ate' 2040): a funcao tem de
  -- devolver exatamente estes, e o 2031 do lancamento sintetico tem de estar entre eles
  select 'OK ' || string_agg(x.ano::text, ',' order by x.ano) into v_anos_x from (select distinct substring(l.ano_mes from 1 for 4)::int ano from financeiro_lancamentos_v2 l
    where l.cliente_id = c_x and l.status_transacao is distinct from 'cancelado' and substring(l.ano_mes from 1 for 4)::int >= 2031) x;
  select 'OK ' || string_agg(x.ano::text, ',' order by x.ano) into v_anos_y from (select distinct substring(l.ano_mes from 1 for 4)::int ano from financeiro_lancamentos_v2 l
    where l.cliente_id = c_y and l.status_transacao is distinct from 'cancelado' and substring(l.ano_mes from 1 for 4)::int >= 2031) x;
  if v_anos_x not like 'OK 2031%' or v_anos_y not like 'OK 2031%' then raise exception 'montagem: o lancamento sintetico de 2031 nao entrou (% · %)', v_anos_x, v_anos_y; end if;

  -- ── T1: travessia nos dois sentidos ──
  for k, s in select * from (values
      ('ux: anos de Y', format(q_anos, c_y)), ('ux: espelhados de Y', format(q_esp, c_y, b_y, '2031-01')),
      ('uy: anos de X', format(q_anos, c_x)), ('uy: espelhados de X', format(q_esp, c_x, bx, '2031-01'))) v(k, s) loop
    perform pg_temp.como(case when k like 'ux:%' then ux else uy end);
    a := pg_temp.ch(s);
    if a <> c_recusa then raise exception 'T1 %: %', k, a; end if;
  end loop;
  v_out := v_out || 'T1 ok (ux em Y e uy em X: recusados nas duas funcoes); ';

  -- ── T2: parametros cruzados, como ux ──
  perform pg_temp.como(ux);
  for k, s in select * from (values
      ('cliente X + conta de Y', format(q_esp, c_x, b_y, '2031-01')),
      ('cliente Y + conta de X', format(q_esp, c_y, bx, '2031-01')),
      ('conta inexistente', format(q_esp, c_x, gen_random_uuid(), '2031-01')),
      ('conta nula', format(q_esp, c_x, null, '2031-01')),
      ('cliente nulo (espelhados)', format(q_esp, null, bx, '2031-01')),
      ('cliente nulo (anos)', format(q_anos, null)),
      ('cliente inexistente (anos)', format(q_anos, gen_random_uuid()))) v(k, s) loop
    a := pg_temp.ch(s);
    if a <> c_recusa then raise exception 'T2 %: %', k, a; end if;
  end loop;
  v_out := v_out || 'T2 ok (conta de outro cliente, inexistente ou nula, e cliente nulo ou inexistente: recusados); ';

  -- ── T3: o caminho de sempre ──
  a := pg_temp.ch(format(q_anos, c_x));
  if a <> v_anos_x then raise exception 'T3 ux anos de X: % (esperado %)', a, v_anos_x; end if;
  a := pg_temp.ch(format(q_esp, c_x, bx, '2031-01'));
  if a <> 'OK SINT SEG B X|ofx=1|sis=1|v=111.00|espelhados-05-caixa' then raise exception 'T3 ux espelhados de X: %', a; end if;
  a := pg_temp.ch(format(q_esp, c_x, bx, '2031-02'));
  if a is distinct from 'OK null' then raise exception 'T3 ux espelhados de X em mes sem movimento: %', a; end if;
  perform pg_temp.como(uy);
  a := pg_temp.ch(format(q_anos, c_y));
  if a <> v_anos_y then raise exception 'T3 uy anos de Y: % (esperado %)', a, v_anos_y; end if;
  a := pg_temp.ch(format(q_esp, c_y, b_y, '2031-01'));
  if a <> 'OK SINT SEG B Y|ofx=1|sis=1|v=222.00|espelhados-05-caixa' then raise exception 'T3 uy espelhados de Y: %', a; end if;
  perform pg_temp.como(adm);
  if pg_temp.ch(format(q_anos, c_y)) <> v_anos_y or pg_temp.ch(format(q_anos, c_x)) <> v_anos_x or pg_temp.ch(format(q_esp, c_y, b_y, '2031-01')) <> 'OK SINT SEG B Y|ofx=1|sis=1|v=222.00|espelhados-05-caixa'
     or pg_temp.ch(format(q_esp, c_x, bx, '2031-01')) <> 'OK SINT SEG B X|ofx=1|sis=1|v=111.00|espelhados-05-caixa' then
    raise exception 'T3 admin: % · % · %', pg_temp.ch(format(q_anos, c_y)), pg_temp.ch(format(q_esp, c_y, b_y, '2031-01')), pg_temp.ch(format(q_esp, c_x, bx, '2031-01'));
  end if;
  -- o admin tambem nao cruza cliente e conta
  a := pg_temp.ch(format(q_esp, c_x, b_y, '2031-01'));
  if a <> c_recusa then raise exception 'T3 admin com cliente X e conta de Y: %', a; end if;
  v_out := v_out || 'T3 ok (ux em X, uy em Y e o admin nos dois leem os anos do cliente (2031 entre eles) e o movimento sintetico; mes sem movimento devolve as listas vazias; nem o admin cruza cliente e conta); ';

  -- ── T4: sem usuario ──
  perform pg_temp.como(null);
  if pg_temp.ch(format(q_anos, c_x)) <> c_recusa or pg_temp.ch(format(q_esp, c_x, bx, '2031-01')) <> c_recusa then
    raise exception 'T4 sem usuario: % · %', pg_temp.ch(format(q_anos, c_x)), pg_temp.ch(format(q_esp, c_x, bx, '2031-01'));
  end if;
  v_out := v_out || 'T4 ok (sem usuario: recusado nas duas); ';

  -- ── T5: assinatura, config e ACL ──
  if (select count(*) from pg_proc p where p.oid in ('public.get_anos_financeiro_v2(uuid)'::regprocedure, 'public.fn_extratos_espelhados(uuid, uuid, text)'::regprocedure)
        and p.prosecdef and p.provolatile = 's' and 'search_path=public' = any (p.proconfig)
        and not has_function_privilege('anon', p.oid, 'EXECUTE') and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and p.prosrc ~ 'PR-SEG-TENANT-VARREDURA-01B' and p.prosrc ~ 'public\.tenant_ok\(') <> 2
     or not exists (select 1 from pg_proc p where p.oid = 'public.fn_extratos_espelhados(uuid, uuid, text)'::regprocedure and 'plan_cache_mode=force_custom_plan' = any (p.proconfig))
     or (select pg_get_function_result('public.get_anos_financeiro_v2(uuid)'::regprocedure)) <> 'TABLE(ano integer)'
     or (select pg_get_function_result('public.fn_extratos_espelhados(uuid, uuid, text)'::regprocedure)) <> 'jsonb' then
    raise exception 'T5: config, ACL, retorno ou guarda nao estao como deveriam';
  end if;
  v_out := v_out || 'T5 ok (retorno, STABLE, SECURITY DEFINER, search_path e ACL de antes; force_custom_plan nos espelhados); ';

  raise exception 'OK %', v_out using errcode = 'P0001';
end $t$;
