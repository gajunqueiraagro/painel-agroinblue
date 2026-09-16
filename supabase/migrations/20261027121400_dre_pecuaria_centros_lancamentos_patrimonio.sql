-- PR-DRE-PECUARIA-02 — centros por bloco, listas de lancamento e patrimonio por categoria.
--
-- REGISTRO HISTORICO: as tres funcoes JA FORAM APLICADAS no proto pelo arquiteto em 16/09/2026,
-- com GO do Gabriel. Esta migration versiona o que ESTA no banco; ela nao se reaplica.
--
-- Os corpos abaixo foram LIDOS DO BANCO (pg_proc.prosrc, em base64) e conferidos por md5 nas duas
-- pontas, nao redigitados. Reconstruir por delta ja custou uma rodada no PR-DRE-LAVOURA-07, quando
-- tres substituicoes casaram uma vez cada e o comprimento ainda deu diferente: comprimento igual
-- nao e conteudo igual, e so o hash decide.
--
--   fn_dre_pecuaria              8850 chars  md5 79e15359767515e2162802cf1507a725
--     (era d5673f38201f845d6f72d74d355fb822 / 7723 — tres ancoras: a CTE `finc` antes de `base`,
--      'centros' no objeto de cada fazenda e 'centros' no total)
--   fn_dre_pecuaria_lancamentos  1289 chars  md5 a66ee08e293ffcc661e0ce567ccb4f8b   NOVA
--   fn_dre_pecuaria_patrimonio   1946 chars  md5 63d5f58f7835a6492417b2f71bb32e11   NOVA
--
-- ⚠ A LINGUAGEM NAO E' A MESMA NAS TRES, e o briefing dizia que era ("todas sql"). Conferido em
-- pg_language: `fn_dre_pecuaria` e' PLPGSQL — o corpo dela abre com `declare` e fecha com `end`,
-- e declara-la `language sql` faria esta migration falhar ao ser aplicada num banco limpo. As
-- duas novas sao `sql` de verdade (comecam em `with per as ...`). Versionar o que o banco TEM,
-- nao o que o briefing descreve.
--
-- Volatilidade, seguranca e search_path conferidos um a um: as tres sao `stable security definer`
-- com `search_path=pg_catalog, public`. A ACL do banco hoje e' postgres/service_role/authenticated
-- com EXECUTE e nada para public — que e' o que o revoke/grant abaixo reproduz.

