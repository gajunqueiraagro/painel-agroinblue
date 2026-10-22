-- CONC-SEM-TRAVA-01 (tela, mock aprovado 22/10 07h32) — o que a tela "Conciliar" precisa do banco:
--   · SOBRA (a): sugestoes do lancamento que falta (em aberto, qualquer data, mesma conta e direcao; o que FECHA EXATO primeiro, depois
--     o do favorecido do Pix); (b) previa com o saldo da OC depois.
--   · FALTA (a) `juntar_extrato`: sugestoes de movimentos do banco em aberto (mesma conta/direcao, ate' 60 dias; fecha exato primeiro,
--     depois o do mesmo favorecido) — a tela junta e simula de novo; (b) previa recebido / em aberto / vencimento;
--     (c) NOVO `desconto_na_oc`: so' com OC em conta corrente e o lancamento que fica aberto sendo dela — parcela o recebimento em
--     "o que entrou" + "a falta" (`oc_recebimento_gesto`), cancela a falta, lanca DESCONTO na OC (`oc_explicar_saldo`
--     'desconto_comercial') e liga exato. Trilha: os eventos da OC + `conciliacao_blocos.extras.desconto`; o desfazer do bloco tira a
--     explicacao e reativa a falta.
--   · As frases seguem o mock: "O banco tem R$ X e os lançamentos R$ Y. Escolha o destino da sobra." / "…o que fazer com a falta."

ALTER TABLE public.conciliacao_blocos ADD COLUMN IF NOT EXISTS extras jsonb;

DO $g$ BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_conc_diferenca(uuid[], uuid[])'::regprocedure) <> 'c47605a1849c426375174c84d81df85a' THEN
    RAISE EXCEPTION 'CONC-SEM-TRAVA-01 tela: _fn_conc_diferenca divergente';
  END IF;
END $g$;

CREATE OR REPLACE FUNCTION public._fn_conc_diferenca(p_extratos uuid[], p_lancamentos uuid[])
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_cli uuid; v_liq numeric := 0; v_sinal int; v_data date; v_hist text; v_soma_lan numeric := 0; v_dif numeric; v_sentido text;
  v_mod public.financeiro_lancamentos_v2; v_fav uuid; v_fav_origem text; v_ocs jsonb; v_oc jsonb; v_opcoes jsonb := '[]'::jsonb;
  v_frase text; v_desc_mod text; c_tol constant numeric := 0.005; r record; v_lado text;
  v_resta numeric; v_aloc jsonb := '[]'::jsonb; v_ultimo text; v_aberto numeric := 0; v_fora int := 0;
  v_conta uuid; v_fav_ext uuid; v_fav_ref uuid; v_sug jsonb; v_ultimo_id uuid; v_ultimo_venc date; c_janela constant int := 60;  -- CONC-SEM-TRAVA-01 tela
