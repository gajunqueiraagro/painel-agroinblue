-- OC-CC-PADRAO-NOVAS-01a — venda e compra novas nascem em conta corrente; abate e boitel em titulo.
-- Sintetico no cliente Teste, numa transacao revertida; termina em RAISE 'OK …'. Compara com `is distinct from`, nunca `<>`.
--   R1 venda nova nasce 'conta_corrente', com o evento 'definir_modelo_financeiro' (de nulo para o valor)
--   R2 compra nova: idem
--   R3 abate novo nasce 'titulo' (o evento diz 'titulo')
--   R4 marcar boitel numa venda em conta corrente sem nada vivo: vira 'titulo', com o evento, e a versao devolvida e' a gravada
--   R5 marcar boitel numa venda em conta corrente com recebimento vivo: recusa P0001 com a frase; nada muda
--   R6 salvar de novo um rascunho que ja' existe NAO mexe no modelo nem repete o evento
--   R7 oc_conta_corrente: sem entrega nem recebimento -> 'aguardando_saida'; com recebimento e sem entrega -> 'adiantado'
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
DO $teste$
declare
  k constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; f constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  c_frase constant text := 'Esta venda ja tem financeiro em conta corrente; desfaca antes de marcar boitel';
  c_boitel constant jsonb := '{"dias": 90, "gmd": 1.2, "rendimento_saida_pct": 54, "custo_diaria": 18, "preco_venda_arroba": 300}';
  v_forn uuid; pe record; x jsonb; a uuid; b uuid; cp uuid; ab uuid; l uuid; q record; v_st text; v_msg text; v_ver int;
  function_payload jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e', 'role', 'authenticated')::text, true);
  select id into v_forn from financeiro_fornecedores where cliente_id = k and ativo order by created_at limit 1;
  select id, subcentro into pe from financeiro_plano_contas where cliente_id is null and ativo and tipo_operacao = '1-Entradas' and macro_custo <> 'Dividendos' order by ordem_exibicao limit 1;
  function_payload := jsonb_build_object('fazenda_id', f, 'contraparte_id', v_forn, 'data_operacao', '2031-03-10');

  -- R1 venda
  x := public.oc_salvar_rascunho(null, k, null, function_payload || '{"tipo_operacao": "venda"}');
  a := (x->>'operacao_id')::uuid;
  select o.modelo_financeiro m, o.versao v, (select count(*) from zoo_operacao_eventos e where e.operacao_id = o.id and e.acao = 'definir_modelo_financeiro') n,
         (select e.dados_novos->>'modelo_financeiro' from zoo_operacao_eventos e where e.operacao_id = o.id and e.acao = 'definir_modelo_financeiro') para,
         (select e.dados_anteriores->'modelo_financeiro' from zoo_operacao_eventos e where e.operacao_id = o.id and e.acao = 'definir_modelo_financeiro') de
    into q from zoo_operacoes_comerciais o where o.id = a;
  if q.m is distinct from 'conta_corrente' or q.n is distinct from 1 or q.para is distinct from 'conta_corrente' or q.de is distinct from 'null'::jsonb
     or q.v is distinct from (x->>'versao')::int then
    raise exception 'R1 venda: modelo % · eventos % · para % · de % · versao % x %', q.m, q.n, q.para, q.de, q.v, x->>'versao'; end if;

  -- R2 compra
  x := public.oc_salvar_rascunho(null, k, null, function_payload || '{"tipo_operacao": "compra"}');
  cp := (x->>'operacao_id')::uuid;
  select o.modelo_financeiro m, (select e.dados_novos->>'modelo_financeiro' from zoo_operacao_eventos e where e.operacao_id = o.id and e.acao = 'definir_modelo_financeiro') para
    into q from zoo_operacoes_comerciais o where o.id = cp;
  if q.m is distinct from 'conta_corrente' or q.para is distinct from 'conta_corrente' then raise exception 'R2 compra: % / %', q.m, q.para; end if;

  -- R3 abate
  x := public.oc_salvar_rascunho(null, k, null, function_payload || '{"tipo_operacao": "abate"}');
  ab := (x->>'operacao_id')::uuid;
  select o.modelo_financeiro m, (select e.dados_novos->>'modelo_financeiro' from zoo_operacao_eventos e where e.operacao_id = o.id and e.acao = 'definir_modelo_financeiro') para
    into q from zoo_operacoes_comerciais o where o.id = ab;
  if q.m is distinct from 'titulo' or q.para is distinct from 'titulo' then raise exception 'R3 abate: % / %', q.m, q.para; end if;

  -- R7 (a): nada saiu e nada foi pago
  if public.oc_conta_corrente(a)->>'situacao' is distinct from 'aguardando_saida' then
    raise exception 'R7a sem entrega nem recebimento: %', public.oc_conta_corrente(a)->>'situacao'; end if;
  if public.oc_conta_corrente(cp)->>'situacao' is distinct from 'aguardando_saida' then
    raise exception 'R7a compra: %', public.oc_conta_corrente(cp)->>'situacao'; end if;

  -- R6 salvar de novo o rascunho
  select versao into v_ver from zoo_operacoes_comerciais where id = a;
  perform public.oc_salvar_rascunho(a, k, v_ver, jsonb_build_object('observacoes', 'segunda gravacao'));
  select o.modelo_financeiro m, (select count(*) from zoo_operacao_eventos e where e.operacao_id = o.id and e.acao = 'definir_modelo_financeiro') n
    into q from zoo_operacoes_comerciais o where o.id = a;
  if q.m is distinct from 'conta_corrente' or q.n is distinct from 1 then raise exception 'R6 regravar rascunho: modelo % · eventos %', q.m, q.n; end if;

  -- R5 e R7 (b): outra venda, com um recebimento vivo de conta corrente
  x := public.oc_salvar_rascunho(null, k, null, function_payload || '{"tipo_operacao": "venda"}');
  b := (x->>'operacao_id')::uuid;
  insert into financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_destino_id, data_competencia, data_vencimento, data_pagamento, valor, sinal, tipo_operacao, status_transacao, descricao, plano_conta_id, subcentro, cenario, origem_lancamento)
  values (k, f, c, '2031-03-10', '2031-03-12', '2031-03-12', 700, '1', '1-Entradas', 'realizado', 'SINT recebimento', pe.id, pe.subcentro, 'realizado', 'manual') returning id into l;
  insert into zoo_operacao_partes (cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas, valor, data_vencimento,
    descricao, incluso_no_total, plano_conta_id, subcentro, financeiro_lancamento_id, sem_movimentacao_caixa)
  values (k, b, 'manual', 'principal', 'recebimento', 1, 1, 700, '2031-03-12', 'SINT recebimento', false, pe.id, pe.subcentro, l, false);
  if public.oc_conta_corrente(b)->>'situacao' is distinct from 'adiantado' then
    raise exception 'R7b com recebimento e sem entrega: %', public.oc_conta_corrente(b)->>'situacao'; end if;
  select versao into v_ver from zoo_operacoes_comerciais where id = b;
  v_st := null; v_msg := null;
  begin perform public.oc_salvar_boitel(b, k, v_ver, 'projetado', c_boitel); v_st := 'PASSOU';
  exception when others then get stacked diagnostics v_st = returned_sqlstate, v_msg = message_text; end;
  if v_st is distinct from 'P0001' or v_msg is distinct from c_frase then raise exception 'R5 esperava P0001 + a frase, veio % %', v_st, v_msg; end if;
  select o.modelo_financeiro m, o.versao v, (select count(*) from zoo_operacao_boitel z where z.operacao_id = o.id) n into q from zoo_operacoes_comerciais o where o.id = b;
  if q.m is distinct from 'conta_corrente' or q.v is distinct from v_ver or q.n is distinct from 0 then raise exception 'R5 depois da recusa: % / % / %', q.m, q.v, q.n; end if;

  -- R4 marcar boitel na venda sem nada vivo
  select versao into v_ver from zoo_operacoes_comerciais where id = a;
  x := public.oc_salvar_boitel(a, k, v_ver, 'projetado', c_boitel);
  select o.modelo_financeiro m, o.versao v, (select count(*) from zoo_operacao_boitel z where z.operacao_id = o.id) n,
         (select count(*) from zoo_operacao_eventos e where e.operacao_id = o.id and e.acao = 'definir_modelo_financeiro'
            and e.dados_anteriores->>'modelo_financeiro' = 'conta_corrente' and e.dados_novos->>'modelo_financeiro' = 'titulo') ev
    into q from zoo_operacoes_comerciais o where o.id = a;
  if q.m is distinct from 'titulo' or q.n is distinct from 1 or q.ev is distinct from 1 or q.v is distinct from v_ver + 1 or q.v is distinct from (x->>'versao')::int then
    raise exception 'R4 marcar boitel: modelo % · boitel % · evento % · versao % (era %, devolvida %)', q.m, q.n, q.ev, q.v, v_ver, x->>'versao'; end if;
  -- e a segunda gravacao do boitel (ja' titulo) nao repete o evento
  x := public.oc_salvar_boitel(a, k, q.v, 'projetado', c_boitel);
  if (select count(*) from zoo_operacao_eventos e where e.operacao_id = a and e.acao = 'definir_modelo_financeiro') is distinct from 2 then
    raise exception 'R4 segunda gravacao repetiu o evento'; end if;

  -- o dono, e a ACL
  if public._oc_modelo_ao_nascer('venda', false) is distinct from 'conta_corrente' or public._oc_modelo_ao_nascer('compra', false) is distinct from 'conta_corrente'
     or public._oc_modelo_ao_nascer('venda', true) is distinct from 'titulo' or public._oc_modelo_ao_nascer('abate', false) is distinct from 'titulo'
     or public._oc_modelo_ao_nascer(null, null) is distinct from 'titulo' then raise exception 'dono: tabela errada'; end if;
  if has_function_privilege('authenticated', 'public._oc_modelo_ao_nascer(text, boolean)', 'EXECUTE') then raise exception 'dono aberto a authenticated'; end if;

  raise exception 'OK oc_cc_padrao_novas_01a (R1-R7)';
end $teste$;
ROLLBACK;
