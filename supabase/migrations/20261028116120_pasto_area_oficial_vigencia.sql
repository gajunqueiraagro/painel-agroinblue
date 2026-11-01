-- PASTO-AREA-OFICIAL-01 · 116120 — a ÁREA OFICIAL do pasto com VIGÊNCIA, e o "Usar área do mapa" (Gabriel 01/11/2026, regra 1 do
-- PLANO-PASTOS-DOMINGO-01-11). A área oficial é a do cadastro do pasto (`pastos.area_produtiva_ha`: lotação, fechamento, DRE,
-- indicadores); a do mapa é MEDIÇÃO (o polígono de `fazenda_geometrias`, área geodésica calculada aqui no banco). Adotar a do mapa — ou
-- mudar a área à mão — vale DE UM MÊS EM DIANTE, nunca para trás, com prévia, trilha e desfazer.
--
-- COMO FICA:
--   * `pasto_area_vigencias`: uma linha por mudança (o mês de início, a área nova, a ANTERIOR, a origem, o motivo, quem, quando; desfazer
--     marca a linha, nunca apaga). É a trilha.
--   * `fn_pasto_area_no_mes(pasto, 'AAAA-MM')`: a área oficial daquele mês = a da última mudança viva com início <= mês; antes da primeira
--     mudança, a ANTERIOR gravada nela; com todas desfeitas, a ANTERIOR da primeira já registrada (a área de antes de tudo); sem
--     mudança nenhuma, a do cadastro. Assim a primeira mudança não precisa de carga inicial.
--   * `pastos.area_produtiva_ha` continua sendo a área de HOJE (o mês corrente): quem grava a vigência a acerta na mesma transação. Por
--     isso o mês escolhido vai até o mês corrente, nunca futuro.
--   * GATILHO: toda mudança de `area_produtiva_ha` que NÃO venha destas RPCs (o formulário do pasto, outra rotina) vira vigência do mês
--     corrente, com a anterior guardada — nenhum caminho muda a área dos meses passados.
--   * MÊS TRAVADO (recusa): de um mês M em diante não pode haver card do pasto FECHADO, área da fazenda OFICIALIZADA
--     (`fechamento_area_snapshot`) nem Valor do Rebanho validado/P2 fechado (`_fn_fechamento_p2_travado`) — a mesma régua do resto.
-- Os LEITORES do banco passam a pedir a área do mês na 116130 (lotação, DRE, pastos aplicáveis do P1). Os do front: PASTO-AREA-OFICIAL-02.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- 1. a vigência (a trilha) -------------------------------------------------------------------------------------------------------
create table if not exists public.pasto_area_vigencias (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  fazenda_id uuid not null references public.fazendas(id),
  pasto_id uuid not null references public.pastos(id),
  vigente_desde date not null check (vigente_desde = date_trunc('month', vigente_desde)::date),
  area_ha numeric(12,2) not null check (area_ha > 0),
  area_anterior_ha numeric(12,2),
  origem text not null check (origem in ('mapa', 'manual', 'cadastro')),
  motivo text not null check (btrim(motivo) <> ''),
  geometria_id uuid,
  area_mapa_ha numeric(12,2),
  lote uuid,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  desfeita_em timestamptz,
  desfeita_por uuid,
  desfeita_motivo text,
  check ((desfeita_em is null) = (desfeita_motivo is null))
);
create unique index if not exists pasto_area_vigencias_viva_uk on public.pasto_area_vigencias (pasto_id, vigente_desde) where desfeita_em is null;
create index if not exists pasto_area_vigencias_lote_idx on public.pasto_area_vigencias (lote) where lote is not null;
alter table public.pasto_area_vigencias enable row level security;
drop policy if exists pasto_area_vigencias_select on public.pasto_area_vigencias;
create policy pasto_area_vigencias_select on public.pasto_area_vigencias for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.pasto_area_vigencias from public, anon;
revoke insert, update, delete on public.pasto_area_vigencias from authenticated;
grant select on public.pasto_area_vigencias to authenticated;
grant all on public.pasto_area_vigencias to service_role;

