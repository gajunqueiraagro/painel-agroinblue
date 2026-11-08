-- FECH-PASTO-UNIDADE-01 F2b — teste da 117490 (fn_pastos_viram_piquetes + _desfazer). Roda como postgres, fixture SINTÉTICO no cliente Teste
-- (43f32d07, Fazenda Teste Cana), meses de 2027 (longe de dado real). Termina em RAISE (ZT0OK): nada fica no banco.
--   T1 prévia: diz o que grava e não grava nada
--   T2 aplicar: pai 70 ha desde 03/2027, piquetes do pai, pastos de hoje terminam em 28/02/2027, cards de mar e abr no pai (as 80 cab de mar
--      marcadas por piquete, nenhuma perdida), os cards que esvaziaram saem, fev fechado intacto, desenhos nos piquetes + contorno, P1 do mês só o pai
--   T3 desfazer (prévia) não muda nada; T4 desfazer recusa se o card do pai mudou depois
--   T5 desfazer volta TUDO ao antes (mesmos ids e campos); o pai e os piquetes ficam inativos; desfazer de novo recusa
--   T6 recusas do fazer: mês fechado desde o início · nome de pasto que existe · só parte desenhada · contorno com área errada
create or replace function pg_temp.fpu2_teste() returns void language plpgsql as $t$
declare
  v_faz uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f'; v_cli uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_bois uuid := 'be504485-172e-45a2-9d3b-8d85da87776e'; c_vacas uuid := 'c67f09dc-1cd7-40e3-abe4-fa571156900e';
  a uuid; b uuid; c uuid; ca_fev uuid; ca_mar uuid; cb_mar uuid; ca_abr uuid; cb_abr uuid;
  x0 numeric := -60.0001; y0 numeric := -5.0;
  v_ret jsonb; v_contorno jsonb; v_antes text; v_depois text; r jsonb; d jsonb; v_pai uuid; v_pa uuid; v_pb uuid; v_rodada uuid; v_n int; v_t text;
