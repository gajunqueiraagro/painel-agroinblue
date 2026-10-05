-- OC-VINCULAR-CANDIDATAS-01 — nada some da lista de candidatas sem motivo.
--
-- Roda como `postgres`, DEPOIS da migration 20261027193400, numa transacao que TERMINA EM RAISE: nada fica no banco.
-- Sucesso = a excecao final comeca com "OK". Cenario sintetico no cliente Teste (43f32d07), no molde da venda f74f95e5 e de um
-- abate real; uma segunda fazenda e' criada so' dentro do ensaio.
--
-- K1  OC de OUTRA FAZENDA aparece, marcada `outra_fazenda`, DEPOIS da da mesma fazenda; nao e' "fora da janela".
-- K2  OC a 74 dias vem marcada `fora_da_janela` com a distancia; a 200 dias so' entra na contagem `fora_do_limite`; os dois
--     numeros (60 e 180) vem no retorno.
-- K3  OC em RASCUNHO aparece marcada `rascunho`; a CANCELADA nao aparece.
-- K4  OC de OUTRO TIPO (abate, para um recebimento em subcentro de venda) nao aparece e e' contada em `outro_tipo`.
-- K5  quem ja' aparecia continua no topo, e a de valor exato da mesma fazenda segue a primeira.
-- K6  VINCULAR na OC de outra fazenda: nao recusa, grava o aviso `fazenda_diferente` (retorno e trilha) e NAO muda a fazenda do
--     lancamento; a simulacao devolve o mesmo aviso.
-- K7  compromisso com varias parcelas TODAS pagas: a lista o da' como 'recusar' (`todos_liquidados`), e o vincular nao pergunta
--     "qual parcela" — cria o item; com UMA em aberto, continua escolhendo a parcela sozinho (o predicado de antes).
-- K8  todas pagas x a diferenca exata compromisso − parcelas: 0 = `todos_liquidados`; <> 0 (0,50, −0,50, 0,01) = `pagas_com_diferenca`
--     com o valor e o sinal, nunca `todos_liquidados`; o compromisso nao e' oferecido em nenhum.
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

CREATE FUNCTION pg_temp.cand(p_ret jsonb, p_op uuid) RETURNS jsonb LANGUAGE sql AS $f$
  SELECT c FROM jsonb_array_elements(p_ret -> 'candidatas') c WHERE c ->> 'operacao_id' = p_op::text $f$;
CREATE FUNCTION pg_temp.pos(p_ret jsonb, p_op uuid) RETURNS int LANGUAGE sql AS $f$
  SELECT i::int FROM jsonb_array_elements(p_ret -> 'candidatas') WITH ORDINALITY x(c, i) WHERE c ->> 'operacao_id' = p_op::text $f$;

