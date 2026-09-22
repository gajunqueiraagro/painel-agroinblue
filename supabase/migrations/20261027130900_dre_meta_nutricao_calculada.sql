-- DRE-META-NUTRICAO-03a (22/09/2026): a META do DRE pecuario passa a ter nutricao, comercial e frete.
--
-- ⚠ O DEFEITO: o maior custo variavel da pecuaria NUNCA esteve na meta do DRE. A meta le
--   `planejamento_financeiro`, e a nutricao da meta nunca foi gravada la': ela e' CALCULADA no
--   front (usePlanejamentoFinanceiro.ts, `calcNutricaoFazenda`) a partir de
--   `meta_parametros_nutricao` x rebanho meta (`zoot_mensal_cache`) x abates meta
--   (`lancamentos`). Medido em 22/09: zero linha de Nutricao em `planejamento_financeiro` meta,
--   de cliente NENHUM — a nutricao da meta no DRE era exatamente 0. Na NJ/2026 faltavam
--   R$ 3.920.235,00 no ano.
--
-- ⚠ A REGRA VEM DO TS, FIEL, e as tres fases se calculam como la':
--     cria   = saldo_final de 'vacas' x cria_custo_cab_mes, por mes;
--     recria = (novilhas + garrotes + desmama_m + desmama_f) x recria_custo_cab_mes;
--     engorda= por abate meta, |quantidade| x (dias x kg_ms x R$/kg) / 4, lancado em CADA UM dos
--              4 meses ANTERIORES ao mes do abate.
--   ⚠ E A ENGORDA NAO CRUZA O ANO, de proposito: no TS o mes fora de 1..12 e' descartado, entao
--     um abate em fevereiro so' lanca 1/4 (em janeiro) e os outros 3/4 somem, e abates de
--     jan-abr do ano seguinte nao geram custo em set-dez deste. Reproduzir isso e' o que faz o
--     numero BATER com a tela; "consertar" aqui criaria duas verdades.
--   ⚠ ARREDONDAMENTO conferido no TS: cria/recria/engorda/frete em 2 casas
--     (Math.round(x*100)/100) e comercial em INTEIRO (Math.round(x)).
--   ⚠ FAZENDA ADMINISTRATIVA FICA DE FORA (f.nome !~* 'admin'), que e' o criterio do front no
--     consolidado. Nao ha' flag no banco: `tem_pecuaria=false` tambem pegaria Retiro Agricultura
--     e Faz. Bom Retiro, e `status_operacional='inativa'` erra o Administrativo do Teste Cliente.
--
-- ⚠ TRES LINHAS, NAO UMA. O mesmo calculo do front produz tambem o comercial
--   (abate+venda x comercial_custo_cab -> 5030, bloco `deducao`) e o frete
--   (transferencia_entrada x frete_custo_cab -> 8140, bloco `variavel`), e nenhum dos tres
--   estava na meta do DRE.
--   ⚠ ATENCAO NA 5030: a meta JA' TEM deducao nesse subcentro vinda de
--     `financeiro_lancamentos_v2` com `origem_lancamento='movimentacao_rebanho'` (NJ R$ 882,82,
--     Agnaldo R$ 73.207,17, Raul R$ 9.300,00, Vera R$ 5.923,55). A tela de Planejamento NAO le'
--     essas linhas. Somar o comercial calculado po'e duas estimativas do mesmo custo na mesma
--     conta — decisao do Gabriel, registrada aqui para quem for ler o numero depois.
--
-- ⚠ LINHA COM VALOR ZERO NAO SAI, de proposito: a CTE `faz` escolhe as fazendas por `exists` no
--   `plm`, e uma fazenda que so' tivesse zero calculado viraria coluna no DRE sem ter conta.
--
-- ⚠ POR QUE DENTRO DO `plm`: ele e' a fonte unica do planejamento na funcao, e alimenta CINCO
--   pontos — `faz` (quais fazendas aparecem), `fin` (blocos por fazenda), `jurc` (juros), `adm`
--   (pool administrativo) e `finc` (os centros do drill). Entrando ali, a linha chega aos cinco
--   sem tocar em formula nenhuma. Unida so' em `fin`, ficaria fora do `faz` e do `finc`.
--
-- ⚠ TRANSITORIO E DECLARADO: ate' o 3b, a regra existe em DOIS lugares (TS e SQL), com o MESMO
--   gabarito — conferido ao centavo contra a tela (NJ 2026, Pureza e consolidado). O 3b faz o
--   front ler desta funcao e a duplicidade acaba.
--
-- CORPOS DE PARTIDA, COPIADOS VERBATIM DO REPO (que reproduz o banco, conferido por md5 antes de
-- editar): `fn_dre_pecuaria` de 20261027130700 (md5 prosrc badbc72403377ff9e244a80badc37e3f) e
-- `fn_dre_pecuaria_lancamentos` de 20261027130500 (md5 833bcfc7d6d26fdb751d980af4727542). O diff
-- e' SO' o ramo novo em cada uma.
--
-- Aplicada no proto em 22/09/2026 (ledger 20260922180623). md5(prosrc) DEPOIS, conferidos
-- contra o banco (banco == arquivo nas tres):
--   fn_meta_calculada_pecuaria    = 725970f3a44f59d36b2f4f94bba134ed
--   fn_dre_pecuaria               = 674958936bec92ae4727c317a0e89945
--   fn_dre_pecuaria_lancamentos   = 21a2cb593a32cc834590e4221cad40bd
--
-- ⚠ COMO FOI APLICADA: as Partes C e D foram executadas no proto por SUBSTITUICAO DE ANCORA
--   sobre o `pg_get_functiondef` do proprio banco (bloco DO com guarda que levanta excecao se a
--   ancora sumir), em vez de colar 17 mil caracteres. ESTE ARQUIVO guarda o corpo INTEIRO, que e'
--   o registro; os md5 acima provam que o banco ficou identico a ele, caractere a caractere.

