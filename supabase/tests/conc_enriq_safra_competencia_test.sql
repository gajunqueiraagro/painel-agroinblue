-- PR-CONC-ENRIQ-SAFRA-COMPETENCIA — teste em ROLLBACK (termina em RAISE: nada fica gravado).
-- Roda DEPOIS da migration 20261027190700. Monta uma SESSAO SINTETICA no NJ (linhas novas de staging, criadas aqui e
-- desfeitas no RAISE) sobre lancamentos CRUS e um CLASSIFICADO escolhidos na hora, nenhum com linha em sessao viva. Chama a
-- precedencia so' nessa sessao e le' a view so' dela.
--   P1 pecuaria, cru, planilha 25/26-Pec, competencia 19/09/2026 -> topo 26/27-Pec; _planilha continua 25/26
--   P2 pecuaria, cru, competencia 30/06/2026 -> 25/26-Pec (o caso da Uniao, linha 16)
--   P3 lavoura, cru, planilha 25/26-Lav, competencia 15/09/2026 -> topo 25/26-Lav (nao troca); fora do periodo = true
--   P4 operador escolheu a safra a mao (linha manual) -> nao troca; fora do periodo = true
--   P5 par classificado -> topo sem safra (como hoje); colunas da view preenchidas
--   P6 competencia sem safra que a contenha (2019) -> fica a planilha, sem erro
--   P7 view: 116 colunas, as 2 novas no fim
DO $teste$
DECLARE
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  v_ses uuid := gen_random_uuid();
  v_falhas text[] := '{}'; v_ok text[] := '{}';
  s_pec2526 uuid; s_pec2627 uuid; s_lav2526 uuid;
  pc_pec record; pc_agri record;
  v_crus uuid[]; v_class uuid; v_class_esc text; v_class_comp date;
  r_id uuid[] := ARRAY[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v_p jsonb; v_v record; v_n int;
  pl_pec jsonb; pl_agri jsonb;
BEGIN
  SET LOCAL lock_timeout = '3s';
  SELECT id INTO s_pec2526 FROM financeiro_safras WHERE cliente_id = c_nj AND ativa AND codigo = '25/26-Pec';
  SELECT id INTO s_pec2627 FROM financeiro_safras WHERE cliente_id = c_nj AND ativa AND codigo = '26/27-Pec';
  SELECT id INTO s_lav2526 FROM financeiro_safras WHERE cliente_id = c_nj AND ativa AND codigo = '25/26-Lav';
  SELECT id, subcentro, macro_custo, grupo_custo, centro_custo INTO pc_pec FROM financeiro_plano_contas
   WHERE ativo AND escopo_negocio = 'pecuaria' AND tipo_operacao = '2-Saídas' AND (cliente_id IS NULL OR cliente_id = c_nj)
   ORDER BY ordem_exibicao LIMIT 1;
  SELECT id, subcentro, macro_custo, grupo_custo, centro_custo INTO pc_agri FROM financeiro_plano_contas
   WHERE ativo AND escopo_negocio = 'agricultura' AND tipo_operacao = '2-Saídas' AND (cliente_id IS NULL OR cliente_id = c_nj)
   ORDER BY ordem_exibicao LIMIT 1;
  -- lancamentos CRUS do NJ sem linha em staging nenhuma (ninguem os esta' revisando)
  SELECT array_agg(id) INTO v_crus FROM (
    SELECT l.id FROM financeiro_lancamentos_v2 l
     WHERE l.cliente_id = c_nj AND NOT l.cancelado AND l.origem_lancamento IN ('extrato', 'ofx') AND l.subcentro IS NULL
       AND l.plano_conta_id IS NULL AND COALESCE(l.tipo_operacao, '') NOT LIKE '3-%'
       AND l.data_competencia >= '2026-07-01'   -- P4 le' a competencia do lancamento: tem de cair na 26/27
       AND NOT EXISTS (SELECT 1 FROM financeiro_classificacao_staging s WHERE s.match_lancamento_id = l.id)
     ORDER BY l.id LIMIT 5) x;
  -- um CLASSIFICADO de pecuaria sem linha em staging
  SELECT l.id, pc.escopo_negocio, l.data_competencia INTO v_class, v_class_esc, v_class_comp
    FROM financeiro_lancamentos_v2 l JOIN financeiro_plano_contas pc ON pc.id = l.plano_conta_id
   WHERE l.cliente_id = c_nj AND NOT l.cancelado AND pc.escopo_negocio = 'pecuaria' AND l.data_competencia >= '2025-07-01'
     AND NOT EXISTS (SELECT 1 FROM financeiro_classificacao_staging s WHERE s.match_lancamento_id = l.id)
   ORDER BY l.id LIMIT 1;
  IF s_pec2526 IS NULL OR s_pec2627 IS NULL OR s_lav2526 IS NULL OR pc_pec.id IS NULL OR pc_agri.id IS NULL
     OR COALESCE(array_length(v_crus, 1), 0) < 5 OR v_class IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK teste PR-CONC-ENRIQ-SAFRA-COMPETENCIA: HA FALHA — o cenario nao se monta (safras/planos/lancamentos)';
  END IF;
  pl_pec := jsonb_build_object('subcentro', pc_pec.subcentro, 'macro_custo', pc_pec.macro_custo, 'grupo_custo', pc_pec.grupo_custo,
    'centro_custo', pc_pec.centro_custo, 'plano_conta_id', pc_pec.id::text, 'safra_id', s_pec2526::text);
  pl_agri := jsonb_build_object('subcentro', pc_agri.subcentro, 'macro_custo', pc_agri.macro_custo, 'grupo_custo', pc_agri.grupo_custo,
    'centro_custo', pc_agri.centro_custo, 'plano_conta_id', pc_agri.id::text, 'safra_id', s_lav2526::text);

  INSERT INTO financeiro_classificacao_staging (staging_id, sessao_id, cliente_id, match_status, excel_linha_origem, excel_data,
                                                match_lancamento_id, update_proposto)
  VALUES
    (r_id[1], v_ses, c_nj, 'divergente', 1, '2026-09-19', v_crus[1], jsonb_build_object('_planilha', pl_pec)),
    (r_id[2], v_ses, c_nj, 'divergente', 2, '2026-06-30', v_crus[2], jsonb_build_object('_planilha', pl_pec)),
    (r_id[3], v_ses, c_nj, 'divergente', 3, '2026-09-15', v_crus[3], jsonb_build_object('_planilha', pl_agri)),
    (r_id[4], v_ses, c_nj, 'divergente', 4, '2026-09-19', v_crus[4], pl_pec || jsonb_build_object('_planilha', pl_pec,
       '_meta', jsonb_build_object('origem_resolucao', 'manual', 'tier', 'manual', 'motor_version', 1))),
    (r_id[5], v_ses, c_nj, 'divergente', 5, v_class_comp, v_class, jsonb_build_object('_planilha', pl_pec)),
    (r_id[6], v_ses, c_nj, 'divergente', 6, '2019-01-15', v_crus[5], jsonb_build_object('_planilha', pl_pec));

  PERFORM public._fn_classificacao_precedencia_cru(v_ses);

  -- P1
  SELECT update_proposto INTO v_p FROM financeiro_classificacao_staging WHERE staging_id = r_id[1];
  IF v_p->>'safra_id' IS DISTINCT FROM s_pec2627::text THEN v_falhas := v_falhas || format('P1: topo %s, esperado 26/27-Pec', v_p->>'safra_id');
  ELSIF v_p->'_planilha'->>'safra_id' IS DISTINCT FROM s_pec2526::text THEN v_falhas := v_falhas || 'P1: _planilha perdeu a 25/26'::text;
  ELSE v_ok := v_ok || 'P1'::text; END IF;
  -- P2
  SELECT update_proposto INTO v_p FROM financeiro_classificacao_staging WHERE staging_id = r_id[2];
  IF v_p->>'safra_id' IS DISTINCT FROM s_pec2526::text THEN v_falhas := v_falhas || format('P2: topo %s, esperado 25/26-Pec', v_p->>'safra_id');
  ELSE v_ok := v_ok || 'P2'::text; END IF;
  -- P3
  SELECT update_proposto INTO v_p FROM financeiro_classificacao_staging WHERE staging_id = r_id[3];
  SELECT * INTO v_v FROM vw_classificacao_staging_preview WHERE staging_id = r_id[3];
  IF v_p->>'safra_id' IS DISTINCT FROM s_lav2526::text THEN v_falhas := v_falhas || format('P3: a lavoura trocou de safra (%s)', v_p->>'safra_id');
  ELSIF v_v.safra_fora_do_periodo IS DISTINCT FROM true THEN v_falhas := v_falhas || format('P3: fora do periodo = %s', v_v.safra_fora_do_periodo);
  ELSE v_ok := v_ok || 'P3'::text; END IF;
  -- P4
  SELECT update_proposto INTO v_p FROM financeiro_classificacao_staging WHERE staging_id = r_id[4];
  SELECT * INTO v_v FROM vw_classificacao_staging_preview WHERE staging_id = r_id[4];
  IF v_p->>'safra_id' IS DISTINCT FROM s_pec2526::text THEN v_falhas := v_falhas || format('P4: a escolha manual foi trocada (%s)', v_p->>'safra_id');
  ELSIF v_v.safra_fora_do_periodo IS DISTINCT FROM true OR v_v.safra_da_competencia_id IS DISTINCT FROM s_pec2627 THEN
    v_falhas := v_falhas || format('P4: aviso errado (fora %s, competencia %s)', v_v.safra_fora_do_periodo, v_v.safra_da_competencia_id);
  ELSE v_ok := v_ok || 'P4'::text; END IF;
  -- P5
  SELECT update_proposto INTO v_p FROM financeiro_classificacao_staging WHERE staging_id = r_id[5];
  SELECT * INTO v_v FROM vw_classificacao_staging_preview WHERE staging_id = r_id[5];
  IF v_p ? 'safra_id' THEN v_falhas := v_falhas || format('P5: o classificado ganhou safra no topo (%s)', v_p->>'safra_id');
  ELSIF v_v.safra_da_competencia_id IS DISTINCT FROM public._fn_safra_da_competencia(c_nj, v_class_esc, v_class_comp) OR v_v.safra_da_competencia_id IS NULL THEN
    v_falhas := v_falhas || format('P5: coluna da view errada (%s)', v_v.safra_da_competencia_id);
  ELSE v_ok := v_ok || format('P5 (fora do periodo = %s)', COALESCE(v_v.safra_fora_do_periodo::text, 'NULO')); END IF;
  -- P6
  SELECT update_proposto INTO v_p FROM financeiro_classificacao_staging WHERE staging_id = r_id[6];
  SELECT * INTO v_v FROM vw_classificacao_staging_preview WHERE staging_id = r_id[6];
  IF v_p->>'safra_id' IS DISTINCT FROM s_pec2526::text THEN v_falhas := v_falhas || format('P6: sem candidata, o topo devia ficar com a planilha (%s)', v_p->>'safra_id');
  ELSIF v_v.safra_da_competencia_id IS NOT NULL THEN v_falhas := v_falhas || 'P6: a view inventou safra para 2019'::text;
  ELSE v_ok := v_ok || 'P6'::text; END IF;
  -- P7
  SELECT count(*) INTO v_n FROM pg_attribute WHERE attrelid = 'public.vw_classificacao_staging_preview'::regclass AND attnum > 0 AND NOT attisdropped;
  IF v_n <> 116
     OR (SELECT attname FROM pg_attribute WHERE attrelid = 'public.vw_classificacao_staging_preview'::regclass AND attnum = 115) <> 'safra_da_competencia_id'
     OR (SELECT attname FROM pg_attribute WHERE attrelid = 'public.vw_classificacao_staging_preview'::regclass AND attnum = 116) <> 'safra_fora_do_periodo' THEN
    v_falhas := v_falhas || format('P7: a view tem %s colunas ou as novas nao estao no fim', v_n);
  ELSE v_ok := v_ok || 'P7 (116 colunas)'::text; END IF;

  IF array_length(v_falhas, 1) IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK teste PR-CONC-ENRIQ-SAFRA-COMPETENCIA: TODOS OK — %', array_to_string(v_ok, ' | ');
  ELSE
    RAISE EXCEPTION 'ROLLBACK teste PR-CONC-ENRIQ-SAFRA-COMPETENCIA: HA FALHA — % || ok: %',
      array_to_string(v_falhas, ' | '), array_to_string(v_ok, ' | ');
  END IF;
END $teste$;
