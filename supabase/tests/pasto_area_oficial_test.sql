-- PASTO-AREA-OFICIAL-01 (116120 + 116130) — a área oficial do pasto com vigência e o "Usar área do mapa". Fixture SINTÉTICA na fazenda
-- do cliente Teste (c2498ace, nenhum mês fechado): 3 pastos (A 100 ha com 1 polígono, B 50 ha com um polígono SEM ÁREA (degenerado), C
-- 80 ha sem polígono). (Dois polígonos no mesmo pasto o banco já não deixa: `fazenda_geometrias_um_por_pasto`.)
-- As RPCs rodam como `authenticated` (admin 7bd0b6ad; a guarda com o de fora a91962cd). TERMINA EM RAISE: nada fica.
--   G1  a área geodésica do polígono = a fórmula fechada do trapézio esférico (R² · Δλ · |sen φ2 − sen φ1|, R = 6378137 m)
--   U1  prévia do lote [A, B, C]: A 'muda' (100 → área do mapa, com a lotação do mês antes × depois), B recusa (polígono sem área), C recusa
--       (sem polígono); nada gravado
--   U2  gravar o lote com recusa: P0001 com os nomes e motivos; nada gravado
--   U3  gravar [A] do mês atual: 1 linha 'mapa' (anterior 100, lote), `pastos.area_produtiva_ha` = a do mapa; o mês ANTERIOR continua 100
--       (fn_pasto_area_no_mes, fn_pastos_aplicaveis_mes e fn_lotacao_do_mes)
--   U4  de novo: prévia 'igual'; gravar = "Nada a mudar"
--   E1  editar A à mão no mesmo mês (110): a linha do mapa fica na trilha como substituída; a nova guarda a anterior 100; o cadastro = 110
--   E2  editar com mês futuro: recusa; sem motivo: recusa
--   C1  comparar: A com oficial 110, mapa, diferença e a última mudança 'manual'; B com área do mapa 0
--   T1  o GATILHO: UPDATE direto da área de B (como o formulário, `authenticated` sob a RLS) vira vigência 'cadastro' do mês (anterior
--       50); o mês anterior continua 50
--   D1  desfazer a mudança de B: a linha fica marcada; B volta a 50; nenhuma linha nova
--   D2  desfazer uma mudança mais antiga com uma mais nova viva: recusa
--   R1  a trava: com o card de A FECHADO no mês atual, editar e desfazer recusam ("o pasto está fechado em MM/AAAA")
--   S1  a guarda: o usuário de fora leva 42501 nas 4 expostas; `authenticated` não executa as internas
-- Mutações (ensaio, ver o relatório): MA1 o leitor sem a vigência (só o cadastro) derruba U3 · MA2 o gatilho desligado derruba T1 · MA3
-- a trava sem o card fechado derruba R1 · MA4 a lotação lendo a área de hoje derruba U3 · MA5 desfazer sem a regra da mais nova derruba D2.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

-- fixture (como postgres) -----------------------------------------------------------------------------------------------------------
do $fx$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  v_a uuid; v_b uuid; v_c uuid;
  quad jsonb := '{"type":"Polygon","coordinates":[[[-50.00,-20.00],[-49.99,-20.00],[-49.99,-19.99],[-50.00,-19.99],[-50.00,-20.00]]]}';
  linha jsonb := '{"type":"Polygon","coordinates":[[[-50.00,-20.00],[-49.99,-20.00],[-50.00,-20.00]]]}';
