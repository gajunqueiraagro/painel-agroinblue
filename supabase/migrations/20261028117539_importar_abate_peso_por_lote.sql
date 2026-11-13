-- IMPORTAR-ABATE-PESO-POR-LOTE-01 (Chat 13/11 10:25). Caso real: NJ · Faz. Pureza × Fortunceres, abate 12/11/2026, 54 bois em 2 ordens de
-- compra — lote 1 (36 cab, Angus) e lote 2 (18 cab, Charolês), com pesos vivos diferentes. Hoje a `oc_importar_abate` usa UM peso vivo
-- (`peso_vivo_medio_kg` do pacote) para todos os lotes: no peso médio do lote, no rendimento de carcaça e na saída do rebanho — a média
-- estraga o rendimento por lote.
--
-- O que muda (só a `oc_importar_abate` e o resumo do pacote; nada de dado de cliente): o lote do pacote pode levar o SEU `peso_vivo_kg`;
-- sem ele vale o geral, como hoje. Recusa se algum lote ficar sem peso (nem o dele, nem o geral). Pacote sem `peso_vivo_kg` nos lotes =
-- igual a hoje. Patch guardado por md5 do corpo de hoje (o da 117538, 424b23af… / o resumo, abca82ed…) e por âncoras que casam 1×; a
-- definição é a do próprio banco (cabeçalho, SECURITY DEFINER, acesso).
SET LOCAL lock_timeout = '2s';

DO $patch$
DECLARE
  v_src text; v_def text; a text; b text; i int;
  ancoras text[] := ARRAY[
    $a1$IF v_data IS NULL OR v_cat IS NULL OR coalesce(v_pv, 0) <= 0 THEN$a1$,
    $a2$'peso_medio_negociado_kg', v_pv, 'criterio_valor'$a2$,
    $a3$((l->>'cab')::int * v_pv) * 100$a3$,
    $a4$(l->>'cab')::int, v_pv, NULL, NULL);$a4$];
  novos text[] := ARRAY[
    $n1$IF v_data IS NULL OR v_cat IS NULL  -- 117539: cada lote com peso (o dele ou o geral)
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_pacote->'lotes') x WHERE coalesce(nullif(x->>'peso_vivo_kg', '')::numeric, v_pv, 0) <= 0) THEN$n1$,
    $n2$'peso_medio_negociado_kg', coalesce(nullif(l->>'peso_vivo_kg', '')::numeric, v_pv), 'criterio_valor'$n2$,
    $n3$((l->>'cab')::int * coalesce(nullif(l->>'peso_vivo_kg', '')::numeric, v_pv)) * 100$n3$,
    $n4$(l->>'cab')::int, coalesce(nullif(l->>'peso_vivo_kg', '')::numeric, v_pv), NULL, NULL);$n4$];
BEGIN
  SELECT prosrc, pg_get_functiondef(oid) INTO v_src, v_def FROM pg_proc WHERE oid = 'public.oc_importar_abate(uuid, jsonb, boolean)'::regprocedure;
  IF md5(v_src) <> '424b23afaf8d401aa481eb6756f452f7' THEN
    RAISE EXCEPTION '117539: a oc_importar_abate nao e'' a da 117538 (md5 %) — parar', md5(v_src); END IF;
  FOR i IN 1 .. array_length(ancoras, 1) LOOP
    a := ancoras[i]; b := novos[i];
    IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
      RAISE EXCEPTION '117539: a ancora % da oc_importar_abate nao casa exatamente 1x — parar', i; END IF;
    v_def := replace(v_def, a, b);
  END LOOP;
  EXECUTE v_def;

  SELECT prosrc, pg_get_functiondef(oid) INTO v_src, v_def FROM pg_proc WHERE oid = 'public._oc_importar_resumo_do_pacote(jsonb)'::regprocedure;
  IF md5(v_src) <> 'abca82ed3215898682af322932fecc22' THEN
    RAISE EXCEPTION '117539: o _oc_importar_resumo_do_pacote nao e'' o de hoje (md5 %) — parar', md5(v_src); END IF;
  a := $r1$'peso_vivo_medio_kg', round((p->>'peso_vivo_medio_kg')::numeric, 2)$r1$;
  b := $s1$'peso_vivo_medio_kg', round(coalesce(nullif(l->>'peso_vivo_kg', '')::numeric, (p->>'peso_vivo_medio_kg')::numeric), 2)$s1$;
  IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION '117539: a ancora do resumo do pacote nao casa exatamente 1x — parar'; END IF;
  EXECUTE replace(v_def, a, b);
END
$patch$;
