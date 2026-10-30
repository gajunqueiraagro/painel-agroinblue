-- PATR-01 — Patrimonio: o teste do banco (migrations 20261028116010…116060). Fixture SINTETICA no cliente Teste (43f32d07): pastos
-- e lancamentos inventados (descricao "… sintetico"), nenhum dado de cliente lido ou mudado. Roda como `authenticated` (admin
-- 7bd0b6ad) e como um usuario de FORA do Teste (a91962cd) e TERMINA EM RAISE: nada fica.
--   T1  trator 388.400 (2 notas) · 10 a · 20 % desde 03/2022 → quota 2.589,33/2.589,34; acumulada 145.002,67 em 10/2026; para no residual
--   T2  terra: nao deprecia, fica no custo (valor sem lancamento); avaliacao terra nua em R$/ha × area; base errada recusa
--   T3  bem "em formacao" soma a aquisicao e nao deprecia
--   T4  mudanca de vida util com vigencia: meses anteriores intactos; o mes da vigencia = restante ÷ meses que faltam; passado recusa
--   T5  previsto ligado nao soma, nem o futuro nem o vencido (fica em "a realizar"); T5b desligar exige motivo e a linha fica
--   T6  lancamento ja' ligado nao liga a outro bem
--   T7  D3: lancamento depois do "em uso" deprecia so' a partir do mes dele (meses anteriores intactos)
--   T8  parte de lancamento dividido: soma a parte; redividido (a ordem deixa de ser investimento) → "a conferir", nao soma, nao some
--   T9  D2/D5: RH, cancelado e captacao recusam
--   T10 D8: repetida? so' liga com confirmacao
--   T11 investimentos sem bem: por parte, sem os ligados, sem RH, repetida com selo, maquina >= corte sai sozinha
--   T12 pastos: 120 ha · R$ 156.000 = R$ 1.300/ha; sem area recusa; categoria sem pastos recusa; pastagem sem mercado
--   T13 acesso: usuario de fora = 42501; anon nao executa; authenticated nao grava direto na tabela
--   T14 compra parcelada 180.000 em 24 (6 pagas, 18 previstas): ligar 1 propoe as 24 e recusa a solta; ligadas, aquisicao 180.000
--       desde o mes do contrato e depreciacao sobre 180.000 (1.200/mes)
--   T15 3.5: corrigir o "em uso desde" de bem que ja' depreciou: sem motivo recusa; com motivo a previa da' antes x depois, a
--       gravacao vai a' trilha (de → para, motivo, autor)
--   T16 3.6: competencia 03/2024 e pagamento 05/2024 entra em 03/2024
--   T8 tambem: lancamento INTEIRO ligado que depois e' dividido ganha o selo e segue somando a parte de investimento
-- Mutacoes (rodadas no ensaio, ver o relatorio): M1 somar quotas arredondadas derruba T1 · M2 previsto somar derruba T5 · M3 sem a
-- checagem "ja' ligado" derruba T6 · M4 aceitar RH derruba T9 · M5 componente desde o "em uso" derruba T7 · M6 aceitar vigencia
-- passada derruba T4 · M7 parcela prevista de contrato nao somar derruba T14 · M8 pagamento antes da competencia derruba T16.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';

do $fx$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  p9030 constant uuid := 'cb586f4f-8373-403d-95dc-dbc43d83f176';
  p9020 constant uuid := 'f4fec107-569a-42a1-b413-bf133474c7fa';
  p9040 constant uuid := '08c28ca4-c776-4493-8ef8-0e056d7c9196';
  p9060 constant uuid := 'd1d5f787-ce1d-4abc-9870-d61928353e95';
  p6160 constant uuid := '0dd30c4d-c97c-4bfe-b0a2-cc5c85d30aed';
  p14030 constant uuid := 'fb52ef42-b147-41df-a601-e7167ed9270c';
  u4 date := (date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) - interval '21 months')::date;
  fut date := (date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) + interval '2 months')::date;
  ids text := '';
  v uuid;
