-- P128b — `fn_nota_completar` / `_registrar` / `_desfazer` (migration 20261028113040). Fixture SINTETICA no cliente Teste, no molde da Casa da
-- Cerca (5 soltas da mesma nota, nomes e competencias diferentes): L1 CONCILIADA, L2–L4 realizadas, L5 programada, todas de 400,00, no
-- mesmo fornecedor e fazenda, subcentro P1. A nota pede: descricao "Cercas sintetico i/5", nº "NF 000.004.875", competencia = emissao
-- (2031-06-02), subcentro P2; na programada tambem valor e vencimento da nota. Roda como `authenticated` (admin) e TERMINA EM RAISE.
-- T1 simular: as 5 linhas com hoje → fica; o cadeado da conta/valor/vencimento nas pagas; o efeito no DRE (P1 → P2, os meses); nada gravado
-- T2 a conciliada/paga com valor ou vencimento diferente: recusa (simular devolve; gravar levanta 22023)
-- T3 gravar com a juncao: os campos nas 5, a programada com o valor novo, as 5 num parcelamento; o backup das 5; a trilha 'nota-completar'
-- T4 registrar o que nasceu depois (um lancamento e um documento) · T5 desfazer: alguem mexeu depois → recusa dizendo o lancamento e o campo;
--    voltando o campo → desfaz TUDO (campos de antes, juncao desfeita, o criado e o documento cancelados, a operacao desfeita)
-- T6 fechada: anon nao executa
-- Mutacao: tirar o cadeado das pagas derruba T2; tirar a conferencia "mexido depois" derruba T5.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
do $fx$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  faz uuid; p1 uuid; p2 uuid; fo uuid; ids uuid[];
begin
  select id into faz from public.fazendas where cliente_id = c_cli order by id limit 1;
  select id into p1 from public.financeiro_plano_contas where ativo and tipo_operacao = '2-Saídas' and escopo_negocio = 'pecuaria'
    and (cliente_id is null or cliente_id = c_cli) and coalesce(compoe_dre, true) order by id limit 1;
  select id into p2 from public.financeiro_plano_contas where ativo and tipo_operacao = '2-Saídas' and escopo_negocio = 'pecuaria'
    and (cliente_id is null or cliente_id = c_cli) and coalesce(compoe_dre, true) and id <> p1 order by id limit 1;
  if faz is null or p1 is null or p2 is null then raise exception 'fixture: o Teste precisa de fazenda e duas contas pecuarias de saida'; end if;
  insert into public.financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (c_cli, 'Cercas Sinteticas de Teste Ltda', '20.000.000/0001-91', true) returning id into fo;
  with n as (
    insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento,
        data_pagamento, status_transacao, cenario, cancelado, plano_conta_id, favorecido_id, numero_documento)
    select c_cli, faz, '-1', '2-Saídas', 400, d, comp, venc, case when k < 5 then venc end,
           case when k = 1 then 'conciliado' when k < 5 then 'realizado' else 'programado' end, 'realizado', false, p1, fo, nd
      from (values (1, 'Parcela 1 - None', '2031-06-16'::date, '2031-06-16'::date, '4875'), (2, 'Manutencao de cercas P', '2031-07-16', '2031-07-16', 'NF 000.004.875'),
                   (3, 'Manutencao Cercas - Pa', '2031-06-02', '2031-08-16', '4875'), (4, 'Manutencao Cercas', '2031-09-16', '2031-09-16', 'NF 000.004.875'),
                   (5, 'Parcela 5 - None', '2031-10-16', '2031-10-16', 'NF 000.004.875')) v(k, d, comp, venc, nd)
    returning id, descricao)
  select array_agg(id order by (select k from (values ('Parcela 1 - None', 1), ('Manutencao de cercas P', 2), ('Manutencao Cercas - Pa', 3),
                                                       ('Manutencao Cercas', 4), ('Parcela 5 - None', 5)) o(dd, k) where o.dd = n.descricao)) into ids from n;
  perform set_config('teste.ids', array_to_string(ids, ','), true);
  perform set_config('teste.p', concat_ws(',', p1, p2), true);
end $fx$;

