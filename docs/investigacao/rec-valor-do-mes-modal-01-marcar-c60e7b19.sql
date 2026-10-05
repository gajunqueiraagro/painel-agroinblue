-- REC-VALOR-DO-MES-MODAL-01 — marca do valor do mes na c60e7b19 (Vera, "Folha Pagamento - Ferias"), 05/10/2026.
--
-- POR QUE: a ocorrencia foi editada as 14:15 UTC de 05/10 pelo build ANTERIOR ao REC-VALOR-DO-MES-MODAL-01 (que ainda nao
-- marcava): valor 2.448,47 contra o valor base 1.838,80 da recorrencia e392ea74, em aberto e SEM marca — o proximo Propagar
-- da regra a reescreveria. Decisao do Gabriel (05/10): marcar 'manual'.
--
-- O QUE FAZ: UMA linha, numa transacao (o bloco DO e' atomico), com trava — exige exatamente 1 linha afetada, senao aborta
-- e nada fica. So' as duas colunas da marca; `updated_at` so' o que o banco fizer sozinho.
-- GESTO CONTRARIO: UPDATE … SET valor_do_mes_em = NULL, valor_do_mes_origem = NULL WHERE id = 'c60e7b19-4153-42e2-b80f-dffde4e53392'.
DO $marcar$
DECLARE
  v_n int;
BEGIN
  UPDATE public.financeiro_lancamentos_v2
     SET valor_do_mes_em = now(), valor_do_mes_origem = 'manual'
   WHERE id = 'c60e7b19-4153-42e2-b80f-dffde4e53392'
     AND cliente_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
     AND valor = 2448.47 AND valor_do_mes_em IS NULL AND recorrencia_id IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'REC-VALOR-DO-MES-MODAL-01: esperava 1 linha afetada, foram % — nada gravado', v_n;
  END IF;
END
$marcar$;
