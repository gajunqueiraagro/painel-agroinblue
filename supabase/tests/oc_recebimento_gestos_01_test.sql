-- OC-CORRECOES-01 C2 · OC-CC-GESTOS-LEGADO-01 — os tres gestos do titulo de OC (cancelar, desvincular, parcelar), com o legado (sem
-- compromisso) incluido. Sintetico no cliente Teste (a OC copiada de uma venda real so' na estrutura), admin simulado; RAISE 'OK'.
--   G1 cancelar o legado: lancamento e parte cancelados, com o motivo; evento; versao sobe
--   G2 desvincular o legado: a parte sai, o lancamento volta a avulso INTACTO (valor, vencimento, conta; origem OC -> manual)
--   G3 parcelar o legado (375 -> 215 + 160): cria compromisso + programacao, o titulo vira a 1/2 (215) e a 2/2 (160) nasce materializada
--   G4 parcelar com compromisso (300 -> 100 + 200): a parcela do titulo vira 100, a nova entra na mesma programacao; o compromisso fica 300
--   G5 recusas: a soma que nao bate (com os dois valores), conciliado (manda a' Conferencia), realizado (manda estornar)
--   G6 cancelar/desvincular COM compromisso manda ao gesto do compromisso; G7 simular nao grava; guarda e ACL
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

create function pg_temp.ext(p_v numeric, p_d date) returns uuid language plpgsql as $f$
declare v uuid := gen_random_uuid();
begin
  insert into public.extrato_bancario_v2 (id, cliente_id, conta_bancaria_id, data_movimento, valor, tipo_movimento, hash_movimento, descricao)
  values (v, '43f32d07-dba8-4670-900c-bf645440c04a', '131b8501-caf7-4964-b1b1-3f552ad2b75d', p_d, p_v,
          case when p_v > 0 then 'credito' else 'debito' end, 'SINT-ORG01-' || v, 'SINT');
  return v;
end $f$;
create function pg_temp.op() returns uuid language plpgsql as $f$
declare v uuid := gen_random_uuid();
begin
  insert into public.zoo_operacoes_comerciais select (jsonb_populate_record(null::public.zoo_operacoes_comerciais, to_jsonb(o) || jsonb_build_object(
      'id', v, 'cliente_id', '43f32d07-dba8-4670-900c-bf645440c04a', 'fazenda_id', 'c2498ace-8478-410c-a697-d3f2e2934d1f', 'contraparte_id', null,
      'versao', 1, 'is_teste', true, 'rascunho', false, 'status_comercial', 'fechada'))).*
    from public.zoo_operacoes_comerciais o where o.id = '64c0e240-8d09-4511-9852-3ed6913205a3';
  return v;
end $f$;
-- um titulo LEGADO (parte 'manual', sem programacao) na OC
create function pg_temp.legado(p_op uuid, p_valor numeric) returns uuid language plpgsql as $f$
declare x uuid;
begin
  insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, tipo_operacao, valor, sinal, data_competencia, data_vencimento, status_transacao,
    conta_destino_id, descricao, cenario, origem_lancamento, subcentro)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', 'c2498ace-8478-410c-a697-d3f2e2934d1f', '1-Entradas', p_valor, '1', date '2031-07-01', date '2031-07-30',
          'previsto', '131b8501-caf7-4964-b1b1-3f552ad2b75d', 'SINT Venda 118 vacas', 'realizado', 'operacao_comercial',
          (select subcentro from public.zoo_operacao_compromissos where id = 'd134e407-4cd1-47a0-938f-a9e2d4cc6f11')) returning id into x;
  insert into public.zoo_operacao_partes (cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas, valor,
      data_vencimento, descricao, financeiro_lancamento_id)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', p_op, 'manual', 'principal', 'recebimento', 1, 1, p_valor, date '2031-07-30', 'SINT', x);
  return x;
