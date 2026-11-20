-- REBANHO-AGIO-PROVISORIO-01 (Gabriel 19/11 15:13 e a decisão de D1/D2): regra provisória até o preço pelo peso — MUDAR DE CATEGORIA NÃO
-- MUDA VALOR. No mês da reclassificação, o lote reclassificado entra no "rebanho do fim ao preço do início" pelo preço da categoria DE ONDE
-- VEIO; a tabela que o operador digita no fim do mês não muda.
--   Produção = só movimento real (nascer, comprar, vender, morrer, transferir, engordar); a troca de categoria vai para o Mercado, junto
--   com a diferença de preço início × fim do MESMO animal. Produção + Mercado (o resultado econômico) NÃO muda.
-- D2 (B): o período é a SOMA DOS MESES (encadeado): Produção do período = Σ da produção de cada mês, cada um ao preço do SEU início
--   (antes: uma janela só, tudo ao preço de 31/12 — a soma dos meses −1,40 mi × o acumulado +0,86 mi na NJ jan–out/26).
--   O "meio" (`v_fim_p0` / `v1_p0`) passa a ser: valor do início + produção encadeada. O Mercado é o resto (fim − meio), então o total
--   segue o de sempre por construção, mesmo com mês sem fechamento validado.
-- Uma regra, as 2 funções que todos leem (DRE, DRE mês a mês, modal Variação, Evolução patrimonial, cascata, ponte): nada paralelo.
--   · `_fn_rebanho_janela_mes`: UM mês, a mesma conta da `fn_dre_pecuaria_patrimonio` (pf0/pf1/tabp0/cf + o ágio evl/evr/evp), por
--     fazenda × categoria; o ágio (kg reclassificado × (preço início destino − preço início origem)) na categoria de DESTINO.
--   · `_fn_rebanho_producao_encadeada`: Σ dos meses de (v1_p0 − v0 − ágio) e do ágio.
--   · `fn_dre_pecuaria` (só o realizado; a meta não muda) e `fn_dre_pecuaria_patrimonio`: o meio = início + produção encadeada; o payload
--     ganha `troca_categoria` (o ágio encadeado: a parte do Mercado que é troca de categoria, para o title do DRE e a linha do modal).
-- Patches guardados por md5 do corpo atual; cada âncora casa 1 vez.

SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public._fn_rebanho_janela_mes(p_cliente uuid, p_fazenda uuid, p_mes text)
RETURNS TABLE (fazenda_id uuid, categoria text, v0 numeric, v1_p0 numeric, v1_p1 numeric, agio numeric)
LANGUAGE sql STABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
with per as (select to_char(to_date(left(p_mes,7)||'-01','YYYY-MM-DD') - interval '1 month','YYYY-MM') p0, left(p_mes,7) p1),
p0f as (select i.fazenda_id, i.categoria, i.quantidade, i.peso_medio_kg, i.preco_kg
      from valor_rebanho_fechamento_itens i join per on true
      where i.cliente_id=p_cliente and i.ano_mes=per.p0 and (p_fazenda is null or i.fazenda_id=p_fazenda) and exists (select 1 from valor_rebanho_realizado_validado rv where rv.cliente_id=i.cliente_id and rv.fazenda_id=i.fazenda_id and rv.ano_mes=i.ano_mes and rv.status='validado')),
pk_ini as (select u.fazenda_id, u.categoria, max(u.preco_kg) pk from (
        select x.fazenda_id, x.categoria, x.ano_mes, x.preco_kg, max(x.ano_mes) over (partition by x.fazenda_id, x.categoria) ult
        from valor_rebanho_fechamento_itens x join per on true
        where x.cliente_id=p_cliente and x.ano_mes<=per.p1 and x.preco_kg is not null and exists (select 1 from valor_rebanho_realizado_validado rv where rv.cliente_id=x.cliente_id and rv.fazenda_id=x.fazenda_id and rv.ano_mes=x.ano_mes and rv.status='validado')) u
      where u.ano_mes=u.ult group by 1,2),
p0c as (select z.fazenda_id, z.categoria_codigo, z.saldo_inicial, z.peso_medio_inicial, k.pk
      from zoot_mensal_cache z join per on true
      left join pk_ini k on k.fazenda_id=z.fazenda_id and k.categoria=z.categoria_codigo
      where z.cliente_id=p_cliente and z.ano_mes=per.p1 and z.cenario='realizado'
        and (p_fazenda is null or z.fazenda_id=p_fazenda)
        and not exists (select 1 from p0f where p0f.fazenda_id=z.fazenda_id)),
