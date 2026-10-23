-- NOTA-CONTAS-NA-CRIACAO-01 · C — `fn_nota_ja_lancada` acha a PARCELA pelo numero escrito de outro jeito (migration 20261028112200).
-- Fixture SINTETICA no molde do caso de 23/10 (Agnaldo, NF 000.778.618, 4 x 821,22): no cliente Teste, um cadastro com CNPJ sintetico e
-- quatro lancamentos dele de 821,22 com o numero escrito de quatro jeitos — "NF_000.778.618", "778618-2/4", "000.778.618 parc 3" e
-- "7786180" (OUTRO numero: o engodo) —, e um de OUTRO fornecedor com "NF_000.778.618" (fora: o fornecedor nao parece o emitente).
-- A nota: 1 parcela de 3.284,88 (o valor de nenhum deles). Roda como `authenticated` (admin) e TERMINA EM RAISE: nada fica.
-- T1 os tres pelo numero (e so' pelo numero); nem o engodo "7786180" nem o outro fornecedor · T2 a nota com o numero "778618" acha os mesmos.
-- Mutacao: voltar o `cand_numero` ao de antes (so' todos os digitos) derruba T1 ("778618-2/4" e "parc 3" escapam).
begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';
do $fx$
declare c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; fo uuid; ou uuid; ids uuid[];
begin
  insert into public.financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (c_cli, 'Alvorada Sintetica Agropecuaria Ltda', '55.666.777/0003-63', true) returning id into fo;
  insert into public.financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (c_cli, 'Outro Sintetico Comercio Ltda', '99.888.777/0001-10', true) returning id into ou;
  select array_agg(id order by id) into ids from (select id from public.financeiro_lancamentos_v2
     where cliente_id = c_cli and not cancelado and origem_lancamento <> 'importacao_historica' order by id limit 5) s;
  if cardinality(ids) < 5 then raise exception 'fixture: o Teste precisa de 5 lancamentos'; end if;
  update public.financeiro_lancamentos_v2 set favorecido_id = fo, valor = 821.22, data_vencimento = '2031-09-10', numero_documento = 'NF_000.778.618' where id = ids[1];
  update public.financeiro_lancamentos_v2 set favorecido_id = fo, valor = 821.22, data_vencimento = '2031-10-10', numero_documento = '778618-2/4' where id = ids[2];
  update public.financeiro_lancamentos_v2 set favorecido_id = fo, valor = 821.22, data_vencimento = '2031-11-10', numero_documento = '000.778.618 parc 3' where id = ids[3];
  update public.financeiro_lancamentos_v2 set favorecido_id = fo, valor = 821.22, data_vencimento = '2031-12-10', numero_documento = '7786180' where id = ids[4];
  update public.financeiro_lancamentos_v2 set favorecido_id = ou, valor = 821.22, data_vencimento = '2031-09-10', numero_documento = 'NF_000.778.618' where id = ids[5];
  perform set_config('teste.ids', array_to_string(ids, ','), true);
end $fx$;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  ids uuid[] := string_to_array(current_setting('teste.ids'), ',')::uuid[];
  parc constant jsonb := '[{"n":1,"vencimento":"2031-08-10","valor_cent":328488}]';
  r jsonb; achados text;
begin
  -- T1
  r := public.fn_nota_ja_lancada(c_cli, parc, '000.778.618', null, '55666777000363', array['Alvorada Sintetica Agropecuaria Ltda']);
  select string_agg(format('%s:%s', array_position(ids, (x->>'id')::uuid), x->>'por'), ',' order by array_position(ids, (x->>'id')::uuid)) into achados
    from jsonb_array_elements(r) x where array_position(ids, (x->>'id')::uuid) is not null;
  if achados is distinct from '1:["numero"],2:["numero"],3:["numero"]' then raise exception 'T1: %', achados; end if;

  -- T2
  r := public.fn_nota_ja_lancada(c_cli, parc, '778618', null, '55666777000363', null);
  select string_agg(array_position(ids, (x->>'id')::uuid)::text, ',' order by array_position(ids, (x->>'id')::uuid)) into achados
    from jsonb_array_elements(r) x where array_position(ids, (x->>'id')::uuid) is not null;
  if achados is distinct from '1,2,3' then raise exception 'T2: %', achados; end if;

  raise exception 'OK nota_ja_lancada_parcela (T1–T2)';
end $teste$;
rollback;
