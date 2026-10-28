-- P128a (Gabriel 27/10/2026, NOTA-JA-LANCADA, decisoes de 20:0x) — a busca de "nota ja' lancada" acha TODOS os irmaos da nota.
-- Patch guardado por md5 da `fn_nota_ja_lancada` (o corpo de antes fica; so' entram caminhos novos — a mesma funcao, nada paralelo):
-- (1) o NUMERO tambem num DOCUMENTO anexado (`vw_lancamento_documentos.numero`), nao so' no `numero_documento` (Racaforte, Ferri & Prado);
-- (2) "PELA SOMA" (decisao a): o parcelamento do MESMO fornecedor (raiz do CNPJ do emitente) cuja soma dos vivos e' EXATAMENTE a da nota —
--     o caso Somak (7 parcelas sem numero nem chave, 33.000,00 + 2 x 12.833,34 + 4 x 12.833,33 = 110.000,00);
-- (3) os IRMAOS DO MESMO PARCELAMENTO de um achado (vivos): a parcela que SOBRA no sistema aparece (Racaforte: a 5/5 de 20/02/27);
-- (4) no retorno: `parcela_n` (o numero da parcela no parcelamento), `tem_esta_nota` (o documento com ESTA chave ja' esta' nele) e
--     `documentos` (quantos documentos vivos ele tem) — a coluna "Documento hoje" da tabela sistema x nota.
-- `por` ganha 'documento', 'soma' e 'parcelamento'. A ocorrencia da chave deixa de bloquear na TELA (decisao b) — aqui ja' era um caminho.
SET LOCAL lock_timeout = '2s';

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

SELECT pg_temp._troca_texto('public.fn_nota_ja_lancada(uuid,jsonb,text,text,text,text[])', 'b9c5a7be1347e42373de08e414f66544', ARRAY[
-- 1. o numero no documento anexado + os cadastros do emitente pela raiz do CNPJ (o "pela soma" nao tem outro candidato)
$p$  testar AS (SELECT DISTINCT favorecido_id id FROM (SELECT favorecido_id FROM cand_valor UNION ALL SELECT favorecido_id FROM cand_numero) x
              WHERE favorecido_id IS NOT NULL),$p$,
$r$  -- P128a: o NUMERO tambem num DOCUMENTO anexado (o lancamento sem `numero_documento`, com a NF no clipe)
  cand_doc AS (
    SELECT DISTINCT l.id, l.favorecido_id FROM public.vw_lancamento_documentos d JOIN todos l ON l.id = d.lancamento_id
     WHERE v_num <> '' AND d.cliente_id = p_cliente AND d.cancelado IS NOT TRUE
       AND strpos(regexp_replace(coalesce(d.numero, ''), '\D', '', 'g'), v_num) > 0
       AND ltrim(regexp_replace(d.numero, '\D', '', 'g'), '0') = v_num
  ),
  -- P128a: os cadastros do emitente pela RAIZ do CNPJ
  forn_cnpj AS (
    SELECT f.id FROM public.financeiro_fornecedores f
     WHERE f.cliente_id = p_cliente AND length(v_raiz) = 8 AND length(regexp_replace(coalesce(f.cpf_cnpj, ''), '\D', '', 'g')) = 14
       AND left(regexp_replace(f.cpf_cnpj, '\D', '', 'g'), 8) = v_raiz
  ),
  testar AS (SELECT DISTINCT favorecido_id id FROM (SELECT favorecido_id FROM cand_valor UNION ALL SELECT favorecido_id FROM cand_numero
              UNION ALL SELECT favorecido_id FROM cand_doc UNION ALL SELECT id FROM forn_cnpj) x
              WHERE favorecido_id IS NOT NULL),$r$, '1',
-- 2. por documento e "pela soma"
$p$  por_numero AS (SELECT c.id FROM cand_numero c JOIN alvo a ON a.id = c.favorecido_id),$p$,
$r$  por_numero AS (SELECT c.id FROM cand_numero c JOIN alvo a ON a.id = c.favorecido_id),
  por_documento AS (SELECT c.id FROM cand_doc c JOIN alvo a ON a.id = c.favorecido_id),
  -- P128a (decisao a): "PELA SOMA" — o parcelamento cujos vivos sao TODOS do emitente (raiz do CNPJ) e somam EXATAMENTE a nota
  por_soma AS (
    SELECT l.id FROM vivos l
     WHERE v_total > 0 AND l.financiamento_id IN (
       SELECT x.financiamento_id FROM vivos x WHERE x.financiamento_id IS NOT NULL
        GROUP BY x.financiamento_id
       HAVING bool_and(x.favorecido_id IN (SELECT id FROM forn_cnpj)) AND sum(round(x.valor * 100)::bigint) = v_total)
  ),$r$, '1',
-- 3. a ancora da fracao tambem pelo documento
$p$     WHERE l.id IN (SELECT id FROM por_numero UNION SELECT id FROM por_chave) AND NOT l.cancelado AND l.favorecido_id IS NOT NULL$p$,
$r$     WHERE l.id IN (SELECT id FROM por_numero UNION SELECT id FROM por_chave UNION SELECT id FROM por_documento) AND NOT l.cancelado AND l.favorecido_id IS NOT NULL$r$, '1',
-- 4. os achados + os irmaos do mesmo parcelamento
$p$  achados AS (
    SELECT id FROM por_valor UNION SELECT id FROM por_numero UNION SELECT id FROM por_chave UNION SELECT id FROM por_fracao
  )$p$,
$r$  achados0 AS (
    SELECT id FROM por_valor UNION SELECT id FROM por_numero UNION SELECT id FROM por_chave UNION SELECT id FROM por_fracao
    UNION SELECT id FROM por_documento UNION SELECT id FROM por_soma
  ),
  -- P128a: os IRMAOS do mesmo parcelamento de um achado (vivos) — a parcela que SOBRA no sistema aparece
  por_parcelamento AS (
    SELECT l.id FROM vivos l
     WHERE l.financiamento_id IN (SELECT y.financiamento_id FROM achados0 a0 JOIN public.financeiro_lancamentos_v2 y ON y.id = a0.id
                                   WHERE y.financiamento_id IS NOT NULL AND NOT y.cancelado)
  ),
  achados AS (SELECT id FROM achados0 UNION SELECT id FROM por_parcelamento)$r$, '1',
-- 5. o retorno: os caminhos novos, a parcela, a nota e os documentos
$p$                                              CASE WHEN pf.id IS NOT NULL THEN 'fracao' END], NULL)), 'fracao_n', pf.n)$p$,
$r$                                              CASE WHEN pf.id IS NOT NULL THEN 'fracao' END,
                                              CASE WHEN pd.id IS NOT NULL THEN 'documento' END,
                                              CASE WHEN ps.id IS NOT NULL THEN 'soma' END,
                                              CASE WHEN pp.id IS NOT NULL AND pv.id IS NULL AND pn.id IS NULL AND pc.id IS NULL AND pf.id IS NULL
                                                        AND pd.id IS NULL AND ps.id IS NULL THEN 'parcelamento' END], NULL)), 'fracao_n', pf.n,
           'parcela_n', (SELECT fp.numero_parcela FROM public.financiamento_parcelas fp WHERE fp.lancamento_id = l.id ORDER BY fp.numero_parcela LIMIT 1),
           'tem_esta_nota', EXISTS (SELECT 1 FROM public.vw_lancamento_documentos d WHERE d.lancamento_id = l.id AND d.cancelado IS NOT TRUE
                                     AND length(v_chave) = 44 AND regexp_replace(coalesce(d.chave_acesso, ''), '\D', '', 'g') = v_chave),
           'documentos', (SELECT count(*) FROM public.vw_lancamento_documentos d WHERE d.lancamento_id = l.id AND d.cancelado IS NOT TRUE))$r$, '1',
-- 6. as juncoes dos caminhos novos
$p$LEFT JOIN por_fracao pf ON pf.id = l.id;$p$,
$r$LEFT JOIN por_fracao pf ON pf.id = l.id
    LEFT JOIN por_documento pd ON pd.id = l.id LEFT JOIN por_soma ps ON ps.id = l.id LEFT JOIN por_parcelamento pp ON pp.id = l.id;$r$, '1']);
