-- OC-CC-ABATE-01 PR 3 — o abate nasce em conta corrente; o abate em titulo migra pela RPC de sempre.
-- Sintetico no cliente Teste (OCs construidas pelas RPCs reais), numa transacao revertida; termina em RAISE 'OK …'.
-- Compara com `is distinct from`, nunca `<>`. Nenhuma OC real e' usada de molde.
--   N1 abate novo por `oc_salvar_rascunho` nasce 'conta_corrente', com o evento 'definir_modelo_financeiro' (de nulo para o valor)
--   N2 venda e compra novas iguais a antes ('conta_corrente'); boitel e tipo desconhecido 'titulo' (o D2 do 01a); o dono fechado
--   N3 abate em titulo (forcado SO' AQUI) com lote, realizado (Funrural em R$ > 0), saida registrada e 1 recebimento pago:
--      `oc_migrar_para_conta_corrente(id, false)` -> modelo cc; entrega = BRUTO, linha 'deducao' funrural, `deduzido` = Funrural,
--      recebimento, saldo = recebido − (bruto − Funrural) = 0; DRE da OC antes = depois (`dre_bate`: o bruto entra e a deducao sai)
--   N4 abate em titulo com Funrural em % -> recusa com a frase do PR 1, nada muda
--   N5 abate em titulo sem saida -> "Registre a saida dos animais antes de migrar"
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_cta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  c_5030 constant text := 'Impostos e Despesas de Abates e Vendas';
  v_forn uuid; v_pc_f uuid; fp jsonb; x jsonb; cc jsonb; rel jsonb; t text; v_ver int; v_ok text := '';
  oa uuid; la uuid; ob uuid; lb uuid; od uuid; ld uuid; ov uuid; ocp uuid; q record;
  v_comp uuid; v_prog uuid; v_parc uuid; v_l uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);
  select id into v_forn from financeiro_fornecedores where cliente_id = k and ativo order by created_at limit 1;
  select id into v_pc_f from financeiro_plano_contas where cliente_id is null and ativo and subcentro = 'Abates de Fêmeas' and tipo_operacao = '1-Entradas';
  fp := jsonb_build_object('fazenda_id', f, 'contraparte_id', v_forn, 'data_operacao', '2031-04-10');

  -- N1 abate novo nasce em conta corrente, com o evento
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "abate"}'); oa := (x->>'operacao_id')::uuid;
  select o.modelo_financeiro m, o.versao v,
         (select count(*) from zoo_operacao_eventos e where e.operacao_id = o.id and e.acao = 'definir_modelo_financeiro') n,
         (select e.dados_novos->>'modelo_financeiro' from zoo_operacao_eventos e where e.operacao_id = o.id and e.acao = 'definir_modelo_financeiro') para,
         (select e.dados_anteriores->'modelo_financeiro' from zoo_operacao_eventos e where e.operacao_id = o.id and e.acao = 'definir_modelo_financeiro') de
    into q from zoo_operacoes_comerciais o where o.id = oa;
  if q.m is distinct from 'conta_corrente' or q.n is distinct from 1 or q.para is distinct from 'conta_corrente'
     or q.de is distinct from 'null'::jsonb or q.v is distinct from (x->>'versao')::int then
    raise exception 'N1 abate: modelo % · eventos % · para % · de % · versao % x %', q.m, q.n, q.para, q.de, q.v, x->>'versao'; end if;
  v_ok := v_ok || 'N1 ok; ';

  -- N2 venda e compra como antes; boitel e desconhecido em titulo; o dono fechado
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "venda"}'); ov := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "compra"}'); ocp := (x->>'operacao_id')::uuid;
  if (select modelo_financeiro from zoo_operacoes_comerciais where id = ov) is distinct from 'conta_corrente'
     or (select modelo_financeiro from zoo_operacoes_comerciais where id = ocp) is distinct from 'conta_corrente' then
    raise exception 'N2 venda/compra deixaram de nascer em conta corrente'; end if;
  if public._oc_modelo_ao_nascer('venda', false) is distinct from 'conta_corrente'
     or public._oc_modelo_ao_nascer('compra', false) is distinct from 'conta_corrente'
     or public._oc_modelo_ao_nascer('abate', false) is distinct from 'conta_corrente'
     or public._oc_modelo_ao_nascer('venda', true) is distinct from 'titulo'
     or public._oc_modelo_ao_nascer('abate', true) is distinct from 'titulo'
     or public._oc_modelo_ao_nascer('outro', false) is distinct from 'titulo'
     or public._oc_modelo_ao_nascer(null, null) is distinct from 'titulo' then raise exception 'N2 dono: tabela errada'; end if;
  if (select md5(prosrc) from pg_proc where oid = 'public._oc_modelo_ao_nascer(text, boolean)'::regprocedure)
       is distinct from 'd4bbf3204ddc9f8e8911e2d2c1578e11' then raise exception 'N2 dono fora do md5 de destino'; end if;
  if has_function_privilege('authenticated', 'public._oc_modelo_ao_nascer(text, boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public._oc_modelo_ao_nascer(text, boolean)', 'EXECUTE') then raise exception 'N2 dono aberto'; end if;
  v_ok := v_ok || 'N2 ok; ';

  -- N3 o abate de oa vai para titulo (forcado SO' AQUI, antes de qualquer financeiro), com lote, realizado e saida
  update zoo_operacoes_comerciais set modelo_financeiro = 'titulo' where id = oa;
  select versao into v_ver from zoo_operacoes_comerciais where id = oa;
  x := public.oc_salvar_lotes(oa, k, v_ver,
         '[{"ordem": 1, "categoria_negociada": "vacas", "qtd_negociada": 18, "peso_medio_negociado_kg": 450, "criterio_valor": "kg"}]');
  select id into la from zoo_operacao_lotes where operacao_id = oa;
  select versao into v_ver from zoo_operacoes_comerciais where id = oa;
  x := public.oc_salvar_abate(oa, k, v_ver, 'realizado', jsonb_build_array(jsonb_build_object(
         'operacao_lote_id', la, 'peso_carcaca_kg', 4320, 'peso_carcaca_fonte', 'total', 'rendimento_carcaca_pct', 53, 'preco_arroba', 372.86,
         'preco_fonte', 'arroba', 'funrural_valor', 209.77, 'funrural_fonte', 'reais', 'valor_liquido', 107174.97)));
  x := public.oc_registrar_movimentacao(oa, k, la, '2031-04-11', 'vacas', 18, 450, null, 'SINT abate N3');
  if (select modelo_financeiro from zoo_operacoes_comerciais where id = oa) is distinct from 'titulo'
     or exists (select 1 from zoo_operacao_partes p where p.operacao_id = oa and p.cancelada = false) then
    raise exception 'N3 preparo: em titulo a saida nao gera parte (% partes)',
      (select count(*) from zoo_operacao_partes p where p.operacao_id = oa and p.cancelada = false); end if;
  -- o recebimento do titulo: compromisso -> programacao -> parcela materializada -> lancamento pago -> parte principal
  insert into zoo_operacao_compromissos (cliente_id, operacao_id, natureza, componente, plano_conta_id, subcentro, valor_total, descricao, status)
  values (k, oa, 'principal', 'principal', v_pc_f, 'Abates de Fêmeas', 107174.97, 'SINT principal N3', 'programado') returning id into v_comp;
  insert into zoo_operacao_programacoes (cliente_id, compromisso_id, status) values (k, v_comp, 'ativa') returning id into v_prog;
  insert into zoo_operacao_parcelas_programacao (cliente_id, programacao_id, sequencia, valor, vencimento, status)
  values (k, v_prog, 1, 107174.97, '2031-04-20', 'materializada') returning id into v_parc;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_destino_id, data_competencia, data_vencimento, data_pagamento, valor, sinal,
      tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento)
  values (k, f, c_cta, '2031-04-11', '2031-04-20', '2031-04-20', 107174.97, '1', '1-Entradas', 'realizado', 'SINT titulo N3', v_pc_f,
      'Abates de Fêmeas', 'realizado', 'operacao_comercial') returning id into v_l;
  insert into zoo_operacao_partes (cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas, valor,
      data_vencimento, descricao, plano_conta_id, subcentro, financeiro_lancamento_id, programacao_parcela_id)
  values (k, oa, 'programacao', 'principal', 'principal', 1, 1, 107174.97, '2031-04-20', 'SINT principal N3 1', v_pc_f, 'Abates de Fêmeas', v_l, v_parc);

  rel := public.oc_migrar_para_conta_corrente(oa, false);
  cc := public.oc_conta_corrente(oa);
  if (select modelo_financeiro from zoo_operacoes_comerciais where id = oa) is distinct from 'conta_corrente' then
    raise exception 'N3 modelo: %', (select modelo_financeiro from zoo_operacoes_comerciais where id = oa); end if;
  if (cc->>'entregue')::numeric is distinct from 107384.74 or (cc->>'deduzido')::numeric is distinct from 209.77
     or (cc->>'recebido')::numeric is distinct from 107174.97 or (cc->>'saldo')::numeric is distinct from 0
     or cc->>'situacao' is distinct from 'quitado'
     or (select count(*) from jsonb_array_elements(cc->'linhas') l where l->>'tipo' = 'deducao' and l->>'subtipo' = 'funrural'
           and (l->>'mov_entrega')::numeric = 209.77 and l->>'conta' = c_5030) is distinct from 1::bigint
     or (select count(*) from jsonb_array_elements(cc->'linhas') l where l->>'tipo' = 'recebimento') is distinct from 1::bigint
     or (select count(*) from jsonb_array_elements(cc->'linhas') l where l->>'tipo' = 'entrega'
           and (l->>'mov_entrega')::numeric = -107384.74) is distinct from 1::bigint then
    raise exception 'N3 conta corrente: %', cc - 'linhas'; end if;
  if (rel->>'dre_bate')::boolean is distinct from true or (rel->>'dre_diferenca')::numeric is distinct from 0
     or (rel#>>'{antes,dre}')::numeric is distinct from 107174.97 or (rel#>>'{depois,dre}')::numeric is distinct from 107174.97
     or (rel#>>'{depois,deducoes}')::numeric is distinct from 209.77 or (rel#>>'{depois,entregas}')::numeric is distinct from 107384.74 then
    raise exception 'N3 relatorio: %', rel; end if;
  v_ok := v_ok || 'N3 ok; ';

  -- N4 Funrural em %: o PR 1 recusa, e a migracao nao muda nada
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "abate"}'); ob := (x->>'operacao_id')::uuid;
  update zoo_operacoes_comerciais set modelo_financeiro = 'titulo' where id = ob;
  select versao into v_ver from zoo_operacoes_comerciais where id = ob;
  x := public.oc_salvar_lotes(ob, k, v_ver,
         '[{"ordem": 1, "categoria_negociada": "vacas", "qtd_negociada": 10, "peso_medio_negociado_kg": 450, "criterio_valor": "kg"}]');
  select id into lb from zoo_operacao_lotes where operacao_id = ob;
  select versao into v_ver from zoo_operacoes_comerciais where id = ob;
  x := public.oc_salvar_abate(ob, k, v_ver, 'realizado', jsonb_build_array(jsonb_build_object(
         'operacao_lote_id', lb, 'peso_carcaca_kg', 2400, 'peso_carcaca_fonte', 'total', 'rendimento_carcaca_pct', 53, 'preco_arroba', 372.86,
         'preco_fonte', 'arroba', 'funrural_valor', 100, 'funrural_fonte', 'reais', 'valor_liquido', 59000)));
  x := public.oc_registrar_movimentacao(ob, k, lb, '2031-04-11', 'vacas', 10, 450, null, 'SINT abate N4');
  update zoo_operacao_abate set funrural_fonte = 'pct' where operacao_lote_id = lb and cenario = 'realizado';
  t := null;
  begin perform public.oc_migrar_para_conta_corrente(ob, true);
  exception when sqlstate 'P0001' then t := sqlerrm; end;
  if t is null or t not like '%informe o Funrural em R$%' then raise exception 'N4 Funrural em %% deveria ser recusado: %', t; end if;
  if (select modelo_financeiro from zoo_operacoes_comerciais where id = ob) is distinct from 'titulo' then raise exception 'N4 o modelo mudou'; end if;
  v_ok := v_ok || 'N4 ok; ';

  -- N5 sem saida
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "abate"}'); od := (x->>'operacao_id')::uuid;
  update zoo_operacoes_comerciais set modelo_financeiro = 'titulo' where id = od;
  select versao into v_ver from zoo_operacoes_comerciais where id = od;
  x := public.oc_salvar_lotes(od, k, v_ver,
         '[{"ordem": 1, "categoria_negociada": "bois", "qtd_negociada": 5, "peso_medio_negociado_kg": 500, "criterio_valor": "kg"}]');
  select id into ld from zoo_operacao_lotes where operacao_id = od;
  select versao into v_ver from zoo_operacoes_comerciais where id = od;
  x := public.oc_salvar_abate(od, k, v_ver, 'realizado', jsonb_build_array(jsonb_build_object(
         'operacao_lote_id', ld, 'peso_carcaca_kg', 1400, 'peso_carcaca_fonte', 'total', 'rendimento_carcaca_pct', 56, 'preco_arroba', 372.86,
         'preco_fonte', 'arroba', 'funrural_valor', 50, 'funrural_fonte', 'reais', 'valor_liquido', 34000)));
  t := null;
  begin perform public.oc_migrar_para_conta_corrente(od, true);
  exception when sqlstate 'P0001' then t := sqlerrm; end;
  if t is distinct from 'Registre a saida dos animais antes de migrar' then raise exception 'N5 sem saida: %', t; end if;
  v_ok := v_ok || 'N5 ok';

  raise exception 'OK oc_cc_abate_01_pr3 (%)', v_ok;
end $teste$;
ROLLBACK;
