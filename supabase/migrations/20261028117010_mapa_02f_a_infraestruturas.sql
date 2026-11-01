-- MAPA-02f-a · 117010 — a INFRAESTRUTURA da fazenda no mapa (cocho, bebedouro, cerca, curral, energia…). Decisões do Gabriel (31/10)
-- sobre o mapa-02f-fase0: Q1 geometria por tipo; Q2 fatias 02f-a (este banco) → 02f-b (pontos no mapa) → 02c → 02f-c (linhas e áreas);
-- Q3 um bem do Patrimônio para MUITAS infraestruturas, bem opcional; Q4 grava todo perfil do cliente que já edita o mapa (o banco
-- recusa pelo tenant_ok; o perfil só filtra o botão); Q5 a cerca daqui é só o trecho que NÃO é divisa de pasto; Q6 tabela própria.
--
-- POR QUE TABELA PRÓPRIA (Q6): `fazenda_geometrias` é o mapa importado do KML e os piquetes (Code 4); o reimport ("substituir o mapa")
-- apagaria o que o usuário pôs à mão. Esta migration NÃO toca a `fazenda_geometrias`.
--
-- GEOMETRIA (Q1): GeoJSON em jsonb (o proto não tem PostGIS), longitude/latitude em graus (WGS84, a ordem do GeoJSON):
--   PONTO: cocho, bebedouro, saleiro, tronco_brete, balanca, porteira, poco, caixa_dagua
--   LINHA: cerca (LineString) — o comprimento em metros sai no gravador
--   ÁREA OU PONTO: curral, represa_acude, sede_casa, galpao (Polygon de um contorno só, ou Point enquanto não desenham) — a área em ha
--   PONTO OU LINHA: energia (poste/transformador ou a rede)
-- O comprimento e a área são CALCULADOS (nunca digitados): comprimento pela fórmula de haversine; área pela fórmula esférica do anel
-- (a mesma do turf/OpenLayers), raio médio da Terra 6.371.008,8 m.
--
-- NADA SE APAGA: a infraestrutura se DESATIVA com motivo (fica na tabela, some do mapa). TRILHA imutável em
-- `fazenda_infraestrutura_trilha` (criar / alterar / desativar, antes → depois, motivo, quem, quando); só as RPCs escrevem.
--
-- SEGURANÇA (FUNÇÃO NOVA NASCE FECHADA): RLS só de LEITURA (`tenant_ok`); nenhuma política de escrita; INSERT/UPDATE/DELETE revogados
-- de authenticated. Escrita SÓ por `fn_infra_salvar` e `fn_infra_desativar`: SECURITY DEFINER, search_path = pg_catalog, public;
-- o cliente se resolve pela FAZENDA (criar) ou pela LINHA (editar/desativar) e passa por `tenant_ok` (42501 "sem acesso a este
-- registro", nunca vazio); REVOKE de PUBLIC e anon; GRANT a authenticated e service_role. As internas (`_fn_infra_*`) só para
-- service_role. Recusas com P0001 e frase pronta; `p_simular` (padrão true) = prévia, nada gravado; versão contra edição simultânea
-- (40001). Gatilho de coerência (SECURITY DEFINER) confere fazenda × cliente, pasto × fazenda e bem × cliente/fazenda também para
-- quem escreve sem as RPCs (service_role). Todo UPDATE com WHERE (pg_safeupdate).
-- Nenhum dado de cliente é alterado por esta migration.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- 1. Internas (puras) ----------------------------------------------------------------------------------------------------------
create or replace function public._fn_infra_rotulo(p_tipo text)
returns text language sql immutable set search_path = pg_catalog, public
as $$
  select case p_tipo
    when 'cocho' then 'Cocho' when 'bebedouro' then 'Bebedouro' when 'saleiro' then 'Saleiro' when 'curral' then 'Curral'
    when 'tronco_brete' then 'Tronco / brete' when 'balanca' then 'Balança' when 'porteira' then 'Porteira' when 'cerca' then 'Cerca'
    when 'poco' then 'Poço' when 'represa_acude' then 'Represa / açude' when 'caixa_dagua' then 'Caixa d''água'
    when 'sede_casa' then 'Sede / casa' when 'galpao' then 'Galpão' when 'energia' then 'Energia' end
$$;

-- as formas de geometria aceitas por tipo (Q1); nulo = tipo desconhecido
create or replace function public._fn_infra_formas(p_tipo text)
returns text[] language sql immutable set search_path = pg_catalog, public
as $$
  select case
    when p_tipo in ('cocho', 'bebedouro', 'saleiro', 'tronco_brete', 'balanca', 'porteira', 'poco', 'caixa_dagua') then array['Point']
    when p_tipo = 'cerca' then array['LineString']
    when p_tipo in ('curral', 'represa_acude', 'sede_casa', 'galpao') then array['Polygon', 'Point']
    when p_tipo = 'energia' then array['Point', 'LineString'] end
$$;

-- uma posição GeoJSON válida: [longitude, latitude] numéricos, dentro do globo
create or replace function public._fn_infra_posicao_ok(p jsonb)
returns boolean language sql immutable set search_path = pg_catalog, public
as $$
  -- CASE (e não AND): o SQL não garante a ordem do AND, e o cast de um não número estouraria antes da conferência do tipo
  select case
    when jsonb_typeof(p) is distinct from 'array' then false
    when jsonb_array_length(p) < 2 then false
    when jsonb_typeof(p->0) <> 'number' or jsonb_typeof(p->1) <> 'number' then false
    else (p->>0)::numeric between -180 and 180 and (p->>1)::numeric between -90 and 90 end
$$;

-- o motivo da recusa da geometria para o tipo (frase pronta), ou nulo se ela serve
create or replace function public._fn_infra_geometria_erro(p_tipo text, g jsonb)
returns text language plpgsql immutable set search_path = pg_catalog, public
as $$
declare
  v_formas text[] := public._fn_infra_formas(p_tipo);
  v_tipo text := case when jsonb_typeof(g) = 'object' then g->>'type' end;
  v_c jsonb := case when jsonb_typeof(g) = 'object' then g->'coordinates' end;
  v_anel jsonb; v_p jsonb;
begin
  if v_formas is null then return 'Tipo de infraestrutura inválido.'; end if;
  if v_tipo is null or not (v_tipo = any (v_formas)) then
    return format('%s se marca no mapa como %s.', public._fn_infra_rotulo(p_tipo), case v_formas::text
      when '{Point}' then 'um ponto' when '{LineString}' then 'uma linha'
      when '{Polygon,Point}' then 'uma área ou um ponto' when '{Point,LineString}' then 'um ponto ou uma linha' end);
  end if;
  if v_tipo = 'Point' then
    if not public._fn_infra_posicao_ok(v_c) then return 'O ponto tem coordenadas inválidas.'; end if;
  elsif v_tipo = 'LineString' then
    if jsonb_typeof(v_c) <> 'array' or jsonb_array_length(v_c) < 2 then return 'A linha precisa de pelo menos 2 pontos.'; end if;
    for v_p in select * from jsonb_array_elements(v_c) loop
      if not public._fn_infra_posicao_ok(v_p) then return 'A linha tem coordenadas inválidas.'; end if;
    end loop;
  else -- Polygon
    if jsonb_typeof(v_c) <> 'array' or jsonb_array_length(v_c) <> 1 then return 'A área precisa ser um contorno só.'; end if;
    v_anel := v_c->0;
    if jsonb_typeof(v_anel) <> 'array' or jsonb_array_length(v_anel) < 4 then return 'A área precisa de pelo menos 3 pontos.'; end if;
    for v_p in select * from jsonb_array_elements(v_anel) loop
      if not public._fn_infra_posicao_ok(v_p) then return 'A área tem coordenadas inválidas.'; end if;
    end loop;
    if (v_anel->0->>0)::numeric <> ((v_anel->(-1))->>0)::numeric or (v_anel->0->>1)::numeric <> ((v_anel->(-1))->>1)::numeric then
      return 'O contorno da área precisa fechar (o último ponto igual ao primeiro).';
    end if;
  end if;
  return null;
end $$;

-- comprimento de uma LineString em metros (haversine); nulo para outras formas
create or replace function public._fn_infra_comprimento_m(g jsonb)
returns numeric language plpgsql immutable set search_path = pg_catalog, public
as $$
declare
  c jsonb := g->'coordinates'; i int; tot double precision := 0;
  la1 double precision; la2 double precision; dla double precision; dlo double precision; a double precision;
begin
  if g->>'type' <> 'LineString' then return null; end if;
  for i in 1 .. jsonb_array_length(c) - 1 loop
    la1 := radians((c->(i-1)->>1)::double precision); la2 := radians((c->i->>1)::double precision);
    dla := la2 - la1; dlo := radians((c->i->>0)::double precision - (c->(i-1)->>0)::double precision);
    a := sin(dla / 2) ^ 2 + cos(la1) * cos(la2) * sin(dlo / 2) ^ 2;
    tot := tot + 2 * 6371008.8 * asin(least(1, sqrt(a)));
  end loop;
  return round(tot::numeric, 1);
end $$;

-- área de um Polygon (um contorno) em hectares, fórmula esférica do anel; nulo para outras formas
create or replace function public._fn_infra_area_ha(g jsonb)
returns numeric language plpgsql immutable set search_path = pg_catalog, public
as $$
declare
  anel jsonb := g->'coordinates'->0; n int; i int; s double precision := 0;
  lo1 double precision; lo2 double precision; la1 double precision; la2 double precision;
begin
  if g->>'type' <> 'Polygon' then return null; end if;
  n := jsonb_array_length(anel);
  for i in 0 .. n - 2 loop
    lo1 := radians((anel->i->>0)::double precision); la1 := radians((anel->i->>1)::double precision);
    lo2 := radians((anel->(i+1)->>0)::double precision); la2 := radians((anel->(i+1)->>1)::double precision);
    s := s + (lo2 - lo1) * (2 + sin(la1) + sin(la2));
  end loop;
  return round((abs(s) * 6371008.8 ^ 2 / 2 / 10000)::numeric, 4);
end $$;

-- 2. Tabelas ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.fazenda_infraestruturas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  fazenda_id uuid not null references public.fazendas(id),
  tipo text not null check (public._fn_infra_formas(tipo) is not null),
  geometria jsonb not null,
  nome text check (nome is null or btrim(nome) <> ''),
  pasto_id uuid references public.pastos(id),
  bem_id uuid references public.patrimonio_bens(id),
  observacao text,
  comprimento_m numeric(12,1),
  area_ha numeric(14,4),
  ativo boolean not null default true,
  desativado_em timestamptz,
  desativado_por uuid,
  desativado_motivo text,
  versao integer not null default 1,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  alterado_em timestamptz,
  alterado_por uuid,
  constraint fazenda_infra_geometria_chk check (public._fn_infra_geometria_erro(tipo, geometria) is null),
  constraint fazenda_infra_desativada_chk check (ativo = (desativado_em is null)
    and (ativo or (desativado_motivo is not null and btrim(desativado_motivo) <> '')))
);
create index if not exists fazenda_infra_fazenda_idx on public.fazenda_infraestruturas (fazenda_id) where ativo;
create index if not exists fazenda_infra_pasto_idx on public.fazenda_infraestruturas (pasto_id) where ativo;
create index if not exists fazenda_infra_bem_idx on public.fazenda_infraestruturas (bem_id) where ativo;

