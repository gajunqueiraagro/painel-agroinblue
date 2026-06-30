-- 20260630_p0h_sanear_bb_abr2026_espurios.sql
-- P0-H Via A — SANEAMENTO DE DADOS (one-shot, forward-only, idempotente, em transação).
--
-- Conta Banco do Brasil c/c 54399-3 (a5ed9922-e476-4ec0-a19c-6481140e52eb), cliente Santa
-- Rita (77d37bbf-a440-4fca-bf1a-eac60cf91bc4), competência 2026-04: extrato tem 155
-- movimentos mas o OFX correto tem 134 e fecha em 0,00. Os 21 EXCEDENTES (soma -20.791,88)
-- são de outros produtos/contas BB despejados na c/c; cada um gerou 1 lançamento-espelho.
--
-- AÇÃO: soft-delete dos 21 extratos (cancelado_em) + cancelar os 21 lançamentos-espelho,
-- REUSANDO fn_desfazer_vinculo_extrato (PR G) para desfazer os 10 CBI ativos do grupo 1.
-- NÃO cria RPC genérica, NÃO altera read-model, NÃO faz DELETE físico (trigger bloqueia).
-- Snapshots físicos datados são a rede de segurança (não dropados). Idempotente: as guardas
-- 0.x abortam se o mundo já mudou (155->134); snapshots via CREATE TABLE IF NOT EXISTS.
--
-- Derivação dos 21 lançamentos-espelho: 100% por CBI (g1 via CBI ativo; g2 via CBI desfeito),
-- conjunto = exatamente 21 distintos ou RAISE. Prefixos derivados conferidos contra a lista
-- fechada do briefing (batem 1:1). Validado em BEGIN/ROLLBACK antes da aplicação real.

BEGIN;

-- ============================================================================
-- PASSO 0 — GUARDAS (abortam se o mundo mudou)
-- ============================================================================
DO $g$
DECLARE
  v_cliente uuid := '77d37bbf-a440-4fca-bf1a-eac60cf91bc4';
  v_conta   uuid := 'a5ed9922-e476-4ec0-a19c-6481140e52eb';
  ids21 uuid[] := ARRAY[
    '574f9aed-c6be-4531-a618-c5807840789e','47801d0b-228e-4806-85fa-b7f14e6649e4','8ad080b4-66a2-4318-aa11-03b8c85ffe19',
    '478bbbd6-5e67-4cef-9376-726faeb00a8a','fdb0eeaf-556f-4720-be3b-1b9eb9de078e','d65ed6cc-3efe-4afb-aa1d-9fedd923b65b',
    '65887a26-63c1-48d0-a162-5024ca104381','4c2e20df-23e3-43be-ac4b-9c45196be886','e756f044-db99-4f2f-9e33-aa13a6ad955d',
    '5dc421c5-a984-4c00-b673-4b0da34dced3',
    'dd3b9db1-7516-40ae-86f2-ac7db157e43a','bb92a50b-b438-4930-a696-4beefcce77cd','f806a7af-92f0-4a25-8099-06bbe69beb26',
    'b5e466c3-2d96-410d-811d-23f13fb66813','1d3e09a7-eb71-4811-b82c-5a9a335d93c2','7962a9c6-d5e6-4be0-a278-41f6102a741c',
    '12bee153-6561-4c90-9e41-f6b053a8e7c3','9c694a0f-fee0-4b27-9ad5-fb6f1f05b0af','7ac0685f-729e-44e0-bb3a-f920ca9942e4',
    'ed54c974-e6f8-4837-88cc-b633b47c7036','cce5595d-a3a4-4881-bed2-a081b60576ba'
  ]::uuid[];
  v_si numeric; v_sf numeric; v_cnt int; v_n21 int; v_soma numeric; v_hashdup int;
