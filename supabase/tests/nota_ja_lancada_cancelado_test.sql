-- NOTA-CONTAS-NA-CRIACAO-01 · D — `fn_nota_ja_lancada` devolve o CANCELADO marcado (migration 20261028112210). Fixture SINTETICA no molde
-- do caso de 23/10 (Agnaldo, NF 000.778.618): no cliente Teste, um cadastro com CNPJ sintetico e tres lancamentos dele — um VIVO com o
-- numero "778618", um CANCELADO com "NF_000.778.618" e um CANCELADO sem numero com o valor e a data da nota. Roda como `authenticated`
-- (admin) e TERMINA EM RAISE: nada fica.
-- T1 o vivo vem com cancelado=false; o cancelado pelo numero vem com cancelado=true · T2 o cancelado so' pelo valor nao vem (ruido).
-- Mutacao: tirar o `todos` (numero so' nos vivos) derruba T1; tirar a coluna `cancelado` derruba T1.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';
do $fx$
declare c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; fo uuid; ids uuid[];
begin
  insert into public.financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (c_cli, 'Alvorada Sintetica Agropecuaria Ltda', '55.666.777/0003-63', true) returning id into fo;
  select array_agg(id order by id) into ids from (select id from public.financeiro_lancamentos_v2
     where cliente_id = c_cli and not cancelado and origem_lancamento <> 'importacao_historica' order by id limit 3) s;
  if cardinality(ids) < 3 then raise exception 'fixture: o Teste precisa de 3 lancamentos'; end if;
  update public.financeiro_lancamentos_v2 set favorecido_id = fo, valor = 821.22, data_vencimento = '2031-09-10', numero_documento = '778618' where id = ids[1];
  update public.financeiro_lancamentos_v2 set favorecido_id = fo, valor = 821.22, data_vencimento = '2031-09-10', numero_documento = 'NF_000.778.618', cancelado = true where id = ids[2];
  update public.financeiro_lancamentos_v2 set favorecido_id = fo, valor = 3284.88, data_vencimento = '2031-08-10', numero_documento = null, cancelado = true where id = ids[3];
  perform set_config('teste.ids', array_to_string(ids, ','), true);
end $fx$;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  ids uuid[] := string_to_array(current_setting('teste.ids'), ',')::uuid[];
  r jsonb; achados text;
begin
  r := public.fn_nota_ja_lancada(c_cli, '[{"n":1,"vencimento":"2031-08-10","valor_cent":328488}]', '000.778.618', null, '55666777000363', null);
  select string_agg(format('%s:%s', array_position(ids, (x->>'id')::uuid), coalesce(x->>'cancelado', '?')), ',' order by array_position(ids, (x->>'id')::uuid)) into achados
    from jsonb_array_elements(r) x where array_position(ids, (x->>'id')::uuid) is not null;
  -- T1 e T2
  if achados is distinct from '1:false,2:true' then raise exception 'T1/T2: %', achados; end if;
  raise exception 'OK nota_ja_lancada_cancelado (T1–T2)';
end $teste$;
rollback;