create or replace function public.fn_dre_pecuaria(p_cliente uuid, p_de text, p_ate text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare v_ini date; v_fim date; v_p0 text; v_res jsonb;
begin
  v_ini := to_date(p_de||'-01','YYYY-MM-DD');
  v_fim := (to_date(p_ate||'-01','YYYY-MM-DD') + interval '1 month' - interval '1 day')::date;
  v_p0 := to_char(v_ini - interval '1 month','YYYY-MM');
  with faz as (
    select f.id, f.nome from fazendas f where f.cliente_id=p_cliente
      and (exists(select 1 from valor_rebanho_fechamento_itens i where i.fazenda_id=f.id and i.ano_mes between v_p0 and p_ate)
        or exists(select 1 from financeiro_lancamentos_v2 l join financeiro_plano_contas p on p.id=l.plano_conta_id where l.fazenda_id=f.id and p.escopo_negocio='pecuaria' and p.bloco_dre is not null and l.data_competencia between v_ini and v_fim))
  ),
  fin as (
    select l.fazenda_id, p.bloco_dre bloco, sum(l.valor) valor, sum(case when l.status_transacao<>'realizado' then l.valor else 0 end) a_pagar
    from financeiro_lancamentos_v2 l join financeiro_plano_contas p on p.id=l.plano_conta_id
    where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and p.escopo_negocio='pecuaria' and p.bloco_dre is not null
      and l.data_competencia between v_ini and v_fim
      and ((p.bloco_dre in ('venda','receita') and l.tipo_operacao='1-Entradas') or (p.bloco_dre not in ('venda','receita') and l.tipo_operacao='2-Saídas'))
    group by 1,2
  ),
  p0 as (select fazenda_id, categoria, quantidade q, peso_medio_kg pm, preco_kg pk from valor_rebanho_fechamento_itens where cliente_id=p_cliente and ano_mes=v_p0),
  p1 as (select fazenda_id, categoria, quantidade q, peso_medio_kg pm, preco_kg pk from valor_rebanho_fechamento_itens where cliente_id=p_cliente and ano_mes=p_ate),
  pat as (
    select k.fazenda_id,
      round(sum(coalesce(p0.q*p0.pm*p0.pk,0)),2) v_ini_p0,
      round(sum(coalesce(p1.q*p1.pm,0)*coalesce(p0.pk,p1.pk)),2) v_fim_p0,
      round(sum(coalesce(p1.q*p1.pm*p1.pk,0)),2) v_fim_p1,
      sum(coalesce(p0.q,0)) cab_ini, sum(coalesce(p1.q,0)) cab_fim,
      bool_or(p0.categoria is not null) tem_p0, bool_or(p1.categoria is not null) tem_p1
    from (select fazenda_id, categoria from p0 union select fazenda_id, categoria from p1) k
    left join p0 on p0.fazenda_id=k.fazenda_id and p0.categoria=k.categoria
    left join p1 on p1.fazenda_id=k.fazenda_id and p1.categoria=k.categoria
    group by 1
  ),
  adm as (
    select coalesce(sum(a.total*coalesce(r.percentual,0)/100.0),0) pool, coalesce(sum(a.total),0) bruto
    from (select extract(year from l.data_competencia)::int ano, sum(l.valor) total from financeiro_lancamentos_v2 l
          where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas'
            and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências','Tributos')
            and l.data_competencia between v_ini and v_fim group by 1) a
    left join agri_rateio_admin r on r.cliente_id=p_cliente and r.ano=a.ano and r.atividade='pecuaria'
  ),
  finc as (
    select l.fazenda_id, p.bloco_dre bloco, coalesce(p.centro_custo,'(sem)') centro, sum(l.valor) valor, sum(case when l.status_transacao<>'realizado' then l.valor else 0 end) a_pagar
    from financeiro_lancamentos_v2 l join financeiro_plano_contas p on p.id=l.plano_conta_id
    where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and p.escopo_negocio='pecuaria' and p.bloco_dre is not null
      and l.data_competencia between v_ini and v_fim
      and ((p.bloco_dre in ('venda','receita') and l.tipo_operacao='1-Entradas') or (p.bloco_dre not in ('venda','receita') and l.tipo_operacao='2-Saídas'))
    group by 1,2,3
  ),
  base as (
    select f.id fazenda_id, f.nome,
      coalesce(pt.v_ini_p0,0) v_ini_p0, coalesce(pt.v_fim_p0,0) v_fim_p0, coalesce(pt.v_fim_p1,0) v_fim_p1,
      coalesce(pt.cab_ini,0) cab_ini, coalesce(pt.cab_fim,0) cab_fim, coalesce(pt.tem_p0,false) tem_p0, coalesce(pt.tem_p1,false) tem_p1,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='venda'),0) vendas,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='receita'),0) outras_receitas,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='deducao'),0) deducoes,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='reposicao'),0) reposicao,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='variavel'),0) custo_variavel,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='fixo'),0) custo_fixo,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='juros'),0) juros,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='investimento'),0) investimento,
      coalesce((select sum(a_pagar) from fin where fin.fazenda_id=f.id and bloco in ('deducao','reposicao','variavel','fixo','juros')),0) a_pagar
    from faz f left join pat pt on pt.fazenda_id=f.id
  ),
  calc as (
    select b.*,
      (select pool from adm) pool_adm, (select bruto from adm) adm_bruto,
      case when (select sum(cab_fim) from base)>0 then round((select pool from adm) * b.cab_fim / (select sum(cab_fim) from base),2) else 0 end rateio_adm,
      case when b.tem_p0 and b.tem_p1 then b.v_fim_p0 - b.v_ini_p0 else null end vpb_operacional,
      case when b.tem_p0 and b.tem_p1 then b.v_fim_p1 - b.v_fim_p0 else null end efeito_mercado
    from base b
  ),
  linhas as (
    select c.*, vendas+outras_receitas receita_bruta, vendas+outras_receitas-deducoes receita_liquida,
      vendas+outras_receitas-deducoes+coalesce(vpb_operacional,0)-reposicao vbp,
      vendas+outras_receitas-deducoes+coalesce(vpb_operacional,0)-reposicao-custo_variavel margem,
      vendas+outras_receitas-deducoes+coalesce(vpb_operacional,0)-reposicao-custo_variavel-custo_fixo-rateio_adm resultado_operacional,
      vendas+outras_receitas-deducoes+coalesce(vpb_operacional,0)-reposicao-custo_variavel-custo_fixo-rateio_adm-juros resultado_periodo,
      vendas+outras_receitas-deducoes+coalesce(vpb_operacional,0)-reposicao-custo_variavel-custo_fixo-rateio_adm-juros+coalesce(efeito_mercado,0) resultado_com_mercado
    from calc c
  ),
  js as (
    select fazenda_id, nome, jsonb_build_object(
      'vendas',vendas,'outras_receitas',outras_receitas,'receita_bruta',receita_bruta,'deducoes',deducoes,'receita_liquida',receita_liquida,
      'vpb_operacional',vpb_operacional,'reposicao',reposicao,'vbp',vbp,'custo_variavel',custo_variavel,'margem',margem,
      'custo_fixo',custo_fixo,'rateio_adm',rateio_adm,'resultado_operacional',resultado_operacional,'juros',juros,'resultado_periodo',resultado_periodo,
      'efeito_mercado',efeito_mercado,'resultado_com_mercado',resultado_com_mercado,'investimento',investimento,'a_pagar',a_pagar,
      'patrimonio',jsonb_build_object('v_ini_p0',v_ini_p0,'v_fim_p0',v_fim_p0,'v_fim_p1',v_fim_p1,'cab_ini',cab_ini,'cab_fim',cab_fim),
      'sem_p0',not tem_p0,'sem_p1',not tem_p1,
      'centros', coalesce((select jsonb_agg(jsonb_build_object('bloco',bloco,'centro',centro,'valor',valor,'a_pagar',a_pagar) order by bloco, centro) from finc where finc.fazenda_id=linhas.fazenda_id),'[]'::jsonb)) l
    from linhas
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('de',p_de,'ate',p_ate,'p0',v_p0,'meses',(extract(year from age(v_fim+1,v_ini))*12+extract(month from age(v_fim+1,v_ini)))::int),
    'rateio_adm', jsonb_build_object('pool',(select pool from adm),'bruto',(select bruto from adm),'criterio','cabecas no fim do periodo'),
    'fazendas', coalesce((select jsonb_agg(jsonb_build_object('fazenda_id',fazenda_id,'nome',nome,'linhas',l) order by nome) from js),'[]'::jsonb),
    'total', (select jsonb_build_object(
      'vendas',sum(vendas),'outras_receitas',sum(outras_receitas),'receita_bruta',sum(receita_bruta),'deducoes',sum(deducoes),'receita_liquida',sum(receita_liquida),
      'vpb_operacional',sum(vpb_operacional),'reposicao',sum(reposicao),'vbp',sum(vbp),'custo_variavel',sum(custo_variavel),'margem',sum(margem),
      'custo_fixo',sum(custo_fixo),'rateio_adm',sum(rateio_adm),'resultado_operacional',sum(resultado_operacional),'juros',sum(juros),'resultado_periodo',sum(resultado_periodo),
      'efeito_mercado',sum(efeito_mercado),'resultado_com_mercado',sum(resultado_com_mercado),'investimento',sum(investimento),'a_pagar',sum(a_pagar),
      'patrimonio',jsonb_build_object('v_ini_p0',sum(v_ini_p0),'v_fim_p0',sum(v_fim_p0),'v_fim_p1',sum(v_fim_p1),'cab_ini',sum(cab_ini),'cab_fim',sum(cab_fim)),
      'centros', coalesce((select jsonb_agg(jsonb_build_object('bloco',bloco,'centro',centro,'valor',valor,'a_pagar',a_pagar) order by bloco, centro) from (select bloco, centro, sum(valor) valor, sum(a_pagar) a_pagar from finc group by 1,2) t),'[]'::jsonb))
      from linhas)
  ) into v_res;
  return v_res;
