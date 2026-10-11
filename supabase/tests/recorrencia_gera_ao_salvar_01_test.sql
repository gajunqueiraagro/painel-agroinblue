-- RECORRENCIA-GERA-A-VIGENCIA-INTEIRA-01, parte 2 — salvar a edicao da vigencia gera, POR ULTIMO, os meses que ela passou a cobrir.
-- O que a TELA faz ao salvar e' gravar a regra -> propagar (se houver) -> fn_recorrencia_gerar. Aqui se prova, no banco, que
-- essa ordem fecha a serie sem dobro, e que a ordem contraria NAO fecha.
--
-- Roda como `postgres`, numa transacao que TERMINA EM RAISE: nada fica no banco. Sucesso = a excecao final comeca com "OK".
-- Cenario sintetico no cliente Teste (43f32d07); datas RELATIVAS ao mes corrente (m0). Comparacoes com `is distinct from`.
--
-- S1  inicio 2 meses para tras: o gerar cria EXATAMENTE os 2; a regra NAO editada (com uma vaga propria) fica intocada.
-- S2  fim 2 meses para a frente: o gerar cria os 2 novos, e a marca acompanha.
-- S3  mes fechado na vigencia nova: nao gera e e' dito em nao_gerados; o outro mes nasce.
-- S4  A ORDEM. A edicao leva o inicio 2 meses para tras, o fim 1 mes para a frente E troca o mes do fato (o vencimento passa
--     a cair no mes da competencia): o propagar MOVE a competencia dos 3 que existem. propagar -> gerar: 6 competencias, uma
--     viva por mes, nenhum dobro, nada bate em uniq_lanc_recorrencia_competencia. gerar -> propagar (a ordem errada, em
--     bloco desfeito): a serie NAO fecha (o propagar recusa ou sobra mes sem lancamento) — a prova de que o teste ve^ a ordem.
DO $teste$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_conta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  m0 date := date_trunc('month', current_date)::date;
  v_a uuid; v_o uuid; v_d uuid; v_res jsonb; v_n int; v_m text; v_md5 text; v_errado text; v_ok text := '';
