-- NOTA-ENTREGA-FUTURA-01 · conserto Sementes Pastoforma (NJ) — OK do Gabriel 25/11 07:24 e 07:44 ("30.436 vira Entrega 1") — DADO.
-- O lançamento de R$ 18.800 (`5d0422e8`, programado, boleto, vence 10/12) foi criado pela REMESSA (NF 30.436, CFOP 5116) e o FATURAMENTO
-- (NF 30.150, CFOP 5922 = a compra) estava solto em "A lançar": lançá-lo dobraria a conta. A regra: o faturamento é a compra; a remessa só
-- fica anexada ao MESMO lançamento.
--   1. o lançamento passa a NF 30.150 (`numero_documento`); valor, vencimento, classificação e status NÃO mudam;
--   2. um documento NF 30.150 SEM arquivo (o XML está na caixa da Receita; o DANFE sai dele na hora), com chave, nº, série, emissão, valor e
--      emitente do próprio XML guardado;
--   3. os 2 documentos da NF 30.436 (XML e DANFE) FICAM como a ENTREGA 1 da compra (o papel sai do CFOP 5116 da nota: entrega, sem
--      financeiro), com a observação dizendo isso;
--   4. a TRILHA em `nota_fiscal_operacoes` (tipo 'remessa_ligada_a_compra', com o antes).
-- PRÉ-CONDIÇÕES (qualquer uma falha = nada grava): o lançamento vivo, R$ 18.800, com a NF 30.436; a NF 30.150 recebida com XML, do mesmo
-- emitente; nenhum documento vivo da NF 30.150 no cliente.
-- DESFAZER: cancelar o documento NF 30.150 (o id está no resumo da operação), voltar `numero_documento` para o `antes` do resumo, limpar a
-- observação dos 2 documentos da 30.436 e marcar a operação como desfeita.

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

DO $$
DECLARE
  v_lanc constant uuid := '5d0422e8-5944-4783-82be-34c97c06f4f8';
  l record; r record; v_doc uuid; v_antes text; v_obs constant text := 'Entrega 1 da compra NF 30.150 (remessa, CFOP 5116): sem financeiro.';
BEGIN
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = v_lanc;
  IF l.id IS NULL OR coalesce(l.cancelado, false) OR abs(abs(l.valor) - 18800) >= 0.01 OR ltrim(regexp_replace(coalesce(l.numero_documento, ''), '\D', '', 'g'), '0') <> '30436' THEN
    RAISE EXCEPTION 'PASTOFORMA: o lançamento não está como medido (vivo, R$ 18.800, NF 30.436). Nada foi gravado.';
  END IF;
  SELECT x.* INTO r FROM public.fiscal_dfe_recebidos x
   WHERE x.cliente_id = l.cliente_id AND x.xml IS NOT NULL AND ltrim(substr(x.chave, 26, 9), '0') = '30150'
     AND substr(x.chave, 21, 2) = '55' AND x.emitente_documento = '14569980000152';
  IF r.id IS NULL THEN RAISE EXCEPTION 'PASTOFORMA: a NF 30.150 não está na caixa com XML. Nada foi gravado.'; END IF;
  IF EXISTS (SELECT 1 FROM public.financeiro_lancamento_documentos d WHERE d.cliente_id = l.cliente_id AND d.cancelado IS NOT TRUE
              AND regexp_replace(coalesce(d.chave_acesso, ''), '\D', '', 'g') = r.chave) THEN
    RAISE EXCEPTION 'PASTOFORMA: a NF 30.150 já está num documento vivo. Nada foi gravado.';
  END IF;

  v_antes := l.numero_documento;
  UPDATE public.financeiro_lancamentos_v2 SET numero_documento = '000.030.150' WHERE id = v_lanc;

  INSERT INTO public.financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, tipo, url, especie, numero, serie, chave_acesso,
    data_emissao, valor_documento, emitente_nome, emitente_documento, observacao)
  VALUES (l.cliente_id, v_lanc, 'NF 30150 (XML da Receita)', 'application/xml', NULL, 'nf', '000.030.150', ltrim(substr(r.chave, 23, 3), '0'),
    r.chave, r.emissao, r.valor_cent / 100.0, r.emitente_nome, r.emitente_documento,
    'Compra (simples faturamento, CFOP 5922): gera a conta e vai no LCDPR; a NF 30.436 é a Entrega 1.')
  RETURNING id INTO v_doc;

  UPDATE public.financeiro_lancamento_documentos SET observacao = v_obs
   WHERE lancamento_id = v_lanc AND cliente_id = l.cliente_id AND cancelado IS NOT TRUE
     AND ltrim(regexp_replace(coalesce(numero, ''), '\D', '', 'g'), '0') = '30436';

  INSERT INTO public.nota_fiscal_operacoes (cliente_id, tipo, resumo)
  VALUES (l.cliente_id, 'remessa_ligada_a_compra', jsonb_build_object(
    'lote', '20261028113540', 'caso', 'Sementes Pastoforma', 'motivo', 'lançamento criado pela remessa; a compra é o faturamento (Gabriel 25/11 07:24)',
    'lancamento', v_lanc, 'faturamento', jsonb_build_object('nf', '30150', 'cfop', '5922', 'documento', v_doc),
    'remessa', jsonb_build_object('nf', '30436', 'cfop', '5116', 'papel', 'Entrega 1'),
    'antes', jsonb_build_object('numero_documento', v_antes)));
END $$;
