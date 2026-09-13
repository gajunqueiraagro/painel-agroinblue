-- 20260918120000_agri_dre_rpc_02_receita_nao_rateia.sql
-- AGRI-DRE-RPC-02: a receita deixa de ser rateada por area, e area em abertura deixa de
-- contar como cultura produtiva.
--
-- ⚠ ESTE ARQUIVO VERSIONA O QUE JA' ESTA' VIVO NO PROTO. A funcao foi aplicada pelo Chat via
--   Management API sob GO, antes de existir migration. Nao se reaplica por este arquivo: ele
--   existe para o historico deixar de mentir, e o corpo abaixo foi EXTRAIDO do banco
--   (`pg_get_functiondef`), nao redigitado.
--   Conferencia por construcao, em 2026-09-13:
--     md5(prosrc) = 77f1d5876b715c9881f559c240a844e2
--   O mesmo valor sai do banco e do corpo deste arquivo. Se um dia divergirem, o vivo e' o
--   banco e quem manda conferir e' este comentario.
--
-- ⚠ A 20260912120000_agri_04c_dre_agricola_por_safra.sql E' A VERSAO ANTERIOR e fica como
--   historico: nao se edita. O timestamp desta e' posterior justamente para que uma aplicacao
--   em ordem chegue ao estado atual.
--
-- O QUE MUDOU, e por que importa:
--  * A VERSAO ANTERIOR RATEAVA RECEITA POR AREA. Numa safra em que so' uma cultura vendeu, a
--    outra aparecia com faturamento que nunca existiu — e com resultado positivo por causa
--    dele. Agora receita e deducao SEM cultura marcada vao para '__nao_apropriado__', que NAO
--    rateia: enquanto ninguem classificar, o dinheiro fica visivel numa coluna propria em vez
--    de ser distribuido como se fosse de todo mundo.
--  * AREA EM ABERTURA NAO E' CULTURA PRODUTIVA. A coluna de cultura passa a sair so' de
--    `agri_safra_area` com `status = 'plantada'`; area em abertura entrava no denominador do
--    rateio e diluia o custo das que de fato plantaram.
--  * LANCAMENTO COM CULTURA QUE NAO FOI PLANTADA nesta safra tambem cai em
--    '__nao_apropriado__' — e' marcacao a corrigir, nao coluna nova.
--  * CUSTO COMUM E INVESTIMENTO SEM CULTURA SEGUEM RATEADOS POR AREA, como antes: esses o
--    produtor gastou pela lavoura inteira, e atribui-los por hectare e' a leitura honesta.
--    A mudanca e' sobre RECEITA, nao sobre custo.

