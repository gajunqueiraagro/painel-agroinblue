-- MAPA-AREA-TIPOS-02 · teste do CATÁLOGO ÚNICO dos tipos de área e da estrutura com valor como infraestrutura (20261028117120).
-- Fixture SINTÉTICA no cliente Teste (43f32d07, Fazenda Teste Cana c2498ace): um polígono inserido pelo postgres e classificado pelo
-- escritor como o admin (7bd0b6ad); o usuário de FORA é a91962cd. Roda como `postgres`, as chamadas como `authenticated` com as claims.
-- TERMINA EM RAISE: nada fica no banco.
--   T0  o catálogo do banco é IGUAL ao da tela (src/lib/mapa/tiposDeArea.catalogo.json, copiado entre as marcas CATALOGO abaixo; o
--       teste da tela confere a cópia com o arquivo); toda estrutura com valor aponta para um tipo de infraestrutura que existe e tem ficha;
--       as duas travas e o escritor não têm mais lista escrita à mão; a função nova fechada; a interna fechada
--   T0b as fichas das 6 infraestruturas novas = os exemplos da tela (bloco FICHAS-NOVAS)
--   T1  classificar como "Armazém / barracão de grãos" (tipo novo): grava, a prévia diz o rótulo novo, a memória do KMZ aceita
--   T2  recusas: tipo que não existe (frase do escritor), INSERT direto com tipo que não existe (a trava)
--   T3  a estrutura da área: a prévia diz o tipo de infraestrutura e não grava; gravar cria a infraestrutura com a geometria e o elo
--       (versão 2, trilha criar + alterar); de novo = a mesma (idempotente); o bem nasce pelo fn_infra_criar_bem
--   T4  tipo de área sem valor (Lagoa) recusa a estrutura
--   T5  o usuário de FORA: 42501
-- Mutações (ensaio): M1 o catálogo do banco sem um tipo → T0 pega · M2 a estrutura sem o tenant_ok → T5 pega.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '20s';

do $t0$
declare
  -- CATALOGO-INICIO
  c_tela constant jsonb := '[{"tipo": "armazem_graos", "rotulo": "Armazém / barracão de grãos", "familia": "estruturas", "atividade": "agricultura", "infra": "armazem_graos"}, {"tipo": "silo_secador", "rotulo": "Silo / secador", "familia": "estruturas", "atividade": "agricultura", "infra": "silo_secador"}, {"tipo": "oficina", "rotulo": "Galpão de máquinas / oficina", "familia": "estruturas", "atividade": "comum", "infra": "oficina"}, {"tipo": "benfeitoria", "rotulo": "Sede / benfeitorias", "familia": "estruturas", "atividade": "comum", "infra": "sede_casa"}, {"tipo": "casa_funcionario", "rotulo": "Casa de funcionário", "familia": "estruturas", "atividade": "comum", "infra": "casa_funcionario"}, {"tipo": "escritorio", "rotulo": "Escritório", "familia": "estruturas", "atividade": "comum", "infra": "escritorio"}, {"tipo": "patio", "rotulo": "Pátio", "familia": "estruturas", "atividade": "comum", "infra": null}, {"tipo": "curral", "rotulo": "Curral", "familia": "estruturas_pecuaria", "atividade": "pecuaria", "infra": "curral"}, {"tipo": "confinamento", "rotulo": "Confinamento", "familia": "estruturas_pecuaria", "atividade": "pecuaria", "infra": "confinamento"}, {"tipo": "manga", "rotulo": "Manga", "familia": "estruturas_pecuaria", "atividade": "pecuaria", "infra": null}, {"tipo": "embarcadouro_brete", "rotulo": "Embarcadouro / brete", "familia": "estruturas_pecuaria", "atividade": "pecuaria", "infra": "tronco_brete"}, {"tipo": "praca_alimentacao", "rotulo": "Praça de alimentação", "familia": "estruturas_pecuaria", "atividade": "pecuaria", "infra": null}, {"tipo": "represa_acude", "rotulo": "Represa / açude", "familia": "agua", "atividade": "comum", "infra": "represa_acude"}, {"tipo": "lagoa", "rotulo": "Lagoa", "familia": "agua", "atividade": "comum", "infra": null}, {"tipo": "reserva_legal", "rotulo": "Reserva legal / mata nativa", "familia": "ambiental", "atividade": null, "infra": null}, {"tipo": "app", "rotulo": "APP", "familia": "ambiental", "atividade": null, "infra": null}, {"tipo": "varzea_brejo", "rotulo": "Várzea / brejo", "familia": "ambiental", "atividade": null, "infra": null}, {"tipo": "estrada", "rotulo": "Estrada", "familia": "outros", "atividade": "comum", "infra": null}, {"tipo": "pista", "rotulo": "Pista", "familia": "outros", "atividade": "comum", "infra": null}, {"tipo": "cascalheira", "rotulo": "Cascalheira", "familia": "outros", "atividade": "comum", "infra": null}, {"tipo": "descarte", "rotulo": "Descarte / lixo", "familia": "outros", "atividade": "comum", "infra": null}, {"tipo": "area_fazenda", "rotulo": "Área da fazenda", "familia": "outros", "atividade": null, "infra": null}, {"tipo": "area_sem_uso", "rotulo": "Área sem uso (terceiros)", "familia": "outros", "atividade": null, "infra": null}]';
  -- CATALOGO-FIM
  e jsonb; f text;
