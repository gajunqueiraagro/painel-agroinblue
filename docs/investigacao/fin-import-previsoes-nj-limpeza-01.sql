CREATE OR REPLACE FUNCTION pg_temp._limpeza_medir(c_cli uuid) RETURNS jsonb LANGUAGE sql AS $m$
  SELECT jsonb_build_object(
   'a_pagar_receber_venc_out26', (SELECT jsonb_build_object('linhas', count(*), 'soma', sum(valor)) FROM financeiro_lancamentos_v2
        WHERE cliente_id = c_cli AND cancelado = false AND cenario = 'realizado' AND tipo_operacao NOT LIKE '3-%'
          AND status_transacao IN ('previsto', 'programado', 'agendado') AND data_vencimento BETWEEN '2026-10-01' AND '2026-10-31'),
   'recorrencia_prev_prog_venc_out26', (SELECT jsonb_build_object('linhas', count(*), 'soma', sum(valor),
          'previstas', count(*) FILTER (WHERE status_transacao = 'previsto'), 'programadas', count(*) FILTER (WHERE status_transacao = 'programado'))
        FROM financeiro_lancamentos_v2 WHERE cliente_id = c_cli AND cancelado = false AND recorrencia_id IS NOT NULL
          AND status_transacao IN ('previsto', 'programado') AND data_vencimento BETWEEN '2026-10-01' AND '2026-10-31'),
   'planilha_vivas', (SELECT jsonb_build_object('linhas', count(*), 'soma', sum(valor)) FROM financeiro_lancamentos_v2
        WHERE cliente_id = c_cli AND cancelado = false AND origem_lancamento = 'excel' AND created_at >= '2026-10-05 11:50+00' AND created_at < '2026-10-05 12:10+00'),
   'planilha_canceladas', (SELECT count(*) FROM financeiro_lancamentos_v2
        WHERE cliente_id = c_cli AND cancelado = true AND origem_lancamento = 'excel' AND created_at >= '2026-10-05 11:50+00' AND created_at < '2026-10-05 12:10+00'),
   'realizado_sem_pgto_nj', (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE cliente_id = c_cli AND cancelado = false AND status_transacao = 'realizado' AND data_pagamento IS NULL))