p0u as (select * from p0f union all select * from p0c),
p1f as (select i.fazenda_id, i.categoria, i.quantidade, i.peso_medio_kg, i.preco_kg
      from valor_rebanho_fechamento_itens i join per on true
      where i.cliente_id=p_cliente and i.ano_mes=per.p1 and (p_fazenda is null or i.fazenda_id=p_fazenda) and exists (select 1 from valor_rebanho_realizado_validado rv where rv.cliente_id=i.cliente_id and rv.fazenda_id=i.fazenda_id and rv.ano_mes=i.ano_mes and rv.status='validado')),
p1c as (select z.fazenda_id, z.categoria_codigo, z.saldo_final, z.peso_medio_final, null::numeric
      from zoot_mensal_cache z join per on true
      where z.cliente_id=p_cliente and z.ano_mes=per.p1 and z.cenario='realizado'
        and (p_fazenda is null or z.fazenda_id=p_fazenda)
        and not exists (select 1 from p1f where p1f.fazenda_id=z.fazenda_id)),
p1u as (select * from p1f union all select * from p1c),
pf0 as (select u.fazenda_id, u.categoria, sum(u.quantidade) q,
          case when sum(u.quantidade)>0 then sum(u.quantidade*u.peso_medio_kg)/sum(u.quantidade) end pm,
          case when sum(u.quantidade*u.peso_medio_kg)>0 then sum(u.quantidade*u.peso_medio_kg*u.preco_kg)/sum(u.quantidade*u.peso_medio_kg)
               else avg(u.preco_kg) end pk
        from p0u u group by 1,2),
pf1 as (select u.fazenda_id, u.categoria, sum(u.quantidade) q,
          case when sum(u.quantidade)>0 then sum(u.quantidade*u.peso_medio_kg)/sum(u.quantidade) end pm,
          case when sum(u.quantidade*u.peso_medio_kg)>0 then sum(u.quantidade*u.peso_medio_kg*u.preco_kg)/sum(u.quantidade*u.peso_medio_kg)
               else avg(u.preco_kg) end pk
        from p1u u group by 1,2),
kf as (select a.fazenda_id, a.categoria from pf0 a union select b.fazenda_id, b.categoria from pf1 b),
tabp0 as (select m.fazenda_id, m.categoria, max(m.preco_kg) pk from valor_rebanho_mensal m join per on true
          where m.cliente_id=p_cliente and m.ano_mes=per.p0 and m.preco_kg is not null and (p_fazenda is null or m.fazenda_id=p_fazenda)
          group by 1,2),
cf as (select kf.fazenda_id, kf.categoria,
         coalesce(a.q*a.pm*a.pk,0) v0,
         coalesce(b.q*b.pm,0)*coalesce(a.pk,t.pk,b.pk) v1_p0,
         coalesce(b.q*b.pm*coalesce(b.pk,a.pk),0) v1_p1
       from kf left join pf0 a on a.fazenda_id=kf.fazenda_id and a.categoria=kf.categoria
               left join pf1 b on b.fazenda_id=kf.fazenda_id and b.categoria=kf.categoria
               left join tabp0 t on t.fazenda_id=kf.fazenda_id and t.categoria=kf.categoria),
evl as (select l.fazenda_id, l.categoria o, l.categoria_destino d,
               l.quantidade * coalesce(nullif(l.peso_medio_kg,0), l.peso_total/nullif(l.quantidade,0), 0) kg
        from lancamentos l join per on true
        where l.cliente_id=p_cliente and l.cenario='realizado' and coalesce(l.cancelado,false)=false and l.tipo='reclassificacao'
          and (p_fazenda is null or l.fazenda_id=p_fazenda)
          and l.data >= to_date(per.p1||'-01','YYYY-MM-DD')
          and l.data <  (to_date(per.p1||'-01','YYYY-MM-DD') + interval '1 month')),
evr as (select k.fazenda_id, k.categoria, coalesce(a.pk, t.pk, b.pk) pref
        from (select e.fazenda_id, e.o categoria from evl e union select e.fazenda_id, e.d from evl e) k
        left join pf0 a on a.fazenda_id=k.fazenda_id and a.categoria=k.categoria
        left join tabp0 t on t.fazenda_id=k.fazenda_id and t.categoria=k.categoria
        left join pf1 b on b.fazenda_id=k.fazenda_id and b.categoria=k.categoria),
