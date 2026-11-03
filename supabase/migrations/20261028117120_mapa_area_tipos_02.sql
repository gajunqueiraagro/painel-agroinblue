-- MAPA-AREA-TIPOS-02 (decisões D1–D6 do Gabriel, 02/11/2026 08:20) — os TIPOS de área do polígono num CATÁLOGO ÚNICO no banco, com
-- família, atividade e se a estrutura tem valor; e a estrutura com valor vira INFRAESTRUTURA (elo `geometria_id`) para o bem nascer pelo
-- caminho das fichas (`fn_infra_criar_bem`, INFRA-FICHAS-PATR-01).
--
-- D1 `_fn_mapa_tipos_de_area()` é a fonte: as DUAS travas (fazenda_geometrias e a memória do "Atualizar mapa"), o rótulo
--    (`_fn_mapa_tipo_rotulo`) e o escritor (`fn_mapa_geometria_classificar`, que tinha a QUINTA lista escrita à mão) passam a ler dele.
--    A tela tem o mesmo catálogo (`src/lib/mapa/tiposDeArea.ts`) e o teste SQL confere os dois pelos exemplos (paridade sem espelho frágil).
-- D2 talhão/cana NÃO são tipo de área (são "É pasto" em agricultura); pivô é infraestrutura (fica para a frente dele).
-- D3 estrutura com valor (armazém, silo, oficina, sede, casa, escritório, curral, confinamento, represa) → `fn_mapa_estrutura_da_area`
--    cria a infraestrutura do tipo correspondente com a geometria do polígono e o elo `fazenda_infraestruturas.geometria_id` (uma viva por
--    polígono); o bem nasce depois pelo `fn_infra_criar_bem`, sem segunda fonte. Os tipos novos de infraestrutura entram no rótulo, nas
--    formas e na ficha da infraestrutura.
-- Gabriel 02/11 11:11 (Raul Juliato, Faz. Monterrey, "Manga 7B"): a família ESTRUTURAS DE PECUÁRIA (atividade pecuária) reúne Curral,
-- Confinamento, Manga, Embarcadouro/brete e Praça de alimentação — a MESMA praça da fatia 2a do MAPA-CRIAR-PIQUETES-01 (Code 3, que hoje a
-- grava como "benfeitoria"; o escritor dele passa a usar `praca_alimentacao`, combinado por bilhete). O embarcadouro/brete com valor vira a
-- infraestrutura "Tronco / brete", que passa a aceitar também ÁREA (antes só ponto).
-- Nenhum tipo de área conta como área produtiva (a produtiva é a dos pastos); a atividade (agricultura, pecuária, comum) serve à área
-- cercada e aos indicadores.
--
-- PATCHES guardados por md5 (as funções vivas conferidas na prévia de 02/11): se qualquer uma mudou, NADA é aplicado.
-- SEGURANÇA: `fn_mapa_estrutura_da_area` nasce fechada (SECURITY DEFINER, search_path fixo, tenant_ok pela linha → 42501, recusas P0001,
-- prévia por padrão, REVOKE PUBLIC/anon, GRANT authenticated/service_role); as internas só service_role. Nenhum dado de cliente muda.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- 0. As funções vivas são as da prévia -------------------------------------------------------------------------------------------
do $guarda$
declare r record;
begin
  for r in select * from (values
    ('public._fn_mapa_tipo_rotulo(text)', '64fe1234baaa1749d32aa606054815c4'),
    ('public._fn_infra_rotulo(text)', '656d53f6cb6718f7eac453031a50f3db'),
    ('public._fn_infra_formas(text)', '9f7fc2ac64b2597461a1b0b12f329a47'),
    ('public._fn_infra_ficha_campos(text)', 'ca9dc634c781b2cefa9b9e32512978b8'),
    ('public.fn_mapa_geometria_classificar(uuid, text, uuid, text, boolean)', 'ff6f0f8a8ec7f6655b276f614a25c3de')
  ) t(f, m) loop
    if md5(pg_get_functiondef(r.f::regprocedure)) <> r.m then
      raise exception 'MAPA-AREA-TIPOS-02: % mudou desde a prévia', r.f;
    end if;
  end loop;
end $guarda$;

