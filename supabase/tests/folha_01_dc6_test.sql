-- FOLHA-01 · teste da D-C6 (118435): o 13º escrito "Folha … 13". Roda como postgres; termina em RAISE 'OK…'; nada fica no banco.
-- Fixture no cliente Teste (43f32d07) com nomes e valores INVENTADOS. Usuário = um admin real (claims da transação).
do $t$
declare
  T uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; ADM uuid; mold public.financeiro_lancamentos_v2; pc_sal uuid;
  fa uuid; fun_a uuid; l_sal uuid; l_13 uuid; r jsonb; m jsonb; x jsonb;
begin
  select user_id into ADM from cliente_membros where perfil = 'admin_agroinblue' and ativo order by user_id limit 1;
  select * into mold from financeiro_lancamentos_v2 where cliente_id = T and not coalesce(cancelado, false) and tipo_operacao = '2-Saídas'
     and conta_bancaria_id is not null and plano_conta_id is not null order by data_competencia desc limit 1;
  select id into pc_sal from financeiro_plano_contas where cliente_id is null and subcentro ilike 'Salários e Encargos%' order by id limit 1;
  if ADM is null or mold.id is null or pc_sal is null then raise exception 'sem fixture'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);
  insert into financeiro_fornecedores (cliente_id, nome, ativo) values (T, 'Eustaquio Teste Valadares', true) returning id into fa;
  fun_a := (fn_folha_funcionario_gravar(T, jsonb_build_object('nome', 'Eustaquio Teste Valadares', 'favorecido_id', fa), false)->>'id')::uuid;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_bancaria_id, plano_conta_id, favorecido_id, descricao, valor, sinal, tipo_operacao,
         status_transacao, data_competencia, data_vencimento, cenario, origem_lancamento, funcionario_id)
  select T, mold.fazenda_id, mold.conta_bancaria_id, pc_sal, fa, x2.d, x2.v, mold.sinal, mold.tipo_operacao, 'previsto', '2026-11-01', '2026-12-05', 'realizado', 'manual', fun_a
    from (values ('Folha Pagamento', 2500.00), ('Folha Pagamento - 13', 1250.00)) x2(d, v);
  select id into l_sal from financeiro_lancamentos_v2 where favorecido_id = fa and descricao = 'Folha Pagamento';
  select id into l_13 from financeiro_lancamentos_v2 where favorecido_id = fa and descricao = 'Folha Pagamento - 13';

  -- D1 a regra: os moldes do 13º casam; data e diária não
  if _fn_folha_tipo('Folha Pagamento - 13', 'Salários e Encargos Pecuária') is distinct from '13º' or _fn_folha_tipo('Folha Pagamento-3M 13', null) is distinct from '13º'
     or _fn_folha_tipo('Folha de Pagamento (+13)', null) is distinct from '13º' or _fn_folha_tipo('Folha Pagamento 13.10.2026', null) is distinct from 'Salário'
     or _fn_folha_tipo('Folha Pagamento 13/10', null) is distinct from 'Salário' or _fn_folha_tipo('13 diarias peão', 'Salários e Encargos Pecuária') is distinct from 'Salário'
     or _fn_folha_tipo('Folha Pagamento 2013', null) is distinct from 'Salário' then raise exception 'D1'; end if;

  -- D2 Folha do mês: o mensal tem só o salário; o 13º (sem parcela na descrição) aparece na 1ª e na 2ª parcela
  m := fn_folha_mes(T, '2026-11', 'mensal');
  select e into x from jsonb_array_elements(m->'linhas') e where e->>'funcionario_id' = fun_a::text;
  if x is null or jsonb_array_length(x->'lancamentos') is distinct from 1 or (x->>'previsto')::numeric is distinct from 2500 then raise exception 'D2a %', x; end if;
  select e into x from jsonb_array_elements(fn_folha_mes(T, '2026-11', '13_1')->'linhas') e where e->>'funcionario_id' = fun_a::text;
  if x is null or (x->>'previsto')::numeric is distinct from 1250 or x->'lancamentos'->0->>'id' is distinct from l_13::text then raise exception 'D2b %', x; end if;
  select e into x from jsonb_array_elements(fn_folha_mes(T, '2026-11', '13_2')->'linhas') e where e->>'funcionario_id' = fun_a::text;
  if x is null or (x->>'previsto')::numeric is distinct from 1250 then raise exception 'D2c %', x; end if;

  -- D3 recibo: o holerite mensal casa com o salário (não fica ambíguo); o recibo de 13º casa com o "Folha … 13" pelo funcionário
  r := fn_folha_recibos_aplicar(T, null, jsonb_build_object('md5', repeat('e', 32), 'nome', 'H.pdf', 'tipo', 'mensal', 'competencia', '2026-11', 'total', 2500),
         jsonb_build_array(jsonb_build_object('nome', 'Eustaquio Teste Valadares', 'paginas', '[1]'::jsonb, 'valor', 2500)), true);
  if jsonb_array_length(r->'automaticos') is distinct from 1 or r->'automaticos'->0->>'lancamento_id' is distinct from l_sal::text then raise exception 'D3a %', r; end if;
  r := fn_folha_recibos_aplicar(T, null, jsonb_build_object('md5', repeat('f', 32), 'nome', 'R13.pdf', 'tipo', '13_2', 'competencia', '2026-11', 'total', 1250),
         jsonb_build_array(jsonb_build_object('nome', 'Eustaquio Teste Valadares', 'paginas', '[1]'::jsonb, 'valor', 1250)), true);
  if jsonb_array_length(r->'automaticos') is distinct from 1 or r->'automaticos'->0->>'lancamento_id' is distinct from l_13::text
     or r->'automaticos'->0->>'casou_por' is distinct from 'funcionario' then raise exception 'D3b %', r; end if;

  -- D4 o Histórico conta o 13º como 13º
  r := fn_folha_historico(fun_a, null, null);
  if (r->'por_tipo'->>'13º')::int is distinct from 1 or (r->'por_tipo'->>'Salário')::int is distinct from 1 then raise exception 'D4 %', r->'por_tipo'; end if;
  raise exception 'OK FOLHA-01 D-C6: D1–D4 (nada gravado)';
end $t$;
