-- MAPA-CRIAR-PIQUETES-01 fatia 2b · teste das 115230/115240/115250 (mover linha, juntar, desfazer). Roda depois das migrations, numa query
-- só, e termina em RAISE 'OK…' (nada fica no banco). Fixture SINTÉTICO no cliente Teste (43f32d07), chamadas como `authenticated`.
--   F1 (criar): pai 1 em 3 faixas (A com o furo do corredor) pelo `fn_piquetes_criar` no mês passado → mover a linha A|B → juntar B em C →
--      desfazer (os polígonos nasceram no gesto: saem; o corredor também).
--   F2 (concluir): pai 2 com 2 polígonos que já existiam → `fn_piquetes_concluir` no mês atual → desfazer (os polígonos voltam a ficar
--      soltos; o pai volta sem fim).
--   F4: o mesmo do F2 com uma avaliação de condição numa divisão → o desfazer recusa (T5). Sem DELETE no teste.
--   F3 (ligar, caso P6): pastos que já existiam num grupo com elo ao pai 3 → `fn_piquetes_ligar` → desfazer (só os desenhos se soltam).
do $$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_mes constant date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;
  c_m1  constant date := (date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) - interval '1 month')::date;
  v_faz uuid; v_membro uuid; r jsonb; n0 int; n1 int;
  v_pai1 uuid; v_g1 uuid; pA uuid; pB uuid; pC uuid; gA uuid; gB uuid; gC uuid; vA int; vB int; vC int; v_corr uuid;
  v_pai2 uuid; v_g2 uuid; x1 uuid; x2 uuid; px1 uuid; px2 uuid;
  v_pai3 uuid; v_g3 uuid; l1 uuid; l2 uuid; gl1 uuid; gl2 uuid;
  furo constant jsonb := '[[-48.4999,-15.5999],[-48.4995,-15.5999],[-48.4995,-15.5995],[-48.4999,-15.5995],[-48.4999,-15.5999]]';
  geoA jsonb; geoA2 jsonb; geoB2 jsonb; uniaoBC jsonb; r_area numeric;