-- 2. a área oficial do mês (leitora; INVOKER e aberta a `authenticated`: a lotação, que é invoker, a chama; a RLS protege) -----------
create or replace function public.fn_pasto_area_no_mes(p_pasto uuid, p_ano_mes text)
returns numeric
language sql stable set search_path = pg_catalog, public
as $$
  select coalesce(
    (select v.area_ha from public.pasto_area_vigencias v
      where v.pasto_id = p_pasto and v.desfeita_em is null and v.vigente_desde <= to_date(p_ano_mes || '-01', 'YYYY-MM-DD')
      order by v.vigente_desde desc limit 1),
    (select v.area_anterior_ha from public.pasto_area_vigencias v
      where v.pasto_id = p_pasto and v.desfeita_em is null
      order by v.vigente_desde asc limit 1),
    (select v.area_anterior_ha from public.pasto_area_vigencias v
      where v.pasto_id = p_pasto
      order by v.vigente_desde asc, v.criado_em asc limit 1),
    (select p.area_produtiva_ha from public.pastos p where p.id = p_pasto))
$$;
revoke all on function public.fn_pasto_area_no_mes(uuid, text) from public, anon;
grant execute on function public.fn_pasto_area_no_mes(uuid, text) to authenticated, service_role;

-- 3. a área geodésica do polígono (a fórmula do turf `area`: anel externo menos os buracos, raio 6378137 m) -------------------------
create or replace function public._fn_area_geodesica_ha(p_geojson jsonb)
returns numeric
language plpgsql immutable set search_path = pg_catalog, public
as $$
declare
  v_anel jsonb; v_ordem int := 0; n int; i int; lo jsonb; mi jsonb; up jsonb; v_total float8; v_area float8 := 0;
begin
  if p_geojson is null or p_geojson->>'type' is distinct from 'Polygon' or jsonb_typeof(p_geojson->'coordinates') <> 'array' then
    return null;
  end if;
  for v_anel in select x from jsonb_array_elements(p_geojson->'coordinates') x loop
    v_ordem := v_ordem + 1;
    n := jsonb_array_length(v_anel) - 1;
    v_total := 0;
    if n > 2 then
      for i in 0 .. n - 1 loop
        lo := v_anel->i;
        mi := v_anel->(case when i + 1 = n then 0 else i + 1 end);
        up := v_anel->(case when i + 2 >= n then (i + 2) % n else i + 2 end);
        v_total := v_total + (radians((up->>0)::float8) - radians((lo->>0)::float8)) * sin(radians((mi->>1)::float8));
      end loop;
    end if;
    v_total := abs(v_total * 6378137.0 * 6378137.0 / 2);
    v_area := v_area + case when v_ordem = 1 then v_total else -v_total end;
  end loop;
  return round((v_area / 10000)::numeric, 2);
end $$;
revoke all on function public._fn_area_geodesica_ha(jsonb) from public, anon, authenticated;
grant execute on function public._fn_area_geodesica_ha(jsonb) to service_role;

-- 4. internas: o mês travado e a gravação ------------------------------------------------------------------------------------------
-- a frase do primeiro travamento de M em diante (nula = livre)
create or replace function public._fn_pasto_area_trava(p_pasto uuid, p_fazenda uuid, p_desde date)
returns text
language sql stable security definer set search_path = pg_catalog, public
as $$
  select coalesce(
    (select format('o pasto está fechado em %s', to_char(to_date(fp.ano_mes || '-01', 'YYYY-MM-DD'), 'MM/YYYY'))
       from public.fechamento_pastos fp where fp.pasto_id = p_pasto and fp.status = 'fechado' and fp.ano_mes >= to_char(p_desde, 'YYYY-MM')
       order by fp.ano_mes desc limit 1),
    (select format('a área de %s da fazenda já foi oficializada', to_char(s.ano_mes, 'MM/YYYY'))
       from public.fechamento_area_snapshot s where s.fazenda_id = p_fazenda and s.ano_mes >= p_desde
       order by s.ano_mes desc limit 1),
    (select format('o Valor do Rebanho de %s está validado', to_char(to_date(m.am || '-01', 'YYYY-MM-DD'), 'MM/YYYY'))
       from (select distinct ano_mes am from public.valor_rebanho_realizado_validado where fazenda_id = p_fazenda and status = 'validado'
             union select distinct ano_mes from public.valor_rebanho_fechamento where fazenda_id = p_fazenda and status = 'fechado') m
      where m.am >= to_char(p_desde, 'YYYY-MM') order by m.am desc limit 1))
