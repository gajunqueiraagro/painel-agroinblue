-- DRE-VARIACAO-EXPLICA-01 fatia 1a — o modal da Variacao recebe a "Evolucao de categoria (agio)" e a serie mensal da V4.
--
-- REGRA (Gabriel 05/11 10:31): o agio e' linha propria, FORA da variacao por producao, a preco de dez/AA (F1):
--   agio = cada reclassificacao do periodo (lancamento 'reclassificacao', origem -> destino) x kg dela x (R$/kg destino - R$/kg origem),
--   lancado na categoria de DESTINO (a "Evolucao de categoria" e' de quem chegou).
--   preco de referencia = o do v1_p0 da propria funcao: coalesce(pk P0, pk P1); categoria sem estoque nas duas pontas (so' passa no
--   meio do ano, ex. desmama M da NJ) = a tabela de precos do mes de P0 (valor_rebanho_mensal); sem nenhum, agio_sem_preco = true.
--   O total bate ao centavo com o do cache (zoot_mensal_cache.peso_evol_cat_entrada/_saida x preco da categoria): NJ 2025
--   -1.904.746,70; BG 2026 jan->out -53.695,80 (medicao de 05/11 10:13). O cache nao guarda o par origem -> destino, por isso o lancamento.
--   O que NAO muda: vpb, efeito e todas as chaves de hoje. producao = vpb - agio e' conta da tela (subtracao). A grade do DRE nao muda.
-- CHAVES NOVAS:
--   categorias[]: cab_reclass_entrada, cab_reclass_saida, at_reclass_entrada, at_reclass_saida, agio, agio_sem_preco; a categoria que
--     so' tem reclassificacao no periodo entra com as pontas em zero (q0 = q1 = 0, vpb = 0, efeito = 0).
--   total: agio, agio_sem_preco.
--   meses[] (V4, de P0 a P1): ano_mes, fonte ('fechamento' | 'cadastro'), arrobas, v_ref (kg x preco de referencia) e v_mes (kg x preco do
--     fechamento VALIDADO do mes; null quando alguma fazenda nao tem fechamento validado no mes — o grafico mostra "—").
--
-- METODO: patch guardado por md5 do prosrc, DEPOIS da 20261028115290 (origem = o destino dela). 2 ancoras exatamente 1x.
--   fn_dre_pecuaria_patrimonio  md5 prosrc ANTES 1b64aee80105219a78e0f10e0e126bef  DEPOIS 3b3a6739e568391bb25643a0cc2d86bd
-- ENSAIO (05/11, depois da 115290 na mesma transacao, RAISE no fim): NJ 2025 agio -1.904.746,70 e BG 2026 jan->out -53.695,80 (= o cache
--   ao centavo); vpb, efeito e as chaves de hoje iguais; NJ 2025 em 0,12 s. Por categoria (destino), NJ: garrotes -1.076.728,08 (desmama
--   M a R$ 420 -> garrote a R$ 330/@ de dez/24), novilhas -952.362,61, vacas -167.752,87, desmama F +267.825,78 (novilhas pesadas
--   reclassificadas para desmama: correcao de cadastro).
-- ACL refeita igual a' medida: {postgres, service_role, authenticated}; SECURITY DEFINER, STABLE, search_path pg_catalog, public.

do $mig$
declare
  v_antes text; v_novo text; i int; a text[]; b text[];
begin
  select prosrc into v_antes from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'fn_dre_pecuaria_patrimonio' and n.nspname = 'public';
  if md5(v_antes) <> '1b64aee80105219a78e0f10e0e126bef' then
    raise exception 'fn_dre_pecuaria_patrimonio nao esta no corpo esperado (md5 %; a 20261028115290 tem de vir antes). Migration abortada.', md5(v_antes); end if;
  a := array[
    $a$       from pt)
select jsonb_build_object('p0', (select p0 from per), 'p1', (select p1 from per),$a$,
    $a$  'categorias', coalesce((select jsonb_agg(jsonb_build_object('categoria',categoria,'q0',q0,'pm0',pm0,'pk0',pk0,'v0',v0,'q1',q1,'pm1',pm1,'pk1',pk1,'v1_p0',v1_p0,'v1_p1',v1_p1,'vpb',v1_p0-v0,'efeito',v1_p1-v1_p0) order by categoria) from c),'[]'::jsonb),
  'total', (select jsonb_build_object('q0',sum(q0),'v0',sum(v0),'q1',sum(q1),'v1_p0',sum(v1_p0),'v1_p1',sum(v1_p1),'vpb',sum(v1_p0-v0),'efeito',sum(v1_p1-v1_p0)) from c),$a$];
  b := array[
    $b$       from pt),
/* DRE-VARIACAO-EXPLICA-01 fatia 1a: cada reclassificacao do periodo (lancamento 'reclassificacao', origem -> destino), com o peso dela */
evl as (select l.fazenda_id, l.categoria o, l.categoria_destino d, l.quantidade q,
               l.quantidade * coalesce(nullif(l.peso_medio_kg,0), l.peso_total/nullif(l.quantidade,0), 0) kg
        from lancamentos l join per on true
        where l.cliente_id=p_cliente and l.cenario='realizado' and coalesce(l.cancelado,false)=false and l.tipo='reclassificacao'
          and (p_fazenda is null or l.fazenda_id=p_fazenda)
          and l.data >= to_date(left(p_de,7)||'-01','YYYY-MM-DD')
          and l.data <  (to_date(per.p1||'-01','YYYY-MM-DD') + interval '1 month')),
/* o preco de referencia = o do v1_p0 (cf: coalesce(a.pk, b.pk)); sem estoque nas pontas, a tabela de precos do mes de P0 */
evr as (select k.fazenda_id, k.categoria, coalesce(a.pk, b.pk,
               (select max(m.preco_kg) from valor_rebanho_mensal m
                 where m.cliente_id=p_cliente and m.fazenda_id=k.fazenda_id and m.categoria=k.categoria and m.ano_mes=per.p0)) pref
        from (select fazenda_id, o categoria from evl union select fazenda_id, d from evl) k join per on true
        left join pf0 a on a.fazenda_id=k.fazenda_id and a.categoria=k.categoria
        left join pf1 b on b.fazenda_id=k.fazenda_id and b.categoria=k.categoria),
/* o agio vai na categoria de DESTINO: cab x kg x (R$/kg destino - R$/kg origem), os dois a preco de referencia */
evp as (select e.*, ro.pref p_o, rd.pref p_d, e.kg*(rd.pref - ro.pref) agio
        from evl e left join evr ro on ro.fazenda_id=e.fazenda_id and ro.categoria=e.o
                   left join evr rd on rd.fazenda_id=e.fazenda_id and rd.categoria=e.d),
evc as (select k.categoria,
               coalesce((select sum(q) from evp where evp.d=k.categoria),0) cab_in, coalesce((select sum(q) from evp where evp.o=k.categoria),0) cab_out,
               round(coalesce((select sum(kg) from evp where evp.d=k.categoria),0)/30.0,2) at_in,
               round(coalesce((select sum(kg) from evp where evp.o=k.categoria),0)/30.0,2) at_out,
               round(coalesce((select sum(agio) from evp where evp.d=k.categoria),0),2) agio,
               coalesce((select bool_or(agio is null and kg<>0) from evp where evp.d=k.categoria),false) sem_preco
        from (select o categoria from evl union select d from evl) k),
/* V4: o rebanho no fim de cada mes de P0 a P1 — o fechamento VALIDADO; sem ele, o cadastro (sem preco do mes) */
mref as (select fazenda_id, categoria, coalesce(a.pk, b.pk) pref from (select fazenda_id, categoria from pf0 union select fazenda_id, categoria from pf1) k
         left join pf0 a using (fazenda_id, categoria) left join pf1 b using (fazenda_id, categoria)),
mes as (select to_char(g, 'YYYY-MM') am from per, generate_series(to_date(per.p0||'-01','YYYY-MM-DD'), to_date(per.p1||'-01','YYYY-MM-DD'), interval '1 month') g),
mfz as (select distinct fazenda_id from (select fazenda_id from pf0 union select fazenda_id from pf1) x),
mf as (select ms.am, f.fazenda_id,
              exists (select 1 from valor_rebanho_realizado_validado rv where rv.cliente_id=p_cliente and rv.fazenda_id=f.fazenda_id
                        and rv.ano_mes=ms.am and rv.status='validado') valido
       from mes ms cross join mfz f),
mk as (select mf.am, mf.valido, i.fazenda_id, i.categoria, i.quantidade*i.peso_medio_kg kg, i.preco_kg pk
       from mf join valor_rebanho_fechamento_itens i on i.cliente_id=p_cliente and i.fazenda_id=mf.fazenda_id and i.ano_mes=mf.am
       where mf.valido
       union all
       select mf.am, mf.valido, z.fazenda_id, z.categoria_codigo, z.saldo_final*z.peso_medio_final, null::numeric
       from mf join zoot_mensal_cache z on z.cliente_id=p_cliente and z.fazenda_id=mf.fazenda_id and z.ano_mes=mf.am and z.cenario='realizado'
       where not mf.valido),
mv as (select ms.am,
              case when bool_and(mf.valido) then 'fechamento' else 'cadastro' end fonte,
              (select round(sum(coalesce(k.kg,0))/30.0,2) from mk k where k.am=ms.am) arrobas,
              (select round(sum(coalesce(k.kg,0)*r.pref),2) from mk k left join mref r on r.fazenda_id=k.fazenda_id and r.categoria=k.categoria where k.am=ms.am) v_ref,
              case when bool_and(mf.valido) then (select round(sum(coalesce(k.kg,0)*k.pk),2) from mk k where k.am=ms.am) end v_mes
       from mes ms join mf on mf.am=ms.am group by ms.am)
select jsonb_build_object('p0', (select p0 from per), 'p1', (select p1 from per),$b$,
    $b$  'categorias', coalesce((select jsonb_agg(o order by cat) from (
      select c.categoria cat,
             jsonb_build_object('categoria',c.categoria,'q0',c.q0,'pm0',c.pm0,'pk0',c.pk0,'v0',c.v0,'q1',c.q1,'pm1',c.pm1,'pk1',c.pk1,'v1_p0',c.v1_p0,'v1_p1',c.v1_p1,'vpb',c.v1_p0-c.v0,'efeito',c.v1_p1-c.v1_p0)
             || jsonb_build_object('cab_reclass_entrada',coalesce(e.cab_in,0),'cab_reclass_saida',coalesce(e.cab_out,0),
                                   'at_reclass_entrada',coalesce(e.at_in,0),'at_reclass_saida',coalesce(e.at_out,0),
                                   'agio',coalesce(e.agio,0),'agio_sem_preco',coalesce(e.sem_preco,false)) o
        from c left join evc e on e.categoria=c.categoria
      union all
      select e.categoria,
             jsonb_build_object('categoria',e.categoria,'q0',0,'pm0',null,'pk0',null,'v0',0,'q1',0,'pm1',null,'pk1',null,'v1_p0',0,'v1_p1',0,'vpb',0,'efeito',0)
             || jsonb_build_object('cab_reclass_entrada',e.cab_in,'cab_reclass_saida',e.cab_out,'at_reclass_entrada',e.at_in,'at_reclass_saida',e.at_out,
                                   'agio',coalesce(e.agio,0),'agio_sem_preco',e.sem_preco)
        from evc e where not exists (select 1 from c where c.categoria=e.categoria)) x),'[]'::jsonb),
  'total', (select jsonb_build_object('q0',sum(q0),'v0',sum(v0),'q1',sum(q1),'v1_p0',sum(v1_p0),'v1_p1',sum(v1_p1),'vpb',sum(v1_p0-v0),'efeito',sum(v1_p1-v1_p0)) from c)
           || jsonb_build_object('agio',coalesce(round((select sum(agio) from evp),2),0),'agio_sem_preco',coalesce((select bool_or(agio is null and kg<>0) from evp),false)),
  'meses', coalesce((select jsonb_agg(jsonb_build_object('ano_mes',am,'fonte',fonte,'arrobas',arrobas,'v_ref',v_ref,'v_mes',v_mes) order by am) from mv),'[]'::jsonb),$b$];
  v_novo := v_antes;
  for i in 1..array_length(a,1) loop
    if (length(v_novo) - length(replace(v_novo, a[i], ''))) / length(a[i]) <> 1 then
      raise exception 'fn_dre_pecuaria_patrimonio: a ancora % nao casa exatamente 1x. Migration abortada.', i; end if;
    v_novo := replace(v_novo, a[i], b[i]);
  end loop;
  execute 'CREATE OR REPLACE FUNCTION public.fn_dre_pecuaria_patrimonio(p_cliente uuid, p_fazenda uuid, p_de text, p_ate text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''pg_catalog'', ''public'' AS $fn$' || v_novo || '$fn$';
  select prosrc into v_antes from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'fn_dre_pecuaria_patrimonio' and n.nspname = 'public';
  if md5(v_antes) <> '3b3a6739e568391bb25643a0cc2d86bd' then
    raise exception 'fn_dre_pecuaria_patrimonio: corpo resultante inesperado (md5 %). Esperado 3b3a6739e568391bb25643a0cc2d86bd.', md5(v_antes); end if;
  -- a guarda de cliente (SEG-DRE-TENANT-01, LANGUAGE sql) segue como primeira instrucao
  if position('select public._fn_exigir_tenant(p_cliente);' in v_antes) = 0 then
    raise exception 'fn_dre_pecuaria_patrimonio perdeu a guarda de cliente (_fn_exigir_tenant). Migration abortada.'; end if;
end $mig$;
REVOKE ALL ON FUNCTION public.fn_dre_pecuaria_patrimonio(p_cliente uuid, p_fazenda uuid, p_de text, p_ate text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_dre_pecuaria_patrimonio(p_cliente uuid, p_fazenda uuid, p_de text, p_ate text) TO authenticated, service_role;
