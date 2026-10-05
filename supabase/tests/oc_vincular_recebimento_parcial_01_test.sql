-- OC-VINCULAR-RECEBIMENTO-PARCIAL-01 — recebimento MENOR que a parcela nao encolhe o compromisso; o desvincular devolve ao saldo.
--
-- Roda como `postgres`, DEPOIS da migration 20261027193300, numa transacao que TERMINA EM RAISE: nada fica no banco.
-- Sucesso = a excecao final comeca com "OK". Qualquer outra excecao e' falha e diz qual prova caiu.
--
-- Cenarios sinteticos no cliente Teste (43f32d07), no MOLDE de duas OCs do Agnaldo: a venda f74f95e5 (acordado 294.595,00)
-- e a compra da9c27ee (17.435,00). So' a estrutura e' copiada (`jsonb_populate_record`); cliente, fazenda, ids, valores e
-- lancamentos sao os do ensaio.
--
-- V1  VENDA, simulacao do recebimento de 200.000 no compromisso de 294.595: `parcial` {200.000 de 294.595, saldo 94.595}; NADA gravado.
-- V2  gravacao = simulacao. Compromisso MANTIDO em 294.595, nenhum `ajustar_valor_compromisso`; o titulo programado e' o MESMO
--     id, vivo, reduzido a 94.595, mesmo vencimento e classificacao; partes 1/2 (recebido) e 2/2 (saldo); a view diz 'parcial',
--     base 294.595, liquidado 200.000, saldo 94.595. O recebimento: valor, pagamento, status, conciliacao e hash identicos.
-- V3  DESVINCULAR o recebimento: o estado vivo da OC volta BYTE A BYTE ao de antes do vinculo (fora `updated_at`/`updated_by`),
--     e o lancamento tambem, fora a competencia (que o desvincular so' devolve quando o vinculo a trocou "pela saida").
-- V4  vincula de novo e chega o segundo recebimento = saldo (94.595), SEM escolher parcela: liquida; a view diz 'quitada', saldo 0.
-- V5  segundo recebimento MENOR que o saldo (90.000): novo parcial, saldo 4.595 na parcela 3; compromisso 294.595.
-- V6  desvincular o PRIMEIRO com o saldo dele ja' consumido: o valor e' somado ao saldo em aberto (4.595 -> 204.595); o
--     compromisso segue 294.595 e as partes que ficam dizem a quantidade certa.
-- V7  recebimento MAIOR que o saldo: nao e' silencioso — aviso `recebido_acima_do_saldo` com a diferenca; (comportamento de
--     antes: o compromisso sobe).
-- V8  sem saldo em aberto: desvincular o parcial devolve a parcela a 'prevista' (a receber, sem titulo); compromisso 294.595.
-- C1  COMPRA, o caso dos R$ 35,00: pagamento de 17.400 em compromisso de 17.435 deixa 35,00 A PAGAR (titulo reduzido a 35,00,
--     view 'parcial' com saldo 35,00); o pagamento de 35,00 quita.
-- D1  DESVINCULAR O VINCULO COMUM = A VOLTA: valor EXATO (venda e compra) — o titulo programado que o vinculo cancelou e' o
--     MESMO registro, reativado; a parcela e o compromisso ficam; assinatura viva da OC identica a' de antes.
-- D2  A MAIS (venda e compra): o vinculo subiu o compromisso; a volta o devolve ao valor de antes, com o titulo de volta.
-- D3  compromisso EM ABERTO (sem programacao): a menos deixa o saldo numa parcela 'prevista'; a volta tira a programacao que o
--     vinculo criou e devolve o compromisso a 'aberto', no valor — nunca cancelado.
-- D4  parcela PREVISTA (sem titulo) preenchida por um recebimento a mais: a volta a devolve a 'prevista' no valor de antes.
-- D5  o titulo NAO pode ser reativado (alguem o reativou por fora): a parcela volta a 'prevista' e nada e' duplicado.
-- R1  OC-DESVINCULAR-RENUMERA-01: grupo com duas partes (1/2 e 2/2, a segunda por "criar item"); desvinculada a segunda, a que
--     fica diz 1/1.
-- F1  nada mais muda: os lancamentos que ja' existiam no Teste tem a mesma assinatura antes e depois.
-- F2  partes, compromissos e lancamentos dos OUTROS clientes: assinatura identica antes e depois.
CREATE FUNCTION pg_temp.foto(p_op uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT md5(concat_ws('#',
    (SELECT string_agg((to_jsonb(c) - 'updated_at')::text, '|' ORDER BY c.id) FROM zoo_operacao_compromissos c WHERE c.operacao_id = p_op AND c.status <> 'cancelado'),
    (SELECT string_agg((to_jsonb(g) - 'updated_at')::text, '|' ORDER BY g.id) FROM zoo_operacao_programacoes g
       JOIN zoo_operacao_compromissos c ON c.id = g.compromisso_id WHERE c.operacao_id = p_op AND g.status = 'ativa'),
    (SELECT string_agg((to_jsonb(p) - 'updated_at')::text, '|' ORDER BY p.id) FROM zoo_operacao_parcelas_programacao p
       JOIN zoo_operacao_programacoes g ON g.id = p.programacao_id JOIN zoo_operacao_compromissos c ON c.id = g.compromisso_id
      WHERE c.operacao_id = p_op AND p.status <> 'cancelada' AND g.status = 'ativa'),
    (SELECT string_agg((to_jsonb(t) - 'updated_at')::text, '|' ORDER BY t.id) FROM zoo_operacao_partes t WHERE t.operacao_id = p_op AND NOT t.cancelada),
    (SELECT string_agg((to_jsonb(f) - 'updated_at' - 'updated_by')::text, '|' ORDER BY f.id) FROM financeiro_lancamentos_v2 f
      WHERE f.id IN (SELECT t.financeiro_lancamento_id FROM zoo_operacao_partes t WHERE t.operacao_id = p_op AND NOT t.cancelada)),
    (SELECT string_agg(q.financeiro_lancamento_id::text || ':' || q.valor::text, '|' ORDER BY q.financeiro_lancamento_id)
       FROM zoo_operacao_liquidacoes q WHERE q.operacao_id = p_op AND q.estornado IS NOT TRUE)));
$f$;
CREATE FUNCTION pg_temp.lanc(p_id uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT (to_jsonb(f) - 'updated_at' - 'updated_by')::text FROM financeiro_lancamentos_v2 f WHERE f.id = p_id;
$f$;
-- o que o vinculo NAO pode tocar num recebimento
CREATE FUNCTION pg_temp.soberano(p_id uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT jsonb_build_object('valor', f.valor, 'pgto', f.data_pagamento, 'status', f.status_transacao, 'conc', f.conciliado_em,
           'cancelado', f.cancelado, 'hash', f.hash_importacao, 'conta', f.conta_efetiva_id,
           'cbi', (SELECT count(*) FROM conciliacao_bancaria_itens i WHERE i.lancamento_id = f.id AND i.desfeito_em IS NULL))::text
    FROM financeiro_lancamentos_v2 f WHERE f.id = p_id;
$f$;
-- monta uma OC no Teste a partir do molde, com UM compromisso principal de p_valor e o titulo PROGRAMADO dele; devolve os ids
CREATE FUNCTION pg_temp.montar(p_molde uuid, p_valor numeric, OUT op uuid, OUT lote uuid, OUT comp uuid, OUT prog uuid, OUT parc uuid, OUT tit uuid)
LANGUAGE plpgsql AS $f$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_conta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  m record; v_compra boolean;
BEGIN
  op := gen_random_uuid(); lote := gen_random_uuid(); comp := gen_random_uuid(); prog := gen_random_uuid(); parc := gen_random_uuid();
  INSERT INTO zoo_operacoes_comerciais SELECT (jsonb_populate_record(NULL::zoo_operacoes_comerciais, to_jsonb(o) || jsonb_build_object(
      'id', op, 'cliente_id', c_cli, 'fazenda_id', c_faz, 'contraparte_id', NULL, 'versao', 1, 'is_teste', true, 'valor_acordado', p_valor))).*
    FROM zoo_operacoes_comerciais o WHERE o.id = p_molde;
  INSERT INTO zoo_operacao_lotes SELECT (jsonb_populate_record(NULL::zoo_operacao_lotes, to_jsonb(l) || jsonb_build_object(
      'id', lote, 'cliente_id', c_cli, 'operacao_id', op))).*
    FROM zoo_operacao_lotes l WHERE l.operacao_id = p_molde LIMIT 1;
  INSERT INTO zoo_operacao_compromissos SELECT (jsonb_populate_record(NULL::zoo_operacao_compromissos, to_jsonb(c) || jsonb_build_object(
      'id', comp, 'cliente_id', c_cli, 'operacao_id', op, 'lote_id', lote, 'favorecido_id', NULL, 'valor_total', p_valor, 'status', 'programado'))).*
    FROM zoo_operacao_compromissos c WHERE c.operacao_id = p_molde AND c.natureza = 'principal' AND c.status IS DISTINCT FROM 'cancelado'
   ORDER BY c.created_at LIMIT 1;
  INSERT INTO zoo_operacao_programacoes (id, cliente_id, compromisso_id, condicoes, status) VALUES (prog, c_cli, comp, 'ensaio', 'ativa');
  INSERT INTO zoo_operacao_parcelas_programacao (id, cliente_id, programacao_id, sequencia, valor, vencimento, conta_bancaria_id, forma, status)
  VALUES (parc, c_cli, prog, 1, p_valor, '2026-10-09', c_conta, NULL, 'materializada');
  SELECT c.*, o.tipo_operacao AS tipo_oc, o.data_operacao INTO m FROM zoo_operacao_compromissos c JOIN zoo_operacoes_comerciais o ON o.id = c.operacao_id WHERE c.id = comp;
  IF m.id IS NULL THEN RAISE EXCEPTION 'SETUP: o molde % nao montou', p_molde; END IF;
  v_compra := (m.tipo_oc = 'compra');
  INSERT INTO financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_destino_id, conta_bancaria_id, data_competencia, data_vencimento, valor, sinal,
      tipo_operacao, status_transacao, descricao, subcentro, plano_conta_id, origem_lancamento, origem_tipo, ano_mes, cenario)
  VALUES (c_cli, c_faz, CASE WHEN v_compra THEN NULL ELSE c_conta END, CASE WHEN v_compra THEN c_conta END, m.data_operacao, '2026-10-09', p_valor,
      CASE WHEN v_compra THEN '-1' ELSE '1' END, CASE WHEN v_compra THEN '2-Saídas' ELSE '1-Entradas' END, 'programado', 'ENSAIO titulo da OC',
      m.subcentro, m.plano_conta_id, 'operacao_comercial', 'oc:obrigacao:principal:principal', to_char(m.data_operacao, 'YYYY-MM'), 'realizado')
  RETURNING id INTO tit;
  INSERT INTO zoo_operacao_partes (cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas, valor,
      data_vencimento, descricao, incluso_no_total, plano_conta_id, subcentro, lote_id, programacao_parcela_id, financeiro_lancamento_id)
  VALUES (c_cli, op, 'programacao', 'principal', 'principal', 1, 1, p_valor, '2026-10-09', m.descricao, false, m.plano_conta_id, m.subcentro, lote, parc, tit);
END $f$;
-- um recebimento/pagamento REALIZADO do banco, com a classificacao do compromisso da OC
CREATE FUNCTION pg_temp.pago(p_op uuid, p_valor numeric, p_data date) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_conta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  m record; v_compra boolean; v_id uuid;
BEGIN
  SELECT c.subcentro, c.plano_conta_id, o.tipo_operacao AS tipo_oc INTO m FROM zoo_operacao_compromissos c
    JOIN zoo_operacoes_comerciais o ON o.id = c.operacao_id WHERE c.operacao_id = p_op ORDER BY c.created_at LIMIT 1;
  v_compra := (m.tipo_oc = 'compra');
  INSERT INTO financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_destino_id, conta_bancaria_id, data_competencia, data_pagamento, data_vencimento, valor, sinal,
      tipo_operacao, status_transacao, descricao, subcentro, plano_conta_id, origem_lancamento, ano_mes, cenario)
  VALUES (c_cli, c_faz, CASE WHEN v_compra THEN NULL ELSE c_conta END, CASE WHEN v_compra THEN c_conta END, p_data, p_data, p_data, p_valor,
      CASE WHEN v_compra THEN '-1' ELSE '1' END, CASE WHEN v_compra THEN '2-Saídas' ELSE '1-Entradas' END, 'realizado', 'ENSAIO banco ' || p_valor,
      m.subcentro, m.plano_conta_id, 'extrato', to_char(p_data, 'YYYY-MM'), 'realizado')
  RETURNING id INTO v_id;
  RETURN v_id;
END $f$;
CREATE FUNCTION pg_temp.ver(p_op uuid) RETURNS int LANGUAGE sql AS $f$ SELECT versao FROM zoo_operacoes_comerciais WHERE id = p_op $f$;
CREATE FUNCTION pg_temp.partes(p_op uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT string_agg(t.sequencia_parcela || '/' || t.quantidade_parcelas || '=' || t.valor || ':' || f.status_transacao, ' ' ORDER BY t.sequencia_parcela)
    FROM zoo_operacao_partes t JOIN financeiro_lancamentos_v2 f ON f.id = t.financeiro_lancamento_id WHERE t.operacao_id = p_op AND NOT t.cancelada;
$f$;
CREATE FUNCTION pg_temp.liq(p_op uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT estado_liquidacao || ' base=' || base || ' liq=' || total_liquidado_valido || ' saldo=' || saldo_operacao FROM vw_oc_operacao_liquidacao WHERE operacao_id = p_op;
$f$;

DO $teste$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_venda constant uuid := 'f74f95e5-ecaa-4785-932a-abd37328a1f8';
  c_compra constant uuid := 'da9c27ee-0000-0000-0000-000000000000';  -- resolvido abaixo pelo prefixo
  v_compra uuid;
  a record; b record; c record; d record; k record; r record;
  l1 uuid; l2 uuid; l3 uuid; l5 uuid; lb1 uuid; lb2 uuid; lc1 uuid; lc2 uuid; lk1 uuid; lk2 uuid; lr1 uuid; lr2 uuid;
  v_sim jsonb; v_res jsonb; v_f0 text; v_l0 text; v_s0 text; v_t0 text; v_txt text; v_n int; v_num numeric; v_ok text := '';
  v_fora_a text; v_fora_d text; v_ids uuid[]; v_out_a text; v_out_d text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  SELECT id INTO v_compra FROM zoo_operacoes_comerciais WHERE id::text LIKE 'da9c27ee%';
  SELECT array_agg(l.id), md5(coalesce(string_agg(md5(l::text), '' ORDER BY l.id), '')) INTO v_ids, v_fora_a FROM financeiro_lancamentos_v2 l WHERE l.cliente_id = c_cli;
  SELECT md5(string_agg(x.s, '' ORDER BY x.id)) INTO v_out_a FROM (SELECT cl.id, concat(
      (SELECT md5(coalesce(string_agg(md5(pp::text), '' ORDER BY pp.id), '')) FROM zoo_operacao_partes pp WHERE pp.cliente_id = cl.id),
      (SELECT md5(coalesce(string_agg(md5(kk::text), '' ORDER BY kk.id), '')) FROM zoo_operacao_compromissos kk WHERE kk.cliente_id = cl.id),
      (SELECT md5(coalesce(string_agg(md5(ll::text), '' ORDER BY ll.id), '')) FROM financeiro_lancamentos_v2 ll WHERE ll.cliente_id = cl.id)) s
    FROM clientes cl WHERE cl.id <> c_cli) x;

  -- ═══ VENDA ═══
  SELECT * INTO a FROM pg_temp.montar(c_venda, 294595);
  l1 := pg_temp.pago(a.op, 200000, '2026-09-01'); l2 := pg_temp.pago(a.op, 94595, '2026-09-01');
  v_f0 := pg_temp.foto(a.op); v_l0 := pg_temp.lanc(l1); v_s0 := pg_temp.soberano(l1); v_t0 := pg_temp.lanc(a.tit);

  -- V1 simulacao
  v_sim := oc_vincular_lancamento(a.op, 1, l1, NULL, 'pgto 1/2', NULL, NULL, false, true);
  IF (v_sim ->> 'ok') IS DISTINCT FROM 'true' OR (v_sim -> 'parcial' ->> 'recebido')::numeric IS DISTINCT FROM 200000
     OR (v_sim -> 'parcial' ->> 'de')::numeric IS DISTINCT FROM 294595 OR (v_sim -> 'parcial' ->> 'saldo')::numeric IS DISTINCT FROM 94595
     OR (v_sim -> 'parcial' ->> 'lado') IS DISTINCT FROM 'receber' OR (v_sim -> 'compromisso' ->> 'acao') IS DISTINCT FROM 'mantido'
     OR (v_sim -> 'compromisso' ->> 'valor_total')::numeric IS DISTINCT FROM 294595
     OR (v_sim -> 'parte' ->> 'sequencia') IS DISTINCT FROM '1' OR (v_sim -> 'parte' ->> 'quantidade') IS DISTINCT FROM '2' THEN
    RAISE EXCEPTION 'V1 simulacao: %', v_sim; END IF;
  IF pg_temp.foto(a.op) IS DISTINCT FROM v_f0 OR pg_temp.lanc(l1) IS DISTINCT FROM v_l0 OR pg_temp.ver(a.op) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'V1: a simulacao gravou'; END IF;
  v_ok := v_ok || 'V1 ok (simulacao: recebido 200000 de 294595, saldo 94595, compromisso mantido, parcela 1 de 2; nada gravado); ';

  -- V2 gravacao = simulacao
  v_res := oc_vincular_lancamento(a.op, 1, l1, NULL, 'pgto 1/2', NULL, NULL, false, false);
  IF ((v_res -> 'parcial') #- '{parcela_saldo,id}'::text[]) IS DISTINCT FROM ((v_sim -> 'parcial') #- '{parcela_saldo,id}'::text[])
     OR ((v_res -> 'compromisso') - 'id'::text) IS DISTINCT FROM ((v_sim -> 'compromisso') - 'id'::text)
     OR (v_res -> 'parte') IS DISTINCT FROM (v_sim -> 'parte') OR (v_res -> 'avisos') IS DISTINCT FROM (v_sim -> 'avisos')
     OR (v_res -> 'principal') IS DISTINCT FROM (v_sim -> 'principal') THEN
    RAISE EXCEPTION 'V2: gravacao <> simulacao: % x %', v_res, v_sim; END IF;
  IF (SELECT valor_total FROM zoo_operacao_compromissos WHERE id = a.comp) IS DISTINCT FROM 294595 THEN RAISE EXCEPTION 'V2: o compromisso mudou de valor'; END IF;
  IF EXISTS (SELECT 1 FROM zoo_operacao_eventos WHERE operacao_id = a.op AND acao = 'ajustar_valor_compromisso') THEN RAISE EXCEPTION 'V2: evento de ajuste de valor'; END IF;
  SELECT f.* INTO r FROM financeiro_lancamentos_v2 f WHERE f.id = a.tit;
  IF r.cancelado IS TRUE OR r.valor IS DISTINCT FROM 94595 OR r.data_vencimento IS DISTINCT FROM '2026-10-09' OR r.status_transacao IS DISTINCT FROM 'programado'
     OR (to_jsonb(r) - 'valor' - 'updated_at' - 'updated_by' - 'hash_importacao')::text IS DISTINCT FROM ((v_t0::jsonb) - 'valor' - 'hash_importacao')::text THEN
    RAISE EXCEPTION 'V2: o titulo programado nao foi so'' reduzido: %', to_jsonb(r); END IF;
  IF pg_temp.partes(a.op) IS DISTINCT FROM '1/2=200000.00:realizado 2/2=94595.00:programado' THEN RAISE EXCEPTION 'V2 partes: %', pg_temp.partes(a.op); END IF;
  IF (SELECT sum(valor) FROM zoo_operacao_parcelas_programacao WHERE programacao_id = a.prog AND status <> 'cancelada') IS DISTINCT FROM 294595 THEN RAISE EXCEPTION 'V2: parcelas nao somam o compromisso'; END IF;
  SELECT * INTO r FROM vw_oc_operacao_liquidacao WHERE operacao_id = a.op;
  IF r.estado_liquidacao IS DISTINCT FROM 'parcial' OR r.base IS DISTINCT FROM 294595 OR r.total_liquidado_valido IS DISTINCT FROM 200000 OR r.saldo_operacao IS DISTINCT FROM 94595 THEN
    RAISE EXCEPTION 'V2 view: %', pg_temp.liq(a.op); END IF;
  IF pg_temp.soberano(l1) IS DISTINCT FROM v_s0 THEN RAISE EXCEPTION 'V2: o recebimento mudou: % x %', pg_temp.soberano(l1), v_s0; END IF;
  SELECT data_competencia::text INTO v_txt FROM financeiro_lancamentos_v2 WHERE id = l1;
  v_ok := v_ok || 'V2 ok (compromisso 294595 mantido, sem ajuste; titulo ' || left(a.tit::text, 8) || ' vivo reduzido a 94595; partes ' || pg_temp.partes(a.op) || '; view ' || pg_temp.liq(a.op) || '; recebimento intacto, competencia 2026-09-01 -> ' || v_txt || '); ';

  -- V3 desvincular = estado anterior, byte a byte
  v_sim := oc_desvincular_lancamento(a.op, pg_temp.ver(a.op), l1, 'ensaio', NULL, true);
  v_res := oc_desvincular_lancamento(a.op, pg_temp.ver(a.op), l1, 'ensaio', NULL, false);
  IF (v_res -> 'devolucao_ao_saldo') IS DISTINCT FROM (v_sim -> 'devolucao_ao_saldo') OR (v_res -> 'devolucao_ao_saldo' ->> 'modo') IS DISTINCT FROM 'restaurado'
     OR (v_res -> 'compromisso' ->> 'acao') IS DISTINCT FROM 'mantido' OR (v_res -> 'devolucao_ao_saldo' ->> 'saldo_para')::numeric IS DISTINCT FROM 294595 THEN
    RAISE EXCEPTION 'V3 desvincular: % (sim %)', v_res, v_sim -> 'devolucao_ao_saldo'; END IF;
  IF pg_temp.foto(a.op) IS DISTINCT FROM v_f0 THEN RAISE EXCEPTION 'V3: o estado vivo da OC nao voltou byte a byte (partes %, view %)', pg_temp.partes(a.op), pg_temp.liq(a.op); END IF;
  -- ⚠ a COMPETENCIA nao volta: `_oc_restaurar_competencia` so' devolve a que o vinculo trocou "pela saida"; nesta OC sem saida o
  --   vinculo a levou para a data da OC e o desvincular a deixa la' (regra anterior a este PR, nao tocada).
  IF ((pg_temp.lanc(l1)::jsonb) - 'data_competencia' - 'ano_mes') IS DISTINCT FROM ((v_l0::jsonb) - 'data_competencia' - 'ano_mes') THEN
    RAISE EXCEPTION 'V3: o lancamento nao voltou: % x %', pg_temp.lanc(l1), v_l0; END IF;
  IF pg_temp.soberano(l1) IS DISTINCT FROM v_s0 THEN RAISE EXCEPTION 'V3: o recebimento mudou'; END IF;
  IF pg_temp.lanc(a.tit) IS DISTINCT FROM v_t0 THEN RAISE EXCEPTION 'V3: o titulo nao voltou: % x %', pg_temp.lanc(a.tit), v_t0; END IF;
  v_ok := v_ok || 'V3 ok (desvincular: OC e titulo identicos ao estado anterior; lancamento identico fora a competencia, que fica na data da OC — regra anterior; partes ' || pg_temp.partes(a.op) || '); ';

  -- V4 de novo, e o segundo = saldo, sem escolher parcela
  v_res := oc_vincular_lancamento(a.op, pg_temp.ver(a.op), l1, NULL, 'pgto 1/2', NULL, NULL, false, false);
  v_s0 := pg_temp.soberano(l2);
  v_res := oc_vincular_lancamento(a.op, pg_temp.ver(a.op), l2, NULL, 'pgto 2/2', NULL, NULL, false, false);
  IF (v_res ->> 'ok') IS DISTINCT FROM 'true' OR (v_res -> 'parcial') IS DISTINCT FROM 'null'::jsonb OR (v_res -> 'compromisso' ->> 'acao') IS DISTINCT FROM 'mantido'
     OR (v_res -> 'parcela' ->> 'acao') IS DISTINCT FROM 'substituida' THEN RAISE EXCEPTION 'V4: %', v_res; END IF;
  SELECT * INTO r FROM vw_oc_operacao_liquidacao WHERE operacao_id = a.op;
  IF r.estado_liquidacao IS DISTINCT FROM 'quitada' OR r.saldo_operacao IS DISTINCT FROM 0 OR r.base IS DISTINCT FROM 294595 THEN RAISE EXCEPTION 'V4 view: %', pg_temp.liq(a.op); END IF;
  IF pg_temp.partes(a.op) IS DISTINCT FROM '1/2=200000.00:realizado 2/2=94595.00:realizado' OR pg_temp.soberano(l2) IS DISTINCT FROM v_s0
     OR NOT (SELECT cancelado FROM financeiro_lancamentos_v2 WHERE id = a.tit) THEN RAISE EXCEPTION 'V4 partes: %', pg_temp.partes(a.op); END IF;
  v_ok := v_ok || 'V4 ok (segundo recebimento = saldo, sem escolher parcela: ' || pg_temp.partes(a.op) || '; view ' || pg_temp.liq(a.op) || '); ';

  -- ═══ V5–V7: segundo MENOR que o saldo, devolucao a outro saldo, e MAIOR que o saldo ═══
  SELECT * INTO b FROM pg_temp.montar(c_venda, 294595);
  lb1 := pg_temp.pago(b.op, 200000, '2026-09-01'); lb2 := pg_temp.pago(b.op, 90000, '2026-09-05'); l5 := pg_temp.pago(b.op, 300000, '2026-09-10');
  v_res := oc_vincular_lancamento(b.op, 1, lb1, NULL, 'p1', NULL, NULL, false, false);
  v_res := oc_vincular_lancamento(b.op, pg_temp.ver(b.op), lb2, NULL, 'p2', NULL, NULL, false, false);
  IF (v_res -> 'parcial' ->> 'saldo')::numeric IS DISTINCT FROM 4595 OR (v_res -> 'parcial' ->> 'de')::numeric IS DISTINCT FROM 94595
     OR pg_temp.partes(b.op) IS DISTINCT FROM '1/3=200000.00:realizado 2/3=90000.00:realizado 3/3=4595.00:programado'
     OR (SELECT valor_total FROM zoo_operacao_compromissos WHERE id = b.comp) IS DISTINCT FROM 294595 THEN
    RAISE EXCEPTION 'V5: % · partes %', v_res -> 'parcial', pg_temp.partes(b.op); END IF;
  v_ok := v_ok || 'V5 ok (segundo menor que o saldo: ' || pg_temp.partes(b.op) || '; view ' || pg_temp.liq(b.op) || '); ';

  v_res := oc_desvincular_lancamento(b.op, pg_temp.ver(b.op), lb1, 'ensaio', NULL, false);
  IF (v_res -> 'devolucao_ao_saldo' ->> 'modo') IS DISTINCT FROM 'somado_ao_saldo' OR (v_res -> 'devolucao_ao_saldo' ->> 'saldo_para')::numeric IS DISTINCT FROM 204595
     OR (SELECT valor FROM financeiro_lancamentos_v2 WHERE id = b.tit) IS DISTINCT FROM 204595
     OR (SELECT valor_total FROM zoo_operacao_compromissos WHERE id = b.comp) IS DISTINCT FROM 294595
     OR pg_temp.partes(b.op) IS DISTINCT FROM '2/3=90000.00:realizado 3/3=204595.00:programado' THEN
    RAISE EXCEPTION 'V6: % · partes % · view %', v_res -> 'devolucao_ao_saldo', pg_temp.partes(b.op), pg_temp.liq(b.op); END IF;
  SELECT * INTO r FROM vw_oc_operacao_liquidacao WHERE operacao_id = b.op;
  IF r.base IS DISTINCT FROM 294595 OR r.total_liquidado_valido IS DISTINCT FROM 90000 OR r.saldo_operacao IS DISTINCT FROM 204595 THEN RAISE EXCEPTION 'V6 view: %', pg_temp.liq(b.op); END IF;
  v_ok := v_ok || 'V6 ok (desvincular com o saldo ja'' consumido: soma ao saldo em aberto, 4595 -> 204595; ' || pg_temp.partes(b.op) || '; view ' || pg_temp.liq(b.op) || '); ';

  v_sim := oc_vincular_lancamento(b.op, pg_temp.ver(b.op), l5, NULL, 'p3', NULL, NULL, false, true);
  SELECT x INTO v_res FROM jsonb_array_elements(v_sim -> 'avisos') x WHERE x ->> 'codigo' = 'recebido_acima_do_saldo';
  IF v_res IS NULL OR (v_res ->> 'diferenca')::numeric IS DISTINCT FROM 95405 OR (v_res ->> 'saldo')::numeric IS DISTINCT FROM 204595
     OR (v_res ->> 'compromisso_de')::numeric IS DISTINCT FROM 294595 OR (v_res ->> 'compromisso_para')::numeric IS DISTINCT FROM 390000 THEN
    RAISE EXCEPTION 'V7: recebido acima do saldo sem aviso: %', v_sim; END IF;
  v_ok := v_ok || 'V7 ok (300000 num saldo de 204595: aviso recebido_acima_do_saldo, diferenca 95405, compromisso 294595 -> 390000 — comportamento de antes, agora dito); ';

  -- ═══ V8: sem saldo em aberto, a parcela volta a 'prevista' ═══
  SELECT * INTO d FROM pg_temp.montar(c_venda, 294595);
  lk1 := pg_temp.pago(d.op, 200000, '2026-09-01'); lk2 := pg_temp.pago(d.op, 94595, '2026-09-02');
  v_res := oc_vincular_lancamento(d.op, 1, lk1, NULL, 'p1', NULL, NULL, false, false);
  v_res := oc_vincular_lancamento(d.op, pg_temp.ver(d.op), lk2, NULL, 'p2', NULL, NULL, false, false);
  v_res := oc_desvincular_lancamento(d.op, pg_temp.ver(d.op), lk1, 'ensaio', NULL, false);
  SELECT * INTO r FROM vw_oc_operacao_liquidacao WHERE operacao_id = d.op;
  IF (v_res -> 'devolucao_ao_saldo' ->> 'modo') IS DISTINCT FROM 'volta_a_prevista' OR (SELECT status FROM zoo_operacao_parcelas_programacao WHERE id = d.parc) IS DISTINCT FROM 'prevista'
     OR (SELECT valor_total FROM zoo_operacao_compromissos WHERE id = d.comp) IS DISTINCT FROM 294595
     OR r.base IS DISTINCT FROM 294595 OR r.total_liquidado_valido IS DISTINCT FROM 94595 OR r.saldo_operacao IS DISTINCT FROM 200000 OR r.estado_liquidacao IS DISTINCT FROM 'parcial' THEN
    RAISE EXCEPTION 'V8: % · view % · partes %', v_res -> 'devolucao_ao_saldo', pg_temp.liq(d.op), pg_temp.partes(d.op); END IF;
  v_res := oc_vincular_lancamento(d.op, pg_temp.ver(d.op), lk1, NULL, 'p1 de novo', NULL, NULL, false, false);
  IF (v_res -> 'parcela' ->> 'acao') IS DISTINCT FROM 'preenchida' OR pg_temp.liq(d.op) NOT LIKE 'quitada%' THEN RAISE EXCEPTION 'V8 volta: % · %', v_res, pg_temp.liq(d.op); END IF;
  v_ok := v_ok || 'V8 ok (sem saldo em aberto: a parcela volta a prevista, compromisso 294595, view parcial com saldo 200000; vinculada de novo, quitada); ';

  -- ═══ COMPRA: os R$ 35,00 ═══
  SELECT * INTO c FROM pg_temp.montar(v_compra, 17435);
  lc1 := pg_temp.pago(c.op, 17400, '2026-09-09'); lc2 := pg_temp.pago(c.op, 35, '2026-09-12');
  v_s0 := pg_temp.soberano(lc1);
  v_sim := oc_vincular_lancamento(c.op, 1, lc1, NULL, 'pgto', NULL, NULL, false, true);
  v_res := oc_vincular_lancamento(c.op, 1, lc1, NULL, 'pgto', NULL, NULL, false, false);
  SELECT * INTO r FROM vw_oc_operacao_liquidacao WHERE operacao_id = c.op;
  IF (v_res -> 'parcial' ->> 'saldo')::numeric IS DISTINCT FROM 35 OR (v_res -> 'parcial' ->> 'lado') IS DISTINCT FROM 'pagar'
     OR ((v_res -> 'parcial') #- '{parcela_saldo,id}'::text[]) IS DISTINCT FROM ((v_sim -> 'parcial') #- '{parcela_saldo,id}'::text[])
     OR (SELECT valor FROM financeiro_lancamentos_v2 WHERE id = c.tit) IS DISTINCT FROM 35 OR (SELECT cancelado FROM financeiro_lancamentos_v2 WHERE id = c.tit)
     OR (SELECT valor_total FROM zoo_operacao_compromissos WHERE id = c.comp) IS DISTINCT FROM 17435
     OR r.estado_liquidacao IS DISTINCT FROM 'parcial' OR r.saldo_operacao IS DISTINCT FROM 35 OR r.base IS DISTINCT FROM 17435
     OR pg_temp.soberano(lc1) IS DISTINCT FROM v_s0 THEN
    RAISE EXCEPTION 'C1: % · view % · partes %', v_res, pg_temp.liq(c.op), pg_temp.partes(c.op); END IF;
  v_txt := pg_temp.partes(c.op) || '; view ' || pg_temp.liq(c.op);
  v_res := oc_vincular_lancamento(c.op, pg_temp.ver(c.op), lc2, NULL, 'saldo', NULL, NULL, false, false);
  IF pg_temp.liq(c.op) NOT LIKE 'quitada%saldo=0%' THEN RAISE EXCEPTION 'C1 quitacao: % · %', pg_temp.liq(c.op), v_res; END IF;
  v_ok := v_ok || 'C1 ok (compra: 17400 em 17435 deixa 35,00 a pagar — ' || v_txt || '; pago o saldo: ' || pg_temp.liq(c.op) || '); ';

  -- ═══ D1/D2: a volta do vinculo comum, venda e compra, exato e a mais ═══
  FOR r IN SELECT * FROM (VALUES ('venda', c_venda, 294595::numeric, 294595::numeric), ('venda', c_venda, 294595, 300000),
                                 ('compra', v_compra, 17435, 17435), ('compra', v_compra, 17435, 18000)) x(tipo, molde, c, v) LOOP
    SELECT * INTO d FROM pg_temp.montar(r.molde, r.c);
    lk1 := pg_temp.pago(d.op, r.v, '2026-09-01');
    v_f0 := pg_temp.foto(d.op); v_s0 := pg_temp.soberano(lk1); v_t0 := pg_temp.lanc(d.tit);
    v_res := oc_vincular_lancamento(d.op, 1, lk1, NULL, 'vinculo', NULL, NULL, false, false);
    IF (v_res ->> 'ok') IS DISTINCT FROM 'true' OR NOT (SELECT cancelado FROM financeiro_lancamentos_v2 WHERE id = d.tit)
       OR (SELECT valor_total FROM zoo_operacao_compromissos WHERE id = d.comp) IS DISTINCT FROM r.v THEN
      RAISE EXCEPTION 'D1/D2 % %: o vinculo nao montou o caso: %', r.tipo, r.v, v_res; END IF;
    v_sim := oc_desvincular_lancamento(d.op, pg_temp.ver(d.op), lk1, 'volta', NULL, true);
    v_res := oc_desvincular_lancamento(d.op, pg_temp.ver(d.op), lk1, 'volta', NULL, false);
    IF (v_res -> 'devolucao_ao_saldo') IS DISTINCT FROM (v_sim -> 'devolucao_ao_saldo') OR (v_res -> 'compromisso') IS DISTINCT FROM (v_sim -> 'compromisso')
       OR (v_res -> 'devolucao_ao_saldo' ->> 'modo') IS DISTINCT FROM 'titulo_restaurado'
       OR (v_res -> 'compromisso' ->> 'acao') IS DISTINCT FROM (CASE WHEN r.v = r.c THEN 'mantido' ELSE 'restaurado' END) THEN
      RAISE EXCEPTION 'D1/D2 % %: desvincular: % (sim %)', r.tipo, r.v, v_res, v_sim; END IF;
    IF pg_temp.foto(d.op) IS DISTINCT FROM v_f0 THEN
      RAISE EXCEPTION 'D1/D2 % %: a OC nao voltou (partes %, view %, compromisso %)', r.tipo, r.v, pg_temp.partes(d.op), pg_temp.liq(d.op),
        (SELECT valor_total || '/' || status FROM zoo_operacao_compromissos WHERE id = d.comp); END IF;
    IF pg_temp.lanc(d.tit) IS DISTINCT FROM v_t0 THEN RAISE EXCEPTION 'D1/D2 % %: o titulo nao voltou como era', r.tipo, r.v; END IF;
    IF pg_temp.soberano(lk1) IS DISTINCT FROM v_s0 THEN RAISE EXCEPTION 'D1/D2 % %: o lancamento desvinculado mudou', r.tipo, r.v; END IF;
  END LOOP;
  v_ok := v_ok || 'D1 ok (valor exato, venda e compra: titulo reativado — o mesmo registro —, compromisso mantido, OC identica a'' de antes); D2 ok (a mais, venda e compra: compromisso volta ao valor de antes, OC identica); ';

  -- ═══ D3: compromisso em aberto, sem programacao ═══
  SELECT * INTO d FROM pg_temp.montar(c_venda, 294595);
  DELETE FROM zoo_operacao_partes WHERE operacao_id = d.op; DELETE FROM financeiro_lancamentos_v2 WHERE id = d.tit;
  DELETE FROM zoo_operacao_parcelas_programacao WHERE programacao_id = d.prog; DELETE FROM zoo_operacao_programacoes WHERE id = d.prog;
  UPDATE zoo_operacao_compromissos SET status = 'aberto' WHERE id = d.comp;
  lk1 := pg_temp.pago(d.op, 200000, '2026-09-01'); v_f0 := pg_temp.foto(d.op);
  v_res := oc_vincular_lancamento(d.op, 1, lk1, NULL, 'vinculo', NULL, NULL, false, false);
  SELECT * INTO r FROM vw_oc_operacao_liquidacao WHERE operacao_id = d.op;
  IF (v_res -> 'parcial' ->> 'saldo')::numeric IS DISTINCT FROM 94595 OR (v_res -> 'compromisso' ->> 'acao') IS DISTINCT FROM 'mantido'
     OR (SELECT valor_total FROM zoo_operacao_compromissos WHERE id = d.comp) IS DISTINCT FROM 294595
     OR r.estado_liquidacao IS DISTINCT FROM 'parcial' OR r.saldo_operacao IS DISTINCT FROM 94595 THEN
    RAISE EXCEPTION 'D3 vinculo: % · view %', v_res, pg_temp.liq(d.op); END IF;
  v_res := oc_desvincular_lancamento(d.op, pg_temp.ver(d.op), lk1, 'volta', NULL, false);
  IF pg_temp.foto(d.op) IS DISTINCT FROM v_f0 OR (SELECT status FROM zoo_operacao_compromissos WHERE id = d.comp) IS DISTINCT FROM 'aberto'
     OR EXISTS (SELECT 1 FROM zoo_operacao_programacoes WHERE compromisso_id = d.comp AND status = 'ativa') THEN
    RAISE EXCEPTION 'D3 volta: % · compromisso %', v_res, (SELECT valor_total || '/' || status FROM zoo_operacao_compromissos WHERE id = d.comp); END IF;
  v_ok := v_ok || 'D3 ok (compromisso em aberto: a menos mantem 294595 com saldo 94595 previsto; a volta devolve o compromisso a aberto, sem programacao); ';

  -- ═══ D4: parcela prevista (sem titulo), recebimento a mais ═══
  SELECT * INTO d FROM pg_temp.montar(c_venda, 294595);
  DELETE FROM zoo_operacao_partes WHERE operacao_id = d.op; DELETE FROM financeiro_lancamentos_v2 WHERE id = d.tit;
  UPDATE zoo_operacao_parcelas_programacao SET status = 'prevista' WHERE id = d.parc;
  lk1 := pg_temp.pago(d.op, 300000, '2026-09-01'); v_f0 := pg_temp.foto(d.op);
  v_res := oc_vincular_lancamento(d.op, 1, lk1, NULL, 'vinculo', NULL, NULL, false, false);
  IF (v_res -> 'parcela' ->> 'acao') IS DISTINCT FROM 'preenchida' OR (SELECT valor_total FROM zoo_operacao_compromissos WHERE id = d.comp) IS DISTINCT FROM 300000 THEN
    RAISE EXCEPTION 'D4 vinculo: %', v_res; END IF;
  v_res := oc_desvincular_lancamento(d.op, pg_temp.ver(d.op), lk1, 'volta', NULL, false);
  IF pg_temp.foto(d.op) IS DISTINCT FROM v_f0 OR (v_res -> 'devolucao_ao_saldo' ->> 'modo') IS DISTINCT FROM 'volta_a_prevista' THEN
    RAISE EXCEPTION 'D4 volta: % · parcela %', v_res, (SELECT valor || '/' || status FROM zoo_operacao_parcelas_programacao WHERE id = d.parc); END IF;
  v_ok := v_ok || 'D4 ok (parcela prevista preenchida a mais: volta a prevista com 294595 e o compromisso a 294595); ';

  -- ═══ D5: titulo que nao pode ser reativado ═══
  SELECT * INTO d FROM pg_temp.montar(c_venda, 294595);
  lk1 := pg_temp.pago(d.op, 294595, '2026-09-01');
  v_res := oc_vincular_lancamento(d.op, 1, lk1, NULL, 'vinculo', NULL, NULL, false, false);
  UPDATE financeiro_lancamentos_v2 SET cancelado = false WHERE id = d.tit;      -- alguem o reativou por fora
  v_res := oc_desvincular_lancamento(d.op, pg_temp.ver(d.op), lk1, 'volta', NULL, false);
  IF (v_res -> 'devolucao_ao_saldo' ->> 'modo') IS DISTINCT FROM 'volta_a_prevista' OR (SELECT status FROM zoo_operacao_parcelas_programacao WHERE id = d.parc) IS DISTINCT FROM 'prevista'
     OR (SELECT valor_total FROM zoo_operacao_compromissos WHERE id = d.comp) IS DISTINCT FROM 294595
     OR (SELECT count(*) FROM zoo_operacao_partes WHERE operacao_id = d.op AND NOT cancelada) IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'D5: %', v_res; END IF;
  v_ok := v_ok || 'D5 ok (titulo ja'' vivo por fora: nao e'' reativado de novo; a parcela volta a prevista, compromisso 294595); ';

  -- ═══ R1: desvincular renumera ═══
  SELECT * INTO k FROM pg_temp.montar(c_venda, 200000);
  lr1 := pg_temp.pago(k.op, 200000, '2026-09-01'); lr2 := pg_temp.pago(k.op, 94595, '2026-09-02');
  v_res := oc_vincular_lancamento(k.op, 1, lr1, NULL, 'p1', NULL, NULL, false, false);
  v_res := oc_vincular_lancamento(k.op, pg_temp.ver(k.op), lr2, NULL, 'p2', NULL, NULL, true, false);
  IF pg_temp.partes(k.op) IS DISTINCT FROM '1/2=200000.00:realizado 2/2=94595.00:realizado' THEN RAISE EXCEPTION 'R1 antes: %', pg_temp.partes(k.op); END IF;
  v_res := oc_desvincular_lancamento(k.op, pg_temp.ver(k.op), lr2, 'ensaio', NULL, false);
  IF pg_temp.partes(k.op) IS DISTINCT FROM '1/1=200000.00:realizado' OR (v_res ->> 'parcelas_do_grupo') IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'R1 depois: % · %', pg_temp.partes(k.op), v_res; END IF;
  v_ok := v_ok || 'R1 ok (desvinculada a 2 de 2, a que fica diz 1/1); ';

  -- F1
  SELECT md5(coalesce(string_agg(md5(l::text), '' ORDER BY l.id), '')) INTO v_fora_d FROM financeiro_lancamentos_v2 l WHERE l.id = ANY (v_ids);
  IF v_fora_a IS DISTINCT FROM v_fora_d THEN RAISE EXCEPTION 'F1: lancamento fora do ensaio mudou'; END IF;
  v_ok := v_ok || 'F1 ok (' || cardinality(v_ids) || ' lancamentos que ja'' existiam no Teste com a mesma assinatura)';

  SELECT md5(string_agg(x.s, '' ORDER BY x.id)), count(*) INTO v_out_d, v_n FROM (SELECT cl.id, concat(
      (SELECT md5(coalesce(string_agg(md5(pp::text), '' ORDER BY pp.id), '')) FROM zoo_operacao_partes pp WHERE pp.cliente_id = cl.id),
      (SELECT md5(coalesce(string_agg(md5(kk::text), '' ORDER BY kk.id), '')) FROM zoo_operacao_compromissos kk WHERE kk.cliente_id = cl.id),
      (SELECT md5(coalesce(string_agg(md5(ll::text), '' ORDER BY ll.id), '')) FROM financeiro_lancamentos_v2 ll WHERE ll.cliente_id = cl.id)) s
    FROM clientes cl WHERE cl.id <> c_cli) x;
  IF v_out_a IS DISTINCT FROM v_out_d OR v_n < 1 THEN RAISE EXCEPTION 'F2: outro cliente mudou'; END IF;
  v_ok := v_ok || '; F2 ok (partes, compromissos e lancamentos dos outros ' || v_n || ' clientes identicos)';

  RAISE EXCEPTION 'OK %', v_ok;
END $teste$;
