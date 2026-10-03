-- PR-CONC-INTERNA-SEPARADA-01a — o dono devolve o saldo PROPRIO de cada conta e o status do PAR (conta-mae + interna)
--
-- POR QUE (decisoes do Gabriel, 03/10): a conta interna (`consolida_em_conta_id`; hoje so' Agnaldo: Bradesco + Bradesco-Invest.
-- Facil) nao some da lista nem tem o saldo somado na linha da mae. Cada conta mostra o saldo PROPRIO (a mae em Conta corrente,
-- a interna em Investimentos); o que fica junto e' so' o VEREDITO do par, CONSOLIDADO, porque o arquivo do banco da mae fecha
-- contra o consolidado (ele traz so' os rendimentos; aplicacoes e resgates existem so' como transferencias do sistema).
--
-- O QUE MUDA (aditivo nas colunas; os campos de antes ficam iguais em toda conta sem interna)
-- D1. Toda linha 'conta' ganha `proprio` jsonb {saldo_inicial, entradas, saidas, saldo_sistema, saldo_extrato, diferenca,
--     entradas_terceiros, entradas_transferencias, saidas_terceiros, saidas_transferencias}: sem interna (e na interna) = os
--     campos de cima; na mae = o inicial e o extrato DELA, e o sistema = inicial proprio + movimento dela + as transferencias com a
--     interna.
-- D2. Interna: `par_conta_id` (a mae), `par_status` e status = o da mae, motivos [{motivo:'conferida_com', conta_id, conta_nome}].
--     Mae: `internas` [{conta_id, conta_nome}].
-- D3. Subtotais e total: os SALDOS (inicial, sistema, extrato, diferenca) somam o `proprio` de TODAS as contas, cada uma no seu
--     tipo; entradas/saidas seguem como antes. No veredito do TOTAL o par vale UMA vez (a interna nao conta como conta); no
--     SUBTOTAL do tipo a interna conta com o status do par (Investimentos reflete o veredito do par).
-- D4. `fn_conciliacao_status_ano` (corpo integral): a interna sai da contagem de contas e aparece com o status do par em todo
--     mes em que a mae aparece.
-- D5. `_fn_conciliacao_dias_conta` (patch guardado; MESMA assinatura): as transferencias mae<->interna viram linhas
--     'transferencia_interna' e entram so' no `saldo_apos_proprio` e em `interna_total`/`posicao_interna`; `dias`,
--     `sistema_total` e o `saldo_apos` de antes ficam identicos. Posicao ganha `saldo_sistema_proprio_na_data`.
-- CORRECAO DE DEFEITO (Opcao A do Gabriel): o CONSOLIDADO do par passa a ser Σ PROPRIOS — ele somava o inicial da interna mas
-- deixava de fora o movimento dela com TERCEIROS. Nos 7 meses do Agnaldo (2021-10, 2021-12, 2023-01, 2026-01..04) a diferenca do
-- par era exatamente esse movimento e passa a 0,00 (status igual).
-- ACL, SECURITY DEFINER, search_path, plan_cache_mode e tenant_ok mantidos e conferidos no fim. Nenhuma escrita em dado.

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliacao_resumo_mes(uuid, text, uuid[])'::regprocedure)
       IS DISTINCT FROM '25aa2ac47b2bec06c951377cb2cecc84'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliacao_status_ano(uuid, integer)'::regprocedure)
       IS DISTINCT FROM 'fd79e1bde1b45a80d364670fc1a2f7cf' THEN
    RAISE EXCEPTION 'resumo publico ou status do ano fora do corpo esperado. Migration abortada.';
  END IF;
END $guarda$;

-- ═══ D5 — _fn_conciliacao_dias_conta (mesma assinatura) ═══
DO $mig$
DECLARE
  v_src text; v_def text; v_novo text; v_depois text; a text; a0 text; b0 text; a1 text; b1 text; a2 text; b2 text; a3 text; b3 text; a4 text; b4 text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid) INTO v_src, v_def FROM pg_proc p WHERE p.oid = 'public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric)'::regprocedure;
  IF md5(v_src) <> 'b00a0840cf0361ddcd6a367bc2db3fb0' THEN
    RAISE EXCEPTION 'public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric): corpo de origem inesperado (md5 %). Migration abortada.', md5(v_src);
  END IF;
  a0 := $a0$DECLARE v jsonb;
BEGIN
$a0$;
  b0 := $b0$DECLARE v jsonb; v_si_prop numeric;
BEGIN
  -- PR-CONC-INTERNA-SEPARADA-01a (D5): o saldo inicial PROPRIO, para o `saldo_apos_proprio`. Conta sem interna: o passado
  -- (`p_saldo_inicial`, o de sempre). Conta-mae: o saldo final do mes anterior DELA SOZINHA (o passado e' o consolidado).
  v_si_prop := p_saldo_inicial;
  IF EXISTS (SELECT 1 FROM financeiro_contas_bancarias x WHERE x.consolida_em_conta_id = p_conta AND x.cliente_id = p_cliente) THEN
    v_si_prop := (SELECT a.saldo_final FROM financeiro_saldos_bancarios_v2 a
                   WHERE a.conta_bancaria_id = p_conta AND a.cliente_id = p_cliente
                     AND a.ano_mes = to_char(p_de - interval '1 month', 'YYYY-MM'));
  END IF;
$b0$;
  a1 := $a1$  semvinc AS (SELECT lan.* FROM lan WHERE NOT EXISTS (SELECT 1 FROM vin WHERE vin.lancamento_id = lan.lancamento_id) AND NOT lan.interna),
$a1$;
  b1 := $b1$  semvinc AS (SELECT lan.* FROM lan WHERE NOT EXISTS (SELECT 1 FROM vin WHERE vin.lancamento_id = lan.lancamento_id) AND NOT lan.interna),
  -- PR-CONC-INTERNA-SEPARADA-01a (D5): as transferencias com uma conta CONSOLIDADA nesta (a interna) — as pernas que o
  -- consolidado tira. Entram so' no saldo PROPRIO (`interna_total`, `saldo_apos_proprio`); nunca nos dias nem no `sistema_total`.
  transf_int AS (SELECT lan.* FROM lan WHERE lan.interna AND NOT EXISTS (SELECT 1 FROM vin WHERE vin.lancamento_id = lan.lancamento_id)),
$b1$;
  a2 := $a2$      FROM financeiro_lancamentos_v2 l WHERE l.id IN (SELECT pecas.lancamento_id FROM pecas)),
