-- MAPA-AREA-TIPO-01 · teste da classificação dos polígonos (20261028117030). Fixture SINTÉTICA no cliente Teste (43f32d07, Fazenda Teste Cana
-- c2498ace, pasto "Talhao 01" 42d5fdd9), gravada pelas próprias funções como o admin (7bd0b6ad); o usuário de FORA é a91962cd.
-- Roda como `postgres`, as chamadas como `authenticated`. TERMINA EM RAISE: nada fica no banco.
--   T0  catálogo: o CHECK com os 12 tipos; o escritor fechado (SECURITY DEFINER, search_path, sem PUBLIC/anon, com authenticated); memória e
--       trilha com RLS só de leitura; o "Atualizar mapa" segue INVOKER, sem anon
--   T1  classificar um polígono sem classificação como "curral": a prévia não grava; gravar muda o tipo, lembra e deixa trilha
--   T2  trocar o tipo (curral → confinamento): a memória acompanha
--   T3  voltar a "sem classificação": a memória é esquecida
--   T4  trocar entre área e pasto (reserva legal → pasto → APP): o pasto liga e desliga
--   T5  recusas com frase pronta: tipo que não é tipo (erosão), pasto sem escolher, pasto de outra fazenda, pasto já ligado a outro polígono
--   T6  o usuário de FORA: 42501 e nada muda
--   T7  o "Atualizar mapa" NÃO apaga a classificação: o mesmo arquivo de novo, tudo sem classificação → as 3 lembradas voltam (área, área e
--       pasto); a escolha explícita do arquivo vence a lembrada; o reimport não escreve na memória
-- Mutações (ensaio, ver o relatório): M1 o escritor sem o tenant_ok derruba T6 · M2 o "Atualizar mapa" sem o bloco "lembradas" derruba T7 ·
-- M3 voltar a "sem classificação" sem esquecer a memória derruba T3.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '20s';

do $t0$
declare f text := 'public.fn_mapa_geometria_classificar(uuid, text, uuid, text, boolean)'; s text := 'public.fn_mapa_fazenda_substituir(uuid, jsonb)';
begin
  -- MAPA-AREA-TIPOS-02 (20261028117120): a trava lê do catálogo único; os 12 de antes continuam valendo
  if (select pg_get_constraintdef(oid) from pg_constraint where conname = 'fazenda_geometrias_tipo_check') not like '%_fn_mapa_tipo_rotulo%'
     or exists (select 1 from unnest(array['pasto', 'outra', 'area_total', 'area_fazenda', 'area_sem_uso', 'reserva_legal', 'app', 'varzea_brejo',
                'benfeitoria', 'estrada', 'curral', 'confinamento']) t where public._fn_mapa_tipo_rotulo(t) is null) then
    raise exception 'T0: o CHECK de tipo não tem os 12';
  end if;
  if not (select prosecdef from pg_proc where oid = f::regprocedure)
     or not exists (select 1 from pg_proc p, unnest(p.proconfig) c where p.oid = f::regprocedure and c = 'search_path=pg_catalog, public')
     or has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE')
     or exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f::regprocedure and a.grantee = 0) then
    raise exception 'T0: o escritor não nasceu fechado';
  end if;
  if has_function_privilege('authenticated', 'public._fn_mapa_tipo_rotulo(text)', 'EXECUTE') then raise exception 'T0: interna aberta'; end if;
  if exists (select 1 from pg_policies where tablename in ('fazenda_geometria_classificacoes', 'fazenda_geometria_trilha') and cmd <> 'SELECT')
     or has_table_privilege('authenticated', 'public.fazenda_geometria_classificacoes', 'INSERT')
     or has_table_privilege('authenticated', 'public.fazenda_geometria_trilha', 'INSERT') then
    raise exception 'T0: memória/trilha não são só leitura';
  end if;
  if (select prosecdef from pg_proc where oid = s::regprocedure) or has_function_privilege('anon', s, 'EXECUTE') then
    raise exception 'T0: o "Atualizar mapa" mudou de SECURITY ou abriu para anon';
  end if;
end $t0$;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $adm$
declare
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f'; c_pasto constant uuid := '42d5fdd9-c3ee-40f2-9b53-4dce18b84ddb';
  q constant jsonb := '{"type":"Polygon","coordinates":[[[-47,-20],[-46.999,-20],[-46.999,-20.001],[-47,-20]]]}';
  r jsonb; v_curral uuid; v_mata uuid; v_pasto_um uuid; v_ok boolean; n int;
