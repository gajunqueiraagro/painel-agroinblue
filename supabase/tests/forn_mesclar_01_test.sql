-- FORN-MESCLAR-01 — teste sintetico no cliente Teste (nenhuma mesclagem em dado real). Termina em RAISE 'OK' (tudo desfeito).
-- M1 simular nao grava e conta por modulo · M2 gravar move, junta apelidos e inativa · M3 desfazer devolve tudo · M4 linha mexida
-- depois fica e e' contada · M5 CPF/CNPJ diferentes recusam · M6 outro cliente e sem usuario: 42501 · M7 desfazer sem motivo e duas
-- vezes recusa · M8 sugestoes por nome e por documento · M9 ACL.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; fz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  cb constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  m uuid; a1 uuid; a2 uuid; d uuid; x uuid; l1 uuid; l2 uuid; l3 uuid; ps record; r jsonb; v_log uuid; v_st text; v_msg text; q record;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);
  select id, subcentro into ps from financeiro_plano_contas where cliente_id is null and ativo and tipo_operacao = '2-Saídas' and macro_custo <> 'Dividendos' order by ordem_exibicao limit 1;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'SINT Banco Mescla S.A. (001)', true) returning id into m;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'SINT BANCO MESCLA', false) returning id into a1;
  insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (k, 'SINT Banco Mescla Ltda', '11.222.333/0001-81', true) returning id into a2;
  insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (k, 'SINT Outro Doc', '44.555.666/0001-00', true) returning id into d;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento, favorecido_id)
  values (k, fz, cb, '2031-04-10', '2031-04-15', 100, '-1', '2-Saídas', 'programado', 'SINT m1', ps.id, ps.subcentro, 'realizado', 'manual', a1) returning id into l1;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento, favorecido_id)
  values (k, fz, cb, '2031-04-10', '2031-04-15', 200, '-1', '2-Saídas', 'programado', 'SINT m2', ps.id, ps.subcentro, 'realizado', 'manual', a1) returning id into l2;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, data_competencia, data_vencimento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento, favorecido_id)
  values (k, fz, cb, '2031-04-10', '2031-04-15', 300, '-1', '2-Saídas', 'programado', 'SINT m3', ps.id, ps.subcentro, 'realizado', 'manual', a2) returning id into l3;

  -- M8 sugestoes (antes de mesclar): o grupo por nome traz os tres "Banco Mescla"
  r := public.fn_fornecedor_repetidos(k);
  /* FORN-MESCLAR-02b: a chave do grupo passou a ser o componente (nao o nome); o grupo e' achado pelos tres cadastros */
  if not exists (select 1 from jsonb_array_elements(r) g where g->>'motivo' = 'nome'
                  and g->'fornecedores' @> jsonb_build_array(jsonb_build_object('id', m), jsonb_build_object('id', a1), jsonb_build_object('id', a2))
                  and jsonb_array_length(g->'fornecedores') = 3) then raise exception 'M8 nome: %', r; end if;

  -- M1 simular
  r := public.fn_fornecedor_mesclar(m, array[a1, a2], true);
  if r->'recusa' <> 'null'::jsonb or (r->>'total')::int <> 3 or (r->'por_modulo'->>'Financeiro')::int <> 3 or (r->>'simulado')::boolean is distinct from true
    then raise exception 'M1 previa: %', r; end if;
  if (select favorecido_id from financeiro_lancamentos_v2 where id = l1) is distinct from a1 then raise exception 'M1 simular gravou'; end if;
  if exists (select 1 from fornecedor_mesclagem_log where mantido_id = m) then raise exception 'M1 log gravado'; end if;

  -- M2 gravar
  r := public.fn_fornecedor_mesclar(m, array[a1, a2], false);
  v_log := (r->>'mesclagem_id')::uuid;
  if (select count(*) from financeiro_lancamentos_v2 where id in (l1, l2, l3) and favorecido_id = m) <> 3 then raise exception 'M2 nao moveu'; end if;
  select * into q from financeiro_fornecedores where id = a2;
  if q.ativo or q.fundido_em_id is distinct from m or q.fundido_motivo is distinct from 'mesclado em SINT Banco Mescla S.A. (001)' then raise exception 'M2 absorvido: %', row_to_json(q); end if;
  if not (select aliases @> '["SINT BANCO MESCLA", "SINT Banco Mescla Ltda", "11.222.333/0001-81"]'::jsonb from financeiro_fornecedores where id = m) then raise exception 'M2 apelidos'; end if;
  if (select editado_manual from financeiro_lancamentos_v2 where id = l1) then raise exception 'M2 marcou editado_manual'; end if;

  -- M7 desfazer sem motivo
  begin perform public.fn_fornecedor_mesclagem_desfazer(v_log, '  ', false); raise exception 'M7 sem motivo passou';
  exception when sqlstate 'P0001' then get stacked diagnostics v_msg = message_text; if v_msg not like 'Informe o motivo%' then raise; end if; end;

  -- M3 desfazer (simular, depois de verdade)
  r := public.fn_fornecedor_mesclagem_desfazer(v_log, null, true);
  if (r->>'voltaram')::int <> 3 or (select favorecido_id from financeiro_lancamentos_v2 where id = l3) is distinct from m then raise exception 'M3 simular: %', r; end if;
  r := public.fn_fornecedor_mesclagem_desfazer(v_log, 'teste', false);
  if (r->>'voltaram')::int <> 3 or (r->>'ficaram')::int <> 0 then raise exception 'M3: %', r; end if;
  if (select favorecido_id from financeiro_lancamentos_v2 where id = l1) is distinct from a1
     or (select favorecido_id from financeiro_lancamentos_v2 where id = l3) is distinct from a2 then raise exception 'M3 nao voltou'; end if;
  select * into q from financeiro_fornecedores where id = a2;
  if not q.ativo or q.fundido_em_id is not null then raise exception 'M3 absorvido nao voltou'; end if;
  if (select ativo from financeiro_fornecedores where id = a1) then raise exception 'M3 a1 era inativo'; end if;
  if (select coalesce(jsonb_array_length(nullif(aliases, 'null'::jsonb)), 0) from financeiro_fornecedores where id = m) <> 0 then raise exception 'M3 apelidos'; end if;
  begin perform public.fn_fornecedor_mesclagem_desfazer(v_log, 'de novo', false); raise exception 'M7 duas vezes passou';
  exception when sqlstate 'P0001' then get stacked diagnostics v_msg = message_text; if v_msg not like 'Esta mesclagem já foi desfeita%' then raise; end if; end;

  -- M4 linha mexida depois fica
  r := public.fn_fornecedor_mesclar(m, array[a1, a2], false); v_log := (r->>'mesclagem_id')::uuid;
  update financeiro_lancamentos_v2 set favorecido_id = d where id = l2;
  r := public.fn_fornecedor_mesclagem_desfazer(v_log, 'teste', false);
  if (r->>'voltaram')::int <> 2 or (r->>'ficaram')::int <> 1 or (select favorecido_id from financeiro_lancamentos_v2 where id = l2) is distinct from d
    then raise exception 'M4: %', r; end if;

  -- M5 CPF/CNPJ diferentes
  r := public.fn_fornecedor_mesclar(a2, array[d], true);
  if r->'recusa'->>'motivo' is distinct from 'cnpj_diferente' then raise exception 'M5 simular: %', r; end if;
  begin perform public.fn_fornecedor_mesclar(a2, array[d], false); raise exception 'M5 passou';
  exception when sqlstate 'P0001' then get stacked diagnostics v_msg = message_text; if v_msg not like 'CPF/CNPJ diferentes%' then raise; end if; end;

  -- M6 outro cliente e sem usuario
  select id into x from financeiro_fornecedores where cliente_id <> k limit 1;
  begin perform public.fn_fornecedor_mesclar(m, array[x], true); raise exception 'M6 misto passou';
  exception when sqlstate '42501' then null; end;
  perform set_config('request.jwt.claims', '', true);
  begin perform public.fn_fornecedor_mesclar(m, array[a1], true); raise exception 'M6 sem usuario passou';
  exception when sqlstate '42501' then null; end;
  begin perform public.fn_fornecedor_repetidos(k); raise exception 'M6 repetidos sem usuario passou';
  exception when sqlstate '42501' then null; end;

  -- M9 ACL
  if has_function_privilege('anon', 'public.fn_fornecedor_mesclar(uuid, uuid[], boolean, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.fn_fornecedor_mesclagem_desfazer(uuid, text, boolean)', 'execute')
     or has_function_privilege('anon', 'public.fn_fornecedor_repetidos(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._fn_fornecedor_mesclar_exec(uuid, uuid[], jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public._fn_fornecedor_mesclagem_desfazer_exec(uuid, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.fn_fornecedor_mesclar(uuid, uuid[], boolean, jsonb)', 'execute')
     or has_table_privilege('authenticated', 'public.fornecedor_mesclagem_log', 'insert')
    then raise exception 'M9 ACL'; end if;

  raise exception 'OK';
end $teste$;
