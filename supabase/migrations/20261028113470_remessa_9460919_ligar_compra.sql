-- ENTREGA-FUTURA-LIGAR-01 · a remessa 9.460.919 (Gabriel 22/11; o Code 3 confirmou que o milho NÃO foi pago em dobro) — lote 32, DADO.
-- O lançamento programado de R$ 47.140 (16/10, "Milho Debulhado - a Granel") nasceu da REMESSA de entrega futura 9.460.919 (CFOP 5116),
-- que não gera pagamento: ele cobraria o milho duas vezes. Este lote:
--   1. MOVE o documento da NF 9.460.919 (o XML, vivo) do lançamento programado para a COMPRA — a parcela 1/3 ("Compra 10.000 sc milho") —
--      e o LIGA às parcelas 2/3 e 3/3 (o mesmo do "Ligar à compra": um registro, vínculos nas outras); o confronto (lote 30) a lê informativa;
--   2. CANCELA o lançamento programado (motivo "remessa de entrega futura: não gera pagamento"), como `fn_cancelar_lancamento_auditoria`
--      faria — sem conciliação, boleto nem vínculo para desfazer (conferido na pré-condição);
--   3. grava a TRILHA em `nota_fiscal_operacoes` (tipo NOVO 'remessa_ligada_a_compra': antes e depois, ids — o CHECK do tipo ganha o valor).
-- PRÉ-CONDIÇÕES (qualquer uma falha = nada grava): o lançamento existe, está programado, não cancelado, sem pagamento, sem conciliação viva,
-- sem boleto vivo, sem vínculo, mês aberto; o documento é o único vivo dele, NF, com a chave da 9.460.919; as 3 parcelas vivas.
-- DESFAZER (o gesto contrário, com a operação gravada aqui):
--   UPDATE financeiro_lancamentos_v2 SET cancelado = false, cancelado_em = NULL, cancelado_por = NULL, cancelado_motivo = NULL
--    WHERE id = '80d9a036-6251-4f72-b637-4954dd29bd9d';
--   DELETE FROM financeiro_documento_vinculos WHERE documento_id = '3c9b323e-3d3f-43ea-916d-8cc542dd1919';
--   UPDATE financeiro_lancamento_documentos SET lancamento_id = '80d9a036-6251-4f72-b637-4954dd29bd9d' WHERE id = '3c9b323e-3d3f-43ea-916d-8cc542dd1919';
--   UPDATE nota_fiscal_operacoes SET desfeita_em = now(), desfeita_motivo = '<motivo>' WHERE tipo = 'remessa_ligada_a_compra'
--    AND resumo->>'lancamento_cancelado' = '80d9a036-6251-4f72-b637-4954dd29bd9d';

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

ALTER TABLE public.nota_fiscal_operacoes DROP CONSTRAINT nota_fiscal_operacoes_tipo_check;
ALTER TABLE public.nota_fiscal_operacoes ADD CONSTRAINT nota_fiscal_operacoes_tipo_check
  CHECK (tipo = ANY (ARRAY['backfill'::text, 'leitura'::text, 'reprocessar'::text, 'registro_posterior'::text, 'remessa_ligada_a_compra'::text]));

DO $$
DECLARE
  v_lanc constant uuid := '80d9a036-6251-4f72-b637-4954dd29bd9d';
  v_doc  constant uuid := '3c9b323e-3d3f-43ea-916d-8cc542dd1919';
  v_p1   constant uuid := 'bf889d10-f79d-4e0c-a17f-783945fa4e63';
  v_p2   constant uuid := 'af2b86c6-ca6b-47a1-909e-d8729cddc3cf';
  v_p3   constant uuid := '575fcd2d-c48c-429f-9c76-158d6f7c4b43';
  l public.financeiro_lancamentos_v2%ROWTYPE;
  d public.financeiro_lancamento_documentos%ROWTYPE;
