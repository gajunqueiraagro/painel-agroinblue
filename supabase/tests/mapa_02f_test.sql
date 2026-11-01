-- MAPA-02f-a · teste da INFRAESTRUTURA (20261028117010). Fixture SINTÉTICA no cliente Teste (43f32d07, Fazenda Teste Cana c2498ace),
-- gravada pelas próprias RPCs como o admin (7bd0b6ad); o usuário de FORA é a91962cd (não é membro do Teste nem admin). Roda como
-- `postgres`, as chamadas como `authenticated` com as claims do usuário. TERMINA EM RAISE: nada fica no banco.
--   T0  catálogo: RLS ligada nas 2 tabelas, só política de SELECT; authenticated sem INSERT/UPDATE/DELETE; anon sem nada; as 2 RPCs
--       SECURITY DEFINER com search_path fixo, sem EXECUTE para PUBLIC/anon, com EXECUTE para authenticated; as 7 internas fechadas
--       para authenticated; completude (toda `_?fn_infra_*` do catálogo está aqui)
--   T1  prévia de criar: devolve rótulo/forma e NADA grava
--   T2  criar cocho (ponto) com pasto e bem do Patrimônio: grava versão 1, autor = quem está logado, trilha 'criar'
--   T3  cerca (linha): comprimento calculado ≈ 111,2 m (0,001° de latitude)
--   T4  curral (área ≈ 94 × 100 m ≈ 0,94 ha) e curral como ponto (sem área)
--   T5  recusas com frase pronta (P0001): tipo × geometria (3), coordenada fora do globo, coordenada que não é número, contorno aberto,
--       tipo inválido, sem geometria, pasto de outra fazenda, bem de outro cliente
--   T6  editar: versão velha (40001); prévia lista o que muda e nada grava; gravar sobe a versão e a trilha guarda só o que mudou;
--       sem mudança não grava; trocar de fazenda recusa
--   T7  desativar: sem motivo recusa; prévia não grava; gravar desativa com motivo e trilha; de novo recusa; editar desativada recusa
--   T8  o usuário de FORA: não é do Teste (sem isso o teste não prova nada); criar/editar/desativar recusam com 42501; a RLS não mostra
--       nada; INSERT direto e interna recusam (permission denied)
--   T9  nada mudou depois das tentativas do de fora
--   T10 Q4: o mesmo usuário, feito membro comum do Teste (perfil gestor_cliente, não admin), grava
--   T11 o gatilho de coerência pega quem escreve sem as RPCs (pasto de outra fazenda)
-- Mutações (ensaio, ver o relatório): M1 a fn_infra_desativar sem o tenant_ok derruba T8 · M2 sem a conferência tipo × geometria
-- derruba T5 · M3 GRANT de uma interna a authenticated derruba T0 · M4 sem a conferência da versão derruba T6.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '20s';

-- T0 catálogo -----------------------------------------------------------------------------------------------------------------
do $t0$
declare v text; f text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.fazenda_infraestruturas'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.fazenda_infraestrutura_trilha'::regclass) then
    raise exception 'T0: RLS desligada';
  end if;
  select string_agg(tablename || ':' || cmd, ', ') into v from pg_policies
   where schemaname = 'public' and tablename in ('fazenda_infraestruturas', 'fazenda_infraestrutura_trilha') and cmd <> 'SELECT';
  if v is not null then raise exception 'T0: política de escrita: %', v; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename in ('fazenda_infraestruturas', 'fazenda_infraestrutura_trilha')) <> 2 then
    raise exception 'T0: esperadas 2 políticas de SELECT';
  end if;
  foreach f in array array['public.fazenda_infraestruturas', 'public.fazenda_infraestrutura_trilha'] loop
    if has_table_privilege('authenticated', f, 'INSERT') or has_table_privilege('authenticated', f, 'UPDATE')
       or has_table_privilege('authenticated', f, 'DELETE') or not has_table_privilege('authenticated', f, 'SELECT')
       or has_table_privilege('anon', f, 'SELECT') then
      raise exception 'T0: privilégio de tabela errado em %', f;
    end if;
  end loop;
  foreach f in array array['public.fn_infra_salvar(jsonb, boolean, text)', 'public.fn_infra_desativar(uuid, text, boolean)'] loop
    if not (select prosecdef from pg_proc where oid = f::regprocedure) then raise exception 'T0: % não é SECURITY DEFINER', f; end if;
    if not exists (select 1 from pg_proc p, unnest(p.proconfig) c where p.oid = f::regprocedure and c = 'search_path=pg_catalog, public') then
      raise exception 'T0: % sem search_path fixo', f;
    end if;
    if has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE')
       or exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f::regprocedure and a.grantee = 0) then
      raise exception 'T0: EXECUTE errado em % (PUBLIC/anon não; authenticated sim)', f;
    end if;
  end loop;
  foreach f in array array['public._fn_infra_rotulo(text)', 'public._fn_infra_formas(text)', 'public._fn_infra_posicao_ok(jsonb)',
      'public._fn_infra_geometria_erro(text, jsonb)', 'public._fn_infra_comprimento_m(jsonb)', 'public._fn_infra_area_ha(jsonb)',
      'public._fn_infra_coerencia()'] loop
    if has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') then
      raise exception 'T0: interna % aberta', f;
    end if;
  end loop;
  select string_agg(p.proname, ', ') into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname ~ '^_?fn_infra_' and p.proname not in ('fn_infra_salvar', 'fn_infra_desativar',
     '_fn_infra_rotulo', '_fn_infra_formas', '_fn_infra_posicao_ok', '_fn_infra_geometria_erro', '_fn_infra_comprimento_m',
     '_fn_infra_area_ha', '_fn_infra_coerencia');
  if v is not null then raise exception 'T0: função da infraestrutura fora do teste: %', v; end if;
