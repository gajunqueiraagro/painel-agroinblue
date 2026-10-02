-- PR-CONC-ENRIQ-PROPOSTA-PAR-MUDOU — teste em ROLLBACK (termina em RAISE: nada fica gravado).
-- Roda DEPOIS da migration 20261027190900. Duas SESSOES SINTETICAS no NJ, criadas aqui e desfeitas no RAISE, sobre lancamentos
-- escolhidos na hora (nenhum com linha em sessao viva). Na primeira, a troca de par e' SIMULADA como o casar a faz (novo
-- `match_lancamento_id` + `casamento_meta.par_mudou_em = now()`) e a precedencia roda; a segunda (P10) usa o Recasar de verdade.
--   P1  linha 16 ANTIGA (manual, sem lista): classificado, topo vazio -> Recasar p/ cru -> topo ganha plano, fazenda, safra,
--       fornecedor, documento e competencia da planilha; deixa de ser manual
--   P2  linha nova (com lista): o operador edita UMA chave no cru -> Recasar p/ classificado -> so' a chave dele fica no topo
--   P3  cru -> Recasar p/ OUTRO cru -> topo = planilha; a edicao do operador fica
--   P4  o operador ESVAZIA o fornecedor -> Recasar p/ cru -> o fornecedor continua vazio
--   P5  o operador confirma o MESMO valor da regra -> Recasar p/ classificado -> a chave fica
--   P6  alinhamento da linha gravada + uma edicao -> Reverter -> Recasar p/ cru: so' a chave editada fica; as do lancamento
--       antigo (data de pagamento, conta, plano) NAO
--   P7  sugestao ("_sugestao": true): nao entra na lista, nao e' gravada como chave; depois da troca e' recalculada
--   P8  linha manual cujo par NAO mudou: proposta identica (md5) antes e depois
--   P9  linha nao manual sem troca: a regra de sempre (planilha no cru), idempotente
--   P10 o Recasar marca `par_anterior`/`par_mudou_em` so' na linha cujo par mudou
--   P11 pecuaria, par novo cru, competencia fora da safra da planilha -> safra pela competencia
DO $teste$
DECLARE
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  v_ses uuid := gen_random_uuid(); v_ses2 uuid := gen_random_uuid();
  v_falhas text[] := '{}'; v_ok text[] := '{}';
  s_pec2526 uuid; s_pec2627 uuid; pc record; v_faz uuid; v_forn uuid;
  v_crus uuid[]; k1 record; c3 record; c4 record;
  r uuid[] := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
                    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  ra uuid := gen_random_uuid(); rb uuid := gen_random_uuid();
  pl jsonb; v_p jsonb; v_s financeiro_classificacao_staging%ROWTYPE; v_res jsonb; v_md5 text; v_keys text[];
