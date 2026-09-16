-- PR-AGRI-MANDIOCA-01 — o Painel da Safra ganha o bloco `entrega`.
--
-- ⚠ DUAS FUNCOES: `fn_painel_safra_entrega` NASCE aqui, e `fn_painel_safra` ganha UMA linha —
--   `'entrega', fn_painel_safra_entrega(...)` no `jsonb_build_object`. O bloco so' existe para
--   cultura com `toneladas` gravada: sem nenhuma carga em tonelada, a funcao devolve NULL e a
--   tela nao desenha nada. O amendoim continua recebendo `entrega: null`.
--
-- ⚠ NENHUMA CONTA NO FRONT, e e' por isso que ela existe: o rendimento medio e' PONDERADO POR
--   TONELADA (`sum(rendimento_g*toneladas)/sum(toneladas)`), nao a media simples das cargas —
--   uma carga de 5 t com 520 g nao pesa o mesmo que uma de 40 t com 480 g. E o preco medio sai
--   de `receita/toneladas`, com a receita lida dos LANCAMENTOS de papel 'venda', nao recalculada.
-- ⚠ E ELA LE PELO ELO, nao por descricao: `agri_colheita_lancamentos` com `papel` e' o que separa
--   venda de ICMS, de Funrural e dos tres servicos. Casar por texto do lancamento quebraria no
--   dia em que a frase mudasse.
--
-- ⚠ JA APLICADAS NO PROTO (16/09, GO do Gabriel). Conferidas nas duas pontas:
--   fn_painel_safra_entrega b28a72af341dacb9e1fb850f5a52fee9 (2.631) — lida do banco;
--   fn_painel_safra 3d700f7ba593413b8f6eccac7fac0fc0 (5.858) -> 8846ef611ac4f588a7ae0c7c4d037328
--   (5.928), reconstruida por delta sobre 20261027121200 e confirmada pelo `md5(prosrc)`.