$a2$;
  b2 := $b2$      FROM financeiro_lancamentos_v2 l WHERE l.id IN (SELECT pecas.lancamento_id FROM pecas UNION ALL SELECT transf_int.lancamento_id FROM transf_int)),
$b2$;
  a3 := $a3$                   + coalesce((SELECT sum(restos.r) FROM restos), 0),
    'banco_entradas'$a3$;
  b3 := $b3$                   + coalesce((SELECT sum(restos.r) FROM restos), 0),
    -- PR-CONC-INTERNA-SEPARADA-01a (D5): as pernas das transferencias com a interna (zero em conta sem interna)
    'interna_total', coalesce((SELECT sum(transf_int.valor) FROM transf_int), 0),
    'interna_entradas', coalesce((SELECT sum(transf_int.valor) FROM transf_int WHERE transf_int.valor > 0), 0),
    'interna_saidas', coalesce((SELECT sum(transf_int.valor) FROM transf_int WHERE transf_int.valor < 0), 0),
    'posicao_interna', CASE WHEN p_posicao IS NOT NULL THEN coalesce((SELECT sum(transf_int.valor) FROM transf_int WHERE transf_int.data <= p_posicao), 0) END,
    'banco_entradas'$b3$;
  a4 := $a4$    'linhas_sistema', CASE WHEN p_detalhe THEN coalesce((
        -- PR-CONC-SALDO-UMA-REGUA-01c: + saldo_apos (saldo inicial + as linhas ate' esta, na ordem da lista — fecha em
        -- saldo_sistema), centro e o status de exibicao ('conciliado' o vinculo, 'parcial' o programado que nao quitou,
        -- 'realizado' o sem par e o resto). Nenhuma tela soma linha.
        SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                 'tipo', q.tipo, 'data', q.data, 'valor', q.valor, 'lancamento_id', q.lancamento_id,
                 'extrato_id', q.extrato_id, 'extrato_valor', q.extrato_valor,
                 'transferencia', CASE WHEN q.transf THEN true END,
                 'parcial', CASE WHEN q.car_lid IS NOT NULL THEN true END, 'falta', q.falta,
                 'sobre_aplicado', CASE WHEN EXISTS (SELECT 1 FROM sobre WHERE sobre.lancamento_id = q.lancamento_id) THEN true END,
                 'descricao', q.descricao, 'fornecedor', q.fornecedor, 'subcentro', q.subcentro, 'tipo_operacao', q.tipo_operacao,
                 'status_transacao', q.status_transacao, 'data_pagamento', q.data_pagamento, 'valor_lancamento', q.valor_lancamento,
                 'numero_documento', q.numero_documento,
                 'centro', q.centro,
                 'status_exibicao', CASE WHEN q.car_lid IS NOT NULL THEN 'parcial' WHEN q.tipo = 'vinculo' THEN 'conciliado' ELSE 'realizado' END,
                 'saldo_apos', round(p_saldo_inicial + q.acum, 2)))
                 ORDER BY q.rn)
          FROM (SELECT z.*, sum(z.valor) OVER (ORDER BY z.rn ROWS UNBOUNDED PRECEDING) AS acum
                  FROM (SELECT p.tipo, p.data, p.valor, p.lancamento_id, p.extrato_id, p.extrato_valor, p.transf,
                               car.lancamento_id AS car_lid, car.falta, t.descricao, f.nome AS fornecedor, t.subcentro, t.centro,
                               t.tipo_operacao, t.status_transacao, t.data_pagamento, t.valor AS valor_lancamento, t.numero_documento,
                               row_number() OVER (ORDER BY p.data, p.tipo DESC, p.extrato_id, p.lancamento_id) AS rn
                          FROM pecas2 p
                          LEFT JOIN tip t ON t.id = p.lancamento_id
                          LEFT JOIN financeiro_fornecedores f ON f.id = t.favorecido_id
                          LEFT JOIN (SELECT c.lancamento_id, max(c.falta) AS falta
                                       FROM public.fn_caixa_sistema_pontas(p_cliente, p_conta, p_de, p_ate) c
                                      WHERE c.parcial GROUP BY c.lancamento_id) car
                                 ON car.lancamento_id = p.lancamento_id AND p.tipo = 'vinculo') z) q), '[]'::jsonb) END
