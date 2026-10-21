-- CONC-BAIXA-NO-VINCULO-01 — todo vinculo com extrato da' baixa; parcial vira divisao explicita. Sintetico no cliente Teste,
-- admin simulado; `set constraints all immediate` dispara o gatilho adiado como o COMMIT faria. Termina em RAISE 'OK' (desfaz tudo).
--   B1 previsto ligado 1:1 vira realizado na data do extrato
--   B2 parcial 1:1 divide: o original fica com o aplicado (realizado), o irmao com a falta (programado, saldo_de_id); soma ao centavo
--   B3 parcial no grupo divide do mesmo jeito
--   B4 parcial no bloco ("mais antigo primeiro") divide do mesmo jeito
--   B5 desfazer o vinculo junta de volta: irmao cancelado, original no valor de antes
--   B6 irmao ja' pago impede o desfazer, com a frase e o id no DETAIL
--   B7 trava: vinculo vivo com lancamento de META recusa
--   B8 recorrencia estimada aceita o valor real do extrato e liga (o gesto do Vivo)
--   B9 guarda de cliente (42501) e ACL (anon sem EXECUTE; o nucleo fechado ate' para authenticated)
set local statement_timeout = '60s';
set local lock_timeout = '3s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

create function pg_temp.ext(p_valor numeric, p_data date) returns uuid language plpgsql as $f$
declare v uuid := gen_random_uuid();
begin
  insert into public.extrato_bancario_v2 (id, cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao)
  values (v, '43f32d07-dba8-4670-900c-bf645440c04a', '131b8501-caf7-4964-b1b1-3f552ad2b75d', p_data, p_valor,
          case when p_valor < 0 then 'debito' else 'credito' end, 'SINT-CBV01-' || v, 'SINT CBV01');
  return v;
end $f$;
create function pg_temp.lanc(p_valor numeric, p_status text, p_cenario text default 'realizado') returns uuid language plpgsql as $f$
declare v uuid;
begin
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, valor, sinal, data_competencia, data_vencimento,
    status_transacao, conta_bancaria_id, descricao, cenario, origem_lancamento)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f', '2-Saídas', p_valor, '-1', date '2026-09-01',
          date '2026-09-10', p_status, '131b8501-caf7-4964-b1b1-3f552ad2b75d', 'SINT CBV01', p_cenario, 'manual')
  returning id into v;
  return v;
end $f$;

DO $t$
DECLARE
  e1 uuid; e2 uuid; e3 uuid; e4 uuid; e5 uuid; e6 uuid; l1 uuid; l2 uuid; l3a uuid; l3b uuid; l4a uuid; l4b uuid; l5 uuid; l6 uuid;
  irm uuid; r jsonb; x record; y record; msg text; det text; ok boolean; rec uuid;
