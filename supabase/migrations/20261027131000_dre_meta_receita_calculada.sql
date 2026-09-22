-- DRE-META-RECEITA-01 (22/09/2026): a receita e a reposicao da META saem do zootecnico calculado,
-- e o DRE deixa de somar o espelho manual da v2 nesses blocos.
--
-- ⚠ O DEFEITO (medido em 22/09, na tela do Gabriel): DRE meta da NJ jan-ago/2026 mostrava Vendas de
--   R$ 1.530.020,59 enquanto a lista de meta do Planejamento mostrava R$ 8,6 mi no mesmo periodo; a
--   Santa Rita mostrava ZERO. Mesma familia da nutricao: a receita meta nasce CALCULADA no front
--   (usePlanejamentoFinanceiro.ts:265-403) a partir da tabela zootecnica `lancamentos` e nunca e'
--   gravada em `planejamento_financeiro`. O DRE lia so' o que estava gravado (ajuste manual) mais o
--   ESPELHO da v2.
--
-- ⚠ O ESPELHO E' MANUAL, E ESSE E' O PONTO. As linhas meta de `financeiro_lancamentos_v2` com
--   `origem_lancamento='movimentacao_rebanho'` nascem de um CLIQUE no `AbateFinanceiroPanel`
--   (src/components/AbateFinanceiroPanel.tsx:342 e :412), uma a uma, com elo em
--   `movimentacao_rebanho_id`. Medida a cobertura em 2026: Agnaldo 8/8, Raul 5/5, RRCC 2/2 —
--   mas NJ 1 de 29 e Santa Rita 0 de 16. O numero do DRE dependia de alguem ter clicado.
--
-- ⚠ POR ISSO O ESPELHO SAI DE 'venda' E 'reposicao' no cenario meta: ele cobre EXATAMENTE os mesmos
--   eventos que o calculo (mesma descricao, mesmo elo), entao somar os dois dobraria a receita de
--   quem tem o espelho completo. Em 'deducao' ele CONTINUA entrando — decisao do Gabriel, a mesma
--   registrada no 03a. O espelho segue existindo na v2 e na tela do abate; so' deixa de alimentar o
--   DRE nestes dois blocos.
--
-- ⚠ COMPETENCIA, NAO CAIXA, e a divergencia e' declarada: o DRE soma pela `data` do lancamento
--   zootecnico com `valor_total`; a lista de meta do Planejamento soma pela data de RECEBIMENTO
--   (parcelas do `detalhes_snapshot`). Na NJ isso separa R$ 378.839,99 de parcelas que caem em 2027.
--   As parcelas NAO entram aqui, de proposito.
--
-- ⚠ O MAPA E' TRANSCRICAO LITERAL de `mapRebanhoSubcentro` (usePlanejamentoFinanceiro.ts:62-79) para
--   `ordem_exibicao`: abate -> 1020/1010, venda -> 1150 (boitel, testado ANTES das categorias, como
--   no TS) / 1120 / 1110 / 1140 / 1130, compra -> 15020/15010. Tipo ou categoria sem mapa nao entra,
--   igual ao TS. Conferido em 22/09: ZERO lancamentos meta de 2026 ficam sem mapa.
--
-- ⚠ O QUE O CALCULO NAO COBRE, e some do DRE junto com o espelho: 'Investimento Frete/Comissao
--   Compra Bovinos' (bloco reposicao). O espelho do Agnaldo trazia R$ 46.360,00 em 2026 e o TS da
--   receita nao mapeia esse subcentro — a reposicao dele cai de 3.832.360,00 para 3.786.000,00.
--   Fica registrado: e' lacuna do calculo, nao erro de soma.
--
-- CORPOS DE PARTIDA, COPIADOS VERBATIM do 20261027130900 (que reproduz o banco, conferido por md5
-- antes de editar: meta 725970f3, dre 674958936, drill 21a2cb59). O diff e' so' o bloco novo.
--
-- Aplicada no proto em 22/09/2026 (ledger 20260922183000). md5(prosrc) DEPOIS, conferidos contra o
-- banco (banco == arquivo nas tres):
--   fn_meta_calculada_pecuaria    = ae4b2e11f4c8b317bcd530eda449f6b4
--   fn_dre_pecuaria               = ccab3e12f3c7e6f5c8db693a5616f379
--   fn_dre_pecuaria_lancamentos   = a3f9174de22fa0fb649151780243601d
--
-- ⚠ COMO FOI APLICADA: Partes B e C por substituicao de ancora sobre o `pg_get_functiondef` do
--   proprio banco, em bloco DO com guarda que CONTA as ocorrencias (1 no `faz`, 2 em `fin`/`finc`,
--   1 no `ln` do drill) e levanta excecao se o numero nao bater. Este arquivo guarda o corpo inteiro.

