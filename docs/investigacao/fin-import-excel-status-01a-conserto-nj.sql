CREATE OR REPLACE FUNCTION pg_temp._ensaio_medir(c_cli uuid, v_alvo uuid[]) RETURNS jsonb LANGUAGE sql AS $m$
  SELECT jsonb_build_object(
   '1_alvo', (SELECT jsonb_build_object('linhas', count(*), 'vivas', count(*) FILTER (WHERE NOT cancelado), 'soma_vivas', sum(valor) FILTER (WHERE NOT cancelado),
                'por_status', (SELECT jsonb_object_agg(s, n) FROM (SELECT CASE WHEN cancelado THEN 'cancelado' ELSE status_transacao END s, count(*) n FROM financeiro_lancamentos_v2 WHERE id = ANY (v_alvo) GROUP BY 1) z))
              FROM financeiro_lancamentos_v2 WHERE id = ANY (v_alvo)),
   '2_realizado_sem_pgto_nj', (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE cliente_id = c_cli AND cancelado = false AND status_transacao = 'realizado' AND data_pagamento IS NULL),
   '3_cpr_out26', (SELECT jsonb_build_object('linhas', count(*), 'soma', sum(valor)) FROM financeiro_lancamentos_v2
                    WHERE cliente_id = c_cli AND cancelado = false AND cenario = 'realizado' AND tipo_operacao NOT LIKE '3-%'
                      AND status_transacao IN ('previsto', 'programado', 'agendado') AND data_vencimento BETWEEN '2026-10-01' AND '2026-10-31'),
   '4_saldos_saidas_por_ano_mes', (SELECT jsonb_object_agg(ano_mes, s ORDER BY ano_mes) FROM (
                    SELECT ano_mes, jsonb_build_object('n', count(*), 'saidas', sum(valor)) s FROM financeiro_lancamentos_v2
                     WHERE cliente_id = c_cli AND cancelado = false AND status_transacao = 'realizado' AND tipo_operacao LIKE '2-%'
                       AND ano_mes BETWEEN '2026-01' AND '2026-10' GROUP BY 1) z),
   '5_resumo_conc_out26', (SELECT jsonb_object_agg(conta_nome || CASE nivel WHEN 'conta' THEN '' ELSE ' [' || nivel || ']' END,
                    jsonb_build_object('saidas', saidas, 'entradas', entradas, 'sistema', saldo_sistema, 'extrato', saldo_extrato, 'dif', diferenca, 'status', status))
                    FROM fn_conciliacao_resumo_mes(c_cli, '2026-10')),
   '6_dre_alvo_por_competencia', (SELECT jsonb_object_agg(m, s ORDER BY m) FROM (
                    SELECT to_char(l.data_competencia, 'YYYY-MM') m, jsonb_build_object('n', count(*), 'valor', sum(l.valor),
                           'a_pagar', sum(l.valor) FILTER (WHERE l.status_transacao <> 'realizado')) s
                      FROM financeiro_lancamentos_v2 l LEFT JOIN financeiro_plano_contas p ON p.id = l.plano_conta_id
                     WHERE l.id = ANY (v_alvo) AND l.cancelado = false AND COALESCE(l.compoe_dre, p.compoe_dre, true) GROUP BY 1) z),
   '6b_dre_alvo_total', (SELECT jsonb_build_object('n', count(*), 'valor', sum(l.valor)) FROM financeiro_lancamentos_v2 l LEFT JOIN financeiro_plano_contas p ON p.id = l.plano_conta_id
                     WHERE l.id = ANY (v_alvo) AND l.cancelado = false AND COALESCE(l.compoe_dre, p.compoe_dre, true))
  )