CREATE OR REPLACE FUNCTION public.fn_dre_agricola_por_safra(p_cliente_id uuid, p_safra_id uuid)
 RETURNS TABLE(cultura text, area_ha numeric, area_cadastrada boolean, ordem integer, linha text, rotulo text, valor numeric, rateio_admin_declarado boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
with safra as (
  select s.id, s.data_inicio, s.data_fim from financeiro_safras s
   where s.id = p_safra_id and s.cliente_id = p_cliente_id
),
areas as (
  select a.cultura, sum(a.area_plantada_ha)::numeric as area_ha
    from agri_safra_area a
   where a.safra_id = p_safra_id and a.cliente_id = p_cliente_id and a.ativo and a.status = 'plantada'
   group by a.cultura
),
area_total as (select coalesce(sum(area_ha),0)::numeric as total from areas),
plantadas as (select cultura from areas),
lanc as (
  select
    case
      when l.cultura in (select cultura from plantadas) then l.cultura
      when l.cultura is null and l.grupo_custo in ('Receita Agrícola','Deduções Agricultura') then '__nao_apropriado__'
      when l.cultura is null then '__compartilhado__'
      else '__nao_apropriado__'
    end as bucket,
    l.grupo_custo, l.tipo_operacao, l.valor
  from financeiro_lancamentos_v2 l
  where l.cliente_id = p_cliente_id and l.safra_id = p_safra_id and coalesce(l.cancelado,false)=false
),
agg as (
  select bucket,
    coalesce(sum(valor) filter (where grupo_custo='Receita Agrícola' and tipo_operacao='1-Entradas'),0) receita,
    coalesce(sum(valor) filter (where grupo_custo='Deduções Agricultura' and tipo_operacao='2-Saídas'),0) deducoes,
    coalesce(sum(valor) filter (where grupo_custo='Custo Variável Agricultura' and tipo_operacao='2-Saídas'),0) cv,
    coalesce(sum(valor) filter (where grupo_custo='Custo Fixo Agricultura' and tipo_operacao='2-Saídas'),0) cf,
    coalesce(sum(valor) filter (where grupo_custo='Juros de Financiamento Agricultura' and tipo_operacao='2-Saídas'),0) juros,
    coalesce(sum(valor) filter (where grupo_custo='Investimento Agricultura' and tipo_operacao='2-Saídas'),0) inv
  from lanc group by bucket
),
comp as (
  select coalesce(cv+cf+juros,0) custos, coalesce(inv,0) inv from agg where bucket='__compartilhado__'
  union all select 0,0 where not exists (select 1 from agg where bucket='__compartilhado__')
),
na as (
  select receita, deducoes, cv, cf, juros, inv from agg where bucket='__nao_apropriado__'
  union all select 0,0,0,0,0,0 where not exists (select 1 from agg where bucket='__nao_apropriado__')
),
admin_por_ano as (
  select extract(year from l.data_competencia)::int ano, sum(l.valor) total
  from financeiro_lancamentos_v2 l, safra s
  where l.cliente_id=p_cliente_id and coalesce(l.cancelado,false)=false
    and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas'
    and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências')
    and s.data_inicio is not null and s.data_fim is not null
    and l.data_competencia between s.data_inicio and s.data_fim
  group by 1
),
admin_rateado as (
  select coalesce(sum(a.total*(r.percentual/100.0)),0)::numeric valor,
         coalesce(bool_and(r.percentual is not null),true) declarado
  from admin_por_ano a
  left join agri_rateio_admin r on r.cliente_id=p_cliente_id and r.ano=a.ano and r.atividade='agricultura'
),
base as (
  select a.cultura, a.area_ha,
    case when (select total from area_total)>0 then a.area_ha/(select total from area_total) else 0 end peso
  from areas a
),
sum_peso as (select coalesce(sum(peso),0) sp from base),
por_cultura as (
  select b.cultura, b.area_ha, true area_cadastrada,
    coalesce(g.receita,0) receita, coalesce(g.deducoes,0) deducoes,
    coalesce(g.cv,0) cv, coalesce(g.cf,0) cf, coalesce(g.juros,0) juros, coalesce(g.inv,0) inv,
    (select custos from comp)*b.peso rat_comp,
    (select valor from admin_rateado)*b.peso rat_adm,
    (select inv from comp)*b.peso inv_rat
  from base b left join agg g on g.bucket=b.cultura
),
linhas as (
  select p.cultura, p.area_ha, p.area_cadastrada, v.ordem, v.linha, v.rotulo, v.valor
  from por_cultura p cross join lateral (values
    (1,'receita_bruta','Receita bruta', p.receita),
    (2,'deducoes','(-) Deduções', p.deducoes),
    (3,'receita_liquida','= Receita líquida', p.receita-p.deducoes),
    (4,'custo_variavel','(-) Custo variável direto', p.cv),
    (5,'custo_fixo','(-) Custo fixo', p.cf),
    (6,'juros','(-) Juros de financiamento', p.juros),
    (7,'rateio_compartilhado','(-) Rateio compartilhado', p.rat_comp),
    (8,'rateio_admin','(-) Rateio administrativo', p.rat_adm),
    (9,'resultado_caixa','= Resultado de caixa', p.receita-p.deducoes-p.cv-p.cf-p.juros-p.rat_comp-p.rat_adm),
    (10,'investimento','Investimento no período', p.inv+p.inv_rat),
    (11,'depreciacao','Depreciação', null::numeric)
  ) v(ordem,linha,rotulo,valor)
),
na_linhas as (
  select '__nao_apropriado__'::text, null::numeric, null::boolean, v.ordem, v.linha, v.rotulo, v.valor
  from na n cross join lateral (values
    (1,'receita_bruta','Receita bruta', n.receita),
    (2,'deducoes','(-) Deduções', n.deducoes),
    (3,'receita_liquida','= Receita líquida', n.receita-n.deducoes),
    (4,'custo_variavel','(-) Custo variável direto', n.cv),
    (5,'custo_fixo','(-) Custo fixo', n.cf),
    (6,'juros','(-) Juros de financiamento', n.juros),
    (7,'rateio_compartilhado','(-) Rateio compartilhado', 0::numeric),
    (8,'rateio_admin','(-) Rateio administrativo', 0::numeric),
    (9,'resultado_caixa','= Resultado de caixa', n.receita-n.deducoes-n.cv-n.cf-n.juros),
    (10,'investimento','Investimento no período', n.inv),
    (11,'depreciacao','Depreciação', null::numeric)
  ) v(ordem,linha,rotulo,valor)
),
residuo as (
  select v.ordem, v.valor from (select (1-(select sp from sum_peso)) f) x cross join lateral (values
    (7, (select custos from comp)*x.f),
    (8, (select valor from admin_rateado)*x.f),
    (10, (select inv from comp)*x.f)
  ) v(ordem,valor)
),
esqueleto as (
  select v.ordem, v.linha, v.rotulo from (values
    (1,'receita_bruta','Receita bruta'),(2,'deducoes','(-) Deduções'),(3,'receita_liquida','= Receita líquida'),
    (4,'custo_variavel','(-) Custo variável direto'),(5,'custo_fixo','(-) Custo fixo'),(6,'juros','(-) Juros de financiamento'),
    (7,'rateio_compartilhado','(-) Rateio compartilhado'),(8,'rateio_admin','(-) Rateio administrativo'),
    (9,'resultado_caixa','= Resultado de caixa'),(10,'investimento','Investimento no período'),(11,'depreciacao','Depreciação')
  ) v(ordem,linha,rotulo)
),
soma_cult as (select ordem, sum(valor) v from linhas group by ordem)
select l.cultura, l.area_ha, l.area_cadastrada, l.ordem, l.linha, l.rotulo, l.valor, (select declarado from admin_rateado)
  from linhas l
union all
select '__nao_apropriado__', null, null, x.ordem, x.linha, x.rotulo, x.valor, (select declarado from admin_rateado)
  from na_linhas x(cultura,area_ha,area_cadastrada,ordem,linha,rotulo,valor)
union all
select '__total__', (select total from area_total), null, e.ordem, e.linha, e.rotulo,
  case when e.linha='depreciacao' then null
       else coalesce(sc.v,0)+coalesce(nl.valor,0)+coalesce(r.valor,0) end,
  (select declarado from admin_rateado)
  from esqueleto e
  left join soma_cult sc on sc.ordem=e.ordem
  left join na_linhas nl(cultura,area_ha,area_cadastrada,ordem,linha,rotulo,valor) on nl.ordem=e.ordem
  left join residuo r on r.ordem=e.ordem
order by 4,1
$function$;
