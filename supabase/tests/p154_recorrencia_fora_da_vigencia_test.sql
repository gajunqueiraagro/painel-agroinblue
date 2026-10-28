-- P154 — fn_recorrencia_fora_da_vigencia: a recorrência ENCURTADA ou CANCELADA cancela só os PREVISTOS fora da vigência.
-- Roda como `postgres`, numa transação que TERMINA EM RAISE: nada fica no banco. Sucesso = a exceção final começa com "OK".
-- Cenário sintético no cliente Teste (43f32d07); datas RELATIVAS ao mês corrente (m0).
--
-- T1  encurtar, SIMULAR: diz 2 a cancelar (o previsto e o "valor do mês", com a marca) e 2 que não mexe (programado; mês fechado);
--     nada muda no banco (md5 da série igual).
-- T2  encurtar, APLICAR: os 2 previstos cancelados com o motivo; programado, mês fechado e os de dentro da vigência intocados.
-- T3  o cancelado OCUPA a competência: com o fim de volta, o Gerar não recria os 2.
-- T4  CANCELAR a regra: `ativo = false` e os previstos de m0 em diante cancelados; os de antes de m0 vivos.
-- T5  tenant: um usuário de fora recebe 42501.
DO $teste$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_conta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  m0 date := date_trunc('month', current_date)::date;
  v_a uuid; v_b uuid; v_res jsonb; v_md5 text; v_n int; v_ok text := '';
