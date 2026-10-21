-- FORN-FILIAL-01 nos existentes — `fn_fornecedor_filial_aplicar` / `fn_fornecedor_filial_desfazer` (migration 20261028110500). Roda como
-- postgres com as claims de um admin, no cliente Teste, e TERMINA EM RAISE: nada fica no banco.
-- F1 cidade vazia: grava municipio e UF (UF em maiuscula) · F2 cidade ja' preenchida: NAO sobrescreve, volta em `recusados`
-- F3 nome: o de hoje e' a caixa padronizada do `nome_antes` -> grava a caixa do `nome_depois` e o nome de hoje vira apelido
-- F4 nome mudou desde a proposta: nao grava, volta em `recusados` · F5 id de outro cliente: recusado · F6 simular nao grava
-- F7 desfazer volta o que esta' como a aplicacao deixou e conta o que mudou depois.
-- Mutacao: tirar "municipio E uf vazios hoje" do `cidade_ok` derruba F2; tirar a comparacao com `nome_antes` derruba F4.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_outro uuid;
  a uuid; b uuid; c uuid; d uuid; e uuid; r jsonb; u jsonb; v record;
begin
  select id into c_outro from clientes where id <> c_cli limit 1;
  insert into financeiro_fornecedores (cliente_id, nome) values (c_cli, 'SINTQ FILIAL ALFA') returning id into a;
  insert into financeiro_fornecedores (cliente_id, nome, municipio, uf) values (c_cli, 'Sintq Filial Beta', 'Dourados', 'MS') returning id into b;
  insert into financeiro_fornecedores (cliente_id, nome) values (c_cli, 'POSTO SINTQ FILIAL - CAMPO GRANDE') returning id into c;
  insert into financeiro_fornecedores (cliente_id, nome) values (c_cli, 'Sintq Filial Delta Editado') returning id into d;
  select id into e from financeiro_fornecedores where cliente_id = c_outro limit 1;

  -- F6
  r := public.fn_fornecedor_filial_aplicar(c_cli, jsonb_build_array(jsonb_build_object('id', a, 'municipio', 'Campo Grande', 'uf', 'ms')), true);
  if (r->>'operacao_id') is not null or (select municipio from financeiro_fornecedores where id = a) is not null then raise exception 'F6 simular gravou: %', r; end if;

  r := public.fn_fornecedor_filial_aplicar(c_cli, jsonb_build_array(
         jsonb_build_object('id', a, 'municipio', 'Campo Grande', 'uf', 'ms'),
         jsonb_build_object('id', b, 'municipio', 'Campo Grande', 'uf', 'MS'),
         jsonb_build_object('id', c, 'nome_antes', 'POSTO SINTQ FILIAL - CAMPO GRANDE', 'nome_depois', 'POSTO SINTQ FILIAL'),
         jsonb_build_object('id', d, 'nome_antes', 'Sintq Filial Delta', 'nome_depois', 'Sintq Delta'),
         jsonb_build_object('id', e, 'municipio', 'X', 'uf', 'SP')), false);

  -- F1
  select municipio, uf into v from financeiro_fornecedores where id = a;
  if v.municipio is distinct from 'Campo Grande' or v.uf is distinct from 'MS' then raise exception 'F1 cidade: % %', v.municipio, v.uf; end if;
  -- F2
  if (select municipio from financeiro_fornecedores where id = b) <> 'Dourados'
     or not (r->'recusados' @> jsonb_build_array(jsonb_build_object('id', b::text, 'motivo', 'cidade ja preenchida'))) then raise exception 'F2: %', r; end if;
  -- F3
  select nome, aliases into v from financeiro_fornecedores where id = c;
  if v.nome is distinct from 'Posto Sintq Filial' or not (v.aliases @> '["Posto Sintq Filial - Campo Grande"]'::jsonb) then raise exception 'F3: % %', v.nome, v.aliases; end if;
  -- F4
  if (select nome from financeiro_fornecedores where id = d) <> 'Sintq Filial Delta Editado'
     or not (r->'recusados' @> jsonb_build_array(jsonb_build_object('id', d::text, 'motivo', 'o nome mudou desde a proposta'))) then raise exception 'F4: %', r; end if;
  -- F5
  if e is not null and not (r->'recusados' @> jsonb_build_array(jsonb_build_object('id', e::text, 'motivo', 'nao e cadastro deste cliente'))) then raise exception 'F5: %', r; end if;
  if (r->>'cidades')::int <> 1 or (r->>'nomes')::int <> 1 or (r->>'fornecedores')::int <> 2 then raise exception 'contagem: %', r; end if;

  -- F7: o A muda depois (fica); o C volta inteiro
  update financeiro_fornecedores set municipio = 'Terenos' where id = a;
  u := public.fn_fornecedor_filial_desfazer((r->>'operacao_id')::uuid, 'teste', false);
  if (u->>'voltaram')::int <> 1 or (u->>'ficaram')::int <> 1 then raise exception 'F7 contagem: %', u; end if;
  select nome, aliases, municipio into v from financeiro_fornecedores where id = c;
  if v.nome is distinct from 'Posto Sintq Filial - Campo Grande' or v.aliases @> '["Posto Sintq Filial - Campo Grande"]'::jsonb then raise exception 'F7 nao voltou: % %', v.nome, v.aliases; end if;
  if (select municipio from financeiro_fornecedores where id = a) <> 'Terenos' then raise exception 'F7 desfez o que mudou depois'; end if;

  raise exception 'OK forn_filial_aplicar (F1–F7)';
end $teste$;
rollback;