-- 1. O catálogo único dos tipos de área ------------------------------------------------------------------------------------------
create or replace function public._fn_mapa_tipos_de_area()
returns jsonb language sql immutable set search_path = pg_catalog, public
as $$
  select '[
    {"tipo":"armazem_graos","rotulo":"Armazém / barracão de grãos","familia":"estruturas","atividade":"agricultura","infra":"armazem_graos"},
    {"tipo":"silo_secador","rotulo":"Silo / secador","familia":"estruturas","atividade":"agricultura","infra":"silo_secador"},
    {"tipo":"oficina","rotulo":"Galpão de máquinas / oficina","familia":"estruturas","atividade":"comum","infra":"oficina"},
    {"tipo":"benfeitoria","rotulo":"Sede / benfeitorias","familia":"estruturas","atividade":"comum","infra":"sede_casa"},
    {"tipo":"casa_funcionario","rotulo":"Casa de funcionário","familia":"estruturas","atividade":"comum","infra":"casa_funcionario"},
    {"tipo":"escritorio","rotulo":"Escritório","familia":"estruturas","atividade":"comum","infra":"escritorio"},
    {"tipo":"patio","rotulo":"Pátio","familia":"estruturas","atividade":"comum","infra":null},
    {"tipo":"curral","rotulo":"Curral","familia":"estruturas_pecuaria","atividade":"pecuaria","infra":"curral"},
    {"tipo":"confinamento","rotulo":"Confinamento","familia":"estruturas_pecuaria","atividade":"pecuaria","infra":"confinamento"},
    {"tipo":"manga","rotulo":"Manga","familia":"estruturas_pecuaria","atividade":"pecuaria","infra":null},
    {"tipo":"embarcadouro_brete","rotulo":"Embarcadouro / brete","familia":"estruturas_pecuaria","atividade":"pecuaria","infra":"tronco_brete"},
    {"tipo":"praca_alimentacao","rotulo":"Praça de alimentação","familia":"estruturas_pecuaria","atividade":"pecuaria","infra":null},
    {"tipo":"represa_acude","rotulo":"Represa / açude","familia":"agua","atividade":"comum","infra":"represa_acude"},
    {"tipo":"lagoa","rotulo":"Lagoa","familia":"agua","atividade":"comum","infra":null},
    {"tipo":"reserva_legal","rotulo":"Reserva legal / mata nativa","familia":"ambiental","atividade":null,"infra":null},
    {"tipo":"app","rotulo":"APP","familia":"ambiental","atividade":null,"infra":null},
    {"tipo":"varzea_brejo","rotulo":"Várzea / brejo","familia":"ambiental","atividade":null,"infra":null},
    {"tipo":"estrada","rotulo":"Estrada","familia":"outros","atividade":"comum","infra":null},
    {"tipo":"pista","rotulo":"Pista","familia":"outros","atividade":"comum","infra":null},
    {"tipo":"cascalheira","rotulo":"Cascalheira","familia":"outros","atividade":"comum","infra":null},
    {"tipo":"descarte","rotulo":"Descarte / lixo","familia":"outros","atividade":"comum","infra":null},
    {"tipo":"area_fazenda","rotulo":"Área da fazenda","familia":"outros","atividade":null,"infra":null},
    {"tipo":"area_sem_uso","rotulo":"Área sem uso (terceiros)","familia":"outros","atividade":null,"infra":null}
  ]'::jsonb
$$;

-- o rótulo lê do catálogo (pasto, sem classificação e área total ficam fora dele: não são "tipo de área")
create or replace function public._fn_mapa_tipo_rotulo(p_tipo text)
returns text language sql immutable set search_path = pg_catalog, public
as $$
  select case p_tipo when 'pasto' then 'Pasto' when 'outra' then 'Sem classificação' when 'area_total' then 'Área total'
    else (select e->>'rotulo' from jsonb_array_elements(public._fn_mapa_tipos_de_area()) e where e->>'tipo' = p_tipo) end
$$;

revoke all on function public._fn_mapa_tipos_de_area() from public, anon, authenticated;
grant execute on function public._fn_mapa_tipos_de_area() to service_role;

-- 2. As duas travas leem do catálogo (antes: duas listas escritas à mão) ----------------------------------------------------------
alter table public.fazenda_geometrias drop constraint fazenda_geometrias_tipo_check;
alter table public.fazenda_geometrias add constraint fazenda_geometrias_tipo_check check (public._fn_mapa_tipo_rotulo(tipo) is not null);
alter table public.fazenda_geometria_classificacoes drop constraint fazenda_geometria_classificacoes_tipo_check;
alter table public.fazenda_geometria_classificacoes add constraint fazenda_geometria_classificacoes_tipo_check
  check (tipo <> 'outra' and public._fn_mapa_tipo_rotulo(tipo) is not null);

