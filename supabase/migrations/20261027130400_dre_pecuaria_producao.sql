-- DRE-PEC-RPC-03 (22/09/2026) - fn_dre_pecuaria: bloco producao (ha, arrobas) e meta sem patrimonio
--
-- Corpo de partida: pg_get_functiondef do banco proto, conferido por md5 do prosrc antes de editar
-- (744bde28eb9366ba81134a945e01e94b - o corpo da 20261027130300). Assinatura igual: CREATE OR REPLACE.
-- No cenario 'realizado' nenhuma chave existente muda; entram so chaves novas (producao.*).
--
-- 1. BLOCO `producao`, por fazenda e no total (soma das fazendas), no periodo p_de..p_ate. "0" e valor;
--    sem linha nenhuma, null. Arrobas a 2 casas, hectare a 1. As formulas sao as do PC-100:
--    - at_produzida = sum(gmd_numerador_kg)/30 de vw_zoot_fazenda_mensal, so no realizado (a view em
--      'meta' traz gmd 0 de projecao). O PC-100 usa producao_biologica/30
--      (buildMonthlyDataFromView.ts:258), conferida identica a gmd_numerador_kg
--      (useProdutivoPorFazenda.ts:37-41).
--    - at_desfrutada = abate pela CARCACA (peso_carcaca_kg e POR CABECA: x quantidade /15) + venda,
--      venda_pe e consumo por peso vivo x 50% /15 (= vivo/30, calcArrobas em economicos.ts:37-55; os
--      tipos sao os de TIPOS_DESFRUTE_GLOBAL, economicos.ts:214 - venda_pe nao existe no banco hoje).
--      cab_desfrutada = cabecas desses tipos.
--    - at_comprada = compra por peso vivo /30; cab_comprada = cabecas.
--    - ha_medio no REALIZADO = a area do PC-100 (usePainelConsultorData.ts:951 -> useFechamentoArea.ts
--      :154-160, :243-272): por fazenda e mes do snapshot (fechamento_area_snapshot), soma de
--      pastos.area_produtiva_ha dos fechamento_pastos cujo tipo efetivo coalesce(tipo_uso_mes, tipo_uso)
--      e pecuario (cria, recria, engorda, vedado, reforma_pecuaria - isOperacionalPecuaria); sem pasto
--      pecuario no mes, o area_pecuaria_ha do snapshot. Media dos meses com area > 0
--      (mediaIgnorandoZero, eficienciaArea.ts:58).
--      ⚠ `area_produtiva_ha` DA VIEW vw_zoot_fazenda_mensal NAO E PASTO UTIL: inclui APP, reserva,
--      benfeitorias e divergencia. Medido NJ jan-ago/26: view 4.726,0 ha na Pureza contra 3.476,5 do
--      PC-100; Sto. Expedito 1.791,9 contra 1.347,8. Usar a view faria o R$/ha do DRE divergir do @/ha
--      do PC-100 em ~36% na Pureza.
--    - ha_medio na META = planejamento_area_meta.area_pecuaria_ha (a fonte do useAreaPlanejamento, que
--      o PC-100 usa na meta), media dos meses > 0.
--
-- 2. META SEM PATRIMONIO. Com p_cenario <> 'realizado', p0 e p1 ficam vazios: tem_p0/tem_p1 false,
--    vpb_operacional e efeito_mercado null, e vbp/margem/resultados sao so financeiros (a cascata ja
--    usa coalesce(vpb,0)). Antes a meta carregava a VPB do REALIZADO dentro do VBP e da margem - o
--    patrimonio nao tem cenario. cab_media continua: rebanho e fato, e e o denominador da meta.

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
  with faz as (
    select f.id, f.nome from fazendas f where f.cliente_id=p_cliente
      and (exists(select 1 from valor_rebanho_fechamento_itens i where i.fazenda_id=f.id and i.ano_mes between v_p0 and p_ate)
        or exists(select 1 from financeiro_lancamentos_v2 l join financeiro_plano_contas p on p.id=l.plano_conta_id where l.fazenda_id=f.id and coalesce(l.cancelado,false)=false and p.escopo_negocio='pecuaria' and p.bloco_dre is not null and p.bloco_dre<>'juros' and l.cenario=p_cenario and l.data_competencia between v_ini and v_fim))
  ),
  fin as (
    select l.fazenda_id, p.bloco_dre bloco, sum(l.valor) valor, sum(case when l.status_transacao<>'realizado' then l.valor else 0 end) a_pagar
    from financeiro_lancamentos_v2 l join financeiro_plano_contas p on p.id=l.plano_conta_id
    where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario and p.escopo_negocio='pecuaria' and p.bloco_dre is not null
      and l.data_competencia between v_ini and v_fim
      and ((p.bloco_dre in ('venda','receita') and l.tipo_operacao='1-Entradas') or (p.bloco_dre not in ('venda','receita') and l.tipo_operacao='2-Saídas'))
    group by 1,2
  ),
  jurc as (
    select p.bloco_dre bloco, coalesce(p.centro_custo,'(sem)') centro, sum(l.valor) valor, sum(case when l.status_transacao<>'realizado' then l.valor else 0 end) a_pagar
    from financeiro_lancamentos_v2 l join financeiro_plano_contas p on p.id=l.plano_conta_id
    where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario and p.escopo_negocio='pecuaria' and p.bloco_dre='juros'
      and l.data_competencia between v_ini and v_fim and l.tipo_operacao='2-Saídas'
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
    from (select extract(year from l.data_competencia)::int ano, sum(l.valor) total from financeiro_lancamentos_v2 l
          where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario and l.escopo_negocio='administrativo' and l.tipo_operacao='2-Saídas'
            and l.macro_custo not in ('Dividendos','Investimento na Fazenda','Saída Financeira','Transferências','Tributos')
            and l.data_competencia between v_ini and v_fim group by 1) a
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
    select l.fazenda_id, p.bloco_dre bloco, coalesce(p.centro_custo,'(sem)') centro, sum(l.valor) valor, sum(case when l.status_transacao<>'realizado' then l.valor else 0 end) a_pagar
    from financeiro_lancamentos_v2 l join financeiro_plano_contas p on p.id=l.plano_conta_id
    where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario and p.escopo_negocio='pecuaria' and p.bloco_dre is not null
      and l.data_competencia between v_ini and v_fim
      and ((p.bloco_dre in ('venda','receita') and l.tipo_operacao='1-Entradas') or (p.bloco_dre not in ('venda','receita') and l.tipo_operacao='2-Saídas'))
      and p.bloco_dre<>'juros'
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
