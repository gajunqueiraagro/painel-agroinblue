-- RECORRENCIA-GERA-A-VIGENCIA-INTEIRA-01 (parte A: G1–G3) — a recorrencia gera TODOS os meses da vigencia, inclusive os passados.
-- A parte B (G4–G6: mes fechado, permissoes e A TRAVA) esta' em recorrencia_gera_a_vigencia_inteira_01_fechado_test.sql
-- (dois arquivos porque o canal de SQL recusa carga acima de ~10 KB).
--
-- Roda como `postgres`, DEPOIS das migrations 20261027195500 e 20261027195600, numa transacao que TERMINA EM RAISE: nada fica
-- no banco. Sucesso = a excecao final comeca com "OK". Qualquer outra excecao e' falha e diz qual prova caiu.
-- Cenario sintetico no cliente Teste (43f32d07). As datas sao RELATIVAS ao mes corrente (m0): o teste vale em qualquer dia.
-- Comparacoes com `is distinct from` (nunca `<>`: com NULL o `if` nao dispararia).
--
-- G1  regra criada hoje com inicio 3 meses atras: a simulacao e a gravacao devolvem o MESMO retorno (7 = 3 passados + o
--     corrente + 3 futuros; gerado_de = inicio, gerado_ate = fim); os 7 nascem 'previsto', sem pagamento, com o
--     vencimento da formula unica. Segunda chamada: 0.
-- G2  cancelado passado continua OCUPADO: nao e' recriado, nao e' vaga, nao e' "nao gerado".
-- G3  a vigencia levada para tras DEPOIS de gerar (o defeito real): as competencias passadas viram vagas, a simulacao as
--     lista com o vencimento, o propagar as preve pela mesma funcao, e a gravacao as cria. A marca nao recua.
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

  -- G1 ─ regra nova com inicio 3 meses atras
  INSERT INTO financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base,
                                       dia_vencimento, data_inicio, primeiro_vencimento, data_fim)
  VALUES (c_cli, c_faz, 'ENSAIO vigencia A', c_conta, 'Dividendos Despesas Familiares', -100, 10,
          (m0 - interval '3 months')::date, (m0 - interval '2 months')::date + 9, (m0 + interval '4 months' - interval '1 day')::date)
  RETURNING id INTO v_a;
  v_sim := fn_recorrencia_gerar(v_a, NULL, true);
  IF (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE recorrencia_id = v_a) IS DISTINCT FROM 0::bigint THEN RAISE EXCEPTION 'G1: a simulacao gravou'; END IF;
  v_grv := fn_recorrencia_gerar(v_a, NULL, false);
  IF (v_sim - 'simulacao') IS DISTINCT FROM (v_grv - 'simulacao') THEN RAISE EXCEPTION 'G1: simulacao <> gravacao: % x %', v_sim, v_grv; END IF;
  IF (v_grv ->> 'gerados') IS DISTINCT FROM '7' OR (v_grv ->> 'gerado_de') IS DISTINCT FROM to_char(m0 - interval '3 months', 'YYYY-MM')
     OR (v_grv ->> 'gerado_ate') IS DISTINCT FROM to_char(m0 + interval '3 months', 'YYYY-MM')
     OR (v_grv -> 'nao_gerados') IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'G1 retorno: %', v_grv; END IF;
  SELECT count(*) INTO v_n FROM financeiro_lancamentos_v2 l, financeiro_recorrencias rr
   WHERE rr.id = v_a AND l.recorrencia_id = v_a AND l.cancelado IS NOT TRUE AND l.status_transacao = 'previsto' AND l.data_pagamento IS NULL
     AND l.data_vencimento = public._fn_recorrencia_vencimento(rr, l.data_competencia) AND l.valor = 100
     AND l.data_competencia BETWEEN (m0 - interval '3 months')::date AND (m0 + interval '3 months')::date;
  IF v_n IS DISTINCT FROM 7 THEN RAISE EXCEPTION 'G1: % lancamentos certos (esperado 7)', v_n; END IF;
  SELECT count(*) INTO v_n FROM financeiro_lancamentos_v2 WHERE recorrencia_id = v_a AND data_competencia < m0;
  IF v_n IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'G1: % passados (esperado 3)', v_n; END IF;
  IF (fn_recorrencia_gerar(v_a, NULL, false) ->> 'gerados') IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'G1: a segunda chamada gerou'; END IF;
  v_ok := v_ok || 'G1 ok (7 = 3 passados + corrente + 3 futuros; simulacao = gravacao; previsto, sem pagamento, vencimento da formula); ';

  -- G2 ─ cancelado passado continua ocupado
  UPDATE financeiro_lancamentos_v2 SET cancelado = true WHERE recorrencia_id = v_a AND data_competencia = (m0 - interval '1 month')::date;
  v_res := fn_recorrencia_gerar(v_a, NULL, false);
  IF (v_res ->> 'gerados') IS DISTINCT FROM '0' OR (v_res -> 'vagas') IS DISTINCT FROM '[]'::jsonb OR (v_res -> 'nao_gerados') IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'G2: o cancelado passado nao ficou ocupado: %', v_res;
  END IF;
  IF (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE recorrencia_id = v_a) IS DISTINCT FROM 7::bigint THEN RAISE EXCEPTION 'G2: nasceu lancamento'; END IF;
  v_ok := v_ok || 'G2 ok (cancelado passado ocupado: nada recriado); ';

  -- G3 ─ a vigencia levada para tras depois de gerar (o defeito)
  INSERT INTO financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base,
                                       dia_vencimento, data_inicio, primeiro_vencimento, data_fim)
  VALUES (c_cli, c_faz, 'ENSAIO vigencia B', c_conta, 'Dividendos Despesas Familiares', -250, 10,
          m0, (m0 + interval '1 month')::date + 9, (m0 + interval '3 months' - interval '1 day')::date)
  RETURNING id INTO v_b;
  PERFORM fn_recorrencia_gerar(v_b, NULL, false);
  SELECT ultimo_lancamento_gerado INTO v_marca FROM financeiro_recorrencias WHERE id = v_b;
  UPDATE financeiro_recorrencias SET data_inicio = (m0 - interval '2 months')::date, primeiro_vencimento = (m0 - interval '1 month')::date + 9 WHERE id = v_b;
  v_sim := fn_recorrencia_gerar(v_b, NULL, true);
  IF (v_sim ->> 'gerados') IS DISTINCT FROM '2' OR jsonb_array_length(v_sim -> 'vagas') IS DISTINCT FROM 2
     OR (v_sim -> 'vagas' -> 0 ->> 'competencia') IS DISTINCT FROM to_char(m0 - interval '2 months', 'YYYY-MM')
     OR (v_sim -> 'vagas' -> 0 ->> 'vencimento') IS DISTINCT FROM ((m0 - interval '1 month')::date + 9)::text
     OR (v_sim -> 'vagas' -> 1 ->> 'competencia') IS DISTINCT FROM to_char(m0 - interval '1 month', 'YYYY-MM') THEN
    RAISE EXCEPTION 'G3 simulacao: %', v_sim;
  END IF;
  v_res := fn_recorrencia_propagar(v_b, 'futuros', true);
  IF jsonb_array_length(v_res -> 'competencia' -> 'projecao' -> 'futuros' -> 'vagas') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'G3: o propagar nao preve as vagas passadas: %', v_res -> 'competencia' -> 'projecao';
  END IF;
  v_grv := fn_recorrencia_gerar(v_b, NULL, false);
  IF (v_sim - 'simulacao') IS DISTINCT FROM (v_grv - 'simulacao') THEN RAISE EXCEPTION 'G3: simulacao <> gravacao: % x %', v_sim, v_grv; END IF;
  SELECT count(*) INTO v_n FROM financeiro_lancamentos_v2 l, financeiro_recorrencias rr
   WHERE rr.id = v_b AND l.recorrencia_id = v_b AND l.data_competencia < m0 AND l.status_transacao = 'previsto' AND l.data_pagamento IS NULL
     AND l.data_vencimento = public._fn_recorrencia_vencimento(rr, l.data_competencia);
  IF v_n IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'G3: % passados criados (esperado 2)', v_n; END IF;
  IF (SELECT ultimo_lancamento_gerado FROM financeiro_recorrencias WHERE id = v_b) IS DISTINCT FROM v_marca THEN RAISE EXCEPTION 'G3: a marca mudou'; END IF;
  v_ok := v_ok || 'G3 ok (vigencia para tras: 2 vagas passadas na simulacao, no propagar e na gravacao; a marca nao recua); ';

  RAISE EXCEPTION 'OK — %', v_ok;
END
$teste$;