$a4$;
  b4 := $b4$    'linhas_sistema', CASE WHEN p_detalhe THEN coalesce((
        -- PR-CONC-SALDO-UMA-REGUA-01c: + saldo_apos (saldo inicial + as linhas ate' esta, na ordem da lista — fecha em
        -- saldo_sistema), centro e o status de exibicao ('conciliado' o vinculo, 'parcial' o programado que nao quitou,
        -- 'realizado' o sem par e o resto). Nenhuma tela soma linha.
        -- PR-CONC-INTERNA-SEPARADA-01a (D5): + as linhas 'transferencia_interna' (so' na conta-mae) e o `saldo_apos_proprio`
        -- (saldo inicial PROPRIO + TODAS as linhas ate' esta); o `saldo_apos` segue sem as internas, identico ao de antes.
        SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                 'tipo', q.tipo, 'data', q.data, 'valor', q.valor, 'lancamento_id', q.lancamento_id,
                 'extrato_id', q.extrato_id, 'extrato_valor', q.extrato_valor,
                 'transferencia', CASE WHEN q.transf THEN true END,
                 'parcial', CASE WHEN q.car_lid IS NOT NULL THEN true END, 'falta', q.falta,
                 'sobre_aplicado', CASE WHEN EXISTS (SELECT 1 FROM sobre WHERE sobre.lancamento_id = q.lancamento_id) THEN true END,
                 'descricao', q.descricao, 'fornecedor', q.fornecedor, 'subcentro', q.subcentro, 'tipo_operacao', q.tipo_operacao,
                 'status_transacao', q.status_transacao, 'data_pagamento', q.data_pagamento, 'valor_lancamento', q.valor_lancamento,
                 'numero_documento', q.numero_documento,
                 'centro', q.centro,
                 'status_exibicao', CASE WHEN q.car_lid IS NOT NULL THEN 'parcial' WHEN q.tipo = 'vinculo' THEN 'conciliado' ELSE 'realizado' END,
                 'saldo_apos', round(p_saldo_inicial + q.acum, 2),
                 'saldo_apos_proprio', round(v_si_prop + q.acum_proprio, 2)))
                 ORDER BY q.rn)
          FROM (SELECT z.*, sum(CASE WHEN z.tipo = 'transferencia_interna' THEN 0 ELSE z.valor END)
                              OVER (ORDER BY z.rn ROWS UNBOUNDED PRECEDING) AS acum,
                       sum(z.valor) OVER (ORDER BY z.rn ROWS UNBOUNDED PRECEDING) AS acum_proprio
                  FROM (SELECT p.tipo, p.data, p.valor, p.lancamento_id, p.extrato_id, p.extrato_valor, p.transf,
                               car.lancamento_id AS car_lid, car.falta, t.descricao, f.nome AS fornecedor, t.subcentro, t.centro,
                               t.tipo_operacao, t.status_transacao, t.data_pagamento, t.valor AS valor_lancamento, t.numero_documento,
                               row_number() OVER (ORDER BY p.data, p.tipo DESC, p.extrato_id, p.lancamento_id) AS rn
                          FROM (SELECT pecas2.tipo, pecas2.data, pecas2.valor, pecas2.lancamento_id, pecas2.extrato_id,
                                       pecas2.extrato_valor, pecas2.transf FROM pecas2
                                UNION ALL
                                SELECT 'transferencia_interna'::text, ti.data, ti.valor, ti.lancamento_id, NULL::uuid, NULL::numeric, true
                                  FROM transf_int ti) p
                          LEFT JOIN tip t ON t.id = p.lancamento_id
                          LEFT JOIN financeiro_fornecedores f ON f.id = t.favorecido_id
                          LEFT JOIN (SELECT c.lancamento_id, max(c.falta) AS falta
                                       FROM public.fn_caixa_sistema_pontas(p_cliente, p_conta, p_de, p_ate) c
                                      WHERE c.parcial GROUP BY c.lancamento_id) car
                                 ON car.lancamento_id = p.lancamento_id AND p.tipo = 'vinculo') z) q), '[]'::jsonb) END
$b4$;
  FOREACH a IN ARRAY ARRAY[a0, a1, a2, a3, a4] LOOP
    IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
      RAISE EXCEPTION 'public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric): ancora nao casa exatamente 1x: %', left(a, 80);
    END IF;
  END LOOP;
  v_novo := replace(replace(replace(replace(replace(v_def, a0, b0), a1, b1), a2, b2), a3, b3), a4, b4);
  EXECUTE v_novo;
  SELECT p.prosrc INTO v_depois FROM pg_proc p WHERE p.oid = 'public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric)'::regprocedure;
  IF md5(v_depois) <> 'bb71a135061912696d56e604b1b8596e' THEN
    RAISE EXCEPTION 'public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric): corpo resultante inesperado (md5 %)', md5(v_depois);
  END IF;
END $mig$;

-- ═══ D1–D3 — a interna do resumo (o retorno ganha colunas: a publica cai antes) ═══
DROP FUNCTION public.fn_conciliacao_resumo_mes(uuid, text, uuid[]);

DO $mig$
DECLARE
  v_src text; v_def text; v_novo text; v_depois text; a text; a0 text; b0 text; a1 text; b1 text; a2 text; b2 text; a3 text; b3 text; a4 text; b4 text; a5 text; b5 text; a6 text; b6 text; a7 text; b7 text; a8 text; b8 text; a9 text; b9 text; a10 text; b10 text; a11 text; b11 text; a12 text; b12 text; a13 text; b13 text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid) INTO v_src, v_def FROM pg_proc p WHERE p.oid = 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)'::regprocedure;
  IF md5(v_src) <> '3f91479aabbe56182c0e275f8ed9a57f' THEN
    RAISE EXCEPTION 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean): corpo de origem inesperado (md5 %). Migration abortada.', md5(v_src);
  END IF;
  a0 := $a0$diferenca_entradas numeric, diferenca_saidas numeric)
 LANGUAGE$a0$;
  b0 := $b0$diferenca_entradas numeric, diferenca_saidas numeric, proprio jsonb, par_conta_id uuid, par_status text, internas jsonb)
 LANGUAGE$b0$;
  a1 := $a1$  v_npend int; v_vazio jsonb; v_vazio_pos jsonb;
