-- OC-VINCULAR-RECEBIMENTO-PARCIAL-01 — CONSERTO DE DADO das 3 OCs do Agnaldo que o vinculo encolheu em 05/10/2026.
--
-- ⚠ SO' ENSAIO. Este arquivo TERMINA EM RAISE (a transacao e' desfeita): NADA fica gravado. Executar de verdade exige o OK do
--   Gabriel e a troca do bloco final (marcado "FIM DO ENSAIO") por COMMIT.
--
-- O QUE ACONTECEU (medido): `oc_vincular_lancamento`, ao receber um lancamento de valor diferente do titulo programado da
-- parcela, cancelava o titulo e levava o compromisso para a soma das parcelas. Tres OCs ficaram com o compromisso menor que o
-- combinado, e a `vw_oc_operacao_liquidacao` passou a dizer "quitada":
--   f74f95e5  venda 25/08  combinado 294.595,00  compromisso 200.000,00  (recebido 200.000,00; faltam 94.595,00)
--   da9c27ee  compra 09/09 combinado  17.435,00  compromisso  17.400,00  (pago 17.400,00; faltam 35,00)
--   a2df4ec1  compra 09/09 combinado 315.000,00  compromisso  50.000,00  (pago 50.000,00; a 2a parcela, 265.000,00, foi
--             cancelada no vinculo do pagamento de 248.000,00 — que encolheu o compromisso a 298.000,00 — e o desvincular
--             seguinte, "refazer", o levou a 50.000,00; o pagamento 65723b49 de 248.000,00 esta' AVULSO hoje)
--
-- O QUE O CONSERTO FAZ — o estado que a regra nova teria deixado, SEM TOCAR EM LANCAMENTO REALIZADO:
--   · o compromisso volta ao valor combinado;
--   · o saldo fica A' VISTA numa parcela propria, com o TITULO PROGRAMADO ORIGINAL da OC de volta (descancelado, no valor do
--     saldo, mesmo vencimento e classificacao) e a parte dele reativada;
--   · as partes ativas passam a dizer "1 de 2" / "2 de 2";
--   · um evento `conserto_de_dado` por OC guarda o estado anterior (gesto contrario: os valores de `dados_anteriores`).
--   NAO muda: valor, pagamento, status, conciliacao nem competencia de nenhum lancamento realizado; a OC 7016f2b5 (recebido
--   368.210,00 num combinado de 361.130,00 — recebido A MAIS) fica para o PR dos gestos de ajuste.
--
-- DEPOIS DO CONSERTO, PELA TELA (Gabriel): f74f95e5 — vincular o 84b11037 (94.595,00): cai no saldo e quita. a2df4ec1 — vincular
--   o 65723b49 (248.000,00): fica saldo a pagar de 17.000,00. da9c27ee — fica saldo a pagar de 35,00 a' vista.
--
-- GUARDAS: cada bloco confere o estado medido em 05/10 e ABORTA se algo mudou. A f74f95e5 e' PULADA (sem erro) se o principal
--   ligado a ela ja' somar o combinado — o Gabriel pode ter vinculado o 84b11037 pelo "criar item" antes.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION pg_temp.consertar(
  p_op uuid, p_comp uuid, p_prog uuid, p_parcela_paga uuid, p_parte_paga uuid,
  p_titulo uuid, p_parte_titulo uuid, p_parcela_saldo uuid,          -- p_parcela_saldo NULO = criar a parcela do saldo
  p_combinado numeric, p_comp_hoje numeric, p_saldo numeric, p_vencimento date, p_versao int)
RETURNS text LANGUAGE plpgsql AS $f$
DECLARE
  o public.zoo_operacoes_comerciais; c public.zoo_operacao_compromissos; t public.financeiro_lancamentos_v2;
  pt public.zoo_operacao_partes; pg public.zoo_operacao_partes; v_parc uuid; v_antes jsonb; v_ligado numeric;
