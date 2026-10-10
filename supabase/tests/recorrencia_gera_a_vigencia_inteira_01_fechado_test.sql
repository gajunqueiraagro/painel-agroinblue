-- RECORRENCIA-GERA-A-VIGENCIA-INTEIRA-01 (parte B: G4–G6) — mes fechado, permissoes e A TRAVA. Parte A: ..._01_test.sql.
-- Roda como `postgres`, DEPOIS das migrations 20261027195500 e 20261027195600; TERMINA EM RAISE ("OK" = sucesso).
-- Cenario sintetico no cliente Teste; datas relativas ao mes corrente (m0); comparacoes com `is distinct from`.
--
-- G4  mes fechado NAO gera e vem em 'nao_gerados' com o motivo — na VAGA e no AVANCO; reaberto o mes, o gerar preenche.
-- G5  a busca de vagas: uma funcao so', fechada a anon e authenticated; a chamada de 4 argumentos devolve o de antes
--     (mes fechado fora, motivo nulo); o gerar segue com authenticated e sem anon.
-- ⚠ SEM `DELETE`: com `DELETE` dentro do bloco o canal de SQL recusou esta carga duas vezes ("Invalid or expired
--   requestState") e sem ele passou; reabrir o mes e' UPDATE para 'aberto', e o detector solta a linha da regra.
-- G6  A TRAVA: para toda regra ATIVA do cliente de teste, depois do gerar, nao existe competencia da vigencia sem
--     lancamento E sem motivo declarado (inclusive com um mes fechado dentro da vigencia) — e o detector sabe achar.
DO $teste$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_conta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  m0 date := date_trunc('month', current_date)::date;
  v_a uuid; v_b uuid; v_c uuid; v_sim jsonb; v_grv jsonb; v_res jsonb; v_n int; v_marca date; v_ok text := ''; r record;
  FUNCTION_VAGAS constant regprocedure := 'public._fn_recorrencia_vagas(public.financeiro_recorrencias, date[], date, date, boolean)'::regprocedure;
BEGIN
  SET LOCAL lock_timeout = '2s'; SET LOCAL statement_timeout = '10s';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);

  -- a regra B (vigencia do mes corrente em diante, ja' gerada): o G6 a leva para tras, com um mes fechado no caminho
  INSERT INTO financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base,
                                       dia_vencimento, data_inicio, primeiro_vencimento, data_fim)
  VALUES (c_cli, c_faz, 'ENSAIO vigencia B', c_conta, 'Dividendos Despesas Familiares', -250, 10,
          m0, (m0 + interval '1 month')::date + 9, (m0 + interval '3 months' - interval '1 day')::date)
  RETURNING id INTO v_b;
  PERFORM fn_recorrencia_gerar(v_b, NULL, false);

  -- G4 ─ mes fechado: no AVANCO (regra nova) e na VAGA
  INSERT INTO financeiro_fechamentos (cliente_id, ano_mes, status_fechamento) VALUES (c_cli, to_char(m0 - interval '2 months', 'YYYY-MM'), 'fechado');
  INSERT INTO financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base,
                                       dia_vencimento, data_inicio, primeiro_vencimento, data_fim)
  VALUES (c_cli, c_faz, 'ENSAIO vigencia C', c_conta, 'Dividendos Despesas Familiares', -70, 5,
          (m0 - interval '3 months')::date, (m0 - interval '3 months')::date + 4, (m0 + interval '1 month' - interval '1 day')::date)
  RETURNING id INTO v_c;
  v_sim := fn_recorrencia_gerar(v_c, NULL, true);
  v_grv := fn_recorrencia_gerar(v_c, NULL, false);
  IF (v_sim - 'simulacao') IS DISTINCT FROM (v_grv - 'simulacao') THEN RAISE EXCEPTION 'G4: simulacao <> gravacao: % x %', v_sim, v_grv; END IF;
  IF (v_grv ->> 'gerados') IS DISTINCT FROM '3' OR jsonb_array_length(v_grv -> 'nao_gerados') IS DISTINCT FROM 1
     OR (v_grv -> 'nao_gerados' -> 0 ->> 'competencia') IS DISTINCT FROM to_char(m0 - interval '2 months', 'YYYY-MM')
     OR (v_grv -> 'nao_gerados' -> 0 ->> 'vencimento') IS DISTINCT FROM ((m0 - interval '2 months')::date + 4)::text
     OR (v_grv -> 'nao_gerados' -> 0 ->> 'motivo') IS DISTINCT FROM 'mês fechado' THEN
    RAISE EXCEPTION 'G4 avanco: %', v_grv;
  END IF;
  IF EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 WHERE recorrencia_id = v_c AND data_competencia = (m0 - interval '2 months')::date) THEN
    RAISE EXCEPTION 'G4: gerou em mes fechado';
  END IF;
  -- agora a mesma competencia e' VAGA (abaixo da marca): continua sem gerar, continua dita
  v_res := fn_recorrencia_gerar(v_c, NULL, false);
  IF (v_res ->> 'gerados') IS DISTINCT FROM '0' OR (v_res -> 'nao_gerados' -> 0 ->> 'motivo') IS DISTINCT FROM 'mês fechado' OR (v_res -> 'vagas') IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'G4 vaga fechada: %', v_res;
  END IF;
  UPDATE financeiro_fechamentos SET status_fechamento = 'aberto' WHERE cliente_id = c_cli AND ano_mes = to_char(m0 - interval '2 months', 'YYYY-MM');
  v_res := fn_recorrencia_gerar(v_c, NULL, false);
  IF (v_res ->> 'gerados') IS DISTINCT FROM '1' OR (v_res -> 'nao_gerados') IS DISTINCT FROM '[]'::jsonb
     OR (v_res -> 'vagas' -> 0 ->> 'competencia') IS DISTINCT FROM to_char(m0 - interval '2 months', 'YYYY-MM') THEN
    RAISE EXCEPTION 'G4 reaberto: %', v_res;
  END IF;
  v_ok := v_ok || 'G4 ok (mes fechado nao gera e vem em nao_gerados, no avanco e na vaga; reaberto, preenche); ';

  -- G5 ─ a busca de vagas e as permissoes
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = '_fn_recorrencia_vagas') IS DISTINCT FROM 1::bigint THEN
    RAISE EXCEPTION 'G5: mais de uma _fn_recorrencia_vagas';
  END IF;
  IF has_function_privilege('authenticated', FUNCTION_VAGAS, 'EXECUTE') OR has_function_privilege('anon', FUNCTION_VAGAS, 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_recorrencia_gerar(uuid, date, boolean)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_recorrencia_gerar(uuid, date, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'G5: ACL';
  END IF;
  INSERT INTO financeiro_fechamentos (cliente_id, ano_mes, status_fechamento) VALUES (c_cli, to_char(m0 - interval '3 months', 'YYYY-MM'), 'fechado');
  SELECT count(*) INTO v_n FROM public._fn_recorrencia_vagas((SELECT rr FROM financeiro_recorrencias rr WHERE rr.id = v_c), NULL::date[], NULL::date, m0) vg;
  IF v_n IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'G5: 4 argumentos devolveu % (esperado 3: o mes fechado fica fora)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public._fn_recorrencia_vagas((SELECT rr FROM financeiro_recorrencias rr WHERE rr.id = v_c), NULL::date[], NULL::date, m0, true) vg WHERE vg.motivo = 'mês fechado';
  IF v_n IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'G5: com fechados devolveu % com motivo (esperado 1)', v_n; END IF;
  UPDATE financeiro_fechamentos SET status_fechamento = 'aberto' WHERE cliente_id = c_cli AND ano_mes = to_char(m0 - interval '3 months', 'YYYY-MM');
  v_ok := v_ok || 'G5 ok (uma funcao de vagas, fechada; 4 argumentos = mes fechado fora; gerar com authenticated e sem anon); ';

  -- G6 ─ A TRAVA: nenhuma competencia da vigencia sem lancamento e sem motivo, em toda regra ativa do cliente de teste
  INSERT INTO financeiro_fechamentos (cliente_id, ano_mes, status_fechamento) VALUES (c_cli, to_char(m0 - interval '4 months', 'YYYY-MM'), 'fechado');
  UPDATE financeiro_recorrencias SET data_inicio = (m0 - interval '4 months')::date, primeiro_vencimento = (m0 - interval '3 months')::date + 9 WHERE id = v_b;
  v_n := 0;
  FOR r IN SELECT rr.id FROM financeiro_recorrencias rr WHERE rr.cliente_id = c_cli AND rr.ativo LOOP
    v_res := fn_recorrencia_gerar(r.id, NULL, false);
    v_n := v_n + 1;
    IF EXISTS (
      SELECT 1 FROM financeiro_recorrencias rr, generate_series(date_trunc('month', rr.data_inicio), date_trunc('month', rr.data_fim), interval '1 month') gs
       WHERE rr.id = r.id
         AND NOT EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 l WHERE l.recorrencia_id = rr.id AND date_trunc('month', l.data_competencia) = gs)
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_res -> 'nao_gerados') ng WHERE ng ->> 'competencia' = to_char(gs, 'YYYY-MM') AND coalesce(ng ->> 'motivo', '') <> '')
    ) THEN RAISE EXCEPTION 'G6: a regra % ficou com competencia sem lancamento e sem motivo: %', r.id, v_res; END IF;
  END LOOP;
  IF v_n < 2 THEN RAISE EXCEPTION 'G6: a busca achou so % regras ativas (esperado ao menos as 2 do ensaio)', v_n; END IF;
  -- a busca sabe achar: uma competencia arrancada a' forca aparece
  UPDATE financeiro_lancamentos_v2 SET recorrencia_id = NULL WHERE recorrencia_id = v_c AND data_competencia = m0;
  IF NOT EXISTS (
    SELECT 1 FROM financeiro_recorrencias rr, generate_series(date_trunc('month', rr.data_inicio), date_trunc('month', rr.data_fim), interval '1 month') gs
     WHERE rr.id = v_c AND NOT EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 l WHERE l.recorrencia_id = rr.id AND date_trunc('month', l.data_competencia) = gs)
  ) THEN RAISE EXCEPTION 'G6: o detector nao acha competencia sem lancamento'; END IF;
  v_ok := v_ok || format('G6 ok (%s regras ativas: nenhuma competencia sem lancamento e sem motivo; o detector sabe achar)', v_n);

  RAISE EXCEPTION 'OK — %', v_ok;
END
$teste$;
