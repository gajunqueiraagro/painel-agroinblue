-- CONTAS-BANCARIAS-AJUSTES-01 — teste do lote 118830. Roda como postgres, numa transação que termina em RAISE 'ENSAIO OK…' (nada fica).
-- ANTES (rodar antes da migration): o gerador devolve 3 dígitos — prova que o teste sabe cair.
-- DEPOIS: T1 2 dígitos no tipo com conta (o máximo + 1) · T2 tipo sem conta = "01" · T3 o tipo conta à parte (permuta ≠ cc)
--         · T4 acima de 99 = "100" (nunca "##") · T5 a conta nova pelo gatilho nasce com 2 dígitos (fixture no cliente Teste 43f32d07).
-- ═══ ANTES ═══
do $antes$ begin
  if length(public.fn_gerar_codigo_conta((select id from clientes where id::text like '43f32d07%'), 'tipo_que_nao_existe')) <> 3 then
    raise exception 'ANTES: o gerador já não dá 3 dígitos'; end if;
end $antes$;

-- ═══ (aqui entra o arquivo supabase/migrations/20261028118830_conta_codigo_dois_digitos.sql) ═══

-- ═══ DEPOIS ═══ (o cliente Teste tem só 1 cc "01" em 25/11: permuta, cartão e inv vazios; o CHECK aceita cc/inv/cartao/permuta)
do $t$
declare
  x uuid; v_ok text := ''; v_cod text; v_faz uuid;
begin
  set local statement_timeout = '10s';
  select id into x from clientes where id::text like '43f32d07%';
  if x is null then raise exception 'fixture: cliente Teste 43f32d07 não achado'; end if;
  if exists (select 1 from financeiro_contas_bancarias where cliente_id = x and tipo_conta in ('permuta', 'cartao', 'inv')) then
    raise exception 'fixture: o cliente Teste ganhou conta de permuta/cartão/inv — rever os números esperados'; end if;
  select id into v_faz from fazendas where cliente_id = x limit 1;
  -- T2 tipo sem conta
  if public.fn_gerar_codigo_conta(x, 'inv') <> '01' then raise exception 'T2 %', public.fn_gerar_codigo_conta(x, 'inv'); end if;
  v_ok := v_ok || 'T2 01 · ';
  -- T1/T3 permuta 05 e 012 (o máximo é 12, mesmo com 3 dígitos); cartão 40 conta à parte
  insert into financeiro_contas_bancarias (cliente_id, fazenda_id, nome_conta, tipo_conta, codigo_conta, ativa, banco)
  values (x, v_faz, 'Ensaio P1', 'permuta', '05', true, 'Permuta'), (x, v_faz, 'Ensaio P2', 'permuta', '012', true, 'Permuta'),
         (x, v_faz, 'Ensaio K1', 'cartao', '40', true, 'Outros');
  if public.fn_gerar_codigo_conta(x, 'permuta') <> '13' then raise exception 'T1 %', public.fn_gerar_codigo_conta(x, 'permuta'); end if;
  if public.fn_gerar_codigo_conta(x, 'cartao') <> '41' then raise exception 'T3 %', public.fn_gerar_codigo_conta(x, 'cartao'); end if;
  if public.fn_gerar_codigo_conta(x, 'cc') <> '02' then raise exception 'T3 cc %', public.fn_gerar_codigo_conta(x, 'cc'); end if;
  v_ok := v_ok || 'T1 permuta 13 · T3 cartão 41, cc 02 · ';
  -- T4 acima de 99
  insert into financeiro_contas_bancarias (cliente_id, fazenda_id, nome_conta, tipo_conta, codigo_conta, ativa, banco)
  values (x, v_faz, 'Ensaio I', 'inv', '99', true, 'Outros');
  if public.fn_gerar_codigo_conta(x, 'inv') <> '100' then raise exception 'T4 %', public.fn_gerar_codigo_conta(x, 'inv'); end if;
  v_ok := v_ok || 'T4 100 · ';
  -- T5 a conta nova sem código, pelo gatilho
  insert into financeiro_contas_bancarias (cliente_id, fazenda_id, nome_conta, tipo_conta, ativa, banco)
  values (x, v_faz, 'Ensaio P3', 'permuta', true, 'Permuta') returning codigo_conta into v_cod;
  if v_cod is distinct from '13' then raise exception 'T5 %', v_cod; end if;
  v_ok := v_ok || 'T5 gatilho 13 · ';
  raise exception 'ENSAIO OK conta código 2 dígitos · % corpo md5 %', v_ok,
    (select md5(prosrc) from pg_proc where oid = 'public.fn_gerar_codigo_conta(uuid, text)'::regprocedure);
end $t$;