CREATE OR REPLACE FUNCTION public.fn_painel_safra_entrega(p_cliente uuid, p_safra_id uuid, p_cultura text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
with col as (
  select c.id, c.nf_produtor nf, c.data_colheita dt, c.peso_bruto_kg, coalesce(c.desconto_kg,0) desconto_kg, c.toneladas, c.rendimento_g
  from agri_colheita c join agri_safra_area a on a.id=c.safra_area_id
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
  select col.nf, (select count(distinct lancamento_id) from lan where lan.nf=col.nf and lan.papel='venda') cargas, round(sum(toneladas),2) t, round(sum(rendimento_g*toneladas)/nullif(sum(toneladas),0),0) rend_g, min(dt) dt,
         (select coalesce(sum(valor),0) from lan where lan.nf=col.nf and lan.papel='venda') valor
  from (select nf, dt, toneladas, rendimento_g, id from col) col
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
  'por_nf', coalesce((select jsonb_agg(jsonb_build_object('nf', nf, 'data', dt, 'cargas', cargas, 'toneladas', t, 'rendimento_g', rend_g, 'valor', valor) order by dt, nf) from nf),'[]'::jsonb)
) end
$function$;

revoke all on function public.fn_painel_safra_entrega(uuid, uuid, text) from public;
grant execute on function public.fn_painel_safra_entrega(uuid, uuid, text) to authenticated;

CREATE OR REPLACE FUNCTION public.fn_painel_safra(p_cliente uuid, p_safra_id uuid, p_cultura text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_area numeric; v_sacas numeric; v_res jsonb; v_dre jsonb; v_natureza jsonb; v_fora numeric;
  v_inv_tipos jsonb; v_talhoes jsonb; v_peso numeric := 0;
begin
  select coalesce(sum(a.area_plantada_ha),0) into v_area
    from agri_safra_area a where a.safra_id=p_safra_id and a.cultura=p_cultura and a.ativo and a.cliente_id=p_cliente;
  select case when coalesce((select sum(area_plantada_ha) from agri_safra_area where safra_id=p_safra_id and cliente_id=p_cliente and ativo and status='plantada'),0)>0 then coalesce((select sum(area_plantada_ha) from agri_safra_area where safra_id=p_safra_id and cliente_id=p_cliente and cultura=p_cultura and ativo and status='plantada'),0) / (select sum(area_plantada_ha) from agri_safra_area where safra_id=p_safra_id and cliente_id=p_cliente and ativo and status='plantada') else 0 end into v_peso;
  select coalesce(sum(coalesce(col.toneladas, col.sacas_boas+col.grao_roca_sacas)),0) into v_sacas
    from agri_colheita col join agri_safra_area a on a.id=col.safra_area_id
    where a.safra_id=p_safra_id and a.cultura=p_cultura and col.ativo and col.cliente_id=p_cliente;

  select jsonb_object_agg(d.linha, d.valor) into v_dre
    from public.fn_dre_agricola_por_safra(p_cliente, p_safra_id) d where d.cultura=p_cultura;

  select jsonb_agg(jsonb_build_object('centro', centro, 'n', n, 'valor', valor, 'direto', direto, 'compartilhado', compartilhado) order by valor desc) into v_natureza
    from (select coalesce(l.centro_custo,'(sem)') centro, count(*) n, coalesce(sum(l.valor) filter (where l.cultura=p_cultura),0) + coalesce(sum(l.valor) filter (where coalesce(l.cultura,'')=''),0)*v_peso valor, coalesce(sum(l.valor) filter (where l.cultura=p_cultura),0) direto, coalesce(sum(l.valor) filter (where coalesce(l.cultura,'')=''),0) compartilhado
      from financeiro_lancamentos_v2 l
      where l.cliente_id=p_cliente and l.safra_id=p_safra_id and coalesce(l.cancelado,false)=false and coalesce(l.cultura,'') in (p_cultura,'')
        and l.compoe_dre=true and l.tipo_operacao='2-Saídas' and coalesce(l.macro_custo,'') not ilike '%investimento%'
      group by l.centro_custo) t;

  select coalesce(sum(l.valor),0) into v_fora
    from financeiro_lancamentos_v2 l
    where l.cliente_id=p_cliente and l.safra_id=p_safra_id and coalesce(l.cancelado,false)=false and coalesce(l.cultura,'') in (p_cultura,'')
      and l.tipo_operacao='2-Saídas' and l.compoe_dre=false and coalesce(l.macro_custo,'') not ilike '%investimento%';

  select jsonb_agg(jsonb_build_object('tipo', subcentro, 'valor', valor,
           'valor_ha', case when v_area>0 then round(valor/v_area,2) else 0 end, 'direto', direto, 'compartilhado', compartilhado) order by valor desc) into v_inv_tipos
    from (select l.subcentro, coalesce(sum(l.valor) filter (where l.cultura=p_cultura),0) + coalesce(sum(l.valor) filter (where coalesce(l.cultura,'')=''),0)*v_peso valor, coalesce(sum(l.valor) filter (where l.cultura=p_cultura),0) direto, coalesce(sum(l.valor) filter (where coalesce(l.cultura,'')=''),0) compartilhado
      from financeiro_lancamentos_v2 l
      where l.cliente_id=p_cliente and l.safra_id=p_safra_id and coalesce(l.cancelado,false)=false and coalesce(l.cultura,'') in (p_cultura,'')
        and l.macro_custo ilike '%investimento%'
      group by l.subcentro) t;

  -- CORRIGIDO: area e sacas somadas SEPARADO antes de juntar (senao o join multiplica a area)
  select jsonb_agg(jsonb_build_object('talhao', talhao, 'variedade', variedade, 'area_ha', ha,
           'sacas', sacas, 'sacas_boas', boas, 'roca_sacas', roca, 'pct_afla20', pct_afla20, 'sacas_ha', case when ha>0 then round(sacas/ha,2) else 0 end, 'cargas', cargas)
           order by (case when ha>0 then sacas/ha else 0 end) desc) into v_talhoes
    from (
      select coalesce(p.nome,'(sem talhao)') talhao, ar.variedade, ar.ha,
             coalesce(c.sacas,0) sacas, coalesce(c.boas,0) boas, coalesce(c.roca,0) roca, coalesce(c.pct_afla20,0) pct_afla20, coalesce(c.cargas,0) cargas
      from (
        select a.pasto_id, a.variedade, sum(a.area_plantada_ha) ha
        from agri_safra_area a
        where a.safra_id=p_safra_id and a.cultura=p_cultura and a.ativo and a.cliente_id=p_cliente
        group by a.pasto_id, a.variedade
      ) ar
      left join pastos p on p.id=ar.pasto_id
      left join lateral (
        select sum(coalesce(col.toneladas, col.sacas_boas+col.grao_roca_sacas)) sacas, sum(col.sacas_boas) boas, sum(col.grao_roca_sacas) roca, round(100*coalesce(sum(col.sacas_boas) filter (where col.aflatoxina_ppb>20),0)/nullif(sum(col.sacas_boas),0),1) pct_afla20, count(col.id) cargas
        from agri_colheita col join agri_safra_area a2 on a2.id=col.safra_area_id
        where a2.pasto_id=ar.pasto_id and coalesce(a2.variedade,'')=coalesce(ar.variedade,'')
          and a2.safra_id=p_safra_id and a2.cultura=p_cultura and col.ativo
      ) c on true
    ) t;

  v_res := jsonb_build_object(
    'area_ha', v_area, 'total_sacas', v_sacas,
    'sacas_ha', case when v_area>0 then round(v_sacas/v_area,2) else 0 end,
    'faturamento', coalesce((v_dre->>'receita_bruta')::numeric,0),
    'deducoes', coalesce((v_dre->>'deducoes')::numeric,0),
    'custo_variavel', coalesce((v_dre->>'custo_variavel')::numeric,0),
    'custo_fixo', coalesce((v_dre->>'custo_fixo')::numeric,0),
    'juros', coalesce((v_dre->>'juros')::numeric,0),
    'rateio_compartilhado', coalesce((v_dre->>'rateio_compartilhado')::numeric,0),
    'rateio_admin', coalesce((v_dre->>'rateio_admin')::numeric,0),
    'saldo', coalesce((v_dre->>'resultado_caixa')::numeric,0),
    'investimento', coalesce((v_dre->>'investimento')::numeric,0),
    'investimento_tipos', coalesce(v_inv_tipos,'[]'::jsonb),
    'entrega', fn_painel_safra_entrega(p_cliente, p_safra_id, p_cultura), 'talhoes', coalesce(v_talhoes,'[]'::jsonb),
    'natureza', coalesce(v_natureza,'[]'::jsonb),
    'fora_do_custeio', v_fora
  );
  return v_res;
end $function$;

revoke all on function public.fn_painel_safra(uuid, uuid, text) from public;
grant execute on function public.fn_painel_safra(uuid, uuid, text) to authenticated;
