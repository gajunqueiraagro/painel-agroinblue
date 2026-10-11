-- CONC-PARCIAL-UM-ESTADO-01 passo 1 — CONSERTO DO CASO ANTIGO (Santa Rita, titulo 17f14dbc). SO' EXECUTAR COM O SIM DO GABRIEL.
-- Depois das migrations 20261027195700 e 20261027195800.
--
-- ⚠ EXECUTADO em 11/10/2026 10:23 UTC, com o SIM do Gabriel (REGISTRO HISTORICO: nao reexecutar — a guarda aborta, ja' ha' liquidacao).
--   Conferido no banco depois: liquidacao 100.000,00 em 04/09/2026 (recebimento, origem financeiro, viva); visao 100.000,00 /
--   50.000,00 / parcial; lancamento intocado (programado, 150.000, sem pagamento; md5 da linha conferido igual dentro do proprio
--   bloco, e updated_at segue 29/09/2026); 0 parciais de OC divergentes em todos os clientes; 381 linhas em zoo_operacao_liquidacoes.
--
-- O QUE E': o titulo de OC 17f14dbc (150.000,00, programado) recebeu 100.000,00 pelo bloco da Conferencia ANTES de a ponte saber
-- tratar o parcial. O vinculo esta' vivo, e a OC dizia liquidado 0. O gatilho novo so' age em vinculo que nasce ou muda DEPOIS
-- dele: este caso antigo precisa de UMA chamada da ponte.
--
-- O QUE FAZ: chama a ponte (oc_sincronizar_liquidacao_de_financeiro) no titulo. Ela grava UMA liquidacao automatica
-- (origem 'financeiro') com o aplicado vivo e a data do ultimo extrato vivo. NAO toca o lancamento, o vinculo nem o extrato.
--
-- ESPERADO (simulado em 11/10/2026, transacao revertida):
--   ANTES   lancamento programado · 150.000 · sem pagamento · aplicado 100.000,00 · nenhuma liquidacao · visao 0,00 / 150.000,00 / nao_liquidada
--   DEPOIS  o MESMO lancamento (md5 da linha igual) · 1 liquidacao automatica de 100.000,00 em 04/09/2026 (recebimento) ·
--           visao 100.000,00 / 50.000,00 / parcial · parciais de OC divergentes em todos os clientes: 1 -> 0 · liquidacoes na tabela +1
--
-- GUARDA: aborta se o estado medido nao for o de cima (titulo ja' realizado, aplicado diferente, liquidacao ja' existente).
--
-- GESTO CONTRARIO: a linha automatica acompanha o vinculo. Desfazer o bloco na Conferencia ("Desfazer bloco", com motivo) faz o
-- gatilho chamar a ponte, que ESTORNA a linha (provado no T4b). Nao ha' gesto para tirar so' a linha deixando o vinculo vivo:
-- enquanto o dinheiro estiver conciliado, a OC o enxerga — e' a regra deste PR.

BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

DO $conserto$
DECLARE
  c_titulo constant uuid := '17f14dbc-57bb-41fa-add3-500a102aee28';
  v_status text; v_valor numeric; v_aplicado numeric; v_liq int; v_md5 text; v_depois text;
BEGIN
  SELECT l.status_transacao, abs(l.valor), public._fn_lancamento_aplicado_vivo(l.id), md5(l::text)
    INTO v_status, v_valor, v_aplicado, v_md5
    FROM financeiro_lancamentos_v2 l WHERE l.id = c_titulo AND l.cancelado IS NOT TRUE;
  SELECT count(*) INTO v_liq FROM zoo_operacao_liquidacoes q WHERE q.financeiro_lancamento_id = c_titulo AND q.estornado = false;

  IF v_status IS DISTINCT FROM 'programado' OR v_valor IS DISTINCT FROM 150000::numeric
     OR v_aplicado IS DISTINCT FROM 100000::numeric OR v_liq IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'guarda: o estado nao e'' o medido (status %, valor %, aplicado %, liquidacoes vivas %). Nada foi gravado.',
      v_status, v_valor, v_aplicado, v_liq;
  END IF;
  RAISE NOTICE 'ANTES : % · % · aplicado % · liquidacoes vivas %', v_status, v_valor, v_aplicado, v_liq;

  PERFORM public.oc_sincronizar_liquidacao_de_financeiro(c_titulo);

  SELECT round(q.valor, 2) || ' em ' || q.data || ' · ' || q.natureza || ' · ' || q.origem INTO v_depois
    FROM zoo_operacao_liquidacoes q WHERE q.financeiro_lancamento_id = c_titulo AND q.estornado = false;
  IF v_depois IS DISTINCT FROM '100000.00 em 2026-09-04 · recebimento · financeiro' THEN
    RAISE EXCEPTION 'resultado inesperado: %. Nada foi gravado.', v_depois;
  END IF;
  IF (SELECT md5(l::text) FROM financeiro_lancamentos_v2 l WHERE l.id = c_titulo) IS DISTINCT FROM v_md5 THEN
    RAISE EXCEPTION 'o lancamento mudou. Nada foi gravado.';
  END IF;
  RAISE NOTICE 'DEPOIS: liquidacao % · visao %', v_depois,
    (SELECT round(o.total_liquidado, 2) || ' / ' || round(o.saldo_aberto, 2) || ' / ' || o.estado FROM vw_oc_obrigacoes o WHERE o.titulo_id = c_titulo);
END
$conserto$;

COMMIT;
