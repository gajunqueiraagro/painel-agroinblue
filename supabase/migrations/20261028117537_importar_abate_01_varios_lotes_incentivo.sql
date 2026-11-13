-- IMPORTAR-ABATE-01 · VÁRIOS LOTES / VÁRIAS NFs / INCENTIVO (proposta A, Chat 12/11 18:35). 2º caso real: NJ · Faz. Pureza × Fortunceres,
-- abate 12/11/2026 — 2 acertos (ordens de compra 10770 e 10771), 1 NF por lote (a do lote 1 ainda falta) e o crédito "Incentivo
-- Proape-Precoce/MS" dentro do líquido de cada acerto. Hoje a conferência "líquido + retenções = bruto da NF" usa UMA NF para todos os lotes
-- e não conhece incentivo; e todo documento é ligado a todos os lotes.
--
-- O que muda (só a `oc_importar_abate`; nada de dado de cliente):
--   - a conferência do bruto é POR NF: o documento NF do pacote pode dizer de que lote é (`lote_ordem`); sem ele vale para todos os
--     lotes, como hoje. O lote pode levar o seu `incentivo` (crédito do acerto, que já está DENTRO do líquido): líquido + retenções −
--     incentivo = bruto da NF do lote. Lote sem NF não é conferido (a tela avisa "falta a NF");
--   - o documento com `lote_ordem` se liga só àquele lote (sem ele, a todos, como hoje); a chave `lote_ordem` não vai ao documento.
-- Sem `lote_ordem` e sem `incentivo` nada muda (o SM-LT06 e os pacotes de hoje dão a mesma prévia). Patch guardado por md5 do corpo de
-- hoje (o da 117535, f75eefda…) e por âncoras que casam 1×; a definição é a do próprio banco (cabeçalho, SECURITY DEFINER, acesso).
SET LOCAL lock_timeout = '2s';

DO $patch$
DECLARE
  v_src text; v_def text; a text; b text; i int;
  ancoras text[] := ARRAY[
    $a1$v_ndoc int := 0; v_lote uuid;$a1$,
    $a2$  SELECT (c->>'valor')::numeric INTO v_bruto
    FROM jsonb_array_elements(coalesce(p_pacote->'documentos', '[]')) dd, jsonb_array_elements(coalesce(dd->'componentes', '[]')) c
   WHERE dd->>'especie' = 'nf_principal' AND c->>'tipo' = 'valor_bruto' LIMIT 1;
  IF v_bruto IS NOT NULL AND abs(v_soma_liq + v_soma_ret - v_bruto) > 0.005 THEN
    RAISE EXCEPTION 'Importar o abate: liquido + retencoes (%) nao e'' o bruto da NF (%)', v_soma_liq + v_soma_ret, v_bruto USING ERRCODE = 'P0001'; END IF;$a2$,
    $a3$r := public.oc_documento_registrar(v_op, p_cliente_id, (d - 'lotes') || jsonb_build_object('lotes', v_ids));$a3$];
  novos text[] := ARRAY[
    $n1$v_ndoc int := 0; v_lote uuid; v_lado numeric;$n1$,
    $n2$  -- 117537: a conferência do bruto é POR NF (a NF diz o seu lote em `lote_ordem`; sem ele, todos os lotes, como antes); o lote desconta
  -- o seu `incentivo` (crédito do acerto, já dentro do líquido). Lote sem NF não é conferido.
  FOR d IN SELECT x FROM jsonb_array_elements(coalesce(p_pacote->'documentos', '[]')) x WHERE x->>'especie' = 'nf_principal' LOOP
    v_bruto := NULL;
    SELECT (c->>'valor')::numeric INTO v_bruto FROM jsonb_array_elements(coalesce(d->'componentes', '[]')) c WHERE c->>'tipo' = 'valor_bruto' LIMIT 1;
    CONTINUE WHEN v_bruto IS NULL;
    SELECT sum((x->>'valor_liquido')::numeric + coalesce((x->>'senar')::numeric, 0) + coalesce((x->>'funrural')::numeric, 0)
               - coalesce((x->>'incentivo')::numeric, 0))
      INTO v_lado FROM jsonb_array_elements(p_pacote->'lotes') x
     WHERE NOT (d ? 'lote_ordem') OR (x->>'ordem')::int = (d->>'lote_ordem')::int;
    IF abs(coalesce(v_lado, 0) - v_bruto) > 0.005 THEN
      RAISE EXCEPTION 'Importar o abate: liquido + retencoes - incentivo (%) nao e'' o bruto da NF % (%)', coalesce(v_lado, 0),
        coalesce(d->>'numero', ''), v_bruto USING ERRCODE = 'P0001'; END IF;
  END LOOP;$n2$,
    $n3$r := public.oc_documento_registrar(v_op, p_cliente_id, (d - 'lotes' - 'lote_ordem') || jsonb_build_object('lotes',
             CASE WHEN d ? 'lote_ordem'  -- 117537: o documento do lote liga-se só a ele
                  THEN coalesce((SELECT jsonb_agg(ol.id) FROM public.zoo_operacao_lotes ol
                                  WHERE ol.operacao_id = v_op AND ol.ordem = (d->>'lote_ordem')::int), v_ids)
                  ELSE v_ids END));$n3$];
BEGIN
  SELECT prosrc, pg_get_functiondef(oid) INTO v_src, v_def FROM pg_proc WHERE oid = 'public.oc_importar_abate(uuid, jsonb, boolean)'::regprocedure;
  IF md5(v_src) <> 'f75eefdadb81ca9dab00548a8aced212' THEN
    RAISE EXCEPTION '117537: a oc_importar_abate nao e'' a da 117535 (md5 %) — parar', md5(v_src); END IF;
  FOR i IN 1 .. array_length(ancoras, 1) LOOP
    a := ancoras[i]; b := novos[i];
    IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
      RAISE EXCEPTION '117537: a ancora % da oc_importar_abate nao casa exatamente 1x — parar', i; END IF;
    v_def := replace(v_def, a, b);
  END LOOP;
  EXECUTE v_def;
END
$patch$;
