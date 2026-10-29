-- P163 — a prévia da `fn_nota_completar` diz a SAFRA pelo NOME (migration 20261028113080). Fixture SINTETICA no cliente Teste: um lançamento
-- e uma safra com nome e código diferentes. Roda como `authenticated` (admin) e TERMINA EM RAISE.
-- T1 o `hoje_nome` da safra é o nome do cadastro (nunca o código) · T2 a ACL da função interna segue fechada (authenticated não executa)
-- Mutação: sem a 113080 (o código), o T1 cai.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
do $fx$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  faz uuid; pl uuid; cb uuid; sf uuid; x uuid;
begin
  select id into faz from public.fazendas where cliente_id = c_cli order by id limit 1;
  select id into pl from public.financeiro_plano_contas where ativo and tipo_operacao = '2-Saídas' and (cliente_id is null or cliente_id = c_cli) order by id limit 1;
  select id into cb from public.financeiro_contas_bancarias where cliente_id = c_cli order by id limit 1;
  insert into public.financeiro_safras (cliente_id, nome, codigo, ativa) values (c_cli, 'Safra Sintetica Pecuaria 2031/32', 'SS31', true) returning id into sf;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento,
      status_transacao, cenario, cancelado, plano_conta_id, conta_bancaria_id, safra_id)
  values (c_cli, faz, '-1', '2-Saídas', 50, 'Safra sintetica', '2031-08-19', '2031-09-18', 'programado', 'realizado', false, pl, cb, sf) returning id into x;
  perform set_config('teste.id', x::text, true);
end $fx$;

do $acl$
begin
  if has_function_privilege('authenticated', 'public._fn_nota_completar_nome(text,text)', 'EXECUTE') then raise exception 'T2 ACL aberta'; end if;
end $acl$;

set local role authenticated;
do $teste$
declare r jsonb;
begin
  r := public.fn_nota_completar(p_cliente => '43f32d07-dba8-4670-900c-bf645440c04a', p_lancamentos => jsonb_build_array(jsonb_build_object('id', current_setting('teste.id'))),
    p_juntar => false, p_chave => null, p_simular => true);
  if (r->'linhas'->0->'campos'->'safra_id'->>'hoje_nome') is distinct from 'Safra Sintetica Pecuaria 2031/32' then raise exception 'T1: %', r->'linhas'->0->'campos'->'safra_id'; end if;
  raise exception 'OK p163_safra_pelo_nome (T1–T2)';
end $teste$;
rollback;
