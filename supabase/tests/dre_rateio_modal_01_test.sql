-- DRE-RATEIO-MODAL-01 (+ fix1) — `fn_painel_rateio_detalhe` (ramo 'admin') devolve o RESUMO, o MES A MES e a prova do rateio
-- administrativo; cada parcela e' o arredondamento DELA e o centavo que sobra aparece em `arredondamento`.
--
-- Roda como `postgres`, DEPOIS da migration 20261027193800, SO' LEITURA, e TERMINA EM RAISE. Sucesso = a excecao final comeca
-- com "OK". Usa dado real (NJ 2025 e a safra 24/25-Lav, fechados; Santa Rita 2021) e invariantes em todos os clientes.
--
-- T1  corpo, SECURITY DEFINER, search_path e ACL sao os registrados na migration.
-- T2  NJ 2025, pecuaria: bruto 1.266.534,34; partes 886.574,04 · 316.633,59 · 63.326,72 · 0,00 (cada uma o round do proprio
--     cru); soma 1.266.534,35; arredondamento -0,01; diferenca 0; a pecuaria = `pool`; 12 meses; total do mes a mes = resumo.
-- T3  NJ, safra 24/25-Lav: bruto 1.228.990,13; pecuaria 860.293,09 e silvicultura 61.449,51 (os numeros do DRE da pecuaria no
--     mesmo periodo); a safra pedida = `pool`, com `pct`; a conta fecha.
-- T4  Santa Rita 2021: os 8.082,73 "nao alocados" sao a SILVICULTURA (sem DRE) — parte propria, e a conta fecha em 161.654,67.
-- T5  INVARIANTES em todos os clientes x 2020..2026 x tres atividades (a busca sabe achar: exige saidas com valor):
--     chaves de antes presentes; a parte da atividade pedida = `pool`; diferenca = 0; arredondamento = bruto - soma e
--     |arredondamento| <= 0,01 x 4 parcelas; 12 meses; `por_mes_total` = `resumo`; cada mes: diferenca 0 e arredondamento = bruto - soma.
-- T6  fora do ramo admin as tres chaves existem e sao nulas.
-- T7  O MESMO NUMERO EM QUALQUER PORTA, em todos os clientes x anos e em todas as safras de lavoura: partes e bruto pela porta
--     da pecuaria = pela da agricultura (= pela da safra, no periodo dela); pecuaria do resumo = round(`rateio_adm.pool` de
--     `fn_dre_pecuaria`, 2); silvicultura do resumo = `rateio_adm.nao_alocado.silvicultura`. (NAO = `total.rateio_adm`: a grade
--     soma celulas arredondadas e fica 0,01 fora em 4 periodos — divida DRE-RATEIO-TOTAL-CENTAVO-01.)
DO $teste$
DECLARE
  c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  f regprocedure := 'public.fn_painel_rateio_detalhe(uuid, uuid, text, text, text, text, text, text, text)'::regprocedure;
  r jsonb; r2 jsonb; d jsonb; rs jsonb; t jsonb; m jsonb; v_ok text := ''; v_safra uuid; v_sr uuid; c record; sf record; v_ano int; v_atv text;
  v_n int := 0; v_cheias int := 0; v_prot numeric; v_arr int := 0; v_max numeric := 0; v_p int := 0; v_pd int := 0;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);

  -- T1
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = f) <> '983ac728a260ea02c168731f1c497dd3' THEN RAISE EXCEPTION 'T1 corpo: md5 %', (SELECT md5(prosrc) FROM pg_proc WHERE oid = f); END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = f) OR (SELECT proconfig::text FROM pg_proc WHERE oid = f) <> '{"search_path=pg_catalog, public"}'
     OR (SELECT proacl::text FROM pg_proc WHERE oid = f) <> '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' THEN
    RAISE EXCEPTION 'T1 SECURITY DEFINER / search_path / ACL mudaram'; END IF;
  v_ok := v_ok || 'T1 ';

  -- T2
  r := public.fn_painel_rateio_detalhe(c_nj, NULL, NULL, 'admin', NULL, 'pecuaria', '2025-01', '2025-12', 'realizado');
  rs := r->'resumo'; t := r->'por_mes_total';
  IF (rs->>'bruto')::numeric <> 1266534.34 OR (rs->>'soma')::numeric <> 1266534.35 OR (rs->>'arredondamento')::numeric <> -0.01 OR (rs->>'diferenca')::numeric <> 0 THEN RAISE EXCEPTION 'T2 resumo %', rs - 'partes'; END IF;
  IF (rs->'partes'->0->>'destino') <> 'pecuaria' OR (rs->'partes'->0->>'valor')::numeric <> 886574.04 OR (rs->'partes'->1->>'valor')::numeric <> 316633.59
     OR (rs->'partes'->2->>'valor')::numeric <> 63326.72 OR (rs->'partes'->3->>'valor')::numeric <> 0 THEN RAISE EXCEPTION 'T2 partes %', rs->'partes'; END IF;
  IF (rs->'partes'->0->>'valor')::numeric <> (r->>'pool')::numeric THEN RAISE EXCEPTION 'T2 pecuaria % x pool %', rs->'partes'->0->>'valor', r->>'pool'; END IF;
  IF (rs->'partes'->0->>'pct')::numeric <> 70.0 OR (rs->'partes'->1->>'pct')::numeric <> 25.0 OR (rs->'partes'->2->>'pct')::numeric <> 5.0 THEN RAISE EXCEPTION 'T2 pct %', rs->'partes'; END IF;
  IF jsonb_array_length(r->'por_mes') <> 12 OR (r->'por_mes'->0->>'ano_mes') <> '2025-01' OR (r->'por_mes'->11->>'ano_mes') <> '2025-12' THEN RAISE EXCEPTION 'T2 meses'; END IF;
  IF (t->>'bruto')::numeric <> 1266534.34 OR (t->>'pecuaria')::numeric <> 886574.04 OR (t->>'agricultura')::numeric <> 316633.59 OR (t->>'silvicultura')::numeric <> 63326.72
     OR (t->>'arredondamento')::numeric <> -0.01 THEN RAISE EXCEPTION 'T2 total %', t; END IF;
  IF rs->'agricultura_por_safra' <> 'null'::jsonb THEN RAISE EXCEPTION 'T2 agricultura_por_safra na pecuaria'; END IF;
  v_ok := v_ok || 'T2 ';

  -- T3
  SELECT id INTO v_safra FROM financeiro_safras WHERE cliente_id = c_nj AND codigo = '24/25-Lav';
  IF v_safra IS NULL THEN RAISE EXCEPTION 'T3 SETUP: safra 24/25-Lav do NJ nao encontrada'; END IF;
  r := public.fn_painel_rateio_detalhe(c_nj, v_safra, NULL, 'admin', NULL, 'agricultura', NULL, NULL, 'realizado');
  rs := r->'resumo';
  IF (rs->>'bruto')::numeric <> 1228990.13 OR (rs->>'diferenca')::numeric <> 0 OR (rs->>'bruto')::numeric - (rs->>'soma')::numeric <> (rs->>'arredondamento')::numeric THEN RAISE EXCEPTION 'T3 resumo %', rs - 'partes'; END IF;
  IF (rs->'partes'->0->>'valor')::numeric <> 860293.09 OR (rs->'partes'->2->>'valor')::numeric <> 61449.51 THEN RAISE EXCEPTION 'T3 pecuaria / silvicultura %', rs->'partes'; END IF;
  IF (rs->'agricultura_por_safra'->0->>'safra_id')::uuid <> v_safra OR (rs->'agricultura_por_safra'->0->>'valor')::numeric <> (r->>'pool')::numeric
     OR (r->>'pool')::numeric <= 0 OR (rs->'agricultura_por_safra'->0->>'pct')::numeric <> 25.0 THEN RAISE EXCEPTION 'T3 safra % x pool %', rs->'agricultura_por_safra', r->>'pool'; END IF;
  IF (r->'por_mes_total'->>'agricultura_safra')::numeric <> (r->>'pool')::numeric THEN RAISE EXCEPTION 'T3 coluna da safra no mes a mes'; END IF;
  v_ok := v_ok || 'T3 ';

  -- T4
  SELECT id INTO v_sr FROM clientes WHERE nome LIKE 'Santa Rita%';
  r := public.fn_painel_rateio_detalhe(v_sr, NULL, NULL, 'admin', NULL, 'pecuaria', '2021-01', '2021-12', 'realizado');
  rs := r->'resumo';
  IF (rs->>'bruto')::numeric <> 161654.67 OR (rs->>'soma')::numeric <> 161654.67 OR (rs->>'arredondamento')::numeric <> 0 OR (rs->'partes'->2->>'valor')::numeric <> 8082.73
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
    IF (rs->>'diferenca')::numeric <> 0 THEN RAISE EXCEPTION 'T5 % % %: nao fecha %', c.nome, v_ano, v_atv, rs; END IF;
    IF (rs->>'bruto')::numeric - (rs->>'soma')::numeric <> (rs->>'arredondamento')::numeric OR abs((rs->>'arredondamento')::numeric) > 0.04
       OR (rs->>'soma')::numeric <> (SELECT sum((p->>'valor')::numeric) FROM jsonb_array_elements(rs->'partes') p) THEN
      RAISE EXCEPTION 'T5 % % %: arredondamento %', c.nome, v_ano, v_atv, rs - 'partes'; END IF;
    IF v_atv = 'pecuaria' AND (rs->>'arredondamento')::numeric <> 0 THEN v_arr := v_arr + 1; v_max := greatest(v_max, abs((rs->>'arredondamento')::numeric)); END IF;
    IF jsonb_array_length(r->'por_mes') <> 12 THEN RAISE EXCEPTION 'T5 % % %: % meses', c.nome, v_ano, v_atv, jsonb_array_length(r->'por_mes'); END IF;
    IF (t - 'pct_pecuaria' - 'pct_agricultura') <> jsonb_build_object('bruto', rs->'bruto', 'pecuaria', rs->'partes'->0->'valor', 'agricultura', rs->'partes'->1->'valor',
         'silvicultura', rs->'partes'->2->'valor', 'nao_alocado', rs->'partes'->3->'valor', 'arredondamento', rs->'arredondamento', 'diferenca', rs->'diferenca') THEN
      RAISE EXCEPTION 'T5 % % %: total do mes a mes <> resumo', c.nome, v_ano, v_atv; END IF;
    FOR m IN SELECT * FROM jsonb_array_elements(r->'por_mes') LOOP
      IF (m->>'bruto')::numeric - ((m->>'pecuaria')::numeric + (m->>'agricultura')::numeric + (m->>'silvicultura')::numeric + (m->>'nao_alocado')::numeric) <> (m->>'arredondamento')::numeric
         OR (m->>'diferenca')::numeric <> 0 OR abs((m->>'arredondamento')::numeric) > 0.04 THEN RAISE EXCEPTION 'T5 % % %: o mes % nao fecha %', c.nome, v_ano, v_atv, m->>'ano_mes', m; END IF;
    END LOOP;
  END LOOP; END LOOP; END LOOP;
  IF v_cheias < 50 THEN RAISE EXCEPTION 'T5 a busca nao sabe achar: so % saidas com valor em %', v_cheias, v_n; END IF;
  v_ok := v_ok || format('T5(%s saidas, %s com valor; arredondamento<>0 em %s cliente-anos, maior %s) ', v_n, v_cheias, v_arr, v_max);

  -- T6
  r := public.fn_painel_rateio_detalhe(c_nj, v_safra, 'mandioca', 'natureza', NULL);
  IF NOT (r ?& ARRAY['resumo','por_mes','por_mes_total']) OR r->'resumo' <> 'null'::jsonb OR r->'por_mes' <> 'null'::jsonb OR r->'por_mes_total' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'T6 fora do admin: %', r - 'lancamentos'; END IF;
  v_ok := v_ok || 'T6 ';

  -- T7
  FOR c IN SELECT id, nome FROM clientes LOOP
    FOR v_ano IN 2020..2026 LOOP
      d := public.fn_dre_pecuaria(c.id, v_ano||'-01', v_ano||'-12');
      r := public.fn_painel_rateio_detalhe(c.id, NULL, NULL, 'admin', NULL, 'pecuaria', v_ano||'-01', v_ano||'-12', 'realizado');
      r2 := public.fn_painel_rateio_detalhe(c.id, NULL, NULL, 'admin', NULL, 'agricultura', v_ano||'-01', v_ano||'-12', 'realizado');
      v_p := v_p + 1;
      IF (r->'resumo'->'partes') <> (r2->'resumo'->'partes') OR (r->'resumo'->>'bruto') <> (r2->'resumo'->>'bruto') THEN RAISE EXCEPTION 'T7 % %: porta da pecuaria <> porta da agricultura', c.nome, v_ano; END IF;
      IF (d->'rateio_adm'->>'pool') IS NOT NULL THEN
        v_pd := v_pd + 1;
        IF (r->'resumo'->'partes'->0->>'valor')::numeric <> round((d->'rateio_adm'->>'pool')::numeric, 2) THEN RAISE EXCEPTION 'T7 % %: pecuaria % x pool do DRE %', c.nome, v_ano, r->'resumo'->'partes'->0->>'valor', d->'rateio_adm'->>'pool'; END IF;
        IF (r->'resumo'->'partes'->2->>'valor')::numeric <> round(coalesce((d->'rateio_adm'->'nao_alocado'->>'silvicultura')::numeric, 0), 2) THEN RAISE EXCEPTION 'T7 % %: silvicultura % x DRE %', c.nome, v_ano, r->'resumo'->'partes'->2->>'valor', d->'rateio_adm'->'nao_alocado'->>'silvicultura'; END IF;
      END IF;
    END LOOP;
    FOR sf IN SELECT id, coalesce(codigo, nome) cod, to_char(data_inicio,'YYYY-MM') de, to_char(data_fim,'YYYY-MM') ate FROM financeiro_safras
               WHERE cliente_id = c.id AND escopo_negocio = 'agricultura' AND data_inicio IS NOT NULL AND data_fim IS NOT NULL LOOP
      d := public.fn_dre_pecuaria(c.id, sf.de, sf.ate);
      r := public.fn_painel_rateio_detalhe(c.id, sf.id, NULL, 'admin', NULL);
      r2 := public.fn_painel_rateio_detalhe(c.id, NULL, NULL, 'admin', NULL, 'pecuaria', sf.de, sf.ate, 'realizado');
      v_p := v_p + 1;
      IF (r->'resumo'->'partes') <> (r2->'resumo'->'partes') OR (r->'resumo'->>'bruto') <> (r2->'resumo'->>'bruto') THEN RAISE EXCEPTION 'T7 % safra %: porta da safra <> porta da pecuaria', c.nome, sf.cod; END IF;
      IF (r->'resumo'->'agricultura_por_safra'->0->>'valor')::numeric <> (r->>'pool')::numeric OR NOT (r->'resumo'->'agricultura_por_safra'->0 ? 'pct') THEN RAISE EXCEPTION 'T7 % safra %: a safra % x pool %', c.nome, sf.cod, r->'resumo'->'agricultura_por_safra'->0, r->>'pool'; END IF;
      IF (d->'rateio_adm'->>'pool') IS NOT NULL THEN
        v_pd := v_pd + 1;
        IF (r->'resumo'->'partes'->0->>'valor')::numeric <> round((d->'rateio_adm'->>'pool')::numeric, 2) THEN RAISE EXCEPTION 'T7 % safra %: pecuaria % x pool do DRE %', c.nome, sf.cod, r->'resumo'->'partes'->0->>'valor', d->'rateio_adm'->>'pool'; END IF;
        IF (r->'resumo'->'partes'->2->>'valor')::numeric <> round(coalesce((d->'rateio_adm'->'nao_alocado'->>'silvicultura')::numeric, 0), 2) THEN RAISE EXCEPTION 'T7 % safra %: silvicultura', c.nome, sf.cod; END IF;
      END IF;
    END LOOP;
  END LOOP;
  IF v_pd < 30 THEN RAISE EXCEPTION 'T7 a busca nao sabe achar: so % periodos com DRE em %', v_pd, v_p; END IF;
  v_ok := v_ok || format('T7(%s periodos pelas duas portas, %s contra o DRE)', v_p, v_pd);

  RAISE EXCEPTION 'OK dre_rateio_modal_01: %', v_ok;
END
$teste$;
