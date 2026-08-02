-- PR-OC-TESTE-FLAG-01 — testes da coluna zoo_operacoes_comerciais.is_teste (T1..T5).
--   Valida: coluna criada (boolean NOT NULL default false); default false em nova OC; 20 OCs de dev marcadas
--   true; nenhuma OC fora do escopo alterada. Requer aplicada: 20260810120000. SOMENTE no PROTO.
--   BEGIN...ROLLBACK + resíduo zero (T5).
SELECT set_config('app.tf_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_tag text := current_setting('app.tf_tag');
  v_cli uuid; v_creator uuid; v_new uuid; v_is_teste boolean;
  v_col_type text; v_col_nullable text; v_col_default text;
  v_marcadas int; v_fora_escopo int; v_alvo uuid[] := ARRAY[
    '3493b6a9-3964-41e1-9dfa-14fde697d49b','6fe43d6d-c09c-4b2a-bca5-9b714c72db0f',
    '825b9ac6-0e72-4e02-990d-d3f6c8785213','48dd0aaa-b2b7-4bef-9fc2-306ecde67ba2',
    'a3c124aa-7a95-4645-8974-ca51cb6ef3a9','d152d48a-0406-4f2c-92d6-0cbb5fb7c8b6',
    'f2ecc13c-6c54-482d-96b4-afa257530a17','05da817e-d10e-49de-b507-5b628e9c1fa2',
    'aed22763-e88d-4964-a8dd-7bc9555ee6d5','5e2b86e0-6861-467e-84a8-c81a7680a196',
    '2805f54c-332a-4456-83e7-5cdeda4e501c','a298abc6-f144-4669-b5fa-9fa7a0d6de52',
    '8394e7e7-d616-4315-89c7-2f23e89ed66e','5dafbec4-9ab9-46a5-ad39-2be6dbc44cba',
    '9144e361-b692-4520-97c3-cb1bc4278d1b','954e9eb6-8277-42eb-ad67-b0a22934744b',
    'e9dd4c78-b621-4d4f-8496-f48c0dbf1581','0f6547a3-77a7-4d85-885f-a05cb1ebb655',
    'a016cc36-e9ff-4c70-8a8a-065defe74a27','d39b796e-e67f-4139-b960-2c51ea46e490']::uuid[];
BEGIN
  -- T1 — coluna existe: boolean, NOT NULL, default false
  SELECT data_type, is_nullable, column_default INTO v_col_type, v_col_nullable, v_col_default
    FROM information_schema.columns WHERE table_schema='public' AND table_name='zoo_operacoes_comerciais' AND column_name='is_teste';
  IF v_col_type <> 'boolean' OR v_col_nullable <> 'NO' OR v_col_default NOT LIKE '%false%' THEN
    RAISE EXCEPTION 'T1 FAIL: coluna is_teste (type=%, nullable=%, default=%)', v_col_type, v_col_nullable, v_col_default; END IF;
  RAISE NOTICE 'T1 PASS';

  -- T2 — default false em nova OC
  SELECT cliente_id, created_by INTO v_cli, v_creator FROM public.zoo_operacoes_comerciais WHERE created_by IS NOT NULL LIMIT 1;
  INSERT INTO public.zoo_operacoes_comerciais (cliente_id,tipo_operacao,data_operacao,status_comercial,rascunho,qtd_negociada,categoria_negociada,valor_acordado,valor_total,observacoes,created_by,updated_by)
    VALUES (v_cli,'compra',DATE '2026-07-01','programada',true,1,'garrotes',0,0,v_tag,v_creator,v_creator) RETURNING id, is_teste INTO v_new, v_is_teste;
  IF v_is_teste IS NOT FALSE THEN RAISE EXCEPTION 'T2 FAIL: nova OC deveria nascer is_teste=false (=%%)', v_is_teste; END IF;
  RAISE NOTICE 'T2 PASS';

  -- T3 — as 20 OCs alvo estão marcadas is_teste=true
  SELECT count(*) INTO v_marcadas FROM public.zoo_operacoes_comerciais WHERE id = ANY(v_alvo) AND is_teste=true;
  IF v_marcadas <> 20 THEN RAISE EXCEPTION 'T3 FAIL: esperadas 20 marcadas, achei %', v_marcadas; END IF;
  RAISE NOTICE 'T3 PASS';

  -- T4 — nenhuma OC fora do escopo marcada (a nova sintética + qualquer não-alvo permanecem false)
  SELECT count(*) INTO v_fora_escopo FROM public.zoo_operacoes_comerciais WHERE NOT (id = ANY(v_alvo)) AND is_teste=true;
  IF v_fora_escopo <> 0 THEN RAISE EXCEPTION 'T4 FAIL: % OC fora do escopo marcada is_teste=true', v_fora_escopo; END IF;
  IF (SELECT is_teste FROM public.zoo_operacoes_comerciais WHERE id=v_new) <> false THEN RAISE EXCEPTION 'T4 FAIL: OC sintética marcada'; END IF;
  RAISE NOTICE 'T4 PASS';

  RAISE NOTICE 'PR-OC-TESTE-FLAG-01: PASS (T1-T4)';
END $t$;

ROLLBACK;

-- T5 — resíduo zero após ROLLBACK (nenhuma OC sintética persistida).
SELECT count(*) AS residuo FROM public.zoo_operacoes_comerciais WHERE observacoes = current_setting('app.tf_tag');