begin
  -- pastos sinteticos da fazenda do Teste
  insert into public.pastos (fazenda_id, cliente_id, nome, area, area_produtiva_ha, ativo, tipo_uso, situacao)
  values (c_faz, c_cli, 'Pasto sintetico A', 50, 50, true, 'recria', 'ativo') returning id into v; ids := ids || 'pa=' || v;
  insert into public.pastos (fazenda_id, cliente_id, nome, area, area_produtiva_ha, ativo, tipo_uso, situacao)
  values (c_faz, c_cli, 'Pasto sintetico B', 70, 70, true, 'recria', 'ativo') returning id into v; ids := ids || ',pb=' || v;
  insert into public.pastos (fazenda_id, cliente_id, nome, area, area_produtiva_ha, ativo, tipo_uso, situacao)
  values (c_faz, c_cli, 'Pasto sintetico sem area', null, null, true, 'recria', 'ativo') returning id into v; ids := ids || ',pc=' || v;

  -- lancamentos sinteticos (valores e datas distintos: o hash de importacao nao colide)
  create temp table fx_l (k text primary key, valor numeric, dt date, plano uuid, status text, cancelado boolean, dup text, origem_tipo text,
                          dividido boolean default false, pag date) on commit drop;
  insert into fx_l values
    ('L1', 300000.00, '2022-03-10', p9030,  'realizado', false, null, null, false),
    ('L2',  88400.00, '2022-03-15', p9030,  'realizado', false, null, null, false),
    ('L3', 120000.00, u4 + 4,       p14030, 'realizado', false, null, null, false),
    ('L4',   5000.00, fut + 9,      p9030,  'previsto',  false, null, null, false),
    ('L5',   3000.00, '2025-05-07', p9060,  'realizado', false, null, null, false),
    ('L6',   7000.00, '2025-05-08', p9030,  'realizado', true,  null, null, false),
    ('L7',   8000.00, '2025-05-09', p9030,  'realizado', false, 'pendente', null, false),
    ('L8',   2704.70, '2025-05-10', p6160,  'realizado', false, null, null, true),
    ('L9',  12000.00, '2024-03-10', p9030,  'realizado', false, null, null, false),
    ('L10',156000.00, '2025-01-10', p9040,  'realizado', false, null, null, false),
    ('L11', 50000.00, '2025-06-11', p9030,  'realizado', false, null, null, false),
    ('L12',  1500.00, '2025-06-12', p9040,  'realizado', false, null, null, false),
    ('L13', 70000.00, '2025-06-13', p9030,  'realizado', false, null, 'financiamento_captacao', false),
    ('L14', 40000.00, '2025-02-14', p9020,  'realizado', false, null, null, false),
    ('L15',  6000.00, '2025-07-15', p9030,  'previsto',  false, null, null, false),
    ('L17', 10000.00, '2025-08-17', p9030,  'realizado', false, null, null, false);
  insert into fx_l values ('L16', 12000.00, '2024-03-05', p9030, 'realizado', false, null, null, false, '2024-05-10');
  declare r record; lid uuid;
  begin
    for r in select * from fx_l order by k loop
      insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, data_competencia, data_pagamento, data_vencimento, valor,
        tipo_operacao, sinal, status_transacao, cancelado, plano_conta_id, descricao, origem_lancamento, cenario, status_duplicidade,
        origem_tipo, classificacao_dividida)
      values (c_cli, c_faz, r.dt, case when r.status = 'realizado' then coalesce(r.pag, r.dt) end, r.dt, r.valor, '2-Saídas', '-1', r.status, r.cancelado,
        r.plano, 'Patrimonio ' || r.k || ' sintetico', 'manual', 'realizado', r.dup, r.origem_tipo, r.dividido)
      returning id into lid;
      ids := ids || ',' || lower(r.k) || '=' || lid;
      if r.dividido then
        insert into public.financeiro_lancamento_partes (cliente_id, lancamento_id, ordem, valor, percentual, plano_conta_id, origem)
        values (c_cli, lid, 1, 1337.50, 49.45095600, p9030, 'manual'), (c_cli, lid, 2, 1367.20, 50.54904400, p6160, 'manual');
      end if;
    end loop;
  end;
  -- compra parcelada sintetica: contrato de 10/01/2025, 24 parcelas de principal (6 pagas, 18 previstas), total 180.000,00
  declare fin uuid; lid uuid; dt date; val numeric;
  begin
    insert into public.financiamentos (cliente_id, fazenda_id, descricao, natureza, data_contrato, total_parcelas, valor_total, status)
    values (c_cli, c_faz, 'Compra parcelada sintetica', 'parcelamento', '2025-01-10', 24, 180000, 'ativo') returning id into fin;
    for i in 1 .. 24 loop
      val := case when i < 24 then 7500 + i * 0.01 else 180000 - (172500 + 2.76) end;
      dt := ('2025-02-10'::date + make_interval(months => i - 1))::date;
      insert into public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, data_competencia, data_pagamento, data_vencimento, valor,
        tipo_operacao, sinal, status_transacao, cancelado, plano_conta_id, descricao, origem_lancamento, cenario, origem_tipo, financiamento_id)
      values (c_cli, c_faz, dt, case when i <= 6 then dt end, dt, val, '2-Saídas', '-1', case when i <= 6 then 'realizado' else 'previsto' end,
        false, p9030, format('Compra parcelada sintetica %s/24', i), 'manual', 'realizado', 'parcela_principal', fin)
      returning id into lid;
      ids := ids || ',c' || i || '=' || lid;
    end loop;
    ids := ids || ',fin=' || fin;
  end;
  perform set_config('teste.ids', ids, true);
end $fx$;

select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
set local role authenticated;

do $t1a$
declare
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  ids text := current_setting('teste.ids');
  r jsonb; v_trator uuid; v_terra uuid; v_form uuid; v_impl uuid; v_tr2 uuid; v_pasto uuid; v_col uuid; v_tr3 uuid; n int; x record;
  u4 date := (date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) - interval '21 months')::date;
  m_atual date := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;
  cat_maq uuid := (select id from public.patrimonio_categorias where cliente_id is null and codigo = 'maquinas');
  cat_imp uuid := (select id from public.patrimonio_categorias where cliente_id is null and codigo = 'implementos');
  cat_ter uuid := (select id from public.patrimonio_categorias where cliente_id is null and codigo = 'terra');
  cat_pas uuid := (select id from public.patrimonio_categorias where cliente_id is null and codigo = 'pastagens');
  cat_ins uuid := (select id from public.patrimonio_categorias where cliente_id is null and codigo = 'instalacoes');