$a1$;
  b1 := $b1$  v_npend int; v_vazio jsonb; v_vazio_pos jsonb;
  -- PR-CONC-INTERNA-SEPARADA-01a
  v_internas jsonb; v_ini_prop numeric; v_mov_prop numeric; v_pos_prop numeric; v_pos_cons numeric; v_i record; v_iv jsonb;
  v_xs_tot numeric; v_xe numeric; v_xs numeric; v_xet numeric; v_xetr numeric; v_xst numeric; v_xstr numeric; v_xpos numeric;
  v_te numeric; v_ts numeric; v_par_status text; v_status_conta jsonb := '{}'::jsonb;
$b1$;
  a2 := $a2$    -- Ajuste do D3 (20261027191800), so' desempenho:$a2$;
  b2 := $b2$    -- PR-CONC-INTERNA-SEPARADA-01a: as internas consolidadas nesta conta (so' a mae tem) e o saldo inicial PROPRIO (o saldo
    -- final do mes anterior da conta sozinha). Sem interna, o proprio e' o de sempre (v_ini).
    SELECT jsonb_agg(jsonb_build_object('conta_id', x.id, 'conta_nome', coalesce(x.nome_exibicao, x.nome_conta))
                     ORDER BY x.ordem_exibicao NULLS LAST, x.id)
      INTO v_internas
      FROM financeiro_contas_bancarias x WHERE x.consolida_em_conta_id = c.id AND x.cliente_id = p_cliente_id;
    IF v_internas IS NULL THEN
      v_ini_prop := v_ini;
    ELSE
      v_ini_prop := (SELECT a.saldo_final FROM financeiro_saldos_bancarios_v2 a
                      WHERE a.conta_bancaria_id = c.id AND a.cliente_id = p_cliente_id AND a.ano_mes = v_ant);
    END IF;

    -- Ajuste do D3 (20261027191800), so' desempenho:$b2$;
  a3 := $a3$    v_sis := (v->>'sistema_total')::numeric;
$a3$;
  b3 := $b3$    v_sis := (v->>'sistema_total')::numeric;
    -- PR-CONC-INTERNA-SEPARADA-01a (Opcao A do Gabriel, 03/10): o CONSOLIDADO DO PAR = Σ PROPRIOS. O movimento proprio da mae
    -- e' o dela + as transferencias com as internas (`interna_total`, as pernas que o consolidado tira); o de cada interna sai do
    -- helper dela. O consolidado passa a somar o movimento da interna com TERCEIROS — antes ficava de fora (CORRECAO DE DEFEITO:
    -- em 7 meses do Agnaldo a diferenca do par era exatamente esse movimento). Sem interna, nada muda (tudo zero).
    v_mov_prop := v_sis; v_pos_prop := (v->>'posicao_sistema')::numeric;
    v_xs_tot := 0; v_xe := 0; v_xs := 0; v_xet := 0; v_xetr := 0; v_xst := 0; v_xstr := 0; v_xpos := 0; v_te := 0; v_ts := 0;
    IF v_internas IS NOT NULL THEN
      v_te := coalesce((v->>'interna_entradas')::numeric, 0);
      v_ts := coalesce((v->>'interna_saidas')::numeric, 0);
      v_mov_prop := v_sis + coalesce((v->>'interna_total')::numeric, 0);
      v_pos_prop := (v->>'posicao_sistema')::numeric + coalesce((v->>'posicao_interna')::numeric, 0);
      FOR v_i IN SELECT (e->>'conta_id')::uuid AS id FROM jsonb_array_elements(v_internas) e LOOP
        v_iv := public._fn_conciliacao_dias_conta(p_cliente_id, v_i.id, v_d1, v_d2, false, CASE WHEN v_data < v_d2 THEN v_data END, NULL);
        v_xs_tot := v_xs_tot + (v_iv->>'sistema_total')::numeric;
        v_xe := v_xe + (v_iv->>'entradas')::numeric;  v_xs := v_xs + (v_iv->>'saidas')::numeric;
        v_xet := v_xet + (v_iv->>'entradas_terceiros')::numeric; v_xetr := v_xetr + (v_iv->>'entradas_transferencias')::numeric;
        v_xst := v_xst + (v_iv->>'saidas_terceiros')::numeric;  v_xstr := v_xstr + (v_iv->>'saidas_transferencias')::numeric;
        v_xpos := v_xpos + coalesce((v_iv->>'posicao_sistema')::numeric, 0);
      END LOOP;
      -- o movimento da interna com terceiros = o dela menos as pernas com a mae (que, do lado dela, tem o sinal trocado)
      v_xe := v_xe + v_ts; v_xs := v_xs + v_te; v_xetr := v_xetr + v_ts; v_xstr := v_xstr + v_te;
      v_sis := v_mov_prop + v_xs_tot;
    END IF;
    v_pos_cons := CASE WHEN v_internas IS NULL THEN (v->>'posicao_sistema')::numeric ELSE v_pos_prop + v_xpos END;
