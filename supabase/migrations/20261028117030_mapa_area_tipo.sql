-- MAPA-AREA-TIPO-01 · 117030 — na Validação, o polígono não vinculado vira "É pasto" (o vínculo de hoje) ou "É área" com o TIPO
-- (Gabriel 01/11): área da fazenda · área sem uso (terceiros) · reserva legal / mata nativa · APP · várzea / brejo · sede / benfeitorias ·
-- estrada · curral · confinamento. Degradada / em reforma / em recuperação / erosão NÃO são tipo (são situação com data, decisão de 31/10).
-- 1. o CHECK de `fazenda_geometrias.tipo` ganha 'area_fazenda', 'varzea_brejo', 'curral', 'confinamento' (os 8 de hoje ficam);
--    ⚠ o Code 4 (piquetes) também vai mexer neste CHECK: quem aplicar por último inclui os valores do outro.
-- 2. a MEMÓRIA da classificação (`fazenda_geometria_classificacoes`, por fazenda + nome normalizado do polígono): o "Atualizar mapa"
--    (`fn_mapa_fazenda_substituir`, que APAGA e regrava todos os polígonos da fazenda) devolve a classificação lembrada ao polígono que
--    chega sem classificação. A função é copiada VERBATIM da última definição (20261030117030, o fuso) + o bloco "lembradas" + a chave
--    nova no retorno ('classificacoes_mantidas'). Assinatura, SECURITY INVOKER e ACL iguais.
-- 3. a TRILHA (`fazenda_geometria_trilha`, imutável; sem FK para o polígono, que o reimport recria com outro id: guarda o nome).
-- 4. o escritor `fn_mapa_geometria_classificar(p_geometria, p_tipo, p_pasto, p_motivo, p_simular default true)`: trocar o tipo, voltar a
--    "sem classificação" (esquece a memória) e trocar entre pasto e área. NASCE FECHADA: SECURITY DEFINER, search_path fixo, cliente pelo
--    polígono + tenant_ok (42501), REVOKE PUBLIC/anon, GRANT authenticated/service_role; prévia por padrão; recusas com frase pronta.
-- Nenhum polígono muda de tipo nesta migration; a memória nasce VAZIA (semear com as classificações de hoje é decisão à parte).

set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- 1. os tipos
alter table public.fazenda_geometrias drop constraint if exists fazenda_geometrias_tipo_check;
alter table public.fazenda_geometrias add constraint fazenda_geometrias_tipo_check check (tipo in (
  'pasto', 'area_sem_uso', 'reserva_legal', 'app', 'benfeitoria', 'estrada', 'area_total', 'outra',
  'area_fazenda', 'varzea_brejo', 'curral', 'confinamento'));

create or replace function public._fn_mapa_tipo_rotulo(p_tipo text)
returns text language sql immutable set search_path = pg_catalog, public
as $$
  select case p_tipo
    when 'pasto' then 'Pasto' when 'outra' then 'Sem classificação' when 'area_fazenda' then 'Área da fazenda'
    when 'area_sem_uso' then 'Área sem uso (terceiros)' when 'reserva_legal' then 'Reserva legal / mata nativa' when 'app' then 'APP'
    when 'varzea_brejo' then 'Várzea / brejo' when 'benfeitoria' then 'Sede / benfeitorias' when 'estrada' then 'Estrada'
    when 'curral' then 'Curral' when 'confinamento' then 'Confinamento' when 'area_total' then 'Área total' end
$$;
revoke all on function public._fn_mapa_tipo_rotulo(text) from public, anon, authenticated;
grant execute on function public._fn_mapa_tipo_rotulo(text) to service_role;