end $f$;
-- um titulo COM compromisso (programacao de 1 parcela materializada)
create function pg_temp.com_compromisso(p_op uuid, p_valor numeric) returns uuid language plpgsql as $f$
declare c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; v_comp uuid; v_prog uuid; v_pp uuid; r jsonb; v_ref public.zoo_operacao_compromissos;
begin
  select * into v_ref from public.zoo_operacao_compromissos where id = 'd134e407-4cd1-47a0-938f-a9e2d4cc6f11';
  insert into public.zoo_operacao_compromissos (cliente_id, operacao_id, natureza, componente, macro_custo, grupo_custo, centro_custo, subcentro,
      plano_conta_id, valor_total, descricao, status)
  values (c_cli, p_op, 'principal', 'recebimento', v_ref.macro_custo, v_ref.grupo_custo, v_ref.centro_custo, v_ref.subcentro, v_ref.plano_conta_id,
          p_valor, 'SINT Venda · Recebimento', 'programado') returning id into v_comp;
  insert into public.zoo_operacao_programacoes (cliente_id, compromisso_id, status) values (c_cli, v_comp, 'ativa') returning id into v_prog;
  insert into public.zoo_operacao_parcelas_programacao (cliente_id, programacao_id, sequencia, valor, vencimento, conta_bancaria_id, status)
  values (c_cli, v_prog, 1, p_valor, date '2031-07-30', '131b8501-caf7-4964-b1b1-3f552ad2b75d', 'prevista') returning id into v_pp;
  r := public.oc_materializar_programacao(p_op, (select versao from public.zoo_operacoes_comerciais where id = p_op), v_prog, v_pp);
  return (r->'titulo'->>'id')::uuid;
end $f$;

