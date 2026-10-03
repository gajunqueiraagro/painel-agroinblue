-- PR-CONC-IMPORT-BANCO-01B (fechamento) — limpeza do 5o cabecalho vazio do Agnaldo
--
-- POR QUE: em 03/10 17:30:51 UTC uma tentativa de importar o CSV de set/26 do Bradesco (186a093b) caiu na falha antiga — o
-- cabecalho era gravado num pedido e os movimentos em outro, e o lote estourou 23505 pelos dois movimentos identicos de 0,13 —
-- e deixou o cabecalho e56f5c3b 'processada' sem nenhum movimento. A tentativa seguinte (58722427, 17:31:39) entrou. Os outros 4
-- cabecalhos vazios do dia sairam na 20261027191900 (PR-CONC-IMPORT-BANCO-AGNALDO-01A); este ficou de fora porque nasceu depois
-- da medicao. Mesma guarda (0 extratos e 0 lancamentos ligados) e o mesmo registro: a linha inteira e o gesto contrario em
-- `conc_import_agnaldo_01a_backfill`.

DO $limpa$
DECLARE v_id uuid; v_n int;
BEGIN
  SELECT i.id INTO v_id FROM financeiro_importacoes_v2 i
   WHERE left(i.id::text, 8) = 'e56f5c3b'
     AND i.cliente_id = 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2' AND i.conta_bancaria_id = '186a093b-0204-4164-95e3-0dd247457ffa'
     AND i.status = 'processada' AND i.created_at BETWEEN '2026-10-03 17:30:00+00' AND '2026-10-03 17:31:00+00'
     AND NOT EXISTS (SELECT 1 FROM extrato_bancario_v2 e WHERE e.importacao_id = i.id)
     AND NOT EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 l WHERE l.lote_importacao_id = i.id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'o cabecalho e56f5c3b nao esta no estado medido (vazio, processada, 17:30 UTC). Migration abortada.';
  END IF;

  INSERT INTO conc_import_agnaldo_01a_backfill (tabela, registro_id, campos, antes, gesto_contrario)
  SELECT 'financeiro_importacoes_v2', i.id, ARRAY['(linha removida)'], to_jsonb(i),
         format('INSERT INTO financeiro_importacoes_v2 SELECT * FROM jsonb_populate_record(NULL::financeiro_importacoes_v2, %L::jsonb);', to_jsonb(i))
    FROM financeiro_importacoes_v2 i WHERE i.id = v_id;

  DELETE FROM financeiro_importacoes_v2 i WHERE i.id = v_id
     AND NOT EXISTS (SELECT 1 FROM extrato_bancario_v2 e WHERE e.importacao_id = i.id)
     AND NOT EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 l WHERE l.lote_importacao_id = i.id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'limpeza: % cabecalho removido (esperado 1)', v_n; END IF;
END $limpa$;