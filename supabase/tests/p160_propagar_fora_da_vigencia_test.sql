-- P160 — a projeção do Propagar diz quais competências recalculadas cairiam FORA da vigência (o caso do Santa Rita, sintético).
-- Roda como `postgres`, numa transação que TERMINA EM RAISE: nada fica no banco. Sucesso = a exceção final começa com "OK".
-- Cliente Teste (43f32d07); m0 = o mês que vem (todos os gerados são futuros).
-- T1  a regra paga "dia 02 do mês seguinte" (desloc 1), 4 meses; trocar para "dia 29 do próprio mês" (desloc 0) move cada competência
--     +1 mês: a do último vencimento cai em m0+4, depois do fim (m0+3) → `fora_da_vigencia` com exatamente 1, nos dois escopos.
-- T2  sem trocar o deslocamento (só a descrição), nada fora.
DO $teste$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_conta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  m0 date := (date_trunc('month', current_date) + interval '1 month')::date;
  v_a uuid; v_res jsonb; v_ok text := '';
BEGIN
  SET LOCAL lock_timeout = '2s'; SET LOCAL statement_timeout = '20s';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);
  INSERT INTO financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base, dia_vencimento, data_inicio, primeiro_vencimento, data_fim)
  VALUES (c_cli, c_faz, 'ENSAIO P160', c_conta, 'Dividendos Despesas Familiares', -100, 2, m0, (m0 + interval '1 month')::date + 1,
          (m0 + interval '4 months' - interval '1 day')::date)
  RETURNING id INTO v_a;
  PERFORM fn_recorrencia_gerar(v_a, NULL, false);
  IF (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE recorrencia_id = v_a AND cancelado IS NOT TRUE) <> 4 THEN RAISE EXCEPTION 'fixture: não gerou 4'; END IF;

  -- T2 ─ sem trocar o deslocamento
  UPDATE financeiro_recorrencias SET descricao = 'ENSAIO P160 outra' WHERE id = v_a;
  v_res := fn_recorrencia_propagar(v_a, 'futuros', true);
  IF jsonb_array_length(v_res -> 'competencia' -> 'projecao' -> 'futuros' -> 'fora_da_vigencia') IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'T2: %', v_res -> 'competencia' -> 'projecao'; END IF;
  v_ok := v_ok || 'T2 ok (sem trocar o deslocamento, nada fora); ';

  -- T1 ─ o "dia 29 do próprio mês"
  UPDATE financeiro_recorrencias SET dia_vencimento = 29, primeiro_vencimento = m0 + 28 WHERE id = v_a;
  v_res := fn_recorrencia_propagar(v_a, 'futuros', true);
  IF jsonb_array_length(v_res -> 'competencia' -> 'projecao' -> 'futuros' -> 'fora_da_vigencia') IS DISTINCT FROM 1
     OR jsonb_array_length(v_res -> 'competencia' -> 'projecao' -> 'todos' -> 'fora_da_vigencia') IS DISTINCT FROM 1
     OR (v_res -> 'competencia' -> 'projecao' -> 'futuros' -> 'fora_da_vigencia' -> 0 ->> 'comp_nova') IS DISTINCT FROM to_char(m0 + interval '4 months', 'YYYY-MM-DD') THEN
    RAISE EXCEPTION 'T1: %', v_res -> 'competencia' -> 'projecao'; END IF;
  v_ok := v_ok || 'T1 ok (desloc 1 → 0: 1 competência fora, m0+4, nos dois escopos); ';

  RAISE EXCEPTION 'OK P160 — %', v_ok;
END $teste$;
