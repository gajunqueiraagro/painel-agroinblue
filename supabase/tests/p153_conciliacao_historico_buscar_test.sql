-- P153 — a `fn_conciliacao_historico_buscar` (migrations 20261028115070 e 20261028115080, a D4: SECURITY DEFINER). Fixture SINTÉTICA no cliente Teste ("Zebrálux", nome inventado).
-- Roda como `authenticated` (admin) e TERMINA EM RAISE (nada fica no banco).
-- T1 ACL: authenticated executa, anon não; SECURITY DEFINER (D4)
-- T2 "zebralux" (sem acento) acha o texto do banco casado (L1), a descrição (L2, realizado SEM extrato — D2) e o fornecedor (L3);
--    não acha o cancelado (L4), o do vínculo desfeito (L5) nem o previsto (L6); `onde` diz por onde casou
-- T3 só 'banco' = L1 · só 'fornecedor' = L1 e L3 · só 'descricao' = L2
-- T4 ordem pelo valor mais perto do movimento (p_valor = -500 → L2 primeiro)
-- T5 resumo: o fornecedor que mais aparece (2 vezes, desde o 1º pagamento) · T6 o período tira o que está fora
-- T7 outro usuário (não membro) recebe 42501, nunca vazio · T8 `p_onde` inválido = 22023; termo de 1 letra = vazio
-- T9 (D4) um membro comum de OUTRO cliente recebe 42501 — o DEFINER não abre o Teste a quem não é dele
-- Mutações: sem o filtro do vínculo vivo, o T2 cai (L5 aparece); sem `status_transacao = 'realizado'`, o T2 cai (L6 aparece);
-- sem o `tenant_ok`, o T7 e o T9 caem.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
do $fx$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  faz uuid; pl uuid; cb uuid; f1 uuid; f2 uuid; l1 uuid; l2 uuid; l3 uuid; l4 uuid; l5 uuid; l6 uuid; e1 uuid; e5 uuid;
  lanc constant text := 'insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia,
      data_vencimento, data_pagamento, status_transacao, cenario, cancelado, plano_conta_id, conta_bancaria_id, favorecido_id)
    values ($1, $2, ''-1'', ''2-Saídas'', $3, $4, $5, $5, $6, $7, ''realizado'', $8, $9, $10, $11) returning id';
begin
  select id into faz from public.fazendas where cliente_id = c_cli order by id limit 1;
  select id into pl from public.financeiro_plano_contas where ativo and tipo_operacao = '2-Saídas' and (cliente_id is null or cliente_id = c_cli) order by id limit 1;
  select id into cb from public.financeiro_contas_bancarias where cliente_id = c_cli order by id limit 1;
  if faz is null or pl is null or cb is null then raise exception 'fixture: o Teste precisa de fazenda, conta do plano e conta bancária'; end if;
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo) values (c_cli, 'Zebrálux Comércio Sintético', true) returning id into f1;
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo) values (c_cli, 'Outro Fornecedor Sintético', true) returning id into f2;
  execute lanc into l1 using c_cli, faz, 1382, 'Ração de engorda', date '2031-05-01', date '2031-05-10', 'realizado', false, pl, cb, f1;
  execute lanc into l2 using c_cli, faz, 500, 'Sal mineral zebralux', date '2031-06-01', date '2031-06-05', 'realizado', false, pl, cb, f2;
  execute lanc into l3 using c_cli, faz, 900, 'Frete do lote', date '2031-07-01', date '2031-07-02', 'realizado', false, pl, cb, f1;
  execute lanc into l4 using c_cli, faz, 77, 'Zebralux cancelado', date '2031-07-01', date '2031-07-03', 'realizado', true, pl, cb, f2;
  execute lanc into l5 using c_cli, faz, 88, 'Outra coisa', date '2031-07-01', date '2031-07-04', 'realizado', false, pl, cb, f2;
  execute lanc into l6 using c_cli, faz, 99, 'Zebralux previsto', date '2031-08-01', null::date, 'previsto', false, pl, cb, f2;
  insert into public.extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, descricao, valor, tipo_movimento, hash_movimento, status)
    values (c_cli, cb, '2031-05-10', 'PAGAMENTO DE BOLETO - ZEBRALUX SINT', -1382, 'debito', 'p153-teste-e1', 'conciliado') returning id into e1;
  insert into public.extrato_bancario_v2 (cliente_id, conta_bancaria_id, data_movimento, descricao, valor, tipo_movimento, hash_movimento, status)
    values (c_cli, cb, '2031-07-04', 'PIX ENVIADO ZEBRALUX DESFEITO', -88, 'debito', 'p153-teste-e5', 'conciliado') returning id into e5;
  insert into public.conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado) values (c_cli, e1, l1, 1382);
  insert into public.conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado, desfeito_em, desfeito_motivo)
    values (c_cli, e5, l5, 88, now(), 'teste p153');
  perform set_config('teste.ids', concat_ws(',', l1, l2, l3, l4, l5, l6, f1), true);
