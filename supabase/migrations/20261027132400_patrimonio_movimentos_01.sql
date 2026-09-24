-- PATRIMONIO-MOVIMENTOS-01 — `fn_dre_pecuaria_patrimonio` ganha o bloco `movimentos`.
--
-- ⚠ ELE NASCE PORQUE AS ARROBAS DO DRE NAO SERVEM PARA UMA PONTE DE ESTOQUE, e isso foi MEDIDO
-- antes de escrever. `fn_dre_pecuaria` devolve tres arrobas e duas delas nao sao comensuraveis com
-- o estoque:
--   at_produzida  = sum(producao_biologica)/30        -> @ VIVA. Serve.
--   at_comprada   = sum(quantidade*peso_medio_kg)/30  -> @ VIVA. Serve.
--   at_desfrutada = abate: peso_carcaca/15; demais: peso_medio*0,5/15
--                 -> @ de CARCACA, com rendimento 50% presumido. NAO serve: somar isso a um
--                    estoque em @ viva mistura duas unidades.
-- E MORTES NAO EXISTEM em `fn_dre_pecuaria` — `movz` filtra so' abate/venda/venda_pe/consumo/compra.
--
-- ⚠ E A PONTE NAO TEM QUATRO MOVIMENTOS, TEM OITO. Medido no NJ 25/26, tudo em @ viva:
--   Pureza: @0 50.833,91 | prod 33.872,55 | comp 4.171,50 | NASC 1.504,00 | TRANSF.ENT 12.874,20
--           | saidas 44.671,94 | mortes 381,70 | TRANSF.SAI 3.510,31 | @1 54.670,20
-- Com os quatro movimentos do briefing original o residuo da Pureza seria -10.846 @; com os sete,
-- +22,01 @ (0,04%). Nascimento NAO esta dentro de `producao_biologica` — conferido por subtracao.
-- Repetida a medicao com o cache nas DUAS pontas em vez do fechamento: residuo 21,96 — ou seja,
-- NAO e' o gap CACHE-X-FECHAMENTO-01, e' residuo proprio da ponte.
--
-- ⚠ POR ISSO EXISTE `ajustes`, E ELE E' DECLARADO, NAO ESCONDIDO: ajustes = @1 - (@0 + entradas -
-- saidas). Com ele a identidade fecha EXATA, por construcao, em cabecas, em arrobas e em reais.
-- O que ele absorve e' conhecido: reclassificacao de categoria (que muda o peso medio sem mover
-- cabeca), arredondamento mensal do cache, e 91 mortes e 41 nascimentos que NAO TEM PESO NENHUM no
-- lancamento (medido) e por isso entram em cabecas e nao em arrobas. A tela mostra a barra cinza e
-- o title explica; acima de 1% de @0 o title traz o percentual.
--
-- ⚠ O VALOR DE CADA MOVIMENTO E' A @ AO PRECO DA CATEGORIA NO MES DO MOVIMENTO, nao ao preco da
-- ponta: preco_kg do fechamento daquele (fazenda, categoria, mes), com fallback para o mes anterior
-- mais proximo da mesma fazenda e, depois, do mesmo cliente. E' preco POR KG, entao ele multiplica
-- KG, nunca arroba. O valor dos MOVIMENTOS nao e' o dinheiro do financeiro: compras e vendas em R$
-- seguem nas linhas Reposicao e Vendas do DRE, e a tela diz isso.
--
-- ⚠ O ABATE USA PESO VIVO, e o fallback de carcaca (carcaca/0,5) esta escrito mas nao dispara hoje:
-- medido, os 576 lancamentos de abate tem todos `peso_medio_kg` preenchido. Ele fica porque a regra
-- e' a regra, nao porque o dado precise dele agora.
--
-- Preservado VERBATIM do estado anterior (md5 4b6a5dfc819f5e65ab73508dd1746ee3): todos os CTEs de
-- `per` a `ff1` e as cinco chaves que o payload ja' tinha. O acrescimo e' so' os CTEs novos e a
-- chave 'movimentos'.
--
-- Prova rodada antes de aplicar, em BEGIN/ROLLBACK, no NJ 25/26 e no SR civil 2022, por fazenda e
-- no total: identidade fecha ao centavo nas tres unidades.

-- ⚠ O CORPO ABAIXO E' BYTE A BYTE O QUE ESTA' NO BANCO, sem um comentario sequer dentro do
-- $fn$ — e isso e' deliberado. Comentario dentro do corpo entra no `prosrc`, e a migration que
-- versiona um texto que o banco nunca recebeu e' migration infiel: o md5 deixa de servir de prova.
-- Toda a explicacao fica AQUI em cima, onde nao altera o que o Postgres guarda.
--

