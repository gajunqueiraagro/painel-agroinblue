-- FIN-PARCELA-STATUS-01 — a coluna da parcela segue os lancamentos dela. Termina em RAISE 'OK'; tudo desfeito.
--   S1 nascimento: parcela que nasce apontando para lancamentos pagos ja' nasce 'pago' (com a data deles); em aberto, 'pendente'
--   S2 realizar: principal pago -> 'pendente' (parcial); juros pago -> 'pago', data = a maior das duas
--   S3 desfazer: o juros volta a programado -> 'pendente', data limpa
--   S4 cancelar: com o juros em aberto, cancelar o juros -> so' o principal vivo, pago -> 'pago'; cancelar tambem o principal (o ultimo
--      vivo, o que a fazia paga) -> 'pendente'
--   S5 trava: o FRONT (authenticated) gravando o contrario dos lancamentos -> P0001 e nada muda; o dono (postgres) -> corrigido
--   S6 fora da trava: parcela sem lancamento vivo (o front grava 'pago'); passagem para 'cancelado'; volta de 'cancelado' realinha
--   S7 motor: numa parcela paga o motor nao muda status, valor nem id dos lancamentos
--   S8 a situacao do contrato le' a regra unica (fonte) e diz o mesmo que a coluna
--   S9 pagar pelo extrato: os lancamentos ficam realizados na data do extrato e a coluna vira 'pago' pelo gatilho (a funcao nao grava status)
-- Contratos sinteticos copiados do 8.233.040 (RRCC) e lancamentos copiados de um lancamento de juros dele (molde do 01a).
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION pg_temp.lanc(p_fin uuid, p_status text, p_pg date, p_valor numeric, p_desc text, p_tipo text DEFAULT 'parcela_juros') RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_id uuid := gen_random_uuid();
        v_cols text := (SELECT string_agg(quote_ident(column_name), ', ') FROM information_schema.columns
                         WHERE table_schema = 'public' AND table_name = 'financeiro_lancamentos_v2' AND is_generated = 'NEVER');
BEGIN
  EXECUTE format('INSERT INTO public.financeiro_lancamentos_v2 (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::public.financeiro_lancamentos_v2, $1)', v_cols)
    USING (SELECT to_jsonb(l) || jsonb_build_object('id', v_id, 'financiamento_id', p_fin, 'status_transacao', p_status, 'data_pagamento', p_pg,
                 'valor', p_valor, 'descricao', 'SINT PS01 ' || p_desc, 'origem_tipo', p_tipo, 'cancelado', false, 'hash_importacao', NULL, 'lote_importacao_id', NULL)
             FROM public.financeiro_lancamentos_v2 l WHERE l.id = '00239d5a-389c-46b7-852e-d7ed042839c9');
  RETURN v_id;
END $f$;

CREATE FUNCTION pg_temp.contrato(p_nome text) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_id uuid := gen_random_uuid();
        v_cols text := (SELECT string_agg(quote_ident(column_name), ', ') FROM information_schema.columns
                         WHERE table_schema = 'public' AND table_name = 'financiamentos' AND is_generated = 'NEVER');
BEGIN
  EXECUTE format('INSERT INTO public.financiamentos (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::public.financiamentos, $1)', v_cols)
    USING (SELECT to_jsonb(f) || jsonb_build_object('id', v_id, 'numero_contrato', 'SINT-PS01-' || p_nome, 'descricao', 'SINT PS01 ' || p_nome,
                 'status', 'ativo', 'lancamento_captacao_id', NULL)
             FROM public.financiamentos f WHERE f.id = '74567fe0-3e09-4f22-84a5-2513d6557d27');
  RETURN v_id;
END $f$;

CREATE FUNCTION pg_temp.parcela(p_fin uuid, p_n int, p_lp uuid, p_lj uuid, p_status text) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.financiamento_parcelas (financiamento_id, cliente_id, numero_parcela, data_vencimento, valor_principal, valor_juros,
                                             valor_total, status, lancamento_id, lancamento_juros_id)
  VALUES (p_fin, '537661af-a934-4c66-b138-f8dbc378a00f', p_n, date '2027-01-15', 100, 10, 110, p_status, p_lp, p_lj) RETURNING id INTO v_id;
  RETURN v_id;
END $f$;

