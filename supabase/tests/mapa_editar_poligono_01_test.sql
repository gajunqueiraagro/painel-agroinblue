-- MAPA-EDITAR-POLIGONO-01 — teste das funções de edição de polígono. Roda depois da migration 20261028115170, numa query só, e termina
-- em RAISE 'OK…' (nada fica no banco). Fixture sintético no cliente Teste (43f32d07): 2 pastos e 3 polígonos novos; as chamadas rodam
-- como `authenticated` (claims de um membro real do cliente Teste).
do $$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v_faz uuid; v_membro uuid; v_fora uuid; pA uuid; pB uuid; gA uuid; gB uuid; gC uuid; r jsonb; v_n int; v_g record; v_gesto uuid;
  quad constant text := '{"type":"Polygon","coordinates":[[[%s,%s],[%s,%s],[%s,%s],[%s,%s],[%s,%s]]]}';
begin
  select id into strict v_faz from public.fazendas where cliente_id = c_cli and nome = 'Fazenda Teste Cana';
  select m.user_id into strict v_membro from public.cliente_membros m where m.cliente_id = c_cli and m.ativo limit 1;
  select m.user_id into v_fora from public.cliente_membros m
   where m.ativo and not public.is_admin_agroinblue(m.user_id)
     and not exists (select 1 from public.cliente_membros x where x.user_id = m.user_id and x.cliente_id = c_cli and x.ativo) limit 1;

  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo) values
    (v_faz, c_cli, 'TESTE-POLI A', 10, 'cria', true) returning id into pA;
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo) values
    (v_faz, c_cli, 'TESTE-POLI B', 10, 'cria', true) returning id into pB;
  -- A e B vizinhos (lado comum em x = -47.99), C solto; todos do KMZ
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson) values
    (v_faz, c_cli, 'pasto', pA, 'TESTE-POLI A', format(quad, -48, -15, -47.99, -15, -47.99, -15.01, -48, -15.01, -48, -15)::jsonb)
    returning id into gA;
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson) values
    (v_faz, c_cli, 'pasto', pB, 'TESTE-POLI B', format(quad, -47.99, -15, -47.98, -15, -47.98, -15.01, -47.99, -15.01, -47.99, -15)::jsonb)
    returning id into gB;
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson) values
    (v_faz, c_cli, 'outra', null, 'TESTE-POLI C', format(quad, -47.9, -15, -47.89, -15, -47.89, -15.01, -47.9, -15.01, -47.9, -15)::jsonb)
    returning id into gC;

  perform set_config('request.jwt.claims', json_build_object('sub', v_membro, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- T1 desenhar: nasce sem tipo ('outra'), origem 'desenhado', 1 linha na trilha
  r := public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'desenhar',
         'criar', jsonb_build_array(jsonb_build_object('nome_original', 'TESTE-POLI D',
           'geojson', format(quad, -47.8, -15, -47.79, -15, -47.79, -15.01, -47.8, -15.01, -47.8, -15)::jsonb))), false);
  select * into v_g from public.fazenda_geometrias where fazenda_id = v_faz and nome_original = 'TESTE-POLI D';
  if v_g.tipo <> 'outra' or v_g.pasto_id is not null or v_g.origem <> 'desenhado' or v_g.editado_por is distinct from v_membro then
    raise exception 'T1 desenhar: % % % %', v_g.tipo, v_g.pasto_id, v_g.origem, v_g.editado_por;
  end if;
  if (select count(*) from public.fazenda_geometria_edicoes where gesto_id = (r->>'gesto_id')::uuid and antes is null and por = v_membro) <> 1 then
    raise exception 'T1 trilha';
  end if;

  -- T2 versão velha → 40001
  begin
    perform public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'editar', 'alterar', jsonb_build_array(jsonb_build_object(
      'id', gC, 'versao', 99, 'geojson', format(quad, -47.9, -15, -47.88, -15, -47.88, -15.01, -47.9, -15.01, -47.9, -15)::jsonb))), false);
    raise exception 'T2 versão velha passou';
  exception when serialization_failure then null;
  end;
  -- T3 anel que não fecha → 22023
  begin
    perform public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'editar', 'alterar', jsonb_build_array(jsonb_build_object(
      'id', gC, 'versao', 1, 'geojson', '{"type":"Polygon","coordinates":[[[-47.9,-15],[-47.88,-15],[-47.88,-15.01],[-47.9,-15.01]]]}'::jsonb))), false);
    raise exception 'T3 anel aberto passou';
  exception when invalid_parameter_value then null;
  end;

  -- T4 editar (simular primeiro: nada muda) → origem kmz vira editado, versão sobe, trilha antes/depois
  r := public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'editar', 'alterar', jsonb_build_array(jsonb_build_object(
    'id', gC, 'versao', 1, 'geojson', format(quad, -47.9, -15, -47.88, -15, -47.88, -15.01, -47.9, -15.01, -47.9, -15)::jsonb))), true);
  if (r->>'simulado')::boolean is distinct from true or (select versao from public.fazenda_geometrias where id = gC) <> 1
     or exists (select 1 from public.fazenda_geometria_edicoes where gesto_id = (r->>'gesto_id')::uuid) then
    raise exception 'T4 a prévia gravou algo: %', r;
  end if;
  r := public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'editar', 'alterar', jsonb_build_array(jsonb_build_object(
    'id', gC, 'versao', 1, 'geojson', format(quad, -47.9, -15, -47.88, -15, -47.88, -15.01, -47.9, -15.01, -47.9, -15)::jsonb))), false);
  select * into v_g from public.fazenda_geometrias where id = gC;
  if v_g.origem <> 'editado' or v_g.versao <> 2 or v_g.editado_em is null then raise exception 'T4 editar: % %', v_g.origem, v_g.versao; end if;
  if not exists (select 1 from public.fazenda_geometria_edicoes where gesto_id = (r->>'gesto_id')::uuid
                  and antes->>'origem' = 'kmz' and depois->>'origem' = 'editado' and (depois->>'versao')::int = 2) then
    raise exception 'T4 trilha';
  end if;

  -- T5 dividir B: a metade nova fica com o pasto B; o original perde o vínculo (vira 'outra'); nenhum pasto fica sem polígono
  r := public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'dividir',
    'alterar', jsonb_build_array(jsonb_build_object('id', gB, 'versao', 1, 'pasto_id', null,
      'geojson', format(quad, -47.99, -15, -47.985, -15, -47.985, -15.01, -47.99, -15.01, -47.99, -15)::jsonb)),
    'criar', jsonb_build_array(jsonb_build_object('nome_original', 'TESTE-POLI B2', 'pasto_id', pB,
      'geojson', format(quad, -47.985, -15, -47.98, -15, -47.98, -15.01, -47.985, -15.01, -47.985, -15)::jsonb))), false);
  if (select tipo from public.fazenda_geometrias where id = gB) <> 'outra'
     or (select pasto_id from public.fazenda_geometrias where nome_original = 'TESTE-POLI B2' and fazenda_id = v_faz) <> pB
     or jsonb_array_length(r->'pastos_sem_poligono') <> 0 then
    raise exception 'T5 dividir: %', r;
  end if;

  -- T6 unir A (fica) + metade nova de B (sai): A fica com o pasto B → o pasto A fica sem polígono (aparece na prévia)
  select id into gC from public.fazenda_geometrias where nome_original = 'TESTE-POLI B2' and fazenda_id = v_faz;
  r := public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'unir',
    'alterar', jsonb_build_array(jsonb_build_object('id', gA, 'versao', 1, 'pasto_id', pB,
      'geojson', format(quad, -48, -15, -47.98, -15, -47.98, -15.01, -48, -15.01, -48, -15)::jsonb)),
    'remover', jsonb_build_array(jsonb_build_object('id', gC, 'versao', 1))), true);
  if r->'pastos_sem_poligono'->0->>'nome' is distinct from 'TESTE-POLI A' then raise exception 'T6 prévia: %', r; end if;
  r := public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'unir',
    'alterar', jsonb_build_array(jsonb_build_object('id', gA, 'versao', 1, 'pasto_id', pB,
      'geojson', format(quad, -48, -15, -47.98, -15, -47.98, -15.01, -48, -15.01, -48, -15)::jsonb)),
    'remover', jsonb_build_array(jsonb_build_object('id', gC, 'versao', 1))), false);
  v_gesto := (r->>'gesto_id')::uuid;
  if exists (select 1 from public.fazenda_geometrias where id = gC) or (select pasto_id from public.fazenda_geometrias where id = gA) <> pB then
    raise exception 'T6 unir: %', r;
  end if;

  -- T7 apagar: ligado sem destino recusa; sem motivo recusa; desligado com motivo apaga (trilha com motivo)
  begin
    perform public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'apagar', 'motivo', 'teste',
      'remover', jsonb_build_array(jsonb_build_object('id', gA, 'versao', (select versao from public.fazenda_geometrias where id = gA)))), false);
    raise exception 'T7 apagar ligado sem destino passou';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'apagar',
      'remover', jsonb_build_array(jsonb_build_object('id', gB, 'versao', (select versao from public.fazenda_geometrias where id = gB)))), false);
    raise exception 'T7 apagar sem motivo passou';
  exception when invalid_parameter_value then null;
  end;

  -- T8 desfazer o unir: a metade volta com o MESMO id e o pasto B; o pasto A volta ao A; desfazer de novo recusa
  r := public.fn_geometria_desfazer(v_gesto, false);
  if (select pasto_id from public.fazenda_geometrias where id = gC) is distinct from pB
     or (select pasto_id from public.fazenda_geometrias where id = gA) is distinct from pA then
    raise exception 'T8 desfazer: %', r;
  end if;
  begin
    perform public.fn_geometria_desfazer(v_gesto, false);
    raise exception 'T8 desfazer duas vezes passou';
  exception when invalid_parameter_value then null;
  end;
  -- T9 desfazer o dividir depois que a metade nova mudou (o desfazer do unir a reinseriu: versão nova) → 40001
  select gesto_id into v_gesto from public.fazenda_geometria_edicoes where geometria_id = gC and acao = 'dividir' limit 1;
  begin
    perform public.fn_geometria_desfazer(v_gesto, false);
    raise exception 'T9 desfazer com mudança depois passou';
  exception when serialization_failure then null;
  end;

  -- T10 apagar um polígono SEM vínculo (o B, editado) com motivo: sai, e a trilha guarda o motivo
  r := public.fn_geometria_gravar(v_faz, jsonb_build_object('acao', 'apagar', 'motivo', 'divisa errada no KMZ',
    'remover', jsonb_build_array(jsonb_build_object('id', gB, 'versao', (select versao from public.fazenda_geometrias where id = gB)))), false);
  if exists (select 1 from public.fazenda_geometrias where id = gB)
     or not exists (select 1 from public.fazenda_geometria_edicoes where gesto_id = (r->>'gesto_id')::uuid and motivo = 'divisa errada no KMZ') then
    raise exception 'T10 apagar: %', r;
  end if;

  -- T11 "Atualizar mapa": o editado (C) e os desenhados (B2, D) ficam; o C do arquivo é ignorado (mesmo nome do editado); o B do
  -- arquivo é ignorado (foi APAGADO pela edição: não volta); o A do KMZ é trocado pelo A do arquivo
  r := public.fn_mapa_fazenda_substituir(v_faz, jsonb_build_array(
    jsonb_build_object('tipo', 'outra', 'nome_original', 'TESTE-POLI A',
      'geojson', format(quad, -48, -15, -47.99, -15, -47.99, -15.01, -48, -15.01, -48, -15)::jsonb),
    jsonb_build_object('tipo', 'outra', 'nome_original', 'TESTE-POLI B',
      'geojson', format(quad, -47.99, -15, -47.98, -15, -47.98, -15.01, -47.99, -15.01, -47.99, -15)::jsonb),
    jsonb_build_object('tipo', 'outra', 'nome_original', 'TESTE-POLI C',
      'geojson', format(quad, -47.9, -15, -47.89, -15, -47.89, -15.01, -47.9, -15.01, -47.9, -15)::jsonb)));
  if (r->>'do_arquivo_ignorados')::int <> 2 or (r->>'editados_preservados')::int <> 3 then raise exception 'T11 contagem: %', r; end if;
  if (select string_agg(nome_original || '=' || origem, ',' order by nome_original) from public.fazenda_geometrias
       where fazenda_id = v_faz and nome_original like 'TESTE-POLI %')
     is distinct from 'TESTE-POLI A=kmz,TESTE-POLI B2=desenhado,TESTE-POLI C=editado,TESTE-POLI D=desenhado' then
    raise exception 'T11 o KMZ apagou o editado ou trouxe de volta o apagado: %',
      (select string_agg(nome_original || '=' || origem, ',' order by nome_original) from public.fazenda_geometrias
        where fazenda_id = v_faz and nome_original like 'TESTE-POLI %');
  end if;
  execute 'reset role';

  -- T12 fora do cliente → 42501; nasce fechada
  if v_fora is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_fora, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.fn_geometria_gravar(v_faz, '{"acao":"desenhar","criar":[]}'::jsonb, true);
      raise exception 'T12 fora do cliente passou';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';
  end if;
  if has_function_privilege('anon', 'public.fn_geometria_gravar(uuid,jsonb,boolean)', 'execute')
     or has_function_privilege('anon', 'public.fn_geometria_desfazer(uuid,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.fn_geometria_gravar(uuid,jsonb,boolean)', 'execute') then
    raise exception 'T12 não nasceu fechada';
  end if;

  raise exception 'OK MAPA-EDITAR-POLIGONO-01: T1–T12';
end $$;
