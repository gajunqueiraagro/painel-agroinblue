-- ABATE-PROJETADO-01c — o abate SO' PROJETADO: o acordado vem do projetado (sai do rascunho), o recebimento lancado pelo modal
-- nasce PREVISTO e a saida o promove a PROGRAMADO; salvar o realizado troca o acordado. Sintetico no cliente Teste, pelas RPCs
-- reais, numa transacao revertida; termina em RAISE 'OK …'. Compara com `is distinct from`.
--   P0 corpos no md5 do destino; a interna da regra fechada (so' service_role)
--   P1 salvar o projetado sem valor liquido: acordado nulo, segue em rascunho
--   P2 salvar o projetado com valor: acordado = soma do projetado, sai do rascunho, conta corrente, a regra diz 'previsto'
--   P3 lancar o recebimento pelo modal: nasce 'previsto' (o retorno e o extrato dizem; conta no programado e nos programados da
--      Central); desfazer simula ok;
--      uma despesa (obrigacao) da OC segue 'programado'
--   P4 registrar a saida: a regra deixa de valer e o MESMO lancamento vira 'programado', mesmo valor (o extrato diz 'programado')
--   P5 salvar o realizado: acordado = realizado; o recebimento segue programado e com o mesmo valor
--   P6 salvar o projetado DEPOIS do realizado nao toca o acordado
--   P7 MODELO TITULO: salvar o projetado com valor fica como sempre — acordado nulo, segue em rascunho, nenhum compromisso
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  v_forn uuid; v_conta uuid; fp jsonb; x jsonb; n int; v_ver int; oa uuid; la uuid; l_rec uuid; l_desp uuid; v_pc_d uuid;
  c_proj jsonb; c_proj0 jsonb; v_comp uuid; cc jsonb; ot uuid; lt uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);

  -- P0
  select count(*) into n from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname, md5(p.prosrc)) in (
    ('oc_salvar_abate', '82d87c697a37734e2df09f3543053448'), ('oc_lancar_pelo_modal', '1cb63f21235778680d1873ebd84d1e60'),
    ('_oc_cc_gancho_entregas', 'c780657e58dd81516cbd23f2e8595256'), ('oc_conta_corrente', '41692a133d12f9bc35bc10d6f8ab822f'),
    ('oc_conta_corrente_lote', 'b431d3de3340e4b0e1a3fc2a3d0ad924'));
  if n is distinct from 5 then raise exception 'P0: % de 5 corpos no destino', n; end if;
  if has_function_privilege('authenticated', 'public._oc_cc_recebimento_previsto(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public._oc_cc_recebimento_previsto(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public._oc_cc_recebimento_previsto(uuid)', 'EXECUTE') then
    raise exception 'P0 ACL da interna'; end if;

  select id into v_forn from financeiro_fornecedores where cliente_id = k and ativo order by created_at limit 1;
  select id into v_conta from financeiro_contas_bancarias where cliente_id = k order by created_at limit 1;
  select id into v_pc_d from financeiro_plano_contas where cliente_id is null and ativo and tipo_operacao = '2-Saídas'
     and subcentro = 'Impostos e Despesas de Abates e Vendas';
  fp := jsonb_build_object('fazenda_id', f, 'contraparte_id', v_forn, 'data_operacao', '2031-04-10', 'tipo_operacao', 'abate');
  x := public.oc_salvar_rascunho(null, k, null, fp); oa := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_lotes(oa, k, (x->>'versao')::int,
         '[{"ordem": 1, "categoria_negociada": "vacas", "qtd_negociada": 18, "peso_medio_negociado_kg": 450, "criterio_valor": "kg"}]');
  select id into la from zoo_operacao_lotes where operacao_id = oa;
  c_proj0 := jsonb_build_object('operacao_lote_id', la, 'peso_carcaca_kg', 4320, 'peso_carcaca_fonte', 'total', 'rendimento_carcaca_pct', 53,
               'preco_arroba', 372.86, 'preco_fonte', 'arroba');
  c_proj := c_proj0 || '{"valor_liquido": 107174.97}';

  -- P1
  select versao into v_ver from zoo_operacoes_comerciais where id = oa;
  x := public.oc_salvar_abate(oa, k, v_ver, 'projetado', jsonb_build_array(c_proj0));
  if (select valor_acordado from zoo_operacoes_comerciais where id = oa) is not null
     or (select rascunho from zoo_operacoes_comerciais where id = oa) is distinct from true then
    raise exception 'P1: sem valor liquido o acordado fica nulo e a OC segue em rascunho'; end if;

  -- P2
  select versao into v_ver from zoo_operacoes_comerciais where id = oa;
  x := public.oc_salvar_abate(oa, k, v_ver, 'projetado', jsonb_build_array(c_proj));
  if (select valor_acordado from zoo_operacoes_comerciais where id = oa) is distinct from 107174.97
     or (select rascunho from zoo_operacoes_comerciais where id = oa) is distinct from false
     or (select modelo_financeiro from zoo_operacoes_comerciais where id = oa) is distinct from 'conta_corrente'
     or (select peso_carcaca_kg_total from zoo_operacoes_comerciais where id = oa) is not null
     or (x->>'versao')::int is distinct from v_ver + 1 or x->'cenarios' is distinct from '["projetado"]'::jsonb
     or public._oc_cc_recebimento_previsto(oa) is distinct from true then
    raise exception 'P2: acordado %, rascunho %, retorno %', (select valor_acordado from zoo_operacoes_comerciais where id = oa),
      (select rascunho from zoo_operacoes_comerciais where id = oa), x; end if;

  -- P3
  select versao into v_ver from zoo_operacoes_comerciais where id = oa;
  x := public.oc_lancar_pelo_modal(oa, v_ver, 'principal', null, null, null,
         jsonb_build_array(jsonb_build_object('valor', 107174.97, 'vencimento', '2031-05-10', 'conta_id', v_conta)), 'PIX', null, null, null, null, false);
  select p.financeiro_lancamento_id into strict l_rec from zoo_operacao_partes p
   where p.operacao_id = oa and p.cancelada is not true and p.natureza = 'principal' and p.componente = 'recebimento';
  if x->>'status_transacao' is distinct from 'previsto'
     or (select status_transacao from financeiro_lancamentos_v2 where id = l_rec) is distinct from 'previsto'
     or (select valor from financeiro_lancamentos_v2 where id = l_rec) is distinct from 107174.97 then
    raise exception 'P3 recebimento: retorno % · status %', x, (select status_transacao from financeiro_lancamentos_v2 where id = l_rec); end if;
  v_comp := (x->>'compromisso_id')::uuid; cc := public.oc_conta_corrente(oa);
  if (select count(*) from jsonb_array_elements(cc->'linhas') e where e->>'tipo' = 'recebimento' and e->>'status' = 'previsto') is distinct from 1::bigint
     or (cc->>'programado')::numeric is distinct from 107174.97 or (cc->>'recebido')::numeric is distinct from 0 then
    raise exception 'P3 extrato: %', cc - 'linhas'; end if;
  if jsonb_array_length(public.oc_conta_corrente_lote(k, array[oa]) -> (oa::text) -> 'programados') is distinct from 1 then
    raise exception 'P3 Central: o previsto fora dos programados'; end if;
  x := public.oc_desfazer_compromisso(oa, (select versao from zoo_operacoes_comerciais where id = oa), v_comp, 'SINT simula', true);
  if (x->>'ok')::boolean is distinct from true then raise exception 'P3 desfazer simulado: %', x; end if;
  select versao into v_ver from zoo_operacoes_comerciais where id = oa;
  x := public.oc_lancar_pelo_modal(oa, v_ver, 'obrigacao', 'frete', v_pc_d, v_forn,
         jsonb_build_array(jsonb_build_object('valor', 500, 'vencimento', '2031-05-10', 'conta_id', v_conta)), 'PIX', null, null, null, null, false);
  select p.financeiro_lancamento_id into strict l_desp from zoo_operacao_partes p
   where p.operacao_id = oa and p.cancelada is not true and p.natureza = 'obrigacao';
  if x->>'status_transacao' is distinct from 'programado'
     or (select status_transacao from financeiro_lancamentos_v2 where id = l_desp) is distinct from 'programado' then
    raise exception 'P3 obrigacao: %', x; end if;

  -- P4
  x := public.oc_registrar_movimentacao(oa, k, la, '2031-04-11', 'vacas', 18, 450, null, 'SINT abate');
  if public._oc_cc_recebimento_previsto(oa) is distinct from false
     or (select status_transacao from financeiro_lancamentos_v2 where id = l_rec) is distinct from 'programado'
     or (select valor from financeiro_lancamentos_v2 where id = l_rec) is distinct from 107174.97
     or (x->'entregas'->>'promovidos')::int is distinct from 1 then
    raise exception 'P4 saida: status %, entregas %', (select status_transacao from financeiro_lancamentos_v2 where id = l_rec), x->'entregas'; end if;
  if (select count(*) from jsonb_array_elements(public.oc_conta_corrente(oa)->'linhas') e
       where e->>'tipo' = 'recebimento' and e->>'status' = 'programado') is distinct from 1::bigint then
    raise exception 'P4 extrato: o recebimento nao virou programado'; end if;

  -- P5
  select versao into v_ver from zoo_operacoes_comerciais where id = oa;
  x := public.oc_salvar_abate(oa, k, v_ver, 'realizado', jsonb_build_array(c_proj0 || '{"valor_liquido": 100000}'));
  if (select valor_acordado from zoo_operacoes_comerciais where id = oa) is distinct from 100000
     or (select peso_carcaca_kg_total from zoo_operacoes_comerciais where id = oa) is distinct from 4320
     or (select status_transacao from financeiro_lancamentos_v2 where id = l_rec) is distinct from 'programado'
     or (select valor from financeiro_lancamentos_v2 where id = l_rec) is distinct from 107174.97 then
    raise exception 'P5 realizado: acordado %', (select valor_acordado from zoo_operacoes_comerciais where id = oa); end if;

  -- P6
  select versao into v_ver from zoo_operacoes_comerciais where id = oa;
  x := public.oc_salvar_abate(oa, k, v_ver, 'projetado', jsonb_build_array(c_proj0 || '{"valor_liquido": 120000}'));
  if (select valor_acordado from zoo_operacoes_comerciais where id = oa) is distinct from 100000 then
    raise exception 'P6: o projetado depois do realizado mexeu no acordado (%)', (select valor_acordado from zoo_operacoes_comerciais where id = oa); end if;

  -- P7
  x := public.oc_salvar_rascunho(null, k, null, fp); ot := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_lotes(ot, k, (x->>'versao')::int,
         '[{"ordem": 1, "categoria_negociada": "vacas", "qtd_negociada": 18, "peso_medio_negociado_kg": 450, "criterio_valor": "kg"}]');
  select id into lt from zoo_operacao_lotes where operacao_id = ot;
  update zoo_operacoes_comerciais set modelo_financeiro = 'titulo' where id = ot;
  select versao into v_ver from zoo_operacoes_comerciais where id = ot;
  x := public.oc_salvar_abate(ot, k, v_ver, 'projetado', jsonb_build_array(c_proj || jsonb_build_object('operacao_lote_id', lt)));
  if (select valor_acordado from zoo_operacoes_comerciais where id = ot) is not null
     or (select rascunho from zoo_operacoes_comerciais where id = ot) is distinct from true
     or exists (select 1 from zoo_operacao_compromissos where operacao_id = ot)
     or public._oc_cc_recebimento_previsto(ot) is distinct from false then
    raise exception 'P7 titulo: acordado %, rascunho %', (select valor_acordado from zoo_operacoes_comerciais where id = ot),
      (select rascunho from zoo_operacoes_comerciais where id = ot); end if;

  raise exception 'OK ABATE-PROJETADO-01c: P0-P7';
end $teste$;
ROLLBACK;
