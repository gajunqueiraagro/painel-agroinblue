-- FIN-CLASSIF-DIVIDIDA-01a-2 — parte 3: a lista paginada do Financeiro (`fn_fin_v2_lista_pagina`, o caminho padrao). Lancamento DIVIDIDO:
-- os filtros de classificacao (macro, grupo, centro, subcentro, safra, cultura, atividade) casam pelas PARTES; o `valor` da linha e' a
-- soma das partes que casam (sem filtro = o total), e e' esse valor que entra nos totais do filtro e na ordenacao por valor. A linha
-- traz, na mesma ida, `valor_parte`, `partes_total` e `partes_casadas` (a tela do 01c: "R$ 1.055,00 / de R$ 9.583,00", selo "1 de 2
-- contas"). Lancamento sem divisao: nada muda (le a propria linha, como hoje).
CREATE OR REPLACE FUNCTION public._fn_fin_parte_casa(p public.financeiro_lancamento_partes, p_macro text, p_grupo text, p_centro text, p_sub text,
                                                     p_safra text, p_safra_id uuid, p_cultura text, p_ativ text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT (p_macro IS NULL OR p.macro_custo = p_macro) AND (p_grupo IS NULL OR p.grupo_custo = p_grupo)
     AND (p_centro IS NULL OR p.centro_custo = p_centro) AND (p_sub IS NULL OR p.subcentro = p_sub)
     AND (p_safra IS NULL OR (CASE WHEN p_safra = '__sem_safra__' THEN p.safra_id IS NULL ELSE p.safra_id = p_safra_id END))
     AND (p_cultura IS NULL OR (CASE WHEN p_cultura = '__sem_cultura__' THEN coalesce(p.cultura, '') = '' ELSE p.cultura = p_cultura END))
     AND (p_ativ IS NULL OR p_ativ = CASE
            WHEN lower(btrim(coalesce(p.escopo_negocio, ''))) IN ('pecuaria', 'pecuária') THEN 'pecuaria'
            WHEN lower(btrim(coalesce(p.escopo_negocio, ''))) IN ('agricultura', 'agri') THEN 'agricultura'
            WHEN lower(btrim(coalesce(p.escopo_negocio, ''))) = 'silvicultura' THEN 'silvicultura'
            WHEN lower(btrim(coalesce(p.escopo_negocio, ''))) = 'administrativo' THEN 'administrativo'
            ELSE 'outros' END)
$$;
REVOKE ALL ON FUNCTION public._fn_fin_parte_casa(public.financeiro_lancamento_partes, text, text, text, text, text, uuid, text, text) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION pg_temp._troca(p_fn regprocedure, p_md5 text, p_pares text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE d text := pg_get_functiondef(p_fn); i int; n int;
BEGIN
  IF md5(d) <> p_md5 THEN RAISE EXCEPTION '% mudou (md5 %, esperado %)', p_fn, md5(d), p_md5; END IF;
  FOR i IN 1..array_length(p_pares, 1) / 3 LOOP
    n := (SELECT count(*) FROM regexp_matches(d, p_pares[3*i-2], 'g'));
    IF n <> p_pares[3*i]::int THEN RAISE EXCEPTION '% trecho %: % ocorrencias, esperado %', p_fn, i, n, p_pares[3*i]; END IF;
    d := regexp_replace(d, p_pares[3*i-2], p_pares[3*i-1], 'g');
  END LOOP;
  EXECUTE d;
END $$;

SELECT pg_temp._troca('public.fn_fin_v2_lista_pagina(uuid,jsonb,jsonb,integer,integer)', '677e974dd84cf8be151fa5a0e950f133', ARRAY[
  $p$select l\.id, l\.valor, l\.sinal,$p$,
  $r$select l.id, case when l.classificacao_dividida then (select sign(l.valor) * sum(p.valor) from public.financeiro_lancamento_partes p
                where p.lancamento_id = l.id and public._fn_fin_parte_casa(p, v_macro, v_grupo, v_centro, v_sub, v_safra, v_safra_id, v_cultura, v_ativ))
                else l.valor end as valor, l.classificacao_dividida as dividida, l.sinal,$r$, '1',
  $p$and \(v_macro(\s+)is null or l\.macro_custo(\s+)= v_macro\)$p$,
  $r$and (not l.classificacao_dividida or exists (select 1 from public.financeiro_lancamento_partes p where p.lancamento_id = l.id
              and public._fn_fin_parte_casa(p, v_macro, v_grupo, v_centro, v_sub, v_safra, v_safra_id, v_cultura, v_ativ)))
       and (l.classificacao_dividida or v_macro\1is null or l.macro_custo\2= v_macro)$r$, '1',
  $p$and \(v_(grupo|centro|sub)(\s+)is null or l\.$p$, $r$and (l.classificacao_dividida or v_\1\2is null or l.$r$, '3',
  $p$and \(v_(safra|cultura) is null or \(case$p$, $r$and (l.classificacao_dividida or v_\1 is null or (case$r$, '2',
  $p$and \(v_ativ is null or v_ativ = case$p$, $r$and (l.classificacao_dividida or v_ativ is null or v_ativ = case$r$, '1',
  $p$jsonb_agg\(to_jsonb\(l\) \|\| jsonb_build_object\('conciliado', g\.conciliado\) order by od\.pos\)$p$,
  $r$jsonb_agg(to_jsonb(l) || jsonb_build_object('conciliado', g.conciliado)
                   || case when g.dividida then jsonb_build_object('valor_parte', abs(g.valor),
                        'partes_total', (select count(*) from public.financeiro_lancamento_partes p where p.lancamento_id = l.id),
                        'partes_casadas', (select count(*) from public.financeiro_lancamento_partes p where p.lancamento_id = l.id
                           and public._fn_fin_parte_casa(p, v_macro, v_grupo, v_centro, v_sub, v_safra, v_safra_id, v_cultura, v_ativ)))
                      else '{}'::jsonb end order by od.pos)$r$, '1']);
