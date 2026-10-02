-- PR-CONC-ENRIQ-BLOCO-ESTADOS — teste da linha livre, do soltar o par e do Recasar. Termina em RAISE: nada persiste.
-- Canal de escrita, como o admin 7bd0b6ad (request.jwt.claims). Caso real: NJ, sessao 8d6efeb7 (set/26).
-- P1 Rabobank (linha 10, 'sugestao_grupo') x Juros 008fba27 + Amortizacao 2bca3d10: bloco 1x2 ok, diferenca 0,00; os 2
--    lancamentos identicos por md5; desfazer devolve a linha a 'sugestao_grupo' com o MESMO casamento_meta (md5 sem updated_at).
-- P2 Par morto, criado AQUI: a linha 278 (BB, 'ja_aplicado', nao aplicada, par vivo b2a5a5f2) e' recusada com a frase nova;
--    cancelando b2a5a5f2 (so' nesta transacao) ela passa a ser livre e o bloco passa da guarda de linha. A 192 ('divergente',
--    par vivo b716d46e) e' recusada com a frase nova.
-- P3 Soltar: a 289 (par vivo 27bd8342) vira 'sem_match' com solto_de, update_proposto identico (md5); aplicada (322) recusa;
--    em bloco (Rabobank conferido) recusa; sem par recusa.
-- P4 265/266 (0f46ffaf, 698,21): soltar a 265; gemeo livre de 698,21 na conta da 265 em set/26? (conta); a 266 fica sozinha.
-- P5 Recasar depois de P1 (bloco do Rabobank) e de P3/P4 (265 e 289 soltas): o bloco sobrevive; o que o Recasar faz com as soltas.
DO $teste$
DECLARE
  v_out text := '';
  c_ses   constant uuid := '8d6efeb7-7c62-4a1f-bcca-32e14a386fc2';
  c_rabo  constant uuid := '2f5af2c4-3119-4869-b8d0-1b358fc66b91';
  c_lr    constant uuid[] := ARRAY['008fba27-80ef-4954-b183-508225066cd1', '2bca3d10-51ed-47e4-93af-2c5f00550f3f']::uuid[];
  v_r jsonb; v_bloco uuid; v_x uuid; v_y uuid; v_conta uuid;
  v_md5_a text; v_md5_d text; v_txt text; n int; m int;
  v_l278 uuid; v_l289 uuid; v_l265 uuid; v_l266 uuid; v_l192 uuid; v_l322 uuid;
