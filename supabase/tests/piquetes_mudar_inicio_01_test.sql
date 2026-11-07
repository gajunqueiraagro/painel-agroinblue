-- PIQUETES-MUDAR-INICIO-01 · teste da 117210 (fn_piquetes_mudar_inicio), numa query só, terminando em RAISE 'OK…' (nada fica).
-- Fixture SINTÉTICO na Fazenda Teste Cana (cliente Teste 43f32d07): um pai com contorno e card no mês anterior (12 cab, 300 kg), 2 piquetes
-- pelo Concluir de sempre no mês atual; a função leva os piquetes para o mês anterior. Com as claims de um admin (a função é só admin).
--   T1 prévia não grava + lotação · T2 grava: piquetes desde o mês novo, pai até a véspera, card INTEIRO no 1º piquete, cabeças iguais,
--   área oficial desde o mês novo (a antiga desfeita), trilha · T3 de novo = recusa · T4 com p_alocar = alocação aos 2 · T5 card fechado = recusa
--   T6 não-admin = recusa · T7 anon sem EXECUTE
do $$
declare
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  v_atual date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;
  v_antes date := (v_atual - interval '1 month')::date;
  v_pai uuid; v_card uuid; v_gA uuid; v_gB uuid; v_r jsonb; v_grupo uuid;
  quad jsonb := '{"type":"Polygon","coordinates":[[[-47.900,-15.900],[-47.898,-15.900],[-47.898,-15.898],[-47.900,-15.898],[-47.900,-15.900]]]}';
  meiaA jsonb := '{"type":"Polygon","coordinates":[[[-47.900,-15.900],[-47.899,-15.900],[-47.899,-15.898],[-47.900,-15.898],[-47.900,-15.900]]]}';
  meiaB jsonb := '{"type":"Polygon","coordinates":[[[-47.899,-15.900],[-47.898,-15.900],[-47.898,-15.898],[-47.899,-15.898],[-47.899,-15.900]]]}';