begin
  if (select count(*) from public.patrimonio_categorias where cliente_id is null) is distinct from 13 then raise exception 'T0: seed com % categorias', (select count(*) from public.patrimonio_categorias where cliente_id is null); end if;

  -- T1 trator ---------------------------------------------------------------------------------------------------------------
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'categoria_id', cat_maq,
         'descricao', 'Trator sintetico', 'situacao', 'em_uso', 'em_uso_desde', '2022-03-01', 'atividade', 'pecuaria'), true);
  if (r->>'vida_util_meses')::int is distinct from 120 or (r->>'residual_pct')::numeric is distinct from 20 then raise exception 'T1 previa: %', r; end if;
  if exists (select 1 from public.patrimonio_bens where descricao = 'Trator sintetico') then raise exception 'T1: a previa gravou'; end if;
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'categoria_id', cat_maq,
         'descricao', 'Trator sintetico', 'situacao', 'em_uso', 'em_uso_desde', '2022-03-01', 'atividade', 'pecuaria'), false);
  v_trator := (r->>'id')::uuid;
  r := public.fn_patrimonio_bem_ligar(v_trator, jsonb_build_array(
         jsonb_build_object('lancamento_id', substring(ids from 'l1=([0-9a-f-]+)')),
         jsonb_build_object('lancamento_id', substring(ids from 'l2=([0-9a-f-]+)'))), false, false);
  if (r->>'soma_aquisicao')::numeric is distinct from 388400 then raise exception 'T1 ligar: %', r; end if;
  select count(*) n, max(acumulada) filter (where periodo = '2026-10') acum, min(quota) qmin, max(quota) qmax
    into x from public.fn_patrimonio_depreciacao(c_cli, v_trator, '2026-10-31', 'mes');
  if x.n is distinct from 56 or x.acum is distinct from 145002.67 or x.qmin < 2589.33 or x.qmax > 2589.34 then
    raise exception 'T1 serie: % meses, acumulada %, quota % a %', x.n, x.acum, x.qmin, x.qmax;
  end if;
  select acumulada, quota into x from public.fn_patrimonio_depreciacao(c_cli, v_trator, '2026-10-31', 'mes') where periodo = '2026-10';
  if x.acumulada is distinct from 145002.67 then raise exception 'T1 acumulada 10/2026 = %', x.acumulada; end if;
  select * into x from public.fn_patrimonio_lista(c_cli, c_faz, '2026-10-31') where bem_id = v_trator;
  if x.aquisicao is distinct from 388400 or x.depreciacao_acumulada is distinct from 145002.67 or x.valor_contabil is distinct from 243397.33 or x.n_lancamentos is distinct from 2 then
    raise exception 'T1 lista: aquisicao % acumulada % contabil % n %', x.aquisicao, x.depreciacao_acumulada, x.valor_contabil, x.n_lancamentos;
  end if;
  select max(acumulada) acum, coalesce(max(quota) filter (where periodo > '2032-02'), 0) depois into x
    from public.fn_patrimonio_depreciacao(c_cli, v_trator, '2032-12-31', 'mes');
  if x.acum is distinct from 310720.00 or x.depois is distinct from 0 then
    raise exception 'T1 residual: acumulada final %, quota depois da vida %', x.acum, x.depois;
  end if;

  -- T2 terra ----------------------------------------------------------------------------------------------------------------
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'categoria_id', cat_ter,
         'descricao', 'Terra sintetica', 'situacao', 'em_uso', 'em_uso_desde', '2019-01-01', 'atividade', 'compartilhado',
         'origem_valor', 'sem_lancamento', 'valor_sem_lancamento', 1000000, 'area_ha', 500), false);
  v_terra := (r->>'id')::uuid;
  r := public.fn_patrimonio_avaliacao_salvar(v_terra, '{"data":"2026-01-15","fonte":"ITR 2025","base":"terra_nua","valor_ha":3000}', false);
  if (r->>'valor_total')::numeric is distinct from 1500000 then raise exception 'T2 avaliacao: %', r; end if;
  select * into x from public.fn_patrimonio_lista(c_cli, c_faz, '2026-10-31') where bem_id = v_terra;
  if x.aquisicao is distinct from 1000000 or x.depreciacao_acumulada is distinct from 0 or x.valor_contabil is distinct from 1000000 or x.mercado_valor is distinct from 1500000
     or x.mercado_base is distinct from 'terra_nua' or x.vida_util_meses is not null then
    raise exception 'T2 lista: % % % % %', x.aquisicao, x.depreciacao_acumulada, x.valor_contabil, x.mercado_valor, x.vida_util_meses;
  end if;
  if exists (select 1 from public.fn_patrimonio_depreciacao(c_cli, v_terra, '2026-10-31', 'mes')) then raise exception 'T2: terra depreciou'; end if;
  begin
    perform public.fn_patrimonio_avaliacao_salvar(v_terra, '{"data":"2026-01-15","fonte":"x","base":"bem","valor_total":10}', true);
    raise exception 'T2: base "bem" na terra passou';
  exception when others then if sqlerrm not like 'Diga a base%' then raise exception 'T2 recusa errada: %', sqlerrm; end if;
  end;
  begin
    perform public.fn_patrimonio_parametros_mudar(v_terra, m_atual, 60, 0, 'teste', true);
    raise exception 'T2: terra mudou vida util';
  exception when others then if sqlerrm is distinct from 'Esta categoria não deprecia.' then raise exception 'T2 recusa errada: %', sqlerrm; end if;
  end;

  -- T3 em formacao ----------------------------------------------------------------------------------------------------------
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'categoria_id', cat_ins,
         'descricao', 'Barracao sintetico', 'situacao', 'em_formacao', 'atividade', 'pecuaria'), false);
  v_form := (r->>'id')::uuid;
  perform public.fn_patrimonio_bem_ligar(v_form, jsonb_build_array(jsonb_build_object('lancamento_id', substring(ids from 'l14=([0-9a-f-]+)'))), false, false);
  select * into x from public.fn_patrimonio_lista(c_cli, c_faz, '2026-10-31') where bem_id = v_form;
  if x.aquisicao is distinct from 40000 or x.depreciacao_acumulada is distinct from 0 or x.valor_contabil is distinct from 40000 then
    raise exception 'T3 lista: % % %', x.aquisicao, x.depreciacao_acumulada, x.valor_contabil;
  end if;
  if exists (select 1 from public.fn_patrimonio_depreciacao(c_cli, v_form, '2026-10-31', 'mes')) then raise exception 'T3: em formacao depreciou'; end if;

  -- T4 mudanca de vida util -------------------------------------------------------------------------------------------------
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'categoria_id', cat_imp,
         'descricao', 'Grade sintetica', 'situacao', 'em_uso', 'em_uso_desde', u4, 'atividade', 'lavoura'), false);
  v_impl := (r->>'id')::uuid;
  perform public.fn_patrimonio_bem_ligar(v_impl, jsonb_build_array(jsonb_build_object('lancamento_id', substring(ids from 'l3=([0-9a-f-]+)'))), false, false);
  create temp table t4_antes on commit drop as
    select periodo, quota, acumulada from public.fn_patrimonio_depreciacao(c_cli, v_impl, (m_atual - 1), 'mes');
  if (select count(*) from t4_antes) is distinct from 21 or (select acumulada from t4_antes where periodo = to_char(m_atual - interval '1 month', 'YYYY-MM')) is distinct from 18900.00 then
    raise exception 'T4 antes: % meses', (select count(*) from t4_antes);
  end if;
  r := public.fn_patrimonio_parametros_mudar(v_impl, m_atual, 60, 10, 'vida real menor (teste)', true);
  if (r->>'quota_antes')::numeric is distinct from 900.00 or (r->>'quota_depois')::numeric is distinct from 2284.62 then raise exception 'T4 previa: %', r; end if;
  if (select count(*) from public.patrimonio_bem_parametros where bem_id = v_impl) is distinct from 1 then raise exception 'T4: a previa gravou'; end if;
  perform public.fn_patrimonio_parametros_mudar(v_impl, m_atual, 60, 10, 'vida real menor (teste)', false);
  if exists (select 1 from t4_antes a join public.fn_patrimonio_depreciacao(c_cli, v_impl, m_atual, 'mes') d using (periodo)
              where d.quota is distinct from a.quota or d.acumulada is distinct from a.acumulada) then
    raise exception 'T4: a mudanca reescreveu mes passado';
  end if;
  if (select quota from public.fn_patrimonio_depreciacao(c_cli, v_impl, m_atual, 'mes') where periodo = to_char(m_atual, 'YYYY-MM')) is distinct from 2284.62 then
    raise exception 'T4: quota do mes da vigencia';
  end if;
  begin
    perform public.fn_patrimonio_parametros_mudar(v_impl, (m_atual - interval '1 month')::date, 48, 10, 'passado', true);
    raise exception 'T4: vigencia passada passou';
  exception when others then if sqlerrm not like 'A mudança vale deste mês em diante%' then raise exception 'T4 recusa errada: %', sqlerrm; end if;
  end;
  begin
    perform public.fn_patrimonio_bem_salvar(jsonb_build_object('id', v_impl, 'versao', (select versao from public.patrimonio_bens where id = v_impl),
      'fazenda_id', c_faz, 'categoria_id', cat_imp, 'descricao', 'Grade sintetica', 'situacao', 'em_uso', 'em_uso_desde', u4,
      'atividade', 'lavoura', 'vida_util_meses', 36), true);
    raise exception 'T4: salvar mudou a vida';
  exception when others then if sqlerrm not like 'O bem já deprecia: mude a vida%' then raise exception 'T4 recusa errada (salvar): %', sqlerrm; end if;
  end;

  -- T5 previsto -------------------------------------------------------------------------------------------------------------
  perform public.fn_patrimonio_bem_ligar(v_trator, jsonb_build_array(jsonb_build_object('lancamento_id', substring(ids from 'l4=([0-9a-f-]+)')),
    jsonb_build_object('lancamento_id', substring(ids from 'l15=([0-9a-f-]+)'))), false, false);
  select * into x from public.fn_patrimonio_lista(c_cli, c_faz, '2026-10-31') where bem_id = v_trator;
  if x.aquisicao is distinct from 388400 or x.a_realizar is distinct from 11000 or x.n_a_realizar is distinct from 2 or x.depreciacao_acumulada is distinct from 145002.67 then
    raise exception 'T5: aquisicao % a realizar % acumulada %', x.aquisicao, x.a_realizar, x.depreciacao_acumulada;
  end if;
  -- T5b o gesto contrario: desligar o vencido (motivo obrigatorio; a linha fica com o motivo, o "a realizar" volta a 5.000)
  begin
    perform public.fn_patrimonio_bem_desligar(v_trator, jsonb_build_array(jsonb_build_object('lancamento_id', substring(ids from 'l15=([0-9a-f-]+)'))), ' ', false);
    raise exception 'T5b: desligou sem motivo';
  exception when others then if sqlerrm is distinct from 'Informe o motivo.' then raise exception 'T5b recusa errada: %', sqlerrm; end if;
  end;
  perform public.fn_patrimonio_bem_desligar(v_trator, jsonb_build_array(jsonb_build_object('lancamento_id', substring(ids from 'l15=([0-9a-f-]+)'))), 'nao e deste trator', false);
  if (select a_realizar from public.fn_patrimonio_lista(c_cli, c_faz, '2026-10-31') where bem_id = v_trator) is distinct from 5000
     or (select desligado_motivo from public.patrimonio_bem_lancamentos where lancamento_id = substring(ids from 'l15=([0-9a-f-]+)')::uuid) is distinct from 'nao e deste trator' then
    raise exception 'T5b: desligar';
  end if;

  -- T6 ja' ligado -----------------------------------------------------------------------------------------------------------
  r := public.fn_patrimonio_bem_ligar(v_form, jsonb_build_array(jsonb_build_object('lancamento_id', substring(ids from 'l1=([0-9a-f-]+)'))), false, true);
  if r->'itens'->0->>'situacao' is distinct from 'recusa' or r->'itens'->0->>'motivo' is distinct from 'Já está ligado ao bem «Trator sintetico».' then
    raise exception 'T6 previa: %', r;
  end if;
  begin
    perform public.fn_patrimonio_bem_ligar(v_form, jsonb_build_array(jsonb_build_object('lancamento_id', substring(ids from 'l1=([0-9a-f-]+)'))), false, false);
    raise exception 'T6: ligou a dois bens';
  exception when others then if sqlerrm is distinct from 'Já está ligado ao bem «Trator sintetico».' then raise exception 'T6 recusa errada: %', sqlerrm; end if;
  end;

  -- T7 D3 -------------------------------------------------------------------------------------------------------------------
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'categoria_id', cat_maq,
         'descricao', 'Trator sintetico 2', 'situacao', 'em_uso', 'em_uso_desde', '2022-03-01', 'atividade', 'pecuaria',
         'origem_valor', 'sem_lancamento', 'valor_sem_lancamento', 388400), false);
  v_tr2 := (r->>'id')::uuid;
  create temp table t7_antes on commit drop as select periodo, quota, acumulada from public.fn_patrimonio_depreciacao(c_cli, v_tr2, '2024-02-29', 'mes');
  perform public.fn_patrimonio_bem_ligar(v_tr2, jsonb_build_array(jsonb_build_object('lancamento_id', substring(ids from 'l9=([0-9a-f-]+)'))), false, false);
  if exists (select 1 from t7_antes a join public.fn_patrimonio_depreciacao(c_cli, v_tr2, '2024-02-29', 'mes') d using (periodo)
              where d.quota is distinct from a.quota or d.acumulada is distinct from a.acumulada)
     or (select acumulada from t7_antes where periodo = '2024-02') is distinct from 62144.00 then
    raise exception 'T7: o lancamento novo reescreveu mes passado';
  end if;
  if (select quota from public.fn_patrimonio_depreciacao(c_cli, v_tr2, '2024-03-31', 'mes') where periodo = '2024-03') is distinct from 2689.33 then
    raise exception 'T7: quota 03/2024 = %', (select quota from public.fn_patrimonio_depreciacao(c_cli, v_tr2, '2024-03-31', 'mes') where periodo = '2024-03');
  end if;

  -- T11 investimentos sem bem (antes de ligar L7/L8) ------------------------------------------------------------------------
  r := public.fn_investimentos_sem_bem(c_cli, c_faz, 20000);
  if not exists (select 1 from jsonb_array_elements(r->'individuais') i where i->>'lancamento_id' = substring(ids from 'l11=([0-9a-f-]+)')
                   and (i->>'valor')::numeric = 50000 and i->'categoria'->>'codigo' = 'maquinas') then raise exception 'T11: L11 nao saiu sozinho'; end if;
  if exists (select 1 from jsonb_array_elements(r->'grupos') g, jsonb_array_elements(g->'itens') i
              where i->>'lancamento_id' = substring(ids from 'l11=([0-9a-f-]+)')) then raise exception 'T11: L11 tambem no grupo'; end if;
  if not exists (select 1 from jsonb_array_elements(r->'grupos') g, jsonb_array_elements(g->'itens') i
                  where i->>'lancamento_id' = substring(ids from 'l12=([0-9a-f-]+)') and (g->>'ano')::int = 2025 and g->'categoria'->>'codigo' = 'pastagens')
    then raise exception 'T11: L12 fora do grupo 2025 · pastagens'; end if;
  if not exists (select 1 from jsonb_array_elements(r->'grupos') g, jsonb_array_elements(g->'itens') i
                  where i->>'lancamento_id' = substring(ids from 'l8=([0-9a-f-]+)') and (i->>'valor')::numeric = 1337.50 and (i->>'parte_ordem')::int = 1)
    then raise exception 'T11: a parte do L8 nao veio pelo valor da parte'; end if;
  if not exists (select 1 from jsonb_array_elements(r->'grupos') g, jsonb_array_elements(g->'itens') i
                  where i->>'lancamento_id' = substring(ids from 'l7=([0-9a-f-]+)') and (i->>'repetida')::boolean)
    then raise exception 'T11: L7 sem selo de repetida'; end if;
  if not exists (select 1 from jsonb_array_elements(r->'grupos') g, jsonb_array_elements(g->'itens') i
                  where i->>'lancamento_id' = substring(ids from 'c20=([0-9a-f-]+)') and (i->>'de_contrato')::boolean and (i->>'a_realizar')::boolean
                    and (g->>'ano')::int = 2025) then raise exception 'T11: parcela prevista do contrato fora do sem-bem (ou fora do ano da compra)'; end if;
  if exists (select 1 from jsonb_array_elements(r->'grupos') g, jsonb_array_elements(g->'itens') i
              where i->>'lancamento_id' in (substring(ids from 'l1=([0-9a-f-]+)'), substring(ids from 'l5=([0-9a-f-]+)'),
                                            substring(ids from 'l6=([0-9a-f-]+)'), substring(ids from 'l4=([0-9a-f-]+)')))
     or exists (select 1 from jsonb_array_elements(r->'individuais') i
              where i->>'lancamento_id' in (substring(ids from 'l1=([0-9a-f-]+)'), substring(ids from 'l5=([0-9a-f-]+)')))
    then raise exception 'T11: ligado, RH, cancelado ou previsto apareceu'; end if;

  -- T8 parte ----------------------------------------------------------------------------------------------------------------
  r := public.fn_patrimonio_bem_ligar(v_form, jsonb_build_array(jsonb_build_object('lancamento_id', substring(ids from 'l8=([0-9a-f-]+)'), 'parte_ordem', 2)), false, true);
  if r->'itens'->0->>'motivo' is distinct from 'Só lançamento de Investimento (fora RH) se liga a bem.' then raise exception 'T8 parte 2: %', r; end if;
  perform public.fn_patrimonio_bem_ligar(v_form, jsonb_build_array(jsonb_build_object('lancamento_id', substring(ids from 'l8=([0-9a-f-]+)'), 'parte_ordem', 1)), false, false);
  select * into x from public.fn_patrimonio_lista(c_cli, c_faz, '2026-10-31') where bem_id = v_form;
  if x.aquisicao is distinct from 41337.50 then raise exception 'T8: aquisicao com a parte = %', x.aquisicao; end if;
  perform public.fn_patrimonio_bem_ligar(v_form, jsonb_build_array(jsonb_build_object('lancamento_id', substring(ids from 'l17=([0-9a-f-]+)'))), false, false);
  perform set_config('teste.form', v_form::text, true);

  -- T9 recusas --------------------------------------------------------------------------------------------------------------
  r := public.fn_patrimonio_bem_ligar(v_form, jsonb_build_array(
         jsonb_build_object('lancamento_id', substring(ids from 'l5=([0-9a-f-]+)')),
         jsonb_build_object('lancamento_id', substring(ids from 'l6=([0-9a-f-]+)')),
         jsonb_build_object('lancamento_id', substring(ids from 'l13=([0-9a-f-]+)'))), false, true);
  if r->'itens'->0->>'motivo' is distinct from 'Só lançamento de Investimento (fora RH) se liga a bem.'
     or r->'itens'->1->>'motivo' is distinct from 'Lançamento cancelado não se liga a bem.'
     or r->'itens'->2->>'motivo' is distinct from 'Captação e juros de financiamento não são custo do bem.' or (r->>'ok')::boolean then
    raise exception 'T9: %', r;
  end if;

  -- T10 repetida ------------------------------------------------------------------------------------------------------------
  begin
    perform public.fn_patrimonio_bem_ligar(v_form, jsonb_build_array(jsonb_build_object('lancamento_id', substring(ids from 'l7=([0-9a-f-]+)'))), false, false);
    raise exception 'T10: repetida ligou sem confirmar';
  exception when others then if sqlerrm not like '1 lançamento(s) marcado(s) como possível repetição%' then raise exception 'T10 recusa errada: %', sqlerrm; end if;
  end;
  perform public.fn_patrimonio_bem_ligar(v_form, jsonb_build_array(jsonb_build_object('lancamento_id', substring(ids from 'l7=([0-9a-f-]+)'))), true, false);
  if not (select repetida_confirmada from public.patrimonio_bem_lancamentos where lancamento_id = substring(ids from 'l7=([0-9a-f-]+)')::uuid and desligado_em is null) then
    raise exception 'T10: confirmacao nao ficou marcada';
  end if;

  -- T12 pastos --------------------------------------------------------------------------------------------------------------
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'categoria_id', cat_pas,
         'descricao', 'Reforma de pastagem sintetica', 'situacao', 'em_uso', 'em_uso_desde', '2025-01-01', 'atividade', 'pecuaria'), false);
  v_pasto := (r->>'id')::uuid;
  perform public.fn_patrimonio_bem_ligar(v_pasto, jsonb_build_array(jsonb_build_object('lancamento_id', substring(ids from 'l10=([0-9a-f-]+)'))), false, false);
  r := public.fn_patrimonio_bem_pastos_salvar(v_pasto, jsonb_build_array(
         jsonb_build_object('pasto_id', substring(ids from 'pa=([0-9a-f-]+)'), 'area_ha', 50),
         jsonb_build_object('pasto_id', substring(ids from 'pb=([0-9a-f-]+)'), 'area_ha', 70)), false);
  if (r->>'area_total_ha')::numeric is distinct from 120 or (r->>'custo_por_ha')::numeric is distinct from 1300.00 then raise exception 'T12: %', r; end if;
  if (select area_pastos_ha from public.fn_patrimonio_lista(c_cli, c_faz, '2026-10-31') where bem_id = v_pasto) is distinct from 120 then raise exception 'T12 lista'; end if;
  begin
    perform public.fn_patrimonio_bem_pastos_salvar(v_pasto, jsonb_build_array(
      jsonb_build_object('pasto_id', substring(ids from 'pa=([0-9a-f-]+)'), 'area_ha', 50),
      jsonb_build_object('pasto_id', substring(ids from 'pc=([0-9a-f-]+)'), 'area_ha', null)), true);
    raise exception 'T12: pasto sem area passou';
  exception when others then if sqlerrm is distinct from 'Informe a área do pasto «Pasto sintetico sem area».' then raise exception 'T12 recusa errada: %', sqlerrm; end if;
  end;
  begin
    perform public.fn_patrimonio_bem_pastos_salvar(v_trator, '[]'::jsonb, true);
    raise exception 'T12: trator com pastos';
  exception when others then if sqlerrm is distinct from 'Esta categoria não se liga a pastos.' then raise exception 'T12 recusa errada: %', sqlerrm; end if;
  end;
  begin
    perform public.fn_patrimonio_avaliacao_salvar(v_pasto, '{"data":"2026-01-15","fonte":"x","valor_total":10}', true);
    raise exception 'T12: pastagem com mercado';
  exception when others then if sqlerrm is distinct from 'Esta categoria não tem valor de mercado próprio.' then raise exception 'T12 recusa errada: %', sqlerrm; end if;
  end;
  -- T14 compra parcelada -------------------------------------------------------------------------------------------------
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'categoria_id', cat_maq,
         'descricao', 'Colheitadeira sintetica', 'situacao', 'em_uso', 'em_uso_desde', '2025-01-01', 'atividade', 'lavoura'), false);
  v_col := (r->>'id')::uuid;
  r := public.fn_patrimonio_bem_ligar(v_col, jsonb_build_array(jsonb_build_object('lancamento_id', substring(ids from 'c1=([0-9a-f-]+)'))), false, true);
  if (r->'contratos'->0->>'n_parcelas')::int is distinct from 24 or (r->'contratos'->0->>'n_faltam')::int is distinct from 23
     or (r->'contratos'->0->>'valor_total')::numeric is distinct from 180000 or (r->>'ok')::boolean then
    raise exception 'T14 previa: %', r->'contratos';
  end if;
  begin
    perform public.fn_patrimonio_bem_ligar(v_col, jsonb_build_array(jsonb_build_object('lancamento_id', substring(ids from 'c1=([0-9a-f-]+)'))), false, false);
    raise exception 'T14: ligou a parcela solta';
  exception when others then
    if sqlerrm is distinct from 'A compra «Compra parcelada sintetica» tem 24 parcelas: ligue todas juntas (faltam 23).' then raise exception 'T14 recusa errada: %', sqlerrm; end if;
  end;
  r := public.fn_patrimonio_bem_ligar(v_col, jsonb_build_array(jsonb_build_object('lancamento_id', substring(ids from 'c1=([0-9a-f-]+)')))
         || (select jsonb_agg(jsonb_build_object('lancamento_id', f->>'lancamento_id', 'parte_ordem', f->>'parte_ordem'))
               from jsonb_array_elements(r->'contratos'->0->'faltam') f), false, false);
  if (r->>'soma_aquisicao')::numeric is distinct from 180000 or (r->>'n_ligados')::int is distinct from 24 then raise exception 'T14 ligar: %', r; end if;
  select * into x from public.fn_patrimonio_lista(c_cli, c_faz, '2025-01-31') where bem_id = v_col;
  if x.aquisicao is distinct from 180000 or x.a_realizar is distinct from 0 or x.n_lancamentos is distinct from 24 then
    raise exception 'T14 lista 01/2025: aquisicao % a realizar % n %', x.aquisicao, x.a_realizar, x.n_lancamentos;
  end if;
  select * into x from public.fn_patrimonio_depreciacao(c_cli, v_col, '2025-01-31', 'mes') where periodo = '2025-01';
  if x.base is distinct from 180000 or x.quota is distinct from 1200.00 then raise exception 'T14 serie: base % quota %', x.base, x.quota; end if;

  -- T15 correcao do "em uso desde" (3.5) ----------------------------------------------------------------------------------
  begin
    perform public.fn_patrimonio_bem_salvar(jsonb_build_object('id', v_trator, 'versao', (select versao from public.patrimonio_bens where id = v_trator),
      'fazenda_id', c_faz, 'categoria_id', cat_maq, 'descricao', 'Trator sintetico', 'situacao', 'em_uso', 'em_uso_desde', '2022-06-01',
      'atividade', 'pecuaria'), true, null);
    raise exception 'T15: corrigiu sem motivo';
  exception when others then if sqlerrm not like 'O bem já deprecia desde 03/2022: para corrigir%' then raise exception 'T15 recusa errada: %', sqlerrm; end if;
  end;
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('id', v_trator, 'versao', (select versao from public.patrimonio_bens where id = v_trator),
      'fazenda_id', c_faz, 'categoria_id', cat_maq, 'descricao', 'Trator sintetico', 'situacao', 'em_uso', 'em_uso_desde', '2022-06-01',
      'atividade', 'pecuaria'), true, 'a nota mostra a entrega em junho');
  if (r->'correcao'->>'acumulada_depois')::numeric is null
     or (r->'correcao'->>'acumulada_antes')::numeric - (r->'correcao'->>'acumulada_depois')::numeric is distinct from
        (select round(310720 * least(m, 120) / 120.0, 2) - round(310720 * least(m - 3, 120) / 120.0, 2)
           from (select ((extract(year from (now() at time zone 'America/Sao_Paulo')::date) - 2022) * 12 + extract(month from (now() at time zone 'America/Sao_Paulo')::date) - 3 + 1)::int m) q) then
    raise exception 'T15 previa: %', r->'correcao';
  end if;
  if exists (select 1 from public.patrimonio_bem_trilha where bem_id = v_trator)
     or (select em_uso_desde from public.patrimonio_bens where id = v_trator) is distinct from '2022-03-01' then raise exception 'T15: a previa gravou'; end if;
  perform public.fn_patrimonio_bem_salvar(jsonb_build_object('id', v_trator, 'versao', (select versao from public.patrimonio_bens where id = v_trator),
      'fazenda_id', c_faz, 'categoria_id', cat_maq, 'descricao', 'Trator sintetico', 'situacao', 'em_uso', 'em_uso_desde', '2022-06-01',
      'atividade', 'pecuaria'), false, 'a nota mostra a entrega em junho');
  select * into x from public.patrimonio_bem_trilha where bem_id = v_trator;
  if x.acao is distinct from 'correcao_em_uso' or x.antes->>'em_uso_desde' is distinct from '2022-03-01' or x.depois->>'em_uso_desde' is distinct from '2022-06-01'
     or x.motivo is distinct from 'a nota mostra a entrega em junho' or x.por is distinct from '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e'::uuid
     or (x.antes->>'acumulada')::numeric is distinct from (r->'correcao'->>'acumulada_antes')::numeric
     or (x.depois->>'acumulada')::numeric is distinct from (r->'correcao'->>'acumulada_depois')::numeric then
    raise exception 'T15 trilha: %', row_to_json(x);
  end if;
  if (select min(periodo) from public.fn_patrimonio_depreciacao(c_cli, v_trator, '2026-10-31', 'mes')) is distinct from '2022-06' then
    raise exception 'T15: a serie nao comeca em 06/2022';
  end if;

  -- T16 competencia antes do pagamento (3.6) ------------------------------------------------------------------------------
  r := public.fn_patrimonio_bem_salvar(jsonb_build_object('cliente_id', c_cli, 'fazenda_id', c_faz, 'categoria_id', cat_maq,
         'descricao', 'Trator sintetico 3', 'situacao', 'em_uso', 'em_uso_desde', '2022-03-01', 'atividade', 'pecuaria',
         'origem_valor', 'sem_lancamento', 'valor_sem_lancamento', 388400), false);
  v_tr3 := (r->>'id')::uuid;
  perform public.fn_patrimonio_bem_ligar(v_tr3, jsonb_build_array(jsonb_build_object('lancamento_id', substring(ids from 'l16=([0-9a-f-]+)'))), false, false);
  if (select quota from public.fn_patrimonio_depreciacao(c_cli, v_tr3, '2024-05-31', 'mes') where periodo = '2024-03') is distinct from 2689.33 then
    raise exception 'T16: a nota de 03/2024 (paga em 05/2024) nao entrou em 03/2024';
  end if;

  perform set_config('teste.trator', v_trator::text, true);
