-- VPB-INICIO-01 — o rebanho de partida entra no P0 da estreia
-- Aplicado no proto em 23/09/2026 (ledger: dre_pecuaria_p0_estreia). Registro histórico.
--
-- POR QUE ESTA MIGRATION EXISTE
-- `fn_dre_pecuaria` lê o P0 no fechamento do mês ANTERIOR ao início do período. Na ESTREIA de uma
-- fazenda esse mês não existe — e as 11 fazendas de pecuária do proto estreiam assim. O resultado
-- era `vpb_operacional` nulo, e o que é pior: a cascata somava o nulo como ZERO
-- (`coalesce(vpb_operacional,0)` nas linhas do CTE `linhas`), então o Lucro líquido de 2020 saía
-- calculado com VPB zero, sem nenhum aviso na tela.
--
-- O QUE MUDA
-- 1. P0 DA ESTREIA (CTEs `estreia`, `p0f`, `p0e`). Quando não há fechamento em `v_p0` E o mês de
--    início é o PRIMEIRO fechamento daquela fazenda, o P0 passa a vir do rebanho de partida:
--    quantidade e peso de `zoot_mensal_cache` (`saldo_inicial`, `peso_medio_inicial`) e preço do
--    PRÓPRIO primeiro fechamento (`valor_rebanho_fechamento_itens.preco_kg`) — não de
--    `valor_rebanho_mensal`, que começa só em 2021 em 5 das 11 fazendas.
--    ⚠ O JOIN É POR `categoria_codigo`, NUNCA POR NOME: o cache diz "Vacas" e o fechamento diz
--      "vacas". Por nome o join devolve ZERO pares e a regra morre calada.
--    ⚠ VALE SÓ PARA A ESTREIA. Buraco no meio do histórico (fazenda com fechamento antes e sem
--      fechamento em `v_p0`) continua sendo traço — é ausência de verdade, não começo de série.
--    ⚠ CONSEQUÊNCIA ACEITA: no primeiro mês o efeito de mercado é zero, porque P0 e P1 usam o
--      mesmo preço. Do segundo mês em diante segue normal.
--    ⚠ VACAS DE DESCARTE: o estoque inicial não as separa; as vacas iniciais são valoradas a preço
--      de "vacas". Decisão do Gabriel, 23/09 — não se rateia por proporção.
--    ⚠ LINHA-FANTASMA DO FECHAMENTO: `garrotes` (Baia Grande) e `touros` (Ursa Maior) existem no
--      fechamento e não no cache, com quantidade 0 em toda a série. Contribuem 0, sem tratamento.
-- 2. AUSÊNCIA PROPAGA — caminho 3, decisão do Gabriel de 23/09 13:42. Em `realizado`, um
--    `vpb_operacional` nulo (falta de P0 OU de P1) propaga para vbp, margem, resultado_operacional,
--    resultado_periodo, resultado_com_mercado e lucro_liquido; `efeito_mercado` nulo propaga para os
--    dois últimos. No total, a linha é nula se QUALQUER fazenda somada for nula.
--    ⚠ META FICA COMO ESTÁ. Em `meta` o `efeito_mercado` é nulo POR DESENHO e o P0 vem de
--      `valor_rebanho_meta_validada`; propagar ali apagaria números que a tela mostra hoje (a meta
--      25/26 da Pureza perderia R$ 9.078.824,11 de VBP). Mantém-se o `coalesce` até o DRE-META-3b.
--    ⚠ DUAS EXCEÇÕES NOMEADAS à prova de não-regressão, esperadas e aprovadas: em 23/24 a
--      Faz. Sta. Luzia (NJ) e a Faz. Bom Retiro (Santa Rita) não têm a ponta FINAL do período, e
--      passam de número para traço. O número de hoje é calculado com VPB zero — ausência é traço,
--      zero é valor. Os outros 10 casos da prova são idênticos, meta inclusive.
-- 3. `p0_origem` ('fechamento' | 'estoque_inicial' | null) por fazenda, `sem_p0` derivado dele
--    (true só quando não há fonte nenhuma) e `p0_origem_estreia` no total.
-- 4. `fn_dre_pecuaria_patrimonio` recebe a MESMA regra 1, e isso não é zelo: ela usa o mesmo P0 e
--    faz `coalesce(p0.q,0)`. Sem a regra, ao `sem_p0` virar false o guard do front sairia de cena e
--    o modal passaria a mostrar o valor INTEIRO do rebanho como "variação por produção" — medido
--    em R$ 20.731.498,27 para o NJ em 2020.
--
-- PROVA (BEGIN … ROLLBACK antes de aplicar)
--   1. Não-regressão: 12 casos (NJ, Santa Rita, Agnaldo; safras 21/22 a 25/26 e anos civis),
--      JSON idêntico em 10 — as 2 exceções acima são as únicas diferenças.
--   2. Estreia NJ 2020: as 3 fazendas com p0_origem='estoque_inicial'. Total VPB 581.664,86,
--      VBP 10.585.849,77, Lucro líquido 8.827.163,51.
--   3. Vera, ano civil 2024 (início ≠ primeiro fechamento): traço em VPB e em toda a cascata.
--   4. Meta NJ e Santa Rita 25/26: JSON idêntico ao de hoje.
--   5. Patrimônio na estreia = grade, por fazenda, diferença 0,00 nas três.
--
-- ⚠ DÍVIDA REGISTRADA — PATRIMONIO-TOTAL-01, PRÉ-EXISTENTE, FORA DESTE PR.
-- `fn_dre_pecuaria_patrimonio` com `p_fazenda = null` agrega por categoria somando as fazendas e usa
-- um preço médio ponderado do conjunto; a grade soma o VPB de cada fazenda com o preço DAQUELA
-- fazenda. As duas contas divergem quando os preços por fazenda diferem — medido no HEAD, antes
-- desta migration: NJ 21/22 R$ 15.477,01 e Santa Rita 2025 R$ 11.794,20 (NJ 2025 dá 0,00). A grade é
-- a fonte soberana; o modal total deve passar a somar por fazenda.
--
-- ⚠ O CORPO ABAIXO É O QUE ESTÁ NO BANCO, e isso é medido, não afirmado:
--   md5(prosrc) fn_dre_pecuaria            = b2541b8862bf9ec7f4f32b12eb05d285
--   md5(prosrc) fn_dre_pecuaria_patrimonio = 7367df8fddc2dfdedbb2ba7758184ad8
-- A aplicação montou os corpos a partir do prosrc vigente e abortaria se o md5 divergisse.

