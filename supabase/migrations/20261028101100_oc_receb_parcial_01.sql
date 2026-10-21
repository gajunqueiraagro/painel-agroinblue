-- OC-RECEB-PARCIAL-01 (Gabriel, 21/10/2026) — titulo de OC conciliado por MENOS que o valor: divide pela PROPRIA OC.
-- Caso real: Santa Rita, OC de venda 64c0e240 (50 Desmama F, R$ 150.000 entregue); o Pix de 04/09 de R$ 100.000 ligado pelo bloco
-- "mais antigo primeiro" ao titulo 8f53e3eb (Receb. 1/1, R$ 150.000) deixava o titulo PROGRAMADO e conciliado ao mesmo tempo: a OC
-- mostrava "Recebido R$ 0,00 / falta R$ 150.000", a Conferencia uma linha "— ✓" de 100.000 e o titulo cheio solto ao lado.
--
-- (1) O NUCLEO da baixa no vinculo (`_fn_conc_baixa_no_vinculo`, CONC-BAIXA-NO-VINCULO-01) ganha o ramo do TITULO DE OC com parcela
--     de programacao: a parcela da programacao se divide — a parcela do titulo fica com o valor ligado (parte e titulo idem; titulo
--     realizado na data do ultimo extrato vivo, ligado a ele) e nasce a parcela seguinte com a FALTA, vencimento = o original, que se
--     MATERIALIZA pelo dono de sempre (`oc_materializar_programacao`: parte + titulo programado). A quantidade do grupo e' renumerada
--     (`_oc_renumerar_parcelas_do_grupo`): "Receb. 1/2" e "Receb. 2/2". O compromisso nao muda (a soma das parcelas e' a mesma).
--     A liquidacao automatica da OC acompanha o titulo 1/2 (realizado = o valor dele). Trilha: `financeiro_baixas_no_vinculo`
--     (divisao, com as parcelas/partes no `depois`) + `zoo_operacao_eventos` ('dividir_recebimento_parcial').
--     Titulo de OC SEM parcela de programacao (parte 'manual'/'negociacao'/'documento'): nao ha onde dividir — o parcial RECUSA com
--     frase pronta (programar o recebimento na OC). Medido 21/10: 7 titulos de OC abertos assim; nenhum com vinculo parcial.
-- (2) A TRAVA do fim da transacao deixa de ter excecao: titulo de OC ligado tambem exige baixa.
-- (3) DESFAZER JUNTA: a parcela/parte/titulo 2/2 ainda em aberto e' cancelada e a 1/2 volta ao valor de antes; 2/2 ja' recebida recusa.
-- (4) A PROMOCAO IMEDIATA (`fn_promover_lancamento_realizado_ao_conciliar`) so' promove quem ficou INTEIRO: o parcial espera o fim da
--     transacao (o nucleo divide e da' a baixa) — senao o "antes" da divisao guardaria um realizado que nunca existiu e o desfazer
--     devolveria o titulo realizado sem dinheiro.
-- (5) O 1:1 (`fn_vincular_extrato_lancamento`) deixa de recusar o parcial de OC (a recusa mandava ao bloco, que deixava mudo); o
--     "Casar com o banco" (`fn_espelho_casar`) deixa de reescrever o VALOR de titulo de OC (encolheria o titulo e a OC).
-- Trocas guardadas pelo md5 de ORIGEM.

SET LOCAL lock_timeout = '3s';

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_conc_baixa_no_vinculo(uuid, text, text)'::regprocedure) <> '31361340d38005a36518d6a22a1a6328'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_trg_conc_baixa_no_vinculo()'::regprocedure) <> 'a7e9ebc0aeb8f19933f6ea0d7c3088f6'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_trg_conc_juntar_ao_desfazer()'::regprocedure) <> '5df61396d02367b191c07d15fcf7200d'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_promover_lancamento_realizado_ao_conciliar()'::regprocedure) <> '7d5e2ed32238fdfcbb7342cd85eab68f' THEN
    RAISE EXCEPTION 'OC-RECEB-PARCIAL-01: corpo de origem divergente (nucleo, gatilho adiado, juncao ou promocao)';
  END IF;
