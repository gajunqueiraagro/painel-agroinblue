-- FECH-PASTO-UNIDADE-01 · F1 banco 4/4 (Gabriel 07/11/2026 17:06, decisão 3; o card do P5B decidido no terminal): P5A e P5B da PUR são SUBÁREAS do P5.
-- Como aprovado no relatório layout-20261107-1439:
--   · o P5 nasce como pasto pai, 187,1 ha (101 + 86,1), valendo desde 10/2026;
--   · P5A e P5B terminam em 30/09/2026, com o histórico fechado intacto (82 meses cada; nenhum mês fechado é tocado);
--   · nascem os piquetes P5-A (101 ha) e P5-B (86,1 ha) do P5 desde 10/2026, com os polígonos de hoje (5A e 5B passam a eles) e o
--     contorno do P5 = a união dos dois (calculada pela `unirVarios` da tela, com o vértice sul do 5B encaixado no do 5A: 0,39 m);
--   · o card vazio de out/26 do P5A passa ao P5 (o MESMO card); o do P5B, também vazio, é APAGADO (o banco aceita um card por pasto no
--     mês; decisão do Gabriel no terminal), com o antes inteiro na trilha.
-- Não usa o `fn_piquetes_concluir`: ele exige o pai começando ANTES do mês dos piquetes, polígonos soltos e admin logado. Grava pelas mesmas
-- chaves dos escritores (`app.pasto_estrutura_escritor`, `app.pasto_grupo_escritor`); as guardas das tabelas valem. Trilha: `audit_log`
-- com `tabela_origem` = 'pasto_unidade', ação 'pasto_unidade_p5'. Guardas: o estado lido em 07/11 (ids, nomes, áreas, sem fim, sem grupo,
-- 2 cards abertos e vazios só em out/26, 1 polígono de pasto cada) e o contorno batendo com a soma dos dois (1%).
set local lock_timeout = '2s';
do $m$
declare
  v_cli uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  v_p5a uuid := 'aa38fab7-e336-4bfc-8d6b-6f5848f7c522'; v_p5b uuid := '0fe6b023-377e-417c-8858-350b9bb733eb';
  v_g5a uuid := 'fe504d18-0e19-4cde-9340-8ad150a71e50'; v_g5b uuid := '22f7dc5e-03cd-465e-9ec3-a79989149c11';
  v_card_a uuid := 'abdfd9d5-b384-4543-a6aa-520bbe1ea871'; v_card_b uuid := '841c12c6-7adb-432e-89a6-419773dfeb70';
  v_contorno jsonb := '{"type":"Polygon","coordinates":[[[-52.903984,-21.439383],[-52.901786,-21.450918],[-52.898432,-21.448769],[-52.895088,-21.446623],[-52.886608,-21.441174],[-52.886656,-21.441105],[-52.896389,-21.432967],[-52.896938,-21.433255],[-52.897582,-21.433573],[-52.89831,-21.43392],[-52.899113,-21.434449],[-52.900227,-21.435503],[-52.900558,-21.435776],[-52.901031,-21.436167],[-52.901748,-21.436859],[-52.902271,-21.437211],[-52.90274,-21.437561],[-52.90304,-21.43785],[-52.903274,-21.438217],[-52.90341,-21.438571],[-52.903761,-21.439278],[-52.903984,-21.439383]]]}';
  v_faz uuid; a public.pastos; b public.pastos; v_soma numeric; v_area numeric; v_p5 uuid; v_pa uuid; v_pb uuid; v_grupo uuid; v_contorno_id uuid;
  v_card_b_antes jsonb; v_card_a_antes jsonb; v_rodada uuid := gen_random_uuid();
