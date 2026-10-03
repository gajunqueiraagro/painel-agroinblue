-- PR-CONC-IMPORT-BANCO-01B — testes, numa transacao que TERMINA EM RAISE (nada fica gravado).
-- Roda DEPOIS da migration 20261027192000 (ou colado logo depois dela):
--   `supabase db query --linked -f supabase/tests/conc_import_banco_01b_test.sql`
--
-- S1 a gravacao e' atomica: um movimento invalido no meio do pacote nao deixa cabecalho nem movimento.
-- S2 dedupe pelos dois indices: dois identicos (hash da ocorrencia) entram os dois; reimportar = 0 inseridos, todos 'hash',
--    nenhum cabecalho novo; mesmo conteudo com hash diferente = 'chave_natural'; o mesmo hash duas vezes no pacote =
--    'repetido_no_arquivo'; metade nova = N inseridos e M pulados.
-- S3 desfazer: a simulacao = a execucao (mesmas contagens), e a execucao grava o status anterior de cada extrato.
-- S4 desfazer recusa mes fechado (como antes).
-- P4 o caso real, no estado de ANTES da restauracao (os 7 de 02/09 ativos de novo): a simulacao da 95c641a0 devolve 100
--    movimentos (93 + 7), 108 conciliacoes, 80 crus (79 com conta do plano — o 80o, ca94d19c, e' Dividendos por texto, a
--    excecao do plano —, 17 editados a' mao), 1 volta a programado, 2 liquidacoes de OC
--    e RECUSA pelo f1b7f361; a execucao recusa sem escrever.
set local statement_timeout = '120s';
set local lock_timeout = '3s';

do $t$
declare
  c_cli constant uuid := 'f2d67cd4-24d0-456f-a079-a3281dcce7fd';
  v_conta uuid; v_faz uuid; v_plano uuid; r jsonb; r2 jsonb; v_n int; v_imp uuid; v_imp2 uuid; v_out text := '';
  e1 uuid; e2 uuid; e3 uuid; l1 uuid; l2 uuid; l3 uuid; k text;
begin
  perform set_config('app.conciliar_bloco', 'on', true);
  insert into financeiro_contas_bancarias (cliente_id, nome_conta, nome_exibicao, tipo_conta, ativa)
    values (c_cli, 'SINT 01B', 'SINT 01B', 'cc', true) returning id into v_conta;
  select id into v_faz from fazendas where cliente_id = c_cli order by created_at limit 1;
  select id into v_plano from financeiro_plano_contas
   where (cliente_id = c_cli or cliente_id is null) and tipo_operacao = '2-Saídas' and ativo order by ordem_exibicao limit 1;

  -- S1
  begin
    r := fn_extrato_importar_arquivo(c_cli, v_conta, 'SINT-01B-FALHA', 'CSV', 2, 0, null, null, jsonb_build_array(
      jsonb_build_object('data', '2031-02-01', 'descricao', 'X', 'documento', '1', 'valor', 10, 'tipo', 'credito', 'hash', 'h01b-f1', 'seq', 1),
      jsonb_build_object('data', 'nao-e-data', 'descricao', 'Y', 'documento', '2', 'valor', 11, 'tipo', 'credito', 'hash', 'h01b-f2', 'seq', 1)));
    raise exception 'S1: a gravacao com movimento invalido passou';
  exception when others then
    if sqlerrm like 'S1:%' then raise; end if;
  end;
  if exists (select 1 from financeiro_importacoes_v2 where nome_arquivo = 'SINT-01B-FALHA')
     or exists (select 1 from extrato_bancario_v2 where hash_movimento in ('h01b-f1', 'h01b-f2')) then
    raise exception 'S1: a falha deixou cabecalho ou movimento';
  end if;
  v_out := v_out || 'S1 ok (falha no meio nao deixa nada); ';

  -- S2
  r := fn_extrato_importar_arquivo(c_cli, v_conta, 'SINT-01B-A', 'CSV', 4, 0, null, null, jsonb_build_array(
    jsonb_build_object('data', '2031-02-02', 'descricao', 'RENTAB', 'documento', '9', 'valor', 0.13, 'tipo', 'credito', 'hash', 'h01b-a', 'seq', 1),
    jsonb_build_object('data', '2031-02-02', 'descricao', 'RENTAB', 'documento', '9', 'valor', 0.13, 'tipo', 'credito', 'hash', 'h01b-a#2', 'seq', 2),
    jsonb_build_object('data', '2031-02-03', 'descricao', 'C', 'documento', '3', 'valor', -5, 'tipo', 'debito', 'hash', 'h01b-c', 'seq', 1),
    jsonb_build_object('data', '2031-02-04', 'descricao', 'D', 'documento', '4', 'valor', -6, 'tipo', 'debito', 'hash', 'h01b-d', 'seq', 1)));
  if (r->>'inseridos')::int <> 4 or jsonb_array_length(r->'pulados') <> 0 or r->>'importacao_id' is null
     or (select count(*) from extrato_bancario_v2 where importacao_id = (r->>'importacao_id')::uuid) <> 4 then
    raise exception 'S2a: dois identicos + dois: %', r;
  end if;
  r := fn_extrato_importar_arquivo(c_cli, v_conta, 'SINT-01B-A', 'CSV', 4, 4, null, null, jsonb_build_array(
    jsonb_build_object('data', '2031-02-02', 'descricao', 'RENTAB', 'documento', '9', 'valor', 0.13, 'tipo', 'credito', 'hash', 'h01b-a', 'seq', 1),
    jsonb_build_object('data', '2031-02-02', 'descricao', 'RENTAB', 'documento', '9', 'valor', 0.13, 'tipo', 'credito', 'hash', 'h01b-a#2', 'seq', 2),
    jsonb_build_object('data', '2031-02-03', 'descricao', 'C', 'documento', '3', 'valor', -5, 'tipo', 'debito', 'hash', 'h01b-c', 'seq', 1),
    jsonb_build_object('data', '2031-02-04', 'descricao', 'D', 'documento', '4', 'valor', -6, 'tipo', 'debito', 'hash', 'h01b-d', 'seq', 1)));
  if (r->>'inseridos')::int <> 0 or r->>'importacao_id' is not null
     or (select count(*) from jsonb_array_elements(r->'pulados') p where p->>'motivo' = 'hash') <> 4
     or (select count(*) from financeiro_importacoes_v2 where nome_arquivo = 'SINT-01B-A') <> 1 then
    raise exception 'S2b: reimportacao: %', r;
  end if;
  r := fn_extrato_importar_arquivo(c_cli, v_conta, 'SINT-01B-B', 'CSV', 4, 0, null, null, jsonb_build_array(
    jsonb_build_object('data', '2031-02-03', 'descricao', 'C reexportado', 'documento', '3', 'valor', -5, 'tipo', 'debito', 'hash', 'h01b-c2', 'seq', 1),
    jsonb_build_object('data', '2031-02-05', 'descricao', 'E', 'documento', '5', 'valor', 7, 'tipo', 'credito', 'hash', 'h01b-e', 'seq', 1),
    jsonb_build_object('data', '2031-02-05', 'descricao', 'E', 'documento', '5', 'valor', 7, 'tipo', 'credito', 'hash', 'h01b-e', 'seq', 1),
    jsonb_build_object('data', '2031-02-04', 'descricao', 'D', 'documento', '4', 'valor', -6, 'tipo', 'debito', 'hash', 'h01b-d', 'seq', 1)));
  if (r->>'inseridos')::int <> 1
     or (select string_agg(p->>'motivo', ',' order by (p->>'indice')::int) from jsonb_array_elements(r->'pulados') p)
        <> 'chave_natural,repetido_no_arquivo,hash' then
    raise exception 'S2c: chave natural / repetido / parcial: %', r;
  end if;
  v_out := v_out || 'S2 ok (2 identicos entram; reimportar 0 e sem cabecalho; chave_natural, repetido_no_arquivo, parcial 1+3); ';

  -- S3: uma importacao com um cru classificado, um substituido que volta a programado e um vinculo manual
  r := fn_extrato_importar_arquivo(c_cli, v_conta, 'SINT-01B-D', 'CSV', 3, 0, null, null, jsonb_build_array(
    jsonb_build_object('data', '2031-03-10', 'descricao', 'cru', 'documento', '31', 'valor', -100, 'tipo', 'debito', 'hash', 'h01b-d1', 'seq', 1),
    jsonb_build_object('data', '2031-03-11', 'descricao', 'subst', 'documento', '32', 'valor', -200, 'tipo', 'debito', 'hash', 'h01b-d2', 'seq', 1),
    jsonb_build_object('data', '2031-04-12', 'descricao', 'manual', 'documento', '41', 'valor', -300, 'tipo', 'debito', 'hash', 'h01b-d3', 'seq', 1)));
  v_imp := (r->>'importacao_id')::uuid;
  select id into e1 from extrato_bancario_v2 where hash_movimento = 'h01b-d1';
  select id into e2 from extrato_bancario_v2 where hash_movimento = 'h01b-d2';
  select id into e3 from extrato_bancario_v2 where hash_movimento = 'h01b-d3';
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, tipo_operacao, sinal, valor, status_transacao, data_pagamento,
                                         data_competencia, data_vencimento, cenario, descricao, plano_conta_id, origem_lancamento)
    values (c_cli, v_faz, v_conta, '2-Saídas', '-1', 100, 'realizado', '2031-03-10', '2031-03-10', '2031-03-10', 'realizado', 'SINT cru', v_plano, 'extrato')
    returning id into l1;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, tipo_operacao, sinal, valor, status_transacao, data_pagamento,
                                         data_competencia, data_vencimento, cenario, descricao)
    values (c_cli, v_faz, v_conta, '2-Saídas', '-1', 200, 'realizado', '2031-03-11', '2031-03-11', '2031-03-11', 'realizado', 'SINT subst')
    returning id into l2;
  insert into audit_log (cliente_id, modulo, acao, tabela_origem, registro_id, dados_anteriores, created_at)
    values (c_cli, 'financeiro', 'editou', 'financeiro_lancamentos_v2', l2,
            jsonb_build_object('data_pagamento', null, 'data_vencimento', '2031-03-11', 'valor', 200, 'status_transacao', 'programado'), now());
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, tipo_operacao, sinal, valor, status_transacao, data_pagamento,
                                         data_competencia, data_vencimento, cenario, descricao)
    values (c_cli, v_faz, v_conta, '2-Saídas', '-1', 300, 'realizado', '2031-04-12', '2031-04-12', '2031-04-12', 'realizado', 'SINT manual')
    returning id into l3;
  insert into conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado, tipo_aprovacao)
    values (c_cli, e1, l1, 100, 'ofx_cru'), (c_cli, e2, l2, 200, 'ofx_substituiu'), (c_cli, e3, l3, 300, 'manual');
  update extrato_bancario_v2 set status = 'conciliado' where id in (e1, e2, e3);
  r := fn_extrato_desfazer_arquivo(v_imp, 'teste 01b', true);
  if (r->>'ok')::boolean is not true or (r->>'extratos')::int <> 3 or (r->>'conciliacoes_desfeitas')::int <> 3
     or (r->>'crus_cancelados')::int <> 1 or (r->>'crus_classificados')::int <> 1 or (r->>'voltam_a_programado')::int <> 1
     or r->>'periodo_inicio' <> '2031-03-10' or r->>'periodo_fim' <> '2031-04-12'
     or r->'por_mes' <> '[{"mes": "2031-03", "qtde": 2}, {"mes": "2031-04", "qtde": 1}]'::jsonb then
    raise exception 'S3 simulacao: %', r;
  end if;
  r2 := fn_extrato_desfazer_arquivo(v_imp, 'teste 01b', false);
  for k in select jsonb_object_keys(r) loop
    if k <> 'simulado' and r->k is distinct from r2->k then raise exception 'S3: simulacao <> execucao em %: % x %', k, r->k, r2->k; end if;
  end loop;
  if (select count(*) from conciliacao_audit_log where importacao_id = v_imp and acao = 'importacao_revertida'
        and payload_antes->>'status' = 'conciliado') <> 3 then
    raise exception 'S3: status anterior nao gravado';
  end if;
  if (select status_transacao from financeiro_lancamentos_v2 where id = l2) <> 'programado'
     or not (select cancelado from financeiro_lancamentos_v2 where id = l1) then
    raise exception 'S3: execucao nao fez o que a simulacao disse';
  end if;
  v_out := v_out || 'S3 ok (simulacao = execucao em todas as chaves; status anterior gravado nos 3); ';

  -- S4
  r := fn_extrato_importar_arquivo(c_cli, v_conta, 'SINT-01B-F', 'CSV', 1, 0, null, null, jsonb_build_array(
    jsonb_build_object('data', '2031-05-10', 'descricao', 'F', 'documento', '51', 'valor', -1, 'tipo', 'debito', 'hash', 'h01b-f', 'seq', 1)));
  v_imp2 := (r->>'importacao_id')::uuid;
  insert into financeiro_fechamentos (cliente_id, fazenda_id, ano_mes, status_fechamento) values (c_cli, v_faz, '2031-05', 'fechado');
  r := fn_extrato_desfazer_arquivo(v_imp2, 'teste 01b', true);
  if r->>'motivo' <> 'mes_fechado' or (r->>'ok')::boolean then raise exception 'S4: %', r; end if;
  v_out := v_out || 'S4 ok (mes fechado recusa); ';

  -- P4: o caso real, no estado de ANTES da restauracao. Setembro do Bradesco foi importado depois (58722427, 03/10 17:31 UTC,
  -- 108 movimentos de 01/09 a 30/09): dentro desta transacao ele sai antes de os 7 de 02/09 voltarem, como estava as 16:39.
  update extrato_bancario_v2 set cancelado_em = now(), cancelado_motivo = 'teste 01b'
   where conta_bancaria_id = '186a093b-0204-4164-95e3-0dd247457ffa' and data_movimento >= '2026-09-01' and cancelado_em is null
     and importacao_id is distinct from '95c641a0-7afc-443d-896b-504849c25f55';
  update extrato_bancario_v2 set cancelado_em = null, cancelado_por = null, cancelado_motivo = null
   where importacao_id = '95c641a0-7afc-443d-896b-504849c25f55' and data_movimento >= '2026-09-01';
  r := fn_extrato_desfazer_arquivo('95c641a0-7afc-443d-896b-504849c25f55', 'simulacao', true);
  if (r->>'ok')::boolean or r->>'motivo' <> 'oc_viva' or (r->>'extratos')::int <> 100
     or r->'por_mes' <> '[{"mes": "2026-08", "qtde": 93}, {"mes": "2026-09", "qtde": 7}]'::jsonb
     or r->>'periodo_inicio' <> '2026-08-03' or r->>'periodo_fim' <> '2026-09-02'
     or (r->>'conciliacoes_desfeitas')::int <> 108 or (r->>'crus_cancelados')::int <> 80 or (r->>'crus_classificados')::int <> 79
     or (r->>'crus_enriquecidos')::int <> 17 or (r->>'voltam_a_programado')::int <> 1
     or jsonb_array_length(r->'liquidacoes_oc_estornadas') <> 2
     or jsonb_array_length(r->'bloqueios') <> 1 or left(r->'bloqueios'->0->>'lancamento_id', 8) <> 'f1b7f361' then
    raise exception 'P4 simulacao: %', r - 'ids_cru' - 'ids_subst' - 'ids_manual';
  end if;
  select count(*) into v_n from extrato_bancario_v2 where importacao_id = '95c641a0-7afc-443d-896b-504849c25f55' and cancelado_em is null;
  r2 := fn_extrato_desfazer_arquivo('95c641a0-7afc-443d-896b-504849c25f55', 'execucao', false);
  if (r2->>'ok')::boolean or r2->>'motivo' <> 'oc_viva'
     or (select count(*) from extrato_bancario_v2 where importacao_id = '95c641a0-7afc-443d-896b-504849c25f55' and cancelado_em is null) <> v_n then
    raise exception 'P4 execucao nao recusou: %', r2;
  end if;
  v_out := v_out || format('P4 ok (100 = 93 + 7, %s a %s, 108, 80 crus (79 classificados, 17 editados), 1 volta a programado, 2 liquidacoes [%s], RECUSA: %s); ',
    r->>'periodo_inicio', r->>'periodo_fim',
    (select string_agg(q->>'valor', ' + ') from jsonb_array_elements(r->'liquidacoes_oc_estornadas') q), r->>'frase');

  raise exception 'OK %', v_out using errcode = 'P0001';
end $t$;