CREATE FUNCTION pg_temp.st(p uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT status || '|' || coalesce(data_pagamento::text, '-') FROM public.financiamento_parcelas WHERE id = p
$f$;

DO $t$
DECLARE
  u_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  f1 uuid; f9 uuid; lp uuid; lj uuid; lp2 uuid; lj2 uuid; p1 uuid; p2 uuid; p3 uuid; p9 uuid;
  v text; v_ok boolean; v_n int; v_msg text; v_antes text; v_depois text; v_r jsonb; v_cru uuid; v_ext uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  f1 := pg_temp.contrato('A');

  -- S1
  lp := pg_temp.lanc(f1, 'programado', NULL, 100, 'p1 principal', 'parcela_principal');
  lj := pg_temp.lanc(f1, 'programado', NULL, 10, 'p1 juros');
  p1 := pg_temp.parcela(f1, 1, lp, lj, 'pendente');
  IF pg_temp.st(p1) <> 'pendente|-' THEN RAISE EXCEPTION 'S1 em aberto: %', pg_temp.st(p1); END IF;
  lp2 := pg_temp.lanc(f1, 'realizado', date '2027-01-08', 100, 'p2 principal', 'parcela_principal');
  lj2 := pg_temp.lanc(f1, 'conciliado', date '2027-01-09', 10, 'p2 juros');
  p2 := pg_temp.parcela(f1, 2, lp2, lj2, 'pendente');
  IF pg_temp.st(p2) <> 'pago|2027-01-09' THEN RAISE EXCEPTION 'S1 nasce paga: %', pg_temp.st(p2); END IF;

  -- S2
  UPDATE public.financeiro_lancamentos_v2 SET status_transacao = 'realizado', data_pagamento = date '2027-01-10' WHERE id = lp;
  IF pg_temp.st(p1) <> 'pendente|-' THEN RAISE EXCEPTION 'S2 parcial: %', pg_temp.st(p1); END IF;
  UPDATE public.financeiro_lancamentos_v2 SET status_transacao = 'realizado', data_pagamento = date '2027-01-12' WHERE id = lj;
  IF pg_temp.st(p1) <> 'pago|2027-01-12' THEN RAISE EXCEPTION 'S2 paga: %', pg_temp.st(p1); END IF;

  -- S3
  UPDATE public.financeiro_lancamentos_v2 SET status_transacao = 'programado', data_pagamento = NULL WHERE id = lj;
  IF pg_temp.st(p1) <> 'pendente|-' THEN RAISE EXCEPTION 'S3 desfazer: %', pg_temp.st(p1); END IF;

  -- S4
  UPDATE public.financeiro_lancamentos_v2 SET cancelado = true, cancelado_em = now(), cancelado_motivo = 'SINT PS01' WHERE id = lj;
  IF pg_temp.st(p1) <> 'pago|2027-01-10' THEN RAISE EXCEPTION 'S4 cancelar: %', pg_temp.st(p1); END IF;
  UPDATE public.financeiro_lancamentos_v2 SET cancelado = true, cancelado_em = now(), cancelado_motivo = 'SINT PS01' WHERE id = lp;
  IF pg_temp.st(p1) <> 'pendente|-' THEN RAISE EXCEPTION 'S4 cancelar o ultimo: %', pg_temp.st(p1); END IF;
  UPDATE public.financeiro_lancamentos_v2 SET cancelado = false, cancelado_em = NULL, cancelado_motivo = NULL WHERE id = lp;
  IF pg_temp.st(p1) <> 'pago|2027-01-10' THEN RAISE EXCEPTION 'S4 descancelar: %', pg_temp.st(p1); END IF;

  -- S5
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.financiamento_parcelas SET status = 'pendente' WHERE id = p1;
  EXCEPTION WHEN raise_exception THEN v_ok := true; GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  END;
  RESET ROLE;
  IF NOT v_ok OR v_msg NOT LIKE '%segue os lançamentos dela, que estão pagos%' THEN RAISE EXCEPTION 'S5 front nao recusou (%)', v_msg; END IF;
  IF pg_temp.st(p1) <> 'pago|2027-01-10' THEN RAISE EXCEPTION 'S5 mudou depois da recusa: %', pg_temp.st(p1); END IF;
  UPDATE public.financiamento_parcelas SET status = 'pendente' WHERE id = p1;          -- o dono (postgres): corrigido, nao recusado
  IF pg_temp.st(p1) <> 'pago|2027-01-10' THEN RAISE EXCEPTION 'S5 dono nao corrigido: %', pg_temp.st(p1); END IF;

  -- S6
  p3 := pg_temp.parcela(f1, 3, NULL, NULL, 'pendente');
  SET LOCAL ROLE authenticated;
  UPDATE public.financiamento_parcelas SET status = 'pago', data_pagamento = date '2027-01-20' WHERE id = p3;   -- sem lancamento vivo: vale a coluna
  UPDATE public.financiamento_parcelas SET status = 'cancelado' WHERE id = p2;                                  -- para 'cancelado': nao se julga
  RESET ROLE;
  IF pg_temp.st(p3) <> 'pago|2027-01-20' THEN RAISE EXCEPTION 'S6 sem lancamento: %', pg_temp.st(p3); END IF;
  IF pg_temp.st(p2) NOT LIKE 'cancelado|%' THEN RAISE EXCEPTION 'S6 cancelar: %', pg_temp.st(p2); END IF;
  UPDATE public.financiamento_parcelas SET status = 'pendente' WHERE id = p2;                                   -- volta (foto): realinha
  IF pg_temp.st(p2) <> 'pago|2027-01-09' THEN RAISE EXCEPTION 'S6 volta de cancelado: %', pg_temp.st(p2); END IF;

  -- S7
  SELECT string_agg(l.id::text || l.status_transacao || l.valor::text || coalesce(l.cancelado, false)::text, ',' ORDER BY l.id) INTO v_antes
    FROM public.financeiro_lancamentos_v2 l WHERE l.financiamento_id = f1;
  v_r := public.fn_reconciliar_parcela_financiamento(p2, false, false, NULL);
  SELECT string_agg(l.id::text || l.status_transacao || l.valor::text || coalesce(l.cancelado, false)::text, ',' ORDER BY l.id) INTO v_depois
    FROM public.financeiro_lancamentos_v2 l WHERE l.financiamento_id = f1;
  IF v_antes IS DISTINCT FROM v_depois THEN RAISE EXCEPTION 'S7 motor mudou lancamentos (%)', left(v_r::text, 400); END IF;
  IF pg_temp.st(p2) <> 'pago|2027-01-09' THEN RAISE EXCEPTION 'S7 motor mudou a parcela: %', pg_temp.st(p2); END IF;

  -- S8
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.fn_financiamento_situacao(uuid,date,boolean)'::regprocedure
                    AND prosrc LIKE '%_fn_parcela_pelos_lancamentos%' AND prosrc NOT LIKE '%d.n_real = d.n_vivos%') THEN
    RAISE EXCEPTION 'S8 a situacao nao le^ a regra unica'; END IF;
  SELECT count(*) INTO v_n FROM jsonb_array_elements(public.fn_financiamento_situacao(f1, date '2027-01-31', false) -> 'parcelas') e
   JOIN public.financiamento_parcelas q ON q.id = (e->>'id')::uuid
   WHERE (e->>'situacao' = 'paga') IS DISTINCT FROM (q.status = 'pago');
  IF v_n <> 0 THEN RAISE EXCEPTION 'S8 situacao difere da coluna em %', v_n; END IF;

  -- S9
  f9 := pg_temp.contrato('PAGAR');
  p9 := pg_temp.parcela(f9, 1, NULL, NULL, 'pendente');
  v_cru := pg_temp.lanc(NULL, 'realizado', date '2027-02-05', 112, 'cru do extrato');
  UPDATE public.financeiro_lancamentos_v2 SET origem_lancamento = 'extrato', origem_tipo = NULL, plano_conta_id = NULL, subcentro = NULL WHERE id = v_cru;
  INSERT INTO public.extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao, status)
  SELECT l.cliente_id, l.conta_bancaria_id, date '2027-02-05', -112,
         (SELECT e.tipo_movimento FROM public.extrato_bancario_v2 e WHERE e.valor < 0 LIMIT 1), 'SINT-PS01-' || gen_random_uuid(), 'SINT PS01', 'conciliado'
    FROM public.financeiro_lancamentos_v2 l WHERE l.id = v_cru RETURNING id INTO v_ext;
  INSERT INTO public.conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado, tipo_aprovacao)
  VALUES ('537661af-a934-4c66-b138-f8dbc378a00f', v_ext, v_cru, 112, 'manual');
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.fn_financiamento_pagar_pelo_extrato(uuid,uuid,boolean)'::regprocedure
                    AND prosrc NOT LIKE '%SET status = ''pago''%') THEN RAISE EXCEPTION 'S9 a funcao ainda grava pago na parcela'; END IF;
  v_r := public.fn_financiamento_pagar_pelo_extrato(v_cru, p9, false);
  IF pg_temp.st(p9) <> 'pago|2027-02-05' THEN RAISE EXCEPTION 'S9 parcela: % (%)', pg_temp.st(p9), left(v_r::text, 300); END IF;
  IF EXISTS (SELECT 1 FROM public.financiamento_parcelas q
               JOIN public.financeiro_lancamentos_v2 l ON l.id IN (q.lancamento_id, q.lancamento_juros_id)
              WHERE q.id = p9 AND (l.status_transacao <> 'realizado' OR l.data_pagamento IS DISTINCT FROM date '2027-02-05')) THEN
    RAISE EXCEPTION 'S9 lancamentos da parcela nao realizados na data do extrato'; END IF;
  IF NOT (SELECT cancelado FROM public.financeiro_lancamentos_v2 WHERE id = v_cru) THEN RAISE EXCEPTION 'S9 cru nao cancelado'; END IF;

  RAISE EXCEPTION 'OK';
END $t$;
ROLLBACK;