end $t1a$;

-- T8 (2a metade): a REDIVISAO do L8 (como a `_fn_fin_dividir` faz: apaga e recria as partes) — a ordem 1 deixa de ser investimento
reset role;
do $redivide$
declare l8 uuid := substring(current_setting('teste.ids') from 'l8=([0-9a-f-]+)')::uuid;
begin
  perform set_config('app.fin_dividindo', 'on', true);
  delete from public.financeiro_lancamento_partes where lancamento_id = l8;
  insert into public.financeiro_lancamento_partes (cliente_id, lancamento_id, ordem, valor, percentual, plano_conta_id, origem)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', l8, 1, 1367.20, 50.54904400, '0dd30c4d-c97c-4bfe-b0a2-cc5c85d30aed', 'manual'),
         ('43f32d07-dba8-4670-900c-bf645440c04a', l8, 2, 1337.50, 49.45095600, 'cb586f4f-8373-403d-95dc-dbc43d83f176', 'manual');
  -- o L17 foi ligado INTEIRO (1 parte); agora e' dividido: a ordem 1 segue de investimento (6.000), a 2 vai para custeio
  update public.financeiro_lancamentos_v2 set classificacao_dividida = true
   where id = substring(current_setting('teste.ids') from 'l17=([0-9a-f-]+)')::uuid;
  insert into public.financeiro_lancamento_partes (cliente_id, lancamento_id, ordem, valor, percentual, plano_conta_id, origem)
  values ('43f32d07-dba8-4670-900c-bf645440c04a', substring(current_setting('teste.ids') from 'l17=([0-9a-f-]+)')::uuid, 1, 6000.00, 60, 'cb586f4f-8373-403d-95dc-dbc43d83f176', 'manual'),
         ('43f32d07-dba8-4670-900c-bf645440c04a', substring(current_setting('teste.ids') from 'l17=([0-9a-f-]+)')::uuid, 2, 4000.00, 40, '0dd30c4d-c97c-4bfe-b0a2-cc5c85d30aed', 'manual');
  perform set_config('app.fin_dividindo', 'off', true);