-- 2. a memória (só o escritor grava; o "Atualizar mapa" lê pela RLS de quem importa)
create table if not exists public.fazenda_geometria_classificacoes (
  fazenda_id uuid not null references public.fazendas(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id),
  chave text not null,
  nome_original text not null,
  tipo text not null check (tipo in ('pasto', 'area_fazenda', 'area_sem_uso', 'reserva_legal', 'app', 'varzea_brejo', 'benfeitoria',
                                     'estrada', 'curral', 'confinamento', 'area_total')),
  pasto_id uuid references public.pastos(id) on delete set null,
  por uuid,
  em timestamptz not null default now(),
  primary key (fazenda_id, chave),
  constraint fazenda_geo_classif_pasto_chk check (tipo = 'pasto' or pasto_id is null)  -- o pasto apagado zera o lembrado (set null)
);
alter table public.fazenda_geometria_classificacoes enable row level security;
drop policy if exists fazenda_geometria_classificacoes_select on public.fazenda_geometria_classificacoes;
create policy fazenda_geometria_classificacoes_select on public.fazenda_geometria_classificacoes for select to authenticated
  using (public.tenant_ok(cliente_id));
revoke all on public.fazenda_geometria_classificacoes from public, anon;
revoke insert, update, delete on public.fazenda_geometria_classificacoes from authenticated;
grant select on public.fazenda_geometria_classificacoes to authenticated;
grant all on public.fazenda_geometria_classificacoes to service_role;

-- 3. a trilha
create table if not exists public.fazenda_geometria_trilha (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  fazenda_id uuid not null references public.fazendas(id) on delete cascade,
  geometria_id uuid not null,
  nome_original text not null,
  de jsonb not null,
  para jsonb not null,
  motivo text,
  por uuid,
  em timestamptz not null default now()
);
create index if not exists fazenda_geometria_trilha_fazenda_idx on public.fazenda_geometria_trilha (fazenda_id, em);
alter table public.fazenda_geometria_trilha enable row level security;
drop policy if exists fazenda_geometria_trilha_select on public.fazenda_geometria_trilha;
create policy fazenda_geometria_trilha_select on public.fazenda_geometria_trilha for select to authenticated using (public.tenant_ok(cliente_id));
revoke all on public.fazenda_geometria_trilha from public, anon;
revoke insert, update, delete on public.fazenda_geometria_trilha from authenticated;
grant select on public.fazenda_geometria_trilha to authenticated;
grant all on public.fazenda_geometria_trilha to service_role;

-- 4. o escritor
create or replace function public.fn_mapa_geometria_classificar(p_geometria uuid, p_tipo text, p_pasto uuid default null,
                                                                p_motivo text default null, p_simular boolean default true)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  g public.fazenda_geometrias%rowtype;
  v_tipo text := nullif(btrim(coalesce(p_tipo, '')), '');
  v_pasto uuid := case when nullif(btrim(coalesce(p_tipo, '')), '') = 'pasto' then p_pasto end;
  v_pasto_nome text; v_de_nome text; v_outro text;