begin
  -- fixture: o mapa com 3 polígonos sem classificação
  r := public.fn_mapa_fazenda_substituir(c_faz, jsonb_build_array(
    jsonb_build_object('tipo', 'outra', 'nome_original', 'Curral Velho', 'geojson', q),
    jsonb_build_object('tipo', 'outra', 'nome_original', 'Mata do Fundo', 'geojson', q),
    jsonb_build_object('tipo', 'outra', 'nome_original', 'Pasto Um', 'geojson', q)));
  select id into v_curral from public.fazenda_geometrias where fazenda_id = c_faz and nome_original = 'Curral Velho';
  select id into v_mata from public.fazenda_geometrias where fazenda_id = c_faz and nome_original = 'Mata do Fundo';
  select id into v_pasto_um from public.fazenda_geometrias where fazenda_id = c_faz and nome_original = 'Pasto Um';

  -- T1
  r := public.fn_mapa_geometria_classificar(v_curral, 'curral');
  if not (r->>'simulado')::boolean or r->'para'->>'rotulo' <> 'Curral' or r->'de'->>'rotulo' <> 'Sem classificação' then raise exception 'T1: prévia %', r; end if;
  if (select tipo from public.fazenda_geometrias where id = v_curral) <> 'outra' then raise exception 'T1: a prévia gravou'; end if;
  r := public.fn_mapa_geometria_classificar(v_curral, 'curral', null, 'é o curral velho', false);
  if (select tipo from public.fazenda_geometrias where id = v_curral) <> 'curral'
     or not exists (select 1 from public.fazenda_geometria_classificacoes where fazenda_id = c_faz and nome_original = 'Curral Velho' and tipo = 'curral')
     or (select count(*) from public.fazenda_geometria_trilha where geometria_id = v_curral and motivo = 'é o curral velho'
           and por = '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e') <> 1 then
    raise exception 'T1: não gravou tipo/memória/trilha';
  end if;
  -- T2
  r := public.fn_mapa_geometria_classificar(v_curral, 'confinamento', null, null, false);
  if (select tipo from public.fazenda_geometria_classificacoes where fazenda_id = c_faz and nome_original = 'Curral Velho') <> 'confinamento' then
    raise exception 'T2: a memória não acompanhou';
  end if;
  -- T3
  r := public.fn_mapa_geometria_classificar(v_curral, 'outra', null, null, false);
  if (select tipo from public.fazenda_geometrias where id = v_curral) <> 'outra'
     or exists (select 1 from public.fazenda_geometria_classificacoes where fazenda_id = c_faz and nome_original = 'Curral Velho') then
    raise exception 'T3: voltar a sem classificação não esqueceu a memória';
  end if;
  -- T4
  r := public.fn_mapa_geometria_classificar(v_mata, 'reserva_legal', null, null, false);
  r := public.fn_mapa_geometria_classificar(v_mata, 'pasto', c_pasto, null, false);
  if (select pasto_id from public.fazenda_geometrias where id = v_mata) is distinct from c_pasto then raise exception 'T4: não ligou o pasto'; end if;
  r := public.fn_mapa_geometria_classificar(v_mata, 'app', null, null, false);
  if (select (tipo, pasto_id) from public.fazenda_geometrias where id = v_mata) is distinct from ('app'::text, null::uuid) then
    raise exception 'T4: não desligou o pasto';
  end if;
  -- T5
  r := public.fn_mapa_geometria_classificar(v_pasto_um, 'pasto', c_pasto, null, false);
  for r in select jsonb_build_object('tipo', t.tipo, 'pasto', t.pasto, 'msg', t.msg, 'geo', t.geo) from (values
      ('erosao', null::uuid, 'Escolha o que é: pasto, um tipo de área ou sem classificação.', v_curral),
      ('pasto', null, 'Escolha o pasto.', v_curral),
      ('pasto', (select p.id from public.pastos p where p.fazenda_id <> c_faz limit 1), 'O pasto escolhido não é desta fazenda.', v_curral),
      ('pasto', c_pasto, 'O pasto "Talhao 01" já está ligado ao polígono "Pasto Um". Desvincule lá antes.', v_curral)
    ) t(tipo, pasto, msg, geo) loop
    v_ok := false;
    begin perform public.fn_mapa_geometria_classificar((r->>'geo')::uuid, r->>'tipo', (r->>'pasto')::uuid, null, true);
    exception when sqlstate 'P0001' then
      if sqlerrm <> r->>'msg' then raise exception 'T5 (%): recusou com "%", esperado "%"', r->>'tipo', sqlerrm, r->>'msg'; end if;
      v_ok := true;
    end;
    if not v_ok then raise exception 'T5 (%): não recusou', r->>'msg'; end if;
  end loop;

  perform set_config('teste.curral', v_curral::text, true);
  perform set_config('teste.mata', v_mata::text, true);
