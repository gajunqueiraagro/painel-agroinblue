-- PASTO-AREA-OFICIAL-02a · 116140 — a LEITURA da área de cada pasto por MÊS, para o front (Gabriel 01/11/2026, D1/D2 da 02).
-- O front usava a área de HOJE do cadastro (`pastos.area_produtiva_ha`) para qualquer mês. Com a vigência (116120), a área de um mês é:
--   * mês com P1 VIGENTE (fechado): a área CONGELADA do membro (`fechamento_pastos_membros.area_considerada_ha`) — fonte 'fechado';
--   * senão: `fn_pasto_area_no_mes` (a mudança vale de um mês em diante) — fonte 'vigencia'.
-- Uma ida só para um intervalo (até 36 meses): o histórico de 12 meses do mapa e dos indicadores não faz 12 leituras. Devolve TODOS os
-- pastos das fazendas pedidas em todos os meses (quais pastos valem no mês continua sendo a regra de vigência do front/banco; aqui é só
-- QUANTO cada um mede). `tenant_ok` em cada fazenda (42501, nunca vazio).

set local lock_timeout = '2s';
set local statement_timeout = '60s';

create or replace function public.fn_pastos_area_do_mes(p_fazendas uuid[], p_de text, p_ate text)
returns table (pasto_id uuid, fazenda_id uuid, ano_mes text, area_ha numeric, fonte text)
language plpgsql stable security definer set search_path = pg_catalog, public
as $$
declare v_de date; v_ate date;
begin
  if p_fazendas is null or cardinality(p_fazendas) = 0 then return; end if;
  if exists (select 1 from unnest(p_fazendas) x left join public.fazendas f on f.id = x
              where f.id is null or not coalesce(public.tenant_ok(f.cliente_id), false)) then
    raise exception using errcode = '42501', message = 'sem acesso a este registro';
  end if;
  v_de := case when p_de ~ '^\d{4}-\d{2}$' then to_date(p_de || '-01', 'YYYY-MM-DD') end;
  v_ate := case when p_ate ~ '^\d{4}-\d{2}$' then to_date(p_ate || '-01', 'YYYY-MM-DD') end;
  if v_de is null or v_ate is null or v_ate < v_de then
    raise exception using errcode = 'P0001', message = 'Intervalo de meses inválido (AAAA-MM a AAAA-MM).';
  end if;
  if v_ate > (v_de + interval '35 months')::date then
    raise exception using errcode = 'P0001', message = 'No máximo 36 meses por leitura.';
  end if;
  return query
  with meses as (
    select to_char(m, 'YYYY-MM') as am from generate_series(v_de, v_ate, interval '1 month') m
  ), cong as (
    select mb.pasto_id, mb.ano_mes, mb.area_considerada_ha
      from public.fechamento_pastos_membros mb
      join public.fechamento_p1_snapshot s on s.id = mb.snapshot_id and s.status = 'vigente'
     where s.fazenda_id = any (p_fazendas) and s.ano_mes between p_de and p_ate and mb.area_considerada_ha is not null
  )
  select p.id, p.fazenda_id, me.am,
         coalesce(c.area_considerada_ha, public.fn_pasto_area_no_mes(p.id, me.am)),
         case when c.area_considerada_ha is not null then 'fechado' else 'vigencia' end
    from public.pastos p
    cross join meses me
    left join cong c on c.pasto_id = p.id and c.ano_mes = me.am
   where p.fazenda_id = any (p_fazendas)
   order by p.fazenda_id, p.id, me.am;
end $$;
revoke all on function public.fn_pastos_area_do_mes(uuid[], text, text) from public, anon;
grant execute on function public.fn_pastos_area_do_mes(uuid[], text, text) to authenticated, service_role;