end $redivide$;
set local role authenticated;

do $t8b$
declare c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; x record;
begin
  select * into x from public.fn_patrimonio_lista(c_cli, null, '2026-10-31') where bem_id = current_setting('teste.form')::uuid;
  -- 40.000 (L14) + 8.000 (L7 confirmada) + 6.000 (a parte de investimento do L17 redividido, com selo); a parte do L8 virou
  -- "a conferir": nao soma e nao some
  if x.aquisicao is distinct from 54000 or x.n_a_conferir is distinct from 1 or x.n_selo is distinct from 1 then
    raise exception 'T8 a conferir: aquisicao % a conferir % selo %', x.aquisicao, x.n_a_conferir, x.n_selo;
  end if;
  if not exists (select 1 from public.fn_patrimonio_bem_lancamentos(current_setting('teste.form')::uuid) z
                  where z.lancamento_id = substring(current_setting('teste.ids') from 'l17=([0-9a-f-]+)')::uuid
                    and z.estado = 'soma' and z.valor = 6000 and z.selo is not null) then
    raise exception 'T8: o L17 redividido sem selo (ou sem somar a parte)';
  end if;
  if not exists (select 1 from public.fn_patrimonio_bem_lancamentos(current_setting('teste.form')::uuid) z
                  where z.lancamento_id = substring(current_setting('teste.ids') from 'l8=([0-9a-f-]+)')::uuid
                    and z.estado = 'a_conferir' and z.valor is null) then
    raise exception 'T8: o L8 nao aparece como a conferir na aba Lancamentos';
  end if;