begin
  if public._fn_mapa_tipos_de_area() <> c_tela then raise exception 'T0: catálogo do banco × catálogo da tela diferem'; end if;
  for e in select x from jsonb_array_elements(c_tela) x where x->>'infra' is not null loop
    if public._fn_infra_formas(e->>'infra') is null or public._fn_infra_ficha_campos(e->>'infra') is null or public._fn_infra_rotulo(e->>'infra') is null
       or not ('Polygon' = any (public._fn_infra_formas(e->>'infra'))) then
      raise exception 'T0: a estrutura % aponta para a infraestrutura % sem forma/ficha/rótulo', e->>'tipo', e->>'infra';
    end if;
  end loop;
  if pg_get_constraintdef((select oid from pg_constraint where conname = 'fazenda_geometrias_tipo_check')) ilike '%benfeitoria%'
     or pg_get_constraintdef((select oid from pg_constraint where conname = 'fazenda_geometria_classificacoes_tipo_check')) ilike '%benfeitoria%'
     or pg_get_functiondef('public.fn_mapa_geometria_classificar(uuid, text, uuid, text, boolean)'::regprocedure) ilike '%''varzea_brejo''%' then
    raise exception 'T0: ainda há lista escrita à mão';
  end if;
  f := 'public.fn_mapa_estrutura_da_area(uuid, boolean)';
  if not (select prosecdef from pg_proc where oid = f::regprocedure)
     or not exists (select 1 from pg_proc p, unnest(p.proconfig) c where p.oid = f::regprocedure and c = 'search_path=pg_catalog, public')
     or has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE')
     or exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f::regprocedure and a.grantee = 0) then
    raise exception 'T0: a função nova não nasceu fechada';
  end if;
  if has_function_privilege('authenticated', 'public._fn_mapa_tipos_de_area()', 'EXECUTE') then raise exception 'T0: interna aberta'; end if;
end $t0$;

-- T0b as fichas das 6 infraestruturas novas: o catálogo do banco tem as MESMAS chaves dos exemplos da tela (`fichasDaInfra.exemplos.json`,
-- copiados entre as marcas FICHAS-NOVAS; o teste da tela confere a cópia), e cada exemplo passa na conferência
do $t0b$
declare
  -- FICHAS-NOVAS-INICIO
  ex constant jsonb := '{"armazem_graos": {"area_construida_m2": 1200, "material": "Metálico", "capacidade_t": 3000}, "silo_secador": {"modelo": "Silo secador", "capacidade_t": 500}, "oficina": {"area_construida_m2": 300, "material": "Alvenaria"}, "casa_funcionario": {"area_construida_m2": 80, "material": "Alvenaria"}, "escritorio": {"area_construida_m2": 60, "material": "Alvenaria"}, "confinamento": {"area_m2": 20000, "capacidade_cab": 1500, "coberto": false}}';
  -- FICHAS-NOVAS-FIM
  t text;
begin
  for t in select jsonb_object_keys(ex) loop
    if (select array_agg(k order by k) from jsonb_object_keys(public._fn_infra_ficha_campos(t)) k)
       is distinct from (select array_agg(k order by k) from jsonb_object_keys(ex->t) k) then
      raise exception 'T0b: ficha do banco × exemplo da tela diferem em %', t;
    end if;
    if public._fn_infra_ficha_erro(t, ex->t) is not null then raise exception 'T0b: % recusou: %', t, public._fn_infra_ficha_erro(t, ex->t); end if;
  end loop;
end $t0b$;

-- fixture: um polígono sem classificação na Fazenda Teste Cana
insert into public.fazenda_geometrias (id, fazenda_id, cliente_id, tipo, nome_original, geojson)
values ('0b5e0000-0000-4000-8000-000000000a01', 'c2498ace-8478-410c-a697-d3f2e2934d1f', '43f32d07-dba8-4670-900c-bf645440c04a', 'outra',
        'Armazém sintético tipos02', '{"type":"Polygon","coordinates":[[[-47.0,-20.0],[-46.9995,-20.0],[-46.9995,-20.0005],[-47.0,-20.0005],[-47.0,-20.0]]]}'),
       ('0b5e0000-0000-4000-8000-000000000a02', 'c2498ace-8478-410c-a697-d3f2e2934d1f', '43f32d07-dba8-4670-900c-bf645440c04a', 'outra',
        'Lagoa sintética tipos02', '{"type":"Polygon","coordinates":[[[-47.0,-20.001],[-46.9995,-20.001],[-46.9995,-20.0015],[-47.0,-20.0015],[-47.0,-20.001]]]}');
