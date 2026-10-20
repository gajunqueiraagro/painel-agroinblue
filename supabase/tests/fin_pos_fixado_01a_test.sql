-- FIN-POS-FIXADO-01a — os juros estimados do contrato pos-fixado. Termina em RAISE 'OK'; tudo desfeito.
--   J1 RRCC: exatamente os 4 lancamentos de juros das parcelas 2 a 5 do 8.233.040 (R$ 89.163,34); a parcela 1 (paga) nao
--   J2 todos os clientes: so' esses 4 no proto inteiro; nenhum de contrato com tipo_taxa nulo
--   J3 sinteticos (no RRCC): pre e nulo nao marcam; pos AJUSTADA marca; pos com a parcela paga ou cancelada, ou com o juros
--      realizado ou conciliado, nao marca — os MESMOS casos do espelho TS (src/lib/financiamentos/jurosPosFixado.casos.json)
--   J4 outro cliente: 42501; sem usuario: 42501
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';
DO $t$
DECLARE
  c_rrcc constant uuid := '537661af-a934-4c66-b138-f8dbc378a00f';
  c_fin  constant uuid := '74567fe0-3e09-4f22-84a5-2513d6557d27';
  c_molde constant uuid := '00239d5a-389c-46b7-852e-d7ed042839c9'; -- o lancamento de juros da parcela 2 (molde da copia)
  u_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  u_nj    constant uuid := '9200e0d0-095f-4ab8-a31a-3052a0faaf56';
  v_n int; v_soma numeric; v_ok boolean; v_esp uuid[]; v_got uuid[];
  r record; v_f uuid; v_l uuid;
  v_cols text := (SELECT string_agg(quote_ident(column_name), ', ') FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'financeiro_lancamentos_v2' AND is_generated = 'NEVER');
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);

  -- J1
  SELECT array_agg(p.lancamento_juros_id ORDER BY p.lancamento_juros_id) INTO v_esp
    FROM public.financiamento_parcelas p WHERE p.financiamento_id = c_fin AND p.numero_parcela BETWEEN 2 AND 5;
  SELECT array_agg(e.lancamento_id ORDER BY e.lancamento_id), coalesce(sum(l.valor), 0) INTO v_got, v_soma
    FROM public.fn_juros_estimados_do_cliente(c_rrcc) e JOIN public.financeiro_lancamentos_v2 l ON l.id = e.lancamento_id;
  IF v_got IS DISTINCT FROM v_esp OR cardinality(v_got) <> 4 THEN RAISE EXCEPTION 'J1 marcados: % (esperado %)', v_got, v_esp; END IF;
  IF v_soma <> 89163.34 THEN RAISE EXCEPTION 'J1 soma %', v_soma; END IF;
  IF EXISTS (SELECT 1 FROM public.fn_juros_estimados_do_cliente(c_rrcc) e JOIN public.financiamento_parcelas p ON p.id = e.parcela_id
              WHERE p.numero_parcela = 1) THEN RAISE EXCEPTION 'J1 a parcela 1 (paga) marcou'; END IF;

  -- J2
  SELECT count(*) INTO v_n FROM public.clientes c CROSS JOIN LATERAL public.fn_juros_estimados_do_cliente(c.id) e;
  IF v_n <> 4 THEN RAISE EXCEPTION 'J2 o proto marcou % (esperado 4)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.clientes c CROSS JOIN LATERAL public.fn_juros_estimados_do_cliente(c.id) e
    JOIN public.financiamentos f ON f.id = e.financiamento_id WHERE f.tipo_taxa IS DISTINCT FROM 'pos';
  IF v_n <> 0 THEN RAISE EXCEPTION 'J2 marcou % de contrato nao pos', v_n; END IF;

  -- J3 (sintetico): cada caso = um contrato com uma parcela e um lancamento de juros copiado do molde
  CREATE TEMP TABLE casos (nome text, tipo_taxa text, status_parcela text, ajustada boolean, status_lanc text, esperado boolean,
                           fin uuid, lanc uuid) ON COMMIT DROP;
  INSERT INTO casos (nome, tipo_taxa, status_parcela, ajustada, status_lanc, esperado) VALUES
    ('pre',            'pre', 'pendente',  false, 'programado', false),
    ('nulo',           NULL,  'pendente',  false, 'programado', false),
    ('pos',            'pos', 'pendente',  false, 'programado', true),
    ('pos_ajustada',   'pos', 'pendente',  true,  'programado', true),
    ('pos_previsto',   'pos', 'pendente',  false, 'previsto',   true),
    ('pos_paga',       'pos', 'pago',      false, 'programado', false),
    ('pos_cancelada',  'pos', 'cancelado', false, 'programado', false),
    ('pos_realizado',  'pos', 'pendente',  false, 'realizado',  false),
    ('pos_conciliado', 'pos', 'pendente',  false, 'conciliado', false);
  FOR r IN SELECT * FROM casos LOOP
    INSERT INTO public.financiamentos (cliente_id, natureza, tipo_taxa, status, descricao, numero_contrato)
      VALUES (c_rrcc, 'financiamento', r.tipo_taxa, 'ativo', 'SINT FIN-POS-FIXADO-01a ' || r.nome, 'SINT-' || r.nome) RETURNING id INTO v_f;
    v_l := gen_random_uuid();
    /* a copia leva so' as colunas gravaveis (`conta_efetiva_id` e' gerada) */
    EXECUTE format('INSERT INTO public.financeiro_lancamentos_v2 (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::public.financeiro_lancamentos_v2, $1)', v_cols)
      USING (SELECT to_jsonb(l) || jsonb_build_object('id', v_l, 'financiamento_id', v_f, 'status_transacao', r.status_lanc,
               'data_pagamento', CASE WHEN r.status_lanc IN ('realizado', 'conciliado') THEN l.data_vencimento END,
               'descricao', 'SINT juros ' || r.nome)
               FROM public.financeiro_lancamentos_v2 l WHERE l.id = c_molde);
    INSERT INTO public.financiamento_parcelas (financiamento_id, numero_parcela, data_vencimento, valor_principal, valor_juros,
                                               valor_total, status, ajustada, lancamento_juros_id)
      VALUES (v_f, 1, date '2027-08-15', 100, 10, 110, r.status_parcela, r.ajustada, v_l);
    UPDATE casos SET fin = v_f, lanc = v_l WHERE nome = r.nome;
  END LOOP;
  FOR r IN SELECT c.*, EXISTS (SELECT 1 FROM public.fn_juros_estimados_do_cliente(c_rrcc) e WHERE e.lancamento_id = c.lanc) AS marcou
             FROM casos c LOOP
    IF r.nome = 'pos_paga' THEN
      -- FIN-PARCELA-STATUS-01: parcela 'pago' com o juros em aberto deixou de existir — o gatilho leva a coluna ao que os lancamentos dizem
      -- ('pendente'), e o juros em aberto de um pos-fixado e' estimado. A regra pura (abaixo) segue dizendo nao para (pos, pago, programado).
      IF (SELECT q.status FROM public.financiamento_parcelas q WHERE q.lancamento_juros_id = r.lanc) <> 'pendente' OR NOT r.marcou THEN
        RAISE EXCEPTION 'J3 caso pos_paga: a coluna nao seguiu o juros em aberto'; END IF;
    ELSIF r.marcou IS DISTINCT FROM r.esperado THEN RAISE EXCEPTION 'J3 caso %: marcou=% esperado=%', r.nome, r.marcou, r.esperado; END IF;
    IF public._fn_juros_estimado(r.tipo_taxa, r.status_parcela, r.status_lanc) IS DISTINCT FROM r.esperado THEN
      RAISE EXCEPTION 'J3 regra pura, caso %', r.nome; END IF;
  END LOOP;

  -- J4
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_nj, 'role', 'authenticated')::text, true);
  v_ok := false;
  BEGIN PERFORM public.fn_juros_estimados_do_cliente(c_rrcc); EXCEPTION WHEN insufficient_privilege THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'J4 outro cliente nao recusou'; END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  v_ok := false;
  BEGIN PERFORM public.fn_juros_estimados_do_cliente(c_rrcc); EXCEPTION WHEN insufficient_privilege THEN v_ok := true; END;
  IF NOT v_ok THEN RAISE EXCEPTION 'J4 sem usuario nao recusou'; END IF;

  RAISE EXCEPTION 'OK';
END $t$;
ROLLBACK;