$b3$;
  a4 := $a4$    conta_id := c.id; conta_nome := c.nome; consolida_em_conta_id := c.cons;
$a4$;
  b4 := $b4$    -- PR-CONC-INTERNA-SEPARADA-01a (D2): a interna e' julgada COM a mae (o par vale uma vez): o status do PAR e o motivo
    -- 'conferida_com'. A mae ja' calculada nesta chamada responde pelo mapa; senao, uma chamada so' com ela.
    v_par_status := NULL;
    IF c.cons IS NOT NULL THEN
      v_par_status := v_status_conta->>(c.cons::text);
      IF v_par_status IS NULL THEN
        SELECT r.status INTO v_par_status
          FROM public._fn_conciliacao_resumo(p_cliente_id, p_ano_mes, ARRAY[c.cons], false, false) r
         WHERE r.nivel = 'conta' AND r.conta_id = c.cons;
      END IF;
      IF v_par_status IS NOT NULL THEN
        v_status := v_par_status;
        v_mot := jsonb_build_array(jsonb_build_object('motivo', 'conferida_com', 'conta_id', c.cons,
                   'conta_nome', (SELECT coalesce(m.nome_exibicao, m.nome_conta) FROM financeiro_contas_bancarias m WHERE m.id = c.cons)));
      END IF;
    END IF;
    v_status_conta := v_status_conta || jsonb_build_object(c.id::text, v_status);

    conta_id := c.id; conta_nome := c.nome; consolida_em_conta_id := c.cons;
$b4$;
  a5 := $a5$    entradas := round((v->>'entradas')::numeric, 2); saidas := round((v->>'saidas')::numeric, 2);
$a5$;
  b5 := $b5$    entradas := round((v->>'entradas')::numeric + v_xe, 2); saidas := round((v->>'saidas')::numeric + v_xs, 2);
$b5$;
  a6 := $a6$    entradas_terceiros := round((v->>'entradas_terceiros')::numeric, 2);
    entradas_transferencias := round((v->>'entradas_transferencias')::numeric, 2);
    saidas_terceiros := round((v->>'saidas_terceiros')::numeric, 2);
    saidas_transferencias := round((v->>'saidas_transferencias')::numeric, 2);
$a6$;
  b6 := $b6$    entradas_terceiros := round((v->>'entradas_terceiros')::numeric + v_xet, 2);
    entradas_transferencias := round((v->>'entradas_transferencias')::numeric + v_xetr, 2);
    saidas_terceiros := round((v->>'saidas_terceiros')::numeric + v_xst, 2);
    saidas_transferencias := round((v->>'saidas_transferencias')::numeric + v_xstr, 2);
$b6$;
  a7 := $a7$    diferenca_entradas := round((v->>'banco_entradas')::numeric - (v->>'entradas')::numeric, 2);
    diferenca_saidas := round((v->>'banco_saidas')::numeric - (v->>'saidas')::numeric, 2);
$a7$;
  b7 := $b7$    diferenca_entradas := round((v->>'banco_entradas')::numeric - ((v->>'entradas')::numeric + v_xe), 2);
    diferenca_saidas := round((v->>'banco_saidas')::numeric - ((v->>'saidas')::numeric + v_xs), 2);
$b7$;
  a8 := $a8$                 'saldo_sistema_na_data', CASE WHEN v_ini IS NULL THEN NULL ELSE round(v_ini + (v->>'posicao_sistema')::numeric, 2) END,
                 'diferenca_na_data', CASE WHEN v_ini IS NULL OR v_fim IS NULL THEN NULL
                                           ELSE round(v_fim - (v_ini + (v->>'posicao_sistema')::numeric), 2) END,
$a8$;
  b8 := $b8$                 'saldo_sistema_na_data', CASE WHEN v_ini IS NULL THEN NULL ELSE round(v_ini + v_pos_cons, 2) END,
                 'diferenca_na_data', CASE WHEN v_ini IS NULL OR v_fim IS NULL THEN NULL
                                           ELSE round(v_fim - (v_ini + v_pos_cons), 2) END,
                 -- PR-CONC-INTERNA-SEPARADA-01a (D5): o sistema PROPRIO na data (sem interna = o de cima)
                 'saldo_sistema_proprio_na_data', CASE WHEN v_ini_prop IS NULL THEN NULL ELSE round(v_ini_prop + v_pos_prop, 2) END,
$b8$;
  a9 := $a9$    sem_conta := NULL;
    RETURN NEXT;
$a9$;
  b9 := $b9$    sem_conta := NULL;
    -- PR-CONC-INTERNA-SEPARADA-01a (D1): o saldo PROPRIO da conta. Sem interna (e na interna) = os campos acima; na mae, o
    -- inicial e o extrato dela sozinha e o sistema = inicial proprio + movimento proprio (com as transferencias com a interna).
    proprio := CASE WHEN v_internas IS NULL THEN jsonb_build_object(
                 'saldo_inicial', saldo_inicial, 'entradas', entradas, 'saidas', saidas, 'saldo_sistema', saldo_sistema,
                 'saldo_extrato', saldo_extrato, 'diferenca', diferenca,
                 'entradas_terceiros', entradas_terceiros, 'entradas_transferencias', entradas_transferencias,
                 'saidas_terceiros', saidas_terceiros, 'saidas_transferencias', saidas_transferencias)
               ELSE jsonb_build_object(
                 'saldo_inicial', v_ini_prop,
                 'entradas', round((v->>'entradas')::numeric + v_te, 2), 'saidas', round((v->>'saidas')::numeric + v_ts, 2),
                 'saldo_sistema', CASE WHEN v_ini_prop IS NULL THEN NULL ELSE round(v_ini_prop + v_mov_prop, 2) END,
                 'saldo_extrato', v_fim_conta,
                 'diferenca', CASE WHEN v_ini_prop IS NULL OR v_fim_conta IS NULL THEN NULL
                                   ELSE round(v_fim_conta - (v_ini_prop + v_mov_prop), 2) END,
                 'entradas_terceiros', round((v->>'entradas_terceiros')::numeric, 2),
                 'entradas_transferencias', round((v->>'entradas_transferencias')::numeric + v_te, 2),
                 'saidas_terceiros', round((v->>'saidas_terceiros')::numeric, 2),
                 'saidas_transferencias', round((v->>'saidas_transferencias')::numeric + v_ts, 2)) END;
    par_conta_id := c.cons; par_status := v_par_status; internas := v_internas;
    RETURN NEXT;