evd as (select e.fazenda_id, e.d categoria, sum(coalesce(e.kg*(rd.pref - ro.pref),0)) agio
        from evl e left join evr ro on ro.fazenda_id=e.fazenda_id and ro.categoria=e.o
                   left join evr rd on rd.fazenda_id=e.fazenda_id and rd.categoria=e.d
        group by 1,2)
select coalesce(c.fazenda_id, e.fazenda_id), coalesce(c.categoria, e.categoria),
       coalesce(c.v0,0), coalesce(c.v1_p0,0), coalesce(c.v1_p1,0), coalesce(e.agio,0)
from cf c full join evd e on e.fazenda_id=c.fazenda_id and e.categoria=c.categoria
$function$;

CREATE OR REPLACE FUNCTION public._fn_rebanho_producao_encadeada(p_cliente uuid, p_fazenda uuid, p_de text, p_ate text)
RETURNS TABLE (fazenda_id uuid, categoria text, producao numeric, agio numeric)
LANGUAGE sql STABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
select j.fazenda_id, j.categoria, sum(j.v1_p0 - j.v0 - j.agio), sum(j.agio)
from generate_series(to_date(left(p_de,7)||'-01','YYYY-MM-DD'), to_date(left(p_ate,7)||'-01','YYYY-MM-DD'), interval '1 month') g
cross join lateral public._fn_rebanho_janela_mes(p_cliente, p_fazenda, to_char(g,'YYYY-MM')) j
group by 1,2
$function$;

