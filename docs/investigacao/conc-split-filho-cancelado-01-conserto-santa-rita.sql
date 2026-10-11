-- CONC-SPLIT-FILHO-CANCELADO-01 — CONSERTO DO DADO (Santa Rita, Banco do Brasil, extrato de 10/08/2026). Decisoes do Gabriel, 11/10/2026.
-- EXECUTADO EM 2026-10-11 14:21:27 UTC, com o SIM do Gabriel (registro historico: a guarda do estado medido recusa uma segunda execucao).
-- Conferido no vivo: extrato 'conciliado' com 3 vinculos vivos somando 13.760,35; 84575129 a 10.219,33 realizado em 10/08 com a marca
-- 'manual'; a conta em ago/26 conciliada, 0 dias com diferenca; 3 linhas de trilha; 0 extratos 'parcial' em todos os clientes.
--
-- O CASO: o extrato a4699176 (10/08/2026, −13.760,35) era um desmembramento da Mesa (split 30a12d86) em tres filhos. Em 11/10 o
-- filho 66ec72e1 (10.219,33) foi cancelado pelo modal do lancamento, para ser substituido pela ocorrencia da recorrencia da folha;
-- o gatilho desfez o vinculo 902b23f8 e o extrato ficou 'parcial' com 3.541,02 aplicados (eeb34469 250,00 + 11211308 3.291,02).
--
-- POR QUE E' SCRIPT, E POR QUE O VINCULO E' INSERT DIRETO: nenhuma funcao dona aceita um terceiro vinculo num extrato que ja' tem
-- vinculo vivo, nem solta os dois que restam (simulado em 11/10, transacao revertida):
--   fn_vincular_extrato_lancamento  -> "extrato ja possui vinculo ativo"
--   fn_espelho_casar                -> motivo 'extrato_ja_conciliado'
--   fn_conciliar_bloco (2 regras)   -> "extrato_ja_vinculado: … ja tem vinculo — desfaca antes."
--   fn_reativar_vinculo_extrato     -> "ja possui vinculo ativo; reativar bloqueado"
--   fn_desfazer_vinculo_extrato     -> "possui 2 vinculos ativos; desfazer bloqueado por seguranca"
--   (e fn_classificacao_desfazer_split -> 'filho_cancelado')
--
-- O QUE O SCRIPT FAZ (D1, D2):
--   1. lancamento 84575129 ("Encargos Folha", ocorrencia da recorrencia de folha 8c478c01, previsto 12.000,00, venc. 10/08):
--      valor 10.219,33, status 'realizado', data_pagamento 2026-08-10 — O MESMO que fn_espelho_casar escreve num lancamento
--      realizado pelo extrato:
--          UPDATE financeiro_lancamentos_v2 SET valor = v_vals[i], data_pagamento = v_ext.data_movimento,
--                 status_transacao = 'realizado', conta_bancaria_id = CASE WHEN sinal = '-1' THEN COALESCE(conta_bancaria_id, …) …,
--                 updated_by = v_uid, updated_at = v_agora
--      (a conta ja' e' a do extrato; forma de pagamento e observacao ele NAO toca, e aqui tambem nao) — mais a marca do valor do
--      mes (valor_do_mes_em = now(), valor_do_mes_origem = 'manual'), para o Propagar da recorrencia nao devolver os 12.000,00.
--      Classificacao, fazenda, safra e competencia (07/2026) ficam. ⚠ `ano_mes` FICA 2026-07: o gatilho
--      trg_00_ano_mes_from_competencia restaura o valor anterior quando a competencia nao muda (nenhum escritor o altera).
--   2. vinculo novo em conciliacao_bancaria_itens: extrato a4699176 x lancamento 84575129, 10.219,33, tipo 'manual', sem grupo —
--      igual aos dois irmaos. Os snapshots sao do gatilho trg_snapshot_conciliacao; a trilha 'conciliacao_criada' e' do gatilho
--      trg_audit_conciliacao.
--   3. extrato a4699176: status 'conciliado', por UPDATE EXPLICITO — nenhum gatilho de conciliacao_bancaria_itens mexe no status do
--      extrato (quem o escreve sao as funcoes: fn_vincular_extrato_lancamento, no fim do corpo).
--   4. uma linha em conciliacao_audit_log, acao 'conciliacao_substituida', com o estado medido em payload_antes e o gravado em
--      payload_depois. A edicao do lancamento e' auditada pelo gatilho de sempre (trg_audit_financeiro_v2).
--   5. prova, dentro da transacao: soma dos vinculos vivos = 13.760,35; extrato 'conciliado'; o dia 10/08 sai de
--      dias_com_diferenca de fn_conciliacao_resumo_mes (banco x sistema do dia fecham).
-- NAO TOCA: o split 30a12d86 (fica vivo com um filho cancelado; o desfazer tolerante e' o passo 3), o filho cancelado 66ec72e1, o
-- vinculo desfeito 902b23f8 e os dois irmaos.
--
-- GESTO CONTRARIO, linha a linha (numa transacao, com os mesmos tempos-limite):
--   UPDATE conciliacao_bancaria_itens SET desfeito_em = now(), desfeito_por = '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e',
--          desfeito_motivo = 'conc-split-filho-cancelado-01: volta'
--    WHERE extrato_id = 'a4699176-7841-4a1f-a0a8-a93b451f6260' AND lancamento_id = '84575129-4974-44a7-9aaf-767526099a28' AND desfeito_em IS NULL;
--   UPDATE extrato_bancario_v2 SET status = 'parcial' WHERE id = 'a4699176-7841-4a1f-a0a8-a93b451f6260';
--   UPDATE financeiro_lancamentos_v2 SET valor = 12000.00, status_transacao = 'previsto', data_pagamento = NULL,
--          valor_do_mes_em = NULL, valor_do_mes_origem = NULL, updated_at = now()
--    WHERE id = '84575129-4974-44a7-9aaf-767526099a28';
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
SELECT set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

DO $conserto$
DECLARE
  c_ext   constant uuid := 'a4699176-7841-4a1f-a0a8-a93b451f6260';
  c_lan   constant uuid := '84575129-4974-44a7-9aaf-767526099a28';
  c_cli   constant uuid := '77d37bbf-a440-4fca-bf1a-eac60cf91bc4';
  c_adm   constant uuid := '7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e';
  c_valor constant numeric := 10219.33;
  e extrato_bancario_v2%ROWTYPE;
  l financeiro_lancamentos_v2%ROWTYPE;
  v_antes jsonb; v_depois jsonb; v_cbi uuid; v_txt text; v_dia_antes jsonb; v_dia_depois jsonb;
BEGIN
  -- ── guarda do estado medido: qualquer divergencia aborta ──
  SELECT * INTO e FROM extrato_bancario_v2 WHERE id = c_ext FOR UPDATE;
  SELECT * INTO l FROM financeiro_lancamentos_v2 WHERE id = c_lan FOR UPDATE;
  IF e.id IS NULL OR e.status IS DISTINCT FROM 'parcial' OR e.valor IS DISTINCT FROM -13760.35 OR e.data_movimento IS DISTINCT FROM date '2026-08-10'
     OR e.cliente_id IS DISTINCT FROM c_cli OR e.cancelado_em IS NOT NULL THEN
    RAISE EXCEPTION 'guarda: o extrato nao esta como medido (status %, valor %)', e.status, e.valor; END IF;
  SELECT string_agg(left(c.lancamento_id::text, 8) || ':' || c.valor_aplicado || ':' || c.tipo_aprovacao || ':' || coalesce(c.grupo_id::text, '-'), ',' ORDER BY c.valor_aplicado)
    INTO v_txt FROM conciliacao_bancaria_itens c WHERE c.extrato_id = c_ext AND c.desfeito_em IS NULL;
  IF v_txt IS DISTINCT FROM 'eeb34469:250.00:manual:-,11211308:3291.02:manual:-' THEN RAISE EXCEPTION 'guarda: vinculos vivos do extrato = %', v_txt; END IF;
  IF NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.id = '902b23f8-30cc-4c90-8dce-acb33a6cdaca' AND c.desfeito_em IS NOT NULL
                    AND c.lancamento_id = '66ec72e1-3638-445c-b232-c9da2d96c337')
     OR NOT EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 f WHERE f.id = '66ec72e1-3638-445c-b232-c9da2d96c337' AND f.cancelado IS TRUE) THEN
    RAISE EXCEPTION 'guarda: o filho 66ec72e1 nao esta cancelado com o vinculo 902b23f8 desfeito'; END IF;
  IF l.id IS NULL OR l.cancelado IS TRUE OR l.cliente_id IS DISTINCT FROM c_cli OR l.valor IS DISTINCT FROM 12000.00 OR l.status_transacao IS DISTINCT FROM 'previsto'
     OR l.data_pagamento IS NOT NULL OR l.valor_do_mes_em IS NOT NULL OR l.valor_do_mes_origem IS NOT NULL
     OR l.conta_bancaria_id IS DISTINCT FROM e.conta_bancaria_id OR l.tipo_operacao IS DISTINCT FROM '2-Saídas'
     OR l.data_competencia IS DISTINCT FROM date '2026-07-01' OR l.data_vencimento IS DISTINCT FROM date '2026-08-10'
     OR NOT EXISTS (SELECT 1 FROM financeiro_recorrencias r WHERE r.id = l.recorrencia_id AND r.folha IS TRUE)
     OR EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = c_lan AND c.desfeito_em IS NULL)
     OR EXISTS (SELECT 1 FROM zoo_operacao_partes z WHERE z.financeiro_lancamento_id = c_lan AND z.cancelada = false) THEN
    RAISE EXCEPTION 'guarda: o lancamento da recorrencia nao esta como medido (valor %, status %)', l.valor, l.status_transacao; END IF;
  IF EXISTS (SELECT 1 FROM financeiro_fechamentos f WHERE f.cliente_id = c_cli AND f.status_fechamento = 'fechado' AND f.ano_mes IN ('2026-07', '2026-08')) THEN
    RAISE EXCEPTION 'guarda: mes fechado'; END IF;

  v_antes := jsonb_build_object(
    'extrato', jsonb_build_object('status', e.status, 'aplicado_vivo', 3541.02),
    'lancamento', jsonb_build_object('valor', l.valor, 'status_transacao', l.status_transacao, 'data_pagamento', l.data_pagamento,
                                     'valor_do_mes_em', l.valor_do_mes_em, 'valor_do_mes_origem', l.valor_do_mes_origem, 'updated_at', l.updated_at),
    'filho_cancelado', '66ec72e1-3638-445c-b232-c9da2d96c337', 'vinculo_desfeito', '902b23f8-30cc-4c90-8dce-acb33a6cdaca',
    'split', '30a12d86-ee22-4dbc-9599-a017b1d99335');
  SELECT coalesce(jsonb_agg(d) FILTER (WHERE d->>'data' = '2026-08-10'), '[]'::jsonb) INTO v_dia_antes
    FROM fn_conciliacao_resumo_mes(c_cli, '2026-08', ARRAY[e.conta_bancaria_id]) r, jsonb_array_elements(r.dias_com_diferenca) d WHERE r.nivel = 'conta';

  -- ── 1. o lancamento da recorrencia: o que o fn_espelho_casar escreve + a marca do valor do mes ──
  UPDATE financeiro_lancamentos_v2
     SET valor = c_valor, data_pagamento = e.data_movimento, status_transacao = 'realizado',
         valor_do_mes_em = now(), valor_do_mes_origem = 'manual',
         updated_by = c_adm, updated_at = now()
   WHERE id = c_lan;

  -- ── 2. o terceiro vinculo, igual aos dois irmaos ──
  INSERT INTO conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado, criado_por, tipo_aprovacao, aprovado_por, aprovado_em)
  VALUES (c_cli, c_ext, c_lan, c_valor, c_adm, 'manual', c_adm, now()) RETURNING id INTO v_cbi;

  -- ── 3. o extrato: nenhum gatilho o promove; escreve-se como o fn_vincular_extrato_lancamento escreve ──
  IF (SELECT sum(c.valor_aplicado) FROM conciliacao_bancaria_itens c WHERE c.extrato_id = c_ext AND c.desfeito_em IS NULL) IS DISTINCT FROM 13760.35 THEN
    RAISE EXCEPTION 'prova: os vinculos vivos nao somam 13.760,35'; END IF;
  UPDATE extrato_bancario_v2 SET status = 'conciliado' WHERE id = c_ext;

  -- ── 5. prova ──
  SELECT * INTO l FROM financeiro_lancamentos_v2 WHERE id = c_lan;
  IF (l.valor, l.status_transacao, l.data_pagamento, l.valor_do_mes_origem, l.ano_mes, l.data_competencia) IS DISTINCT FROM
     (c_valor, 'realizado', date '2026-08-10', 'manual', '2026-07', date '2026-07-01') OR l.valor_do_mes_em IS NULL THEN
    RAISE EXCEPTION 'prova: o lancamento ficou % % % % %', l.valor, l.status_transacao, l.data_pagamento, l.valor_do_mes_origem, l.ano_mes; END IF;
  IF (SELECT status FROM extrato_bancario_v2 WHERE id = c_ext) IS DISTINCT FROM 'conciliado' THEN RAISE EXCEPTION 'prova: extrato nao conciliado'; END IF;
  SELECT coalesce(jsonb_agg(d) FILTER (WHERE d->>'data' = '2026-08-10'), '[]'::jsonb) INTO v_dia_depois
    FROM fn_conciliacao_resumo_mes(c_cli, '2026-08', ARRAY[e.conta_bancaria_id]) r, jsonb_array_elements(r.dias_com_diferenca) d WHERE r.nivel = 'conta';
  IF v_dia_depois IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'prova: 10/08 continua com diferenca: %', v_dia_depois; END IF;
  IF (SELECT count(*) FROM classificacao_splits s WHERE s.id = '30a12d86-ee22-4dbc-9599-a017b1d99335' AND s.desfeito_em IS NULL) <> 1 THEN
    RAISE EXCEPTION 'prova: o split foi tocado'; END IF;

  v_depois := jsonb_build_object(
    'extrato', jsonb_build_object('status', 'conciliado', 'aplicado_vivo', 13760.35),
    'lancamento', jsonb_build_object('valor', l.valor, 'status_transacao', l.status_transacao, 'data_pagamento', l.data_pagamento,
                                     'valor_do_mes_em', l.valor_do_mes_em, 'valor_do_mes_origem', l.valor_do_mes_origem),
    'vinculo_novo', v_cbi);

  -- ── 4. a trilha do gesto ──
  INSERT INTO conciliacao_audit_log (acao, actor_user_id, cliente_id, extrato_id, lancamento_id, conciliacao_id, ano_mes, payload_antes, payload_depois, motivo)
  VALUES ('conciliacao_substituida', c_adm, c_cli, c_ext, c_lan, v_cbi, '2026-08', v_antes, v_depois,
          'CONC-SPLIT-FILHO-CANCELADO-01: o filho cancelado 66ec72e1 do desmembramento foi substituido pela ocorrencia da recorrencia da folha (script, decisao do Gabriel de 11/10/2026)');

  RAISE NOTICE 'ANTES  %', v_antes;
  RAISE NOTICE 'DEPOIS %', v_depois;
  RAISE NOTICE 'dia 10/08 em dias_com_diferenca: antes % | depois %', v_dia_antes, v_dia_depois;
  PERFORM set_config('app.conserto_relato', jsonb_build_object('antes', v_antes, 'depois', v_depois, 'dia_antes', v_dia_antes, 'dia_depois', v_dia_depois)::text, true);
END
$conserto$;

COMMIT;
