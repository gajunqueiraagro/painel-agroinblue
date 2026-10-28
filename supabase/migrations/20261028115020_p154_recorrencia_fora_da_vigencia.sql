-- P154 (Gabriel 28/10/2026; decisões D1/D2 08:06) — recorrência ENCURTADA ou CANCELADA limpa os PREVISTOS que ficaram fora da vigência.
-- Era a dívida REC-VIGENCIA-ENCURTADA-01 (11/10): salvar a regra com o fim mais cedo e cancelar a regra deixavam vivos os lançamentos
-- gerados depois — caso real: NJ, Leandro Soares Meira, rescisão em 13/07/2026 e a folha prevista até 06/2027.
--
-- UMA PORTA, simular e aplicar pela MESMA chamada (`p_simular`):
--   fn_recorrencia_fora_da_vigencia(p_recorrencia_id, p_cancelar_regra, p_motivo, p_simular DEFAULT true) -> jsonb
-- · "FORA": regra ATIVA e sem cancelar  -> competência (mês) antes do mês do início OU depois do mês do fim (vigência encurtada);
--           ao CANCELAR a regra (ou regra já cancelada) -> competência >= o mês do cancelamento (D1; o da regra já cancelada é o mês do
--           `updated_at`, que o cancelar grava).
-- · CANCELA: só o PREVISTO vivo, fora de mês fechado (a regra do Gerar: cliente + mês da competência). O "valor do mês" ajustado
--   também (D2) — listado com a marca `valor_do_mes`. Cancelar = `cancelado`, `cancelado_em`, `cancelado_por`, `cancelado_motivo`
--   (o padrão de `fn_cancelar_lancamento_auditoria`); `app.motivo` vai para a Auditoria. NADA SE APAGA. O cancelado continua
--   OCUPANDO a competência (`_fn_recorrencia_vagas`): o Gerar não o recria.
-- · NÃO MEXE, e diz por quê: programado, agendado, realizado, conciliado (status ou vínculo vivo com o extrato) e o previsto em mês fechado.
-- · Com `p_cancelar_regra`, a regra fica `ativo = false` NA MESMA TRANSAÇÃO (o que `fn_recorrencia_cancelar` faz).
-- Nasce FECHADA: SECURITY DEFINER, `tenant_ok` do cliente da regra (42501), REVOKE de PUBLIC/anon, GRANT só a `authenticated`.
CREATE OR REPLACE FUNCTION public.fn_recorrencia_fora_da_vigencia(
  p_recorrencia_id uuid, p_cancelar_regra boolean DEFAULT false, p_motivo text DEFAULT NULL, p_simular boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_r public.financeiro_recorrencias;
  v_modo text; v_corte date; v_ini date; v_fim date;
  v_cancela jsonb; v_nao_mexe jsonb; v_ids uuid[]; v_soma numeric; v_n int; v_motivo text;
BEGIN
  SELECT * INTO v_r FROM public.financeiro_recorrencias WHERE id = p_recorrencia_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recorrência não encontrada. Nada foi gravado.' USING ERRCODE = 'P0002'; END IF;
  IF NOT coalesce(public.tenant_ok(v_r.cliente_id), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;

  IF coalesce(p_cancelar_regra, false) OR NOT v_r.ativo THEN
    v_modo := 'cancelada';
    v_corte := date_trunc('month', CASE WHEN v_r.ativo THEN now() ELSE coalesce(v_r.updated_at, now()) END)::date;
  ELSE
    v_modo := 'encurtada';
    v_ini := date_trunc('month', v_r.data_inicio)::date;
    v_fim := date_trunc('month', v_r.data_fim)::date;
  END IF;

  WITH fora AS (
    SELECT l.id, l.data_competencia, l.data_vencimento, l.valor, l.status_transacao, l.valor_do_mes_em IS NOT NULL AS valor_do_mes,
           EXISTS (SELECT 1 FROM public.financeiro_fechamentos ff
                    WHERE ff.cliente_id = l.cliente_id AND ff.status_fechamento = 'fechado'
                      AND ff.ano_mes = to_char(l.data_competencia, 'YYYY-MM')) AS mes_fechado,
           (l.status_transacao = 'conciliado' OR l.conciliado_em IS NOT NULL
             OR EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens ci WHERE ci.lancamento_id = l.id AND ci.desfeito_em IS NULL)) AS conciliado
      FROM public.financeiro_lancamentos_v2 l
     WHERE l.recorrencia_id = v_r.id AND coalesce(l.cancelado, false) = false
       AND CASE WHEN v_modo = 'cancelada' THEN date_trunc('month', l.data_competencia)::date >= v_corte
                ELSE date_trunc('month', l.data_competencia)::date < v_ini OR date_trunc('month', l.data_competencia)::date > v_fim END
  ), classe AS (
    SELECT f.*, CASE WHEN f.conciliado THEN 'conciliado: só à mão'
                     WHEN f.status_transacao IS DISTINCT FROM 'previsto' THEN coalesce(f.status_transacao, 'sem status') || ': só à mão'
                     WHEN f.mes_fechado THEN 'mês fechado'
                END AS motivo
      FROM fora f
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'competencia', data_competencia, 'vencimento', data_vencimento, 'valor', valor,
                    'status', status_transacao, 'valor_do_mes', valor_do_mes) ORDER BY data_competencia, id) FILTER (WHERE motivo IS NULL), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('id', id, 'competencia', data_competencia, 'vencimento', data_vencimento, 'valor', valor,
                    'status', status_transacao, 'valor_do_mes', valor_do_mes, 'motivo', motivo) ORDER BY data_competencia, id) FILTER (WHERE motivo IS NOT NULL), '[]'::jsonb),
         coalesce(array_agg(id ORDER BY id) FILTER (WHERE motivo IS NULL), '{}'::uuid[]),
         round(coalesce(sum(valor) FILTER (WHERE motivo IS NULL), 0), 2)
    INTO v_cancela, v_nao_mexe, v_ids, v_soma
    FROM classe;
  v_n := cardinality(v_ids);

  IF NOT coalesce(p_simular, true) THEN
    v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
    IF v_motivo IS NULL THEN
      v_motivo := 'recorrência encerrada em ' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY');
    END IF;
    PERFORM set_config('app.motivo', v_motivo, true);
    IF coalesce(p_cancelar_regra, false) AND v_r.ativo THEN
      UPDATE public.financeiro_recorrencias SET ativo = false, updated_at = now(), updated_by = v_uid WHERE id = v_r.id;
    END IF;
    IF v_n > 0 THEN
      UPDATE public.financeiro_lancamentos_v2
         SET cancelado = true, cancelado_em = now(), cancelado_por = v_uid, cancelado_motivo = v_motivo
       WHERE id = ANY (v_ids) AND recorrencia_id = v_r.id AND coalesce(cancelado, false) = false AND status_transacao = 'previsto';
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n <> cardinality(v_ids) THEN
        RAISE EXCEPTION 'Os lançamentos mudaram durante a gravação (% de %). Nada foi gravado.', v_n, cardinality(v_ids);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'simulado', coalesce(p_simular, true), 'modo', v_modo,
    'corte', CASE WHEN v_modo = 'cancelada' THEN to_char(v_corte, 'YYYY-MM') END,
    'vigencia', CASE WHEN v_modo = 'encurtada' THEN jsonb_build_object('de', to_char(v_ini, 'YYYY-MM'), 'ate', to_char(v_fim, 'YYYY-MM')) END,
    'regra_cancelada', coalesce(p_cancelar_regra, false) AND NOT coalesce(p_simular, true),
    'cancela', v_cancela, 'qtde', cardinality(v_ids), 'soma', v_soma,
    'nao_mexe', v_nao_mexe, 'motivo', CASE WHEN coalesce(p_simular, true) THEN NULL ELSE v_motivo END);
END
$function$;

REVOKE ALL ON FUNCTION public.fn_recorrencia_fora_da_vigencia(uuid, boolean, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_recorrencia_fora_da_vigencia(uuid, boolean, text, boolean) TO authenticated;