-- 3. O escritor da classificação perde a lista à mão (patch do corpo vivo) ---------------------------------------------------------
do $patch$
declare
  d text := pg_get_functiondef('public.fn_mapa_geometria_classificar(uuid, text, uuid, text, boolean)'::regprocedure);
  antes constant text := $a$if v_tipo is null or v_tipo not in ('pasto', 'outra', 'area_fazenda', 'area_sem_uso', 'reserva_legal', 'app', 'varzea_brejo',
                                      'benfeitoria', 'estrada', 'curral', 'confinamento') then$a$;
  depois constant text := $b$if v_tipo is null or v_tipo = 'area_total' or public._fn_mapa_tipo_rotulo(v_tipo) is null then$b$;
begin
  if (length(d) - length(replace(d, antes, ''))) / length(antes) <> 1 then
    raise exception 'MAPA-AREA-TIPOS-02: a lista do escritor não casa 1 vez';
  end if;
  execute replace(d, antes, depois);
end $patch$;

-- 4. Os tipos novos de infraestrutura (as estruturas que só existiam como área) ------------------------------------------------------
create or replace function public._fn_infra_rotulo(p_tipo text)
returns text language sql immutable set search_path = pg_catalog, public
as $$
  select case p_tipo
    when 'cocho' then 'Cocho' when 'bebedouro' then 'Bebedouro' when 'saleiro' then 'Saleiro' when 'curral' then 'Curral'
    when 'tronco_brete' then 'Tronco / brete' when 'balanca' then 'Balança' when 'porteira' then 'Porteira' when 'cerca' then 'Cerca'
    when 'poco' then 'Poço' when 'represa_acude' then 'Represa / açude' when 'caixa_dagua' then 'Caixa d''água'
    when 'sede_casa' then 'Sede / casa' when 'galpao' then 'Galpão' when 'energia' then 'Energia'
    when 'armazem_graos' then 'Armazém de grãos' when 'silo_secador' then 'Silo / secador' when 'oficina' then 'Oficina / galpão de máquinas'
    when 'casa_funcionario' then 'Casa de funcionário' when 'escritorio' then 'Escritório' when 'confinamento' then 'Confinamento' end
$$;

create or replace function public._fn_infra_formas(p_tipo text)
returns text[] language sql immutable set search_path = pg_catalog, public
as $$
  select case
    when p_tipo in ('cocho', 'bebedouro', 'saleiro', 'balanca', 'porteira', 'poco', 'caixa_dagua') then array['Point']
    when p_tipo = 'tronco_brete' then array['Point', 'Polygon']
    when p_tipo = 'cerca' then array['LineString']
    when p_tipo in ('curral', 'represa_acude', 'sede_casa', 'galpao', 'armazem_graos', 'silo_secador', 'oficina', 'casa_funcionario',
                    'escritorio', 'confinamento') then array['Polygon', 'Point']
    when p_tipo = 'energia' then array['Point', 'LineString'] end
$$;

create or replace function public._fn_infra_ficha_campos(p_tipo text)
returns jsonb language sql immutable set search_path = pg_catalog, public
as $$
  select case p_tipo
    when 'cocho' then '{"material":"texto","comprimento_m":"numero","lados":"lados","coberto":"simnao","uso":"texto"}'
    when 'bebedouro' then '{"modelo":"texto","material":"texto","capacidade_l":"numero","abastecimento":"texto"}'
    when 'saleiro' then '{"material":"texto","coberto":"simnao","comprimento_m":"numero"}'
    when 'caixa_dagua' then '{"material":"texto","capacidade_l":"numero","elevada":"simnao"}'
    when 'poco' then '{"modelo":"texto","profundidade_m":"numero","vazao_m3h":"numero","bomba":"texto"}'
    when 'represa_acude' then '{"finalidade":"texto"}'
    when 'curral' then '{"area_m2":"numero","material":"texto","divisoes":"inteiro"}'
    when 'tronco_brete' then '{"modelo":"texto","material":"texto"}'
    when 'balanca' then '{"capacidade_kg":"numero","marca_modelo":"texto","eletronica":"simnao"}'
    when 'porteira' then '{"material":"texto","largura_m":"numero"}'
    when 'cerca' then '{"modelo":"texto","fios":"inteiro","mourao":"texto"}'
    when 'sede_casa' then '{"area_construida_m2":"numero","material":"texto"}'
    when 'galpao' then '{"area_construida_m2":"numero","material":"texto"}'
    when 'energia' then '{"modelo":"texto","potencia_kva":"numero"}'
    when 'armazem_graos' then '{"area_construida_m2":"numero","material":"texto","capacidade_t":"numero"}'
    when 'silo_secador' then '{"modelo":"texto","capacidade_t":"numero"}'
    when 'oficina' then '{"area_construida_m2":"numero","material":"texto"}'
    when 'casa_funcionario' then '{"area_construida_m2":"numero","material":"texto"}'
    when 'escritorio' then '{"area_construida_m2":"numero","material":"texto"}'
    when 'confinamento' then '{"area_m2":"numero","capacidade_cab":"inteiro","coberto":"simnao"}'
  end::jsonb