DO $teste$
DECLARE
  c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_faz constant uuid := 'c2498ace-8478-410c-a697-d3f2e2934d1f';
  c_admin constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_venda constant uuid := 'f74f95e5-ecaa-4785-932a-abd37328a1f8';
  c_abate constant uuid := '67ea4fab-bcef-45e3-a3bc-ac73bf28e8da';
  v_faz2 uuid := gen_random_uuid();
  mesma record; outra record; d74 record; d200 record; rasc record; canc record; abt record; pago record;
  l uuid; l2 uuid; l3 uuid; l4 uuid; r jsonb; k jsonb; v jsonb; s jsonb; v_ok text := ''; v_faz_antes uuid; v_n int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  INSERT INTO fazendas SELECT (jsonb_populate_record(NULL::fazendas, to_jsonb(f) || jsonb_build_object('id', v_faz2, 'nome', 'Faz. Ensaio Dois', 'codigo_importacao', 'ENS2', 'codigo', 'ENS2'))).*
    FROM fazendas f WHERE f.id = c_faz;

  -- a venda de sempre (25/08/2026, mesma fazenda, 100.000) e as variacoes
  SELECT * INTO mesma FROM pg_temp.montar(c_venda, 100000);
  SELECT * INTO outra FROM pg_temp.montar(c_venda, 248000);  UPDATE zoo_operacoes_comerciais SET fazenda_id = v_faz2 WHERE id = outra.op;
  SELECT * INTO d74   FROM pg_temp.montar(c_venda, 100000);  UPDATE zoo_operacoes_comerciais SET data_operacao = '2026-06-19', data_embarque = NULL, data_abate = NULL WHERE id = d74.op;
  SELECT * INTO d200  FROM pg_temp.montar(c_venda, 100000);  UPDATE zoo_operacoes_comerciais SET data_operacao = '2026-02-13', data_embarque = NULL, data_abate = NULL WHERE id = d200.op;
  SELECT * INTO rasc  FROM pg_temp.montar(c_venda, 100000);  UPDATE zoo_operacoes_comerciais SET rascunho = true WHERE id = rasc.op;
  SELECT * INTO canc  FROM pg_temp.montar(c_venda, 100000);  UPDATE zoo_operacoes_comerciais SET status_comercial = 'cancelada', cancelado_em = now() WHERE id = canc.op;
  SELECT * INTO abt   FROM pg_temp.montar(c_abate, 100000);  UPDATE zoo_operacoes_comerciais SET data_operacao = '2026-08-28', data_embarque = NULL, data_abate = NULL WHERE id = abt.op;
  UPDATE zoo_operacoes_comerciais SET is_teste = false WHERE id IN (mesma.op, outra.op, d74.op, d200.op, rasc.op, canc.op, abt.op);
  -- o recebimento: 248.000, pago em 01/09/2026, na fazenda de sempre (subcentro de venda)
  l := pg_temp.pago(mesma.op, 248000, '2026-09-01');

  r := oc_candidatas_vinculo(l);
  IF (r ->> 'elegivel') IS DISTINCT FROM 'true' OR (r ->> 'janela_dias') IS DISTINCT FROM '60' OR (r ->> 'limite_dias') IS DISTINCT FROM '180' THEN
    RAISE EXCEPTION 'K0 retorno: %', r - 'candidatas'; END IF;

  -- K1
  k := pg_temp.cand(r, outra.op);
  IF k IS NULL OR (k ->> 'outra_fazenda') IS DISTINCT FROM 'true' OR (k ->> 'mesma_fazenda') IS DISTINCT FROM 'false' OR (k ->> 'fora_da_janela') IS DISTINCT FROM 'false'
     OR (k ->> 'fazenda_nome') IS DISTINCT FROM 'Faz. Ensaio Dois' OR (k ->> 'rascunho') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'K1 outra fazenda: %', k; END IF;
  IF pg_temp.pos(r, outra.op) <= pg_temp.pos(r, mesma.op) THEN RAISE EXCEPTION 'K1: a de outra fazenda veio antes da da mesma (% x %)', pg_temp.pos(r, outra.op), pg_temp.pos(r, mesma.op); END IF;
  v_ok := v_ok || 'K1 ok (outra fazenda aparece marcada, na posicao ' || pg_temp.pos(r, outra.op) || ', depois da mesma fazenda na ' || pg_temp.pos(r, mesma.op) || '); ';

  -- K2
  k := pg_temp.cand(r, d74.op);
  IF k IS NULL OR (k ->> 'fora_da_janela') IS DISTINCT FROM 'true' OR (k ->> 'distancia_dias') IS DISTINCT FROM '74' OR pg_temp.pos(r, d74.op) <= pg_temp.pos(r, outra.op) THEN
    RAISE EXCEPTION 'K2 a 74 dias: % (posicao %)', k, pg_temp.pos(r, d74.op); END IF;
  IF pg_temp.cand(r, d200.op) IS NOT NULL OR (r ->> 'fora_do_limite') IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'K2 a 200 dias: na lista? % · fora_do_limite %', pg_temp.cand(r, d200.op) IS NOT NULL, r ->> 'fora_do_limite'; END IF;
  v_ok := v_ok || 'K2 ok (a 74 dias: fora_da_janela, por ultimo; a 200 dias: fora da lista, fora_do_limite = 1; janela 60 e limite 180 no retorno); ';

  -- K3
  k := pg_temp.cand(r, rasc.op);
  IF k IS NULL OR (k ->> 'rascunho') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'K3 rascunho: %', k; END IF;
  IF pg_temp.cand(r, canc.op) IS NOT NULL THEN RAISE EXCEPTION 'K3: a cancelada apareceu'; END IF;
  -- a de rascunho (mesma fazenda) vem DEPOIS de toda selecionavel da janela — inclusive a de outra fazenda — e antes da de fora da janela
  IF pg_temp.pos(r, rasc.op) <= pg_temp.pos(r, outra.op) OR pg_temp.pos(r, rasc.op) >= pg_temp.pos(r, d74.op) THEN
    RAISE EXCEPTION 'K3: ordem do rascunho (rascunho %, outra fazenda %, fora da janela %)', pg_temp.pos(r, rasc.op), pg_temp.pos(r, outra.op), pg_temp.pos(r, d74.op); END IF;
  v_ok := v_ok || 'K3 ok (rascunho aparece marcada, depois das selecionaveis da janela e antes das de fora; cancelada fora); ';

  -- K4
  IF pg_temp.cand(r, abt.op) IS NOT NULL OR (r -> 'outro_tipo' ->> 'qtd') IS DISTINCT FROM '1' OR (r -> 'outro_tipo' -> 'tipos') IS DISTINCT FROM '["abate"]'::jsonb THEN
    RAISE EXCEPTION 'K4 outro tipo: na lista? % · %', pg_temp.cand(r, abt.op) IS NOT NULL, r -> 'outro_tipo'; END IF;
  v_ok := v_ok || 'K4 ok (abate fora da lista, outro_tipo = 1 [abate]); ';

  -- K5: valor exato na mesma fazenda segue o primeiro
  l2 := pg_temp.pago(mesma.op, 100000, '2026-09-01');
  s := oc_candidatas_vinculo(l2);
  IF pg_temp.pos(s, mesma.op) IS DISTINCT FROM 1 OR pg_temp.pos(s, rasc.op) <= pg_temp.pos(s, mesma.op) THEN RAISE EXCEPTION 'K5: o topo nao e'' da mesma fazenda, na janela: %', (s -> 'candidatas' -> 0) - 'compromissos' - 'lotes'; END IF;
  IF ((s -> 'candidatas' -> 0) ->> 'outra_fazenda') IS DISTINCT FROM 'false' OR ((s -> 'candidatas' -> 0) ->> 'fora_da_janela') IS DISTINCT FROM 'false'
     OR ((s -> 'candidatas' -> 0) ->> 'valor_exato') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'K5 topo: %', (s -> 'candidatas' -> 0) - 'compromissos' - 'lotes'; END IF;
  v_ok := v_ok || 'K5 ok (o topo segue sendo a de valor exato da mesma fazenda, dentro da janela); ';

  -- K6: vincular na OC de outra fazenda
  SELECT fazenda_id INTO v_faz_antes FROM financeiro_lancamentos_v2 WHERE id = l;
  s := oc_vincular_lancamento(outra.op, 1, l, NULL, 'ensaio', NULL, NULL, false, true);
  v := oc_vincular_lancamento(outra.op, 1, l, NULL, 'ensaio', NULL, NULL, false, false);
  SELECT a INTO k FROM jsonb_array_elements(v -> 'avisos') a WHERE a ->> 'codigo' = 'fazenda_diferente';
  IF (v ->> 'ok') IS DISTINCT FROM 'true' OR k IS NULL OR (k ->> 'operacao_fazenda') IS DISTINCT FROM 'Faz. Ensaio Dois' OR (k ->> 'lancamento_fazenda') IS NULL
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s -> 'avisos') a WHERE a ->> 'codigo' = 'fazenda_diferente') THEN
    RAISE EXCEPTION 'K6 vinculo: % (sim %)', v, s -> 'avisos'; END IF;
  IF (SELECT fazenda_id FROM financeiro_lancamentos_v2 WHERE id = l) IS DISTINCT FROM v_faz_antes OR v_faz_antes IS DISTINCT FROM c_faz THEN RAISE EXCEPTION 'K6: a fazenda do lancamento mudou'; END IF;
  IF NOT EXISTS (SELECT 1 FROM zoo_operacao_eventos e, jsonb_array_elements(e.detalhes -> 'avisos') a
                  WHERE e.operacao_id = outra.op AND e.acao = 'vincular_lancamento' AND a ->> 'codigo' = 'fazenda_diferente') THEN
    RAISE EXCEPTION 'K6: o aviso nao foi para a trilha'; END IF;
  v_ok := v_ok || 'K6 ok (vinculou na OC de outra fazenda: aviso fazenda_diferente no retorno, na simulacao e na trilha; fazenda do lancamento intacta); ';

  -- K7: compromisso com duas parcelas TODAS pagas
  SELECT * INTO pago FROM pg_temp.montar(c_venda, 100000);  UPDATE zoo_operacoes_comerciais SET is_teste = false WHERE id = pago.op;
  l3 := pg_temp.pago(pago.op, 60000, '2026-09-01'); l4 := pg_temp.pago(pago.op, 40000, '2026-09-02');
  v := oc_vincular_lancamento(pago.op, 1, l3, NULL, 'p1', NULL, NULL, false, false);
  IF _oc_vinculo_compromisso_liquidado(pago.comp) THEN RAISE EXCEPTION 'K7: com UMA parcela em aberto o compromisso nao e'' liquidado'; END IF;
  v := oc_vincular_lancamento(pago.op, pg_temp.ver(pago.op), l4, NULL, 'p2', NULL, NULL, false, false);   -- escolhe a parcela em aberto sozinho
  IF (v ->> 'ok') IS DISTINCT FROM 'true' OR (v -> 'parcela' ->> 'acao') IS DISTINCT FROM 'substituida' THEN RAISE EXCEPTION 'K7 segundo: %', v; END IF;
  IF NOT _oc_vinculo_compromisso_liquidado(pago.comp) THEN RAISE EXCEPTION 'K7: com as DUAS pagas o compromisso tem de contar como liquidado'; END IF;
  l4 := pg_temp.pago(pago.op, 5000, '2026-09-03');
  r := oc_candidatas_vinculo(l4);
  k := pg_temp.cand(r, pago.op);
  IF (k ->> 'todos_liquidados') IS DISTINCT FROM 'true' OR (k -> 'compromissos' -> 0 ->> 'acao_prevista') IS DISTINCT FROM 'recusar' THEN
    RAISE EXCEPTION 'K7 lista: % · %', k ->> 'todos_liquidados', k -> 'compromissos'; END IF;
  v := oc_vincular_lancamento(pago.op, pg_temp.ver(pago.op), l4, NULL, 'p3', NULL, NULL, false, true);
  IF (v ->> 'ok') IS DISTINCT FROM 'true' OR (v -> 'compromisso' ->> 'acao') IS DISTINCT FROM 'criado' THEN RAISE EXCEPTION 'K7 vinculo: % (esperava criar item, sem pergunta)', v; END IF;
  v_ok := v_ok || 'K7 ok (uma em aberto: parcela escolhida sozinha; todas pagas: a lista diz recusar e o vincular cria o item, sem perguntar a parcela)';

  -- K8: todas pagas x a diferenca EXATA entre o compromisso e a soma das parcelas (sem tolerancia: R$ 0,01 conta)
  k := pg_temp.cand(oc_candidatas_vinculo(l4), pago.op);
  IF (k ->> 'pagas_com_diferenca') IS DISTINCT FROM 'false' OR (k ->> 'diferenca_parcelas')::numeric <> 0
     OR (k -> 'compromissos' -> 0 ->> 'diferenca_parcelas')::numeric <> 0 OR (k -> 'compromissos' -> 0 ->> 'pagas_com_diferenca') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'K8 diferenca zero: %', k - 'lotes'; END IF;
  UPDATE zoo_operacao_compromissos SET valor_total = 100000.50 WHERE id = pago.comp;
  k := pg_temp.cand(oc_candidatas_vinculo(l4), pago.op);
  IF (k ->> 'todos_liquidados') IS DISTINCT FROM 'false' OR (k ->> 'pagas_com_diferenca') IS DISTINCT FROM 'true' OR (k ->> 'diferenca_parcelas')::numeric <> 0.50
     OR (k -> 'compromissos' -> 0 ->> 'diferenca_parcelas')::numeric <> 0.50 OR (k -> 'compromissos' -> 0 ->> 'pagas_com_diferenca') IS DISTINCT FROM 'true'
     OR (k -> 'compromissos' -> 0 ->> 'acao_prevista') IS DISTINCT FROM 'recusar' THEN
    RAISE EXCEPTION 'K8 falta 0,50: %', k - 'lotes'; END IF;
  UPDATE zoo_operacao_compromissos SET valor_total = 99999.50 WHERE id = pago.comp;
  k := pg_temp.cand(oc_candidatas_vinculo(l4), pago.op);
  IF (k ->> 'todos_liquidados') IS DISTINCT FROM 'false' OR (k ->> 'pagas_com_diferenca') IS DISTINCT FROM 'true' OR (k ->> 'diferenca_parcelas')::numeric <> -0.50
     OR (k -> 'compromissos' -> 0 ->> 'acao_prevista') IS DISTINCT FROM 'recusar' THEN
    RAISE EXCEPTION 'K8 pago a mais 0,50: %', k - 'lotes'; END IF;
  UPDATE zoo_operacao_compromissos SET valor_total = 100000.01 WHERE id = pago.comp;
  k := pg_temp.cand(oc_candidatas_vinculo(l4), pago.op);
  IF (k ->> 'pagas_com_diferenca') IS DISTINCT FROM 'true' OR (k ->> 'diferenca_parcelas')::numeric <> 0.01 THEN RAISE EXCEPTION 'K8 um centavo: %', k - 'lotes'; END IF;
  v_ok := v_ok || '; K8 ok (todas pagas: diferenca 0 = todos_liquidados; 0,50 e -0,50 = pagas_com_diferenca com o valor e o sinal, nunca todos_liquidados; 0,01 ja'' conta; o compromisso e'' recusar nos quatro)';

  RAISE EXCEPTION 'OK %', v_ok;
END $teste$;
