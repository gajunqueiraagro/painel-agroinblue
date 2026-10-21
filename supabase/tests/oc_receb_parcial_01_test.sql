-- OC-RECEB-PARCIAL-01 — titulo de OC conciliado por menos que o valor divide pela PROPRIA OC. Sintetico no cliente Teste (a
-- OPERACAO e' copiada de uma venda real so' na estrutura), admin simulado; `set constraints all immediate` dispara o gatilho adiado
-- como o COMMIT faria; termina em RAISE 'OK' (desfaz tudo).
--   P1..P4 o parcial divide pela OC nos quatro caminhos (bloco, 1:1, grupo, "Casar com o banco"): 1/2 com o ligado, realizado na data
--          do extrato; 2/2 com a falta, programado, vencimento original, parte e parcela proprias; a soma bate; a liquidacao = o ligado
--   P4b "Casar com o banco" com extrato maior que o titulo de OC: recusa, o titulo fica com o valor dele
--   P5 desfazer junta de volta (titulo cheio programado, 2/2 cancelada com parte e parcela, liquidacao estornada, 1/1 de novo)
--   P6 a 2/2 ja' recebida impede o desfazer, com a frase e o id no DETAIL
--   P7 titulo de OC SEM parcela de programacao: o parcial recusa com a frase
--   P8 o caso real (Santa Rita, Walter): 1/2 R$ 100.000 realizado 04/09 + 2/2 R$ 50.000 programado vencimento 04/09
set local statement_timeout = '120s';
set local lock_timeout = '3s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

create function pg_temp.ext(p_v numeric, p_d date) returns uuid language plpgsql as $f$
declare v uuid := gen_random_uuid();
begin
  insert into public.extrato_bancario_v2 (id, cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao)
  values (v, '43f32d07-dba8-4670-900c-bf645440c04a', '131b8501-caf7-4964-b1b1-3f552ad2b75d', p_d, p_v,
          case when p_v > 0 then 'credito' else 'debito' end, 'SINT-ORP01-' || v, 'SINT receb parcial');
  return v;
end $f$;
-- uma OC de venda sintetica com compromisso + programacao + 1 parcela materializada (o titulo "Receb. 1/1"); devolve o titulo
create function pg_temp.tit_oc(p_v numeric) returns uuid language plpgsql as $f$
declare c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; v_op uuid := gen_random_uuid(); v_comp uuid; v_prog uuid; v_pp uuid; r jsonb;
  v_ref public.zoo_operacao_compromissos;
begin
  select * into v_ref from public.zoo_operacao_compromissos where id = 'd134e407-4cd1-47a0-938f-a9e2d4cc6f11';   -- molde: Receb. da venda
  insert into public.zoo_operacoes_comerciais select (jsonb_populate_record(null::public.zoo_operacoes_comerciais, to_jsonb(o) || jsonb_build_object(
      'id', v_op, 'cliente_id', c_cli, 'fazenda_id', 'c2498ace-8478-410c-a697-d3f2e2934d1f', 'contraparte_id', null, 'versao', 1,
      'is_teste', true, 'rascunho', false, 'status_comercial', 'fechada'))).*
    from public.zoo_operacoes_comerciais o where o.id = '64c0e240-8d09-4511-9852-3ed6913205a3';
  insert into public.zoo_operacao_compromissos (cliente_id, operacao_id, natureza, componente, macro_custo, grupo_custo, centro_custo, subcentro,
      plano_conta_id, valor_total, descricao, status)
  values (c_cli, v_op, 'principal', 'recebimento', v_ref.macro_custo, v_ref.grupo_custo, v_ref.centro_custo, v_ref.subcentro, v_ref.plano_conta_id,
          p_v, 'SINT Venda · Recebimento', 'programado') returning id into v_comp;
  insert into public.zoo_operacao_programacoes (cliente_id, compromisso_id, status) values (c_cli, v_comp, 'ativa') returning id into v_prog;
  insert into public.zoo_operacao_parcelas_programacao (cliente_id, programacao_id, sequencia, valor, vencimento, conta_bancaria_id, status)
  values (c_cli, v_prog, 1, p_v, date '2031-03-04', '131b8501-caf7-4964-b1b1-3f552ad2b75d', 'prevista') returning id into v_pp;
  r := public.oc_materializar_programacao(v_op, 1, v_prog, v_pp);
  return (r->'titulo'->>'id')::uuid;
