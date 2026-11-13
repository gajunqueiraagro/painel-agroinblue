-- LOTE-CARIMBOS-01 (Gabriel 12/11 10:51 e 13:29; Chat 14:05) — o carimbo do lote vira LISTA (bezerros ao pé de vários lotes: 7.1, 7.2, 8.1).
-- `carimbos text[]` (1..n, sem repetir, cada um mês.lote ou ressinc. 7R); `carimbo` fica como ESPELHO do 1º (todo leitor de hoje segue igual).
-- O código (regra 'etapas') leva a FAIXA DE MESES como o campeiro escreve: 1 carimbo = ele mesmo (7.1 → -7.1, NADA muda nos lotes de hoje);
-- vários = os meses distintos em ordem, com a ressinc. à parte (7.1+7.2+8.1 → -7/8; 7.1+7.2 → -7; 7.1+7R → -7/7R). Parida pede ≥ 1.
-- Os 63 lotes com carimbo ganham carimbos = [carimbo] (código igual; trilha com motivo). fn_lote_salvar por patch guardado por md5;
-- fn_lotes_da_fazenda devolve `carimbos` no fim (DROP + CREATE, corpo = o da 117560 + só isso, guarda md5).
set local lock_timeout = '2s';

-- 1. as funções puras da lista (imutáveis; EXECUTE aberto a authenticated porque o CHECK as avalia na gravação)
create or replace function public._fn_carimbos_validos(p text[]) returns boolean language sql immutable set search_path = pg_catalog, public as $$
  select p is null or (cardinality(p) > 0
    and not exists (select 1 from unnest(p) c where c is null or c !~ '^(1[0-2]|[1-9])(\.[1-9][0-9]?|R(\.[1-9][0-9]?)?)$')
    and cardinality(p) = (select count(distinct c) from unnest(p) c))
$$;
create or replace function public._fn_carimbos_faixa(p text[]) returns text language sql immutable set search_path = pg_catalog, public as $$
  select case when p is null or cardinality(p) = 0 then null
              when cardinality(p) = 1 then p[1]
              else (select string_agg(t, '/' order by m, r) from (
                      select distinct substring(c from '^[0-9]+') || case when c ~ 'R' then 'R' else '' end as t,
                             substring(c from '^[0-9]+')::int as m, (c ~ 'R')::int as r
                        from unnest(p) c) z) end
$$;
revoke all on function public._fn_carimbos_validos(text[]) from public, anon;
revoke all on function public._fn_carimbos_faixa(text[]) from public, anon;
grant execute on function public._fn_carimbos_validos(text[]) to authenticated, service_role;
grant execute on function public._fn_carimbos_faixa(text[]) to authenticated, service_role;

-- 2. a coluna e o preenchimento dos lotes de hoje (carimbos = [carimbo]; código não muda)
alter table public.rebanho_lotes add column carimbos text[];
comment on column public.rebanho_lotes.carimbos is 'LOTE-CARIMBOS-01: os carimbos dos bezerros ao pé (1..n); carimbo = carimbos[1] (espelho)';
do $b$ begin
  perform set_config('app.lote_escritor', '1', true);
  perform set_config('app.motivo', 'LOTE-CARIMBOS-01: carimbo vira lista (carimbos = [carimbo]; código igual)', true);
  update public.rebanho_lotes set carimbos = array[carimbo] where carimbo is not null and carimbos is null;
  perform set_config('app.motivo', '', true);
  perform set_config('app.lote_escritor', '', true);
end $b$;
alter table public.rebanho_lotes
  add constraint rebanho_lotes_carimbos_ok check (public._fn_carimbos_validos(carimbos)),
  add constraint rebanho_lotes_carimbo_espelho check ((carimbos is null and carimbo is null) or carimbo = carimbos[1]);