DO $t$
DECLARE c constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; op uuid; x uuid; y uuid; r jsonb; v0 int; msg text; ok boolean; s text;
BEGIN
  op := pg_temp.op();
  -- G1
  x := pg_temp.legado(op, 215000); select versao into v0 from public.zoo_operacoes_comerciais where id = op;
  r := public.oc_recebimento_gesto(x, 'cancelar', 'refeito na OC nova');
  if (select cancelado from public.financeiro_lancamentos_v2 where id = x) is not true
     or (select cancelado_motivo from public.financeiro_lancamentos_v2 where id = x) <> 'refeito na OC nova'
     or exists (select 1 from public.zoo_operacao_partes where financeiro_lancamento_id = x and cancelada = false)
     or (select versao from public.zoo_operacoes_comerciais where id = op) <> v0 + 1
     or not exists (select 1 from public.zoo_operacao_eventos where operacao_id = op and acao = 'cancelar_titulo_legado' and detalhes->>'motivo' = 'refeito na OC nova')
    then raise exception 'G1 cancelar legado: %', r; end if;
  -- G2
  x := pg_temp.legado(op, 375000);
  r := public.oc_recebimento_gesto(x, 'desvincular', 'nao e desta venda');
  select format('%s|%s|%s|%s|%s', cancelado, valor, data_vencimento, conta_destino_id, origem_lancamento) into s from public.financeiro_lancamentos_v2 where id = x;
  if s <> 'f|375000|2031-07-30|131b8501-caf7-4964-b1b1-3f552ad2b75d|manual'
     or exists (select 1 from public.zoo_operacao_partes where financeiro_lancamento_id = x and cancelada = false)
    then raise exception 'G2 desvincular legado: %', s; end if;
  -- G3
  x := pg_temp.legado(op, 375000);
  r := public.oc_recebimento_gesto(x, 'parcelar', 'Pix em duas datas',
         '[{"valor":215000,"vencimento":"2031-06-30"},{"valor":160000,"vencimento":"2031-06-30"}]');
  y := (r->'titulos'->>1)::uuid;
  if (select valor from public.financeiro_lancamentos_v2 where id = x) <> 215000 or (select data_vencimento from public.financeiro_lancamentos_v2 where id = x) <> date '2031-06-30'
     or (select valor from public.financeiro_lancamentos_v2 where id = y) <> 160000
     or (select status from public.zoo_operacao_compromissos where id = (r->>'compromisso_id')::uuid) <> 'programado'
     or (select valor_total from public.zoo_operacao_compromissos where id = (r->>'compromisso_id')::uuid) <> 375000
     or (select string_agg(sequencia_parcela || '/' || quantidade_parcelas, ',' order by sequencia_parcela) from public.zoo_operacao_partes
          where financeiro_lancamento_id in (x, y) and cancelada = false) <> '1/2,2/2'
     or (select count(*) from public.zoo_operacao_partes where financeiro_lancamento_id in (x, y) and cancelada = false and programacao_parcela_id is not null) <> 2
    then raise exception 'G3 parcelar legado: %', r; end if;
  -- G4
  x := pg_temp.com_compromisso(op, 300);
  r := public.oc_recebimento_gesto(x, 'parcelar', 'dividir', '[{"valor":100,"vencimento":"2031-08-10"},{"valor":200,"vencimento":"2031-09-10"}]');
  y := (r->'titulos'->>1)::uuid;
  if (select valor from public.financeiro_lancamentos_v2 where id = x) <> 100 or (select valor from public.financeiro_lancamentos_v2 where id = y) <> 200
     or (select data_vencimento from public.financeiro_lancamentos_v2 where id = y) <> date '2031-09-10'
     or (select c2.valor_total from public.zoo_operacao_partes pt join public.zoo_operacao_parcelas_programacao pp on pp.id = pt.programacao_parcela_id
          join public.zoo_operacao_programacoes pr on pr.id = pp.programacao_id join public.zoo_operacao_compromissos c2 on c2.id = pr.compromisso_id
          where pt.financeiro_lancamento_id = y and pt.cancelada = false) <> 300
    then raise exception 'G4 parcelar com compromisso: %', r; end if;
  -- G5
  x := pg_temp.legado(op, 375);
  msg := null; begin perform public.oc_recebimento_gesto(x, 'parcelar', 'x', '[{"valor":100,"vencimento":"2031-06-30"},{"valor":200,"vencimento":"2031-06-30"}]');
  exception when others then msg := sqlerrm; end;
  if msg is distinct from 'As parcelas somam R$ 300,00 e o título é de R$ 375,00: a soma tem de bater ao centavo. Nada foi gravado.' then raise exception 'G5 soma: %', msg; end if;
  perform public.fn_vincular_extrato_lancamento(pg_temp.ext(375, date '2031-07-30'), x, 375, false);
  msg := null; begin perform public.oc_recebimento_gesto(x, 'cancelar', 'x'); exception when others then msg := sqlerrm; end;
  if msg not like 'Conciliado com o extrato: desfaça a conciliação na Conferência%' then raise exception 'G5 conciliado: %', msg; end if;
  x := pg_temp.legado(op, 50);
  update public.financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = date '2031-07-30' where id = x;
  msg := null; begin perform public.oc_recebimento_gesto(x, 'desvincular', 'x'); exception when others then msg := sqlerrm; end;
  if msg not like 'Já é dinheiro (realizado): para desfazer, estorne no lançamento primeiro%' then raise exception 'G5 realizado: %', msg; end if;
  -- G6
  x := pg_temp.com_compromisso(op, 80);
  msg := null; begin perform public.oc_recebimento_gesto(x, 'cancelar', 'x'); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Este título tem compromisso na operação: use o Cancelar programado do compromisso. Nada foi gravado.' then raise exception 'G6: %', msg; end if;
  -- G7
  x := pg_temp.legado(op, 90);
  r := public.oc_recebimento_gesto(x, 'cancelar', null, null, true);
  if (r->>'simulado')::boolean is not true or (select cancelado from public.financeiro_lancamentos_v2 where id = x) then raise exception 'G7 simular gravou'; end if;
  msg := null; begin perform public.oc_recebimento_gesto(x, 'cancelar', '  '); exception when others then msg := sqlerrm; end;
  if msg is distinct from 'Informe o motivo. Nada foi gravado.' then raise exception 'G7 motivo: %', msg; end if;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  ok := false; begin perform public.oc_recebimento_gesto(x, 'cancelar', 'x'); exception when sqlstate '42501' then ok := true; end;
  if not ok then raise exception 'G7 sem tenant'; end if;
  perform set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  if has_function_privilege('anon', 'public.oc_recebimento_gesto(uuid, text, text, jsonb, boolean)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.oc_recebimento_gesto(uuid, text, text, jsonb, boolean)', 'EXECUTE') then raise exception 'G7 ACL'; end if;
  RAISE EXCEPTION 'OK';
END $t$;
