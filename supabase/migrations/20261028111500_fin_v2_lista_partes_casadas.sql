-- FIN-V2-LISTA-FLAG-01 (parte 3) / FIN-CLASSIF-DIVIDIDA-01a-2 — a linha do lancamento DIVIDIDO na lista (`fn_fin_v2_lista_pagina`) traz,
-- alem de `valor_parte`/`partes_total`/`partes_casadas`, as PARTES que casam com o filtro (ordem, valor, %, conta e o que ela deriva):
-- o export escreve uma linha por parte com a classificacao dela, e a celula do 01c pode nomear a conta. Sem divisao, nada muda.
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

SELECT pg_temp._troca('public.fn_fin_v2_lista_pagina(uuid,jsonb,jsonb,integer,integer)', '6692dcdbff8636fd3d3e61ff6b2c9f0f', ARRAY[
  $p$(\n\s*)else '\{\}'::jsonb end order by od\.pos\)$p$,
  $r$\1   || jsonb_build_object('partes', (select jsonb_agg(jsonb_build_object('ordem', p.ordem, 'valor', p.valor, 'percentual', p.percentual,
                           'plano_conta_id', p.plano_conta_id, 'macro_custo', p.macro_custo, 'grupo_custo', p.grupo_custo, 'centro_custo', p.centro_custo,
                           'subcentro', p.subcentro, 'escopo_negocio', p.escopo_negocio, 'safra_id', p.safra_id, 'cultura', p.cultura) order by p.ordem)
                         from public.financeiro_lancamento_partes p where p.lancamento_id = l.id
                          and public._fn_fin_parte_casa(p, v_macro, v_grupo, v_centro, v_sub, v_safra, v_safra_id, v_cultura, v_ativ)))\1else '{}'::jsonb end order by od.pos)$r$, '1']);
