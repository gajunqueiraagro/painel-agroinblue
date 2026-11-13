-- IMPORTAR-ABATE-01 · CATEGORIA POR LOTE (Chat 12/11 17:15 ajuste 3, aprovada como proposta 17:20). No SM-LT06 o lote 3 (1 cab a
-- R$ 247/@, Trat. Frio por cisticercose) não é da mesma categoria dos outros: a OC precisa da categoria de CADA lote.
--
-- O que muda (só a `oc_importar_abate` e o resumo do pacote; nada de dado de cliente):
--   - o lote do pacote aceita `categoria`; SEM ela vale a do pacote, como hoje (nenhuma chamada de hoje muda de resultado);
--   - a categoria do lote vai ao lote da OC (`categoria_negociada`) e à baixa do rebanho (`oc_registrar_movimentacao`);
--   - o resumo do pacote (D1 "a mesma NF já está no sistema") compara a categoria lote a lote — o da OC já lia a do lote.
-- Patches guardados por md5 do corpo de hoje (o da 117530) e por âncoras que casam 1×; a definição é a do próprio banco (cabeçalho,
-- SECURITY DEFINER, search_path e o acesso ficam os de hoje).
SET LOCAL lock_timeout = '2s';

DO $patch$
DECLARE
  v_src text; v_def text; a text; b text; i int;
  ancoras text[] := ARRAY[
    $a1$'categoria_negociada', v_cat, 'qtd_negociada'$a1$,
    $a2$v_lote, v_data, v_cat, (l->>'cab')::int, v_pv, NULL, NULL);$a2$];
  novos text[] := ARRAY[
    $n1$'categoria_negociada', coalesce(nullif(btrim(l->>'categoria'), ''), v_cat), 'qtd_negociada'$n1$,
    $n2$v_lote, v_data, coalesce(nullif(btrim(l->>'categoria'), ''), v_cat), (l->>'cab')::int, v_pv, NULL, NULL);  -- 117535: a categoria do lote$n2$];
BEGIN
  SELECT prosrc, pg_get_functiondef(oid) INTO v_src, v_def FROM pg_proc WHERE oid = 'public.oc_importar_abate(uuid, jsonb, boolean)'::regprocedure;
  IF md5(v_src) <> '147447a395387b052a30399daa21bde4' THEN
    RAISE EXCEPTION '117535: a oc_importar_abate nao e'' a da 117530 (md5 %) — parar', md5(v_src); END IF;
  FOR i IN 1 .. array_length(ancoras, 1) LOOP
    a := ancoras[i]; b := novos[i];
    IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
      RAISE EXCEPTION '117535: a ancora % da oc_importar_abate nao casa exatamente 1x — parar', i; END IF;
    v_def := replace(v_def, a, b);
  END LOOP;
  EXECUTE v_def;
END
$patch$;

DO $patch2$
DECLARE
  v_src text; v_def text;
  a text := $s1$'categoria', p->>'categoria',$s1$;
  b text := $s2$'categoria', coalesce(nullif(btrim(l->>'categoria'), ''), p->>'categoria'),$s2$;
BEGIN
  SELECT prosrc, pg_get_functiondef(oid) INTO v_src, v_def FROM pg_proc WHERE oid = 'public._oc_importar_resumo_do_pacote(jsonb)'::regprocedure;
  IF md5(v_src) <> 'c9657a6015799d3e8ba385f5db93952d' THEN
    RAISE EXCEPTION '117535: o resumo do pacote nao e'' o da 117530 (md5 %) — parar', md5(v_src); END IF;
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION '117535: a ancora do resumo do pacote nao casa exatamente 1x — parar'; END IF;
  EXECUTE replace(v_def, a, b);
END
$patch2$;