end $function$;

revoke all on function public.fn_dre_pecuaria(uuid, text, text) from public;
grant execute on function public.fn_dre_pecuaria(uuid, text, text) to authenticated;

create or replace function public.fn_dre_pecuaria_lancamentos(p_cliente uuid, p_fazenda uuid, p_bloco text, p_centro text, p_de text, p_ate text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
with per as (select to_date(p_de||'-01','YYYY-MM-DD') v_ini, (to_date(p_ate||'-01','YYYY-MM-DD') + interval '1 month' - interval '1 day')::date v_fim)
select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'data', l.data_competencia, 'descricao', l.descricao, 'favorecido', coalesce(f.nome_favorecido, f.nome, '-'),
  'valor', l.valor, 'status', l.status_transacao, 'fazenda', fz.nome, 'fazenda_id', l.fazenda_id, 'centro', p.centro_custo, 'subcentro', p.subcentro, 'bloco', p.bloco_dre, 'documento', l.documento) order by l.data_competencia, l.descricao), '[]'::jsonb)
from financeiro_lancamentos_v2 l join per on true
join financeiro_plano_contas p on p.id=l.plano_conta_id
left join financeiro_fornecedores f on f.id=l.favorecido_id
left join fazendas fz on fz.id=l.fazenda_id
where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and p.escopo_negocio='pecuaria' and p.bloco_dre is not null
  and l.data_competencia between per.v_ini and per.v_fim
  and ((p.bloco_dre in ('venda','receita') and l.tipo_operacao='1-Entradas') or (p.bloco_dre not in ('venda','receita') and l.tipo_operacao='2-Saídas'))
  and (p_fazenda is null or l.fazenda_id=p_fazenda)
  and (p_bloco is null or p.bloco_dre=p_bloco)
  and (p_centro is null or coalesce(p.centro_custo,'(sem)')=p_centro)
