-- CONC-CRIAR-CENTAVO-01 (Gabriel 20/10/2026) — a tolerancia do casar no Espelho passa a ser a da casa: meio centavo.
-- `fn_espelho_casar` e `fn_espelho_casar_n1` diziam "fecha" com |soma − alvo| <= 0,01: uma diferenca de R$ 0,01 era casada calada
-- (o "fazer bater"), enquanto `fn_conciliar_bloco`, `fn_classificacao_conferir_bloco` e `fn_vincular_grupo_conciliacao` usam 0,005.
-- Agora todas dizem: abaixo de meio centavo e' arredondamento; R$ 0,01 e' diferenca, e a tela oferece criar o lancamento por ela.
-- A tela le' a mesma regra de `src/lib/conciliacao/tolerancia.ts` (TOLERANCIA_CONCILIACAO = 0.005).
-- Patch guardado por md5 (origem, ancora 1x, destino); so' funcao — ACL, SECURITY DEFINER e search_path preservados pelo
-- CREATE OR REPLACE do proprio pg_get_functiondef. Reexecutar sobre o corpo ja' corrigido nao faz nada.

SET LOCAL lock_timeout = '2s';

DO $patch$
DECLARE
  r record;
  v_def text;
  v_md5 text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public.fn_espelho_casar(uuid, jsonb, boolean, text)'::regprocedure,
       'cd21bf8d4188e2c1aa7807453d9c22e8', 'c1bdf39a40301005af35971207dd184a',
       'IF abs(v_soma - v_alvo) > 0.01 THEN', 'IF abs(v_soma - v_alvo) > 0.005 THEN'),
      ('public.fn_espelho_casar_n1(uuid, uuid[], boolean, text)'::regprocedure,
       'd86e57ce39ae0a9757d86ea763ff2415', 'a299c1837e299434ac808abd40242758',
       'IF abs(v_soma - abs(v_lan.valor)) > 0.01 THEN', 'IF abs(v_soma - abs(v_lan.valor)) > 0.005 THEN'))
    AS v(fn, origem, destino, ancora, troca)
  LOOP
    SELECT md5(prosrc) INTO v_md5 FROM pg_proc WHERE oid = r.fn;
    IF v_md5 = r.destino THEN
      RAISE NOTICE '% ja corrigida', r.fn; CONTINUE;
    END IF;
    IF v_md5 IS DISTINCT FROM r.origem THEN
      RAISE EXCEPTION 'CONC-CRIAR-CENTAVO-01: % com md5 % (esperado %)', r.fn, v_md5, r.origem;
    END IF;
    v_def := pg_get_functiondef(r.fn);
    IF (length(v_def) - length(replace(v_def, r.ancora, ''))) / length(r.ancora) <> 1 THEN
      RAISE EXCEPTION 'CONC-CRIAR-CENTAVO-01: ancora de % nao casa 1x', r.fn;
    END IF;
    EXECUTE replace(v_def, r.ancora, r.troca);
    SELECT md5(prosrc) INTO v_md5 FROM pg_proc WHERE oid = r.fn;
    IF v_md5 IS DISTINCT FROM r.destino THEN
      RAISE EXCEPTION 'CONC-CRIAR-CENTAVO-01: % ficou com md5 % (esperado %)', r.fn, v_md5, r.destino;
    END IF;
  END LOOP;
END $patch$;
