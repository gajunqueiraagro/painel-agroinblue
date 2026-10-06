-- PARC-LIVRES-01 (passo 2A) — o motor do financiamento NAO escreve em lancamento de PARCELAMENTO.
-- Roda depois da 20261027194100, numa transacao que TERMINA EM RAISE (nada fica gravado). Sintetico no cliente Teste, admin simulado.
-- T1 parcelamento com safra, forma e documento: muda-se a data da parcela e chama-se o motor (como o lapis do contrato fazia) ->
--    'skip'; o lancamento e' O MESMO (id, vivo), com descricao, status, competencia, safra, forma, plano, fornecedor e documento.
-- T2 `fn_reconciliar_financiamento` (o contrato inteiro): nada muda.
-- T3 `fn_financiamento_pagar_pelo_extrato` recusa parcela de parcelamento (P0001, frase), tambem na simulacao, sem gravar.
-- T4 financiamento COM JUROS: o motor continua respondendo (nao devolve 'skip').
set local statement_timeout = '60s';
set local lock_timeout = '3s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

DO $t$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v_faz uuid; v_plano uuid; v_safra uuid; v_fin uuid; v_par record; v_antes text; v_depois text; v_r jsonb; v_cru uuid; v_n int; v_msg text; v_state text; v_pf uuid;
BEGIN
  select id into v_faz from fazendas where cliente_id = c_cli order by nome limit 1;
  select id into v_plano from financeiro_plano_contas where ativo and cliente_id is null and tipo_operacao = '2-Saídas'
     and escopo_negocio = 'pecuaria' order by ordem_exibicao limit 1;
  insert into financeiro_safras (cliente_id, nome) values (c_cli, 'SINT 2A') returning id into v_safra;
  v_fin := fn_parcelamento_cadastrar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', v_faz, 'descricao', 'SINT parc-2a', 'tipo_operacao', '2-Saídas',
     'plano_conta_id', v_plano, 'data_competencia', '2031-01-10', 'intervalo_meses', 1, 'valor_total', 300, 'total_parcelas', 3,
     'data_primeira_parcela', '2031-02-10', 'safra_id', v_safra, 'forma_pagamento', 'Boleto'));
  select p.id, p.lancamento_id into v_par from financiamento_parcelas p where p.financiamento_id = v_fin and p.numero_parcela = 1;
  insert into financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, especie) values (c_cli, v_par.lancamento_id, 'sint.pdf', 'nf');

  select md5(string_agg(format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s', l.id, l.cancelado, l.descricao, l.status_transacao, l.data_competencia, l.data_vencimento,
           l.safra_id, l.forma_pagamento, l.plano_conta_id, l.favorecido_id, l.origem_lancamento, l.valor), ' ' order by l.id)) into v_antes
    from financeiro_lancamentos_v2 l where l.financiamento_id = v_fin;
  select count(*) into v_n from financeiro_lancamentos_v2 l where l.financiamento_id = v_fin;
  IF v_n <> 3 THEN RAISE EXCEPTION 'T0: esperava 3 lancamentos, ha %', v_n; END IF;

  -- T1: o que o lapis do contrato fazia — UPDATE da parcela + o motor
  update financiamento_parcelas set data_vencimento = date '2031-01-05' where id = v_par.id;
  v_r := fn_reconciliar_parcela_financiamento(v_par.id, false, true, null);
  IF v_r->>'skip' IS DISTINCT FROM 'parcelamento_tem_escritor_proprio' THEN RAISE EXCEPTION 'T1: o motor nao pulou o parcelamento: %', left(v_r::text, 300); END IF;
  select md5(string_agg(format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s', l.id, l.cancelado, l.descricao, l.status_transacao, l.data_competencia, l.data_vencimento,
           l.safra_id, l.forma_pagamento, l.plano_conta_id, l.favorecido_id, l.origem_lancamento, l.valor), ' ' order by l.id)) into v_depois
    from financeiro_lancamentos_v2 l where l.financiamento_id = v_fin;
  IF v_depois IS DISTINCT FROM v_antes THEN RAISE EXCEPTION 'T1: o motor mexeu no lancamento do parcelamento'; END IF;
  IF (select lancamento_id from financiamento_parcelas where id = v_par.id) IS DISTINCT FROM v_par.lancamento_id THEN RAISE EXCEPTION 'T1: a parcela trocou de lancamento'; END IF;
  IF NOT EXISTS (select 1 from financeiro_lancamento_documentos d join financeiro_lancamentos_v2 l on l.id = d.lancamento_id
                  where d.lancamento_id = v_par.lancamento_id and not l.cancelado and l.safra_id = v_safra and l.forma_pagamento = 'Boleto'
                    and l.status_transacao = 'programado' and l.descricao like 'SINT parc-2a%') THEN
    RAISE EXCEPTION 'T1: o lancamento perdeu documento, safra, forma, status ou nome'; END IF;

  -- T2: o contrato inteiro
  perform fn_reconciliar_financiamento(v_fin, false, true);
  select md5(string_agg(format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s', l.id, l.cancelado, l.descricao, l.status_transacao, l.data_competencia, l.data_vencimento,
           l.safra_id, l.forma_pagamento, l.plano_conta_id, l.favorecido_id, l.origem_lancamento, l.valor), ' ' order by l.id)) into v_depois
    from financeiro_lancamentos_v2 l where l.financiamento_id = v_fin;
  IF v_depois IS DISTINCT FROM v_antes THEN RAISE EXCEPTION 'T2: reconciliar o contrato mexeu nos lancamentos'; END IF;

  -- T3: pagar pelo extrato recusa (simulando e gravando)
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_pagamento, status_transacao, cenario, cancelado)
    values (c_cli, v_faz, -1, '2-Saídas', 100, 'SINT cru 2a', '2031-02-10', '2031-02-10', 'realizado', 'realizado', false) returning id into v_cru;
  FOR v_n IN 0..1 LOOP
    BEGIN
      perform fn_financiamento_pagar_pelo_extrato(v_cru, v_par.id, v_n = 0);
      RAISE EXCEPTION 'T3: pagar pelo extrato aceitou parcela de parcelamento (simular=%)', v_n = 0;
    EXCEPTION WHEN sqlstate 'P0001' THEN
      get stacked diagnostics v_msg = message_text;
      IF v_msg LIKE 'T3:%' THEN RAISE; END IF;
      IF v_msg NOT LIKE 'Parcela de parcelamento se paga pelo lançamento dela:%Nada foi gravado.' THEN RAISE EXCEPTION 'T3: frase inesperada: %', v_msg; END IF;
    END;
  END LOOP;
  IF (select status from financiamento_parcelas where id = v_par.id) <> 'pendente' OR (select cancelado from financeiro_lancamentos_v2 where id = v_cru) THEN
    RAISE EXCEPTION 'T3: a recusa gravou alguma coisa'; END IF;

  -- T4: financiamento com juros segue no motor
  select p.id into v_pf from financiamento_parcelas p join financiamentos f on f.id = p.financiamento_id
    where f.natureza <> 'parcelamento' and p.status = 'pendente' order by p.created_at limit 1;
  IF v_pf IS NULL THEN RAISE EXCEPTION 'T4: nao ha parcela de financiamento para provar (conjunto vazio = prova invalida)'; END IF;
  v_r := fn_reconciliar_parcela_financiamento(v_pf, true, false, null);
  IF v_r ? 'skip' OR v_r ? 'erro' THEN RAISE EXCEPTION 'T4: o motor deixou de atender financiamento: %', left(v_r::text, 300); END IF;

  RAISE EXCEPTION 'OK parc_livres_01_2a (T1-T4)';
END
$t$;
