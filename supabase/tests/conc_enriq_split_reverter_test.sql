-- PR-CONC-ENRIQ-SPLIT-REVERTER — teste em ROLLBACK (termina em RAISE: nada fica gravado).
-- Roda DEPOIS da migration 20261027191100. Canal de escrita, como o admin 7bd0b6ad (request.jwt.claims).
-- TUDO SINTETICO, criado aqui: importacao, linha de extrato, consolidado cru (vinculo `ofx_cru`) e sessao com as linhas
-- em 'sugestao_split' — no NJ, Sicredi PJ Pecuaria, out/2026 (mes aberto). Nenhuma sessao viva e' tocada.
--   P1  o split grava o registro: consolidado, extrato, vinculo original (tipo ofx_cru), filhos, vinculos e o estado das linhas
--   P2  desfazer: filhos cancelados, consolidado vivo, vinculo recriado COM o tipo ofx_cru, extrato conciliado, linhas de
--       volta ao status e ao par de antes, nao aplicadas, proposta intacta; e o `fn_extrato_desfazer_arquivo` (simulado)
--       continua alcancando o consolidado como cru
--   P3  desfazer pela OUTRA linha do split da' o mesmo resultado
--   P4  p_simular nao grava nada (md5 antes x depois) e devolve o resumo
--   P5  as recusas, uma a uma, com a frase
--   P6  filho editado: a simulacao avisa; desfazer executa
--   P7  refazer o split depois de desfazer funciona e cria registro novo (e se desfaz de novo)
--   P8  ida e volta sem residuo: status e soma aplicada do extrato, lancamentos vivos do cliente, o consolidado
--   P9  a view: as colunas novas no fim (118, a 116a segue `safra_fora_do_periodo`), `split_id` da linha = o registro vivo
DO $teste$
DECLARE
  c_nj constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  v_ok boolean := true; v_out text := '';
  v_conta uuid; v_faz uuid; v_pc record;
  c jsonb; c2 jsonb; r jsonb; v_split uuid; v_split2 uuid; v_md5 text; v_md5b text; n int; m int; v_txt text;
  v_st text; v_lid uuid; v_cons uuid; v_ext uuid; v_ses uuid; v_stg uuid[]; v_fil uuid[]; v_tipo text;
  a_status text; a_soma numeric; a_vivos int; a_cons text; v_prop text;