end $t0$;

-- fixture e T1–T7 como o ADMIN -------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $adm$
declare
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_pasto constant uuid := '42d5fdd9-c3ee-40f2-9b53-4dce18b84ddb';
  r jsonb; v_bem uuid; v_cocho uuid; v_cerca uuid; v_curral uuid; n int; c record; v_ok boolean;
begin
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', '43f32d07-dba8-4670-900c-bf645440c04a', 'fazenda_id', c_faz,
         'categoria_id', (select id from public.patrimonio_categorias where cliente_id is null and codigo = 'instalacoes'),
         'descricao', 'Cochos sintéticos 02f', 'situacao', 'em_uso', 'em_uso_desde', '2024-01-01', 'atividade', 'pecuaria'), false);
  v_bem := (r->>'id')::uuid;

  -- T1 prévia
  r := public.fn_infra_salvar(jsonb_build_object('fazenda_id', c_faz, 'tipo', 'cocho', 'nome', 'Cocho sintético 02f',
         'geometria', '{"type":"Point","coordinates":[-47.0,-20.0]}'::jsonb));
  if not (r->>'simulado')::boolean or r->>'rotulo' <> 'Cocho' or r->>'forma' <> 'Point' then raise exception 'T1: prévia errada: %', r; end if;
  if exists (select 1 from public.fazenda_infraestruturas where nome = 'Cocho sintético 02f') then raise exception 'T1: a prévia gravou'; end if;

  -- T2 criar cocho com pasto e bem
  r := public.fn_infra_salvar(jsonb_build_object('fazenda_id', c_faz, 'tipo', 'cocho', 'nome', 'Cocho sintético 02f', 'pasto_id', c_pasto,
         'bem_id', v_bem, 'geometria', '{"type":"Point","coordinates":[-47.0,-20.0]}'::jsonb), false);
  v_cocho := (r->>'id')::uuid;
  if (r->>'versao')::int <> 1 then raise exception 'T2: versão %', r; end if;
  if not exists (select 1 from public.fazenda_infraestruturas where id = v_cocho and cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a'
                 and pasto_id = c_pasto and bem_id = v_bem and ativo and criado_por = '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e'
                 and comprimento_m is null and area_ha is null) then
    raise exception 'T2: linha gravada errada';
  end if;
  if (select count(*) from public.fazenda_infraestrutura_trilha where infra_id = v_cocho and acao = 'criar') <> 1 then raise exception 'T2: trilha'; end if;

  -- T3 cerca
  r := public.fn_infra_salvar(jsonb_build_object('fazenda_id', c_faz, 'tipo', 'cerca', 'nome', 'Cerca sintética 02f',
         'geometria', '{"type":"LineString","coordinates":[[-47.0,-20.0],[-47.0,-20.001]]}'::jsonb), false);
  v_cerca := (r->>'id')::uuid;
  if (select comprimento_m from public.fazenda_infraestruturas where id = v_cerca) not between 111.0 and 111.4 then
    raise exception 'T3: comprimento %', (select comprimento_m from public.fazenda_infraestruturas where id = v_cerca);
  end if;

  -- T4 curral área e curral ponto
  r := public.fn_infra_salvar(jsonb_build_object('fazenda_id', c_faz, 'tipo', 'curral', 'nome', 'Curral sintético 02f',
         'geometria', '{"type":"Polygon","coordinates":[[[-47.0,-20.0],[-46.9991,-20.0],[-46.9991,-20.0009],[-47.0,-20.0009],[-47.0,-20.0]]]}'::jsonb), false);
  v_curral := (r->>'id')::uuid;
  if (select area_ha from public.fazenda_infraestruturas where id = v_curral) not between 0.93 and 0.95 then
    raise exception 'T4: área %', (select area_ha from public.fazenda_infraestruturas where id = v_curral);
  end if;
  r := public.fn_infra_salvar(jsonb_build_object('fazenda_id', c_faz, 'tipo', 'curral', 'geometria', '{"type":"Point","coordinates":[-47.0,-20.0]}'::jsonb), true);
  if r->>'forma' <> 'Point' or r->'area_ha' <> 'null'::jsonb then raise exception 'T4: curral ponto %', r; end if;

  -- T5 recusas
  for c in select * from (values
      ('cocho', '{"type":"LineString","coordinates":[[-47,-20],[-47,-20.001]]}', null::uuid, null::uuid, 'Cocho se marca no mapa como um ponto.'),
      ('cerca', '{"type":"Point","coordinates":[-47,-20]}', null, null, 'Cerca se marca no mapa como uma linha.'),
      ('energia', '{"type":"Polygon","coordinates":[[[-47,-20],[-46.99,-20],[-46.99,-20.01],[-47,-20]]]}', null, null, 'Energia se marca no mapa como um ponto ou uma linha.'),
      ('poco', '{"type":"Point","coordinates":[-47,95]}', null, null, 'O ponto tem coordenadas inválidas.'),
      ('poco', '{"type":"Point","coordinates":["a","b"]}', null, null, 'O ponto tem coordenadas inválidas.'),
      ('galpao', '{"type":"Polygon","coordinates":[[[-47,-20],[-46.99,-20],[-46.99,-20.01],[-47,-20.01]]]}', null, null, 'O contorno da área precisa fechar (o último ponto igual ao primeiro).'),
      ('piscina', '{"type":"Point","coordinates":[-47,-20]}', null, null, 'Tipo de infraestrutura inválido.'),
      ('cocho', null, null, null, 'Marque a infraestrutura no mapa.'),
      ('cocho', '{"type":"Point","coordinates":[-47,-20]}', (select p.id from public.pastos p where p.fazenda_id <> c_faz limit 1), null, 'O pasto escolhido não é desta fazenda.'),
      ('cocho', '{"type":"Point","coordinates":[-47,-20]}', null, (select b.id from public.patrimonio_bens b where b.cliente_id <> '43f32d07-dba8-4670-900c-bf645440c04a' limit 1), 'O bem do Patrimônio escolhido não é desta fazenda.')
    ) t(tipo, geo, pasto, bem, msg) loop
    v_ok := false;
    begin
      perform public.fn_infra_salvar(jsonb_build_object('fazenda_id', c_faz, 'tipo', c.tipo, 'geometria', c.geo::jsonb, 'pasto_id', c.pasto, 'bem_id', c.bem), true);
    exception when sqlstate 'P0001' then
      if sqlerrm <> c.msg then raise exception 'T5 (%): recusou com "%", esperado "%"', c.tipo, sqlerrm, c.msg; end if;
      v_ok := true;
    end;
    if not v_ok then raise exception 'T5 (%): não recusou (esperado "%")', c.tipo, c.msg; end if;
  end loop;

  -- T6 editar
  v_ok := false;
  begin perform public.fn_infra_salvar(jsonb_build_object('id', v_cocho, 'versao', 0, 'nome', 'x'), true);
  exception when sqlstate '40001' then v_ok := true; end;
  if not v_ok then raise exception 'T6: versão velha não recusou'; end if;
  r := public.fn_infra_salvar(jsonb_build_object('id', v_cocho, 'versao', 1, 'nome', 'Cocho do P sintético'), true);
  if r->'muda' <> '["nome"]'::jsonb then raise exception 'T6: prévia muda %', r->'muda'; end if;
  if (select nome from public.fazenda_infraestruturas where id = v_cocho) <> 'Cocho sintético 02f' then raise exception 'T6: a prévia gravou'; end if;
  r := public.fn_infra_salvar(jsonb_build_object('id', v_cocho, 'versao', 1, 'nome', 'Cocho do P sintético',
         'geometria', '{"type":"Point","coordinates":[-47.0005,-20.0]}'::jsonb), false, 'mudou de lugar');
  if (r->>'versao')::int <> 2 then raise exception 'T6: versão depois %', r; end if;
  select count(*) into n from public.fazenda_infraestrutura_trilha t where t.infra_id = v_cocho and t.acao = 'alterar'
     and t.antes = jsonb_build_object('nome', 'Cocho sintético 02f', 'geometria', '{"type":"Point","coordinates":[-47.0,-20.0]}'::jsonb)
     and (t.depois ? 'nome') and (t.depois ? 'geometria') and not (t.depois ? 'tipo') and t.motivo = 'mudou de lugar';
  if n <> 1 then raise exception 'T6: trilha do alterar'; end if;
  r := public.fn_infra_salvar(jsonb_build_object('id', v_cocho, 'versao', 2, 'nome', 'Cocho do P sintético'), false);
  if not coalesce((r->>'sem_mudanca')::boolean, false) or (select versao from public.fazenda_infraestruturas where id = v_cocho) <> 2 then
    raise exception 'T6: sem mudança gravou %', r;
  end if;
  v_ok := false;
  begin perform public.fn_infra_salvar(jsonb_build_object('id', v_cocho, 'versao', 2, 'fazenda_id', gen_random_uuid()), true);
  exception when sqlstate 'P0001' then v_ok := sqlerrm like 'A infraestrutura não muda de fazenda%'; end;
  if not v_ok then raise exception 'T6: trocar de fazenda não recusou'; end if;

  -- T7 desativar
  v_ok := false;
  begin perform public.fn_infra_desativar(v_curral, '  ', false);
  exception when sqlstate 'P0001' then v_ok := sqlerrm = 'Diga o motivo de desativar.'; end;
  if not v_ok then raise exception 'T7: sem motivo não recusou'; end if;
  r := public.fn_infra_desativar(v_curral, 'demolido', true);
  if not (select ativo from public.fazenda_infraestruturas where id = v_curral) then raise exception 'T7: a prévia desativou'; end if;
  r := public.fn_infra_desativar(v_curral, 'demolido', false);
  if not exists (select 1 from public.fazenda_infraestruturas where id = v_curral and not ativo and desativado_motivo = 'demolido'
                 and desativado_por = '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e')
     or (select count(*) from public.fazenda_infraestrutura_trilha where infra_id = v_curral and acao = 'desativar' and motivo = 'demolido') <> 1 then
    raise exception 'T7: desativar não gravou certo';
  end if;
  v_ok := false;
  begin perform public.fn_infra_desativar(v_curral, 'de novo', false);
  exception when sqlstate 'P0001' then v_ok := sqlerrm = 'Esta infraestrutura já está desativada.'; end;
  if not v_ok then raise exception 'T7: desativar de novo não recusou'; end if;
  v_ok := false;
  begin perform public.fn_infra_salvar(jsonb_build_object('id', v_curral, 'versao', 2, 'nome', 'x'), true);
  exception when sqlstate 'P0001' then v_ok := sqlerrm = 'Esta infraestrutura está desativada: não se edita.'; end;
  if not v_ok then raise exception 'T7: editar desativada não recusou'; end if;

  perform set_config('teste.cocho', v_cocho::text, true);
  perform set_config('teste.cerca', v_cerca::text, true);
