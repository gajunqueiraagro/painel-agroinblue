-- IMPORTAR-ABATE-01 · D5 — o SENAR e' componente proprio da OC de abate (migration 20261028117500).
-- Sintetico no cliente Teste (OCs pelas RPCs reais, como o gabarito 5d255b74), numa transacao revertida; termina em RAISE 'OK …'.
--   S1 o par senar no oc_salvar_abate: bruto da entrega = liquido + SENAR; o `senar` volta no valor da entrega; funrural 0
--   S2 a saida registrada: entrega pelo bruto + UMA deducao 'senar' ("SENAR retido · …", 5030, sem caixa); nenhuma 'funrural'
--   S3 Funrural e SENAR no mesmo lote: duas deducoes, cada uma com o seu valor; bruto = liquido + as duas
--   S4 duas saidas no lote fechado: Σ deducoes SENAR = o SENAR do lote ao centavo (o mesmo residuo da entrega)
--   S5 SENAR em % recusa (como o Funrural); SENAR sem fonte recusa ("valor sem fonte")
--   S6 SENAR a zero (revalorar): a deducao SENAR sai (cancelada), a de Funrural fica
--   S7 o preco do lancamento do rebanho soma o SENAR na base (preco pelo liquido)
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  v_forn uuid; fp jsonb; x jsonb; ve jsonb; n int; v numeric; t text;
  oa uuid; la uuid; ob uuid; lb uuid; oc uuid; lc uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);
  select id into v_forn from financeiro_fornecedores where cliente_id = k and ativo order by created_at limit 1;
  fp := jsonb_build_object('fazenda_id', f, 'contraparte_id', v_forn, 'data_operacao', '2031-05-10');

  -- S1: o lote 1 do gabarito (26 vacas, 351,4464/@, carcaca 7.051,50, SENAR 330,43, liquido 164.884,52)
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "abate"}'); oa := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_lotes(oa, k, (x->>'versao')::int,
         '[{"ordem": 1, "categoria_negociada": "vacas", "qtd_negociada": 26, "peso_medio_negociado_kg": 518.59, "criterio_valor": "kg"}]');
  select id into la from zoo_operacao_lotes where operacao_id = oa;
  x := public.oc_salvar_abate(oa, k, (select versao from zoo_operacoes_comerciais where id = oa), 'realizado', jsonb_build_array(jsonb_build_object(
         'operacao_lote_id', la, 'peso_carcaca_kg', 7051.50, 'peso_carcaca_fonte', 'total', 'rendimento_carcaca_pct', 52.2972,
         'preco_arroba', 351.4464, 'preco_fonte', 'arroba', 'senar_valor', 330.43, 'senar_fonte', 'reais', 'valor_liquido', 164884.52)));
  ve := public._oc_cc_valor_entrega_do_lote(la);
  if (ve->>'bruto')::numeric is distinct from 165214.95 or (ve->>'senar')::numeric is distinct from 330.43
     or (ve->>'funrural')::numeric is distinct from 0 or (ve->>'liquido')::numeric is distinct from 164884.52 then
    raise exception 'S1 valor da entrega: %', ve; end if;
  if (select senar_valor from zoo_operacao_abate where operacao_lote_id = la) is distinct from 330.43 then raise exception 'S1 senar gravado'; end if;

  -- S2: a saida (26 vacas) -> entrega 165.214,95 + deducao 'senar' 330,43; nenhuma 'funrural'
  x := public.oc_registrar_movimentacao(oa, k, la, '2031-05-10', 'vacas', 26, 518.59, null, null);
  select count(*) into n from zoo_operacao_partes where operacao_id = oa and not cancelada and componente = 'funrural';
  if n <> 0 then raise exception 'S2 nasceu deducao funrural (%)', n; end if;
  select count(*), sum(p.valor), min(p.descricao) into n, v, t from zoo_operacao_partes p
   where p.operacao_id = oa and not p.cancelada and p.natureza = 'deducao' and p.componente = 'senar';
  if n <> 1 or v is distinct from 330.43 or t not like 'SENAR retido · %' then raise exception 'S2 deducao senar: % · % · %', n, v, t; end if;
  if (select sum(valor) from zoo_operacao_partes where operacao_id = oa and not cancelada and componente = 'entrega') is distinct from 165214.95 then
    raise exception 'S2 entrega pelo bruto'; end if;
  if not exists (select 1 from zoo_operacao_partes p join financeiro_lancamentos_v2 l on l.id = p.financeiro_lancamento_id
                  where p.operacao_id = oa and p.componente = 'senar' and not p.cancelada and l.subcentro = 'Impostos e Despesas de Abates e Vendas'
                    and l.sem_movimentacao_caixa and l.origem_tipo = 'oc:deducao:senar' and not l.cancelado) then
    raise exception 'S2 lancamento da deducao senar (5030, sem caixa, origem oc:deducao:senar)'; end if;

  -- S3: Funrural 100 + SENAR 50 no mesmo lote -> duas deducoes; bruto = liquido + 150
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "abate"}'); ob := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_lotes(ob, k, (x->>'versao')::int,
         '[{"ordem": 1, "categoria_negociada": "vacas", "qtd_negociada": 10, "peso_medio_negociado_kg": 450, "criterio_valor": "kg"}]');
  select id into lb from zoo_operacao_lotes where operacao_id = ob;
  x := public.oc_salvar_abate(ob, k, (select versao from zoo_operacoes_comerciais where id = ob), 'realizado', jsonb_build_array(jsonb_build_object(
         'operacao_lote_id', lb, 'peso_carcaca_kg', 2400, 'peso_carcaca_fonte', 'total', 'rendimento_carcaca_pct', 53.3333,
         'preco_arroba', 300, 'preco_fonte', 'arroba', 'funrural_valor', 100, 'funrural_fonte', 'reais',
         'senar_valor', 50, 'senar_fonte', 'reais', 'valor_liquido', 47850)));
  if (public._oc_cc_valor_entrega_do_lote(lb)->>'bruto')::numeric is distinct from 48000 then raise exception 'S3 bruto'; end if;
  -- S4: duas saidas (6 + 4) fecham o lote: cada deducao se reparte pelo kg e a soma e' a do lote
  x := public.oc_registrar_movimentacao(ob, k, lb, '2031-05-10', 'vacas', 6, 450, null, null);
  x := public.oc_registrar_movimentacao(ob, k, lb, '2031-05-11', 'vacas', 4, 450, null, null);
  if (select sum(valor) from zoo_operacao_partes where operacao_id = ob and not cancelada and componente = 'funrural') is distinct from 100
     or (select sum(valor) from zoo_operacao_partes where operacao_id = ob and not cancelada and componente = 'senar') is distinct from 50
     or (select count(*) from zoo_operacao_partes where operacao_id = ob and not cancelada and componente = 'senar') <> 2
     or (select sum(valor) from zoo_operacao_partes where operacao_id = ob and not cancelada and componente = 'entrega') is distinct from 48000 then
    raise exception 'S3/S4 deducoes: f % · s % · entregas %',
      (select sum(valor) from zoo_operacao_partes where operacao_id = ob and not cancelada and componente = 'funrural'),
      (select sum(valor) from zoo_operacao_partes where operacao_id = ob and not cancelada and componente = 'senar'),
      (select sum(valor) from zoo_operacao_partes where operacao_id = ob and not cancelada and componente = 'entrega'); end if;

  -- S5: SENAR em % recusa no valor da entrega; SENAR sem fonte recusa no salvar
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "abate"}'); oc := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_lotes(oc, k, (x->>'versao')::int,
         '[{"ordem": 1, "categoria_negociada": "vacas", "qtd_negociada": 5, "peso_medio_negociado_kg": 450, "criterio_valor": "kg"}]');
  select id into lc from zoo_operacao_lotes where operacao_id = oc;
  t := null;
  begin
    x := public.oc_salvar_abate(oc, k, (select versao from zoo_operacoes_comerciais where id = oc), 'realizado', jsonb_build_array(jsonb_build_object(
           'operacao_lote_id', lc, 'peso_carcaca_kg', 1200, 'peso_carcaca_fonte', 'total', 'rendimento_carcaca_pct', 53.3333, 'preco_arroba', 300, 'preco_fonte', 'arroba',
           'senar_valor', 48, 'valor_liquido', 23952)));
  exception when others then t := sqlerrm; end;
  if t is null or t not like '%senar%sem fonte%' then raise exception 'S5 senar sem fonte deveria recusar: %', t; end if;
  x := public.oc_salvar_abate(oc, k, (select versao from zoo_operacoes_comerciais where id = oc), 'realizado', jsonb_build_array(jsonb_build_object(
         'operacao_lote_id', lc, 'peso_carcaca_kg', 1200, 'peso_carcaca_fonte', 'total', 'rendimento_carcaca_pct', 53.3333, 'preco_arroba', 300, 'preco_fonte', 'arroba',
         'senar_valor', 0.2, 'senar_fonte', 'pct', 'valor_liquido', 23952)));
  t := null;
  begin perform public._oc_cc_valor_entrega_do_lote(lc); exception when others then t := sqlerrm; end;
  if t is null or t not like '%SENAR do abate esta em %' then raise exception 'S5 senar em %% deveria recusar: %', t; end if;

  -- S6: SENAR a zero no lote b -> as deducoes SENAR saem (canceladas); as de Funrural ficam
  x := public.oc_salvar_abate(ob, k, (select versao from zoo_operacoes_comerciais where id = ob), 'realizado', jsonb_build_array(jsonb_build_object(
         'operacao_lote_id', lb, 'peso_carcaca_kg', 2400, 'peso_carcaca_fonte', 'total', 'rendimento_carcaca_pct', 53.3333,
         'preco_arroba', 300, 'preco_fonte', 'arroba', 'funrural_valor', 100, 'funrural_fonte', 'reais',
         'senar_valor', 0, 'senar_fonte', 'reais', 'valor_liquido', 47900)));
  if exists (select 1 from zoo_operacao_partes where operacao_id = ob and not cancelada and componente = 'senar')
     or (select sum(valor) from zoo_operacao_partes where operacao_id = ob and not cancelada and componente = 'funrural') is distinct from 100 then
    raise exception 'S6 senar a zero'; end if;

  -- S7: o preco do lancamento do rebanho (lote a): (164.884,52 + 330,43) / (7.051,50 / 15) = 351,4464
  select l.preco_arroba into v from zoo_operacao_movimentacoes m join lancamentos l on l.id = m.movimentacao_id
   where m.operacao_id = oa and not coalesce(l.cancelado, false) limit 1;
  if v is distinct from 351.4464 then raise exception 'S7 preco do lancamento do rebanho: % (esperado 351,4464)', v; end if;

  raise exception 'OK IMPORTAR-ABATE-01 D5 · S1–S7 (SENAR componente proprio; Funrural intacto)';
end $teste$;
ROLLBACK;