BEGIN
  SET LOCAL lock_timeout = '3s';
  PERFORM set_config('statement_timeout', '90s', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', true);
  SELECT id INTO v_conta FROM financeiro_contas_bancarias WHERE cliente_id = c_nj AND tipo_conta = 'cc' AND ativa ORDER BY created_at LIMIT 1;
  SELECT id INTO v_faz FROM fazendas WHERE cliente_id = c_nj AND nome NOT ILIKE '%administrat%' ORDER BY created_at LIMIT 1;
  SELECT id, subcentro INTO v_pc FROM financeiro_plano_contas
   WHERE ativo AND escopo_negocio = 'pecuaria' AND tipo_operacao = '2-Saídas' AND subcentro ILIKE 'Nutri%' ORDER BY ordem_exibicao LIMIT 1;
  IF v_conta IS NULL OR v_faz IS NULL OR v_pc.id IS NULL
     OR EXISTS (SELECT 1 FROM financeiro_fechamentos WHERE cliente_id = c_nj AND ano_mes = '2026-10' AND status_fechamento = 'fechado') THEN
    RAISE EXCEPTION 'ROLLBACK teste PR-CONC-ENRIQ-SPLIT-REVERTER: HA FALHA — o cenario nao se monta';
  END IF;

  /* o CENARIO: importacao + extrato + consolidado cru vinculado (tipo dado) + sessao com N linhas 'sugestao_split' */
  EXECUTE format($f$
    CREATE FUNCTION pg_temp.split_cenario(p_valores numeric[], p_tipo text) RETURNS jsonb LANGUAGE plpgsql AS $b$
    DECLARE v_imp uuid; v_ext uuid; v_cons uuid; v_ses uuid := gen_random_uuid(); v_cbi uuid; i int; v_stg uuid[] := '{}'; v_id uuid;
            v_soma numeric := (SELECT sum(x) FROM unnest(p_valores) x);
    BEGIN
      INSERT INTO financeiro_importacoes_v2 (cliente_id, nome_arquivo) VALUES (%1$L, 'TESTE SPLIT REVERTER') RETURNING id INTO v_imp;
      INSERT INTO extrato_bancario_v2 (cliente_id, conta_bancaria_id, importacao_id, data_movimento, descricao, valor, tipo_movimento, hash_movimento)
      VALUES (%1$L, %2$L, v_imp, '2026-10-05', 'TESTE SPLIT REVERTER', -v_soma, 'debito', 'teste-split-' || gen_random_uuid()) RETURNING id INTO v_ext;
      INSERT INTO financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_pagamento, valor, sinal,
        tipo_operacao, status_transacao, descricao, origem_lancamento)
      VALUES (%1$L, %3$L, %2$L, '2026-10-05', '2026-10-05', v_soma, '-1', '2-Saídas', 'realizado', 'TESTE SPLIT consolidado', 'extrato')
      RETURNING id INTO v_cons;
      v_cbi := (public.fn_vincular_extrato_lancamento(v_ext, v_cons, v_soma, false) ->> 'cbi_id')::uuid;
      UPDATE conciliacao_bancaria_itens SET tipo_aprovacao = p_tipo WHERE id = v_cbi;
      FOR i IN 1 .. array_length(p_valores, 1) LOOP
        v_id := gen_random_uuid();
        INSERT INTO financeiro_classificacao_staging (staging_id, sessao_id, cliente_id, match_status, match_lancamento_id, excel_linha_origem,
          excel_valor, excel_data, excel_tipo_operacao, conta_origem_id, update_proposto, aplicado)
        VALUES (v_id, v_ses, %1$L, 'sugestao_split', v_cons, i, p_valores[i], '2026-10-05', '2-Saídas', %2$L,
          jsonb_build_object('subcentro', %4$L, 'plano_conta_id', %5$L, 'fazenda_id', %3$L, 'observacao', 'linha ' || i), false);
        v_stg := v_stg || v_id;
      END LOOP;
      RETURN jsonb_build_object('imp', v_imp, 'ext', v_ext, 'cons', v_cons, 'ses', v_ses, 'stg', to_jsonb(v_stg), 'cbi', v_cbi);
    END $b$ $f$, c_nj, v_conta, v_faz, v_pc.subcentro, v_pc.id);
  /* o split de um cenario (pela funcao de verdade) */
  EXECUTE $f$
    CREATE FUNCTION pg_temp.split_fazer(c jsonb) RETURNS jsonb LANGUAGE sql AS $b$
      SELECT public.fn_classificacao_split_substituir((c ->> 'cons')::uuid, (c ->> 'ses')::uuid,
        ARRAY(SELECT jsonb_array_elements_text(c -> 'stg')::uuid))
    $b$ $f$;

  -- ── P1 o split grava o registro
  c := pg_temp.split_cenario(ARRAY[600.00, 400.00]::numeric[], 'ofx_cru');
  v_cons := (c ->> 'cons')::uuid; v_ext := (c ->> 'ext')::uuid; v_ses := (c ->> 'ses')::uuid;
  v_stg := ARRAY(SELECT jsonb_array_elements_text(c -> 'stg')::uuid);
  SELECT md5(string_agg(coalesce(update_proposto::text, ''), '|' ORDER BY staging_id)) INTO v_prop
    FROM financeiro_classificacao_staging WHERE staging_id = ANY(v_stg);
  a_status := (SELECT status FROM extrato_bancario_v2 WHERE id = v_ext);
  a_soma := (SELECT sum(valor_aplicado) FROM conciliacao_bancaria_itens WHERE extrato_id = v_ext AND desfeito_em IS NULL);
  a_vivos := (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE cliente_id = c_nj AND NOT cancelado);
  a_cons := (SELECT md5((to_jsonb(l) - 'updated_at' - 'updated_by' - 'cancelado' - 'cancelado_em' - 'cancelado_por' - 'cancelado_motivo')::text)
               FROM financeiro_lancamentos_v2 l WHERE id = v_cons);
  r := pg_temp.split_fazer(c);
  v_split := (r ->> 'split_id')::uuid;
  v_fil := ARRAY(SELECT jsonb_array_elements_text(r -> 'lancamentos_criados')::uuid);
  SELECT count(*) INTO n FROM classificacao_splits sp
   WHERE sp.id = v_split AND sp.consolidado_id = v_cons AND sp.extrato_id = v_ext AND sp.sessao_id = v_ses AND sp.origem = 'split'
     AND sp.desfeito_em IS NULL AND sp.grupo_id = (r ->> 'grupo_id')::uuid
     AND jsonb_array_length(sp.vinculo_original) = 1 AND sp.vinculo_original -> 0 ->> 'tipo_aprovacao' = 'ofx_cru'
     AND (sp.vinculo_original -> 0 ->> 'id')::uuid = (c ->> 'cbi')::uuid AND (sp.vinculo_original -> 0 ->> 'valor_aplicado')::numeric = 1000;
  SELECT count(*) INTO m FROM classificacao_split_itens i
   WHERE i.split_id = v_split AND i.filho_id = ANY(v_fil) AND i.staging_id = ANY(v_stg) AND i.vinculo_filho_id IS NOT NULL
     AND i.match_status_antes = 'sugestao_split' AND i.match_lancamento_id_antes = v_cons AND NOT i.par_inferido;
  v_out := v_out || format(E'\nP1 registro: split %s, itens %s/2', n, m);
  IF (r ->> 'ok')::boolean IS NOT TRUE OR n <> 1 OR m <> 2 THEN v_ok := false; v_out := v_out || ' FALHOU ' || r::text; END IF;

  -- ── P4 simular nao grava (e devolve o resumo)
  SELECT md5(string_agg(t, '|' ORDER BY t)) INTO v_md5 FROM (
    SELECT to_jsonb(l)::text t FROM financeiro_lancamentos_v2 l WHERE l.id = v_cons OR l.id = ANY(v_fil)
    UNION ALL SELECT to_jsonb(x)::text FROM conciliacao_bancaria_itens x WHERE x.extrato_id = v_ext
    UNION ALL SELECT to_jsonb(e)::text FROM extrato_bancario_v2 e WHERE e.id = v_ext
    UNION ALL SELECT to_jsonb(s)::text FROM financeiro_classificacao_staging s WHERE s.staging_id = ANY(v_stg)
    UNION ALL SELECT to_jsonb(sp)::text FROM classificacao_splits sp WHERE sp.id = v_split) z;
  r := public.fn_classificacao_desfazer_split(v_stg[1], NULL, true);
  SELECT md5(string_agg(t, '|' ORDER BY t)) INTO v_md5b FROM (
    SELECT to_jsonb(l)::text t FROM financeiro_lancamentos_v2 l WHERE l.id = v_cons OR l.id = ANY(v_fil)
    UNION ALL SELECT to_jsonb(x)::text FROM conciliacao_bancaria_itens x WHERE x.extrato_id = v_ext
    UNION ALL SELECT to_jsonb(e)::text FROM extrato_bancario_v2 e WHERE e.id = v_ext
    UNION ALL SELECT to_jsonb(s)::text FROM financeiro_classificacao_staging s WHERE s.staging_id = ANY(v_stg)
    UNION ALL SELECT to_jsonb(sp)::text FROM classificacao_splits sp WHERE sp.id = v_split) z;
  v_out := v_out || format(E'\nP4 simular: %s · "%s" · md5 igual %s', r ->> 'motivo', r ->> 'mensagem', v_md5 = v_md5b);
  IF (r ->> 'ok')::boolean IS NOT TRUE OR r ->> 'motivo' <> 'simulado' OR (r ->> 'linhas')::int <> 2
     OR r ->> 'mensagem' <> 'desfaz: 2 linhas voltam · R$ 1.000,00 vira um só' OR v_md5 IS DISTINCT FROM v_md5b THEN
    v_ok := false; v_out := v_out || ' FALHOU ' || r::text;
  END IF;

  -- ── P2 desfazer
  r := public.fn_classificacao_desfazer_split(v_stg[1], 'teste P2', false);
  SELECT count(*) INTO n FROM financeiro_lancamentos_v2 WHERE id = ANY(v_fil) AND cancelado
     AND cancelado_motivo = 'desfazer desmembramento: teste P2';
  SELECT tipo_aprovacao INTO v_tipo FROM conciliacao_bancaria_itens WHERE lancamento_id = v_cons AND extrato_id = v_ext AND desfeito_em IS NULL;
  SELECT count(*) INTO m FROM financeiro_classificacao_staging
   WHERE staging_id = ANY(v_stg) AND match_status = 'sugestao_split' AND match_lancamento_id = v_cons AND NOT aplicado
     AND estado_anterior IS NULL AND aplicado_em IS NULL;
  v_txt := format('filhos cancelados %s/2, consolidado vivo %s, vinculo %s, extrato %s, linhas %s/2, proposta igual %s, registro desfeito %s',
    n, (SELECT NOT cancelado FROM financeiro_lancamentos_v2 WHERE id = v_cons), coalesce(v_tipo, '—'),
    (SELECT status FROM extrato_bancario_v2 WHERE id = v_ext), m,
    v_prop = (SELECT md5(string_agg(coalesce(update_proposto::text, ''), '|' ORDER BY staging_id)) FROM financeiro_classificacao_staging WHERE staging_id = ANY(v_stg)),
    (SELECT desfeito_em IS NOT NULL AND desfeito_motivo = 'teste P2' FROM classificacao_splits WHERE id = v_split));
  v_out := v_out || E'\nP2 desfazer: ' || v_txt;
  IF (r ->> 'ok')::boolean IS NOT TRUE OR n <> 2 OR v_tipo IS DISTINCT FROM 'ofx_cru' OR m <> 2
     OR (SELECT status FROM extrato_bancario_v2 WHERE id = v_ext) <> 'conciliado'
     OR (SELECT cancelado FROM financeiro_lancamentos_v2 WHERE id = v_cons)
     OR v_txt NOT LIKE '%proposta igual t, registro desfeito t' THEN
    v_ok := false; v_out := v_out || ' FALHOU ' || r::text;
  END IF;
  -- o "desfazer arquivo" (simulado) continua vendo o consolidado como cru
  r := public.fn_extrato_desfazer_arquivo((c ->> 'imp')::uuid, 'teste', true);
  v_out := v_out || format(' | desfazer arquivo: crus %s, alcanca o consolidado %s', r ->> 'crus_cancelados', (r -> 'ids_cru') ? v_cons::text);
  IF NOT ((r -> 'ids_cru') ? v_cons::text) THEN v_ok := false; v_out := v_out || ' FALHOU ' || r::text; END IF;

  -- ── P8 ida e volta sem residuo
  v_out := v_out || format(E'\nP8 ida e volta: extrato %s=%s, soma %s=%s, vivos %s=%s, consolidado igual %s', a_status,
    (SELECT status FROM extrato_bancario_v2 WHERE id = v_ext), a_soma,
    (SELECT sum(valor_aplicado) FROM conciliacao_bancaria_itens WHERE extrato_id = v_ext AND desfeito_em IS NULL), a_vivos,
    (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE cliente_id = c_nj AND NOT cancelado),
    a_cons = (SELECT md5((to_jsonb(l) - 'updated_at' - 'updated_by' - 'cancelado' - 'cancelado_em' - 'cancelado_por' - 'cancelado_motivo')::text)
                FROM financeiro_lancamentos_v2 l WHERE id = v_cons));
  IF a_status IS DISTINCT FROM (SELECT status FROM extrato_bancario_v2 WHERE id = v_ext)
     OR a_soma IS DISTINCT FROM (SELECT sum(valor_aplicado) FROM conciliacao_bancaria_itens WHERE extrato_id = v_ext AND desfeito_em IS NULL)
     OR a_vivos <> (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE cliente_id = c_nj AND NOT cancelado)
     OR a_cons IS DISTINCT FROM (SELECT md5((to_jsonb(l) - 'updated_at' - 'updated_by' - 'cancelado' - 'cancelado_em' - 'cancelado_por' - 'cancelado_motivo')::text)
                                   FROM financeiro_lancamentos_v2 l WHERE id = v_cons) THEN
    v_ok := false; v_out := v_out || ' FALHOU';
  END IF;

  -- ── P7 refazer depois de desfazer: registro novo, e se desfaz de novo
  r := pg_temp.split_fazer(c);
  v_split2 := (r ->> 'split_id')::uuid;
  v_out := v_out || format(E'\nP7 refazer: %s, registro novo %s', r ->> 'motivo', v_split2 IS DISTINCT FROM v_split AND v_split2 IS NOT NULL);
  IF (r ->> 'ok')::boolean IS NOT TRUE OR v_split2 IS NULL OR v_split2 = v_split THEN v_ok := false; v_out := v_out || ' FALHOU ' || r::text; END IF;
  r := public.fn_classificacao_desfazer_split(v_stg[2], 'teste P7', false);
  v_out := v_out || format(' | desfazer de novo: %s', r ->> 'motivo');
  IF (r ->> 'ok')::boolean IS NOT TRUE OR (SELECT count(*) FROM classificacao_splits WHERE consolidado_id = v_cons AND desfeito_em IS NOT NULL) <> 2 THEN
    v_ok := false; v_out := v_out || ' FALHOU ' || r::text;
  END IF;

  -- ── P3 desfazer pela OUTRA linha (cenario novo de 3 linhas, pela terceira)
  c2 := pg_temp.split_cenario(ARRAY[100.00, 200.00, 300.00]::numeric[], 'manual');
  r := pg_temp.split_fazer(c2);
  r := public.fn_classificacao_desfazer_split((c2 -> 'stg' ->> 2)::uuid, 'teste P3', false);
  SELECT count(*) INTO m FROM financeiro_classificacao_staging
   WHERE staging_id IN (SELECT jsonb_array_elements_text(c2 -> 'stg')::uuid) AND match_status = 'sugestao_split'
     AND match_lancamento_id = (c2 ->> 'cons')::uuid AND NOT aplicado;
  SELECT tipo_aprovacao INTO v_tipo FROM conciliacao_bancaria_itens WHERE lancamento_id = (c2 ->> 'cons')::uuid AND desfeito_em IS NULL;
  v_out := v_out || format(E'\nP3 pela 3a linha: %s, linhas %s/3, vinculo %s, extrato %s', r ->> 'motivo', m, v_tipo,
    (SELECT status FROM extrato_bancario_v2 WHERE id = (c2 ->> 'ext')::uuid));
  IF (r ->> 'ok')::boolean IS NOT TRUE OR m <> 3 OR v_tipo IS DISTINCT FROM 'manual'
     OR (SELECT status FROM extrato_bancario_v2 WHERE id = (c2 ->> 'ext')::uuid) <> 'conciliado' THEN
    v_ok := false; v_out := v_out || ' FALHOU ' || r::text;
  END IF;

  -- ── P6 filho editado: a simulacao avisa, o desfazer executa
  c2 := pg_temp.split_cenario(ARRAY[50.00, 70.00]::numeric[], 'manual');
  r := pg_temp.split_fazer(c2);
  v_fil := ARRAY(SELECT jsonb_array_elements_text(r -> 'lancamentos_criados')::uuid);
  /* "editado" = mexido depois de nascer: na transacao do teste o now() nao anda, entao o nascimento e' recuado */
  UPDATE financeiro_lancamentos_v2 SET created_at = now() - interval '1 hour', descricao = 'editado pelo operador' WHERE id = v_fil[1];
  r := public.fn_classificacao_desfazer_split((c2 -> 'stg' ->> 0)::uuid, NULL, true);
  v_out := v_out || format(E'\nP6 editado: simulacao avisa "%s"', r -> 'avisos' ->> 0);
  IF (r ->> 'editados')::int <> 1 OR r -> 'avisos' ->> 0 <> '1 filhos foram editados; as edições no lançamento se perdem' THEN
    v_ok := false; v_out := v_out || ' FALHOU ' || r::text;
  END IF;
  r := public.fn_classificacao_desfazer_split((c2 -> 'stg' ->> 0)::uuid, 'teste P6', false);
  v_out := v_out || format(' | desfazer: %s', r ->> 'motivo');
  IF (r ->> 'ok')::boolean IS NOT TRUE THEN v_ok := false; v_out := v_out || ' FALHOU ' || r::text; END IF;

  -- ── P5 as recusas, uma a uma (cada uma no seu cenario)
  v_out := v_out || E'\nP5 recusas:';
  -- sem registro
  r := public.fn_classificacao_desfazer_split(gen_random_uuid(), 'x', false);
  v_out := v_out || format(' sem_registro=%s', r ->> 'motivo' = 'sem_registro' AND r ->> 'mensagem' = 'desmembramento antigo · sem registro para desfazer');
  IF r ->> 'motivo' IS DISTINCT FROM 'sem_registro' THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;
  -- ja' desfeito (o de P2/P7: os dois registros desfeitos)
  r := public.fn_classificacao_desfazer_split(v_stg[1], 'x', false);
  v_out := v_out || format(' ja_desfeito=%s', r ->> 'motivo' = 'split_ja_desfeito');
  IF r ->> 'motivo' IS DISTINCT FROM 'split_ja_desfeito' THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;
  -- motivo vazio
  c2 := pg_temp.split_cenario(ARRAY[10.00, 20.00]::numeric[], 'manual'); r := pg_temp.split_fazer(c2);
  v_fil := ARRAY(SELECT jsonb_array_elements_text(r -> 'lancamentos_criados')::uuid);
  r := public.fn_classificacao_desfazer_split((c2 -> 'stg' ->> 0)::uuid, '  ', false);
  v_out := v_out || format(' motivo=%s', r ->> 'motivo' = 'motivo_obrigatorio');
  IF r ->> 'motivo' IS DISTINCT FROM 'motivo_obrigatorio' THEN v_ok := false; v_out := v_out || ' FALHOU'; END IF;
  -- filho em grupo (outro grupo; o do proprio split nao conta — P2 e P3 passaram com ele)
  UPDATE conciliacao_bancaria_itens SET grupo_id = gen_random_uuid() WHERE lancamento_id = v_fil[1] AND desfeito_em IS NULL;
  r := public.fn_classificacao_desfazer_split((c2 -> 'stg' ->> 0)::uuid, 'x', false);
  v_out := v_out || format(' grupo=%s', r ->> 'motivo' = 'filho_em_grupo');
  IF r ->> 'motivo' IS DISTINCT FROM 'filho_em_grupo' THEN v_ok := false; v_out := v_out || ' FALHOU ' || r::text; END IF;
  -- filho em bloco conferido
  c2 := pg_temp.split_cenario(ARRAY[11.00, 21.00]::numeric[], 'manual'); r := pg_temp.split_fazer(c2);
  v_fil := ARRAY(SELECT jsonb_array_elements_text(r -> 'lancamentos_criados')::uuid);
  INSERT INTO financeiro_classificacao_staging (sessao_id, cliente_id, match_status, match_lancamento_ids, excel_linha_origem, excel_valor, aplicado)
  VALUES (gen_random_uuid(), c_nj, 'conferido_bloco', ARRAY[v_fil[2]], 1, 21, false);
  r := public.fn_classificacao_desfazer_split((c2 -> 'stg' ->> 0)::uuid, 'x', false);
  v_out := v_out || format(' bloco=%s', r ->> 'motivo' = 'filho_em_bloco');
  IF r ->> 'motivo' IS DISTINCT FROM 'filho_em_bloco' THEN v_ok := false; v_out := v_out || ' FALHOU ' || r::text; END IF;
  -- filho gravado numa linha APLICADA de OUTRA importacao (o caso do Gabriel); a NAO aplicada nao impede
  c2 := pg_temp.split_cenario(ARRAY[12.00, 22.00]::numeric[], 'manual'); r := pg_temp.split_fazer(c2);
  v_fil := ARRAY(SELECT jsonb_array_elements_text(r -> 'lancamentos_criados')::uuid);
  INSERT INTO financeiro_classificacao_staging (sessao_id, cliente_id, match_status, match_lancamento_id, excel_linha_origem, excel_valor, aplicado)
  VALUES (gen_random_uuid(), c_nj, 'exato', v_fil[1], 1, 12, false);
  r := public.fn_classificacao_desfazer_split((c2 -> 'stg' ->> 0)::uuid, NULL, true);
  v_out := v_out || format(' outra_nao_aplicada_nao_impede=%s', r ->> 'ok');
  IF (r ->> 'ok')::boolean IS NOT TRUE THEN v_ok := false; v_out := v_out || ' FALHOU ' || r::text; END IF;
  INSERT INTO financeiro_classificacao_staging (sessao_id, cliente_id, match_status, match_lancamento_id, excel_linha_origem, excel_valor, aplicado)
  VALUES (gen_random_uuid(), c_nj, 'exato', v_fil[2], 1, 22, true);
  r := public.fn_classificacao_desfazer_split((c2 -> 'stg' ->> 0)::uuid, NULL, true);
  v_out := v_out || format(' outra_importacao=%s ("%s")', r ->> 'motivo' = 'filho_gravado_em_outra_importacao', r ->> 'mensagem');
  IF r ->> 'motivo' IS DISTINCT FROM 'filho_gravado_em_outra_importacao' OR r ->> 'mensagem' NOT LIKE 'filho gravado na importação de % · reverta lá antes' THEN
    v_ok := false; v_out := v_out || ' FALHOU ' || r::text;
  END IF;
  -- filho re-desmembrado
  c2 := pg_temp.split_cenario(ARRAY[13.00, 23.00]::numeric[], 'manual'); r := pg_temp.split_fazer(c2);
  v_fil := ARRAY(SELECT jsonb_array_elements_text(r -> 'lancamentos_criados')::uuid);
  INSERT INTO classificacao_splits (cliente_id, sessao_id, consolidado_id, extrato_id, vinculo_original, origem)
  VALUES (c_nj, gen_random_uuid(), v_fil[1], (c2 ->> 'ext')::uuid, '[]', 'split');
  r := public.fn_classificacao_desfazer_split((c2 -> 'stg' ->> 0)::uuid, 'x', false);
  v_out := v_out || format(' redesmembrado=%s', r ->> 'motivo' = 'filho_redesmembrado');
  IF r ->> 'motivo' IS DISTINCT FROM 'filho_redesmembrado' THEN v_ok := false; v_out := v_out || ' FALHOU ' || r::text; END IF;
  -- filho cancelado por outro caminho
  c2 := pg_temp.split_cenario(ARRAY[14.00, 24.00]::numeric[], 'manual'); r := pg_temp.split_fazer(c2);
  v_fil := ARRAY(SELECT jsonb_array_elements_text(r -> 'lancamentos_criados')::uuid);
  PERFORM public.fn_cancelar_lancamento_auditoria(v_fil[2], 'outro caminho');
  r := public.fn_classificacao_desfazer_split((c2 -> 'stg' ->> 0)::uuid, 'x', false);
  v_out := v_out || format(' filho_cancelado=%s', r ->> 'motivo' = 'filho_cancelado');
  IF r ->> 'motivo' IS DISTINCT FROM 'filho_cancelado' THEN v_ok := false; v_out := v_out || ' FALHOU ' || r::text; END IF;
  -- filho vinculado a OUTRO extrato
  c2 := pg_temp.split_cenario(ARRAY[15.00, 25.00]::numeric[], 'manual'); r := pg_temp.split_fazer(c2);
  v_fil := ARRAY(SELECT jsonb_array_elements_text(r -> 'lancamentos_criados')::uuid);
  UPDATE conciliacao_bancaria_itens SET desfeito_em = now(), desfeito_motivo = 'teste' WHERE lancamento_id = v_fil[1] AND desfeito_em IS NULL;
  INSERT INTO extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, descricao, valor, tipo_movimento, hash_movimento)
  VALUES (c_nj, v_conta, '2026-10-05', 'TESTE OUTRO', -15, 'debito', 'teste-split-outro-' || gen_random_uuid()) RETURNING id INTO v_ext;
  PERFORM public.fn_vincular_extrato_lancamento(v_ext, v_fil[1], 15, false);
  r := public.fn_classificacao_desfazer_split((c2 -> 'stg' ->> 0)::uuid, 'x', false);
  v_out := v_out || format(' outro_extrato=%s', r ->> 'motivo' = 'filho_outro_extrato');
  IF r ->> 'motivo' IS DISTINCT FROM 'filho_outro_extrato' THEN v_ok := false; v_out := v_out || ' FALHOU ' || r::text; END IF;
  -- consolidado vivo
  c2 := pg_temp.split_cenario(ARRAY[16.00, 26.00]::numeric[], 'manual'); r := pg_temp.split_fazer(c2);
  UPDATE financeiro_lancamentos_v2 SET cancelado = false WHERE id = (c2 ->> 'cons')::uuid;
  r := public.fn_classificacao_desfazer_split((c2 -> 'stg' ->> 0)::uuid, 'x', false);
  v_out := v_out || format(' consolidado_vivo=%s', r ->> 'motivo' = 'consolidado_vivo');
  IF r ->> 'motivo' IS DISTINCT FROM 'consolidado_vivo' THEN v_ok := false; v_out := v_out || ' FALHOU ' || r::text; END IF;
  -- extrato ignorado
  c2 := pg_temp.split_cenario(ARRAY[17.00, 27.00]::numeric[], 'manual'); r := pg_temp.split_fazer(c2);
  UPDATE extrato_bancario_v2 SET ignorado_em = now() WHERE id = (c2 ->> 'ext')::uuid;
  r := public.fn_classificacao_desfazer_split((c2 -> 'stg' ->> 0)::uuid, 'x', false);
  v_out := v_out || format(' extrato_ignorado=%s', r ->> 'motivo' = 'extrato_indisponivel');
  IF r ->> 'motivo' IS DISTINCT FROM 'extrato_indisponivel' THEN v_ok := false; v_out := v_out || ' FALHOU ' || r::text; END IF;
  -- mes fechado (por ultimo: o fechamento valeria para os cenarios seguintes)
  c2 := pg_temp.split_cenario(ARRAY[18.00, 28.00]::numeric[], 'manual'); r := pg_temp.split_fazer(c2);
  INSERT INTO financeiro_fechamentos (cliente_id, fazenda_id, ano_mes, status_fechamento) VALUES (c_nj, v_faz, '2026-10', 'fechado');
  r := public.fn_classificacao_desfazer_split((c2 -> 'stg' ->> 0)::uuid, 'x', false);
  v_out := v_out || format(' mes_fechado=%s', r ->> 'motivo' = 'mes_fechado');
  IF r ->> 'motivo' IS DISTINCT FROM 'mes_fechado' THEN v_ok := false; v_out := v_out || ' FALHOU ' || r::text; END IF;

  -- ── P9 a view
  SELECT count(*) INTO n FROM pg_attribute WHERE attrelid = 'public.vw_classificacao_staging_preview'::regclass AND attnum > 0 AND NOT attisdropped;
  SELECT string_agg(attname, ',' ORDER BY attnum) INTO v_txt FROM pg_attribute
   WHERE attrelid = 'public.vw_classificacao_staging_preview'::regclass AND attnum > n - 3 AND NOT attisdropped;
  SELECT count(*) INTO m FROM vw_classificacao_staging_preview v
   WHERE v.staging_id = (c2 -> 'stg' ->> 0)::uuid
     AND v.split_id = (SELECT si.split_id FROM classificacao_split_itens si WHERE si.staging_id = (c2 -> 'stg' ->> 0)::uuid) AND NOT v.split_desfeito;
  v_out := v_out || format(E'\nP9 view: %s colunas, as ultimas %s; split_id da linha confere %s; linha de P2 split_desfeito %s, split_id %s',
    n, v_txt, m = 1,
    (SELECT split_desfeito FROM vw_classificacao_staging_preview WHERE staging_id = v_stg[1]),
    coalesce((SELECT split_id::text FROM vw_classificacao_staging_preview WHERE staging_id = v_stg[1]), 'nulo'));
  IF n <> 118 OR v_txt <> 'safra_fora_do_periodo,split_id,split_desfeito' OR m <> 1
     OR (SELECT split_desfeito FROM vw_classificacao_staging_preview WHERE staging_id = v_stg[1]) IS NOT TRUE
     OR (SELECT split_id FROM vw_classificacao_staging_preview WHERE staging_id = v_stg[1]) IS NOT NULL THEN
    v_ok := false; v_out := v_out || ' FALHOU';
  END IF;

  RAISE EXCEPTION 'ROLLBACK teste PR-CONC-ENRIQ-SPLIT-REVERTER — %', CASE WHEN v_ok THEN 'TODOS OK' ELSE 'HA FALHA' END || v_out;
END $teste$;