$m$;
-- FIN-IMPORT-PREVISOES-NJ-LIMPEZA-01 — NJ: a planilha de previsoes de 05/10/2026 x as contas previstas de recorrencia.
-- EXECUCAO REAL — NAO EXECUTAR sem o OK do Gabriel. Identico ao ensaio de 05/10/2026, trocando o RAISE final por NOTICE (o DO comita ao terminar).
--
-- DECISOES DO GABRIEL (05/10): a recorrencia esta' certa (fazenda, classificacao, descricao, vinculo); a planilha traz o valor e
-- a data do mes. CASAR = a conta da recorrencia recebe valor e vencimento da planilha e passa a 'programado'; a linha da planilha
-- e' cancelada pelo dono (`fn_cancelar_lancamento_auditoria`). Duas linhas da planilha para uma recorrencia: SOMA, vencimento o
-- mais cedo. 32 linhas da planilha -> 31 contas do sistema.
-- NAO TOCA: nenhuma outra linha do NJ (md5 antes x depois), as 41 "antigas" das gemeas das 09:41, as 3 que ficam fora, extrato,
-- vinculo, recorrencia (a REGRA nao muda: so' o lancamento do mes).
-- ⚠ Sessao simulada do admin que fez a importacao (o dono do cancelamento exige usuario), como no conserto das 09:41.
DO $limpeza$
DECLARE
  c_cli   constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_motivo constant text := 'Duplicada na importação Excel de 05/10/2026 — valor do mês levado para a conta da recorrência';
  c_fora constant uuid[] := ARRAY['1ed5ffd8-adeb-4ded-886f-f98d87609fbc', '31e2b2e1-f287-4d68-b5aa-6eed04f2c76a', '53a82f31-d7ac-4fa9-a552-01cad7bb1085']::uuid[];
  c_antigas40 constant uuid[] := ARRAY['07dffbfd-a6e8-4574-8a22-007b8d691e29', '0f7289fa-6231-499d-9cb7-609d2e1b8889', '1567c3b6-1c7b-4b92-bc6d-6061594c0720', '318c81d8-c81a-4c7f-9f47-fc40d65f82d8', '32120487-4cde-438e-9aaa-5d7777f9be57', '3332a696-50de-49d4-bacd-f81799bb2545', '35cf13d6-5725-42ce-8802-dceb53d982e5', '3675bea0-d61f-4449-83cb-ab6cfe339f86', '36c81fad-0ae9-4a38-8e76-c4c8df6ce997', '3cc54182-b8e1-4504-b402-6949af9d8912', '3e1b8401-acda-4fa0-8eef-4c5b5004bed9', '42ab1755-c9ad-495b-a710-698fb23023c4', '45ac398d-f8f8-41c7-853a-897be452a485', '478eb8b9-0615-4a56-83fa-756aa214dd81', '507536a2-8889-4da4-bb95-4c5395f26f7f', '5197a818-2919-46b3-b245-6335ea39cf0a', '598468a5-00f3-4496-b70e-1a8ef2d35812', '6518d9ea-779c-4c41-b345-95e80a35255f', '67f27ead-350a-41e5-9975-24d9bad43c4a', '6c7ff3af-1d14-49e4-8c2f-b8377500e930', '748e9706-2be6-4434-940a-64510e2fa62a', '844df450-e5c8-4854-8857-5f0a6a109fca', '84fc61e5-d098-41dc-8223-0b5954fab854', '8be90fc3-7e71-48e3-9ced-4ab5adeffcd8', '8dd130ab-0d05-4415-b372-f498188aadd4', '9027d266-b89d-4280-8059-b956e0e76289', 'a2baca6c-344c-4ae8-a6c4-ca5681606de5', 'a491fa9c-f509-4f12-b7fe-2453f1822d6b', 'b1d1fc7e-f10d-400d-ad57-02398c809c19', 'c4a8bfdc-09cd-402a-91dc-03e9a8182cf7', 'ccc0e762-8ab6-4d01-bc9f-51950953ef7a', 'ce95fa29-6b28-467d-a741-9a4295deccf4', 'd167c876-7006-4fb7-88d7-d44d217c32b3', 'dcdc3f12-e636-44bd-b0a6-b99247197768', 'dd63ab56-431a-4839-a605-763165cf95ce', 'e5ced493-97d4-4dc0-89d5-d6d76c9f8ff5', 'e68229e6-f424-42ef-ac6a-12a6fde7b8bf', 'e8bc4e2d-5df6-4253-8d7a-f45e8bdbe346', 'ea2807ad-2d81-4f43-8775-3ee9f5cebb3b', 'f08f29df-e48a-42a3-9b6e-98f326883f87', 'f99694fc-de29-4057-bf21-76a33f0805e7']::uuid[];
  v_n int; v_t0 timestamptz := clock_timestamp(); v_md5_a text; v_md5_d text; v_fora_a text; v_fora_d text;
  v_antes jsonb; v_depois jsonb; v_pares jsonb; v_cols jsonb; v_imut_a text; v_imut_d text; v_r jsonb; v_row record;
  v_audit_a int; v_audit_d int;
BEGIN
  SET LOCAL statement_timeout = '80s';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  IF auth.uid() IS DISTINCT FROM c_admin THEN RAISE EXCEPTION 'GUARDA: sessao simulada nao pegou'; END IF;

  CREATE TEMP TABLE _par (bloco int, planilha uuid, sistema uuid) ON COMMIT DROP;
  INSERT INTO _par VALUES
    (1, '89c794df-5ae5-427a-a54c-8b8f26a5bc23'::uuid, 'a4c50c78-f516-4dda-a269-4eb8a2187c2b'::uuid),
    (1, 'a8094f98-434a-412d-b0ad-b503e75e92f9'::uuid, '2f48e571-acca-4173-a8cc-7513e6cabec1'::uuid),
    (1, '8f7708b3-983d-4deb-bc2b-24ba4bb6d344'::uuid, '0957386c-772c-4d3e-af26-d61c41876b52'::uuid),
    (1, '7f040066-88bc-4571-ad0d-96462209c885'::uuid, '589909af-10f6-488c-95f9-db3c854bf115'::uuid),
    (1, 'a3e0a388-abeb-47fa-90d1-2ee5ed90b0f4'::uuid, '3407501e-432c-43b7-b467-a69be693c93c'::uuid),
    (1, 'b5f2e52b-829c-4f0d-8392-88d8f9f2e662'::uuid, '68573320-50c9-445e-903f-746106ea469c'::uuid),
    (1, '1ce78592-6183-4ec1-bd4e-2eac98c4598d'::uuid, '38af62ef-e712-438a-b6ac-2816456ca24b'::uuid),
    (1, '3660dab5-8654-4ff6-b3d0-dc323b952545'::uuid, 'ca76fa56-5dc9-4a6b-ac3d-f008e36ac29a'::uuid),
    (1, '5b47d8ea-47f4-4b51-ab7a-e281c98e56b5'::uuid, '41b087af-7a3d-4fac-92d2-c59277969390'::uuid),
    (1, 'd980052d-2905-4bdf-acc1-87d51db2f0b5'::uuid, 'bac38a7f-9557-4148-991f-0ca391ce6914'::uuid),
    (1, '226fedb5-5371-475a-ae8b-bc0631ee4d61'::uuid, '3cd97ef9-055b-4272-a5ba-9b8d4f62bd76'::uuid),
    (1, 'd24c4091-6902-4fa6-aca8-2f15463c0434'::uuid, '9581c1dd-6d0d-48f6-9830-f6caa880ac0c'::uuid),
    (1, '6da37b72-69e6-4fa3-975e-e212c1a80220'::uuid, '777bc8ea-05a1-4d3a-a2e1-c360c43d3254'::uuid),
    (1, '93142b9b-09fa-4e45-a0bd-55bc4ffae82d'::uuid, '8c746fc4-828f-403c-b932-26a4295dc035'::uuid),
    (1, 'c42f8e74-2d65-43c7-ae38-0b54abeb3540'::uuid, '0d620482-069a-4fa5-aa37-7d4bf3169025'::uuid),
    (1, '03750c03-d649-462b-867b-1b8ac9915aa6'::uuid, 'b57017cc-dd04-49fd-8519-3030fdc50396'::uuid),
    (1, 'fba7b2ea-66c0-4a87-9c8d-5c6d0a7ecfb7'::uuid, '6fbcdfbd-fb6f-4a74-9491-8ce50ea0b210'::uuid),
    (1, 'bd035bf1-9faf-4aed-ad6b-d171504b1324'::uuid, 'aaa1f023-7d15-4df7-bff5-872812b051e9'::uuid),
    (1, 'c3432132-6ecd-463f-b7d4-618bd9ed7cba'::uuid, '9e520992-d77e-4f19-a00a-9b9b697ebba1'::uuid),
    (2, '453ed940-f919-45a5-a1cd-3c3731a27df3'::uuid, '47e502e7-78ef-40f6-a72f-c86b045b4fcc'::uuid),
    (2, 'ae0ec222-2352-4d95-be72-19cf42b80594'::uuid, '58454822-493e-43cf-bd5b-d7dca78045f5'::uuid),
    (2, 'c49b98ca-d9d4-4c17-b08a-97fea762aeeb'::uuid, '7c47fdd8-9f00-4dbf-b630-8c01c729dd8a'::uuid),
    (2, '7c4caf82-f0fe-4a3e-be8e-542c62645bd8'::uuid, '30bef276-ceb5-4f04-9af8-52601bc1cf09'::uuid),
    (2, 'de7bc1ea-e526-4c3c-b0fa-faa821e27860'::uuid, 'dc61535f-8c53-4f9f-9710-c153b741cbac'::uuid),
    (2, '38dbc0f3-aa2e-43ad-aea9-e8a5d85351c4'::uuid, '2a517e43-8cc5-4c92-a767-d35c7eb115e1'::uuid),
    (2, '356d7d8f-c97c-4933-a843-d4047ea7b90d'::uuid, '0f66be2b-6abf-40fb-9888-94cf0270d356'::uuid),
    (2, 'f4edc307-5b43-4817-b07c-2d58ef7400ef'::uuid, '54dd7458-591f-4512-b7c4-4bf0ef06d3e5'::uuid),
    (2, 'de998bc8-d74a-4b9e-b16e-2749a88898ad'::uuid, '666e9ae6-cb4d-454b-83d1-69ffed8b607f'::uuid),
    (2, '2c6d370d-921e-4971-8fa7-08e08a6ae05c'::uuid, 'e34dd733-a871-4040-93ae-573500b8ea93'::uuid),
    (2, '7a1e35f7-3104-41ce-883b-75b08c912f5d'::uuid, '50262d86-d07d-4df5-bf34-4b5902f44419'::uuid),
    (3, 'c2e85ef2-67b9-459c-b5ed-b82ac7e61c1b'::uuid, 'f4766a16-7d88-4f80-bd5d-f4d56aad2a5b'::uuid),
    (3, 'f437ca0a-9920-4555-b9c0-8ca839bc984e'::uuid, 'f4766a16-7d88-4f80-bd5d-f4d56aad2a5b'::uuid);

  -- ── guardas ──────────────────────────────────────────────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_n FROM _par; IF v_n <> 32 THEN RAISE EXCEPTION 'GUARDA: % pares (esperado 32)', v_n; END IF;
  SELECT count(DISTINCT planilha) INTO v_n FROM _par; IF v_n <> 32 THEN RAISE EXCEPTION 'GUARDA: linha da planilha repetida'; END IF;
  SELECT count(DISTINCT sistema) INTO v_n FROM _par; IF v_n <> 31 THEN RAISE EXCEPTION 'GUARDA: % contas do sistema (esperado 31)', v_n; END IF;
  IF EXISTS (SELECT 1 FROM _par GROUP BY sistema HAVING count(*) > 1 AND min(bloco) <> 3) THEN RAISE EXCEPTION 'GUARDA: conta do sistema recebendo duas linhas fora do bloco 3'; END IF;
  IF EXISTS (SELECT 1 FROM _par a JOIN _par b ON a.planilha = b.sistema) THEN RAISE EXCEPTION 'GUARDA: a mesma linha dos dois lados'; END IF;
  -- a planilha: viva, excel de hoje, programada, sem pagamento, sem vinculo, sem parte de OC, sem documento
  SELECT count(*) INTO v_n FROM _par p JOIN financeiro_lancamentos_v2 l ON l.id = p.planilha
   WHERE l.cliente_id = c_cli AND l.cancelado = false AND l.origem_lancamento = 'excel' AND l.created_by = c_admin
     AND l.created_at >= '2026-10-05 11:50+00' AND l.created_at < '2026-10-05 12:10+00'
     AND l.status_transacao = 'programado' AND l.data_pagamento IS NULL AND l.recorrencia_id IS NULL AND l.tipo_operacao = '2-Saídas';
  IF v_n <> 32 THEN RAISE EXCEPTION 'GUARDA: so % das 32 linhas da planilha estao vivas, programadas e sem pagamento', v_n; END IF;
  -- o sistema: viva, de recorrencia, prevista/programada/agendada, sem pagamento
  SELECT count(*) INTO v_n FROM (SELECT DISTINCT sistema FROM _par) p JOIN financeiro_lancamentos_v2 l ON l.id = p.sistema
   WHERE l.cliente_id = c_cli AND l.cancelado = false AND l.recorrencia_id IS NOT NULL AND l.created_at < '2026-10-05 11:50+00'
     AND l.status_transacao IN ('previsto', 'programado', 'agendado') AND l.data_pagamento IS NULL AND l.conciliado_em IS NULL
     AND l.tipo_operacao = '2-Saídas' AND l.sinal::text = '-1' AND l.valor > 0;
  IF v_n <> 31 THEN RAISE EXCEPTION 'GUARDA: so % das 31 contas do sistema estao vivas, de recorrencia, a pagar e sem pagamento', v_n; END IF;
  SELECT count(*) INTO v_n FROM conciliacao_bancaria_itens c WHERE c.desfeito_em IS NULL
     AND c.lancamento_id IN (SELECT planilha FROM _par UNION SELECT sistema FROM _par);
  IF v_n <> 0 THEN RAISE EXCEPTION 'GUARDA: % vinculo(s) vivo(s) com extrato nas linhas envolvidas', v_n; END IF;
  SELECT count(*) INTO v_n FROM zoo_operacao_partes z WHERE z.cancelada = false
     AND z.financeiro_lancamento_id IN (SELECT planilha FROM _par UNION SELECT sistema FROM _par);
  IF v_n <> 0 THEN RAISE EXCEPTION 'GUARDA: % parte(s) viva(s) de OC', v_n; END IF;
  SELECT count(*) INTO v_n FROM financeiro_lancamento_documentos WHERE lancamento_id IN (SELECT planilha FROM _par);
  IF v_n <> 0 THEN RAISE EXCEPTION 'GUARDA: % documento(s) em linha da planilha', v_n; END IF;
  -- regra geral de exclusao: conta que ja' foi a "antiga" de uma gemea exata nao casa de novo; as 3 de fora nao entram
  IF EXISTS (SELECT 1 FROM _par WHERE sistema = ANY (c_antigas40)) THEN RAISE EXCEPTION 'GUARDA: conta do sistema ja foi a antiga de uma gemea exata'; END IF;
  IF EXISTS (SELECT 1 FROM _par WHERE planilha = ANY (c_fora) OR sistema = ANY (c_fora)) THEN RAISE EXCEPTION 'GUARDA: linha que fica fora entrou num par'; END IF;
  SELECT count(*) INTO v_n FROM financeiro_lancamentos_v2 WHERE id = ANY (c_fora) AND cancelado = false AND status_transacao = 'programado';
  IF v_n <> 3 THEN RAISE EXCEPTION 'GUARDA: as 3 que ficam fora nao estao como esperado (%)', v_n; END IF;
  -- mes fechado: competencia e vencimento (antigo e novo) das contas do sistema
  SELECT count(*) INTO v_n FROM _par p JOIN financeiro_lancamentos_v2 s ON s.id = p.sistema JOIN financeiro_lancamentos_v2 x ON x.id = p.planilha
    JOIN financeiro_fechamentos f ON f.cliente_id = c_cli AND f.status_fechamento = 'fechado'
     AND f.ano_mes IN (s.ano_mes, to_char(s.data_vencimento, 'YYYY-MM'), to_char(x.data_vencimento, 'YYYY-MM'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'GUARDA: % par(es) em mes fechado', v_n; END IF;
  -- o vencimento novo fica no MESMO mes do antigo (a competencia da recorrencia deriva do mes do vencimento)
  SELECT count(*) INTO v_n FROM _par p JOIN financeiro_lancamentos_v2 s ON s.id = p.sistema JOIN financeiro_lancamentos_v2 x ON x.id = p.planilha
   WHERE x.data_vencimento IS NULL OR to_char(x.data_vencimento, 'YYYY-MM') <> to_char(s.data_vencimento, 'YYYY-MM');
  IF v_n <> 0 THEN RAISE EXCEPTION 'GUARDA: % par(es) com vencimento da planilha em outro mes', v_n; END IF;

  -- ── o que cada conta do sistema recebe ───────────────────────────────────────────────────────────────────────────
  CREATE TEMP TABLE _novo ON COMMIT DROP AS
  SELECT p.sistema, min(p.bloco) AS bloco, sum(x.valor) AS valor, min(x.data_vencimento) AS venc, count(*) AS linhas
    FROM _par p JOIN financeiro_lancamentos_v2 x ON x.id = p.planilha GROUP BY p.sistema;

  -- ── medicao ANTES ────────────────────────────────────────────────────────────────────────────────────────────────
  CREATE TEMP TABLE _foto ON COMMIT DROP AS SELECT l.id, to_jsonb(l) j FROM financeiro_lancamentos_v2 l WHERE l.id IN (SELECT sistema FROM _par);
  SELECT md5(string_agg(md5(l::text), '' ORDER BY l.id)) INTO v_md5_a FROM financeiro_lancamentos_v2 l
   WHERE l.cliente_id = c_cli AND l.id NOT IN (SELECT planilha FROM _par UNION SELECT sistema FROM _par);
  SELECT md5(string_agg(md5(l::text), '' ORDER BY l.id)) INTO v_fora_a FROM financeiro_lancamentos_v2 l WHERE l.id = ANY (c_fora) OR l.id = ANY (c_antigas40);
  -- o que NAO pode mudar na conta do sistema
  SELECT md5(string_agg(concat_ws('|', l.id, l.recorrencia_id, l.fazenda_id, l.plano_conta_id, l.subcentro, l.descricao, l.data_competencia, l.ano_mes,
           l.favorecido_id, l.conta_bancaria_id, l.conta_destino_id, l.sinal, l.tipo_operacao, l.safra_id, l.origem_lancamento, l.cancelado, l.data_pagamento,
           l.forma_pagamento, l.observacao, l.numero_documento, l.editado_manual), '#' ORDER BY l.id))
    INTO v_imut_a FROM financeiro_lancamentos_v2 l WHERE l.id IN (SELECT sistema FROM _par);
  SELECT count(*) INTO v_audit_a FROM audit_log;
  SELECT pg_temp._limpeza_medir(c_cli) INTO v_antes;
  SELECT jsonb_agg(jsonb_build_object('bloco', p.bloco, 'planilha', left(p.planilha::text, 8), 'sistema', left(p.sistema::text, 8),
           'fornecedor', f.nome, 'p_desc', x.descricao, 'p_valor', x.valor, 'p_venc', x.data_vencimento, 'p_faz', fx.nome,
           's_desc', s.descricao, 's_valor', s.valor, 's_venc', s.data_vencimento, 's_faz', fs.nome, 's_origem', s.origem_lancamento, 's_status', s.status_transacao,
           'n_valor', n.valor, 'n_venc', n.venc, 'linhas', n.linhas) ORDER BY p.bloco, f.nome, x.valor)
    INTO v_pares
    FROM _par p JOIN financeiro_lancamentos_v2 x ON x.id = p.planilha JOIN financeiro_lancamentos_v2 s ON s.id = p.sistema
    JOIN _novo n ON n.sistema = p.sistema
    LEFT JOIN financeiro_fornecedores f ON f.id = s.favorecido_id LEFT JOIN fazendas fx ON fx.id = x.fazenda_id LEFT JOIN fazendas fs ON fs.id = s.fazenda_id;

  -- ── (1) a conta da recorrencia recebe o valor e o vencimento do mes, e passa a programada ────────────────────────
  UPDATE financeiro_lancamentos_v2 l
     SET valor = n.valor, data_vencimento = n.venc, status_transacao = 'programado', updated_by = c_admin
    FROM _novo n WHERE l.id = n.sistema;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 31 THEN RAISE EXCEPTION 'GUARDA: UPDATE das contas do sistema alcancou % (esperado 31)', v_n; END IF;

  -- ── (2) a linha da planilha e' cancelada pelo dono ───────────────────────────────────────────────────────────────
  FOR v_row IN SELECT planilha FROM _par ORDER BY planilha LOOP
    v_r := fn_cancelar_lancamento_auditoria(v_row.planilha, c_motivo);
    IF (v_r->>'ok') IS DISTINCT FROM 'true' OR (v_r->>'ja_cancelado') = 'true' OR (v_r->>'cbi_desfeito') = 'true' THEN
      RAISE EXCEPTION 'GUARDA: cancelamento de % devolveu %', v_row.planilha, v_r;
    END IF;
  END LOOP;

  -- ── conferencia DEPOIS ───────────────────────────────────────────────────────────────────────────────────────────
  SELECT md5(string_agg(md5(l::text), '' ORDER BY l.id)) INTO v_md5_d FROM financeiro_lancamentos_v2 l
   WHERE l.cliente_id = c_cli AND l.id NOT IN (SELECT planilha FROM _par UNION SELECT sistema FROM _par);
  IF v_md5_a IS DISTINCT FROM v_md5_d THEN RAISE EXCEPTION 'GUARDA: linhas do NJ fora das envolvidas mudaram'; END IF;
  SELECT md5(string_agg(md5(l::text), '' ORDER BY l.id)) INTO v_fora_d FROM financeiro_lancamentos_v2 l WHERE l.id = ANY (c_fora) OR l.id = ANY (c_antigas40);
  IF v_fora_a IS DISTINCT FROM v_fora_d THEN RAISE EXCEPTION 'GUARDA: as 3 de fora ou as 41 antigas mudaram'; END IF;
  SELECT md5(string_agg(concat_ws('|', l.id, l.recorrencia_id, l.fazenda_id, l.plano_conta_id, l.subcentro, l.descricao, l.data_competencia, l.ano_mes,
           l.favorecido_id, l.conta_bancaria_id, l.conta_destino_id, l.sinal, l.tipo_operacao, l.safra_id, l.origem_lancamento, l.cancelado, l.data_pagamento,
           l.forma_pagamento, l.observacao, l.numero_documento, l.editado_manual), '#' ORDER BY l.id))
    INTO v_imut_d FROM financeiro_lancamentos_v2 l WHERE l.id IN (SELECT sistema FROM _par);
  IF v_imut_a IS DISTINCT FROM v_imut_d THEN RAISE EXCEPTION 'GUARDA: recorrencia, fazenda, plano, descricao, competencia ou outro campo protegido da conta do sistema mudou'; END IF;
  SELECT count(*) INTO v_n FROM financeiro_lancamentos_v2 l JOIN _novo n ON n.sistema = l.id
   WHERE l.valor = n.valor AND l.data_vencimento = n.venc AND l.status_transacao = 'programado' AND l.cancelado = false AND l.data_pagamento IS NULL;
  IF v_n <> 31 THEN RAISE EXCEPTION 'GUARDA: so % das 31 contas ficaram com o valor e o vencimento da planilha', v_n; END IF;
  SELECT count(*) INTO v_n FROM financeiro_lancamentos_v2 l WHERE l.id IN (SELECT planilha FROM _par) AND l.cancelado = true AND l.cancelado_motivo = c_motivo AND l.cancelado_por = c_admin;
  IF v_n <> 32 THEN RAISE EXCEPTION 'GUARDA: so % das 32 linhas da planilha ficaram canceladas com o motivo', v_n; END IF;
  SELECT jsonb_object_agg(k, n) INTO v_cols FROM (
    SELECT d.key k, count(*) n FROM _foto f JOIN financeiro_lancamentos_v2 l ON l.id = f.id, LATERAL jsonb_each(to_jsonb(l)) d
     WHERE d.value IS DISTINCT FROM f.j -> d.key GROUP BY 1) q;
  SELECT pg_temp._limpeza_medir(c_cli) INTO v_depois;
  SELECT count(*) INTO v_audit_d FROM audit_log;

  RAISE NOTICE 'LIMPEZA APLICADA: 31 contas de recorrencia com o valor do mes, 32 linhas da planilha canceladas; md5 fora % (igual); % ms',
    v_md5_a, round(extract(epoch FROM clock_timestamp() - v_t0) * 1000);
END
$limpeza$;