begin
  set local lock_timeout = '2s';
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);

  -- o pai, o contorno dele, o card do mês anterior e os 2 piquetes pelo Concluir (desde o mês atual)
  insert into public.pastos (fazenda_id, cliente_id, nome, area, area_produtiva_ha, ativo, tipo_uso)
  values (c_faz, c_cli, 'ZZ Teste 117210', 4.6, 4.6, true, 'recria') returning id into v_pai;
  v_r := public.fn_geometria_gravar(c_faz, jsonb_build_object('acao', 'desenhar', 'motivo', 'teste 117210',
    'criar', jsonb_build_array(jsonb_build_object('nome_original', 'ZZ Teste 117210', 'pasto_id', v_pai, 'geojson', quad))), false);
  v_r := public.fn_geometria_gravar(c_faz, jsonb_build_object('acao', 'desenhar', 'motivo', 'teste 117210',
    'criar', jsonb_build_array(jsonb_build_object('nome_original', 'ZZ-A', 'geojson', meiaA))), false);
  v_r := public.fn_geometria_gravar(c_faz, jsonb_build_object('acao', 'desenhar', 'motivo', 'teste 117210',
    'criar', jsonb_build_array(jsonb_build_object('nome_original', 'ZZ-B', 'geojson', meiaB))), false);
  select id into strict v_gA from public.fazenda_geometrias where fazenda_id = c_faz and nome_original = 'ZZ-A';
  select id into strict v_gB from public.fazenda_geometrias where fazenda_id = c_faz and nome_original = 'ZZ-B';
  perform public.fn_obter_ou_criar_fechamento_pasto(c_faz, v_pai, to_char(v_antes, 'YYYY-MM'));
  select id into strict v_card from public.fechamento_pastos where pasto_id = v_pai and ano_mes = to_char(v_antes, 'YYYY-MM');
  insert into public.fechamento_pasto_itens (fechamento_id, categoria_id, quantidade, peso_medio_kg)
  values (v_card, (select id from public.categorias_rebanho limit 1), 12, 300);
  v_r := public.fn_piquetes_concluir(v_pai, array[v_gA, v_gB], v_atual, false, null);
  v_grupo := (v_r->>'grupo_id')::uuid;

  -- T1 a prévia: nada grava; a lotação (12 cab × 300 kg / 450 = 8 UA)
  v_r := public.fn_piquetes_mudar_inicio(v_grupo, v_antes, 'teste', true);
  if (v_r->>'simulado')::boolean is not true or (v_r->'lotacao'->>'ua')::numeric <> 8.0 or v_r->>'card_vai_para' <> 'ZZ-A'
     or (select count(*) from public.pastos where grupo_id = v_grupo and data_inicio = v_antes) <> 0 then
    raise exception 'T1 prévia: %', v_r;
  end if;

  -- T2 grava
  v_r := public.fn_piquetes_mudar_inicio(v_grupo, v_antes, 'teste', false);
  if (select count(*) from public.pastos where grupo_id = v_grupo and data_inicio = v_antes) <> 2
     or (select data_fim from public.pastos where id = v_pai) <> v_antes - 1
     or (select p.nome from public.fechamento_pastos f join public.pastos p on p.id = f.pasto_id where f.id = v_card) <> 'ZZ-A'
     or (select sum(quantidade) from public.fechamento_pasto_itens where fechamento_id = v_card) <> 12
     or (select count(*) from public.fechamento_alocacoes where fechamento_id = v_card) <> 0
     or (select count(*) from public.pasto_area_vigencias v join public.pastos p on p.id = v.pasto_id
          where p.grupo_id = v_grupo and v.vigente_desde = v_antes and v.desfeita_em is null) <> 2
     or (select count(*) from public.pasto_area_vigencias v join public.pastos p on p.id = v.pasto_id
          where p.grupo_id = v_grupo and v.vigente_desde = v_atual and v.desfeita_em is null) <> 0
     or (select count(*) from public.audit_log where acao = 'piquetes_mudar_inicio' and registro_id = v_grupo) <> 1 then
    raise exception 'T2 gravar: %', v_r;
  end if;

  -- T3 de novo: o mês novo tem de ser antes
  begin
    v_r := public.fn_piquetes_mudar_inicio(v_grupo, v_antes, 'teste', true);
    raise exception 'T3 passou: %', v_r;
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%o mês novo tem de ser antes%' then raise exception 'T3 outra recusa: %', sqlerrm; end if;
  end;

  -- T4/T5 noutro gesto: volta o fixture ao mês atual à mão (só neste teste) e prova p_alocar e o card fechado
  perform set_config('app.pasto_estrutura_escritor', '1', true);
  update public.pastos set data_inicio = v_atual where grupo_id = v_grupo;
  update public.pastos set data_fim = v_atual - 1 where id = v_pai;
  update public.fechamento_pastos set pasto_id = v_pai where id = v_card;
  update public.pasto_area_vigencias v set vigente_desde = v_atual from public.pastos p
   where p.id = v.pasto_id and p.grupo_id = v_grupo and v.desfeita_em is null;
  v_r := public.fn_piquetes_mudar_inicio(v_grupo, v_antes, 'teste', false, true);
  if (select count(*) from public.fechamento_alocacoes where fechamento_id = v_card) <> 2 then raise exception 'T4 alocar: %', v_r; end if;

  update public.pastos set data_inicio = v_atual where grupo_id = v_grupo;
  update public.pastos set data_fim = v_atual - 1 where id = v_pai;
  update public.fechamento_pastos set pasto_id = v_pai, status = 'fechado' where id = v_card;
  update public.pasto_area_vigencias v set vigente_desde = v_atual from public.pastos p
   where p.id = v.pasto_id and p.grupo_id = v_grupo and v.desfeita_em is null;
  begin
    v_r := public.fn_piquetes_mudar_inicio(v_grupo, v_antes, 'teste', true);
    raise exception 'T5 passou: %', v_r;
  exception when sqlstate 'P0001' then
    -- a guarda da própria função (a trava de área também recusa, com outra frase: "o pasto está fechado em")
    if sqlerrm not like '%o card de%está fechado%' then raise exception 'T5 outra recusa: %', sqlerrm; end if;
  end;

  -- T6 quem não é admin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  begin
    v_r := public.fn_piquetes_mudar_inicio(v_grupo, v_antes, 'teste', true);
    raise exception 'T6 passou: %', v_r;
  exception when others then
    if sqlerrm like 'T6 passou%' then raise; end if;
  end;

  -- T7 anon
  if has_function_privilege('anon', 'public.fn_piquetes_mudar_inicio(uuid,date,text,boolean,boolean)', 'execute') then raise exception 'T7 anon executa'; end if;

  raise exception 'OK PIQUETES-MUDAR-INICIO-01 117210: T1–T7 (prévia sem gravar e lotação 8 UA · grava com o card inteiro no 1º · de novo recusa · p_alocar · card fechado recusa · não-admin · anon)';
end $$;
