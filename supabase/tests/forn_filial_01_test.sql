-- FORN-FILIAL-01 — fornecedor com filiais: a trava do documento e a busca pela cidade.
-- Roda como `postgres`, DEPOIS da migration 20261028110100, e TERMINA EM RAISE: nada fica no banco. Sucesso = a excecao final
-- comeca com "OK". Sintetico no cliente Teste (43f32d07). A trava e' ADIADA (fim da transacao): o teste a dispara com
-- `SET CONSTRAINTS ALL IMMEDIATE`.
-- F1 duas filiais (mesma razao social, CNPJ diferente) coexistem.
-- F2 o CNPJ de outro ATIVO nao grava — nem no INSERT nem no UPDATE (23505, "Este CPF/CNPJ ja' e' de <nome> (ativo)").
-- F3 INATIVO nao bloqueia: o inativo com o mesmo CNPJ grava, e o ativo novo com o CNPJ de um inativo tambem.
-- F4 o Mesclar na mesma transacao (o dono recebe o CNPJ do absorvido, que vira inativo) passa: vale o estado do fim.
-- F5 a busca acha pela cidade: "<nome> tres" so' a filial de Tres Lagoas; a cidade sozinha acha; palavra fora nao casa.
-- F6 o XML de uma filial nao grava o CNPJ na outra: o UPDATE do XML so' pega cadastro SEM documento (0 linha na filial com CNPJ).
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
create function pg_temp.forn(p_nome text, p_doc text, p_mun text default null, p_uf text default null, p_ativo boolean default true) returns uuid
  language sql as $f$
  insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj, municipio, uf, ativo)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', p_nome, p_doc, p_mun, p_uf, p_ativo) returning id $f$;
create function pg_temp.travou(p_sql text) returns text language plpgsql as $f$
begin
  execute p_sql;
  set constraints all immediate;
  set constraints all deferred;
  return 'PASSOU';
exception when others then return sqlstate || ' ' || sqlerrm;
end $f$;

do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_adm constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  a uuid; b uuid; s uuid; i uuid; v jsonb; t text; n int; got text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_adm, 'role', 'authenticated')::text, true);

  -- F1
  a := pg_temp.forn('Sintq Filialzeta Produtos Agropecuarios Ltda', '11.222.333/0004-24', 'Três Lagoas', 'MS');
  b := pg_temp.forn('Sintq Filialzeta Produtos Agropecuarios Ltda', '11.222.333/0038-73', 'Presidente Prudente', 'SP');
  set constraints all immediate; set constraints all deferred;
  if (select count(*) from financeiro_fornecedores where id in (a, b) and ativo) <> 2 then raise exception 'F1 as filiais nao coexistem'; end if;

  -- F2
  t := pg_temp.travou(format('insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj) values (%L, %L, %L)',
                             c_cli, 'Sintq Outro Nome Zeta', '11222333000424'));
  if t not like '23505%Este CPF/CNPJ já é de Sintq Filialzeta Produtos Agropecuarios Ltda (ativo)%' then raise exception 'F2 insert: %', t; end if;
  s := pg_temp.forn('Sintq Sem Doc Zeta', null);
  t := pg_temp.travou(format('update financeiro_fornecedores set cpf_cnpj = %L where id = %L', '11.222.333/0038-73', s));
  if t not like '23505%' then raise exception 'F2 update: %', t; end if;

  -- F3
  i := pg_temp.forn('Sintq Inativo Zeta', '11.444.777/0001-61', null, null, false);
  t := pg_temp.travou(format('insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj) values (%L, %L, %L)',
                             c_cli, 'Sintq Ativo Novo Zeta', '11.444.777/0001-61'));
  if t <> 'PASSOU' then raise exception 'F3 o inativo bloqueou: %', t; end if;
  t := pg_temp.travou(format('insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (%L, %L, %L, false)',
                             c_cli, 'Sintq Inativo Dois Zeta', '11.222.333/0004-24'));
  if t <> 'PASSOU' then raise exception 'F3 inativo com o CNPJ de ativo: %', t; end if;

  -- F4 (o Mesclar: o dono recebe o CNPJ, o absorvido sai de uso, tudo na mesma transacao)
  t := pg_temp.travou(format('update financeiro_fornecedores set cpf_cnpj = %L where id = %L; update financeiro_fornecedores set ativo = false, fundido_em_id = %L, fundido_em = now() where id = %L',
                             '11.222.333/0004-24', s, s, a));
  if t <> 'PASSOU' then raise exception 'F4 mesclar na mesma transacao: %', t; end if;

  -- F5
  v := public.fn_fornecedor_buscar(c_cli, 'filialzeta tres', 'todos', null, 0);
  select string_agg(x->>'id', ',') into got from jsonb_array_elements(v->'itens') x;
  if got is distinct from a::text then raise exception 'F5 nome + cidade: %', got; end if;
  v := public.fn_fornecedor_buscar(c_cli, 'presidente prudente', 'ativos', null, 0);
  if not exists (select 1 from jsonb_array_elements(v->'itens') x where x->>'id' = b::text) then raise exception 'F5 cidade sozinha'; end if;
  v := public.fn_fornecedor_buscar(c_cli, 'filialzeta campo', 'todos', null, 0);
  if jsonb_array_length(v->'itens') <> 0 then raise exception 'F5 palavra fora casou: %', v->'itens'; end if;

  -- F6 (o UPDATE do `gravarDocumentoNoCadastro`: so' cadastro sem documento)
  update financeiro_fornecedores set cpf_cnpj = '11.222.333/0004-24' where id = b and (cpf_cnpj is null or cpf_cnpj = '');
  get diagnostics n = row_count;
  if n <> 0 or (select cpf_cnpj from financeiro_fornecedores where id = b) <> '11.222.333/0038-73' then raise exception 'F6 gravou na outra filial'; end if;

  raise exception 'OK forn_filial_01 (F1–F6)';
end $teste$;
rollback;
