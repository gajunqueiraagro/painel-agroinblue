-- FORN-MESCLAR-02c — sugestoes por nome parecido; documentos diferentes nunca no mesmo grupo nem mesclados.
--   P1 "Pec.3M-… Comercial Jerê" x "Pec.3M-… Comercial Jere Alimentos" (sem CNPJ): o MESMO grupo, motivo 'parecido'
--   P2 o mesmo nome SEM o prefixo "Pec.3M-" nunca cai no grupo do rateio
--   P3 dois CNPJs diferentes de nome parecido, e um sem documento ligado aos dois: nenhum grupo junta os dois CNPJs
--   P4 mesclar os dois CNPJs: recusa 'cnpj_diferente' "CNPJs diferentes — são empresas diferentes"
--   P5 o cadastro SEM CNPJ que absorveu o CNPJ A herda o documento: mesclar com o CNPJ B e' recusado nos dois sentidos
-- Sintetico no cliente Teste; termina em RAISE 'OK' (desfaz tudo).
set local statement_timeout = '60s';
set local lock_timeout = '3s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  j1 uuid; j2 uuid; j3 uuid; a uuid; b uuid; l uuid; c uuid; g jsonb; r jsonb; v jsonb;
BEGIN
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'Pec.3M-Sintq Comercial Jerê', true) returning id into j1;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'Pec.3M-Sintq Comercial Jere Alimentos', true) returning id into j2;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'Sintq Comercial Jere Alimentos', true) returning id into j3;
  insert into financeiro_fornecedores (cliente_id, nome, ativo, cpf_cnpj) values (k, 'Sintq Agrozeta Exemplo', true, '54.442.418/0001-88') returning id into a;
  insert into financeiro_fornecedores (cliente_id, nome, ativo, cpf_cnpj) values (k, 'Sintq Agrozeta Exemplo HJ', true, '11.222.333/0001-81') returning id into b;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'Sintq Agrozeta Exemplo Ltda', true) returning id into l;
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (k, 'Sintq Casa Ômega Agrozeta', true) returning id into c;
  v := fn_fornecedor_repetidos(k);

  -- P1
  select e into g from jsonb_array_elements(v) e where e->'fornecedores' @> jsonb_build_array(jsonb_build_object('id', j1));
  if g is null or not (g->'fornecedores' @> jsonb_build_array(jsonb_build_object('id', j2))) or g->>'motivo' is distinct from 'parecido' then
    raise exception 'P1 Jere parecido: %', g; end if;
  -- P2
  if g->'fornecedores' @> jsonb_build_array(jsonb_build_object('id', j3)) then raise exception 'P2 Pec.3M x sem prefixo: %', g; end if;
  -- P3
  if exists (select 1 from jsonb_array_elements(v) e where e->'fornecedores' @> jsonb_build_array(jsonb_build_object('id', a), jsonb_build_object('id', b))) then
    raise exception 'P3 dois CNPJs no mesmo grupo'; end if;
  if exists (select 1 from jsonb_array_elements(v) e
              where (select count(distinct _fn_fornecedor_chave_documento(x->>'cpf_cnpj')) from jsonb_array_elements(e->'fornecedores') x) > 1) then
    raise exception 'P3 algum grupo com documentos diferentes'; end if;
  -- P4
  r := fn_fornecedor_mesclar(b, array[a], true);
  if r->'recusa'->>'motivo' is distinct from 'cnpj_diferente' or r->'recusa'->>'frase' not like 'CNPJs diferentes — são empresas diferentes:%' then
    raise exception 'P4 recusa: %', r; end if;
  -- P5
  -- como a mesclagem antiga (anterior ao 02b): o absorvido marcado, o que fica SEM o CNPJ dele
  update financeiro_fornecedores set fundido_em_id = c, fundido_em = now(), ativo = false where id = a;
  if (select cpf_cnpj from financeiro_fornecedores where id = c) is not null then raise exception 'P5 montagem'; end if;
  r := fn_fornecedor_mesclar(b, array[c], true);
  if r->'recusa'->>'motivo' is distinct from 'cnpj_diferente' or r->'recusa'->>'frase' not like '%mesclado em%' then raise exception 'P5 B absorve C: %', r; end if;
  r := fn_fornecedor_mesclar(c, array[b], true);
  if r->'recusa'->>'motivo' is distinct from 'cnpj_diferente' then raise exception 'P5 C absorve B: %', r; end if;
  v := fn_fornecedor_repetidos(k);
  if exists (select 1 from jsonb_array_elements(v) e where e->'fornecedores' @> jsonb_build_array(jsonb_build_object('id', c), jsonb_build_object('id', b))) then
    raise exception 'P5 grupo junta o herdeiro do CNPJ A com o CNPJ B'; end if;

  RAISE EXCEPTION 'OK';
END $t$;
