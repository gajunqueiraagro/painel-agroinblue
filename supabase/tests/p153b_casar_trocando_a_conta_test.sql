-- P153b (D3) — "Casar e trocar a conta para <conta do extrato>" pela `fn_espelho_casar` (item `trocar_conta`), migration 20261028115110.
-- Roda como `postgres`, numa transacao que TERMINA EM RAISE: nada fica no banco. Sucesso = a excecao final comeca com "OK".
-- Fixture SINTETICO no cliente Teste (43f32d07): a conta A (a do Teste) e uma conta B criada aqui; o extrato e' da A.
--
-- X1  SIMULAR com `trocar_conta`: ok, `trocas_conta` diz de B para A; nada gravado (o lancamento byte a byte igual).
-- X2  GRAVAR: a saida em aberto de B passa para A, realizado na data do extrato, casada (1 vinculo vivo); o audit_log do lancamento
--     tem a troca (B -> A) com o usuario logado como autor.
-- X3  O CASAR FALHA DEPOIS DA TROCA (o gravador do vinculo sumido no ensaio): nada fica — a conta continua B, nenhum vinculo.
-- X4  PAGO de outra conta com `trocar_conta`: recusa `trocar_conta_so_em_aberto`; nada gravado.
-- X5  SEM `trocar_conta`: como hoje — o gravador do vinculo RECUSA a outra conta ("… é da conta B e o movimento do banco é da conta
--     A …"); nada gravado, a conta continua a B.
-- X6  ENTRADA em aberto de B: a troca vai para `conta_destino_id` (A).
CREATE FUNCTION pg_temp.conta_b() RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v uuid := gen_random_uuid();
BEGIN
  INSERT INTO financeiro_contas_bancarias SELECT (jsonb_populate_record(NULL::financeiro_contas_bancarias, to_jsonb(c) || jsonb_build_object(
      'id', v, 'nome_conta', 'ENSAIO conta B', 'nome_exibicao', 'ENSAIO conta B'))).*
    FROM financeiro_contas_bancarias c WHERE c.id = '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  RETURN v;
END $f$;
CREATE FUNCTION pg_temp.extrato(p_valor numeric, p_data date) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v uuid := gen_random_uuid();
BEGIN
  INSERT INTO extrato_bancario_v2 (id, cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao)
  VALUES (v, '43f32d07-dba8-4670-900c-bf645440c04a', '131b8501-caf7-4964-b1b1-3f552ad2b75d', p_data, p_valor,
          CASE WHEN p_valor < 0 THEN 'debito' ELSE 'credito' END, 'SINT-P153B-' || v, 'SINT P153B');
  RETURN v;
END $f$;
CREATE FUNCTION pg_temp.lanc(p_conta uuid, p_valor numeric, p_status text, p_entrada boolean) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v uuid; v_pc record;
BEGIN
  SELECT id, subcentro FROM financeiro_plano_contas
   WHERE (cliente_id IS NULL OR cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a') AND ativo IS NOT FALSE
     AND tipo_operacao = CASE WHEN p_entrada THEN '1-Entradas' ELSE '2-Saídas' END
   ORDER BY id LIMIT 1 INTO v_pc;
  INSERT INTO financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, conta_destino_id, data_competencia, data_vencimento,
      data_pagamento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, origem_lancamento, ano_mes, cenario)
  VALUES ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f',
      CASE WHEN p_entrada THEN NULL ELSE p_conta END, CASE WHEN p_entrada THEN p_conta END, '2026-10-09', '2026-10-09',
      CASE WHEN p_status = 'realizado' THEN DATE '2026-10-09' END, p_valor, CASE WHEN p_entrada THEN '1' ELSE '-1' END,
      CASE WHEN p_entrada THEN '1-Entradas' ELSE '2-Saídas' END, p_status, 'ENSAIO P153b ' || p_status, v_pc.id, v_pc.subcentro,
      'manual', '2026-10', 'realizado')
  RETURNING id INTO v;
  RETURN v;