END $guarda$;

CREATE FUNCTION pg_temp._trocar(p_fn regprocedure, p_md5 text, p_trocas text[]) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_def text; i int;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p_fn) <> p_md5 THEN
    RAISE EXCEPTION 'OC-RECEB-PARCIAL-01: corpo de origem de % divergente', p_fn;
  END IF;
  v_def := pg_get_functiondef(p_fn);
  FOR i IN 1 .. array_length(p_trocas, 1) / 2 LOOP
    IF (length(v_def) - length(replace(v_def, p_trocas[2 * i - 1], ''))) / length(p_trocas[2 * i - 1]) <> 1 THEN
      RAISE EXCEPTION 'OC-RECEB-PARCIAL-01: trecho % de % nao achado uma vez', i, p_fn;
    END IF;
    v_def := replace(v_def, p_trocas[2 * i - 1], p_trocas[2 * i]);
  END LOOP;
  EXECUTE v_def;
END $f$;

-- ═══════════════════ 4. A PROMOCAO IMEDIATA SO' DO INTEIRO ═══════════════════
CREATE OR REPLACE FUNCTION public.fn_promover_lancamento_realizado_ao_conciliar()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  -- CONC-BLOCOS-01: o motor de blocos (fn_conciliar_bloco) liga este desvio enquanto grava os vinculos e promove ELE
  -- MESMO, so' o lancamento QUITADO, com a data do extrato que quitou. Os caminhos 1:1 e 1:N nao ligam o desvio:
  -- para eles nada muda (promove no 1o vinculo, como sempre).
  IF coalesce(current_setting('app.conciliar_bloco', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;
  -- CONC-BAIXA-NO-VINCULO-01: PREVISTO tambem da' baixa. OC-RECEB-PARCIAL-01: so' o lancamento que ficou INTEIRO (o aplicado vivo
  -- cobre o valor); o parcial espera o fim da transacao, onde o nucleo `_fn_conc_baixa_no_vinculo` divide e da' a baixa.
  UPDATE public.financeiro_lancamentos_v2 l
  SET status_transacao = 'realizado',
      data_pagamento   = COALESCE(data_pagamento, NEW.snapshot_extrato_data),
      updated_at       = now()
  WHERE id = NEW.lancamento_id
    AND status_transacao IN ('previsto','programado','agendado')
    AND cancelado IS NOT TRUE
    AND COALESCE(cenario, 'realizado') <> 'meta'
    AND (l.tipo_operacao LIKE '3-%' OR public._fn_lancamento_aplicado_vivo(l.id) >= abs(l.valor) - 0.005);
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_promover_lancamento_realizado_ao_conciliar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_promover_lancamento_realizado_ao_conciliar() TO authenticated, service_role;

-- ═══════════════════ 1. O NUCLEO: + O RAMO DO TITULO DE OC ═══════════════════
CREATE OR REPLACE FUNCTION public._fn_conc_baixa_no_vinculo(p_lancamento_id uuid, p_origem text, p_motivo text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $function$
DECLARE
  l public.financeiro_lancamentos_v2; v_ap numeric; v_data date; v_n int; v_total numeric; v_saldo numeric; v_sinal numeric;
  v_oc boolean; v_fin boolean; v_irmao uuid := gen_random_uuid(); v_cols text; v_vals text; v_antes jsonb; v_uid uuid := auth.uid();
  v_obs text;
  -- OC-RECEB-PARCIAL-01
  v_pt public.zoo_operacao_partes; v_pp public.zoo_operacao_parcelas_programacao; v_op public.zoo_operacoes_comerciais;
  v_pp2 uuid; v_seq int; v_mat jsonb; v_pt2 uuid; v_tit2 uuid;
BEGIN
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento_id FOR UPDATE;
  IF NOT FOUND OR l.cancelado IS TRUE OR coalesce(l.cenario, 'realizado') = 'meta' THEN
    RETURN jsonb_build_object('acao', 'nada');
  END IF;
  SELECT coalesce(sum(c.valor_aplicado), 0), max(e.data_movimento), count(*) INTO v_ap, v_data, v_n
    FROM public.conciliacao_bancaria_itens c JOIN public.extrato_bancario_v2 e ON e.id = c.extrato_id
   WHERE c.lancamento_id = p_lancamento_id AND c.desfeito_em IS NULL;
  IF v_n = 0 THEN RETURN jsonb_build_object('acao', 'nada'); END IF;
  v_total := abs(l.valor);
  v_sinal := CASE WHEN l.valor < 0 THEN -1 ELSE 1 END;
  SELECT * INTO v_pt FROM public.zoo_operacao_partes pt WHERE pt.financeiro_lancamento_id = l.id AND pt.cancelada IS NOT TRUE LIMIT 1;
  v_oc := v_pt.id IS NOT NULL;
  v_fin := l.financiamento_id IS NOT NULL OR EXISTS (SELECT 1 FROM public.financiamento_parcelas fp
                                                      WHERE l.id IN (fp.lancamento_id, fp.lancamento_juros_id));
  v_antes := jsonb_build_object('valor', l.valor, 'status_transacao', l.status_transacao, 'data_pagamento', l.data_pagamento,
                                'conciliado_em', l.conciliado_em);

  -- PARCIAL EM TITULO DE OC: divide pela parcela da programacao da propria OC (OC-RECEB-PARCIAL-01)
  IF v_oc AND l.tipo_operacao NOT LIKE '3-%' AND v_ap > 0 AND v_ap < v_total - 0.005 THEN
    IF v_pt.origem <> 'programacao' OR v_pt.programacao_parcela_id IS NULL THEN
      RAISE EXCEPTION 'Este recebimento da operação comercial não tem parcelas programadas, e não dá para receber só uma parte dele. Programe o recebimento na operação (Financeiro › Programar) e ligue de novo. Nada foi gravado.'
        USING ERRCODE = 'P0001', DETAIL = l.id::text;
    END IF;
    SELECT * INTO v_pp FROM public.zoo_operacao_parcelas_programacao WHERE id = v_pt.programacao_parcela_id FOR UPDATE;
    SELECT o.* INTO v_op FROM public.zoo_operacoes_comerciais o WHERE o.id = v_pt.operacao_id;
    v_saldo := round(v_total - v_ap, 2);
    -- a parcela seguinte, com a falta e o vencimento original
    SELECT coalesce(max(sequencia), 0) + 1 INTO v_seq FROM public.zoo_operacao_parcelas_programacao WHERE programacao_id = v_pp.programacao_id;
    INSERT INTO public.zoo_operacao_parcelas_programacao (cliente_id, programacao_id, sequencia, valor, vencimento, conta_bancaria_id, forma, status)
    VALUES (v_pp.cliente_id, v_pp.programacao_id, v_seq, v_saldo, v_pp.vencimento, v_pp.conta_bancaria_id, v_pp.forma, 'prevista')
    RETURNING id INTO v_pp2;
    -- a parcela, a parte e o titulo de agora ficam com o valor ligado; o titulo recebe a baixa
    UPDATE public.zoo_operacao_parcelas_programacao SET valor = round(v_ap, 2), updated_at = now() WHERE id = v_pp.id;
    UPDATE public.zoo_operacao_partes SET valor = round(v_ap, 2), updated_at = now() WHERE id = v_pt.id;
    PERFORM set_config('app.conc_dividindo', 'on', true);
    UPDATE public.financeiro_lancamentos_v2
       SET valor = v_sinal * round(v_ap, 2),
           status_transacao = CASE WHEN status_transacao IN ('realizado', 'conciliado') THEN status_transacao ELSE 'realizado' END,
           data_pagamento = coalesce(data_pagamento, v_data),
           updated_at = now(), updated_by = coalesce(v_uid, updated_by)
     WHERE id = l.id;
    PERFORM set_config('app.conc_dividindo', 'off', true);
    -- a falta nasce pelo dono de sempre (parte + titulo programado)
    v_mat := public.oc_materializar_programacao(v_op.id, (SELECT versao FROM public.zoo_operacoes_comerciais WHERE id = v_op.id),
                                                v_pp.programacao_id, v_pp2);
    v_pt2 := (v_mat->'parte'->>'id')::uuid; v_tit2 := (v_mat->'titulo'->>'id')::uuid;
    UPDATE public.financeiro_lancamentos_v2 SET saldo_de_id = l.id WHERE id = v_tit2;
    PERFORM public._oc_renumerar_parcelas_do_grupo(v_pt.id);
    INSERT INTO public.financeiro_baixas_no_vinculo (cliente_id, tipo, lancamento_id, irmao_id, valor_original, valor_aplicado, valor_saldo,
        antes, depois, origem, motivo, feita_por)
    SELECT l.cliente_id, 'divisao', l.id, v_tit2, l.valor, v_sinal * round(v_ap, 2), v_sinal * v_saldo,
           v_antes || jsonb_build_object('oc', true, 'parcela_id', v_pp.id, 'parcela_valor', v_pp.valor, 'parte_id', v_pt.id, 'parte_valor', v_pt.valor),
           jsonb_build_object('valor', x.valor, 'status_transacao', x.status_transacao, 'data_pagamento', x.data_pagamento,
                              'oc', true, 'operacao_id', v_op.id, 'parcela2_id', v_pp2, 'parte2_id', v_pt2, 'titulo2_id', v_tit2),
           p_origem, p_motivo, v_uid
      FROM public.financeiro_lancamentos_v2 x WHERE x.id = l.id;
    INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
    VALUES (l.cliente_id, v_op.id, 'dividir_recebimento_parcial',
            jsonb_build_object('titulo_id', l.id, 'aplicado', round(v_ap, 2), 'falta', v_saldo, 'data_pagamento', coalesce(l.data_pagamento, v_data),
                               'parcela_id', v_pp.id, 'parcela2_id', v_pp2, 'parte2_id', v_pt2, 'titulo2_id', v_tit2, 'motivo', p_motivo),
            v_uid, 'rpc');
    RETURN jsonb_build_object('acao', 'divisao', 'oc', true, 'lancamento_id', l.id, 'irmao_id', v_tit2, 'aplicado', round(v_ap, 2),
                              'saldo', v_saldo, 'data_pagamento', coalesce(l.data_pagamento, v_data), 'parcela2_id', v_pp2);
  END IF;

  -- PARCIAL elegivel (fora de OC): divide
  IF l.tipo_operacao NOT LIKE '3-%' AND NOT v_oc AND NOT v_fin AND v_ap > 0 AND v_ap < v_total - 0.005 THEN
    v_saldo := round(v_total - v_ap, 2);
    v_obs := format('Saldo de %s do lançamento %s (vínculo parcial com o extrato de %s).',
                    public._fn_oc_brl(v_saldo), l.id, public._fn_oc_data(v_data));
    -- o irmao: copia de todas as colunas gravaveis, com as trocas abaixo (a coluna gerada fica de fora)
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum),
           string_agg(CASE a.attname
             WHEN 'id' THEN '$1' WHEN 'valor' THEN '$3' WHEN 'saldo_de_id' THEN '$2' WHEN 'observacao' THEN '$4'
             WHEN 'created_by' THEN '$5' WHEN 'updated_by' THEN '$5'
             WHEN 'status_transacao' THEN '''programado''' WHEN 'data_pagamento' THEN 'NULL' WHEN 'conciliado_em' THEN 'NULL'
             WHEN 'created_at' THEN 'now()' WHEN 'updated_at' THEN 'now()'
             WHEN 'hash_importacao' THEN 'NULL' WHEN 'lote_importacao_id' THEN 'NULL' WHEN 'staging_id' THEN 'NULL'
             WHEN 'duplicado_de_id' THEN 'NULL' WHEN 'status_duplicidade' THEN 'NULL' WHEN 'nivel_duplicidade' THEN 'NULL'
             WHEN 'importado_duplicado' THEN 'false' WHEN 'editado_manual' THEN 'false'
             WHEN 'orfao_definitivo' THEN 'false' WHEN 'orfao_definitivo_motivo' THEN 'NULL' WHEN 'orfao_definitivo_por' THEN 'NULL'
             WHEN 'orfao_definitivo_em' THEN 'NULL' WHEN 'cancelado' THEN 'false' WHEN 'cancelado_em' THEN 'NULL'
             WHEN 'cancelado_por' THEN 'NULL' WHEN 'cancelado_motivo' THEN 'NULL' WHEN 'transferencia_grupo_id' THEN 'NULL'
             -- uniq_lanc_recorrencia_competencia: uma recorrencia viva por competencia — o irmao fica preso ao original, nao a ela
             WHEN 'data_vencimento' THEN 'data_vencimento' WHEN 'recorrencia_id' THEN 'NULL' WHEN 'valor_do_mes_em' THEN 'NULL' WHEN 'valor_do_mes_origem' THEN 'NULL'
             ELSE quote_ident(a.attname) END, ', ' ORDER BY a.attnum)
      INTO v_cols, v_vals
      FROM pg_attribute a
     WHERE a.attrelid = 'public.financeiro_lancamentos_v2'::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '';
    EXECUTE format('INSERT INTO public.financeiro_lancamentos_v2 (%s) SELECT %s FROM public.financeiro_lancamentos_v2 WHERE id = $2',
                   v_cols, v_vals)
      USING v_irmao, l.id, v_sinal * v_saldo, CASE WHEN l.observacao IS NULL OR btrim(l.observacao) = '' THEN v_obs
                                                   ELSE l.observacao || E'\n' || v_obs END, v_uid;
    PERFORM set_config('app.conc_dividindo', 'on', true);
    UPDATE public.financeiro_lancamentos_v2
       SET valor = v_sinal * round(v_ap, 2),
           status_transacao = CASE WHEN status_transacao IN ('realizado', 'conciliado') THEN status_transacao ELSE 'realizado' END,
           data_pagamento = coalesce(data_pagamento, v_data),
           updated_at = now(), updated_by = coalesce(v_uid, updated_by)
     WHERE id = l.id;
    PERFORM set_config('app.conc_dividindo', 'off', true);
    INSERT INTO public.financeiro_baixas_no_vinculo (cliente_id, tipo, lancamento_id, irmao_id, valor_original, valor_aplicado, valor_saldo,
        antes, depois, origem, motivo, feita_por)
    SELECT l.cliente_id, 'divisao', l.id, v_irmao, l.valor, v_sinal * round(v_ap, 2), v_sinal * v_saldo, v_antes,
           jsonb_build_object('valor', x.valor, 'status_transacao', x.status_transacao, 'data_pagamento', x.data_pagamento),
           p_origem, p_motivo, v_uid
      FROM public.financeiro_lancamentos_v2 x WHERE x.id = l.id;
    RETURN jsonb_build_object('acao', 'divisao', 'lancamento_id', l.id, 'irmao_id', v_irmao, 'aplicado', round(v_ap, 2),
                              'saldo', v_saldo, 'data_pagamento', coalesce(l.data_pagamento, v_data));
  END IF;

  -- INTEIRO (ou fora da divisao) sem baixa: baixa na data do ultimo extrato vivo
  IF l.status_transacao NOT IN ('realizado', 'conciliado') THEN
    UPDATE public.financeiro_lancamentos_v2
       SET status_transacao = 'realizado', data_pagamento = coalesce(data_pagamento, v_data),
           updated_at = now(), updated_by = coalesce(v_uid, updated_by)
     WHERE id = l.id;
    IF p_origem = 'conserto' THEN
      INSERT INTO public.financeiro_baixas_no_vinculo (cliente_id, tipo, lancamento_id, valor_original, valor_aplicado, antes, depois,
          origem, motivo, feita_por)
      SELECT l.cliente_id, 'baixa', l.id, l.valor, round(v_ap, 2), v_antes,
             jsonb_build_object('valor', x.valor, 'status_transacao', x.status_transacao, 'data_pagamento', x.data_pagamento),
             p_origem, p_motivo, v_uid
        FROM public.financeiro_lancamentos_v2 x WHERE x.id = l.id;
    END IF;
    RETURN jsonb_build_object('acao', 'baixa', 'lancamento_id', l.id, 'data_pagamento', coalesce(l.data_pagamento, v_data));
  END IF;
  RETURN jsonb_build_object('acao', 'nada');
END;
$function$;
REVOKE ALL ON FUNCTION public._fn_conc_baixa_no_vinculo(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- ═══════════════════ 2. A TRAVA SEM EXCECAO ═══════════════════
CREATE OR REPLACE FUNCTION public._fn_trg_conc_baixa_no_vinculo()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $function$
DECLARE l public.financeiro_lancamentos_v2;
BEGIN
  -- o vinculo pode ter sido desfeito depois, na mesma transacao: so' conta o que esta vivo no fim
  IF NOT EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens c WHERE c.id = NEW.id AND c.desfeito_em IS NULL) THEN
    RETURN NULL;
  END IF;
  PERFORM public._fn_conc_baixa_no_vinculo(NEW.lancamento_id, 'gatilho', NULL);
  -- TRAVA: vinculo vivo exige baixa (realizado com data de pagamento). OC-RECEB-PARCIAL-01: sem excecao — o titulo de OC divide.
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = NEW.lancamento_id;
  -- META nunca se liga a extrato (medido 21/10/2026: zero vinculos vivos em META)
  IF coalesce(l.cenario, 'realizado') = 'meta' THEN
    RAISE EXCEPTION 'Lançamento de META não se liga a extrato. Nada foi gravado.' USING ERRCODE = 'P0001', DETAIL = l.id::text;
  END IF;
  IF l.cancelado IS NOT TRUE
     AND NOT (l.status_transacao IN ('realizado', 'conciliado') AND l.data_pagamento IS NOT NULL) THEN
    RAISE EXCEPTION 'O lançamento de % ficou ligado ao extrato sem baixa. Nada foi gravado.', public._fn_oc_brl(abs(l.valor))
      USING ERRCODE = 'P0001', DETAIL = l.id::text;
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public._fn_trg_conc_baixa_no_vinculo() FROM PUBLIC, anon, authenticated;

-- ═══════════════════ 3. DESFAZER JUNTA DE VOLTA (+ A OC) ═══════════════════
CREATE OR REPLACE FUNCTION public._fn_trg_conc_juntar_ao_desfazer()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $function$
DECLARE d public.financeiro_baixas_no_vinculo; i public.financeiro_lancamentos_v2; v_vivos int; v_uid uuid := auth.uid(); v_oc boolean;
BEGIN
  SELECT * INTO d FROM public.financeiro_baixas_no_vinculo
   WHERE lancamento_id = NEW.lancamento_id AND tipo = 'divisao' AND desfeita_em IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_oc := coalesce((d.depois->>'oc')::boolean, false);
  SELECT * INTO i FROM public.financeiro_lancamentos_v2 WHERE id = d.irmao_id FOR UPDATE;
  IF i.cancelado IS NOT TRUE AND (i.status_transacao IN ('realizado', 'conciliado')
       OR EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens c WHERE c.lancamento_id = i.id AND c.desfeito_em IS NULL)) THEN
    IF v_oc THEN
      RAISE EXCEPTION 'Não dá para desfazer: a parte que faltava (% · %) já foi recebida. Desfaça esse recebimento antes. Nada foi alterado.',
        public._fn_oc_brl(abs(i.valor)), coalesce(i.descricao, 'recebimento da operação')
        USING ERRCODE = 'P0001', DETAIL = i.id::text;
    END IF;
    RAISE EXCEPTION 'Não dá para desfazer: o saldo de % deste lançamento já foi pago (lançamento de %). Desfaça o pagamento do saldo antes. Nada foi alterado.',
      public._fn_oc_brl(abs(i.valor)), public._fn_oc_data(coalesce(i.data_pagamento, i.data_vencimento))
      USING ERRCODE = 'P0001', DETAIL = i.id::text;
  END IF;
  -- o irmao em aberto sai (cancelado com o motivo; a casa nao apaga lancamento). Na OC, a parte e a parcela dele saem junto.
  IF i.cancelado IS NOT TRUE THEN
    UPDATE public.financeiro_lancamentos_v2
       SET cancelado = true, cancelado_em = now(), cancelado_por = v_uid,
           cancelado_motivo = format('Saldo juntado de volta ao lançamento %s (vínculo desfeito).', d.lancamento_id),
           updated_at = now(), updated_by = coalesce(v_uid, updated_by)
     WHERE id = i.id;
  END IF;
  IF v_oc THEN
    UPDATE public.zoo_operacao_partes SET cancelada = true, cancelada_em = now(), cancelada_por = v_uid,
           cancelada_motivo = 'recebimento parcial desfeito: a falta volta ao recebimento original', updated_at = now()
     WHERE id = (d.depois->>'parte2_id')::uuid AND cancelada IS NOT TRUE;
    UPDATE public.zoo_operacao_parcelas_programacao SET status = 'cancelada', updated_at = now() WHERE id = (d.depois->>'parcela2_id')::uuid;
    UPDATE public.zoo_operacao_parcelas_programacao SET valor = (d.antes->>'parcela_valor')::numeric, updated_at = now() WHERE id = (d.antes->>'parcela_id')::uuid;
    UPDATE public.zoo_operacao_partes SET valor = (d.antes->>'parte_valor')::numeric, updated_at = now() WHERE id = (d.antes->>'parte_id')::uuid;
  END IF;
  SELECT count(*) INTO v_vivos FROM public.conciliacao_bancaria_itens c WHERE c.lancamento_id = d.lancamento_id AND c.desfeito_em IS NULL;
  PERFORM set_config('app.conc_dividindo', 'on', true);
  UPDATE public.financeiro_lancamentos_v2 x
     SET valor = (d.antes->>'valor')::numeric,
         status_transacao = CASE WHEN v_vivos = 0 THEN d.antes->>'status_transacao' ELSE x.status_transacao END,
         data_pagamento   = CASE WHEN v_vivos = 0 THEN (d.antes->>'data_pagamento')::date ELSE x.data_pagamento END,
         updated_at = now(), updated_by = coalesce(v_uid, x.updated_by)
   WHERE x.id = d.lancamento_id;
  PERFORM set_config('app.conc_dividindo', 'off', true);
  IF v_oc THEN
    PERFORM public._oc_renumerar_parcelas_do_grupo((d.antes->>'parte_id')::uuid);
    INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
    VALUES (d.cliente_id, (d.depois->>'operacao_id')::uuid, 'juntar_recebimento_parcial',
            jsonb_build_object('titulo_id', d.lancamento_id, 'titulo2_id', d.irmao_id, 'parcela2_id', d.depois->>'parcela2_id',
                               'motivo', NEW.desfeito_motivo), v_uid, 'rpc');
  END IF;
  UPDATE public.financeiro_baixas_no_vinculo SET desfeita_em = now(), desfeita_por = v_uid, desfeita_motivo = NEW.desfeito_motivo
   WHERE id = d.id;
  INSERT INTO public.financeiro_baixas_no_vinculo (cliente_id, tipo, lancamento_id, irmao_id, valor_original, valor_aplicado, valor_saldo,
      antes, depois, origem, motivo, feita_por)
  VALUES (d.cliente_id, 'juncao', d.lancamento_id, d.irmao_id, d.valor_original, d.valor_aplicado, d.valor_saldo,
          d.depois, d.antes, 'gatilho', NEW.desfeito_motivo, v_uid);
  -- outro vinculo vivo ainda no original: a conta refaz-se sobre o que sobrou (divide de novo pelo novo aplicado)
  IF v_vivos > 0 THEN
    PERFORM public._fn_conc_baixa_no_vinculo(d.lancamento_id, 'gatilho', NEW.desfeito_motivo);
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public._fn_trg_conc_juntar_ao_desfazer() FROM PUBLIC, anon, authenticated;

-- ═══════════════════ 5a. O 1:1 DEIXA DE RECUSAR O PARCIAL DE OC ═══════════════════
SELECT pg_temp._trocar('public.fn_vincular_extrato_lancamento(uuid, uuid, numeric, boolean)'::regprocedure, '2f6fcd66d68dea766951a8dbfcd4f52b', ARRAY[
  $a$  IF v_valor < abs(v_lan.valor) - public._fn_lancamento_aplicado_vivo(p_lancamento_id)
     AND EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt WHERE pt.financeiro_lancamento_id = p_lancamento_id AND pt.cancelada = false) THEN
    RAISE EXCEPTION 'Este título é de operação comercial e o valor do extrato é menor que o do título. Faça o recebimento parcial pela Conferência (bloco). Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;$a$,
  $a$  -- OC-RECEB-PARCIAL-01: o parcial em titulo de OC deixou de ser recusado aqui — no fim da transacao o nucleo
  -- `_fn_conc_baixa_no_vinculo` divide pela parcela da programacao da OC (ou recusa, se a OC nao tem programacao).$a$
]);

