-- FORN-TROCAR-LOTE-01 — `fn_lancamentos_trocar_favorecido` e `_desfazer` (migration 20261028110940). Fixture SINTETICA no cliente Teste
-- (dois fornecedores criados aqui, quatro lancamentos do Teste apontados para o de origem, um mes fechado de mentira); roda como
-- `authenticated` com as claims de um admin (e de um usuario SEM acesso, para a guarda) e TERMINA EM RAISE: nada fica no banco.
-- T0 catalogo (SECDEF; anon nao executa) · T1 simular: contagem, soma, origens, mes fechado, nada gravado · T2 recusas (destino inativo,
-- id de outro cliente, motivo vazio ao aplicar) · T3 aplicar: so' o fornecedor muda (valor, datas, conta, status iguais), a operacao
-- guarda o antes · T4 desfazer: volta so' quem segue no destino, conta o que outra mao trocou · T5 guarda de acesso (42501)
-- T6 (01b, migration 20261028111460) o resumo sem destino inclui o lancamento sem fornecedor; aplicar sem destino recusa.
-- Mutacoes: tirar o filtro "segue no destino" do desfazer derruba T4; tirar a guarda `tenant_ok` derruba T5; trocar sem gravar o
-- antes derruba T3/T4.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';
-- ── fixture (como postgres) ──
do $fx$
declare c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; a uuid; b uuid; z uuid; ids uuid[]; outro uuid; l1 record;
begin
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo) values (c_cli, 'FORNECEDOR ORIGEM SINTETICO TROCA', true) returning id into a;
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo) values (c_cli, 'FORNECEDOR DESTINO SINTETICO TROCA', true) returning id into b;
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo) values (c_cli, 'FORNECEDOR INATIVO SINTETICO TROCA', false) returning id into z;
  select array_agg(id order by id) into ids from (select id from public.financeiro_lancamentos_v2
     where cliente_id = c_cli and not cancelado and origem_lancamento <> 'importacao_historica' order by id limit 4) s;
  if cardinality(ids) < 4 then raise exception 'fixture: o Teste precisa de 4 lancamentos'; end if;
  update public.financeiro_lancamentos_v2 set favorecido_id = a where id = any (ids[1:3]);
  update public.financeiro_lancamentos_v2 set favorecido_id = b where id = ids[4];          -- ja' no destino
  select id into outro from public.financeiro_lancamentos_v2 where cliente_id <> c_cli limit 1;
  select fazenda_id, ano_mes into l1 from public.financeiro_lancamentos_v2 where id = ids[2];   -- o 1o do Teste nao tem fazenda
  delete from public.financeiro_fechamentos where cliente_id = c_cli and fazenda_id = l1.fazenda_id and ano_mes = l1.ano_mes;
  insert into public.financeiro_fechamentos (cliente_id, fazenda_id, ano_mes, status_fechamento) values (c_cli, l1.fazenda_id, l1.ano_mes, 'fechado');
  perform set_config('teste.a', a::text, true); perform set_config('teste.b', b::text, true); perform set_config('teste.z', z::text, true);
  perform set_config('teste.ids', array_to_string(ids, ','), true); perform set_config('teste.outro', outro::text, true);
end $fx$;
create temp table _antes on commit drop as
  select id, valor, data_competencia, data_vencimento, data_pagamento, conta_bancaria_id, status_transacao, plano_conta_id
    from public.financeiro_lancamentos_v2 where id = any (string_to_array(current_setting('teste.ids'), ',')::uuid[]);
grant select on _antes to authenticated;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  a uuid := current_setting('teste.a')::uuid; b uuid := current_setting('teste.b')::uuid; z uuid := current_setting('teste.z')::uuid;
  ids uuid[] := string_to_array(current_setting('teste.ids'), ',')::uuid[]; outro uuid := current_setting('teste.outro')::uuid;
  r jsonb; t text; op uuid; n int;