BEGIN
  PERFORM set_config('statement_timeout', '90s', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', true);

  SELECT staging_id INTO v_l278 FROM financeiro_classificacao_staging WHERE sessao_id = c_ses AND excel_linha_origem = 278;
  SELECT staging_id INTO v_l289 FROM financeiro_classificacao_staging WHERE sessao_id = c_ses AND excel_linha_origem = 289;
  SELECT staging_id INTO v_l265 FROM financeiro_classificacao_staging WHERE sessao_id = c_ses AND excel_linha_origem = 265;
  SELECT staging_id INTO v_l266 FROM financeiro_classificacao_staging WHERE sessao_id = c_ses AND excel_linha_origem = 266;
  SELECT staging_id INTO v_l192 FROM financeiro_classificacao_staging WHERE sessao_id = c_ses AND excel_linha_origem = 192;
  SELECT staging_id INTO v_l322 FROM financeiro_classificacao_staging WHERE sessao_id = c_ses AND excel_linha_origem = 322;
  IF v_l278 IS NULL OR v_l289 IS NULL OR v_l265 IS NULL OR v_l266 IS NULL OR v_l192 IS NULL OR v_l322 IS NULL THEN
    RAISE EXCEPTION 'linhas do caso nao encontradas';
  END IF;

  -- ── P1 Rabobank
  SELECT md5(string_agg(to_jsonb(l)::text, '|' ORDER BY l.id)), count(*) INTO v_md5_a, n FROM financeiro_lancamentos_v2 l WHERE l.id = ANY(c_lr);
  SELECT md5((to_jsonb(s) - 'updated_at')::text), s.casamento_meta::text INTO v_txt, v_out
    FROM financeiro_classificacao_staging s WHERE s.staging_id = c_rabo;
  v_out := 'P1 casamento_meta antes: ' || v_out;
  v_r := fn_classificacao_conferir_bloco(c_ses, ARRAY[c_rabo], c_lr, false);
  v_bloco := (v_r->>'bloco_id')::uuid;
  SELECT md5(string_agg(to_jsonb(l)::text, '|' ORDER BY l.id)) INTO v_md5_d FROM financeiro_lancamentos_v2 l WHERE l.id = ANY(c_lr);
  v_out := v_out || format(E'\nP1 conferir: %s dif %s | linha -> %s | %s lancamentos comparados, identicos: %s',
    v_r->>'motivo', v_r->>'diferenca',
    (SELECT match_status FROM financeiro_classificacao_staging WHERE staging_id = c_rabo), n, v_md5_a = v_md5_d);
  v_r := fn_classificacao_desfazer_bloco(v_bloco, 'teste PR-CONC-ENRIQ-BLOCO-ESTADOS');
  SELECT md5((to_jsonb(s) - 'updated_at')::text) INTO v_md5_d FROM financeiro_classificacao_staging s WHERE s.staging_id = c_rabo;
  v_out := v_out || format(' | desfazer: %s -> %s, linha identica ao antes (1 comparada): %s', v_r->>'motivo',
    (SELECT match_status FROM financeiro_classificacao_staging WHERE staging_id = c_rabo), v_txt = v_md5_d);

  -- ── P2 par morto
  v_r := fn_classificacao_casar_manual(v_l278, c_lr[1], true);
  v_out := v_out || E'\nP2 278 com par vivo: ' || (v_r->>'motivo') || ' | ' || (v_r->>'mensagem');
  v_r := fn_classificacao_conferir_bloco(c_ses, ARRAY[v_l192], ARRAY[c_lr[1]], true);
  v_out := v_out || E'\nP2 192 divergente vivo: ' || (v_r->>'motivo') || ' | ' || (v_r->>'mensagem');
  SELECT match_lancamento_id INTO v_x FROM financeiro_classificacao_staging WHERE staging_id = v_l278;
  UPDATE financeiro_lancamentos_v2 SET cancelado = true, cancelado_em = now(), cancelado_motivo = 'teste PR-CONC-ENRIQ-BLOCO-ESTADOS'
   WHERE id = v_x;
  SELECT public._fn_classificacao_linha_livre(s) INTO STRICT v_txt FROM financeiro_classificacao_staging s WHERE s.staging_id = v_l278;
  v_out := v_out || format(E'\nP2 cancelado %s (so'' nesta transacao): 278 livre = %s', v_x, v_txt);
  v_r := fn_classificacao_conferir_bloco(c_ses, ARRAY[v_l278], ARRAY[c_lr[1]], true);
  v_out := v_out || ' | conferir 278 x Juros: ' || (v_r->>'motivo') || ' (passou da guarda de linha: '
        || ((v_r->>'motivo') <> 'linha_nao_elegivel')::text || ')';
  SELECT linha_livre::text || ' / lanc_cancelado ' || lanc_cancelado::text INTO v_txt
    FROM vw_classificacao_staging_preview WHERE staging_id = v_l278;
  v_out := v_out || ' | view: linha_livre ' || v_txt;

  -- ── P3 soltar
  SELECT md5(coalesce(update_proposto::text, '')), match_lancamento_id INTO v_txt, v_x FROM financeiro_classificacao_staging WHERE staging_id = v_l289;
  v_r := fn_classificacao_soltar_par(v_l289, false);
  SELECT md5(coalesce(update_proposto::text, '')) INTO v_md5_d FROM financeiro_classificacao_staging WHERE staging_id = v_l289;
  v_out := v_out || format(E'\nP3 soltar 289: %s | -> %s, solto_de %s (era %s), proposta identica: %s', v_r->>'motivo',
    (SELECT match_status || ' / ' || coalesce(match_lancamento_id::text, 'null') FROM financeiro_classificacao_staging WHERE staging_id = v_l289),
    (SELECT casamento_meta->>'solto_de' FROM financeiro_classificacao_staging WHERE staging_id = v_l289), v_x, v_txt = v_md5_d);
  v_r := fn_classificacao_soltar_par(v_l322, true);
  v_out := v_out || ' | aplicada (322): ' || (v_r->>'motivo') || ' "' || (v_r->>'mensagem') || '"';
  v_r := fn_classificacao_soltar_par(v_l289, true);
  v_out := v_out || ' | sem par (289 de novo): ' || (v_r->>'motivo');
  v_r := fn_classificacao_conferir_bloco(c_ses, ARRAY[c_rabo], c_lr, false);
  v_bloco := (v_r->>'bloco_id')::uuid;
  v_r := fn_classificacao_soltar_par(c_rabo, true);
  v_out := v_out || ' | em bloco (Rabobank reconferido): ' || (v_r->>'motivo');

  -- ── P4 265/266
  SELECT md5(to_jsonb(l)::text), l.id INTO v_md5_a, v_x FROM financeiro_lancamentos_v2 l
    JOIN financeiro_classificacao_staging s ON s.match_lancamento_id = l.id WHERE s.staging_id = v_l265;
  SELECT COALESCE(conta_origem_id, conta_destino_id) INTO v_conta FROM financeiro_classificacao_staging WHERE staging_id = v_l265;
  v_r := fn_classificacao_soltar_par(v_l265, false);
  SELECT count(*) INTO n FROM financeiro_lancamentos_v2 l
   WHERE l.cliente_id = 'f2d67cd4-24d0-456f-a079-a3281dcce7fd' AND l.cancelado IS NOT TRUE AND l.status_transacao = 'realizado'
     AND l.valor = 698.21 AND l.conta_efetiva_id = v_conta AND l.data_pagamento BETWEEN '2026-09-01' AND '2026-09-30'
     AND NOT EXISTS (SELECT 1 FROM financeiro_classificacao_staging x WHERE x.sessao_id = c_ses
                      AND (x.match_lancamento_id = l.id OR l.id = ANY(COALESCE(x.match_lancamento_ids, ARRAY[]::uuid[]))));
  SELECT md5(to_jsonb(l)::text) INTO v_md5_d FROM financeiro_lancamentos_v2 l WHERE l.id = v_x;
  v_out := v_out || format(E'\nP4 soltar 265: %s | gemeos livres de 698,21 na conta da 265 em set/26: %s | 265 -> %s | 266 -> %s | %s intacto: %s',
    v_r->>'motivo', n,
    (SELECT match_status || ' / ' || coalesce(match_lancamento_id::text, 'null') FROM financeiro_classificacao_staging WHERE staging_id = v_l265),
    (SELECT match_status || ' / ' || coalesce(match_lancamento_id::text, 'null') FROM financeiro_classificacao_staging WHERE staging_id = v_l266),
    v_x, v_md5_a = v_md5_d);

  -- ── P5 Recasar (bloco do Rabobank conferido; 265 e 289 soltas; 278 com par morto)
  PERFORM fn_classificacao_casar_sessao(c_ses, '2026-09');
  v_out := v_out || format(E'\nP5 Recasar: Rabobank -> %s (bloco %s) | 265 -> %s | 289 -> %s | 278 (par morto) -> %s',
    (SELECT match_status FROM financeiro_classificacao_staging WHERE staging_id = c_rabo),
    (SELECT casamento_meta->>'bloco_id' = v_bloco::text FROM financeiro_classificacao_staging WHERE staging_id = c_rabo),
    (SELECT match_status || ' / ' || coalesce(match_lancamento_id::text, 'null') || ' / ' || coalesce(match_lancamento_ids::text, '-') FROM financeiro_classificacao_staging WHERE staging_id = v_l265),
    (SELECT match_status || ' / ' || coalesce(match_lancamento_id::text, 'null') || ' / ' || coalesce(match_lancamento_ids::text, '-') FROM financeiro_classificacao_staging WHERE staging_id = v_l289),
    (SELECT match_status || ' / ' || coalesce(match_lancamento_id::text, 'null') FROM financeiro_classificacao_staging WHERE staging_id = v_l278));

  RAISE EXCEPTION 'ENSAIO (rollback): %', v_out;
END
$teste$;