BEGIN
  SET LOCAL lock_timeout = '2s'; SET LOCAL statement_timeout = '15s';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);

  -- A: m0-2 .. m0+5 (8 meses), gerada; m0+3 em mês fechado, m0+4 programado, m0+5 previsto com "valor do mês"
  INSERT INTO financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base, dia_vencimento, data_inicio, primeiro_vencimento, data_fim)
  VALUES (c_cli, c_faz, 'ENSAIO P154 A', c_conta, 'Dividendos Despesas Familiares', -100, 10, (m0 - interval '2 months')::date,
          (m0 - interval '1 month')::date + 9, (m0 + interval '6 months' - interval '1 day')::date)
  RETURNING id INTO v_a;
  PERFORM fn_recorrencia_gerar(v_a, NULL, false);
  IF (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE recorrencia_id = v_a AND cancelado IS NOT TRUE) IS DISTINCT FROM 8::bigint THEN
    RAISE EXCEPTION 'fixture: a série A não tem 8'; END IF;
  UPDATE financeiro_lancamentos_v2 SET status_transacao = 'programado'
   WHERE recorrencia_id = v_a AND date_trunc('month', data_competencia) = m0 + interval '4 months';
  UPDATE financeiro_lancamentos_v2 SET valor_do_mes_em = now(), valor_do_mes_origem = 'manual', valor = 123.45
   WHERE recorrencia_id = v_a AND date_trunc('month', data_competencia) = m0 + interval '5 months';
  INSERT INTO financeiro_fechamentos (cliente_id, ano_mes, status_fechamento) VALUES (c_cli, to_char(m0 + interval '3 months', 'YYYY-MM'), 'fechado');
  -- a tela salva o fim mais cedo: fim em m0+1
  UPDATE financeiro_recorrencias SET data_fim = (m0 + interval '2 months' - interval '1 day')::date WHERE id = v_a;
  SELECT md5(string_agg(md5(l::text), '' ORDER BY l.id)) INTO v_md5 FROM financeiro_lancamentos_v2 l WHERE l.recorrencia_id = v_a;

  -- T1 ─ simular
  v_res := fn_recorrencia_fora_da_vigencia(v_a, false, NULL, true);
  IF (v_res ->> 'modo') IS DISTINCT FROM 'encurtada' OR (v_res ->> 'qtde') IS DISTINCT FROM '2'
     OR jsonb_array_length(v_res -> 'nao_mexe') IS DISTINCT FROM 2
     OR (v_res -> 'cancela' -> 0 ->> 'competencia') IS DISTINCT FROM to_char(m0 + interval '2 months', 'YYYY-MM-DD')
     OR (v_res -> 'cancela' -> 1 ->> 'valor_do_mes') IS DISTINCT FROM 'true'
     OR (v_res -> 'nao_mexe' -> 0 ->> 'motivo') IS DISTINCT FROM 'mês fechado'
     OR (v_res -> 'nao_mexe' -> 1 ->> 'motivo') IS DISTINCT FROM 'programado: só à mão' THEN RAISE EXCEPTION 'T1: %', v_res; END IF;
  IF (SELECT md5(string_agg(md5(l::text), '' ORDER BY l.id)) FROM financeiro_lancamentos_v2 l WHERE l.recorrencia_id = v_a) IS DISTINCT FROM v_md5 THEN
    RAISE EXCEPTION 'T1: simular gravou'; END IF;
  v_ok := v_ok || 'T1 ok (simular: 2 a cancelar, 2 ditos, nada gravado); ';

  -- T2 ─ aplicar
  v_res := fn_recorrencia_fora_da_vigencia(v_a, false, 'recorrência encerrada em teste', false);
  IF (v_res ->> 'qtde') IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'T2: %', v_res; END IF;
  IF (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE recorrencia_id = v_a AND cancelado
        AND cancelado_motivo = 'recorrência encerrada em teste' AND cancelado_em IS NOT NULL) IS DISTINCT FROM 2::bigint
     OR (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE recorrencia_id = v_a AND cancelado IS NOT TRUE) IS DISTINCT FROM 6::bigint
     OR EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 WHERE recorrencia_id = v_a AND cancelado
                  AND date_trunc('month', data_competencia) IN (m0 + interval '3 months', m0 + interval '4 months'))
     OR EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 WHERE recorrencia_id = v_a AND cancelado
                  AND date_trunc('month', data_competencia) <= m0 + interval '1 month') THEN RAISE EXCEPTION 'T2: o que mudou não é o esperado'; END IF;
  v_ok := v_ok || 'T2 ok (só os 2 previstos; programado, mês fechado e a vigência intocados); ';

  -- T3 ─ o cancelado ocupa: o fim de volta, o Gerar não recria
  UPDATE financeiro_fechamentos SET status_fechamento = 'aberto' WHERE cliente_id = c_cli AND ano_mes = to_char(m0 + interval '3 months', 'YYYY-MM');
  UPDATE financeiro_recorrencias SET data_fim = (m0 + interval '6 months' - interval '1 day')::date WHERE id = v_a;
  v_res := fn_recorrencia_gerar(v_a, NULL, false);
  IF (v_res ->> 'gerados') IS DISTINCT FROM '0'
     OR (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE recorrencia_id = v_a) IS DISTINCT FROM 8::bigint THEN RAISE EXCEPTION 'T3: %', v_res; END IF;
  v_ok := v_ok || 'T3 ok (o cancelado ocupa a competência: o Gerar não recria); ';

  -- T4 ─ cancelar a regra: corte no mês corrente
  INSERT INTO financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base, dia_vencimento, data_inicio, primeiro_vencimento, data_fim)
  VALUES (c_cli, c_faz, 'ENSAIO P154 B', c_conta, 'Dividendos Despesas Familiares', -55, 10, (m0 - interval '2 months')::date,
          (m0 - interval '1 month')::date + 9, (m0 + interval '4 months' - interval '1 day')::date)
  RETURNING id INTO v_b;
  PERFORM fn_recorrencia_gerar(v_b, NULL, false);
  v_res := fn_recorrencia_fora_da_vigencia(v_b, true, NULL, false);
  IF (v_res ->> 'modo') IS DISTINCT FROM 'cancelada' OR (v_res ->> 'corte') IS DISTINCT FROM to_char(m0, 'YYYY-MM')
     OR (v_res ->> 'qtde') IS DISTINCT FROM '4' OR (v_res ->> 'regra_cancelada') IS DISTINCT FROM 'true'
     OR (SELECT ativo FROM financeiro_recorrencias WHERE id = v_b) IS DISTINCT FROM false
     OR (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE recorrencia_id = v_b AND cancelado IS NOT TRUE AND data_competencia < m0) IS DISTINCT FROM 2::bigint
     OR (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE recorrencia_id = v_b AND cancelado AND cancelado_motivo LIKE 'recorrência encerrada em %') IS DISTINCT FROM 4::bigint
     THEN RAISE EXCEPTION 'T4: %', v_res; END IF;
  v_ok := v_ok || 'T4 ok (cancelar a regra: ativo=false, os 4 de m0 em diante, os 2 de antes vivos); ';

  -- T5 ─ tenant
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM fn_recorrencia_fora_da_vigencia(v_a, false, NULL, true);
    RAISE EXCEPTION 'T5: usuário de fora passou';
  EXCEPTION WHEN SQLSTATE '42501' THEN v_ok := v_ok || 'T5 ok (42501 para quem é de fora); ';
  END;

  RAISE EXCEPTION 'OK P154 — %', v_ok;
END $teste$;
