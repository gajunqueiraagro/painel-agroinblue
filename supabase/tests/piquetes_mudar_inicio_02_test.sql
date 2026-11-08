-- PIQUETE-VIGENCIA-01 · teste da 117300 (fn_piquetes_mudar_inicio v2 + fn_piquetes_mudar_inicio_desfazer), numa query só, terminando em
-- RAISE 'OK…' (nada fica). Fixture SINTÉTICO na Fazenda Teste Cana (cliente Teste 43f32d07): um pai com contorno e card dois meses atrás
-- (12 cab, 300 kg), 2 piquetes pelo Concluir de sempre no mês passado. Com as claims de um admin (as funções são só admin).
--   T1 adiar prévia (direção, meses, pastos) · T2 adiar grava · T3 o mesmo mês = recusa · T4 desfazer o adiar (prévia e grava)
--   T5 antecipar com p_alocar (o card inteiro no 1º, alocado aos 2) · T6 adiar com card no piquete = recusa (D2)
--   T7 desfazer o antecipar: o card volta ao pai, a alocação sai, a área oficial volta ao mês de antes · T8 nada para desfazer = recusa
--   T9 mexeu depois do gesto = o desfazer recusa · T10 mês com P1 oficial SEM card do pai = recusa com o HINT 'fechamento:AAAA-MM'
--   T11 não-admin · T12 anon sem EXECUTE nas duas
do $$
declare
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  v_atual date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;
  v_antes date := (v_atual - interval '1 month')::date;     -- o início dos piquetes no Concluir
  v_card_mes date := (v_atual - interval '2 month')::date;  -- o mês do card do pai
  v_longe constant date := '2001-01-01';
  v_pai uuid; v_outro uuid; v_card uuid; v_card_outro uuid; v_gA uuid; v_gB uuid; v_r jsonb; v_grupo uuid; v_hint text; v_fim_pai date;
  quad jsonb := '{"type":"Polygon","coordinates":[[[-47.900,-15.900],[-47.898,-15.900],[-47.898,-15.898],[-47.900,-15.898],[-47.900,-15.900]]]}';
  meiaA jsonb := '{"type":"Polygon","coordinates":[[[-47.900,-15.900],[-47.899,-15.900],[-47.899,-15.898],[-47.900,-15.898],[-47.900,-15.900]]]}';
  meiaB jsonb := '{"type":"Polygon","coordinates":[[[-47.899,-15.900],[-47.898,-15.900],[-47.898,-15.898],[-47.899,-15.898],[-47.899,-15.900]]]}';