alter table public.fazenda_infraestruturas enable row level security;
drop policy if exists fazenda_infraestruturas_select on public.fazenda_infraestruturas;
create policy fazenda_infraestruturas_select on public.fazenda_infraestruturas for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.fazenda_infraestruturas from public, anon;
revoke insert, update, delete on public.fazenda_infraestruturas from authenticated;
grant select on public.fazenda_infraestruturas to authenticated;
grant all on public.fazenda_infraestruturas to service_role;

create table if not exists public.fazenda_infraestrutura_trilha (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  infra_id uuid not null references public.fazenda_infraestruturas(id),
  acao text not null check (acao in ('criar', 'alterar', 'desativar')),
  antes jsonb,
  depois jsonb not null,
  motivo text,
  por uuid,
  em timestamptz not null default now(),
  constraint fazenda_infra_trilha_motivo_chk check (acao <> 'desativar' or (motivo is not null and btrim(motivo) <> ''))
);
create index if not exists fazenda_infra_trilha_infra_idx on public.fazenda_infraestrutura_trilha (infra_id, em);
alter table public.fazenda_infraestrutura_trilha enable row level security;
drop policy if exists fazenda_infraestrutura_trilha_select on public.fazenda_infraestrutura_trilha;
create policy fazenda_infraestrutura_trilha_select on public.fazenda_infraestrutura_trilha for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.fazenda_infraestrutura_trilha from public, anon;
revoke insert, update, delete on public.fazenda_infraestrutura_trilha from authenticated;
grant select on public.fazenda_infraestrutura_trilha to authenticated;
grant all on public.fazenda_infraestrutura_trilha to service_role;

