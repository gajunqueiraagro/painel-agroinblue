-- CONC-BLOCOS-01 — teste do motor de blocos (fn_conciliar_bloco / fn_desfazer_bloco) e do gatilho de promocao.
-- Roda em ROLLBACK: termina em RAISE, nada fica gravado. Canal de escrita, como o admin 7bd0b6ad (request.jwt.claims).
-- G1/G2 = os caminhos existentes (1:1 parcial e 1:N) sob o gatilho: o relatorio compara esta saida com a do gatilho
-- ANTERIOR (mesmo cenario rodado antes da migration, na mesma transacao do ensaio).
DO $teste$
DECLARE
  v_out text := '';
  -- Emerson ago: Pix 24/08 -3.000, 28/08 -16.276,80, 28/08 -3.000 (Cleyton) x 7 arranquios de 21 a 28/08
  e_emerson_ago uuid[] := ARRAY['5f404550-4fed-4452-b4bb-88825cbf7d9d','c3f826d9-ccbd-44e9-b7c6-491fe4a1c748','a5222dda-ef00-456e-8a08-f9aae184e4aa']::uuid[];
  l_emerson_ago uuid[] := ARRAY['d45dbf38-604e-4649-b733-6c1007684040','1c823aad-0504-437e-a081-191a3f24d0e5','6b4146d0-e964-49aa-80af-bc180e679649',
    '72bc707b-ff9b-4e1f-9b37-36b68656fbcb','7728fa39-bb40-441b-983b-e444e9cd1092','2bd01180-6169-4c14-90e8-3571fc8ba946','62b37627-0738-4dce-ba0e-d0636b46019b']::uuid[];
  e_set_a uuid[] := ARRAY['53be195c-ca50-470a-93e9-c31c6882d7b3','94dc4b1a-cce2-4fe5-8962-fdeb461546a7']::uuid[];
  l_set_a uuid[] := ARRAY['575faa09-934b-473b-ab0e-cd28b457a182','cdfe93f9-a379-4d67-85b6-d2f6f2400467','a42b7120-e797-4ac7-aba9-b2e60026479f',
    'c550a336-d0aa-464b-942a-931ad7f3a006','29d916f9-d523-4ad5-b627-37b9cc98a4a8','6ab403da-fdaf-470b-8532-4704dc9f9f2f']::uuid[];
  e_set_b uuid[] := ARRAY['734cdbc7-4e89-4cc4-b369-23f656a22e91','a5d910e3-e21c-47ec-964e-a76aacb94c46']::uuid[];
  l_set_b uuid[] := ARRAY['1d9f27c4-8d4b-4e3f-81aa-1f97a8419309','4b04172e-5ae9-4192-bb90-6ecb32a96e0c','58d7acf3-fa62-4385-a115-6969a50d9c25',
    'f49efde3-ec13-4e8b-b877-494376c8fc03','6a476f41-3f5d-429b-bfe4-140cab9c9cbc','7fb54b98-6a24-4072-89c8-151e692c6540',
    'a2b0922d-fc6b-4bff-b3ae-100975d3ab82','c69e4a98-151f-4320-91c7-e307fc1143f1']::uuid[];
  e_set_c uuid[] := ARRAY['5b4b25f2-6ed7-4a1d-bd11-e5abb4ddd6bf','d8f5b8ed-fafa-4f45-9fc7-2cddd9ed84b3']::uuid[];
  l_set_c uuid[] := ARRAY['2c315005-f5df-4fc3-96f2-e47e61a54df6','6eb818bb-edad-4e6b-9c8c-4e53225caa0b','158d709a-9e5f-44cd-95cd-4cc0e95e5325',
    '1f821da6-769e-4eb5-ab44-7db824efa412','563d3d69-d1db-4434-b5d7-3ee62788d958','6713a137-f086-4ca1-86f0-a1a0bfceb30f']::uuid[];
  e_nelson_1 uuid[] := ARRAY['8fb80bd6-66b7-4353-9ea2-0d33dbb5c849','630175e5-fa77-429f-9376-3c8492df600f']::uuid[];
  l_nelson_1 uuid[] := ARRAY['6629c410-99f4-4b20-a6fc-b69b6e558ca6','8bd7edf5-0ed2-443b-85a2-31815eac5ec2','4e9c031f-7d4f-4e8b-8a35-c3ecd85e0a6f',
    '75f3527e-3609-4ecb-ae16-d147895705f2','01db3c22-76b6-4f51-8a52-feedb59c4707','2ea0178b-e0dc-47af-8a2f-2dadd8427db9',
    '17278cd6-f1cc-4cd7-8c33-3d4b1188ad1f','a8e0fb7b-6b8e-4e9b-8dd1-e50bdee71832','9633d2a3-050e-4ae6-9c8d-6fc1ef3071c7',
    'f9eedab4-0f6d-4c61-a803-45c24b12ed0b','ca70308f-e6c7-4d1b-aa05-f8381ffd7999','ef387f9f-1bad-4af5-b8f5-baa7fc93cdd3']::uuid[];
  e_nelson_2 uuid[] := ARRAY['efb38c29-2b02-4035-b3f9-bb72d8fdbca1','44bd8c6c-70ef-4eed-a572-c9bcf5f3da3c']::uuid[];
  l_nelson_2 uuid[] := ARRAY['3f38bcb2-9976-46b4-bd72-7439a3dc9111','ea8909b5-b1e4-4cfb-b23e-09e73d4ac904','1bc3f2d1-5b7c-4b2f-9856-0b97b4c35f25',
    'c73a2340-60ab-4034-91c7-66afaf207da7','c99bb930-6579-4375-a670-423b07bcb208','f9af3ca6-1ecc-414f-a402-139e12577bb0',
    '6ddda674-dad0-40c4-9605-67bff1a42a3e','c92f9f42-f24f-4608-af32-08c56a3fdab6','99dc7807-b6ed-43bd-bc26-977dd3800d5f',
    'c7d0b02e-fb59-4f24-b95a-9715cfd0091c','454e0cc4-9dd0-4728-b45e-a3c3306fcc5c','9ac4a9bf-a740-4068-a354-4369268a3877',
    '6a4a821f-11cd-488f-b6de-d895dca16cf7','e338b353-1de8-4228-90c1-91e29c098eb1']::uuid[];
  e_tc_2808 uuid[] := ARRAY['316f43d1-f31a-4a6c-b085-6f6023931fa4']::uuid[];
  l_tc_vendas uuid[] := ARRAY['df5e3244-da44-41a7-a263-9586e89a559f','f0ef4bf6-a32a-4691-aefe-a4329eed8b7b']::uuid[];
  e_tc_0209 uuid[] := ARRAY['e0dda6c1-d227-4a30-bcfc-b430744f7d3d']::uuid[];
  l_rec uuid[];
  v_r jsonb; v_b uuid; v_antes jsonb; v_depois jsonb; v_msg text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', true);
  SELECT array_agg(l.id ORDER BY l.descricao) INTO l_rec FROM financeiro_lancamentos_v2 l
   WHERE l.cancelado IS NOT TRUE AND l.descricao ~ '^ICMS a Receber Mandioca · NF (9320690|9333635|9338087) ';
  v_out := 'md5 gatilho=' || (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'fn_promover_lancamento_realizado_ao_conciliar');

  -- ── G. o gatilho nos caminhos que JA existem (cada um numa subtransacao desfeita)
  BEGIN
    PERFORM fn_vincular_extrato_lancamento('5f404550-4fed-4452-b4bb-88825cbf7d9d', 'd45dbf38-604e-4649-b733-6c1007684040', 3000, false);
    SELECT v_out || E'\nG1 1:1 parcial (3.000 de 5.647,60): ' || status_transacao || ' pgto=' || coalesce(data_pagamento::text, '-')
      INTO v_out FROM financeiro_lancamentos_v2 WHERE id = 'd45dbf38-604e-4649-b733-6c1007684040';
    RAISE EXCEPTION 'desfaz_g1';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  BEGIN
    PERFORM fn_vincular_grupo_conciliacao('e0dda6c1-d227-4a30-bcfc-b430744f7d3d', l_rec, NULL, 'teste');
    SELECT v_out || E'\nG2 1:N (6.048 x 3 recebiveis): ' || string_agg(status_transacao || '/' || coalesce(data_pagamento::text, '-'), ' ')
      INTO v_out FROM financeiro_lancamentos_v2 WHERE id = ANY(l_rec);
    RAISE EXCEPTION 'desfaz_g2';
  EXCEPTION WHEN raise_exception THEN NULL; END;

  -- ── S. simulacoes (p_simular = true): o resumo de cada bloco
  v_r := fn_conciliar_bloco(e_emerson_ago, l_emerson_ago, 'exato', true);
  v_out := v_out || E'\nS1 Emerson ago: ext=' || (v_r#>>'{resumo,soma_extratos}') || ' lanc=' || (v_r#>>'{resumo,soma_lancamentos}') || ' dif=' || (v_r#>>'{resumo,diferenca}')
    || ' quitados=' || jsonb_array_length(v_r#>'{resumo,quitados}') || ' matriz=' || jsonb_array_length(v_r->'matriz');
  v_r := fn_conciliar_bloco(e_set_a, l_set_a, 'exato', true);
  v_out := v_out || E'\nS2 Emerson set A: ' || (v_r#>>'{resumo,soma_extratos}') || ' dif=' || (v_r#>>'{resumo,diferenca}') || ' quitados=' || jsonb_array_length(v_r#>'{resumo,quitados}');
  v_r := fn_conciliar_bloco(e_set_b, l_set_b, 'exato', true);
  v_out := v_out || E'\nS3 Emerson set B: ' || (v_r#>>'{resumo,soma_extratos}') || ' dif=' || (v_r#>>'{resumo,diferenca}') || ' quitados=' || jsonb_array_length(v_r#>'{resumo,quitados}');
  v_r := fn_conciliar_bloco(e_set_c, l_set_c, 'exato', true);
  v_out := v_out || E'\nS4 Emerson set C: ' || (v_r#>>'{resumo,soma_extratos}') || ' dif=' || (v_r#>>'{resumo,diferenca}') || ' quitados=' || jsonb_array_length(v_r#>'{resumo,quitados}');
  v_r := fn_conciliar_bloco(e_nelson_1, l_nelson_1, 'exato', true);
  v_out := v_out || E'\nS5 Nelson 1: ' || (v_r#>>'{resumo,soma_extratos}') || ' dif=' || (v_r#>>'{resumo,diferenca}') || ' quitados=' || jsonb_array_length(v_r#>'{resumo,quitados}');
  v_r := fn_conciliar_bloco(e_nelson_2, l_nelson_2, 'exato', true);
  v_out := v_out || E'\nS6 Nelson 2: ' || (v_r#>>'{resumo,soma_extratos}') || ' dif=' || (v_r#>>'{resumo,diferenca}') || ' quitados=' || jsonb_array_length(v_r#>'{resumo,quitados}');
  v_r := fn_conciliar_bloco(e_tc_2808, l_tc_vendas, 'mais_antigo_primeiro', true);
  v_out := v_out || E'\nS7 T Cortez 28/08: quitado=' || (v_r#>>'{resumo,quitados,0,descricao}') || ' | parcial=' || (v_r#>>'{resumo,parcial,descricao}')
    || ' aplicado=' || (v_r#>>'{resumo,parcial,aplicado}') || ' falta=' || (v_r#>>'{resumo,parcial,falta}');
  v_r := fn_conciliar_bloco(e_tc_0209, l_rec, 'exato', true);
  v_out := v_out || E'\nS8 T Cortez 02/09 x 3 recebiveis: dif=' || (v_r#>>'{resumo,diferenca}') || ' quitados=' || jsonb_array_length(v_r#>'{resumo,quitados}');
  v_out := v_out || E'\n   simular nao grava: blocos=' || (SELECT count(*) FROM conciliacao_blocos)
    || ' vinculos vivos nos 3 extratos do Emerson=' || (SELECT count(*) FROM conciliacao_bancaria_itens WHERE extrato_id = ANY(e_emerson_ago) AND desfeito_em IS NULL);

  -- ── R. recusas (motivo legivel, SQLSTATE CBLOC)
  BEGIN PERFORM fn_conciliar_bloco(e_tc_0209, l_rec[1:1], 'mais_antigo_primeiro', true);
  EXCEPTION WHEN SQLSTATE 'CBLOC' THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; v_out := v_out || E'\nR1 soma maior: ' || v_msg; END;
  BEGIN PERFORM fn_conciliar_bloco(ARRAY['57090556-c20c-4e76-ba4a-8eab5c6cdf49']::uuid[], l_nelson_1[1:2], 'mais_antigo_primeiro', true);
  EXCEPTION WHEN SQLSTATE 'CBLOC' THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; v_out := v_out || E'\nR2 extrato ja vinculado: ' || v_msg; END;
  -- extrato do BB SEM vinculo (27/07, -85,00) x um arranquio do Sicredi
  BEGIN PERFORM fn_conciliar_bloco(ARRAY['25750f06-3399-44b0-8770-a9649f7eb45f']::uuid[], l_emerson_ago[1:1], 'mais_antigo_primeiro', true);
  EXCEPTION WHEN SQLSTATE 'CBLOC' THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; v_out := v_out || E'\nR3 conta diferente: ' || v_msg; END;
  BEGIN
    INSERT INTO financeiro_fechamentos (cliente_id, fazenda_id, ano_mes, status_fechamento)
    SELECT cliente_id, fazenda_id, ano_mes, 'fechado' FROM financeiro_lancamentos_v2 WHERE id = l_emerson_ago[1];
    PERFORM fn_conciliar_bloco(e_emerson_ago, l_emerson_ago, 'exato', true);
  EXCEPTION WHEN SQLSTATE 'CBLOC' THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; v_out := v_out || E'\nR4 mes fechado: ' || v_msg; END;
  BEGIN PERFORM fn_conciliar_bloco(e_emerson_ago, l_emerson_ago[1:6], 'exato', true);
  EXCEPTION WHEN SQLSTATE 'CBLOC' THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; v_out := v_out || E'\nR5 exato com soma diferente: ' || v_msg; END;

  -- ── W. gravacao real + desfazer, conferido linha a linha (status, data, valor dos lancamentos; status dos extratos; vinculos vivos)
  SELECT jsonb_agg(jsonb_build_array(id, status_transacao, data_pagamento, valor) ORDER BY id) INTO v_antes
    FROM financeiro_lancamentos_v2 WHERE id = ANY(l_emerson_ago || l_tc_vendas);
  v_antes := jsonb_build_array(v_antes,
    (SELECT jsonb_agg(jsonb_build_array(id, status) ORDER BY id) FROM extrato_bancario_v2 WHERE id = ANY(e_emerson_ago || e_tc_2808)),
    (SELECT count(*) FROM conciliacao_bancaria_itens WHERE desfeito_em IS NULL AND (extrato_id = ANY(e_emerson_ago || e_tc_2808) OR lancamento_id = ANY(l_emerson_ago || l_tc_vendas))));

  v_r := fn_conciliar_bloco(e_emerson_ago, l_emerson_ago, 'exato', false);
  v_b := (v_r->>'bloco_id')::uuid;
  v_out := v_out || E'\nW1 gravado Emerson ago: vinculos=' || (SELECT count(*) FROM conciliacao_bancaria_itens WHERE grupo_id = v_b AND desfeito_em IS NULL)
    || ' tipo=' || (SELECT string_agg(DISTINCT tipo_aprovacao, ',') FROM conciliacao_bancaria_itens WHERE grupo_id = v_b)
    || ' lanc=' || (SELECT string_agg(DISTINCT status_transacao, ',') FROM financeiro_lancamentos_v2 WHERE id = ANY(l_emerson_ago))
    || ' pgto=' || (SELECT string_agg(DISTINCT data_pagamento::text, ',' ORDER BY data_pagamento::text) FROM financeiro_lancamentos_v2 WHERE id = ANY(l_emerson_ago))
    || ' extratos=' || (SELECT string_agg(DISTINCT status, ',') FROM extrato_bancario_v2 WHERE id = ANY(e_emerson_ago))
    || ' valores intactos=' || (SELECT bool_and(l.valor = (x->>3)::numeric) FROM financeiro_lancamentos_v2 l JOIN jsonb_array_elements(v_antes->0) x ON (x->>0)::uuid = l.id);
  v_r := fn_desfazer_bloco(v_b, 'teste do gesto contrario');
  v_out := v_out || E'\nW2 desfeito: ' || v_r::text;

  v_r := fn_conciliar_bloco(e_tc_2808, l_tc_vendas, 'mais_antigo_primeiro', false);
  v_b := (v_r->>'bloco_id')::uuid;
  v_out := v_out || E'\nW3 gravado T Cortez 28/08: ' || (SELECT string_agg(left(descricao, 22) || '=' || status_transacao || '/' || coalesce(data_pagamento::text, '-')
         || ' aplic=' || (SELECT sum(valor_aplicado) FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL), ' | ' ORDER BY descricao)
       FROM financeiro_lancamentos_v2 l WHERE id = ANY(l_tc_vendas))
    || ' extrato=' || (SELECT status FROM extrato_bancario_v2 WHERE id = e_tc_2808[1]);
  BEGIN PERFORM fn_desfazer_bloco(v_b, '');
  EXCEPTION WHEN SQLSTATE 'CBLOC' THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; v_out := v_out || E'\nR6 desfazer sem motivo: ' || v_msg; END;
  PERFORM fn_desfazer_bloco(v_b, 'teste do parcial');
  BEGIN PERFORM fn_desfazer_bloco(v_b, 'de novo');
  EXCEPTION WHEN SQLSTATE 'CBLOC' THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; v_out := v_out || E'\nR7 desfazer duas vezes: ' || left(v_msg, 40); END;

  SELECT jsonb_agg(jsonb_build_array(id, status_transacao, data_pagamento, valor) ORDER BY id) INTO v_depois
    FROM financeiro_lancamentos_v2 WHERE id = ANY(l_emerson_ago || l_tc_vendas);
  v_depois := jsonb_build_array(v_depois,
    (SELECT jsonb_agg(jsonb_build_array(id, status) ORDER BY id) FROM extrato_bancario_v2 WHERE id = ANY(e_emerson_ago || e_tc_2808)),
    (SELECT count(*) FROM conciliacao_bancaria_itens WHERE desfeito_em IS NULL AND (extrato_id = ANY(e_emerson_ago || e_tc_2808) OR lancamento_id = ANY(l_emerson_ago || l_tc_vendas))));
  v_out := v_out || E'\nW4 tudo volta: lancamentos=' || jsonb_array_length(v_antes->0) || ' extratos=' || jsonb_array_length(v_antes->1)
    || ' vinculos vivos antes=' || (v_antes->>2) || ' depois=' || (v_depois->>2) || ' | identico=' || (v_antes = v_depois)::text
    || ' | blocos desfeitos=' || (SELECT count(*) FROM conciliacao_blocos WHERE desfeito_em IS NOT NULL);

  RAISE EXCEPTION 'ENSAIO (rollback): %', v_out;
END
$teste$;