end $adm$;
reset role;

-- T8 o usuário de FORA ------------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a91962cd-56dd-4729-b2e1-dcd4a1d7b9c9","role":"authenticated"}', true);
set local role authenticated;
do $fora$
declare c record; v text; n_ok int := 0; falhas text := '';
begin
  if public.is_admin_agroinblue(auth.uid()) or coalesce(public.tenant_ok('43f32d07-dba8-4670-900c-bf645440c04a'), false) then
    raise exception 'T8: o usuário a91962cd tem acesso ao Teste — o teste não prova nada';
  end if;
  for c in select * from (values
      ('criar', $q$select public.fn_infra_salvar(jsonb_build_object('fazenda_id', 'c2498ace-8478-410c-a697-d3f2e2934d1f', 'tipo', 'cocho', 'nome', 'Intruso 02f', 'geometria', '{"type":"Point","coordinates":[-47,-20]}'::jsonb), false)::text$q$),
      ('editar', $q$select public.fn_infra_salvar(jsonb_build_object('id', current_setting('teste.cocho'), 'versao', 2, 'nome', 'Intruso 02f'), false)::text$q$),
      ('desativar', $q$select public.fn_infra_desativar(current_setting('teste.cerca')::uuid, 'intruso', false)::text$q$),
      ('insert direto', $q$insert into public.fazenda_infraestruturas (cliente_id, fazenda_id, tipo, geometria, nome) values ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f', 'cocho', '{"type":"Point","coordinates":[-47,-20]}', 'Intruso 02f') returning id::text$q$),
      ('interna', $q$select public._fn_infra_area_ha('{"type":"Point","coordinates":[-47,-20]}')::text$q$)
    ) t(nome, sql) loop
    begin
      execute c.sql into v;
      falhas := falhas || format(E'\n  %s ATENDEU o usuário de fora (%s)', c.nome, coalesce(v, 'null'));
    exception
      when insufficient_privilege then n_ok := n_ok + 1;
      when others then falhas := falhas || format(E'\n  %s recusou com %s (%s), não 42501', c.nome, sqlstate, sqlerrm);
    end;
  end loop;
  if falhas <> '' then raise exception 'T8 (% de 5 recusaram com 42501):%', n_ok, falhas; end if;
  if (select count(*) from public.fazenda_infraestruturas) <> 0 or (select count(*) from public.fazenda_infraestrutura_trilha) <> 0 then
    raise exception 'T8: a RLS mostrou infraestrutura do Teste ao de fora';
  end if;
end $fora$;
reset role;

-- T9 nada mudou --------------------------------------------------------------------------------------------------------------------
do $t9$
begin
  if exists (select 1 from public.fazenda_infraestruturas where nome = 'Intruso 02f') then raise exception 'T9: o de fora gravou'; end if;
  if (select versao from public.fazenda_infraestruturas where id = current_setting('teste.cocho')::uuid) <> 2 then raise exception 'T9: o de fora editou'; end if;
  if not (select ativo from public.fazenda_infraestruturas where id = current_setting('teste.cerca')::uuid) then raise exception 'T9: o de fora desativou'; end if;
end $t9$;

-- T10 Q4: membro comum do cliente grava ---------------------------------------------------------------------------------------
insert into public.cliente_membros (user_id, cliente_id, perfil, ativo)
values ('a91962cd-56dd-4729-b2e1-dcd4a1d7b9c9', '43f32d07-dba8-4670-900c-bf645440c04a', 'gestor_cliente', true);
select set_config('request.jwt.claims', '{"sub":"a91962cd-56dd-4729-b2e1-dcd4a1d7b9c9","role":"authenticated"}', true);
set local role authenticated;
do $t10$
declare r jsonb;
begin
  if public.is_admin_agroinblue(auth.uid()) then raise exception 'T10: o usuário é admin — não prova o perfil comum'; end if;
  r := public.fn_infra_salvar(jsonb_build_object('fazenda_id', 'c2498ace-8478-410c-a697-d3f2e2934d1f', 'tipo', 'bebedouro',
         'nome', 'Bebedouro do membro 02f', 'geometria', '{"type":"Point","coordinates":[-47.001,-20.0]}'::jsonb), false);
  if (r->>'versao')::int <> 1 or (select count(*) from public.fazenda_infraestruturas where cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a') <> 4 then
    raise exception 'T10: o membro não gravou ou não vê as 4 do Teste: %', r;
  end if;
end $t10$;
reset role;

-- T11 o gatilho pega quem escreve sem as RPCs -----------------------------------------------------------------------------------
do $t11$
declare v_ok boolean := false;
begin
  begin
    insert into public.fazenda_infraestruturas (cliente_id, fazenda_id, tipo, geometria, pasto_id)
    values ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f', 'cocho', '{"type":"Point","coordinates":[-47,-20]}',
            (select p.id from public.pastos p where p.fazenda_id <> 'c2498ace-8478-410c-a697-d3f2e2934d1f' limit 1));
  exception when sqlstate 'P0001' then v_ok := sqlerrm = 'O pasto escolhido não é desta fazenda.'; end;
  if not v_ok then raise exception 'T11: o gatilho não recusou o pasto de outra fazenda'; end if;
end $t11$;

do $fim$ begin raise exception 'OK mapa_02f (T0–T11: catálogo fechado, criar/editar/desativar com prévia e trilha, 10 recusas, o de fora recusado em 5 portas, o membro comum grava, o gatilho pega a escrita direta)'; end $fim$;
rollback;
