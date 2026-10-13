-- OC-CC-ABATE-01 PR 1 — o abate no modelo conta corrente: entrega pelo BRUTO, Funrural como deducao filha, saldo fecha no liquido.
-- Sintetico no cliente Teste (OCs construidas pelas RPCs reais), numa transacao revertida; termina em RAISE 'OK …'.
-- Compara com `is distinct from`, nunca `<>`. O modelo e' levado a 'conta_corrente' por UPDATE direto SO' AQUI (o nascimento nao muda neste PR).
--   B1 helpers: direcao / verbo / conta da entrega para abate; _oc_subcentro_abate nas 13 categorias e NULL fora; venda e compra iguais
--   B2 _oc_cc_valor_entrega_do_lote: bruto = liquido + Funrural no abate; = total em lote de venda; Funrural em % e' recusado
--   B3 saida registrada: entrega 107.384,74 em Abates de Fêmeas + deducao Funrural 209,77 em 5030, as duas sem caixa e no DRE;
--      oc_conta_corrente: entregue, deduzido, saldo −107.174,97, falta_receber, a_entregar 0, explicacoes vazio, entrega -> deducao
--   B4 recebimento de 107.174,97 achado por oc_recebimentos_vinculaveis e vinculado por oc_vincular_lancamento: saldo 0, quitado,
--      fora do DRE; DRE da OC = 107.174,97
--   B5 dois lotes de sexo diferente (macho em 1020), um deles com DUAS saidas: Σ entregas = bruto e Σ deducoes = Funrural, ao centavo;
--      sincronizar de novo nao muda nada
--   B6 revalorar o abate (oc_salvar_abate): entrega e deducao acompanham pelo gancho; versao devolvida = gravada; Funrural a zero
--      cancela a deducao e ela renasce quando volta
--   B7 oc_explicar_saldo no abate: desconto_comercial vale, ajuste_preco e' recusado; na compra desconto_comercial segue recusado;
--      a deducao nao se desfaz; programar recebimento vale
--   B8 venda e compra em conta corrente REAIS: nenhuma ganha 'deduzido' nem linha de deducao, e a_entregar = acordado − entregue
--      (a comparacao antes x depois por md5 e' do ensaio da migration, na mesma transacao)
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_5030 constant text := 'Impostos e Despesas de Abates e Vendas';
  v_forn uuid; v_conta uuid; v_pc_f uuid; fp jsonb; x jsonb; cc jsonb; ve jsonb; t text; n int; v_real int; v_antes int; v_dre numeric;
  oa uuid; la uuid; ob uuid; lb1 uuid; lb2 uuid; ov uuid; lv uuid; oc uuid; lc uuid; l_rec uuid; p_ded uuid; p_ded2 uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);
  select id into v_forn from financeiro_fornecedores where cliente_id = k and ativo order by created_at limit 1;
  select id into v_conta from financeiro_contas_bancarias where cliente_id = k order by created_at limit 1;
  select id into v_pc_f from financeiro_plano_contas where cliente_id is null and ativo and subcentro = 'Abates de Fêmeas' and tipo_operacao = '1-Entradas';
  fp := jsonb_build_object('fazenda_id', f, 'contraparte_id', v_forn, 'data_operacao', '2031-04-10');

  -- B1
  if public._oc_cc_direcao('abate') is distinct from '1-Entradas' or public._oc_cc_verbo('abate') is distinct from 'Abate'
     or public._oc_cc_conta_entrega('abate', 'vacas') is distinct from 'Abates de Fêmeas'
     or public._oc_cc_conta_entrega('abate', 'bois') is distinct from 'Abates de Machos'
     or public._oc_cc_direcao('venda') is distinct from '1-Entradas' or public._oc_cc_direcao('compra') is distinct from '2-Saídas'
     or public._oc_cc_verbo('venda') is distinct from 'Venda' or public._oc_cc_verbo('compra') is distinct from 'Compra'
     or public._oc_cc_conta_entrega('venda', 'vacas') is distinct from 'Venda de Fêmeas Adultas'
     or public._oc_cc_conta_entrega('compra', 'bois') is distinct from 'Investimento Compra Bovinos Machos' then
    raise exception 'B1 helpers'; end if;
  select count(*) into n from unnest(array['mamotes_m', 'desmama_m', 'bezerros_m', 'garrotes', 'bois', 'touros', 'machos_adultos']) c
   where public._oc_subcentro_abate(c) is distinct from 'Abates de Machos';
  if n <> 0 then raise exception 'B1 machos: % fora', n; end if;
  select count(*) into n from unnest(array['mamotes_f', 'desmama_f', 'bezerras_f', 'novilhas', 'vacas', 'femeas_adultas']) c
   where public._oc_subcentro_abate(c) is distinct from 'Abates de Fêmeas';
  if n <> 0 or public._oc_subcentro_abate('categoria_x') is not null or public._oc_subcentro_abate(null) is not null then
    raise exception 'B1 femeas / fora do mapa'; end if;

  -- a OC de abate do mock: 18 vacas, liquido 107.174,97, Funrural 209,77 — NASCE titulo (o nascimento nao muda neste PR)
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "abate"}'); oa := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_lotes(oa, k, (x->>'versao')::int,
         '[{"ordem": 1, "categoria_negociada": "vacas", "qtd_negociada": 18, "peso_medio_negociado_kg": 450, "criterio_valor": "kg"}]');
  select id into la from zoo_operacao_lotes where operacao_id = oa;
  select versao into v_antes from zoo_operacoes_comerciais where id = oa;
  x := public.oc_salvar_abate(oa, k, v_antes, 'realizado', jsonb_build_array(jsonb_build_object(
         'operacao_lote_id', la, 'peso_carcaca_kg', 4320, 'peso_carcaca_fonte', 'total', 'rendimento_carcaca_pct', 53, 'preco_arroba', 372.86, 'preco_fonte', 'arroba',
         'funrural_valor', 209.77, 'funrural_fonte', 'reais', 'valor_liquido', 107174.97)));
  select versao into v_real from zoo_operacoes_comerciais where id = oa;
  if (select modelo_financeiro from zoo_operacoes_comerciais where id = oa) is distinct from 'titulo'
     or (select rascunho from zoo_operacoes_comerciais where id = oa) is distinct from false
     or (x->>'versao')::int is distinct from v_real or v_real is distinct from v_antes + 1 then
    raise exception 'preparo: o abate nasce titulo, sai do rascunho e a versao devolvida e'' a gravada (% · gravada % · antes %)', x->>'versao', v_real, v_antes; end if;

  -- B2
  ve := public._oc_cc_valor_entrega_do_lote(la);
  if (ve->>'bruto')::numeric is distinct from 107384.74 or (ve->>'liquido')::numeric is distinct from 107174.97
     or (ve->>'funrural')::numeric is distinct from 209.77 or (ve->>'qtd')::int is distinct from 18
     or (public._oc_valor_do_lote(la)->>'total')::numeric is distinct from 107174.97 then
    raise exception 'B2 abate: % (o liquido de _oc_valor_do_lote nao muda)', ve; end if;
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "venda"}'); ov := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_lotes(ov, k, (x->>'versao')::int,
         '[{"ordem": 1, "categoria_negociada": "desmama_m", "qtd_negociada": 10, "peso_medio_negociado_kg": 200, "criterio_valor": "total", "valor_informado": 10000}]');
  select id into lv from zoo_operacao_lotes where operacao_id = ov;
  ve := public._oc_cc_valor_entrega_do_lote(lv);
  if (ve->>'bruto')::numeric is distinct from 10000 or (ve->>'liquido')::numeric is distinct from 10000 or (ve->>'funrural')::numeric is distinct from 0 then
    raise exception 'B2 venda: %', ve; end if;
  t := null;
  begin
    update zoo_operacao_abate set funrural_fonte = 'pct' where operacao_lote_id = la and cenario = 'realizado';
    perform public._oc_cc_valor_entrega_do_lote(la);
  exception when sqlstate 'P0001' then t := sqlerrm; end;
  if t is null or t not like '%informe o Funrural em R$%' then raise exception 'B2 Funrural em %% deveria ser recusado: %', t; end if;

  -- B3 conta corrente (forcado, so' no teste) + saida: a entrega nasce pelo BRUTO e o Funrural como deducao filha
  update zoo_operacoes_comerciais set modelo_financeiro = 'conta_corrente' where id = oa;
  x := public.oc_registrar_movimentacao(oa, k, la, '2031-04-11', 'vacas', 18, 450, null, 'SINT abate');
  select versao into v_real from zoo_operacoes_comerciais where id = oa; cc := public.oc_conta_corrente(oa);
  if (x->'entregas'->>'sincronizou') is distinct from 'true' or (x->'entregas'->>'criadas')::int is distinct from 2
     or (x->>'versao')::int is distinct from v_real then
    raise exception 'B3 gancho: % · versao % (gravada %)', x->'entregas', x->>'versao', v_real; end if;
  select count(*) into n from zoo_operacao_partes p join financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id
   where p.operacao_id = oa and p.cancelada = false and p.origem = 'entrega' and p.natureza = 'principal' and p.componente = 'entrega'
     and p.valor = 107384.74 and l.valor = 107384.74 and l.subcentro = 'Abates de Fêmeas' and l.tipo_operacao = '1-Entradas'
     and l.sem_movimentacao_caixa and l.compoe_dre and l.data_competencia = '2031-04-11' and l.descricao = 'Abate 018 V' and l.cancelado is not true;
  if n <> 1 then raise exception 'B3 entrega: % (esperada 1 de 107.384,74 em Abates de Fêmeas, sem caixa, no DRE)', n; end if;
  select count(*), min(p.id::text)::uuid into n, p_ded from zoo_operacao_partes p join financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id
   where p.operacao_id = oa and p.cancelada = false and p.origem = 'explicacao' and p.natureza = 'deducao' and p.componente = 'funrural'
     and p.lote_id = la and p.entrega_movimentacao_id is null and p.chave_idempotencia = 'deducao:' || (x->>'lancamento_id') || ':funrural'
     and p.valor = 209.77 and l.valor = 209.77 and l.subcentro = c_5030 and l.tipo_operacao = '2-Saídas' and l.sem_movimentacao_caixa
     and l.compoe_dre and l.data_competencia = '2031-04-11' and l.favorecido_id = v_forn and l.fazenda_id = f
     and l.descricao = 'Funrural retido · Abate 018 V' and l.origem_tipo = 'oc:deducao:funrural' and l.status_transacao = 'realizado'
     and l.cancelado is not true;
  if n <> 1 then raise exception 'B3 deducao: % (esperada 1 de 209,77 em 5030, sem caixa, no DRE)', n; end if;
  if exists (select 1 from zoo_operacao_liquidacoes q join zoo_operacao_partes p on p.financeiro_lancamento_id = q.financeiro_lancamento_id
              where p.id = p_ded and q.estornado is not true) then
    raise exception 'B3: a deducao e'' sem caixa e nao gera liquidacao'; end if;
  if (cc->>'entregue')::numeric is distinct from 107384.74 or (cc->>'deduzido')::numeric is distinct from 209.77
     or (cc->>'saldo')::numeric is distinct from -107174.97 or cc->>'situacao' is distinct from 'falta_receber'
     or (cc->>'a_entregar')::numeric is distinct from 0 or jsonb_array_length(cc->'explicacoes') is distinct from 0
     or jsonb_array_length(cc->'despesas') is distinct from 0 or jsonb_array_length(cc->'linhas') is distinct from 2
     or cc->'linhas'->0->>'tipo' is distinct from 'entrega' or (cc->'linhas'->0->>'mov_entrega')::numeric is distinct from -107384.74
     or cc->'linhas'->0->>'conta' is distinct from 'Abates de Fêmeas'
     or cc->'linhas'->1->>'tipo' is distinct from 'deducao' or cc->'linhas'->1->>'subtipo' is distinct from 'funrural'
     or (cc->'linhas'->1->>'mov_entrega')::numeric is distinct from 209.77 or (cc->'linhas'->1->>'saldo')::numeric is distinct from -107174.97
     or cc->'linhas'->1->>'conta' is distinct from c_5030 or cc->'linhas'->1->>'status' is distinct from 'sem_caixa'
     or (cc->>'saidas_sem_entrega')::int is distinct from 0 then
    raise exception 'B3 conta corrente: %', cc; end if;

  -- B4 o dinheiro do frigorifico: a busca o acha, o vincular (o da tela) o liga, o saldo zera e ele sai do DRE
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, valor, sinal, tipo_operacao, data_competencia, data_pagamento, data_vencimento,
    ano_mes, favorecido_id, conta_destino_id, origem_lancamento, status_transacao, cenario, sem_movimentacao_caixa, subcentro, plano_conta_id, descricao)
  values (k, f, 107174.97, '1', '1-Entradas', '2031-05-10', '2031-05-10', '2031-05-10', '2031-05', v_forn, v_conta, 'manual', 'realizado', 'realizado',
    false, 'Abates de Fêmeas', v_pc_f, 'SINT recebimento do frigorifico')
  returning id into l_rec;
  if not exists (select 1 from public.oc_recebimentos_vinculaveis(oa) v where v.lancamento_id = l_rec) then
    raise exception 'B4: oc_recebimentos_vinculaveis nao oferece o recebimento do abate'; end if;
  x := public.oc_vincular_lancamento(oa, v_real, l_rec, null, 'teste abate', null, null, false, false);
  select versao into v_real from zoo_operacoes_comerciais where id = oa; cc := public.oc_conta_corrente(oa);
  select sum(case when l.tipo_operacao like '1-%' then l.valor else -l.valor end) filter (where l.compoe_dre) into v_dre
    from zoo_operacao_partes p join financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id and l.cancelado is not true
   where p.operacao_id = oa and p.cancelada = false;
  if (x->>'ok')::boolean is distinct from true or x->>'modelo' is distinct from 'conta_corrente'
     or (cc->>'recebido')::numeric is distinct from 107174.97 or (cc->>'saldo')::numeric is distinct from 0
     or cc->>'situacao' is distinct from 'quitado' or (cc->>'falta_explicar')::numeric is distinct from 0
     or (select compoe_dre from financeiro_lancamentos_v2 where id = l_rec) is distinct from false
     or (select data_competencia from financeiro_lancamentos_v2 where id = l_rec) is distinct from date '2031-04-11'
     or v_dre is distinct from 107174.97 then
    raise exception 'B4: vincular % · cc % · DRE da OC %', x, cc - 'linhas', v_dre; end if;

  -- B5 dois lotes de sexo diferente; o das vacas sai em DUAS vezes, com o MESMO kg (4 x 450 = 3 x 600): so' arredondando,
  -- o Funrural daria 25,01 + 25,01 = 50,02; com o residuo da entrega, 25,00 + 25,01 = 50,01
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "abate"}'); ob := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_lotes(ob, k, (x->>'versao')::int,
         '[{"ordem": 1, "categoria_negociada": "bois", "qtd_negociada": 10, "peso_medio_negociado_kg": 550, "criterio_valor": "kg"},
           {"ordem": 2, "categoria_negociada": "vacas", "qtd_negociada": 7, "peso_medio_negociado_kg": 450, "criterio_valor": "kg"}]');
  select id into lb1 from zoo_operacao_lotes where operacao_id = ob and ordem = 1;
  select id into lb2 from zoo_operacao_lotes where operacao_id = ob and ordem = 2;
  x := public.oc_salvar_abate(ob, k, (x->>'versao')::int, 'realizado', jsonb_build_array(
         jsonb_build_object('operacao_lote_id', lb1, 'peso_carcaca_kg', 3000, 'peso_carcaca_fonte', 'total', 'rendimento_carcaca_pct', 53, 'preco_arroba', 300, 'preco_fonte', 'arroba',
           'funrural_valor', 100, 'funrural_fonte', 'reais', 'valor_liquido', 60000),
         jsonb_build_object('operacao_lote_id', lb2, 'peso_carcaca_kg', 1500, 'peso_carcaca_fonte', 'total', 'rendimento_carcaca_pct', 53, 'preco_arroba', 300, 'preco_fonte', 'arroba',
           'funrural_valor', 50.01, 'funrural_fonte', 'reais', 'valor_liquido', 30000.01)));
  update zoo_operacoes_comerciais set modelo_financeiro = 'conta_corrente' where id = ob;
  perform public.oc_registrar_movimentacao(ob, k, lb1, '2031-04-12', 'bois', 10, 550, null, 'SINT abate');
  perform public.oc_registrar_movimentacao(ob, k, lb2, '2031-04-12', 'vacas', 4, 450, null, 'SINT abate');
  perform public.oc_registrar_movimentacao(ob, k, lb2, '2031-04-13', 'vacas', 3, 600, null, 'SINT abate');
  cc := public.oc_conta_corrente(ob);
  select jsonb_build_array(count(*) filter (where p.origem = 'entrega' and l.subcentro = 'Abates de Machos' and l.valor = 60100),
         sum(l.valor) filter (where p.origem = 'entrega' and p.lote_id = lb2 and l.subcentro = 'Abates de Fêmeas'),
         sum(l.valor) filter (where p.natureza = 'deducao' and p.lote_id = lb2), count(*) filter (where p.natureza = 'deducao' and p.lote_id = lb2),
         sum(l.valor) filter (where p.natureza = 'deducao' and p.lote_id = lb1), count(distinct l.valor) filter (where p.natureza = 'deducao' and p.lote_id = lb2))
    into ve
    from zoo_operacao_partes p join financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id and l.cancelado is not true
   where p.operacao_id = ob and p.cancelada = false;
  if ve is distinct from '[1, 30050.02, 50.01, 2, 100, 2]'::jsonb then
    raise exception 'B5 dois lotes: % (macho em 1020 por 60.100; vacas Σ entregas 30.050,02 e Σ deducoes 50,01 em 2 partes diferentes; bois 100)', ve; end if;
  if (cc->>'entregue')::numeric is distinct from 90150.02 or (cc->>'deduzido')::numeric is distinct from 150.01
     or (cc->>'saldo')::numeric is distinct from -90000.01 or (cc->>'a_entregar')::numeric is distinct from 0 then
    raise exception 'B5 conta corrente: %', cc - 'linhas'; end if;
  select versao into v_real from zoo_operacoes_comerciais where id = ob;
  x := public.oc_sincronizar_entregas(ob, v_real, false);
  if jsonb_array_length(x->'criadas') + jsonb_array_length(x->'atualizadas') + jsonb_array_length(x->'canceladas') is distinct from 0
     or (x->>'mantidas')::int is distinct from 3 or (x->>'operacao_versao')::int is distinct from v_real then
    raise exception 'B5 sincronizar de novo deveria nao mudar nada: %', x; end if;

  -- B6 revalorar o abate: a entrega (bruto) e a deducao acompanham pelo gancho; a versao devolvida e' a gravada
  select versao into v_real from zoo_operacoes_comerciais where id = oa;
  x := public.oc_salvar_abate(oa, k, v_real, 'realizado', jsonb_build_array(jsonb_build_object(
         'operacao_lote_id', la, 'peso_carcaca_kg', 4320, 'peso_carcaca_fonte', 'total', 'rendimento_carcaca_pct', 53, 'preco_arroba', 350, 'preco_fonte', 'arroba',
         'funrural_valor', 300, 'funrural_fonte', 'reais', 'valor_liquido', 100000)));
  select versao into v_real from zoo_operacoes_comerciais where id = oa; cc := public.oc_conta_corrente(oa);
  if (x->>'versao')::int is distinct from v_real or (cc->>'entregue')::numeric is distinct from 100300 or (cc->>'deduzido')::numeric is distinct from 300
     or (cc->>'saldo')::numeric is distinct from 7174.97 or cc->>'situacao' is distinct from 'adiantado'
     or (select valor from zoo_operacao_partes where id = p_ded and cancelada = false) is distinct from 300::numeric then
    raise exception 'B6 revalorar: versao % (gravada %) · cc %', x->>'versao', v_real, cc - 'linhas'; end if;
  -- Funrural a zero: a deducao sai (a chave fica livre) ...
  x := public.oc_salvar_abate(oa, k, v_real, 'realizado', jsonb_build_array(jsonb_build_object(
         'operacao_lote_id', la, 'peso_carcaca_kg', 4320, 'peso_carcaca_fonte', 'total', 'rendimento_carcaca_pct', 53, 'preco_arroba', 350, 'preco_fonte', 'arroba',
         'valor_liquido', 100000)));
  select versao into v_real from zoo_operacoes_comerciais where id = oa; cc := public.oc_conta_corrente(oa);
  if (cc->>'entregue')::numeric is distinct from 100000 or (cc->>'deduzido')::numeric is distinct from 0 or jsonb_array_length(cc->'linhas') is distinct from 2
     or (select cancelada from zoo_operacao_partes where id = p_ded) is distinct from true
     or (select chave_idempotencia from zoo_operacao_partes where id = p_ded) is distinct from 'deducao-cancelada:' || p_ded
     or (select l.cancelado from financeiro_lancamentos_v2 l join zoo_operacao_partes p on p.financeiro_lancamento_id = l.id where p.id = p_ded) is distinct from true then
    raise exception 'B6 Funrural a zero: cc % · parte %', cc - 'linhas', (select to_jsonb(p) from zoo_operacao_partes p where p.id = p_ded); end if;
  -- ... e renasce quando o Funrural volta
  x := public.oc_salvar_abate(oa, k, v_real, 'realizado', jsonb_build_array(jsonb_build_object(
         'operacao_lote_id', la, 'peso_carcaca_kg', 4320, 'peso_carcaca_fonte', 'total', 'rendimento_carcaca_pct', 53, 'preco_arroba', 350, 'preco_fonte', 'arroba',
         'funrural_valor', 200, 'funrural_fonte', 'reais', 'valor_liquido', 100000)));
  select versao into v_real from zoo_operacoes_comerciais where id = oa; cc := public.oc_conta_corrente(oa);
  select id into p_ded2 from zoo_operacao_partes where operacao_id = oa and cancelada = false and natureza = 'deducao' and componente = 'funrural';
  if p_ded2 is null or p_ded2 = p_ded or (cc->>'entregue')::numeric is distinct from 100200 or (cc->>'deduzido')::numeric is distinct from 200
     or (x->>'versao')::int is distinct from v_real then
    raise exception 'B6 Funrural de volta: parte % · cc %', p_ded2, cc - 'linhas'; end if;

  -- B7 explicar a diferenca no abate: como na venda, menos o ajuste de preco; a deducao nao se desfaz; programar vale
  select versao into v_real from zoo_operacoes_comerciais where id = ob;
  x := public.oc_explicar_saldo(ob, v_real, 'desconto_comercial', 10, null, null, 'teste abate', null, true);
  if (x->>'ok')::boolean is distinct from true or (x->>'simulado')::boolean is distinct from true then raise exception 'B7 desconto no abate: %', x; end if;
  t := null;
  begin perform public.oc_explicar_saldo(ob, v_real, 'ajuste_preco', 10, lb1, null, 'teste abate', null, true);
  exception when sqlstate 'P0001' then t := sqlerrm; end;
  if t is distinct from 'No abate o preço se corrige no acerto do abate (aba Abate), não por ajuste de preço' then raise exception 'B7 ajuste de preco no abate: %', t; end if;
  t := null;
  begin perform public.oc_desfazer_explicacao(oa, (select versao from zoo_operacoes_comerciais where id = oa), p_ded2, 'teste', false);
  exception when sqlstate 'P0001' then t := sqlerrm; end;
  if t is distinct from 'Dedução do abate não se desfaz: ela acompanha o acerto do abate' then raise exception 'B7 desfazer a deducao: %', t; end if;
  x := public.oc_programar_recebimento(ob, v_real, 1000, '2031-06-01', null, true);
  if (x->>'ok')::boolean is distinct from true then raise exception 'B7 programar recebimento no abate: %', x; end if;
  if (select versao from zoo_operacoes_comerciais where id = ob) is distinct from v_real then raise exception 'B7: as simulacoes gravaram'; end if;
  -- a compra segue recusando o desconto comercial
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "compra"}'); oc := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_lotes(oc, k, (x->>'versao')::int,
         '[{"ordem": 1, "categoria_negociada": "desmama_m", "qtd_negociada": 10, "peso_medio_negociado_kg": 200, "criterio_valor": "total", "valor_informado": 10000}]');
  select id into lc from zoo_operacao_lotes where operacao_id = oc;
  x := public.oc_receber_lotes(oc, k, (x->>'versao')::int,
         jsonb_build_array(jsonb_build_object('lote_id', lc, 'data', '2031-04-11', 'categoria', 'desmama_m', 'quantidade', 10, 'peso_medio_kg', 200)));
  cc := public.oc_conta_corrente(oc);
  if (cc->>'entregue')::numeric is distinct from 10000 or cc ? 'deduzido' or (cc->>'a_entregar')::numeric is distinct from 0 then
    raise exception 'B7 compra: a conta corrente da compra mudou (%)', cc - 'linhas'; end if;
  t := null;
  begin perform public.oc_explicar_saldo(oc, (x->>'versao')::int, 'desconto_comercial', 10, null, null, 'teste', null, true);
  exception when sqlstate 'P0001' then t := sqlerrm; end;
  if t is null or t not like 'Na compra a explicacao e ajuste de preco%' then raise exception 'B7 desconto na compra deveria seguir recusado: %', t; end if;

  -- B8 venda e compra REAIS em conta corrente: sem 'deduzido', sem linha de deducao, a_entregar = acordado − entregue
  select count(*), count(*) filter (where c.cc ? 'deduzido' or c.cc->'linhas' @> '[{"tipo": "deducao"}]'
                                       or (c.cc->>'a_entregar')::numeric is distinct from round(coalesce(c.acordado, 0) - (c.cc->>'entregue')::numeric, 2))
    into v_antes, n
    from (select o.valor_acordado as acordado, public.oc_conta_corrente(o.id) as cc from zoo_operacoes_comerciais o
           where o.modelo_financeiro = 'conta_corrente' and o.tipo_operacao in ('venda', 'compra') and o.cliente_id <> k) c;
  if v_antes = 0 then raise exception 'B8: conjunto vazio nao e'' prova'; end if;
  if n <> 0 then raise exception 'B8: % de % OCs de venda/compra mudaram', n, v_antes; end if;

  if has_function_privilege('authenticated', 'public._oc_cc_deducao_sincronizar(uuid, uuid, uuid, text, numeric, date, uuid, text, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._oc_cc_valor_entrega_do_lote(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._oc_subcentro_abate(text)', 'EXECUTE') then raise exception 'interna aberta a authenticated'; end if;
  if (select md5(prosrc) from pg_proc where proname = '_oc_modelo_ao_nascer' and pronamespace = 'public'::regnamespace) is distinct from 'c0e1056252382f4abbc5edf8b5604b4f'
     or public._oc_modelo_ao_nascer('abate', false) is distinct from 'titulo' then raise exception 'o nascimento mudou'; end if;
  raise exception 'OK oc_cc_abate_01_banco (B1-B8; % OCs reais de venda/compra conferidas no B8)', v_antes;
end $teste$;
ROLLBACK;