-- ── PARTE A — backfill do cliente em meta_parametros_nutricao ────────────────────────────────
-- ⚠ SO' ONDE ESTA' NULO. Medido em 22/09: 1 linha (Faz. Pureza 2026, criada em 20/04 e nunca
--   atualizada) e ZERO linhas com cliente divergente do da fazenda. O front nao sofria porque
--   filtra so' por `fazenda_id`; uma funcao que filtre por cliente perderia a maior fazenda da NJ.
update public.meta_parametros_nutricao m
   set cliente_id = f.cliente_id
  from public.fazendas f
 where f.id = m.fazenda_id
   and m.cliente_id is null;

-- ── PARTE B — a regra do front, agora no banco ───────────────────────────────────────────────
create or replace function public.fn_meta_calculada_pecuaria(
  p_cliente uuid,
  p_ano int
)
returns table (fazenda_id uuid, mes int, ordem int, valor numeric)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
with par as (
  select m.fazenda_id,
         coalesce(m.cria_custo_cab_mes, 0)::numeric   as cria,
         coalesce(m.recria_custo_cab_mes, 0)::numeric as recria,
         ( coalesce(m.engorda_periodo_dias, 0)
         * coalesce(m.engorda_consumo_kg_ms, 0)
         * coalesce(m.engorda_custo_kg_ms, 0) )::numeric as ceng,
         coalesce(m.comercial_custo_cab, 0)::numeric  as comercial,
         coalesce(m.frete_custo_cab, 0)::numeric      as frete
    from public.meta_parametros_nutricao m
    join public.fazendas f on f.id = m.fazenda_id
   where f.cliente_id = p_cliente
     and m.ano = p_ano
     and f.nome !~* 'admin'
),
meses as (
  select generate_series(1, 12) as mes
),
reb as (
  select z.fazenda_id, z.mes,
         sum(case when z.categoria_codigo = 'vacas' then z.saldo_final else 0 end)::numeric as vacas,
         sum(case when z.categoria_codigo in ('novilhas','garrotes','desmama_m','desmama_f')
                  then z.saldo_final else 0 end)::numeric as recria_cab
    from public.zoot_mensal_cache z
    join par on par.fazenda_id = z.fazenda_id
   where z.cenario = 'meta'
     and z.ano = p_ano
     and z.categoria_codigo in ('vacas','novilhas','garrotes','desmama_m','desmama_f')
   group by z.fazenda_id, z.mes
),
ev as (
  select l.fazenda_id, l.tipo,
         extract(month from l.data)::int as mes,
         abs(l.quantidade)::numeric      as q
    from public.lancamentos l
    join par on par.fazenda_id = l.fazenda_id
   where l.cliente_id = p_cliente
     and l.cenario = 'meta'
     and l.cancelado = false
     and l.data >= make_date(p_ano, 1, 1)
     and l.data <= make_date(p_ano, 12, 31)
     and l.tipo in ('abate','venda','transferencia_entrada')
),
cria_v as (
  select p.fazenda_id, m.mes, round(coalesce(r.vacas, 0) * p.cria, 2) as v
    from par p
    cross join meses m
    left join reb r on r.fazenda_id = p.fazenda_id and r.mes = m.mes
   where p.cria > 0
),
recria_v as (
  select p.fazenda_id, m.mes, round(coalesce(r.recria_cab, 0) * p.recria, 2) as v
    from par p
    cross join meses m
    left join reb r on r.fazenda_id = p.fazenda_id and r.mes = m.mes
   where p.recria > 0
),
eng_ev as (
  -- cada abate lanca 1/4 do custo em cada um dos 4 meses ANTERIORES,
  -- sem cruzar o ano (mes < 1 e descartado), igual ao TS
  select e.fazenda_id, e.mes - o as mes, e.q
    from ev e
    cross join generate_series(1, 4) as o
   where e.tipo = 'abate'
     and e.mes - o >= 1
),
eng_v as (
  select p.fazenda_id, m.mes,
         round(coalesce(sum(x.q * p.ceng / 4), 0), 2) as v
    from par p
    cross join meses m
    left join eng_ev x on x.fazenda_id = p.fazenda_id and x.mes = m.mes
   where p.ceng > 0
   group by p.fazenda_id, m.mes
),
nut as (
  select fazenda_id, mes, 8045 as ordem, round(sum(v), 2) as valor
    from ( select * from cria_v
           union all select * from recria_v
           union all select * from eng_v ) f
   group by fazenda_id, mes
),
com as (
  select p.fazenda_id, e.mes, 5030 as ordem,
         round(sum(e.q) * p.comercial, 0) as valor
    from ev e
    join par p on p.fazenda_id = e.fazenda_id
   where e.tipo in ('abate','venda')
     and p.comercial > 0
   group by p.fazenda_id, e.mes, p.comercial
),
fre as (
  select p.fazenda_id, e.mes, 8140 as ordem,
         round(sum(e.q) * p.frete, 2) as valor
    from ev e
    join par p on p.fazenda_id = e.fazenda_id
   where e.tipo = 'transferencia_entrada'
     and p.frete > 0
   group by p.fazenda_id, e.mes, p.frete
)
select fazenda_id, mes, ordem, valor from nut where valor <> 0
union all
select fazenda_id, mes, ordem, valor from com where valor <> 0
union all
select fazenda_id, mes, ordem, valor from fre where valor <> 0
$$;

