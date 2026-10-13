-- CUSTEIO-HASH-01 — o hash explicito e' a MARCA DE ORIGEM de quem nao tem lote: o gatilho nao o apaga
-- (Gabriel, 13/10/2026: o gatilho so' CALCULA o hash de quem tem lote de Excel e NUNCA apaga o que veio explicito).
--
-- O DEFEITO: `trg_financeiro_lancamento_v2_hash` -> `set_financeiro_lancamento_v2_hash()` fazia
--   `NEW.hash_importacao := NULL` sempre que `lote_importacao_id IS NULL`, em INSERT e em UPDATE. O importador de custeio grava
--   o hash do item (`hashItemCusteio`, pelo `buildInsertRow`) SEM lote; o gatilho o apagava antes de gravar, e a previa
--   (`conferirLancados`, `.in('hash_importacao', hashes)`) nunca reconhecia o que ja' tinha sido lancado — propunha o arquivo
--   inteiro de novo (no caso medido: 48 de 48, com 24 ja' lancados). No banco inteiro: 0 lancamentos com hash e sem lote, de 88.306.
--
-- ESTADO ANTERIOR: public.set_financeiro_lancamento_v2_hash()  md5(prosrc) = 09380837b0a25a900ebf83e640df72a1
-- ESTADO NOVO:                                                  md5(prosrc) = 0db2f21916a79511aac98bc534131691
--
-- O QUE MUDA: so' o ramo ELSE, que deixa de existir. Com lote: o hash e' CALCULADO, como sempre (o explicito e' sobrescrito).
--   Sem lote: o hash fica como veio — no INSERT, o que o chamador mandou ou nulo; no UPDATE, o valor da linha (so' muda se o
--   UPDATE citar a coluna). NAO MUDA: assinatura, retorno, linguagem, SECURITY INVOKER, search_path, ACL, e o gatilho (so' a
--   funcao e' regravada: CREATE OR REPLACE, nenhum ALTER TABLE, nenhuma trava na tabela de lancamentos).
-- ⚠ NAO ENTRA INDICE UNICO NO HASH: na pecuaria lancamentos iguais sao normais; a guarda do custeio continua sendo a previa.
--   `enforce_financeiro_lancamento_v2_unique_hash` (a regua D1/D2/D3) segue so' para lote de Excel, intocada.
-- PATCH GUARDADO POR md5 (origem, UMA ancora exatamente 1x, destino). Reexecutar sobre o corpo ja' corrigido FALHA na guarda de
--   origem — e' o comportamento certo para migration de corpo.
-- GESTO CONTRARIO: o mesmo patch ao contrario (repor `  ELSE\n    NEW.hash_importacao := NULL;` antes do `END IF;`); os hashes
--   gravados sem lote seriam apagados no primeiro UPDATE de cada linha.

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

DO $mig$
DECLARE
  v_oid oid := 'public.set_financeiro_lancamento_v2_hash()'::regprocedure;
  v_src text; v_novo text; v_acl text; v_def boolean; v_cfg text; v_n int;
  v_a constant text := E'  ELSE\n    NEW.hash_importacao := NULL;\n  END IF;';
  v_b constant text := E'  -- lote de Excel calcula; sem lote, o hash explicito e'' a marca de origem (custeio) e nao se apaga — CUSTEIO-HASH-01\n  END IF;';
BEGIN
  SELECT prosrc, proacl::text, prosecdef, proconfig::text INTO v_src, v_acl, v_def, v_cfg FROM pg_proc WHERE oid = v_oid;
  IF md5(v_src) IS DISTINCT FROM '09380837b0a25a900ebf83e640df72a1' THEN
    RAISE EXCEPTION 'CUSTEIO-HASH-01: corpo de origem inesperado (md5 %)', md5(v_src);
  END IF;
  v_n := (length(v_src) - length(replace(v_src, v_a, ''))) / length(v_a);
  IF v_n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CUSTEIO-HASH-01: a ancora do ELSE casa % vez(es), esperado 1', v_n;
  END IF;
  -- o CONCEITO, nao so' a string: o hash so' e' zerado num lugar do corpo
  IF (length(v_src) - length(replace(v_src, 'hash_importacao := NULL', ''))) / length('hash_importacao := NULL') IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'CUSTEIO-HASH-01: o corpo zera o hash em mais de um lugar';
  END IF;

  v_novo := replace(v_src, v_a, v_b);
  IF md5(v_novo) IS DISTINCT FROM '0db2f21916a79511aac98bc534131691' THEN
    RAISE EXCEPTION 'CUSTEIO-HASH-01: corpo de destino inesperado (md5 %)', md5(v_novo);
  END IF;

  EXECUTE format($f$CREATE OR REPLACE FUNCTION public.set_financeiro_lancamento_v2_hash()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS %L$f$, v_novo);

  IF (SELECT proacl::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_acl
     OR (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_def
     OR (SELECT proconfig::text FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM v_cfg
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = v_oid) IS DISTINCT FROM '0db2f21916a79511aac98bc534131691' THEN
    RAISE EXCEPTION 'CUSTEIO-HASH-01: ACL, SECURITY, search_path ou corpo diferentes do esperado depois do replace';
  END IF;
  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'CUSTEIO-HASH-01: a funcao ficou executavel por anon';
  END IF;
END
$mig$;