begin
  select id into v_faz from public.fazendas where cliente_id = v_cli and codigo = 'PUR';
  select * into a from public.pastos where id = v_p5a;
  select * into b from public.pastos where id = v_p5b;
  if v_faz is null or a.id is null or b.id is null
     or a.fazenda_id <> v_faz or a.nome <> 'P5A' or a.data_fim is not null or a.grupo_id is not null or a.area_produtiva_ha <> 101 or not a.ativo
     or b.fazenda_id <> v_faz or b.nome <> 'P5B' or b.data_fim is not null or b.grupo_id is not null or b.area_produtiva_ha <> 86.1 or not b.ativo then
    raise exception 'FECH-PASTO-UNIDADE-01 P5: P5A/P5B não estão como lidos em 07/11. Nada foi gravado.';
  end if;
  if exists (select 1 from public.pastos where fazenda_id = v_faz and lower(btrim(nome)) in ('p5', 'p5-a', 'p5-b'))
     or exists (select 1 from public.pasto_grupos where fazenda_id = v_faz and lower(btrim(nome)) = 'p5') then
    raise exception 'FECH-PASTO-UNIDADE-01 P5: já existe P5, P5-A, P5-B ou o grupo P5 na PUR. Nada foi gravado.';
  end if;
  if (select count(*) from public.fechamento_pastos where pasto_id in (v_p5a, v_p5b) and ano_mes >= '2026-10') <> 2
     or (select count(*) from public.fechamento_pastos where id in (v_card_a, v_card_b) and status = 'aberto' and ano_mes = '2026-10') <> 2
     or (select pasto_id from public.fechamento_pastos where id = v_card_a) <> v_p5a or (select pasto_id from public.fechamento_pastos where id = v_card_b) <> v_p5b
     or exists (select 1 from public.fechamento_pasto_itens where fechamento_id in (v_card_a, v_card_b))
     or exists (select 1 from public.fechamento_alocacoes where fechamento_id in (v_card_a, v_card_b) or pasto_id in (v_p5a, v_p5b) and ano_mes >= '2026-10') then
    raise exception 'FECH-PASTO-UNIDADE-01 P5: os cards de out/26 do P5A/P5B não estão abertos e vazios como lidos. Nada foi gravado.';
  end if;
  if (select count(*) from public.fazenda_geometrias where pasto_id in (v_p5a, v_p5b)) <> 2
     or not exists (select 1 from public.fazenda_geometrias where id = v_g5a and pasto_id = v_p5a and tipo = 'pasto')
     or not exists (select 1 from public.fazenda_geometrias where id = v_g5b and pasto_id = v_p5b and tipo = 'pasto') then
    raise exception 'FECH-PASTO-UNIDADE-01 P5: os polígonos 5A/5B não estão como lidos. Nada foi gravado.';
  end if;
  select sum(public._fn_area_geodesica_ha(geojson)) into v_soma from public.fazenda_geometrias where id in (v_g5a, v_g5b);
  v_area := public._fn_area_geodesica_ha(v_contorno);
  if v_area is null or abs(v_area - v_soma) > greatest(v_soma * 0.01, 0.1) then
    raise exception 'FECH-PASTO-UNIDADE-01 P5: o contorno (% ha) não bate com a soma de 5A e 5B (% ha). Nada foi gravado.', v_area, v_soma;
  end if;
  select to_jsonb(fp) into v_card_a_antes from public.fechamento_pastos fp where id = v_card_a;
  select to_jsonb(fp) into v_card_b_antes from public.fechamento_pastos fp where id = v_card_b;

  perform set_config('app.via', 'FECH-PASTO-UNIDADE-01', true);
  perform set_config('app.motivo', 'FECH-PASTO-UNIDADE-01 (decisão 3): P5A e P5B são subáreas do P5 — piquetes P5-A e P5-B desde 10/2026', true);

  -- 1) o P5 e os piquetes P5-A e P5-B, desde 10/2026 (o cadastro herda do P5A: tipo, qualidade, estrutura, ordem)
  perform set_config('app.pasto_estrutura_escritor', '1', true);
  insert into public.pastos (fazenda_id, cliente_id, nome, area, area_produtiva_ha, ativo, entra_conciliacao, data_inicio, tipo_uso,
                             qualidade, lote_padrao, referencia_rebanho, situacao, estrutura, observacoes, ordem_exibicao)
  values (v_faz, v_cli, 'P5', 187.1, 187.1, true, a.entra_conciliacao, '2026-10-01', a.tipo_uso, a.qualidade, a.lote_padrao, a.referencia_rebanho,
          a.situacao, a.estrutura, 'P5A e P5B viram os piquetes P5-A e P5-B em 10/2026', a.ordem_exibicao)
  returning id into v_p5;
  insert into public.pastos (fazenda_id, cliente_id, nome, area, area_produtiva_ha, ativo, entra_conciliacao, data_inicio, tipo_uso,
                             qualidade, lote_padrao, referencia_rebanho, situacao, estrutura, observacoes, ordem_exibicao)
  values (v_faz, v_cli, 'P5-A', 101, 101, true, a.entra_conciliacao, '2026-10-01', a.tipo_uso, a.qualidade, a.lote_padrao, a.referencia_rebanho,
          a.situacao, a.estrutura, 'piquete de P5 (era o P5A até 09/2026)', a.ordem_exibicao)
  returning id into v_pa;
  insert into public.pastos (fazenda_id, cliente_id, nome, area, area_produtiva_ha, ativo, entra_conciliacao, data_inicio, tipo_uso,
                             qualidade, lote_padrao, referencia_rebanho, situacao, estrutura, observacoes, ordem_exibicao)
  values (v_faz, v_cli, 'P5-B', 86.1, 86.1, true, b.entra_conciliacao, '2026-10-01', b.tipo_uso, b.qualidade, b.lote_padrao, b.referencia_rebanho,
          b.situacao, b.estrutura, 'piquete de P5 (era o P5B até 09/2026)', b.ordem_exibicao)
  returning id into v_pb;
  perform set_config('app.pasto_estrutura_escritor', '', true);

  -- 2) o grupo P5, nascido do P5 (o elo que faz de P5-A e P5-B piquetes dele)
  insert into public.pasto_grupos (cliente_id, fazenda_id, nome, ativo, pasto_origem_id) values (v_cli, v_faz, 'P5', true, v_p5) returning id into v_grupo;
  perform set_config('app.pasto_grupo_escritor', '1', true);
  update public.pastos set grupo_id = v_grupo where id in (v_pa, v_pb);
  perform set_config('app.pasto_grupo_escritor', '', true);

  -- 3) os cards de out/26: o do P5A passa ao P5 (o mesmo card); o do P5B (vazio) sai, com o antes na trilha
  update public.fechamento_pastos set pasto_id = v_p5 where id = v_card_a;
  delete from public.fechamento_pastos where id = v_card_b;

  -- 4) P5A e P5B terminam em 30/09/2026 (o histórico fechado fica como está)
  update public.pastos set data_fim = '2026-09-30',
         observacoes = concat_ws(' · ', nullif(btrim(coalesce(observacoes, '')), ''), 'até 09/2026; desde 10/2026 é o piquete P5-A do P5')
   where id = v_p5a;
  update public.pastos set data_fim = '2026-09-30',
         observacoes = concat_ws(' · ', nullif(btrim(coalesce(observacoes, '')), ''), 'até 09/2026; desde 10/2026 é o piquete P5-B do P5')
   where id = v_p5b;

  -- 5) os polígonos: 5A e 5B passam aos piquetes; o contorno do P5 é a união deles
  update public.fazenda_geometrias set pasto_id = v_pa where id = v_g5a;
  update public.fazenda_geometrias set pasto_id = v_pb where id = v_g5b;
  insert into public.fazenda_geometrias (pasto_id, geojson, fazenda_id, cliente_id, tipo, nome_original)
  values (v_p5, v_contorno, v_faz, v_cli, 'pasto', 'P5') returning id into v_contorno_id;

  -- 6) a trilha
  insert into public.audit_log (cliente_id, fazenda_id, usuario_id, modulo, acao, tabela_origem, registro_id, resumo, dados_anteriores, dados_novos, via)
  values (v_cli, v_faz, null, 'cadastros', 'pasto_unidade_p5', 'pasto_unidade', v_rodada,
          'P5A e P5B viram os piquetes P5-A e P5-B do P5 (187,1 ha) desde 10/2026; P5A e P5B terminam em 30/09/2026; o card de out/26 do P5A passa ao P5, o do P5B (vazio) sai',
          jsonb_build_object('p5a', to_jsonb(a), 'p5b', to_jsonb(b), 'card_p5a', v_card_a_antes, 'card_p5b', v_card_b_antes,
                             'geometrias', jsonb_build_object('5A', v_p5a, '5B', v_p5b)),
          jsonb_build_object('p5', v_p5, 'p5_a', v_pa, 'p5_b', v_pb, 'grupo', v_grupo, 'contorno_id', v_contorno_id, 'contorno_ha', round(v_area, 2),
                             'geometrias', jsonb_build_object('5A', v_pa, '5B', v_pb), 'card_p5', v_card_a),
          'sistema:FECH-PASTO-UNIDADE-01');
end $m$;
