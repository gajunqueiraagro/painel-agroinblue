-- MAPA-CRIAR-PIQUETES-01 — teste da 115210 (fn_piquetes_criar). Roda depois da migration (e da 117090, a fn_piquetes_ligar do Code 4), numa query só, e termina em RAISE 'OK…' (nada fica
-- no banco). Fixture SINTÉTICO no cliente Teste (43f32d07): um pasto-pai com contorno quadrado e um FURO (o redondel) dentro da metade
-- oeste; as chamadas rodam como `authenticated` (claims de um membro real do cliente Teste).
do $$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_mes constant date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;
  v_faz uuid; v_membro uuid; v_pai uuid; v_pai2 uuid; v_cont uuid; r jsonb; v_a uuid; v_b uuid; v_grupo uuid; n0 int; n1 int; v_vig int; v_area_a numeric; v_ha_oeste numeric; v_ha_oeste_sem numeric;
  furo constant jsonb := '[[-48.498,-15.497],[-48.498,-15.493],[-48.496,-15.493],[-48.496,-15.497],[-48.498,-15.497]]';
  contorno constant jsonb := jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array(
    '[[-48.50,-15.50],[-48.49,-15.50],[-48.49,-15.49],[-48.50,-15.49],[-48.50,-15.50]]'::jsonb,
    '[[-48.498,-15.497],[-48.498,-15.493],[-48.496,-15.493],[-48.496,-15.497],[-48.498,-15.497]]'::jsonb));
  -- as duas metades que a tela manda (o corte em x = -48.495): o furo fica INTEIRO na oeste, que leva o anel dele
  oeste constant jsonb := jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array(
    '[[-48.50,-15.50],[-48.495,-15.50],[-48.495,-15.49],[-48.50,-15.49],[-48.50,-15.50]]'::jsonb,
    '[[-48.498,-15.497],[-48.498,-15.493],[-48.496,-15.493],[-48.496,-15.497],[-48.498,-15.497]]'::jsonb));
  leste constant jsonb := '{"type":"Polygon","coordinates":[[[-48.495,-15.50],[-48.49,-15.50],[-48.49,-15.49],[-48.495,-15.49],[-48.495,-15.50]]]}';
  oeste_sem constant jsonb := '{"type":"Polygon","coordinates":[[[-48.50,-15.50],[-48.495,-15.50],[-48.495,-15.49],[-48.50,-15.49],[-48.50,-15.50]]]}';
  pq jsonb;