$b9$;
  a10 := $a10$      'de', diferenca_entradas, 'ds', diferenca_saidas));
$a10$;
  b10 := $b10$      'de', diferenca_entradas, 'ds', diferenca_saidas,
      'p_si', proprio->'saldo_inicial', 'p_sis', proprio->'saldo_sistema', 'p_ext', proprio->'saldo_extrato',
      'p_dif', proprio->'diferenca'));
$b10$;
  a11 := $a11$      sum((y->>'saldo_inicial')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean),
      coalesce(sum((y->>'entradas')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean), 0),
      coalesce(sum((y->>'saidas')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean), 0),
      sum((y->>'saldo_sistema')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean),
      sum((y->>'saldo_extrato')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean),
      sum((y->>'diferenca')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean),
$a11$;
  b11 := $b11$      -- PR-CONC-INTERNA-SEPARADA-01a (D3): os SALDOS do agregado somam o PROPRIO de TODAS as contas, cada uma no seu tipo (a
      -- interna em Investimentos, a mae em Conta corrente); entradas e saidas seguem o consolidado (sem as internas).
      sum((y->>'p_si')::numeric),
      coalesce(sum((y->>'entradas')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean), 0),
      coalesce(sum((y->>'saidas')::numeric) FILTER (WHERE NOT (y->>'interna')::boolean), 0),
      sum((y->>'p_sis')::numeric),
      sum((y->>'p_ext')::numeric),
      sum((y->>'p_dif')::numeric),
$b11$;
  a12 := $a12$      count(*) FILTER (WHERE y->>'status' = 'conciliado'),
      count(*) FILTER (WHERE y->>'status' = 'nao_conciliado'),
      jsonb_agg(jsonb_build_object('conta_id', y->'conta_id', 'conta_nome', y->'conta_nome', 'status', y->'status',
                                   'motivos', y->'motivos') ORDER BY i)
        FILTER (WHERE y->>'status' = 'nao_conciliado'),
      count(*) FILTER (WHERE y->>'status' = 'pendente')
$a12$;
  b12 := $b12$      -- D3: no TOTAL o PAR vale uma vez — a interna (status do par) nao conta como conta. No SUBTOTAL do tipo ela conta, com o
      -- status do par e o motivo 'conferida_com': o tipo dela reflete o veredito do par (o tipo cuja unica conta e' a interna
      -- herda o status do par, nunca 'pendente' sem motivo).
      count(*) FILTER (WHERE y->>'status' = 'conciliado' AND (g.k IS NOT NULL OR NOT (y->>'interna')::boolean)),
      count(*) FILTER (WHERE y->>'status' = 'nao_conciliado' AND (g.k IS NOT NULL OR NOT (y->>'interna')::boolean)),
      jsonb_agg(jsonb_build_object('conta_id', y->'conta_id', 'conta_nome', y->'conta_nome', 'status', y->'status',
                                   'motivos', y->'motivos') ORDER BY i)
        FILTER (WHERE y->>'status' = 'nao_conciliado' AND (g.k IS NOT NULL OR NOT (y->>'interna')::boolean)),
      count(*) FILTER (WHERE y->>'status' = 'pendente' AND (g.k IS NOT NULL OR NOT (y->>'interna')::boolean))
$b12$;
  a13 := $a13$    saldo_inicial_origem := NULL; posicao := NULL; dias := NULL; linhas_sistema := NULL;
$a13$;
  b13 := $b13$    saldo_inicial_origem := NULL; posicao := NULL; dias := NULL; linhas_sistema := NULL;
    proprio := NULL; par_conta_id := NULL; par_status := NULL; internas := NULL;
$b13$;
  FOREACH a IN ARRAY ARRAY[a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13] LOOP
    IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
      RAISE EXCEPTION 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean): ancora nao casa exatamente 1x: %', left(a, 80);
    END IF;
  END LOOP;
  v_novo := replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(v_def, a0, b0), a1, b1), a2, b2), a3, b3), a4, b4), a5, b5), a6, b6), a7, b7), a8, b8), a9, b9), a10, b10), a11, b11), a12, b12), a13, b13);
  DROP FUNCTION public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean);
  EXECUTE v_novo;
  SELECT p.prosrc INTO v_depois FROM pg_proc p WHERE p.oid = 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)'::regprocedure;
  IF md5(v_depois) <> '68c2e274fa8d1fe34bac081553e6633c' THEN
    RAISE EXCEPTION 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean): corpo resultante inesperado (md5 %)', md5(v_depois);
  END IF;