BEGIN
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = v_lanc FOR UPDATE;
  IF NOT FOUND OR coalesce(l.cancelado, false) OR l.status_transacao <> 'programado' OR l.data_pagamento IS NOT NULL OR l.valor <> 47140 THEN
    RAISE EXCEPTION 'LOTE 32: o lançamento programado não está como medido (22/11). Nada foi gravado.'; END IF;
  IF EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens c WHERE c.lancamento_id = v_lanc AND c.desfeito_em IS NULL)
     OR EXISTS (SELECT 1 FROM public.boleto_lancamentos b WHERE b.lancamento_id = v_lanc AND b.vivo)
     OR EXISTS (SELECT 1 FROM public.financeiro_documento_vinculos x WHERE x.lancamento_id = v_lanc OR x.documento_lancamento_id = v_lanc)
     OR EXISTS (SELECT 1 FROM public.financeiro_fechamentos f WHERE f.cliente_id = l.cliente_id AND f.fazenda_id = l.fazenda_id
                AND f.ano_mes = l.ano_mes AND f.status_fechamento = 'fechado') THEN
    RAISE EXCEPTION 'LOTE 32: o lançamento tem conciliação, boleto, vínculo ou mês fechado. Nada foi gravado.'; END IF;
  SELECT * INTO d FROM public.financeiro_lancamento_documentos WHERE id = v_doc FOR UPDATE;
  IF NOT FOUND OR d.lancamento_id <> v_lanc OR d.cancelado IS TRUE OR d.especie <> 'nf' OR ltrim(substr(d.chave_acesso, 26, 9), '0') <> '9460919'
     OR (SELECT count(*) FROM public.financeiro_lancamento_documentos x WHERE x.lancamento_id = v_lanc AND x.cancelado IS NOT TRUE) <> 1 THEN
    RAISE EXCEPTION 'LOTE 32: o documento da NF 9.460.919 não está como medido. Nada foi gravado.'; END IF;
  IF (SELECT count(*) FROM public.financeiro_lancamentos_v2 p WHERE p.id IN (v_p1, v_p2, v_p3) AND p.cliente_id = l.cliente_id
       AND coalesce(p.cancelado, false) = false AND p.descricao LIKE 'Compra 10.000 sc milho _/3') <> 3 THEN
    RAISE EXCEPTION 'LOTE 32: as 3 parcelas da compra não estão vivas. Nada foi gravado.'; END IF;

  /* 1. o documento vai para a compra: registrado na 1/3 e ligado às outras duas */
  UPDATE public.financeiro_lancamento_documentos SET lancamento_id = v_p1 WHERE id = v_doc;
  INSERT INTO public.financeiro_documento_vinculos (documento_id, documento_lancamento_id, lancamento_id, cliente_id)
  VALUES (v_doc, v_p1, v_p2, l.cliente_id), (v_doc, v_p1, v_p3, l.cliente_id);

  /* 2. o lançamento programado sai (como o cancelamento de auditoria: sem conciliação a desfazer) */
  UPDATE public.financeiro_lancamentos_v2
     SET cancelado = true, cancelado_em = now(), cancelado_motivo = 'remessa de entrega futura (NF 9.460.919, CFOP 5116): não gera pagamento; a nota foi ligada à compra'
   WHERE id = v_lanc;

  /* 3. a trilha */
  INSERT INTO public.nota_fiscal_operacoes (cliente_id, tipo, resumo)
  VALUES (l.cliente_id, 'remessa_ligada_a_compra', jsonb_build_object(
    'lote', '20261028113470', 'nf', '9460919', 'documento', v_doc, 'lancamento_cancelado', v_lanc, 'valor_cancelado', l.valor,
    'antes', jsonb_build_object('documento_em', v_lanc), 'depois', jsonb_build_object('documento_em', v_p1, 'ligado_a', jsonb_build_array(v_p2, v_p3))));
END $$;
