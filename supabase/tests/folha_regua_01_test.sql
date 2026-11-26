-- FOLHA-REGUA-01 (118760) — roda como postgres DEPOIS da migration; termina em RAISE 'OK…' (nada fica no banco). Fixture SINTÉTICA no cliente
-- Teste (43f32d07): nomes e valores INVENTADOS; usuário = um admin real (claims da transação).
-- T1 a ficha: 6 realizados (maio…out/2026) → os 5 mais recentes, do mais novo; 1 previsto VENCIDO (fora dos dois); 4 previstos futuros → os 3
--    mais perto, do mais perto · T2 a atuação igual à que já vale é recusada (prévia e gravação), com a data em dd/mm/aaaa; a diferente passa;
--    regravar a 1ª data passa · T3 varredura no dado real (só leitura): toda ficha com pagamento ligado obedece às duas regras · T4 ACL igual.
do $t$
declare
  T constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; ADM uuid; mold public.financeiro_lancamentos_v2; pc_sal uuid; fa uuid; fun uuid; faz uuid;
  v jsonb; ok boolean; n_fichas int := 0; ruins int := 0; acl_f text; acl_a text; fid uuid; hoje date := current_date;
begin
  select proacl::text into acl_f from pg_proc where oid = 'public.fn_folha_funcionario_ficha(uuid)'::regprocedure;
  select proacl::text into acl_a from pg_proc where oid = 'public.fn_folha_atuacao_gravar(uuid,date,jsonb,boolean)'::regprocedure;
  if acl_f is distinct from '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' or acl_a is distinct from acl_f then raise exception 'T4 ACL % %', acl_f, acl_a; end if;
  select user_id into ADM from cliente_membros where perfil = 'admin_agroinblue' and ativo order by user_id limit 1;
  select * into mold from financeiro_lancamentos_v2 where cliente_id = T and not coalesce(cancelado, false) and tipo_operacao = '2-Saídas'
     and conta_bancaria_id is not null and plano_conta_id is not null order by data_competencia desc limit 1;
  select id into pc_sal from financeiro_plano_contas where cliente_id is null and subcentro ilike 'Salários e Encargos%' order by id limit 1;
  select id into faz from fazendas where cliente_id = T order by id limit 1;
  if ADM is null or mold.id is null or pc_sal is null or faz is null then raise exception 'sem fixture'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);

  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (T, 'Anacleto Regua Teste', true) returning id into fa;
  fun := (fn_folha_funcionario_gravar(T, jsonb_build_object('nome', 'Anacleto Regua Teste', 'favorecido_id', fa, 'admissao', '2024-03-10'), false)->>'id')::uuid;
  -- 6 realizados pagos no dia 5 de mai…out/2026 (valor = 1000 + mês); 1 previsto vencido; 4 previstos futuros (dez/26…mar/27)
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, plano_conta_id, favorecido_id, descricao, valor, sinal, tipo_operacao,
         status_transacao, data_competencia, data_vencimento, data_pagamento, cenario, origem_lancamento, funcionario_id)
  select T, mold.fazenda_id, mold.conta_bancaria_id, pc_sal, fa, 'Salario Teste ' || m, 1000 + m, mold.sinal, mold.tipo_operacao, 'realizado',
         make_date(2026, m, 1), make_date(2026, m, 5), make_date(2026, m, 5), 'realizado', 'manual', fun from generate_series(5, 10) m;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, plano_conta_id, favorecido_id, descricao, valor, sinal, tipo_operacao,
         status_transacao, data_competencia, data_vencimento, cenario, origem_lancamento, funcionario_id)
  select T, mold.fazenda_id, mold.conta_bancaria_id, pc_sal, fa, x.d, x.v, mold.sinal, mold.tipo_operacao, 'previsto', x.c, x.ven, 'realizado', 'manual', fun
    from (values ('Vencido Teste', 9.00, hoje - 40, hoje - 21), ('Prox Teste 4', 4.00, hoje + 80, hoje + 99), ('Prox Teste 1', 1.00, hoje - 5, hoje + 9),
                 ('Prox Teste 3', 3.00, hoje + 50, hoje + 69), ('Prox Teste 2', 2.00, hoje + 20, hoje + 39)) x(d, v, c, ven);

  -- T1
  v := fn_folha_funcionario_ficha(fun);
  if (select jsonb_agg(e->'valor' order by o) from jsonb_array_elements(v->'ultimos_pagamentos') with ordinality u(e, o)) is distinct from '[1010, 1009, 1008, 1007, 1006]'::jsonb
     then raise exception 'T1a últimos %', v->'ultimos_pagamentos'; end if;
  if (select jsonb_agg(e->'valor' order by o) from jsonb_array_elements(v->'proximos_pagamentos') with ordinality u(e, o)) is distinct from '[1.00, 2.00, 3.00]'::jsonb
     then raise exception 'T1b próximos %', v->'proximos_pagamentos'; end if;
  if v->'proximos_pagamentos'->0->>'data' is distinct from (hoje + 9)::text then raise exception 'T1c data do próximo %', v->'proximos_pagamentos'->0; end if;

  -- T2
  perform fn_folha_atuacao_gravar(fun, '2026-01-01', jsonb_build_array(jsonb_build_object('fazenda_id', faz, 'atividade', 'pecuaria', 'pct', 100)), false);
  ok := false; begin perform fn_folha_atuacao_gravar(fun, '2026-07-28', jsonb_build_array(jsonb_build_object('fazenda_id', faz, 'atividade', 'pecuaria', 'pct', 100)), true);
    exception when sqlstate 'P0001' then ok := sqlerrm = 'Essa atuação já vale desde 01/01/2026 — nada a gravar.'; end;
  if not ok then raise exception 'T2a (a prévia da repetida não recusou)'; end if;
  ok := false; begin perform fn_folha_atuacao_gravar(fun, '2026-07-28', jsonb_build_array(jsonb_build_object('fazenda_id', faz, 'atividade', 'pecuaria', 'pct', '100.00')), false);
    exception when sqlstate 'P0001' then ok := position('já vale' in sqlerrm) > 0; end;
  if not ok or exists (select 1 from folha_funcionario_atuacao where funcionario_id = fun and desde = '2026-07-28') then raise exception 'T2b (gravou a repetida)'; end if;
  perform fn_folha_atuacao_gravar(fun, '2026-07-28', jsonb_build_array(jsonb_build_object('fazenda_id', faz, 'atividade', 'agricultura', 'pct', 100)), false);
  if (select count(*) from folha_funcionario_atuacao where funcionario_id = fun) <> 2 then raise exception 'T2c (a diferente não gravou)'; end if;
  perform fn_folha_atuacao_gravar(fun, '2026-01-01', jsonb_build_array(jsonb_build_object('fazenda_id', faz, 'atividade', 'pecuaria', 'pct', 100)), true);

  -- T3 varredura no dado real (só leitura)
  for fid in select distinct funcionario_id from financeiro_lancamentos_v2 where funcionario_id is not null and cliente_id <> T loop
    v := fn_folha_funcionario_ficha(fid); n_fichas := n_fichas + 1;
    if exists (select 1 from jsonb_array_elements(v->'ultimos_pagamentos') e where e->>'status' <> 'realizado' or (e->>'data')::date > hoje)
       or exists (select 1 from jsonb_array_elements(v->'proximos_pagamentos') e where e->>'status' = 'realizado' or (e->>'data')::date < hoje)
       or jsonb_array_length(v->'ultimos_pagamentos') > 5 or jsonb_array_length(v->'proximos_pagamentos') > 3 then ruins := ruins + 1; end if;
  end loop;
  if n_fichas < 100 or ruins > 0 then raise exception 'T3 % fichas, % fora da regra', n_fichas, ruins; end if;

  raise exception 'OK FOLHA-REGUA-01 · T1 T2 · T3 % fichas reais, 0 fora da regra · T4 ACL igual', n_fichas;
end $t$;
