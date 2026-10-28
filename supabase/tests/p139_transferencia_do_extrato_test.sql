-- P139 — criar transferencia pela linha do extrato. Sintetico no cliente Teste (contas, importacoes e extratos criados aqui, em 2031);
-- como o admin 7bd0b6ad (claims); termina em RAISE 'OK' (desfaz tudo).
--  T1 sem a outra conta: a simulacao pede a conta (acao escolher_conta), nada grava.
--  T2 espelho a 2 dias (fora do ±1 antigo, dentro do ±3): a simulacao acha 1 e o escolhe; nada grava.
--  T3 grava: UMA transferencia (origem = a conta de investimento, destino = a do movimento, plano 18010), o movimento e o espelho
--     ligados a ela pelo gravador (2 vinculos), os dois extratos conciliados.
--  T4 empate (dois espelhos a 1 dia): nao adivinha (espelho nulo); escolhido o segundo, liga nele.
--  T5 GEMEA (mesma conta, dia e valor, outra importacao, ja' conciliada): a simulacao avisa; gravar sem confirmar recusa com a frase
--     e nao grava; confirmando, grava.
--  T6 transferencia JA' lancada (sem vinculo, mesmas contas, mesmo valor e dia): casar_existente — liga nela, nao cria outra.
--  T7 recusas: a outra conta = a do movimento; conta inativa; movimento ja' ligado.
--  T8 lote tudo-ou-nada: dois movimentos iguais e UM espelho -> 2 transferencias, 1 espelho; lote com 1 item ruim -> nada fica.
--  T9 sugestao: "RESG AUTOMATICO" -> a unica conta de investimento do MESMO banco; documento do titular; nome cortado do titular.
set local statement_timeout = '60s';
set local lock_timeout = '3s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  v_faz uuid; ca uuid; ci uuid; cb uuid; cx uuid; imp1 uuid; imp2 uuid;
  e1 uuid; m1 uuid; e2 uuid; m2a uuid; m2b uuid; e3 uuid; g3 uuid; e4 uuid; l4 uuid; e5 uuid; e6 uuid; m56 uuid; e7 uuid; e8 uuid; e9 uuid;
  r jsonb; n int; v_msg text; l record;
BEGIN
  select id into v_faz from fazendas where cliente_id = k order by nome limit 1;
  insert into financeiro_contas_bancarias (cliente_id, nome_conta, tipo_conta, banco, ativa, fazenda_id) values (k, 'SINT P139 Corrente', 'cc', 'Bradesco', true, v_faz) returning id into ca;
  insert into financeiro_contas_bancarias (cliente_id, nome_conta, tipo_conta, banco, ativa, fazenda_id) values (k, 'SINT P139 Invest', 'inv', 'Bradesco', true, v_faz) returning id into ci;
  insert into financeiro_contas_bancarias (cliente_id, nome_conta, tipo_conta, banco, ativa, fazenda_id, titular_nome, titular_documento)
    values (k, 'SINT P139 Outra', 'cc', 'Sicredi', true, v_faz, 'João da Silva Santos', '123.456.789-01') returning id into cb;
  insert into financeiro_contas_bancarias (cliente_id, nome_conta, tipo_conta, banco, ativa, fazenda_id) values (k, 'SINT P139 Inativa', 'cc', 'Itaú', false, v_faz) returning id into cx;
  insert into financeiro_importacoes_v2 (cliente_id) values (k) returning id into imp1;
  insert into financeiro_importacoes_v2 (cliente_id) values (k) returning id into imp2;

  -- os movimentos
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao, importacao_id)
    values (k, ca, '2031-03-10', 500, 'credito', 'p139-e1', 'RESG AUTOMATICO INVEST', imp1) returning id into e1;
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao)
    values (k, ci, '2031-03-12', -500, 'debito', 'p139-m1', 'RESGATE') returning id into m1;
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao)
    values (k, ca, '2031-03-15', -300, 'debito', 'p139-e2', 'TED ENVIADA') returning id into e2;
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao)
    values (k, cb, '2031-03-14', 300, 'credito', 'p139-m2a', 'TED RECEBIDA') returning id into m2a;
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao)
    values (k, cb, '2031-03-16', 300, 'credito', 'p139-m2b', 'TED RECEBIDA') returning id into m2b;
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao, importacao_id, documento)
    values (k, ca, '2031-03-20', 700, 'credito', 'p139-g3', 'Resg/vencto Cdb', imp2, '2521702') returning id into g3;
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao, importacao_id, documento)
    values (k, ca, '2031-03-20', 700, 'credito', 'p139-e3', 'Resg Automatico Investim', imp1, '0100926') returning id into e3;
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao)
    values (k, ca, '2031-03-25', -250, 'debito', 'p139-e4', 'TRANSF') returning id into e4;
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao, documento)
    values (k, ca, '2031-03-27', -100, 'debito', 'p139-e5', 'TED A', 'D5') returning id into e5;
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao, documento)
    values (k, ca, '2031-03-27', -100, 'debito', 'p139-e6', 'TED B', 'D6') returning id into e6;
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao)
    values (k, cb, '2031-03-27', 100, 'credito', 'p139-m56', 'TED RECEBIDA') returning id into m56;
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao)
    values (k, ca, '2031-03-28', -80, 'debito', 'p139-e7', 'TED C') returning id into e7;
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao)
    values (k, ca, '2031-03-29', -60, 'debito', 'p139-e8', 'PIX 123.456.789-01 TRANSF') returning id into e8;
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao)
    values (k, ca, '2031-03-30', -40, 'debito', 'p139-e9', 'TED JOAO DA SILVA SA') returning id into e9;
  -- a gemea ja' conciliada (lancamento comum criado pela linha)
  perform public.fn_criar_lancamento_de_extrato(g3, v_faz);
  -- a transferencia ja' lancada, sem vinculo
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, conta_destino_id, tipo_operacao, sinal, valor, status_transacao,
                                         data_competencia, data_vencimento, cenario, descricao)
    values (k, v_faz, ca, cb, '3-Transferências', '-1', 250, 'programado', '2031-03-25', '2031-03-25', 'realizado', 'SINT P139 transf lancada')
    returning id into l4;

  -- T1
  r := public.fn_transferencia_do_extrato(e1);
  if r->>'acao' <> 'escolher_conta' then raise exception 'T1 acao %', r->>'acao'; end if;
  -- T2
  r := public.fn_transferencia_do_extrato(e1, ci);
  if r->>'acao' <> 'criar' or jsonb_array_length(r->'espelhos') <> 1 or (r->>'espelho_id')::uuid is distinct from m1
     or (r->>'origem')::uuid is distinct from ci or (r->>'destino')::uuid is distinct from ca then raise exception 'T2 %', r; end if;
  if exists (select 1 from conciliacao_bancaria_itens c where c.extrato_id in (e1, m1)) then raise exception 'T2 a simulacao gravou'; end if;
  -- T3
  r := public.fn_transferencia_do_extrato(e1, ci, p_simular := false);
  select * into l from financeiro_lancamentos_v2 where id = (r->>'lancamento_id')::uuid;
  if l.tipo_operacao <> '3-Transferências' or l.conta_bancaria_id is distinct from ci or l.conta_destino_id is distinct from ca or l.valor <> 500
     or l.cancelado then raise exception 'T3 lancamento %', row_to_json(l); end if;
  select count(*) into n from conciliacao_bancaria_itens c where c.lancamento_id = l.id and c.desfeito_em is null and c.extrato_id in (e1, m1);
  if n <> 2 then raise exception 'T3 vinculos %', n; end if;
  if (select count(*) from extrato_bancario_v2 x where x.id in (e1, m1) and x.status = 'conciliado') <> 2 then raise exception 'T3 status dos extratos'; end if;
  -- T4
  r := public.fn_transferencia_do_extrato(e2, cb);
  if jsonb_array_length(r->'espelhos') <> 2 or nullif(r->>'espelho_id', '') is not null then raise exception 'T4 empate adivinhou %', r; end if;
  r := public.fn_transferencia_do_extrato(e2, cb, m2b, p_simular := false);
  if not exists (select 1 from conciliacao_bancaria_itens c where c.extrato_id = m2b and c.lancamento_id = (r->>'lancamento_id')::uuid and c.desfeito_em is null)
     or exists (select 1 from conciliacao_bancaria_itens c where c.extrato_id = m2a and c.desfeito_em is null) then raise exception 'T4 espelho escolhido'; end if;
  -- T5
  r := public.fn_transferencia_do_extrato(e3, ci);
  if jsonb_array_length(r->'gemeas') <> 1 or (r->'gemeas'->0->>'id')::uuid is distinct from g3 then raise exception 'T5 aviso %', r; end if;
  v_msg := null;
  begin perform public.fn_transferencia_do_extrato(e3, ci, p_simular := false);
  exception when others then get stacked diagnostics v_msg = message_text; end;
  if v_msg is null or v_msg not like '%pode ser duplicado%' then raise exception 'T5 sem confirmar: %', v_msg; end if;
  if exists (select 1 from conciliacao_bancaria_itens c where c.extrato_id = e3 and c.desfeito_em is null) then raise exception 'T5 gravou sem confirmar'; end if;
  r := public.fn_transferencia_do_extrato(e3, ci, p_confirmar_gemea := true, p_simular := false);
  if r->>'acao' <> 'criar' then raise exception 'T5 confirmando %', r; end if;
  -- T6
  r := public.fn_transferencia_do_extrato(e4, cb);
  if r->>'acao' <> 'casar_existente' or (r->'existente'->>'id')::uuid is distinct from l4 then raise exception 'T6 %', r; end if;
  select count(*) into n from financeiro_lancamentos_v2 where cliente_id = k and tipo_operacao = '3-Transferências' and data_competencia between '2031-03-01' and '2031-03-31';
  r := public.fn_transferencia_do_extrato(e4, cb, p_simular := false);
  if (r->>'lancamento_id')::uuid is distinct from l4
     or (select count(*) from financeiro_lancamentos_v2 where cliente_id = k and tipo_operacao = '3-Transferências' and data_competencia between '2031-03-01' and '2031-03-31') <> n
     or not exists (select 1 from conciliacao_bancaria_itens c where c.extrato_id = e4 and c.lancamento_id = l4 and c.desfeito_em is null)
  then raise exception 'T6 gravou outra ou nao ligou'; end if;
  -- T7
  v_msg := null; begin perform public.fn_transferencia_do_extrato(e7, ca); exception when others then get stacked diagnostics v_msg = message_text; end;
  if v_msg is null or v_msg not like '%próprio movimento%' then raise exception 'T7 mesma conta: %', v_msg; end if;
  v_msg := null; begin perform public.fn_transferencia_do_extrato(e7, cx); exception when others then get stacked diagnostics v_msg = message_text; end;
  if v_msg is null or v_msg not like '%inativa%' then raise exception 'T7 inativa: %', v_msg; end if;
  v_msg := null; begin perform public.fn_transferencia_do_extrato(e1, ci); exception when others then get stacked diagnostics v_msg = message_text; end;
  if v_msg is null or v_msg not like '%já tem par%' then raise exception 'T7 ja ligado: %', v_msg; end if;
  -- T8 (a PREVIA do lote ja' reparte o espelho: o 2o nao o reivindica — na previa nada foi gravado, quem garante e' a lista de excluidos)
  r := public.fn_transferencias_do_extrato_lote(jsonb_build_array(jsonb_build_object('extrato_id', e5, 'outra_conta', cb),
                                                                  jsonb_build_object('extrato_id', e6, 'outra_conta', cb)), true);
  if (r->>'espelhos')::int <> 1 or nullif(r->'itens'->1->>'espelho_id', '') is not null then raise exception 'T8 previa reparte o espelho %', r; end if;
  r := public.fn_transferencias_do_extrato_lote(jsonb_build_array(jsonb_build_object('extrato_id', e5, 'outra_conta', cb),
                                                                  jsonb_build_object('extrato_id', e6, 'outra_conta', cb)), false);
  if (r->>'transferencias')::int <> 2 or (r->>'espelhos')::int <> 1 then raise exception 'T8 lote %', r; end if;
  v_msg := null;
  begin
    perform public.fn_transferencias_do_extrato_lote(jsonb_build_array(jsonb_build_object('extrato_id', e8, 'outra_conta', cb),
                                                                       jsonb_build_object('extrato_id', e7, 'outra_conta', ca)), false);
  exception when others then get stacked diagnostics v_msg = message_text; end;
  if v_msg is null or exists (select 1 from conciliacao_bancaria_itens c where c.extrato_id in (e7, e8) and c.desfeito_em is null) then
    raise exception 'T8 lote com 1 ruim gravou parte (%)', v_msg; end if;
  -- T9
  select count(*) into n from public.fn_extrato_transferencias_provaveis(ca, '2031-03-01', '2031-03-31') s
   where (s.extrato_id = e8 and s.conta_sugerida = cb and s.motivo = 'titular_documento')
      or (s.extrato_id = e9 and s.conta_sugerida = cb and s.motivo = 'titular_nome');
  if n <> 2 then raise exception 'T9 titular: %', n; end if;
  -- a aplicacao automatica: uma linha livre nova (as de antes ja' foram ligadas)
  insert into extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao)
    values (k, ca, '2031-03-31', -900, 'debito', 'p139-e10', 'APLIC AUTOMATICA INVEST FACIL');
  select count(*) into n from public.fn_extrato_transferencias_provaveis(ca, '2031-03-01', '2031-03-31') s
   where s.conta_sugerida = ci and s.motivo = 'aplicacao_automatica';
  if n <> 1 then raise exception 'T9 aplicacao automatica: %', n; end if;
  RAISE EXCEPTION 'OK';
END $t$;
