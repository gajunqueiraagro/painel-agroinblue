-- P62 — a guarda `chk_transferencia_no_plural` (migration 20261028112310). Roda como `authenticated` (admin) no cliente Teste e TERMINA
-- EM RAISE: nada fica. T1 nenhum vivo no singular · T2 gravar um vivo no singular e' recusado (23514) · T3 o cancelado no singular passa.
-- Mutacao: sem o CHECK, T2 grava.
begin;
set local statement_timeout = '60s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
DO $t$
DECLARE c_cli constant uuid := '43f32d07-dba8-4670-900c-bf645440c04a'; v_id uuid; e text;
BEGIN
  IF EXISTS (SELECT 1 FROM financeiro_lancamentos_v2 WHERE tipo_operacao = '3-Transferência' AND NOT cancelado) THEN RAISE EXCEPTION 'T1'; END IF;
  /* uma saida viva do Teste, sem conta de destino (passa nas outras travas de transferencia): so' a grafia decide */
  SELECT id INTO v_id FROM financeiro_lancamentos_v2 WHERE cliente_id = c_cli AND tipo_operacao = '2-Saídas' AND NOT cancelado AND conta_destino_id IS NULL LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'fixture: o Teste precisa de uma saida viva'; END IF;
  BEGIN UPDATE financeiro_lancamentos_v2 SET tipo_operacao = '3-Transferência' WHERE id = v_id; e := 'GRAVOU';
  EXCEPTION WHEN check_violation THEN e := 'recusou'; END;
  IF e <> 'recusou' THEN RAISE EXCEPTION 'T2: %', e; END IF;
  UPDATE financeiro_lancamentos_v2 SET cancelado = true WHERE id = v_id;
  UPDATE financeiro_lancamentos_v2 SET tipo_operacao = '3-Transferência' WHERE id = v_id;
  RAISE EXCEPTION 'OK transferencia_no_plural (T1–T3)';
END $t$;
rollback;
