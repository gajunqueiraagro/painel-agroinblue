-- PR-FIX-IMPORT-COLS — teste transacional (asserts duros).
-- Executar APÓS aplicar a migration 20260723100100_pr_fix_import_cols.sql.
-- Não persiste: ROLLBACK final. Sentinela de resíduo: nome_arquivo LIKE 'TESTE_PR_FIX_IMPORT_COLS%'.
BEGIN;

-- T1: as duas colunas existem com tipos uuid e text
DO $$
DECLARE v_conta text; v_tipo text;
BEGIN
  SELECT data_type INTO v_conta FROM information_schema.columns
   WHERE table_schema='public' AND table_name='financeiro_importacoes_v2' AND column_name='conta_bancaria_id';
  SELECT data_type INTO v_tipo FROM information_schema.columns
   WHERE table_schema='public' AND table_name='financeiro_importacoes_v2' AND column_name='tipo_arquivo';
  IF v_conta IS DISTINCT FROM 'uuid' THEN RAISE EXCEPTION 'T1 FALHOU: conta_bancaria_id data_type=% (esperado uuid)', COALESCE(v_conta,'<ausente>'); END IF;
  IF v_tipo  IS DISTINCT FROM 'text' THEN RAISE EXCEPTION 'T1 FALHOU: tipo_arquivo data_type=% (esperado text)', COALESCE(v_tipo,'<ausente>'); END IF;
  RAISE NOTICE 'T1 OK: colunas existem (conta_bancaria_id uuid, tipo_arquivo text)';
END $$;

-- T2: FK de conta_bancaria_id -> financeiro_contas_bancarias(id)
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE conrelid='public.financeiro_importacoes_v2'::regclass AND contype='f'
     AND confrelid='public.financeiro_contas_bancarias'::regclass
     AND pg_get_constraintdef(oid) ILIKE '%(conta_bancaria_id)%';
  IF v_n < 1 THEN RAISE EXCEPTION 'T2 FALHOU: FK conta_bancaria_id -> financeiro_contas_bancarias(id) ausente'; END IF;
  RAISE NOTICE 'T2 OK: FK presente';
END $$;

-- T3: reprodução do payload do hook (caminho fazendaEspecifica) — deve PASSAR
DO $$
DECLARE v_cli uuid; v_faz uuid; v_conta uuid; v_id uuid;
BEGIN
  SELECT id INTO v_cli   FROM public.clientes LIMIT 1;
  SELECT id INTO v_faz   FROM public.fazendas WHERE cliente_id = v_cli LIMIT 1;
  SELECT id INTO v_conta FROM public.financeiro_contas_bancarias WHERE cliente_id = v_cli LIMIT 1;
  INSERT INTO public.financeiro_importacoes_v2
    (cliente_id, fazenda_id, conta_bancaria_id, nome_arquivo, tipo_arquivo,
     total_linhas, total_validas, total_com_erro, status)
  VALUES
    (v_cli, v_faz, v_conta, 'TESTE_PR_FIX_IMPORT_COLS.ofx', 'OFX', 1, 1, 0, 'confirmada')
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'T3 FALHOU: INSERT do payload nao retornou id'; END IF;
  RAISE NOTICE 'T3 OK: insert do payload do app passou (id=%)', v_id;
END $$;

-- T4: conta_bancaria_id inexistente -> deve falhar por FK
DO $$
DECLARE v_cli uuid; v_erro boolean := false;
BEGIN
  SELECT id INTO v_cli FROM public.clientes LIMIT 1;
  BEGIN
    INSERT INTO public.financeiro_importacoes_v2
      (cliente_id, conta_bancaria_id, nome_arquivo, tipo_arquivo,
       total_linhas, total_validas, total_com_erro, status)
    VALUES
      (v_cli, gen_random_uuid(), 'TESTE_PR_FIX_IMPORT_COLS_FK.ofx', 'OFX', 1, 1, 0, 'confirmada');
  EXCEPTION WHEN foreign_key_violation THEN
    v_erro := true;
  END;
  IF NOT v_erro THEN RAISE EXCEPTION 'T4 FALHOU: FK nao barrou conta_bancaria_id inexistente'; END IF;
  RAISE NOTICE 'T4 OK: FK barrou conta_bancaria_id inexistente';
END $$;

-- Resíduo zero garantido pelo ROLLBACK; conferir sentinela apos rollback:
--   SELECT count(*) FROM public.financeiro_importacoes_v2 WHERE nome_arquivo LIKE 'TESTE_PR_FIX_IMPORT_COLS%';  -- deve ser 0
ROLLBACK;
