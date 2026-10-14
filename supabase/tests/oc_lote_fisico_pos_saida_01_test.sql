-- OC-LOTE-FISICO-POS-SAIDA-01 — quantidade e peso do lote mudam depois da saida, e a saida REGISTRADA acompanha.
-- Sintetico no cliente Teste (OCs construidas pelas RPCs reais), numa transacao revertida; termina em RAISE 'OK …'.
-- Compara com `is distinct from`, nunca `<>`.
--   F1 venda em kg, 1 saida registrada: qtd 18 -> 17 e peso 480 -> 490 -> lote e saida iguais (quantidade, peso_medio_kg,
--      peso_vivo_total), evento 'ajustar_fisico_apos_saida' com antes/depois, categoria intacta
--   F2 so' a categoria muda -> a saida so' muda a categoria (o caminho antigo), nenhum evento novo de ajuste
--   F3 lote com 2 saidas ativas -> recusa "tem 2 saidas ativas", nada gravado
--   F4 lote so' com saida adotada -> recusa "saida adotada", saida intacta
--   F5 valor_total: na venda em kg = R$/cab × qtd recalculado (F1); no abate INTOCADO (e' do acerto)
--   F6 venda em conta corrente: a entrega acompanha (83.300) e a versao devolvida = a gravada
--   F7 mes da saida fechado (P1 oficial) -> recusa com a frase do guard, tanto so' qtd quanto so' peso; nada gravado
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_mes constant text := 'Mês 2031-05 está fechado no Mapa de Pastos (P1 oficial). Reabra o período para alterar campos estruturais.';
  v_forn uuid; fp jsonb; x jsonb; t text; v_ver int; v_ok text := ''; q record; n int;
  ov uuid; lv uuid; s1 uuid; o3 uuid; l3 uuid; o4 uuid; l4 uuid; s4 uuid; oa uuid; la uuid; sa uuid; o7 uuid; l7 uuid; s7 uuid; v_pasto uuid;
  v_antes text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);
  select id into v_forn from financeiro_fornecedores where cliente_id = k and ativo order by created_at limit 1;
  fp := jsonb_build_object('fazenda_id', f, 'contraparte_id', v_forn, 'data_operacao', '2031-04-10');

  -- F1/F5/F6 venda em kg (R$ 10/kg), 1 saida registrada de 18 cab · 480 kg
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "venda"}'); ov := (x->>'operacao_id')::uuid;
  select versao into v_ver from zoo_operacoes_comerciais where id = ov;
  x := public.oc_salvar_lotes(ov, k, v_ver, '[{"ordem": 1, "categoria_negociada": "vacas", "qtd_negociada": 18,
         "peso_medio_negociado_kg": 480, "criterio_valor": "kg", "valor_informado": 10}]');
  select id into lv from zoo_operacao_lotes where operacao_id = ov;
  x := public.oc_registrar_movimentacao(ov, k, lv, '2031-04-11', 'vacas', 18, 480, null, 'SINT F1');
  s1 := (x->>'lancamento_id')::uuid;
  if (select valor_total from lancamentos where id = s1) is distinct from 86400.00 then
    raise exception 'F1 preparo: valor da saida %', (select valor_total from lancamentos where id = s1); end if;
  select versao into v_ver from zoo_operacoes_comerciais where id = ov;
  x := public.oc_salvar_lotes(ov, k, v_ver, '[{"ordem": 1, "categoria_negociada": "vacas", "qtd_negociada": 17,
         "peso_medio_negociado_kg": 490, "criterio_valor": "kg", "valor_informado": 10}]');
  select l.quantidade, l.peso_medio_kg, l.peso_vivo_total, l.valor_total, l.categoria into q from lancamentos l where l.id = s1;
  if q.quantidade is distinct from 17 or q.peso_medio_kg is distinct from 490::numeric or q.peso_vivo_total is distinct from 8330::numeric
     or q.categoria is distinct from 'vacas' then
    raise exception 'F1 saida: % cab · % kg · total % · %', q.quantidade, q.peso_medio_kg, q.peso_vivo_total, q.categoria; end if;
  if (select qtd_negociada from zoo_operacao_lotes where id = lv) is distinct from 17
     or (select peso_medio_negociado_kg from zoo_operacao_lotes where id = lv) is distinct from 490::numeric then
    raise exception 'F1 lote nao gravou'; end if;
  select e.dados_novos d into q from zoo_operacao_eventos e where e.operacao_id = ov and e.acao = 'ajustar_fisico_apos_saida';
  if not found or (q.d->>'saida_id')::uuid is distinct from s1 or (q.d->>'qtd_antes')::int is distinct from 18
     or (q.d->>'qtd_depois')::int is distinct from 17 or (q.d->>'peso_antes')::numeric is distinct from 480
     or (q.d->>'peso_depois')::numeric is distinct from 490 or (q.d->>'lote_id')::uuid is distinct from lv then
    raise exception 'F1 evento: %', q.d; end if;
  v_ok := v_ok || 'F1 ok; ';
  -- F5 (venda): R$/cab do lote novo (4.900) × 17
  if (select valor_total from lancamentos where id = s1) is distinct from 83300.00 then
    raise exception 'F5 venda valor: %', (select valor_total from lancamentos where id = s1); end if;
  -- F6 a entrega da conta corrente acompanha e a versao devolvida e' a gravada
  if (select modelo_financeiro from zoo_operacoes_comerciais where id = ov) is distinct from 'conta_corrente' then
    raise exception 'F6 preparo: a venda nao e'' conta corrente'; end if;
  if (select coalesce(sum(p.valor), 0) from zoo_operacao_partes p where p.operacao_id = ov and p.origem = 'entrega' and p.cancelada = false)
       is distinct from 83300.00 then
    raise exception 'F6 entrega: %', (select sum(p.valor) from zoo_operacao_partes p where p.operacao_id = ov and p.origem = 'entrega' and p.cancelada = false); end if;
  if (x->>'versao')::int is distinct from (select versao from zoo_operacoes_comerciais where id = ov) then
    raise exception 'F6 versao devolvida % x gravada %', x->>'versao', (select versao from zoo_operacoes_comerciais where id = ov); end if;
  v_ok := v_ok || 'F5v ok; F6 ok; ';

  -- F2 so' a categoria: a saida so' muda a categoria, e nenhum ajuste novo
  select md5(row(l.quantidade, l.peso_medio_kg, l.peso_vivo_total, l.valor_total, l.data, l.fazenda_id, l.cancelado)::text) into v_antes
    from lancamentos l where l.id = s1;
  select versao into v_ver from zoo_operacoes_comerciais where id = ov;
  x := public.oc_salvar_lotes(ov, k, v_ver, '[{"ordem": 1, "categoria_negociada": "bois", "qtd_negociada": 17,
         "peso_medio_negociado_kg": 490, "criterio_valor": "kg", "valor_informado": 10}]');
  if (select categoria from lancamentos where id = s1) is distinct from 'bois'
     or (select md5(row(l.quantidade, l.peso_medio_kg, l.peso_vivo_total, l.valor_total, l.data, l.fazenda_id, l.cancelado)::text)
           from lancamentos l where l.id = s1) is distinct from v_antes
     or (select count(*) from zoo_operacao_eventos e where e.operacao_id = ov and e.acao = 'ajustar_fisico_apos_saida') is distinct from 1::bigint then
    raise exception 'F2 so'' categoria mexeu em outra coisa'; end if;
  v_ok := v_ok || 'F2 ok; ';

  -- F3 duas saidas ativas: recusa, nada gravado
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "venda"}'); o3 := (x->>'operacao_id')::uuid;
  select versao into v_ver from zoo_operacoes_comerciais where id = o3;
  x := public.oc_salvar_lotes(o3, k, v_ver, '[{"ordem": 1, "categoria_negociada": "vacas", "qtd_negociada": 20,
         "peso_medio_negociado_kg": 450, "criterio_valor": "kg", "valor_informado": 10}]');
  select id into l3 from zoo_operacao_lotes where operacao_id = o3;
  x := public.oc_registrar_movimentacao(o3, k, l3, '2031-04-11', 'vacas', 10, 450, null, 'SINT F3 a');
  x := public.oc_registrar_movimentacao(o3, k, l3, '2031-04-12', 'vacas', 10, 450, null, 'SINT F3 b');
  select versao into v_ver from zoo_operacoes_comerciais where id = o3;
  t := null;
  begin
    x := public.oc_salvar_lotes(o3, k, v_ver, '[{"ordem": 1, "categoria_negociada": "vacas", "qtd_negociada": 19,
           "peso_medio_negociado_kg": 450, "criterio_valor": "kg", "valor_informado": 10}]');
  exception when sqlstate 'P0001' then t := sqlerrm; end;
  if t is null or t not like 'Lote vacas (ordem 1) tem 2 saídas ativas (%): estorne pela aba Entrega e registre de novo para alterar quantidade ou peso.' then
    raise exception 'F3 recusa: %', t; end if;
  if (select qtd_negociada from zoo_operacao_lotes where id = l3) is distinct from 20 then raise exception 'F3 o lote gravou'; end if;
  v_ok := v_ok || 'F3 ok; ';

  -- F4 so' saida adotada: recusa, saida intacta (a origem e' forcada SO' AQUI, sobre uma saida registrada)
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "venda"}'); o4 := (x->>'operacao_id')::uuid;
  select versao into v_ver from zoo_operacoes_comerciais where id = o4;
  x := public.oc_salvar_lotes(o4, k, v_ver, '[{"ordem": 1, "categoria_negociada": "vacas", "qtd_negociada": 12,
         "peso_medio_negociado_kg": 450, "criterio_valor": "kg", "valor_informado": 10}]');
  select id into l4 from zoo_operacao_lotes where operacao_id = o4;
  x := public.oc_registrar_movimentacao(o4, k, l4, '2031-04-11', 'vacas', 12, 450, null, 'SINT F4');
  s4 := (x->>'lancamento_id')::uuid;
  update zoo_operacao_movimentacoes set origem = 'adotada' where movimentacao_id = s4;
  select versao into v_ver from zoo_operacoes_comerciais where id = o4;
  t := null;
  begin
    x := public.oc_salvar_lotes(o4, k, v_ver, '[{"ordem": 1, "categoria_negociada": "vacas", "qtd_negociada": 12,
           "peso_medio_negociado_kg": 455, "criterio_valor": "kg", "valor_informado": 10}]');
  exception when sqlstate 'P0001' then t := sqlerrm; end;
  if t is null or t not like 'Lote vacas (ordem 1) tem saída adotada (%): quantidade e peso dessa saída se corrigem em Lançar movimentação, não pela operação.' then
    raise exception 'F4 recusa: %', t; end if;
  if (select peso_medio_kg from lancamentos where id = s4) is distinct from 450::numeric then raise exception 'F4 a saida mudou'; end if;
  v_ok := v_ok || 'F4 ok; ';

  -- F5 (abate): o peso desce para a saida; o valor_total (do acerto) NAO muda
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "abate"}'); oa := (x->>'operacao_id')::uuid;
  select versao into v_ver from zoo_operacoes_comerciais where id = oa;
  x := public.oc_salvar_lotes(oa, k, v_ver, '[{"ordem": 1, "categoria_negociada": "vacas", "qtd_negociada": 18,
         "peso_medio_negociado_kg": 481.78, "criterio_valor": "kg"}]');
  select id into la from zoo_operacao_lotes where operacao_id = oa;
  select versao into v_ver from zoo_operacoes_comerciais where id = oa;
  x := public.oc_salvar_abate(oa, k, v_ver, 'realizado', jsonb_build_array(jsonb_build_object(
         'operacao_lote_id', la, 'peso_carcaca_kg', 4320, 'peso_carcaca_fonte', 'total', 'rendimento_carcaca_pct', 53, 'preco_arroba', 372.86,
         'preco_fonte', 'arroba', 'funrural_valor', 209.77, 'funrural_fonte', 'reais', 'valor_liquido', 104712.87)));
  x := public.oc_registrar_movimentacao(oa, k, la, '2031-04-11', 'vacas', 18, 481.78, null, 'SINT F5 abate');
  sa := (x->>'lancamento_id')::uuid;
  if (select valor_total from lancamentos where id = sa) is distinct from 104712.87 then
    raise exception 'F5 abate preparo: valor %', (select valor_total from lancamentos where id = sa); end if;
  select versao into v_ver from zoo_operacoes_comerciais where id = oa;
  x := public.oc_salvar_lotes(oa, k, v_ver, '[{"ordem": 1, "categoria_negociada": "vacas", "qtd_negociada": 18,
         "peso_medio_negociado_kg": 491.78, "criterio_valor": "kg"}]');
  if (select peso_medio_kg from lancamentos where id = sa) is distinct from 491.78::numeric
     or (select peso_vivo_total from lancamentos where id = sa) is distinct from 8852.04::numeric
     or (select valor_total from lancamentos where id = sa) is distinct from 104712.87 then
    raise exception 'F5 abate: peso % · total % · valor %', (select peso_medio_kg from lancamentos where id = sa),
      (select peso_vivo_total from lancamentos where id = sa), (select valor_total from lancamentos where id = sa); end if;
  v_ok := v_ok || 'F5a ok; ';

  -- F7 mes da saida fechado: um pasto do Teste com o card de 2031-05 'fechado' (P1 oficial pela interna do guard)
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "venda"}'); o7 := (x->>'operacao_id')::uuid;
  select versao into v_ver from zoo_operacoes_comerciais where id = o7;
  x := public.oc_salvar_lotes(o7, k, v_ver, '[{"ordem": 1, "categoria_negociada": "vacas", "qtd_negociada": 15,
         "peso_medio_negociado_kg": 450, "criterio_valor": "kg", "valor_informado": 10}]');
  select id into l7 from zoo_operacao_lotes where operacao_id = o7;
  x := public.oc_registrar_movimentacao(o7, k, l7, '2031-05-11', 'vacas', 15, 450, null, 'SINT F7');
  s7 := (x->>'lancamento_id')::uuid;
  insert into pastos (fazenda_id, nome) values (f, 'SINT pasto F7') returning id into v_pasto;
  insert into fechamento_pastos (pasto_id, fazenda_id, ano_mes, status) values (v_pasto, f, '2031-05', 'fechado');
  if (public._fn_status_pilares_fechamento(f, '2031-05') #>> '{p1_mapa_pastos,status}') is distinct from 'oficial' then
    raise exception 'F7 preparo: o mes nao fechou'; end if;
  for n in 1 .. 2 loop
    select versao into v_ver from zoo_operacoes_comerciais where id = o7;
    t := null;
    begin
      x := public.oc_salvar_lotes(o7, k, v_ver, case n
             when 1 then '[{"ordem": 1, "categoria_negociada": "vacas", "qtd_negociada": 14, "peso_medio_negociado_kg": 450, "criterio_valor": "kg", "valor_informado": 10}]'::jsonb
             else        '[{"ordem": 1, "categoria_negociada": "vacas", "qtd_negociada": 15, "peso_medio_negociado_kg": 452, "criterio_valor": "kg", "valor_informado": 10}]'::jsonb end);
    exception when sqlstate 'P0001' then t := sqlerrm; end;
    if t is distinct from c_mes then raise exception 'F7 (% %) recusa: %', n, case n when 1 then 'qtd' else 'peso' end, t; end if;
  end loop;
  if (select qtd_negociada from zoo_operacao_lotes where id = l7) is distinct from 15
     or (select peso_medio_negociado_kg from zoo_operacao_lotes where id = l7) is distinct from 450::numeric
     or (select peso_medio_kg from lancamentos where id = s7) is distinct from 450::numeric
     or (select quantidade from lancamentos where id = s7) is distinct from 15 then raise exception 'F7 algo gravou'; end if;
  v_ok := v_ok || 'F7 ok';

  raise exception 'OK oc_lote_fisico_pos_saida_01 (%)', v_ok;
end $teste$;
ROLLBACK;
