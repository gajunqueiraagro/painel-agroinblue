-- P74 (NOTA-CARTAO-PARCELADO-01) — migration 20261028112350. Fixture SINTETICA no cliente Teste: um lancamento de saida a' vista
-- (R$ 300,00, programado) DIVIDIDO 60/40 em duas contas, e outro igual SEM divisao; um cartao sintetico com lancamentos nos dias 10
-- (tres), 5 (tres, o mais recente) e 20 (um, cancelado) e um lancamento fora do periodo; uma conta corrente com lancamento no dia 10.
-- Roda como `authenticated` (admin) e TERMINA EM RAISE: nada fica.
-- P1 o dividido vira 1/3 e as TRES parcelas ficam divididas 60/40 (mesmas contas, mesma proporcao); o cadastro guarda as partes
-- P2 o nao dividido: as tres com uma conta so', nada no cadastro · D1 os dias do cartao: 10 (3), 5 (3, o ultimo mais recente);
-- o cancelado e o fora do periodo nao contam · D2 conta que nao e' cartao: nada
-- Mutacao: tirar o bloco P74 da RPC derruba P1; tirar o filtro `tipo_conta = 'cartao'` derruba D2; tirar `cancelado` derruba D1.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';
do $fx$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  faz uuid; pa uuid; pb uuid; dividido uuid; simples uuid; cartao uuid; cc uuid;
begin
  select id into faz from public.fazendas where cliente_id = c_cli order by id limit 1;
  select id into pa from public.financeiro_plano_contas where ativo and tipo_operacao = '2-Saídas' and (cliente_id is null or cliente_id = c_cli)
    and escopo_negocio is distinct from 'administrativo' order by id limit 1;
  select id into pb from public.financeiro_plano_contas where ativo and tipo_operacao = '2-Saídas' and (cliente_id is null or cliente_id = c_cli)
    and escopo_negocio is distinct from 'administrativo' and id <> pa order by id limit 1;
  if faz is null or pa is null or pb is null then raise exception 'fixture: o Teste precisa de fazenda e de duas contas de saída'; end if;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento,
      status_transacao, cenario, cancelado, plano_conta_id)
    values (c_cli, faz, '-1', '2-Saídas', 300.00, 'Compra sintetica dividida', '2031-08-10', '2031-08-10', 'programado', 'realizado', false, pa)
    returning id into dividido;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento,
      status_transacao, cenario, cancelado, plano_conta_id)
    values (c_cli, faz, '-1', '2-Saídas', 300.00, 'Compra sintetica simples', '2031-08-10', '2031-08-10', 'programado', 'realizado', false, pa)
    returning id into simples;
  insert into public.financeiro_contas_bancarias (cliente_id, fazenda_id, nome_conta, tipo_conta, ativa) values (c_cli, faz, 'Cartao Sintetico P74', 'cartao', true) returning id into cartao;
  insert into public.financeiro_contas_bancarias (cliente_id, fazenda_id, nome_conta, tipo_conta, ativa) values (c_cli, faz, 'Conta Sintetica P74', 'cc', true) returning id into cc;
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, sinal, tipo_operacao, valor, descricao, data_competencia, data_vencimento,
      status_transacao, cenario, cancelado, plano_conta_id, conta_bancaria_id)
  select c_cli, faz, '-1', '2-Saídas', 10, 'cartao sintetico', v::date, v::date, 'programado', 'realizado', canc, pa, conta
    from (values ('2031-01-10', false, cartao), ('2031-02-10', false, cartao), ('2031-03-10', false, cartao),
                 ('2031-04-05', false, cartao), ('2031-05-05', false, cartao), ('2031-06-05', false, cartao),
                 ('2031-06-20', true, cartao), ('2029-01-15', false, cartao), ('2031-06-10', false, cc)) x(v, canc, conta);
  perform set_config('teste.ids', concat_ws(',', dividido, simples, pa, pb, cartao, cc, faz), true);
end $fx$;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;
do $teste$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  ids text[] := string_to_array(current_setting('teste.ids'), ',');
  dividido uuid := ids[1]; simples uuid := ids[2]; pa uuid := ids[3]; pb uuid := ids[4]; cartao uuid := ids[5]; cc uuid := ids[6]; faz uuid := ids[7];
  payload jsonb; r jsonb; fin uuid; partes text; n int; dias text;
begin
  perform public.fn_lancamento_dividir(dividido, jsonb_build_array(jsonb_build_object('plano_conta_id', pa, 'percentual', 60),
    jsonb_build_object('plano_conta_id', pb, 'percentual', 40)), 'fixture P74', false);
  payload := jsonb_build_object('cliente_id', c_cli, 'fazenda_id', faz, 'descricao', 'Compra sintetica', 'valor_total', 300.00,
    'data_competencia', '2031-08-10', 'tipo_operacao', '2-Saídas', 'plano_conta_id', pa, 'tipo_financiamento', null,
    'parcelas', jsonb_build_array(jsonb_build_object('numero', 1, 'data_vencimento', '2031-09-10', 'valor', 100.00),
      jsonb_build_object('numero', 2, 'data_vencimento', '2031-10-10', 'valor', 100.00), jsonb_build_object('numero', 3, 'data_vencimento', '2031-11-10', 'valor', 100.00)));
  -- P1
  r := public.fn_parcelamento_a_partir_do_lancamento(dividido, payload, false);
  fin := (r->>'financiamento_id')::uuid;
  select string_agg(format('%s:%s', fp.numero_parcela, (select string_agg(format('%s=%s', case p.plano_conta_id when pa then 'A' when pb then 'B' else '?' end, round(p.percentual)), ',' order by p.ordem)
      from public.financeiro_lancamento_partes p where p.lancamento_id = fp.lancamento_id)), ' ' order by fp.numero_parcela)
    into partes from public.financiamento_parcelas fp where fp.financiamento_id = fin;
  if partes is distinct from '1:A=60,B=40 2:A=60,B=40 3:A=60,B=40' then raise exception 'P1: %', partes; end if;
  if (select classificacao_partes from public.financiamentos where id = fin) is null then raise exception 'P1: o cadastro sem as partes'; end if;
  if (select count(*) from public.financeiro_lancamentos_v2 l join public.financiamento_parcelas fp on fp.lancamento_id = l.id
       where fp.financiamento_id = fin and l.classificacao_dividida) <> 3 then raise exception 'P1: nem todas marcadas divididas'; end if;
  -- P2
  r := public.fn_parcelamento_a_partir_do_lancamento(simples, payload, false);
  fin := (r->>'financiamento_id')::uuid;
  select count(*) into n from public.financiamento_parcelas fp join public.financeiro_lancamento_partes p on p.lancamento_id = fp.lancamento_id where fp.financiamento_id = fin;
  if n <> 0 or (select classificacao_partes from public.financiamentos where id = fin) is not null then raise exception 'P2: % partes', n; end if;
  -- D1
  select string_agg(format('%s:%s:%s', dia, lancamentos, ultimo), ' ' order by dia) into dias from public.fn_cartao_dias_de_vencimento(cartao, '2030-07-01', '2031-07-01');
  if dias is distinct from '5:3:2031-06-05 10:3:2031-03-10' then raise exception 'D1: %', dias; end if;
  -- D2
  if exists (select 1 from public.fn_cartao_dias_de_vencimento(cc, '2030-07-01', '2031-07-01')) then raise exception 'D2: conta corrente devolveu dias'; end if;
  raise exception 'OK parcelar_lancamento_dividido (P1, P2, D1, D2)';
end $teste$;
rollback;
