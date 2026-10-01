-- MANDIOCA-RETENCAO-NF-01 — teste da retencao da NF (papel 'funrural' uma vez por NF) e do 'exato' com sinal oposto.
-- Roda em ROLLBACK: termina em RAISE, nada fica gravado. Canal de escrita, como o admin 7bd0b6ad (request.jwt.claims).
-- P1 28/08 +20.998,80: desfaz o bloco atual (mais_antigo, parcial na 19,82 t) e refaz em 'exato' com as duas vendas da
--    NF 9294773 + o Funrural 347,95 — diferenca 0, tudo quitado, sem parcial; o caixa do dia da' o liquido do deposito.
-- P2 02/09 +39.700,12 em 'exato': as 4 vendas das NFs 9297983 e 9310349 + as 2 retencoes.
-- P3 16/09 +65.371,28 em 'exato': as 6 vendas das NFs 9351905, 9354496 e 9360074 + 3 SENAR.
-- P4 'mais_antigo_primeiro' continua uma direcao so': a retencao no bloco e' recusada.
-- P5 uma vez por NF: o completar recusa a segunda retencao; o registrar nao lanca o Funrural na segunda carga da NF.
-- P6 caixa: Sicredi Lavoura ago/26 continua 30.150,70 = banco (e continua depois do P1).
DO $teste$
DECLARE
  v_out text := '';
  c_nj  constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  c_sic constant uuid := '910e04b0-4148-4e58-885a-8937c8148581';
  v_bloco uuid; v_r jsonb; v_msg text; v_ids uuid[]; v_col uuid; v_reg jsonb; v_reg2 jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', true);

  v_out := 'retencoes gravadas: ' || (SELECT count(*) || ' · ' || sum(valor) FROM mandioca_retencao_nf_01_backfill);

  -- ── P1
  SELECT DISTINCT c.grupo_id INTO v_bloco FROM conciliacao_bancaria_itens c
   WHERE c.extrato_id = '316f43d1-f31a-4a6c-b085-6f6023931fa4' AND c.desfeito_em IS NULL AND c.grupo_id IN (SELECT id FROM conciliacao_blocos);
  IF v_bloco IS NOT NULL THEN PERFORM fn_desfazer_bloco(v_bloco, 'teste: refazer com a retencao'); END IF;
  SELECT array_agg(l.id ORDER BY l.valor DESC) INTO v_ids FROM financeiro_lancamentos_v2 l
   WHERE l.cliente_id = c_nj AND l.cancelado IS NOT TRUE
     AND (l.descricao LIKE 'Venda % Mandioca · NF 9294773%' OR l.descricao LIKE 'Funrural retido 1,63% · NF 9294773%');
  v_r := fn_conciliar_bloco(ARRAY['316f43d1-f31a-4a6c-b085-6f6023931fa4']::uuid[], v_ids, 'exato', true);
  v_out := v_out || E'\nP1 28/08 (bloco anterior ' || coalesce(left(v_bloco::text, 8), 'nenhum') || ' desfeito): lancamentos=' || array_length(v_ids, 1)
    || ' dif=' || (v_r#>>'{resumo,diferenca}') || ' quitados=' || jsonb_array_length(v_r#>'{resumo,quitados}') || ' parcial=' || coalesce(v_r#>>'{resumo,parcial}', 'nenhum');
  v_r := fn_conciliar_bloco(ARRAY['316f43d1-f31a-4a6c-b085-6f6023931fa4']::uuid[], v_ids, 'exato', false);
  v_out := v_out || E'\n   gravado: status=' || (SELECT string_agg(DISTINCT status_transacao, ',') FROM financeiro_lancamentos_v2 WHERE id = ANY(v_ids))
    || ' extrato=' || (SELECT status FROM extrato_bancario_v2 WHERE id = '316f43d1-f31a-4a6c-b085-6f6023931fa4')
    || ' | caixa 28/08 das 3 pontas=' || (SELECT sum(valor) FROM fn_caixa_sistema_pontas(c_nj, c_sic, '2026-08-28', '2026-08-28') WHERE lancamento_id = ANY(v_ids))
    || ' | saldo ago=' || (214547.50 + (SELECT sum(valor) FROM fn_caixa_sistema_pontas(c_nj, c_sic, '2026-08-01', '2026-08-31')));

  -- ── P2
  SELECT array_agg(l.id) INTO v_ids FROM financeiro_lancamentos_v2 l WHERE l.cliente_id = c_nj AND l.cancelado IS NOT TRUE
     AND (l.descricao ~ '^Venda .* Mandioca · NF (9297983|9310349) ' OR l.descricao ~ '^Funrural retido 1,63% · NF (9297983|9310349) ');
  v_r := fn_conciliar_bloco(ARRAY['128538bd-4413-411e-92ea-0a40e5185134']::uuid[], v_ids, 'exato', true);
  v_out := v_out || E'\nP2 02/09 +39.700,12: lancamentos=' || array_length(v_ids, 1) || ' dif=' || (v_r#>>'{resumo,diferenca}')
    || ' quitados=' || jsonb_array_length(v_r#>'{resumo,quitados}');

  -- ── P3
  SELECT array_agg(l.id) INTO v_ids FROM financeiro_lancamentos_v2 l WHERE l.cliente_id = c_nj AND l.cancelado IS NOT TRUE
     AND (l.descricao ~ '^Venda .* Mandioca · NF (9351905|9354496|9360074) ' OR l.descricao ~ '^SENAR retido 0,2% · NF (9351905|9354496|9360074) ');
  v_r := fn_conciliar_bloco(ARRAY['3c386787-a2a8-46a1-b8c1-a2a76ae40bbf']::uuid[], v_ids, 'exato', true);
  v_out := v_out || E'\nP3 16/09 +65.371,28: lancamentos=' || array_length(v_ids, 1) || ' dif=' || (v_r#>>'{resumo,diferenca}')
    || ' quitados=' || jsonb_array_length(v_r#>'{resumo,quitados}');

  -- ── P4
  BEGIN PERFORM fn_conciliar_bloco(ARRAY['3c386787-a2a8-46a1-b8c1-a2a76ae40bbf']::uuid[], v_ids, 'mais_antigo_primeiro', true);
  EXCEPTION WHEN SQLSTATE 'CBLOC' THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; v_out := v_out || E'\nP4 mais_antigo com retencao: ' || left(v_msg, 70); END;

  -- ── P5
  SELECT c.id INTO v_col FROM agri_colheita c WHERE c.cliente_id = c_nj AND c.nf_produtor = '9294773' AND c.ativo LIMIT 1;
  v_r := agri_carga_mandioca_completar(v_col, 'funrural', 10, NULL, 'Funrural retido 1,63%', '7.194');
  v_out := v_out || E'\nP5 completar de novo: ' || (v_r->>'motivo') || ' — ' || (v_r->>'mensagem');
  v_reg := agri_carga_mandioca_registrar(c_nj, 'f3a6d5dd-6ed3-49c5-a6b1-90fe77cb5ec8', '2026-09-30', 'f605ba53-7cd9-46ce-bec4-ad0ee7441f16', 'TESTE-RET-01', NULL,
                                         20000, 0, 480, 1.1, '[]'::jsonb, NULL, 30, NULL, c_sic, NULL, NULL);
  v_reg2 := agri_carga_mandioca_registrar(c_nj, 'f3a6d5dd-6ed3-49c5-a6b1-90fe77cb5ec8', '2026-09-30', 'f605ba53-7cd9-46ce-bec4-ad0ee7441f16', 'TESTE-RET-01', NULL,
                                         20000, 0, 480, 1.1, '[]'::jsonb, NULL, 30, NULL, c_sic, NULL, NULL);
  v_out := v_out || E'\n   registrar 1a carga: funrural_lancado=' || (v_reg->>'funrural_lancado') || ' papeis=' ||
      (SELECT string_agg(papel, ',' ORDER BY papel) FROM agri_colheita_lancamentos WHERE colheita_id = (v_reg->>'colheita_id')::uuid)
    || ' | 2a carga: funrural_lancado=' || (v_reg2->>'funrural_lancado') || ' papeis=' ||
      (SELECT string_agg(papel, ',' ORDER BY papel) FROM agri_colheita_lancamentos WHERE colheita_id = (v_reg2->>'colheita_id')::uuid);

  RAISE EXCEPTION 'ENSAIO (rollback): %', v_out;
END
$teste$;