-- md5 do prosrc aplicado por esta migration: 111fec659b7fc63a7a6f99851cb90dd3
-- (substituido em seguida pela 20261027132500 — ver o cabecalho dela.)
--
-- Mapa do bloco novo, que os comentarios internos descreviam:
--   prcf / prcc   preco por KG de cada (fazenda, categoria, mes) que o fechamento conhece, e o
--                 segundo nivel do fallback (o mesmo preco no cliente inteiro). Sem o segundo,
--                 fazenda sem fechamento proprio valoraria os movimentos a ZERO — e zero e'
--                 numero que o operador soma, nao ausencia que ele investiga.
--   mvl           os movimentos do periodo, em KG VIVO; `venda_pe` e `consumo` entram com
--                 `vendas_abates`.
--   mvp           a producao biologica: ganho de PESO, nao entrada de cabeca. Vem do cache, por
--                 categoria e por mes, e por isso pode ser valorada com o mesmo criterio.
--   pt            as duas pontas, na MESMA precisao dos movimentos (sem passar pelo
--                 arredondamento de `c`).
--   aj            o ajuste, que fecha a identidade por construcao nas tres unidades. E' residuo
--                 DECLARADO, nao numero escondido.

create or replace function public.fn_dre_pecuaria_patrimonio(
  p_cliente uuid, p_fazenda uuid, p_de text, p_ate text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $fn$
with per as (select to_char(to_date(p_de||'-01','YYYY-MM-DD') - interval '1 month','YYYY-MM') p0, left(p_ate,7) p1),
p0f as (select i.fazenda_id, i.categoria, i.quantidade, i.peso_medio_kg, i.preco_kg, 'fechamento'::text origem
      from valor_rebanho_fechamento_itens i join per on true
      where i.cliente_id=p_cliente and i.ano_mes=per.p0 and (p_fazenda is null or i.fazenda_id=p_fazenda)),
pk_ini as (select fazenda_id, categoria, max(preco_kg) pk from valor_rebanho_fechamento_itens
      where cliente_id=p_cliente and ano_mes=left(p_de,7) group by 1,2),
p0c as (select z.fazenda_id, z.categoria_codigo, z.saldo_inicial, z.peso_medio_inicial, k.pk,
      (case when z.saldo_inicial>0 then 'cadastro' else 'zero' end)::text origem
      from zoot_mensal_cache z
      left join pk_ini k on k.fazenda_id=z.fazenda_id and k.categoria=z.categoria_codigo
      where z.cliente_id=p_cliente and z.ano_mes=left(p_de,7) and z.cenario='realizado'
        and (p_fazenda is null or z.fazenda_id=p_fazenda)
        and not exists (select 1 from p0f where p0f.fazenda_id=z.fazenda_id)),
p0u as (select * from p0f union all select * from p0c),
p1f as (select i.fazenda_id, i.categoria, i.quantidade, i.peso_medio_kg, i.preco_kg, 'fechamento'::text origem
      from valor_rebanho_fechamento_itens i join per on true
      where i.cliente_id=p_cliente and i.ano_mes=per.p1 and (p_fazenda is null or i.fazenda_id=p_fazenda)),
p1c as (select z.fazenda_id, z.categoria_codigo, z.saldo_final, z.peso_medio_final, null::numeric,
      (case when z.saldo_final>0 then 'cadastro' else 'zero' end)::text origem
      from zoot_mensal_cache z join per on true
      where z.cliente_id=p_cliente and z.ano_mes=per.p1 and z.cenario='realizado'
        and (p_fazenda is null or z.fazenda_id=p_fazenda)
        and not exists (select 1 from p1f where p1f.fazenda_id=z.fazenda_id)),
p1u as (select * from p1f union all select * from p1c),
pf0 as (select fazenda_id, categoria, sum(quantidade) q,
          case when sum(quantidade)>0 then sum(quantidade*peso_medio_kg)/sum(quantidade) end pm,
          case when sum(quantidade*peso_medio_kg)>0 then sum(quantidade*peso_medio_kg*preco_kg)/sum(quantidade*peso_medio_kg)
               else avg(preco_kg) end pk
        from p0u group by 1,2),
pf1 as (select fazenda_id, categoria, sum(quantidade) q,
          case when sum(quantidade)>0 then sum(quantidade*peso_medio_kg)/sum(quantidade) end pm,
          case when sum(quantidade*peso_medio_kg)>0 then sum(quantidade*peso_medio_kg*preco_kg)/sum(quantidade*peso_medio_kg)
               else avg(preco_kg) end pk
        from p1u group by 1,2),
kf as (select fazenda_id, categoria from pf0 union select fazenda_id, categoria from pf1),
cf as (select kf.fazenda_id, kf.categoria,
         coalesce(a.q,0) q0, a.pm pm0, a.pk pk0, coalesce(a.q*a.pm*a.pk,0) v0,
         coalesce(b.q,0) q1, b.pm pm1, b.pk pk1,
         coalesce(b.q*b.pm,0)*coalesce(a.pk,b.pk) v1_p0,
         coalesce(b.q*b.pm*coalesce(b.pk,a.pk),0) v1_p1
       from kf left join pf0 a on a.fazenda_id=kf.fazenda_id and a.categoria=kf.categoria
               left join pf1 b on b.fazenda_id=kf.fazenda_id and b.categoria=kf.categoria),
c as (select categoria, sum(q0) q0,
        round(case when sum(q0)>0 then sum(q0*coalesce(pm0,0))/sum(q0) end,2) pm0,
        round(case when sum(q0*coalesce(pm0,0))>0 then sum(q0*coalesce(pm0,0)*coalesce(pk0,0))/sum(q0*coalesce(pm0,0))
                   else avg(pk0) end,4) pk0,
        round(sum(v0),2) v0, sum(q1) q1,
        round(case when sum(q1)>0 then sum(q1*coalesce(pm1,0))/sum(q1) end,2) pm1,
        round(case when sum(q1*coalesce(pm1,0))>0 then sum(q1*coalesce(pm1,0)*coalesce(pk1,0))/sum(q1*coalesce(pm1,0))
                   else avg(pk1) end,4) pk1,
        round(coalesce(sum(v1_p0),0),2) v1_p0, round(coalesce(sum(v1_p1),0),2) v1_p1
      from cf group by 1),
ff0 as (select fazenda_id, case when bool_or(origem='fechamento') then 'fechamento'
          when sum(coalesce(quantidade,0))>0 then 'cadastro' else 'zero' end f from p0u group by 1),
ff1 as (select fazenda_id, case when bool_or(origem='fechamento') then 'fechamento'
          when sum(coalesce(quantidade,0))>0 then 'cadastro' else 'zero' end f from p1u group by 1),
prcf as (select fazenda_id, categoria, ano_mes,
           case when sum(quantidade*peso_medio_kg)>0
                then sum(quantidade*peso_medio_kg*preco_kg)/sum(quantidade*peso_medio_kg)
                else avg(preco_kg) end pk
         from valor_rebanho_fechamento_itens
         where cliente_id=p_cliente group by 1,2,3),
prcc as (select categoria, ano_mes,
           case when sum(quantidade*peso_medio_kg)>0
                then sum(quantidade*peso_medio_kg*preco_kg)/sum(quantidade*peso_medio_kg)
                else avg(preco_kg) end pk
         from valor_rebanho_fechamento_itens
         where cliente_id=p_cliente group by 1,2),
mvl as (select l.fazenda_id, l.categoria, to_char(l.data,'YYYY-MM') ym,
          (case l.tipo when 'nascimento' then 'nascimentos'
                       when 'compra' then 'compradas'
                       when 'transferencia_entrada' then 'transf_entrada'
                       when 'transferencia_saida' then 'transf_saida'
                       when 'morte' then 'mortes'
                       else 'vendas_abates' end)::text mov,
          l.quantidade q,
          l.quantidade * coalesce(nullif(l.peso_medio_kg,0),
                                  case when l.tipo='abate' then nullif(l.peso_carcaca_kg,0)/0.5 end,
                                  0) kg
        from lancamentos l join per on true
        where l.cliente_id=p_cliente and l.cenario='realizado' and coalesce(l.cancelado,false)=false
          and (p_fazenda is null or l.fazenda_id=p_fazenda)
          and l.data >= to_date(left(p_de,7)||'-01','YYYY-MM-DD')
          and l.data <  (to_date(per.p1||'-01','YYYY-MM-DD') + interval '1 month')
          and l.tipo in ('nascimento','compra','transferencia_entrada','transferencia_saida',
                         'morte','venda','venda_pe','consumo','abate')),
mvp as (select z.fazenda_id, z.categoria_codigo categoria, z.ano_mes ym, 'produzidas'::text mov,
          0 q, z.producao_biologica kg
        from zoot_mensal_cache z join per on true
        where z.cliente_id=p_cliente and z.cenario='realizado'
          and (p_fazenda is null or z.fazenda_id=p_fazenda)
          and z.ano_mes between left(p_de,7) and per.p1
          and coalesce(z.producao_biologica,0) <> 0),
mva as (select * from mvl union all select * from mvp),
mvv as (select m.mov, sum(m.q) cab, round(sum(m.kg)/30.0,2) at,
          round(sum(m.kg * coalesce(pf.pk, pc.pk, 0)),2) valor
        from mva m
        left join lateral (select pk from prcf where prcf.fazenda_id=m.fazenda_id
                             and prcf.categoria=m.categoria and prcf.ano_mes <= m.ym
                           order by prcf.ano_mes desc limit 1) pf on true
        left join lateral (select pk from prcc where prcc.categoria=m.categoria and prcc.ano_mes <= m.ym
                           order by prcc.ano_mes desc limit 1) pc on true
        group by 1),
pt as (select sum(q0) cab0, round(sum(coalesce(q0*pm0,0))/30.0,2) at0, round(sum(v0),2) val0,
              sum(q1) cab1, round(sum(coalesce(q1*pm1,0))/30.0,2) at1, round(sum(v1_p1),2) val1
       from cf),
aj as (select pt.cab1 - (pt.cab0
             + coalesce((select sum(cab) from mvv where mov in ('produzidas','nascimentos','compradas','transf_entrada')),0)
             - coalesce((select sum(cab) from mvv where mov in ('vendas_abates','mortes','transf_saida')),0)) cab,
              round(pt.at1 - (pt.at0
             + coalesce((select sum(at) from mvv where mov in ('produzidas','nascimentos','compradas','transf_entrada')),0)
             - coalesce((select sum(at) from mvv where mov in ('vendas_abates','mortes','transf_saida')),0)),2) at,
              round(pt.val1 - (pt.val0
             + coalesce((select sum(valor) from mvv where mov in ('produzidas','nascimentos','compradas','transf_entrada')),0)
             - coalesce((select sum(valor) from mvv where mov in ('vendas_abates','mortes','transf_saida')),0)),2) valor
       from pt)
select jsonb_build_object('p0', (select p0 from per), 'p1', (select p1 from per),
  'p0_fonte', (select case when bool_or(f='zero') then 'zero'
                           when bool_or(f='cadastro') then 'cadastro' else 'fechamento' end from ff0),
  'p1_fonte', (select case when bool_or(f='zero') then 'zero'
                           when bool_or(f='cadastro') then 'cadastro' else 'fechamento' end from ff1),
  'categorias', coalesce((select jsonb_agg(jsonb_build_object('categoria',categoria,'q0',q0,'pm0',pm0,'pk0',pk0,'v0',v0,'q1',q1,'pm1',pm1,'pk1',pk1,'v1_p0',v1_p0,'v1_p1',v1_p1,'vpb',v1_p0-v0,'efeito',v1_p1-v1_p0) order by categoria) from c),'[]'::jsonb),
  'total', (select jsonb_build_object('q0',sum(q0),'v0',sum(v0),'q1',sum(q1),'v1_p0',sum(v1_p0),'v1_p1',sum(v1_p1),'vpb',sum(v1_p0-v0),'efeito',sum(v1_p1-v1_p0)) from c),
  'movimentos', (select jsonb_build_object(
      'inicio',         jsonb_build_object('cabecas',pt.cab0,'arrobas',pt.at0,'valor',pt.val0),
      'produzidas',     (select jsonb_build_object('cabecas',cab,'arrobas',at,'valor',valor) from mvv where mov='produzidas'),
      'nascimentos',    (select jsonb_build_object('cabecas',cab,'arrobas',at,'valor',valor) from mvv where mov='nascimentos'),
      'compradas',      (select jsonb_build_object('cabecas',cab,'arrobas',at,'valor',valor) from mvv where mov='compradas'),
      'transf_entrada', (select jsonb_build_object('cabecas',cab,'arrobas',at,'valor',valor) from mvv where mov='transf_entrada'),
      'vendas_abates',  (select jsonb_build_object('cabecas',cab,'arrobas',at,'valor',valor) from mvv where mov='vendas_abates'),
      'mortes',         (select jsonb_build_object('cabecas',cab,'arrobas',at,'valor',valor) from mvv where mov='mortes'),
      'transf_saida',   (select jsonb_build_object('cabecas',cab,'arrobas',at,'valor',valor) from mvv where mov='transf_saida'),
      'ajustes',        (select jsonb_build_object('cabecas',cab,'arrobas',at,'valor',valor) from aj),
      'fim',            jsonb_build_object('cabecas',pt.cab1,'arrobas',pt.at1,'valor',pt.val1))
    from pt))
$fn$;

-- ⚠ SECDEF NASCE ABERTA: `create` sem rodape deixa EXECUTE para PUBLIC. O `replace` preserva a ACL
-- que ja' existia, mas os quatro comandos abaixo ficam porque a prova e' `has_function_privilege`,
-- nao "o replace preserva". E o REVOKE de PUBLIC nao apaga concessao NOMINAL a `anon` — por isso os
-- dois REVOKE, e nao um.
revoke all on function public.fn_dre_pecuaria_patrimonio(uuid,uuid,text,text) from public;
revoke all on function public.fn_dre_pecuaria_patrimonio(uuid,uuid,text,text) from anon;
grant execute on function public.fn_dre_pecuaria_patrimonio(uuid,uuid,text,text) to authenticated;
grant execute on function public.fn_dre_pecuaria_patrimonio(uuid,uuid,text,text) to service_role;