set local role authenticated;
do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  ids uuid[] := string_to_array(current_setting('teste.ids'), ',')::uuid[];
  pp uuid[] := string_to_array(current_setting('teste.p'), ',')::uuid[];
  p1 uuid := pp[1]; p2 uuid := pp[2];
  pedido jsonb; ruim jsonb; r jsonb; t text; op uuid; novo uuid; doc uuid;
begin
  select jsonb_agg(jsonb_build_object('id', ids[g.n], 'descricao', format('Cercas sintetico %s/5', g.n), 'numero_documento', 'NF 000.004.875',
           'data_competencia', '2031-06-02', 'plano_conta_id', p2)
         || case when g.n = 5 then jsonb_build_object('valor', 632, 'data_vencimento', '2031-10-20') else '{}' end order by g.n)
    into pedido from generate_series(1, 5) g(n);
  -- T1 simular
  r := public.fn_nota_completar(c_cli, pedido, true, '50310920000000000191550010000048751000000017', true);
  if not (r->>'ok')::boolean or jsonb_array_length(r->'linhas') <> 5 then raise exception 'T1: %', r; end if;
  if (r->'linhas'->0->'campos'->'conta_bancaria_id'->>'cadeado') is null or (r->'linhas'->0->>'situacao') <> 'conciliada' then raise exception 'T1 cadeado: %', r->'linhas'->0; end if;
  if (r->'linhas'->4->'campos'->'valor'->>'muda')::boolean is not true or (r->'linhas'->4->'campos'->'valor'->>'cadeado') is not null then raise exception 'T1 programada: %', r->'linhas'->4; end if;
  if jsonb_array_length(r->'efeito_dre') = 0 or not exists (select 1 from jsonb_array_elements(r->'efeito_dre') x where x->>'mes_para' = '2031-06') then raise exception 'T1 DRE: %', r->'efeito_dre'; end if;
  if exists (select 1 from public.financeiro_lancamentos_v2 where id = any (ids) and (plano_conta_id = p2 or financiamento_id is not null)) then raise exception 'T1 gravou'; end if;
  -- T2 a paga com valor diferente: recusa
  ruim := jsonb_set(pedido, '{1}', (pedido->1) || jsonb_build_object('valor', 401));
  r := public.fn_nota_completar(c_cli, ruim, true, null, true);
  if (r->>'ok')::boolean or jsonb_array_length(r->'recusas') = 0 then raise exception 'T2 simular: %', r; end if;
  begin
    r := public.fn_nota_completar(c_cli, ruim, true, null, false); t := 'PASSOU';
  exception when others then t := sqlstate; end;
  if t <> '22023' then raise exception 'T2 gravar: %', t; end if;
  -- T3 gravar com a juncao
  r := public.fn_nota_completar(c_cli, pedido, true, null, false);
  op := (r->>'operacao')::uuid;
  if op is null or (r->>'financiamento_id') is null then raise exception 'T3: %', r; end if;
  select string_agg(format('%s|%s|%s|%s', l.descricao, l.numero_documento, l.data_competencia, l.plano_conta_id = p2), ';' order by array_position(ids, l.id)) into t
    from public.financeiro_lancamentos_v2 l where l.id = any (ids);
  if t is distinct from 'Cercas sintetico 1/5|NF 000.004.875|2031-06-02|t;Cercas sintetico 2/5|NF 000.004.875|2031-06-02|t;Cercas sintetico 3/5|NF 000.004.875|2031-06-02|t;Cercas sintetico 4/5|NF 000.004.875|2031-06-02|t;Cercas sintetico 5/5|NF 000.004.875|2031-06-02|t'
    then raise exception 'T3 campos: %', t; end if;
  if (select valor from public.financeiro_lancamentos_v2 where id = ids[5]) <> 632 or (select valor from public.financeiro_lancamentos_v2 where id = ids[1]) <> 400 then raise exception 'T3 valor'; end if;
  if (select count(distinct financiamento_id) from public.financeiro_lancamentos_v2 where id = any (ids) and financiamento_id is not null) <> 1 then raise exception 'T3 juncao'; end if;
  perform set_config('teste.op', op::text, true);
  if not exists (select 1 from public.audit_log where registro_id = ids[2] and via = 'nota-completar') then raise exception 'T3 trilha'; end if;