-- 3. fn_lote_salvar: a chave nova, a lista, o espelho e a faixa no código (patch guardado por md5; cada âncora casa 1x)
do $patch$
declare
  v_oid oid := 'public.fn_lote_salvar(uuid, uuid, jsonb, integer, text, boolean)'::regprocedure;
  v_def text; v_n integer; v_par text[];
  v_pares text[] := array[
    -- A1: a chave aceita
    $a$'mamotes_semen', 'anotacao'];$a$,
    $b$'mamotes_semen', 'anotacao', 'carimbos'];$b$,
    -- A2: a lista (depois do carimbo de sempre); o carimbo sozinho vira lista de 1
    $a$  if p_campos ? 'idade_media_meses' then$a$,
    $b$  /* LOTE-CARIMBOS-01: a lista de carimbos (sem repetir, na ordem digitada); o 1º espelha em `carimbo`; só `carimbo` = lista de 1 */
  if p_campos ? 'carimbos' then
    if jsonb_typeof(p_campos->'carimbos') not in ('array', 'null') then
      raise exception using errcode = 'P0001', message = 'Carimbos: uma lista (ex.: 7.1, 8.1).';
    end if;
    n.carimbos := array(select z.c from (select upper(btrim(e)) as c, min(i) as i
                                           from jsonb_array_elements_text(coalesce(nullif(p_campos->'carimbos', 'null'::jsonb), '[]'::jsonb))
                                                with ordinality t(e, i)
                                          where btrim(e) <> '' group by 1) z order by z.i);
    if exists (select 1 from unnest(n.carimbos) c where c !~ '^(1[0-2]|[1-9])(\.[1-9][0-9]?|R(\.[1-9][0-9]?)?)$') then
      raise exception using errcode = 'P0001', message = 'Carimbo: mês.lote, ex.: 7.1 (julho, 1º lote) ou 7R (ressinc. de julho).';
    end if;
    if cardinality(n.carimbos) = 0 then n.carimbos := null; end if;
    n.carimbo := n.carimbos[1];
  elsif p_campos ? 'carimbo' then
    n.carimbos := case when n.carimbo is null then null else array[n.carimbo] end;
  end if;
  if p_campos ? 'idade_media_meses' then$b$,
    -- A3: editar sem mudar identidade nem a lista = o mesmo código
    $a$and not v_ident and n.carimbo is not distinct from o.carimbo then$a$,
    $b$and not v_ident and n.carimbos is not distinct from o.carimbos then$b$,
    -- A4: o código leva a faixa de meses
    $a$n.atividade_id, n.carimbo, p_id);$a$,
    $b$n.atividade_id, public._fn_carimbos_faixa(n.carimbos), p_id);$b$,
    -- A5/A6: o INSERT grava a lista
    $a$mamotes_semen, anotacao, codigo_regra)$a$,
    $b$mamotes_semen, anotacao, codigo_regra, carimbos)$b$,
    $a$n.mamotes_semen, n.anotacao, n.codigo_regra)$a$,
    $b$n.mamotes_semen, n.anotacao, n.codigo_regra, n.carimbos)$b$,
    -- A7: o UPDATE grava a lista
    $a$mamotes_semen = n.mamotes_semen, anotacao = n.anotacao,$a$,
    $b$mamotes_semen = n.mamotes_semen, anotacao = n.anotacao, carimbos = n.carimbos,$b$
  ];
begin
  if (select md5(prosrc) from pg_proc where oid = v_oid) <> '5c4736c3c9f2cb2c301505112713b152' then
    raise exception 'fn_lote_salvar não é a da 117540 (md5 do corpo mudou): nada aplicado';
  end if;
  v_def := pg_get_functiondef(v_oid);
  for i in 1 .. array_length(v_pares, 1) / 2 loop
    v_par := array[v_pares[2 * i - 1], v_pares[2 * i]];
    v_n := (length(v_def) - length(replace(v_def, v_par[1], ''))) / length(v_par[1]);
    if v_n <> 1 then raise exception 'âncora A% casa % vez(es), não 1: nada aplicado', i, v_n; end if;
    v_def := replace(v_def, v_par[1], v_par[2]);
  end loop;
  execute v_def;
end $patch$;

-- 4. fn_lotes_da_fazenda devolve a lista no FIM (DROP + CREATE; corpo = o da 117560 com só `carimbos` acrescentado; mesmo acesso)
do $g$ begin
  if (select md5(prosrc) from pg_proc where oid = 'public.fn_lotes_da_fazenda(uuid, text)'::regprocedure) <> '019f1c5cf3e1185b9184a8d8c394cddf' then
    raise exception 'fn_lotes_da_fazenda não é a da 117560 (md5 do corpo mudou): nada aplicado';
  end if;
end $g$;

