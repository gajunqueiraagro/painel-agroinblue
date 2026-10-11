-- REC-FALTA-GERAR-A-VISTA-01 — fn_recorrencias_a_gerar: o que cada recorrencia ainda tem para gerar (o Gerar perguntado sem gravar).
-- Roda como `postgres`, DEPOIS da migration 20261027196000, numa transacao que TERMINA EM RAISE: nada fica no banco.
-- Sucesso = a excecao final comeca com "OK". Cenario sintetico no cliente Teste; datas RELATIVAS ao mes corrente (m0).
-- Comparacoes com `is distinct from` (nunca `<>`). SEM `DELETE` (o canal recusa carga com ele).
--
-- A1  regra gerada do mes corrente em diante, com a vigencia levada 3 meses para tras: a_gerar 3, passados 3, primeira/ultima certas
-- A2  depois de fn_recorrencia_gerar: a regra SOME da lista
-- A3  competencia CANCELADA abaixo da marca = ocupada: nao conta
-- A4  mes fechado: fechados 1, a_gerar os outros
-- A5  regra inativa (cancelada / pausada: e' o mesmo `ativo = false`): fora
-- A6  tenant: outro cliente e sem usuario -> 42501; anon nao executa
-- A7  IGUALDADE COM O GERAR: para toda regra ativa do Teste, a_gerar = `gerados` e fechados = tamanho de `nao_gerados` da
--     simulacao de fn_recorrencia_gerar — e a regra que a leitura NAO devolve tem os dois em zero. Diz quantas comparou.
-- ⚠ Os dois tempos-limite sao comandos DE TOPO da transacao, ANTES do bloco: dentro do `DO` nao valem para ele.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_conta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  m0 date := date_trunc('month', current_date)::date;
  v_a uuid; v_n uuid; v_i uuid; l record; r record; v_sim jsonb; v_cmp int := 0; v_fora int := 0; v_ok text := ''; v_err text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);

  -- A1 ─ gerada de m0 a m0+2; a vigencia vai 3 meses para tras
  INSERT INTO financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base,
                                       dia_vencimento, data_inicio, primeiro_vencimento, data_fim)
  VALUES (c_cli, c_faz, 'ENSAIO falta gerar A', c_conta, 'Dividendos Despesas Familiares', -100, 10,
          m0, m0 + 9, (m0 + interval '3 months' - interval '1 day')::date)
  RETURNING id INTO v_a;
  PERFORM fn_recorrencia_gerar(v_a, NULL, false);
  IF EXISTS (SELECT 1 FROM fn_recorrencias_a_gerar(c_cli, current_date) x WHERE x.recorrencia_id = v_a) THEN
    RAISE EXCEPTION 'A1: regra completa apareceu na lista';
  END IF;
  UPDATE financeiro_recorrencias SET data_inicio = (m0 - interval '3 months')::date, primeiro_vencimento = (m0 - interval '3 months')::date + 9 WHERE id = v_a;
  SELECT * INTO l FROM fn_recorrencias_a_gerar(c_cli, current_date) x WHERE x.recorrencia_id = v_a;
  IF l.a_gerar IS DISTINCT FROM 3 OR l.fechados IS DISTINCT FROM 0 OR l.passados IS DISTINCT FROM 3
     OR l.primeira IS DISTINCT FROM to_char(m0 - interval '3 months', 'YYYY-MM')
     OR l.ultima IS DISTINCT FROM to_char(m0 - interval '1 month', 'YYYY-MM') THEN
    RAISE EXCEPTION 'A1: %', to_jsonb(l);
  END IF;
  -- p_hoje decide o que e' "passado": vista de 2 meses atras, so' 1 das 3 e' passada
  SELECT * INTO l FROM fn_recorrencias_a_gerar(c_cli, (m0 - interval '2 months')::date) x WHERE x.recorrencia_id = v_a;
  IF l.a_gerar IS DISTINCT FROM 3 OR l.passados IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'A1 p_hoje: %', to_jsonb(l); END IF;
  v_ok := v_ok || 'A1 ok (3 a gerar, 3 passados, primeira e ultima certas; p_hoje decide o passado); ';

  -- A4 ─ mes fechado no meio das tres
  INSERT INTO financeiro_fechamentos (cliente_id, ano_mes, status_fechamento) VALUES (c_cli, to_char(m0 - interval '2 months', 'YYYY-MM'), 'fechado');
  SELECT * INTO l FROM fn_recorrencias_a_gerar(c_cli, current_date) x WHERE x.recorrencia_id = v_a;
  IF l.a_gerar IS DISTINCT FROM 2 OR l.fechados IS DISTINCT FROM 1 OR l.passados IS DISTINCT FROM 2
     OR l.primeira IS DISTINCT FROM to_char(m0 - interval '3 months', 'YYYY-MM')
     OR l.ultima IS DISTINCT FROM to_char(m0 - interval '1 month', 'YYYY-MM') THEN
    RAISE EXCEPTION 'A4: %', to_jsonb(l);
  END IF;
  v_ok := v_ok || 'A4 ok (mes fechado: fechados 1, a_gerar 2); ';

  -- regra NUNCA gerada (so' o ramo do avanco) e regra INATIVA com mes faltando
  INSERT INTO financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base,
                                       dia_vencimento, data_inicio, primeiro_vencimento, data_fim)
  VALUES (c_cli, c_faz, 'ENSAIO falta gerar N', c_conta, 'Dividendos Despesas Familiares', -50, 5,
          (m0 - interval '1 month')::date, (m0 - interval '1 month')::date + 4, (m0 + interval '2 months' - interval '1 day')::date)
  RETURNING id INTO v_n;
  SELECT * INTO l FROM fn_recorrencias_a_gerar(c_cli, current_date) x WHERE x.recorrencia_id = v_n;
  IF l.a_gerar IS DISTINCT FROM 3 OR l.passados IS DISTINCT FROM 1 OR l.fechados IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'nunca gerada: %', to_jsonb(l); END IF;
  -- A5
  INSERT INTO financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base,
                                       dia_vencimento, data_inicio, primeiro_vencimento, data_fim, ativo)
  VALUES (c_cli, c_faz, 'ENSAIO falta gerar I', c_conta, 'Dividendos Despesas Familiares', -30, 5,
          (m0 - interval '2 months')::date, (m0 - interval '2 months')::date + 4, (m0 + interval '2 months' - interval '1 day')::date, false)
  RETURNING id INTO v_i;
  IF EXISTS (SELECT 1 FROM fn_recorrencias_a_gerar(c_cli, current_date) x WHERE x.recorrencia_id = v_i) THEN
    RAISE EXCEPTION 'A5: regra inativa apareceu na lista';
  END IF;
  v_ok := v_ok || 'A5 ok (inativa fora; nunca gerada conta a vigencia inteira pelo avanco); ';

  -- A7 ─ igualdade com a simulacao do Gerar, regra a regra (com o mes fechado no cenario)
  FOR r IN SELECT rr.id FROM financeiro_recorrencias rr WHERE rr.cliente_id = c_cli AND rr.ativo LOOP
    v_sim := fn_recorrencia_gerar(r.id, NULL, true);
    SELECT * INTO l FROM fn_recorrencias_a_gerar(c_cli, current_date) x WHERE x.recorrencia_id = r.id;
    IF coalesce(l.a_gerar, 0) IS DISTINCT FROM (v_sim ->> 'gerados')::int
       OR coalesce(l.fechados, 0) IS DISTINCT FROM jsonb_array_length(v_sim -> 'nao_gerados')
       OR l.primeira IS DISTINCT FROM (v_sim ->> 'gerado_de') OR l.ultima IS DISTINCT FROM (v_sim ->> 'gerado_ate') THEN
      RAISE EXCEPTION 'A7: regra % — leitura % x gerar %', r.id, to_jsonb(l), v_sim;
    END IF;
    v_cmp := v_cmp + 1; IF l.recorrencia_id IS NULL THEN v_fora := v_fora + 1; END IF;
  END LOOP;
  IF v_cmp < 2 OR v_cmp - v_fora < 2 THEN RAISE EXCEPTION 'A7: conjunto pequeno demais (% regras, % na lista)', v_cmp, v_cmp - v_fora; END IF;
  v_ok := v_ok || format('A7 ok (%s regras ativas comparadas com a simulacao do Gerar, %s na lista e %s fora com zero); ', v_cmp, v_cmp - v_fora, v_fora);

  -- A3 ─ reabre o mes, gera tudo, cancela uma competencia passada: cancelada abaixo da marca = ocupada
  UPDATE financeiro_fechamentos SET status_fechamento = 'aberto' WHERE cliente_id = c_cli AND ano_mes = to_char(m0 - interval '2 months', 'YYYY-MM');
  PERFORM fn_recorrencia_gerar(v_a, NULL, false);
  -- A2
  IF EXISTS (SELECT 1 FROM fn_recorrencias_a_gerar(c_cli, current_date) x WHERE x.recorrencia_id = v_a) THEN
    RAISE EXCEPTION 'A2: depois do gerar a regra continua na lista';
  END IF;
  v_ok := v_ok || 'A2 ok (depois do gerar some da lista); ';
  UPDATE financeiro_lancamentos_v2 SET cancelado = true WHERE recorrencia_id = v_a AND data_competencia = (m0 - interval '1 month')::date;
  IF NOT EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 WHERE recorrencia_id = v_a AND data_competencia = (m0 - interval '1 month')::date AND cancelado) THEN
    RAISE EXCEPTION 'A3: o cenario nao montou (nada cancelado)';
  END IF;
  IF EXISTS (SELECT 1 FROM fn_recorrencias_a_gerar(c_cli, current_date) x WHERE x.recorrencia_id = v_a) THEN
    RAISE EXCEPTION 'A3: competencia cancelada abaixo da marca contou como a gerar';
  END IF;
  v_ok := v_ok || 'A3 ok (cancelada abaixo da marca = ocupada); ';

  -- A6 ─ tenant
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    PERFORM count(*) FROM fn_recorrencias_a_gerar(c_cli, current_date);
    RAISE EXCEPTION 'A6: sem usuario leu';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM count(*) FROM fn_recorrencias_a_gerar(c_cli, current_date);
    RAISE EXCEPTION 'A6: usuario de fora leu';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM count(*) FROM fn_recorrencias_a_gerar(NULL, current_date);
    RAISE EXCEPTION 'A6: cliente nulo leu';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF has_function_privilege('anon', 'public.fn_recorrencias_a_gerar(uuid, date)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_recorrencias_a_gerar(uuid, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'A6: ACL';
  END IF;
  v_ok := v_ok || 'A6 ok (sem usuario, usuario de fora e cliente nulo: 42501; anon nao executa)';

  RAISE EXCEPTION 'OK — %', v_ok;
END
$teste$;