BEGIN
  -- 0.a saldo 2026-04 = 0/0 (já corrigido)
  SELECT saldo_inicial, saldo_final INTO v_si, v_sf FROM financeiro_saldos_bancarios_v2
   WHERE cliente_id=v_cliente AND conta_bancaria_id=v_conta AND ano_mes='2026-04';
  IF COALESCE(v_si,-1)<>0 OR COALESCE(v_sf,-1)<>0 THEN
    RAISE EXCEPTION 'GUARDA 0.a: saldo 2026-04 != 0/0 (ini=%, fim=%)', v_si, v_sf; END IF;

  -- 0.b vivos conta/mes = 155
  SELECT count(*) INTO v_cnt FROM extrato_bancario_v2
   WHERE conta_bancaria_id=v_conta AND data_movimento BETWEEN '2026-04-01' AND '2026-04-30' AND cancelado_em IS NULL;
  IF v_cnt<>155 THEN RAISE EXCEPTION 'GUARDA 0.b: vivos conta/mes = % (esperado 155; ja saneado?)', v_cnt; END IF;

  -- 0.c os 21 existem, conta/mes, vivos, somam -20791.88
  SELECT count(*), round(sum(valor),2) INTO v_n21, v_soma FROM extrato_bancario_v2
   WHERE id = ANY(ids21) AND conta_bancaria_id=v_conta AND cancelado_em IS NULL
     AND data_movimento BETWEEN '2026-04-01' AND '2026-04-30';
  IF v_n21<>21 THEN RAISE EXCEPTION 'GUARDA 0.c: ids21 validos vivos = % (esperado 21)', v_n21; END IF;
  IF v_soma<>-20791.88 THEN RAISE EXCEPTION 'GUARDA 0.c: soma dos 21 = % (esperado -20791.88)', v_soma; END IF;

  -- 0.d nenhum dos 21 compartilha hash_movimento com um sobrevivente
  SELECT count(*) INTO v_hashdup FROM extrato_bancario_v2 s
   WHERE s.conta_bancaria_id=v_conta AND s.data_movimento BETWEEN '2026-04-01' AND '2026-04-30'
     AND s.cancelado_em IS NULL AND NOT (s.id = ANY(ids21))
     AND s.hash_movimento IN (SELECT hash_movimento FROM extrato_bancario_v2 WHERE id=ANY(ids21));
  IF v_hashdup<>0 THEN RAISE EXCEPTION 'GUARDA 0.d: % sobreviventes compartilham hash com os 21', v_hashdup; END IF;
END $g$;

-- ============================================================================
-- PASSO 1 — SNAPSHOTS (tabelas físicas datadas; rede de segurança; idempotentes)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public._bkp_p0h_extrato_20260630 AS
  SELECT * FROM extrato_bancario_v2 WHERE id = ANY(ARRAY[
    '574f9aed-c6be-4531-a618-c5807840789e','47801d0b-228e-4806-85fa-b7f14e6649e4','8ad080b4-66a2-4318-aa11-03b8c85ffe19',
    '478bbbd6-5e67-4cef-9376-726faeb00a8a','fdb0eeaf-556f-4720-be3b-1b9eb9de078e','d65ed6cc-3efe-4afb-aa1d-9fedd923b65b',
    '65887a26-63c1-48d0-a162-5024ca104381','4c2e20df-23e3-43be-ac4b-9c45196be886','e756f044-db99-4f2f-9e33-aa13a6ad955d',
    '5dc421c5-a984-4c00-b673-4b0da34dced3',
    'dd3b9db1-7516-40ae-86f2-ac7db157e43a','bb92a50b-b438-4930-a696-4beefcce77cd','f806a7af-92f0-4a25-8099-06bbe69beb26',
    'b5e466c3-2d96-410d-811d-23f13fb66813','1d3e09a7-eb71-4811-b82c-5a9a335d93c2','7962a9c6-d5e6-4be0-a278-41f6102a741c',
    '12bee153-6561-4c90-9e41-f6b053a8e7c3','9c694a0f-fee0-4b27-9ad5-fb6f1f05b0af','7ac0685f-729e-44e0-bb3a-f920ca9942e4',
    'ed54c974-e6f8-4837-88cc-b633b47c7036','cce5595d-a3a4-4881-bed2-a081b60576ba']::uuid[]);

