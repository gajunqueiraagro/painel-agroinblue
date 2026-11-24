-- ENTREGA-FUTURA-LIGAR-01 · João Rodrigo (Gabriel 23/11 12:31: "as 3 NFs 5101 de 18/11 SÃO ENTREGA do contrato das 10.000 sc, já pago; NÃO lançar
-- a pagar") — lote 35, DADO. As NFs 9.557.661 (R$ 46.320), 9.557.765 (R$ 47.000) e 9.557.818 (R$ 10.600) vieram como VENDA (CFOP 5101, sem
-- citar o faturamento) e por isso estão em "A lançar". Este lote as LIGA à compra do milho, como o "Ligar à compra" faz com as remessas:
--   1. um documento NF por nota na parcela 1/3 ("Compra 10.000 sc milho", bf889d10) — SEM arquivo: o XML está guardado na Receita
--      (`fiscal_dfe_recebidos`) e o DANFE sai dele na hora (o mesmo caminho dos 20 documentos sem arquivo de hoje); chave, nº, série, emissão,
--      valor e emitente vêm do próprio XML guardado;
--   2. vínculos dessas 3 notas às parcelas 2/3 e 3/3 (um registro, vínculos nas outras);
--   3. a TRILHA em `nota_fiscal_operacoes` (tipo 'remessa_ligada_a_compra', com cfop 5101 e o motivo).
-- Efeito: as 3 saem de "A lançar" (passam a "Já no sistema" pela chave no documento); nenhum lançamento é criado; nenhum valor muda.
-- Entregue no contrato: R$ 451.060 + R$ 103.920 = R$ 554.980 de R$ 600.000.
-- PRÉ-CONDIÇÕES (qualquer uma falha = nada grava): as 3 notas recebidas COM XML, do NJ, nenhuma já num documento vivo; as 3 parcelas vivas.
-- DESFAZER (o gesto contrário, com a operação gravada aqui):
--   UPDATE financeiro_lancamento_documentos SET cancelado = true, cancelado_em = now(), cancelado_motivo = '<motivo>'
--    WHERE id IN (SELECT (jsonb_array_elements_text(resumo->'documentos'))::uuid FROM nota_fiscal_operacoes
--                  WHERE tipo = 'remessa_ligada_a_compra' AND resumo->>'lote' = '20261028113500' AND desfeita_em IS NULL);
--   DELETE FROM financeiro_documento_vinculos WHERE documento_id IN (<os mesmos ids>);
--   UPDATE nota_fiscal_operacoes SET desfeita_em = now(), desfeita_motivo = '<motivo>' WHERE tipo = 'remessa_ligada_a_compra' AND resumo->>'lote' = '20261028113500';

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

DO $$
DECLARE
  v_p1 constant uuid := 'bf889d10-f79d-4e0c-a17f-783945fa4e63';
  v_p2 constant uuid := 'af2b86c6-ca6b-47a1-909e-d8729cddc3cf';
  v_p3 constant uuid := '575fcd2d-c48c-429f-9c76-158d6f7c4b43';
  v_recebidos constant uuid[] := ARRAY['46dcd8c0-cea4-4c65-9852-94bfeb877d60', '11e4bd94-0a67-4415-b33d-01b4af3db71e', '0bf12c28-316a-496f-ab12-899e518e2cc2']::uuid[];
  v_cli uuid; r record; v_doc uuid; v_docs uuid[] := '{}'; v_total bigint := 0;
BEGIN
  SELECT cliente_id INTO v_cli FROM public.financeiro_lancamentos_v2 WHERE id = v_p1;
  IF (SELECT count(*) FROM public.financeiro_lancamentos_v2 p WHERE p.id IN (v_p1, v_p2, v_p3) AND p.cliente_id = v_cli
       AND coalesce(p.cancelado, false) = false AND p.descricao LIKE 'Compra 10.000 sc milho _/3') <> 3 THEN
    RAISE EXCEPTION 'LOTE 35: as 3 parcelas da compra não estão vivas. Nada foi gravado.'; END IF;
  IF (SELECT count(*) FROM public.fiscal_dfe_recebidos x WHERE x.id = ANY (v_recebidos) AND x.cliente_id = v_cli AND x.xml IS NOT NULL
       AND ltrim(substr(x.chave, 26, 9), '0') IN ('9557661', '9557765', '9557818')) <> 3 THEN
    RAISE EXCEPTION 'LOTE 35: as 3 notas não estão como medidas (23/11). Nada foi gravado.'; END IF;
  IF EXISTS (SELECT 1 FROM public.fiscal_dfe_recebidos x JOIN public.financeiro_lancamento_documentos d
               ON d.cliente_id = x.cliente_id AND regexp_replace(coalesce(d.chave_acesso, ''), '\D', '', 'g') = x.chave AND d.cancelado IS NOT TRUE
             WHERE x.id = ANY (v_recebidos)) THEN
    RAISE EXCEPTION 'LOTE 35: uma das notas já está num documento vivo. Nada foi gravado.'; END IF;

  FOR r IN SELECT x.id, x.chave, x.emissao, x.valor_cent, x.emitente_nome, x.emitente_documento FROM public.fiscal_dfe_recebidos x
            WHERE x.id = ANY (v_recebidos) ORDER BY x.chave LOOP
    INSERT INTO public.financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, tipo, url, especie, numero, serie, chave_acesso,
      data_emissao, valor_documento, emitente_nome, emitente_documento, observacao)
    VALUES (v_cli, v_p1, format('NF %s (XML da Receita)', ltrim(substr(r.chave, 26, 9), '0')), 'application/xml', NULL, 'nf',
      ltrim(substr(r.chave, 26, 9), '0'), ltrim(substr(r.chave, 23, 3), '0'), r.chave, r.emissao, r.valor_cent / 100.0,
      r.emitente_nome, r.emitente_documento, 'Entrega do contrato de 10.000 sc (CFOP 5101): ligada à compra pelo lote 35; o XML está na Receita.')
    RETURNING id INTO v_doc;
    INSERT INTO public.financeiro_documento_vinculos (documento_id, documento_lancamento_id, lancamento_id, cliente_id)
    VALUES (v_doc, v_p1, v_p2, v_cli), (v_doc, v_p1, v_p3, v_cli);
    v_docs := v_docs || v_doc; v_total := v_total + r.valor_cent;
  END LOOP;

  INSERT INTO public.nota_fiscal_operacoes (cliente_id, tipo, resumo)
  VALUES (v_cli, 'remessa_ligada_a_compra', jsonb_build_object(
    'lote', '20261028113500', 'cfop', '5101', 'motivo', 'entrega do contrato de 10.000 sc faturada como venda (Gabriel 23/11 12:31)',
    'nfs', jsonb_build_array('9557661', '9557765', '9557818'), 'documentos', to_jsonb(v_docs), 'valor_cent', v_total,
    'depois', jsonb_build_object('documento_em', v_p1, 'ligado_a', jsonb_build_array(v_p2, v_p3))));
END $$;
