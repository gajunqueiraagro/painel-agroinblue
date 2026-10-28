-- P128c (Gabriel 28/10/2026: OK de banco para o `p_lancamento`; decisão A1 = DROP + CREATE) — a `fn_nota_ja_lancada` ganha a ÂNCORA da
-- porta 2: `p_lancamento uuid DEFAULT NULL` (o último). Com ele, o lançamento aberto no Editar entra sempre (vivo, do cliente) com `por`
-- 'lancamento', ache a nota ele ou não (Somak: sem nº, sem chave), e é âncora dos IRMÃOS do parcelamento dele (a regra da 113010: o mesmo
-- fornecedor). Sem ele (a porta 1, a chamada de 6 parâmetros pelo nome), nada muda.
-- ⚠ DROP + CREATE: um parâmetro novo muda a assinatura (o CREATE OR REPLACE não deixa) e a sobrecarga deixaria a chamada de 6 AMBÍGUA.
--   O corpo NÃO se redigita: é o de hoje (`pg_get_functiondef`, md5 guardado) com os trechos trocados abaixo, contados; os grants voltam
--   como estavam (authenticated, service_role; nada para PUBLIC/anon). Ninguém mais chama a função (conferido em 28/10: sem chamadores).
SET LOCAL lock_timeout = '2s';

DO $m$
DECLARE
  d text := pg_get_functiondef('public.fn_nota_ja_lancada(uuid,jsonb,text,text,text,text[])'::regprocedure);
  pares text[] := ARRAY[
    -- 1. a assinatura
    'p_emitente_documento text, p_nomes text[])',
    'p_emitente_documento text, p_nomes text[], p_lancamento uuid DEFAULT NULL::uuid)',
    -- 2. a âncora: o lançamento aberto, vivo e do cliente (o `vivos` já filtra o cliente e o cancelado)
    E'  por_chave AS (\n',
    E'  -- P128c: a ÂNCORA da porta 2 — o lançamento aberto no Editar, ache a nota ele ou não\n  por_lancamento AS (SELECT l.id FROM vivos l WHERE p_lancamento IS NOT NULL AND l.id = p_lancamento),\n  por_chave AS (\n',
    -- 3. ela entra nos achados e é âncora dos irmãos
    E'    UNION SELECT id FROM por_documento UNION SELECT id FROM por_soma\n  ),',
    E'    UNION SELECT id FROM por_documento UNION SELECT id FROM por_soma UNION SELECT id FROM por_lancamento\n  ),',
    E'                                  UNION SELECT id FROM por_documento UNION SELECT id FROM por_soma) a0',
    E'                                  UNION SELECT id FROM por_documento UNION SELECT id FROM por_soma UNION SELECT id FROM por_lancamento) a0',
    -- 4. o `por`: 'lancamento' (e o 'parcelamento' não marca a própria âncora)
    E'                                              CASE WHEN ps.id IS NOT NULL THEN ''soma'' END,\n',
    E'                                              CASE WHEN ps.id IS NOT NULL THEN ''soma'' END,\n                                              CASE WHEN pl.id IS NOT NULL THEN ''lancamento'' END,\n',
    E'AND pd.id IS NULL AND ps.id IS NULL THEN ''parcelamento'' END], NULL))',
    E'AND pd.id IS NULL AND ps.id IS NULL AND pl.id IS NULL THEN ''parcelamento'' END], NULL))',
    -- 5. a junção
    'LEFT JOIN por_parcelamento pp ON pp.id = l.id;',
    'LEFT JOIN por_parcelamento pp ON pp.id = l.id LEFT JOIN por_lancamento pl ON pl.id = l.id;'];
  i int; n int;
BEGIN
  IF md5(d) <> '945a72a79f5dbad54d09364efce42aa4' THEN RAISE EXCEPTION 'fn_nota_ja_lancada mudou (md5 %)', md5(d); END IF;
  FOR i IN 1..array_length(pares, 1) / 2 LOOP
    n := (length(d) - length(replace(d, pares[2*i-1], ''))) / length(pares[2*i-1]);
    IF n <> 1 THEN RAISE EXCEPTION 'trecho %: % ocorrencias, esperado 1', i, n; END IF;
    d := replace(d, pares[2*i-1], pares[2*i]);
  END LOOP;
  DROP FUNCTION public.fn_nota_ja_lancada(uuid, jsonb, text, text, text, text[]);
  EXECUTE d;
END $m$;

REVOKE ALL ON FUNCTION public.fn_nota_ja_lancada(uuid, jsonb, text, text, text, text[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_nota_ja_lancada(uuid, jsonb, text, text, text, text[], uuid) TO authenticated, service_role;
