-- MAPA-PIQUETES-MANUAL-01 (3) · teste da 115260 (fn_pasto_renomear). Numa query só, termina em RAISE 'OK…' (nada fica no banco). Fixture
-- SINTÉTICO no cliente Teste (43f32d07), chamadas como `authenticated` (membro real do cliente); o de fora é um membro de OUTRO cliente.
do $$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v_faz uuid; v_membro uuid; v_fora uuid; r jsonb; pA uuid; pB uuid; gA uuid; vA int; n0 int;
begin
  select id into strict v_faz from public.fazendas where cliente_id = c_cli and nome = 'Fazenda Teste Cana';
  select m.user_id into strict v_membro from public.cliente_membros m where m.cliente_id = c_cli and m.ativo limit 1;
  select m.user_id into v_fora from public.cliente_membros m
   where m.cliente_id <> c_cli and m.ativo and not coalesce(public.is_admin_agroinblue(m.user_id), false)
     and not exists (select 1 from public.cliente_membros x where x.user_id = m.user_id and x.cliente_id = c_cli) limit 1;

  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo) values (v_faz, c_cli, 'TESTE-PQR A', 10, 'cria', true) returning id into pA;
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo) values (v_faz, c_cli, 'TESTE-PQR Brejão', 10, 'cria', false) returning id into pB;
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson)
  values (v_faz, c_cli, 'pasto', pA, 'TESTE-PQR A', '{"type":"Polygon","coordinates":[[[-48.50,-15.60],[-48.49,-15.60],[-48.49,-15.59],[-48.50,-15.59],[-48.50,-15.60]]]}')
  returning id, versao into gA, vA;

  perform set_config('request.jwt.claims', json_build_object('sub', v_membro, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n0 from public.audit_log where registro_id = pA;

  -- T1 prévia: diz o que muda e nada muda
  r := public.fn_pasto_renomear(pA, '  TESTE-PQR   Novo ', true);
  if not (r->>'simulado')::boolean or r->'pasto'->>'nome' <> 'TESTE-PQR Novo' or jsonb_array_length(r->'poligonos') <> 1
     or (select nome from public.pastos where id = pA) <> 'TESTE-PQR A'
     or (select nome_original from public.fazenda_geometrias where id = gA) <> 'TESTE-PQR A'
     or (select count(*) from public.audit_log where registro_id = pA) <> n0 then
    raise exception 'T1 prévia: %', r;
  end if;
  -- T2 grava: o pasto e o polígono ligado, com trilha (o antes)
  r := public.fn_pasto_renomear(pA, 'TESTE-PQR Novo', false);
  if (select nome from public.pastos where id = pA) <> 'TESTE-PQR Novo'
     or (select nome_original from public.fazenda_geometrias where id = gA) <> 'TESTE-PQR Novo'
     or (select versao from public.fazenda_geometrias where id = gA) = vA
     or not exists (select 1 from public.audit_log where registro_id = pA and acao = 'pasto_renomear' and dados_anteriores->>'nome' = 'TESTE-PQR A') then
    raise exception 'T2 gravar: %', r;
  end if;
  -- T3 recusas: vazio; nome de outro pasto da fazenda (inativo, sem acento/caixa); longo demais
  begin perform public.fn_pasto_renomear(pA, '   ', true); raise exception 'T3 vazio passou';
  exception when sqlstate 'P0001' then if sqlerrm not like 'Dê um nome%' then raise exception 'T3 vazio frase: %', sqlerrm; end if; end;
  begin perform public.fn_pasto_renomear(pA, 'teste-pqr brejao', true); raise exception 'T3 repetido passou';
  exception when sqlstate 'P0001' then if sqlerrm not like 'Já existe o pasto "TESTE-PQR Brejão"%' then raise exception 'T3 repetido frase: %', sqlerrm; end if; end;
  begin perform public.fn_pasto_renomear(pA, repeat('x', 121), true); raise exception 'T3 longo passou';
  exception when sqlstate 'P0001' then if sqlerrm not like '%120 letras%' then raise exception 'T3 longo frase: %', sqlerrm; end if; end;
  -- T4 o mesmo nome: nada a gravar
  r := public.fn_pasto_renomear(pA, 'TESTE-PQR Novo', false);
  if (r->>'mudou')::boolean then raise exception 'T4 mesmo nome: %', r; end if;
  -- T5 quem é de outro cliente: 42501
  if v_fora is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_fora, 'role', 'authenticated')::text, true);
    begin perform public.fn_pasto_renomear(pA, 'TESTE-PQR Invasor', true); raise exception 'T5 de fora passou';
    exception when sqlstate '42501' then
      if sqlerrm <> 'sem acesso a este registro' then raise exception 'T5 recusou por outro motivo: %', sqlerrm; end if;
    end;
  end if;
  -- T6 nasce fechada
  execute 'reset role';
  if has_function_privilege('anon', 'public.fn_pasto_renomear(uuid,text,boolean)', 'execute') then raise exception 'T6 aberta para anon'; end if;
  if not has_function_privilege('authenticated', 'public.fn_pasto_renomear(uuid,text,boolean)', 'execute') then raise exception 'T6 authenticated não executa'; end if;

  raise exception 'OK MAPA-PIQUETES-MANUAL-01 (3) 115260: T1–T6 (prévia, grava pasto + polígono com trilha, recusas, mesmo nome, de fora 42501, fechada)%',
    case when v_fora is null then ' — T5 sem membro de fora' else '' end;
end $$;
