-- NOTA-ENTREGA-FUTURA-01 (3) · Gabriel 25/11 09:26: "competência do lançamento = emissão da COMPRA, não da remessa — regra para todos" — DADO.
-- O lançamento da Sementes Pastoforma (`5d0422e8`) nasceu da REMESSA (NF 30.436, emitida 23/11) e ficou com a competência dela; o lote 113540
-- trocou a NF para a COMPRA (30.150, emitida 10/11) e não mexeu na competência (falha minha). Aqui a competência passa a 10/11/2026.
-- · Medido no proto (25/11): dos lançamentos com remessa ligada, só este tem a NF da compra (`fn_lancamento_entregas`) e a competência fora da
--   emissão dela; os outros (balança, fungicida, milho) não têm a compra no lançamento: nada a mudar.
-- · Daqui para frente: o "trocar para esta NF" da tela da nota e o completar pela nota levam a competência = emissão da nota que é a compra;
--   ligar uma entrega nunca mexe na competência.
-- · Só a competência. Vencimento, valor, status, classificação e safra NÃO mudam (a safra da competência é a mesma nas duas datas: conferido).
-- PRÉ-CONDIÇÕES (qualquer uma falha = nada grava): o lançamento vivo, não parcela, com a competência 23/11/2026 e a NF 30.150; a NF 30.150 é o
-- documento vivo dele, emitida em 10/11/2026.
-- DESFAZER: voltar `data_competencia` para o `antes` do resumo da operação e marcar a operação como desfeita.

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

DO $$
DECLARE
  v_lanc constant uuid := '5d0422e8-5944-4783-82be-34c97c06f4f8';
  l record; v_emissao date;
BEGIN
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = v_lanc;
  IF l.id IS NULL OR coalesce(l.cancelado, false) OR l.financiamento_id IS NOT NULL OR l.data_competencia <> DATE '2026-11-23'
     OR ltrim(regexp_replace(coalesce(l.numero_documento, ''), '\D', '', 'g'), '0') <> '30150' THEN
    RAISE EXCEPTION 'PASTOFORMA-COMPETENCIA: o lançamento não está como medido (vivo, não parcela, competência 23/11/2026, NF 30.150). Nada foi gravado.';
  END IF;
  SELECT d.data_emissao INTO v_emissao FROM public.financeiro_lancamento_documentos d
   WHERE d.lancamento_id = v_lanc AND d.cliente_id = l.cliente_id AND d.cancelado IS NOT TRUE AND d.especie = 'nf'
     AND ltrim(regexp_replace(coalesce(d.numero, ''), '\D', '', 'g'), '0') = '30150'
   LIMIT 1;
  IF v_emissao IS DISTINCT FROM DATE '2026-11-10' THEN
    RAISE EXCEPTION 'PASTOFORMA-COMPETENCIA: a NF 30.150 não está no lançamento com a emissão 10/11/2026. Nada foi gravado.';
  END IF;

  UPDATE public.financeiro_lancamentos_v2 SET data_competencia = v_emissao WHERE id = v_lanc;

  INSERT INTO public.nota_fiscal_operacoes (cliente_id, tipo, resumo)
  VALUES (l.cliente_id, 'remessa_ligada_a_compra', jsonb_build_object(
    'lote', '20261028113570', 'caso', 'Sementes Pastoforma', 'ajuste', 'competencia',
    'motivo', 'competência = emissão da COMPRA (NF 30.150), não da remessa (Gabriel 25/11 09:26)',
    'lancamento', v_lanc, 'antes', jsonb_build_object('data_competencia', l.data_competencia), 'depois', jsonb_build_object('data_competencia', v_emissao)));
END $$;
