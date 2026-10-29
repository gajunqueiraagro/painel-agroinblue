-- P128b-N1 — `fn_nota_ja_lancada` devolve a conta de cada achado (migration 20261028113045). Fixture SINTETICA no cliente Teste: dois
-- lançamentos do mesmo fornecedor com o nº da nota, um com conta e um sem. Roda como `authenticated` (admin) e TERMINA EM RAISE.
-- T1 o achado com conta traz `conta_bancaria_id` = a conta dele · T2 o achado sem conta traz a chave com nulo (a tela pede a conta)
-- Mutação: sem a 113045 (o corpo de antes) o T1 cai.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
do $fx$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  faz uuid; pl uuid; cb uuid; fo uuid; a uuid; b uuid;
begin
  select id into faz from public.fazendas where cliente_id = c_cli order by id limit 1;
  select id into pl from public.financeiro_plano_contas where ativo and tipo_operacao = '2-Saídas' and (cliente_id is null or cliente_id = c_cli) order by id limit 1;
  select id into cb from public.financeiro_contas_bancarias where cliente_id = c_cli order by id limit 1;
  if faz is null or pl is null or cb is null then raise exception 'fixture: o Teste precisa de fazenda, conta do plano e conta bancária'; end if;
  insert into public.financeiro_fornecedores (cliente_id, nome, cpf_cnpj, ativo) values (c_cli, 'Rolamentos Sinteticos de Teste Ltda', '30.000.000/0001-08', true) returning id into fo;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento,
      status_transacao, cenario, cancelado, plano_conta_id, favorecido_id, numero_documento, conta_bancaria_id)
  values (c_cli, faz, '-1', '2-Saídas', 100, 'Rolamento sintetico 1/2', '2031-07-31', '2031-08-30', 'programado', 'realizado', false, pl, fo, '7771', cb)
  returning id into a;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento,
      status_transacao, cenario, cancelado, plano_conta_id, favorecido_id, numero_documento, conta_bancaria_id)
  values (c_cli, faz, '-1', '2-Saídas', 100, 'Rolamento sintetico 2/2', '2031-07-31', '2031-09-29', 'programado', 'realizado', false, pl, fo, '7771', null)
  returning id into b;
  perform set_config('teste.ids', concat_ws(',', a, b, cb), true);
end $fx$;

set local role authenticated;
do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  x uuid[] := string_to_array(current_setting('teste.ids'), ',')::uuid[];
  r jsonb; ea jsonb; eb jsonb;
begin
  r := public.fn_nota_ja_lancada(c_cli, '[{"n":1,"vencimento":"2031-08-30","valor_cent":10000},{"n":2,"vencimento":"2031-09-29","valor_cent":10000}]'::jsonb,
    '7771', null, '30000000000108', array['Rolamentos Sinteticos de Teste Ltda'], null);
  select e into ea from jsonb_array_elements(r) e where (e->>'id')::uuid = x[1];
  select e into eb from jsonb_array_elements(r) e where (e->>'id')::uuid = x[2];
  if ea is null or eb is null then raise exception 'fixture: a busca não achou os dois (%)', jsonb_array_length(r); end if;
  if (ea->>'conta_bancaria_id')::uuid is distinct from x[3] then raise exception 'T1: %', ea; end if;
  if not (eb ? 'conta_bancaria_id') or (eb->>'conta_bancaria_id') is not null then raise exception 'T2: %', eb; end if;
  raise exception 'OK p128b_n1_ja_lancada_conta (T1–T2)';
end $teste$;
rollback;