BEGIN
  -- B1
  e1 := pg_temp.ext(-100, date '2026-09-12'); l1 := pg_temp.lanc(100, 'previsto');
  perform public.fn_vincular_extrato_lancamento(e1, l1, 100, false);
  set constraints all immediate; set constraints all deferred;
  select * into x from public.financeiro_lancamentos_v2 where id = l1;
  if x.status_transacao <> 'realizado' or x.data_pagamento is distinct from date '2026-09-12' then raise exception 'B1 previsto: % %', x.status_transacao, x.data_pagamento; end if;

  -- B2
  e2 := pg_temp.ext(-600, date '2026-09-15'); l2 := pg_temp.lanc(1000, 'programado');
  perform public.fn_vincular_extrato_lancamento(e2, l2, 600, false);
  set constraints all immediate; set constraints all deferred;
  select * into x from public.financeiro_lancamentos_v2 where id = l2;
  select * into y from public.financeiro_lancamentos_v2 where saldo_de_id = l2 and cancelado is not true;
  if x.valor <> 600 or x.status_transacao <> 'realizado' or x.data_pagamento is distinct from date '2026-09-15' then raise exception 'B2 original: % % %', x.valor, x.status_transacao, x.data_pagamento; end if;
  if y.id is null or y.valor <> 400 or y.status_transacao <> 'programado' or y.data_pagamento is not null
     or y.data_vencimento is distinct from date '2026-09-10' or y.data_competencia is distinct from date '2026-09-01'
     or y.conta_bancaria_id is distinct from x.conta_bancaria_id then raise exception 'B2 irmao: %', row_to_json(y); end if;
  if x.valor + y.valor <> 1000.00 then raise exception 'B2 soma: %', x.valor + y.valor; end if;
  if not exists (select 1 from public.financeiro_baixas_no_vinculo b where b.tipo = 'divisao' and b.lancamento_id = l2 and b.irmao_id = y.id
                 and b.valor_aplicado = 600 and b.valor_saldo = 400 and (b.antes->>'valor')::numeric = 1000) then raise exception 'B2 trilha'; end if;
  irm := y.id;

  -- B3 grupo: 500 inteiro + 300 com 200 aplicado
  e3 := pg_temp.ext(-700, date '2026-09-16'); l3a := pg_temp.lanc(500, 'programado'); l3b := pg_temp.lanc(300, 'programado');
  perform public.fn_vincular_grupo_conciliacao(e3, array[l3a, l3b], array[500, 200]::numeric[], 'teste');
  set constraints all immediate; set constraints all deferred;
  select * into x from public.financeiro_lancamentos_v2 where id = l3b;
  select * into y from public.financeiro_lancamentos_v2 where saldo_de_id = l3b;
  if x.valor <> 200 or x.status_transacao <> 'realizado' or y.valor <> 100 or y.status_transacao <> 'programado' then raise exception 'B3 grupo: % / %', row_to_json(x), row_to_json(y); end if;
  if (select status_transacao from public.financeiro_lancamentos_v2 where id = l3a) <> 'realizado'
     or exists (select 1 from public.financeiro_lancamentos_v2 where saldo_de_id = l3a) then raise exception 'B3 o inteiro'; end if;

  -- B4 bloco "mais antigo primeiro": 300 + 300 contra 500 => o segundo fica com 200 e o irmao com 100
  e4 := pg_temp.ext(-500, date '2026-09-17'); l4a := pg_temp.lanc(300, 'programado'); l4b := pg_temp.lanc(300, 'programado');
  update public.financeiro_lancamentos_v2 set data_vencimento = date '2026-09-11' where id = l4b;
  r := public.fn_conciliar_bloco(array[e4], array[l4a, l4b], 'mais_antigo_primeiro', false);
  set constraints all immediate; set constraints all deferred;
  select * into x from public.financeiro_lancamentos_v2 where id = l4b;
  select * into y from public.financeiro_lancamentos_v2 where saldo_de_id = l4b;
  if x.valor <> 200 or x.status_transacao <> 'realizado' or x.data_pagamento is distinct from date '2026-09-17' or y.valor <> 100
    then raise exception 'B4 bloco: % / % / %', row_to_json(x), row_to_json(y), r; end if;

  -- B5 desfazer junta de volta (o B2)
  perform public.fn_desfazer_vinculo_extrato(e2, 'teste');
  set constraints all immediate; set constraints all deferred;
  if (select valor from public.financeiro_lancamentos_v2 where id = l2) <> 1000 then raise exception 'B5 valor nao voltou'; end if;
  if (select cancelado from public.financeiro_lancamentos_v2 where id = irm) is not true then raise exception 'B5 irmao vivo'; end if;
  if not exists (select 1 from public.financeiro_baixas_no_vinculo where tipo = 'juncao' and lancamento_id = l2) then raise exception 'B5 trilha'; end if;

  -- B6 irmao pago impede desfazer
  e5 := pg_temp.ext(-250, date '2026-09-18'); l5 := pg_temp.lanc(400, 'programado');
  perform public.fn_vincular_extrato_lancamento(e5, l5, 250, false);
  set constraints all immediate; set constraints all deferred;
  select id into irm from public.financeiro_lancamentos_v2 where saldo_de_id = l5;
  e6 := pg_temp.ext(-150, date '2026-09-25');
  perform public.fn_vincular_extrato_lancamento(e6, irm, 150, false);
  set constraints all immediate; set constraints all deferred;
  msg := null;
  begin perform public.fn_desfazer_vinculo_extrato(e5, 'teste');
  exception when others then get stacked diagnostics msg = message_text, det = pg_exception_detail; end;
  if msg is distinct from 'Não dá para desfazer: o saldo de R$ 150,00 deste lançamento já foi pago (lançamento de 25/09/2026). Desfaça o pagamento do saldo antes. Nada foi alterado.'
     or det is distinct from irm::text then raise exception 'B6 frase: % | %', msg, det; end if;

  -- B7 trava: META nao se liga
  l6 := pg_temp.lanc(80, 'programado', 'meta');
  msg := null;
  begin
    perform public.fn_vincular_extrato_lancamento(pg_temp.ext(-80, date '2026-09-19'), l6, 80, false);
    set constraints all immediate;
  exception when others then msg := sqlerrm; end;
  set constraints all deferred;
  if msg is distinct from 'Lançamento de META não se liga a extrato. Nada foi gravado.' then raise exception 'B7 trava: %', msg; end if;

  -- B8 recorrencia estimada aceita o valor real
  insert into public.financeiro_recorrencias (cliente_id, fazenda_id, descricao, conta_bancaria_id, subcentro, valor_base, dia_vencimento,
    data_inicio, primeiro_vencimento, data_fim, ativo)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f', 'SINT CBV01 rec', '131b8501-caf7-4964-b1b1-3f552ad2b75d',
          'SINT', 473.66, 1, date '2026-09-01', date '2026-10-01', date '2027-08-31', true) returning id into rec;
  l6 := pg_temp.lanc(473.66, 'programado');
  update public.financeiro_lancamentos_v2 set recorrencia_id = rec, origem_lancamento = 'recorrencia', data_vencimento = date '2026-10-01' where id = l6;
  r := public.fn_conc_ligar_com_valor_real(pg_temp.ext(-506.51, date '2026-09-01'), l6, 'teste vivo');
  set constraints all immediate; set constraints all deferred;
  select * into x from public.financeiro_lancamentos_v2 where id = l6;
  if x.valor <> 506.51 or x.status_transacao <> 'realizado' or x.data_pagamento is distinct from date '2026-09-01'
     or x.data_competencia is distinct from date '2026-09-01' or x.valor_do_mes_origem is distinct from 'manual' then raise exception 'B8 vivo: %', row_to_json(x); end if;
  if not exists (select 1 from public.financeiro_baixas_no_vinculo where tipo = 'valor_real' and lancamento_id = l6 and (antes->>'valor')::numeric = 473.66) then raise exception 'B8 trilha'; end if;

  -- B9 guarda e ACL
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  ok := false; begin perform public.fn_conc_baixar_vinculado(l1, 'x'); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'B9 baixar sem tenant'; end if;
  ok := false; begin perform public.fn_conc_ligar_com_valor_real(e1, l1, 'x'); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'B9 valor real sem tenant'; end if;
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  if has_function_privilege('anon', 'public.fn_conc_baixar_vinculado(uuid, text, boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_conc_ligar_com_valor_real(uuid, uuid, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._fn_conc_baixa_no_vinculo(uuid, text, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._fn_trg_conc_baixa_no_vinculo()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._fn_trg_conc_juntar_ao_desfazer()', 'EXECUTE') then raise exception 'B9 ACL'; end if;

  RAISE EXCEPTION 'OK';
END $t$;