CREATE TABLE IF NOT EXISTS public._bkp_p0h_cbi_20260630 AS
  SELECT * FROM conciliacao_bancaria_itens WHERE extrato_id = ANY(ARRAY[
    '574f9aed-c6be-4531-a618-c5807840789e','47801d0b-228e-4806-85fa-b7f14e6649e4','8ad080b4-66a2-4318-aa11-03b8c85ffe19',
    '478bbbd6-5e67-4cef-9376-726faeb00a8a','fdb0eeaf-556f-4720-be3b-1b9eb9de078e','d65ed6cc-3efe-4afb-aa1d-9fedd923b65b',
    '65887a26-63c1-48d0-a162-5024ca104381','4c2e20df-23e3-43be-ac4b-9c45196be886','e756f044-db99-4f2f-9e33-aa13a6ad955d',
    '5dc421c5-a984-4c00-b673-4b0da34dced3',
    'dd3b9db1-7516-40ae-86f2-ac7db157e43a','bb92a50b-b438-4930-a696-4beefcce77cd','f806a7af-92f0-4a25-8099-06bbe69beb26',
    'b5e466c3-2d96-410d-811d-23f13fb66813','1d3e09a7-eb71-4811-b82c-5a9a335d93c2','7962a9c6-d5e6-4be0-a278-41f6102a741c',
    '12bee153-6561-4c90-9e41-f6b053a8e7c3','9c694a0f-fee0-4b27-9ad5-fb6f1f05b0af','7ac0685f-729e-44e0-bb3a-f920ca9942e4',
    'ed54c974-e6f8-4837-88cc-b633b47c7036','cce5595d-a3a4-4881-bed2-a081b60576ba']::uuid[]);

CREATE TABLE IF NOT EXISTS public._bkp_p0h_lancto_20260630 AS
  SELECT l.* FROM financeiro_lancamentos_v2 l
   WHERE l.id IN (
     SELECT c.lancamento_id FROM conciliacao_bancaria_itens c
      WHERE (c.extrato_id = ANY(ARRAY[
         '574f9aed-c6be-4531-a618-c5807840789e','47801d0b-228e-4806-85fa-b7f14e6649e4','8ad080b4-66a2-4318-aa11-03b8c85ffe19',
         '478bbbd6-5e67-4cef-9376-726faeb00a8a','fdb0eeaf-556f-4720-be3b-1b9eb9de078e','d65ed6cc-3efe-4afb-aa1d-9fedd923b65b',
         '65887a26-63c1-48d0-a162-5024ca104381','4c2e20df-23e3-43be-ac4b-9c45196be886','e756f044-db99-4f2f-9e33-aa13a6ad955d',
         '5dc421c5-a984-4c00-b673-4b0da34dced3']::uuid[]) AND c.desfeito_em IS NULL)
         OR (c.extrato_id = ANY(ARRAY[
         'dd3b9db1-7516-40ae-86f2-ac7db157e43a','bb92a50b-b438-4930-a696-4beefcce77cd','f806a7af-92f0-4a25-8099-06bbe69beb26',
         'b5e466c3-2d96-410d-811d-23f13fb66813','1d3e09a7-eb71-4811-b82c-5a9a335d93c2','7962a9c6-d5e6-4be0-a278-41f6102a741c',
         '12bee153-6561-4c90-9e41-f6b053a8e7c3','9c694a0f-fee0-4b27-9ad5-fb6f1f05b0af','7ac0685f-729e-44e0-bb3a-f920ca9942e4',
         'ed54c974-e6f8-4837-88cc-b633b47c7036','cce5595d-a3a4-4881-bed2-a081b60576ba']::uuid[]))
   );

-- backup tables: defesa em profundidade (sem grants a anon/authenticated + RLS ligada)
ALTER TABLE public._bkp_p0h_extrato_20260630 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._bkp_p0h_cbi_20260630     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._bkp_p0h_lancto_20260630  ENABLE ROW LEVEL SECURITY;

DO $s$
DECLARE ne int; nl int; nc int;
BEGIN
  SELECT count(*) INTO ne FROM public._bkp_p0h_extrato_20260630;
  SELECT count(*) INTO nl FROM public._bkp_p0h_lancto_20260630;
  SELECT count(*) INTO nc FROM public._bkp_p0h_cbi_20260630;
  IF ne<>21 THEN RAISE EXCEPTION 'SNAPSHOT extrato = % (esperado 21)', ne; END IF;
  IF nl<>21 THEN RAISE EXCEPTION 'SNAPSHOT lancto = % (esperado 21)', nl; END IF;
  IF nc<10  THEN RAISE EXCEPTION 'SNAPSHOT cbi = % (esperado >=10)', nc; END IF;
