-- BAIXA-DESCONTO-BANCO-01 (FILA 19/11 08:38, P1 aprovada) — o LOTE do único caso medido (varredura de todos os clientes, 19/11): a NF que
-- casou com 'desconto' antes da 115580. Sem ela, o caixa da conta conta a NF cheia. Aqui a NF se divide pela MESMA função do casar
-- (`_fn_conc_parte_do_desconto`): fica com o que o banco pagou (o já ligado ao extrato) e a diferença vira a parte paga com desconto (sem caixa).
-- O "depois" do casar passa ao valor novo, para o desfazer devolver o valor cheio (R3).
-- DESFAZER este lote (sem desfazer o casar): cancelar a parte (`origem_tipo = 'conc:desconto_parte'`, `saldo_de_id` = a NF) com motivo,
-- marcar `desfeita_em` na linha 'desconto_parte' da trilha, voltar a NF a 4.863,35 com `app.conc_dividindo` = on e o "depois" do casar a 4.863,35.
-- Guardado: a NF, o vínculo vivo e o desconto têm de estar como medidos; qualquer diferença = nada gravado.

SET LOCAL lock_timeout = '2s';

DO $l$
DECLARE v_nf uuid := '144185ba-0a70-46d5-8435-5162ffca04fa'; v_desc uuid := '328eeabc-8494-4d14-b8ab-ac5b0422aca8'; v_parte uuid; v_n int;
BEGIN
  PERFORM set_config('app.via', 'BAIXA-DESCONTO-BANCO-01 lote 115590 (Gabriel 19/11)', true);
  IF NOT EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 WHERE id = v_nf AND cancelado IS NOT TRUE AND valor = 4863.35 AND sinal = '-1'
                   AND status_transacao = 'realizado' AND data_pagamento = date '2026-10-20' AND sem_movimentacao_caixa IS NOT TRUE)
     OR (SELECT sum(valor_aplicado) FROM public.conciliacao_bancaria_itens WHERE lancamento_id = v_nf AND desfeito_em IS NULL) IS DISTINCT FROM 3850.00
     OR NOT EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 WHERE id = v_desc AND cancelado IS NOT TRUE AND valor = 1013.35
                      AND origem_tipo = 'conc:desconto' AND sem_movimentacao_caixa)
     OR NOT EXISTS (SELECT 1 FROM public.financeiro_baixas_no_vinculo WHERE lancamento_id = v_nf AND tipo = 'desconto' AND irmao_id = v_desc
                      AND valor_aplicado = 1013.35 AND desfeita_em IS NULL)
     OR EXISTS (SELECT 1 FROM public.financeiro_baixas_no_vinculo WHERE lancamento_id = v_nf AND tipo = 'desconto_parte')
     OR (SELECT count(*) FROM public.financeiro_baixas_no_vinculo WHERE lancamento_id = v_nf AND tipo = 'casar' AND desfeita_em IS NULL
           AND (depois->>'valor')::numeric = 4863.35) <> 1 THEN
    RAISE EXCEPTION 'lote 115590: a NF 404 não está como medida em 19/11. Nada gravado.';
  END IF;
  v_parte := public._fn_conc_parte_do_desconto(v_nf, 1013.35, date '2026-10-20',
                                               'BAIXA-DESCONTO-BANCO-01: o desconto da NF não sai do banco (lote 115590)');
  UPDATE public.financeiro_baixas_no_vinculo SET depois = jsonb_set(depois, '{valor}', to_jsonb(3850.00))
   WHERE lancamento_id = v_nf AND tipo = 'casar' AND desfeita_em IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1
     OR (SELECT valor FROM public.financeiro_lancamentos_v2 WHERE id = v_nf) <> 3850.00
     OR (SELECT valor::text || sem_movimentacao_caixa::text || status_transacao || data_pagamento::text FROM public.financeiro_lancamentos_v2 WHERE id = v_parte)
        <> '1013.35truerealizado2026-10-20' THEN
    RAISE EXCEPTION 'lote 115590: o resultado não é o esperado. Nada gravado.';
  END IF;
  RAISE NOTICE 'lote 115590: NF % = 3.850,00 · parte paga com desconto % = 1.013,35 (sem caixa)', v_nf, v_parte;
END $l$;
