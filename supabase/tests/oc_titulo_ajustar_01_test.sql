-- OC-CORRECOES-01 C1 · OC-TITULO-AJUSTAR-01 — vencimento, conta e classificacao do titulo de OC em aberto, juntos na OC.
-- Sintetico no cliente Teste (a OC copiada de uma venda real so' na estrutura), admin simulado; termina em RAISE 'OK'.
--   J1 vencimento: lancamento + parcela da programacao + parte; versao da OC sobe; evento 'ajustar_titulo' com antes/depois e motivo
--   J2 conta: a parcela acompanha (receita: `conta_destino_id`)
--   J3 classificacao: lancamento + parte + o compromisso de parcela UNICA ('reclassificado')
--   J4 compromisso com 2 parcelas: classificacao recusa com a frase (onde mudar)
--   J5 realizado e conciliado recusam com a frase; nada muda
--   J6 parte antiga (sem programacao): lancamento + parte, sem parcela
--   J7 lancamento sem OC recusa; J8 guarda (42501) e ACL
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

create function pg_temp.ext(p_v numeric, p_d date) returns uuid language plpgsql as $f$
declare v uuid := gen_random_uuid();
begin
  insert into public.extrato_bancario_v2 (id, cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao)
  values (v, '43f32d07-dba8-4670-900c-bf645440c04a', '131b8501-caf7-4964-b1b1-3f552ad2b75d', p_d, p_v,
          case when p_v > 0 then 'credito' else 'debito' end, 'SINT-OTA01-' || v, 'SINT');
  return v;
end $f$;
-- uma venda sintetica com compromisso + programacao de N parcelas materializadas; devolve os titulos
create function pg_temp.titulos_oc(p_vals numeric[]) returns uuid[] language plpgsql as $f$
declare c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; v_op uuid := gen_random_uuid(); v_comp uuid; v_prog uuid; v_pp uuid;
  r jsonb; v_ref public.zoo_operacao_compromissos; i int; ids uuid[] := '{}';
begin
  select * into v_ref from public.zoo_operacao_compromissos where id = 'd134e407-4cd1-47a0-938f-a9e2d4cc6f11';
  insert into public.zoo_operacoes_comerciais select (jsonb_populate_record(null::public.zoo_operacoes_comerciais, to_jsonb(o) || jsonb_build_object(
      'id', v_op, 'cliente_id', c_cli, 'fazenda_id', 'c2498ace-8478-410c-a697-d3f2e2934d1f', 'contraparte_id', null, 'versao', 1,
      'is_teste', true, 'rascunho', false, 'status_comercial', 'fechada'))).*
    from public.zoo_operacoes_comerciais o where o.id = '64c0e240-8d09-4511-9852-3ed6913205a3';
  insert into public.zoo_operacao_compromissos (cliente_id, operacao_id, natureza, componente, macro_custo, grupo_custo, centro_custo, subcentro,
      plano_conta_id, valor_total, descricao, status)
  values (c_cli, v_op, 'principal', 'recebimento', v_ref.macro_custo, v_ref.grupo_custo, v_ref.centro_custo, v_ref.subcentro, v_ref.plano_conta_id,
          (select sum(x) from unnest(p_vals) x), 'SINT Venda · Recebimento', 'programado') returning id into v_comp;
  insert into public.zoo_operacao_programacoes (cliente_id, compromisso_id, status) values (c_cli, v_comp, 'ativa') returning id into v_prog;
  for i in 1 .. cardinality(p_vals) loop
    insert into public.zoo_operacao_parcelas_programacao (cliente_id, programacao_id, sequencia, valor, vencimento, conta_bancaria_id, status)
    values (c_cli, v_prog, i, p_vals[i], date '2031-07-30', '131b8501-caf7-4964-b1b1-3f552ad2b75d', 'prevista') returning id into v_pp;
    r := public.oc_materializar_programacao(v_op, (select versao from public.zoo_operacoes_comerciais where id = v_op), v_prog, v_pp);
    ids := ids || (r->'titulo'->>'id')::uuid;
  end loop;
  return ids;
end $f$;

DO $t$
DECLARE c constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; t uuid; t2 uuid[]; x uuid; v0 int; op uuid; msg text; r jsonb; ok boolean;
  plano_outro uuid; conta_outra uuid; s text;
BEGIN
  t := (pg_temp.titulos_oc(array[160000]))[1];
  select operacao_id into op from public.zoo_operacao_partes where financeiro_lancamento_id = t and cancelada = false;
  select versao into v0 from public.zoo_operacoes_comerciais where id = op;
  -- J1
  r := public.oc_titulo_ajustar(t, '{"data_vencimento":"2031-06-30"}', 'pedido do teste');
  if (select data_vencimento from public.financeiro_lancamentos_v2 where id = t) <> date '2031-06-30'
     or (select pp.vencimento from public.zoo_operacao_partes pt join public.zoo_operacao_parcelas_programacao pp on pp.id = pt.programacao_parcela_id
          where pt.financeiro_lancamento_id = t and pt.cancelada = false) <> date '2031-06-30'
     or (select data_vencimento from public.zoo_operacao_partes where financeiro_lancamento_id = t and cancelada = false) <> date '2031-06-30'
     or (select versao from public.zoo_operacoes_comerciais where id = op) <> v0 + 1
     or not exists (select 1 from public.zoo_operacao_eventos e where e.operacao_id = op and e.acao = 'ajustar_titulo'
                     and e.detalhes->>'motivo' = 'pedido do teste' and e.dados_anteriores->>'data_vencimento' = '2031-07-30'
                     and e.dados_novos->>'data_vencimento' = '2031-06-30')
    then raise exception 'J1 vencimento'; end if;
  -- J2
  select id into conta_outra from public.financeiro_contas_bancarias where cliente_id = c and id <> '131b8501-caf7-4964-b1b1-3f552ad2b75d' limit 1;
  if conta_outra is null then
    insert into public.financeiro_contas_bancarias (cliente_id, nome_conta, nome_exibicao, tipo_conta, ativa)
    values (c, 'SINT OTA01', 'SINT OTA01', 'cc', true) returning id into conta_outra;
  end if;
  r := public.oc_titulo_ajustar(t, jsonb_build_object('conta_bancaria_id', conta_outra), null);
  if (select conta_destino_id from public.financeiro_lancamentos_v2 where id = t) is distinct from conta_outra
     or (select pp.conta_bancaria_id from public.zoo_operacao_partes pt join public.zoo_operacao_parcelas_programacao pp on pp.id = pt.programacao_parcela_id
          where pt.financeiro_lancamento_id = t and pt.cancelada = false) is distinct from conta_outra
    then raise exception 'J2 conta'; end if;
  -- J3
  select p.id into plano_outro from public.financeiro_plano_contas p
   where p.ativo and p.tipo_operacao = '1-Entradas' and (p.cliente_id is null or p.cliente_id = c)
     and p.id is distinct from (select plano_conta_id from public.financeiro_lancamentos_v2 where id = t) limit 1;
  r := public.oc_titulo_ajustar(t, jsonb_build_object('plano_conta_id', plano_outro), 'reclassificar');
  if r->>'compromisso_acao' <> 'reclassificado'
     or (select plano_conta_id from public.financeiro_lancamentos_v2 where id = t) is distinct from plano_outro
     or (select plano_conta_id from public.zoo_operacao_partes where financeiro_lancamento_id = t and cancelada = false) is distinct from plano_outro
     or (select c2.plano_conta_id from public.zoo_operacao_partes pt join public.zoo_operacao_parcelas_programacao pp on pp.id = pt.programacao_parcela_id
          join public.zoo_operacao_programacoes pr on pr.id = pp.programacao_id join public.zoo_operacao_compromissos c2 on c2.id = pr.compromisso_id
          where pt.financeiro_lancamento_id = t and pt.cancelada = false) is distinct from plano_outro
    then raise exception 'J3 classificacao: %', r; end if;
  -- J4
  t2 := pg_temp.titulos_oc(array[100, 200]);
  msg := null; begin perform public.oc_titulo_ajustar(t2[1], jsonb_build_object('plano_conta_id', plano_outro), null); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'A classificação é do compromisso inteiro (2 parcelas): mude pela operação, aba Financeiro. Nada foi gravado.' then raise exception 'J4: %', msg; end if;
  r := public.oc_titulo_ajustar(t2[1], '{"data_vencimento":"2031-06-15"}', null);   -- o vencimento de UMA parcela vale
  -- J5 realizado e conciliado
  update public.financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = date '2031-06-15' where id = t2[1];
  msg := null; begin perform public.oc_titulo_ajustar(t2[1], '{"data_vencimento":"2031-06-01"}', null); exception when others then msg := sqlerrm; end;
  if msg not like 'Já realizado: para ajustar, estorne%' then raise exception 'J5 realizado: %', msg; end if;
  perform public.fn_vincular_extrato_lancamento(pg_temp.ext(200, date '2031-06-20'), t2[2], 200, false);
  msg := null; begin perform public.oc_titulo_ajustar(t2[2], '{"data_vencimento":"2031-06-01"}', null); exception when others then msg := sqlerrm; end;
  if msg not like 'Conciliado com o extrato: desfaça a conciliação na Conferência%' then raise exception 'J5 conciliado: %', msg; end if;
  -- J6 parte antiga (sem programacao)
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, valor, sinal, data_competencia, data_vencimento, status_transacao,
    conta_destino_id, descricao, cenario, origem_lancamento)
  values (c, 'c2498ace-8478-410c-a697-d3f2e2934d1f', '1-Entradas', 375, '1', date '2031-07-01', date '2031-07-30', 'previsto',
          '131b8501-caf7-4964-b1b1-3f552ad2b75d', 'SINT antigo', 'realizado', 'manual') returning id into x;
  insert into public.zoo_operacao_partes (cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas, valor,
      data_vencimento, descricao, financeiro_lancamento_id)
  values (c, op, 'manual', 'principal', 'recebimento', 1, 1, 375, date '2031-07-30', 'SINT antigo', x);
  r := public.oc_titulo_ajustar(x, jsonb_build_object('data_vencimento', '2031-07-15', 'plano_conta_id', plano_outro), null);
  if (r->>'parcela_ajustada')::boolean or (select data_vencimento from public.financeiro_lancamentos_v2 where id = x) <> date '2031-07-15'
     or (select data_vencimento from public.zoo_operacao_partes where financeiro_lancamento_id = x) <> date '2031-07-15'
     or (select plano_conta_id from public.financeiro_lancamentos_v2 where id = x) is distinct from plano_outro
    then raise exception 'J6 parte antiga: %', r; end if;
  -- J7
  update public.zoo_operacao_partes set cancelada = true, cancelada_em = now() where financeiro_lancamento_id = x;
  msg := null; begin perform public.oc_titulo_ajustar(x, '{"data_vencimento":"2031-07-01"}', null); exception when others then msg := sqlerrm; end;
  if msg not like 'Este lançamento não é título de operação comercial%' then raise exception 'J7: %', msg; end if;
  -- J8
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  ok := false; begin perform public.oc_titulo_ajustar(t, '{"data_vencimento":"2031-06-01"}', null); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'J8 sem tenant'; end if;
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  if has_function_privilege('anon', 'public.oc_titulo_ajustar(uuid, jsonb, text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.oc_titulo_ajustar(uuid, jsonb, text)', 'EXECUTE') then raise exception 'J8 ACL'; end if;
  RAISE EXCEPTION 'OK';
END $t$;