END $f$;
CREATE FUNCTION pg_temp.foto(p_id uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT (to_jsonb(f) - 'updated_at' - 'updated_by')::text
         || (SELECT count(*)::text FROM conciliacao_bancaria_itens i WHERE i.lancamento_id = f.id AND i.desfeito_em IS NULL)
    FROM financeiro_lancamentos_v2 f WHERE f.id = p_id;
$f$;

DO $teste$
DECLARE
  c_a constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  v_b uuid; e1 uuid; l1 uuid; v_r jsonb; v_s jsonb; v_f text; v_ok text := ''; r record;
BEGIN
  SET LOCAL lock_timeout = '2s'; SET LOCAL statement_timeout = '30s';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  v_b := pg_temp.conta_b();

  -- X1 / X2
  e1 := pg_temp.extrato(-500, '2026-10-07'); l1 := pg_temp.lanc(v_b, 500, 'previsto', false);
  v_f := pg_temp.foto(l1);
  v_s := fn_espelho_casar(e1, jsonb_build_array(jsonb_build_object('lancamento_id', l1, 'trocar_conta', true)), true);
  IF (v_s ->> 'ok') IS DISTINCT FROM 'true' OR jsonb_array_length(v_s -> 'trocas_conta') IS DISTINCT FROM 1
     OR (v_s -> 'trocas_conta' -> 0 ->> 'de_id') IS DISTINCT FROM v_b::text OR (v_s -> 'trocas_conta' -> 0 ->> 'para_id') IS DISTINCT FROM c_a::text
     OR (v_s -> 'trocas_conta' -> 0 ->> 'de') IS DISTINCT FROM 'ENSAIO conta B' THEN
    RAISE EXCEPTION 'X1: a simulacao nao diz a troca: %', v_s; END IF;
  IF pg_temp.foto(l1) IS DISTINCT FROM v_f THEN RAISE EXCEPTION 'X1: a simulacao gravou'; END IF;
  v_ok := v_ok || 'X1 ok (simular: de ENSAIO conta B para a do extrato; nada gravado); ';

  v_r := fn_espelho_casar(e1, jsonb_build_array(jsonb_build_object('lancamento_id', l1, 'trocar_conta', true)), false);
  SELECT * INTO r FROM financeiro_lancamentos_v2 WHERE id = l1;
  IF (v_r ->> 'ok') IS DISTINCT FROM 'true' OR r.conta_efetiva_id IS DISTINCT FROM c_a OR r.status_transacao IS DISTINCT FROM 'realizado'
     OR r.data_pagamento IS DISTINCT FROM '2026-10-07'
     OR (SELECT count(*) FROM conciliacao_bancaria_itens WHERE lancamento_id = l1 AND extrato_id = e1 AND desfeito_em IS NULL) <> 1 THEN
    RAISE EXCEPTION 'X2: casar trocando a conta: % / conta % status %', v_r, r.conta_efetiva_id, r.status_transacao; END IF;
  IF NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.registro_id = l1 AND a.usuario_id = c_admin
                  AND a.dados_anteriores ->> 'conta_bancaria_id' = v_b::text AND a.dados_novos ->> 'conta_bancaria_id' = c_a::text) THEN
    RAISE EXCEPTION 'X2: a troca nao ficou na trilha com o autor'; END IF;
  v_ok := v_ok || 'X2 ok (gravar: conta B -> A, realizado em 07/10, casado, trilha com o autor); ';

  -- X3: o casar falha depois da troca — nada fica
  e1 := pg_temp.extrato(-700, '2026-10-07'); l1 := pg_temp.lanc(v_b, 700, 'previsto', false);
  v_f := pg_temp.foto(l1);
  ALTER FUNCTION public.fn_vincular_extrato_lancamento(uuid, uuid, numeric, boolean) RENAME TO fn_vincular_extrato_lancamento_ensaio_sumida;
  BEGIN
    v_r := fn_espelho_casar(e1, jsonb_build_array(jsonb_build_object('lancamento_id', l1, 'trocar_conta', true)), false);
    RAISE EXCEPTION 'X3: o casar deveria ter falhado: %', v_r;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  ALTER FUNCTION public.fn_vincular_extrato_lancamento_ensaio_sumida(uuid, uuid, numeric, boolean) RENAME TO fn_vincular_extrato_lancamento;
  IF pg_temp.foto(l1) IS DISTINCT FROM v_f THEN RAISE EXCEPTION 'X3: o casar falhou e a conta ficou trocada'; END IF;
  v_ok := v_ok || 'X3 ok (o casar falhou depois da troca: conta continua B, sem vinculo); ';

  -- X4: pago de outra conta
  e1 := pg_temp.extrato(-300, '2026-10-07'); l1 := pg_temp.lanc(v_b, 300, 'realizado', false);
  v_f := pg_temp.foto(l1);
  v_r := fn_espelho_casar(e1, jsonb_build_array(jsonb_build_object('lancamento_id', l1, 'trocar_conta', true)), false);
  v_s := fn_espelho_casar(e1, jsonb_build_array(jsonb_build_object('lancamento_id', l1, 'trocar_conta', true)), true);
  IF (v_r ->> 'motivo') IS DISTINCT FROM 'trocar_conta_so_em_aberto' OR (v_s ->> 'motivo') IS DISTINCT FROM 'trocar_conta_so_em_aberto'
     OR pg_temp.foto(l1) IS DISTINCT FROM v_f THEN
    RAISE EXCEPTION 'X4: pago de outra conta trocou (ou nao recusou): % / %', v_s, v_r; END IF;
  v_ok := v_ok || 'X4 ok (pago de outra conta: recusa, nada gravado); ';

  -- X5: sem trocar_conta, como hoje: a outra conta e' recusada pelo gravador do vinculo
  e1 := pg_temp.extrato(-400, '2026-10-07'); l1 := pg_temp.lanc(v_b, 400, 'previsto', false);
  v_f := pg_temp.foto(l1);
  BEGIN
    v_r := fn_espelho_casar(e1, jsonb_build_array(jsonb_build_object('lancamento_id', l1)), false);
    RAISE EXCEPTION 'X5: sem trocar_conta a outra conta casou: %', v_r;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%é da conta ENSAIO conta B e o movimento do banco é da conta%' THEN RAISE; END IF;
  END;
  IF pg_temp.foto(l1) IS DISTINCT FROM v_f THEN RAISE EXCEPTION 'X5: a recusa gravou'; END IF;
  v_ok := v_ok || 'X5 ok (sem a opcao: a outra conta e'' recusada como hoje; nada gravado); ';

  -- X6: entrada em aberto
  e1 := pg_temp.extrato(250, '2026-10-07'); l1 := pg_temp.lanc(v_b, 250, 'agendado', true);
  v_r := fn_espelho_casar(e1, jsonb_build_array(jsonb_build_object('lancamento_id', l1, 'trocar_conta', true)), false);
  SELECT * INTO r FROM financeiro_lancamentos_v2 WHERE id = l1;
  IF (v_r ->> 'ok') IS DISTINCT FROM 'true' OR r.conta_destino_id IS DISTINCT FROM c_a OR r.conta_bancaria_id IS NOT NULL THEN
    RAISE EXCEPTION 'X6: entrada: % / destino % banco %', v_r, r.conta_destino_id, r.conta_bancaria_id; END IF;
  v_ok := v_ok || 'X6 ok (entrada: conta_destino_id -> A)';

  RAISE EXCEPTION 'OK %', v_ok;
END $teste$;