BEGIN
  SET LOCAL lock_timeout = '2s'; SET LOCAL statement_timeout = '10s';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);

  -- a regra que sera' editada (A) e a que NAO sera' (O, com uma vaga: o mes corrente cancelado nao; um mes sem lancamento)
  INSERT INTO financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base, dia_vencimento, data_inicio, primeiro_vencimento, data_fim)
  VALUES (c_cli, c_faz, 'ENSAIO salvar A', c_conta, 'Dividendos Despesas Familiares', -100, 10, m0, (m0 + interval '1 month')::date + 9, (m0 + interval '3 months' - interval '1 day')::date)
  RETURNING id INTO v_a;
  INSERT INTO financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base, dia_vencimento, data_inicio, primeiro_vencimento, data_fim)
  VALUES (c_cli, c_faz, 'ENSAIO salvar O', c_conta, 'Dividendos Despesas Familiares', -55, 10, m0, (m0 + interval '1 month')::date + 9, (m0 + interval '3 months' - interval '1 day')::date)
  RETURNING id INTO v_o;
  PERFORM fn_recorrencia_gerar(v_a, NULL, false); PERFORM fn_recorrencia_gerar(v_o, NULL, false);
  UPDATE financeiro_recorrencias SET data_inicio = (m0 - interval '1 month')::date, primeiro_vencimento = m0 + 9 WHERE id = v_o;  -- O tem vaga, ninguem a editou pela tela
  SELECT md5(string_agg(md5(l::text), '' ORDER BY l.id)) INTO v_md5 FROM financeiro_lancamentos_v2 l WHERE l.recorrencia_id = v_o;

  -- S1 ─ inicio 2 meses para tras
  UPDATE financeiro_recorrencias SET data_inicio = (m0 - interval '2 months')::date, primeiro_vencimento = (m0 - interval '1 month')::date + 9 WHERE id = v_a;
  v_res := fn_recorrencia_gerar(v_a, NULL, false);
  IF (v_res ->> 'gerados') IS DISTINCT FROM '2' OR (v_res ->> 'gerado_de') IS DISTINCT FROM to_char(m0 - interval '2 months', 'YYYY-MM')
     OR (v_res ->> 'gerado_ate') IS DISTINCT FROM to_char(m0 - interval '1 month', 'YYYY-MM') THEN RAISE EXCEPTION 'S1: %', v_res; END IF;
  IF (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE recorrencia_id = v_a AND cancelado IS NOT TRUE) IS DISTINCT FROM 5::bigint THEN RAISE EXCEPTION 'S1: total'; END IF;
  IF (SELECT md5(string_agg(md5(l::text), '' ORDER BY l.id)) FROM financeiro_lancamentos_v2 l WHERE l.recorrencia_id = v_o) IS DISTINCT FROM v_md5
     OR (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE recorrencia_id = v_o) IS DISTINCT FROM 3::bigint THEN RAISE EXCEPTION 'S1: a regra nao editada mudou'; END IF;
  v_ok := v_ok || 'S1 ok (inicio -2: exatamente 2; a regra nao editada, com vaga, intocada); ';

  -- S2 ─ fim 2 meses para a frente
  UPDATE financeiro_recorrencias SET data_fim = (m0 + interval '5 months' - interval '1 day')::date WHERE id = v_a;
  v_res := fn_recorrencia_gerar(v_a, NULL, false);
  IF (v_res ->> 'gerados') IS DISTINCT FROM '2' OR (v_res ->> 'gerado_de') IS DISTINCT FROM to_char(m0 + interval '3 months', 'YYYY-MM')
     OR (v_res ->> 'gerado_ate') IS DISTINCT FROM to_char(m0 + interval '4 months', 'YYYY-MM') THEN RAISE EXCEPTION 'S2: %', v_res; END IF;
  IF (SELECT ultimo_lancamento_gerado FROM financeiro_recorrencias WHERE id = v_a) IS DISTINCT FROM (m0 + interval '4 months')::date THEN RAISE EXCEPTION 'S2: marca'; END IF;
  v_ok := v_ok || 'S2 ok (fim +2: os 2 novos, a marca acompanha); ';

  -- S3 ─ mes fechado na vigencia nova
  INSERT INTO financeiro_fechamentos (cliente_id, ano_mes, status_fechamento) VALUES (c_cli, to_char(m0 - interval '4 months', 'YYYY-MM'), 'fechado');
  UPDATE financeiro_recorrencias SET data_inicio = (m0 - interval '4 months')::date, primeiro_vencimento = (m0 - interval '3 months')::date + 9 WHERE id = v_a;
  v_res := fn_recorrencia_gerar(v_a, NULL, false);
  IF (v_res ->> 'gerados') IS DISTINCT FROM '1' OR jsonb_array_length(v_res -> 'nao_gerados') IS DISTINCT FROM 1
     OR (v_res -> 'nao_gerados' -> 0 ->> 'competencia') IS DISTINCT FROM to_char(m0 - interval '4 months', 'YYYY-MM')
     OR (v_res -> 'nao_gerados' -> 0 ->> 'motivo') IS DISTINCT FROM 'mês fechado' THEN RAISE EXCEPTION 'S3: %', v_res; END IF;
  UPDATE financeiro_fechamentos SET status_fechamento = 'aberto' WHERE cliente_id = c_cli AND ano_mes = to_char(m0 - interval '4 months', 'YYYY-MM');
  v_ok := v_ok || 'S3 ok (mes fechado: dito e nao gerado; o outro nasce); ';

  -- S4 ─ a ordem: propagar que MOVE competencia, depois o gerar
  INSERT INTO financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base, dia_vencimento, data_inicio, primeiro_vencimento, data_fim)
  VALUES (c_cli, c_faz, 'ENSAIO salvar D', c_conta, 'Dividendos Despesas Familiares', -80, 10, m0, (m0 + interval '1 month')::date + 9, (m0 + interval '3 months' - interval '1 day')::date)
  RETURNING id INTO v_d;
  PERFORM fn_recorrencia_gerar(v_d, NULL, false);
  UPDATE financeiro_recorrencias SET data_inicio = (m0 - interval '2 months')::date, primeiro_vencimento = (m0 - interval '2 months')::date + 9,
         data_fim = (m0 + interval '4 months' - interval '1 day')::date WHERE id = v_d;
  -- (a) a ordem ERRADA, desfeita: gerar antes do propagar
  BEGIN
    PERFORM fn_recorrencia_gerar(v_d, NULL, false);
    BEGIN v_res := fn_recorrencia_propagar(v_d, 'futuros', false); v_m := 'propagou'; EXCEPTION WHEN others THEN v_m := 'recusou: ' || SQLERRM; END;
    SELECT count(*) INTO v_n FROM generate_series(m0 - interval '2 months', m0 + interval '3 months', interval '1 month') gs
     WHERE (SELECT count(*) FROM financeiro_lancamentos_v2 l WHERE l.recorrencia_id = v_d AND l.cancelado IS NOT TRUE
               AND date_trunc('month', l.data_competencia) = gs AND l.data_vencimento = gs::date + 9) = 1;
    RAISE EXCEPTION USING MESSAGE = v_n || ' de 6 meses certos · ' || v_m, ERRCODE = 'ENS02';
  EXCEPTION WHEN SQLSTATE 'ENS02' THEN v_errado := SQLERRM; END;
  IF v_errado LIKE '6 de 6%' THEN RAISE EXCEPTION 'S4: a ordem errada tambem fecha a serie — o teste nao ve a ordem (%).', v_errado; END IF;
  -- (b) a ordem CERTA
  v_res := fn_recorrencia_propagar(v_d, 'futuros', false);
  IF (v_res -> 'competencia' ->> 'aplicadas') IS DISTINCT FROM '3' THEN RAISE EXCEPTION 'S4: o propagar nao moveu as 3 competencias: %', v_res -> 'competencia'; END IF;
  v_res := fn_recorrencia_gerar(v_d, NULL, false);
  IF (v_res ->> 'gerados') IS DISTINCT FROM '3' THEN RAISE EXCEPTION 'S4: gerados % (esperado 3)', v_res; END IF;
  SELECT count(*) INTO v_n FROM generate_series(m0 - interval '2 months', m0 + interval '3 months', interval '1 month') gs
   WHERE (SELECT count(*) FROM financeiro_lancamentos_v2 l WHERE l.recorrencia_id = v_d AND l.cancelado IS NOT TRUE
             AND date_trunc('month', l.data_competencia) = gs AND l.data_vencimento = gs::date + 9) = 1;
  IF v_n IS DISTINCT FROM 6 OR (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE recorrencia_id = v_d) IS DISTINCT FROM 6::bigint THEN
    RAISE EXCEPTION 'S4: % de 6 meses com exatamente um lancamento', v_n;
  END IF;
  IF (fn_recorrencia_gerar(v_d, NULL, false) ->> 'gerados') IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'S4: a segunda chamada gerou'; END IF;
  v_ok := v_ok || 'S4 ok (propagar move 3 competencias, depois o gerar cria 3: 6 meses, um lancamento em cada, sem dobro; ordem errada: ' || v_errado || '); ';

  RAISE EXCEPTION 'OK — %', v_ok;
END
$teste$;
