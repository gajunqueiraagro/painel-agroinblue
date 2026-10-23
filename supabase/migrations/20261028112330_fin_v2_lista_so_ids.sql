-- P73 (Gabriel 23/10/2026; achado do FIN-CLASSIF-DIVIDIDA-01b/01c) — salvou, rele^ SO' o lancamento. `fn_fin_v2_lista_pagina` aceita no
-- `p_ordem`: `so_ids` (os ids salvos) — devolve SO' essas linhas, no MESMO formato e no MESMO recorte (filtros, valor da parte do
-- dividido, conciliado), sem totais/contagens (a tela troca a linha); e `so_ids_totais = true` — as mesmas linhas E os totais do recorte
-- inteiro (o que mudou mexe no total: valor, status, conta, sem caixa; ou o dividido com filtro de conta). Sem `so_ids`, nada muda.
-- Patch do corpo vivo guardado pelo md5 (a funcao tem 23 mil caracteres; o canal recusa o corpo inteiro).
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

SELECT pg_temp._troca('public.fn_fin_v2_lista_pagina(uuid,jsonb,jsonb,integer,integer)', '7a923aa78881d4a15e110f7ba5643528', ARRAY[
  $p$(  v_so boolean := coalesce\(\(p_ordem->>'so_linhas'\)::boolean, false\);)$p$,
  $r$\1
  -- P73: so' os ids salvos (a tela troca a linha); com `so_ids_totais`, tambem os totais do recorte inteiro
  v_ids uuid[] := case when jsonb_typeof(p_ordem->'so_ids') = 'array' then array(select jsonb_array_elements_text(p_ordem->'so_ids')::uuid) end;
  v_ids_tot boolean := coalesce((p_ordem->>'so_ids_totais')::boolean, false);$r$, '1',
  $p$(     where l\.cliente_id = p_cliente\n)$p$,
  $r$\1       and (v_ids is null or v_ids_tot or l.id = any (v_ids))
$r$, '1',
  $p$where od\.pos > v_pag \* v_por and od\.pos <= \(v_pag \+ 1\) \* v_por\)$p$,
  $r$where (case when v_ids is not null then od.id = any (v_ids) else od.pos > v_pag * v_por and od.pos <= (v_pag + 1) * v_por end))$r$, '1',
  $p$case when v_so then null else$p$,
  $r$case when v_so or v_ids is not null and not v_ids_tot then null else$r$, '4',
  $p$'total_linhas', \(select count\(\*\) from grade\)$p$,
  $r$'total_linhas', case when v_ids is not null and not v_ids_tot then null else (select count(*) from grade) end$r$, '1']);