end $teste$;

-- as tabelas da operação são fechadas para `authenticated` (só as funções SECDEF as leem): a conferência delas roda fora do papel
reset role;
do $confere$
begin
  if (select count(*) from public.nota_completar_backup where operacao = current_setting('teste.op')::uuid) <> 5 then raise exception 'T3 backup'; end if;
end $confere$;

set local role authenticated;
do $teste2$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  ids uuid[] := string_to_array(current_setting('teste.ids'), ',')::uuid[];
  pp uuid[] := string_to_array(current_setting('teste.p'), ',')::uuid[];
  p1 uuid := pp[1]; p2 uuid := pp[2];
  r jsonb; t text; op uuid := current_setting('teste.op')::uuid; novo uuid; doc uuid;
begin
  -- T4 registrar o que nasceu depois
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento,
      status_transacao, cenario, cancelado, plano_conta_id)
  select cliente_id, fazenda_id, '-1', '2-Saídas', 1, 'Parcela que faltava sintetica', '2031-06-02', '2031-11-16', 'programado', 'realizado', false, p2
    from public.financeiro_lancamentos_v2 where id = ids[1] returning id into novo;
  insert into public.financeiro_lancamento_documentos (cliente_id, lancamento_id, nome, especie, numero) values (c_cli, ids[1], 'nf-sintetica.xml', 'nf', '000.004.875') returning id into doc;
  perform public.fn_nota_completar_registrar(op, array[novo], array[doc]);
  -- T5 desfazer: mexido depois → recusa; voltado → desfaz tudo
  update public.financeiro_lancamentos_v2 set descricao = 'Mexido depois sintetico' where id = ids[3];
  r := public.fn_nota_completar_desfazer(op, true);
  if (r->>'ok')::boolean or (r->'mexidos_depois'->0->>'id')::uuid <> ids[3] or not (r->'mexidos_depois'->0->'campos') ? 'descricao' then raise exception 'T5 mexido: %', r; end if;
  begin
    r := public.fn_nota_completar_desfazer(op, false); t := 'PASSOU';
  exception when others then t := sqlstate; end;
  if t <> '22023' then raise exception 'T5 gravar mexido: %', t; end if;
  update public.financeiro_lancamentos_v2 set descricao = 'Cercas sintetico 3/5' where id = ids[3];
  r := public.fn_nota_completar_desfazer(op, false);
  if not (r->>'ok')::boolean or (r->>'voltaram')::int <> 5 or (r->>'criados_cancelados')::int <> 1 or (r->>'documentos_cancelados')::int <> 1 then raise exception 'T5: %', r; end if;
  select string_agg(format('%s|%s|%s|%s', l.descricao, l.numero_documento, l.data_competencia, l.plano_conta_id = p1), ';' order by array_position(ids, l.id)) into t
    from public.financeiro_lancamentos_v2 l where l.id = any (ids) and l.financiamento_id is null;
  if t is distinct from 'Parcela 1 - None|4875|2031-06-16|t;Manutencao de cercas P|NF 000.004.875|2031-07-16|t;Manutencao Cercas - Pa|4875|2031-06-02|t;Manutencao Cercas|NF 000.004.875|2031-09-16|t;Parcela 5 - None|NF 000.004.875|2031-10-16|t'
    then raise exception 'T5 antes: %', t; end if;
  if (select valor from public.financeiro_lancamentos_v2 where id = ids[5]) <> 400 then raise exception 'T5 valor'; end if;
  if not (select cancelado from public.financeiro_lancamentos_v2 where id = novo) or not (select cancelado from public.financeiro_lancamento_documentos where id = doc) then raise exception 'T5 cancelados'; end if;
  -- T6 fechada
  if has_function_privilege('anon', 'public.fn_nota_completar(uuid,jsonb,boolean,text,boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_nota_completar_desfazer(uuid,boolean)', 'EXECUTE') then raise exception 'T6 anon'; end if;
end $teste2$;

reset role;
do $fim$
begin
  if (select desfeita_em from public.nota_completar_operacao where id = current_setting('teste.op')::uuid) is null then raise exception 'T5 operacao'; end if;
  raise exception 'OK p128b_nota_completar (T1–T6)';
end $fim$;
rollback;
