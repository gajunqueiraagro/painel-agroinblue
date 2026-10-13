-- OC-CC-MODAL-FINANCEIRO-01 — a OC em conta corrente lanca pelo modal do Financeiro (`oc_lancar_pelo_modal`) e desfaz num gesto
-- atomico (`oc_desfazer_compromisso`). Sintetico no cliente Teste (OCs construidas pelas RPCs reais), numa transacao revertida;
-- termina em RAISE 'OK …'. Compara com `is distinct from`, nunca `<>`.
--   L0 os donos encadeados nao mudaram (md5) e a ACL das duas novas (anon nao, authenticated sim, SECURITY DEFINER)
--   L1 (a) principal em 2 parcelas: simulacao nao grava; gravacao = 2 lancamentos PROGRAMADOS ligados a' OC por parte viva de
--      'recebimento', com forma / dados de pagamento / documento / observacao gravados, FORA do DRE; DRE da OC inalterado
--   L2 (c) acima da base: recusa do dono, nada gravado
--   L3 acima do SALDO (base − recebido − programado): aviso `acima_do_saldo` com o excesso, grava
--   L4 (b) despesa: compromisso + parcela + lancamento numa chamada, NO DRE pela linha do plano; plano de outro id e item vazio recusam
--   L5 (d) desfazer o principal de 2 parcelas: 2 estornos, programacao e compromisso cancelados, UM estorno_id nos 4 eventos, e a
--      conta corrente volta a ser a de antes (md5); a simulacao do desfazer nao grava; despesa idem
--   L6 atomicidade: a 2a parcela realizada faz o dono recusar -> NADA desfeito (a 1a segue viva)
--   L7 fora da conta corrente recusa; sem usuario 42501
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_jwt constant text := json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text;
  c_lote constant jsonb := '[{"ordem": 1, "categoria_negociada": "desmama_m", "qtd_negociada": 10, "peso_medio_negociado_kg": 200, "criterio_valor": "total", "valor_informado": 10000}]';
  v_forn uuid; v_conta uuid; v_pc_desp uuid; v_pc_venda uuid; fp jsonb; x jsonb; s jsonb; cc jsonb; t text; st text; n int; v_ver int;
  ov uuid; lv uuid; o2 uuid; l2 uuid; o3 uuid; l3 uuid; oa uuid; l_rec uuid; v_comp uuid; v_t1 uuid; v_t2 uuid;
  v_dre0 numeric; v_dre numeric; v_m0 text; p2 jsonb;
