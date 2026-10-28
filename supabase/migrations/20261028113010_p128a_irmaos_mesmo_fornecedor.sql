-- P128a (Gabriel 28/10/2026 06:0x, decisao a) — o IRMAO DO PARCELAMENTO (`por_parcelamento` da `fn_nota_ja_lancada`, migration 20261028113000)
-- so' entra quando:
-- (1) e' do MESMO FORNECEDOR do achado que o puxou (o teste antigo nota_ja_lancada_01 trouxe as parcelas de uma amortizacao de OUTRO
--     fornecedor, irmas de um achado);
-- (2) o achado que o puxou NAO veio so' pelo valor (numero, chave, fracao, documento ou soma): um valor que coincide numa parcela de
--     emprestimo puxaria o emprestimo inteiro.
-- Patch guardado por md5 da funcao aplicada pela 113000 (so' a CTE `por_parcelamento` muda; funcao de leitura).
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

SELECT pg_temp._troca_texto('public.fn_nota_ja_lancada(uuid,jsonb,text,text,text,text[])', 'de0a6d896b3b1f657df211cb073e74b2', ARRAY[
$p$  por_parcelamento AS (
    SELECT l.id FROM vivos l
     WHERE l.financiamento_id IN (SELECT y.financiamento_id FROM achados0 a0 JOIN public.financeiro_lancamentos_v2 y ON y.id = a0.id
                                   WHERE y.financiamento_id IS NOT NULL AND NOT y.cancelado)
  ),$p$,
$r$  por_parcelamento AS (
    SELECT l.id FROM vivos l
     WHERE EXISTS (SELECT 1 FROM (SELECT id FROM por_numero UNION SELECT id FROM por_chave UNION SELECT id FROM por_fracao
                                  UNION SELECT id FROM por_documento UNION SELECT id FROM por_soma) a0
                     JOIN public.financeiro_lancamentos_v2 y ON y.id = a0.id
                    WHERE y.financiamento_id = l.financiamento_id AND y.favorecido_id = l.favorecido_id AND NOT y.cancelado)
  ),$r$, '1']);
