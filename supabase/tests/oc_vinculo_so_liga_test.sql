-- OC-VINCULO-VALOR — VINCULAR SO' LIGA (Gabriel, 30/10/2026): "Vincular não pode mudar valor, não pode nada, nada, nada. Cria um
-- novo, se for o caso, dentro da OC".
--
-- Roda como `postgres`, DEPOIS da migration 20261028115090, numa transacao que TERMINA EM RAISE: nada fica no banco.
-- Sucesso = a excecao final comeca com "OK". Qualquer outra excecao e' falha e diz qual prova caiu.
-- Fixture sintetico no cliente Teste (43f32d07), no molde da venda f74f95e5 (so' a estrutura e' copiada).
--
-- M1  LANCAMENTO MANUAL ocupando a parcela (o caso do Acompanhamento): ligar outro lancamento ao compromisso dele — simulando ou
--     gravando — RECUSA `parcela_tem_lancamento` com a frase e `pode_criar_novo`; NADA gravado (OC, lancamentos, versao).
-- M2  "Criar compromisso novo" (`p_criar_novo`): liga num compromisso NOVO, com o valor do lancamento ligado; o manual fica intacto.
-- F1  FORNECEDOR diferente, compromisso unico livre do item: nunca escolhe sozinho — `escolher_compromisso` com `fornecedor_diferente`
--     e `pode_criar_novo`; nada gravado. Escolhido pelo operador (`p_compromisso_id`), segue.
-- T1  TITULO PROGRAMADO DA OC, recebimento menor: a simulacao devolve `confirmar_titulo_oc` (reduzir, 294.595 -> 94.595, a frase);
--     gravar SEM `p_aceitar_titulo_oc` recusa e nada grava; COM ela, o titulo e' reduzido (a regra de 05/10).
-- T2  recebimento igual: `confirmar_titulo_oc` com acao 'cancelar'; sem a confirmacao nada grava.
-- C1  COMPETENCIA: o lancamento ligado sai como entrou (valor, descricao, classificacao, competencia 01/09 — a OC e' de 25/08 —,
--     safra, datas, status), byte a byte fora `updated_at`/`updated_by`.
-- Z1  nada mais muda: os lancamentos que ja' existiam no Teste e os dados dos outros clientes tem a mesma assinatura antes e depois.
CREATE FUNCTION pg_temp.foto(p_op uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT md5(concat_ws('#',
    (SELECT string_agg((to_jsonb(c) - 'updated_at')::text, '|' ORDER BY c.id) FROM zoo_operacao_compromissos c WHERE c.operacao_id = p_op),
    (SELECT string_agg((to_jsonb(g) - 'updated_at')::text, '|' ORDER BY g.id) FROM zoo_operacao_programacoes g
       JOIN zoo_operacao_compromissos c ON c.id = g.compromisso_id WHERE c.operacao_id = p_op),
    (SELECT string_agg((to_jsonb(p) - 'updated_at')::text, '|' ORDER BY p.id) FROM zoo_operacao_parcelas_programacao p
       JOIN zoo_operacao_programacoes g ON g.id = p.programacao_id JOIN zoo_operacao_compromissos c ON c.id = g.compromisso_id
      WHERE c.operacao_id = p_op),
    (SELECT string_agg((to_jsonb(t) - 'updated_at')::text, '|' ORDER BY t.id) FROM zoo_operacao_partes t WHERE t.operacao_id = p_op),
    (SELECT string_agg((to_jsonb(f) - 'updated_at' - 'updated_by')::text, '|' ORDER BY f.id) FROM financeiro_lancamentos_v2 f
      WHERE f.cliente_id = '43f32d07-dba8-4670-900c-bf645440c04a' AND f.descricao LIKE 'ENSAIO%'),
    (SELECT versao::text FROM zoo_operacoes_comerciais WHERE id = p_op),
    (SELECT count(*)::text FROM zoo_operacao_eventos WHERE operacao_id = p_op)));
$f$;
CREATE FUNCTION pg_temp.lanc(p_id uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT (to_jsonb(f) - 'updated_at' - 'updated_by')::text FROM financeiro_lancamentos_v2 f WHERE f.id = p_id;
$f$;
CREATE FUNCTION pg_temp.ver(p_op uuid) RETURNS int LANGUAGE sql AS $f$ SELECT versao FROM zoo_operacoes_comerciais WHERE id = p_op $f$;
-- uma OC no Teste a partir do molde, com UM compromisso principal de p_valor e o titulo PROGRAMADO gerado pela OC (p_origem muda isso)
CREATE FUNCTION pg_temp.montar(p_molde uuid, p_valor numeric, p_origem text, OUT op uuid, OUT comp uuid, OUT parc uuid, OUT tit uuid)
LANGUAGE plpgsql AS $f$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_conta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  m record; v_lote uuid := gen_random_uuid(); v_prog uuid := gen_random_uuid();
BEGIN
  op := gen_random_uuid(); comp := gen_random_uuid(); parc := gen_random_uuid();
  INSERT INTO zoo_operacoes_comerciais SELECT (jsonb_populate_record(NULL::zoo_operacoes_comerciais, to_jsonb(o) || jsonb_build_object(
      'id', op, 'cliente_id', c_cli, 'fazenda_id', c_faz, 'contraparte_id', NULL, 'versao', 1, 'is_teste', true, 'valor_acordado', p_valor))).*
    FROM zoo_operacoes_comerciais o WHERE o.id = p_molde;
  INSERT INTO zoo_operacao_lotes SELECT (jsonb_populate_record(NULL::zoo_operacao_lotes, to_jsonb(l) || jsonb_build_object(
      'id', v_lote, 'cliente_id', c_cli, 'operacao_id', op))).*
    FROM zoo_operacao_lotes l WHERE l.operacao_id = p_molde LIMIT 1;
  INSERT INTO zoo_operacao_compromissos SELECT (jsonb_populate_record(NULL::zoo_operacao_compromissos, to_jsonb(c) || jsonb_build_object(
      'id', comp, 'cliente_id', c_cli, 'operacao_id', op, 'lote_id', v_lote, 'favorecido_id', NULL, 'valor_total', p_valor, 'status', 'programado'))).*
    FROM zoo_operacao_compromissos c WHERE c.operacao_id = p_molde AND c.natureza = 'principal' AND c.status IS DISTINCT FROM 'cancelado'
   ORDER BY c.created_at LIMIT 1;
  INSERT INTO zoo_operacao_programacoes (id, cliente_id, compromisso_id, condicoes, status) VALUES (v_prog, c_cli, comp, 'ensaio', 'ativa');
  INSERT INTO zoo_operacao_parcelas_programacao (id, cliente_id, programacao_id, sequencia, valor, vencimento, conta_bancaria_id, forma, status)
  VALUES (parc, c_cli, v_prog, 1, p_valor, '2026-10-09', c_conta, NULL, 'materializada');
  SELECT c.*, o.data_operacao INTO m FROM zoo_operacao_compromissos c JOIN zoo_operacoes_comerciais o ON o.id = c.operacao_id WHERE c.id = comp;
  IF m.id IS NULL THEN RAISE EXCEPTION 'SETUP: o molde % nao montou', p_molde; END IF;
  INSERT INTO financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_destino_id, data_competencia, data_vencimento, valor, sinal,
      tipo_operacao, status_transacao, descricao, subcentro, plano_conta_id, origem_lancamento, ano_mes, cenario)
  VALUES (c_cli, c_faz, c_conta, m.data_operacao, '2026-10-09', p_valor, '1', '1-Entradas',
      CASE WHEN p_origem = 'operacao_comercial' THEN 'programado' ELSE 'agendado' END, 'ENSAIO titulo ' || p_origem,
      m.subcentro, m.plano_conta_id, p_origem, to_char(m.data_operacao, 'YYYY-MM'), 'realizado')
  RETURNING id INTO tit;
  INSERT INTO zoo_operacao_partes (cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas, valor,
      data_vencimento, descricao, incluso_no_total, plano_conta_id, subcentro, lote_id, programacao_parcela_id, financeiro_lancamento_id)
  VALUES (c_cli, op, 'programacao', 'principal', 'principal', 1, 1, p_valor, '2026-10-09', m.descricao, false, m.plano_conta_id, m.subcentro,
      v_lote, parc, tit);
END $f$;
-- um recebimento REALIZADO do banco, com a classificacao do compromisso, competencia 01/09 (a OC do molde e' de 25/08)
CREATE FUNCTION pg_temp.pago(p_op uuid, p_valor numeric, p_forn uuid) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_conta constant uuid := '131b8501-caf7-4964-b1b1-3f552ad2b75d';
  m record; v_id uuid;
BEGIN
  SELECT c.subcentro, c.plano_conta_id INTO m FROM zoo_operacao_compromissos c WHERE c.operacao_id = p_op ORDER BY c.created_at LIMIT 1;
  INSERT INTO financeiro_lancamentos_v2 (cliente_id, fazenda_id, conta_destino_id, data_competencia, data_pagamento, data_vencimento, valor, sinal,
      tipo_operacao, status_transacao, descricao, subcentro, plano_conta_id, origem_lancamento, ano_mes, cenario, favorecido_id)
  VALUES (c_cli, c_faz, c_conta, '2026-09-01', '2026-09-01', '2026-09-01', p_valor, '1', '1-Entradas', 'realizado', 'ENSAIO banco ' || p_valor,
      m.subcentro, m.plano_conta_id, 'extrato', '2026-09', 'realizado', p_forn)
  RETURNING id INTO v_id;
  RETURN v_id;
END $f$;

DO $teste$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_venda constant uuid := 'f74f95e5-ecaa-4785-932a-abd37328a1f8';
  c_forn1 constant uuid := '085c00ce-b4bb-48d6-9881-099db7aed3e2';
  c_forn2 constant uuid := '58b34cd4-c5d9-4eaf-b04a-e3985212d757';
  a record; b record; t record; r record;
  l1 uuid; l2 uuid; l3 uuid; l4 uuid; v_r jsonb; v_s jsonb; v_f0 text; v_l0 text; v_t0 text; v_ok text := '';
  v_ids uuid[]; v_fora_a text; v_fora_d text; v_out_a text; v_out_d text; v_n int;
BEGIN
  SET LOCAL lock_timeout = '2s'; SET LOCAL statement_timeout = '30s';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  SELECT array_agg(l.id), md5(coalesce(string_agg(md5(l::text), '' ORDER BY l.id), '')) INTO v_ids, v_fora_a FROM financeiro_lancamentos_v2 l WHERE l.cliente_id = c_cli;
  SELECT md5(string_agg(x.s, '' ORDER BY x.id)) INTO v_out_a FROM (SELECT cl.id, concat(
      (SELECT md5(coalesce(string_agg(md5(pp::text), '' ORDER BY pp.id), '')) FROM zoo_operacao_partes pp WHERE pp.cliente_id = cl.id),
      (SELECT md5(coalesce(string_agg(md5(kk::text), '' ORDER BY kk.id), '')) FROM zoo_operacao_compromissos kk WHERE kk.cliente_id = cl.id),
      (SELECT md5(coalesce(string_agg(md5(ll::text), '' ORDER BY ll.id), '')) FROM financeiro_lancamentos_v2 ll WHERE ll.cliente_id = cl.id)) s
    FROM clientes cl WHERE cl.id <> c_cli) x;

  -- ═══ M1: lancamento manual ocupando a parcela ═══
  SELECT * INTO a FROM pg_temp.montar(c_venda, 1850, 'manual');
  l1 := pg_temp.pago(a.op, 1803.75, NULL);
  v_f0 := pg_temp.foto(a.op);
  v_s := oc_vincular_lancamento(a.op, 1, l1, NULL, NULL, a.comp, NULL, false, true);
  v_r := oc_vincular_lancamento(a.op, 1, l1, NULL, 'ensaio', a.comp, NULL, false, false);
  IF (v_r ->> 'motivo') IS DISTINCT FROM 'parcela_tem_lancamento' OR (v_r ->> 'ok') IS DISTINCT FROM 'false'
     OR (v_r ->> 'pode_criar_novo') IS DISTINCT FROM 'true' OR (v_r ->> 'frase') NOT LIKE 'Este compromisso já tem o lançamento ENSAIO titulo manual (R$%1.850,00). Crie um compromisso novo para este.'
     OR (v_s ->> 'motivo') IS DISTINCT FROM 'parcela_tem_lancamento' THEN
    RAISE EXCEPTION 'M1: o manual ocupando nao recusou: % / %', v_s, v_r; END IF;
  IF pg_temp.foto(a.op) IS DISTINCT FROM v_f0 THEN RAISE EXCEPTION 'M1: a recusa gravou'; END IF;
  v_ok := v_ok || 'M1 ok (manual ocupando: recusa com a frase, simulando e gravando; nada gravado); ';

  -- ═══ M2: criar compromisso novo ═══
  v_t0 := pg_temp.lanc(a.tit); v_l0 := pg_temp.lanc(l1);
  v_r := oc_vincular_lancamento(a.op, 1, l1, 'principal', 'ensaio', NULL, NULL, true, false);
  IF (v_r ->> 'ok') IS DISTINCT FROM 'true' OR (v_r -> 'compromisso' ->> 'acao') IS DISTINCT FROM 'criado'
     OR (v_r -> 'compromisso' ->> 'valor_total')::numeric IS DISTINCT FROM 1803.75
     OR (SELECT count(*) FROM zoo_operacao_compromissos WHERE operacao_id = a.op AND status <> 'cancelado') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'M2: criar novo: %', v_r; END IF;
  IF pg_temp.lanc(a.tit) IS DISTINCT FROM v_t0 OR pg_temp.lanc(l1) IS DISTINCT FROM v_l0
     OR (SELECT valor FROM financeiro_lancamentos_v2 WHERE id = a.tit) IS DISTINCT FROM 1850 THEN
    RAISE EXCEPTION 'M2: um lancamento mudou ao criar o compromisso novo'; END IF;
  v_ok := v_ok || 'M2 ok (criar novo: compromisso de 1803.75 dentro da OC; o manual segue 1850 e o ligado intacto); ';

  -- ═══ F1: fornecedor diferente ═══
  SELECT * INTO b FROM pg_temp.montar(c_venda, 294595, 'operacao_comercial');
  UPDATE zoo_operacao_compromissos SET favorecido_id = c_forn1 WHERE id = b.comp;
  l2 := pg_temp.pago(b.op, 200000, c_forn2);
  v_f0 := pg_temp.foto(b.op);
  v_r := oc_vincular_lancamento(b.op, 1, l2, 'principal', 'ensaio', NULL, NULL, false, false, true);
  IF (v_r ->> 'motivo') IS DISTINCT FROM 'escolher_compromisso' OR (v_r ->> 'fornecedor_diferente') IS DISTINCT FROM 'true'
     OR (v_r ->> 'pode_criar_novo') IS DISTINCT FROM 'true' OR jsonb_array_length(v_r -> 'compromissos') IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'F1: escolheu sozinho o compromisso de outro fornecedor: %', v_r; END IF;
  IF pg_temp.foto(b.op) IS DISTINCT FROM v_f0 THEN RAISE EXCEPTION 'F1: a pergunta gravou'; END IF;
  v_s := oc_vincular_lancamento(b.op, 1, l2, NULL, NULL, b.comp, NULL, false, true);
  IF (v_s ->> 'ok') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'F1: escolhido pelo operador nao seguiu: %', v_s; END IF;
  v_ok := v_ok || 'F1 ok (fornecedor diferente: pergunta, com criar novo; nada gravado; escolhido pelo operador segue); ';

  -- ═══ T1: titulo programado da OC, recebimento menor ═══
  SELECT * INTO t FROM pg_temp.montar(c_venda, 294595, 'operacao_comercial');
  l3 := pg_temp.pago(t.op, 200000, NULL);
  v_f0 := pg_temp.foto(t.op); v_l0 := pg_temp.lanc(l3);
  v_s := oc_vincular_lancamento(t.op, 1, l3, 'principal', NULL, NULL, NULL, false, true);
  IF (v_s ->> 'ok') IS DISTINCT FROM 'true' OR (v_s -> 'confirmar_titulo_oc' ->> 'acao') IS DISTINCT FROM 'reduzir'
     OR (v_s -> 'confirmar_titulo_oc' ->> 'valor_antes')::numeric IS DISTINCT FROM 294595
     OR (v_s -> 'confirmar_titulo_oc' ->> 'valor_depois')::numeric IS DISTINCT FROM 94595
     OR (v_s -> 'confirmar_titulo_oc' ->> 'titulo_id') IS DISTINCT FROM t.tit::text
     OR replace(v_s -> 'confirmar_titulo_oc' ->> 'frase', chr(160), ' ') IS DISTINCT FROM 'O título programado da OC de R$ 294.595,00 passa a R$ 94.595,00.' THEN
    RAISE EXCEPTION 'T1: a previa nao diz o que acontece com o titulo da OC: %', v_s; END IF;
  v_r := oc_vincular_lancamento(t.op, 1, l3, 'principal', 'ensaio', NULL, NULL, false, false);
  IF (v_r ->> 'motivo') IS DISTINCT FROM 'confirmar_titulo_oc' OR pg_temp.foto(t.op) IS DISTINCT FROM v_f0 THEN
    RAISE EXCEPTION 'T1: sem a confirmacao o titulo da OC mudou (ou nao recusou): %', v_r; END IF;
  v_r := oc_vincular_lancamento(t.op, 1, l3, 'principal', 'ensaio', NULL, NULL, false, false, true);
  IF (v_r ->> 'ok') IS DISTINCT FROM 'true' OR (SELECT valor FROM financeiro_lancamentos_v2 WHERE id = t.tit) IS DISTINCT FROM 94595 THEN
    RAISE EXCEPTION 'T1: com a confirmacao o titulo nao foi reduzido: %', v_r; END IF;
  v_ok := v_ok || 'T1 ok (titulo da OC: a previa diz 294595 -> 94595; sem o clique recusa e nada grava; com o clique reduz); ';

  -- ═══ C1: o lancamento ligado sai como entrou (competencia 01/09, a OC e' de 25/08) ═══
  IF pg_temp.lanc(l3) IS DISTINCT FROM v_l0 OR (SELECT data_competencia FROM financeiro_lancamentos_v2 WHERE id = l3) IS DISTINCT FROM '2026-09-01'
     OR (v_r -> 'lancamento' ->> 'competencia_nova') IS DISTINCT FROM '2026-09-01' THEN
    RAISE EXCEPTION 'C1: o vincular mudou o lancamento ligado: % -> %', v_l0, pg_temp.lanc(l3); END IF;
  v_ok := v_ok || 'C1 ok (o ligado byte a byte igual, competencia 01/09 mantida); ';

  -- ═══ T2: recebimento igual — o titulo da OC seria cancelado ═══
  SELECT * INTO t FROM pg_temp.montar(c_venda, 50000, 'operacao_comercial');
  l4 := pg_temp.pago(t.op, 50000, NULL);
  v_f0 := pg_temp.foto(t.op);
  v_s := oc_vincular_lancamento(t.op, 1, l4, 'principal', NULL, NULL, NULL, false, true);
  v_r := oc_vincular_lancamento(t.op, 1, l4, 'principal', 'ensaio', NULL, NULL, false, false);
  IF (v_s -> 'confirmar_titulo_oc' ->> 'acao') IS DISTINCT FROM 'cancelar' OR (v_r ->> 'motivo') IS DISTINCT FROM 'confirmar_titulo_oc'
     OR pg_temp.foto(t.op) IS DISTINCT FROM v_f0 THEN
    RAISE EXCEPTION 'T2: substituir o titulo da OC sem a confirmacao: % / %', v_s, v_r; END IF;
  v_ok := v_ok || 'T2 ok (valor igual: a previa diz que o titulo da OC e'' cancelado; sem o clique nada grava); ';

  -- ═══ Z1 ═══
  SELECT md5(coalesce(string_agg(md5(l::text), '' ORDER BY l.id), '')) INTO v_fora_d FROM financeiro_lancamentos_v2 l WHERE l.id = ANY (v_ids);
  IF v_fora_a IS DISTINCT FROM v_fora_d THEN RAISE EXCEPTION 'Z1: lancamento fora do ensaio mudou'; END IF;
  SELECT md5(string_agg(x.s, '' ORDER BY x.id)), count(*) INTO v_out_d, v_n FROM (SELECT cl.id, concat(
      (SELECT md5(coalesce(string_agg(md5(pp::text), '' ORDER BY pp.id), '')) FROM zoo_operacao_partes pp WHERE pp.cliente_id = cl.id),
      (SELECT md5(coalesce(string_agg(md5(kk::text), '' ORDER BY kk.id), '')) FROM zoo_operacao_compromissos kk WHERE kk.cliente_id = cl.id),
      (SELECT md5(coalesce(string_agg(md5(ll::text), '' ORDER BY ll.id), '')) FROM financeiro_lancamentos_v2 ll WHERE ll.cliente_id = cl.id)) s
    FROM clientes cl WHERE cl.id <> c_cli) x;
  IF v_out_a IS DISTINCT FROM v_out_d OR v_n < 1 THEN RAISE EXCEPTION 'Z1: outro cliente mudou'; END IF;
  v_ok := v_ok || 'Z1 ok (' || cardinality(v_ids) || ' lancamentos do Teste e ' || v_n || ' outros clientes identicos)';

  RAISE EXCEPTION 'OK %', v_ok;
END $teste$;
