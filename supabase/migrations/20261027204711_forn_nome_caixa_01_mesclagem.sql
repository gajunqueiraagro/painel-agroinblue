-- FORN-NOME-CAIXA-01 (noite de 20/10/2026) — o desfazer da mesclagem de fornecedores devolve o nome EXATO de antes.
-- Com o gatilho `trg_aa_fornecedor_nome_caixa` (20261027204710), o UPDATE que o desfazer faz no cadastro que ficou passaria a padronizar o
-- nome restaurado (um nome de antes em caixa alta voltaria em maiuscula/minuscula). O executor liga `app.nome_caixa_escritor` (local) e o
-- desliga antes de devolver: o gatilho nao age dentro dele. Nada mais muda. Patch guardado por md5 (origem, as duas ancoras 1x, destino).
DO $patch$
DECLARE v_src text; v_novo text;
  c_a1 constant text := $a$v_lm jsonb;
BEGIN
$a$;
  c_a2 constant text := $a$
  RETURN jsonb_build_object('mesclagem_id', p_mesclagem_id, 'voltaram'$a$;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p WHERE p.oid = 'public._fn_fornecedor_mesclagem_desfazer_exec(uuid, text)'::regprocedure;
  IF md5(v_src) <> 'f5d2bfe1a9fb05a6b5811aa32a7d0def' THEN RAISE EXCEPTION 'origem inesperada: %', md5(v_src); END IF;
  IF (length(v_src) - length(replace(v_src, c_a1, ''))) / length(c_a1) <> 1 OR (length(v_src) - length(replace(v_src, c_a2, ''))) / length(c_a2) <> 1 THEN
    RAISE EXCEPTION 'ancora nao casa 1x'; END IF;
  v_novo := replace(replace(v_src, c_a1, c_a1 || $a$  PERFORM set_config('app.nome_caixa_escritor', 'on', true);   /* FORN-NOME-CAIXA-01: o desfazer volta o nome EXATO */
$a$), c_a2, $a$
  PERFORM set_config('app.nome_caixa_escritor', 'off', true);$a$ || c_a2);
  IF md5(v_novo) <> '87b27393bd1f4b4226b064dd59cd2100' THEN RAISE EXCEPTION 'destino inesperado: %', md5(v_novo); END IF;
  EXECUTE format('CREATE OR REPLACE FUNCTION public._fn_fornecedor_mesclagem_desfazer_exec(p_mesclagem_id uuid, p_motivo text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L', v_novo);
END $patch$;
