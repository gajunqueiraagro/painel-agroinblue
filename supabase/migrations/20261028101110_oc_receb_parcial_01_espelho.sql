-- OC-RECEB-PARCIAL-01 (tela) — a Conferencia diz QUAL parcela da OC e QUAL linha e' a falta. So' campos novos no retorno de
-- `fn_extratos_espelhados` (aditivos; a versao fica 'espelhados-06-adiantados'):
--   · `oc_parcela` ('1/2', '2/2' — so' quando a OC tem mais de uma parcela daquele compromisso) na linha do sistema e no candidato:
--     a tela escreve "Venda 050 Desmama F · Receb. 1/2" em vez do "· Recebimento" de todas as parcelas;
--   · `saldo_de_id` no candidato: a falta que nasceu de um vinculo parcial (CONC-BAIXA-NO-VINCULO-01 / OC-RECEB-PARCIAL-01) — a tela a
--     mostra uma vez, em cinza, fora do fechamento ("Falta receber R$ X · ... · em aberto").
-- Troca guardada pelo md5 de ORIGEM; cada trecho uma vez.

SET LOCAL lock_timeout = '3s';

CREATE FUNCTION pg_temp._trocar(p_fn regprocedure, p_md5 text, p_trocas text[]) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_def text; i int;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p_fn) <> p_md5 THEN
    RAISE EXCEPTION 'OC-RECEB-PARCIAL-01 (espelho): corpo de origem de % divergente', p_fn;
  END IF;
  v_def := pg_get_functiondef(p_fn);
  FOR i IN 1 .. array_length(p_trocas, 1) / 2 LOOP
    IF (length(v_def) - length(replace(v_def, p_trocas[2 * i - 1], ''))) / length(p_trocas[2 * i - 1]) <> 1 THEN
      RAISE EXCEPTION 'OC-RECEB-PARCIAL-01 (espelho): trecho % nao achado uma vez', i;
    END IF;
    v_def := replace(v_def, p_trocas[2 * i - 1], p_trocas[2 * i]);
  END LOOP;
  EXECUTE v_def;
END $f$;

SELECT pg_temp._trocar('public.fn_extratos_espelhados(uuid, uuid, text)'::regprocedure, '02435d8a4466ed100aad8ebbefbe8a63', ARRAY[
  $a$(SELECT f.nome FROM financeiro_fornecedores f WHERE f.id = l.favorecido_id) AS fornecedor FROM financeiro_lancamentos_v2 l JOIN pp ON true WHERE l.cliente_id = pp.cli AND l.data_pagamento BETWEEN$a$,
  $a$(SELECT f.nome FROM financeiro_fornecedores f WHERE f.id = l.favorecido_id) AS fornecedor, (SELECT pt.sequencia_parcela || '/' || pt.quantidade_parcelas FROM zoo_operacao_partes pt WHERE pt.financeiro_lancamento_id = l.id AND pt.cancelada IS NOT TRUE AND pt.quantidade_parcelas > 1 LIMIT 1) AS oc_parcela FROM financeiro_lancamentos_v2 l JOIN pp ON true WHERE l.cliente_id = pp.cli AND l.data_pagamento BETWEEN$a$,
  $b$(l.data_vencimento > pp.d2) AS adiantado,$b$,
  $b$(l.data_vencimento > pp.d2) AS adiantado, l.saldo_de_id, (SELECT pt.sequencia_parcela || '/' || pt.quantidade_parcelas FROM zoo_operacao_partes pt WHERE pt.financeiro_lancamento_id = l.id AND pt.cancelada IS NOT TRUE AND pt.quantidade_parcelas > 1 LIMIT 1) AS oc_parcela,$b$,
  $c$'fornecedor',fornecedor,'competencia',data_competencia) ORDER BY dt, id),'[]'::jsonb) FROM sis_status),$c$,
  $c$'fornecedor',fornecedor,'competencia',data_competencia,'oc_parcela',oc_parcela) ORDER BY dt, id),'[]'::jsonb) FROM sis_status),$c$,
  $d$'sem_conta',sem_conta) ORDER BY data_vencimento, id),'[]'::jsonb) FROM cand WHERE NOT adiantado)$d$,
  $d$'sem_conta',sem_conta,'saldo_de_id',saldo_de_id,'oc_parcela',oc_parcela) ORDER BY data_vencimento, id),'[]'::jsonb) FROM cand WHERE NOT adiantado)$d$,
  $e$'sem_conta',sem_conta) ORDER BY data_vencimento, id),'[]'::jsonb) FROM cand WHERE adiantado)$e$,
  $e$'sem_conta',sem_conta,'saldo_de_id',saldo_de_id,'oc_parcela',oc_parcela) ORDER BY data_vencimento, id),'[]'::jsonb) FROM cand WHERE adiantado)$e$
]);

DO $confere$
BEGIN
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_extratos_espelhados(uuid, uuid, text)'::regprocedure) NOT LIKE '%''oc_parcela'',oc_parcela%'
     OR has_function_privilege('anon', 'public.fn_extratos_espelhados(uuid, uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'OC-RECEB-PARCIAL-01 (espelho): troca nao entrou ou ACL aberta'; END IF;
END $confere$;