end $f$;
-- o estado da divisao de um titulo: '1/2 v status data | 2/2 v status venc | liq | soma'
create function pg_temp.estado(p_t uuid) returns text language sql as $f$
  select (select pt.sequencia_parcela || '/' || pt.quantidade_parcelas || ' ' || round(abs(l.valor), 2) || ' ' || l.status_transacao || ' ' || coalesce(l.data_pagamento::text, '-')
            from public.financeiro_lancamentos_v2 l join public.zoo_operacao_partes pt on pt.financeiro_lancamento_id = l.id and pt.cancelada is not true where l.id = p_t)
    || ' | ' || coalesce((select pt.sequencia_parcela || '/' || pt.quantidade_parcelas || ' ' || round(abs(l.valor), 2) || ' ' || l.status_transacao || ' ' || l.data_vencimento
            from public.financeiro_lancamentos_v2 l join public.zoo_operacao_partes pt on pt.financeiro_lancamento_id = l.id and pt.cancelada is not true
           where l.saldo_de_id = p_t and l.cancelado is not true), 'sem 2/2')
    || ' | liq=' || coalesce((select round(sum(q.valor), 2)::text from public.zoo_operacao_liquidacoes q where q.financeiro_lancamento_id = p_t and q.estornado is not true), '0')
    || ' | soma=' || (select round(sum(pp.valor), 2) from public.zoo_operacao_parcelas_programacao pp
                       where pp.status <> 'cancelada' and pp.programacao_id = (select pp1.programacao_id from public.zoo_operacao_partes pt
                         join public.zoo_operacao_parcelas_programacao pp1 on pp1.id = pt.programacao_parcela_id where pt.financeiro_lancamento_id = p_t limit 1)) $f$;

