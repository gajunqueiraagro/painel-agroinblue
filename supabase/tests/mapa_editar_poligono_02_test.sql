-- MAPA-EDITAR-POLIGONO-02 — teste da 115190 (divisa compartilhada e recorte dos vizinhos num gesto). Roda depois da migration, numa
-- query só, e termina em RAISE 'OK…' (nada fica no banco). Fixture sintético no cliente Teste (43f32d07): A e B vizinhos (lado comum em
-- x = -47.99), o contorno T ('area_total'); as chamadas rodam como `authenticated` (claims de um membro real do cliente Teste).
do $$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v_faz uuid; v_membro uuid; pA uuid; gA uuid; gB uuid; gT uuid; r jsonb; v_gesto uuid; v_n int;
  quad constant text := '{"type":"Polygon","coordinates":[[[%s,%s],[%s,%s],[%s,%s],[%s,%s],[%s,%s]]]}';
  a0 jsonb; b0 jsonb; a1 jsonb; b1 jsonb;
begin
  select id into strict v_faz from public.fazendas where cliente_id = c_cli and nome = 'Fazenda Teste Cana';
  select m.user_id into strict v_membro from public.cliente_membros m where m.cliente_id = c_cli and m.ativo limit 1;
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo) values
    (v_faz, c_cli, 'TESTE-POLI2 A', 10, 'cria', true) returning id into pA;
  a0 := format(quad, -48, -15, -47.99, -15, -47.99, -15.01, -48, -15.01, -48, -15)::jsonb;
  b0 := format(quad, -47.99, -15, -47.98, -15, -47.98, -15.01, -47.99, -15.01, -47.99, -15)::jsonb;
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson) values
    (v_faz, c_cli, 'pasto', pA, 'TESTE-POLI2 A', a0) returning id into gA;
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson) values
    (v_faz, c_cli, 'outra', null, 'TESTE-POLI2 B', b0) returning id into gB;
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson) values
    (v_faz, c_cli, 'area_total', null, 'TESTE-POLI2 Area Total',
     format(quad, -48.01, -14.99, -47.97, -14.99, -47.97, -15.02, -48.01, -15.02, -48.01, -14.99)::jsonb) returning id into gT;

  perform set_config('request.jwt.claims', json_build_object('sub', v_membro, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- T1 "Mover a divisa junto": o vértice comum (-47.99,-15) vai para (-47.989,-15) nos DOIS, um gesto, 2 linhas na trilha
  a1 := format(quad, -48, -15, -47.989, -15, -47.99, -15.01, -48, -15.01, -48, -15)::jsonb;
  b1 := format(quad, -47.989, -15, -47.98, -15, -47.98, -15.01, -47.99, -15.01, -47.989, -15)::jsonb;
  r := public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'editar', 'alterar', jsonb_build_array(
         jsonb_build_object('id', gA, 'versao', 1, 'geojson', a1), jsonb_build_object('id', gB, 'versao', 1, 'geojson', b1))), false);
  v_gesto := (r->>'gesto_id')::uuid;
  if (select geojson from public.fazenda_geometrias where id = gA) <> a1 or (select geojson from public.fazenda_geometrias where id = gB) <> b1
     or (select count(*) from public.fazenda_geometria_edicoes where gesto_id = v_gesto) <> 2
     or jsonb_array_length(r->'poligonos') <> 2 then
    raise exception 'T1 divisa junto: %', r;
  end if;
  if (select pasto_id from public.fazenda_geometrias where id = gA) is distinct from pA then raise exception 'T1 o pasto do editado mudou'; end if;

  -- T2 desfazer o gesto inteiro: os DOIS voltam
  perform public.fn_geometria_desfazer(v_gesto, false);
  if (select geojson from public.fazenda_geometrias where id = gA) <> a0 or (select geojson from public.fazenda_geometrias where id = gB) <> b0 then
    raise exception 'T2 desfazer não voltou os dois';
  end if;

  -- T3 "Recortar dos vizinhos": desenhar C por cima da metade direita de B, e B sai recortado no mesmo gesto
  r := public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'desenhar',
         'criar', jsonb_build_array(jsonb_build_object('nome_original', 'TESTE-POLI2 C',
           'geojson', format(quad, -47.985, -15, -47.98, -15, -47.98, -15.01, -47.985, -15.01, -47.985, -15)::jsonb)),
         'alterar', jsonb_build_array(jsonb_build_object('id', gB, 'versao', (select versao from public.fazenda_geometrias where id = gB),
           'geojson', format(quad, -47.99, -15, -47.985, -15, -47.985, -15.01, -47.99, -15.01, -47.99, -15)::jsonb))), false);
  if (select count(*) from public.fazenda_geometria_edicoes where gesto_id = (r->>'gesto_id')::uuid) <> 2 then raise exception 'T3 recorte: %', r; end if;

  -- T4 vizinho com pasto/nome → recusa
  begin
    perform public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'editar', 'alterar', jsonb_build_array(
      jsonb_build_object('id', gB, 'versao', (select versao from public.fazenda_geometrias where id = gB), 'geojson', b0),
      jsonb_build_object('id', gA, 'versao', (select versao from public.fazenda_geometrias where id = gA), 'geojson', a0, 'pasto_id', null))), false);
    raise exception 'T4 vizinho trocando pasto passou';
  exception when invalid_parameter_value then null;
  end;
  -- T5 o contorno da fazenda como vizinho → recusa (no editar e no recorte)
  begin
    perform public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'editar', 'alterar', jsonb_build_array(
      jsonb_build_object('id', gA, 'versao', (select versao from public.fazenda_geometrias where id = gA), 'geojson', a0),
      jsonb_build_object('id', gT, 'versao', 1, 'geojson', a0))), false);
    raise exception 'T5 contorno movido junto passou';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'desenhar',
      'criar', jsonb_build_array(jsonb_build_object('nome_original', 'TESTE-POLI2 X', 'geojson', a0)),
      'alterar', jsonb_build_array(jsonb_build_object('id', gT, 'versao', 1, 'geojson', a0))), false);
    raise exception 'T5 contorno recortado passou';
  exception when invalid_parameter_value then null;
  end;
  -- T6 vizinho sem forma nova → recusa; o próprio contorno editado SOZINHO (1º do gesto) segue valendo
  begin
    perform public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'editar', 'alterar', jsonb_build_array(
      jsonb_build_object('id', gA, 'versao', (select versao from public.fazenda_geometrias where id = gA), 'geojson', a0),
      jsonb_build_object('id', gB, 'versao', (select versao from public.fazenda_geometrias where id = gB)))), false);
    raise exception 'T6 vizinho sem forma passou';
  exception when invalid_parameter_value then null;
  end;
  r := public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'editar', 'alterar', jsonb_build_array(
         jsonb_build_object('id', gT, 'versao', 1, 'geojson',
           format(quad, -48.02, -14.99, -47.97, -14.99, -47.97, -15.02, -48.02, -15.02, -48.02, -14.99)::jsonb))), true);
  if (r->>'simulado')::boolean is not true then raise exception 'T6 o contorno sozinho não se edita mais: %', r; end if;
  -- T7 dividir segue com 1 alterar só
  begin
    perform public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'dividir',
      'alterar', jsonb_build_array(jsonb_build_object('id', gA, 'versao', (select versao from public.fazenda_geometrias where id = gA), 'geojson', a0),
                                   jsonb_build_object('id', gB, 'versao', (select versao from public.fazenda_geometrias where id = gB), 'geojson', b0)),
      'criar', jsonb_build_array(jsonb_build_object('nome_original', 'TESTE-POLI2 Y', 'geojson', a0))), false);
    raise exception 'T7 dividir com 2 alterar passou';
  exception when invalid_parameter_value then null;
  end;
  select count(*) into v_n from public.fazenda_geometria_edicoes t where t.geometria_id in (gA, gB, gT);
  raise exception 'OK MAPA-EDITAR-POLIGONO-02: T1–T7 (trilha do fixture: % linhas)', v_n;
end $$;
