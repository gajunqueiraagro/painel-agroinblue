-- FORN-FILIAL-01-FIX — a gravacao de fornecedor PELA TELA (como `authenticated`, com as claims de um usuario real do cliente Teste)
-- volta a passar: criar, editar, mesclar e inativar; o CNPJ de outro ativo continua recusado com a frase. Roda DEPOIS da migration
-- 20261028110200 e TERMINA EM RAISE: nada fica no banco. A trava e' ADIADA: o teste a dispara com `SET CONSTRAINTS ALL IMMEDIATE`.
-- X0 o catalogo: o gatilho e' SECURITY DEFINER; a chave do documento e' executavel por `authenticated` e nao por `anon` (o indice a avalia
--    como quem grava). Voltar o gatilho a INVOKER ou tirar o EXECUTE derruba este teste.
-- X1 criar · X2 editar (nome e CNPJ) · X3 mesclar (a RPC de verdade, gravando) · X4 inativar · X5 CNPJ de outro ativo: 23505 com a frase.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  a uuid; b uuid; d uuid; r jsonb; t text;
begin
  -- X0
  if not (select prosecdef from pg_proc where proname = '_trg_fornecedor_documento_ativo_unico') then raise exception 'X0 gatilho INVOKER'; end if;
  if not has_function_privilege('authenticated', 'public._fn_fornecedor_chave_documento(text)', 'EXECUTE') then raise exception 'X0 sem EXECUTE'; end if;
  if has_function_privilege('anon', 'public._fn_fornecedor_chave_documento(text)', 'EXECUTE') then raise exception 'X0 anon executa'; end if;
  if current_user <> 'authenticated' then raise exception 'X0 nao esta como authenticated: %', current_user; end if;

  -- X1
  insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj) values (c_cli, 'Sintq Fix Zeta Dono', '11.222.333/0004-24') returning id into a;
  insert into financeiro_fornecedores (cliente_id, nome) values (c_cli, 'Sintq Fix Zeta Absorvido') returning id into b;
  insert into financeiro_fornecedores (cliente_id, nome) values (c_cli, 'Sintq Fix Zeta Inativar') returning id into d;
  set constraints all immediate; set constraints all deferred;

  -- X2
  update financeiro_fornecedores set nome = 'Sintq Fix Zeta Dono Editado', cpf_cnpj = '11.222.333/0038-73' where id = a;
  set constraints all immediate; set constraints all deferred;
  if (select cpf_cnpj from financeiro_fornecedores where id = a) <> '11.222.333/0038-73' then raise exception 'X2 nao editou'; end if;

  -- X3
  r := public.fn_fornecedor_mesclar(a, array[b], false, '{}'::jsonb);
  set constraints all immediate; set constraints all deferred;
  if (select fundido_em_id from financeiro_fornecedores where id = b) is distinct from a then raise exception 'X3 nao mesclou: %', r; end if;

  -- X4
  update financeiro_fornecedores set ativo = false where id = d;
  set constraints all immediate; set constraints all deferred;
  if (select ativo from financeiro_fornecedores where id = d) then raise exception 'X4 nao inativou'; end if;

  -- X5
  begin
    insert into financeiro_fornecedores (cliente_id, nome, cpf_cnpj) values (c_cli, 'Sintq Fix Outro Nome', '11222333003873');
    set constraints all immediate;
    t := 'PASSOU';
  exception when others then t := sqlstate || ' ' || sqlerrm; end;
  if t not like '23505%Este CPF/CNPJ já é de Sintq Fix Zeta Dono Editado (ativo). Nada foi gravado.%' then raise exception 'X5: %', t; end if;

  raise exception 'OK forn_filial_01_fix (X0–X5)';
end $teste$;
rollback;