begin
  -- T0
  if not (select prosecdef from pg_proc where proname = 'fn_lancamentos_trocar_favorecido') then raise exception 'T0 INVOKER'; end if;
  if has_function_privilege('anon', 'public.fn_lancamentos_trocar_favorecido(uuid,uuid[],uuid,text,boolean)', 'EXECUTE') then raise exception 'T0 anon'; end if;
  if has_function_privilege('anon', 'public.fn_lancamentos_trocar_favorecido_desfazer(uuid,text,boolean)', 'EXECUTE') then raise exception 'T0 anon desfazer'; end if;

  -- T1
  r := public.fn_lancamentos_trocar_favorecido(c_cli, ids, b, null, true);
  if (r->>'ok')::boolean is not true or (r->>'lancamentos')::int <> 3 or (r->>'ja_no_destino')::int <> 1
     or (r->>'soma')::numeric <> (select round(sum(valor)::numeric, 2) from _antes where id = any (ids[1:3]))
     or jsonb_array_length(r->'origens') <> 1 or (r->'origens'->0->>'id')::uuid <> a or (r->'origens'->0->>'lancamentos')::int <> 3
     or jsonb_array_length(r->'meses_fechados') <> 1 or (r->>'meses_fechados_lancamentos')::int < 1 then
    raise exception 'T1: %', r;
  end if;
  if exists (select 1 from public.financeiro_lancamentos_v2 where id = any (ids[1:3]) and favorecido_id <> a) then raise exception 'T1 simular gravou'; end if;
  if exists (select 1 from public.lancamento_favorecido_trocas where cliente_id = c_cli and fornecedor_destino_id = b) then raise exception 'T1 operacao gravada'; end if;

  -- T2
  r := public.fn_lancamentos_trocar_favorecido(c_cli, ids, z, null, true);
  if r->'recusa'->>'motivo' <> 'destino_inativo' then raise exception 'T2 inativo: %', r; end if;
  r := public.fn_lancamentos_trocar_favorecido(c_cli, ids || outro, b, null, true);
  if r->'recusa'->>'motivo' <> 'fora_do_cliente' then raise exception 'T2 outro cliente: %', r; end if;
  begin
    r := public.fn_lancamentos_trocar_favorecido(c_cli, ids, b, '  ', false); t := 'PASSOU';
  exception when others then t := sqlstate || ' ' || sqlerrm; end;
  if t <> 'P0001 Informe o motivo da troca. Nada foi gravado.' then raise exception 'T2 motivo: %', t; end if;

  -- T3
  r := public.fn_lancamentos_trocar_favorecido(c_cli, ids, b, 'teste sintetico', false);
  op := (r->>'operacao_id')::uuid;
  if op is null or (select count(*) from public.financeiro_lancamentos_v2 where id = any (ids) and favorecido_id = b) <> 4 then raise exception 'T3: %', r; end if;
  if exists (select 1 from public.financeiro_lancamentos_v2 l join _antes x on x.id = l.id
              where (l.valor, l.data_competencia, l.data_vencimento, l.data_pagamento, l.conta_bancaria_id, l.status_transacao, l.plano_conta_id)
                    is distinct from (x.valor, x.data_competencia, x.data_vencimento, x.data_pagamento, x.conta_bancaria_id, x.status_transacao, x.plano_conta_id)) then
    raise exception 'T3 mexeu em outro campo';
  end if;
  select count(*) into n from public.lancamento_favorecido_trocas o, jsonb_array_elements(o.lancamentos) e
   where o.id = op and (e->>'favorecido_antes')::uuid = a;
  if n <> 3 then raise exception 'T3 antes: %', n; end if;

  -- T4: outra mao troca o 1o de volta para A; o desfazer devolve 2 e conta 1
  reset role;
  update public.financeiro_lancamentos_v2 set favorecido_id = a where id = ids[1];
  set local role authenticated;
  r := public.fn_lancamentos_trocar_favorecido_desfazer(op, 'teste', false);
  if (r->>'voltaram')::int <> 2 or (r->>'ficaram')::int <> 1 then raise exception 'T4: %', r; end if;
  if (select count(*) from public.financeiro_lancamentos_v2 where id = any (ids[1:3]) and favorecido_id = a) <> 3
     or (select favorecido_id from public.financeiro_lancamentos_v2 where id = ids[4]) <> b then raise exception 'T4 estado'; end if;
  begin
    r := public.fn_lancamentos_trocar_favorecido_desfazer(op, 'de novo', false); t := 'PASSOU';
  exception when others then t := sqlerrm; end;
  if t <> 'Esta troca já foi desfeita. Nada foi gravado.' then raise exception 'T4 duas vezes: %', t; end if;

  -- T6 (01b): o resumo SEM destino (a tela antes de escolher) — o lancamento SEM fornecedor entra; aplicar sem destino recusa
  reset role;
  update public.financeiro_lancamentos_v2 set favorecido_id = null where id = ids[1];
  set local role authenticated;
  r := public.fn_lancamentos_trocar_favorecido(c_cli, ids, null, null, true);
  if (r->>'sem_destino')::boolean is not true or (r->>'lancamentos')::int <> 4
     or not exists (select 1 from jsonb_array_elements(r->'origens') o where o->>'nome' = 'Sem fornecedor') then raise exception 'T6: %', r; end if;
  begin r := public.fn_lancamentos_trocar_favorecido(c_cli, ids, null, 'x', false); t := 'PASSOU';
  exception when others then t := sqlerrm; end;
  if t <> 'O fornecedor escolhido não é deste cliente. Nada foi gravado.' then raise exception 'T6 aplicar sem destino: %', t; end if;

  -- T5
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  begin
    r := public.fn_lancamentos_trocar_favorecido(c_cli, ids, a, 'x', true); t := 'PASSOU';
  exception when others then t := sqlstate; end;
  if t <> '42501' then raise exception 'T5: %', t; end if;

  raise exception 'OK forn_trocar_lote_01 (T0–T6)';
end $teste$;
rollback;