begin
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, ativo, tipo_uso, situacao)
  values (c_faz, c_cli, 'Pasto sintetico area A', 100, true, 'recria', 'ativo') returning id into v_a;
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, ativo, tipo_uso, situacao)
  values (c_faz, c_cli, 'Pasto sintetico area B', 50, true, 'recria', 'ativo') returning id into v_b;
  insert into public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, ativo, tipo_uso, situacao)
  values (c_faz, c_cli, 'Pasto sintetico area C', 80, true, 'recria', 'ativo') returning id into v_c;
  insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson) values
    (c_faz, c_cli, 'pasto', v_a, 'A', quad), (c_faz, c_cli, 'pasto', v_b, 'B', linha);
  /* um card ABERTO de A no mês atual e no anterior (a lotação lista o pasto do card) */
  insert into public.fechamento_pastos (pasto_id, fazenda_id, cliente_id, ano_mes, status) values
    (v_a, c_faz, c_cli, to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM'), 'aberto'),
    (v_a, c_faz, c_cli, to_char(((now() at time zone 'America/Sao_Paulo')::date - interval '1 month'), 'YYYY-MM'), 'aberto');
  perform set_config('teste.a', v_a::text, true); perform set_config('teste.b', v_b::text, true); perform set_config('teste.c', v_c::text, true);
  perform set_config('teste.mes', to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM'), true);
  perform set_config('teste.mes_ant', to_char(((now() at time zone 'America/Sao_Paulo')::date - interval '1 month'), 'YYYY-MM'), true);
  /* G1 */
  if public._fn_area_geodesica_ha(quad) is distinct from
     round((6378137.0::numeric ^ 2 * radians(0.01)::numeric * abs(sin(radians(-19.99)) - sin(radians(-20.00)))::numeric / 10000), 2) then
    raise exception 'G1: geodesica % x formula fechada %', public._fn_area_geodesica_ha(quad),
      round((6378137.0::numeric ^ 2 * radians(0.01)::numeric * abs(sin(radians(-19.99)) - sin(radians(-20.00)))::numeric / 10000), 2);
  end if;
  perform set_config('teste.mapa', public._fn_area_geodesica_ha(quad)::text, true);
  if public._fn_pasto_area_trava(v_a, c_faz, date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date) is not null then
    raise exception 'fixture: o mes atual da fazenda Teste esta travado — o teste nao prova nada';
  end if;
end $fx$;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $u$
declare
  a uuid := current_setting('teste.a')::uuid; b uuid := current_setting('teste.b')::uuid; c uuid := current_setting('teste.c')::uuid;
  mes date := to_date(current_setting('teste.mes') || '-01', 'YYYY-MM-DD'); mapa numeric := current_setting('teste.mapa')::numeric;
  r jsonb; ia jsonb; x record;
begin
  -- U1
  r := public.fn_pasto_area_usar_mapa(array[a, b, c], mes, 'o mapa mediu melhor (sintetico)', true);
  select i into ia from jsonb_array_elements(r->'itens') i where i->>'pasto_id' = a::text;
  if (r->>'ok')::boolean or (r->>'n_muda')::int <> 1 or (r->>'n_recusa')::int <> 2
     or ia->>'situacao' <> 'muda' or (ia->>'area_antes')::numeric <> 100 or (ia->>'area_mapa')::numeric <> mapa
     or ia->>'lotacao_mes' <> current_setting('teste.mes')
     or (select i->>'motivo' from jsonb_array_elements(r->'itens') i where i->>'pasto_id' = b::text) <> 'O polígono do mapa não tem área.'
     or (select i->>'motivo' from jsonb_array_elements(r->'itens') i where i->>'pasto_id' = c::text) <> 'O pasto não tem polígono no mapa.' then
    raise exception 'U1: %', r;
  end if;
  if exists (select 1 from public.pasto_area_vigencias where pasto_id in (a, b, c)) then raise exception 'U1: a previa gravou'; end if;
  -- U2
  begin
    perform public.fn_pasto_area_usar_mapa(array[a, b], mes, 'o mapa mediu melhor (sintetico)', false);
    raise exception 'U2: gravou com recusa';
  exception when others then
    if sqlstate <> 'P0001' or sqlerrm <> '1 pasto(s) não podem usar a área do mapa: Pasto sintetico area B — O polígono do mapa não tem área.' then
      raise exception 'U2 recusa: % %', sqlstate, sqlerrm;
    end if;
  end;
  if exists (select 1 from public.pasto_area_vigencias where pasto_id in (a, b, c)) then raise exception 'U2: gravou parte'; end if;
  -- U3
  r := public.fn_pasto_area_usar_mapa(array[a], mes, ' o mapa mediu melhor (sintetico) ', false);
  select * into x from public.pasto_area_vigencias where pasto_id = a;
  if x.origem <> 'mapa' or x.area_ha <> mapa or x.area_anterior_ha <> 100 or x.vigente_desde <> mes or x.lote is distinct from (r->>'lote')::uuid
     or x.motivo <> 'o mapa mediu melhor (sintetico)' or x.criado_por <> '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e'::uuid or x.area_mapa_ha <> mapa then
    raise exception 'U3 trilha: %', row_to_json(x);
  end if;
  if (select area_produtiva_ha from public.pastos where id = a) <> mapa then raise exception 'U3: o cadastro nao virou a area do mapa'; end if;
  if public.fn_pasto_area_no_mes(a, current_setting('teste.mes_ant')) <> 100 or public.fn_pasto_area_no_mes(a, current_setting('teste.mes')) <> mapa then
    raise exception 'U3: area do mes ant % / atual %', public.fn_pasto_area_no_mes(a, current_setting('teste.mes_ant')), public.fn_pasto_area_no_mes(a, current_setting('teste.mes'));
  end if;
  if (select area_considerada_ha from public.fn_pastos_aplicaveis_mes('c2498ace-8478-410c-a697-d3f2e2934d1f', current_setting('teste.mes_ant')) where pasto_id = a) <> 100
     or (select area_considerada_ha from public.fn_pastos_aplicaveis_mes('c2498ace-8478-410c-a697-d3f2e2934d1f', current_setting('teste.mes')) where pasto_id = a) <> mapa then
    raise exception 'U3: fn_pastos_aplicaveis_mes nao le a area do mes';
  end if;
  if (select l.area_ha from public.fn_lotacao_do_mes('c2498ace-8478-410c-a697-d3f2e2934d1f', current_setting('teste.mes_ant')) l where l.pasto_id = a) <> 100
     or (select l.area_ha from public.fn_lotacao_do_mes('c2498ace-8478-410c-a697-d3f2e2934d1f', current_setting('teste.mes')) l where l.pasto_id = a) <> mapa then
    raise exception 'U3: a lotacao nao le a area do mes';
  end if;
  -- U4
  r := public.fn_pasto_area_usar_mapa(array[a], mes, 'de novo', true);
  if r->'itens'->0->>'situacao' <> 'igual' then raise exception 'U4 previa: %', r; end if;
  begin
    perform public.fn_pasto_area_usar_mapa(array[a], mes, 'de novo', false);
    raise exception 'U4: gravou igual';
  exception when others then if sqlerrm <> 'Nada a mudar: a área oficial já é a do mapa.' then raise exception 'U4: %', sqlerrm; end if;
  end;
  -- E1
  r := public.fn_pasto_area_editar(a, 110, mes, 'medido com GPS (sintetico)', true);
  if (r->>'area_antes')::numeric <> mapa or (r->>'area_depois')::numeric <> 110 then raise exception 'E1 previa: %', r; end if;
  if (select area_produtiva_ha from public.pastos where id = a) <> mapa then raise exception 'E1: a previa gravou'; end if;
  r := public.fn_pasto_area_editar(a, 110, mes, 'medido com GPS (sintetico)', false);
  if (select count(*) from public.pasto_area_vigencias where pasto_id = a) <> 2
     or (select desfeita_motivo from public.pasto_area_vigencias where pasto_id = a and origem = 'mapa') <> 'substituída por outra mudança do mesmo mês'
     or (select area_anterior_ha from public.pasto_area_vigencias where pasto_id = a and desfeita_em is null) <> 100
     or (select origem from public.pasto_area_vigencias where pasto_id = a and desfeita_em is null) <> 'manual'
     or (select area_produtiva_ha from public.pastos where id = a) <> 110 then
    raise exception 'E1: trilha/cadastro';
  end if;
  perform set_config('teste.vig_a', r->>'vigencia_id', true);
  -- E2
  begin
    perform public.fn_pasto_area_editar(a, 120, (mes + interval '1 month')::date, 'futuro', true);
    raise exception 'E2: mes futuro passou';
  exception when others then if sqlerrm not like 'A área nova vale de um mês até o mês atual%' then raise exception 'E2: %', sqlerrm; end if;
  end;
  begin
    perform public.fn_pasto_area_editar(a, 120, mes, '  ', true);
    raise exception 'E2: sem motivo passou';
  exception when others then if sqlerrm <> 'Informe o motivo.' then raise exception 'E2 motivo: %', sqlerrm; end if;
  end;
  -- C1
  select * into x from public.fn_pastos_area_comparar('c2498ace-8478-410c-a697-d3f2e2934d1f', current_setting('teste.mes')) where pasto_id = a;
  if x.area_oficial_ha <> 110 or x.area_mapa_ha <> mapa or x.dif_ha <> round(mapa - 110, 2) or x.ultima_origem <> 'manual' or x.n_poligonos <> 1
     or x.trava is not null then
    raise exception 'C1 A: %', row_to_json(x);
  end if;
  select * into x from public.fn_pastos_area_comparar('c2498ace-8478-410c-a697-d3f2e2934d1f', current_setting('teste.mes')) where pasto_id = b;
  if x.area_mapa_ha <> 0 or x.n_poligonos <> 1 or x.area_oficial_ha <> 50 then raise exception 'C1 B: %', row_to_json(x); end if;
  -- T1 (o gatilho: como o formulário grava hoje)
  update public.pastos set area_produtiva_ha = 65 where id = b;
  select * into x from public.pasto_area_vigencias where pasto_id = b;
  if x.origem <> 'cadastro' or x.area_ha <> 65 or x.area_anterior_ha <> 50 or x.vigente_desde <> mes then raise exception 'T1: %', row_to_json(x); end if;
  if public.fn_pasto_area_no_mes(b, current_setting('teste.mes_ant')) <> 50 then raise exception 'T1: o mes anterior mudou'; end if;
  perform set_config('teste.vig_b', x.id::text, true);
  -- D1
  r := public.fn_pasto_area_desfazer(array[current_setting('teste.vig_b')::uuid], 'digitei errado (sintetico)', true);
  if (r->>'ok')::boolean is not true or (r->'itens'->0->>'volta_para')::numeric <> 50 then raise exception 'D1 previa: %', r; end if;
  r := public.fn_pasto_area_desfazer(array[current_setting('teste.vig_b')::uuid], 'digitei errado (sintetico)', false);
  if (select area_produtiva_ha from public.pastos where id = b) <> 50
     or (select count(*) from public.pasto_area_vigencias where pasto_id = b) <> 1
     or (select desfeita_motivo from public.pasto_area_vigencias where pasto_id = b) <> 'digitei errado (sintetico)'
     or public.fn_pasto_area_no_mes(b, current_setting('teste.mes')) <> 50 then
    raise exception 'D1: B nao voltou a 50 (ou o desfazer gravou linha nova)';
  end if;
end $u$;
reset role;

-- D2: uma mudança mais ANTIGA de A (como postgres, no mês anterior), e tentar desfazê-la com a do mês atual viva
insert into public.pasto_area_vigencias (cliente_id, fazenda_id, pasto_id, vigente_desde, area_ha, area_anterior_ha, origem, motivo)
values ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f', current_setting('teste.a')::uuid,
        to_date(current_setting('teste.mes_ant') || '-01', 'YYYY-MM-DD'), 105, 100, 'manual', 'fixture antiga');
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $d2$
declare r jsonb; v_antiga uuid := (select id from public.pasto_area_vigencias where pasto_id = current_setting('teste.a')::uuid and motivo = 'fixture antiga');
begin
  begin
    perform public.fn_pasto_area_desfazer(array[v_antiga], 'x', false);
    raise exception 'D2: desfez a antiga com a nova viva';
  exception when others then if sqlerrm not like 'Não dá para desfazer: Pasto sintetico area A — há uma mudança mais nova (%' then raise exception 'D2: %', sqlerrm; end if;
  end;
end $d2$;
reset role;

-- R1: o card de A fechado no mês atual
update public.fechamento_pastos set status = 'fechado' where pasto_id = current_setting('teste.a')::uuid and ano_mes = current_setting('teste.mes');
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $r1$
declare a uuid := current_setting('teste.a')::uuid; frase text := 'o pasto está fechado em ' || to_char(to_date(current_setting('teste.mes') || '-01', 'YYYY-MM-DD'), 'MM/YYYY');
begin
  begin
    perform public.fn_pasto_area_editar(a, 130, to_date(current_setting('teste.mes') || '-01', 'YYYY-MM-DD'), 'x', true);
    raise exception 'R1: editou mes fechado';
  exception when others then if sqlerrm <> 'A área não muda: ' || frase || '. Reabra o mês antes.' then raise exception 'R1 editar: %', sqlerrm; end if;
  end;
  begin
    perform public.fn_pasto_area_desfazer(array[current_setting('teste.vig_a')::uuid], 'x', false);
    raise exception 'R1: desfez mes fechado';
  exception when others then if sqlerrm not like 'Não dá para desfazer: Pasto sintetico area A — ' || frase || '%' then raise exception 'R1 desfazer: %', sqlerrm; end if;
  end;
  begin
    update public.pastos set area_produtiva_ha = 131 where id = a;
    raise exception 'R1: o formulario mudou a area de mes fechado';
  exception when others then if sqlerrm <> 'A área não muda: ' || frase || '. Reabra o mês antes.' then raise exception 'R1 gatilho: %', sqlerrm; end if;
  end;
end $r1$;
reset role;

-- S1: a guarda
select set_config('request.jwt.claims', '{"sub":"a91962cd-56dd-4729-b2e1-dcd4a1d7b9c9","role":"authenticated"}', true);
set local role authenticated;
do $s1$
declare a uuid := current_setting('teste.a')::uuid; n int := 0; c text;
begin
  if coalesce(public.tenant_ok('43f32d07-dba8-4670-900c-bf645440c04a'), false) then raise exception 'S1: o de fora tem acesso ao Teste'; end if;
  foreach c in array array[
    format('select public.fn_pasto_area_usar_mapa(array[%L::uuid], current_date, %L, true)', a, 'x'),
    format('select public.fn_pasto_area_editar(%L::uuid, 10, current_date, %L, true)', a, 'x'),
    format('select public.fn_pasto_area_desfazer(array[%L::uuid], %L, true)', current_setting('teste.vig_a'), 'x'),
    format('select count(*) from public.fn_pastos_area_comparar(%L::uuid, %L)', 'c2498ace-8478-410c-a697-d3f2e2934d1f', current_setting('teste.mes')),
    'select public._fn_area_geodesica_ha(null)',
    format('select public._fn_pasto_area_trava(%L::uuid, %L::uuid, current_date)', a, 'c2498ace-8478-410c-a697-d3f2e2934d1f'),
    format('select public._fn_pasto_area_sincronizar(%L::uuid)', a)] loop
    begin
      execute c;
      raise exception 'S1: atendeu o de fora: %', c;
    exception when insufficient_privilege then n := n + 1;
    end;
  end loop;
  if n <> 7 then raise exception 'S1: % recusas', n; end if;
end $s1$;
reset role;

do $fim$ begin raise exception 'OK pasto_area_oficial (G1, U1–U4, E1–E2, C1, T1, D1–D2, R1, S1)'; end $fim$;
rollback;
