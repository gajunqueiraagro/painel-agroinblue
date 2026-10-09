-- DIVIDENDO-ESCRITOR-UNICO-01 passo 2 — ordem, trava de escrita direta, tenant e segundo cliente (continua `dividendo_escritor_unico_01_test.sql`).
-- Roda no canal de ESCRITA, numa chamada so'; termina SEMPRE em RAISE (nada persiste). Sinteticos no cliente Teste, num segundo
-- cliente criado na transacao e — so' em SIMULACAO, como usuario comum — no cliente do proprio gestor.
--   E9 reordenar (so' a ordem; lista diferente recusa)    E10 trava de escrita direta
--   E11 tenant (outro cliente, sem usuario, usuario comum do proprio cliente, interna fechada)      E12 cada cliente tem a sua conta
-- A prova mora em `pg_temp.teste()` para o ensaio de mutacoes chamar o MESMO corpo. ⚠ Toda comparacao e' `is distinct from`:
-- com `<>` um NULO (recusa que nao veio, conta que nao existe) nao dispara e a mutacao sobrevive — aconteceu com duas.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';

-- executa e devolve 'PASSOU <valor>' ou '<sqlstate> <mensagem>'; com p_comum, roda no papel `authenticated`
create function pg_temp.rec(p_sql text, p_comum boolean default false) returns text language plpgsql as $f$
declare v text;
begin
  if p_comum then execute 'set local role authenticated'; end if;
  execute p_sql into v;
  if p_comum then execute 'reset role'; end if;
  return 'PASSOU ' || coalesce(v, '');
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $f$;

create function pg_temp.teste() returns void language plpgsql as $f$
declare
  c_t constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  v_ux uuid; v_cux uuid; v_y uuid; g jsonb; r jsonb; t text; d_a uuid; d_b uuid; k_a uuid; v_ids uuid[]; v_md5 text; v_foto text;
begin
  -- usuario comum: gestor de UM cliente que nao e' o Teste, e nao e' admin
  select cm.user_id, cm.cliente_id into v_ux, v_cux from cliente_membros cm join auth.users u on u.id = cm.user_id
   where cm.ativo and cm.perfil = 'gestor_cliente' and cm.cliente_id is distinct from c_t
     and not exists (select 1 from cliente_membros x where x.user_id = cm.user_id and (x.perfil = 'admin_agroinblue' or x.cliente_id = c_t))
   order by cm.user_id limit 1;
  if v_ux is null then raise exception 'E0: sem usuario comum para a prova'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_adm, 'role', 'authenticated')::text, true);
  g := fn_dividendo_criar(c_t, 'SINT DVD A1');
  d_a := (g->'depois'->'dividendo'->>'id')::uuid; k_a := (g->'depois'->'conta'->>'id')::uuid;
  d_b := (fn_dividendo_criar(c_t, 'SINT DVD B1')->'depois'->'dividendo'->>'id')::uuid;
  perform fn_dividendo_inativar(d_b);

  -- ── E9: reordenar ──
  select array_agg(x.id order by x.ordem_exibicao desc, x.created_at desc, x.id desc),
         md5(string_agg(x.id::text || x.nome || x.ativo::text, '|' order by x.id)) into v_ids, v_md5 from financeiro_dividendos x where x.cliente_id = c_t;
  select md5(string_agg(to_jsonb(p)::text, '|' order by p.id)) into v_foto from financeiro_plano_contas p;
  r := fn_dividendo_reordenar(c_t, v_ids);
  if (select array_agg(x.id order by x.ordem_exibicao) from financeiro_dividendos x where x.cliente_id = c_t) is distinct from v_ids
     or r->'depois' is distinct from to_jsonb(v_ids) or r->'antes' = r->'depois'
     or (select md5(string_agg(x.id::text || x.nome || x.ativo::text, '|' order by x.id)) from financeiro_dividendos x where x.cliente_id = c_t) is distinct from v_md5
     or (select md5(string_agg(to_jsonb(p)::text, '|' order by p.id)) from financeiro_plano_contas p) is distinct from v_foto then
    raise exception 'E9: reordenar: %', r; end if;
  r := fn_dividendo_reordenar(c_t, v_ids[2:], true);
  if r->'recusa'->>'motivo' is distinct from 'lista_diferente' then raise exception 'E9: lista curta: %', r; end if;
  r := fn_dividendo_reordenar(c_t, v_ids[2:] || v_ids[2], true);
  if r->'recusa'->>'motivo' is distinct from 'lista_diferente' then raise exception 'E9: lista repetida: %', r; end if;

  -- ── E10: a trava de escrita direta ──
  t := pg_temp.rec($q$insert into financeiro_dividendos (cliente_id, nome, ativo, ordem_exibicao) values ('43f32d07-dba8-4670-900c-bf645440c04a', 'SINT direto', true, 1) returning 'x'$q$)
    || pg_temp.rec(format($q$update financeiro_dividendos set nome = 'SINT direto' where id = %L returning 'x'$q$, d_a))
    || pg_temp.rec(format($q$delete from financeiro_dividendos where id = %L returning 'x'$q$, d_a));
  if t is distinct from repeat('P0001 O cadastro de dividendos só é gravado pela tela de Dividendos, que ajusta o plano de contas junto. Nada foi gravado.', 3) then
    raise exception 'E10: trava: %', t; end if;
  if coalesce(current_setting('app.dividendo_escritor', true), '') = 'on' then raise exception 'E10: a chave ficou ligada'; end if;

  -- ── E11: tenant ──
  perform set_config('request.jwt.claims', json_build_object('sub', v_ux, 'role', 'authenticated')::text, true);
  t := pg_temp.rec(format($q$select fn_dividendo_criar(%L, 'SINT alheio')::text$q$, c_t), true)
    || pg_temp.rec(format($q$select fn_dividendo_renomear(%L, 'SINT alheio')::text$q$, d_a), true)
    || pg_temp.rec(format($q$select fn_dividendo_inativar(%L, true)::text$q$, d_a), true)
    || pg_temp.rec(format($q$select fn_dividendo_reativar(%L, true)::text$q$, d_b), true)
    || pg_temp.rec(format($q$select fn_dividendo_reordenar(%L, %L::uuid[], true)::text$q$, c_t, v_ids), true)
    || pg_temp.rec(format($q$select fn_dividendo_inativar(%L)::text$q$, gen_random_uuid()), true);
  if t is distinct from repeat('42501 sem acesso a este registro', 6) then raise exception 'E11: outro cliente: %', t; end if;
  t := pg_temp.rec(format($q$select fn_dividendo_criar(%L, 'SINT DVD do gestor', true)::text$q$, v_cux), true);
  if t not like 'PASSOU {%' or (substr(t, 8)::jsonb)->'recusa' is distinct from 'null' or (substr(t, 8)::jsonb)->'depois'->'dividendo'->>'nome' is distinct from 'SINT DVD do gestor'
     or exists (select 1 from financeiro_dividendos where nome = 'SINT DVD do gestor') then
    raise exception 'E11: usuario comum no proprio cliente: %', t; end if;
  t := pg_temp.rec($q$select public._fn_dividendo_executar('criar', '{}')::text$q$, true);
  if t not like '42501 permission denied for function%' then raise exception 'E11: interna aberta: %', t; end if;
  perform set_config('request.jwt.claims', '', true);
  t := pg_temp.rec(format($q$select fn_dividendo_criar(%L, 'SINT sem usuario', true)::text$q$, c_t));
  if t is distinct from '42501 sem acesso a este registro' then raise exception 'E11: sem usuario: %', t; end if;

  -- ── E12: cada cliente tem a sua conta ──
  perform set_config('request.jwt.claims', json_build_object('sub', c_adm, 'role', 'authenticated')::text, true);
  insert into clientes (nome) values ('SINT DVD cliente Y') returning id into v_y;
  g := fn_dividendo_criar(v_y, 'SINT DVD A1');
  if (g->'depois'->'conta'->>'id')::uuid is not distinct from k_a or (g->'depois'->'conta'->>'geral')::boolean is not false
     or (select cliente_id from financeiro_plano_contas where id = (g->'depois'->'conta'->>'id')::uuid) is distinct from v_y then
    raise exception 'E12: o segundo cliente nao ganhou conta propria: %', g; end if;
end $f$;

do $t$
begin
  perform pg_temp.teste();
  raise exception 'OK DIVIDENDO-ESCRITOR-UNICO-01 passo 2: E9 a E12';
end $t$;
