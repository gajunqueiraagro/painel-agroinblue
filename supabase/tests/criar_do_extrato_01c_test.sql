-- CRIAR-DO-EXTRATO-01 · PARTE C — a trava do vencimento. RODAR DEPOIS da 20261028100600 (backfill + VALIDATE).
--
-- Roda como `postgres`, numa transacao que TERMINA EM RAISE: nada fica no banco.
-- Sucesso = a excecao final comeca com "OK". Qualquer outra excecao e' falha e diz qual prova caiu.
--
-- C1  a trava existe e esta' VALIDADA (convalidated).
-- C2  zero lancamentos vivos sem vencimento; a trilha do backfill tem o motivo pedido em toda linha.
-- C3  INSERT de lancamento vivo SEM vencimento e' RECUSADO (23514); o mesmo INSERT com vencimento passa.
-- C4  UPDATE que apaga o vencimento de um vivo e' RECUSADO (23514).

DO $teste$
DECLARE v_ok text := ''; v_n int; v_id uuid; v_modelo uuid; v_estado text; v_cols text;
BEGIN
  -- C1
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.financeiro_lancamentos_v2'::regclass
                  AND conname = 'ck_lancamento_v2_vencimento_vivo' AND convalidated) THEN
    RAISE EXCEPTION 'C1 a trava ck_lancamento_v2_vencimento_vivo nao existe ou nao foi validada'; END IF;
  v_ok := v_ok || 'C1 ok (trava validada); ';

  -- C2
  SELECT count(*) INTO v_n FROM public.financeiro_lancamentos_v2 WHERE NOT coalesce(cancelado, false) AND data_vencimento IS NULL;
  IF v_n <> 0 THEN RAISE EXCEPTION 'C2 % lancamento(s) vivo(s) sem vencimento', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.financeiro_vencimento_backfill_cde01 WHERE motivo <> 'vencimento = pagamento — CRIAR-DO-EXTRATO-01'
     OR data_vencimento_antes IS NOT NULL;
  IF v_n <> 0 THEN RAISE EXCEPTION 'C2 % linha(s) da trilha com motivo ou vencimento de antes fora do pedido', v_n; END IF;
  v_ok := v_ok || 'C2 ok (0 vivos sem vencimento; trilha com o motivo); ';

  -- C3: o modelo e' um lancamento vivo qualquer; a copia so' troca o id e o vencimento
  SELECT id INTO v_modelo FROM public.financeiro_lancamentos_v2 WHERE NOT coalesce(cancelado, false) ORDER BY created_at DESC LIMIT 1;
  CREATE TEMP TABLE _copia ON COMMIT DROP AS SELECT * FROM public.financeiro_lancamentos_v2 WHERE id = v_modelo;
  -- as colunas que se gravam (sem as GERADAS, como conta_efetiva_id)
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_cols FROM pg_attribute a
   WHERE a.attrelid = 'public.financeiro_lancamentos_v2'::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '';
  UPDATE _copia SET id = gen_random_uuid(), data_vencimento = NULL;
  BEGIN
    EXECUTE format('INSERT INTO public.financeiro_lancamentos_v2 (%s) SELECT %s FROM _copia', v_cols, v_cols);
    RAISE EXCEPTION 'C3 o INSERT de vivo sem vencimento PASSOU';
  EXCEPTION WHEN check_violation THEN v_estado := 'recusado';
  END;
  UPDATE _copia SET id = gen_random_uuid(), data_vencimento = coalesce(data_pagamento, data_competencia, current_date);
  EXECUTE format('INSERT INTO public.financeiro_lancamentos_v2 (%s) SELECT %s FROM _copia RETURNING id', v_cols, v_cols) INTO v_id;
  v_ok := v_ok || format('C3 ok (sem vencimento: %s; com vencimento: gravou); ', v_estado);

  -- C4
  BEGIN
    UPDATE public.financeiro_lancamentos_v2 SET data_vencimento = NULL WHERE id = v_id;
    RAISE EXCEPTION 'C4 o UPDATE que apaga o vencimento PASSOU';
  EXCEPTION WHEN check_violation THEN v_ok := v_ok || 'C4 ok (apagar o vencimento de um vivo: recusado); ';
  END;

  RAISE EXCEPTION 'OK — %', v_ok;
END
$teste$;
