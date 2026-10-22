-- NOTA-JA-LANCADA-01 — `fn_nota_ja_lancada` (migration 20261028110950). Fixture SINTETICA no molde do caso de 22/10 (NJ, NF 111): no
-- cliente Teste, um cadastro SEM CNPJ "Lineagro Sintetica Produtos Agropecuarios SA" e quatro lancamentos dele de 341,34 (3 realizados,
-- 1 programado; o 3o com 341,35 — centavo de tolerancia; o 2o com o vencimento 2 dias depois); e um ENGODO: outro fornecedor, mesmo
-- valor e data. A nota: "Nova Lineagro Sintetica Produtos Agropecuarios Ltda", CNPJ sintetico, 4 x 341,34. Roda como `authenticated`
-- (admin) e TERMINA EM RAISE: nada fica.
-- T1 acha as 4 (pelo nome parecido, sem CNPJ), cada uma na sua parcela, e NAO acha o engodo · T2 o mesmo com o cadastro pela RAIZ do
-- CNPJ (filial) · T3 pelo NUMERO do documento · T4 o cancelado fica fora · T5 guarda (42501) · T6 SECDEF, anon nao executa.
-- Mutacao: tirar o ramo do nome derruba T1; tirar a tolerancia de centavos derruba T1 (a 3a); tirar o filtro do fornecedor derruba T1
-- (o engodo entra).
begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';
do $fx$
declare c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; lin uuid; eng uuid; ids uuid[];
begin
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo) values (c_cli, 'Lineagro Sintetica Produtos Agropecuarios SA', true) returning id into lin;
  insert into public.financeiro_fornecedores (cliente_id, nome, ativo) values (c_cli, 'Engodo Sintetico Comercio Ltda', true) returning id into eng;
  select array_agg(id order by id) into ids from (select id from public.financeiro_lancamentos_v2
     where cliente_id = c_cli and not cancelado and origem_lancamento <> 'importacao_historica' order by id limit 6) s;
  if cardinality(ids) < 6 then raise exception 'fixture: o Teste precisa de 6 lancamentos'; end if;
  update public.financeiro_lancamentos_v2 set favorecido_id = lin, valor = 341.34, data_vencimento = '2031-08-07', data_pagamento = '2031-08-07', status_transacao = 'realizado' where id = ids[1];
  update public.financeiro_lancamentos_v2 set favorecido_id = lin, valor = 341.34, data_vencimento = '2031-09-08', data_pagamento = '2031-09-08', status_transacao = 'realizado' where id = ids[2];
  update public.financeiro_lancamentos_v2 set favorecido_id = lin, valor = 341.35, data_vencimento = '2031-10-06', data_pagamento = '2031-10-06', status_transacao = 'realizado' where id = ids[3];
  update public.financeiro_lancamentos_v2 set favorecido_id = lin, valor = 341.34, data_vencimento = '2031-11-05', data_pagamento = null, status_transacao = 'programado', numero_documento = '000.000.111' where id = ids[4];
  update public.financeiro_lancamentos_v2 set favorecido_id = eng, valor = 341.34, data_vencimento = '2031-08-07', data_pagamento = null, status_transacao = 'programado' where id = ids[5];
  update public.financeiro_lancamentos_v2 set favorecido_id = lin, valor = 341.34, data_vencimento = '2031-08-07', data_pagamento = null, status_transacao = 'programado', cancelado = true where id = ids[6];
  perform set_config('teste.ids', array_to_string(ids, ','), true); perform set_config('teste.lin', lin::text, true);
end $fx$;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  ids uuid[] := string_to_array(current_setting('teste.ids'), ',')::uuid[];
  parc constant jsonb := '[{"n":1,"vencimento":"2031-08-07","valor_cent":34134},{"n":2,"vencimento":"2031-09-06","valor_cent":34134},
                           {"n":3,"vencimento":"2031-10-06","valor_cent":34134},{"n":4,"vencimento":"2031-11-05","valor_cent":34134}]';
  r jsonb; t text; achados text;
begin
  -- T1
  r := public.fn_nota_ja_lancada(c_cli, parc, '000.000.222', null, '11222333000424', array['Nova Lineagro Sintetica Produtos Agropecuarios Ltda']);
  select string_agg(format('%s:%s', array_position(ids, (x->>'id')::uuid), x->'parcelas'->0->>'n'), ',' order by array_position(ids, (x->>'id')::uuid)) into achados
    from jsonb_array_elements(r) x;
  if achados is distinct from '1:1,2:2,3:3,4:4' then raise exception 'T1: % — %', achados, r; end if;
  if exists (select 1 from jsonb_array_elements(r) x where x->>'fornecedor_por' <> 'nome' or x->>'status' is null) then raise exception 'T1 por: %', r; end if;

  -- T2: o cadastro com a mesma RAIZ de CNPJ (outra filial)
  reset role;
  update public.financeiro_fornecedores set cpf_cnpj = '11.222.333/0001-81', nome = 'Outro Nome Sintetico Ltda' where id = current_setting('teste.lin')::uuid;
  set local role authenticated;
  r := public.fn_nota_ja_lancada(c_cli, parc, null, null, '11222333000424', array['Nova Lineagro Sintetica Produtos Agropecuarios Ltda']);
  if jsonb_array_length(r) <> 4 or exists (select 1 from jsonb_array_elements(r) x where x->>'fornecedor_por' <> 'cnpj') then raise exception 'T2: %', r; end if;

  -- T3: pelo numero (o 4o tem 000.000.111), mesmo com valor diferente na nota
  r := public.fn_nota_ja_lancada(c_cli, '[{"n":1,"vencimento":"2020-01-01","valor_cent":1}]', '111', null, '11222333000424', array['x']);
  if jsonb_array_length(r) <> 1 or (r->0->>'id')::uuid <> ids[4] or r->0->'por' <> '["numero"]' then raise exception 'T3: %', r; end if;

  -- T4: o cancelado (ids[6], mesmo fornecedor, valor e data da parcela 1) nunca aparece
  if exists (select 1 from jsonb_array_elements(public.fn_nota_ja_lancada(c_cli, parc, null, null, '11222333000424', null)) x where (x->>'id')::uuid = ids[6]) then
    raise exception 'T4 cancelado entrou';
  end if;

  -- T5
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  begin
    r := public.fn_nota_ja_lancada(c_cli, parc, null, null, null, null); t := 'PASSOU';
  exception when others then t := sqlstate; end;
  if t <> '42501' then raise exception 'T5: %', t; end if;

  -- T6
  if not (select prosecdef from pg_proc where proname = 'fn_nota_ja_lancada') then raise exception 'T6 INVOKER'; end if;
  if has_function_privilege('anon', 'public.fn_nota_ja_lancada(uuid,jsonb,text,text,text,text[])', 'EXECUTE') then raise exception 'T6 anon'; end if;

  raise exception 'OK nota_ja_lancada_01 (T1–T6)';
end $teste$;
rollback;
