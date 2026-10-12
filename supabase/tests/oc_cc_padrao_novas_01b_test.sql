-- OC-CC-PADRAO-NOVAS-01b — o gancho da saida: em conta corrente a entrega acompanha o gado, e as seis funcoes devolvem a versao real.
-- Sintetico no cliente Teste, numa transacao revertida; termina em RAISE 'OK …'. Compara com `is distinct from`, nunca `<>`.
--   R1 registrar a saida numa OC em conta corrente: a entrega aparece em oc_conta_corrente sem "Atualizar entregas"
--   R2 estornar: a entrega e' cancelada (e a OC volta a 'aguardando_saida')
--   R3 adotar uma saida ja' lancada: a entrega aparece
--   R4 encerrar a entrega: sincroniza (o lote mudou de valor por fora; a entrega acompanha)
--   R5 receber conforme negociado (compra): a entrega aparece
--   R6 desvincular a saida adotada: a entrega e' cancelada
--   R7 o gancho NAO age em OC titulo, boitel nem rascunho; e a recusa do sincronizador (lote sem valor) nao derruba a saida
--   R8 em todas as seis, a versao devolvida = a versao gravada
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_boitel constant jsonb := '{"dias": 90, "gmd": 1.2, "rendimento_saida_pct": 54, "custo_diaria": 18, "preco_venda_arroba": 300}';
  c_lote constant jsonb := '[{"ordem": 1, "categoria_negociada": "desmama_m", "qtd_negociada": 10, "peso_medio_negociado_kg": 200, "criterio_valor": "total", "valor_informado": 10000}]';
  v_forn uuid; fp jsonb; x jsonb; cc jsonb; g jsonb;
  ov uuid; oc uuid; ot uuid; ob uuid; orr uuid; onn uuid; lv uuid; lc uuid; lt uuid; lb uuid; ln uuid; la uuid; m uuid;
  v_real int; v_antes int; v_st text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);
  select id into v_forn from financeiro_fornecedores where cliente_id = k and ativo order by created_at limit 1;
  fp := jsonb_build_object('fazenda_id', f, 'contraparte_id', v_forn, 'data_operacao', '2031-03-10');

  -- a venda em conta corrente, fora de rascunho, com um lote de 10 cab por 10.000,00
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "venda"}'); ov := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_lotes(ov, k, (x->>'versao')::int, c_lote);
  if (x->>'rascunho')::boolean is distinct from false or (select modelo_financeiro from zoo_operacoes_comerciais where id = ov) is distinct from 'conta_corrente' then
    raise exception 'preparo: a venda deveria estar em conta corrente e fora de rascunho (%)', x; end if;
  select id into lv from zoo_operacao_lotes where operacao_id = ov;

  -- R1 registrar
  x := public.oc_registrar_movimentacao(ov, k, lv, '2031-03-11', 'desmama_m', 10, 200, null, 'SINT saida');
  select versao into v_real from zoo_operacoes_comerciais where id = ov; cc := public.oc_conta_corrente(ov);
  if (x->>'versao')::int is distinct from v_real then raise exception 'R8 registrar: devolveu % e gravou %', x->>'versao', v_real; end if;
  if (x->'entregas'->>'sincronizou') is distinct from 'true' or (x->'entregas'->>'criadas')::int is distinct from 1
     or (cc->>'entregue')::numeric is distinct from 10000 or (cc->>'saidas_sem_entrega')::int is distinct from 0
     or cc->>'situacao' is distinct from 'falta_receber' then
    raise exception 'R1 registrar: gancho % · entregue % · pendentes % · situacao %', x->'entregas', cc->>'entregue', cc->>'saidas_sem_entrega', cc->>'situacao'; end if;

  -- R2 estornar
  m := (x->>'movimentacao_id')::uuid; v_antes := v_real;
  x := public.oc_estornar_movimentacao(m, k, 'teste');
  select versao into v_real from zoo_operacoes_comerciais where id = ov; cc := public.oc_conta_corrente(ov);
  if (x->>'versao')::int is distinct from v_real or v_real is distinct from v_antes + 1 then raise exception 'R8 estornar: devolveu %, gravou % (antes %)', x->>'versao', v_real, v_antes; end if;
  if (x->'entregas'->>'canceladas')::int is distinct from 1 or (cc->>'entregue')::numeric is distinct from 0 or cc->>'situacao' is distinct from 'aguardando_saida' then
    raise exception 'R2 estornar: gancho % · entregue % · situacao %', x->'entregas', cc->>'entregue', cc->>'situacao'; end if;

  -- R3 adotar uma saida ja' lancada
  insert into lancamentos (cliente_id, fazenda_id, tipo, categoria, quantidade, data, peso_medio_kg, peso_vivo_total, valor_total, cenario, status_operacional,
    origem_registro, observacao, fornecedor_id, fornecedor_nome_snapshot)
  values (k, f, 'venda', 'desmama_m', 10, '2031-03-12', 200, 2000, 10000, 'realizado', 'realizado', 'manual', 'SINT saida avulsa', v_forn, 'SINT')
  returning id into la;
  x := public.oc_adotar_movimentacao(ov, k, lv, la, v_real);
  select versao into v_real from zoo_operacoes_comerciais where id = ov; cc := public.oc_conta_corrente(ov);
  if (x->>'versao')::int is distinct from v_real then raise exception 'R8 adotar: devolveu % e gravou %', x->>'versao', v_real; end if;
  if (x->'entregas'->>'criadas')::int is distinct from 1 or (cc->>'entregue')::numeric is distinct from 10000 or (cc->>'saidas_sem_entrega')::int is distinct from 0 then
    raise exception 'R3 adotar: gancho % · entregue % · pendentes %', x->'entregas', cc->>'entregue', cc->>'saidas_sem_entrega'; end if;

  -- R6 desvincular a adotada
  x := public.oc_desvincular_movimentacao((x->>'movimentacao_id')::uuid, k, v_real, 'teste');
  select versao into v_real from zoo_operacoes_comerciais where id = ov; cc := public.oc_conta_corrente(ov);
  if (x->>'versao')::int is distinct from v_real then raise exception 'R8 desvincular: devolveu % e gravou %', x->>'versao', v_real; end if;
  if (x->'entregas'->>'canceladas')::int is distinct from 1 or (cc->>'entregue')::numeric is distinct from 0 then
    raise exception 'R6 desvincular: gancho % · entregue %', x->'entregas', cc->>'entregue'; end if;

  -- R4 encerrar: a saida volta, o lote muda de valor POR FORA (a entrega fica velha) e o encerrar a acerta
  perform public.oc_registrar_movimentacao(ov, k, lv, '2031-03-13', 'desmama_m', 10, 200, null, 'SINT saida');
  update zoo_operacao_lotes set valor_informado = 12000 where id = lv;
  select versao into v_real from zoo_operacoes_comerciais where id = ov;
  x := public.oc_encerrar_entrega(ov, k, v_real, null);
  select versao into v_real from zoo_operacoes_comerciais where id = ov; cc := public.oc_conta_corrente(ov);
  if (x->>'versao')::int is distinct from v_real then raise exception 'R8 encerrar: devolveu % e gravou %', x->>'versao', v_real; end if;
  if (x->'entregas'->>'atualizadas')::int is distinct from 1 or (cc->>'entregue')::numeric is distinct from 12000 then
    raise exception 'R4 encerrar: gancho % · entregue %', x->'entregas', cc->>'entregue'; end if;

  -- R5 compra: receber conforme negociado
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "compra"}'); oc := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_lotes(oc, k, (x->>'versao')::int, c_lote);
  select id into lc from zoo_operacao_lotes where operacao_id = oc;
  x := public.oc_receber_lotes(oc, k, (x->>'versao')::int,
    jsonb_build_array(jsonb_build_object('lote_id', lc, 'data', '2031-03-11', 'categoria', 'desmama_m', 'quantidade', 10, 'peso_medio_kg', 200)));
  select versao into v_real from zoo_operacoes_comerciais where id = oc; cc := public.oc_conta_corrente(oc);
  if (x->>'versao')::int is distinct from v_real then raise exception 'R8 receber_lotes: devolveu % e gravou %', x->>'versao', v_real; end if;
  if (x->>'recebidos')::int is distinct from 1 or (cc->>'entregue')::numeric is distinct from 10000 or (cc->>'saidas_sem_entrega')::int is distinct from 0 then
    raise exception 'R5 receber_lotes: % · entregue % · pendentes %', x, cc->>'entregue', cc->>'saidas_sem_entrega'; end if;

  -- R7a titulo: a mesma venda, levada a titulo por fora — o gancho nao age e a versao e' a de sempre
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "venda"}'); ot := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_lotes(ot, k, (x->>'versao')::int, c_lote);
  update zoo_operacoes_comerciais set modelo_financeiro = 'titulo' where id = ot;
  select id into lt from zoo_operacao_lotes where operacao_id = ot; select versao into v_antes from zoo_operacoes_comerciais where id = ot;
  x := public.oc_registrar_movimentacao(ot, k, lt, '2031-03-11', 'desmama_m', 10, 200, null, 'SINT saida');
  select versao into v_real from zoo_operacoes_comerciais where id = ot;
  if (x->'entregas'->>'sincronizou') is distinct from 'false' or jsonb_array_length(x->'entregas'->'avisos') is distinct from 0
     or (x->>'versao')::int is distinct from v_real or v_real is distinct from v_antes
     or exists (select 1 from zoo_operacao_partes p where p.operacao_id = ot and p.origem = 'entrega') then
    raise exception 'R7a titulo: gancho % · versao % (antes %, gravada %)', x->'entregas', x->>'versao', v_antes, v_real; end if;

  -- R7b boitel: marcada boitel e levada de volta a conta corrente por fora — a linha de boitel basta para o gancho nao agir
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "venda"}'); ob := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_lotes(ob, k, (x->>'versao')::int, c_lote);
  x := public.oc_salvar_boitel(ob, k, (x->>'versao')::int, 'projetado', c_boitel);
  update zoo_operacoes_comerciais set modelo_financeiro = 'conta_corrente' where id = ob;
  select id into lb from zoo_operacao_lotes where operacao_id = ob;
  x := public.oc_registrar_movimentacao(ob, k, lb, '2031-03-11', 'desmama_m', 10, 200, null, 'SINT saida');
  if (x->'entregas'->>'sincronizou') is distinct from 'false' or jsonb_array_length(x->'entregas'->'avisos') is distinct from 0
     or exists (select 1 from zoo_operacao_partes p where p.operacao_id = ob and p.origem = 'entrega') then
    raise exception 'R7b boitel: gancho %', x->'entregas'; end if;

  -- R7c rascunho: o gancho, chamado direto, nao age
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "venda"}'); orr := (x->>'operacao_id')::uuid;
  g := public._oc_cc_gancho_entregas(orr);
  if g->>'sincronizou' is distinct from 'false' or jsonb_array_length(g->'avisos') is distinct from 0 or (g->>'versao')::int is distinct from (x->>'versao')::int then raise exception 'R7c rascunho: %', g; end if;

  -- R7d a recusa do sincronizador NAO derruba a saida: lote sem valor -> a saida entra, pendente, com o aviso na trilha
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "venda"}'); onn := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_lotes(onn, k, (x->>'versao')::int, c_lote);
  select id into ln from zoo_operacao_lotes where operacao_id = onn;
  update zoo_operacao_lotes set valor_informado = null where id = ln;
  v_st := null;
  begin x := public.oc_registrar_movimentacao(onn, k, ln, '2031-03-11', 'desmama_m', 10, 200, null, 'SINT saida'); v_st := 'PASSOU';
  exception when others then v_st := sqlstate || ' ' || sqlerrm; end;
  cc := public.oc_conta_corrente(onn); select versao into v_real from zoo_operacoes_comerciais where id = onn;
  if v_st is distinct from 'PASSOU' or (x->'entregas'->>'sincronizou') is distinct from 'false'
     or (x->'entregas'->'avisos'->0->>'codigo') is distinct from 'entregas_nao_sincronizadas' or (cc->>'saidas_sem_entrega')::int is distinct from 1
     or (x->>'versao')::int is distinct from v_real
     or not exists (select 1 from zoo_operacao_eventos e where e.operacao_id = onn and e.acao = 'aviso_entregas') then
    raise exception 'R7d saida com lote sem valor: % · gancho % · pendentes %', v_st, x->'entregas', cc->>'saidas_sem_entrega'; end if;

  if has_function_privilege('authenticated', 'public._oc_cc_gancho_entregas(uuid)', 'EXECUTE') then raise exception 'gancho aberto a authenticated'; end if;
  raise exception 'OK oc_cc_padrao_novas_01b (R1-R8)';
end $teste$;
ROLLBACK;
