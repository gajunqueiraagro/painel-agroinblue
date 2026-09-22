-- DRE-PEC-RPC-03b (22/09/2026) - a META do DRE da pecuaria le os custos do planejamento_financeiro
--
-- Corpos de partida: pg_get_functiondef do banco proto, conferidos por md5 do prosrc antes de editar
-- (fn_dre_pecuaria 445e071171e9c041c6b191a040c8015a - a 20261027130400; fn_dre_pecuaria_lancamentos
-- bd5120e2e37ff6fd3885b85fed69a412 - a 20261027130200). Assinaturas iguais: CREATE OR REPLACE.
--
-- DEFEITO (homologacao do Gabriel, Agnaldo x Meta): a coluna Meta tinha vendas, deducao e reposicao, e
-- custo variavel, fixo, investimento e juros ZERADOS. A meta mora em DUAS fontes: os lancamentos
-- cenario='meta' (vendas e reposicao) e o planejamento_financeiro cenario='meta' (os custos, por
-- fazenda/ano/mes/subcentro TEXTO, sem plano_conta_id). A RPC so lia a primeira.
--
-- MUDANCA, SO NA META (no realizado a CTE plm e vazia - `p_cenario='meta'` no where - e nada muda):
--   plm = planejamento_financeiro cenario='meta' no periodo (competencia = make_date(ano, mes, 1)),
--         casado ao plano por subcentro + escopo_negocio + (plano global ou do cliente) + ativo.
--         Medido em 22/09: o casamento da exatamente 1 plano para todo subcentro pecuario de todos os
--         clientes, menos os 196 de Dividendos (fora do DRE). valor = valor_planejado, a_pagar = 0.
--   faz, fin, finc, jurc e adm passam a ser a UNIAO das duas fontes. O sentido (entrada/saida) do
--   planejamento vem do tipo_operacao do plano, com a mesma regra dos lancamentos.
--   adm: medido em 22/09, o planejamento administrativo de todos os clientes e so ENTRADA (receitas e
--   aporte); o pool de meta nao muda hoje, e a uniao fica certa para quando houver custo planejado.
--   Sobreposicao entre as fontes (mesma fazenda + subcentro + mes): medida ZERO em 22/09.
--   ⚠ ACHADO DE DADO, nao regra da RPC: o planejamento traz custo fixo PECUARIO na fazenda
--   Administrativo - salarios, contabilidade, aluguel e viagens de escritorio, o mesmo legado que o
--   NJ-LEGADO-ADM tirou do realizado. Jan-ago/26: Agnaldo 312.160,00; NJ 1.141.781,36 (os Dividendos
--   ja ficam fora: nao casam com plano). Na meta ele vira coluna Administrativo e entra no custo fixo,
--   enquanto no realizado o mesmo gasto ja e administrativo (21xxx) e vai para o pool.
--
--   fn_dre_pecuaria_lancamentos, na meta, devolve tambem as linhas do planejamento: id = pf.id,
--   data = make_date(ano, mes, 1), descricao = subcentro, favorecido/status/documento null, e
--   'origem' = 'planejamento' (so nelas). ⚠ PARA A TELA: linha de origem 'planejamento' NAO e
--   lancamento e nao abre "Editar Lancamento".

