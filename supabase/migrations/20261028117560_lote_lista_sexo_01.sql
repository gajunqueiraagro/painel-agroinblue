-- LOTE-LISTA-SEXO-01 (Gabriel, Chat 12/11 10:05) — a lista de Lotes troca "Cab" por Machos · Fêmeas · Total. A fonte é a MESMA do cab
-- (os itens do fechamento do último mês com dado do lote): a fn_lotes_da_fazenda devolve machos e fêmeas no FIM, somados pela categoria do
-- rebanho de cada item (mamote M, desmama M, garrote, boi, touro = machos; mamote F, desmama F, novilha, vaca = fêmeas); machos + fêmeas = cab
-- (provado no ensaio). O tipo de retorno muda: DROP + CREATE; corpo = o da 117540 com só isso acrescentado; o mesmo acesso e configuração.
set local lock_timeout = '2s';

do $g$ begin
  if (select md5(prosrc) from pg_proc where oid = 'public.fn_lotes_da_fazenda(uuid, text)'::regprocedure) <> 'f0fbc5fad5f7ed601d277cd56289dd56' then
    raise exception 'fn_lotes_da_fazenda não é a da 117540 (md5 do corpo mudou): nada aplicado';
  end if;
end $g$;

drop function public.fn_lotes_da_fazenda(uuid, text);
create function public.fn_lotes_da_fazenda(p_fazenda uuid, p_ano_mes text)
returns table(id uuid, codigo text, codigos_antigos text[], nome_campeiro text, situacao text, formado_em date, encerrado_em date,
  categoria_id uuid, raca_id uuid, atividade_id uuid, numero integer, sistema_id uuid, programa_id uuid, destino_id uuid, safra text,
  carimbo text, idade_media_meses integer, meta_peso_kg numeric, meta_gmd_kg numeric, meta_data date, versao integer, ano_mes_dado text,
  cabecas integer, peso_medio_kg numeric, gmd_kg numeric, pastos text[], lancamentos integer, conferir text,
  situacao_cria text, ordem_parto text, mamotes_sexo text, mamotes_cruzamento text, mamotes_semen text, anotacao text, codigo_regra text,
  machos integer, femeas integer)
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
         s.machos, s.femeas
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