END $s$;

-- ============================================================================
-- PASSOS 2-6 — DERIVAR, MUTAR (reusa PR G) e VALIDAR (guardas que abortam)
-- ============================================================================
DO $m$
DECLARE
  v_cliente uuid := '77d37bbf-a440-4fca-bf1a-eac60cf91bc4';
  v_conta   uuid := 'a5ed9922-e476-4ec0-a19c-6481140e52eb';
  v_actor   uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  g1 uuid[] := ARRAY[
    '574f9aed-c6be-4531-a618-c5807840789e','47801d0b-228e-4806-85fa-b7f14e6649e4','8ad080b4-66a2-4318-aa11-03b8c85ffe19',
    '478bbbd6-5e67-4cef-9376-726faeb00a8a','fdb0eeaf-556f-4720-be3b-1b9eb9de078e','d65ed6cc-3efe-4afb-aa1d-9fedd923b65b',
    '65887a26-63c1-48d0-a162-5024ca104381','4c2e20df-23e3-43be-ac4b-9c45196be886','e756f044-db99-4f2f-9e33-aa13a6ad955d',
    '5dc421c5-a984-4c00-b673-4b0da34dced3']::uuid[];
  g2 uuid[] := ARRAY[
    'dd3b9db1-7516-40ae-86f2-ac7db157e43a','bb92a50b-b438-4930-a696-4beefcce77cd','f806a7af-92f0-4a25-8099-06bbe69beb26',
    'b5e466c3-2d96-410d-811d-23f13fb66813','1d3e09a7-eb71-4811-b82c-5a9a335d93c2','7962a9c6-d5e6-4be0-a278-41f6102a741c',
    '12bee153-6561-4c90-9e41-f6b053a8e7c3','9c694a0f-fee0-4b27-9ad5-fb6f1f05b0af','7ac0685f-729e-44e0-bb3a-f920ca9942e4',
    'ed54c974-e6f8-4837-88cc-b633b47c7036','cce5595d-a3a4-4881-bed2-a081b60576ba']::uuid[];
  ids21 uuid[];
  L21 uuid[];
  rec uuid;
  v_vivos int; v_soma numeric; v_esp jsonb;
  v_ofxlen int; v_ofxsoma numeric; v_ofx21 int; v_final text; v_sysnos int; v_cbiativo int; v_setdiff int;