$m$;
-- FIN-IMPORT-EXCEL-STATUS-01a — conserto do NJ, opcao (b): corrigir no lugar.
-- EXECUCAO REAL — NAO EXECUTAR sem o OK do Gabriel. Identico ao ensaio de 05/10/2026, trocando o RAISE final por NOTICE (o DO comita ao terminar).
--
-- O QUE FAZ, numa transacao so' (um bloco DO: qualquer guarda que falhe desfaz tudo):
--   alvo = as 229 linhas de origem 'excel' criadas em 05/10/2026 11:50–12:10 UTC pelo usuario 7bd0b6ad no NJ;
--   (1) as 40 GEMEAS da planilha (mesmo fornecedor, valor, tipo e vencimento ±5 dias de um lancamento vivo anterior,
--       de recorrencia ou contrato) sao CANCELADAS pelo dono no banco, `fn_cancelar_lancamento_auditoria`, com o motivo;
--       a linha antiga (41 ids) NAO e' tocada;
--   (2) as outras 189 passam a status 'programado' com data_pagamento NULA (a 060224c6, com pagamento futuro, inclusive).
-- NAO TOCA: nenhuma linha fora do alvo (md5 antes x depois), extrato, vinculo, recorrencia, contrato, outro cliente.
-- ⚠ O dono do cancelamento exige usuario (guarda de tenant): a transacao SIMULA a sessao do admin que fez a importacao
--   (request.jwt.claims), como fazem os testes SQL do repo. `cancelado_por` fica sendo ele.
DO $conserto$
DECLARE
  c_cli   constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_motivo constant text := 'Duplicado na importação Excel de 05/10/2026 — fica a recorrência/contrato';
  c_gemeas constant uuid[] := ARRAY[
    '01e0bd39-1d3f-49e4-a3f8-65f068582ff8',
    '107bccff-855e-4dda-b4ca-ad820a9e2bda',
    '191d228f-dc06-4b64-ac46-39a76b883748',
    '20c23694-2659-4f18-88f8-6f31c7ef1892',
    '22f97387-920e-4f0d-a8e1-543c9d52605b',
    '3c4e2228-b3a6-44ad-84ae-66b0b5f2144b',
    '47ba1512-489a-4808-9e88-243ad5f71d69',
    '4faccf76-2baf-4ed1-9a49-6a55822ff25d',
    '53e783a5-483f-401c-a443-9cd576ea5c1a',
    '5512e0ad-4b18-44f7-a6e2-d776784d2ee1',
    '5bc471b3-c912-4101-b6c4-aaef01441122',
    '5cc5cd72-3e73-4ed6-97a5-dcf7c043edd6',
    '6a4ad891-e6ab-4146-bafd-a987471fbe85',
    '6f90eff9-2606-454d-9dda-501f02782999',
    '70c59c6f-e983-4b50-b8ea-a1e51a18f6a2',
    '7dc34d4a-89de-4ed2-838a-f54ce194ade5',
    '7f513793-b177-4a1a-a54d-4f56a3f85eed',
    '802ec4b8-1319-48be-87fd-ec85d821c386',
    '8dc954a5-ceff-4b52-905f-348fc92783f9',
    '90f41322-b357-4db2-b697-cc381f094b94',
    '9b0ec9bf-dbee-49c6-8f37-3c3aa86cd272',
    '9dbe2285-1bc7-4724-825f-64f92d2c866e',
    'a4bd18e4-2642-40e8-9317-c95476a5448d',
    'aa73f04d-0202-4936-b072-5b0d77339865',
    'acdce486-c23a-4ede-9efd-9f4176957cc4',
    'b4d139c3-2f84-4847-8525-64ff5f91e204',
    'ba26251b-de54-4036-aee6-3437ea447d36',
    'ca8f9721-6227-486f-b374-d15a99bfd57f',
    'cb800516-bac0-4f6c-95ca-196c5ed8d1b7',
    'd1815bc2-f6bf-4be1-96ba-ad393a0980bc',
    'd18506db-1755-4675-ac4e-6b9582645f14',
    'd2ffbf94-1f1b-40e9-840d-3d34ed9f2547',
    'e22eea69-ef1e-42d8-9da0-d7354cd02a70',
    'f2b0abbb-f9be-4432-a850-d127fe730558',
    'f6660a57-5249-4626-ad07-cc087a27422d',
    'f6e4495f-67bd-4a08-b960-9aff31cb1cd6',
    'fa17f46d-118b-436f-8a12-5c56b3a899c4',
    'fa3a6d2a-92b1-4748-90a1-dc74f5c70c0e',
    'fb7bd881-2a6b-4115-a15d-2f19163468e5',
    'fbcdca8f-b13f-4fb3-bc85-9d2c99248afe'
  ]::uuid[];
  c_antigas constant uuid[] := ARRAY[
    '07dffbfd-a6e8-4574-8a22-007b8d691e29',
    '0f7289fa-6231-499d-9cb7-609d2e1b8889',
    '1567c3b6-1c7b-4b92-bc6d-6061594c0720',
    '318c81d8-c81a-4c7f-9f47-fc40d65f82d8',
    '32120487-4cde-438e-9aaa-5d7777f9be57',
    '3332a696-50de-49d4-bacd-f81799bb2545',
    '35cf13d6-5725-42ce-8802-dceb53d982e5',
    '3675bea0-d61f-4449-83cb-ab6cfe339f86',
    '36c81fad-0ae9-4a38-8e76-c4c8df6ce997',
    '3cc54182-b8e1-4504-b402-6949af9d8912',
    '3e1b8401-acda-4fa0-8eef-4c5b5004bed9',
    '42ab1755-c9ad-495b-a710-698fb23023c4',
    '45ac398d-f8f8-41c7-853a-897be452a485',
    '478eb8b9-0615-4a56-83fa-756aa214dd81',
    '507536a2-8889-4da4-bb95-4c5395f26f7f',
    '5197a818-2919-46b3-b245-6335ea39cf0a',
    '598468a5-00f3-4496-b70e-1a8ef2d35812',
    '6518d9ea-779c-4c41-b345-95e80a35255f',
    '67f27ead-350a-41e5-9975-24d9bad43c4a',
    '6c7ff3af-1d14-49e4-8c2f-b8377500e930',
    '748e9706-2be6-4434-940a-64510e2fa62a',
    '844df450-e5c8-4854-8857-5f0a6a109fca',
    '84fc61e5-d098-41dc-8223-0b5954fab854',
    '8be90fc3-7e71-48e3-9ced-4ab5adeffcd8',
    '8dd130ab-0d05-4415-b372-f498188aadd4',
    '9027d266-b89d-4280-8059-b956e0e76289',
    'a2baca6c-344c-4ae8-a6c4-ca5681606de5',
    'a491fa9c-f509-4f12-b7fe-2453f1822d6b',
    'b1d1fc7e-f10d-400d-ad57-02398c809c19',
    'c4a8bfdc-09cd-402a-91dc-03e9a8182cf7',
    'ccc0e762-8ab6-4d01-bc9f-51950953ef7a',
    'ce95fa29-6b28-467d-a741-9a4295deccf4',
    'd167c876-7006-4fb7-88d7-d44d217c32b3',
    'dcdc3f12-e636-44bd-b0a6-b99247197768',
    'dd63ab56-431a-4839-a605-763165cf95ce',
    'e5ced493-97d4-4dc0-89d5-d6d76c9f8ff5',
    'e68229e6-f424-42ef-ac6a-12a6fde7b8bf',
    'e8bc4e2d-5df6-4253-8d7a-f45e8bdbe346',
    'ea2807ad-2d81-4f43-8775-3ee9f5cebb3b',
    'f08f29df-e48a-42a3-9b6e-98f326883f87',
    'f99694fc-de29-4057-bf21-76a33f0805e7'
  ]::uuid[];
  v_alvo uuid[]; v_n int; v_m int; v_t0 timestamptz := clock_timestamp();
  v_antes jsonb; v_depois jsonb; v_md5_a text; v_md5_d text; v_ant_a text; v_ant_d text;
  v_id uuid; v_r jsonb; v_calc uuid[]; v_cols jsonb; v_audit_a int; v_audit_d int; v_cal_a int; v_cal_d int;
