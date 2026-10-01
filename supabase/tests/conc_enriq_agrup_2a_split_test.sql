-- PR-CONC-ENRIQ-AGRUP-2a — teste da fn_classificacao_split_substituir em ROLLBACK (termina em RAISE: nada fica gravado).
-- Rodado em 01/10/2026 no proto (canal de escrita, como o admin 7bd0b6ad via request.jwt.claims). Saida obtida:
--   T1 recorrencia: origem_recorrencia · T2 financiamento: origem_financiamento · T3 oc parte viva (ofx): origem_oc_parte_viva
--   T4 importacao_incremental: origem_nao_desmembravel · T6 soma -0,01: soma_divergente dif=-0.01 · T5 mes fechado: mes_fechado 2026-08
--   T7 sucesso: substituido, extrato conciliado; os 2 novos com comp=2026-08-15 venc=2026-08-20 safra tdoc=Recibo forma=PIX
--   doc=NF-TESTE-1 desc=Prod A obs=obs teste, origem mesa_split, UM grupo_id, tipo agrupamento_manual; consolidado cancelado,
--   0 vinculos vivos nele, 2 linhas aplicadas.
-- As recusas tambem foram chamadas pelo rpc do app (supabase-js, sessao do admin) — mesmos motivos, sem escrita.
DO $ensaio$
DECLARE
  v_out text := '';
  v_ses uuid := '8d6efeb7-7c62-4a1f-bcca-32e14a386fc2';
  v_cru uuid := 'c743bf98-fc9a-4ef0-9ea8-6dd4578462b6';
  v_s1 uuid := gen_random_uuid(); v_s2 uuid := gen_random_uuid();
  v_prop jsonb; v_r jsonb; v_fech uuid; v_ids uuid[];
  r record;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', true);
  v_prop := jsonb_build_object('subcentro','Devolução de Adiantamento - Parceiro Lavoura','plano_conta_id','c9ade813-af32-4d68-9f81-a2a70a7451f5',
    'fazenda_id','8d173d9c-4c26-4593-ae6a-8f76a5a98045','safra_id','55d99920-add0-4091-b1a7-0b0ce3faaedb',
    'tipo_documento','Recibo','forma_pagamento','PIX','data_vencimento','2026-08-20','numero_documento','NF-TESTE-1',
    'observacao','obs teste','data_competencia','2026-08-15','produto','Prod A');
  INSERT INTO financeiro_classificacao_staging
  SELECT (jsonb_populate_record(NULL::financeiro_classificacao_staging, to_jsonb(s) || jsonb_build_object(
     'staging_id', x.id, 'excel_linha_origem', x.lin, 'excel_valor', x.v, 'excel_data', '2026-08-05', 'excel_data_pagamento', '2026-08-05',
     'excel_tipo_operacao','1-Entradas','conta_origem_id','3b9afa7a-0af6-4bce-8ec9-03b91484dfd8','conta_destino_id',NULL,
     'match_status','sem_match','match_lancamento_id',NULL,'match_lancamento_ids',NULL,'aplicado',false,'casamento_meta',NULL,
     'update_proposto', v_prop))).*
    FROM financeiro_classificacao_staging s,
         (VALUES (v_s1, 99001, 3000.00), (v_s2, 99002, 1007.41)) AS x(id, lin, v)
   WHERE s.staging_id = (SELECT staging_id FROM financeiro_classificacao_staging WHERE sessao_id = v_ses LIMIT 1);

  v_r := fn_classificacao_split_substituir('0e997dca-d601-44e6-a476-b6276e7dec13', v_ses, ARRAY[v_s1, v_s2]);
  v_out := v_out || E'\nT1 recorrencia: ' || (v_r->>'motivo');
  v_r := fn_classificacao_split_substituir('5f94dcf3-036b-4ead-8adf-c07d853edc4f', v_ses, ARRAY[v_s1, v_s2]);
  v_out := v_out || E'\nT2 financiamento: ' || (v_r->>'motivo');
  v_r := fn_classificacao_split_substituir('fd145f97-782f-4af4-85f2-63bdd16952bf', v_ses, ARRAY[v_s1, v_s2]);
  v_out := v_out || E'\nT3 oc parte viva (ofx): ' || (v_r->>'motivo');
  v_r := fn_classificacao_split_substituir('a2a96457-06aa-4ecd-8cd5-77dfb1969a49', v_ses, ARRAY[v_s1, v_s2]);
  v_out := v_out || E'\nT4 importacao_incremental: ' || (v_r->>'motivo') || ' | ' || (v_r->>'mensagem');

  -- soma 1 centavo abaixo
  v_r := fn_classificacao_split_substituir(v_cru, v_ses, ARRAY[v_s1, v_s2]);
  v_out := v_out || E'\nT6 soma -0,01: ' || (v_r->>'motivo') || ' dif=' || (v_r->>'diferenca') || ' | ' || (v_r->>'mensagem');

  UPDATE financeiro_classificacao_staging SET excel_valor = 1007.42 WHERE staging_id = v_s2;

  -- mes fechado no consolidado
  INSERT INTO financeiro_fechamentos (cliente_id, fazenda_id, ano_mes, status_fechamento)
  VALUES ('f2d67cd4-24d0-456f-a079-a3281dcce7fd', '8d173d9c-4c26-4593-ae6a-8f76a5a98045', '2026-08', 'fechado') RETURNING id INTO v_fech;
  v_r := fn_classificacao_split_substituir(v_cru, v_ses, ARRAY[v_s1, v_s2]);
  v_out := v_out || E'\nT5 mes fechado: ' || (v_r->>'motivo') || ' ' || COALESCE(v_r->>'ano_mes','');
  DELETE FROM financeiro_fechamentos WHERE id = v_fech;

  -- sucesso
  v_r := fn_classificacao_split_substituir(v_cru, v_ses, ARRAY[v_s1, v_s2]);
  v_out := v_out || E'\nT7 sucesso: ' || (v_r->>'motivo') || ' status_extrato=' || (v_r->>'status_extrato_final');
  SELECT array_agg(x::uuid) INTO v_ids FROM jsonb_array_elements_text(v_r->'lancamentos_criados') x;
  FOR r IN SELECT l.valor, l.data_competencia, l.data_pagamento, l.data_vencimento, l.safra_id, l.tipo_documento, l.forma_pagamento,
                  l.numero_documento, l.descricao, l.observacao, l.subcentro, l.plano_conta_id, l.fazenda_id, l.origem_lancamento,
                  c.grupo_id, c.tipo_aprovacao, c.valor_aplicado
             FROM financeiro_lancamentos_v2 l JOIN conciliacao_bancaria_itens c ON c.lancamento_id = l.id AND c.desfeito_em IS NULL
            WHERE l.id = ANY(v_ids) ORDER BY l.valor LOOP
    v_out := v_out || E'\n   novo: ' || r.valor || ' comp=' || r.data_competencia || ' pgto=' || r.data_pagamento || ' venc=' || COALESCE(r.data_vencimento::text,'-')
      || ' safra=' || COALESCE(left(r.safra_id::text,8),'-') || ' tdoc=' || COALESCE(r.tipo_documento,'-') || ' forma=' || COALESCE(r.forma_pagamento,'-')
      || ' doc=' || COALESCE(r.numero_documento,'-') || ' desc=' || COALESCE(r.descricao,'-') || ' obs=' || COALESCE(left(r.observacao,20),'-')
      || ' sub=' || COALESCE(r.subcentro,'-') || ' faz=' || left(r.fazenda_id::text,8) || ' orig=' || r.origem_lancamento
      || ' grupo=' || COALESCE(left(r.grupo_id::text,8),'NULL') || ' tipo=' || r.tipo_aprovacao || ' aplic=' || r.valor_aplicado;
  END LOOP;
  v_out := v_out || E'\n   grupos distintos: ' || (SELECT count(DISTINCT c.grupo_id) FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = ANY(v_ids) AND c.desfeito_em IS NULL)
    || ' | consolidado cancelado: ' || (SELECT cancelado FROM financeiro_lancamentos_v2 WHERE id = v_cru)
    || ' | cbi do consolidado vivos: ' || (SELECT count(*) FROM conciliacao_bancaria_itens WHERE lancamento_id = v_cru AND desfeito_em IS NULL)
    || ' | linhas aplicadas: ' || (SELECT count(*) FROM financeiro_classificacao_staging WHERE staging_id IN (v_s1, v_s2) AND aplicado);

  RAISE EXCEPTION 'ENSAIO (rollback): %', v_out;
END
$ensaio$;
