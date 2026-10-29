-- P167-B2 — a `fn_nota_completar` com `p_valor_nota` (migration 20261028113070). Fixture SINTETICA no cliente Teste: 3 lançamentos de 100,00.
-- Roda como `authenticated` (admin) e TERMINA EM RAISE.
-- T1 a assinatura antiga (5 parâmetros) sumiu; a nova existe · T2 authenticated executa a nova, anon não
-- T3 a nota de 200,00 para 3 × 100,00: a prévia recusa com a frase; gravar levanta 22023 · T4 a nota de 300,00: passa
-- T5 sem `p_valor_nota` (o lote do P164; os nomes de sempre): passa como antes
-- Mutação: sem a checagem da soma, o T3 cai.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
do $fx$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  faz uuid; pl uuid; cb uuid; ids uuid[] := '{}'; x uuid; i int;
begin
  select id into faz from public.fazendas where cliente_id = c_cli order by id limit 1;
  select id into pl from public.financeiro_plano_contas where ativo and tipo_operacao = '2-Saídas' and (cliente_id is null or cliente_id = c_cli) order by id limit 1;
  select id into cb from public.financeiro_contas_bancarias where cliente_id = c_cli order by id limit 1;
  if faz is null or pl is null or cb is null then raise exception 'fixture: o Teste precisa de fazenda, conta do plano e conta bancária'; end if;
  for i in 1..3 loop
    insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento,
        status_transacao, cenario, cancelado, plano_conta_id, conta_bancaria_id)
    values (c_cli, faz, '-1', '2-Saídas', 100, format('Soma sintetica %s/3', i), '2031-08-19', '2031-09-18'::date + i * 30, 'programado', 'realizado', false, pl, cb)
    returning id into x;
    ids := ids || x;
  end loop;
  perform set_config('teste.ids', array_to_string(ids, ','), true);
end $fx$;

do $antes$
begin
  if to_regprocedure('public.fn_nota_completar(uuid,jsonb,boolean,text,boolean)') is not null then raise exception 'T1 a antiga existe'; end if;
  if to_regprocedure('public.fn_nota_completar(uuid,jsonb,boolean,text,boolean,numeric)') is null then raise exception 'T1 a nova não existe'; end if;
  if not has_function_privilege('authenticated', 'public.fn_nota_completar(uuid,jsonb,boolean,text,boolean,numeric)', 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_nota_completar(uuid,jsonb,boolean,text,boolean,numeric)', 'EXECUTE') then raise exception 'T2 ACL'; end if;
end $antes$;

set local role authenticated;
do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  ids uuid[] := string_to_array(current_setting('teste.ids'), ',')::uuid[];
  pedido jsonb; r jsonb; t text;
begin
  select jsonb_agg(jsonb_build_object('id', x, 'numero_documento', '000.000.777') order by x) into pedido from unnest(ids) x;
  -- T3 a nota de 200,00 para 300,00 de lançamentos: recusa
  r := public.fn_nota_completar(p_cliente => c_cli, p_lancamentos => pedido, p_juntar => false, p_chave => null, p_simular => true, p_valor_nota => 200);
  if (r->>'ok')::boolean or not exists (select 1 from jsonb_array_elements(r->'recusas') e where e->>'frase' = 'Os lançamentos somam R$ 300,00, mais que a nota (R$ 200,00): a nota não cobre todos.')
    then raise exception 'T3 simular: %', r; end if;
  begin
    r := public.fn_nota_completar(p_cliente => c_cli, p_lancamentos => pedido, p_juntar => false, p_chave => null, p_simular => false, p_valor_nota => 200); t := 'PASSOU';
  exception when others then t := sqlstate; end;
  if t <> '22023' then raise exception 'T3 gravar: %', t; end if;
  -- T4 a nota de 300,00: passa
  r := public.fn_nota_completar(p_cliente => c_cli, p_lancamentos => pedido, p_juntar => false, p_chave => null, p_simular => true, p_valor_nota => 300);
  if not (r->>'ok')::boolean then raise exception 'T4: %', r; end if;
  -- T5 sem o valor da nota (os nomes de sempre): passa
  r := public.fn_nota_completar(p_cliente => c_cli, p_lancamentos => pedido, p_juntar => false, p_chave => null, p_simular => true);
  if not (r->>'ok')::boolean then raise exception 'T5: %', r; end if;
  raise exception 'OK p167_b2_soma_nao_passa_da_nota (T1–T5)';
end $teste$;
rollback;