drop function public.fn_lotes_da_fazenda(uuid, text);
create function public.fn_lotes_da_fazenda(p_fazenda uuid, p_ano_mes text)
returns table(id uuid, codigo text, codigos_antigos text[], nome_campeiro text, situacao text, formado_em date, encerrado_em date,
  categoria_id uuid, raca_id uuid, atividade_id uuid, numero integer, sistema_id uuid, programa_id uuid, destino_id uuid, safra text,
  carimbo text, idade_media_meses integer, meta_peso_kg numeric, meta_gmd_kg numeric, meta_data date, versao integer, ano_mes_dado text,
  cabecas integer, peso_medio_kg numeric, gmd_kg numeric, pastos text[], lancamentos integer, conferir text,
  situacao_cria text, ordem_parto text, mamotes_sexo text, mamotes_cruzamento text, mamotes_semen text, anotacao text, codigo_regra text,
  machos integer, femeas integer, carimbos text[])
language plpgsql stable security definer
set search_path = pg_catalog, public
set plan_cache_mode = force_custom_plan
as $fn$
#variable_conflict use_column
begin
  perform public._fn_exigir_tenant_das_linhas(array[(select f.cliente_id from public.fazendas f where f.id = p_fazenda)]);
  if p_ano_mes is null or p_ano_mes !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception using errcode = 'P0001', message = 'Mês: escolha o mês e o ano.';
  end if;
  return query
  with it as (
    select i.lote_id, fp.ano_mes, i.quantidade, i.peso_medio_kg, pa.nome as pasto, cr.codigo as cat
      from public.fechamento_pasto_itens i
      join public.fechamento_pastos fp on fp.id = i.fechamento_id
      join public.pastos pa on pa.id = fp.pasto_id
      left join public.categorias_rebanho cr on cr.id = i.categoria_id
     where fp.fazenda_id = p_fazenda and i.lote_id is not null and fp.ano_mes <= p_ano_mes
  ), mes as (
    select lote_id, max(ano_mes) as ano_mes from it group by lote_id
  ), soma as (
    select it.lote_id, it.ano_mes, sum(it.quantidade)::integer as cab,
           sum(it.quantidade * it.peso_medio_kg) filter (where it.peso_medio_kg is not null)
             / nullif(sum(it.quantidade) filter (where it.peso_medio_kg is not null), 0) as peso,
           array_agg(distinct it.pasto order by it.pasto) as pastos,
           /* LOTE-LISTA-SEXO-01 — as MESMAS linhas do cab, pela categoria do rebanho de cada uma */
           coalesce(sum(it.quantidade) filter (where it.cat in ('mamotes_m', 'desmama_m', 'garrotes', 'bois', 'touros')), 0)::integer as machos,
           coalesce(sum(it.quantidade) filter (where it.cat in ('mamotes_f', 'desmama_f', 'novilhas', 'vacas')), 0)::integer as femeas
      from it group by it.lote_id, it.ano_mes
  )
  select l.id, l.codigo, l.codigos_antigos, l.nome_campeiro, l.situacao, l.formado_em, l.encerrado_em, l.categoria_id, l.raca_id,
         l.atividade_id, l.numero, l.sistema_id, l.programa_id, l.destino_id, l.safra, l.carimbo, l.idade_media_meses, l.meta_peso_kg,
         l.meta_gmd_kg, l.meta_data, l.versao,
         m.ano_mes, s.cab, round(s.peso, 1),
         case when s.peso is not null and a.peso is not null
              then round((s.peso - a.peso) / extract(day from (to_date(m.ano_mes || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day'))::numeric, 3) end,
         s.pastos,
         (select count(*)::integer from public.fechamento_pasto_itens x where x.lote_id = l.id),
         l.conferir, l.situacao_cria, l.ordem_parto, l.mamotes_sexo, l.mamotes_cruzamento, l.mamotes_semen, l.anotacao, l.codigo_regra,
         s.machos, s.femeas, l.carimbos
    from public.rebanho_lotes l
    left join mes m on m.lote_id = l.id
    left join soma s on s.lote_id = l.id and s.ano_mes = m.ano_mes
    left join soma a on a.lote_id = l.id
                    and a.ano_mes = to_char(to_date(m.ano_mes || '-01', 'YYYY-MM-DD') - interval '1 month', 'YYYY-MM')
   where l.fazenda_id = p_fazenda and l.situacao <> 'cancelado'
   order by l.codigo;
end $fn$;
revoke all on function public.fn_lotes_da_fazenda(uuid, text) from public, anon;
grant execute on function public.fn_lotes_da_fazenda(uuid, text) to authenticated, service_role;