REVOKE ALL ON FUNCTION public._fn_rebanho_janela_mes(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_rebanho_producao_encadeada(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION pg_temp.m115600_troca(p_def text, p_de text, p_para text, p_nome text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE n int := (length(p_def) - length(replace(p_def, p_de, ''))) / greatest(length(p_de), 1);
BEGIN
  IF n <> 1 THEN RAISE EXCEPTION 'm115600: a âncora % casa % vez(es) (esperado 1). Nada gravado.', p_nome, n; END IF;
  RETURN replace(p_def, p_de, p_para);
END $f$;

DO $m$
DECLARE d text;
BEGIN
  -- (1) o DRE: o meio de cada fazenda = início + produção encadeada (só o realizado); `troca_categoria` no patrimônio
  d := pg_get_functiondef('public.fn_dre_pecuaria(uuid,text,text,text)'::regprocedure);
  IF md5(d) <> 'e259ee55af7581f4d8dfc7a9bd7a7f94' THEN RAISE EXCEPTION 'm115600: fn_dre_pecuaria mudou (md5 %). Nada gravado.', md5(d); END IF;
  d := pg_temp.m115600_troca(d, $a$  pat as (
    select k.fazenda_id,$a$,
$a$  /* REBANHO-AGIO-PROVISORIO-01: a produção do período = a soma dos meses (cada um ao preço do seu início), sem a troca de categoria */
  enc as materialized (select e.fazenda_id, sum(e.producao) prod, sum(e.agio) agio
          from (select 1 where p_cenario='realizado') g
          cross join lateral public._fn_rebanho_producao_encadeada(p_cliente, null, p_de, p_ate) e group by 1),
  pat as (
    select k.fazenda_id,$a$, 'A1 enc');
  d := pg_temp.m115600_troca(d, $a$      round(sum(coalesce(p1.q*p1.pm,0)*coalesce(p0.pk,t0.pk,p1.pk)),2) v_fim_p0,$a$,
$a$      round(sum(coalesce(p0.q*p0.pm*p0.pk,0)) + coalesce(max(en.prod),0),2) v_fim_p0,
      round(coalesce(max(en.agio),0),2) troca_categoria,$a$, 'A2 meio');
  d := pg_temp.m115600_troca(d, $a$    left join tabp0 t0 on t0.fazenda_id=k.fazenda_id and t0.categoria=k.categoria
    group by 1$a$,
$a$    left join tabp0 t0 on t0.fazenda_id=k.fazenda_id and t0.categoria=k.categoria
    left join enc en on en.fazenda_id=k.fazenda_id
    group by 1$a$, 'A3 junta');
  d := pg_temp.m115600_troca(d, $a$      case when p_cenario='realizado' then coalesce(pt.v_fim_p1,0) else coalesce(pm.v_fim,0) end v_fim_p1,$a$,
$a$      case when p_cenario='realizado' then coalesce(pt.v_fim_p1,0) else coalesce(pm.v_fim,0) end v_fim_p1,
      case when p_cenario='realizado' then coalesce(pt.troca_categoria,0) else 0 end troca_categoria,$a$, 'A4 base');
  d := pg_temp.m115600_troca(d, $a$'patrimonio',jsonb_build_object('v_ini_p0',v_ini_p0,'v_fim_p0',v_fim_p0,'v_fim_p1',v_fim_p1,'cab_ini',cab_ini,'cab_fim',cab_fim,'cab_media',cab_media)$a$,
$a$'patrimonio',jsonb_build_object('v_ini_p0',v_ini_p0,'v_fim_p0',v_fim_p0,'v_fim_p1',v_fim_p1,'cab_ini',cab_ini,'cab_fim',cab_fim,'cab_media',cab_media,'troca_categoria',troca_categoria)$a$, 'A5 fazenda');
  d := pg_temp.m115600_troca(d, $a$'patrimonio',jsonb_build_object('v_ini_p0',sum(v_ini_p0),'v_fim_p0',sum(v_fim_p0),'v_fim_p1',sum(v_fim_p1),'cab_ini',sum(cab_ini),'cab_fim',sum(cab_fim),'cab_media',sum(cab_media))$a$,
$a$'patrimonio',jsonb_build_object('v_ini_p0',sum(v_ini_p0),'v_fim_p0',sum(v_fim_p0),'v_fim_p1',sum(v_fim_p1),'cab_ini',sum(cab_ini),'cab_fim',sum(cab_fim),'cab_media',sum(cab_media),'troca_categoria',sum(troca_categoria))$a$, 'A6 total');
  EXECUTE d;

  -- (2) o modal Variação do rebanho: o meio de cada categoria = início + produção encadeada; `agio`/`troca_categoria` = o encadeado
  d := pg_get_functiondef('public.fn_dre_pecuaria_patrimonio(uuid,uuid,text,text)'::regprocedure);
  IF md5(d) <> '60fb034b87e28840a18b4388a823a265' THEN RAISE EXCEPTION 'm115600: fn_dre_pecuaria_patrimonio mudou (md5 %). Nada gravado.', md5(d); END IF;
  d := pg_temp.m115600_troca(d, $a$
c as (select categoria, sum(q0) q0,$a$, $a$
c0 as (select categoria, sum(q0) q0,$a$, 'B1 c0');
  d := pg_temp.m115600_troca(d, $a$round(coalesce(sum(v1_p0),0),2) v1_p0, round(coalesce(sum(v1_p1),0),2) v1_p1
      from cf group by 1),$a$,
$a$round(coalesce(sum(v1_p0),0),2) v1_p0, round(coalesce(sum(v1_p1),0),2) v1_p1
      from cf group by 1),
/* REBANHO-AGIO-PROVISORIO-01: o meio = início + a produção encadeada (a soma dos meses, sem a troca de categoria) */
enc as materialized (select e.categoria, sum(e.producao) prod, sum(e.agio) agio
      from public._fn_rebanho_producao_encadeada(p_cliente, p_fazenda, p_de, p_ate) e group by 1),
c as (select coalesce(c0.categoria, en.categoria) categoria, coalesce(c0.q0,0) q0, c0.pm0, c0.pk0, coalesce(c0.v0,0) v0,
        coalesce(c0.q1,0) q1, c0.pm1, c0.pk1, round(coalesce(c0.v0,0) + coalesce(en.prod,0),2) v1_p0, coalesce(c0.v1_p1,0) v1_p1,
        round(coalesce(en.agio,0),2) troca
      from c0 full join enc en on en.categoria=c0.categoria),$a$, 'B2 meio');
  d := pg_temp.m115600_troca(d, $a$'agio',coalesce(e.agio,0),'agio_sem_preco',coalesce(e.sem_preco,false)) o$a$,
                                $a$'agio',c.troca,'troca_categoria',c.troca,'agio_sem_preco',coalesce(e.sem_preco,false)) o$a$, 'B3 categoria');
  d := pg_temp.m115600_troca(d, $a$'agio',coalesce(round((select sum(agio) from evp),2),0)$a$,
                                $a$'agio',coalesce((select sum(troca) from c),0),'troca_categoria',coalesce((select sum(troca) from c),0)$a$, 'B4 total');
  EXECUTE d;
END $m$;