do $t2b$
declare v_ok boolean := false;
begin
  begin
    insert into public.fazenda_geometrias (fazenda_id, cliente_id, tipo, nome_original, geojson)
    values ('c2498ace-8478-410c-a697-d3f2e2934d1f', '43f32d07-dba8-4670-900c-bf645440c04a', 'piscina', 'x', '{"type":"Polygon","coordinates":[]}');
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'T2: a trava aceitou um tipo que não existe'; end if;
end $t2b$;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $adm$
declare
  c_arm constant uuid := '0b5e0000-0000-4000-8000-000000000a01';
  c_lag constant uuid := '0b5e0000-0000-4000-8000-000000000a02';
  r jsonb; v_infra uuid; v_ok boolean;
begin
  -- T1 classificar como tipo novo
  r := public.fn_mapa_geometria_classificar(c_arm, 'armazem_graos', null, null, true);
  if r->'para'->>'rotulo' <> 'Armazém / barracão de grãos' then raise exception 'T1: prévia %', r; end if;
  r := public.fn_mapa_geometria_classificar(c_arm, 'armazem_graos', null, null, false);
  if (select tipo from public.fazenda_geometrias where id = c_arm) <> 'armazem_graos' then raise exception 'T1: não gravou'; end if;
  if not exists (select 1 from public.fazenda_geometria_classificacoes where tipo = 'armazem_graos' and nome_original = 'Armazém sintético tipos02') then
    raise exception 'T1: a memória do KMZ não guardou';
  end if;
  perform public.fn_mapa_geometria_classificar(c_lag, 'lagoa', null, null, false);

  -- T2 tipo que não existe
  v_ok := false;
  begin perform public.fn_mapa_geometria_classificar(c_arm, 'piscina', null, null, true);
  exception when sqlstate 'P0001' then v_ok := sqlerrm = 'Escolha o que é: pasto, um tipo de área ou sem classificação.'; end;
  if not v_ok then raise exception 'T2: o escritor não recusou o tipo que não existe'; end if;

  -- T3 a estrutura da área
  r := public.fn_mapa_estrutura_da_area(c_arm);
  if not (r->>'simulado')::boolean or r->>'tipo' <> 'armazem_graos' or r->>'rotulo' <> 'Armazém de grãos' then raise exception 'T3: prévia %', r; end if;
  if exists (select 1 from public.fazenda_infraestruturas where geometria_id = c_arm) then raise exception 'T3: a prévia gravou'; end if;
  r := public.fn_mapa_estrutura_da_area(c_arm, false);
  v_infra := (r->>'infra_id')::uuid;
  if not exists (select 1 from public.fazenda_infraestruturas where id = v_infra and geometria_id = c_arm and tipo = 'armazem_graos' and versao = 2
                 and geometria->>'type' = 'Polygon' and nome = 'Armazém sintético tipos02' and ativo) then
    raise exception 'T3: infraestrutura gravada errada';
  end if;
  if (select count(*) from public.fazenda_infraestrutura_trilha where infra_id = v_infra) <> 2 then raise exception 'T3: trilha'; end if;
  r := public.fn_mapa_estrutura_da_area(c_arm, false);
  if not (r->>'ja_existe')::boolean or (r->>'infra_id')::uuid <> v_infra then raise exception 'T3: não é idempotente %', r; end if;
  r := public.fn_infra_criar_bem(v_infra, 2, jsonb_build_object('categoria_codigo', 'benfeitorias', 'descricao', 'Armazém sintético',
         'em_uso_desde', '2024-01-01', 'atividade', 'lavoura'), false);
  if (select bem_id from public.fazenda_infraestruturas where id = v_infra) is null then raise exception 'T3: o bem não ligou'; end if;

  -- T4 sem valor
  v_ok := false;
  begin perform public.fn_mapa_estrutura_da_area(c_lag, true);
  exception when sqlstate 'P0001' then v_ok := sqlerrm like 'Este tipo de área não é uma estrutura com valor%'; end;
  if not v_ok then raise exception 'T4: a lagoa virou estrutura'; end if;
end $adm$;
reset role;

-- T5 o usuário de FORA
select set_config('request.jwt.claims', '{"sub":"a91962cd-56dd-4729-b2e1-dcd4a1d7b9c9","role":"authenticated"}', true);
set local role authenticated;
do $t5$
declare v_ok boolean := false;
begin
  if public.is_admin_agroinblue(auth.uid()) or coalesce(public.tenant_ok('43f32d07-dba8-4670-900c-bf645440c04a'), false) then
    raise exception 'T5: o usuário a91962cd tem acesso ao Teste — o teste não prova nada';
  end if;
  begin perform public.fn_mapa_estrutura_da_area('0b5e0000-0000-4000-8000-000000000a01', true);
  exception when sqlstate '42501' then v_ok := true; end;
  if not v_ok then raise exception 'T5: o de fora não recebeu 42501'; end if;
end $t5$;

reset role;
do $fim$ begin raise exception 'OK MAPA-AREA-TIPOS-02 (117120): T0–T5 e T0b passaram (nada fica no banco)'; end $fim$;