END $mig$;
REVOKE ALL ON FUNCTION public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean) TO service_role;

-- ═══ a publica: mesmo corpo (md5 25aa2ac4…), as quatro colunas novas no fim ═══
CREATE FUNCTION public.fn_conciliacao_resumo_mes(p_cliente_id uuid, p_ano_mes text, p_conta_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(conta_id uuid, conta_nome text, consolida_em_conta_id uuid, tem_extrato boolean, saldo_inicial numeric, entradas numeric, saidas numeric, saldo_sistema numeric, saldo_extrato numeric, saldo_extrato_data date, diferenca numeric, banco jsonb, extratos_sem_par jsonb, lancamentos_sem_par jsonb, retido_em_depositos jsonb, dias_com_diferenca jsonb, status text, motivos jsonb, legado jsonb, nivel text, tipo_conta text, entradas_terceiros numeric, entradas_transferencias numeric, saidas_terceiros numeric, saidas_transferencias numeric, saldo_inicial_origem text, posicao jsonb, dias jsonb, linhas_sistema jsonb, sem_conta jsonb, diferenca_entradas numeric, diferenca_saidas numeric, proprio jsonb, par_conta_id uuid, par_status text, internas jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
-- PR-CONC-SALDO-UMA-REGUA-01 / 01b — o RESUMO DA CONTA NO MES: uma linha por conta (NULL = todas as do cliente), um
-- subtotal por tipo e o total. Com UMA conta, tambem os dias e a lista do sistema. O corpo e' `_fn_conciliacao_resumo`.
BEGIN
  IF p_cliente_id IS NULL OR p_ano_mes !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'p_cliente_id e p_ano_mes (YYYY-MM) obrigatorios'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.tenant_ok(p_cliente_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem_permissao: operacao nao autorizada para este cliente.';
  END IF;
  RETURN QUERY SELECT * FROM public._fn_conciliacao_resumo(p_cliente_id, p_ano_mes, p_conta_ids, NULL, p_conta_ids IS NULL);
END
$function$;
REVOKE ALL ON FUNCTION public.fn_conciliacao_resumo_mes(uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conciliacao_resumo_mes(uuid, text, uuid[]) TO authenticated, service_role;

-- ═══ D4 — o status do ano: o par vale uma vez (corpo integral) ═══
CREATE OR REPLACE FUNCTION public.fn_conciliacao_status_ano(p_cliente_id uuid, p_ano integer)
 RETURNS TABLE(ano_mes text, nivel text, conta_id uuid, conta_nome text, tipo_conta text, status text, motivos jsonb)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
-- PR-CONC-SALDO-UMA-REGUA-01b (D7) — o selo dos 12 meses: por mes, o status e os motivos de cada conta que teve extrato
-- ou lancamento no mes, e o do TOTAL do mes. Sai da MESMA interna do resumo (`_fn_conciliacao_resumo`), sem detalhe.
-- Ajuste do D3 (20261027191800): o total olha TODAS as contas, com ou sem extrato. Por isso a interna recebe tambem a
-- conta com SALDO INFORMADO no mes (a unica que, sem extrato e sem lancamento, pode sair 'conciliado' ou 'nao_conciliado'
-- pela regua de hoje); as demais contas do cliente sao 'pendente' por construcao (sem extrato e sem saldo informado = a
-- regua de hoje diz 'pendente') e entram SO' na contagem `contas_pendentes` do total — o mesmo numero do resumo.
-- PR-CONC-INTERNA-SEPARADA-01a (D4): a conta INTERNA e' julgada com a mae (o par vale uma vez): ela sai da contagem de contas do
-- total (como no resumo) e aparece em todo mes em que a mae aparece, com o status do par.
#variable_conflict use_column
DECLARE v_mov jsonb; v_sal jsonb; v_mes text; v_ids uuid[]; v_calc uuid[]; v_omit int; v_total int;
BEGIN
  IF p_cliente_id IS NULL OR p_ano IS NULL THEN RAISE EXCEPTION 'p_cliente_id e p_ano obrigatorios'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.tenant_ok(p_cliente_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem_permissao: operacao nao autorizada para este cliente.';
  END IF;
  -- as contas com movimento em cada mes do ano: extrato vivo, ou lancamento nao cancelado pago no mes (qualquer ponta)
  SELECT jsonb_object_agg(m.mes, m.contas) INTO v_mov
    FROM (SELECT x.mes, jsonb_agg(DISTINCT x.conta) AS contas
            FROM (SELECT to_char(e.data_movimento, 'YYYY-MM') AS mes, e.conta_bancaria_id AS conta
                    FROM extrato_bancario_v2 e
                   WHERE e.cliente_id = p_cliente_id AND e.cancelado_em IS NULL AND e.ignorado_em IS NULL
                     AND e.data_movimento BETWEEN make_date(p_ano, 1, 1) AND make_date(p_ano, 12, 31)
                  UNION
                  SELECT to_char(l.data_pagamento, 'YYYY-MM'), k.conta
                    FROM financeiro_lancamentos_v2 l
                    CROSS JOIN LATERAL (VALUES (l.conta_bancaria_id), (l.conta_destino_id)) k(conta)
                   WHERE l.cliente_id = p_cliente_id AND l.cancelado = false
                     AND l.data_pagamento BETWEEN make_date(p_ano, 1, 1) AND make_date(p_ano, 12, 31)
                     AND k.conta IS NOT NULL) x
           WHERE x.conta IS NOT NULL
           GROUP BY x.mes) m;
  -- as contas com saldo informado em cada mes do ano
  SELECT jsonb_object_agg(m.mes, m.contas) INTO v_sal
    FROM (SELECT s.ano_mes AS mes, jsonb_agg(DISTINCT s.conta_bancaria_id) AS contas
            FROM financeiro_saldos_bancarios_v2 s
           WHERE s.cliente_id = p_cliente_id AND s.ano_mes LIKE p_ano::text || '-%' AND s.conta_bancaria_id IS NOT NULL
           GROUP BY s.ano_mes) m;
  FOR i IN 1..12 LOOP
    v_mes := p_ano::text || '-' || lpad(i::text, 2, '0');
    v_ids := coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(v_mov->v_mes, '[]'::jsonb))::uuid), '{}'::uuid[]);
    -- PR-CONC-SALDO-UMA-REGUA-01c: o universo do mes e' o do resumo sem `p_conta_ids` — conta ATIVA e ja' existente no mes
    SELECT count(*) INTO v_total FROM financeiro_contas_bancarias b
     WHERE b.cliente_id = p_cliente_id AND b.ativa AND (b.mes_inicio IS NULL OR b.mes_inicio <= v_mes)
       AND b.consolida_em_conta_id IS NULL;
    v_calc := ARRAY(SELECT b.id FROM financeiro_contas_bancarias b
                     WHERE b.cliente_id = p_cliente_id AND b.ativa AND (b.mes_inicio IS NULL OR b.mes_inicio <= v_mes)
                       AND (b.id = ANY (v_ids)
                            OR b.id IN (SELECT jsonb_array_elements_text(coalesce(v_sal->v_mes, '[]'::jsonb))::uuid)
                            OR b.consolida_em_conta_id = ANY (v_ids)));
    v_omit := v_total - (SELECT count(*) FROM financeiro_contas_bancarias b
                          WHERE b.id = ANY (v_calc) AND b.consolida_em_conta_id IS NULL);
    RETURN QUERY
      SELECT v_mes, r.nivel, r.conta_id, r.conta_nome, r.tipo_conta, r.status,
             CASE WHEN r.nivel <> 'total' OR v_omit = 0 THEN r.motivos
                  -- as omitidas somam-se a' contagem de pendentes, na MESMA posicao em que o resumo a escreve
                  WHEN r.motivos @> '[{"motivo": "contas_pendentes"}]'::jsonb THEN
                    (SELECT jsonb_agg(CASE WHEN x.m->>'motivo' = 'contas_pendentes'
                                           THEN jsonb_set(x.m, '{qtde}', to_jsonb((x.m->>'qtde')::int + v_omit)) ELSE x.m END
                                      ORDER BY x.o)
                       FROM jsonb_array_elements(r.motivos) WITH ORDINALITY AS x(m, o))
                  ELSE
                    (SELECT jsonb_agg(z.m ORDER BY z.k)
                       FROM (SELECT x.m, x.o::numeric AS k FROM jsonb_array_elements(r.motivos) WITH ORDINALITY AS x(m, o)
                             UNION ALL
                             SELECT jsonb_build_object('motivo', 'contas_pendentes', 'qtde', v_omit),
                                    coalesce((SELECT x.o FROM jsonb_array_elements(r.motivos) WITH ORDINALITY AS x(m, o)
                                               WHERE x.m->>'motivo' = 'lancamentos_sem_conta'), 1000000) - 0.5) z)
             END
        FROM public._fn_conciliacao_resumo(p_cliente_id, v_mes, v_calc, false, true) r
       WHERE (r.nivel = 'conta' AND (r.conta_id = ANY (v_ids) OR r.par_conta_id = ANY (v_ids))) OR r.nivel = 'total';
  END LOOP;
END
$function$;

-- ═══ guardas de destino ═══
DO $guarda$
DECLARE r record; f text;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliacao_resumo_mes(uuid, text, uuid[])'::regprocedure)
       IS DISTINCT FROM '25aa2ac47b2bec06c951377cb2cecc84'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliacao_status_ano(uuid, integer)'::regprocedure)
       IS DISTINCT FROM '0c30b64769b0fdcd39ce9c846ec0790d'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric)'::regprocedure)
       IS DISTINCT FROM 'bb71a135061912696d56e604b1b8596e'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)'::regprocedure)
       IS DISTINCT FROM '68c2e274fa8d1fe34bac081553e6633c' THEN
    RAISE EXCEPTION 'corpo de destino inesperado';
  END IF;
  FOREACH f IN ARRAY ARRAY['public._fn_conciliacao_dias_conta(uuid, uuid, date, date, boolean, date, numeric)',
                           'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)',
                           'public.fn_conciliacao_resumo_mes(uuid, text, uuid[])',
                           'public.fn_conciliacao_status_ano(uuid, integer)'] LOOP
    SELECT p.oid, p.proconfig, p.prosecdef INTO r FROM pg_proc p WHERE p.oid = f::regprocedure;
    IF NOT ('plan_cache_mode=force_custom_plan' = ANY (r.proconfig)) OR NOT ('search_path=pg_catalog, public' = ANY (r.proconfig))
       OR NOT r.prosecdef OR has_function_privilege('anon', r.oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', r.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', r.oid, 'EXECUTE') <> (f NOT LIKE 'public.\_fn%')
       OR EXISTS (SELECT 1 FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid = r.oid)) x WHERE x.grantee = 0) THEN
      RAISE EXCEPTION '%: config/ACL inesperados (%)', f, r.proconfig;
    END IF;
  END LOOP;
END $guarda$;