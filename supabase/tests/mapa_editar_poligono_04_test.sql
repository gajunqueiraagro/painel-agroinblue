-- MAPA-EDITAR-POLIGONO-04 — teste da 115200 (unir vários num gesto). Roda depois da migration, numa query só, e termina em RAISE 'OK…'
-- (nada fica no banco). Fixture sintético no cliente Teste (43f32d07): 4 quadrados (Q1 com pasto, Q3 com outro pasto); as chamadas rodam
-- como `authenticated` (claims de um membro real do cliente Teste).
do $$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v_faz uuid; v_membro uuid; p1 uuid; p3 uuid; g1 uuid; g2 uuid; g3 uuid; g4 uuid; r jsonb; v_gesto uuid;
  quad constant text := '{"type":"Polygon","coordinates":[[[%s,%s],[%s,%s],[%s,%s],[%s,%s],[%s,%s]]]}';
  u jsonb := format('{"type":"Polygon","coordinates":[[[%s,%s],[%s,%s],[%s,%s],[%s,%s],[%s,%s]]]}', -48, -15, -47.98, -15, -47.98, -15.02, -48, -15.02, -48, -15)::jsonb;
begin
  select id into strict v_faz from public.fazendas where cliente_id = c_cli and nome = 'Fazenda Teste Cana';
  select m.user_id into strict v_membro from public.cliente_membros m where m.cliente_id = c_cli and m.ativo limit 1;
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo) values (v_faz, c_cli, 'TESTE-UNIR P1', 10, 'cria', true) returning id into p1;
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo) values (v_faz, c_cli, 'TESTE-UNIR P3', 10, 'cria', true) returning id into p3;
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson) values
    (v_faz, c_cli, 'pasto', p1, 'TESTE-UNIR 6A', format(quad, -48, -15, -47.99, -15, -47.99, -15.01, -48, -15.01, -48, -15)::jsonb) returning id into g1;
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson) values
    (v_faz, c_cli, 'outra', null, 'TESTE-UNIR 6B', format(quad, -47.99, -15, -47.98, -15, -47.98, -15.01, -47.99, -15.01, -47.99, -15)::jsonb) returning id into g2;
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson) values
    (v_faz, c_cli, 'pasto', p3, 'TESTE-UNIR 6C', format(quad, -48, -15.01, -47.99, -15.01, -47.99, -15.02, -48, -15.02, -48, -15.01)::jsonb) returning id into g3;
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson) values
    (v_faz, c_cli, 'outra', null, 'TESTE-UNIR 6D', format(quad, -47.99, -15.01, -47.98, -15.01, -47.98, -15.02, -47.99, -15.02, -47.99, -15.01)::jsonb) returning id into g4;

  perform set_config('request.jwt.claims', json_build_object('sub', v_membro, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- T1 prévia: unir os 4 num gesto; o pasto do 6C fica sem polígono (aviso), o 6A fica com o pasto dele
  r := public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'unir',
         'alterar', jsonb_build_array(jsonb_build_object('id', g1, 'versao', 1, 'geojson', u)),
         'remover', jsonb_build_array(jsonb_build_object('id', g2, 'versao', 1), jsonb_build_object('id', g3, 'versao', 1), jsonb_build_object('id', g4, 'versao', 1))), true);
  if jsonb_array_length(r->'poligonos') <> 4 or jsonb_array_length(r->'pastos_sem_poligono') <> 1 or (r->'pastos_sem_poligono'->0->>'pasto_id')::uuid <> p3 then
    raise exception 'T1 prévia: %', r;
  end if;
  if (select count(*) from public.fazenda_geometrias where id in (g1, g2, g3, g4)) <> 4 then raise exception 'T1 a prévia gravou'; end if;

  -- T2 gravar escolhendo o pasto do 6C para o resultado: 1 polígono fica (com p3), 3 somem, 4 linhas na trilha no mesmo gesto
  r := public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'unir',
         'alterar', jsonb_build_array(jsonb_build_object('id', g1, 'versao', 1, 'geojson', u, 'pasto_id', p3)),
         'remover', jsonb_build_array(jsonb_build_object('id', g2, 'versao', 1), jsonb_build_object('id', g3, 'versao', 1), jsonb_build_object('id', g4, 'versao', 1))), false);
  v_gesto := (r->>'gesto_id')::uuid;
  if (select count(*) from public.fazenda_geometrias where id in (g1, g2, g3, g4)) <> 1
     or (select pasto_id from public.fazenda_geometrias where id = g1) is distinct from p3
     or (select geojson from public.fazenda_geometrias where id = g1) <> u
     or (select count(*) from public.fazenda_geometria_edicoes where gesto_id = v_gesto) <> 4 then
    raise exception 'T2 gravar: %', r;
  end if;

  -- T3 desfazer: os 4 voltam como eram (forma e pasto)
  perform public.fn_geometria_desfazer(v_gesto, false);
  if (select count(*) from public.fazenda_geometrias where id in (g1, g2, g3, g4)) <> 4
     or (select pasto_id from public.fazenda_geometrias where id = g1) is distinct from p1
     or (select pasto_id from public.fazenda_geometrias where id = g3) is distinct from p3 then
    raise exception 'T3 desfazer não voltou os 4';
  end if;

  -- T4 sem nenhum removido → recusa; dividir/apagar não mudaram (apagar com 2 removidos → recusa)
  begin
    perform public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'unir',
      'alterar', jsonb_build_array(jsonb_build_object('id', g1, 'versao', (select versao from public.fazenda_geometrias where id = g1), 'geojson', u))), false);
    raise exception 'T4 unir sem removido passou';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'apagar', 'motivo', 'teste',
      'remover', jsonb_build_array(jsonb_build_object('id', g2, 'versao', (select versao from public.fazenda_geometrias where id = g2)),
                                   jsonb_build_object('id', g4, 'versao', (select versao from public.fazenda_geometrias where id = g4)))), false);
    raise exception 'T4 apagar com 2 passou';
  exception when invalid_parameter_value then null;
  end;
  raise exception 'OK MAPA-EDITAR-POLIGONO-04: T1–T4 (unir 4 num gesto, desfazer volta os 4)';
end $$;