end $t8b$;

-- T13 acesso --------------------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a91962cd-56dd-4729-b2e1-dcd4a1d7b9c9","role":"authenticated"}', true);
do $t13$
declare c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; n int;
begin
  begin
    perform * from public.fn_patrimonio_lista(c_cli, null, null);
    raise exception 'T13: lista de outro cliente';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.fn_patrimonio_bem_ligar(current_setting('teste.trator')::uuid, '[{"lancamento_id":"00000000-0000-0000-0000-000000000000"}]', false, true);
    raise exception 'T13: ligou em bem de outro cliente';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.fn_investimentos_sem_bem(c_cli, null, 20000);
    raise exception 'T13: sem bem de outro cliente';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.patrimonio_bens where cliente_id = c_cli;
  if n is distinct from 0 then raise exception 'T13: a RLS deixou ver % bens de outro cliente', n; end if;
  begin
    insert into public.patrimonio_bens (cliente_id, fazenda_id, categoria_id, descricao, atividade)
    values (c_cli, 'c2498ace-8478-410c-a697-d3f2e2934d1f', (select id from public.patrimonio_categorias where codigo = 'cercas' and cliente_id is null), 'x', 'pecuaria');
    raise exception 'T13: authenticated gravou direto';
  exception when insufficient_privilege then null;
  end;
end $t13$;
reset role;
set local role anon;
do $t13b$
begin
  begin
    perform * from public.fn_patrimonio_lista('43f32d07-dba8-4670-900c-bf645440c04a', null, null);
    raise exception 'T13: anon executou';
  exception when insufficient_privilege then null;
  end;
end $t13b$;
reset role;

do $fim$ begin raise exception 'OK patr_01 (T0–T16)'; end $fim$;
rollback;
