-- MAPA-GLOBAL-01 fix1 item 3 · teste da ESTRUTURA do pasto (20261028117020). Fixture: o pasto do cliente Teste (43f32d07, 42d5fdd9),
-- o admin 7bd0b6ad e o usuário de FORA a91962cd. Roda como `postgres`, as chamadas como `authenticated`. TERMINA EM RAISE.
--   T0  catálogo: coluna NOT NULL com padrão 'pasto' e o CHECK dos 3 valores; a função SECURITY DEFINER, search_path fixo, sem EXECUTE
--       para PUBLIC/anon, com EXECUTE para authenticated; o gatilho e a interna fechados; a trilha com RLS só de leitura
--   T1  NADA MARCADO: nenhum pasto do banco fora de 'pasto'
--   T2  prévia (admin): diz de → para e NADA grava
--   T3  gravar 'confinamento' e voltar a 'pasto': a coluna muda, a trilha guarda as 2 trocas com autor e motivo
--   T4  recusas: valor inválido (frase pronta); o mesmo valor = sem mudança, nada gravado
--   T5  o gatilho: UPDATE direto sem o escritor recusa (P0001); com o escritor e valor inválido, o CHECK recusa (23514)
--   T6  o usuário de FORA: a função recusa com 42501 e nada muda
-- Mutações (ensaio, ver o relatório): M1 a função sem o tenant_ok derruba T6 · M2 sem o gatilho derruba T5 · M3 sem o CHECK derruba T5.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '20s';

do $t0$
declare f text := 'public.fn_pasto_estrutura_salvar(uuid, text, text, boolean)';
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pastos' and column_name = 'estrutura'
                 and is_nullable = 'NO' and column_default like '''pasto''%') then
    raise exception 'T0: coluna estrutura sem NOT NULL / padrão pasto';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pastos_estrutura_chk' and conrelid = 'public.pastos'::regclass
                 and pg_get_constraintdef(oid) like '%pasto%confinamento%curral%') then
    raise exception 'T0: sem o CHECK dos 3 valores';
  end if;
  if not (select prosecdef from pg_proc where oid = f::regprocedure)
     or not exists (select 1 from pg_proc p, unnest(p.proconfig) c where p.oid = f::regprocedure and c = 'search_path=pg_catalog, public')
     or has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE')
     or exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f::regprocedure and a.grantee = 0) then
    raise exception 'T0: a função não nasceu fechada';
  end if;
  if has_function_privilege('authenticated', 'public._fn_pastos_estrutura_so_pelo_escritor()', 'EXECUTE') then raise exception 'T0: interna aberta'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_pastos_estrutura_so_pelo_escritor' and tgrelid = 'public.pastos'::regclass) then
    raise exception 'T0: sem o gatilho';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.pasto_estrutura_trilha'::regclass)
     or exists (select 1 from pg_policies where tablename = 'pasto_estrutura_trilha' and cmd <> 'SELECT')
     or has_table_privilege('authenticated', 'public.pasto_estrutura_trilha', 'INSERT') then
    raise exception 'T0: a trilha não é só leitura';
  end if;
end $t0$;

do $t1$
begin
  if exists (select 1 from public.pastos where estrutura <> 'pasto') then
    raise exception 'T1: há pasto marcado: %', (select string_agg(nome, ', ') from public.pastos where estrutura <> 'pasto');
  end if;
end $t1$;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $adm$
declare c constant uuid := '42d5fdd9-c3ee-40f2-9b53-4dce18b84ddb'; r jsonb; v_ok boolean;
begin
  r := public.fn_pasto_estrutura_salvar(c, 'confinamento');
  if not (r->>'simulado')::boolean or r->>'de' <> 'pasto' or r->>'para' <> 'confinamento' then raise exception 'T2: prévia %', r; end if;
  if (select estrutura from public.pastos where id = c) <> 'pasto' then raise exception 'T2: a prévia gravou'; end if;
  r := public.fn_pasto_estrutura_salvar(c, 'confinamento', 'curral de engorda', false);
  if (select estrutura from public.pastos where id = c) <> 'confinamento' then raise exception 'T3: não gravou %', r; end if;
  r := public.fn_pasto_estrutura_salvar(c, 'pasto', 'voltou a pasto', false);
  if (select estrutura from public.pastos where id = c) <> 'pasto'
     or (select count(*) from public.pasto_estrutura_trilha where pasto_id = c and por = '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e'
           and ((de, para, motivo) = ('pasto', 'confinamento', 'curral de engorda') or (de, para, motivo) = ('confinamento', 'pasto', 'voltou a pasto')))
        <> 2 then
    raise exception 'T3: a trilha não guardou as 2 trocas';
  end if;
  v_ok := false;
  begin perform public.fn_pasto_estrutura_salvar(c, 'piscina', null, false);
  exception when sqlstate 'P0001' then v_ok := sqlerrm = 'Escolha a estrutura: pasto, confinamento ou curral.'; end;
  if not v_ok then raise exception 'T4: valor inválido não recusou'; end if;
  r := public.fn_pasto_estrutura_salvar(c, 'pasto', null, false);
  if not coalesce((r->>'sem_mudanca')::boolean, false) or (select count(*) from public.pasto_estrutura_trilha where pasto_id = c) <> 2 then
    raise exception 'T4: o mesmo valor gravou %', r;
  end if;
end $adm$;
reset role;

do $t5$
declare v_ok boolean := false;
begin
  begin update public.pastos set estrutura = 'curral' where id = '42d5fdd9-c3ee-40f2-9b53-4dce18b84ddb';
  exception when sqlstate 'P0001' then v_ok := sqlerrm like 'A estrutura do pasto%'; end;
  if not v_ok then raise exception 'T5: UPDATE direto sem o escritor não recusou'; end if;
  v_ok := false;
  begin
    perform set_config('app.pasto_estrutura_escritor', '1', true);
    update public.pastos set estrutura = 'piscina' where id = '42d5fdd9-c3ee-40f2-9b53-4dce18b84ddb';
  exception when check_violation then v_ok := true; end;
  perform set_config('app.pasto_estrutura_escritor', '', true);
  if not v_ok then raise exception 'T5: o CHECK não recusou um valor inválido'; end if;
end $t5$;

select set_config('request.jwt.claims', '{"sub":"a91962cd-56dd-4729-b2e1-dcd4a1d7b9c9","role":"authenticated"}', true);
set local role authenticated;
do $fora$
declare v_ok boolean := false;
begin
  if public.is_admin_agroinblue(auth.uid()) or coalesce(public.tenant_ok('43f32d07-dba8-4670-900c-bf645440c04a'), false) then
    raise exception 'T6: o usuário a91962cd tem acesso ao Teste — o teste não prova nada';
  end if;
  begin perform public.fn_pasto_estrutura_salvar('42d5fdd9-c3ee-40f2-9b53-4dce18b84ddb', 'curral', 'intruso', false);
  exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'T6: o de fora não levou 42501'; end if;
end $fora$;
reset role;
do $t6b$ begin
  if (select estrutura from public.pastos where id = '42d5fdd9-c3ee-40f2-9b53-4dce18b84ddb') <> 'pasto' then raise exception 'T6: o de fora mudou o pasto'; end if;
end $t6b$;

do $fim$ begin raise exception 'OK mapa_pastos_estrutura (T0–T6: coluna com padrão e CHECK, nada marcado, prévia, gravar e voltar com trilha, recusas, gatilho e CHECK, o de fora recusado)'; end $fim$;
rollback;
