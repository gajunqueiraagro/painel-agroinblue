-- CONC-PAINEL-ARQUIVOS-01 (b) — teste SINTETICO, numa transacao que TERMINA EM RAISE (nada fica gravado). Roda DEPOIS da migration
-- 20261028115620 (ou colado logo depois dela, na mesma transacao). Cliente Teste (43f32d07), conta e importacoes SINTETICAS.
-- Usuarios reais simulados por `request.jwt.claims` + `SET LOCAL ROLE authenticated` (`cliente_membros` intocada):
--   adm = admin AgroinBlue (tenant_ok em qualquer cliente) · ux = gestor SO da NJ (nao e' do Teste).
-- T1 grava o caminho certo (ja_guardado false) e a coluna fica com ele.
-- T2 o MESMO caminho de novo: ok, ja_guardado true (o reenvio da tela nao vira erro).
-- T3 OUTRO caminho na importacao que ja tem: P0001 ja_guardado; o caminho de antes fica.
-- T4 caminho fora da pasta desta importacao (outro cliente; outra importacao; sem extensao): 22023; nada grava.
-- T5 quem nao e' do cliente: 42501; nada grava.
-- T6 sem usuario: 42501.
-- T7 importacao inexistente: P0002.
-- T8 ACL: PUBLIC e anon sem EXECUTE; authenticated com; SECURITY DEFINER e search_path fixo.
set local statement_timeout = '60s';
set local lock_timeout = '2s';

create function pg_temp.como(p_user uuid) returns void language sql as $f$
  select set_config('request.jwt.claims', case when p_user is null then '{"role":"authenticated"}'
                    else json_build_object('sub', p_user, 'role', 'authenticated')::text end, true) $f$;
/* a chamada, como `authenticated`: 'OK <json>' ou 'ERR <sqlstate> <mensagem>' */
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
  c_t constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  ux constant uuid := '7fae9bea-286a-46e7-a109-8c7bbc8b5ed2';
  q constant text := $q$select public.fn_importacao_guardar_arquivo(%L, %L)::text$q$;
  conta uuid; i1 uuid; i2 uuid; cam1 text; cam2 text; r text; v text;
begin
  if not exists (select 1 from cliente_membros where user_id = adm and ativo and perfil::text = 'admin_agroinblue')
     or exists (select 1 from cliente_membros where user_id = ux and ativo and cliente_id = c_t)
     or not exists (select 1 from cliente_membros where user_id = ux and ativo and cliente_id = c_nj and perfil::text <> 'admin_agroinblue') then
    raise exception 'montagem: os usuarios de teste nao sao mais (admin; gestor so da NJ)';
  end if;

  insert into financeiro_contas_bancarias (cliente_id, nome_conta, nome_exibicao, tipo_conta, ativa)
    values (c_t, 'SINT GUARDAR ARQ', 'SINT GUARDAR ARQ', 'cc', true) returning id into conta;
  insert into financeiro_importacoes_v2 (cliente_id, conta_bancaria_id, nome_arquivo, tipo_arquivo, status, total_linhas)
    values (c_t, conta, 'sint-set.ofx', 'OFX', 'processada', 3) returning id into i1;
  insert into financeiro_importacoes_v2 (cliente_id, conta_bancaria_id, nome_arquivo, tipo_arquivo, status, total_linhas)
    values (c_t, conta, 'sint-out.csv', 'CSV', 'processada', 2) returning id into i2;
  cam1 := c_t::text || '/importacoes/' || conta::text || '/' || i1::text || '.ofx';
  cam2 := c_t::text || '/importacoes/' || conta::text || '/' || i2::text || '.csv';

  -- T1
  perform pg_temp.como(adm);
  r := pg_temp.ch(format(q, i1, cam1));
  if r <> 'OK {"ok": true, "ja_guardado": false}' then raise exception 'T1: %', r; end if;
  select arquivo_caminho into v from financeiro_importacoes_v2 where id = i1;
  if v is distinct from cam1 then raise exception 'T1 coluna: %', v; end if;

  -- T2
  r := pg_temp.ch(format(q, i1, cam1));
  if r <> 'OK {"ok": true, "ja_guardado": true}' then raise exception 'T2: %', r; end if;

  -- T3
  r := pg_temp.ch(format(q, i1, replace(cam1, '.ofx', '.csv')));
  if r not like 'ERR P0001 ja_guardado:%' then raise exception 'T3: %', r; end if;
  select arquivo_caminho into v from financeiro_importacoes_v2 where id = i1;
  if v is distinct from cam1 then raise exception 'T3 coluna mudou: %', v; end if;

  -- T4
  r := pg_temp.ch(format(q, i2, replace(cam2, c_t::text, c_nj::text)));
  if r not like 'ERR 22023 caminho_invalido:%' then raise exception 'T4 outro cliente: %', r; end if;
  r := pg_temp.ch(format(q, i2, cam1));
  if r not like 'ERR 22023 caminho_invalido:%' then raise exception 'T4 outra importacao: %', r; end if;
  r := pg_temp.ch(format(q, i2, left(cam2, length(cam2) - 4)));
  if r not like 'ERR 22023 caminho_invalido:%' then raise exception 'T4 sem extensao: %', r; end if;
  if (select arquivo_caminho from financeiro_importacoes_v2 where id = i2) is not null then raise exception 'T4 gravou'; end if;

  -- T5
  perform pg_temp.como(ux);
  r := pg_temp.ch(format(q, i2, cam2));
  if r not like 'ERR 42501 sem_permissao:%' then raise exception 'T5: %', r; end if;
  if (select arquivo_caminho from financeiro_importacoes_v2 where id = i2) is not null then raise exception 'T5 gravou'; end if;

  -- T6
  perform pg_temp.como(null);
  r := pg_temp.ch(format(q, i2, cam2));
  if r not like 'ERR 42501 sem_permissao:%' then raise exception 'T6: %', r; end if;

  -- T7
  perform pg_temp.como(adm);
  r := pg_temp.ch(format(q, gen_random_uuid(), cam2));
  if r not like 'ERR P0002 importacao_nao_encontrada:%' then raise exception 'T7: %', r; end if;

  -- T8
  if has_function_privilege('anon', 'public.fn_importacao_guardar_arquivo(uuid,text)', 'execute') then raise exception 'T8 anon executa'; end if;
  if not has_function_privilege('authenticated', 'public.fn_importacao_guardar_arquivo(uuid,text)', 'execute') then raise exception 'T8 authenticated nao executa'; end if;
  if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
             where p.oid = 'public.fn_importacao_guardar_arquivo(uuid,text)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'T8 PUBLIC executa';
  end if;
  if not (select prosecdef and proconfig @> array['search_path=pg_catalog, public'] from pg_proc where oid = 'public.fn_importacao_guardar_arquivo(uuid,text)'::regprocedure) then
    raise exception 'T8 security definer / search_path';
  end if;

  raise exception 'OK importacao_guardar_arquivo: T1–T8 passaram';
end $t$;