-- 3. Gatilho de coerência (vale também para quem escreve sem as RPCs) -----------------------------------------------------------
create or replace function public._fn_infra_coerencia()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $$
begin
  if not exists (select 1 from public.fazendas f where f.id = new.fazenda_id and f.cliente_id = new.cliente_id) then
    raise exception using errcode = 'P0001', message = 'A fazenda não é deste cliente.';
  end if;
  if new.pasto_id is not null and not exists (select 1 from public.pastos p where p.id = new.pasto_id and p.fazenda_id = new.fazenda_id) then
    raise exception using errcode = 'P0001', message = 'O pasto escolhido não é desta fazenda.';
  end if;
  if new.bem_id is not null and not exists (
       select 1 from public.patrimonio_bens b where b.id = new.bem_id and b.cliente_id = new.cliente_id and b.fazenda_id = new.fazenda_id) then
    raise exception using errcode = 'P0001', message = 'O bem do Patrimônio escolhido não é desta fazenda.';
  end if;
  if tg_op = 'UPDATE' and (new.fazenda_id <> old.fazenda_id or new.cliente_id <> old.cliente_id) then
    raise exception using errcode = 'P0001', message = 'A infraestrutura não muda de fazenda: desative e crie na outra.';
  end if;
  return new;
end $$;
drop trigger if exists trg_fazenda_infra_coerencia on public.fazenda_infraestruturas;
create trigger trg_fazenda_infra_coerencia before insert or update on public.fazenda_infraestruturas
  for each row execute function public._fn_infra_coerencia();

