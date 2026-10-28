-- P154 / P4 — OK do Gabriel: 28/10/2026 08:06 — cancelar regra Leandro + 9 previstos + programado set/26.
-- NJ, regra 199bbc05 ("Folha Pagamento", Leandro Soares Meira): rescisão em 13/07/2026 (realizada, avulsa — NÃO se toca). A regra é
-- CANCELADA e os 9 previstos de 10/2026 a 06/2027 (R$ 27.066,96) são cancelados pela porta nova (`fn_recorrencia_fora_da_vigencia`,
-- corte = mês do cancelamento); o PROGRAMADO de 09/2026 (venc 03/10/2026, R$ 2.877,31, "não vai ser pago") pela porta de sempre
-- (`fn_cancelar_lancamento_auditoria`). Motivo "rescisão em 13/07/2026 — recorrência encerrada". NADA SE APAGA.
-- Autor = o usuário do Gabriel só nesta transação (as portas exigem usuário); `app.via = 'p154'`.
-- PARA (nada gravado) se a lista não for a da prévia. REGISTRO HISTÓRICO: rodada uma vez; não se reaplica (a 2ª vez para na conferência).
DO $$
DECLARE
  c_regra constant uuid := '199bbc05-86e6-4444-b301-0ecac27ccd73';
  c_prog  constant uuid := '6fbcdfbd-fb6f-4a74-9491-8ce50ea0b210';
  c_motivo constant text := 'rescisão em 13/07/2026 — recorrência encerrada';
  v_prev jsonb; v_r jsonb; v_p jsonb; v_resc_antes text; v_resc_depois text; v_n int;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);
  PERFORM set_config('app.via', 'p154', true);

  v_prev := public.fn_recorrencia_fora_da_vigencia(c_regra, true, c_motivo, true);
  IF (v_prev ->> 'qtde') IS DISTINCT FROM '9' OR (v_prev ->> 'soma')::numeric IS DISTINCT FROM 27066.96
     OR jsonb_array_length(v_prev -> 'nao_mexe') <> 0 OR (v_prev ->> 'corte') IS DISTINCT FROM '2026-10' THEN
    RAISE EXCEPTION 'P154/Leandro: a prévia mudou (%). Nada foi gravado.', v_prev;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 WHERE id = c_prog AND recorrencia_id = c_regra AND NOT cancelado
                   AND status_transacao = 'programado' AND valor = 2877.31 AND data_competencia = '2026-09-01') THEN
    RAISE EXCEPTION 'P154/Leandro: o programado de 09/2026 não está como na prévia. Nada foi gravado.';
  END IF;
  SELECT md5(l::text) INTO v_resc_antes FROM public.financeiro_lancamentos_v2 l
   WHERE l.favorecido_id = (SELECT favorecido_id FROM public.financeiro_recorrencias WHERE id = c_regra)
     AND l.data_competencia = '2026-07-13' AND l.valor = 3773.13;
  IF v_resc_antes IS NULL THEN RAISE EXCEPTION 'P154/Leandro: a rescisão de 13/07 não foi achada para a conferência. Nada foi gravado.'; END IF;

  v_r := public.fn_recorrencia_fora_da_vigencia(c_regra, true, c_motivo, false);
  v_p := public.fn_cancelar_lancamento_auditoria(c_prog, c_motivo);

  SELECT count(*) INTO v_n FROM public.financeiro_lancamentos_v2 WHERE recorrencia_id = c_regra AND cancelado AND cancelado_motivo = c_motivo;
  SELECT md5(l::text) INTO v_resc_depois FROM public.financeiro_lancamentos_v2 l
   WHERE l.favorecido_id = (SELECT favorecido_id FROM public.financeiro_recorrencias WHERE id = c_regra)
     AND l.data_competencia = '2026-07-13' AND l.valor = 3773.13;
  IF (v_r ->> 'qtde') IS DISTINCT FROM '9' OR (v_p ->> 'ok') IS DISTINCT FROM 'true' OR v_n <> 10
     OR (SELECT ativo FROM public.financeiro_recorrencias WHERE id = c_regra) IS DISTINCT FROM false
     OR EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 WHERE recorrencia_id = c_regra AND NOT cancelado AND data_competencia >= '2026-09-01')
     OR v_resc_depois IS DISTINCT FROM v_resc_antes THEN
    RAISE EXCEPTION 'P154/Leandro: a conferência depois não bateu (% · % · % cancelados). Nada foi gravado.', v_r, v_p, v_n;
  END IF;
  RAISE NOTICE 'P154/Leandro OK: regra cancelada · 9 previstos (R$ 27.066,96) + o programado 09/2026 (R$ 2.877,31) cancelados · rescisão intocada';
END $$;
