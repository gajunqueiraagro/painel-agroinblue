-- CONC-DIVIDENDOS-PLANO-01 — o dividendo cadastrado existe no plano do cliente.
-- Roda depois da 20261027195000, numa transacao que TERMINA EM RAISE (nada fica). Sintetico no cliente Teste.
-- D0 O QUE A MIGRATION DEIXOU (estado real, so' leitura): a busca sabe achar (conjunto nao vazio); as 11 contas sao POR CLIENTE,
--    com as colunas do molde, ordem 17160 passo 10 por cliente em ordem alfabetica; todo lancamento do backfill esta' na conta do
--    SEU cliente, com o MESMO subcentro; 0 lancamentos vivos "Dividendos ..." sem plano.
-- D1 CONTA CRIADA pelo molde para um dividendo sintetico; o lancamento que nasceu ANTES da conta (texto, sem chave) segue sem chave.
-- D2 CONTAGEM DIVERGENTE ABORTA e nada e' escrito.
-- D3 BACKFILL SO' NO VAZIO: o lancamento sem chave recebe a conta; o cancelado, o de outro subcentro e o de OUTRO cliente nao;
--    valor, datas, status e conta bancaria identicos; a marca "editado manual" nao muda.
-- D4 DEPOIS DA CONTA, lancamento novo com o texto ja' nasce com a chave (o gatilho resolve o texto para a conta do cliente).
-- D5 GESTO CONTRARIO devolve o estado: lancamento a nulo, conta removida.
-- ⚠ A migration e' um bloco de uma vez so' (nao ha' funcao para chamar): `pg_temp.backfill` e' ESPELHO DECLARADO dos passos dela
--   (conta pelo molde -> guarda de contagem -> UPDATE so' no vazio sob app.propagando_plano), sobre dado sintetico.
set local statement_timeout = '90s';
set local lock_timeout = '3s';

create function pg_temp.lan(p_cli uuid, p_sub text, p_cancelado boolean default false) returns uuid language sql as $f$
  insert into financeiro_lancamentos_v2 (cliente_id, tipo_operacao, sinal, valor, status_transacao, data_competencia, data_vencimento,
                                         cenario, descricao, subcentro, macro_custo, grupo_custo, centro_custo, escopo_negocio, cancelado)
  values (p_cli, '2-Saídas', '-1', 12.34, 'previsto', date '2031-01-10', date '2031-01-10', 'realizado', 'SINT divplano', p_sub,
          'Dividendos', null, 'Dividendos', 'administrativo', p_cancelado)
  returning id $f$;

create function pg_temp.backfill(p_cli uuid, p_sub text, p_esperado integer) returns uuid language plpgsql as $f$
DECLARE v_id uuid := gen_random_uuid(); v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM financeiro_lancamentos_v2 l
   WHERE l.cliente_id = p_cli AND l.subcentro = p_sub AND l.plano_conta_id IS NULL AND NOT coalesce(l.cancelado, false);
  IF v_n <> p_esperado THEN RAISE EXCEPTION 'esperados % lancamentos sem plano, achados %', p_esperado, v_n USING ERRCODE = 'P0001'; END IF;
  INSERT INTO financeiro_plano_contas (id, cliente_id, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro, grupo_fluxo,
                                       escopo_negocio, ativo, ordem_exibicao, compoe_dre, gera_lcdpr, bloco_dre)
  SELECT v_id, p_cli, m.tipo_operacao, m.macro_custo, m.grupo_custo, m.centro_custo, p_sub, m.grupo_fluxo, m.escopo_negocio, true,
         17990, m.compoe_dre, m.gera_lcdpr, m.bloco_dre
    FROM financeiro_plano_contas m WHERE m.id = 'df784cef-da03-43c6-8e6b-bac7dc933dc7';
  PERFORM set_config('app.propagando_plano', 'on', true);
  UPDATE financeiro_lancamentos_v2 l SET plano_conta_id = v_id
   WHERE l.cliente_id = p_cli AND l.subcentro = p_sub AND l.plano_conta_id IS NULL AND NOT coalesce(l.cancelado, false);
  PERFORM set_config('app.propagando_plano', 'off', true);
  RETURN v_id;
END $f$;

DO $t$
DECLARE
  c_cli   constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a';
  c_molde constant uuid := 'df784cef-da03-43c6-8e6b-bac7dc933dc7';
  c_sub   constant text := 'Dividendos SINT DIVPLANO';
  v_outro uuid; v_a uuid; v_canc uuid; v_outro_sub uuid; v_de_outro uuid; v_novo uuid; v_conta uuid; v_n integer; v_foto text; v_edit boolean;
BEGIN
  -- ── D0: o estado real ───────────────────────────────────────────────────────
  SELECT count(*) INTO v_n FROM conc_dividendos_plano_01_backfill;
  IF v_n <> 567 THEN RAISE EXCEPTION 'D0: backfill com % linhas (esperadas 567) — a busca nao achou o conjunto', v_n; END IF;
  SELECT count(DISTINCT plano_conta_id) INTO v_n FROM conc_dividendos_plano_01_backfill;
  IF v_n <> 11 THEN RAISE EXCEPTION 'D0: % contas no backfill (esperadas 11)', v_n; END IF;
  IF EXISTS (SELECT 1 FROM financeiro_plano_contas p, financeiro_plano_contas m
              WHERE m.id = c_molde AND p.id IN (SELECT plano_conta_id FROM conc_dividendos_plano_01_backfill)
                AND (p.cliente_id IS NULL OR NOT p.ativo
                  OR row(p.tipo_operacao, p.macro_custo, p.grupo_custo, p.centro_custo, p.grupo_fluxo, p.escopo_negocio, p.compoe_dre, p.gera_lcdpr, p.bloco_dre)
                     IS DISTINCT FROM row(m.tipo_operacao, m.macro_custo, m.grupo_custo, m.centro_custo, m.grupo_fluxo, m.escopo_negocio, m.compoe_dre, m.gera_lcdpr, m.bloco_dre)
                  OR p.subcentro NOT LIKE 'Dividendos %')) THEN
    RAISE EXCEPTION 'D0: conta nova fora do molde, global ou inativa';
  END IF;
  IF EXISTS (SELECT 1 FROM (SELECT p.ordem_exibicao, 17150 + 10 * row_number() OVER (PARTITION BY p.cliente_id ORDER BY p.subcentro) esperada
                              FROM financeiro_plano_contas p WHERE p.id IN (SELECT plano_conta_id FROM conc_dividendos_plano_01_backfill)) x
              WHERE x.ordem_exibicao <> x.esperada) THEN
    RAISE EXCEPTION 'D0: ordem_exibicao fora da sequencia 17160, passo 10, por cliente';
  END IF;
  IF EXISTS (SELECT 1 FROM conc_dividendos_plano_01_backfill b JOIN financeiro_plano_contas p ON p.id = b.plano_conta_id
               JOIN financeiro_lancamentos_v2 l ON l.id = b.lancamento_id
              WHERE p.cliente_id <> l.cliente_id OR (l.plano_conta_id = p.id AND l.subcentro <> p.subcentro)) THEN
    RAISE EXCEPTION 'D0: lancamento do backfill em conta de outro cliente ou com outro subcentro';
  END IF;
  SELECT count(*) INTO v_n FROM financeiro_lancamentos_v2 l
   WHERE NOT coalesce(l.cancelado, false) AND l.plano_conta_id IS NULL AND l.subcentro LIKE 'Dividendos %';
  IF v_n <> 0 THEN RAISE EXCEPTION 'D0: % lancamentos "Dividendos ..." vivos sem plano', v_n; END IF;

  -- ── D1: antes da conta, o texto fica sem chave ──────────────────────────────
  SELECT id INTO v_outro FROM clientes WHERE id <> c_cli ORDER BY id LIMIT 1;
  v_a := pg_temp.lan(c_cli, c_sub);
  v_canc := pg_temp.lan(c_cli, c_sub, true);
  v_outro_sub := pg_temp.lan(c_cli, c_sub || ' B');
  v_de_outro := pg_temp.lan(v_outro, c_sub);
  IF (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE id IN (v_a, v_canc, v_outro_sub, v_de_outro) AND plano_conta_id IS NULL) <> 4 THEN
    RAISE EXCEPTION 'D1: lancamento de dividendo sem conta no plano nasceu com chave';
  END IF;
  -- o lancamento passa a ser "importado e nao editado": e' o caso em que o gatilho marcaria editado manual
  UPDATE financeiro_lancamentos_v2 SET lote_importacao_id = (SELECT id FROM financeiro_importacoes_v2 ORDER BY id LIMIT 1) WHERE id = v_a;
  PERFORM set_config('app.propagando_plano', 'on', true);
  UPDATE financeiro_lancamentos_v2 SET editado_manual = false WHERE id = v_a;
  PERFORM set_config('app.propagando_plano', 'off', true);
  IF (SELECT lote_importacao_id IS NULL OR editado_manual FROM financeiro_lancamentos_v2 WHERE id = v_a) THEN RAISE EXCEPTION 'D1: nao consegui montar o importado nao editado'; END IF;
  SELECT md5(row(valor, sinal, data_competencia, data_pagamento, data_vencimento, status_transacao, conta_bancaria_id, conta_destino_id,
                 fazenda_id, safra_id, subcentro, macro_custo, centro_custo, escopo_negocio, descricao)::text), editado_manual
    INTO v_foto, v_edit FROM financeiro_lancamentos_v2 WHERE id = v_a;

  -- ── D2: contagem divergente aborta, e nada e' escrito ───────────────────────
  BEGIN
    PERFORM pg_temp.backfill(c_cli, c_sub, 2);
    RAISE EXCEPTION 'D2: contagem divergente passou';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF SQLERRM NOT LIKE 'esperados 2 lancamentos sem plano, achados 1' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM financeiro_plano_contas WHERE subcentro = c_sub)
     OR (SELECT plano_conta_id FROM financeiro_lancamentos_v2 WHERE id = v_a) IS NOT NULL THEN
    RAISE EXCEPTION 'D2: a recusa escreveu';
  END IF;

  -- ── D3: conta criada pelo molde; backfill so' no vazio ──────────────────────
  v_conta := pg_temp.backfill(c_cli, c_sub, 1);
  IF NOT EXISTS (SELECT 1 FROM financeiro_plano_contas p WHERE p.id = v_conta AND p.cliente_id = c_cli AND p.subcentro = c_sub AND p.ativo
                    AND p.tipo_operacao = '2-Saídas' AND p.macro_custo = 'Dividendos' AND p.grupo_custo = 'Dividendos'
                    AND p.centro_custo = 'Dividendos' AND p.escopo_negocio = 'administrativo' AND p.compoe_dre IS FALSE) THEN
    RAISE EXCEPTION 'D3: a conta nao nasceu como o molde';
  END IF;
  IF (SELECT plano_conta_id FROM financeiro_lancamentos_v2 WHERE id = v_a) IS DISTINCT FROM v_conta THEN RAISE EXCEPTION 'D3: o vazio nao recebeu a conta'; END IF;
  IF (SELECT count(*) FROM financeiro_lancamentos_v2 WHERE id IN (v_canc, v_outro_sub, v_de_outro) AND plano_conta_id IS NULL) <> 3 THEN
    RAISE EXCEPTION 'D3: o backfill alcancou cancelado, outro subcentro ou outro cliente';
  END IF;
  IF (SELECT md5(row(valor, sinal, data_competencia, data_pagamento, data_vencimento, status_transacao, conta_bancaria_id, conta_destino_id,
                     fazenda_id, safra_id, subcentro, macro_custo, centro_custo, escopo_negocio, descricao)::text)
        FROM financeiro_lancamentos_v2 WHERE id = v_a) <> v_foto THEN
    RAISE EXCEPTION 'D3: o backfill mudou valor, data, status, conta ou copia de texto';
  END IF;
  IF (SELECT editado_manual FROM financeiro_lancamentos_v2 WHERE id = v_a) IS DISTINCT FROM v_edit THEN RAISE EXCEPTION 'D3: o backfill marcou editado manual'; END IF;
  IF (SELECT grupo_custo FROM financeiro_lancamentos_v2 WHERE id = v_a) IS DISTINCT FROM 'Dividendos' THEN RAISE EXCEPTION 'D3: o grupo nao acompanhou o plano'; END IF;

  -- ── D4: depois da conta, o texto resolve a chave (so' no cliente dono) ──────
  v_novo := pg_temp.lan(c_cli, c_sub);
  IF (SELECT plano_conta_id FROM financeiro_lancamentos_v2 WHERE id = v_novo) IS DISTINCT FROM v_conta THEN RAISE EXCEPTION 'D4: lancamento novo nao resolveu o texto para a conta'; END IF;
  IF (SELECT plano_conta_id FROM financeiro_lancamentos_v2 WHERE id = pg_temp.lan(v_outro, c_sub)) IS NOT NULL THEN
    RAISE EXCEPTION 'D4: a conta de um cliente resolveu o texto de outro';
  END IF;

  -- ── D5: gesto contrario (a ordem da migration: inativa -> nulo -> apaga) ────
  PERFORM set_config('app.propagando_plano', 'on', true);
  UPDATE financeiro_plano_contas SET ativo = false WHERE id = v_conta;
  UPDATE financeiro_lancamentos_v2 SET plano_conta_id = NULL, grupo_custo = NULL WHERE plano_conta_id = v_conta;
  PERFORM set_config('app.propagando_plano', 'off', true);
  DELETE FROM financeiro_plano_contas p WHERE p.id = v_conta AND NOT EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 l WHERE l.plano_conta_id = p.id);
  IF EXISTS (SELECT 1 FROM financeiro_plano_contas WHERE id = v_conta) THEN RAISE EXCEPTION 'D5: a conta ficou'; END IF;
  IF (SELECT md5(row(valor, sinal, data_competencia, data_pagamento, data_vencimento, status_transacao, conta_bancaria_id, conta_destino_id,
                     fazenda_id, safra_id, subcentro, macro_custo, centro_custo, escopo_negocio, descricao)::text)
        FROM financeiro_lancamentos_v2 WHERE id = v_a AND plano_conta_id IS NULL AND grupo_custo IS NULL AND editado_manual IS NOT DISTINCT FROM v_edit) IS DISTINCT FROM v_foto THEN
    RAISE EXCEPTION 'D5: o gesto contrario nao devolveu o lancamento ao estado de antes';
  END IF;

  RAISE EXCEPTION 'OK CONC-DIVIDENDOS-PLANO-01: D0 a D5';
END
$t$;