BEGIN
  SET LOCAL lock_timeout = '3s';
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  SELECT id INTO s_pec2526 FROM financeiro_safras WHERE cliente_id = c_nj AND ativa AND codigo = '25/26-Pec';
  SELECT id INTO s_pec2627 FROM financeiro_safras WHERE cliente_id = c_nj AND ativa AND codigo = '26/27-Pec';
  SELECT id, subcentro, macro_custo, grupo_custo, centro_custo INTO pc FROM financeiro_plano_contas
   WHERE ativo AND escopo_negocio = 'pecuaria' AND tipo_operacao = '2-Saídas' AND (cliente_id IS NULL OR cliente_id = c_nj)
   ORDER BY ordem_exibicao LIMIT 1;
  SELECT id INTO v_faz FROM fazendas WHERE cliente_id = c_nj AND nome NOT ILIKE '%administrat%' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_forn FROM financeiro_fornecedores WHERE cliente_id = c_nj AND ativo ORDER BY created_at LIMIT 1;
  SELECT array_agg(id) INTO v_crus FROM (
    SELECT l.id FROM financeiro_lancamentos_v2 l
     WHERE l.cliente_id = c_nj AND NOT l.cancelado AND l.origem_lancamento IN ('extrato', 'ofx') AND l.subcentro IS NULL
       AND l.plano_conta_id IS NULL AND COALESCE(l.tipo_operacao, '') NOT LIKE '3-%'
       AND NOT EXISTS (SELECT 1 FROM financeiro_classificacao_staging s WHERE s.match_lancamento_id = l.id)
     ORDER BY l.id LIMIT 2) x;
  -- um CLASSIFICADO de pecuaria com plano diferente do da planilha, pago, com conta (para o P6 ver o vazamento)
  SELECT l.id, l.subcentro, l.data_pagamento, l.conta_bancaria_id INTO k1
    FROM financeiro_lancamentos_v2 l JOIN financeiro_plano_contas p ON p.id = l.plano_conta_id
   WHERE l.cliente_id = c_nj AND NOT l.cancelado AND p.escopo_negocio = 'pecuaria' AND l.subcentro <> pc.subcentro
     AND l.data_pagamento IS NOT NULL AND l.conta_bancaria_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM financeiro_classificacao_staging s WHERE s.match_lancamento_id = l.id)
   ORDER BY l.id LIMIT 1;
  IF s_pec2526 IS NULL OR s_pec2627 IS NULL OR pc.id IS NULL OR v_faz IS NULL OR v_forn IS NULL
     OR COALESCE(array_length(v_crus, 1), 0) < 2 OR k1.id IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK teste PR-CONC-ENRIQ-PROPOSTA-PAR-MUDOU: HA FALHA — o cenario nao se monta';
  END IF;
  pl := jsonb_build_object('subcentro', pc.subcentro, 'macro_custo', pc.macro_custo, 'grupo_custo', pc.grupo_custo,
    'centro_custo', pc.centro_custo, 'plano_conta_id', pc.id::text, 'safra_id', s_pec2526::text,
    'fazenda_id', v_faz::text, 'favorecido_id', v_forn::text);

  -- r1: a linha 16 ANTIGA (manual sem lista, topo vazio, par classificado)
  -- r2..r5, r7..r9: linhas no CRU c1 (a precedencia monta o topo); r6: gravada no classificado k1
  INSERT INTO financeiro_classificacao_staging (staging_id, sessao_id, cliente_id, match_status, excel_linha_origem, excel_data,
                                                excel_documento, excel_produto, match_lancamento_id, update_proposto, update_proposto_original)
  VALUES
    (r[1], v_ses, c_nj, 'divergente', 1, '2026-06-30', '116396', 'Parcela 3', k1.id,
       jsonb_build_object('_planilha', pl, '_meta', jsonb_build_object('origem_resolucao', 'manual', 'tier', 'manual', 'motor_version', 1)),
       jsonb_build_object('_planilha', pl, '_meta', jsonb_build_object('origem_resolucao', 'alias', 'tier', 'alias', 'motor_version', 1))),
    (r[2], v_ses, c_nj, 'divergente', 2, '2026-09-19', 'DOC-2', 'Prod 2', v_crus[1], jsonb_build_object('_planilha', pl), NULL),
    (r[3], v_ses, c_nj, 'divergente', 3, '2026-09-19', 'DOC-3', 'Prod 3', v_crus[1], jsonb_build_object('_planilha', pl), NULL),
    (r[4], v_ses, c_nj, 'divergente', 4, '2026-09-19', 'DOC-4', 'Prod 4', v_crus[1], jsonb_build_object('_planilha', pl), NULL),
    (r[5], v_ses, c_nj, 'divergente', 5, '2026-09-19', 'DOC-5', 'Prod 5', v_crus[1], jsonb_build_object('_planilha', pl), NULL),
    (r[6], v_ses, c_nj, 'divergente', 6, '2026-09-19', 'DOC-6', 'Prod 6', k1.id, jsonb_build_object('_planilha', pl), NULL),
    (r[7], v_ses, c_nj, 'divergente', 7, '2026-09-19', 'DOC-7', 'Prod 7', v_crus[1], jsonb_build_object('_planilha', pl), NULL),
    (r[8], v_ses, c_nj, 'divergente', 8, '2026-09-19', 'DOC-8', 'Prod 8', v_crus[1], jsonb_build_object('_planilha', pl), NULL),
    (r[9], v_ses, c_nj, 'divergente', 9, '2026-09-19', 'DOC-9', 'Prod 9', v_crus[1], jsonb_build_object('_planilha', pl), NULL);
  -- r6 esta' GRAVADA (para o editar alinhar ao lancamento k1)
  UPDATE financeiro_classificacao_staging SET aplicado = true, aplicado_em = now() - interval '1 hour', estado_anterior = '{}'::jsonb
   WHERE staging_id = r[6];
  PERFORM public._fn_classificacao_precedencia_cru(v_ses);   -- o topo das linhas no cru (o de sempre)

  -- as edicoes do operador
  PERFORM public.fn_classificacao_editar_proposto(r[2], '{"numero_documento":"P2-OP"}'::jsonb);
  PERFORM public.fn_classificacao_editar_proposto(r[3], '{"observacao":"P3-OP"}'::jsonb);
  PERFORM public.fn_classificacao_editar_proposto(r[4], '{"favorecido_id":null}'::jsonb);
  PERFORM public.fn_classificacao_editar_proposto(r[5], jsonb_build_object('fazenda_id', v_faz));
  PERFORM public.fn_classificacao_editar_proposto(r[6], '{"numero_documento":"P6-OP"}'::jsonb);
  v_res := public.fn_classificacao_editar_proposto(r[7], jsonb_build_object('safra_id', s_pec2526, '_sugestao', true));
  PERFORM public.fn_classificacao_editar_proposto(r[8], '{"observacao":"P8-OP"}'::jsonb);
  -- P7 (antes da troca): a sugestao nao entra na lista e "_sugestao" nao vira chave
  SELECT update_proposto INTO v_p FROM financeiro_classificacao_staging WHERE staging_id = r[7];
  IF v_p ? '_sugestao' OR jsonb_array_length(COALESCE(v_p -> '_meta' -> 'chaves_do_operador', '[]')) <> 0
     OR v_res -> 'campos_rejeitados' ? '_sugestao' THEN
    v_falhas := v_falhas || ('P7: a sugestao vazou: ' || v_p::text);
  END IF;
  -- P6 (antes da troca): o alinhamento trouxe o lancamento k1 para o topo, e a lista tem SO' o documento
  SELECT update_proposto INTO v_p FROM financeiro_classificacao_staging WHERE staging_id = r[6];
  IF v_p->>'data_pagamento' IS DISTINCT FROM k1.data_pagamento::text OR v_p -> '_meta' -> 'chaves_do_operador' <> '["numero_documento"]'::jsonb THEN
    v_falhas := v_falhas || ('P6: o alinhamento/lista nao ficaram como esperado: ' || v_p::text);
  END IF;
  -- "Reverter" do r6 (o que o reverter_row faz no staging)
  UPDATE financeiro_classificacao_staging SET aplicado = false, aplicado_em = NULL, estado_anterior = NULL WHERE staging_id = r[6];
  -- P8: a foto antes
  SELECT md5(update_proposto::text) INTO v_md5 FROM financeiro_classificacao_staging WHERE staging_id = r[8];

  -- a TROCA DE PAR, como o casar a faz (r8 e r9 NAO trocam)
  UPDATE financeiro_classificacao_staging s
     SET match_lancamento_id = CASE s.staging_id WHEN r[1] THEN v_crus[1] WHEN r[2] THEN k1.id WHEN r[3] THEN v_crus[2]
                                                 WHEN r[4] THEN v_crus[2] WHEN r[5] THEN k1.id WHEN r[6] THEN v_crus[1]
                                                 WHEN r[7] THEN v_crus[2] END,
         casamento_meta = jsonb_build_object('par_anterior', s.match_lancamento_id, 'par_mudou_em', now())
   WHERE s.staging_id = ANY (r[1:7]);
  PERFORM public._fn_classificacao_precedencia_cru(v_ses);

  -- P1
  SELECT * INTO v_s FROM financeiro_classificacao_staging WHERE staging_id = r[1];
  IF v_s.update_proposto->>'plano_conta_id' IS DISTINCT FROM pc.id::text OR v_s.update_proposto->>'fazenda_id' IS DISTINCT FROM v_faz::text
     OR v_s.update_proposto->>'safra_id' IS DISTINCT FROM s_pec2526::text OR v_s.update_proposto->>'favorecido_id' IS DISTINCT FROM v_forn::text
     OR v_s.update_proposto->>'numero_documento' IS DISTINCT FROM '116396' OR v_s.update_proposto->>'data_competencia' IS DISTINCT FROM '2026-06-30' THEN
    v_falhas := v_falhas || ('P1: o topo nao veio da planilha: ' || (v_s.update_proposto - '_planilha')::text);
  ELSIF v_s.update_proposto->'_meta'->>'origem_resolucao' = 'manual' THEN
    v_falhas := v_falhas || 'P1: sem chave do operador, a linha devia deixar de ser manual'::text;
  ELSIF v_s.update_proposto_original->>'plano_conta_id' IS DISTINCT FROM pc.id::text THEN
    v_falhas := v_falhas || 'P1: o original nao passou a ser o da regra para o par novo'::text;
  ELSE v_ok := v_ok || 'P1'::text; END IF;
  -- P2
  SELECT * INTO v_s FROM financeiro_classificacao_staging WHERE staging_id = r[2];
  v_keys := ARRAY(SELECT k FROM jsonb_object_keys(v_s.update_proposto) k WHERE k NOT IN ('_planilha', '_meta') ORDER BY k);
  IF v_keys <> ARRAY['numero_documento'] OR v_s.update_proposto->>'numero_documento' <> 'P2-OP' THEN
    v_falhas := v_falhas || ('P2: o topo do classificado devia ter so a chave do operador: ' || array_to_string(v_keys, ','));
  ELSE v_ok := v_ok || 'P2'::text; END IF;
  -- P3 + P11
  SELECT * INTO v_s FROM financeiro_classificacao_staging WHERE staging_id = r[3];
  IF v_s.update_proposto->>'observacao' IS DISTINCT FROM 'P3-OP' OR v_s.update_proposto->>'plano_conta_id' IS DISTINCT FROM pc.id::text
     OR v_s.update_proposto->>'numero_documento' IS DISTINCT FROM 'DOC-3' THEN
    v_falhas := v_falhas || ('P3: ' || (v_s.update_proposto - '_planilha')::text);
  ELSE v_ok := v_ok || 'P3'::text; END IF;
  IF v_s.update_proposto->>'safra_id' IS DISTINCT FROM s_pec2627::text THEN
    v_falhas := v_falhas || format('P11: a safra devia ser a da competencia (26/27-Pec), veio %s', v_s.update_proposto->>'safra_id');
  ELSE v_ok := v_ok || 'P11'::text; END IF;
  -- P4
  SELECT * INTO v_s FROM financeiro_classificacao_staging WHERE staging_id = r[4];
  IF v_s.update_proposto ? 'favorecido_id' OR v_s.update_proposto->>'plano_conta_id' IS DISTINCT FROM pc.id::text THEN
    v_falhas := v_falhas || ('P4: o fornecedor esvaziado voltou: ' || (v_s.update_proposto - '_planilha')::text);
  ELSE v_ok := v_ok || 'P4'::text; END IF;
  -- P5
  SELECT * INTO v_s FROM financeiro_classificacao_staging WHERE staging_id = r[5];
  v_keys := ARRAY(SELECT k FROM jsonb_object_keys(v_s.update_proposto) k WHERE k NOT IN ('_planilha', '_meta') ORDER BY k);
  IF v_keys <> ARRAY['fazenda_id'] OR v_s.update_proposto->>'fazenda_id' <> v_faz::text THEN
    v_falhas := v_falhas || ('P5: a confirmacao do operador sumiu: ' || array_to_string(v_keys, ','));
  ELSE v_ok := v_ok || 'P5'::text; END IF;
  -- P6
  SELECT * INTO v_s FROM financeiro_classificacao_staging WHERE staging_id = r[6];
  IF v_s.update_proposto->>'numero_documento' IS DISTINCT FROM 'P6-OP' OR v_s.update_proposto ? 'data_pagamento'
     OR v_s.update_proposto ? 'conta_bancaria_id' OR v_s.update_proposto->>'subcentro' IS DISTINCT FROM pc.subcentro THEN
    v_falhas := v_falhas || ('P6: sobrou do lancamento antigo: ' || (v_s.update_proposto - '_planilha')::text);
  ELSE v_ok := v_ok || 'P6'::text; END IF;
  -- P7 (depois da troca): a safra foi recalculada (a da competencia), nao a sugerida
  SELECT * INTO v_s FROM financeiro_classificacao_staging WHERE staging_id = r[7];
  IF v_s.update_proposto->>'safra_id' IS DISTINCT FROM s_pec2627::text OR v_s.update_proposto->'_meta'->>'origem_resolucao' = 'manual' THEN
    v_falhas := v_falhas || ('P7: a sugestao ficou como se fosse do operador: ' || (v_s.update_proposto - '_planilha')::text);
  ELSE v_ok := v_ok || 'P7'::text; END IF;
  -- P8
  IF (SELECT md5(update_proposto::text) FROM financeiro_classificacao_staging WHERE staging_id = r[8]) IS DISTINCT FROM v_md5 THEN
    v_falhas := v_falhas || 'P8: a linha manual sem troca mudou'::text;
  ELSE v_ok := v_ok || 'P8'::text; END IF;
  -- P9: a regra de sempre, e idempotente
  SELECT * INTO v_s FROM financeiro_classificacao_staging WHERE staging_id = r[9];
  v_md5 := md5(v_s.update_proposto::text);
  PERFORM public._fn_classificacao_precedencia_cru(v_ses);
  IF v_s.update_proposto->>'plano_conta_id' IS DISTINCT FROM pc.id::text OR v_s.update_proposto->>'numero_documento' IS DISTINCT FROM 'DOC-9'
     OR v_s.update_proposto->>'safra_id' IS DISTINCT FROM s_pec2627::text
     OR (SELECT md5(update_proposto::text) FROM financeiro_classificacao_staging WHERE staging_id = r[9]) IS DISTINCT FROM v_md5 THEN
    v_falhas := v_falhas || ('P9: ' || (v_s.update_proposto - '_planilha')::text);
  ELSE v_ok := v_ok || 'P9'::text; END IF;

  -- P10: o Recasar de verdade numa segunda sessao (ra: sem par -> par; rb: o mesmo par de antes)
  SELECT l.id, l.valor, l.data_pagamento, l.conta_bancaria_id INTO c3 FROM financeiro_lancamentos_v2 l
   WHERE l.cliente_id = c_nj AND NOT l.cancelado AND l.sinal = '-1' AND l.data_pagamento IS NOT NULL AND l.conta_bancaria_id IS NOT NULL
     AND l.sem_movimentacao_caixa IS NOT TRUE AND l.tipo_operacao IS NOT NULL AND l.tipo_operacao NOT LIKE '3-%' AND COALESCE(l.cenario, 'realizado') <> 'meta'
     AND COALESCE(l.subcentro, '') NOT IN ('Pagamento Estornado', 'Estorno Recebido')
     AND NOT EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 o WHERE o.cliente_id = l.cliente_id AND o.id <> l.id AND NOT o.cancelado
                       AND o.conta_bancaria_id = l.conta_bancaria_id AND round(o.valor, 2) = round(l.valor, 2) AND o.data_pagamento = l.data_pagamento)
   ORDER BY l.data_pagamento DESC, l.id LIMIT 1;
  SELECT l.id, l.valor, l.data_pagamento, l.conta_bancaria_id INTO c4 FROM financeiro_lancamentos_v2 l
   WHERE l.cliente_id = c_nj AND NOT l.cancelado AND l.sinal = '-1' AND l.data_pagamento IS NOT NULL AND l.conta_bancaria_id IS NOT NULL
     AND l.id <> c3.id AND l.sem_movimentacao_caixa IS NOT TRUE AND l.tipo_operacao IS NOT NULL AND l.tipo_operacao NOT LIKE '3-%'
     AND COALESCE(l.cenario, 'realizado') <> 'meta' AND COALESCE(l.subcentro, '') NOT IN ('Pagamento Estornado', 'Estorno Recebido')
     AND NOT EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 o WHERE o.cliente_id = l.cliente_id AND o.id <> l.id AND NOT o.cancelado
                       AND o.conta_bancaria_id = l.conta_bancaria_id AND round(o.valor, 2) = round(l.valor, 2) AND o.data_pagamento = l.data_pagamento)
   ORDER BY l.data_pagamento DESC, l.id LIMIT 1;
  INSERT INTO financeiro_classificacao_staging (staging_id, sessao_id, cliente_id, match_status, excel_linha_origem, excel_valor,
                                                excel_data_pagamento, excel_data, excel_tipo_operacao, conta_origem_id, match_lancamento_id, update_proposto)
  VALUES (ra, v_ses2, c_nj, 'sem_match', 1, c3.valor, c3.data_pagamento, c3.data_pagamento, '2-Saídas', c3.conta_bancaria_id, NULL, '{}'::jsonb),
         (rb, v_ses2, c_nj, 'divergente', 2, c4.valor, c4.data_pagamento, c4.data_pagamento, '2-Saídas', c4.conta_bancaria_id, c4.id, '{}'::jsonb);
  PERFORM public.fn_classificacao_casar_sessao(v_ses2, to_char(c3.data_pagamento, 'YYYY-MM'));
  SELECT * INTO v_s FROM financeiro_classificacao_staging WHERE staging_id = ra;
  IF v_s.match_lancamento_id IS DISTINCT FROM c3.id OR NOT (v_s.casamento_meta ? 'par_mudou_em')
     OR v_s.casamento_meta -> 'par_anterior' <> 'null'::jsonb THEN
    v_falhas := v_falhas || ('P10: a linha que ganhou par nao foi marcada: ' || COALESCE(v_s.casamento_meta::text, 'NULO')
                             || ' par ' || COALESCE(v_s.match_lancamento_id::text, 'NULO'));
  ELSE
    SELECT * INTO v_s FROM financeiro_classificacao_staging WHERE staging_id = rb;
    IF v_s.match_lancamento_id IS DISTINCT FROM c4.id OR v_s.casamento_meta ? 'par_mudou_em' THEN
      v_falhas := v_falhas || ('P10: a linha que manteve o par foi marcada: ' || COALESCE(v_s.casamento_meta::text, 'NULO'));
    ELSE v_ok := v_ok || 'P10'::text; END IF;
  END IF;

  IF array_length(v_falhas, 1) IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK teste PR-CONC-ENRIQ-PROPOSTA-PAR-MUDOU: TODOS OK — %', array_to_string(v_ok, ' | ');
  ELSE
    RAISE EXCEPTION 'ROLLBACK teste PR-CONC-ENRIQ-PROPOSTA-PAR-MUDOU: HA FALHA — % || ok: %',
      array_to_string(v_falhas, ' | '), array_to_string(v_ok, ' | ');
  END IF;
END $teste$;