CREATE OR REPLACE FUNCTION public.fn_dre_pecuaria(p_cliente uuid, p_de text, p_ate text, p_cenario text DEFAULT 'realizado')
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_ini date; v_fim date; v_p0 text; v_res jsonb;
begin
  v_ini := to_date(p_de||'-01','YYYY-MM-DD');
  v_fim := (to_date(p_ate||'-01','YYYY-MM-DD') + interval '1 month' - interval '1 day')::date;
  v_p0 := to_char(v_ini - interval '1 month','YYYY-MM');
  with plm as (
    select pf.id, pf.fazenda_id, make_date(pf.ano, pf.mes, 1) comp, pf.valor_planejado valor, pf.subcentro,
           p.bloco_dre, p.centro_custo, p.escopo_negocio, p.tipo_operacao, p.macro_custo
    from planejamento_financeiro pf
    join financeiro_plano_contas p on p.subcentro=pf.subcentro and p.escopo_negocio=pf.escopo_negocio
         and (p.cliente_id is null or p.cliente_id=pf.cliente_id) and p.ativo
    where p_cenario='meta' and pf.cenario='meta' and pf.cliente_id=p_cliente
      and make_date(pf.ano, pf.mes, 1) between v_ini and v_fim
  ),
  faz as (
    select f.id, f.nome from fazendas f where f.cliente_id=p_cliente
      and (exists(select 1 from valor_rebanho_fechamento_itens i where i.fazenda_id=f.id and i.ano_mes between v_p0 and p_ate)
        or exists(select 1 from financeiro_lancamentos_v2 l join financeiro_plano_contas p on p.id=l.plano_conta_id where l.fazenda_id=f.id and coalesce(l.cancelado,false)=false and p.escopo_negocio='pecuaria' and p.bloco_dre is not null and p.bloco_dre<>'juros' and l.cenario=p_cenario and l.data_competencia between v_ini and v_fim)
        or exists(select 1 from plm where plm.fazenda_id=f.id and plm.escopo_negocio='pecuaria' and plm.bloco_dre is not null and plm.bloco_dre<>'juros'))
  ),
  fin as (
    select fazenda_id, bloco, sum(valor) valor, sum(a_pagar) a_pagar from (
    select l.fazenda_id, p.bloco_dre bloco, l.valor, case when l.status_transacao<>'realizado' then l.valor else 0 end a_pagar
    from financeiro_lancamentos_v2 l join financeiro_plano_contas p on p.id=l.plano_conta_id
    where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario and p.escopo_negocio='pecuaria' and p.bloco_dre is not null
      and l.data_competencia between v_ini and v_fim
      and ((p.bloco_dre in ('venda','receita') and l.tipo_operacao='1-Entradas') or (p.bloco_dre not in ('venda','receita') and l.tipo_operacao='2-Saídas'))
    union all
    select fazenda_id, bloco_dre, valor, 0 from plm
    where escopo_negocio='pecuaria' and bloco_dre is not null and ((bloco_dre in ('venda','receita') and tipo_operacao='1-Entradas') or (bloco_dre not in ('venda','receita') and tipo_operacao='2-Saídas'))
    ) u
    group by 1,2
  ),
  jurc as (
    select bloco, centro, sum(valor) valor, sum(a_pagar) a_pagar from (
    select p.bloco_dre bloco, coalesce(p.centro_custo,'(sem)') centro, l.valor, case when l.status_transacao<>'realizado' then l.valor else 0 end a_pagar
    from financeiro_lancamentos_v2 l join financeiro_plano_contas p on p.id=l.plano_conta_id
    where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario and p.escopo_negocio='pecuaria' and p.bloco_dre='juros'
      and l.data_competencia between v_ini and v_fim and l.tipo_operacao='2-Saídas'
    union all
    select bloco_dre, coalesce(centro_custo,'(sem)'), valor, 0 from plm
    where escopo_negocio='pecuaria' and bloco_dre='juros' and tipo_operacao='2-Saídas'
    ) u
    group by 1,2
  ),
  jur as (select coalesce(sum(valor),0) valor, coalesce(sum(a_pagar),0) a_pagar from jurc),
  cabm as (
    select fazenda_id,
      round(sum(case when ano_mes in (v_p0, p_ate) then q/2.0 else q end)
            / (extract(year from age(v_fim+1,v_ini))*12+extract(month from age(v_fim+1,v_ini))),0) cab_media
    from (select fazenda_id, ano_mes, sum(quantidade) q from valor_rebanho_fechamento_itens where cliente_id=p_cliente and ano_mes between v_p0 and p_ate group by 1,2) m
    group by 1
  ),
  p0 as (select fazenda_id, categoria, quantidade q, peso_medio_kg pm, preco_kg pk from valor_rebanho_fechamento_itens where cliente_id=p_cliente and ano_mes=v_p0 and p_cenario='realizado'),
  p1 as (select fazenda_id, categoria, quantidade q, peso_medio_kg pm, preco_kg pk from valor_rebanho_fechamento_itens where cliente_id=p_cliente and ano_mes=p_ate and p_cenario='realizado'),
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
    from (select ano, sum(valor) total from (
          select extract(year from l.data_competencia)::int ano, l.valor from financeiro_lancamentos_v2 l
          where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas'
            and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências','Tributos')
            and l.data_competencia between v_ini and v_fim
          union all
          select extract(year from comp)::int, valor from plm
          where escopo_negocio='administrativo' and tipo_operacao='2-Saídas'
            and macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências','Tributos')
          ) u group by 1) a
    left join agri_rateio_admin r on r.cliente_id=p_cliente and r.ano=a.ano and r.atividade='pecuaria'
  ),
  areap as (
    select fp.fazenda_id, fp.ano_mes, sum(pa.area_produtiva_ha) a
    from fechamento_pastos fp join pastos pa on pa.id=fp.pasto_id
    where fp.cliente_id=p_cliente and fp.ano_mes between p_de and p_ate and pa.area_produtiva_ha > 0
      and coalesce(fp.tipo_uso_mes, pa.tipo_uso) in ('cria','recria','engorda','vedado','reforma_pecuaria')
    group by 1,2
  ),
  arear as (
    select s.fazenda_id, round(avg(x.a) filter (where x.a > 0),1) ha
    from fechamento_area_snapshot s
    left join areap ap on ap.fazenda_id=s.fazenda_id and ap.ano_mes=to_char(s.ano_mes,'YYYY-MM')
    cross join lateral (select coalesce(ap.a, nullif(s.area_pecuaria_ha,0), 0) a) x
    where s.cliente_id=p_cliente and s.ano_mes between v_ini and v_fim
    group by 1
  ),
  aream as (
    select fazenda_id, round(avg(area_pecuaria_ha) filter (where area_pecuaria_ha > 0),1) ha
    from planejamento_area_meta
    where cliente_id=p_cliente and make_date(ano, mes, 1) between v_ini and v_fim
    group by 1
  ),
  prod as (
    select fazenda_id, round(sum(gmd_numerador_kg)/30.0,2) at
    from vw_zoot_fazenda_mensal
    where cliente_id=p_cliente and cenario='realizado' and p_cenario='realizado' and ano_mes between p_de and p_ate
    group by 1
  ),
  movz as (
    select l.fazenda_id,
      round(sum(case when l.tipo='abate' then l.quantidade*coalesce(l.peso_carcaca_kg,0)/15.0
                     else l.quantidade*coalesce(l.peso_medio_kg,0)*0.5/15.0 end)
            filter (where l.tipo in ('abate','venda','venda_pe','consumo')),2) at_desf,
      sum(l.quantidade) filter (where l.tipo in ('abate','venda','venda_pe','consumo')) cab_desf,
      round(sum(l.quantidade*coalesce(l.peso_medio_kg,0)/30.0) filter (where l.tipo='compra'),2) at_comp,
      sum(l.quantidade) filter (where l.tipo='compra') cab_comp
    from lancamentos l
    where l.cliente_id=p_cliente and l.cenario=p_cenario and coalesce(l.cancelado,false)=false
      and l.data between v_ini and v_fim and l.tipo in ('abate','venda','venda_pe','consumo','compra')
    group by 1
  ),
  finc as (
    select fazenda_id, bloco, centro, sum(valor) valor, sum(a_pagar) a_pagar from (
    select l.fazenda_id, p.bloco_dre bloco, coalesce(p.centro_custo,'(sem)') centro, l.valor, case when l.status_transacao<>'realizado' then l.valor else 0 end a_pagar
    from financeiro_lancamentos_v2 l join financeiro_plano_contas p on p.id=l.plano_conta_id
    where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario and p.escopo_negocio='pecuaria' and p.bloco_dre is not null
      and l.data_competencia between v_ini and v_fim
      and ((p.bloco_dre in ('venda','receita') and l.tipo_operacao='1-Entradas') or (p.bloco_dre not in ('venda','receita') and l.tipo_operacao='2-Saídas'))
      and p.bloco_dre<>'juros'
    union all
    select fazenda_id, bloco_dre, coalesce(centro_custo,'(sem)'), valor, 0 from plm
    where escopo_negocio='pecuaria' and bloco_dre is not null and bloco_dre<>'juros' and ((bloco_dre in ('venda','receita') and tipo_operacao='1-Entradas') or (bloco_dre not in ('venda','receita') and tipo_operacao='2-Saídas'))
    ) u
    group by 1,2,3
  ),
  base as (
    select f.id fazenda_id, f.nome,
      coalesce(pt.v_ini_p0,0) v_ini_p0, coalesce(pt.v_fim_p0,0) v_fim_p0, coalesce(pt.v_fim_p1,0) v_fim_p1,
      coalesce(pt.cab_ini,0) cab_ini, coalesce(pt.cab_fim,0) cab_fim, coalesce(cm.cab_media,0) cab_media, coalesce(pt.tem_p0,false) tem_p0, coalesce(pt.tem_p1,false) tem_p1,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='venda'),0) vendas,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='receita'),0) outras_receitas,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='deducao'),0) deducoes,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='reposicao'),0) reposicao,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='variavel'),0) custo_variavel,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='fixo'),0) custo_fixo,
      null::numeric juros,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='investimento'),0) investimento,
      coalesce((select sum(a_pagar) from fin where fin.fazenda_id=f.id and bloco in ('deducao','reposicao','variavel','fixo')),0) a_pagar,
      case when p_cenario='realizado' then ar.ha else am.ha end ha_medio,
      pr.at at_produzida, mz.at_desf at_desfrutada, mz.cab_desf cab_desfrutada, mz.at_comp at_comprada, mz.cab_comp cab_comprada
    from faz f left join pat pt on pt.fazenda_id=f.id left join cabm cm on cm.fazenda_id=f.id
      left join arear ar on ar.fazenda_id=f.id left join aream am on am.fazenda_id=f.id
      left join prod pr on pr.fazenda_id=f.id left join movz mz on mz.fazenda_id=f.id
  ),
  calc as (
    select b.*,
      (select pool from adm) pool_adm, (select bruto from adm) adm_bruto,
      case when (select sum(cab_media) from base)>0 then round((select pool from adm) * b.cab_media / (select sum(cab_media) from base),2) else 0 end rateio_adm,
      case when b.tem_p0 and b.tem_p1 then b.v_fim_p0 - b.v_ini_p0 else null end vpb_operacional,
      case when b.tem_p0 and b.tem_p1 then b.v_fim_p1 - b.v_fim_p0 else null end efeito_mercado
    from base b
  ),
  linhas as (
    select c.*, vendas+outras_receitas receita_bruta, vendas+outras_receitas-deducoes receita_liquida,
      vendas+outras_receitas-deducoes+coalesce(vpb_operacional,0)-reposicao vbp,
      vendas+outras_receitas-deducoes+coalesce(vpb_operacional,0)-reposicao-custo_variavel margem,
      vendas+outras_receitas-deducoes+coalesce(vpb_operacional,0)-reposicao-custo_variavel-custo_fixo-rateio_adm resultado_operacional,
      vendas+outras_receitas-deducoes+coalesce(vpb_operacional,0)-reposicao-custo_variavel-custo_fixo-rateio_adm resultado_periodo,
      vendas+outras_receitas-deducoes+coalesce(vpb_operacional,0)-reposicao-custo_variavel-custo_fixo-rateio_adm+coalesce(efeito_mercado,0) resultado_com_mercado
    from calc c
  ),
  js as (
    select fazenda_id, nome, jsonb_build_object(
      'vendas',vendas,'outras_receitas',outras_receitas,'receita_bruta',receita_bruta,'deducoes',deducoes,'receita_liquida',receita_liquida,
      'vpb_operacional',vpb_operacional,'reposicao',reposicao,'vbp',vbp,'custo_variavel',custo_variavel,'margem',margem,
      'custo_fixo',custo_fixo,'rateio_adm',rateio_adm,'resultado_operacional',resultado_operacional,'juros',juros,'resultado_periodo',resultado_periodo,
      'efeito_mercado',efeito_mercado,'resultado_com_mercado',resultado_com_mercado,'investimento',investimento,'a_pagar',a_pagar,
      'patrimonio',jsonb_build_object('v_ini_p0',v_ini_p0,'v_fim_p0',v_fim_p0,'v_fim_p1',v_fim_p1,'cab_ini',cab_ini,'cab_fim',cab_fim,'cab_media',cab_media),
      'sem_p0',not tem_p0,'sem_p1',not tem_p1,
      'producao',jsonb_build_object('ha_medio',ha_medio,'at_produzida',at_produzida,'at_desfrutada',at_desfrutada,
        'cab_desfrutada',cab_desfrutada,'at_comprada',at_comprada,'cab_comprada',cab_comprada),
      'centros', coalesce((select jsonb_agg(jsonb_build_object('bloco',bloco,'centro',centro,'valor',valor,'a_pagar',a_pagar) order by bloco, centro) from finc where finc.fazenda_id=linhas.fazenda_id),'[]'::jsonb)) l
    from linhas
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('de',p_de,'ate',p_ate,'p0',v_p0,'meses',(extract(year from age(v_fim+1,v_ini))*12+extract(month from age(v_fim+1,v_ini)))::int),
    'rateio_adm', jsonb_build_object('pool',(select pool from adm),'bruto',(select bruto from adm),'criterio','cabecas medias no periodo'),
    'fazendas', coalesce((select jsonb_agg(jsonb_build_object('fazenda_id',fazenda_id,'nome',nome,'linhas',l) order by nome) from js),'[]'::jsonb),
    'total', (select jsonb_build_object(
      'vendas',sum(vendas),'outras_receitas',sum(outras_receitas),'receita_bruta',sum(receita_bruta),'deducoes',sum(deducoes),'receita_liquida',sum(receita_liquida),
      'vpb_operacional',sum(vpb_operacional),'reposicao',sum(reposicao),'vbp',sum(vbp),'custo_variavel',sum(custo_variavel),'margem',sum(margem),
      'custo_fixo',sum(custo_fixo),'rateio_adm',sum(rateio_adm),'resultado_operacional',sum(resultado_operacional),'juros',(select valor from jur),'resultado_periodo',sum(resultado_periodo)-(select valor from jur),
      'efeito_mercado',sum(efeito_mercado),'resultado_com_mercado',sum(resultado_com_mercado)-(select valor from jur),'investimento',sum(investimento),'a_pagar',sum(a_pagar)+(select a_pagar from jur),
      'patrimonio',jsonb_build_object('v_ini_p0',sum(v_ini_p0),'v_fim_p0',sum(v_fim_p0),'v_fim_p1',sum(v_fim_p1),'cab_ini',sum(cab_ini),'cab_fim',sum(cab_fim),'cab_media',sum(cab_media)),
      'producao',jsonb_build_object('ha_medio',sum(ha_medio),'at_produzida',sum(at_produzida),'at_desfrutada',sum(at_desfrutada),
        'cab_desfrutada',sum(cab_desfrutada),'at_comprada',sum(at_comprada),'cab_comprada',sum(cab_comprada)),
      'centros', coalesce((select jsonb_agg(jsonb_build_object('bloco',bloco,'centro',centro,'valor',valor,'a_pagar',a_pagar) order by bloco, centro) from (select bloco, centro, sum(valor) valor, sum(a_pagar) a_pagar from finc group by 1,2 union all select bloco, centro, valor, a_pagar from jurc) t),'[]'::jsonb),
      'centros_juros', coalesce((select jsonb_agg(jsonb_build_object('bloco',bloco,'centro',centro,'valor',valor,'a_pagar',a_pagar) order by bloco, centro) from jurc),'[]'::jsonb))
      from linhas)
  ) into v_res;
  return v_res;
