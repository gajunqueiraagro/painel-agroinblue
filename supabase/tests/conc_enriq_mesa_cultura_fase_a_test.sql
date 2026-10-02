-- PR-CONC-ENRIQ-MESA-CULTURA-FASE-A — cultura e fase na Mesa do Enriquecer (banco). Roda DEPOIS da migration
-- 20261027190500, na mesma transacao. Termina em RAISE: nada persiste.
-- Canal de escrita, como o admin 7bd0b6ad (request.jwt.claims). Lancamentos REAIS do NJ; as linhas de staging dos casos
-- nascem AQUI, numa sessao de teste (P3-P6), ou na 8d6efeb7 como o teste do split ja' fazia (P7).
-- P1 gatilho: cultura em pecuaria vira NULL; fase em agricultura vira NULL; coerentes ficam.
-- P2 editar_proposto: cultura/fase validas entram; fora da lista e' recusada; vazio limpa.
-- P3 cru de lavoura com a Safra "Mandioca 2025/2026": a precedencia deriva a cultura, sobe a' proposta e o apply a grava
--    (o cru e' escolhido NA HORA: em 02/10 o faf8537b foi classificado pelo operador no meio do ensaio).
-- P4 classificado com cultura (amendoim) e a planilha dizendo mandioca: a proposta nao a leva e o apply mantem amendoim.
-- P5 pecuaria: fase proposta e' gravada; sem proposta, a fase existente nao se apaga.
-- P6 reverter devolve a fase; estado_anterior antigo (sem as chaves) nao mexe nas duas colunas.
-- P7 split copia cultura e fase para os filhos (COALESCE(proposta, consolidado)).
-- P8 a derivacao da Safra: uma cultura so', palavra inteira, so' em safra de agricultura.
-- P9 a view: as 107 colunas antigas na mesma ordem (md5 dos nomes) e as 5 novas no fim.
DO $teste$
DECLARE
  c_ses  constant uuid := '8d6efeb7-7c62-4a1f-bcca-32e14a386fc2';
  c_lav  constant uuid := '55d99920-add0-4091-b1a7-0b0ce3faaedb';   -- Safra 25/26 Lavoura
  c_pec  constant uuid := '5f5edcdd-a508-4714-9694-e35e4c47ad37';   -- Safra 25/26 Pecuaria
  c_pec2 constant uuid := '10bc22fb-b44a-4d8f-9a4b-870875122352';   -- Safra 26/27 Pecuaria
  c_amd  constant uuid := '193bb8e9-4bab-48a2-9dbc-d2d14fe71ced';   -- agricultura, cultura amendoim
  c_cria constant uuid := 'ac75edc5-ed21-469e-aba8-d9ccaaba3d95';   -- pecuaria, fase cria
  c_agri constant uuid := 'ab0ea1b2-879c-4a9f-95fd-69511f524d33';   -- agricultura sem cultura
  c_split constant uuid := 'c743bf98-fc9a-4ef0-9ea8-6dd4578462b6';  -- o caso do teste do split (4.007,42, 1 extrato)
  c_fert constant uuid := '017b19a5-5ed2-4868-b569-ce1c799499ad';   -- Fertilizantes Agricultura
  c_nutr constant uuid := 'cf26e258-b001-44a7-990d-c981f457e982';   -- Nutricao (pecuaria)
  v_cli uuid; v_s uuid := gen_random_uuid(); v_out text := ''; v_ok boolean := true;
  v_r jsonb; v_t text; v_t2 text; v_stg uuid; v_stg2 uuid; v_stg3 uuid; v_stg4 uuid; v_stg5 uuid; v_base uuid;
  v_fert jsonb; v_nutr jsonb; v_ids uuid[]; n int;
  c_cru uuid;   -- um cru VIVO na hora do teste (o operador classifica crus durante o dia: id fixo envelhece)
BEGIN
  PERFORM set_config('statement_timeout', '120s', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', true);
  SELECT cliente_id INTO v_cli FROM financeiro_classificacao_staging WHERE sessao_id = c_ses LIMIT 1;
  SELECT jsonb_build_object('subcentro', subcentro, 'macro_custo', macro_custo, 'grupo_custo', grupo_custo, 'centro_custo', centro_custo,
                            'plano_conta_id', id::text) INTO v_fert FROM financeiro_plano_contas WHERE id = c_fert;
  SELECT jsonb_build_object('subcentro', subcentro, 'macro_custo', macro_custo, 'grupo_custo', grupo_custo, 'centro_custo', centro_custo,
                            'plano_conta_id', id::text) INTO v_nutr FROM financeiro_plano_contas WHERE id = c_nutr;
  SELECT staging_id INTO v_base FROM financeiro_classificacao_staging WHERE sessao_id = c_ses LIMIT 1;
  SELECT l.id INTO c_cru FROM financeiro_lancamentos_v2 l
   WHERE l.cliente_id = v_cli AND NOT l.cancelado AND l.origem_lancamento IN ('extrato', 'ofx')
     AND l.plano_conta_id IS NULL AND l.subcentro IS NULL AND l.tipo_operacao = '2-Saídas'
   ORDER BY l.data_pagamento DESC, l.id LIMIT 1;
  IF c_cru IS NULL THEN RAISE EXCEPTION 'nenhum cru vivo do NJ para o P3'; END IF;

  -- ── P1 gatilho
  UPDATE financeiro_lancamentos_v2 SET cultura = 'amendoim' WHERE id = c_cria;
  UPDATE financeiro_lancamentos_v2 SET fase = 'cria', cultura = 'mandioca' WHERE id = c_agri;
  SELECT format('pecuaria+cultura -> cultura %s fase %s | agricultura+fase+cultura -> fase %s cultura %s',
                COALESCE(a.cultura, 'NULL'), COALESCE(a.fase, 'NULL'), COALESCE(b.fase, 'NULL'), COALESCE(b.cultura, 'NULL'))
    INTO v_t FROM financeiro_lancamentos_v2 a, financeiro_lancamentos_v2 b WHERE a.id = c_cria AND b.id = c_agri;
  v_out := v_out || E'\nP1 ' || v_t;
  IF v_t <> 'pecuaria+cultura -> cultura NULL fase cria | agricultura+fase+cultura -> fase NULL cultura mandioca' THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;
  UPDATE financeiro_lancamentos_v2 SET cultura = NULL WHERE id = c_agri;

  -- as linhas de staging de teste (P3-P6), numa sessao propria, copiando uma linha real e trocando o que o caso pede
  INSERT INTO financeiro_classificacao_staging
  SELECT (jsonb_populate_record(NULL::financeiro_classificacao_staging, to_jsonb(s) || jsonb_build_object(
     'staging_id', x.id, 'sessao_id', v_s, 'excel_linha_origem', x.lin, 'excel_safra', x.safra,
     'match_status', x.st, 'match_lancamento_id', x.lanc, 'match_lancamento_ids', NULL, 'aplicado', false, 'estado_anterior', NULL,
     'casamento_meta', NULL, 'update_proposto', x.prop))).*
    FROM financeiro_classificacao_staging s,
         (VALUES (gen_random_uuid(), 1, 'Mandioca 2025/2026', 'exato', c_cru,
                  jsonb_build_object('_planilha', v_fert || jsonb_build_object('safra_id', c_lav::text))),
                 (gen_random_uuid(), 2, 'Mandioca 2025/2026', 'ja_classificado', c_amd,
                  jsonb_build_object('_planilha', v_fert || jsonb_build_object('safra_id', c_lav::text))),
                 (gen_random_uuid(), 3, 'Pecuária 2025/2026', 'ja_classificado', c_cria,
                  jsonb_build_object('fase', 'engorda', '_meta', jsonb_build_object('origem_resolucao', 'manual'))),
                 (gen_random_uuid(), 4, 'Pecuária 2025/2026', 'ja_classificado', c_cria, '{}'::jsonb))
           AS x(id, lin, safra, st, lanc, prop)
   WHERE s.staging_id = v_base;
  SELECT staging_id INTO v_stg  FROM financeiro_classificacao_staging WHERE sessao_id = v_s AND excel_linha_origem = 1;
  SELECT staging_id INTO v_stg2 FROM financeiro_classificacao_staging WHERE sessao_id = v_s AND excel_linha_origem = 2;
  SELECT staging_id INTO v_stg3 FROM financeiro_classificacao_staging WHERE sessao_id = v_s AND excel_linha_origem = 3;
  SELECT staging_id INTO v_stg4 FROM financeiro_classificacao_staging WHERE sessao_id = v_s AND excel_linha_origem = 4;

  -- ── P2 editar_proposto (na linha 2, a do classificado)
  v_r := fn_classificacao_editar_proposto(v_stg2, '{"cultura":"Mandioca","fase":"cria"}'::jsonb);
  SELECT format('ok %s, cultura %s, fase %s', v_r->>'ok', update_proposto->>'cultura', update_proposto->>'fase') INTO v_t
    FROM financeiro_classificacao_staging WHERE staging_id = v_stg2;
  v_r := fn_classificacao_editar_proposto(v_stg2, '{"cultura":"eucalipto"}'::jsonb);
  v_t := v_t || format(' | eucalipto: ok %s %s %s', v_r->>'ok', v_r->>'motivo', v_r->'campos_rejeitados'->>'cultura');
  v_r := fn_classificacao_editar_proposto(v_stg2, '{"fase":"terminacao"}'::jsonb);
  v_t := v_t || format(' | fase fora: %s', v_r->'campos_rejeitados'->>'fase');
  v_r := fn_classificacao_editar_proposto(v_stg2, '{"cultura":"","fase":""}'::jsonb);
  SELECT v_t || format(' | vazio: cultura %s fase %s', COALESCE(update_proposto->>'cultura', 'ausente'), COALESCE(update_proposto->>'fase', 'ausente'))
    INTO v_t FROM financeiro_classificacao_staging WHERE staging_id = v_stg2;
  v_out := v_out || E'\nP2 ' || v_t;
  IF v_t <> 'ok true, cultura mandioca, fase cria | eucalipto: ok false nada_aplicado cultura_invalida | fase fora: fase_invalida | vazio: cultura ausente fase ausente' THEN
    v_ok := false; v_out := v_out || ' FALHOU';
  END IF;
  /* o editar marcou a linha 2 como manual: devolve a proposta da planilha, sem a marca, para o P4 */
  UPDATE financeiro_classificacao_staging SET update_proposto = jsonb_build_object('_planilha', v_fert || jsonb_build_object('safra_id', c_lav::text))
   WHERE staging_id = v_stg2;

  -- ── P3 e P4: a precedencia deriva e decide; o apply grava
  PERFORM public._fn_classificacao_precedencia_cru(v_s);
  SELECT format('cru: planilha %s, proposta %s', update_proposto->'_planilha'->>'cultura', COALESCE(update_proposto->>'cultura', 'ausente')) INTO v_t
    FROM financeiro_classificacao_staging WHERE staging_id = v_stg;
  SELECT format('classificado: planilha %s, proposta %s', update_proposto->'_planilha'->>'cultura', COALESCE(update_proposto->>'cultura', 'ausente')) INTO v_t2
    FROM financeiro_classificacao_staging WHERE staging_id = v_stg2;
  v_r := fn_classificacao_apply_row(v_stg, true);
  SELECT v_t || format(' | apply %s -> lancamento %s / %s', v_r->>'motivo', cultura, escopo_negocio) INTO v_t FROM financeiro_lancamentos_v2 WHERE id = c_cru;
  v_out := v_out || E'\nP3 ' || v_t;
  IF v_t <> 'cru: planilha mandioca, proposta mandioca | apply aplicado_overwrite -> lancamento mandioca / agricultura' THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;
  v_r := fn_classificacao_apply_row(v_stg2, true);
  SELECT v_t2 || format(' | apply %s -> lancamento %s', v_r->>'motivo', cultura) INTO v_t2 FROM financeiro_lancamentos_v2 WHERE id = c_amd;
  v_out := v_out || E'\nP4 ' || v_t2;
  IF v_t2 <> 'classificado: planilha mandioca, proposta ausente | apply aplicado_overwrite -> lancamento amendoim' THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;

  -- ── P5 fase proposta grava; P6 o reverter a devolve
  v_r := fn_classificacao_apply_row(v_stg3, true);
  SELECT format('com proposta: %s -> %s', v_r->>'motivo', fase) INTO v_t FROM financeiro_lancamentos_v2 WHERE id = c_cria;
  v_r := fn_classificacao_reverter_row(v_stg3);
  SELECT v_t || format(' | reverter %s -> %s', v_r->>'motivo', fase) INTO v_t FROM financeiro_lancamentos_v2 WHERE id = c_cria;
  v_r := fn_classificacao_apply_row(v_stg4, true);
  SELECT v_t || format(' | sem proposta: %s -> %s', v_r->>'motivo', fase) INTO v_t FROM financeiro_lancamentos_v2 WHERE id = c_cria;
  v_out := v_out || E'\nP5/P6 ' || v_t;
  IF v_t <> 'com proposta: aplicado_overwrite -> engorda | reverter revertido -> cria | sem proposta: aplicado_overwrite -> cria' THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;
  -- estado_anterior de ANTES do PR (sem as chaves): o reverter nao mexe nas duas
  UPDATE financeiro_lancamentos_v2 SET fase = 'engorda' WHERE id = c_cria;
  UPDATE financeiro_classificacao_staging SET estado_anterior = estado_anterior - 'cultura' - 'fase' WHERE staging_id = v_stg4;
  v_r := fn_classificacao_reverter_row(v_stg4);
  SELECT format('estado antigo: reverter %s -> fase %s', v_r->>'motivo', fase) INTO v_t FROM financeiro_lancamentos_v2 WHERE id = c_cria;
  v_out := v_out || E'\nP6 ' || v_t;
  IF v_t <> 'estado antigo: reverter revertido -> fase engorda' THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;

  -- ── P7 split: filho de lavoura com cultura proposta, filho de pecuaria com fase proposta
  INSERT INTO financeiro_classificacao_staging
  SELECT (jsonb_populate_record(NULL::financeiro_classificacao_staging, to_jsonb(s) || jsonb_build_object(
     'staging_id', x.id, 'excel_linha_origem', x.lin, 'excel_valor', x.v, 'excel_data', '2026-08-05', 'excel_data_pagamento', '2026-08-05',
     'excel_tipo_operacao','1-Entradas','conta_origem_id','3b9afa7a-0af6-4bce-8ec9-03b91484dfd8','conta_destino_id',NULL,
     'match_status','sem_match','match_lancamento_id',NULL,'match_lancamento_ids',NULL,'aplicado',false,'casamento_meta',NULL,
     'update_proposto', x.prop))).*
    FROM financeiro_classificacao_staging s,
         (VALUES (gen_random_uuid(), 99101, 3000.00, v_fert || '{"cultura":"mandioca"}'::jsonb),
                 (gen_random_uuid(), 99102, 1007.42, v_nutr || '{"fase":"cria"}'::jsonb)) AS x(id, lin, v, prop)
   WHERE s.staging_id = v_base;
  SELECT array_agg(staging_id ORDER BY excel_linha_origem) INTO v_ids FROM financeiro_classificacao_staging
   WHERE sessao_id = c_ses AND excel_linha_origem IN (99101, 99102);
  v_r := fn_classificacao_split_substituir(c_split, c_ses, v_ids);
  SELECT string_agg(format('%s %s/%s', l.escopo_negocio, COALESCE(l.cultura, '—'), COALESCE(l.fase, '—')), ' | ' ORDER BY l.valor DESC) INTO v_t
    FROM financeiro_lancamentos_v2 l WHERE l.id IN (SELECT x::uuid FROM jsonb_array_elements_text(v_r->'lancamentos_criados') x);
  v_out := v_out || E'\nP7 ' || (v_r->>'motivo') || ': ' || COALESCE(v_t, '—');
  IF v_t IS DISTINCT FROM 'agricultura mandioca/— | pecuaria —/cria' THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;

  -- ── P8 a derivacao
  SELECT string_agg(format('%s=%s', x.t, COALESCE(public._fn_classificacao_cultura_da_planilha(x.t, x.sf), '∅')), ' | ' ORDER BY x.o) INTO v_t
    FROM (VALUES (1, 'Amendoim 2025/2026', c_lav), (2, 'Mandioca 2025/2026', c_lav), (3, 'Pecuária 2025/2026', c_pec),
                 (4, 'Não se aplica', NULL::uuid), (5, 'Despesas Pessoais', NULL::uuid), (6, 'Escritorio Garças  2026/2026', c_pec2),
                 (7, 'Amendoim e Mandioca 2025/2026', c_lav), (8, 'Amendoim 2025/2026', c_pec), (9, 'Amendoimzal 2025', c_lav)) AS x(o, t, sf);
  v_out := v_out || E'\nP8 ' || v_t;
  IF v_t <> 'Amendoim 2025/2026=amendoim | Mandioca 2025/2026=mandioca | Pecuária 2025/2026=∅ | Não se aplica=∅ | Despesas Pessoais=∅ | Escritorio Garças  2026/2026=∅ | Amendoim e Mandioca 2025/2026=∅ | Amendoim 2025/2026=∅ | Amendoimzal 2025=∅' THEN
    v_ok := false; v_out := v_out || ' FALHOU';
  END IF;

  -- ── P9 a view
  SELECT count(*), md5(string_agg(attname, ',' ORDER BY attnum)) INTO n, v_t FROM pg_attribute
   WHERE attrelid = 'public.vw_classificacao_staging_preview'::regclass AND attnum BETWEEN 1 AND 107 AND NOT attisdropped;
  SELECT string_agg(attname, ',' ORDER BY attnum) INTO v_t2 FROM pg_attribute
   WHERE attrelid = 'public.vw_classificacao_staging_preview'::regclass AND attnum > 107 AND NOT attisdropped;
  v_out := v_out || format(E'\nP9 %s colunas antigas, md5 dos nomes %s (antes ebee1ce16489255a6a88dfea75ca87e1) | novas: %s', n, v_t, v_t2);
  IF n <> 107 OR v_t <> 'ebee1ce16489255a6a88dfea75ca87e1' OR v_t2 <> 'lanc_cultura,lanc_fase,planilha_cultura,proposto_cultura,proposto_fase' THEN
    v_ok := false; v_out := v_out || ' FALHOU';
  END IF;

  RAISE EXCEPTION 'ROLLBACK teste PR-CONC-ENRIQ-MESA-CULTURA-FASE-A — %', CASE WHEN v_ok THEN 'TODOS OK' ELSE 'HA FALHA' END || v_out;
END $teste$;
