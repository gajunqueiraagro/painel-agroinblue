-- P95 (DANFE-CHAVE-EM-GRUPOS-01, Gabriel 23/10/2026; o caso da NF 46.994) — a nota paga no CARTAO em N parcelas lancadas SOLTAS, a mao
-- ("… - 3/6"), com o numero da nota so' em algumas: `fn_nota_ja_lancada` achava pelo numero so' as que o tinham. Agora, a partir das
-- achadas pelo NUMERO ou pela CHAVE que tem a fracao "k/N" no fim da descricao, vem tambem as IRMAS: o mesmo fornecedor, a fracao "j/N"
-- (o mesmo N), o valor ≈ nota / N (ate' 5 centavos por parcela: quem dividiu arredonda) e a data na janela da nota (10 dias antes da
-- emissao ate' N + 2 meses depois). Voltam com `por` 'fracao' e `fracao_n` = N. So' leitura; nada muda nos lancamentos.
-- Patch do corpo vivo guardado pelo md5, por TEXTO literal (cada trecho com a contagem exata).
CREATE OR REPLACE FUNCTION pg_temp._troca_texto(p_fn regprocedure, p_md5 text, p_pares text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE d text := pg_get_functiondef(p_fn); i int; n int;
BEGIN
  IF md5(d) <> p_md5 THEN RAISE EXCEPTION '% mudou (md5 %, esperado %)', p_fn, md5(d), p_md5; END IF;
  FOR i IN 1..array_length(p_pares, 1) / 3 LOOP
    n := (length(d) - length(replace(d, p_pares[3*i-2], ''))) / length(p_pares[3*i-2]);
    IF n <> p_pares[3*i]::int THEN RAISE EXCEPTION '% trecho %: % ocorrencias, esperado %', p_fn, i, n, p_pares[3*i]; END IF;
    d := replace(d, p_pares[3*i-2], p_pares[3*i-1]);
  END LOOP;
  EXECUTE d;
END $$;

SELECT pg_temp._troca_texto('public.fn_nota_ja_lancada(uuid,jsonb,text,text,text,text[])', 'c95457d108ac033d177118769edad29d', ARRAY[
  $p$        v_nomes text[]; v_ret jsonb;$p$,
  $r$        v_nomes text[]; v_ret jsonb; v_total bigint; v_d0 date;$r$, '1',
  $p$  SELECT coalesce(array_agg(DISTINCT c), '{}') INTO v_nomes$p$,
  $r$  -- P95: o total da nota (a soma das parcelas) e a data dela (a primeira), para as irmas da fracao
  SELECT sum((e->>'valor_cent')::bigint), min((e->>'vencimento')::date) INTO v_total, v_d0 FROM jsonb_array_elements(coalesce(p_parcelas, '[]'::jsonb)) e;
  SELECT coalesce(array_agg(DISTINCT c), '{}') INTO v_nomes$r$, '1',
  $p$  achados AS (
    SELECT id FROM por_valor UNION SELECT id FROM por_numero UNION SELECT id FROM por_chave
  )$p$,
  $r$  -- P95: a nota no cartao em N parcelas soltas ("… - 3/6"): das achadas pelo numero/chave com a fracao k/N na descricao, as IRMAS
  -- do mesmo fornecedor com a fracao j/N, o valor ≈ nota/N (5 centavos por parcela) e a data na janela da nota
  ancora AS (
    SELECT DISTINCT l.favorecido_id, m[2]::int n FROM public.financeiro_lancamentos_v2 l
      CROSS JOIN LATERAL regexp_match(coalesce(l.descricao, ''), '(\d{1,2})\s*/\s*(\d{1,2})\s*$') m
     WHERE l.id IN (SELECT id FROM por_numero UNION SELECT id FROM por_chave) AND NOT l.cancelado AND l.favorecido_id IS NOT NULL
       AND m[2]::int BETWEEN 2 AND 72 AND m[1]::int BETWEEN 1 AND m[2]::int
  ),
  por_fracao AS (
    SELECT DISTINCT ON (l.id) l.id, a.n FROM vivos l
      JOIN ancora a ON a.favorecido_id = l.favorecido_id
      CROSS JOIN LATERAL regexp_match(coalesce(l.descricao, ''), '(\d{1,2})\s*/\s*(\d{1,2})\s*$') m
     WHERE v_total > 0 AND m[2]::int = a.n AND m[1]::int BETWEEN 1 AND a.n
       AND abs(round(l.valor * 100)::bigint * a.n - v_total) <= 5 * a.n
       AND coalesce(l.data_vencimento, l.data_pagamento, l.data_competencia) BETWEEN v_d0 - 10 AND (v_d0 + make_interval(months => a.n + 2))::date
     ORDER BY l.id, a.n
  ),
  achados AS (
    SELECT id FROM por_valor UNION SELECT id FROM por_numero UNION SELECT id FROM por_chave UNION SELECT id FROM por_fracao
  )$r$, '1',
  $p$CASE WHEN pc.id IS NOT NULL THEN 'chave' END], NULL)))$p$,
  $r$CASE WHEN pc.id IS NOT NULL THEN 'chave' END,
                                              CASE WHEN pf.id IS NOT NULL THEN 'fracao' END], NULL)), 'fracao_n', pf.n)$r$, '1',
  $p$LEFT JOIN por_chave pc ON pc.id = l.id;$p$,
  $r$LEFT JOIN por_chave pc ON pc.id = l.id LEFT JOIN por_fracao pf ON pf.id = l.id;$r$, '1']);