revoke all on function public._fn_infra_rotulo(text) from public, anon, authenticated;
revoke all on function public._fn_infra_formas(text) from public, anon, authenticated;
revoke all on function public._fn_infra_posicao_ok(jsonb) from public, anon, authenticated;
revoke all on function public._fn_infra_geometria_erro(text, jsonb) from public, anon, authenticated;
revoke all on function public._fn_infra_comprimento_m(jsonb) from public, anon, authenticated;
revoke all on function public._fn_infra_area_ha(jsonb) from public, anon, authenticated;
revoke all on function public._fn_infra_coerencia() from public, anon, authenticated;
grant execute on function public._fn_infra_rotulo(text) to service_role;
grant execute on function public._fn_infra_formas(text) to service_role;
grant execute on function public._fn_infra_posicao_ok(jsonb) to service_role;
grant execute on function public._fn_infra_geometria_erro(text, jsonb) to service_role;
grant execute on function public._fn_infra_comprimento_m(jsonb) to service_role;
grant execute on function public._fn_infra_area_ha(jsonb) to service_role;
grant execute on function public._fn_infra_coerencia() to service_role;

-- 4. Escrita: criar / alterar --------------------------------------------------------------------------------------------------
-- p_infra: { id?, versao? (obrigatória ao editar), fazenda_id (ao criar), tipo, geometria, nome?, pasto_id?, bem_id?, observacao? }
-- Prévia (p_simular = true, o padrão): devolve o que vai gravar (rótulo, comprimento/área calculados, pasto, bem, os campos que mudam)
-- e os avisos; nada é gravado. Gravar: devolve id e versão.
create or replace function public.fn_infra_salvar(p_infra jsonb, p_simular boolean default true, p_motivo text default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_id uuid := nullif(p_infra->>'id', '')::uuid;
  o public.fazenda_infraestruturas%rowtype;
  n public.fazenda_infraestruturas%rowtype;
  v_erro text; v_pasto text; v_bem public.patrimonio_bens%rowtype; v_avisos jsonb := '[]'::jsonb; v_muda jsonb := '[]'::jsonb;
begin
  if v_id is not null then
    select * into o from public.fazenda_infraestruturas where id = v_id;
    if o.id is null or not coalesce(public.tenant_ok(o.cliente_id), false) then
      raise exception using errcode = '42501', message = 'sem acesso a este registro';
    end if;
    if nullif(p_infra->>'versao', '')::int is distinct from o.versao then
      raise exception using errcode = '40001', message = 'Esta infraestrutura foi alterada por outra pessoa. Feche e abra de novo.';
    end if;
    if not o.ativo then raise exception using errcode = 'P0001', message = 'Esta infraestrutura está desativada: não se edita.'; end if;
    if p_infra ? 'fazenda_id' and nullif(p_infra->>'fazenda_id', '')::uuid is distinct from o.fazenda_id then
      raise exception using errcode = 'P0001', message = 'A infraestrutura não muda de fazenda: desative e crie na outra.';
    end if;
    n := o;
  else
    n.id := gen_random_uuid();
    n.fazenda_id := nullif(p_infra->>'fazenda_id', '')::uuid;
    select f.cliente_id into n.cliente_id from public.fazendas f where f.id = n.fazenda_id;
    if n.cliente_id is null or not coalesce(public.tenant_ok(n.cliente_id), false) then
      raise exception using errcode = '42501', message = 'sem acesso a este registro';
    end if;
    n.ativo := true;
    n.versao := 0;
  end if;

  -- campos: ao editar, o que não vem no p_infra fica como está
  if v_id is null or p_infra ? 'tipo' then n.tipo := nullif(btrim(coalesce(p_infra->>'tipo', '')), ''); end if;
  if v_id is null or p_infra ? 'geometria' then n.geometria := p_infra->'geometria'; end if;
  if v_id is null or p_infra ? 'nome' then n.nome := nullif(btrim(coalesce(p_infra->>'nome', '')), ''); end if;
  if v_id is null or p_infra ? 'pasto_id' then n.pasto_id := nullif(p_infra->>'pasto_id', '')::uuid; end if;
  if v_id is null or p_infra ? 'bem_id' then n.bem_id := nullif(p_infra->>'bem_id', '')::uuid; end if;
  if v_id is null or p_infra ? 'observacao' then n.observacao := nullif(btrim(coalesce(p_infra->>'observacao', '')), ''); end if;

  -- recusas (frase pronta, nada gravado)
  if n.tipo is null then raise exception using errcode = 'P0001', message = 'Escolha o tipo de infraestrutura.'; end if;
  if n.geometria is null or jsonb_typeof(n.geometria) = 'null' then
    raise exception using errcode = 'P0001', message = 'Marque a infraestrutura no mapa.';
  end if;
  v_erro := public._fn_infra_geometria_erro(n.tipo, n.geometria);
  if v_erro is not null then raise exception using errcode = 'P0001', message = v_erro; end if;
  if n.pasto_id is not null then
    select p.nome into v_pasto from public.pastos p where p.id = n.pasto_id and p.fazenda_id = n.fazenda_id;
    if v_pasto is null then raise exception using errcode = 'P0001', message = 'O pasto escolhido não é desta fazenda.'; end if;
  end if;
  if n.bem_id is not null then
    select * into v_bem from public.patrimonio_bens b where b.id = n.bem_id and b.cliente_id = n.cliente_id and b.fazenda_id = n.fazenda_id;
    if v_bem.id is null then raise exception using errcode = 'P0001', message = 'O bem do Patrimônio escolhido não é desta fazenda.'; end if;
    if v_bem.situacao = 'baixado' then
      v_avisos := v_avisos || jsonb_build_array('O bem do Patrimônio escolhido está baixado.');
    end if;
  end if;
  n.comprimento_m := public._fn_infra_comprimento_m(n.geometria);
  n.area_ha := public._fn_infra_area_ha(n.geometria);

  if v_id is not null then
    select coalesce(jsonb_agg(k), '[]'::jsonb) into v_muda from unnest(array['tipo', 'geometria', 'nome', 'pasto_id', 'bem_id', 'observacao']) k
     where to_jsonb(o) -> k is distinct from to_jsonb(n) -> k;
    if jsonb_array_length(v_muda) = 0 then
      return jsonb_build_object('ok', true, 'simulado', p_simular, 'id', o.id, 'versao', o.versao, 'sem_mudanca', true);
    end if;
  end if;

  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'id', v_id, 'novo', v_id is null, 'avisos', v_avisos, 'muda', v_muda,
      'tipo', n.tipo, 'rotulo', public._fn_infra_rotulo(n.tipo), 'forma', n.geometria->>'type',
      'comprimento_m', n.comprimento_m, 'area_ha', n.area_ha,
      'pasto', case when n.pasto_id is not null then jsonb_build_object('id', n.pasto_id, 'nome', v_pasto) end,
      'bem', case when v_bem.id is not null then jsonb_build_object('id', v_bem.id, 'codigo', v_bem.codigo, 'descricao', v_bem.descricao) end);
  end if;

  if v_id is null then
    insert into public.fazenda_infraestruturas (id, cliente_id, fazenda_id, tipo, geometria, nome, pasto_id, bem_id, observacao,
      comprimento_m, area_ha, versao, criado_por)
    values (n.id, n.cliente_id, n.fazenda_id, n.tipo, n.geometria, n.nome, n.pasto_id, n.bem_id, n.observacao,
      n.comprimento_m, n.area_ha, 1, auth.uid());
    insert into public.fazenda_infraestrutura_trilha (cliente_id, infra_id, acao, antes, depois, motivo, por)
    values (n.cliente_id, n.id, 'criar', null,
      jsonb_build_object('tipo', n.tipo, 'geometria', n.geometria, 'nome', n.nome, 'pasto_id', n.pasto_id, 'bem_id', n.bem_id,
                         'observacao', n.observacao), nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid());
    return jsonb_build_object('ok', true, 'simulado', false, 'id', n.id, 'versao', 1);
  end if;

  update public.fazenda_infraestruturas set
    tipo = n.tipo, geometria = n.geometria, nome = n.nome, pasto_id = n.pasto_id, bem_id = n.bem_id, observacao = n.observacao,
    comprimento_m = n.comprimento_m, area_ha = n.area_ha, versao = o.versao + 1, alterado_em = now(), alterado_por = auth.uid()
   where id = o.id and versao = o.versao;
  if not found then
    raise exception using errcode = '40001', message = 'Esta infraestrutura foi alterada por outra pessoa. Feche e abra de novo.';
  end if;
  insert into public.fazenda_infraestrutura_trilha (cliente_id, infra_id, acao, antes, depois, motivo, por)
  select o.cliente_id, o.id, 'alterar',
         (select jsonb_object_agg(k, to_jsonb(o) -> k) from jsonb_array_elements_text(v_muda) k),
         (select jsonb_object_agg(k, to_jsonb(n) -> k) from jsonb_array_elements_text(v_muda) k),
         nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid();
  return jsonb_build_object('ok', true, 'simulado', false, 'id', o.id, 'versao', o.versao + 1);