-- ── PARTE C — fn_dre_pecuaria: o ramo calculado entra DENTRO do plm ──────────────────────────
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
    from (select fazenda_id, ano_mes, sum(saldo_final) q from zoot_mensal_cache where cliente_id=p_cliente and cenario=p_cenario and ano_mes between v_p0 and p_ate group by 1,2) m
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
      left join patm pm on pm.fazenda_id=f.id
      left join arear ar on ar.fazenda_id=f.id left join aream am on am.fazenda_id=f.id
      left join prod pr on pr.fazenda_id=f.id left join movz mz on mz.fazenda_id=f.id
  ),
  calc as (
    select b.*,
      (select pool from adm) pool_adm, (select bruto from adm) adm_bruto,
      case when (select sum(cab_media) from base)>0 then round((select pool from adm) * b.cab_media / (select sum(cab_media) from base),2) else 0 end rateio_adm,
      case when b.tem_p0 and b.tem_p1 then
        (case when p_cenario='realizado' then b.v_fim_p0 - b.v_ini_p0 else b.v_fim_p1 - b.v_ini_p0 end) else null end vpb_operacional,
      case when b.tem_p0 and b.tem_p1 and p_cenario='realizado' then b.v_fim_p1 - b.v_fim_p0 else null end efeito_mercado
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
      'patrimonio',jsonb_build_object('v_ini_p0',v_ini_p0,'v_fim_p0',v_fim_p0,'v_fim_p1',v_fim_p1,'cab_ini',cab_ini,'cab_fim',cab_fim,'cab_media',cab_media)
        || case when p_cenario<>'realizado' then jsonb_build_object('criterio','variacao total (PC-100)') else '{}'::jsonb end,
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
      'patrimonio',jsonb_build_object('v_ini_p0',sum(v_ini_p0),'v_fim_p0',sum(v_fim_p0),'v_fim_p1',sum(v_fim_p1),'cab_ini',sum(cab_ini),'cab_fim',sum(cab_fim),'cab_media',sum(cab_media))
        || case when p_cenario<>'realizado' then jsonb_build_object('criterio','variacao total (PC-100)') else '{}'::jsonb end,
      'producao',jsonb_build_object('ha_medio',sum(ha_medio),'at_produzida',sum(at_produzida),'at_desfrutada',sum(at_desfrutada),
        'cab_desfrutada',sum(cab_desfrutada),'at_comprada',sum(at_comprada),'cab_comprada',sum(cab_comprada)),
      'centros', coalesce((select jsonb_agg(jsonb_build_object('bloco',bloco,'centro',centro,'valor',valor,'a_pagar',a_pagar) order by bloco, centro) from (select bloco, centro, sum(valor) valor, sum(a_pagar) a_pagar from finc group by 1,2 union all select bloco, centro, valor, a_pagar from jurc) t),'[]'::jsonb),
      'centros_juros', coalesce((select jsonb_agg(jsonb_build_object('bloco',bloco,'centro',centro,'valor',valor,'a_pagar',a_pagar) order by bloco, centro) from jurc),'[]'::jsonb))
      from linhas)
  ) into v_res;
  return v_res;
