-- OC-DESVINCULAR-COMPETENCIA-01 — desvincular / cancelar a conta corrente devolve competencia, safra e movimentacao de antes do
-- vinculo. Sintetico no cliente Teste, numa transacao revertida; termina em RAISE 'OK …'. Compara com `is distinct from`.
-- ⚠ OC-VINCULO-VALOR (Gabriel 30/10, migration 20261028115090): "Vincular não pode mudar valor, não pode nada, nada, nada". O vinculo
--   NAO troca mais a competencia nem a safra (nem a data da OC, nem a da saida do gado); so' solta a movimentacao antiga (D4). Este
--   teste passou a afirmar isso; a volta continua devolvendo o que o vinculo soltou.
--   T1 TITULO, sem saida: o vinculo MANTEM competencia e safra e solta a movimentacao; o desvincular devolve a movimentacao, e o
--      lancamento fica igual ao de antes (competencia, safra, `ano_mes`), sem mexer em valor, pagamento, conta, plano nem hash
--   T2 editado depois do vinculo: NAO restaura, e o motivo volta
--   T3 CONTA CORRENTE com saida: o vinculo NAO leva mais a competencia a' da saida (nem a safra); so' solta a movimentacao e nao
--      mexe em valor, pagamento, conta, hash nem plano. A VOLTA nao se prova mais aqui: recebimento ja' recebido de conta corrente nao
--      se cancela com a operacao nem se desvincula (regras posteriores a este teste)
--   T4 CONTA CORRENTE sem saida: o vinculo mantem competencia e safra e solta a movimentacao
--   T5 tenant alheio: 42501 no desvincular e no cancelar
--   T6 evento inexistente: motivo 'sem evento de vinculo'
--   T7 os lancamentos que ja' existiam no Teste ficam identicos
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_conta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  c_plano constant uuid := '1a77d67a-8084-4b99-a585-173dbffe0b11';  -- Venda de Desmama Machos (global)
  c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e'; c_alheio constant uuid := '9200e0d0-095f-4ab8-a31a-3052a0faaf56';
  c_lote constant jsonb := '[{"ordem": 1, "categoria_negociada": "desmama_m", "qtd_negociada": 10, "peso_medio_negociado_kg": 200, "criterio_valor": "total", "valor_informado": 10000}]';
  v_forn uuid; fp jsonb; x jsonb; r jsonb; v int; s1 uuid; m1 uuid; m2 uuid; m3 uuid;
  ot uuid; ov uuid; ow uuid; lv uuid; lw uuid; mv uuid; la uuid; lb uuid; lc uuid;
  antes public.financeiro_lancamentos_v2; d public.financeiro_lancamentos_v2;
  v_ids uuid[]; v_fora_a text; v_fora_d text; v_st text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  select array_agg(l.id), md5(coalesce(string_agg(md5(l::text), '' order by l.id), '')) into v_ids, v_fora_a
    from financeiro_lancamentos_v2 l where l.cliente_id = k;
  select id into v_forn from financeiro_fornecedores where cliente_id = k and ativo order by created_at limit 1;
  fp := jsonb_build_object('fazenda_id', f, 'contraparte_id', v_forn, 'data_operacao', '2031-03-10');
  -- safra sintetica que NAO cobre a data da OC nem a da saida: o vinculo a troca por nula, e a volta tem de devolve-la
  insert into financeiro_safras (cliente_id, nome, codigo, escopo_negocio, data_inicio, data_fim)
  values (k, 'SINT ODC 2031', 'SINT-ODC', 'pecuaria', '2031-04-01', '2031-05-31') returning id into s1;
  -- tres movimentacoes de rebanho de origem (o vinculo solta; a volta religa)
  insert into lancamentos (cliente_id, fazenda_id, tipo, categoria, quantidade, data, peso_medio_kg, peso_vivo_total, valor_total, cenario,
    status_operacional, origem_registro, observacao) values
    (k, f, 'venda', 'desmama_m', 1, '2031-04-20', 200, 200, 1000, 'realizado', 'realizado', 'manual', 'SINT ODC mov 1') returning id into m1;
  insert into lancamentos (cliente_id, fazenda_id, tipo, categoria, quantidade, data, peso_medio_kg, peso_vivo_total, valor_total, cenario,
    status_operacional, origem_registro, observacao) values
    (k, f, 'venda', 'desmama_m', 1, '2031-05-05', 200, 200, 1000, 'realizado', 'realizado', 'manual', 'SINT ODC mov 2') returning id into m2;
  insert into lancamentos (cliente_id, fazenda_id, tipo, categoria, quantidade, data, peso_medio_kg, peso_vivo_total, valor_total, cenario,
    status_operacional, origem_registro, observacao) values
    (k, f, 'venda', 'desmama_m', 1, '2031-05-06', 200, 200, 1000, 'realizado', 'realizado', 'manual', 'SINT ODC mov 3') returning id into m3;

  -- ── T1 titulo ──
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "venda"}'); ot := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_lotes(ot, k, (x->>'versao')::int, c_lote);
  update zoo_operacoes_comerciais set modelo_financeiro = 'titulo' where id = ot;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_destino_id, data_competencia, data_pagamento, data_vencimento, valor, sinal,
      tipo_operacao, status_transacao, descricao, subcentro, plano_conta_id, origem_lancamento, ano_mes, cenario, safra_id, movimentacao_rebanho_id, favorecido_id)
  values (k, f, c_conta, '2031-04-20', '2031-04-20', '2031-04-20', 10000, '1', '1-Entradas', 'realizado', 'SINT ODC receb titulo',
      'Venda de Desmama Machos', c_plano, 'manual', '2031-04', 'realizado', s1, m1, v_forn) returning * into antes;
  la := antes.id;
  select versao into v from zoo_operacoes_comerciais where id = ot;
  r := public.oc_vincular_lancamento(ot, v, la, 'principal', 'SINT ODC', null, null, true, false);
  select * into d from financeiro_lancamentos_v2 where id = la;
  if (r->>'ok')::boolean is not true then raise exception 'T1 vincular recusado: %', r; end if;
  -- OC-VINCULO-VALOR: a competencia e a safra FICAM; so' a movimentacao antiga se solta
  if d.data_competencia is distinct from antes.data_competencia or d.safra_id is distinct from antes.safra_id or d.movimentacao_rebanho_id is not null then
    raise exception 'T1 o vinculo mudou a competencia/safra ou nao soltou a mov (competencia %, safra %, mov %)', d.data_competencia, d.safra_id, d.movimentacao_rebanho_id; end if;
  select versao into v from zoo_operacoes_comerciais where id = ot;
  r := public.oc_desvincular_lancamento(ot, v, la, 'SINT ODC');
  select * into d from financeiro_lancamentos_v2 where id = la;
  if d.data_competencia is distinct from antes.data_competencia or d.safra_id is distinct from antes.safra_id
     or d.movimentacao_rebanho_id is distinct from antes.movimentacao_rebanho_id or d.ano_mes is distinct from antes.ano_mes then
    raise exception 'T1 volta errada: competencia % safra % mov % ano_mes %', d.data_competencia, d.safra_id, d.movimentacao_rebanho_id, d.ano_mes; end if;
  if d.valor is distinct from antes.valor or d.data_pagamento is distinct from antes.data_pagamento or d.conta_destino_id is distinct from antes.conta_destino_id
     or d.hash_importacao is distinct from antes.hash_importacao or d.plano_conta_id is distinct from antes.plano_conta_id
     or d.status_transacao is distinct from antes.status_transacao then
    raise exception 'T1 mexeu em valor/pagamento/conta/hash/plano/status'; end if;

  -- ── T2 editado depois do vinculo ──
  select versao into v from zoo_operacoes_comerciais where id = ot;
  r := public.oc_vincular_lancamento(ot, v, la, 'principal', 'SINT ODC', null, null, true, false);
  if (r->>'ok')::boolean is not true then raise exception 'T2 vincular recusado: %', r; end if;
  update financeiro_lancamentos_v2 set data_competencia = '2031-03-15' where id = la;
  select versao into v from zoo_operacoes_comerciais where id = ot;
  r := public.oc_desvincular_lancamento(ot, v, la, 'SINT ODC');
  select * into d from financeiro_lancamentos_v2 where id = la;
  if (r->'competencia_restauro'->>'motivo') is distinct from 'editado depois do vinculo' then raise exception 'T2 motivo: %', r->'competencia_restauro'; end if;
  if d.data_competencia is distinct from date '2031-03-15' or d.movimentacao_rebanho_id is not null then
    raise exception 'T2 sobrescreveu a edicao: competencia % mov %', d.data_competencia, d.movimentacao_rebanho_id; end if;

  -- ── T3 conta corrente com a marca da saida ──
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "venda"}'); ov := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_lotes(ov, k, (x->>'versao')::int, c_lote);
  if (select modelo_financeiro from zoo_operacoes_comerciais where id = ov) is distinct from 'conta_corrente' then raise exception 'T3 preparo: nao nasceu conta corrente'; end if;
  select id into lv from zoo_operacao_lotes where operacao_id = ov;
  x := public.oc_registrar_movimentacao(ov, k, lv, '2031-03-11', 'desmama_m', 10, 200, null, 'SINT ODC saida'); mv := (x->>'movimentacao_id')::uuid;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_destino_id, data_competencia, data_pagamento, data_vencimento, valor, sinal,
      tipo_operacao, status_transacao, descricao, subcentro, plano_conta_id, origem_lancamento, ano_mes, cenario, safra_id, movimentacao_rebanho_id, favorecido_id)
  values (k, f, c_conta, '2031-05-05', '2031-05-05', '2031-05-05', 10000, '1', '1-Entradas', 'realizado', 'SINT ODC receb cc',
      'Venda de Desmama Machos', c_plano, 'manual', '2031-05', 'realizado', s1, m2, v_forn) returning * into antes;
  lb := antes.id;
  select versao into v from zoo_operacoes_comerciais where id = ov;
  r := public.oc_vincular_lancamento(ov, v, lb, null, 'SINT ODC', null, null, true, false);
  select * into d from financeiro_lancamentos_v2 where id = lb;
  if (r->>'ok')::boolean is not true then raise exception 'T3 vincular recusado: %', r; end if;
  -- OC-VINCULO-VALOR: com saida em 11/03 a competencia FICA a do lancamento (05/05) e a safra tambem; so' a mov se solta
  if d.data_competencia is distinct from antes.data_competencia or d.safra_id is distinct from antes.safra_id or d.movimentacao_rebanho_id is not null then
    raise exception 'T3 o vinculo mudou a competencia/safra ou nao soltou a mov (competencia %, safra %, mov %)', d.data_competencia, d.safra_id, d.movimentacao_rebanho_id; end if;
  -- (sem volta aqui: recebimento ja' recebido de conta corrente nao se cancela com a operacao — "o dinheiro moveu" — nem se
  --  desvincula — "vinculo antigo, sem parcela programada"; regras posteriores a este teste)
  if d.valor is distinct from antes.valor or d.data_pagamento is distinct from antes.data_pagamento or d.conta_destino_id is distinct from antes.conta_destino_id
     or d.hash_importacao is distinct from antes.hash_importacao or d.plano_conta_id is distinct from antes.plano_conta_id then
    raise exception 'T3 o vinculo mexeu em valor/pagamento/conta/hash/plano'; end if;

  -- ── T4 conta corrente sem a marca da saida ──
  x := public.oc_salvar_rascunho(null, k, null, fp || '{"tipo_operacao": "venda"}'); ow := (x->>'operacao_id')::uuid;
  x := public.oc_salvar_lotes(ow, k, (x->>'versao')::int, c_lote);
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_destino_id, data_competencia, data_pagamento, data_vencimento, valor, sinal,
      tipo_operacao, status_transacao, descricao, subcentro, plano_conta_id, origem_lancamento, ano_mes, cenario, safra_id, movimentacao_rebanho_id, favorecido_id)
  values (k, f, c_conta, '2031-05-06', '2031-05-06', '2031-05-06', 5000, '1', '1-Entradas', 'realizado', 'SINT ODC receb cc sem saida',
      'Venda de Desmama Machos', c_plano, 'manual', '2031-05', 'realizado', s1, m3, v_forn) returning * into antes;
  lc := antes.id;
  select versao into v from zoo_operacoes_comerciais where id = ow;
  r := public.oc_vincular_lancamento(ow, v, lc, null, 'SINT ODC', null, null, true, false);
  if (r->>'ok')::boolean is not true then raise exception 'T4 vincular recusado: %', r; end if;
  if exists (select 1 from zoo_operacao_eventos e where e.operacao_id = ow and e.acao = 'vincular_recebimento'
              and (e.detalhes->>'competencia_pela_saida') = 'true') then raise exception 'T4 preparo: marcou pela saida sem saida'; end if;
  if (select movimentacao_rebanho_id from financeiro_lancamentos_v2 where id = lc) is not null then raise exception 'T4 preparo: o vinculo nao soltou a mov'; end if;
  select * into d from financeiro_lancamentos_v2 where id = lc;
  if d.data_competencia is distinct from antes.data_competencia or d.safra_id is distinct from antes.safra_id then
    raise exception 'T4 o vinculo mudou a competencia/safra: % %', d.data_competencia, d.safra_id; end if;

  -- ── T5 tenant alheio ──
  perform set_config('request.jwt.claims', json_build_object('sub', c_alheio, 'role', 'authenticated')::text, true);
  v_st := null;
  begin
    perform public.oc_desvincular_lancamento(ot, 1, la, 'SINT ODC');
  exception when others then v_st := sqlstate; end;
  if v_st is distinct from '42501' then raise exception 'T5 desvincular alheio: sqlstate %', v_st; end if;
  v_st := null;
  begin
    perform public._oc_cancelar_conta_corrente(ow, 'SINT ODC', true);
  exception when others then v_st := sqlstate; end;
  if v_st is distinct from '42501' then raise exception 'T5 cancelar alheio: sqlstate %', v_st; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);

  -- ── T6 evento inexistente ──
  r := public._oc_restaurar_competencia(la, gen_random_uuid());
  if (r->>'motivo') is distinct from 'sem evento de vinculo' then raise exception 'T6: %', r; end if;

  -- ── T7 o resto do Teste ──
  select md5(coalesce(string_agg(md5(l::text), '' order by l.id), '')) into v_fora_d from financeiro_lancamentos_v2 l where l.id = any (v_ids);
  if v_fora_d is distinct from v_fora_a then raise exception 'T7 lancamentos que ja existiam mudaram'; end if;

  raise exception 'OK vinculo mantem competencia e safra (titulo e cc com e sem saida), so'' solta a mov; no titulo o desvincular devolve a mov e o lancamento fica igual; editado vence com o motivo; alheio 42501; sem evento; resto do Teste igual';
end $teste$;
ROLLBACK;
