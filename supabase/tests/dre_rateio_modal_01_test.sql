-- DRE-RATEIO-MODAL-01 — `fn_painel_rateio_detalhe` (ramo 'admin') devolve o RESUMO, o MES A MES e a prova do rateio administrativo.
--
-- Roda como `postgres`, DEPOIS da migration 20261027193700, SO' LEITURA, e TERMINA EM RAISE. Sucesso = a excecao final comeca
-- com "OK". Usa dado real (NJ 2025 e a safra 24/25-Lav, fechados; Santa Rita 2021) e invariantes em todos os clientes.
--
-- T1  corpo, SECURITY DEFINER, search_path e ACL sao os registrados na migration.
-- T2  NJ 2025, pecuaria: bruto 1.266.534,34 = 886.574,04 + 316.633,58 + 63.326,72 + 0,00; diferenca 0; a pecuaria = `pool`;
--     12 meses; o total do mes a mes = o resumo.
-- T3  NJ, safra 24/25-Lav: bruto 1.228.990,13; `agricultura_por_safra` = [a safra pedida = `pool`, "outras safras"], somando a
--     parte da agricultura; a conta fecha.
-- T4  Santa Rita 2021: os 8.082,73 "nao alocados" sao a SILVICULTURA (sem DRE) — parte propria, e a conta fecha em 161.654,67.
-- T5  INVARIANTES em todos os clientes x 2020..2026 x tres atividades (a busca sabe achar: exige saidas com valor):
--     chaves de antes presentes; a parte da atividade pedida = `pool`; bruto − soma = diferenca = 0; cada mes fecha; 12 meses;
--     total do mes a mes = resumo.
-- T6  fora do ramo admin as tres chaves existem e sao nulas.
DO $teste$
DECLARE
  c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  f regprocedure := 'public.fn_painel_rateio_detalhe(uuid, uuid, text, text, text, text, text, text, text)'::regprocedure;
  r jsonb; rs jsonb; t jsonb; m jsonb; v_ok text := ''; v_safra uuid; v_sr uuid; c record; v_ano int; v_atv text; v_n int := 0; v_cheias int := 0; v_prot numeric;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);

  -- T1
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = f) <> '83bdfd55cd9fe15ee8eda29e82f427c2' THEN RAISE EXCEPTION 'T1 corpo: md5 %', (SELECT md5(prosrc) FROM pg_proc WHERE oid = f); END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = f) OR (SELECT proconfig::text FROM pg_proc WHERE oid = f) <> '{"search_path=pg_catalog, public"}'
     OR (SELECT proacl::text FROM pg_proc WHERE oid = f) <> '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' THEN
    RAISE EXCEPTION 'T1 SECURITY DEFINER / search_path / ACL mudaram'; END IF;
  v_ok := v_ok || 'T1 ';

  -- T2
  r := public.fn_painel_rateio_detalhe(c_nj, NULL, NULL, 'admin', NULL, 'pecuaria', '2025-01', '2025-12', 'realizado');
  rs := r->'resumo'; t := r->'por_mes_total';
  IF (rs->>'bruto')::numeric <> 1266534.34 OR (rs->>'soma')::numeric <> 1266534.34 OR (rs->>'diferenca')::numeric <> 0 THEN RAISE EXCEPTION 'T2 resumo %', rs; END IF;
  IF (rs->'partes'->0->>'destino') <> 'pecuaria' OR (rs->'partes'->0->>'valor')::numeric <> 886574.04 OR (rs->'partes'->1->>'valor')::numeric <> 316633.58
     OR (rs->'partes'->2->>'valor')::numeric <> 63326.72 OR (rs->'partes'->3->>'valor')::numeric <> 0 THEN RAISE EXCEPTION 'T2 partes %', rs->'partes'; END IF;
  IF (rs->'partes'->0->>'valor')::numeric <> (r->>'pool')::numeric THEN RAISE EXCEPTION 'T2 pecuaria % x pool %', rs->'partes'->0->>'valor', r->>'pool'; END IF;
  IF (rs->'partes'->0->>'pct')::numeric <> 70.0 OR (rs->'partes'->1->>'pct')::numeric <> 25.0 OR (rs->'partes'->2->>'pct')::numeric <> 5.0 THEN RAISE EXCEPTION 'T2 pct %', rs->'partes'; END IF;
  IF jsonb_array_length(r->'por_mes') <> 12 OR (r->'por_mes'->0->>'ano_mes') <> '2025-01' OR (r->'por_mes'->11->>'ano_mes') <> '2025-12' THEN RAISE EXCEPTION 'T2 meses'; END IF;
  IF (t->>'bruto')::numeric <> 1266534.34 OR (t->>'pecuaria')::numeric <> 886574.04 OR (t->>'agricultura')::numeric <> 316633.58 OR (t->>'silvicultura')::numeric <> 63326.72 THEN RAISE EXCEPTION 'T2 total %', t; END IF;
  IF rs->'agricultura_por_safra' <> 'null'::jsonb THEN RAISE EXCEPTION 'T2 agricultura_por_safra na pecuaria'; END IF;
  v_ok := v_ok || 'T2 ';

  -- T3
  SELECT id INTO v_safra FROM financeiro_safras WHERE cliente_id = c_nj AND codigo = '24/25-Lav';
  IF v_safra IS NULL THEN RAISE EXCEPTION 'T3 SETUP: safra 24/25-Lav do NJ nao encontrada'; END IF;
  r := public.fn_painel_rateio_detalhe(c_nj, v_safra, NULL, 'admin', NULL, 'agricultura', NULL, NULL, 'realizado');
  rs := r->'resumo';
  IF (rs->>'bruto')::numeric <> 1228990.13 OR (rs->>'soma')::numeric <> 1228990.13 OR (rs->>'diferenca')::numeric <> 0 THEN RAISE EXCEPTION 'T3 resumo %', rs; END IF;
  IF (rs->'agricultura_por_safra'->0->>'safra_id')::uuid <> v_safra OR (rs->'agricultura_por_safra'->0->>'valor')::numeric <> (r->>'pool')::numeric
     OR (r->>'pool')::numeric <= 0 THEN RAISE EXCEPTION 'T3 safra % x pool %', rs->'agricultura_por_safra', r->>'pool'; END IF;
  IF (SELECT sum((x->>'valor')::numeric) FROM jsonb_array_elements(rs->'agricultura_por_safra') x) <> (rs->'partes'->1->>'valor')::numeric THEN RAISE EXCEPTION 'T3 por safra nao soma a agricultura'; END IF;
  IF (r->'por_mes_total'->>'agricultura_safra')::numeric <> (r->>'pool')::numeric THEN RAISE EXCEPTION 'T3 coluna da safra no mes a mes'; END IF;
  v_ok := v_ok || 'T3 ';

  -- T4
  SELECT id INTO v_sr FROM clientes WHERE nome LIKE 'Santa Rita%';
  r := public.fn_painel_rateio_detalhe(v_sr, NULL, NULL, 'admin', NULL, 'pecuaria', '2021-01', '2021-12', 'realizado');
  rs := r->'resumo';
  IF (rs->>'bruto')::numeric <> 161654.67 OR (rs->>'soma')::numeric <> 161654.67 OR (rs->'partes'->2->>'valor')::numeric <> 8082.73
     OR (rs->'partes'->0->>'valor')::numeric <> 153571.94 OR (r->'nao_alocado'->>'silvicultura')::numeric <> 8082.73 THEN RAISE EXCEPTION 'T4 Santa Rita 2021 %', rs; END IF;
  v_ok := v_ok || 'T4 ';

  -- T5
  FOR c IN SELECT id, nome FROM clientes LOOP FOR v_ano IN 2020..2026 LOOP FOREACH v_atv IN ARRAY ARRAY['pecuaria','agricultura','silvicultura'] LOOP
    r := public.fn_painel_rateio_detalhe(c.id, NULL, NULL, 'admin', NULL, v_atv, v_ano||'-01', v_ano||'-12', 'realizado');
    rs := r->'resumo'; t := r->'por_mes_total'; v_n := v_n + 1;
    IF (rs->>'bruto')::numeric <> 0 THEN v_cheias := v_cheias + 1; END IF;
    IF NOT (r ?& ARRAY['pool','direto_cultura','fatias','lancamentos','pct_agricultura','fatias_atividade','pct_atividade','grupos','nao_alocado']) THEN RAISE EXCEPTION 'T5 % % %: chave de antes sumiu', c.nome, v_ano, v_atv; END IF;
    v_prot := (SELECT (p->>'valor')::numeric FROM jsonb_array_elements(rs->'partes') p WHERE p->>'destino' = v_atv);
    IF v_prot <> (r->>'pool')::numeric THEN RAISE EXCEPTION 'T5 % % %: parte % x pool %', c.nome, v_ano, v_atv, v_prot, r->>'pool'; END IF;
    IF (rs->>'diferenca')::numeric <> 0 OR (rs->>'bruto')::numeric <> (rs->>'soma')::numeric THEN RAISE EXCEPTION 'T5 % % %: nao fecha %', c.nome, v_ano, v_atv, rs; END IF;
    IF jsonb_array_length(r->'por_mes') <> 12 THEN RAISE EXCEPTION 'T5 % % %: % meses', c.nome, v_ano, v_atv, jsonb_array_length(r->'por_mes'); END IF;
    IF (t->>'bruto')::numeric <> (rs->>'bruto')::numeric OR (t->>'pecuaria')::numeric <> (rs->'partes'->0->>'valor')::numeric OR (t->>'agricultura')::numeric <> (rs->'partes'->1->>'valor')::numeric
       OR (t->>'silvicultura')::numeric <> (rs->'partes'->2->>'valor')::numeric OR (t->>'nao_alocado')::numeric <> (rs->'partes'->3->>'valor')::numeric THEN
      RAISE EXCEPTION 'T5 % % %: total do mes a mes <> resumo', c.nome, v_ano, v_atv; END IF;
    FOR m IN SELECT * FROM jsonb_array_elements(r->'por_mes') LOOP
      IF (m->>'bruto')::numeric <> (m->>'pecuaria')::numeric + (m->>'agricultura')::numeric + (m->>'silvicultura')::numeric + (m->>'nao_alocado')::numeric + (m->>'diferenca')::numeric
         OR (m->>'diferenca')::numeric <> 0 THEN RAISE EXCEPTION 'T5 % % %: o mes % nao fecha %', c.nome, v_ano, v_atv, m->>'ano_mes', m; END IF;
    END LOOP;
  END LOOP; END LOOP; END LOOP;
  IF v_cheias < 50 THEN RAISE EXCEPTION 'T5 a busca nao sabe achar: so % saidas com valor em %', v_cheias, v_n; END IF;
  v_ok := v_ok || format('T5(%s saidas, %s com valor) ', v_n, v_cheias);

  -- T6
  r := public.fn_painel_rateio_detalhe(c_nj, v_safra, 'mandioca', 'natureza', NULL);
  IF NOT (r ?& ARRAY['resumo','por_mes','por_mes_total']) OR r->'resumo' <> 'null'::jsonb OR r->'por_mes' <> 'null'::jsonb OR r->'por_mes_total' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'T6 fora do admin: %', r - 'lancamentos'; END IF;
  v_ok := v_ok || 'T6';

  RAISE EXCEPTION 'OK dre_rateio_modal_01: %', v_ok;
END
$teste$;