begin
  perform set_config('request.jwt.claims', c_jwt, true);
  select id into v_forn from financeiro_fornecedores where cliente_id = k and ativo order by created_at limit 1;
  select id into v_conta from financeiro_contas_bancarias where cliente_id = k order by created_at limit 1;
  select id into v_pc_desp from financeiro_plano_contas where cliente_id is null and ativo and tipo_operacao = '2-Saídas' and subcentro = 'Impostos e Despesas de Abates e Vendas';
  select id into v_pc_venda from financeiro_plano_contas where cliente_id is null and ativo and tipo_operacao = '1-Entradas' and subcentro = 'Venda de Desmama Machos';
  fp := jsonb_build_object('fazenda_id', f, 'contraparte_id', v_forn, 'data_operacao', '2031-03-10');
  p2 := jsonb_build_array(jsonb_build_object('valor', 4000, 'vencimento', '2031-04-10', 'conta_id', v_conta),
                          jsonb_build_object('valor', 6000, 'vencimento', '2031-05-10', 'conta_id', v_conta));

  -- L0
  select count(*) into n from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname, md5(p.prosrc)) in (
    ('oc_criar_compromisso', 'a2509aa677198acd542588638e54b535'), ('oc_programar_compromisso', 'b9ff64062f559309d664fdf2bfecf289'),
    ('oc_materializar_programacao', '9478957cd385c005ce4c66d45c43c031'), ('oc_estornar_materializacao', '4c278e56ca80a0aa2ab9ff26e7f18c83'),
    ('oc_cancelar_programacao', '45bfcd3718cc52065ce3bd3baee27ab0'), ('oc_cancelar_compromisso', '3194de1ea117d19ae4344c4858d80f50'),
    ('oc_conta_corrente', '6cae1d831171a7b8a9507d011f11f837'));
  if n is distinct from 7 then raise exception 'L0: um dono encadeado mudou de corpo (% de 7 no md5 esperado)', n; end if;
  select count(*) into n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('oc_lancar_pelo_modal', 'oc_desfazer_compromisso')
     and p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE') and not has_function_privilege('anon', p.oid, 'EXECUTE');
  if n is distinct from 2 then raise exception 'L0 ACL: % de 2', n; end if;

  -- a venda em conta corrente, fora de rascunho, lote de 10.000,00, com a saida do gado (entrega no DRE)
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "venda"}'); ov := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_lotes(ov, k, (x->>'versao')::int, c_lote);
  select id into lv from zoo_operacao_lotes where operacao_id = ov;
  perform public.oc_registrar_movimentacao(ov, k, lv, '2031-03-11', 'desmama_m', 10, 200, null, 'SINT saida');
  select sum(case when l.tipo_operacao like '1-%' then l.valor else -l.valor end) filter (where l.compoe_dre) into v_dre0
    from zoo_operacao_partes p join financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id and l.cancelado is not true
   where p.operacao_id = ov and p.cancelada = false;
  if v_dre0 is distinct from 10000 or (select modelo_financeiro from zoo_operacoes_comerciais where id = ov) is distinct from 'conta_corrente' then
    raise exception 'preparo: venda em conta corrente com a entrega de 10.000 no DRE (DRE %)', v_dre0; end if;

  -- L1 (a) principal em 2 parcelas
  select versao into v_ver from zoo_operacoes_comerciais where id = ov;
  s := public.oc_lancar_pelo_modal(ov, 999, 'principal', null, null, null, p2, 'PIX', 'chave 123', '000.000.123', 'obs do modal', null, true);
  if (s->>'ok')::boolean is distinct from true or (s->>'simulado')::boolean is distinct from true or jsonb_array_length(s->'parcelas') is distinct from 2
     or (select versao from zoo_operacoes_comerciais where id = ov) is distinct from v_ver
     or exists (select 1 from zoo_operacao_compromissos where operacao_id = ov) then
    raise exception 'L1 simulacao: % (a simulacao nao pode gravar)', s; end if;
  -- a simulacao diz a classificacao do principal (a conta da OC): e' dela que o modal le^ o campo travado
  if s->'classificacao'->>'subcentro' is distinct from public._oc_cc_conta_principal(ov)
     or (s->'classificacao'->>'plano_conta_id')::uuid is distinct from v_pc_venda then
    raise exception 'L1 classificacao: % (esperada a conta da OC, %)', s->'classificacao', public._oc_cc_conta_principal(ov); end if;
  x := public.oc_lancar_pelo_modal(ov, v_ver, 'principal', null, null, null, p2, 'PIX', 'chave 123', '000.000.123', 'obs do modal', null, false);
  v_comp := (x->>'compromisso_id')::uuid;
  select count(*) into n from zoo_operacao_partes p join financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id
   where p.operacao_id = ov and p.cancelada = false and p.natureza = 'principal' and p.componente = 'recebimento' and p.origem = 'programacao'
     and p.programacao_parcela_id is not null and l.cancelado is not true and l.status_transacao = 'programado' and l.data_pagamento is null
     and l.tipo_operacao = '1-Entradas' and l.subcentro = 'Venda de Desmama Machos' and l.favorecido_id = v_forn and l.fazenda_id = f
     and l.forma_pagamento = 'PIX' and l.dados_pagamento = to_jsonb('chave 123'::text) and l.numero_documento = '000.000.123'
     and l.observacao = 'obs do modal' and l.compoe_dre is false and l.origem_lancamento = 'operacao_comercial'
     and (l.valor, l.data_vencimento) in ((4000::numeric, date '2031-04-10'), (6000::numeric, date '2031-05-10'));
  if n is distinct from 2 then raise exception 'L1 lancamentos: % (esperados 2 programados, de recebimento, com os campos extras, fora do DRE) · %', n,
    (select jsonb_agg(jsonb_build_object('v', l.valor, 'st', l.status_transacao, 'dre', l.compoe_dre, 'forma', l.forma_pagamento, 'doc', l.numero_documento, 'obs', l.observacao, 'dp', l.dados_pagamento, 'sub', l.subcentro))
       from zoo_operacao_partes p join financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id where p.operacao_id = ov and p.componente = 'recebimento'); end if;
  select sum(case when l.tipo_operacao like '1-%' then l.valor else -l.valor end) filter (where l.compoe_dre) into v_dre
    from zoo_operacao_partes p join financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id and l.cancelado is not true
   where p.operacao_id = ov and p.cancelada = false;
  cc := public.oc_conta_corrente(ov);
  if v_dre is distinct from v_dre0 or (cc->>'programado')::numeric is distinct from 10000 or jsonb_array_length(x->'avisos') is distinct from 0
     or (x->>'operacao_versao')::int is distinct from (select versao from zoo_operacoes_comerciais where id = ov)
     or jsonb_array_length(x->'parcelas') is distinct from 2
     or (select status from zoo_operacao_compromissos where id = v_comp) is distinct from 'programado'
     or (select count(*) from zoo_operacao_parcelas_programacao pp join zoo_operacao_programacoes pr on pr.id = pp.programacao_id
          where pr.compromisso_id = v_comp and pp.status = 'materializada') is distinct from 2 then
    raise exception 'L1: DRE % (era %) · programado % · avisos % · versao % · %', v_dre, v_dre0, cc->>'programado', x->'avisos', x->>'operacao_versao', x; end if;

  -- L2 (c) acima da base: o dono recusa e nada nasce
  t := null; st := null;
  begin perform public.oc_lancar_pelo_modal(ov, (select versao from zoo_operacoes_comerciais where id = ov), 'principal', null, null, null,
          jsonb_build_array(jsonb_build_object('valor', 0.01, 'vencimento', '2031-06-10')), null, null, null, null, null, false);
  exception when others then get stacked diagnostics st = returned_sqlstate, t = message_text; end;
  if st is distinct from 'P0001' or t not like 'Soma dos compromissos principais excede a base da operacao%'
     or (select count(*) from zoo_operacao_compromissos where operacao_id = ov) is distinct from 1 then
    raise exception 'L2 acima da base: % %', st, t; end if;

  -- L3 acima do SALDO: 7.000 ja' recebidos por vinculo + 5.000 programados numa base de 10.000 -> aviso de 2.000, e grava
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "venda"}'); o2 := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_lotes(o2, k, (x->>'versao')::int, c_lote);
  select id into l2 from zoo_operacao_lotes where operacao_id = o2;
  perform public.oc_registrar_movimentacao(o2, k, l2, '2031-03-11', 'desmama_m', 10, 200, null, 'SINT saida');
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, valor, sinal, tipo_operacao, data_competencia, data_pagamento, data_vencimento,
    ano_mes, favorecido_id, conta_destino_id, origem_lancamento, status_transacao, cenario, sem_movimentacao_caixa, subcentro, plano_conta_id, descricao)
  values (k, f, 7000, '1', '1-Entradas', '2031-03-20', '2031-03-20', '2031-03-20', '2031-03', v_forn, v_conta, 'manual', 'realizado', 'realizado',
    false, 'Venda de Desmama Machos', v_pc_venda, 'SINT recebimento ja pago')
  returning id into l_rec;
  perform public.oc_vincular_lancamento(o2, (select versao from zoo_operacoes_comerciais where id = o2), l_rec, null, 'teste', null, null, false, false);
  x := public.oc_lancar_pelo_modal(o2, (select versao from zoo_operacoes_comerciais where id = o2), 'principal', null, null, null,
         jsonb_build_array(jsonb_build_object('valor', 5000, 'vencimento', '2031-06-10', 'conta_id', v_conta)), null, null, null, null, null, false);
  if (x->'avisos'->0->>'codigo') is distinct from 'acima_do_saldo' or (x->'avisos'->0->>'excesso')::numeric is distinct from 2000
     or (x->'avisos'->0->>'base')::numeric is distinct from 10000 or (x->>'ok')::boolean is distinct from true
     or (select count(*) from zoo_operacao_compromissos where operacao_id = o2 and status = 'programado') is distinct from 1 then
    raise exception 'L3 acima do saldo: %', x; end if;

  -- L4 (b) despesa: uma chamada -> compromisso + parcela + lancamento, NO DRE pela linha do plano
  x := public.oc_lancar_pelo_modal(ov, (select versao from zoo_operacoes_comerciais where id = ov), 'obrigacao', 'frete', v_pc_desp, v_forn,
         jsonb_build_array(jsonb_build_object('valor', 300, 'vencimento', '2031-04-15', 'conta_id', v_conta)), 'Boleto', null, '000.000.456', null, 'SINT frete', false);
  select count(*) into n from zoo_operacao_partes p join financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id
    join zoo_operacao_parcelas_programacao pp on pp.id = p.programacao_parcela_id join zoo_operacao_programacoes pr on pr.id = pp.programacao_id
    join zoo_operacao_compromissos c on c.id = pr.compromisso_id
   where p.operacao_id = ov and p.cancelada = false and p.natureza = 'obrigacao' and p.componente = 'frete' and c.id = (x->>'compromisso_id')::uuid
     and c.status = 'programado' and c.plano_conta_id = v_pc_desp and pp.status = 'materializada' and l.plano_conta_id = v_pc_desp
     and l.tipo_operacao = '2-Saídas' and l.valor = 300 and l.status_transacao = 'programado' and l.compoe_dre is true and l.cancelado is not true
     and l.forma_pagamento = 'Boleto' and l.numero_documento = '000.000.456' and l.descricao = 'SINT frete' and l.favorecido_id = v_forn;
  select sum(case when l.tipo_operacao like '1-%' then l.valor else -l.valor end) filter (where l.compoe_dre) into v_dre
    from zoo_operacao_partes p join financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id and l.cancelado is not true
   where p.operacao_id = ov and p.cancelada = false;
  if n is distinct from 1 or v_dre is distinct from v_dre0 - 300
     or not exists (select 1 from financeiro_plano_contas pc where pc.id = v_pc_desp and pc.bloco_dre is not null and pc.escopo_negocio = 'pecuaria') then
    raise exception 'L4 despesa: % lancamento(s) · DRE % (esperado %) · %', n, v_dre, v_dre0 - 300, x; end if;
  t := null;
  begin perform public.oc_lancar_pelo_modal(ov, (select versao from zoo_operacoes_comerciais where id = ov), 'obrigacao', 'frete', gen_random_uuid(), v_forn,
          jsonb_build_array(jsonb_build_object('valor', 10, 'vencimento', '2031-04-15')), null, null, null, null, null, false);
  exception when sqlstate 'P0001' then t := sqlerrm; end;
  if t is distinct from 'Classificacao nao encontrada no plano de contas deste cliente' then raise exception 'L4 plano de outro id: %', t; end if;
  t := null;
  begin perform public.oc_lancar_pelo_modal(ov, (select versao from zoo_operacoes_comerciais where id = ov), 'obrigacao', null, v_pc_desp, v_forn,
          jsonb_build_array(jsonb_build_object('valor', 10, 'vencimento', '2031-04-15')), null, null, null, null, null, false);
  exception when sqlstate 'P0001' then t := sqlerrm; end;
  if t is null or t not like 'Informe o item da operacao%' then raise exception 'L4 sem item: %', t; end if;

  -- L5 (d) desfazer: principal de 2 parcelas e despesa; a conta corrente volta a ser a de antes
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "venda"}'); o3 := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_lotes(o3, k, (x->>'versao')::int, c_lote);
  select id into l3 from zoo_operacao_lotes where operacao_id = o3;
  perform public.oc_registrar_movimentacao(o3, k, l3, '2031-03-11', 'desmama_m', 10, 200, null, 'SINT saida');
  v_m0 := md5((public.oc_conta_corrente(o3) - 'versao')::text);
  x := public.oc_lancar_pelo_modal(o3, (select versao from zoo_operacoes_comerciais where id = o3), 'principal', null, null, null, p2, null, null, null, null, null, false);
  v_comp := (x->>'compromisso_id')::uuid;
  if md5((public.oc_conta_corrente(o3) - 'versao')::text) is not distinct from v_m0 then raise exception 'L5: a conta corrente deveria ter mudado com o programado'; end if;
  select versao into v_ver from zoo_operacoes_comerciais where id = o3;
  s := public.oc_desfazer_compromisso(o3, 999, v_comp, 'teste', true);
  if (s->>'simulado')::boolean is distinct from true or jsonb_array_length(s->'titulos_estornados') is distinct from 2
     or (select versao from zoo_operacoes_comerciais where id = o3) is distinct from v_ver
     or (select status from zoo_operacao_compromissos where id = v_comp) is distinct from 'programado' then
    raise exception 'L5 simulacao do desfazer: %', s; end if;
  x := public.oc_desfazer_compromisso(o3, v_ver, v_comp, 'desistiu do parcelamento', false);
  if jsonb_array_length(x->'titulos_estornados') is distinct from 2 or (x->>'programacoes_canceladas')::int is distinct from 1
     or (select status from zoo_operacao_compromissos where id = v_comp) is distinct from 'cancelado'
     or exists (select 1 from zoo_operacao_programacoes pr where pr.compromisso_id = v_comp and pr.status <> 'cancelada')
     or (select count(*) from zoo_operacao_partes p join financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id
          where p.operacao_id = o3 and p.componente = 'recebimento' and p.cancelada and l.cancelado and l.cancelado_motivo = 'desistiu do parcelamento') is distinct from 2
     or (select count(*) from zoo_operacao_eventos e where e.operacao_id = o3 and e.detalhes->>'estorno_id' = x->>'estorno_id'
            and e.acao in ('estornar_materializacao', 'cancelar_programacao', 'cancelar_compromisso')) is distinct from 4
     or (x->>'operacao_versao')::int is distinct from (select versao from zoo_operacoes_comerciais where id = o3)
     or md5((public.oc_conta_corrente(o3) - 'versao')::text) is distinct from v_m0 then
    raise exception 'L5 desfazer o principal: % · cc igual? %', x, md5((public.oc_conta_corrente(o3) - 'versao')::text) = v_m0; end if;
  x := public.oc_lancar_pelo_modal(o3, (select versao from zoo_operacoes_comerciais where id = o3), 'obrigacao', 'comissao', v_pc_desp, v_forn,
         jsonb_build_array(jsonb_build_object('valor', 100, 'vencimento', '2031-04-15'), jsonb_build_object('valor', 150, 'vencimento', '2031-05-15')),
         null, null, null, null, 'SINT comissao', false);
  x := public.oc_desfazer_compromisso(o3, (select versao from zoo_operacoes_comerciais where id = o3), (x->>'compromisso_id')::uuid, 'despesa errada', false);
  if jsonb_array_length(x->'titulos_estornados') is distinct from 2 or md5((public.oc_conta_corrente(o3) - 'versao')::text) is distinct from v_m0
     or exists (select 1 from zoo_operacao_partes p where p.operacao_id = o3 and p.natureza = 'obrigacao' and p.cancelada = false) then
    raise exception 'L5 desfazer a despesa: %', x; end if;

  -- L6 atomicidade: a 2a parcela foi PAGA -> o dono recusa o estorno dela -> nada e' desfeito, nem a 1a
  x := public.oc_lancar_pelo_modal(o3, (select versao from zoo_operacoes_comerciais where id = o3), 'principal', null, null, null, p2, null, null, null, null, null, false);
  v_comp := (x->>'compromisso_id')::uuid;
  v_t1 := (x->'parcelas'->0->>'titulo_id')::uuid; v_t2 := (x->'parcelas'->1->>'titulo_id')::uuid;
  update financeiro_lancamentos_v2 set status_transacao = 'realizado', data_pagamento = '2031-05-10' where id = v_t2;
  t := null;
  begin perform public.oc_desfazer_compromisso(o3, (select versao from zoo_operacoes_comerciais where id = o3), v_comp, 'tentativa', false);
  exception when sqlstate 'P0001' then t := sqlerrm; end;
  if t is distinct from 'Estorne a liquidacao ou conciliacao financeira antes de estornar esta materializacao.'
     or (select cancelado from financeiro_lancamentos_v2 where id = v_t1) is not distinct from true
     or (select status from zoo_operacao_compromissos where id = v_comp) is distinct from 'programado'
     or (select count(*) from zoo_operacao_partes p where p.operacao_id = o3 and p.componente = 'recebimento' and p.cancelada = false) is distinct from 2
     or exists (select 1 from zoo_operacao_eventos e where e.operacao_id = o3 and e.detalhes->>'motivo' = 'tentativa') then
    raise exception 'L6 atomicidade: recusa "%" · 1a cancelada? % · compromisso %', t,
      (select cancelado from financeiro_lancamentos_v2 where id = v_t1), (select status from zoo_operacao_compromissos where id = v_comp); end if;

  -- L7 fora da conta corrente recusa; sem usuario 42501
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "abate"}'); oa := (x->>'operacao_id')::uuid;
  t := null;
  begin perform public.oc_lancar_pelo_modal(oa, (x->>'versao')::int, 'principal', null, null, null, p2, null, null, null, null, null, false);
  exception when sqlstate 'P0001' then t := sqlerrm; end;
  if t is distinct from 'Lancar pelo modal so existe na operacao em conta corrente' then raise exception 'L7 fora da conta corrente: %', t; end if;
  perform set_config('request.jwt.claims', '', true);
  t := null; st := null;
  begin perform public.oc_lancar_pelo_modal(o2, (select versao from zoo_operacoes_comerciais where id = o2), 'obrigacao', 'frete', v_pc_desp, v_forn,
          jsonb_build_array(jsonb_build_object('valor', 10, 'vencimento', '2031-04-15')), null, null, null, null, null, false);
  exception when others then get stacked diagnostics st = returned_sqlstate, t = message_text; end;
  if st is distinct from '42501' then raise exception 'L7 sem usuario (lancar): % %', st, t; end if;
  t := null; st := null;
  begin perform public.oc_desfazer_compromisso(o3, (select versao from zoo_operacoes_comerciais where id = o3), v_comp, 'sem usuario', false);
  exception when others then get stacked diagnostics st = returned_sqlstate, t = message_text; end;
  if st is distinct from '42501' then raise exception 'L7 sem usuario (desfazer): % %', st, t; end if;
  perform set_config('request.jwt.claims', c_jwt, true);

  raise exception 'OK oc_cc_modal_financeiro_01 (L0-L7)';
end $teste$;
ROLLBACK;