begin
  select id into strict v_faz from public.fazendas where cliente_id = c_cli and nome = 'Fazenda Teste Cana';
  select m.user_id into strict v_membro from public.cliente_membros m where m.cliente_id = c_cli and m.ativo limit 1;
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo) values (v_faz, c_cli, 'TESTE-PQ PAI', 110, 'cria', true) returning id into v_pai;
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, ativo) values (v_faz, c_cli, 'TESTE-PQ PAI2', 50, 'cria', true) returning id into v_pai2;
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson) values
    (v_faz, c_cli, 'pasto', v_pai, 'TESTE-PQ CONTORNO', contorno) returning id into v_cont;
  pq := jsonb_build_array(jsonb_build_object('nome', 'TESTE-PQ A', 'geojson', oeste), jsonb_build_object('nome', 'TESTE-PQ B', 'geojson', leste));

  -- a área esperada, pela fórmula do banco (função interna: calculada antes de virar `authenticated`)
  v_ha_oeste := public._fn_area_geodesica_ha(oeste); v_ha_oeste_sem := public._fn_area_geodesica_ha(oeste_sem);
  perform set_config('request.jwt.claims', json_build_object('sub', v_membro, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- T1 prévia do caso novo: a oeste tem a área SEM o furo; nada gravado; a prévia da fn_piquetes_concluir vem dentro
  select count(*) into n0 from public.fazenda_geometrias where fazenda_id = v_faz;
  r := public.fn_piquetes_criar(v_pai, pq, c_mes, null, true);
  if r->>'caso' <> 'novo' or (r->'contorno'->>'criado')::boolean or (r->'contorno'->>'id')::uuid <> v_cont
     or (r->'piquetes'->0->>'area_ha')::numeric <> v_ha_oeste
     or (r->'piquetes'->0->>'area_ha')::numeric >= v_ha_oeste_sem
     or (r->'concluir'->>'simulado')::boolean is not true or jsonb_array_length(r->'concluir'->'piquetes') <> 2
     or abs((r->>'dif_contorno_ha')::numeric) > 0.02 then
    raise exception 'T1 prévia: %', r;
  end if;
  select count(*) into n1 from public.fazenda_geometrias where fazenda_id = v_faz;
  if n1 <> n0 or exists (select 1 from public.pastos where fazenda_id = v_faz and nome in ('TESTE-PQ A', 'TESTE-PQ B')) then raise exception 'T1 a prévia gravou'; end if;

  -- T2 gravar: 2 pastos novos no grupo com o elo, pai encerrado, o CONTORNO FICA ligado ao pai (D1 b), a oeste guarda o furo
  r := public.fn_piquetes_criar(v_pai, pq, c_mes, null, false);
  select id into strict v_a from public.pastos where fazenda_id = v_faz and nome = 'TESTE-PQ A';
  select id into strict v_b from public.pastos where fazenda_id = v_faz and nome = 'TESTE-PQ B';
  select grupo_id into strict v_grupo from public.pastos where id = v_a;
  if (select pasto_origem_id from public.pasto_grupos where id = v_grupo) is distinct from v_pai
     or (select grupo_id from public.pastos where id = v_b) is distinct from v_grupo
     or (select data_fim from public.pastos where id = v_pai) is distinct from (c_mes - 1)
     or (select pasto_id from public.fazenda_geometrias where id = v_cont) is distinct from v_pai
     or (select jsonb_array_length(geojson->'coordinates') from public.fazenda_geometrias where pasto_id = v_a) <> 2
     or jsonb_array_length(r->'gestos') <> 2 then
    raise exception 'T2 gravar: %', r;
  end if;

  -- T3 o caso do P6: o grupo já existe e as divisões estão SEM polígono (o fixture tira os polígonos de A e B, como o "unir" das 17:48)
  execute 'reset role';
  update public.fazenda_geometrias set pasto_id = null, tipo = 'outra' where pasto_id in (v_a, v_b);
  select count(*) into v_vig from public.pasto_area_vigencias where pasto_id = v_a;
  select area_produtiva_ha into v_area_a from public.pastos where id = v_a;
  execute 'set local role authenticated';
  select count(*) into n0 from public.pastos where fazenda_id = v_faz;
  r := public.fn_piquetes_criar(v_pai, jsonb_build_array(
         jsonb_build_object('nome', 'TESTE-PQ A', 'geojson', oeste, 'pasto_id', v_a),
         jsonb_build_object('nome', 'TESTE-PQ B', 'geojson', leste, 'pasto_id', v_b)), null, null, true);
  if r->>'caso' <> 'grupo_existente' or r->'concluir' <> 'null'::jsonb or (r->'ligar'->>'simulado')::boolean is not true
     or jsonb_array_length(r->'ligar'->'ligacoes') <> 2 or r->'ligar'->'sem_desenho' <> 'null'::jsonb
     or exists (select 1 from public.fazenda_geometrias where pasto_id in (v_a, v_b)) then
    raise exception 'T3 prévia: %', r;
  end if;
  r := public.fn_piquetes_criar(v_pai, jsonb_build_array(
         jsonb_build_object('nome', 'TESTE-PQ A', 'geojson', oeste, 'pasto_id', v_a),
         jsonb_build_object('nome', 'TESTE-PQ B', 'geojson', leste, 'pasto_id', v_b)), null, null, false);
  if (select count(*) from public.pastos where fazenda_id = v_faz) <> n0
     or (select geojson from public.fazenda_geometrias where pasto_id = v_a) <> oeste
     or (select geojson from public.fazenda_geometrias where pasto_id = v_b) <> leste
     or (select count(*) from public.pasto_area_vigencias where pasto_id = v_a) <> v_vig
     or (select area_produtiva_ha from public.pastos where id = v_a) is distinct from v_area_a
     or (select pasto_id from public.fazenda_geometrias where id = v_cont) is distinct from v_pai then
    raise exception 'T3 ligar: pasto duplicado, histórico mexido ou contorno perdido: %', r;
  end if;

  -- T4 divisão NOVA num grupo que já existe → recusa clara; T5 ligar a pasto fora do grupo → recusa
  begin
    perform public.fn_piquetes_criar(v_pai, jsonb_build_array(jsonb_build_object('nome', 'TESTE-PQ C', 'geojson', oeste),
      jsonb_build_object('nome', 'TESTE-PQ D', 'geojson', leste, 'pasto_id', v_b)), null, null, true);
    raise exception 'T4 passou';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%ligue "TESTE-PQ C" a um pasto do grupo%' then raise exception 'T4 frase: %', sqlerrm; end if;
  end;
  begin
    perform public.fn_piquetes_criar(v_pai, jsonb_build_array(jsonb_build_object('nome', 'TESTE-PQ A', 'geojson', oeste, 'pasto_id', v_pai2),
      jsonb_build_object('nome', 'TESTE-PQ B', 'geojson', leste, 'pasto_id', v_b)), null, null, true);
    raise exception 'T5 passou';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%não é divisão de%' then raise exception 'T5 frase (a da fn_piquetes_ligar): %', sqlerrm; end if;
  end;

  -- T6 pai SEM polígono: sem contorno → recusa; com o contorno (a união) → a prévia o cria ligado ao pai; nomes repetidos → recusa
  begin
    perform public.fn_piquetes_criar(v_pai2, jsonb_build_array(jsonb_build_object('nome', 'TESTE-PQ E', 'geojson', oeste_sem),
      jsonb_build_object('nome', 'TESTE-PQ F', 'geojson', leste)), c_mes, null, true);
    raise exception 'T6 sem contorno passou';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%não tem polígono%' then raise exception 'T6 frase: %', sqlerrm; end if;
  end;
  -- (o contorno do PAI2 encosta no do PAI: a sobreposição é só aviso do escritor; aqui interessa o vínculo)
  r := public.fn_piquetes_criar(v_pai2, jsonb_build_array(jsonb_build_object('nome', 'TESTE-PQ E', 'geojson', oeste_sem),
         jsonb_build_object('nome', 'TESTE-PQ F', 'geojson', leste)), c_mes,
         '{"type":"Polygon","coordinates":[[[-48.50,-15.50],[-48.49,-15.50],[-48.49,-15.49],[-48.50,-15.49],[-48.50,-15.50]]]}', true);
  if not (r->'contorno'->>'criado')::boolean or r->>'caso' <> 'novo' or exists (select 1 from public.fazenda_geometrias where pasto_id = v_pai2) then
    raise exception 'T6 com contorno: %', r;
  end if;
  begin
    perform public.fn_piquetes_criar(v_pai2, jsonb_build_array(jsonb_build_object('nome', 'TESTE-PQ E', 'geojson', oeste_sem),
      jsonb_build_object('nome', 'teste-pq e', 'geojson', leste)), c_mes, '{"type":"Polygon","coordinates":[[[-48.50,-15.50],[-48.49,-15.50],[-48.49,-15.49],[-48.50,-15.49],[-48.50,-15.50]]]}', true);
    raise exception 'T6 nomes repetidos passou';
  exception when sqlstate 'P0001' then null;
  end;

  -- T7 nasce fechada
  execute 'reset role';
  if has_function_privilege('anon', 'public.fn_piquetes_criar(uuid,jsonb,date,jsonb,boolean)', 'execute') then raise exception 'T7 anon executa'; end if;
  if not has_function_privilege('authenticated', 'public.fn_piquetes_criar(uuid,jsonb,date,jsonb,boolean)', 'execute') then raise exception 'T7 authenticated não executa'; end if;

  raise exception 'OK MAPA-CRIAR-PIQUETES-01: T1–T7 (com furo; caso novo pela fn_piquetes_concluir; grupo existente liga sem duplicar; contorno fica)';
end $$;
