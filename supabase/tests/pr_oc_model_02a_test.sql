-- PR-OC-MODEL-02A — numero_documento (NF) persistido via oc_salvar_rascunho.
-- BEGIN...ROLLBACK: resíduo zero. Requer as migrations 02A aplicadas.
BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_op uuid; v_res jsonb; v_v int; v_nf text;
BEGIN
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli
    FROM public.cliente_membros cm
    WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true
    ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);

  -- P1: create com numero_documento -> persiste
  v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object(
    'tipo_operacao','compra','data_operacao','2026-08-15','numero_documento','NF-12345'));
  v_op := (v_res->>'operacao_id')::uuid; v_v := (v_res->>'versao')::int;
  SELECT numero_documento INTO v_nf FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  IF v_nf <> 'NF-12345' THEN RAISE EXCEPTION 'P1 numero_documento=%', v_nf; END IF;

  -- P2: update do numero_documento -> muda
  v_res := public.oc_salvar_rascunho(v_op, v_cli, v_v, jsonb_build_object('numero_documento','NF-99'));
  v_v := (v_res->>'versao')::int;
  SELECT numero_documento INTO v_nf FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  IF v_nf <> 'NF-99' THEN RAISE EXCEPTION 'P2 numero_documento=%', v_nf; END IF;

  -- P3: update SEM a chave numero_documento -> preserva (não zera)
  v_res := public.oc_salvar_rascunho(v_op, v_cli, v_v, jsonb_build_object('observacoes','x'));
  v_v := (v_res->>'versao')::int;
  SELECT numero_documento INTO v_nf FROM public.zoo_operacoes_comerciais WHERE id=v_op;
  IF v_nf <> 'NF-99' THEN RAISE EXCEPTION 'P3 numero_documento nao preservado: %', v_nf; END IF;

  -- P4: create SEM numero_documento -> NULL (campo opcional)
  v_res := public.oc_salvar_rascunho(NULL, v_cli, NULL, jsonb_build_object('tipo_operacao','venda','data_operacao','2026-08-15'));
  SELECT numero_documento INTO v_nf FROM public.zoo_operacoes_comerciais WHERE id=(v_res->>'operacao_id')::uuid;
  IF v_nf IS NOT NULL THEN RAISE EXCEPTION 'P4 numero_documento deveria ser NULL: %', v_nf; END IF;

  RAISE NOTICE 'PR-OC-MODEL-02A: P1..P4 OK';
END $t$;

ROLLBACK;
