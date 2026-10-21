-- FORN-NOME-CAIXA-01 — o nome do fornecedor gravado em maiuscula/minuscula padronizado, por uma funcao no banco.
-- Roda como `postgres`, DEPOIS da migration 20261027204710, e TERMINA EM RAISE: nada fica no banco. Sucesso = "OK ...".
-- Os casos da regra sao os de `src/lib/fornecedores/nomeCaixa.casos.json` (um vitest confere que os dois batem).
-- N1 a regra, caso a caso.  N2 INSERT em caixa alta grava padronizado, o original vira apelido e a busca unica acha pelo texto antigo.
-- N3 UPDATE de outro campo nao reescreve o nome antigo; UPDATE do nome converte.  N4 caixa mista e Pec.3M- intactos.
-- N5 aplicar: simulacao nao grava; gravacao padroniza os existentes com trilha; desfazer volta exatamente o que estava.
-- N6 as funcoes da aplicacao nao sao executaveis pela tela.  N7 sem usuario, a aplicacao recusa (42501).
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
do $t$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  r record; f1 uuid; f2 uuid; f3 uuid; v jsonb; v_antes text; v_sem_carimbo text; v_op uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_adm, 'role', 'authenticated')::text, true);

  -- N1
  for r in select * from (values
    ('COMERCIAL JERE DE ALIMENTOS LTDA', 'Comercial Jere de Alimentos Ltda'),
    ('AGROinBLUE', 'AGROinBLUE'),
    ('Pec.3M-COMERCIAL JERE', 'Pec.3M-Comercial Jere'),
    ('MMM COMERCIO DE GAS - EIRELI', 'MMM Comercio de Gas - Eireli'),
    ('AUTO POSTO SP 400 LTDA', 'Auto Posto SP 400 Ltda'),
    ('jose da silva', 'Jose da Silva'),
    ('BANCO DO BRASIL S.A.', 'Banco do Brasil S.A.'),
    ('JOÃO DA SILVA ME', 'João da Silva ME'),
    ('IAGRO', 'Iagro'),
    ('CIA DE SEGUROS', 'Cia de Seguros'),
    ('DO CARMO TRANSPORTES', 'Do Carmo Transportes'),
    ('BRDE', 'BRDE'),
    ('FAZENDA BG EPP', 'Fazenda BG EPP'),
    ('JOSE II MARTINS', 'Jose II Martins'),
    ('P5A PECAS', 'P5A Pecas'),
    ('iFood', 'iFood'),
    ('', '')) c(e, s) loop
    if public._fn_nome_caixa(r.e) is distinct from r.s then
      raise exception 'N1 "%": esperado "%", veio "%"', r.e, r.s, public._fn_nome_caixa(r.e); end if;
  end loop;

  -- N2 (como a tela grava: papel authenticated, sob a RLS)
  execute 'set local role authenticated';
  insert into financeiro_fornecedores (cliente_id, nome, nome_fantasia, contato_nome)
    values (c_cli, 'SINT NC COMERCIAL JERE DE ALIMENTOS LTDA', 'SINT NC JERE', 'MARIA DA SILVA') returning id into f1;
  execute 'reset role';
  select * into r from financeiro_fornecedores where id = f1;
  if r.nome is distinct from 'Sint NC Comercial Jere de Alimentos Ltda' then raise exception 'N2 nome: %', r.nome; end if;
  if r.nome_fantasia is distinct from 'Sint NC Jere' then raise exception 'N2 fantasia: %', r.nome_fantasia; end if;
  if r.contato_nome is distinct from 'Maria da Silva' then raise exception 'N2 contato: %', r.contato_nome; end if;
  if not (r.aliases @> '["SINT NC COMERCIAL JERE DE ALIMENTOS LTDA", "SINT NC JERE"]'::jsonb) then raise exception 'N2 apelidos: %', r.aliases; end if;
  if r.aliases @> '["MARIA DA SILVA"]'::jsonb then raise exception 'N2 contato virou apelido'; end if;
  v := public.fn_fornecedor_buscar(c_cli, 'SINT NC COMERCIAL JERE', 'ativos', 50, 0);
  if not exists (select 1 from jsonb_array_elements(v->'itens') i where i->>'id' = f1::text) then raise exception 'N2 busca pelo texto antigo'; end if;

  -- N3
  perform set_config('app.nome_caixa_escritor', 'on', true);
  insert into financeiro_fornecedores (cliente_id, nome) values (c_cli, 'SINT NC LEGADO EM CAIXA ALTA') returning id into f2;
  perform set_config('app.nome_caixa_escritor', 'off', true);
  update financeiro_fornecedores set observacao = 'mexi em outro campo' where id = f2;
  if (select nome from financeiro_fornecedores where id = f2) is distinct from 'SINT NC LEGADO EM CAIXA ALTA' then raise exception 'N3 reescreveu o antigo'; end if;
  update financeiro_fornecedores set nome_fantasia = 'SINT NC FANTASIA NOVA' where id = f2;
  select * into r from financeiro_fornecedores where id = f2;
  if r.nome is distinct from 'SINT NC LEGADO EM CAIXA ALTA' or r.nome_fantasia is distinct from 'Sint NC Fantasia Nova' then
    raise exception 'N3 fantasia: % / %', r.nome, r.nome_fantasia; end if;
  if not (r.aliases_norm @> array[public._fn_normalizar_texto('SINT NC FANTASIA NOVA')]) then raise exception 'N3 aliases_norm'; end if;
  update financeiro_fornecedores set nome = 'SINT NC LEGADO RENOMEADO' where id = f2;
  if (select nome from financeiro_fornecedores where id = f2) is distinct from 'Sint NC Legado Renomeado' then raise exception 'N3 update do nome'; end if;

  -- N4
  insert into financeiro_fornecedores (cliente_id, nome) values (c_cli, 'Pec.3M-SINT NC RATEIO') returning id into f3;
  if (select nome from financeiro_fornecedores where id = f3) is distinct from 'Pec.3M-Sint NC Rateio' then raise exception 'N4 pec'; end if;
  update financeiro_fornecedores set nome = 'SINT nc Mista' where id = f3;
  if (select nome from financeiro_fornecedores where id = f3) is distinct from 'SINT nc Mista' then raise exception 'N4 mista'; end if;

  -- N5
  perform set_config('app.nome_caixa_escritor', 'on', true);
  update financeiro_fornecedores set nome = 'SINT NC LEGADO EM CAIXA ALTA', aliases = '[]' where id = f2;
  perform set_config('app.nome_caixa_escritor', 'off', true);
  select md5(string_agg(to_jsonb(f)::text, '|' order by id)) into v_antes from financeiro_fornecedores f where cliente_id = c_cli;
  select md5(string_agg((to_jsonb(f) - 'updated_at')::text, '|' order by id)) into v_sem_carimbo from financeiro_fornecedores f where cliente_id = c_cli;
  v := public.fn_fornecedor_nome_caixa_aplicar(c_cli);
  if (v->>'fornecedores')::int < 1 or v->>'operacao_id' is not null then raise exception 'N5 simulacao: %', v; end if;
  if (select md5(string_agg(to_jsonb(f)::text, '|' order by id)) from financeiro_fornecedores f where cliente_id = c_cli) is distinct from v_antes then
    raise exception 'N5 simulacao gravou'; end if;
  v := public.fn_fornecedor_nome_caixa_aplicar(c_cli, false);
  v_op := (v->>'operacao_id')::uuid;
  if v_op is null then raise exception 'N5 sem operacao: %', v; end if;
  select * into r from financeiro_fornecedores where id = f2;
  if r.nome is distinct from 'Sint NC Legado em Caixa Alta' or not (r.aliases @> '["SINT NC LEGADO EM CAIXA ALTA"]'::jsonb) then
    raise exception 'N5 aplicou: % %', r.nome, r.aliases; end if;
  if not exists (select 1 from audit_log a where a.registro_id = f2 and a.resumo like '%FORN-NOME-CAIXA-01%') then raise exception 'N5 trilha'; end if;
  v := public.fn_fornecedor_nome_caixa_desfazer(v_op, 'teste N5', false);
  if (v->>'voltaram')::int is distinct from jsonb_array_length((select itens from fornecedor_nome_caixa_operacoes where id = v_op)) then
    raise exception 'N5 desfazer: %', v; end if;
  if (select md5(string_agg((to_jsonb(f) - 'updated_at')::text, '|' order by id)) from financeiro_fornecedores f where cliente_id = c_cli)
     is distinct from v_sem_carimbo then raise exception 'N5 desfazer nao voltou identico'; end if;
  if (select nome from financeiro_fornecedores where id = f2) is distinct from 'SINT NC LEGADO EM CAIXA ALTA' then raise exception 'N5 nao voltou'; end if;

  -- N6
  if has_function_privilege('authenticated', 'public.fn_fornecedor_nome_caixa_aplicar(uuid, boolean)', 'execute') then raise exception 'N6 aplicar aberto'; end if;
  if has_function_privilege('anon', 'public._fn_nome_caixa(text)', 'execute') then raise exception 'N6 regra aberta ao anon'; end if;

  -- N7 sem usuario a aplicacao recusa (guarda de cliente)
  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.fn_fornecedor_nome_caixa_aplicar(c_cli);
    raise exception 'N7 sem usuario passou';
  exception when sqlstate '42501' then null;
  end;

  raise exception 'OK forn_nome_caixa_01 (N1–N7)';
end $t$;
rollback;