-- ── PARTE A — fn_meta_calculada_pecuaria ganha receita (abate/venda) e reposicao (compra) ────────
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
),
rec as (
  -- RECEITA E REPOSICAO DA META — transcricao de mapRebanhoSubcentro
  -- (usePlanejamentoFinanceiro.ts:62-79) para ordem_exibicao do plano.
  -- ⚠ NAO usa `par` (nao depende de parametro de nutricao) e NAO exclui a
  --   fazenda Administrativo: o TS da receita nao exclui.
  -- ⚠ COMPETENCIA: `data` e `valor_total` do lancamento; as parcelas NAO entram
  --   (a lista de meta e' caixa, o DRE e' competencia) — decisao do Gabriel.
  select l.fazenda_id,
         extract(month from l.data)::int as mes,
         case
           when l.tipo = 'abate'  and l.categoria in ('touros','bois','garrotes','machos','bezerros_m','mamotes_m','desmama_m') then 1020
           when l.tipo = 'abate'  and l.categoria in ('vacas','novilhas','bezerras_f','desmama_f','femeas','mamotes_f')         then 1010
           when l.tipo = 'venda'  and ( l.boitel_lote_id is not null
                                        or ( l.detalhes_snapshot -> 'boitelSnapshot' is not null
                                             and jsonb_typeof(l.detalhes_snapshot -> 'boitelSnapshot') <> 'null' ) )            then 1150
           when l.tipo = 'venda'  and l.categoria in ('desmama_m','bezerros_m')                                                 then 1120
           when l.tipo = 'venda'  and l.categoria in ('desmama_f','bezerras_f')                                                 then 1110
           when l.tipo = 'venda'  and l.categoria in ('garrotes','touros','bois','machos_adultos','mamotes_m')                  then 1140
           when l.tipo = 'venda'  and l.categoria in ('novilhas','vacas','femeas_adultas','mamotes_f')                          then 1130
           when l.tipo = 'compra' and l.categoria in ('garrotes','touros','bois','machos','bezerros_m','mamotes_m','desmama_m') then 15020
           when l.tipo = 'compra' and l.categoria in ('novilhas','vacas','femeas','bezerras_f','mamotes_f','desmama_f')         then 15010
         end as ordem,
         l.valor_total::numeric as valor
    from public.lancamentos l
    join public.fazendas f on f.id = l.fazenda_id
   where l.cliente_id = p_cliente
     and f.cliente_id = p_cliente
     and l.cenario = 'meta'
     and l.cancelado = false
     and l.valor_total is not null
     and l.tipo in ('abate','venda','compra')
     and l.data >= make_date(p_ano, 1, 1)
     and l.data <= make_date(p_ano, 12, 31)
),
rec_m as (
  select fazenda_id, mes, ordem, round(sum(valor), 2) as valor
    from rec
   where ordem is not null
   group by fazenda_id, mes, ordem
)
select fazenda_id, mes, ordem, valor from nut where valor <> 0
union all
select fazenda_id, mes, ordem, valor from com where valor <> 0
union all
select fazenda_id, mes, ordem, valor from fre where valor <> 0
union all
select fazenda_id, mes, ordem, valor from rec_m where valor <> 0
$$;
-- ── PARTE B — fn_dre_pecuaria: o espelho manual sai de venda/reposicao no cenario meta ─────────
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
-- ── PARTE C — drill: mesmo predicado no ramo `ln`, para o modal nao listar o espelho ───────────
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
  and not (p_cenario='meta' and l.origem_lancamento='movimentacao_rebanho' and p.bloco_dre in ('venda','reposicao'))
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

-- ── ACL — REVOKE/GRANT explicitos nas tres ───────────────────────────────────────────────────────
revoke all on function public.fn_meta_calculada_pecuaria(uuid, int) from public;
revoke all on function public.fn_meta_calculada_pecuaria(uuid, int) from anon;
grant execute on function public.fn_meta_calculada_pecuaria(uuid, int) to authenticated;

revoke all on function public.fn_dre_pecuaria(uuid, text, text, text) from public;
revoke all on function public.fn_dre_pecuaria(uuid, text, text, text) from anon;
grant execute on function public.fn_dre_pecuaria(uuid, text, text, text) to authenticated;

revoke all on function public.fn_dre_pecuaria_lancamentos(uuid, uuid, text, text, text, text, text) from public;
revoke all on function public.fn_dre_pecuaria_lancamentos(uuid, uuid, text, text, text, text, text) from anon;
grant execute on function public.fn_dre_pecuaria_lancamentos(uuid, uuid, text, text, text, text, text) to authenticated;