end $function$;
-- ── PARTE D — fn_dre_pecuaria_lancamentos: o mesmo ramo no drill, origem 'calculado' ────────
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
),
pc as (
select jsonb_build_object('id', null, 'data', make_date(y.ano, c.mes, 1), 'descricao', p.subcentro || ' (meta calculada)', 'favorecido', null,
  'valor', c.valor, 'status', null, 'fazenda', fz.nome, 'fazenda_id', c.fazenda_id, 'centro', p.centro_custo, 'subcentro', p.subcentro, 'bloco', p.bloco_dre, 'documento', null,
  'origem', 'calculado') j,
  make_date(y.ano, c.mes, 1) d, p.subcentro s
from per
cross join lateral generate_series(extract(year from per.v_ini)::int, extract(year from per.v_fim)::int) as y(ano)
cross join lateral public.fn_meta_calculada_pecuaria(p_cliente, y.ano) c
join financeiro_plano_contas p on p.ordem_exibicao=c.ordem and p.escopo_negocio='pecuaria'
     and p.cliente_id is null and p.ativo
left join fazendas fz on fz.id=c.fazenda_id
where p_cenario='meta' and p.bloco_dre is not null
  and make_date(y.ano, c.mes, 1) between per.v_ini and per.v_fim
  and ((p.bloco_dre in ('venda','receita') and p.tipo_operacao='1-Entradas') or (p.bloco_dre not in ('venda','receita') and p.tipo_operacao='2-Saídas'))
  and (p_fazenda is null or c.fazenda_id=p_fazenda)
  and (p_bloco is null or p.bloco_dre=p_bloco)
  and (p_centro is null or coalesce(p.centro_custo,'(sem)')=p_centro)
)
select coalesce(jsonb_agg(j order by d, s), '[]'::jsonb) from (select j, d, s from ln union all select j, d, s from pl union all select j, d, s from pc) u
$function$;

-- ── ACL — REVOKE/GRANT explicitos nas tres (licao de 21/09: CREATE sem rodape nasce aberta) ──
revoke all on function public.fn_meta_calculada_pecuaria(uuid, int) from public;
revoke all on function public.fn_meta_calculada_pecuaria(uuid, int) from anon;
grant execute on function public.fn_meta_calculada_pecuaria(uuid, int) to authenticated;

revoke all on function public.fn_dre_pecuaria(uuid, text, text, text) from public;
revoke all on function public.fn_dre_pecuaria(uuid, text, text, text) from anon;
grant execute on function public.fn_dre_pecuaria(uuid, text, text, text) to authenticated;

revoke all on function public.fn_dre_pecuaria_lancamentos(uuid, uuid, text, text, text, text, text) from public;
revoke all on function public.fn_dre_pecuaria_lancamentos(uuid, uuid, text, text, text, text, text) from anon;
grant execute on function public.fn_dre_pecuaria_lancamentos(uuid, uuid, text, text, text, text, text) to authenticated;