CREATE OR REPLACE FUNCTION public.fn_dre_pecuaria(p_cliente uuid, p_de text, p_ate text, p_cenario text DEFAULT 'realizado'::text)
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
    union all
    select null::uuid as id, c.fazenda_id, make_date(y.ano, c.mes, 1) comp, c.valor valor, p.subcentro,
           p.bloco_dre, p.centro_custo, p.escopo_negocio, p.tipo_operacao, p.macro_custo
    from generate_series(extract(year from v_ini)::int, extract(year from v_fim)::int) as y(ano)
    cross join lateral public.fn_meta_calculada_pecuaria(p_cliente, y.ano) c
    join financeiro_plano_contas p on p.ordem_exibicao=c.ordem and p.escopo_negocio='pecuaria'
         and p.cliente_id is null and p.ativo
    where p_cenario='meta' and make_date(y.ano, c.mes, 1) between v_ini and v_fim
  ),
  faz as (
    select f.id, f.nome from fazendas f where f.cliente_id=p_cliente
      and (exists(select 1 from valor_rebanho_fechamento_itens i where i.fazenda_id=f.id and i.ano_mes between v_p0 and p_ate)
        or exists(select 1 from financeiro_lancamentos_v2 l join financeiro_plano_contas p on p.id=l.plano_conta_id where l.fazenda_id=f.id and coalesce(l.cancelado,false)=false and p.escopo_negocio='pecuaria' and p.bloco_dre is not null and p.bloco_dre<>'juros' and l.cenario=p_cenario and l.data_competencia between v_ini and v_fim and not (p_cenario='meta' and l.origem_lancamento='movimentacao_rebanho' and p.bloco_dre in ('venda','reposicao')))
        or exists(select 1 from plm where plm.fazenda_id=f.id and plm.escopo_negocio='pecuaria' and plm.bloco_dre is not null and plm.bloco_dre<>'juros'))
  ),
  fin as (
    select fazenda_id, bloco, sum(valor) valor, sum(a_pagar) a_pagar from (
    select l.fazenda_id, p.bloco_dre bloco, l.valor, case when l.status_transacao<>'realizado' then l.valor else 0 end a_pagar
    from financeiro_lancamentos_v2 l join financeiro_plano_contas p on p.id=l.plano_conta_id
    where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario and p.escopo_negocio='pecuaria' and p.bloco_dre is not null
      and l.data_competencia between v_ini and v_fim
      and not (p_cenario='meta' and l.origem_lancamento='movimentacao_rebanho' and p.bloco_dre in ('venda','reposicao'))
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
  jurl as (
    select l.fazenda_id, l.valor
    from financeiro_lancamentos_v2 l join financeiro_plano_contas p on p.id=l.plano_conta_id
    where l.cliente_id=p_cliente and coalesce(l.cancelado,false)=false and l.cenario=p_cenario and p.escopo_negocio='pecuaria' and p.bloco_dre='juros'
      and l.data_competencia between v_ini and v_fim and l.tipo_operacao='2-Saídas'
    union all
    select fazenda_id, valor from plm
    where escopo_negocio='pecuaria' and bloco_dre='juros' and tipo_operacao='2-Saídas'
  ),
  jurf as (select fazenda_id, coalesce(sum(valor),0) valor from jurl where fazenda_id in (select id from faz) group by 1),
  jurx as (select coalesce(sum(valor),0) valor from jurl where fazenda_id is null or fazenda_id not in (select id from faz)),
  cabm as (
    select fazenda_id,
      round(sum(case when ano_mes in (v_p0, p_ate) then q/2.0 else q end)
            / (extract(year from age(v_fim+1,v_ini))*12+extract(month from age(v_fim+1,v_ini))),0) cab_media
    from (select fazenda_id, ano_mes, sum(saldo_final) q from zoot_mensal_cache where cliente_id=p_cliente and cenario=p_cenario and ano_mes between v_p0 and p_ate group by 1,2) m
    group by 1
  ),
  estreia as (select fazenda_id from valor_rebanho_fechamento_itens where cliente_id=p_cliente group by fazenda_id having min(ano_mes)=p_de),
  p0f as (select fazenda_id, categoria, quantidade q, peso_medio_kg pm, preco_kg pk, 'fechamento'::text origem from valor_rebanho_fechamento_itens where cliente_id=p_cliente and ano_mes=v_p0 and p_cenario='realizado'),
  p0e as (select z.fazenda_id, pr.categoria, z.saldo_inicial q, z.peso_medio_inicial pm, pr.preco_kg pk, 'estoque_inicial'::text origem
          from zoot_mensal_cache z join estreia e on e.fazenda_id=z.fazenda_id
          join valor_rebanho_fechamento_itens pr on pr.cliente_id=p_cliente and pr.fazenda_id=z.fazenda_id and pr.ano_mes=p_de and pr.categoria=z.categoria_codigo
          where z.cliente_id=p_cliente and z.ano_mes=p_de and z.cenario='realizado' and p_cenario='realizado'
            and not exists (select 1 from p0f where p0f.fazenda_id=z.fazenda_id)),
  p0 as (select * from p0f union all select * from p0e),
  p1 as (select fazenda_id, categoria, quantidade q, peso_medio_kg pm, preco_kg pk from valor_rebanho_fechamento_itens where cliente_id=p_cliente and ano_mes=p_ate and p_cenario='realizado'),
  pat as (
    select k.fazenda_id,
      round(sum(coalesce(p0.q*p0.pm*p0.pk,0)),2) v_ini_p0,
      round(sum(coalesce(p1.q*p1.pm,0)*coalesce(p0.pk,p1.pk)),2) v_fim_p0,
      round(sum(coalesce(p1.q*p1.pm*p1.pk,0)),2) v_fim_p1,
      sum(coalesce(p0.q,0)) cab_ini, sum(coalesce(p1.q,0)) cab_fim,
      bool_or(p0.categoria is not null) tem_p0, bool_or(p1.categoria is not null) tem_p1, max(p0.origem) p0_origem
    from (select fazenda_id, categoria from p0 union select fazenda_id, categoria from p1) k
    left join p0 on p0.fazenda_id=k.fazenda_id and p0.categoria=k.categoria
    left join p1 on p1.fazenda_id=k.fazenda_id and p1.categoria=k.categoria
    group by 1
  ),
  patm as (
    select f.id fazenda_id,
      round((case when extract(month from v_ini)=1
        then (select sum(r.valor_total) from valor_rebanho_realizado_validado r
              where r.cliente_id=p_cliente and r.fazenda_id=f.id and r.ano_mes=v_p0 and r.status='validado')
        else (select sum(m.valor_total) from valor_rebanho_meta_validada m
              where m.cliente_id=p_cliente and m.fazenda_id=f.id and m.ano_mes=v_p0) end)::numeric, 2) v_ini,
      round((select sum(m.valor_total) from valor_rebanho_meta_validada m
             where m.cliente_id=p_cliente and m.fazenda_id=f.id and m.ano_mes=p_ate)::numeric, 2) v_fim
    from faz f where p_cenario<>'realizado'
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
    select fazenda_id, round(sum(producao_biologica)/30.0,2) at
    from zoot_mensal_cache
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
      and not (p_cenario='meta' and l.origem_lancamento='movimentacao_rebanho' and p.bloco_dre in ('venda','reposicao'))
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
      case when p_cenario='realizado' then coalesce(pt.v_ini_p0,0) else coalesce(pm.v_ini,0) end v_ini_p0,
      case when p_cenario='realizado' then coalesce(pt.v_fim_p0,0) end v_fim_p0,
      case when p_cenario='realizado' then coalesce(pt.v_fim_p1,0) else coalesce(pm.v_fim,0) end v_fim_p1,
      coalesce(pt.cab_ini,0) cab_ini, coalesce(pt.cab_fim,0) cab_fim, coalesce(cm.cab_media,0) cab_media,
      case when p_cenario='realizado' then coalesce(pt.tem_p0,false) else pm.v_ini is not null end tem_p0,
      case when p_cenario='realizado' then coalesce(pt.tem_p1,false) else pm.v_fim is not null end tem_p1,
      case when p_cenario='realizado' then pt.p0_origem when pm.v_ini is not null then 'fechamento'::text end p0_origem,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='venda'),0) vendas,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='receita'),0) outras_receitas,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='deducao'),0) deducoes,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='reposicao'),0) reposicao,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='variavel'),0) custo_variavel,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='fixo'),0) custo_fixo,
      coalesce((select valor from jurf where jurf.fazenda_id=f.id),0) juros_proprio,
      coalesce((select valor from fin where fin.fazenda_id=f.id and bloco='investimento'),0) investimento,
      coalesce((select sum(a_pagar) from fin where fin.fazenda_id=f.id and bloco in ('deducao','reposicao','variavel','fixo')),0) a_pagar,
      case when p_cenario='realizado' then ar.ha else am.ha end ha_medio,
      pr.at at_produzida, mz.at_desf at_desfrutada, mz.cab_desf cab_desfrutada, mz.at_comp at_comprada, mz.cab_comp cab_comprada
    from faz f left join pat pt on pt.fazenda_id=f.id left join cabm cm on cm.fazenda_id=f.id
      left join patm pm on pm.fazenda_id=f.id
      left join arear ar on ar.fazenda_id=f.id left join aream am on am.fazenda_id=f.id
      left join prod pr on pr.fazenda_id=f.id left join movz mz on mz.fazenda_id=f.id
  ),
  calc as (
    select b.*,
      (select pool from adm) pool_adm, (select bruto from adm) adm_bruto,
      case when (select sum(cab_media) from base)>0 then round((select pool from adm) * b.cab_media / (select sum(cab_media) from base),2) else 0 end rateio_adm,
      case when (select sum(cab_media) from base)>0 then round((select valor from jurx) * b.cab_media / (select sum(cab_media) from base),2) else 0 end juros_rateado_bruto,
      case when (select sum(cab_media) from base)>0 and b.fazenda_id=(select fazenda_id from base order by cab_media desc, fazenda_id limit 1)
        then round((select valor from jurx),2) - coalesce((select sum(round((select valor from jurx) * b2.cab_media / (select sum(cab_media) from base),2)) from base b2),0)
        else 0 end juros_sobra,
      case when b.tem_p0 and b.tem_p1 then
        (case when p_cenario='realizado' then b.v_fim_p0 - b.v_ini_p0 else b.v_fim_p1 - b.v_ini_p0 end) else null end vpb_operacional,
      case when b.tem_p0 and b.tem_p1 and p_cenario='realizado' then b.v_fim_p1 - b.v_fim_p0 else null end efeito_mercado
    from base b
  ),
  jcalc as (
    select c.*, c.juros_rateado_bruto + c.juros_sobra juros_rateado,
      c.juros_proprio + c.juros_rateado_bruto + c.juros_sobra juros
    from calc c
  ),
  -- ausencia e traco, zero e valor: em realizado o VPB nulo (falta de P0 OU de P1) propaga para toda
  -- a cascata; meta mantem coalesce ate o DRE-META-3b construir o VPB meta.
  linhas as (
    select c.*, vendas+outras_receitas receita_bruta, vendas+outras_receitas-deducoes receita_liquida,
      vendas+outras_receitas-deducoes+(case when p_cenario='realizado' then vpb_operacional else coalesce(vpb_operacional,0) end)-reposicao vbp,
      vendas+outras_receitas-deducoes+(case when p_cenario='realizado' then vpb_operacional else coalesce(vpb_operacional,0) end)-reposicao-custo_variavel margem,
      vendas+outras_receitas-deducoes+(case when p_cenario='realizado' then vpb_operacional else coalesce(vpb_operacional,0) end)-reposicao-custo_variavel-custo_fixo-rateio_adm resultado_operacional,
      vendas+outras_receitas-deducoes+(case when p_cenario='realizado' then vpb_operacional else coalesce(vpb_operacional,0) end)-reposicao-custo_variavel-custo_fixo-rateio_adm-juros resultado_periodo,
      vendas+outras_receitas-deducoes+(case when p_cenario='realizado' then vpb_operacional else coalesce(vpb_operacional,0) end)-reposicao-custo_variavel-custo_fixo-rateio_adm-juros+(case when p_cenario='realizado' then efeito_mercado else coalesce(efeito_mercado,0) end) resultado_com_mercado,
      vendas+outras_receitas-deducoes+(case when p_cenario='realizado' then vpb_operacional else coalesce(vpb_operacional,0) end)-reposicao-custo_variavel-custo_fixo-rateio_adm-juros+(case when p_cenario='realizado' then efeito_mercado else coalesce(efeito_mercado,0) end)-coalesce(investimento,0) lucro_liquido
    from jcalc c
  ),
  js as (
    select fazenda_id, nome, jsonb_build_object(
      'vendas',vendas,'outras_receitas',outras_receitas,'receita_bruta',receita_bruta,'deducoes',deducoes,'receita_liquida',receita_liquida,
      'vpb_operacional',vpb_operacional,'reposicao',reposicao,'vbp',vbp,'custo_variavel',custo_variavel,'margem',margem,
      'custo_fixo',custo_fixo,'rateio_adm',rateio_adm,'resultado_operacional',resultado_operacional,'juros',juros,'resultado_periodo',resultado_periodo,
      'efeito_mercado',efeito_mercado,'resultado_com_mercado',resultado_com_mercado,'investimento',investimento,'lucro_liquido',lucro_liquido,'juros_proprio',juros_proprio,'juros_rateado',juros_rateado,'a_pagar',a_pagar,
      'patrimonio',jsonb_build_object('v_ini_p0',v_ini_p0,'v_fim_p0',v_fim_p0,'v_fim_p1',v_fim_p1,'cab_ini',cab_ini,'cab_fim',cab_fim,'cab_media',cab_media)
        || case when p_cenario<>'realizado' then jsonb_build_object('criterio','variacao total (PC-100)') else '{}'::jsonb end,
      'sem_p0',p0_origem is null,'sem_p1',not tem_p1,'p0_origem',p0_origem,
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
      'vpb_operacional',case when bool_or(vpb_operacional is null) then null else sum(vpb_operacional) end,'reposicao',sum(reposicao),'vbp',case when bool_or(vbp is null) then null else sum(vbp) end,'custo_variavel',sum(custo_variavel),'margem',case when bool_or(margem is null) then null else sum(margem) end,
      'custo_fixo',sum(custo_fixo),'rateio_adm',sum(rateio_adm),'resultado_operacional',case when bool_or(resultado_operacional is null) then null else sum(resultado_operacional) end,'juros',sum(juros),'resultado_periodo',case when bool_or(resultado_periodo is null) then null else sum(resultado_periodo) end,
      'efeito_mercado',case when bool_or(efeito_mercado is null) then null else sum(efeito_mercado) end,'resultado_com_mercado',case when bool_or(resultado_com_mercado is null) then null else sum(resultado_com_mercado) end,'investimento',sum(investimento),'lucro_liquido',case when bool_or(lucro_liquido is null) then null else sum(lucro_liquido) end,'juros_proprio',sum(juros_proprio),'juros_rateado',sum(juros_rateado),'juros_nao_rateado',(case when (select sum(cab_media) from base)>0 then 0 else (select valor from jurx) end),'a_pagar',sum(a_pagar)+(select a_pagar from jur),
      'patrimonio',jsonb_build_object('v_ini_p0',sum(v_ini_p0),'v_fim_p0',sum(v_fim_p0),'v_fim_p1',sum(v_fim_p1),'cab_ini',sum(cab_ini),'cab_fim',sum(cab_fim),'cab_media',sum(cab_media))
        || case when p_cenario<>'realizado' then jsonb_build_object('criterio','variacao total (PC-100)') else '{}'::jsonb end,
      'producao',jsonb_build_object('ha_medio',sum(ha_medio),'at_produzida',sum(at_produzida),'at_desfrutada',sum(at_desfrutada),
        'cab_desfrutada',sum(cab_desfrutada),'at_comprada',sum(at_comprada),'cab_comprada',sum(cab_comprada)),
      'p0_origem_estreia', bool_or(p0_origem='estoque_inicial'),
      'centros', coalesce((select jsonb_agg(jsonb_build_object('bloco',bloco,'centro',centro,'valor',valor,'a_pagar',a_pagar) order by bloco, centro) from (select bloco, centro, sum(valor) valor, sum(a_pagar) a_pagar from finc group by 1,2 union all select bloco, centro, valor, a_pagar from jurc) t),'[]'::jsonb),
      'centros_juros', coalesce((select jsonb_agg(jsonb_build_object('bloco',bloco,'centro',centro,'valor',valor,'a_pagar',a_pagar) order by bloco, centro) from jurc),'[]'::jsonb))
      from linhas)
  ) into v_res;
  return v_res;
