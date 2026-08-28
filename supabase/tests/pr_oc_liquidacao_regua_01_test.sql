-- PR-OC-LIQUIDACAO-REGUA-01 — a base da liquidacao passa a incluir as obrigacoes.
--   Requer aplicada: 20260902120000.
--   Rodar SOMENTE no PROTO. BEGIN...ROLLBACK + residuo zero.
--
--   Fixture 100% SINTETICA. Sete cenarios, sete operacoes independentes — nenhuma
--   reaproveitada, para que a falha de um caso nao contamine o seguinte.
SELECT set_config('app.ocregua_tag', replace(gen_random_uuid()::text,'-',''), false) AS run_tag;

BEGIN;

DO $t$
DECLARE
  v_admin uuid; v_cli uuid; v_tag text; v_faz uuid; v_forn uuid;
  v_op uuid; v_estado text; v_base numeric; v_i int;

  -- helper inline: monta operacao + obrigacao + liquidacao e devolve o estado lido
  v_principal numeric; v_obrig numeric; v_liq numeric; v_cancelar_obrig boolean;
BEGIN
  v_tag := current_setting('app.ocregua_tag');

  /* ⚠ JOIN COM auth.users OBRIGATORIO — `cliente_membros` nao tem FK para `auth.users`
     e ha admin ativo apontando para usuario inexistente (medido no proto). */
  SELECT cm.user_id, cm.cliente_id INTO v_admin, v_cli
    FROM public.cliente_membros cm
    JOIN auth.users u ON u.id = cm.user_id
   WHERE cm.perfil='admin_agroinblue' AND cm.ativo=true
   ORDER BY cm.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'fixture: sem admin com usuario valido em auth.users'; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);

  INSERT INTO public.fazendas (cliente_id, nome, codigo, owner_id)
    VALUES (v_cli, 'ZZ TESTE REGUA '||v_tag, 'ZR'||left(v_tag,6), v_admin) RETURNING id INTO v_faz;
  INSERT INTO public.financeiro_fornecedores (cliente_id, nome)
    VALUES (v_cli, 'ZZ FORN REGUA '||v_tag) RETURNING id INTO v_forn;

  FOR v_i IN 1..7 LOOP
    -- cenario por indice: principal, obrigacao, liquidado, obrigacao cancelada?
    SELECT c.p, c.o, c.l, c.x INTO v_principal, v_obrig, v_liq, v_cancelar_obrig
      FROM (VALUES
        (1, 100000::numeric,      0::numeric, 100000::numeric, false),  -- so principal, pago
        (2, 100000::numeric,   5000::numeric, 105000::numeric, false),  -- principal + obrig, tudo pago
        (3, 100000::numeric,   5000::numeric, 100000::numeric, false),  -- principal pago, obrig em aberto
        (4, 100000::numeric,   5000::numeric, 110000::numeric, false),  -- pagou acima da divida inteira
        (5, 100000::numeric,   5000::numeric, 100000::numeric, true),   -- obrig CANCELADA nao entra
        (6, NULL::numeric,     5000::numeric,      0::numeric, false),  -- sem base definida
        (7, 100000::numeric,   1500::numeric, 100000::numeric, false)   -- o caso e3825547
      ) AS c(i, p, o, l, x) WHERE c.i = v_i;

    INSERT INTO public.zoo_operacoes_comerciais
      (cliente_id, fazenda_id, tipo_operacao, data_operacao, cenario, contraparte_id,
       status_comercial, rascunho, versao, valor_acordado)
    VALUES (v_cli, v_faz, 'compra', DATE '2026-05-10', 'realizado', v_forn,
            'fechada', false, 1, v_principal)
    RETURNING id INTO v_op;

    IF v_obrig > 0 THEN
      INSERT INTO public.zoo_operacao_compromissos
        (cliente_id, operacao_id, natureza, componente, valor_total, status, favorecido_id)
      VALUES (v_cli, v_op, 'obrigacao', 'frete', v_obrig,
              CASE WHEN v_cancelar_obrig THEN 'cancelado' ELSE 'programado' END, v_forn);
    END IF;

    IF v_liq > 0 THEN
      /* ⚠ `natureza` e' NOT NULL SEM DEFAULT (conferido no schema) e o CHECK aceita
         'pagamento' ou 'recebimento'; compra e' pagamento. `forma` = 'pix' esta no
         CHECK e fica FORA do filtro de nao-monetario da view (permuta/compensacao). */
      INSERT INTO public.zoo_operacao_liquidacoes
        (cliente_id, operacao_id, valor, forma, natureza, data, estornado)
      VALUES (v_cli, v_op, v_liq, 'pix', 'pagamento', DATE '2026-06-01', false);
    END IF;

    SELECT estado_liquidacao, base INTO v_estado, v_base
      FROM public.vw_oc_operacao_liquidacao WHERE operacao_id = v_op;

    -- ===================== assercoes por cenario =====================
    IF v_i = 1 THEN   -- T1: so principal, liquidado. NAO REGRIDE.
      IF v_estado <> 'quitada' THEN RAISE EXCEPTION 'T1 FAIL: so principal pago deveria ser quitada, veio % (base %)', v_estado, v_base; END IF;
      IF v_base <> 100000 THEN RAISE EXCEPTION 'T1 FAIL: sem obrigacao a base nao pode mudar; veio %', v_base; END IF;

    ELSIF v_i = 2 THEN -- T2: principal + obrigacao, tudo pago. ERA excedente.
      IF v_estado <> 'quitada' THEN RAISE EXCEPTION 'T2 FAIL: divida inteira paga deveria ser quitada, veio % (base %)', v_estado, v_base; END IF;
      IF v_base <> 105000 THEN RAISE EXCEPTION 'T2 FAIL: base deveria somar a obrigacao (105000), veio %', v_base; END IF;

    ELSIF v_i = 3 THEN -- T3: obrigacao em aberto -> PARCIAL
      IF v_estado <> 'parcial' THEN RAISE EXCEPTION 'T3 FAIL: obrigacao em aberto deveria ser parcial, veio %', v_estado; END IF;

    ELSIF v_i = 4 THEN -- T4: EXCEDENTE de verdade
      IF v_estado <> 'excedente' THEN RAISE EXCEPTION 'T4 FAIL: pagamento acima da divida deveria ser excedente, veio %', v_estado; END IF;

    ELSIF v_i = 5 THEN -- T5: obrigacao CANCELADA fora da base
      IF v_base <> 100000 THEN RAISE EXCEPTION 'T5 FAIL: obrigacao cancelada NAO pode entrar na base; veio %', v_base; END IF;
      IF v_estado <> 'quitada' THEN RAISE EXCEPTION 'T5 FAIL: com a obrigacao cancelada fora, deveria ser quitada, veio %', v_estado; END IF;

    ELSIF v_i = 6 THEN -- T6: sem base -> base_indefinida, mesmo COM obrigacao
      IF v_estado <> 'base_indefinida' THEN RAISE EXCEPTION 'T6 FAIL: sem valor dos animais deveria ser base_indefinida, veio %', v_estado; END IF;
      IF v_base IS NOT NULL THEN RAISE EXCEPTION 'T6 FAIL: obrigacao sozinha NAO pode definir a base; veio %', v_base; END IF;

    ELSIF v_i = 7 THEN -- T7: o caso e3825547 — o que prova que a regua ve divida
      IF v_estado <> 'parcial' THEN
        RAISE EXCEPTION 'T7 FAIL: principal pago com obrigacao de 1500 em aberto deveria ser PARCIAL, veio % (base %)', v_estado, v_base; END IF;
      IF v_base <> 101500 THEN RAISE EXCEPTION 'T7 FAIL: base deveria ser 101500, veio %', v_base; END IF;
    END IF;
  END LOOP;

  /* T8 — O TETO DO PRINCIPAL NAO AFROUXOU. E' a razao de a funcao ser nova em vez de
     a antiga ter sido alterada: `oc_criar_compromisso` continua medindo o principal
     contra a base SEM obrigacoes. Com base 100.000 e obrigacao de 5.000, um principal
     de 103.000 tem de ser RECUSADO — se passasse, a folga indevida existiria. */
  INSERT INTO public.zoo_operacoes_comerciais
    (cliente_id, fazenda_id, tipo_operacao, data_operacao, cenario, contraparte_id,
     status_comercial, rascunho, versao, valor_acordado)
  VALUES (v_cli, v_faz, 'compra', DATE '2026-05-10', 'realizado', v_forn, 'fechada', false, 1, 100000)
  RETURNING id INTO v_op;
  INSERT INTO public.zoo_operacao_compromissos
    (cliente_id, operacao_id, natureza, componente, valor_total, status, favorecido_id)
  VALUES (v_cli, v_op, 'obrigacao', 'frete', 5000, 'programado', v_forn);

  SELECT base INTO v_base FROM public._oc_base_saldo_operacao(v_op);
  IF v_base <> 100000 THEN
    RAISE EXCEPTION 'T8 FAIL: a base do PRINCIPAL nao pode ter mudado; veio %', v_base; END IF;
  SELECT base INTO v_base FROM public._oc_base_divida_operacao(v_op);
  IF v_base <> 105000 THEN
    RAISE EXCEPTION 'T8 FAIL: a base da DIVIDA deveria ser 105000; veio %', v_base; END IF;

  RAISE NOTICE 'PR-OC-LIQUIDACAO-REGUA-01: T1..T8 PASS';
END $t$;

ROLLBACK;