BEGIN
  IF coalesce(array_length(p_extratos, 1), 0) = 0 OR coalesce(array_length(p_lancamentos, 1), 0) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'vazio', 'mensagem', 'Escolha ao menos um extrato e um lançamento.');
  END IF;
  SELECT min(e.cliente_id::text)::uuid, sum(e.valor), max(e.data_movimento),
         (array_agg(e.descricao ORDER BY abs(e.valor) DESC, e.id))[1], min(e.conta_bancaria_id::text)::uuid
    INTO v_cli, v_liq, v_data, v_hist, v_conta
    FROM public.extrato_bancario_v2 e WHERE e.id = ANY (p_extratos);
  IF v_cli IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'extrato_nao_encontrado', 'mensagem', 'O extrato escolhido não existe mais.');
  END IF;
  IF (SELECT count(DISTINCT x.cli) FROM (SELECT e.cliente_id cli FROM public.extrato_bancario_v2 e WHERE e.id = ANY (p_extratos)
        UNION SELECT l.cliente_id FROM public.financeiro_lancamentos_v2 l WHERE l.id = ANY (p_lancamentos)) x) > 1 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'cliente_divergente', 'mensagem', 'Os itens escolhidos são de clientes diferentes.');
  END IF;
  IF abs(v_liq) <= c_tol THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'liquido_zero',
      'mensagem', 'Os extratos escolhidos se anulam (entrada e saída do mesmo valor): use o par de estorno.');
  END IF;
  v_sinal := sign(v_liq)::int;
  v_lado := CASE WHEN v_sinal > 0 THEN 'recebido' ELSE 'pago' END;
  -- o saldo livre de cada lancamento, com sinal pela direcao do liquido do banco (a mesma conta do bloco 'exato')
  FOR r IN SELECT l.*, abs(l.valor) - coalesce((SELECT sum(c.valor_aplicado) FROM public.conciliacao_bancaria_itens c
                                                  WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL), 0) AS livre
             FROM public.financeiro_lancamentos_v2 l WHERE l.id = ANY (p_lancamentos) AND l.cancelado IS NOT TRUE
             ORDER BY abs(l.valor) DESC, l.id LOOP
    v_soma_lan := v_soma_lan + r.livre * CASE WHEN (v_sinal < 0 AND r.sinal = '-1') OR (v_sinal > 0 AND r.sinal = '1') THEN 1 ELSE -1 END;
    IF v_mod.id IS NULL THEN v_mod := r; END IF;
  END LOOP;
  v_dif := round(abs(v_liq) - v_soma_lan, 2);
  v_sentido := CASE WHEN abs(v_dif) <= c_tol THEN 'igual' WHEN v_dif < 0 THEN 'a_menos' ELSE 'a_mais' END;
  v_desc_mod := coalesce(v_mod.descricao, 'lançamento');

  -- a OC envolvida (algum lancamento com parte viva)
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('operacao_id', o.id, 'tipo', o.tipo_operacao, 'modelo', o.modelo_financeiro,
           'status', o.status_comercial, 'versao', o.versao)), '[]'::jsonb)
    INTO v_ocs
    FROM public.zoo_operacao_partes pt JOIN public.zoo_operacoes_comerciais o ON o.id = pt.operacao_id
   WHERE pt.financeiro_lancamento_id = ANY (p_lancamentos) AND pt.cancelada = false;
  SELECT x INTO v_oc FROM jsonb_array_elements(v_ocs) x
   WHERE x->>'modelo' = 'conta_corrente' AND x->>'status' <> 'cancelada' LIMIT 1;

  v_fav := public._fn_conc_favorecido_do_extrato(v_cli, v_hist);
  v_fav_ext := v_fav;
  v_fav_ref := coalesce(v_fav, v_mod.favorecido_id);
  v_fav_origem := CASE WHEN v_fav IS NOT NULL THEN 'extrato' ELSE 'lancamento' END;
  v_fav := coalesce(v_fav, v_mod.favorecido_id);

  IF v_sentido = 'igual' THEN
    v_frase := format('O banco e os lançamentos batem: %s.', public._fn_conc_brl(v_liq));
    v_opcoes := jsonb_build_array(jsonb_build_object('codigo', 'ligar', 'rpc', 'fn_conc_ligar_com_diferenca',
      'frase', 'Ligar os lançamentos ao extrato.'));
  ELSIF v_sentido = 'a_menos' THEN
    v_frase := format('O banco tem %s e os lançamentos %s. Escolha o que fazer com a falta.', public._fn_conc_brl(v_liq), public._fn_conc_brl(v_soma_lan));
    -- a alocacao do bloco 'mais antigo primeiro' (a mesma ordem dele): so' entram os lancamentos que recebem; o ultimo fica com o
    -- que falta em aberto; os que nao recebem nada ficam como estao
    v_resta := abs(v_liq);
    FOR r IN SELECT l.id, l.descricao, abs(l.valor) - coalesce((SELECT sum(c.valor_aplicado) FROM public.conciliacao_bancaria_itens c
                                                  WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL), 0) AS livre
               FROM public.financeiro_lancamentos_v2 l WHERE l.id = ANY (p_lancamentos) AND l.cancelado IS NOT TRUE
              ORDER BY l.data_competencia NULLS LAST, l.data_vencimento NULLS LAST, l.created_at NULLS LAST, abs(l.valor) DESC, l.id LOOP
      IF v_resta <= c_tol THEN v_fora := v_fora + 1; CONTINUE; END IF;
      v_aloc := v_aloc || jsonb_build_object('lancamento_id', r.id, 'descricao', r.descricao, 'aplica', least(r.livre, v_resta),
                                              'fica_aberto', greatest(r.livre - v_resta, 0));
      IF r.livre > v_resta THEN v_ultimo := r.descricao; v_aberto := r.livre - v_resta; v_ultimo_id := r.id; END IF;
      v_resta := v_resta - least(r.livre, v_resta);
    END LOOP;
    v_opcoes := jsonb_build_array(jsonb_build_object('codigo', 'ligar_com_falta', 'rpc', 'fn_conc_ligar_com_diferenca', 'alocacao', v_aloc,
      'frase', format('Ligar o que entrou%s%s.', CASE WHEN v_ultimo IS NULL THEN ' (os lançamentos que recebem fecham inteiros)'
          ELSE format(': "%s" fica com %s em aberto', v_ultimo, public._fn_conc_brl(v_aberto)) END,
        CASE WHEN v_fora = 0 THEN '' WHEN v_fora = 1 THEN '; 1 lançamento não recebe nada agora e continua em aberto'
             ELSE format('; %s lançamentos não recebem nada agora e continuam em aberto', v_fora) END),
      'previa', jsonb_build_object('recebido', round(abs(v_liq), 2), 'em_aberto', round(abs(v_dif), 2), 'lancamento_aberto', v_ultimo,
        'vencimento', (SELECT coalesce(l.data_vencimento, l.data_competencia) FROM public.financeiro_lancamentos_v2 l WHERE l.id = v_ultimo_id))));
    -- (a) juntar outro extrato: em aberto, mesma conta e direcao, ate' 60 dias; o que fecha exato primeiro, depois o do mesmo favorecido
    SELECT coalesce(jsonb_agg(x ORDER BY (x->>'fecha_exato')::boolean DESC, (x->>'mesmo_favorecido')::boolean DESC, (x->>'distancia')::int), '[]'::jsonb)
      INTO v_sug
      FROM (SELECT jsonb_build_object('extrato_id', e.id, 'data', e.data_movimento, 'descricao', e.descricao, 'valor', abs(e.valor),
                     'fecha_exato', abs(abs(e.valor) - abs(v_dif)) <= c_tol,
                     'mesmo_favorecido', v_fav_ext IS NOT NULL AND public._fn_conc_favorecido_do_extrato(v_cli, e.descricao) = v_fav_ext,
                     'distancia', abs(e.data_movimento - v_data)) AS x
              FROM public.extrato_bancario_v2 e
             WHERE e.cliente_id = v_cli AND e.conta_bancaria_id = v_conta AND sign(e.valor) = v_sinal AND NOT (e.id = ANY (p_extratos))
               AND e.cancelado_em IS NULL AND e.ignorado_em IS NULL AND abs(e.data_movimento - v_data) <= c_janela
               AND NOT EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens c WHERE c.extrato_id = e.id AND c.desfeito_em IS NULL)
               AND (abs(abs(e.valor) - abs(v_dif)) <= c_tol
                    OR (v_fav_ext IS NOT NULL AND public._fn_conc_favorecido_do_extrato(v_cli, e.descricao) = v_fav_ext))
             ORDER BY abs(abs(e.valor) - abs(v_dif)), abs(e.data_movimento - v_data) LIMIT 6) s;
    v_opcoes := jsonb_build_array(jsonb_build_object('codigo', 'juntar_extrato', 'rpc', 'fn_conc_simular_diferenca', 'sugestoes', v_sug,
      'frase', format('Juntar outro movimento do banco (%s): os em aberto da mesma conta, o que fecha exato primeiro.', public._fn_conc_brl(v_dif))))
      || v_opcoes;
    -- (c) desconto ou abatimento na OC: so' com OC em conta corrente e com o lancamento que fica aberto sendo dela
    IF v_oc IS NOT NULL AND v_ultimo_id IS NOT NULL AND v_fora = 0 AND EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt
         WHERE pt.financeiro_lancamento_id = v_ultimo_id AND pt.cancelada = false AND pt.operacao_id = (v_oc->>'operacao_id')::uuid) THEN
      v_opcoes := v_opcoes || jsonb_build_object('codigo', 'desconto_na_oc', 'rpc', 'fn_conc_ligar_com_diferenca', 'operacao_id', v_oc->>'operacao_id',
        'frase', format('Lançar %s de desconto na operação comercial e quitar "%s".', public._fn_conc_brl(v_aberto), v_ultimo),
        'previa', jsonb_build_object('operacao_id', v_oc->>'operacao_id', 'desconto', round(v_aberto, 2), 'lancamento_id', v_ultimo_id,
          'lancamento', v_ultimo, 'recebido', round(abs(v_liq), 2)));
    END IF;
  ELSE
    v_frase := format('O banco tem %s e os lançamentos %s. Escolha o destino da sobra.', public._fn_conc_brl(v_liq), public._fn_conc_brl(v_soma_lan));
    -- (a) as sugestoes: em aberto (qualquer data, inclusive futura), mesma conta e direcao; o que fecha exato primeiro, depois o do favorecido
    SELECT coalesce(jsonb_agg(x ORDER BY (x->>'fecha_exato')::boolean DESC, (x->>'mesmo_favorecido')::boolean DESC, (x->>'distancia')::numeric), '[]'::jsonb)
      INTO v_sug
      FROM (SELECT jsonb_build_object('lancamento_id', l.id, 'descricao', l.descricao, 'data', coalesce(l.data_vencimento, l.data_competencia),
                     'valor', l.livre, 'status', l.status_transacao, 'fecha_exato', abs(l.livre - v_dif) <= c_tol,
                     'mesmo_favorecido', l.favorecido_id IS NOT DISTINCT FROM v_fav_ref, 'distancia', abs(l.livre - v_dif),
                     'parcela', (SELECT pt.sequencia_parcela || '/' || pt.quantidade_parcelas FROM public.zoo_operacao_partes pt
                                  WHERE pt.financeiro_lancamento_id = l.id AND pt.cancelada = false LIMIT 1),
                     'operacao_id', (SELECT pt.operacao_id FROM public.zoo_operacao_partes pt
                                      WHERE pt.financeiro_lancamento_id = l.id AND pt.cancelada = false LIMIT 1)) AS x
              FROM (SELECT l.*, abs(l.valor) - coalesce((SELECT sum(c.valor_aplicado) FROM public.conciliacao_bancaria_itens c
                                                           WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL), 0) AS livre
                      FROM public.financeiro_lancamentos_v2 l
                     WHERE l.cliente_id = v_cli AND l.cancelado IS NOT TRUE AND coalesce(l.cenario, 'realizado') <> 'meta'
                       AND l.conta_efetiva_id = v_conta AND l.sinal = CASE WHEN v_sinal > 0 THEN '1' ELSE '-1' END
                       AND NOT (l.id = ANY (p_lancamentos)) AND l.status_transacao NOT IN ('realizado', 'conciliado')) l
             WHERE l.livre > c_tol AND (l.favorecido_id IS NOT DISTINCT FROM v_fav_ref OR abs(l.livre - v_dif) <= c_tol)
             ORDER BY abs(l.livre - v_dif), l.data_vencimento LIMIT 6) s;
    v_opcoes := jsonb_build_array(jsonb_build_object('codigo', 'acrescentar_lancamento', 'rpc', 'fn_conc_buscar_para_ligar', 'sugestoes', v_sug,
      'frase', format('Acrescentar o lançamento que falta (%s): busca por descrição, favorecido ou valor, em qualquer data, inclusive futura.',
        public._fn_conc_brl(v_dif))));
    IF v_oc IS NOT NULL THEN
      v_opcoes := v_opcoes || jsonb_build_object('codigo', 'sobra_na_oc', 'rpc', 'fn_conc_ligar_com_diferenca', 'operacao_id', v_oc->>'operacao_id',
        'previa', jsonb_build_object('operacao_id', v_oc->>'operacao_id', 'valor', v_dif,
          'saldo_depois', round(coalesce((public.oc_conta_corrente((v_oc->>'operacao_id')::uuid)->>'saldo')::numeric, 0) + v_dif, 2)),
        'frase', format('Lançar a sobra de %s na operação comercial como %s; o saldo da operação absorve.', public._fn_conc_brl(v_dif),
          CASE WHEN v_oc->>'tipo' = 'compra' THEN 'pagamento a mais ao vendedor' ELSE 'recebimento a mais (adiantamento do comprador)' END));
    END IF;
    v_opcoes := v_opcoes || jsonb_build_object('codigo', 'criar_diferenca', 'rpc', 'fn_conc_ligar_com_diferenca',
      'frase', format('Criar o lançamento da diferença: %s em %s, na conta de "%s"%s.', public._fn_conc_brl(v_dif), to_char(v_data, 'DD/MM/YYYY'),
        coalesce(v_mod.subcentro, 'sem classificação'),
        CASE WHEN v_fav IS NULL THEN ', sem favorecido' WHEN v_fav_origem = 'extrato' THEN ', favorecido do extrato' ELSE ', favorecido do lançamento original' END),
      'previa', jsonb_build_object('valor', v_dif, 'data', v_data, 'favorecido_id', v_fav, 'favorecido_origem', v_fav_origem,
        'plano_conta_id', v_mod.plano_conta_id, 'subcentro', v_mod.subcentro, 'modelo_id', v_mod.id,
        'descricao', format('Diferença do extrato de %s · %s', to_char(v_data, 'DD/MM/YYYY'), v_desc_mod)));
  END IF;

  RETURN jsonb_build_object('ok', true, 'cliente_id', v_cli, 'direcao', CASE WHEN v_sinal > 0 THEN 'entrada' ELSE 'saida' END,
    'data_extrato', v_data, 'soma_extratos', round(abs(v_liq), 2), 'soma_lancamentos', round(v_soma_lan, 2), 'diferenca', v_dif,
    'sentido', v_sentido, 'ocs', v_ocs, 'frase', v_frase, 'opcoes', v_opcoes, 'favorecido_extrato_id', v_fav_ext);
END
$function$;

DO $confere$
BEGIN
  IF position('juntar_extrato' in pg_get_functiondef('public._fn_conc_diferenca(uuid[], uuid[])'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'CONC-SEM-TRAVA-01 tela: conferencia final falhou';
  END IF;
END $confere$;
