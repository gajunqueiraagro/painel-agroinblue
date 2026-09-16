-- PR-AGRI-MANDIOCA-01d — comprador por nota e o rendimento minimo/maximo da safra.
--
-- REGISTRO HISTORICO: a funcao JA FOI APLICADA no proto pelo arquiteto em 16/09/2026, com GO do
-- Gabriel. Esta migration versiona o que ESTA no banco; ela nao se reaplica.
--
-- Corpo LIDO DO BANCO (pg_proc.prosrc, em base64) e conferido por md5 nas duas pontas.
--   fn_painel_safra_entrega  3085 chars  md5 cf7d1861cb42e7fcab2d990267205db3
--     (era b28a72af341dacb9e1fb850f5a52fee9 / 2631 — quatro ancoras: o join de
--      financeiro_fornecedores no CTE `col`, o `comprador` no CTE `nf`, o `comprador` em `por_nf`
--      e o par rendimento_min/rendimento_max {g, data, nf} no objeto)
--
-- ⚠ O MIN/MAX SAI DE `col`, QUE E' POR COLHEITA, NAO POR CARGA — e nesta base da no mesmo: as duas
-- metades de uma carga do backfill carregam o MESMO `rendimento_g` (medido: um valor distinto por
-- grupo nos 21). O dia em que uma carga tiver metades com rendimentos diferentes, o min/max passa
-- a olhar a metade, nao o caminhao. Fica anotado porque o numero nao muda hoje e mudaria calado.
--
-- `sql stable security definer`, search_path pg_catalog/public, revoke public / grant authenticated.

create or replace function public.fn_painel_safra_entrega(p_cliente uuid, p_safra_id uuid, p_cultura text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
with col as (
  select c.id, c.nf_produtor nf, c.data_colheita dt, c.peso_bruto_kg, coalesce(c.desconto_kg,0) desconto_kg, c.toneladas, c.rendimento_g, coalesce(fo.nome_favorecido, fo.nome) comprador
  from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id left join financeiro_fornecedores fo on fo.id=c.industria_id
  where c.cliente_id=p_cliente and a.safra_id=p_safra_id and a.cultura=p_cultura and c.ativo and c.toneladas is not null
),
lan as (
  select distinct cl.lancamento_id, cl.papel, l.valor, l.documento nf, l.status_transacao st
  from agri_colheita_lancamentos cl join col on col.id=cl.colheita_id join financeiro_lancamentos_v2 l on l.id=cl.lancamento_id
  where cl.ativo and coalesce(l.cancelado,false)=false
),
tot as (
  select round(sum(peso_bruto_kg)/1000.0,2) t_bruto, round(sum(desconto_kg)/1000.0,2) desconto_t, round(sum(toneladas),2) t,
         case when sum(toneladas)>0 then round(sum(rendimento_g*toneladas)/sum(toneladas),0) else null end rend_g
  from col
),
fin as (
  select coalesce(sum(valor) filter (where papel='venda'),0) receita, coalesce(sum(valor) filter (where papel in ('arranquio','frete','carregamento')),0) servicos,
         coalesce(sum(valor) filter (where papel in ('icms','funrural')),0) deducoes,
         coalesce(sum(valor) filter (where papel='venda' and st<>'realizado'),0) a_receber
  from lan
),
nf as (
  select col.nf, (select count(distinct lancamento_id) from lan where lan.nf=col.nf and lan.papel='venda') cargas, round(sum(toneladas),2) t, round(sum(rendimento_g*toneladas)/nullif(sum(toneladas),0),0) rend_g, min(dt) dt, max(comprador) comprador,
         (select coalesce(sum(valor),0) from lan where lan.nf=col.nf and lan.papel='venda') valor
  from (select nf, dt, toneladas, rendimento_g, id, comprador from col) col
  group by col.nf
)
select case when (select t from tot) is null then null else jsonb_build_object(
  'toneladas_bruto', (select t_bruto from tot), 'desconto_t', (select desconto_t from tot), 'toneladas', (select t from tot),
  'rendimento_medio_g', (select rend_g from tot),
  'receita_bruta', (select receita from fin), 'deducoes', (select deducoes from fin), 'a_receber', (select a_receber from fin),
  'preco_t', case when (select t from tot)>0 then round((select receita from fin)/(select t from tot),2) else null end,
  'servicos_total', (select servicos from fin),
  'servicos_t', case when (select t from tot)>0 then round((select servicos from fin)/(select t from tot),2) else null end,
  'cargas', (select count(distinct lancamento_id) from lan where papel='venda'),
  'por_nf', coalesce((select jsonb_agg(jsonb_build_object('nf', nf, 'data', dt, 'cargas', cargas, 'toneladas', t, 'rendimento_g', rend_g, 'valor', valor, 'comprador', comprador) order by dt, nf) from nf),'[]'::jsonb),
  'rendimento_min', (select jsonb_build_object('g', rendimento_g, 'data', dt, 'nf', nf) from col order by rendimento_g asc, dt asc limit 1),
  'rendimento_max', (select jsonb_build_object('g', rendimento_g, 'data', dt, 'nf', nf) from col order by rendimento_g desc, dt asc limit 1)
) end
$function$;

revoke all on function public.fn_painel_safra_entrega(uuid, uuid, text) from public;
grant execute on function public.fn_painel_safra_entrega(uuid, uuid, text) to authenticated;
