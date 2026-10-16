-- FIN-AMORT-COMPETENCIA-VENC-01 — BACKFILL (GO do Gabriel, 16/10/2026, depois da homologacao na tela).
-- As amortizacoes antigas de financiamento cujo ano_mes estava NULO ou fora do mes do vencimento passam a ter
-- data_competencia = data_vencimento (o ano_mes acompanha pelo gatilho). Medido e ensaiado em 16/10: 45 lancamentos
-- (Santa Rita 23, NJ 15, 537661af 5, a1b2c3d4 2). FORA, so' listado: o conciliado e0982c1c do Agnaldo (vai para o item 28).
-- Nada mais muda no lancamento (valor, status, contas, favorecido, plano, datas de vencimento e pagamento — provado por md5).
-- O ANTES fica em `fin_amort_competencia_venc_01_backfill` (uma linha por lancamento): o gesto contrario e'
--   UPDATE financeiro_lancamentos_v2 l SET data_competencia = b.competencia_antes FROM fin_amort_competencia_venc_01_backfill b
--    WHERE l.id = b.lancamento_id;   -- (e o ano_mes das 9 que eram NULAS volta pela coluna ano_mes_antes, a' mao)
-- Aborta se o alvo nao for exatamente 45 ou se algum fica fora do mes do vencimento.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE public.fin_amort_competencia_venc_01_backfill (
  lancamento_id      uuid PRIMARY KEY,
  cliente_id         uuid NOT NULL,
  competencia_antes  date,
  ano_mes_antes      text,
  data_vencimento    date NOT NULL,
  md5_campos_antes   text NOT NULL,
  gravado_em         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fin_amort_competencia_venc_01_backfill ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fin_amort_competencia_venc_01_backfill FROM PUBLIC, anon, authenticated;

INSERT INTO public.fin_amort_competencia_venc_01_backfill
  (lancamento_id, cliente_id, competencia_antes, ano_mes_antes, data_vencimento, md5_campos_antes)
SELECT l.id, l.cliente_id, l.data_competencia, l.ano_mes, l.data_vencimento,
       md5(concat_ws('|', l.valor, l.status_transacao, l.conta_bancaria_id, l.conta_destino_id, l.favorecido_id,
                     l.plano_conta_id, l.data_vencimento, l.data_pagamento, l.tipo_operacao, l.cancelado))
  FROM public.financeiro_lancamentos_v2 l
 WHERE l.origem_lancamento = 'parcela_financiamento' AND l.origem_tipo = 'parcela_principal'
   AND NOT coalesce(l.cancelado, false) AND l.data_vencimento IS NOT NULL
   AND (l.ano_mes IS NULL OR l.ano_mes <> to_char(l.data_vencimento, 'YYYY-MM'))
   AND NOT EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens ci WHERE ci.lancamento_id = l.id AND ci.desfeito_em IS NULL)
   AND NOT EXISTS (SELECT 1 FROM public.financeiro_fechamentos ff
                    WHERE ff.cliente_id = l.cliente_id AND ff.fazenda_id = l.fazenda_id AND ff.status_fechamento = 'fechado'
                      AND ff.ano_mes IN (l.ano_mes, to_char(l.data_vencimento, 'YYYY-MM')));

DO $bf$
DECLARE n_alvo int; n_upd int; n_ok int; n_md5 int;
BEGIN
  SELECT count(*) INTO n_alvo FROM public.fin_amort_competencia_venc_01_backfill;
  IF n_alvo IS DISTINCT FROM 45 THEN
    RAISE EXCEPTION 'FIN-AMORT-COMPETENCIA-VENC-01 backfill: alvo de % lancamentos, esperado 45. Abortado.', n_alvo;
  END IF;

  UPDATE public.financeiro_lancamentos_v2 l
     SET data_competencia = b.data_vencimento, updated_at = now()
    FROM public.fin_amort_competencia_venc_01_backfill b
   WHERE l.id = b.lancamento_id;
  GET DIAGNOSTICS n_upd = ROW_COUNT;

  SELECT count(*) FILTER (WHERE l.data_competencia = b.data_vencimento AND l.ano_mes = to_char(b.data_vencimento, 'YYYY-MM')),
         count(*) FILTER (WHERE md5(concat_ws('|', l.valor, l.status_transacao, l.conta_bancaria_id, l.conta_destino_id,
                                               l.favorecido_id, l.plano_conta_id, l.data_vencimento, l.data_pagamento,
                                               l.tipo_operacao, l.cancelado)) = b.md5_campos_antes)
    INTO n_ok, n_md5
    FROM public.fin_amort_competencia_venc_01_backfill b JOIN public.financeiro_lancamentos_v2 l ON l.id = b.lancamento_id;
  IF n_upd IS DISTINCT FROM 45 OR n_ok IS DISTINCT FROM 45 OR n_md5 IS DISTINCT FROM 45 THEN
    RAISE EXCEPTION 'FIN-AMORT-COMPETENCIA-VENC-01 backfill: atualizados %, no vencimento %, campos intactos % (de 45). Abortado.',
      n_upd, n_ok, n_md5;
  END IF;
END $bf$;