begin
  select * into g from public.fazenda_geometrias where id = p_geometria;
  if g.id is null or not coalesce(public.tenant_ok(g.cliente_id), false) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  if v_tipo is null or v_tipo not in ('pasto', 'outra', 'area_fazenda', 'area_sem_uso', 'reserva_legal', 'app', 'varzea_brejo',
                                      'benfeitoria', 'estrada', 'curral', 'confinamento') then
    raise exception using errcode = 'P0001', message = 'Escolha o que é: pasto, um tipo de área ou sem classificação.';
  end if;
  if v_tipo = 'pasto' then
    if v_pasto is null then raise exception using errcode = 'P0001', message = 'Escolha o pasto.'; end if;
    select p.nome into v_pasto_nome from public.pastos p where p.id = v_pasto and p.fazenda_id = g.fazenda_id;
    if v_pasto_nome is null then raise exception using errcode = 'P0001', message = 'O pasto escolhido não é desta fazenda.'; end if;
    select o.nome_original into v_outro from public.fazenda_geometrias o where o.pasto_id = v_pasto and o.id <> g.id;
    if v_outro is not null then
      raise exception using errcode = 'P0001',
        message = format('O pasto "%s" já está ligado ao polígono "%s". Desvincule lá antes.', v_pasto_nome, v_outro);
    end if;
  end if;
  if v_tipo = g.tipo and v_pasto is not distinct from g.pasto_id then
    return jsonb_build_object('ok', true, 'simulado', p_simular, 'id', g.id, 'sem_mudanca', true);
  end if;
  select p.nome into v_de_nome from public.pastos p where p.id = g.pasto_id;
  if p_simular then
    return jsonb_build_object('ok', true, 'simulado', true, 'id', g.id, 'nome', g.nome_original,
      'de', jsonb_build_object('tipo', g.tipo, 'rotulo', public._fn_mapa_tipo_rotulo(g.tipo), 'pasto_id', g.pasto_id, 'pasto', v_de_nome),
      'para', jsonb_build_object('tipo', v_tipo, 'rotulo', public._fn_mapa_tipo_rotulo(v_tipo), 'pasto_id', v_pasto, 'pasto', v_pasto_nome));
  end if;
  update public.fazenda_geometrias set tipo = v_tipo, pasto_id = v_pasto where id = g.id;
  if v_tipo = 'outra' then
    delete from public.fazenda_geometria_classificacoes
     where fazenda_id = g.fazenda_id and chave = public._fn_normalizar_texto(g.nome_original);
  else
    insert into public.fazenda_geometria_classificacoes (fazenda_id, cliente_id, chave, nome_original, tipo, pasto_id, por)
    values (g.fazenda_id, g.cliente_id, public._fn_normalizar_texto(g.nome_original), g.nome_original, v_tipo, v_pasto, auth.uid())
    on conflict (fazenda_id, chave) do update set tipo = excluded.tipo, pasto_id = excluded.pasto_id, nome_original = excluded.nome_original,
      por = excluded.por, em = now();
  end if;
  insert into public.fazenda_geometria_trilha (cliente_id, fazenda_id, geometria_id, nome_original, de, para, motivo, por)
  values (g.cliente_id, g.fazenda_id, g.id, g.nome_original,
          jsonb_build_object('tipo', g.tipo, 'pasto_id', g.pasto_id), jsonb_build_object('tipo', v_tipo, 'pasto_id', v_pasto),
          nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid());
  return jsonb_build_object('ok', true, 'simulado', false, 'id', g.id, 'tipo', v_tipo, 'pasto_id', v_pasto);
end $$;
revoke all on function public.fn_mapa_geometria_classificar(uuid, text, uuid, text, boolean) from public, anon;
grant execute on function public.fn_mapa_geometria_classificar(uuid, text, uuid, text, boolean) to authenticated, service_role;

