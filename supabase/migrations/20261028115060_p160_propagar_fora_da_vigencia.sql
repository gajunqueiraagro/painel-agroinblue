-- P160 (Gabriel 28/10/2026 09:42, decisão A) — o Propagar AVISA quando a competência recalculada cai FORA da vigência; quem limpa é a porta
-- do P154 (`fn_recorrencia_fora_da_vigencia`), por último no salvar. Caso real: Santa Rita, 11/10 — trocar o pagamento do "dia 02 do mês
-- seguinte" para o "dia 29 do próprio mês" mudou o deslocamento de 1 para 0, o Propagar moveu cada competência +1 mês e a do vencimento
-- 02/07/2027 caiu em 07/2027, fora do fim 30/06/2027, sem aviso (limpa hoje com o OK do Gabriel).
-- ⚠ O CÁLCULO NÃO MUDA (`comp_nova = mês do vencimento − desloc`) e a gravação é a de sempre: a projeção de cada escopo ('futuros' e
--   'todos') ganha a chave `fora_da_vigencia` = os lançamentos cuja competência FINAL (a que o escopo grava) muda e cai antes do mês de
--   `data_inicio` ou depois do mês de `data_fim`: [{lancamento_id, venc, comp_antiga, comp_nova}].
-- ⚠ PATCH DE CORPO GRANDE GUARDADO POR md5 (20.493 caracteres): se o corpo não for o medido, NADA muda. Uma âncora, que casa 1 vez.
DO $$
DECLARE
  d text;
  v_anc constant text := E'      ''alteradas'', v_n,\n';
  v_novo constant text := E'      ''alteradas'', v_n,\n'
    || E'      -- P160: a competencia final que cai FORA da vigencia (antes do mes do inicio ou depois do mes do fim) — so\' aviso; quem limpa e\'\n'
    || E'      -- a porta do P154, por ultimo no salvar.\n'
    || E'      ''fora_da_vigencia'', (SELECT coalesce(jsonb_agg(jsonb_build_object(''lancamento_id'', f.lancamento_id, ''venc'', f.venc,\n'
    || E'                              ''comp_antiga'', f.comp_antiga, ''comp_nova'', f.k) ORDER BY f.venc), ''[]''::jsonb)\n'
    || E'                              FROM (SELECT c.lancamento_id, c.venc, c.comp_antiga,\n'
    || E'                                           (CASE WHEN v_e = ''todos'' THEN c.comp_fim_todos ELSE c.comp_fim_fut END) AS k\n'
    || E'                                      FROM _rec_prop_comp c) f\n'
    || E'                             WHERE f.k IS DISTINCT FROM f.comp_antiga\n'
    || E'                               AND (date_trunc(''month'', f.k) < date_trunc(''month'', v_r.data_inicio)\n'
    || E'                                    OR date_trunc(''month'', f.k) > date_trunc(''month'', v_r.data_fim))),\n';
BEGIN
  d := pg_get_functiondef('public.fn_recorrencia_propagar'::regproc);
  IF md5(d) <> '0325e4149fd54a43b0f46df5786be088' THEN
    RAISE EXCEPTION 'P160: fn_recorrencia_propagar não é a medida (md5 %). Nada foi gravado.', md5(d);
  END IF;
  IF (length(d) - length(replace(d, v_anc, ''))) / length(v_anc) <> 1 THEN
    RAISE EXCEPTION 'P160: a âncora não casa exatamente 1 vez. Nada foi gravado.';
  END IF;
  EXECUTE replace(d, v_anc, v_novo);
END $$;