DO $t$
DECLARE t1 uuid; t2 uuid; t3 uuid; t4 uuid; t7 uuid; x uuid; e uuid; b uuid; r jsonb; s text; msg text; det text; v_irm uuid;
BEGIN
  -- P1 bloco "mais antigo primeiro": 100 de 150
  t1 := pg_temp.tit_oc(150); e := pg_temp.ext(100, date '2031-03-06');
  b := (public.fn_conciliar_bloco(array[e], array[t1], 'mais_antigo_primeiro', false)->>'bloco_id')::uuid;
  set constraints all immediate; set constraints all deferred;
  s := pg_temp.estado(t1);
  if s is distinct from '1/2 100.00 realizado 2031-03-06 | 2/2 50.00 programado 2031-03-04 | liq=100.00 | soma=150.00' then raise exception 'P1 bloco: %', s; end if;

  -- P2 1:1: 60 de 150
  t2 := pg_temp.tit_oc(150); e := pg_temp.ext(60, date '2031-03-07');
  perform public.fn_vincular_extrato_lancamento(e, t2, 60, false);
  set constraints all immediate; set constraints all deferred;
  s := pg_temp.estado(t2);
  if s is distinct from '1/2 60.00 realizado 2031-03-07 | 2/2 90.00 programado 2031-03-04 | liq=60.00 | soma=150.00' then raise exception 'P2 1:1: %', s; end if;

  -- P3 grupo: 80 do titulo de OC + 50 de um lancamento comum, num extrato de 130
  t3 := pg_temp.tit_oc(150);
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, valor, sinal, data_competencia, data_vencimento, status_transacao,
    conta_destino_id, descricao, cenario, origem_lancamento)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f', '1-Entradas', 50, '1', date '2031-03-01', date '2031-03-08',
          'programado', '131b8501-caf7-4964-b1b1-3f552ad2b75d', 'SINT outro', 'realizado', 'manual') returning id into x;
  e := pg_temp.ext(130, date '2031-03-08');
  perform public.fn_vincular_grupo_conciliacao(e, array[t3, x], array[80, 50]::numeric[], 'teste');
  set constraints all immediate; set constraints all deferred;
  s := pg_temp.estado(t3);
  if s is distinct from '1/2 80.00 realizado 2031-03-08 | 2/2 70.00 programado 2031-03-04 | liq=80.00 | soma=150.00' then raise exception 'P3 grupo: %', s; end if;

  -- P4 "Casar com o banco" (1:1 do Espelho): 90 de 150 — o valor do titulo NAO e' reescrito; divide
  t4 := pg_temp.tit_oc(150); e := pg_temp.ext(90, date '2031-03-09');
  r := public.fn_espelho_casar(e, jsonb_build_array(jsonb_build_object('lancamento_id', t4, 'valor', 90)), false, 'teste');
  if (r->>'ok')::boolean is not true then raise exception 'P4 casar recusou: %', r; end if;
  set constraints all immediate; set constraints all deferred;
  s := pg_temp.estado(t4);
  if s is distinct from '1/2 90.00 realizado 2031-03-09 | 2/2 60.00 programado 2031-03-04 | liq=90.00 | soma=150.00' then raise exception 'P4 casar: %', s; end if;

  -- P4b "Casar com o banco" com extrato MAIOR que o titulo de OC: recusa com a frase e o titulo fica com o valor dele
  x := pg_temp.tit_oc(150); e := pg_temp.ext(200, date '2031-03-09'); msg := null;
  begin perform public.fn_espelho_casar(e, jsonb_build_array(jsonb_build_object('lancamento_id', x, 'valor', 200)), false, 'teste');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'O extrato de R$ 200,00 é maior que o lançamento (R$ 150,00 em aberto). Corrija o valor do lançamento antes de ligar. Nada foi gravado.'
     or (select round(abs(valor), 2) from public.financeiro_lancamentos_v2 where id = x) <> 150 then raise exception 'P4b casar maior: %', msg; end if;

  -- P5 desfazer o bloco do P1 junta de volta
  select id into v_irm from public.financeiro_lancamentos_v2 where saldo_de_id = t1;
  perform public.fn_desfazer_bloco(b, 'teste');
  set constraints all immediate; set constraints all deferred;
  s := (select pt.sequencia_parcela || '/' || pt.quantidade_parcelas || ' ' || round(abs(l.valor), 2) || ' ' || l.status_transacao
          from public.financeiro_lancamentos_v2 l join public.zoo_operacao_partes pt on pt.financeiro_lancamento_id = l.id and pt.cancelada is not true where l.id = t1)
       || ' liq=' || coalesce((select round(sum(q.valor), 2)::text from public.zoo_operacao_liquidacoes q where q.financeiro_lancamento_id = t1 and q.estornado is not true), '0')
       || ' irmao=' || (select cancelado::text from public.financeiro_lancamentos_v2 where id = v_irm)
       || ' parte2=' || (select cancelada::text from public.zoo_operacao_partes where financeiro_lancamento_id = v_irm)
       || ' parcela2=' || (select pp.status from public.zoo_operacao_partes pt join public.zoo_operacao_parcelas_programacao pp on pp.id = pt.programacao_parcela_id
                            where pt.financeiro_lancamento_id = v_irm);
  if s is distinct from '1/1 150.00 programado liq=0 irmao=true parte2=true parcela2=cancelada' then raise exception 'P5 juntar: %', s; end if;

  -- P6 a 2/2 do P2 recebida impede desfazer o 1/2
  select id into v_irm from public.financeiro_lancamentos_v2 where saldo_de_id = t2 and cancelado is not true;
  perform public.fn_vincular_extrato_lancamento(pg_temp.ext(90, date '2031-03-20'), v_irm, 90, false);
  set constraints all immediate; set constraints all deferred;
  msg := null;
  begin perform public.fn_desfazer_vinculo_extrato((select c.extrato_id from public.conciliacao_bancaria_itens c where c.lancamento_id = t2 and c.desfeito_em is null), 'teste');
  exception when others then get stacked diagnostics msg = message_text, det = pg_exception_detail; end;
  if msg is distinct from 'Não dá para desfazer: a parte que faltava (R$ 90,00 · SINT Venda · Recebimento) já foi recebida. Desfaça esse recebimento antes. Nada foi alterado.'
     or det is distinct from v_irm::text then raise exception 'P6 frase: % | %', msg, det; end if;

  -- P7 titulo de OC sem parcela de programacao (parte 'manual'): o parcial recusa
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, valor, sinal, data_competencia, data_vencimento, status_transacao,
    conta_destino_id, descricao, cenario, origem_lancamento)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f', '1-Entradas', 150, '1', date '2031-03-01', date '2031-03-04',
          'programado', '131b8501-caf7-4964-b1b1-3f552ad2b75d', 'SINT manual', 'realizado', 'manual') returning id into t7;
  insert into public.zoo_operacao_partes (cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas, valor,
      data_vencimento, descricao, financeiro_lancamento_id)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', (select pt.operacao_id from public.zoo_operacao_partes pt where pt.financeiro_lancamento_id = t3),
          'manual', 'principal', 'recebimento', 1, 1, 150, date '2031-03-04', 'SINT manual', t7);
  msg := null;
  begin
    perform public.fn_conciliar_bloco(array[pg_temp.ext(100, date '2031-03-10')], array[t7], 'mais_antigo_primeiro', false);
    set constraints all immediate;
  exception when others then msg := sqlerrm; end;
  set constraints all deferred;
  if msg is distinct from 'Este recebimento da operação comercial não tem parcelas programadas, e não dá para receber só uma parte dele. Programe o recebimento na operação (Financeiro › Programar) e ligue de novo. Nada foi gravado.'
    then raise exception 'P7 sem programacao: %', msg; end if;

  -- P8 o caso real, ja' consertado (21/10/2026)
  s := pg_temp.estado('8f53e3eb-9d21-4273-a8cb-b9b67f4815c4');
  if s is distinct from '1/2 100000.00 realizado 2026-09-04 | 2/2 50000.00 programado 2026-09-04 | liq=100000.00 | soma=150000.00' then raise exception 'P8 Walter: %', s; end if;

  RAISE EXCEPTION 'OK';
END $t$;