BEGIN
  SET LOCAL statement_timeout = '80s';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  IF auth.uid() IS DISTINCT FROM c_admin THEN RAISE EXCEPTION 'GUARDA: sessao simulada nao pegou (auth.uid = %)', auth.uid(); END IF;

  -- ── guardas ──────────────────────────────────────────────────────────────────────────────────────────────────────
  SELECT array_agg(id ORDER BY id) INTO v_alvo FROM financeiro_lancamentos_v2
   WHERE cliente_id = c_cli AND origem_lancamento = 'excel' AND created_by = c_admin
     AND created_at >= '2026-10-05 11:50+00' AND created_at < '2026-10-05 12:10+00';
  IF COALESCE(array_length(v_alvo, 1), 0) <> 229 THEN RAISE EXCEPTION 'GUARDA: alvo % <> 229', COALESCE(array_length(v_alvo, 1), 0); END IF;
  SELECT count(*) INTO v_n FROM financeiro_lancamentos_v2 WHERE id = ANY (v_alvo)
     AND (cancelado IS TRUE OR status_transacao <> 'realizado' OR updated_at > created_at + interval '5 seconds'
          OR lote_importacao_id IS NOT NULL OR editado_manual IS TRUE);
  IF v_n <> 0 THEN RAISE EXCEPTION 'GUARDA: % linha(s) do alvo ja mexida(s) depois da importacao (cancelada, status, edicao)', v_n; END IF;
  SELECT count(*) INTO v_n FROM conciliacao_bancaria_itens WHERE lancamento_id = ANY (v_alvo) AND desfeito_em IS NULL;
  IF v_n <> 0 THEN RAISE EXCEPTION 'GUARDA: % vinculo(s) vivo(s) com extrato no alvo', v_n; END IF;
  SELECT count(*) INTO v_n FROM zoo_operacao_partes WHERE financeiro_lancamento_id = ANY (v_alvo) AND cancelada = false;
  IF v_n <> 0 THEN RAISE EXCEPTION 'GUARDA: % parte(s) viva(s) de OC no alvo', v_n; END IF;
  SELECT count(*) INTO v_n FROM financeiro_lancamento_documentos WHERE lancamento_id = ANY (v_alvo);
  IF v_n <> 0 THEN RAISE EXCEPTION 'GUARDA: % documento(s) anexado(s) a linha do alvo', v_n; END IF;
  IF NOT (c_gemeas <@ v_alvo) OR array_length(c_gemeas, 1) <> 40 THEN RAISE EXCEPTION 'GUARDA: as 40 gemeas nao estao todas no alvo'; END IF;
  IF (c_antigas && v_alvo) OR array_length(c_antigas, 1) <> 41 THEN RAISE EXCEPTION 'GUARDA: lista das antigas invalida'; END IF;
  SELECT count(*) INTO v_n FROM financeiro_lancamentos_v2 WHERE id = ANY (c_antigas) AND cliente_id = c_cli
     AND cancelado = false AND status_transacao = 'previsto' AND origem_lancamento IN ('recorrencia', 'contrato');
  IF v_n <> 41 THEN RAISE EXCEPTION 'GUARDA: so % das 41 antigas estao vivas, previstas e de recorrencia/contrato', v_n; END IF;
  -- a lista escrita = a regra recalculada agora (fornecedor, valor, tipo, vencimento ±5, antiga viva e anterior)
  SELECT array_agg(DISTINCT x.id ORDER BY x.id) INTO v_calc
    FROM financeiro_lancamentos_v2 x JOIN financeiro_lancamentos_v2 a
      ON a.cliente_id = c_cli AND a.cancelado = false AND a.created_at < '2026-10-05 11:50+00'
     AND a.favorecido_id = x.favorecido_id AND a.valor = x.valor AND a.tipo_operacao = x.tipo_operacao
     AND a.data_vencimento BETWEEN x.data_vencimento - 5 AND x.data_vencimento + 5
   WHERE x.id = ANY (v_alvo);
  IF v_calc IS DISTINCT FROM (SELECT array_agg(u ORDER BY u) FROM unnest(c_gemeas) u) THEN
    RAISE EXCEPTION 'GUARDA: a regra das gemeas da % hoje, a lista escrita tem 40 — o dado mudou', COALESCE(array_length(v_calc, 1), 0);
  END IF;
  -- cada gemea tem ao menos uma antiga da lista; a 191d228f tem DUAS
  SELECT count(*) INTO v_n FROM unnest(c_gemeas) g WHERE NOT EXISTS (
    SELECT 1 FROM financeiro_lancamentos_v2 x JOIN financeiro_lancamentos_v2 a ON a.id = ANY (c_antigas)
       AND a.favorecido_id = x.favorecido_id AND a.valor = x.valor AND a.tipo_operacao = x.tipo_operacao
       AND a.data_vencimento BETWEEN x.data_vencimento - 5 AND x.data_vencimento + 5 WHERE x.id = g);
  IF v_n <> 0 THEN RAISE EXCEPTION 'GUARDA: % gemea(s) sem antiga correspondente', v_n; END IF;

  -- ── medicao ANTES ────────────────────────────────────────────────────────────────────────────────────────────────
  CREATE TEMP TABLE _foto_alvo ON COMMIT DROP AS SELECT id, to_jsonb(l) j FROM financeiro_lancamentos_v2 l WHERE id = ANY (v_alvo);
  SELECT md5(string_agg(md5(l::text), '' ORDER BY l.id)) INTO v_md5_a FROM financeiro_lancamentos_v2 l WHERE cliente_id = c_cli AND NOT (id = ANY (v_alvo));
  SELECT md5(string_agg(md5(l::text), '' ORDER BY l.id)) INTO v_ant_a FROM financeiro_lancamentos_v2 l WHERE id = ANY (c_antigas);
  SELECT count(*) INTO v_audit_a FROM audit_log;
  SELECT count(*) INTO v_cal_a FROM conciliacao_audit_log;
  SELECT pg_temp._ensaio_medir(c_cli, v_alvo) INTO v_antes;

  -- ── (1) cancelar as 40 gemeas pelo dono ──────────────────────────────────────────────────────────────────────────
  FOREACH v_id IN ARRAY c_gemeas LOOP
    v_r := fn_cancelar_lancamento_auditoria(v_id, c_motivo);
    IF (v_r->>'ok') IS DISTINCT FROM 'true' OR (v_r->>'ja_cancelado') = 'true' OR (v_r->>'cbi_desfeito') = 'true' THEN
      RAISE EXCEPTION 'GUARDA: cancelamento de % devolveu %', v_id, v_r;
    END IF;
  END LOOP;

  -- ── (2) as 189: programado, sem data de pagamento ────────────────────────────────────────────────────────────────
  UPDATE financeiro_lancamentos_v2
     SET status_transacao = 'programado', data_pagamento = NULL, updated_by = c_admin
   WHERE id = ANY (v_alvo) AND NOT (id = ANY (c_gemeas)) AND cancelado = false AND status_transacao = 'realizado';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 189 THEN RAISE EXCEPTION 'GUARDA: UPDATE das programadas alcancou % (esperado 189)', v_n; END IF;

  -- ── conferencia DEPOIS ───────────────────────────────────────────────────────────────────────────────────────────
  SELECT md5(string_agg(md5(l::text), '' ORDER BY l.id)) INTO v_md5_d FROM financeiro_lancamentos_v2 l WHERE cliente_id = c_cli AND NOT (id = ANY (v_alvo));
  SELECT md5(string_agg(md5(l::text), '' ORDER BY l.id)) INTO v_ant_d FROM financeiro_lancamentos_v2 l WHERE id = ANY (c_antigas);
  IF v_md5_a IS DISTINCT FROM v_md5_d THEN RAISE EXCEPTION 'GUARDA: linhas do NJ FORA do alvo mudaram (md5 % -> %)', v_md5_a, v_md5_d; END IF;
  IF v_ant_a IS DISTINCT FROM v_ant_d THEN RAISE EXCEPTION 'GUARDA: alguma das 41 antigas mudou'; END IF;
  SELECT count(*) INTO v_n FROM financeiro_lancamentos_v2 WHERE id = ANY (c_antigas) AND cancelado = false AND status_transacao = 'previsto';
  IF v_n <> 41 THEN RAISE EXCEPTION 'GUARDA: antigas vivas depois = %', v_n; END IF;
  SELECT count(*) FILTER (WHERE cancelado), count(*) FILTER (WHERE NOT cancelado AND status_transacao = 'programado' AND data_pagamento IS NULL)
    INTO v_n, v_m FROM financeiro_lancamentos_v2 WHERE id = ANY (v_alvo);
  IF v_n <> 40 OR v_m <> 189 THEN RAISE EXCEPTION 'GUARDA: depois = % canceladas / % programadas (esperado 40 / 189)', v_n, v_m; END IF;
  SELECT count(*) INTO v_n FROM financeiro_lancamentos_v2 WHERE cliente_id = c_cli AND cancelado = false
     AND status_transacao = 'realizado' AND data_pagamento IS NULL;
  IF v_n <> 0 THEN RAISE EXCEPTION 'GUARDA: ainda ha % realizado(s) sem data de pagamento no NJ', v_n; END IF;
  SELECT pg_temp._ensaio_medir(c_cli, v_alvo) INTO v_depois;
  SELECT count(*) INTO v_audit_d FROM audit_log;
  SELECT count(*) INTO v_cal_d FROM conciliacao_audit_log;
  -- o que mudou nas 189, coluna a coluna (quantas linhas por coluna)
  SELECT jsonb_object_agg(k, n) INTO v_cols FROM (
    SELECT d.key k, count(*) n FROM _foto_alvo f JOIN financeiro_lancamentos_v2 l ON l.id = f.id AND NOT l.cancelado,
           LATERAL jsonb_each(to_jsonb(l)) d WHERE d.value IS DISTINCT FROM f.j -> d.key GROUP BY 1) q;

  RAISE NOTICE 'CONSERTO APLICADO: 40 canceladas, 189 programadas; md5 fora do alvo % (igual); % ms',
    v_md5_a, round(extract(epoch FROM clock_timestamp() - v_t0) * 1000);
END
$conserto$;