end $function$;

REVOKE ALL ON FUNCTION public.fn_dre_pecuaria(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_dre_pecuaria(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_dre_pecuaria_patrimonio(p_cliente uuid, p_fazenda uuid, p_de text, p_ate text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
with per as (select to_char(to_date(p_de||'-01','YYYY-MM-DD') - interval '1 month','YYYY-MM') p0, left(p_ate,7) p1),
estreia as (select fazenda_id from valor_rebanho_fechamento_itens
      where cliente_id=p_cliente and (p_fazenda is null or fazenda_id=p_fazenda)
      group by fazenda_id having min(ano_mes)=left(p_de,7)),
p0f as (select i.fazenda_id, i.categoria, i.quantidade, i.peso_medio_kg, i.preco_kg, 'fechamento'::text origem
      from valor_rebanho_fechamento_itens i join per on true
      where i.cliente_id=p_cliente and i.ano_mes=per.p0 and (p_fazenda is null or i.fazenda_id=p_fazenda)),
p0e as (select z.fazenda_id, pr.categoria, z.saldo_inicial, z.peso_medio_inicial, pr.preco_kg, 'estoque_inicial'::text origem
      from zoot_mensal_cache z join estreia e on e.fazenda_id=z.fazenda_id
      join valor_rebanho_fechamento_itens pr on pr.cliente_id=p_cliente and pr.fazenda_id=z.fazenda_id and pr.ano_mes=left(p_de,7) and pr.categoria=z.categoria_codigo
      where z.cliente_id=p_cliente and z.ano_mes=left(p_de,7) and z.cenario='realizado'
        and not exists (select 1 from p0f where p0f.fazenda_id=z.fazenda_id)),
p0u as (select * from p0f union all select * from p0e),
p0 as (select categoria, sum(quantidade) q, case when sum(quantidade)>0 then sum(quantidade*peso_medio_kg)/sum(quantidade) end pm, case when sum(quantidade*peso_medio_kg)>0 then sum(quantidade*peso_medio_kg*preco_kg)/sum(quantidade*peso_medio_kg) end pk
      from p0u group by 1),
p1 as (select categoria, sum(quantidade) q, case when sum(quantidade)>0 then sum(quantidade*peso_medio_kg)/sum(quantidade) end pm, case when sum(quantidade*peso_medio_kg)>0 then sum(quantidade*peso_medio_kg*preco_kg)/sum(quantidade*peso_medio_kg) end pk
      from valor_rebanho_fechamento_itens i join per on true where i.cliente_id=p_cliente and i.ano_mes=per.p1 and (p_fazenda is null or i.fazenda_id=p_fazenda) group by 1),
k as (select categoria from p0 union select categoria from p1),
c as (
  select k.categoria, coalesce(p0.q,0) q0, round(p0.pm,2) pm0, round(p0.pk,4) pk0, round(coalesce(p0.q*p0.pm*p0.pk,0),2) v0,
         coalesce(p1.q,0) q1, round(p1.pm,2) pm1, round(p1.pk,4) pk1,
         round(coalesce(p1.q*p1.pm,0)*coalesce(p0.pk,p1.pk),2) v1_p0, round(coalesce(p1.q*p1.pm*p1.pk,0),2) v1_p1
  from k left join p0 on p0.categoria=k.categoria left join p1 on p1.categoria=k.categoria)
select jsonb_build_object('p0', (select p0 from per), 'p1', (select p1 from per),
  'p0_origem', (select max(origem) from p0u),
  'categorias', coalesce((select jsonb_agg(jsonb_build_object('categoria',categoria,'q0',q0,'pm0',pm0,'pk0',pk0,'v0',v0,'q1',q1,'pm1',pm1,'pk1',pk1,'v1_p0',v1_p0,'v1_p1',v1_p1,'vpb',v1_p0-v0,'efeito',v1_p1-v1_p0) order by categoria) from c),'[]'::jsonb),
  'total', (select jsonb_build_object('q0',sum(q0),'v0',sum(v0),'q1',sum(q1),'v1_p0',sum(v1_p0),'v1_p1',sum(v1_p1),'vpb',sum(v1_p0-v0),'efeito',sum(v1_p1-v1_p0)) from c))
$function$;

REVOKE ALL ON FUNCTION public.fn_dre_pecuaria_patrimonio(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_dre_pecuaria_patrimonio(uuid, uuid, text, text) TO authenticated;
