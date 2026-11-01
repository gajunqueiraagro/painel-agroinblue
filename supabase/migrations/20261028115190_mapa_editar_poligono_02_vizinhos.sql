-- MAPA-EDITAR-POLIGONO-02 · 115190 (Gabriel 01/11/2026, itens 5 e 6): a divisa compartilhada e o recorte dos vizinhos gravam NUM gesto.
-- A `fn_geometria_gravar` (115170) aceitava 1 polígono alterado por gesto. Passa a aceitar:
--   editar / redesenhar = o editado (alterar[0]) + até 49 vizinhos que se movem junto ("Mover a divisa junto": o vértice comum)
--   desenhar            = 1 criar + até 50 vizinhos recortados ("Recortar dos vizinhos": a forma nova sai deles)
-- Nos vizinhos (editar/redesenhar a partir do 2º; desenhar todos) só a FORMA muda: nada de pasto nem nome; e o contorno da fazenda
-- ('area_total' / 'area_fazenda') nunca entra como vizinho. Trilha (uma linha por polígono, o mesmo gesto) e desfazer (o gesto inteiro)
-- já tratam N polígonos. Patch do corpo VIVO guardado por md5; dividir, unir e apagar não mudam.

SET LOCAL lock_timeout = '2s';

DO $patch$
DECLARE
  d text; n int;
  c_de1 constant text := $x$      WHEN 'editar' THEN jsonb_array_length(v_alt) = 1 AND jsonb_array_length(v_cri) = 0 AND jsonb_array_length(v_rem) = 0 AND v_alt->0 ? 'geojson'
      WHEN 'redesenhar' THEN jsonb_array_length(v_alt) = 1 AND jsonb_array_length(v_cri) = 0 AND jsonb_array_length(v_rem) = 0 AND v_alt->0 ? 'geojson'$x$;
  c_para1 constant text := $x$      WHEN 'editar' THEN jsonb_array_length(v_alt) BETWEEN 1 AND 50 AND jsonb_array_length(v_cri) = 0 AND jsonb_array_length(v_rem) = 0
                         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_alt) x WHERE NOT x ? 'geojson')
      WHEN 'redesenhar' THEN jsonb_array_length(v_alt) BETWEEN 1 AND 50 AND jsonb_array_length(v_cri) = 0 AND jsonb_array_length(v_rem) = 0
                         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_alt) x WHERE NOT x ? 'geojson')$x$;
  c_de2 constant text := $x$      WHEN 'desenhar' THEN jsonb_array_length(v_cri) = 1 AND jsonb_array_length(v_alt) = 0 AND jsonb_array_length(v_rem) = 0$x$;
  c_para2 constant text := $x$      WHEN 'desenhar' THEN jsonb_array_length(v_cri) = 1 AND jsonb_array_length(v_alt) <= 50 AND jsonb_array_length(v_rem) = 0
                         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_alt) x WHERE NOT x ? 'geojson')$x$;
  c_de3 constant text := $x$    v_antes := v_antes || jsonb_build_object(g.id::text, to_jsonb(g));
  END LOOP;$x$;
  c_para3 constant text := $x$    v_antes := v_antes || jsonb_build_object(g.id::text, to_jsonb(g));
  END LOOP;
  -- MAPA-EDITAR-POLIGONO-02: os vizinhos (divisa junto / recorte) só mudam de forma, e o contorno da fazenda nunca é vizinho
  FOR e IN SELECT x FROM jsonb_array_elements(v_alt) WITH ORDINALITY t(x, i)
            WHERE (v_acao IN ('editar', 'redesenhar') AND t.i > 1) OR v_acao = 'desenhar' LOOP
    IF e ? 'pasto_id' OR e ? 'nome_original' THEN
      RAISE EXCEPTION 'o vizinho da divisa só muda de forma (sem pasto nem nome)' USING ERRCODE = '22023';
    END IF;
    IF (v_antes->((e->>'id')::uuid::text)->>'tipo') IN ('area_total', 'area_fazenda') THEN
      RAISE EXCEPTION 'O contorno da fazenda não se move junto nem se recorta.' USING ERRCODE = '22023';
    END IF;
  END LOOP;$x$;
BEGIN
  d := pg_get_functiondef('public.fn_geometria_gravar(uuid,jsonb,boolean)'::regprocedure);
  IF md5(d) <> 'fcc3a442910bfb76ce4c430b95b7e2c9' THEN RAISE EXCEPTION '115190: fn_geometria_gravar mudou desde a prévia'; END IF;
  n := (length(d) - length(replace(d, c_de1, ''))) / length(c_de1);
  IF n <> 1 THEN RAISE EXCEPTION '115190: editar/redesenhar, esperava 1, achou %', n; END IF;
  n := (length(d) - length(replace(d, c_de2, ''))) / length(c_de2);
  IF n <> 1 THEN RAISE EXCEPTION '115190: desenhar, esperava 1, achou %', n; END IF;
  n := (length(d) - length(replace(d, c_de3, ''))) / length(c_de3);
  IF n <> 1 THEN RAISE EXCEPTION '115190: guarda dos vizinhos, esperava 1 âncora, achou %', n; END IF;
  EXECUTE replace(replace(replace(d, c_de1, c_para1), c_de2, c_para2), c_de3, c_para3);
END $patch$;
