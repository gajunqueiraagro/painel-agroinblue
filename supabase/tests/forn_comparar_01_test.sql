-- NOTA-FORNECEDOR-COMPARAR-01 — `fn_fornecedor_atualizar_campos` e `_desfazer` (migrations 20261028111450 e 111451). Fixture SINTETICA no cliente
-- Teste (um cadastro com nome digitado a' mao, sem CNPJ, e outro ATIVO com um CNPJ); roda como `authenticated` (admin) e TERMINA EM RAISE.
-- T1 simular devolve antes/depois e nao grava · T2 aplicar grava SO' o que difere e a trilha por campo · T3 campo fora da lista recusa
-- T4 desfazer volta so' o campo que ninguem mexeu depois · T5 o CNPJ de outro ativo nao grava (trava de sempre) · T6 guarda (42501).
-- Mutacao: tirar a conferencia "segue com o valor gravado" do desfazer derruba T4; tirar a lista de colunas derruba T3.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';
do $fx$
declare c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; a uuid; b uuid;
begin
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo, municipio, uf) values (c_cli, 'Pec.3M-Esc. Garcas Sintetico', true, 'Campo Grande', 'MS') returning id into a;
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo, cpf_cnpj) values (c_cli, 'Outro Ativo Sintetico Ltda', true, '11.444.777/0001-61') returning id into b;
  perform set_config('teste.a', a::text, true); perform set_config('teste.b', b::text, true);
end $fx$;
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $teste$
declare a uuid := current_setting('teste.a')::uuid; r jsonb; t text; alt uuid;
begin
  -- T1
  r := public.fn_fornecedor_atualizar_campos(a, '{"cpf_cnpj":"11.222.333/0001-81","inscricao_estadual":"283456789","municipio":"Campo Grande"}', 'nota', 'NF 1', true);
  if (r->>'alteracao_id') is not null or (select count(*) from jsonb_object_keys(r->'campos')) <> 2 or r->'campos'->'cpf_cnpj'->>'antes' is not null then
    raise exception 'T1: %', r;
  end if;
  if exists (select 1 from public.financeiro_fornecedores where id = a and cpf_cnpj is not null) then raise exception 'T1 gravou'; end if;
  -- T2
  r := public.fn_fornecedor_atualizar_campos(a, '{"cpf_cnpj":"11.222.333/0001-81","inscricao_estadual":"283456789","municipio":"Campo Grande"}', 'nota', 'NF 1', false);
  alt := (r->>'alteracao_id')::uuid;
  if alt is null or (select cpf_cnpj from public.financeiro_fornecedores where id = a) <> '11.222.333/0001-81'
     or (select nome from public.financeiro_fornecedores where id = a) not ilike 'pec.3m-esc%' then raise exception 'T2: %', r; end if;
  if (select count(*) from public.fornecedor_campos_alteracoes x, jsonb_object_keys(x.campos) k where x.id = alt) <> 2 then raise exception 'T2 trilha'; end if;
  -- T3
  begin r := public.fn_fornecedor_atualizar_campos(a, '{"banco":"001"}', 'nota', null, false); t := 'PASSOU';
  exception when others then t := sqlstate || ' ' || sqlerrm; end;
  if t not like '22023 Campo que não se atualiza por aqui: banco.%' then raise exception 'T3: %', t; end if;
  -- T4: outra mao muda a IE depois; o desfazer volta o CNPJ e deixa a IE
  reset role;
  update public.financeiro_fornecedores set inscricao_estadual = '999' where id = a;
  set local role authenticated;
  r := public.fn_fornecedor_atualizar_campos_desfazer(alt, 'teste', false);
  if r->'voltaram' <> '["cpf_cnpj"]' or r->'ficaram' <> '["inscricao_estadual"]'
     or (select cpf_cnpj from public.financeiro_fornecedores where id = a) is not null
     or (select inscricao_estadual from public.financeiro_fornecedores where id = a) <> '999' then raise exception 'T4: %', r; end if;
  -- T5: o CNPJ de outro cadastro ATIVO nao grava
  set constraints all immediate;   -- a trava e' adiada (dispara no commit da chamada no app); aqui, na hora
  begin r := public.fn_fornecedor_atualizar_campos(a, '{"cpf_cnpj":"11.444.777/0001-61"}', 'receita', null, false); t := 'PASSOU';
  exception when others then t := sqlstate; end;
  if t = 'PASSOU' or (select cpf_cnpj from public.financeiro_fornecedores where id = a) is not null then raise exception 'T5: %', t; end if;
  -- T6
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  begin r := public.fn_fornecedor_atualizar_campos(a, '{"inscricao_estadual":"1"}', 'nota', null, true); t := 'PASSOU';
  exception when others then t := sqlstate; end;
  if t <> '42501' then raise exception 'T6: %', t; end if;
  raise exception 'OK forn_comparar_01 (T1–T6)';
end $teste$;
rollback;
