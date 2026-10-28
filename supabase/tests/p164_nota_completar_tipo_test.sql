-- P164 — `fn_nota_completar` leva o TIPO do documento (migration 20261028113050). Fixture SINTETICA no cliente Teste, no molde da Juarez
-- (à vista, CONCILIADO, nº "9262" só os dígitos, tipo vazio, competência no pagamento). A nota que confere pede: nº "000.009.262", tipo
-- "Nota Fiscal", competência = emissão. Roda como `authenticated` (admin) e TERMINA EM RAISE.
-- T1 simular: o tipo aparece hoje → fica; conta/valor/vencimento no cadeado · T2 gravar: nº, tipo e competência gravados; valor e status iguais
-- T3 desfazer: o tipo volta ao vazio (e o nº e a competência ao de antes) · T4 backup antigo (sem a chave do tipo): o desfazer não acusa
--    "mexido depois" e o tipo fica como está
-- Mutação: sem 'tipo_documento' na lista de campos da função, o T1 cai ("O campo «tipo_documento» não muda por aqui").
begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
do $fx$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  faz uuid; pl uuid; cb uuid; a uuid; b uuid;
begin
  select id into faz from public.fazendas where cliente_id = c_cli order by id limit 1;
  select id into pl from public.financeiro_plano_contas where ativo and tipo_operacao = '2-Saídas' and (cliente_id is null or cliente_id = c_cli) order by id limit 1;
  select id into cb from public.financeiro_contas_bancarias where cliente_id = c_cli order by id limit 1;
  if faz is null or pl is null or cb is null then raise exception 'fixture: o Teste precisa de fazenda, conta do plano e conta bancária'; end if;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento,
      data_pagamento, status_transacao, cenario, cancelado, plano_conta_id, numero_documento, tipo_documento, conta_bancaria_id)
  values (c_cli, faz, '-1', '2-Saídas', 3577.15, 'Combustivel sintetico', '2031-06-01', '2031-06-01', '2031-06-01', 'conciliado', 'realizado', false, pl, '9262', null, cb)
  returning id into a;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento,
      status_transacao, cenario, cancelado, plano_conta_id, numero_documento, tipo_documento, conta_bancaria_id)
  values (c_cli, faz, '-1', '2-Saídas', 10, 'Backup antigo sintetico', '2031-06-01', '2031-06-10', 'programado', 'realizado', false, pl, '1', 'Recibo', cb)
  returning id into b;
  perform set_config('teste.ids', concat_ws(',', a, b), true);
end $fx$;

set local role authenticated;
do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  x uuid[] := string_to_array(current_setting('teste.ids'), ',')::uuid[];
  pedido jsonb := jsonb_build_array(jsonb_build_object('id', x[1], 'numero_documento', '000.009.262', 'tipo_documento', 'Nota Fiscal',
    'data_competencia', '2031-05-30'));
  r jsonb; op uuid; t text;
begin
  -- T1 simular
  r := public.fn_nota_completar(c_cli, pedido, false, null, true);
  if not (r->>'ok')::boolean then raise exception 'T1: %', r; end if;
  if (r->'linhas'->0->'campos'->'tipo_documento'->>'muda')::boolean is not true or (r->'linhas'->0->'campos'->'tipo_documento'->>'fica') <> 'Nota Fiscal'
    then raise exception 'T1 tipo: %', r->'linhas'->0->'campos'->'tipo_documento'; end if;
  if (r->'linhas'->0->'campos'->'conta_bancaria_id'->>'cadeado') is null then raise exception 'T1 cadeado'; end if;
  -- T2 gravar
  r := public.fn_nota_completar(c_cli, pedido, false, null, false);
  op := (r->>'operacao')::uuid;
  select format('%s|%s|%s|%s|%s', numero_documento, tipo_documento, data_competencia, valor, status_transacao) into t from public.financeiro_lancamentos_v2 where id = x[1];
  if t is distinct from '000.009.262|Nota Fiscal|2031-05-30|3577.15|conciliado' then raise exception 'T2: %', t; end if;
  -- T3 desfazer
  r := public.fn_nota_completar_desfazer(op, false);
  if not (r->>'ok')::boolean then raise exception 'T3: %', r; end if;
  select format('%s|%s|%s', numero_documento, coalesce(tipo_documento, '∅'), data_competencia) into t from public.financeiro_lancamentos_v2 where id = x[1];
  if t is distinct from '9262|∅|2031-06-01' then raise exception 'T3 antes: %', t; end if;
  -- T4 prepara uma operação "de antes da 113050" no b: grava a descrição e depois tira a chave do tipo do backup (fora do papel, abaixo)
  r := public.fn_nota_completar(c_cli, jsonb_build_array(jsonb_build_object('id', x[2], 'descricao', 'Backup antigo sintetico 1/1')), false, null, false);
  perform set_config('teste.op', r->>'operacao', true);
end $teste$;

reset role;
update public.nota_completar_backup set antes = antes - 'tipo_documento', depois = depois - 'tipo_documento'
 where operacao = current_setting('teste.op')::uuid;

set local role authenticated;
do $teste2$
declare
  x uuid[] := string_to_array(current_setting('teste.ids'), ',')::uuid[];
  r jsonb; t text;
begin
  r := public.fn_nota_completar_desfazer(current_setting('teste.op')::uuid, true);
  if not (r->>'ok')::boolean then raise exception 'T4 mexido falso: %', r; end if;
  r := public.fn_nota_completar_desfazer(current_setting('teste.op')::uuid, false);
  select format('%s|%s', descricao, coalesce(tipo_documento, '∅')) into t from public.financeiro_lancamentos_v2 where id = x[2];
  if t is distinct from 'Backup antigo sintetico|Recibo' then raise exception 'T4: %', t; end if;
  raise exception 'OK p164_nota_completar_tipo (T1–T4)';
end $teste2$;
rollback;