$$;
revoke all on function public._fn_pasto_area_trava(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public._fn_pasto_area_trava(uuid, uuid, date) to service_role;

-- grava a mudança e acerta `pastos.area_produtiva_ha` = a área do mês corrente. Já havendo mudança viva NO MESMO MÊS, ela fica na trilha
-- marcada como substituída, e a nova guarda a MESMA anterior (a área de antes do mês) — desfazer a nova volta à área de antes do mês.
create or replace function public._fn_pasto_area_gravar(p_pasto uuid, p_area numeric, p_desde date, p_origem text, p_motivo text,
                                                        p_geometria uuid, p_area_mapa numeric, p_lote uuid)
returns uuid
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare p public.pastos%rowtype; v_id uuid; v_anterior numeric; v_mesmo public.pasto_area_vigencias%rowtype;
begin
  select * into p from public.pastos where id = p_pasto for update;
  select * into v_mesmo from public.pasto_area_vigencias v where v.pasto_id = p_pasto and v.vigente_desde = p_desde and v.desfeita_em is null;
  if v_mesmo.id is not null then
    v_anterior := v_mesmo.area_anterior_ha;
    update public.pasto_area_vigencias v set desfeita_em = now(), desfeita_por = auth.uid(),
           desfeita_motivo = 'substituída por outra mudança do mesmo mês' where v.id = v_mesmo.id;
  else
    v_anterior := public.fn_pasto_area_no_mes(p_pasto, to_char(p_desde, 'YYYY-MM'));
  end if;
  insert into public.pasto_area_vigencias (cliente_id, fazenda_id, pasto_id, vigente_desde, area_ha, area_anterior_ha, origem, motivo,
                                           geometria_id, area_mapa_ha, lote, criado_por)
  values (p.cliente_id, p.fazenda_id, p.id, p_desde, round(p_area, 2), v_anterior, p_origem, btrim(p_motivo), p_geometria, p_area_mapa,
          p_lote, auth.uid())
  returning id into v_id;
  perform public._fn_pasto_area_sincronizar(p_pasto);
  return v_id;
end $$;

-- `pastos.area_produtiva_ha` = a área oficial do mês corrente (sem disparar o gatilho de novo)
create or replace function public._fn_pasto_area_sincronizar(p_pasto uuid)
returns void
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v numeric := public.fn_pasto_area_no_mes(p_pasto, to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM'));
begin
  perform set_config('app.pasto_area_escritor', 'on', true);
  update public.pastos set area_produtiva_ha = v, updated_at = now() where id = p_pasto and area_produtiva_ha is distinct from v;
  perform set_config('app.pasto_area_escritor', 'off', true);
end $$;
revoke all on function public._fn_pasto_area_gravar(uuid, numeric, date, text, text, uuid, numeric, uuid) from public, anon, authenticated;
revoke all on function public._fn_pasto_area_sincronizar(uuid) from public, anon, authenticated;
grant execute on function public._fn_pasto_area_gravar(uuid, numeric, date, text, text, uuid, numeric, uuid) to service_role;
grant execute on function public._fn_pasto_area_sincronizar(uuid) to service_role;

-- 5. o GATILHO: mudança de área por fora das RPCs vira vigência do mês corrente ------------------------------------------------------
create or replace function public._trg_pasto_area_vigencia()
returns trigger
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_mes date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date; v_trava text;
  v_mesmo public.pasto_area_vigencias%rowtype;
begin
  if coalesce(current_setting('app.pasto_area_escritor', true), '') = 'on' then return new; end if;
  if new.area_produtiva_ha is null or new.area_produtiva_ha <= 0 then
    raise exception using errcode = 'P0001', message = 'A área do pasto tem de ser maior que zero.';
  end if;
  v_trava := public._fn_pasto_area_trava(new.id, new.fazenda_id, v_mes);
  if v_trava is not null then
    raise exception using errcode = 'P0001', message = format('A área não muda: %s. Reabra o mês antes.', v_trava);
  end if;
  select * into v_mesmo from public.pasto_area_vigencias v where v.pasto_id = new.id and v.vigente_desde = v_mes and v.desfeita_em is null;
  if v_mesmo.id is not null then
    update public.pasto_area_vigencias v set desfeita_em = now(), desfeita_por = auth.uid(),
           desfeita_motivo = 'substituída por outra mudança do mesmo mês' where v.id = v_mesmo.id;
  end if;
  insert into public.pasto_area_vigencias (cliente_id, fazenda_id, pasto_id, vigente_desde, area_ha, area_anterior_ha, origem, motivo, criado_por)
  values (new.cliente_id, new.fazenda_id, new.id, v_mes, round(new.area_produtiva_ha, 2),
          case when v_mesmo.id is not null then v_mesmo.area_anterior_ha else old.area_produtiva_ha end,
          'cadastro', 'mudou no cadastro do pasto', auth.uid());
  return new;
end $$;
revoke all on function public._trg_pasto_area_vigencia() from public, anon, authenticated;
drop trigger if exists trg_pasto_area_vigencia on public.pastos;
create trigger trg_pasto_area_vigencia before update of area_produtiva_ha on public.pastos
  for each row when (old.area_produtiva_ha is distinct from new.area_produtiva_ha) execute function public._trg_pasto_area_vigencia();

-- 6. LEITURA para a tela: área oficial do mês × área do mapa, por pasto da fazenda ---------------------------------------------------
create or replace function public.fn_pastos_area_comparar(p_fazenda uuid, p_ano_mes text)
returns table (pasto_id uuid, nome text, ativo boolean, area_oficial_ha numeric, area_mapa_ha numeric, n_poligonos int,
               dif_ha numeric, dif_pct numeric, ultima_vigencia_id uuid, ultima_origem text, ultima_desde date, ultima_anterior_ha numeric,
               trava text)
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare v_cli uuid := (select f.cliente_id from public.fazendas f where f.id = p_fazenda);
begin
  if v_cli is null or not coalesce(public.tenant_ok(v_cli), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  return query
  select p.id, p.nome, p.ativo, public.fn_pasto_area_no_mes(p.id, p_ano_mes), g.ha, coalesce(g.n, 0)::int,
         round(g.ha - public.fn_pasto_area_no_mes(p.id, p_ano_mes), 2),
         case when public.fn_pasto_area_no_mes(p.id, p_ano_mes) > 0
              then round((g.ha - public.fn_pasto_area_no_mes(p.id, p_ano_mes)) / public.fn_pasto_area_no_mes(p.id, p_ano_mes) * 100, 1) end,
         u.id, u.origem, u.vigente_desde, u.area_anterior_ha,
         public._fn_pasto_area_trava(p.id, p.fazenda_id, to_date(p_ano_mes || '-01', 'YYYY-MM-DD'))
    from public.pastos p
    left join lateral (select count(*) n, case when count(*) = 1 then max(public._fn_area_geodesica_ha(x.geojson)) end ha
                         from public.fazenda_geometrias x where x.pasto_id = p.id) g on true
    left join lateral (select v.* from public.pasto_area_vigencias v where v.pasto_id = p.id and v.desfeita_em is null
                        order by v.vigente_desde desc limit 1) u on true
   where p.fazenda_id = p_fazenda and public.fn_pasto_vigente_no_mes(p.ativo, p.data_inicio, p.data_fim, p_ano_mes)
   order by p.ordem_exibicao nulls last, p.nome;
end $$;
revoke all on function public.fn_pastos_area_comparar(uuid, text) from public, anon;
grant execute on function public.fn_pastos_area_comparar(uuid, text) to authenticated, service_role;

-- 7. ESCRITA: "Usar área do mapa" para um pasto ou um lote (tudo ou nada) ------------------------------------------------------------
-- A prévia diz, pasto a pasto: a área do mês antes e depois, a diferença, a lotação (UA/ha) do mês antes e depois (do último mês com
-- cards até o mês escolhido; a lotação é a do rebanho de lá dividida pela área) e 'muda' / 'igual' / 'recusa' com o motivo.
create or replace function public.fn_pasto_area_usar_mapa(p_pastos uuid[], p_vigente_desde date, p_motivo text, p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_desde date := date_trunc('month', p_vigente_desde)::date;
  v_mes_atual date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;
  r record; v_itens jsonb := '[]'::jsonb; v_sit text; v_mot text; v_antes numeric; v_mapa numeric; v_geo uuid; v_ngeo int;
  v_am_lot text; v_ua numeric; v_n_muda int := 0; v_n_recusa int := 0; v_n_igual int := 0; v_lote uuid := gen_random_uuid();
begin
  if p_pastos is null or cardinality(p_pastos) = 0 then raise exception using errcode = 'P0001', message = 'Escolha ao menos um pasto.'; end if;
  perform public._fn_exigir_tenant_das_linhas(array(select distinct p.cliente_id from public.pastos p where p.id = any (p_pastos)));
  if exists (select 1 from unnest(p_pastos) x where not exists (select 1 from public.pastos p where p.id = x)) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if v_desde is null or v_desde > v_mes_atual then
    raise exception using errcode = 'P0001', message = 'A área nova vale de um mês até o mês atual em diante: escolha o mês atual ou um mês aberto antes dele.';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception using errcode = 'P0001', message = 'Informe o motivo.'; end if;

  for r in select p.* from public.pastos p where p.id = any (p_pastos) order by p.nome loop
    v_sit := 'muda'; v_mot := null; v_mapa := null; v_geo := null; v_ua := null; v_am_lot := null;
    v_antes := public.fn_pasto_area_no_mes(r.id, to_char(v_desde, 'YYYY-MM'));
    select count(*), max(g.id::text)::uuid, max(public._fn_area_geodesica_ha(g.geojson)) into v_ngeo, v_geo, v_mapa
      from public.fazenda_geometrias g where g.pasto_id = r.id;
    if not public.fn_pasto_vigente_no_mes(r.ativo, r.data_inicio, r.data_fim, to_char(v_desde, 'YYYY-MM')) then
      v_sit := 'recusa'; v_mot := format('O pasto não está ativo em %s.', to_char(v_desde, 'MM/YYYY'));
    elsif v_ngeo = 0 then v_sit := 'recusa'; v_mot := 'O pasto não tem polígono no mapa.';
    elsif v_ngeo > 1 then v_sit := 'recusa'; v_mot := format('O pasto tem %s polígonos no mapa: deixe um só antes.', v_ngeo); v_mapa := null;
    elsif coalesce(v_mapa, 0) <= 0 then v_sit := 'recusa'; v_mot := 'O polígono do mapa não tem área.';
    else
      v_mot := public._fn_pasto_area_trava(r.id, r.fazenda_id, v_desde);
      if v_mot is not null then v_sit := 'recusa'; v_mot := format('A área não muda: %s.', v_mot);
      elsif v_antes is not distinct from v_mapa then v_sit := 'igual'; v_mot := 'A área oficial já é a do mapa.';
      end if;
    end if;
    select max(fp.ano_mes) into v_am_lot from public.fechamento_pastos fp where fp.fazenda_id = r.fazenda_id and fp.ano_mes <= to_char(v_desde, 'YYYY-MM');
    if v_am_lot is not null then
      select l.ua into v_ua from public.fn_lotacao_do_mes(r.fazenda_id, v_am_lot) l where l.pasto_id = r.id;
    end if;
    v_itens := v_itens || jsonb_build_object('pasto_id', r.id, 'nome', r.nome, 'situacao', v_sit, 'motivo', v_mot,
      'area_antes', v_antes, 'area_mapa', v_mapa, 'dif_ha', round(v_mapa - v_antes, 2),
      'dif_pct', case when v_antes > 0 then round((v_mapa - v_antes) / v_antes * 100, 1) end,
      'lotacao_mes', v_am_lot, 'ua', round(v_ua, 2),
      'ua_ha_antes', case when v_antes > 0 and v_ua is not null then round(v_ua / v_antes, 2) end,
      'ua_ha_depois', case when v_mapa > 0 and v_ua is not null and v_sit <> 'recusa' then round(v_ua / v_mapa, 2) end,
      'geometria_id', v_geo);
    if v_sit = 'muda' then v_n_muda := v_n_muda + 1; elsif v_sit = 'igual' then v_n_igual := v_n_igual + 1; else v_n_recusa := v_n_recusa + 1; end if;
  end loop;

  if p_simular then
    return jsonb_build_object('ok', v_n_recusa = 0 and v_n_muda > 0, 'simulado', true, 'vigente_desde', v_desde, 'n_muda', v_n_muda,
      'n_igual', v_n_igual, 'n_recusa', v_n_recusa, 'itens', v_itens);
  end if;
  if v_n_recusa > 0 then
    raise exception using errcode = 'P0001', message = format('%s pasto(s) não podem usar a área do mapa: %s', v_n_recusa,
      (select string_agg(i->>'nome' || ' — ' || (i->>'motivo'), '; ') from jsonb_array_elements(v_itens) i where i->>'situacao' = 'recusa'));
  end if;
  if v_n_muda = 0 then raise exception using errcode = 'P0001', message = 'Nada a mudar: a área oficial já é a do mapa.'; end if;
  for r in select i from jsonb_array_elements(v_itens) i where i->>'situacao' = 'muda' loop
    perform public._fn_pasto_area_gravar((r.i->>'pasto_id')::uuid, (r.i->>'area_mapa')::numeric, v_desde, 'mapa', p_motivo,
                                         (r.i->>'geometria_id')::uuid, (r.i->>'area_mapa')::numeric, v_lote);
  end loop;
  return jsonb_build_object('ok', true, 'simulado', false, 'vigente_desde', v_desde, 'lote', v_lote, 'n_muda', v_n_muda, 'n_igual', v_n_igual,
    'itens', v_itens);
end $$;
revoke all on function public.fn_pasto_area_usar_mapa(uuid[], date, text, boolean) from public, anon;
grant execute on function public.fn_pasto_area_usar_mapa(uuid[], date, text, boolean) to authenticated, service_role;

-- 8. ESCRITA: editar a área à mão, de um mês em diante ----------------------------------------------------------------------------
create or replace function public.fn_pasto_area_editar(p_pasto uuid, p_area_ha numeric, p_vigente_desde date, p_motivo text,
                                                       p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  p public.pastos%rowtype; v_desde date := date_trunc('month', p_vigente_desde)::date;
  v_mes_atual date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date; v_antes numeric; v_trava text; v_id uuid;
begin
  select * into p from public.pastos where id = p_pasto;
  if p.id is null or not coalesce(public.tenant_ok(p.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if p_area_ha is null or p_area_ha <= 0 then raise exception using errcode = 'P0001', message = 'A área do pasto tem de ser maior que zero.'; end if;
  if v_desde is null or v_desde > v_mes_atual then
    raise exception using errcode = 'P0001', message = 'A área nova vale de um mês até o mês atual em diante: escolha o mês atual ou um mês aberto antes dele.';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception using errcode = 'P0001', message = 'Informe o motivo.'; end if;
  v_trava := public._fn_pasto_area_trava(p.id, p.fazenda_id, v_desde);
  if v_trava is not null then raise exception using errcode = 'P0001', message = format('A área não muda: %s. Reabra o mês antes.', v_trava); end if;
  v_antes := public.fn_pasto_area_no_mes(p.id, to_char(v_desde, 'YYYY-MM'));
  if v_antes is not distinct from round(p_area_ha, 2) then
    raise exception using errcode = 'P0001', message = 'Nada a mudar: a área oficial já é esta.';
  end if;
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'vigente_desde', v_desde, 'area_antes', v_antes, 'area_depois', round(p_area_ha, 2));
  end if;
  v_id := public._fn_pasto_area_gravar(p.id, p_area_ha, v_desde, 'manual', p_motivo, null, null, null);
  return jsonb_build_object('ok', true, 'simulado', false, 'vigencia_id', v_id, 'vigente_desde', v_desde, 'area_antes', v_antes,
    'area_depois', round(p_area_ha, 2));
end $$;
revoke all on function public.fn_pasto_area_editar(uuid, numeric, date, text, boolean) from public, anon;
grant execute on function public.fn_pasto_area_editar(uuid, numeric, date, text, boolean) to authenticated, service_role;

-- 9. ESCRITA: desfazer mudanças de área (uma ou o lote inteiro; tudo ou nada). A linha fica, marcada; a área volta a ser a de antes.
-- Desfaz-se da mais nova para a mais antiga: com uma mudança mais nova viva no mesmo pasto (fora do pedido), recusa.
create or replace function public.fn_pasto_area_desfazer(p_vigencias uuid[], p_motivo text, p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare r record; v_trava text; v_itens jsonb := '[]'::jsonb; v_rec text := null;
begin
  if p_vigencias is null or cardinality(p_vigencias) = 0 then raise exception using errcode = 'P0001', message = 'Escolha o que desfazer.'; end if;
  perform public._fn_exigir_tenant_das_linhas(array(select distinct v.cliente_id from public.pasto_area_vigencias v where v.id = any (p_vigencias)));
  if exists (select 1 from unnest(p_vigencias) x where not exists (select 1 from public.pasto_area_vigencias v where v.id = x)) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then raise exception using errcode = 'P0001', message = 'Informe o motivo.'; end if;
  for r in select v.*, p.nome from public.pasto_area_vigencias v join public.pastos p on p.id = v.pasto_id
            where v.id = any (p_vigencias) order by p.nome loop
    v_trava := case when r.desfeita_em is not null then 'já foi desfeita'
                    else coalesce(public._fn_pasto_area_trava(r.pasto_id, r.fazenda_id, r.vigente_desde),
                                  (select format('há uma mudança mais nova (%s): desfaça ela antes', to_char(n.vigente_desde, 'MM/YYYY'))
                                     from public.pasto_area_vigencias n
                                    where n.pasto_id = r.pasto_id and n.desfeita_em is null and n.vigente_desde > r.vigente_desde
                                      and not (n.id = any (p_vigencias))
                                    order by n.vigente_desde limit 1)) end;
    if v_trava is not null and v_rec is null then v_rec := format('%s — %s', r.nome, v_trava); end if;
    v_itens := v_itens || jsonb_build_object('vigencia_id', r.id, 'pasto_id', r.pasto_id, 'nome', r.nome, 'vigente_desde', r.vigente_desde,
      'area_ha', r.area_ha, 'volta_para', r.area_anterior_ha, 'recusa', v_trava);
  end loop;
  if p_simular then return jsonb_build_object('ok', v_rec is null, 'simulado', true, 'itens', v_itens); end if;
  if v_rec is not null then raise exception using errcode = 'P0001', message = format('Não dá para desfazer: %s.', v_rec); end if;
  update public.pasto_area_vigencias v set desfeita_em = now(), desfeita_por = auth.uid(), desfeita_motivo = btrim(p_motivo)
   where v.id = any (p_vigencias);
  for r in select distinct v.pasto_id from public.pasto_area_vigencias v where v.id = any (p_vigencias) loop
    perform public._fn_pasto_area_sincronizar(r.pasto_id);
  end loop;
  return jsonb_build_object('ok', true, 'simulado', false, 'itens', v_itens);
end $$;
revoke all on function public.fn_pasto_area_desfazer(uuid[], text, boolean) from public, anon;
grant execute on function public.fn_pasto_area_desfazer(uuid[], text, boolean) to authenticated, service_role;