end $fx$;

do $antes$
declare s constant text := 'public.fn_conciliacao_historico_buscar(uuid,text,text[],date,date,numeric)';
begin
  if to_regprocedure(s) is null then raise exception 'T1 a função não existe'; end if;
  if not has_function_privilege('authenticated', s, 'EXECUTE') or has_function_privilege('anon', s, 'EXECUTE') then raise exception 'T1 ACL'; end if;
  if not (select prosecdef from pg_proc where oid = to_regprocedure(s)) then raise exception 'T1 não é SECURITY DEFINER'; end if;
end $antes$;
-- T9: um membro comum (não admin) de outro cliente, que não é membro do Teste
select set_config('teste.outro', coalesce((select cm.user_id::text from public.cliente_membros cm
  where cm.ativo and cm.cliente_id <> '43f32d07-dba8-4670-900c-bf645440c04a' and not public.is_admin_agroinblue(cm.user_id)
    and not exists (select 1 from public.cliente_membros t where t.user_id = cm.user_id and t.ativo and t.cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a')
  order by cm.user_id limit 1), ''), true);

set local role authenticated;
do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  ids text[] := string_to_array(current_setting('teste.ids'), ',');
  l1 text := ids[1]; l2 text := ids[2]; l3 text := ids[3]; l4 text := ids[4]; l5 text := ids[5]; l6 text := ids[6]; f1 text := ids[7];
  r jsonb; achou text[]; t text;
  de constant date := '2031-01-01'; ate constant date := '2031-12-31';
begin
  -- T2 os três lugares, sem acento no termo
  r := public.fn_conciliacao_historico_buscar(c_cli, 'ZEBRALUX', array['banco', 'descricao', 'fornecedor'], de, ate, null);
  select array_agg(e->>'lancamento_id' order by e->>'lancamento_id') into achou from jsonb_array_elements(r->'achados') e;
  if achou is distinct from (select array_agg(x order by x) from unnest(array[l1, l2, l3]) x) then raise exception 'T2 achados: %', r; end if;
  if (r->>'total')::int <> 3 then raise exception 'T2 total: %', r; end if;
  if (select e->'onde' from jsonb_array_elements(r->'achados') e where e->>'lancamento_id' = l1) <> '["banco", "fornecedor"]'::jsonb
    then raise exception 'T2 onde L1: %', r; end if;
  if (select e->>'banco' from jsonb_array_elements(r->'achados') e where e->>'lancamento_id' = l1) <> 'PAGAMENTO DE BOLETO - ZEBRALUX SINT'
    then raise exception 'T2 banco L1: %', r; end if;
  if (select e->>'valor' from jsonb_array_elements(r->'achados') e where e->>'lancamento_id' = l1)::numeric <> -1382 then raise exception 'T2 valor com sinal: %', r; end if;
  -- T3 cada lugar sozinho
  r := public.fn_conciliacao_historico_buscar(c_cli, 'zebralux', array['banco'], de, ate, null);
  select array_agg(e->>'lancamento_id') into achou from jsonb_array_elements(r->'achados') e;
  if achou is distinct from array[l1] then raise exception 'T3 banco: %', r; end if;
  r := public.fn_conciliacao_historico_buscar(c_cli, 'zebrálux', array['fornecedor'], de, ate, null);
  select array_agg(e->>'lancamento_id' order by e->>'lancamento_id') into achou from jsonb_array_elements(r->'achados') e;
  if achou is distinct from (select array_agg(x order by x) from unnest(array[l1, l3]) x) then raise exception 'T3 fornecedor: %', r; end if;
  r := public.fn_conciliacao_historico_buscar(c_cli, 'zebralux', array['descricao'], de, ate, null);
  select array_agg(e->>'lancamento_id') into achou from jsonb_array_elements(r->'achados') e;
  if achou is distinct from array[l2] then raise exception 'T3 descrição: %', r; end if;
  -- T4 a ordem pelo valor mais perto do movimento
  r := public.fn_conciliacao_historico_buscar(c_cli, 'zebralux', array['banco', 'descricao', 'fornecedor'], de, ate, -500);
  if r->'achados'->0->>'lancamento_id' <> l2 then raise exception 'T4 ordem: %', r; end if;
  r := public.fn_conciliacao_historico_buscar(c_cli, 'zebralux', array['banco', 'descricao', 'fornecedor'], de, ate, -1380);
  if r->'achados'->0->>'lancamento_id' <> l1 then raise exception 'T4 ordem (-1380): %', r; end if;
  -- T5 o resumo da faixa: o Zebrálux 2 vezes, desde 10/05/2031
  if r->'resumo'->>'fornecedor_id' <> f1 or (r->'resumo'->>'vezes')::int <> 2 or r->'resumo'->>'desde' <> '2031-05-10'
    then raise exception 'T5 resumo: %', r->'resumo'; end if;
  -- T6 o período
  r := public.fn_conciliacao_historico_buscar(c_cli, 'zebralux', array['banco', 'descricao', 'fornecedor'], date '2031-06-01', ate, null);
  if (r->>'total')::int <> 2 then raise exception 'T6 período: %', r; end if;
  -- T8 lugar inválido e termo curto
  begin
    r := public.fn_conciliacao_historico_buscar(c_cli, 'zebralux', array['qualquer'], de, ate, null); t := 'PASSOU';
  exception when others then t := sqlstate; end;
  if t <> '22023' then raise exception 'T8 onde inválido: %', t; end if;
  r := public.fn_conciliacao_historico_buscar(c_cli, 'z', array['banco'], de, ate, null);
  if (r->>'total')::int <> 0 or jsonb_array_length(r->'achados') <> 0 then raise exception 'T8 termo curto: %', r; end if;
  -- T7 um usuário que não é membro do cliente
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000153","role":"authenticated"}', true);
  begin
    r := public.fn_conciliacao_historico_buscar(c_cli, 'zebralux', array['banco'], de, ate, null); t := 'PASSOU';
  exception when others then t := sqlstate; end;
  if t <> '42501' then raise exception 'T7 outro usuário: %', t; end if;
  if current_setting('teste.outro') = '' then raise exception 'T9 fixture: nenhum membro comum de outro cliente'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('teste.outro'), 'role', 'authenticated')::text, true);
  begin
    r := public.fn_conciliacao_historico_buscar(c_cli, 'zebralux', array['banco', 'descricao', 'fornecedor'], de, ate, null); t := 'PASSOU';
  exception when others then t := sqlstate; end;
  if t <> '42501' then raise exception 'T9 membro de outro cliente: %', t; end if;
  raise exception 'OK p153_conciliacao_historico_buscar (T1–T9)';
end $teste$;