begin
  -- as chamadas vão como o admin (as claims do Gabriel, como no teste da F1): o `tenant_ok` e a porta do mapa olham o usuário
  perform set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);
  -- o fixture: A (40 ha) e B (30 ha) lado a lado, desenhados; C (10 ha) sem desenho
  insert into public.pastos (fazenda_id, cliente_id, nome, area, area_produtiva_ha, ativo, entra_conciliacao, data_inicio, tipo_uso)
  values (v_faz, v_cli, 'FPU2-A', 40, 40, true, true, '2026-01-01', 'cria') returning id into a;
  insert into public.pastos (fazenda_id, cliente_id, nome, area, area_produtiva_ha, ativo, entra_conciliacao, data_inicio, tipo_uso)
  values (v_faz, v_cli, 'FPU2-B', 30, 30, true, true, '2026-01-01', 'cria') returning id into b;
  insert into public.pastos (fazenda_id, cliente_id, nome, area, area_produtiva_ha, ativo, entra_conciliacao, data_inicio, tipo_uso)
  values (v_faz, v_cli, 'FPU2-C', 10, 10, true, true, '2026-01-01', 'cria') returning id into c;
  v_ret := jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array(jsonb_build_array(
    jsonb_build_array(x0, y0), jsonb_build_array(x0 + 0.004, y0), jsonb_build_array(x0 + 0.004, y0 + 0.004), jsonb_build_array(x0, y0 + 0.004), jsonb_build_array(x0, y0))));
  insert into public.fazenda_geometrias (pasto_id, geojson, fazenda_id, cliente_id, tipo, nome_original) values (a, v_ret, v_faz, v_cli, 'pasto', 'FPU2-A');
  v_ret := jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array(jsonb_build_array(
    jsonb_build_array(x0 + 0.004, y0), jsonb_build_array(x0 + 0.008, y0), jsonb_build_array(x0 + 0.008, y0 + 0.004), jsonb_build_array(x0 + 0.004, y0 + 0.004), jsonb_build_array(x0 + 0.004, y0))));
  insert into public.fazenda_geometrias (pasto_id, geojson, fazenda_id, cliente_id, tipo, nome_original) values (b, v_ret, v_faz, v_cli, 'pasto', 'FPU2-B');
  v_contorno := jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array(jsonb_build_array(
    jsonb_build_array(x0, y0), jsonb_build_array(x0 + 0.008, y0), jsonb_build_array(x0 + 0.008, y0 + 0.004), jsonb_build_array(x0, y0 + 0.004), jsonb_build_array(x0, y0))));
  -- os cards: fev fechado (histórico), mar com animais nos dois, abr vazios
  insert into public.fechamento_pastos (fazenda_id, cliente_id, pasto_id, ano_mes, status) values (v_faz, v_cli, a, '2027-02', 'fechado') returning id into ca_fev;
  insert into public.fechamento_pastos (fazenda_id, cliente_id, pasto_id, ano_mes, status, lote_mes) values (v_faz, v_cli, a, '2027-03', 'rascunho', 'caderno A') returning id into ca_mar;
  insert into public.fechamento_pastos (fazenda_id, cliente_id, pasto_id, ano_mes, status, lote_mes) values (v_faz, v_cli, b, '2027-03', 'rascunho', 'caderno B') returning id into cb_mar;
  insert into public.fechamento_pastos (fazenda_id, cliente_id, pasto_id, ano_mes, status) values (v_faz, v_cli, a, '2027-04', 'rascunho') returning id into ca_abr;
  insert into public.fechamento_pastos (fazenda_id, cliente_id, pasto_id, ano_mes, status) values (v_faz, v_cli, b, '2027-04', 'rascunho') returning id into cb_abr;
  insert into public.fechamento_pasto_itens (fechamento_id, categoria_id, quantidade, peso_medio_kg, origem_dado)
  values (ca_mar, c_vacas, 50, 400, 'manual'), (ca_mar, c_bois, 10, 500, 'manual'), (cb_mar, c_vacas, 20, 380, 'manual');

  -- o antes inteiro (sem updated_at, que o gatilho mexe)
  select md5(concat_ws('#',
    (select string_agg(concat_ws('|', p.id, p.nome, p.ativo, p.data_inicio, p.data_fim, p.grupo_id, p.observacoes, p.area_produtiva_ha), ';' order by p.nome) from public.pastos p where p.id in (a, b, c)),
    (select string_agg(concat_ws('|', f.id, f.pasto_id, f.ano_mes, f.status, f.lote_mes, f.tipo_uso_mes, f.qualidade_mes, f.observacao_mes, f.created_at), ';' order by f.id) from public.fechamento_pastos f where f.pasto_id in (a, b, c) or f.id in (ca_mar, cb_mar, ca_abr, cb_abr)),
    (select string_agg(concat_ws('|', i.id, i.fechamento_id, i.categoria_id, i.quantidade, i.peso_medio_kg, i.piquete_id, i.lote_id), ';' order by i.id) from public.fechamento_pasto_itens i where i.fechamento_id in (ca_mar, cb_mar, ca_abr, cb_abr, ca_fev)),
    (select string_agg(concat_ws('|', g.id, g.pasto_id), ';' order by g.id) from public.fazenda_geometrias g where g.nome_original in ('FPU2-A', 'FPU2-B'))))
    into v_antes;

  -- T1 prévia — como `authenticated` (a função nasce fechada para PUBLIC/anon e aberta para quem entra)
  execute 'set local role authenticated';
  r := public.fn_pastos_viram_piquetes(array[a, b], 'FPU2', '2027-03-01', array['FPU2-A', 'FPU2-B'], v_contorno, true);
  execute 'reset role';
  if not (r->>'simulado')::boolean or jsonb_array_length(r->'mantidos') <> 2 or jsonb_array_length(r->'saem') <> 2 or (r->'pai'->>'area_ha')::numeric <> 70
     or r->>'frase' not like 'FPU2 nasce com 70,0 ha em 03/2027; FPU2-A, FPU2-B viram os piquetes FPU2-A, FPU2-B e terminam em 28/02/2027; 2 card(s) passam ao FPU2 e 2 card(s) vazio(s) saem%' then
    raise exception using errcode = 'ZT001', message = 'T1 prévia: ' || r::text;
  end if;
  if exists (select 1 from public.pastos where fazenda_id = v_faz and nome = 'FPU2') or (select count(*) from public.fechamento_pastos where id in (cb_mar, cb_abr)) <> 2 then
    raise exception using errcode = 'ZT001', message = 'T1: a prévia gravou';
  end if;

  -- T2 aplicar
  r := public.fn_pastos_viram_piquetes(array[a, b], 'FPU2', '2027-03-01', array['FPU2-A', 'FPU2-B'], v_contorno, false);
  v_pai := (r->'pai'->>'id')::uuid; v_rodada := (r->>'rodada')::uuid;
  select (x->>'piquete')::uuid into v_pa from jsonb_array_elements(r->'piquetes') x where (x->>'antigo')::uuid = a;
  select (x->>'piquete')::uuid into v_pb from jsonb_array_elements(r->'piquetes') x where (x->>'antigo')::uuid = b;
  if (select area_produtiva_ha from public.pastos where id = v_pai) <> 70 or (select data_inicio from public.pastos where id = v_pai) <> '2027-03-01'
     or public._fn_pai_do_piquete(v_pa) is distinct from v_pai or public._fn_pai_do_piquete(v_pb) is distinct from v_pai
     or (select count(*) from public.pastos where id in (a, b) and data_fim = '2027-02-28') <> 2 then
    raise exception using errcode = 'ZT001', message = 'T2 cadastro: ' || r::text;
  end if;
  select string_agg(concat_ws(' ', q.nome, i.quantidade), ', ' order by q.nome, i.quantidade) into v_t
    from public.fechamento_pasto_itens i join public.pastos q on q.id = i.piquete_id where i.fechamento_id = ca_mar;
  if (select pasto_id from public.fechamento_pastos where id = ca_mar) <> v_pai or (select pasto_id from public.fechamento_pastos where id = ca_abr) <> v_pai
     or v_t is distinct from 'FPU2-A 10, FPU2-A 50, FPU2-B 20'
     or (select sum(quantidade) from public.fechamento_pasto_itens where fechamento_id = ca_mar) <> 80
     or exists (select 1 from public.fechamento_pastos where id in (cb_mar, cb_abr))
     or (select concat_ws('|', pasto_id, status) from public.fechamento_pastos where id = ca_fev) <> a::text || '|fechado'
     or (select lote_mes from public.fechamento_pastos where id = ca_mar) is distinct from 'caderno A' then
    raise exception using errcode = 'ZT001', message = 'T2 cards: ' || coalesce(v_t, '(sem linhas)');
  end if;
  if (select pasto_id from public.fazenda_geometrias where nome_original = 'FPU2-A' and pasto_id is not null) <> v_pa
     or (select pasto_id from public.fazenda_geometrias where nome_original = 'FPU2-B' and pasto_id is not null) <> v_pb
     or abs((select public._fn_area_geodesica_ha(geojson) from public.fazenda_geometrias where pasto_id = v_pai) - (r->>'desenhos_ha')::numeric) > 0.1 then
    raise exception using errcode = 'ZT001', message = 'T2 desenhos';
  end if;
  if not exists (select 1 from public.fn_pastos_aplicaveis_mes(v_faz, '2027-03') x where x.pasto_id = v_pai)
     or exists (select 1 from public.fn_pastos_aplicaveis_mes(v_faz, '2027-03') x where x.pasto_id in (a, b, v_pa, v_pb))
     or not exists (select 1 from public.fn_pastos_aplicaveis_mes(v_faz, '2027-02') x where x.pasto_id = a) then
    raise exception using errcode = 'ZT001', message = 'T2 conjunto do mês';
  end if;
  if (select count(*) from public.audit_log where acao = 'pastos_viram_piquetes' and registro_id = v_rodada) <> 1 then
    raise exception using errcode = 'ZT001', message = 'T2 trilha';
  end if;

  -- T3 desfazer (prévia): nada muda
  d := public.fn_pastos_viram_piquetes_desfazer(v_rodada, 'teste', true);
  if not (d->>'simulado')::boolean or (select pasto_id from public.fechamento_pastos where id = ca_mar) <> v_pai then
    raise exception using errcode = 'ZT001', message = 'T3: ' || d::text;
  end if;
  -- T4 o card do pai mudou depois: recusa; voltando o número, passa
  update public.fechamento_pasto_itens set quantidade = 51 where fechamento_id = ca_mar and piquete_id = v_pa and quantidade = 50;
  begin
    perform public.fn_pastos_viram_piquetes_desfazer(v_rodada, 'teste', true);
    raise exception using errcode = 'ZT001', message = 'T4: desfez com o card mudado';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%mudaram depois%' then raise exception using errcode = 'ZT001', message = 'T4 frase: ' || sqlerrm; end if;
  end;
  update public.fechamento_pasto_itens set quantidade = 50 where fechamento_id = ca_mar and piquete_id = v_pa and quantidade = 51;

  -- T5 desfazer: tudo volta
  d := public.fn_pastos_viram_piquetes_desfazer(v_rodada, 'teste', false);
  select md5(concat_ws('#',
    (select string_agg(concat_ws('|', p.id, p.nome, p.ativo, p.data_inicio, p.data_fim, p.grupo_id, p.observacoes, p.area_produtiva_ha), ';' order by p.nome) from public.pastos p where p.id in (a, b, c)),
    (select string_agg(concat_ws('|', f.id, f.pasto_id, f.ano_mes, f.status, f.lote_mes, f.tipo_uso_mes, f.qualidade_mes, f.observacao_mes, f.created_at), ';' order by f.id) from public.fechamento_pastos f where f.pasto_id in (a, b, c) or f.id in (ca_mar, cb_mar, ca_abr, cb_abr)),
    (select string_agg(concat_ws('|', i.id, i.fechamento_id, i.categoria_id, i.quantidade, i.peso_medio_kg, i.piquete_id, i.lote_id), ';' order by i.id) from public.fechamento_pasto_itens i where i.fechamento_id in (ca_mar, cb_mar, ca_abr, cb_abr, ca_fev)),
    (select string_agg(concat_ws('|', g.id, g.pasto_id), ';' order by g.id) from public.fazenda_geometrias g where g.nome_original in ('FPU2-A', 'FPU2-B'))))
    into v_depois;
  if v_depois is distinct from v_antes then
    raise exception using errcode = 'ZT001', message = 'T5: o desfazer não voltou ao antes';
  end if;
  if (select count(*) from public.pastos where id in (v_pai, v_pa, v_pb) and not ativo) <> 3 or exists (select 1 from public.fazenda_geometrias where pasto_id = v_pai)
     or exists (select 1 from public.pasto_grupos where pasto_origem_id = v_pai) then
    raise exception using errcode = 'ZT001', message = 'T5: o pai/os piquetes/o grupo não saíram';
  end if;
  begin
    perform public.fn_pastos_viram_piquetes_desfazer(v_rodada, 'teste', true);
    raise exception using errcode = 'ZT001', message = 'T5: desfez duas vezes';
  exception when sqlstate 'P0001' then null;
  end;

  -- T6 recusas do fazer
  update public.fechamento_pastos set status = 'fechado' where id = cb_mar;
  begin
    perform public.fn_pastos_viram_piquetes(array[a, b], 'FPU2', '2027-03-01', array['FPU2-A', 'FPU2-B'], v_contorno, true);
    raise exception using errcode = 'ZT001', message = 'T6a: aceitou mês fechado';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%FPU2-B tem o mês fechado (03/2027)%' then raise exception using errcode = 'ZT001', message = 'T6a frase: ' || sqlerrm; end if;
  end;
  update public.fechamento_pastos set status = 'rascunho' where id = cb_mar;
  begin
    perform public.fn_pastos_viram_piquetes(array[a, b], 'FPU2-C', '2027-03-01', array['FPU2-A', 'FPU2-B'], v_contorno, true);
    raise exception using errcode = 'ZT001', message = 'T6b: aceitou nome repetido';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%já existe pasto com o nome FPU2-C%' then raise exception using errcode = 'ZT001', message = 'T6b frase: ' || sqlerrm; end if;
  end;
  begin
    perform public.fn_pastos_viram_piquetes(array[a, c], 'FPU3', '2027-03-01', array['FPU3-A', 'FPU3-C'], v_contorno, true);
    raise exception using errcode = 'ZT001', message = 'T6c: aceitou só parte desenhada';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%só parte dos pastos tem desenho%' then raise exception using errcode = 'ZT001', message = 'T6c frase: ' || sqlerrm; end if;
  end;
  begin
    perform public.fn_pastos_viram_piquetes(array[a, b], 'FPU2', '2027-03-01', array['FPU2-A', 'FPU2-B'],
      jsonb_set(v_contorno, '{coordinates,0,1,0}', to_jsonb(x0 + 0.010)), true);
    raise exception using errcode = 'ZT001', message = 'T6d: aceitou contorno errado';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%o contorno (%) não bate com a soma dos desenhos%' then raise exception using errcode = 'ZT001', message = 'T6d frase: ' || sqlerrm; end if;
  end;

  raise exception using errcode = 'ZT0OK', message = format('FPU2 OK — T1–T6 (pai %s ha, 80 cab marcadas por piquete, desfazer = antes)', r->'pai'->>'area_ha');
end $t$;
select pg_temp.fpu2_teste();