BEGIN
  SELECT * INTO o FROM public.zoo_operacoes_comerciais WHERE id = p_op FOR UPDATE;
  SELECT * INTO c FROM public.zoo_operacao_compromissos WHERE id = p_comp FOR UPDATE;
  SELECT * INTO t FROM public.financeiro_lancamentos_v2 WHERE id = p_titulo FOR UPDATE;
  SELECT * INTO pt FROM public.zoo_operacao_partes WHERE id = p_parte_titulo FOR UPDATE;
  SELECT * INTO pg FROM public.zoo_operacao_partes WHERE id = p_parte_paga FOR UPDATE;
  -- ja' completa? (o principal vivo ligado a' OC soma o combinado)
  SELECT coalesce(sum(x.valor), 0) INTO v_ligado FROM public.zoo_operacao_partes x
    JOIN public.financeiro_lancamentos_v2 f ON f.id = x.financeiro_lancamento_id AND f.cancelado IS NOT TRUE
   WHERE x.operacao_id = p_op AND x.natureza = 'principal' AND x.origem = 'programacao' AND x.cancelada = false;
  IF v_ligado = p_combinado THEN
    RETURN left(p_op::text, 8) || ': PULADA — o principal ligado ja'' soma o combinado (' || v_ligado || ')';
  END IF;
  -- guardas do estado medido
  IF o.versao IS DISTINCT FROM p_versao OR o.valor_acordado IS DISTINCT FROM p_combinado OR c.valor_total IS DISTINCT FROM p_comp_hoje
     OR c.status IS DISTINCT FROM 'programado' OR t.cancelado IS NOT TRUE OR t.status_transacao IS DISTINCT FROM 'programado'
     OR t.data_pagamento IS NOT NULL OR pt.cancelada IS NOT TRUE OR pt.financeiro_lancamento_id IS DISTINCT FROM p_titulo
     OR pg.cancelada IS NOT FALSE OR pg.programacao_parcela_id IS DISTINCT FROM p_parcela_paga
     OR p_comp_hoje + p_saldo IS DISTINCT FROM p_combinado THEN
    RAISE EXCEPTION 'OC %: o estado mudou desde a medicao (versao %, compromisso %, titulo cancelado %, parte do titulo cancelada %) — NAO consertar sem medir de novo',
      left(p_op::text, 8), o.versao, c.valor_total, t.cancelado, pt.cancelada;
  END IF;
  v_antes := jsonb_build_object('compromisso', to_jsonb(c), 'titulo', to_jsonb(t), 'parte_do_titulo', to_jsonb(pt), 'parte_paga', to_jsonb(pg),
    'parcela_saldo', (SELECT to_jsonb(x) FROM public.zoo_operacao_parcelas_programacao x WHERE x.id = p_parcela_saldo));

  UPDATE public.zoo_operacao_compromissos SET valor_total = p_combinado, updated_at = now() WHERE id = p_comp;
  IF p_parcela_saldo IS NULL THEN
    INSERT INTO public.zoo_operacao_parcelas_programacao (cliente_id, programacao_id, sequencia, valor, vencimento, conta_bancaria_id, forma, status)
    SELECT x.cliente_id, x.programacao_id, (SELECT max(y.sequencia) + 1 FROM public.zoo_operacao_parcelas_programacao y WHERE y.programacao_id = p_prog),
           p_saldo, p_vencimento, x.conta_bancaria_id, x.forma, 'materializada'
      FROM public.zoo_operacao_parcelas_programacao x WHERE x.id = p_parcela_paga
    RETURNING id INTO v_parc;
  ELSE
    UPDATE public.zoo_operacao_parcelas_programacao SET valor = p_saldo, status = 'materializada', updated_at = now()
     WHERE id = p_parcela_saldo AND programacao_id = p_prog AND status = 'cancelada'
    RETURNING id INTO v_parc;
    IF v_parc IS NULL THEN RAISE EXCEPTION 'OC %: a parcela do saldo nao esta'' como medida', left(p_op::text, 8); END IF;
  END IF;
  -- o titulo programado ORIGINAL volta, no valor do saldo (nao e' lancamento realizado: e' a promessa da propria OC)
  UPDATE public.financeiro_lancamentos_v2
     SET cancelado = false, cancelado_em = NULL, cancelado_por = NULL, cancelado_motivo = NULL, valor = p_saldo, updated_at = now()
   WHERE id = p_titulo;
  UPDATE public.zoo_operacao_partes
     SET cancelada = false, cancelada_em = NULL, cancelada_por = NULL, cancelada_motivo = NULL,
         programacao_parcela_id = v_parc, sequencia_parcela = 2, quantidade_parcelas = 2, valor = p_saldo, updated_at = now()
   WHERE id = p_parte_titulo;
  UPDATE public.zoo_operacao_partes SET quantidade_parcelas = 2, updated_at = now() WHERE id = p_parte_paga;
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, origem)
  VALUES (o.cliente_id, p_op, 'conserto_de_dado', v_antes,
    jsonb_build_object('motivo', 'OC-VINCULAR-RECEBIMENTO-PARCIAL-01: o vinculo de 05/10/2026 encolheu o compromisso; volta ao combinado com o saldo a'' vista',
      'compromisso_id', p_comp, 'valor_anterior', p_comp_hoje, 'valor_novo', p_combinado, 'saldo', p_saldo, 'titulo_id', p_titulo,
      'parcela_saldo_id', v_parc, 'versao_anterior', o.versao, 'versao_nova', o.versao + 1), 'conserto');
  UPDATE public.zoo_operacoes_comerciais SET versao = versao + 1, updated_at = now() WHERE id = p_op;
  RETURN left(p_op::text, 8) || ': compromisso ' || p_comp_hoje || ' -> ' || p_combinado || '; saldo ' || p_saldo || ' no titulo ' || left(p_titulo::text, 8)
    || ' (venc. ' || p_vencimento || '); view: ' || (SELECT v.estado_liquidacao || ' base=' || v.base || ' liq=' || v.total_liquidado_valido || ' saldo=' || v.saldo_operacao
                                                      FROM public.vw_oc_operacao_liquidacao v WHERE v.operacao_id = p_op)
    || E'\n          principal: compromisso ' || (SELECT k.valor_total FROM public.zoo_operacao_compromissos k WHERE k.id = p_comp)
    || ' · parcelas ' || (SELECT string_agg(x.sequencia_parcela || '/' || x.quantidade_parcelas || ' ' || x.valor || ' '
                                 || f.status_transacao || ' (' || left(f.id::text, 8) || ')', ' + ' ORDER BY x.sequencia_parcela)
                            FROM public.zoo_operacao_partes x JOIN public.financeiro_lancamentos_v2 f ON f.id = x.financeiro_lancamento_id
                           WHERE x.operacao_id = p_op AND x.natureza = 'principal' AND x.cancelada = false);
