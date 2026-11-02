-- MAPA-CRIAR-PIQUETES-01 · teste da 115220 (p_areas e p_infra). Roda depois da migration, numa query só, e termina em RAISE 'OK…' (nada fica
-- no banco). Fixture SINTÉTICO no cliente Teste (43f32d07): um pasto-pai quadrado; 2 divisões (oeste com o furo da praça, leste);
-- a praça em LOSANGO (benfeitoria "Praça de alimentação"), um corredor (estrada) e o cocho no centro da praça. Chamadas como `authenticated`.
do $$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_mes constant date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;
  v_faz uuid; v_membro uuid; v_pai uuid; r jsonb; n0 int; n1 int; i0 int; i1 int; v_praca uuid; v_infra uuid;
  contorno constant jsonb := '{"type":"Polygon","coordinates":[[[-48.50,-15.50],[-48.49,-15.50],[-48.49,-15.49],[-48.50,-15.49],[-48.50,-15.50]]]}';
  losango constant jsonb := '[[-48.4975,-15.4953],[-48.4972,-15.4950],[-48.4975,-15.4947],[-48.4978,-15.4950],[-48.4975,-15.4953]]';
  oeste constant jsonb := jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array(
    '[[-48.50,-15.50],[-48.495,-15.50],[-48.495,-15.49],[-48.50,-15.49],[-48.50,-15.50]]'::jsonb, losango));
  leste constant jsonb := '{"type":"Polygon","coordinates":[[[-48.495,-15.50],[-48.49,-15.50],[-48.49,-15.49],[-48.495,-15.49],[-48.495,-15.50]]]}';
  praca constant jsonb := jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array(losango));
  corredor constant jsonb := '{"type":"Polygon","coordinates":[[[-48.4999,-15.4999],[-48.4995,-15.4999],[-48.4995,-15.4995],[-48.4999,-15.4995],[-48.4999,-15.4999]]]}';
  pq jsonb; ar jsonb; inf jsonb;