end $adm$;
reset role;

-- T6 o usuário de FORA
select set_config('request.jwt.claims', '{"sub":"a91962cd-56dd-4729-b2e1-dcd4a1d7b9c9","role":"authenticated"}', true);
set local role authenticated;
do $fora$
declare v_ok boolean := false;
begin
  if public.is_admin_agroinblue(auth.uid()) or coalesce(public.tenant_ok('43f32d07-dba8-4670-900c-bf645440c04a'), false) then
    raise exception 'T6: o usuário a91962cd tem acesso ao Teste — o teste não prova nada';
  end if;
  begin perform public.fn_mapa_geometria_classificar(current_setting('teste.curral')::uuid, 'curral', null, 'intruso', false);
  exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'T6: o de fora não levou 42501'; end if;
end $fora$;
reset role;
do $t6b$ begin
  if (select tipo from public.fazenda_geometrias where id = current_setting('teste.curral')::uuid) <> 'outra' then raise exception 'T6: o de fora mudou'; end if;
end $t6b$;

-- T7 o "Atualizar mapa" não apaga a classificação
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $t7$
declare
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f'; c_pasto constant uuid := '42d5fdd9-c3ee-40f2-9b53-4dce18b84ddb';
  q constant jsonb := '{"type":"Polygon","coordinates":[[[-47,-20],[-46.999,-20],[-46.999,-20.001],[-47,-20]]]}';
  r jsonb; v_mem int;
begin
  perform public.fn_mapa_geometria_classificar(current_setting('teste.curral')::uuid, 'curral', null, null, false);
  -- agora: Curral Velho = curral, Mata do Fundo = app, Pasto Um = pasto (Talhao 01)
  select count(*) into v_mem from public.fazenda_geometria_classificacoes where fazenda_id = c_faz;
  r := public.fn_mapa_fazenda_substituir(c_faz, jsonb_build_array(
    jsonb_build_object('tipo', 'outra', 'nome_original', 'curral velho', 'geojson', q),      -- caixa diferente: casa pelo nome normalizado
    jsonb_build_object('tipo', 'outra', 'nome_original', 'Mata do Fundo', 'geojson', q),
    jsonb_build_object('tipo', 'outra', 'nome_original', 'Pasto Um', 'geojson', q)));
  if (r->>'classificacoes_mantidas')::int <> 3 then raise exception 'T7: mantidas % (esperadas 3): %', r->>'classificacoes_mantidas', r; end if;
  if (select tipo from public.fazenda_geometrias where fazenda_id = c_faz and nome_original = 'curral velho') <> 'curral'
     or (select tipo from public.fazenda_geometrias where fazenda_id = c_faz and nome_original = 'Mata do Fundo') <> 'app'
     or (select pasto_id from public.fazenda_geometrias where fazenda_id = c_faz and nome_original = 'Pasto Um') is distinct from c_pasto then
    raise exception 'T7: o reimport apagou a classificação';
  end if;
  -- a escolha explícita vence
  r := public.fn_mapa_fazenda_substituir(c_faz, jsonb_build_array(
    jsonb_build_object('tipo', 'outra', 'nome_original', 'Curral Velho', 'geojson', q),
    jsonb_build_object('tipo', 'estrada', 'nome_original', 'Mata do Fundo', 'geojson', q),
    jsonb_build_object('tipo', 'outra', 'nome_original', 'Pasto Um', 'geojson', q)));
  if (select tipo from public.fazenda_geometrias where fazenda_id = c_faz and nome_original = 'Mata do Fundo') <> 'estrada'
     or (r->>'classificacoes_mantidas')::int <> 2 then
    raise exception 'T7: a escolha explícita não venceu: %', r;
  end if;
  if (select count(*) from public.fazenda_geometria_classificacoes where fazenda_id = c_faz) <> v_mem
     or (select tipo from public.fazenda_geometria_classificacoes where fazenda_id = c_faz and nome_original = 'Mata do Fundo') <> 'app' then
    raise exception 'T7: o reimport escreveu na memória';
  end if;
end $t7$;
reset role;

do $fim$ begin raise exception 'OK mapa_area_tipo (T0–T7: 12 tipos, escritor fechado, classificar/trocar/voltar/pasto↔área com prévia, memória e trilha, 4 recusas, o de fora recusado, o "Atualizar mapa" mantém as 3 classificações e a escolha explícita vence)'; end $fim$;
rollback;