begin
  select id into strict v_faz from public.fazendas where cliente_id = c_cli and nome = 'Fazenda Teste Cana';
  select m.user_id into strict v_membro from public.cliente_membros m where m.cliente_id = c_cli and m.ativo limit 1;

  -- ===== F1: criar no mês passado =====
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo) values (v_faz, c_cli, 'TESTE-PQV1 PAI', 110, 'cria', true) returning id into v_pai1;
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson)
  values (v_faz, c_cli, 'pasto', v_pai1, 'TESTE-PQV1 CONTORNO', '{"type":"Polygon","coordinates":[[[-48.50,-15.60],[-48.49,-15.60],[-48.49,-15.59],[-48.50,-15.59],[-48.50,-15.60]]]}');
  geoA := jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array('[[-48.50,-15.60],[-48.4967,-15.60],[-48.4967,-15.59],[-48.50,-15.59],[-48.50,-15.60]]'::jsonb, furo));

  perform set_config('request.jwt.claims', json_build_object('sub', v_membro, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  r := public.fn_piquetes_criar(p_pasto_pai => v_pai1, p_mes => c_m1, p_simular => false,
    p_piquetes => jsonb_build_array(
      jsonb_build_object('nome', 'TESTE-PQV1 A', 'geojson', geoA),
      jsonb_build_object('nome', 'TESTE-PQV1 B', 'geojson', '{"type":"Polygon","coordinates":[[[-48.4967,-15.60],[-48.4933,-15.60],[-48.4933,-15.59],[-48.4967,-15.59],[-48.4967,-15.60]]]}'::jsonb),
      jsonb_build_object('nome', 'TESTE-PQV1 C', 'geojson', '{"type":"Polygon","coordinates":[[[-48.4933,-15.60],[-48.49,-15.60],[-48.49,-15.59],[-48.4933,-15.59],[-48.4933,-15.60]]]}'::jsonb)),
    p_areas => jsonb_build_array(jsonb_build_object('nome', 'TESTE-PQV1 Corredor', 'tipo', 'estrada', 'geojson', jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array(furo)))));
  select id into strict v_g1 from public.pasto_grupos where pasto_origem_id = v_pai1;
  select id into strict pA from public.pastos where fazenda_id = v_faz and nome = 'TESTE-PQV1 A';
  select id into strict pB from public.pastos where fazenda_id = v_faz and nome = 'TESTE-PQV1 B';
  select id into strict pC from public.pastos where fazenda_id = v_faz and nome = 'TESTE-PQV1 C';
  select id, versao into strict gA, vA from public.fazenda_geometrias where pasto_id = pA;
  select id, versao into strict gB, vB from public.fazenda_geometrias where pasto_id = pB;
  select id into strict v_corr from public.fazenda_geometrias where fazenda_id = v_faz and nome_original = 'TESTE-PQV1 Corredor';

  -- T1 mover a linha A|B de -48.4967 para -48.4960: prévia (nada muda) e gravação (desenho + área oficial do mês atual nas duas)
  geoA2 := jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array('[[-48.50,-15.60],[-48.4960,-15.60],[-48.4960,-15.59],[-48.50,-15.59],[-48.50,-15.60]]'::jsonb, furo));
  geoB2 := '{"type":"Polygon","coordinates":[[[-48.4960,-15.60],[-48.4933,-15.60],[-48.4933,-15.59],[-48.4960,-15.59],[-48.4960,-15.60]]]}';
  r := public.fn_piquetes_mover_linha(v_faz, jsonb_build_object('alterar', jsonb_build_array(
         jsonb_build_object('id', gA, 'versao', vA, 'geojson', geoA2), jsonb_build_object('id', gB, 'versao', vB, 'geojson', geoB2))), c_mes, 'teste', true);
  if not (r->>'simulado')::boolean or jsonb_array_length(r->'itens') <> 2 or not (r->>'area_muda')::boolean
     or (select versao from public.fazenda_geometrias where id = gA) <> vA
     or exists (select 1 from public.audit_log where acao = 'piquetes_mover_linha' and registro_id = v_g1) then
    raise exception 'T1 prévia: %', r;
  end if;
  r := public.fn_piquetes_mover_linha(v_faz, jsonb_build_object('alterar', jsonb_build_array(
         jsonb_build_object('id', gA, 'versao', vA, 'geojson', geoA2), jsonb_build_object('id', gB, 'versao', vB, 'geojson', geoB2))), c_mes, 'teste', false);
  execute 'reset role';  -- a conta de área é interna (sem EXECUTE para authenticated): só a conferência roda como postgres
  select public._fn_area_geodesica_ha(geojson) into r_area from public.fazenda_geometrias where id = gA;
  execute 'set local role authenticated';
  if (select versao from public.fazenda_geometrias where id = gA) = vA
     or public.fn_pasto_area_no_mes(pA, to_char(c_mes, 'YYYY-MM')) is distinct from round(r_area, 2)
     or public.fn_pasto_area_no_mes(pA, to_char(c_m1, 'YYYY-MM')) = round(r_area, 2)
     or abs((r->>'dif_soma_ha')::numeric) > 0.01 then
    raise exception 'T1 gravar: % (área A no mês %, mapa %)', r, public.fn_pasto_area_no_mes(pA, to_char(c_mes, 'YYYY-MM')), r_area;
  end if;
  -- T1b versão velha: recusa (40001) e nada muda
  begin
    perform public.fn_piquetes_mover_linha(v_faz, jsonb_build_object('alterar', jsonb_build_array(
         jsonb_build_object('id', gA, 'versao', vA, 'geojson', geoA), jsonb_build_object('id', gB, 'versao', vB, 'geojson', geoB2))), c_mes, 'teste', false);
    raise exception 'T1b versão velha passou';
  exception when sqlstate '40001' then null;
  end;

  -- T2 juntar B em C: recusas (união errada; mês em que B começou) e prévia; depois grava
  select versao into vB from public.fazenda_geometrias where id = gB;
  select id, versao into strict gC, vC from public.fazenda_geometrias where pasto_id = pC;
  uniaoBC := '{"type":"Polygon","coordinates":[[[-48.4960,-15.60],[-48.49,-15.60],[-48.49,-15.59],[-48.4960,-15.59],[-48.4960,-15.60]]]}';
  begin
    perform public.fn_piquetes_juntar(pC, pB, c_mes, jsonb_build_object('geojson', geoB2, 'versao_fica', vC, 'versao_sai', vB), 'teste', true);
    raise exception 'T2 união errada passou';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%não bate com a soma%' then raise exception 'T2 frase união: %', sqlerrm; end if;
  end;
  begin
    perform public.fn_piquetes_juntar(pC, pB, c_m1, jsonb_build_object('geojson', uniaoBC, 'versao_fica', vC, 'versao_sai', vB), 'teste', true);
    raise exception 'T2 mês do começo passou';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%começou em%' then raise exception 'T2 frase começo: %', sqlerrm; end if;
  end;
  r := public.fn_piquetes_juntar(pC, pB, c_mes, jsonb_build_object('geojson', uniaoBC, 'versao_fica', vC, 'versao_sai', vB), 'teste', true);
  if not (r->>'simulado')::boolean or (r->'grupo'->>'divisoes')::int <> 2
     or not exists (select 1 from public.fazenda_geometrias where id = gB) or (select grupo_id from public.pastos where id = pB) is distinct from v_g1 then
    raise exception 'T2 prévia: %', r;
  end if;
  r := public.fn_piquetes_juntar(pC, pB, c_mes, jsonb_build_object('geojson', uniaoBC, 'versao_fica', vC, 'versao_sai', vB), 'teste', false);
  execute 'reset role';
  r_area := public._fn_area_geodesica_ha(uniaoBC);
  execute 'set local role authenticated';
  if exists (select 1 from public.fazenda_geometrias where id = gB)
     or (select grupo_id from public.pastos where id = pB) is not null
     or (select data_fim from public.pastos where id = pB) is distinct from (c_mes - 1)
     or public.fn_pasto_area_no_mes(pC, to_char(c_mes, 'YYYY-MM')) is distinct from round(r_area, 2)
     or (select count(*) from public.pastos where grupo_id = v_g1) <> 2 then
    raise exception 'T2 gravar: %', r;
  end if;
  -- T3 juntar A em C deixaria o grupo com uma: recusa
  begin
    perform public.fn_piquetes_juntar(pC, pA, c_mes, jsonb_build_object('geojson', uniaoBC, 'versao_fica', 0, 'versao_sai', 0), 'teste', true);
    raise exception 'T3 grupo de uma passou';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%ficaria com uma divisão só%' then raise exception 'T3 frase: %', sqlerrm; end if;
  end;

  -- T4 desfazer F1 (criados): prévia sem mudar nada; grava: polígonos nascidos no gesto saem (A, C e o corredor), A/B/C inativos, pai sem fim
  select count(*) into n0 from public.fazenda_geometrias where fazenda_id = v_faz;
  r := public.fn_piquetes_desfazer(v_g1, 'teste', true);
  select count(*) into n1 from public.fazenda_geometrias where fazenda_id = v_faz;
  if r->>'modo' <> 'criados' or n1 <> n0 or jsonb_array_length(r->'areas') <> 1
     or (select count(*) from jsonb_array_elements(r->'poligonos') y where y->>'destino' = 'apagar') <> 2 then
    raise exception 'T4 prévia: %', r;
  end if;
  r := public.fn_piquetes_desfazer(v_g1, 'teste', false);
  if exists (select 1 from public.fazenda_geometrias where id in (gA, gC, v_corr))
     or exists (select 1 from public.pastos where id in (pA, pB, pC) and ativo)
     or (select data_fim from public.pastos where id = v_pai1) is not null
     or (select ativo from public.pasto_grupos where id = v_g1)
     or (select pasto_origem_id from public.pasto_grupos where id = v_g1) is not null
     or not exists (select 1 from public.fazenda_geometrias where pasto_id = v_pai1) then
    raise exception 'T4 gravar: %', r;
  end if;
  -- T4b o pai pode virar piquetes de novo (nome e elo do grupo liberados): a prévia do concluir não recusa pelo grupo
  r := public.fn_piquetes_criar(p_pasto_pai => v_pai1, p_mes => c_mes, p_simular => true,
    p_piquetes => jsonb_build_array(
      jsonb_build_object('nome', 'TESTE-PQV1 A2', 'geojson', '{"type":"Polygon","coordinates":[[[-48.50,-15.60],[-48.495,-15.60],[-48.495,-15.59],[-48.50,-15.59],[-48.50,-15.60]]]}'::jsonb),
      jsonb_build_object('nome', 'TESTE-PQV1 B2', 'geojson', '{"type":"Polygon","coordinates":[[[-48.495,-15.60],[-48.49,-15.60],[-48.49,-15.59],[-48.495,-15.59],[-48.495,-15.60]]]}'::jsonb)));
  if r->'concluir' is null then raise exception 'T4b recriar: %', r; end if;

  -- ===== F2: concluir de polígonos que já existiam =====
  execute 'reset role';
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo) values (v_faz, c_cli, 'TESTE-PQV2 PAI', 110, 'cria', true) returning id into v_pai2;
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson)
  values (v_faz, c_cli, 'pasto', v_pai2, 'TESTE-PQV2 CONTORNO', '{"type":"Polygon","coordinates":[[[-48.50,-15.70],[-48.49,-15.70],[-48.49,-15.69],[-48.50,-15.69],[-48.50,-15.70]]]}');
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, nome_original, geojson)
  values (v_faz, c_cli, 'outra', 'TESTE-PQV2 X', '{"type":"Polygon","coordinates":[[[-48.50,-15.70],[-48.495,-15.70],[-48.495,-15.69],[-48.50,-15.69],[-48.50,-15.70]]]}') returning id into x1;
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, nome_original, geojson)
  values (v_faz, c_cli, 'outra', 'TESTE-PQV2 Y', '{"type":"Polygon","coordinates":[[[-48.495,-15.70],[-48.49,-15.70],[-48.49,-15.69],[-48.495,-15.69],[-48.495,-15.70]]]}') returning id into x2;
  execute 'set local role authenticated';
  r := public.fn_piquetes_concluir(v_pai2, array[x1, x2], c_mes, false);
  v_g2 := (r->>'grupo_id')::uuid;
  select pasto_id into strict px1 from public.fazenda_geometrias where id = x1;
  -- T6 desfazer F2: os dois polígonos voltam a ficar soltos (não saem), as divisões inativas, o pai sem fim
  r := public.fn_piquetes_desfazer(v_g2, 'teste', false);
  if r->>'modo' <> 'criados'
     or (select count(*) from public.fazenda_geometrias where id in (x1, x2) and tipo = 'outra' and pasto_id is null) <> 2
     or exists (select 1 from public.pastos where id = px1 and ativo)
     or (select data_fim from public.pastos where id = v_pai2) is not null then
    raise exception 'T6 desfazer soltos: %', r;
  end if;

  -- ===== F3: só ligou (caso P6) =====
  execute 'reset role';
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo) values (v_faz, c_cli, 'TESTE-PQV3 PAI', 110, 'cria', true) returning id into v_pai3;
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo) values (v_faz, c_cli, 'TESTE-PQV3 L1', 55, 'cria', true) returning id into l1;
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo) values (v_faz, c_cli, 'TESTE-PQV3 L2', 55, 'cria', true) returning id into l2;
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson)
  values (v_faz, c_cli, 'pasto', v_pai3, 'TESTE-PQV3 CONTORNO', '{"type":"Polygon","coordinates":[[[-48.50,-15.80],[-48.49,-15.80],[-48.49,-15.79],[-48.50,-15.79],[-48.50,-15.80]]]}');
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, nome_original, geojson)
  values (v_faz, c_cli, 'outra', 'TESTE-PQV3 D1', '{"type":"Polygon","coordinates":[[[-48.50,-15.80],[-48.495,-15.80],[-48.495,-15.79],[-48.50,-15.79],[-48.50,-15.80]]]}') returning id into gl1;
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, nome_original, geojson)
  values (v_faz, c_cli, 'outra', 'TESTE-PQV3 D2', '{"type":"Polygon","coordinates":[[[-48.495,-15.80],[-48.49,-15.80],[-48.49,-15.79],[-48.495,-15.79],[-48.495,-15.80]]]}') returning id into gl2;
  execute 'set local role authenticated';
  r := public.fn_pasto_grupo_salvar(NULL, v_faz, 'TESTE-PQV3 GRUPO', array[l1, l2], false);
  v_g3 := (r->>'grupo_id')::uuid;
  execute 'reset role';
  update public.pasto_grupos set pasto_origem_id = v_pai3 where id = v_g3;
  execute 'set local role authenticated';
  r := public.fn_piquetes_ligar(v_g3, jsonb_build_array(jsonb_build_object('geometria_id', gl1, 'pasto_id', l1), jsonb_build_object('geometria_id', gl2, 'pasto_id', l2)), false);
  -- T7 desfazer F3: só os desenhos se soltam; pastos e grupo ficam
  r := public.fn_piquetes_desfazer(v_g3, 'teste', false);
  if r->>'modo' <> 'ligados'
     or (select count(*) from public.fazenda_geometrias where id in (gl1, gl2) and tipo = 'outra' and pasto_id is null) <> 2
     or not (select ativo from public.pasto_grupos where id = v_g3)
     or (select count(*) from public.pastos where grupo_id = v_g3 and ativo) <> 2 then
    raise exception 'T7 ligados: %', r;
  end if;

  -- ===== F4: recusa por uso (uma avaliação de condição numa divisão) =====
  execute 'reset role';
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo) values (v_faz, c_cli, 'TESTE-PQV4 PAI', 110, 'cria', true) returning id into v_pai2;
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson)
  values (v_faz, c_cli, 'pasto', v_pai2, 'TESTE-PQV4 CONTORNO', '{"type":"Polygon","coordinates":[[[-48.50,-15.90],[-48.49,-15.90],[-48.49,-15.89],[-48.50,-15.89],[-48.50,-15.90]]]}');
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, nome_original, geojson)
  values (v_faz, c_cli, 'outra', 'TESTE-PQV4 X', '{"type":"Polygon","coordinates":[[[-48.50,-15.90],[-48.495,-15.90],[-48.495,-15.89],[-48.50,-15.89],[-48.50,-15.90]]]}') returning id into x1;
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, nome_original, geojson)
  values (v_faz, c_cli, 'outra', 'TESTE-PQV4 Y', '{"type":"Polygon","coordinates":[[[-48.495,-15.90],[-48.49,-15.90],[-48.49,-15.89],[-48.495,-15.89],[-48.495,-15.90]]]}') returning id into x2;
  execute 'set local role authenticated';
  r := public.fn_piquetes_concluir(v_pai2, array[x1, x2], c_mes, false);
  v_g2 := (r->>'grupo_id')::uuid;
  select pasto_id into strict px1 from public.fazenda_geometrias where id = x1;
  execute 'reset role';
  insert into public.pasto_condicoes (pasto_id, data_avaliacao, condicao) values (px1, c_mes, 'boa');
  execute 'set local role authenticated';
  -- T5 recusa por uso
  begin
    perform public.fn_piquetes_desfazer(v_g2, 'teste', true);
    raise exception 'T5 uso passou';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%avaliação(ões) de condição%' then raise exception 'T5 frase: %', sqlerrm; end if;
  end;

  -- T8 nascem fechadas
  execute 'reset role';
  if has_function_privilege('anon', 'public.fn_piquetes_mover_linha(uuid,jsonb,date,text,boolean)', 'execute')
     or has_function_privilege('anon', 'public.fn_piquetes_juntar(uuid,uuid,date,jsonb,text,boolean)', 'execute')
     or has_function_privilege('anon', 'public.fn_piquetes_desfazer(uuid,text,boolean)', 'execute')
     or has_function_privilege('authenticated', 'public._fn_piquete_usos(uuid,date)', 'execute') then
    raise exception 'T8 aberta';
  end if;
  if not has_function_privilege('authenticated', 'public.fn_piquetes_desfazer(uuid,text,boolean)', 'execute') then raise exception 'T8 authenticated não executa'; end if;

  raise exception 'OK MAPA-CRIAR-PIQUETES-01 fatia 2b: T1–T8 (mover linha, juntar, desfazer criados/soltos/ligados, recusas, versão velha, fechadas)';
end $$;