BEGIN
  ids21 := g1 || g2;

  -- PASSO 2 — derivar os 21 lançamentos-espelho (g1 via CBI ativo; g2 via CBI desfeito)
  SELECT array_agg(DISTINCT lid) INTO L21 FROM (
    SELECT c.lancamento_id AS lid FROM conciliacao_bancaria_itens c WHERE c.extrato_id = ANY(g1) AND c.desfeito_em IS NULL
    UNION
    SELECT c.lancamento_id     FROM conciliacao_bancaria_itens c WHERE c.extrato_id = ANY(g2)
  ) z;
  IF array_length(L21,1) IS DISTINCT FROM 21 THEN
    RAISE EXCEPTION 'PASSO 2: L21 derivado = % (esperado 21)', array_length(L21,1); END IF;

  -- PASSO 3 — desfazer os 10 CBI ativos REUSANDO fn_desfazer_vinculo_extrato (PR G)
  FOREACH rec IN ARRAY g1 LOOP
    PERFORM fn_desfazer_vinculo_extrato(rec, 'p0h_bb_abr2026_espurio');
  END LOOP;

  -- PASSO 4 — cancelar (soft) os 21 lançamentos-espelho + tag (idempotente)
  UPDATE financeiro_lancamentos_v2
     SET cancelado = true,
         observacao = COALESCE(observacao,'') || ' [p0h_bb_abr2026_espurio]'
   WHERE id = ANY(L21) AND cancelado = false;
  UPDATE financeiro_lancamentos_v2
     SET observacao = COALESCE(observacao,'') || ' [p0h_bb_abr2026_espurio]'
   WHERE id = ANY(L21) AND cancelado = true
     AND COALESCE(observacao,'') NOT LIKE '%p0h_bb_abr2026_espurio%';

  -- PASSO 5 — soft-delete dos 21 extratos (NUNCA DELETE: trigger aborta)
  UPDATE extrato_bancario_v2
     SET cancelado_em = now(), cancelado_motivo = 'p0h_bb_abr2026_espurio', cancelado_por = v_actor
   WHERE id = ANY(ids21) AND cancelado_em IS NULL;

  -- PASSO 6 — VALIDAÇÃO DENTRO DA TRANSAÇÃO
  -- 6.a vivos = 134
  SELECT count(*), round(COALESCE(sum(valor),0),2) INTO v_vivos, v_soma FROM extrato_bancario_v2
   WHERE conta_bancaria_id=v_conta AND data_movimento BETWEEN '2026-04-01' AND '2026-04-30' AND cancelado_em IS NULL;
  IF v_vivos<>134 THEN RAISE EXCEPTION '6.a vivos = % (esperado 134)', v_vivos; END IF;
  -- 6.b soma dos 134 vivos = 0.00
  IF v_soma<>0.00 THEN RAISE EXCEPTION '6.b soma vivos = % (esperado 0.00)', v_soma; END IF;

  -- 6.c read-model
  v_esp := fn_extratos_espelhados(v_cliente, v_conta, '2026-04');
  v_ofxlen := jsonb_array_length(v_esp->'ofx_completo');
  IF v_ofxlen<>134 THEN RAISE EXCEPTION '6.c ofx_completo = % (esperado 134)', v_ofxlen; END IF;
  v_final := v_esp->'saldos'->>'final_oficial';
  IF COALESCE(v_final,'x')::numeric<>0 THEN RAISE EXCEPTION '6.c final_oficial = % (esperado 0)', v_final; END IF;
  SELECT round(COALESCE(sum((x->>'valor')::numeric),0),2) INTO v_ofxsoma FROM jsonb_array_elements(v_esp->'ofx_completo') x;
  IF v_ofxsoma<>0 THEN RAISE EXCEPTION '6.c soma ofx = % (esperado 0)', v_ofxsoma; END IF;
  SELECT count(*) INTO v_ofx21 FROM jsonb_array_elements(v_esp->'ofx_completo') x WHERE (x->>'extrato_id')::uuid = ANY(ids21);
  IF v_ofx21<>0 THEN RAISE EXCEPTION '6.c % dos 21 ainda em ofx_completo', v_ofx21; END IF;

  -- 6.d sistema_completo sem os 21 espelho
  SELECT count(*) INTO v_sysnos FROM jsonb_array_elements(v_esp->'sistema_completo') x WHERE (x->>'lancamento_id')::uuid = ANY(L21);
  IF v_sysnos<>0 THEN RAISE EXCEPTION '6.d % espelho ainda em sistema_completo', v_sysnos; END IF;

  -- 6.e nenhum CBI ativo aponta para os 21
  SELECT count(*) INTO v_cbiativo FROM conciliacao_bancaria_itens WHERE extrato_id = ANY(ids21) AND desfeito_em IS NULL;
  IF v_cbiativo<>0 THEN RAISE EXCEPTION '6.e % CBI ativo ainda nos 21', v_cbiativo; END IF;

  -- 6.f os 134 sobreviventes == conjunto exato do ofx_completo do read-model
  SELECT count(*) INTO v_setdiff FROM (
    SELECT id FROM extrato_bancario_v2 WHERE conta_bancaria_id=v_conta AND data_movimento BETWEEN '2026-04-01' AND '2026-04-30' AND cancelado_em IS NULL
    EXCEPT
    SELECT (x->>'extrato_id')::uuid FROM jsonb_array_elements(v_esp->'ofx_completo') x
  ) d;
  IF v_setdiff<>0 THEN RAISE EXCEPTION '6.f % sobreviventes fora do ofx_completo', v_setdiff; END IF;

  RAISE NOTICE 'P0-H OK: vivos=134 soma=0.00 ofx=134 final=0 sys_espelho=0 cbi_ativo=0 setdiff=0';
END $m$;

COMMIT;
