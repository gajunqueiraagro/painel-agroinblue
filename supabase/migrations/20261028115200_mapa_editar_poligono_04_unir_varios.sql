-- MAPA-EDITAR-POLIGONO-04 · 115200 (Gabriel 01/11/2026 14:45, Pureza: unir 6A, 6B, 6C e 6D num gesto): o "unir" da `fn_geometria_gravar`
-- aceitava 1 polígono removido (dois por vez). Passa a aceitar de 1 a 49 removidos: o que fica (alterar[0], com a forma da união e o
-- vínculo escolhido) + os que somem nele. Trilha (uma linha por polígono, o mesmo gesto) e desfazer (o gesto inteiro) já tratam N.
-- O "pasto que ficaria sem polígono" segue na prévia (`pastos_sem_poligono`). Patch do corpo VIVO guardado por md5 (o de depois da 115190).

SET LOCAL lock_timeout = '2s';

DO $patch$
DECLARE
  d text; n int;
  c_de constant text := $x$      WHEN 'unir' THEN jsonb_array_length(v_alt) = 1 AND jsonb_array_length(v_cri) = 0 AND jsonb_array_length(v_rem) = 1 AND v_alt->0 ? 'geojson'$x$;
  c_para constant text := $x$      WHEN 'unir' THEN jsonb_array_length(v_alt) = 1 AND jsonb_array_length(v_cri) = 0 AND jsonb_array_length(v_rem) BETWEEN 1 AND 49 AND v_alt->0 ? 'geojson'$x$;
BEGIN
  d := pg_get_functiondef('public.fn_geometria_gravar(uuid,jsonb,boolean)'::regprocedure);
  IF md5(d) <> '1fa957b6e4fc4bb22be3edfd71725b8f' THEN RAISE EXCEPTION '115200: fn_geometria_gravar mudou desde a prévia'; END IF;
  n := (length(d) - length(replace(d, c_de, ''))) / length(c_de);
  IF n <> 1 THEN RAISE EXCEPTION '115200: unir, esperava 1, achou %', n; END IF;
  EXECUTE replace(d, c_de, c_para);
END $patch$;