$$;

-- 5. O elo infraestrutura → polígono do mapa (uma viva por polígono) --------------------------------------------------------------
alter table public.fazenda_infraestruturas add column geometria_id uuid references public.fazenda_geometrias(id);
create unique index fazenda_infraestruturas_geometria_viva_uk on public.fazenda_infraestruturas (geometria_id)
  where ativo and geometria_id is not null;

-- 6. A estrutura com valor vira infraestrutura (prévia por padrão) ------------------------------------------------------------------
create or replace function public.fn_mapa_estrutura_da_area(p_geometria uuid, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  g public.fazenda_geometrias%rowtype;
  v_cat jsonb; v_infra_tipo text; v_existente public.fazenda_infraestruturas%rowtype;
  v_geo jsonb; v_parte jsonb; v_maior numeric := -1; v_area numeric; r jsonb; v_id uuid;
begin
  select * into g from public.fazenda_geometrias where id = p_geometria;
  if g.id is null or not coalesce(public.tenant_ok(g.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  select e into v_cat from jsonb_array_elements(public._fn_mapa_tipos_de_area()) e where e->>'tipo' = g.tipo;
  v_infra_tipo := v_cat->>'infra';
  if v_infra_tipo is null then
    raise exception using errcode = 'P0001', message = 'Este tipo de área não é uma estrutura com valor: classifique o polígono antes.';
  end if;

  -- já existe: devolve a mesma (o gesto é idempotente)
  select * into v_existente from public.fazenda_infraestruturas where geometria_id = g.id and ativo;
  if v_existente.id is not null then
    return jsonb_build_object('ok', true, 'simulado', p_simular, 'ja_existe', true, 'infra_id', v_existente.id, 'versao', v_existente.versao,
      'tipo', v_existente.tipo, 'rotulo', public._fn_infra_rotulo(v_existente.tipo));
  end if;

  -- a geometria: o polígono; de um MultiPolygon, a MAIOR parte (a infraestrutura é uma área só)
  if g.geojson->>'type' = 'Polygon' then
    v_geo := jsonb_build_object('type', 'Polygon', 'coordinates', g.geojson->'coordinates');
  elsif g.geojson->>'type' = 'MultiPolygon' then
    for v_parte in select p from jsonb_array_elements(g.geojson->'coordinates') p loop
      v_area := public._fn_infra_area_ha(jsonb_build_object('type', 'Polygon', 'coordinates', v_parte));
      if coalesce(v_area, 0) > v_maior then v_maior := coalesce(v_area, 0); v_geo := jsonb_build_object('type', 'Polygon', 'coordinates', v_parte); end if;
    end loop;
  end if;
  if v_geo is null then raise exception using errcode = 'P0001', message = 'O polígono desta área não tem um contorno válido.'; end if;

  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'ja_existe', false, 'tipo', v_infra_tipo, 'rotulo', public._fn_infra_rotulo(v_infra_tipo),
      'area_ha', public._fn_infra_area_ha(v_geo), 'partes', case when g.geojson->>'type' = 'MultiPolygon' then jsonb_array_length(g.geojson->'coordinates') else 1 end);
  end if;

  -- grava pelo escritor da infraestrutura (as mesmas conferências, a trilha 'criar') e põe o elo (versão +1, trilha 'alterar')
  r := public.fn_infra_salvar(jsonb_build_object('fazenda_id', g.fazenda_id, 'tipo', v_infra_tipo, 'geometria', v_geo, 'nome', g.nome_original),
         false, 'estrutura da área do mapa');
  v_id := (r->>'id')::uuid;
  update public.fazenda_infraestruturas set geometria_id = g.id, versao = versao + 1, alterado_em = now(), alterado_por = auth.uid()
   where id = v_id and versao = 1;
  insert into public.fazenda_infraestrutura_trilha (cliente_id, infra_id, acao, antes, depois, motivo, por)
  values (g.cliente_id, v_id, 'alterar', jsonb_build_object('geometria_id', null), jsonb_build_object('geometria_id', g.id),
          'ligada ao polígono do mapa', auth.uid());
  return jsonb_build_object('ok', true, 'simulado', false, 'ja_existe', false, 'infra_id', v_id, 'versao', 2, 'tipo', v_infra_tipo,
    'rotulo', public._fn_infra_rotulo(v_infra_tipo));
end $$;

revoke all on function public.fn_mapa_estrutura_da_area(uuid, boolean) from public, anon;
grant execute on function public.fn_mapa_estrutura_da_area(uuid, boolean) to authenticated, service_role;
