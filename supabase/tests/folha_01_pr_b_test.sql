-- FOLHA-01 · teste do PR B (118420): B1 ficha · B2 documentos · B3 pendências · B4 descartar · B5 sem a folha · B6 fechadas · B7 leituras das abas. Roda como postgres DEPOIS da 118420; termina em RAISE 'OK…'; nada fica no banco.
-- Fixture no cliente Teste (43f32d07) com nomes e valores INVENTADOS. Usuário = um admin real (claims da transação); L = membro de outro cliente.
do $t$
declare
  T uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; ADM uuid; L uuid; mold public.financeiro_lancamentos_v2; pc_sal uuid;
  fz uuid; fp uuid; fapel uuid; fcont uuid; f13a uuid; f13b uuid;
  fun_z uuid; fun_p uuid; fun_a uuid; fun_b uuid; l_p uuid; l_apel uuid; l_desc uuid; l13a uuid; l13b uuid; d_epi uuid; d_rec uuid;
  r jsonb; ok boolean; it jsonb;
begin
  select user_id into ADM from cliente_membros where perfil = 'admin_agroinblue' and ativo order by user_id limit 1;
  select m.user_id into L from cliente_membros m where m.ativo and m.perfil <> 'admin_agroinblue' and m.cliente_id <> T
     and not exists (select 1 from cliente_membros a where a.user_id = m.user_id and (a.perfil = 'admin_agroinblue' or a.cliente_id = T)) order by m.user_id limit 1;
  select * into mold from financeiro_lancamentos_v2 where cliente_id = T and not coalesce(cancelado, false) and tipo_operacao = '2-Saídas'
     and conta_bancaria_id is not null order by data_competencia desc limit 1;
  select id into pc_sal from financeiro_plano_contas where cliente_id is null and subcentro ilike 'Salários e Encargos%' order by id limit 1;
  if ADM is null or L is null or mold.id is null or pc_sal is null then raise exception 'sem fixture'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);

  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (T, 'Zoroastro Inventado Pires', true) returning id into fp;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (T, 'Teodolino Ficticio Rocha (Apelido)', true) returning id into fapel;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (T, 'Contabilidade Inventada Ltda', true) returning id into fcont;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (T, 'Anacleto Teste Bento', true) returning id into f13a;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (T, 'Bonifacio Teste Lima', true) returning id into f13b;
  fun_z := (fn_folha_funcionario_gravar(T, '{"nome":"Zebedeu Ficticio Prado","nascimento":"1990-05-04","pis":"120.12345.67-8"}', false)->>'id')::uuid;
  fun_p := (fn_folha_funcionario_gravar(T, '{"nome":"Teodolino Ficticio Rocha"}', false)->>'id')::uuid;
  fun_a := (fn_folha_funcionario_gravar(T, jsonb_build_object('nome', 'Anacleto Teste Bento', 'favorecido_id', f13a), false)->>'id')::uuid;
  fun_b := (fn_folha_funcionario_gravar(T, jsonb_build_object('nome', 'Bonifacio Teste Lima', 'favorecido_id', f13b), false)->>'id')::uuid;

  -- B1 a ficha: PIS normalizado; chave ausente MANTÉM; PIS curto recusa
  if (select pis from folha_funcionarios where id = fun_z) <> '12012345678' or (select nascimento from folha_funcionarios where id = fun_z) <> '1990-05-04' then raise exception 'B1a'; end if;
  perform fn_folha_funcionario_gravar(T, jsonb_build_object('id', fun_z, 'nome', 'Zebedeu Ficticio Prado', 'ctps', '1234567 série 001'), false);
  if (select nascimento from folha_funcionarios where id = fun_z) is null or (select pis from folha_funcionarios where id = fun_z) is null
     or (select ctps from folha_funcionarios where id = fun_z) <> '1234567 série 001' then raise exception 'B1b (chave ausente apagou)'; end if;
  ok := false; begin perform fn_folha_funcionario_gravar(T, jsonb_build_object('id', fun_z, 'nome', 'Zebedeu Ficticio Prado', 'pis', '123'), false);
    exception when sqlstate 'P0001' then ok := true; end;
  if not ok then raise exception 'B1c (PIS curto passou)'; end if;

  -- lançamentos de folha (conta de salário), sem funcionário
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, plano_conta_id, favorecido_id, descricao, valor, sinal, tipo_operacao,
         status_transacao, data_competencia, data_vencimento, cenario, origem_lancamento)
  select T, mold.fazenda_id, mold.conta_bancaria_id, pc_sal, x.f, x.d, x.v, mold.sinal, mold.tipo_operacao, 'previsto', '2026-10-01', '2026-10-05', 'realizado', 'manual'
    from (values (fp, 'Folha de Pagamento', 1100.00), (fapel, 'Folha de Pagamento', 900.00), (fcont, 'Rescisão Zebedeu', 3000.00),
                 (f13a, '13º Salário 1ª Parcela 2026', 700.00), (f13b, '13º Salário 1ª Parcela 2026', 650.00)) x(f, d, v);
  select id into l_p from financeiro_lancamentos_v2 where favorecido_id = fp;
  select id into l_apel from financeiro_lancamentos_v2 where favorecido_id = fapel;
  select id into l_desc from financeiro_lancamentos_v2 where favorecido_id = fcont;
  select id into l13a from financeiro_lancamentos_v2 where favorecido_id = f13a;
  select id into l13b from financeiro_lancamentos_v2 where favorecido_id = f13b;
  perform fn_lancamento_funcionario_ligar(array[l13a], fun_a, 'teste', false);
  perform fn_lancamento_funcionario_ligar(array[l13b], fun_b, 'teste', false);

  -- B2 documentos: espécie nova, vencimento, aponta para o lançamento; vencimento antes da data recusa; lançamento de outro cliente recusa
  d_epi := (fn_folha_documento_registrar(T, null, fun_z, 'epi', 'Ficha EPI.pdf', 'pdf', 'application/pdf', 10, repeat('c', 32), null)->>'id')::uuid;
  perform fn_folha_documento_detalhar(d_epi, jsonb_build_object('data_documento', current_date, 'vencimento', current_date + 10), false);
  if (select vencimento from folha_documentos where id = d_epi) <> current_date + 10 then raise exception 'B2a'; end if;
  ok := false; begin perform fn_folha_documento_detalhar(d_epi, jsonb_build_object('vencimento', current_date - 1), false);
    exception when sqlstate 'P0001' then ok := true; end;
  if not ok then raise exception 'B2b (vencimento antes da data passou)'; end if;
  ok := false; begin perform fn_folha_documento_detalhar(d_epi, jsonb_build_object('lancamento_id', (select id from financeiro_lancamentos_v2 where cliente_id <> T limit 1)), false);
    exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'B2c (lançamento de outro cliente)'; end if;
  d_rec := (fn_folha_documento_registrar(T, null, fun_a, 'recibo_13', 'Recibo 13 Anacleto.pdf', 'pdf', 'application/pdf', 10, repeat('d', 32), null)->>'id')::uuid;
  perform fn_folha_documento_detalhar(d_rec, jsonb_build_object('lancamento_id', l13a), false);
  if (select lancamento_id from folha_documentos where id = d_rec) <> l13a then raise exception 'B2d'; end if;

  -- B3 pendências
  r := fn_folha_pendencias(T);
  -- favorecido-pessoa sem funcionário, sem sugestão
  select i into it from jsonb_array_elements(r->'itens') i where i->>'chave' = 'fav:' || fp;
  if it is null or it->>'tipo' <> 'favorecido_sem_funcionario' or (it->>'n')::int <> 1 or it->'sugestao' <> 'null'::jsonb then raise exception 'B3a %', it; end if;
  -- o apelido sugere o funcionário pelo nome
  select i into it from jsonb_array_elements(r->'itens') i where i->>'chave' = 'fav:' || fapel;
  if it is null or (it->'sugestao'->>'funcionario_id')::uuid is distinct from fun_p then raise exception 'B3b %', it; end if;
  -- o contador NÃO vira favorecido-pessoa; a descrição sugere o Zebedeu
  if exists (select 1 from jsonb_array_elements(r->'itens') i where i->>'chave' = 'fav:' || fcont) then raise exception 'B3c (empresa como pessoa)'; end if;
  select i into it from jsonb_array_elements(r->'itens') i where i->>'chave' = 'desc:' || l_desc;
  if it is null or (it->'sugestao'->>'funcionario_id')::uuid is distinct from fun_z then raise exception 'B3d %', it; end if;
  -- 13º sem recibo: o Bonifácio (a competência tem o recibo do Anacleto); o Anacleto não
  if not exists (select 1 from jsonb_array_elements(r->'itens') i where i->>'chave' = 'recibo:' || l13b) then raise exception 'B3e'; end if;
  if exists (select 1 from jsonb_array_elements(r->'itens') i where i->>'chave' = 'recibo:' || l13a) then raise exception 'B3f'; end if;
  -- documento vencendo em 10 dias
  select i into it from jsonb_array_elements(r->'itens') i where i->>'chave' = 'doc:' || d_epi;
  if it is null or (it->>'dias')::int <> 10 then raise exception 'B3g %', it; end if;

  -- B4 descartar some; desfazer volta; descartar de novo sem motivo recusa
  perform fn_folha_pendencia_descartar(T, 'fav:' || fp, 'é diarista, não funcionário', false);
  if exists (select 1 from jsonb_array_elements(fn_folha_pendencias(T)->'itens') i where i->>'chave' = 'fav:' || fp) then raise exception 'B4a'; end if;
  perform fn_folha_pendencia_descartar(T, 'fav:' || fp, 'voltou', true);
  if not exists (select 1 from jsonb_array_elements(fn_folha_pendencias(T)->'itens') i where i->>'chave' = 'fav:' || fp) then raise exception 'B4b'; end if;
  ok := false; begin perform fn_folha_pendencia_descartar(T, 'fav:' || fp, '  ', false); exception when sqlstate 'P0001' then ok := true; end;
  if not ok then raise exception 'B4c'; end if;
  if (select count(*) from folha_trilha where tabela = 'folha_pendencias_descartes' and cliente_id = T) <> 2 then raise exception 'B4d (trilha)'; end if;

  -- B5 sem a folha: recusa ler e descartar
  perform set_config('request.jwt.claims', json_build_object('sub', L, 'role', 'authenticated')::text, true);
  ok := false; begin perform fn_folha_pendencias(T); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'B5a'; end if;
  ok := false; begin perform fn_folha_pendencia_descartar(T, 'fav:' || fp, 'x', false); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'B5b'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);

  -- B7 as leituras das abas
  r := fn_folha_funcionarios_lista(T);
  select i into it from jsonb_array_elements(r->'funcionarios') i where (i->>'id')::uuid = fun_z;
  if it is null or (it->>'documentos_vencendo')::int <> 1 or (r->'contagem'->>'todos')::int < 4 then raise exception 'B7a %', it; end if;
  r := fn_folha_funcionario_ficha(fun_a);
  if r->'pagamento'->>'favorecido' <> 'Anacleto Teste Bento' or jsonb_array_length(r->'documentos') <> 1 or jsonb_array_length(r->'ultimos_pagamentos') <> 1 then raise exception 'B7b %', r; end if;
  if (select (d->>'dias')::int from jsonb_array_elements(fn_folha_funcionario_ficha(fun_z)->'documentos') d where (d->>'id')::uuid = d_epi) <> 10 then raise exception 'B7c'; end if;
  r := fn_folha_historico(fun_a, null, null);
  if (r->>'n')::int <> 1 or r->'itens'->0->>'tipo' <> '13º' or jsonb_array_length(r->'itens'->0->'documentos') <> 1
     or r->'itens'->0->'documentos'->0->>'origem' <> 'folha' or (r->>'pagos_a_outro')::int <> 0 then raise exception 'B7d %', r; end if;
  if (fn_folha_historico(fun_a, '2027-01-01', null)->>'n')::int <> 0 then raise exception 'B7e (período)'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', L, 'role', 'authenticated')::text, true);
  ok := false; begin perform fn_folha_historico(fun_a, null, null); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'B7f'; end if;
  ok := false; begin perform fn_folha_funcionarios_lista(T); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'B7g'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);

  -- B6 fechadas para anon; o bucket é privado e só tem leitura e envio
  if has_function_privilege('anon', 'public.fn_folha_pendencias(uuid)', 'execute') or has_function_privilege('anon', 'public.fn_folha_pendencia_descartar(uuid,text,text,boolean)', 'execute')
     or has_function_privilege('anon', 'public.fn_folha_documento_detalhar(uuid,jsonb,boolean)', 'execute')
     or has_function_privilege('anon', 'public.fn_folha_historico(uuid,date,date)', 'execute') or has_function_privilege('anon', 'public.fn_folha_funcionarios_lista(uuid)', 'execute')
     or has_function_privilege('anon', 'public.fn_folha_funcionario_ficha(uuid)', 'execute') then raise exception 'B6a'; end if;
  if (select public from storage.buckets where id = 'folha-documentos') is distinct from false
     or (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'folha_doc_%') <> 2 then raise exception 'B6b'; end if;
  raise exception 'OK FOLHA-01 PR B: B1–B7 (nada gravado)';
end $t$;