end $$;

-- 5. Escrita: desativar (nada se apaga) ----------------------------------------------------------------------------------------
create or replace function public.fn_infra_desativar(p_id uuid, p_motivo text, p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare o public.fazenda_infraestruturas%rowtype;
begin
  select * into o from public.fazenda_infraestruturas where id = p_id;
  if o.id is null or not coalesce(public.tenant_ok(o.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if not o.ativo then raise exception using errcode = 'P0001', message = 'Esta infraestrutura já está desativada.'; end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'Diga o motivo de desativar.';
  end if;
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'id', o.id, 'rotulo', public._fn_infra_rotulo(o.tipo), 'nome', o.nome);
  end if;
  update public.fazenda_infraestruturas set ativo = false, desativado_em = now(), desativado_por = auth.uid(),
         desativado_motivo = btrim(p_motivo), versao = o.versao + 1, alterado_em = now(), alterado_por = auth.uid()
   where id = o.id and versao = o.versao;
  if not found then
    raise exception using errcode = '40001', message = 'Esta infraestrutura foi alterada por outra pessoa. Feche e abra de novo.';
  end if;
  insert into public.fazenda_infraestrutura_trilha (cliente_id, infra_id, acao, antes, depois, motivo, por)
  values (o.cliente_id, o.id, 'desativar', jsonb_build_object('ativo', true), jsonb_build_object('ativo', false), btrim(p_motivo), auth.uid());
  return jsonb_build_object('ok', true, 'simulado', false, 'id', o.id, 'versao', o.versao + 1);
end $$;

revoke all on function public.fn_infra_salvar(jsonb, boolean, text) from public, anon;
revoke all on function public.fn_infra_desativar(uuid, text, boolean) from public, anon;
grant execute on function public.fn_infra_salvar(jsonb, boolean, text) to authenticated, service_role;
grant execute on function public.fn_infra_desativar(uuid, text, boolean) to authenticated, service_role;
