-- FORN-MESCLAR-02d — absorvido e' inativo, sempre; e as sugestoes "nome parecido" apertadas.
--   D1 mesclar deixa o absorvido inativo, com a marca
--   D2 reativar o absorvido e' barrado: "Mesclado em <nome> em <data> — desfaça a mesclagem para reativar"
--   D3 desfazer reativa (ativo e marca voltam juntos)
--   D4 varredura zerada: nenhum absorvido ativo em cliente nenhum; o CHECK existe e esta' validado
--   D5 Detran-MS x Detran-SP (so' UF) e NF 01 x NF 02 (so' numero) nao agrupam
--   D6 Jere agrupa (parecido: um nome contido no outro com 2+ palavras significativas)
--   D7 a fantasia de um igual a' razao social do outro agrupa como "mesmo nome" (o caso AGROinBLUE)
--   D8 trigrama abaixo de 0,75 (0,724) sem um nome contido no outro nao agrupa
--   D9 o CNPJ herdado do absorvido conta: o dono sem CNPJ (que absorveu X) e um homonimo com CNPJ Y nao agrupam
-- Sintetico no cliente Teste; termina em RAISE 'OK' (desfaz tudo).
set local statement_timeout = '60s';
set local lock_timeout = '3s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  a uuid; b uuid; d1 uuid; d2 uuid; n1 uuid; n2 uuid; j1 uuid; j2 uuid; gf uuid; ag uuid; m1 uuid; m2 uuid; h1 uuid; h2 uuid; h3 uuid; r jsonb; v jsonb; g jsonb; msg text; x record;
BEGIN
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'Sintq Fica Zeta', true) returning id into a;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'Sintq Absorvido Zeta', true) returning id into b;
  -- D1
  r := fn_fornecedor_mesclar(a, array[b], false);
  select * into x from financeiro_fornecedores where id = b;
  if x.ativo is distinct from false or x.fundido_em_id is distinct from a then raise exception 'D1: %', row_to_json(x); end if;
  -- D2
  msg := null; begin update financeiro_fornecedores set ativo = true where id = b; exception when others then msg := SQLERRM; end;
  if msg is null or msg not like 'Mesclado em Sintq Fica Zeta em __/__/____ — desfaça a mesclagem para reativar%' then raise exception 'D2: %', msg; end if;
  -- D3
  r := fn_fornecedor_mesclagem_desfazer((r->>'mesclagem_id')::uuid, 'teste 02d', false);
  select * into x from financeiro_fornecedores where id = b;
  if x.ativo is distinct from true or x.fundido_em_id is not null then raise exception 'D3: %', row_to_json(x); end if;
  -- D4
  if exists (select 1 from financeiro_fornecedores where fundido_em_id is not null and ativo is distinct from false) then raise exception 'D4 sobrou absorvido ativo'; end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_fornecedor_absorvido_inativo' and convalidated) then raise exception 'D4 CHECK'; end if;

  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'Sintq Detranzeta-MS', true) returning id into d1;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'Sintq Detranzeta-SP', true) returning id into d2;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'Sintq Notazeta Ferramentas 01', true) returning id into n1;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'Sintq Notazeta Ferramentas 02', true) returning id into n2;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'Pec.3M-Sintq Comercial Jerê', true) returning id into j1;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'Pec.3M-Sintq Comercial Jere Alimentos', true) returning id into j2;
  insert into financeiro_fornecedores (cliente_id, nome, nome_fantasia, cpf_cnpj, ativo) values (k, 'Sintq G F Exemplozeta', 'Sintq Agrozeta', '54.442.418/0001-88', true) returning id into gf;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'Sintq Agrozeta', true) returning id into ag;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'Sintq Madeireira Zetanova', true) returning id into m1;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'Sintq Madeireira Zetaviva', true) returning id into m2;
  v := fn_fornecedor_repetidos(k);
  -- D5
  if exists (select 1 from jsonb_array_elements(v) e where e->'fornecedores' @> jsonb_build_array(jsonb_build_object('id', d1), jsonb_build_object('id', d2))) then raise exception 'D5 Detran'; end if;
  if exists (select 1 from jsonb_array_elements(v) e where e->'fornecedores' @> jsonb_build_array(jsonb_build_object('id', n1), jsonb_build_object('id', n2))) then raise exception 'D5 numero'; end if;
  -- D6
  select e into g from jsonb_array_elements(v) e where e->'fornecedores' @> jsonb_build_array(jsonb_build_object('id', j1), jsonb_build_object('id', j2));
  if g is null or g->>'motivo' is distinct from 'parecido' then raise exception 'D6 Jere: %', g; end if;
  -- D7
  select e into g from jsonb_array_elements(v) e where e->'fornecedores' @> jsonb_build_array(jsonb_build_object('id', gf), jsonb_build_object('id', ag));
  if g is null or g->>'motivo' is distinct from 'nome' then raise exception 'D7 fantasia: %', g; end if;

  -- D8
  if exists (select 1 from jsonb_array_elements(v) e where e->'fornecedores' @> jsonb_build_array(jsonb_build_object('id', m1), jsonb_build_object('id', m2))) then raise exception 'D8 trigrama 0,724'; end if;

  -- D9
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'Sintq Herdeira Zetapar', true) returning id into h1;
  -- o absorvido montado direto (a mesclagem copiaria o CNPJ para o dono vazio e a heranca nao seria exercitada)
  insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo, fundido_em_id, fundido_em) values (k, 'Sintq Herdeira Zetapar Antiga', '11.222.333/0001-81', false, h1, now()) returning id into h2;
  insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (k, 'Sintq Herdeira Zetapar', '11.444.777/0001-61', true) returning id into h3;
  v := fn_fornecedor_repetidos(k);
  if exists (select 1 from jsonb_array_elements(v) e where e->'fornecedores' @> jsonb_build_array(jsonb_build_object('id', h1), jsonb_build_object('id', h3))) then raise exception 'D9 CNPJ herdado'; end if;

  RAISE EXCEPTION 'OK';
END $t$;
