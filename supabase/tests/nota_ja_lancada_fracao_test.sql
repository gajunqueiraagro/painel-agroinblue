-- P95 (DANFE-CHAVE-EM-GRUPOS-01) — `fn_nota_ja_lancada` acha as IRMAS da fracao (migration 20261028112340). Fixture SINTETICA no molde do
-- caso de 23/10 (a nota no cartao em N parcelas lancadas soltas, a mao, o numero da nota so' numa delas): no cliente Teste, um cadastro com
-- CNPJ sintetico e cinco lancamentos — "Tinta sintetica - 1/3" (100,02), "- 2/3" (99,97, COM o numero 7001), "- 3/3" (100,00); e o ruido:
-- "- 1/3" do MESMO fornecedor com outro valor (55,00) e "- 1/3" de OUTRO fornecedor com o valor certo. Nota: 300,00, sem duplicatas.
-- Roda como `authenticated` (admin) e TERMINA EM RAISE: nada fica.
-- F1 as tres irmas voltam, com `fracao` e `fracao_n` = 3; a do numero tambem com `numero` · F2 o ruido nao volta (valor; fornecedor)
-- F3 sem o numero (nenhuma ancora), nada pela fracao · F4 fora da janela (data 2 anos depois) nao volta
-- Mutacao: tirar o `por_fracao` do `achados` derruba F1; tirar o teste do valor derruba F2.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';
do $fx$
declare c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; fo uuid; outro uuid; ids uuid[]; faz uuid; pl uuid;
begin
  insert into public.financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (c_cli, 'Tintas Sinteticas de Teste Ltda', '55.666.777/0003-63', true) returning id into fo;
  insert into public.financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (c_cli, 'Outra Loja Sintetica Ltda', '11.222.333/0004-24', true) returning id into outro;
  /* P128a (Gabriel 28/10, decisao b): seis lancamentos NOVOS, fora de financiamento — os reaproveitados do Teste eram de um financiamento e
     o irmao do parcelamento (113000/113010) puxava o "Outra compra"; os UPDATEs abaixo dao a cada um o papel de antes. */
  select id into faz from public.fazendas where cliente_id = c_cli order by id limit 1;
  select id into pl from public.financeiro_plano_contas where ativo and tipo_operacao = '2-Saídas' and escopo_negocio = 'pecuaria'
    and (cliente_id is null or cliente_id = c_cli) order by id limit 1;
  with x as (
    insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento,
        status_transacao, cenario, cancelado, plano_conta_id)
    select c_cli, faz, '-1', '2-Saídas', 1, 'Fixture sintetico ' || k, '2031-05-01', '2031-05-01', 'programado', 'realizado', false, pl
      from generate_series(1, 6) k
    returning id, descricao)
  select array_agg(id order by descricao) into ids from x;
  if cardinality(ids) < 6 then raise exception 'fixture: o Teste precisa de 6 lancamentos'; end if;
  update public.financeiro_lancamentos_v2 set favorecido_id = fo, valor = 100.02, data_vencimento = '2031-05-10', numero_documento = null, descricao = 'Tinta sintetica - 1/3' where id = ids[1];
  update public.financeiro_lancamentos_v2 set favorecido_id = fo, valor = 99.97, data_vencimento = '2031-06-10', numero_documento = 'NF_000.007.001', descricao = 'Tinta sintetica - 2/3' where id = ids[2];
  update public.financeiro_lancamentos_v2 set favorecido_id = fo, valor = 100.00, data_vencimento = '2031-07-10', numero_documento = null, descricao = 'Tinta sintetica - 3/3' where id = ids[3];
  update public.financeiro_lancamentos_v2 set favorecido_id = fo, valor = 55.00, data_vencimento = '2031-05-10', numero_documento = null, descricao = 'Outra compra - 1/3' where id = ids[4];
  update public.financeiro_lancamentos_v2 set favorecido_id = outro, valor = 100.00, data_vencimento = '2031-05-10', numero_documento = null, descricao = 'Tinta sintetica - 1/3' where id = ids[5];
  update public.financeiro_lancamentos_v2 set favorecido_id = fo, valor = 100.00, data_vencimento = '2033-05-10', numero_documento = null, descricao = 'Tinta sintetica - 1/3' where id = ids[6];
  perform set_config('teste.ids', array_to_string(ids, ','), true);
end $fx$;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  ids uuid[] := string_to_array(current_setting('teste.ids'), ',')::uuid[];
  nota constant jsonb := '[{"n":1,"vencimento":"2031-04-06","valor_cent":30000}]';
  r jsonb; achados text;
begin
  r := public.fn_nota_ja_lancada(c_cli, nota, '7001', null, '55666777000363', array['Tintas Sinteticas de Teste Ltda']);
  select string_agg(format('%s:%s:%s', array_position(ids, (x->>'id')::uuid), x->'por', coalesce(x->>'fracao_n', '-')), ' ' order by array_position(ids, (x->>'id')::uuid)) into achados
    from jsonb_array_elements(r) x where array_position(ids, (x->>'id')::uuid) is not null;
  -- F1, F2 e F4
  if achados is distinct from '1:["fracao"]:3 2:["numero", "fracao"]:3 3:["fracao"]:3' then raise exception 'F1/F2/F4: %', achados; end if;
  -- F3: sem numero nenhuma ancora — nada pela fracao (o valor de 300,00 nao bate com ninguem)
  r := public.fn_nota_ja_lancada(c_cli, nota, '9999', null, '55666777000363', array['Tintas Sinteticas de Teste Ltda']);
  if exists (select 1 from jsonb_array_elements(r) x where array_position(ids, (x->>'id')::uuid) is not null) then raise exception 'F3: %', r; end if;
  raise exception 'OK nota_ja_lancada_fracao (F1–F4)';
end $teste$;
rollback;
