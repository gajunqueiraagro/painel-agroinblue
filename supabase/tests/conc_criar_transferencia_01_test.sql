-- CONC-CRIAR-TRANSFERENCIA-01 — o Criar a partir do extrato grava Transferencia (lancamento + vinculo numa transacao).
-- Roda em ROLLBACK: termina em RAISE, nada fica gravado. Canal de escrita, como o admin 7bd0b6ad (request.jwt.claims).
-- P1 extrato NEGATIVO livre (NJ Sicredi Lavoura 10/09 -63.716,00) -> Transferencia para o Cartao Sicredi Lavoura:
--    1 lancamento '3-Transferências', sinal -1, plano 18010, origem = conta do extrato, destino = cartao, realizado na
--    data do extrato; 1 vinculo vivo (ponta de saida); extrato conciliado.
-- P2 extrato POSITIVO livre (NJ Sicredi Lavoura 25/09 +10.764,11) -> origem Invest-Sicredi Agricultura, destino = conta
--    do extrato; vinculo na ponta de entrada.
-- P3 recusas: sem a outra conta; a outra conta = a do extrato; tipo de sinal contrario; extrato que e' meia ponta
--    (0662fe1f -> 4e43075a, outro cliente) -> ja_existe_transferencia.
-- P4 (comparacao com o corpo antigo: no ensaio) o caminho de sempre, sem os parametros novos, continua igual.
DO $teste$
DECLARE
  v_out text := '';
  c_neg    constant uuid := 'd2ca31d9-58fd-4c8f-abf2-23786b43c14a';
  c_pos    constant uuid := '0001ae41-405a-46e8-87bb-2168a2e82ab6';
  c_lav    constant uuid := '910e04b0-4148-4e58-885a-8937c8148581';
  c_cartao constant uuid := '0a8ce8e2-7791-4141-a6ec-51343e629e30';
  c_invest constant uuid := '94c4ffa5-57bc-4e14-bf22-ab64390e9817';
  c_faz    constant uuid := '8d173d9c-4c26-4593-ae6a-8f76a5a98045';
  c_meia   constant uuid := '0662fe1f-c341-47cc-b8be-d1ce6aac7455';
  v_r jsonb; v_msg text; r record;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', true);

  -- ── P3 primeiro (o extrato ainda livre)
  BEGIN PERFORM fn_criar_lancamento_de_extrato(c_neg, c_faz, p_tipo_operacao := '3-Transferências');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; v_out := 'P3 sem outra conta: ' || v_msg; END;
  BEGIN PERFORM fn_criar_lancamento_de_extrato(c_neg, c_faz, p_tipo_operacao := '3-Transferências', p_outra_conta := c_lav);
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; v_out := v_out || E'\n   outra = a do extrato: ' || v_msg; END;
  BEGIN PERFORM fn_criar_lancamento_de_extrato(c_neg, c_faz, p_tipo_operacao := '1-Entradas');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; v_out := v_out || E'\n   sinal contrario: ' || v_msg; END;
  BEGIN PERFORM fn_criar_lancamento_de_extrato(c_meia, '161b905e-f14c-4a9b-965f-dd3c8f82dc74', p_tipo_operacao := '3-Transferências',
                                               p_outra_conta := 'a5ed9922-e476-4ec0-a19c-6481140e52eb');
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; v_out := v_out || E'\n   meia ponta: ' || left(v_msg, 60); END;

  -- ── P1
  v_r := fn_criar_lancamento_de_extrato(c_neg, c_faz, p_tipo_operacao := '3-Transferências', p_outra_conta := c_cartao);
  SELECT l.tipo_operacao, l.sinal, p.ordem_exibicao, l.conta_bancaria_id = c_lav origem_ok, l.conta_destino_id = c_cartao destino_ok,
         l.status_transacao, l.data_pagamento, l.valor, f.nome fazenda, l.origem_lancamento,
         (SELECT count(*) FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL) vivos,
         (SELECT status FROM extrato_bancario_v2 WHERE id = c_neg) st_ext
    INTO r
    FROM financeiro_lancamentos_v2 l LEFT JOIN financeiro_plano_contas p ON p.id = l.plano_conta_id LEFT JOIN fazendas f ON f.id = l.fazenda_id
   WHERE l.id = (v_r->>'lancamento_id')::uuid;
  v_out := v_out || E'\nP1 negativo -> cartao: ' || r.tipo_operacao || ' sinal ' || r.sinal || ' plano ' || coalesce(r.ordem_exibicao::text, '-')
    || ' origem=extrato ' || r.origem_ok || ' destino=cartao ' || r.destino_ok || ' | ' || r.status_transacao || ' em ' || r.data_pagamento
    || ' | ' || r.valor || ' | fazenda ' || coalesce(r.fazenda, '-') || ' | vinculos ' || r.vivos || ' | extrato ' || r.st_ext;

  -- ── P2
  v_r := fn_criar_lancamento_de_extrato(c_pos, c_faz, p_tipo_operacao := '3-Transferências', p_outra_conta := c_invest);
  SELECT l.tipo_operacao, l.sinal, p.ordem_exibicao, l.conta_bancaria_id = c_invest origem_ok, l.conta_destino_id = c_lav destino_ok,
         l.status_transacao, l.data_pagamento, l.valor,
         (SELECT count(*) FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL) vivos,
         (SELECT status FROM extrato_bancario_v2 WHERE id = c_pos) st_ext
    INTO r
    FROM financeiro_lancamentos_v2 l LEFT JOIN financeiro_plano_contas p ON p.id = l.plano_conta_id
   WHERE l.id = (v_r->>'lancamento_id')::uuid;
  v_out := v_out || E'\nP2 positivo <- invest: ' || r.tipo_operacao || ' sinal ' || r.sinal || ' plano ' || coalesce(r.ordem_exibicao::text, '-')
    || ' origem=invest ' || r.origem_ok || ' destino=extrato ' || r.destino_ok || ' | ' || r.status_transacao || ' em ' || r.data_pagamento
    || ' | ' || r.valor || ' | vinculos ' || r.vivos || ' | extrato ' || r.st_ext;

  RAISE EXCEPTION 'ENSAIO (rollback): %', v_out;
END
$teste$;