end $function$;

CREATE OR REPLACE FUNCTION public.fn_dre_pecuaria_lancamentos(p_cliente uuid, p_fazenda uuid, p_bloco text, p_centro text, p_de text, p_ate text, p_cenario text DEFAULT 'realizado')
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
with per as (select to_date(p_de||'-01','YYYY-MM-DD') v_ini, (to_date(p_ate||'-01','YYYY-MM-DD') + interval '1 month' - interval '1 day')::date v_fim),
ln as (
select jsonb_build_object('id', l.id, 'data', l.data_competencia, 'descricao', l.descricao, 'favorecido', coalesce(f.nome_favorecido, f.nome, '-'),
  'valor', l.valor, 'status', l.status_transacao, 'fazenda', fz.nome, 'fazenda_id', l.fazenda_id, 'centro', p.centro_custo, 'subcentro', p.subcentro, 'bloco', p.bloco_dre, 'documento', l.documento) j,
  l.data_competencia d, l.descricao s
from financeiro_lancamentos_v2 l join per on true
join financeiro_plano_contas p on p.id=l.plano_conta_id
left join financeiro_fornecedores f on f.id=l.favorecido_id
left join fazendas fz on fz.id=l.fazenda_id
where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario and p.escopo_negocio='pecuaria' and p.bloco_dre is not null
  and l.data_competencia between per.v_ini and per.v_fim
  and ((p.bloco_dre in ('venda','receita') and l.tipo_operacao='1-Entradas') or (p.bloco_dre not in ('venda','receita') and l.tipo_operacao='2-Saídas'))
  and (p_fazenda is null or l.fazenda_id=p_fazenda)
  and (p_bloco is null or p.bloco_dre=p_bloco)
  and (p_centro is null or coalesce(p.centro_custo,'(sem)')=p_centro)
),
pl as (
select jsonb_build_object('id', pf.id, 'data', make_date(pf.ano, pf.mes, 1), 'descricao', pf.subcentro, 'favorecido', null,
  'valor', pf.valor_planejado, 'status', null, 'fazenda', fz.nome, 'fazenda_id', pf.fazenda_id, 'centro', p.centro_custo, 'subcentro', p.subcentro, 'bloco', p.bloco_dre, 'documento', null,
  'origem', 'planejamento') j,
  make_date(pf.ano, pf.mes, 1) d, pf.subcentro s
from planejamento_financeiro pf join per on true
join financeiro_plano_contas p on p.subcentro=pf.subcentro and p.escopo_negocio=pf.escopo_negocio
     and (p.cliente_id is null or p.cliente_id=pf.cliente_id) and p.ativo
left join fazendas fz on fz.id=pf.fazenda_id
where p_cenario='meta' and pf.cenario='meta' and pf.cliente_id=p_cliente and p.escopo_negocio='pecuaria' and p.bloco_dre is not null
  and make_date(pf.ano, pf.mes, 1) between per.v_ini and per.v_fim
  and ((p.bloco_dre in ('venda','receita') and p.tipo_operacao='1-Entradas') or (p.bloco_dre not in ('venda','receita') and p.tipo_operacao='2-Saídas'))
  and (p_fazenda is null or pf.fazenda_id=p_fazenda)
  and (p_bloco is null or p.bloco_dre=p_bloco)
  and (p_centro is null or coalesce(p.centro_custo,'(sem)')=p_centro)
)
select coalesce(jsonb_agg(j order by d, s), '[]'::jsonb) from (select j, d, s from ln union all select j, d, s from pl) u
$function$;