-- ═══════════════════ 5b. O "CASAR COM O BANCO" NAO REESCREVE O VALOR DE TITULO DE OC ═══════════════════
SELECT pg_temp._trocar('public.fn_espelho_casar(uuid, jsonb, boolean, text)'::regprocedure, '2ba254315dc550f80f8580a76a284534', ARRAY[
  $b$       SET valor = v_vals[i],$b$,
  $b$       -- OC-RECEB-PARCIAL-01: titulo de OC mantem o valor (o parcial divide pela OC no fim da transacao; maior que o titulo recusa)
       SET valor = CASE WHEN EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt WHERE pt.financeiro_lancamento_id = v_ids[i] AND pt.cancelada IS NOT TRUE)
                        THEN valor ELSE v_vals[i] END,$b$,
  $c$       AND (valor IS DISTINCT FROM v_vals[i] OR data_pagamento$c$,
  $c$       AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt WHERE pt.financeiro_lancamento_id = v_ids[i] AND pt.cancelada IS NOT TRUE
                        AND v_vals[i] < abs(financeiro_lancamentos_v2.valor) - 0.005)
       AND (valor IS DISTINCT FROM v_vals[i] OR data_pagamento$c$
]);

DO $confere$
BEGIN
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_vincular_extrato_lancamento(uuid, uuid, numeric, boolean)'::regprocedure) LIKE '%Faça o recebimento parcial pela Conferência%'
     OR (SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_espelho_casar(uuid, jsonb, boolean, text)'::regprocedure) NOT LIKE '%OC-RECEB-PARCIAL-01%'
     OR (SELECT prosrc FROM pg_proc WHERE oid = 'public._fn_conc_baixa_no_vinculo(uuid, text, text)'::regprocedure) NOT LIKE '%oc_materializar_programacao%' THEN
    RAISE EXCEPTION 'OC-RECEB-PARCIAL-01: troca nao entrou'; END IF;
  IF has_function_privilege('anon', 'public.fn_vincular_extrato_lancamento(uuid, uuid, numeric, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_espelho_casar(uuid, jsonb, boolean, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_conc_baixa_no_vinculo(uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'OC-RECEB-PARCIAL-01: ACL aberta'; END IF;
END $confere$;