begin
  set local lock_timeout = '2s';
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);

  insert into public.pastos (fazenda_id, cliente_id, nome, area, area_produtiva_ha, ativo, tipo_uso)
  values (c_faz, c_cli, 'ZZ Teste 117300', 4.6, 4.6, true, 'recria') returning id into v_pai;
  v_r := public.fn_geometria_gravar(c_faz, jsonb_build_object('acao', 'desenhar', 'motivo', 'teste 117300',
    'criar', jsonb_build_array(jsonb_build_object('nome_original', 'ZZ Teste 117300', 'pasto_id', v_pai, 'geojson', quad))), false);
  v_r := public.fn_geometria_gravar(c_faz, jsonb_build_object('acao', 'desenhar', 'motivo', 'teste 117300',
    'criar', jsonb_build_array(jsonb_build_object('nome_original', 'ZZ3-A', 'geojson', meiaA))), false);
  v_r := public.fn_geometria_gravar(c_faz, jsonb_build_object('acao', 'desenhar', 'motivo', 'teste 117300',
    'criar', jsonb_build_array(jsonb_build_object('nome_original', 'ZZ3-B', 'geojson', meiaB))), false);
  select id into strict v_gA from public.fazenda_geometrias where fazenda_id = c_faz and nome_original = 'ZZ3-A';
  select id into strict v_gB from public.fazenda_geometrias where fazenda_id = c_faz and nome_original = 'ZZ3-B';
  perform public.fn_obter_ou_criar_fechamento_pasto(c_faz, v_pai, to_char(v_card_mes, 'YYYY-MM'));
  select id into strict v_card from public.fechamento_pastos where pasto_id = v_pai and ano_mes = to_char(v_card_mes, 'YYYY-MM');
  insert into public.fechamento_pasto_itens (fechamento_id, categoria_id, quantidade, peso_medio_kg)
  values (v_card, (select id from public.categorias_rebanho limit 1), 12, 300);
  v_r := public.fn_piquetes_concluir(v_pai, array[v_gA, v_gB], v_antes, false, null);
  v_grupo := (v_r->>'grupo_id')::uuid;
  if v_grupo is null then raise exception 'fixture: o Concluir não devolveu o grupo: %', v_r; end if;

  -- T1 adiar (do mês passado para o atual), prévia: nada grava
  v_r := public.fn_piquetes_mudar_inicio(v_grupo, v_atual, 'teste', true);
  if v_r->>'direcao' <> 'adiar' or jsonb_array_length(v_r->'meses') <> 1 or v_r->'meses'->>0 <> to_char(v_antes, 'YYYY-MM')
     or jsonb_array_length(v_r->'pastos') <> 2 or v_r->'pastos'->0->>'nome' <> 'ZZ3-A' or v_r->>'frase' not like '%volta a valer até%'
     or (select count(*) from public.pastos where grupo_id = v_grupo and data_inicio = v_atual) <> 0 then
    raise exception 'T1 adiar prévia: %', v_r;
  end if;

  -- T2 adiar grava: piquetes desde o atual, pai até a véspera do atual, área oficial desde o atual
  v_r := public.fn_piquetes_mudar_inicio(v_grupo, v_atual, 'teste', false);
  if (select count(*) from public.pastos where grupo_id = v_grupo and data_inicio = v_atual) <> 2
     or (select data_fim from public.pastos where id = v_pai) <> v_atual - 1
     or (select count(*) from public.pasto_area_vigencias v join public.pastos p on p.id = v.pasto_id
          where p.grupo_id = v_grupo and v.vigente_desde = v_atual and v.desfeita_em is null) <> 2
     or (select count(*) from public.pasto_area_vigencias v join public.pastos p on p.id = v.pasto_id
          where p.grupo_id = v_grupo and v.vigente_desde = v_antes and v.desfeita_em is null) <> 0
     or (select dados_novos->>'direcao' from public.audit_log where acao = 'piquetes_mudar_inicio' and registro_id = v_grupo) <> 'adiar' then
    raise exception 'T2 adiar grava: %', v_r;
  end if;

  -- T3 o mesmo mês
  begin
    v_r := public.fn_piquetes_mudar_inicio(v_grupo, v_atual, 'teste', true);
    raise exception 'T3 passou: %', v_r;
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%já começam em%' then raise exception 'T3 outra recusa: %', sqlerrm; end if;
  end;

  -- T4 desfazer o adiar: prévia não grava; grava = piquetes de volta ao mês passado, pai de volta ao fim de antes, área oficial ao mês passado
  v_r := public.fn_piquetes_mudar_inicio_desfazer(v_grupo, 'teste', true);
  if v_r->>'para' <> v_antes::text or (select count(*) from public.pastos where grupo_id = v_grupo and data_inicio = v_atual) <> 2 then
    raise exception 'T4 desfazer prévia: %', v_r;
  end if;
  v_r := public.fn_piquetes_mudar_inicio_desfazer(v_grupo, 'teste', false);
  if (select count(*) from public.pastos where grupo_id = v_grupo and data_inicio = v_antes) <> 2
     or (select data_fim from public.pastos where id = v_pai) <> v_antes - 1
     or (select observacoes from public.pastos where id = v_pai) like '%passaram a começar em ' || to_char(v_atual, 'MM/YYYY') || '%'
     or (select count(*) from public.pasto_area_vigencias v join public.pastos p on p.id = v.pasto_id
          where p.grupo_id = v_grupo and v.vigente_desde = v_antes and v.desfeita_em is null) <> 2
     or (select count(*) from public.pasto_area_vigencias v join public.pastos p on p.id = v.pasto_id
          where p.grupo_id = v_grupo and v.vigente_desde = v_atual and v.desfeita_em is null) <> 0
     or (select count(*) from public.audit_log where acao = 'piquetes_mudar_inicio_desfeito' and registro_id = v_grupo) <> 1 then
    raise exception 'T4 desfazer grava: %', v_r;
  end if;

  -- T5 antecipar ao mês do card, com p_alocar: o card INTEIRO no 1º piquete e alocado aos 2
  v_r := public.fn_piquetes_mudar_inicio(v_grupo, v_card_mes, 'teste', false, true);
  if (select p.nome from public.fechamento_pastos f join public.pastos p on p.id = f.pasto_id where f.id = v_card) <> 'ZZ3-A'
     or (select count(*) from public.fechamento_alocacoes where fechamento_id = v_card) <> 2
     or (select data_fim from public.pastos where id = v_pai) <> v_card_mes - 1 then
    raise exception 'T5 antecipar: %', v_r;
  end if;

  -- T6 adiar com o card no piquete: recusa (D2, nada volta sozinho ao pai)
  begin
    v_r := public.fn_piquetes_mudar_inicio(v_grupo, v_antes, 'teste', true);
    raise exception 'T6 passou: %', v_r;
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%ZZ3-A já tem card antes de%' then raise exception 'T6 outra recusa: %', sqlerrm; end if;
  end;

  -- T7 desfazer o antecipar: o card volta ao pai, a alocação sai, a área oficial volta ao mês passado, cabeças iguais
  v_r := public.fn_piquetes_mudar_inicio_desfazer(v_grupo, 'teste', false);
  if (select pasto_id from public.fechamento_pastos where id = v_card) <> v_pai
     or (select count(*) from public.fechamento_alocacoes where fechamento_id = v_card) <> 0
     or (select sum(quantidade) from public.fechamento_pasto_itens where fechamento_id = v_card) <> 12
     or (v_r->>'cabecas')::int <> 12
     or (select count(*) from public.pastos where grupo_id = v_grupo and data_inicio = v_antes) <> 2
     or (select data_fim from public.pastos where id = v_pai) <> v_antes - 1
     or (select count(*) from public.pasto_area_vigencias v join public.pastos p on p.id = v.pasto_id
          where p.grupo_id = v_grupo and v.vigente_desde = v_antes and v.desfeita_em is null) <> 2
     or (select count(*) from public.pasto_area_vigencias v join public.pastos p on p.id = v.pasto_id
          where p.grupo_id = v_grupo and v.vigente_desde = v_card_mes and v.desfeita_em is null) <> 0 then
    raise exception 'T7 desfazer o antecipar: %', v_r;
  end if;

  -- T8 nada mais para desfazer
  begin
    v_r := public.fn_piquetes_mudar_inicio_desfazer(v_grupo, 'teste', true);
    raise exception 'T8 passou: %', v_r;
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%não tem mudança de mês de início para desfazer%' then raise exception 'T8 outra recusa: %', sqlerrm; end if;
  end;

  -- T9 mexeu depois do gesto: o desfazer recusa (aqui o fim do pai mudado à mão, só neste teste)
  v_r := public.fn_piquetes_mudar_inicio(v_grupo, v_atual, 'teste', false);
  perform set_config('app.pasto_estrutura_escritor', '1', true);
  select data_fim into v_fim_pai from public.pastos where id = v_pai;
  update public.pastos set data_fim = v_fim_pai - 1 where id = v_pai;
  begin
    v_r := public.fn_piquetes_mudar_inicio_desfazer(v_grupo, 'teste', true);
    raise exception 'T9 passou: %', v_r;
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%o fim de ZZ Teste 117300 mudou depois do gesto%' then raise exception 'T9 outra recusa: %', sqlerrm; end if;
  end;
  update public.pastos set data_fim = v_fim_pai where id = v_pai;
  v_r := public.fn_piquetes_mudar_inicio_desfazer(v_grupo, 'teste', false);

  -- T10 mês com P1 oficial e SEM card do pai: outro pasto da fazenda com o único card do mês, fechado
  insert into public.pastos (fazenda_id, cliente_id, nome, area, area_produtiva_ha, ativo, tipo_uso)
  values (c_faz, c_cli, 'ZZ Outro 117300', 1, 1, true, 'recria') returning id into v_outro;
  perform public.fn_obter_ou_criar_fechamento_pasto(c_faz, v_outro, to_char(v_longe, 'YYYY-MM'));
  select id into strict v_card_outro from public.fechamento_pastos where pasto_id = v_outro and ano_mes = to_char(v_longe, 'YYYY-MM');
  update public.fechamento_pastos set status = 'fechado' where id = v_card_outro;
  if (public._fn_status_pilares_fechamento(c_faz, to_char(v_longe, 'YYYY-MM'))->'p1_mapa_pastos'->>'status') <> 'oficial' then
    raise exception 'T10 fixture: o mês % não ficou oficial', to_char(v_longe, 'YYYY-MM');
  end if;
  begin
    v_r := public.fn_piquetes_mudar_inicio(v_grupo, v_longe, 'teste', true);
    raise exception 'T10 passou: %', v_r;
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_hint = pg_exception_hint;
    if sqlerrm not like '%o fechamento de 01/2001 está fechado%' or coalesce(v_hint, '') not like 'fechamento:____-__' then
      raise exception 'T10 outra recusa: % (hint %)', sqlerrm, v_hint;
    end if;
  end;

  -- T11 quem não é admin (as duas)
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  begin
    v_r := public.fn_piquetes_mudar_inicio_desfazer(v_grupo, 'teste', true);
    raise exception 'T11 passou: %', v_r;
  exception when others then
    if sqlerrm like 'T11 passou%' then raise; end if;
  end;
  begin
    v_r := public.fn_piquetes_mudar_inicio(v_grupo, v_card_mes, 'teste', true);
    raise exception 'T11b passou: %', v_r;
  exception when others then
    if sqlerrm like 'T11b passou%' then raise; end if;
  end;

  -- T12 anon
  if has_function_privilege('anon', 'public.fn_piquetes_mudar_inicio(uuid,date,text,boolean,boolean)', 'execute')
     or has_function_privilege('anon', 'public.fn_piquetes_mudar_inicio_desfazer(uuid,text,boolean)', 'execute') then
    raise exception 'T12 anon executa';
  end if;

  raise exception 'OK PIQUETE-VIGENCIA-01 117300: T1–T12 (adiar prévia e grava · mesmo mês recusa · desfazer o adiar · antecipar com alocar · adiar com uso recusa · desfazer o antecipar devolve card e alocação · nada para desfazer · mexeu depois recusa · P1 oficial sem card com hint · não-admin · anon)';
end $$;