END $f$;

DO $conserto$
DECLARE
  c_cli constant uuid := 'a2d41cda-eb1e-4527-a6cf-a1b9663339e2';
  v_real_a text; v_real_d text; v_n_a int; v_n_d int; v_out text := '';
BEGIN
  -- assinatura de TODO lancamento realizado/conciliado do Agnaldo, antes
  SELECT md5(coalesce(string_agg(md5(l::text), '' ORDER BY l.id), '')), count(*) INTO v_real_a, v_n_a
    FROM public.financeiro_lancamentos_v2 l WHERE l.cliente_id = c_cli AND (l.status_transacao IN ('realizado', 'conciliado') OR l.data_pagamento IS NOT NULL);

  -- f74f95e5 — venda 25/08: 294.595 = 200.000 recebidos (d715fef2) + 94.595 a receber (titulo e2c286f9, venc. 01/09)
  v_out := v_out || E'\n' || pg_temp.consertar(
    'f74f95e5-ecaa-4785-932a-abd37328a1f8', 'f7a17148-5a70-49d1-a359-2098de4e303b', '9bc7f60d-19d4-4b1e-98ba-1a3cf21e57fb',
    '280d1d21-b44e-4057-83d1-d4abdb572e74', '609525d7-1e9d-4d60-af8d-a2a1e2bb355f',
    'e2c286f9-9934-4b9d-906a-553427fb140a', 'ea7833c3-bbdc-4c8d-9174-1343aa933a60', NULL,
    294595, 200000, 94595, '2026-09-01', 14);
  -- da9c27ee — compra 09/09: 17.435 = 17.400 pagos (71b781a2) + 35,00 a pagar (titulo 62124ee1, venc. 09/10)
  v_out := v_out || E'\n' || pg_temp.consertar(
    'da9c27ee-2372-44aa-aa1d-5f0e9c991dd3', '9ff263fd-33b7-4cb0-94b2-70e63a7592d2', '24d06e91-ad68-4623-9c86-971740bf6bec',
    '6477917f-4d36-44de-a02b-b2a9d505c595', '98d94bb4-578c-482a-b7d7-5424435d0032',
    '62124ee1-07c6-4807-9a0a-342b78add3b0', '38568e67-50a8-44dd-95de-cc94ab1e4bad', NULL,
    17435, 17400, 35, '2026-10-09', 10);
  -- a2df4ec1 — compra 09/09: 315.000 = 50.000 pagos (2d3c942d) + 265.000 a pagar (titulo 683e6d0a, venc. 23/09, na parcela 2 de volta)
  v_out := v_out || E'\n' || pg_temp.consertar(
    'a2df4ec1-7814-4e91-b8d5-0a8239c7035a', '9cfd4441-8a7c-4386-a4d8-ce4fc712b380', 'e5637c37-ea29-479f-8ce2-7b6c51c748ea',
    'a41af0a1-e8d5-4593-bcab-a8e1f8011055', 'faba16da-c15b-4d1d-b58a-e1db0811c686',
    '683e6d0a-ee7b-4b49-8fe2-a4c0d2a71ca8', 'b58a2b6f-e701-4d10-a783-bd048e3b3836', '748a8f29-7e3f-4cfe-9ed1-00af429ee270',
    315000, 50000, 265000, '2026-09-23', 16);

  -- a2df4ec1: o pagamento de 248.000,00 (65723b49) continua AVULSO — o conserto nao vincula nada
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_partes x WHERE x.financeiro_lancamento_id = '65723b49-f503-433d-bff0-3aab50d698cb' AND x.cancelada = false) THEN
    RAISE EXCEPTION 'CONSERTO: o 65723b49 esta'' vinculado — medir de novo'; END IF;
  v_out := v_out || E'\n          a2df4ec1: o 65723b49 (248.000,00, pago em 23/09) segue avulso — vincula-lo pela tela deixa 17.000,00 a pagar';

  -- nenhum lancamento realizado mudou
  SELECT md5(coalesce(string_agg(md5(l::text), '' ORDER BY l.id), '')), count(*) INTO v_real_d, v_n_d
    FROM public.financeiro_lancamentos_v2 l WHERE l.cliente_id = c_cli AND (l.status_transacao IN ('realizado', 'conciliado') OR l.data_pagamento IS NOT NULL);
  IF v_real_a IS DISTINCT FROM v_real_d OR v_n_a IS DISTINCT FROM v_n_d OR v_n_a = 0 THEN
    RAISE EXCEPTION 'CONSERTO: lancamento realizado mudou (% x %)', v_n_a, v_n_d; END IF;

  -- ═══ FIM DO ENSAIO: este RAISE desfaz tudo. Para executar de verdade (so' com o OK do Gabriel), trocar por RAISE NOTICE e COMMIT. ═══
  RAISE EXCEPTION 'ENSAIO (nada gravado) — % lancamentos realizados do Agnaldo identicos antes e depois.%', v_n_a, v_out;
END $conserto$;
ROLLBACK;