begin
  select id into strict v_faz from public.fazendas where cliente_id = c_cli and nome = 'Fazenda Teste Cana';
  select m.user_id into strict v_membro from public.cliente_membros m where m.cliente_id = c_cli and m.ativo limit 1;
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo) values (v_faz, c_cli, 'TESTE-PQA PAI', 110, 'cria', true) returning id into v_pai;
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson) values (v_faz, c_cli, 'pasto', v_pai, 'TESTE-PQA CONTORNO', contorno);
  pq := jsonb_build_array(jsonb_build_object('nome', 'TESTE-PQA A', 'geojson', oeste), jsonb_build_object('nome', 'TESTE-PQA B', 'geojson', leste));
  ar := jsonb_build_array(jsonb_build_object('nome', 'TESTE-PQA Praça de alimentação', 'tipo', 'benfeitoria', 'geojson', praca),
                          jsonb_build_object('nome', 'TESTE-PQA Corredor', 'tipo', 'estrada', 'geojson', corredor));
  inf := jsonb_build_array(jsonb_build_object('tipo', 'cocho', 'nome', 'TESTE-PQA Cocho', 'ponto', '[-48.4975,-15.4950]'::jsonb));

  perform set_config('request.jwt.claims', json_build_object('sub', v_membro, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- T1 prévia: as áreas e o cocho vêm na prévia; nada fica gravado (nem polígono, nem infraestrutura)
  select count(*) into n0 from public.fazenda_geometrias where fazenda_id = v_faz;
  select count(*) into i0 from public.fazenda_infraestruturas where fazenda_id = v_faz;
  r := public.fn_piquetes_criar(p_pasto_pai => v_pai, p_piquetes => pq, p_mes => c_mes, p_simular => true, p_areas => ar, p_infra => inf);
  if jsonb_array_length(r->'areas') <> 2 or jsonb_array_length(r->'infra') <> 1 or r->'concluir' is null
     or (r->'areas'->0->>'area_ha')::numeric <= 0 then
    raise exception 'T1 prévia: %', r;
  end if;
  select count(*) into n1 from public.fazenda_geometrias where fazenda_id = v_faz;
  select count(*) into i1 from public.fazenda_infraestruturas where fazenda_id = v_faz;
  if n1 <> n0 or i1 <> i0 then raise exception 'T1 a prévia gravou (polígonos % → %, infra % → %)', n0, n1, i0, i1; end if;

  -- T3 recusas (antes de gravar: depois o pai já é grupo): tipo de área fora de benfeitoria/estrada; área sem nome; formato errado
  begin
    perform public.fn_piquetes_criar(p_pasto_pai => v_pai, p_piquetes => pq, p_mes => c_mes, p_simular => true,
      p_areas => jsonb_build_array(jsonb_build_object('nome', 'X', 'tipo', 'curral', 'geojson', praca)));
    raise exception 'T3 tipo passou';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%benfeitoria (praça) ou estrada (corredor)%' then raise exception 'T3 frase: %', sqlerrm; end if;
  end;
  begin
    perform public.fn_piquetes_criar(p_pasto_pai => v_pai, p_piquetes => pq, p_mes => c_mes, p_simular => true,
      p_areas => jsonb_build_array(jsonb_build_object('nome', ' ', 'tipo', 'benfeitoria', 'geojson', praca)));
    raise exception 'T3 sem nome passou';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    perform public.fn_piquetes_criar(p_pasto_pai => v_pai, p_piquetes => pq, p_mes => c_mes, p_simular => true, p_areas => '{"x":1}'::jsonb);
    raise exception 'T3 formato passou';
  exception when sqlstate 'P0001' then null;
  end;

  -- T2 gravar: 2 divisões + praça (benfeitoria, sem pasto) + corredor (estrada) + o cocho ligado ao pai, no centro da praça
  r := public.fn_piquetes_criar(p_pasto_pai => v_pai, p_piquetes => pq, p_mes => c_mes, p_simular => false, p_areas => ar, p_infra => inf);
  select id into strict v_praca from public.fazenda_geometrias where fazenda_id = v_faz and nome_original = 'TESTE-PQA Praça de alimentação';
  select id into strict v_infra from public.fazenda_infraestruturas where fazenda_id = v_faz and nome = 'TESTE-PQA Cocho';
  if (select tipo from public.fazenda_geometrias where id = v_praca) <> 'benfeitoria'
     or (select pasto_id from public.fazenda_geometrias where id = v_praca) is not null
     or (select tipo from public.fazenda_geometrias where fazenda_id = v_faz and nome_original = 'TESTE-PQA Corredor') <> 'estrada'
     or (select tipo from public.fazenda_infraestruturas where id = v_infra) <> 'cocho'
     or (select pasto_id from public.fazenda_infraestruturas where id = v_infra) is distinct from v_pai
     or (select geometria->'coordinates' from public.fazenda_infraestruturas where id = v_infra) <> '[-48.4975,-15.4950]'::jsonb
     or (select count(*) from public.pastos where fazenda_id = v_faz and nome in ('TESTE-PQA A', 'TESTE-PQA B')) <> 2
     or jsonb_array_length(r->'gestos') <> 4 then
    raise exception 'T2 gravar: %', r;
  end if;

  -- T4 nasce fechada; a assinatura antiga (5 parâmetros) não existe mais
  execute 'reset role';
  if has_function_privilege('anon', 'public.fn_piquetes_criar(uuid,jsonb,date,jsonb,boolean,jsonb,jsonb)', 'execute') then raise exception 'T4 anon executa'; end if;
  if not has_function_privilege('authenticated', 'public.fn_piquetes_criar(uuid,jsonb,date,jsonb,boolean,jsonb,jsonb)', 'execute') then raise exception 'T4 authenticated não executa'; end if;
  if to_regprocedure('public.fn_piquetes_criar(uuid,jsonb,date,jsonb,boolean)') is not null then raise exception 'T4 a assinatura antiga ficou'; end if;

  raise exception 'OK MAPA-CRIAR-PIQUETES-01 115220: T1–T4 (praça benfeitoria, corredor estrada, cocho no pai, prévia sem gravar)';
end $$;
