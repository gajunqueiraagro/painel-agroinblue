-- PATRIMONIO-TOTAL-01 — o total do modal passa a agregar por fazenda, como a grade
-- Aplicado no proto em 23/09/2026 (ledger: patrimonio_total_por_fazenda). Registro historico.
--
-- POR QUE ESTA MIGRATION EXISTE
-- `fn_dre_pecuaria_patrimonio` com `p_fazenda = null` agregava SO' por categoria, somando as
-- fazendas ANTES de calcular o preco medio ponderado. `fn_dre_pecuaria` agrega por FAZENDA x
-- categoria e so' entao soma. As duas contas divergem no `v1_p0` — o valor do MEIO, que e'
-- exatamente o que separa a variacao por producao do efeito de mercado.
-- ⚠ O ESTRAGO ERA SIMETRICO E POR ISSO INVISIVEL: a SOMA das duas variacoes batia, e o que
--   divergia era a REPARTICAO entre elas. NJ jul/22-jun/23: a grade dizia VPB 275.077,50 e efeito
--   -7.042.962,86; o modal dizia 284.977,50 e -7.052.862,86 — 9.900,00 a mais numa e a menos na
--   outra, com o total identico. Nenhum gate ve' isso, e ninguem somaria as duas para conferir.
-- ⚠ E SO' APARECEU AGORA porque o modal v7 (VARIACAO-REBANHO-MODAL-01) passou a mostrar os tres
--   numeros lado a lado com a grade. A divida existia desde que o modal nasceu.
--
-- O QUE MUDA: `pf0`/`pf1` agregam por (fazenda, categoria); `cf` calcula v0, v1_p0 e v1_p1 POR
-- FAZENDA; `c` soma por categoria para a saida, recompondo peso e preco como medias ponderadas.
-- Por fazenda (`p_fazenda` preenchido) o resultado e' o mesmo de antes — provado abaixo.
--
-- ⚠ E HAVIA UM SEGUNDO DEFEITO, ESTE TAMBEM NO POR-FAZENDA, que so' a prova do NJ 25/26 revelou:
--   uma categoria com QUANTIDADE ZERO na ponta inicial mas com PRECO declarado perdia o preco.
--   `sum(q*pm*pk)/sum(q*pm)` tem denominador zero e cai no `else null`, entao o `coalesce(p0.pk,
--   p1.pk)` usava o preco do FIM — o preco que o efeito de mercado existe para isolar.
--   Medido: `mamotes_m` no Sto. Expedito, 7 cab x 30 kg, preco do inicio 14,00 e do fim 16,00 —
--   3.360,00 em vez de 2.940,00, e os 420,00 iam parar no VPB. A saida e' `else avg(preco_kg)`:
--   sem quantidade para ponderar, a media simples dos precos declarados e' a melhor resposta, e
--   ela recupera exatamente o numero da grade.
--
-- ⚠ UMA DIVERGENCIA FICA, e e' de FONTE, nao de numero: em SR civil 2022 a grade diz
--   `p0_fonte = 'zero'` e o modal diz `'fechamento'`. A regra de resumo e' a mesma nos dois
--   ('zero' se alguma fazenda e' zero; senao 'cadastro' se alguma e' cadastro; senao
--   'fechamento'); o que difere e' QUAIS fazendas entram na conta. A grade percorre a lista de
--   fazendas do periodo e da' 'zero' a quem nao tem linha nenhuma; o modal so' ve' quem TEM linha,
--   e o Bom Retiro (sem gado em dez/21) nao aparece. A fonte e' informativa — alimenta a frase do
--   modal, nao decide numero — e alinhar exigiria o modal montar a lista de fazendas do periodo.
--   Registrado, nao corrigido.
--
-- PROVAS (BEGIN … ROLLBACK antes de aplicar, e repetidas depois)
--   TOTAL x GRADE, 6 periodos: diferenca 0,00 em VPB e efeito, exceto 0,01 no efeito de
--     SR civil 2022 (arredondamento, dentro da tolerancia declarada de R$ 0,01).
--   POR FAZENDA x GRADE, 14 pares: 0,00 em VPB e efeito, TODOS.
--   md5: b50c9f20a432fc3bdb4b301ec31b235f -> 4b6a5dfc819f5e65ab73508dd1746ee3
CREATE OR REPLACE FUNCTION public.fn_dre_pecuaria_patrimonio(p_cliente uuid, p_fazenda uuid, p_de text, p_ate text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $function$
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
          when sum(coalesce(quantidade,0))>0 then 'cadastro' else 'zero' end f from p1u group by 1)
select jsonb_build_object('p0', (select p0 from per), 'p1', (select p1 from per),
  'p0_fonte', (select case when bool_or(f='zero') then 'zero'
                           when bool_or(f='cadastro') then 'cadastro' else 'fechamento' end from ff0),
  'p1_fonte', (select case when bool_or(f='zero') then 'zero'
                           when bool_or(f='cadastro') then 'cadastro' else 'fechamento' end from ff1),
  'categorias', coalesce((select jsonb_agg(jsonb_build_object('categoria',categoria,'q0',q0,'pm0',pm0,'pk0',pk0,'v0',v0,'q1',q1,'pm1',pm1,'pk1',pk1,'v1_p0',v1_p0,'v1_p1',v1_p1,'vpb',v1_p0-v0,'efeito',v1_p1-v1_p0) order by categoria) from c),'[]'::jsonb),
  'total', (select jsonb_build_object('q0',sum(q0),'v0',sum(v0),'q1',sum(q1),'v1_p0',sum(v1_p0),'v1_p1',sum(v1_p1),'vpb',sum(v1_p0-v0),'efeito',sum(v1_p1-v1_p0)) from c))
$function$;

REVOKE ALL ON FUNCTION public.fn_dre_pecuaria_patrimonio(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_dre_pecuaria_patrimonio(uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_dre_pecuaria_patrimonio(uuid, uuid, text, text) TO authenticated, service_role;