$function$;

revoke all on function public.fn_dre_pecuaria_lancamentos(uuid, uuid, text, text, text, text) from public;
grant execute on function public.fn_dre_pecuaria_lancamentos(uuid, uuid, text, text, text, text) to authenticated;

create or replace function public.fn_dre_pecuaria_patrimonio(p_cliente uuid, p_fazenda uuid, p_de text, p_ate text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
with per as (select to_char(to_date(p_de||'-01','YYYY-MM-DD') - interval '1 month','YYYY-MM') p0, p_ate p1),
p0 as (select categoria, sum(quantidade) q, case when sum(quantidade)>0 then sum(quantidade*peso_medio_kg)/sum(quantidade) end pm, case when sum(quantidade*peso_medio_kg)>0 then sum(quantidade*peso_medio_kg*preco_kg)/sum(quantidade*peso_medio_kg) end pk
      from valor_rebanho_fechamento_itens i join per on true where i.cliente_id=p_cliente and i.ano_mes=per.p0 and (p_fazenda is null or i.fazenda_id=p_fazenda) group by 1),
p1 as (select categoria, sum(quantidade) q, case when sum(quantidade)>0 then sum(quantidade*peso_medio_kg)/sum(quantidade) end pm, case when sum(quantidade*peso_medio_kg)>0 then sum(quantidade*peso_medio_kg*preco_kg)/sum(quantidade*peso_medio_kg) end pk
      from valor_rebanho_fechamento_itens i join per on true where i.cliente_id=p_cliente and i.ano_mes=per.p1 and (p_fazenda is null or i.fazenda_id=p_fazenda) group by 1),
k as (select categoria from p0 union select categoria from p1),
c as (
  select k.categoria, coalesce(p0.q,0) q0, round(p0.pm,2) pm0, round(p0.pk,4) pk0, round(coalesce(p0.q*p0.pm*p0.pk,0),2) v0,
         coalesce(p1.q,0) q1, round(p1.pm,2) pm1, round(p1.pk,4) pk1,
         round(coalesce(p1.q*p1.pm,0)*coalesce(p0.pk,p1.pk),2) v1_p0, round(coalesce(p1.q*p1.pm*p1.pk,0),2) v1_p1
  from k left join p0 on p0.categoria=k.categoria left join p1 on p1.categoria=k.categoria)
select jsonb_build_object('p0', (select p0 from per), 'p1', (select p1 from per),
  'categorias', coalesce((select jsonb_agg(jsonb_build_object('categoria',categoria,'q0',q0,'pm0',pm0,'pk0',pk0,'v0',v0,'q1',q1,'pm1',pm1,'pk1',pk1,'v1_p0',v1_p0,'v1_p1',v1_p1,'vpb',v1_p0-v0,'efeito',v1_p1-v1_p0) order by categoria) from c),'[]'::jsonb),
  'total', (select jsonb_build_object('q0',sum(q0),'v0',sum(v0),'q1',sum(q1),'v1_p0',sum(v1_p0),'v1_p1',sum(v1_p1),'vpb',sum(v1_p0-v0),'efeito',sum(v1_p1-v1_p0)) from c))
$function$;

revoke all on function public.fn_dre_pecuaria_patrimonio(uuid, uuid, text, text) from public;
grant execute on function public.fn_dre_pecuaria_patrimonio(uuid, uuid, text, text) to authenticated;

