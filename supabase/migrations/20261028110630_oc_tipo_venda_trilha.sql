-- OC-TIPO-VENDA-01 (complemento) — a TRILHA da troca do tipo de venda com a OC fechada. `oc_editar_dados_operacao` passou a aceitar
-- `tipo_venda` (20261028110620), mas o evento `editar_dados` so' escrevia antes/depois de contraparte, observacoes e NF: o tipo trocava
-- e o evento saia `{}` (achado no preenchimento das 20 vendas, 21/10). Aqui o tipo entra no antes e no depois.

CREATE FUNCTION pg_temp._trocar(p_fn regprocedure, p_md5 text, p_trocas text[]) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_def text; i int;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p_fn) <> p_md5 THEN
    RAISE EXCEPTION 'OC-TIPO-VENDA-01 trilha: corpo de origem de % divergente', p_fn;
  END IF;
  v_def := pg_get_functiondef(p_fn);
  FOR i IN 1 .. array_length(p_trocas, 1) / 2 LOOP
    IF (length(v_def) - length(replace(v_def, p_trocas[2 * i - 1], ''))) / length(p_trocas[2 * i - 1]) <> 1 THEN
      RAISE EXCEPTION 'OC-TIPO-VENDA-01 trilha: trecho % de % nao achado uma vez', i, p_fn;
    END IF;
    v_def := replace(v_def, p_trocas[2 * i - 1], p_trocas[2 * i]);
  END LOOP;
  EXECUTE v_def;
END $f$;

SELECT pg_temp._trocar('public.oc_editar_dados_operacao(uuid, uuid, jsonb, integer)'::regprocedure, 'f432400e7eda86fb1b9dcd436e1bca9f', ARRAY[
  $a$  IF p_payload ? 'numero_documento'  THEN v_antes := v_antes || jsonb_build_object('numero_documento',  to_jsonb(v_op.numero_documento)); END IF;$a$,
  $a$  IF p_payload ? 'numero_documento'  THEN v_antes := v_antes || jsonb_build_object('numero_documento',  to_jsonb(v_op.numero_documento)); END IF;
  IF p_payload ? 'tipo_venda'        THEN v_antes := v_antes || jsonb_build_object('tipo_venda',        to_jsonb(v_op.tipo_venda)); END IF;$a$,
  $b$  IF p_payload ? 'numero_documento'  THEN v_depois := v_depois || jsonb_build_object('numero_documento',  to_jsonb(v_novo.numero_documento)); END IF;$b$,
  $b$  IF p_payload ? 'numero_documento'  THEN v_depois := v_depois || jsonb_build_object('numero_documento',  to_jsonb(v_novo.numero_documento)); END IF;
  IF p_payload ? 'tipo_venda'        THEN v_depois := v_depois || jsonb_build_object('tipo_venda',        to_jsonb(v_novo.tipo_venda)); END IF;$b$
]);

DO $confere$
BEGIN
  IF position('to_jsonb(v_novo.tipo_venda)' in pg_get_functiondef('public.oc_editar_dados_operacao(uuid, uuid, jsonb, integer)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'OC-TIPO-VENDA-01 trilha: conferencia final falhou';
  END IF;
END $confere$;