-- 5. o "Atualizar mapa" passa a devolver a classificação lembrada (VERBATIM da 20261030117030 + o bloco "lembradas" + a chave no retorno)
CREATE OR REPLACE FUNCTION public.fn_mapa_fazenda_substituir(p_fazenda_id uuid, p_poligonos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cliente uuid;
  v_total int := 0;
  v_criados int := 0;
  v_ordem int;
  v_pasto uuid;
  v_nome text;
  v_por_tipo jsonb;
  e record;
  v_mantidas int := 0;
BEGIN
  SELECT f.cliente_id INTO v_cliente FROM public.fazendas f WHERE f.id = p_fazenda_id;
  IF v_cliente IS NULL OR NOT coalesce(public.tenant_ok(v_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a esta fazenda' USING ERRCODE = '42501';
  END IF;
  IF p_poligonos IS NULL OR jsonb_typeof(p_poligonos) <> 'array' THEN
    RAISE EXCEPTION 'a lista de polígonos não veio' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(max(p.ordem_exibicao), 0) INTO v_ordem FROM public.pastos p WHERE p.fazenda_id = p_fazenda_id;

  DELETE FROM public.fazenda_geometrias WHERE fazenda_id = p_fazenda_id;

  FOR e IN SELECT x.item FROM jsonb_array_elements(p_poligonos) WITH ORDINALITY AS x(item, ord) ORDER BY x.ord LOOP
    IF e.item->>'tipo' = 'pasto_novo' THEN
      v_nome := btrim(coalesce(e.item->>'nome_original', ''));
      IF v_nome = '' THEN
        RAISE EXCEPTION 'pasto novo sem nome' USING ERRCODE = '22023';
      END IF;
      IF EXISTS (SELECT 1 FROM public.pastos p
                  WHERE p.fazenda_id = p_fazenda_id
                    AND public._fn_normalizar_texto(p.nome) = public._fn_normalizar_texto(v_nome)) THEN
        RAISE EXCEPTION 'Já existe um pasto com o nome "%" nesta fazenda.', v_nome USING ERRCODE = '23505';
      END IF;
      v_ordem := v_ordem + 1;
      INSERT INTO public.pastos (fazenda_id, cliente_id, nome, area_produtiva_ha, tipo_uso, observacoes, ativo, data_inicio, data_fim,
                                 ordem_exibicao)
      VALUES (p_fazenda_id, v_cliente, v_nome, round(nullif(e.item->>'area_ha', '')::numeric, 2), 'recria', NULL, true,
              date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::date)::date, NULL, v_ordem)
      RETURNING id INTO v_pasto;
      v_criados := v_criados + 1;
      INSERT INTO public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson, cor)
      VALUES (p_fazenda_id, v_cliente, 'pasto', v_pasto, v_nome, e.item->'geojson', nullif(e.item->>'cor', ''));
    ELSE
      INSERT INTO public.fazenda_geometrias (fazenda_id, cliente_id, tipo, pasto_id, nome_original, geojson, cor)
      VALUES (p_fazenda_id, v_cliente, e.item->>'tipo', nullif(e.item->>'pasto_id', '')::uuid, e.item->>'nome_original', e.item->'geojson',
              nullif(e.item->>'cor', ''));
    END IF;
    v_total := v_total + 1;
  END LOOP;

  -- MAPA-AREA-TIPO-01: a classificação feita no mapa NÃO se perde no "Atualizar mapa". Polígono que chega SEM classificação ('outra')
  -- recebe a lembrada pelo nome (sem acento, caixa ou espaço: `_fn_normalizar_texto`); a escolha explícita do arquivo/tela vence. O pasto
  -- lembrado só volta se ainda é desta fazenda, se nenhum outro polígono deste import ficou com ele e se só UM polígono tem aquele nome.
  WITH lembradas AS (
    SELECT DISTINCT ON (coalesce(m.pasto_id, g.id)) g.id, m.tipo, m.pasto_id   -- um pasto lembrado sob dois nomes volta para UM (o mais recente)
      FROM public.fazenda_geometrias g
      JOIN public.fazenda_geometria_classificacoes m
        ON m.fazenda_id = g.fazenda_id AND m.chave = public._fn_normalizar_texto(g.nome_original)
     WHERE g.fazenda_id = p_fazenda_id AND g.tipo = 'outra'
       AND (m.tipo <> 'pasto' OR (
             EXISTS (SELECT 1 FROM public.pastos p WHERE p.id = m.pasto_id AND p.fazenda_id = p_fazenda_id)
             AND NOT EXISTS (SELECT 1 FROM public.fazenda_geometrias o WHERE o.pasto_id = m.pasto_id)
             AND (SELECT count(*) FROM public.fazenda_geometrias g2
                   WHERE g2.fazenda_id = p_fazenda_id AND g2.tipo = 'outra'
                     AND public._fn_normalizar_texto(g2.nome_original) = m.chave) = 1))
     ORDER BY coalesce(m.pasto_id, g.id), m.em DESC
  )
  UPDATE public.fazenda_geometrias g SET tipo = l.tipo, pasto_id = l.pasto_id FROM lembradas l WHERE g.id = l.id;
  GET DIAGNOSTICS v_mantidas = ROW_COUNT;

  SELECT coalesce(jsonb_object_agg(t.tipo, t.n), '{}'::jsonb) INTO v_por_tipo
    FROM (SELECT g.tipo, count(*) AS n FROM public.fazenda_geometrias g WHERE g.fazenda_id = p_fazenda_id GROUP BY g.tipo) t;

  RETURN jsonb_build_object('total', v_total, 'por_tipo', v_por_tipo, 'pastos_criados', v_criados,
                            'classificacoes_mantidas', v_mantidas);
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_mapa_fazenda_substituir(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mapa_fazenda_substituir(uuid, jsonb) TO authenticated;
