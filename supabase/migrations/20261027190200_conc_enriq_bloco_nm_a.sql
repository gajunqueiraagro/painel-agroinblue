-- PR-CONC-ENRIQ-BLOCO-NM-A — bloco conferido NxM, casar 1x1 manual e o conserto do Recasar (so' banco).
--
-- Contexto (FASE 0 de 02/10): no Enriquecer, a planilha traz o pagamento ACUMULADO e o sistema tem os lancamentos POR CARGA,
-- ja' classificados (NJ, Sicredi Lavoura set/26: Emerson 6 linhas x 20 lancamentos, Nelson 4 x 26, Silvio 4 x 26 fecham em
-- 0,00). Nao ha nada a gravar no lancamento: o que falta e' DIZER que as N linhas estao explicadas por aqueles M lancamentos.
--
-- 1. Status novo 'conferido_bloco' no CHECK do staging.
-- 2. classificacao_blocos + classificacao_bloco_itens (molde: conciliacao_blocos): a IDENTIDADE do bloco, o estado anterior
--    de cada linha e a trilha do desfazer. O vinculo linha x lancamento continua no staging (match_lancamento_ids), que e' o
--    que fn_classificacao_sistema_nao_explicado, as guardas de duplo uso e o Recasar ja' leem.
-- 3. fn_classificacao_conferir_bloco / fn_classificacao_desfazer_bloco / fn_classificacao_casar_manual.
--    ⚠ NENHUMA ESCREVE EM financeiro_lancamentos_v2 nem em conciliacao_bancaria_itens.
--    ⚠ O estado_anterior DO STAGING NAO E' TOCADO: o fn_classificacao_apply_row o le' como o estado anterior do LANCAMENTO
--      (COALESCE(v_staging.estado_anterior, ...campos do lancamento)). O bloco guarda o seu na tabela; o casar_manual guarda a
--      origem em casamento_meta.status_anterior.
-- 4. Recasar (fn_classificacao_casar_sessao) e excluir_sessao: 'conferido_bloco' entra nas listas de status preservados, e o
--    v_usados passa a incluir unnest(match_lancamento_ids) das linhas preservadas — sem isso os lancamentos de um grupo/bloco
--    ficavam livres para o Recasar casar 1:1 com outra linha (furo medido na FASE 0).
--    PATCH GUARDADO POR md5 (CLAUDE.md): origem esperada, cada ancora 1x, md5 do resultado.

-- ═══ 1. o status novo ═══════════════════════════════════════════════════════════════════════════════════════════════════
DO $chk$
BEGIN
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conname = 'financeiro_classificacao_staging_match_status_check'
         AND conrelid = 'public.financeiro_classificacao_staging'::regclass)
     <> 'CHECK ((match_status = ANY (ARRAY[''exato''::text, ''ambiguo''::text, ''sem_match''::text, ''ja_classificado''::text, ''divergente''::text, ''ambiguo_resolvido''::text, ''ja_aplicado''::text, ''sem_conta_para_match''::text, ''candidatos_proximos''::text, ''resolvido_manual''::text, ''resolvido_grupo''::text, ''sugestao_grupo''::text, ''sugestao_split''::text])))'
  THEN
    RAISE EXCEPTION 'CHECK de match_status nao esta na forma esperada (13 valores). Migration abortada.';
  END IF;
END $chk$;

ALTER TABLE public.financeiro_classificacao_staging DROP CONSTRAINT financeiro_classificacao_staging_match_status_check;
ALTER TABLE public.financeiro_classificacao_staging ADD CONSTRAINT financeiro_classificacao_staging_match_status_check
  CHECK (match_status = ANY (ARRAY['exato', 'ambiguo', 'sem_match', 'ja_classificado', 'divergente', 'ambiguo_resolvido',
    'ja_aplicado', 'sem_conta_para_match', 'candidatos_proximos', 'resolvido_manual', 'resolvido_grupo', 'sugestao_grupo',
    'sugestao_split', 'conferido_bloco']));

-- ═══ 2. as tabelas do bloco ═════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE public.classificacao_blocos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  sessao_id        uuid NOT NULL,
  conta_id         uuid NOT NULL REFERENCES public.financeiro_contas_bancarias(id),
  criado_por       uuid,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  desfeito_por     uuid,
  desfeito_em      timestamptz,
  desfeito_motivo  text,
  -- por staging_id: match_status, match_lancamento_id, match_lancamento_ids, casamento_meta, match_resolvido_em/por
  estado_anterior  jsonb NOT NULL,
  -- n_linhas, n_lancamentos, soma_planilha, soma_sistema, diferenca
  resumo           jsonb
);
CREATE INDEX classificacao_blocos_sessao_idx ON public.classificacao_blocos (sessao_id);
CREATE INDEX classificacao_blocos_cliente_idx ON public.classificacao_blocos (cliente_id);

-- ⚠ SEM FK para staging nem para lancamento, de proposito: os itens sao TRILHA (ficam depois do desfazer), e uma FK
--   impediria apagar a sessao desfeita ou faria o item perder o lado que o identifica.
CREATE TABLE public.classificacao_bloco_itens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bloco_id       uuid NOT NULL REFERENCES public.classificacao_blocos(id) ON DELETE CASCADE,
  staging_id     uuid,
  lancamento_id  uuid,
  CONSTRAINT classificacao_bloco_itens_um_lado CHECK ((staging_id IS NULL) <> (lancamento_id IS NULL))
);
CREATE INDEX classificacao_bloco_itens_bloco_idx ON public.classificacao_bloco_itens (bloco_id);
CREATE INDEX classificacao_bloco_itens_staging_idx ON public.classificacao_bloco_itens (staging_id) WHERE staging_id IS NOT NULL;
CREATE INDEX classificacao_bloco_itens_lancamento_idx ON public.classificacao_bloco_itens (lancamento_id) WHERE lancamento_id IS NOT NULL;

ALTER TABLE public.classificacao_blocos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classificacao_bloco_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY classificacao_blocos_select ON public.classificacao_blocos
  FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));
CREATE POLICY classificacao_bloco_itens_select ON public.classificacao_bloco_itens
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.classificacao_blocos b WHERE b.id = bloco_id AND public.tenant_ok(b.cliente_id)));
-- escrita SO' pelas funcoes (SECURITY DEFINER): o authenticated so' le'
REVOKE ALL ON TABLE public.classificacao_blocos, public.classificacao_bloco_itens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.classificacao_blocos, public.classificacao_bloco_itens TO authenticated;
GRANT ALL ON TABLE public.classificacao_blocos, public.classificacao_bloco_itens TO service_role;

-- ═══ 3a. conferir o bloco ═══════════════════════════════════════════════════════════════════════════════════════════════
CREATE FUNCTION public.fn_classificacao_conferir_bloco(
  p_sessao_id uuid, p_staging_ids uuid[], p_lancamento_ids uuid[], p_simular boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid uuid; v_cli uuid; v_conta uuid;
  v_n int; v_m int; v_k int; v_txt text; v_linha int;
  v_sp numeric; v_ss numeric; v_dif numeric;
  v_estado jsonb; v_ret jsonb; v_bloco uuid;
  c_tol constant numeric := 0.005;
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  SELECT cliente_id INTO v_cli FROM financeiro_classificacao_staging WHERE sessao_id = p_sessao_id LIMIT 1;
  IF v_cli IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sessao_vazia_ou_inexistente', 'mensagem', 'A importação não existe ou está vazia.');
  END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR v_cli IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao', 'mensagem', 'Sem permissão para este cliente.');
  END IF;

  -- ── listas
  v_n := coalesce(array_length(p_staging_ids, 1), 0);
  v_m := coalesce(array_length(p_lancamento_ids, 1), 0);
  IF v_n = 0 OR v_m = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lista_vazia',
      'mensagem', 'Marque pelo menos uma linha da planilha e um lançamento do sistema.');
  END IF;
  IF v_n <> (SELECT count(DISTINCT x) FROM unnest(p_staging_ids) x)
     OR v_m <> (SELECT count(DISTINCT x) FROM unnest(p_lancamento_ids) x) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ids_duplicados', 'mensagem', 'Há linha ou lançamento repetido na seleção.');
  END IF;

  -- ── linhas: da sessao, da mesma conta, nao aplicadas, sem par
  SELECT count(*) INTO v_k FROM financeiro_classificacao_staging WHERE staging_id = ANY(p_staging_ids) AND sessao_id = p_sessao_id;
  IF v_k <> v_n THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'linha_fora_da_sessao', 'mensagem', 'Há linha marcada que não é desta importação.');
  END IF;
  SELECT excel_linha_origem INTO v_linha FROM financeiro_classificacao_staging
   WHERE staging_id = ANY(p_staging_ids) AND aplicado ORDER BY excel_linha_origem LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'linha_aplicada', 'linha', v_linha,
      'mensagem', format('A linha %s já foi gravada no lançamento: reverta antes de conferir em bloco.', v_linha));
  END IF;
  SELECT excel_linha_origem, match_status INTO v_linha, v_txt FROM financeiro_classificacao_staging
   WHERE staging_id = ANY(p_staging_ids) AND match_status NOT IN ('sem_match', 'candidatos_proximos')
   ORDER BY excel_linha_origem LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'linha_nao_elegivel', 'linha', v_linha, 'match_status', v_txt,
      'mensagem', format('A linha %s não está sem par (está em "%s").', v_linha, v_txt));
  END IF;
  SELECT count(DISTINCT COALESCE(conta_origem_id, conta_destino_id)), (array_agg(DISTINCT COALESCE(conta_origem_id, conta_destino_id)))[1],
         count(*) FILTER (WHERE COALESCE(conta_origem_id, conta_destino_id) IS NULL)
    INTO v_k, v_conta, v_linha
    FROM financeiro_classificacao_staging WHERE staging_id = ANY(p_staging_ids);
  IF v_k <> 1 OR v_linha > 0 OR v_conta IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conta_incompativel',
      'mensagem', 'As linhas marcadas são de contas diferentes (ou há linha sem conta).');
  END IF;
  IF EXISTS (SELECT 1 FROM financeiro_classificacao_staging WHERE staging_id = ANY(p_staging_ids) AND excel_valor IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'linha_sem_valor', 'mensagem', 'Há linha marcada sem valor.');
  END IF;

  -- ── lancamentos: existem, vivos, realizados, da conta, classificados, livres
  SELECT count(*) INTO v_k FROM financeiro_lancamentos_v2 WHERE id = ANY(p_lancamento_ids) AND cliente_id = v_cli;
  IF v_k <> v_m THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_inexistente', 'mensagem', 'Há lançamento que não existe neste cliente.');
  END IF;
  SELECT descricao INTO v_txt FROM financeiro_lancamentos_v2 WHERE id = ANY(p_lancamento_ids) AND cancelado IS TRUE LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_cancelado',
      'mensagem', format('O lançamento "%s" está cancelado.', coalesce(v_txt, '—')));
  END IF;
  SELECT descricao INTO v_txt FROM financeiro_lancamentos_v2
   WHERE id = ANY(p_lancamento_ids) AND status_transacao IS DISTINCT FROM 'realizado' LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_nao_realizado',
      'mensagem', format('O lançamento "%s" não está realizado: só o que saiu do banco entra no bloco.', coalesce(v_txt, '—')));
  END IF;
  -- a conta do lancamento: a efetiva (entrada = destino, saida = origem); transferencia pela ponta desta conta
  SELECT descricao INTO v_txt FROM financeiro_lancamentos_v2 l
   WHERE l.id = ANY(p_lancamento_ids)
     AND NOT (CASE WHEN l.tipo_operacao LIKE '3-%' THEN v_conta IN (l.conta_bancaria_id, l.conta_destino_id)
                   ELSE l.conta_efetiva_id = v_conta END)
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conta_incompativel',
      'mensagem', format('O lançamento "%s" é de outra conta bancária.', coalesce(v_txt, '—')));
  END IF;
  SELECT descricao INTO v_txt FROM financeiro_lancamentos_v2 WHERE id = ANY(p_lancamento_ids) AND plano_conta_id IS NULL LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_cru',
      'mensagem', format('Há lançamento sem classificação no bloco ("%s"): desmembre ou case 1×1.', coalesce(v_txt, '—')));
  END IF;
  SELECT excel_linha_origem INTO v_linha FROM financeiro_classificacao_staging
   WHERE sessao_id = p_sessao_id AND NOT (staging_id = ANY(p_staging_ids))
     AND (match_lancamento_id = ANY(p_lancamento_ids) OR COALESCE(match_lancamento_ids, ARRAY[]::uuid[]) && p_lancamento_ids)
   ORDER BY excel_linha_origem LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_ja_escolhido', 'linha_conflitante', v_linha,
      'mensagem', format('Um dos lançamentos já foi escolhido pela linha %s desta importação.', v_linha));
  END IF;
  -- mes fechado: a mesma regra do fn_classificacao_split_substituir (cliente, fazenda e mes do lancamento)
  SELECT l.ano_mes INTO v_txt FROM financeiro_lancamentos_v2 l
   WHERE l.id = ANY(p_lancamento_ids)
     AND EXISTS (SELECT 1 FROM financeiro_fechamentos f
                  WHERE f.cliente_id = l.cliente_id AND f.fazenda_id = l.fazenda_id
                    AND f.ano_mes = l.ano_mes AND f.status_fechamento = 'fechado')
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'mes_fechado', 'ano_mes', v_txt,
      'mensagem', format('O mês %s está fechado na fazenda de um dos lançamentos: reabra antes de conferir o bloco.', v_txt));
  END IF;

  -- ── soma COM SINAL, ao centavo. NUNCA ajusta valor. Sinais opostos no mesmo bloco sao permitidos (venda + e retencao -).
  --    planilha: entrada +, saida -, transferencia pela direcao (destino = esta conta -> +)
  SELECT sum(CASE WHEN excel_tipo_operacao LIKE '1-%' THEN 1
                  WHEN excel_tipo_operacao LIKE '3-%' AND conta_destino_id = v_conta THEN 1
                  ELSE -1 END * abs(excel_valor))
    INTO v_sp FROM financeiro_classificacao_staging WHERE staging_id = ANY(p_staging_ids);
  --    sistema: o sinal do caixa DESTA conta
  SELECT sum(CASE WHEN l.tipo_operacao LIKE '3-%' THEN CASE WHEN l.conta_destino_id = v_conta THEN l.valor ELSE -l.valor END
                  ELSE l.valor * COALESCE(NULLIF(l.sinal, '')::numeric, CASE WHEN l.tipo_operacao LIKE '1-%' THEN 1 ELSE -1 END) END)
    INTO v_ss FROM financeiro_lancamentos_v2 l WHERE l.id = ANY(p_lancamento_ids);
  v_dif := round(v_sp - v_ss, 2);
  v_ret := jsonb_build_object('soma_planilha', round(v_sp, 2), 'soma_sistema', round(v_ss, 2), 'diferenca', v_dif,
                              'n_linhas', v_n, 'n_lancamentos', v_m);
  IF abs(v_sp - v_ss) > c_tol THEN
    RETURN v_ret || jsonb_build_object('ok', false, 'motivo', 'soma_divergente',
      'mensagem', format('A soma da planilha (%s) difere da do sistema (%s) em %s.',
        translate(to_char(round(v_sp, 2), 'FM999,999,999,990.00'), ',.', '.,'),
        translate(to_char(round(v_ss, 2), 'FM999,999,999,990.00'), ',.', '.,'),
        translate(to_char(v_dif, 'FM999,999,999,990.00'), ',.', '.,')));
  END IF;

  SELECT jsonb_object_agg(staging_id::text, jsonb_build_object(
           'match_status', match_status, 'match_lancamento_id', match_lancamento_id,
           'match_lancamento_ids', to_jsonb(match_lancamento_ids), 'casamento_meta', casamento_meta,
           'match_resolvido_em', match_resolvido_em, 'match_resolvido_por', match_resolvido_por))
    INTO v_estado FROM financeiro_classificacao_staging WHERE staging_id = ANY(p_staging_ids);
  v_ret := v_ret || jsonb_build_object('ok', true, 'motivo', 'conferido', 'simulado', coalesce(p_simular, false),
    'mensagem', format('Bloco conferido: %s linha(s) da planilha × %s lançamento(s), soma %s.', v_n, v_m,
      translate(to_char(round(v_sp, 2), 'FM999,999,999,990.00'), ',.', '.,')));

  -- ── gravacao (desfeita por SQLSTATE 'CBSIM' quando simula: executa TUDO e volta)
  BEGIN
    INSERT INTO classificacao_blocos (cliente_id, sessao_id, conta_id, criado_por, estado_anterior, resumo)
    VALUES (v_cli, p_sessao_id, v_conta, v_uid, v_estado, v_ret - 'ok' - 'motivo' - 'mensagem' - 'simulado')
    RETURNING id INTO v_bloco;
    INSERT INTO classificacao_bloco_itens (bloco_id, staging_id) SELECT v_bloco, x FROM unnest(p_staging_ids) x;
    INSERT INTO classificacao_bloco_itens (bloco_id, lancamento_id) SELECT v_bloco, x FROM unnest(p_lancamento_ids) x;
    UPDATE financeiro_classificacao_staging
       SET match_status = 'conferido_bloco', match_lancamento_id = NULL, match_lancamento_ids = p_lancamento_ids,
           casamento_meta = COALESCE(casamento_meta, '{}'::jsonb) || jsonb_build_object('bloco_id', v_bloco),
           match_resolvido_em = now(), match_resolvido_por = v_uid, updated_at = now()
     WHERE staging_id = ANY(p_staging_ids) AND sessao_id = p_sessao_id;
    IF coalesce(p_simular, false) THEN
      RAISE EXCEPTION USING ERRCODE = 'CBSIM', MESSAGE = 'simulacao do bloco: desfeita';
    END IF;
  EXCEPTION WHEN SQLSTATE 'CBSIM' THEN
    RETURN v_ret || jsonb_build_object('bloco_id', NULL);
  END;
  RETURN v_ret || jsonb_build_object('bloco_id', v_bloco);
END
$fn$;

-- ═══ 3b. desfazer o bloco ═══════════════════════════════════════════════════════════════════════════════════════════════
CREATE FUNCTION public.fn_classificacao_desfazer_bloco(p_bloco_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_uid uuid; v_b classificacao_blocos%ROWTYPE; v_fora text; n int;
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  IF NULLIF(btrim(coalesce(p_motivo, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'motivo_obrigatorio', 'mensagem', 'Escreva o motivo para desfazer o bloco.');
  END IF;
  SELECT * INTO v_b FROM classificacao_blocos WHERE id = p_bloco_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'bloco_inexistente', 'mensagem', 'O bloco não existe.');
  END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR v_b.cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao', 'mensagem', 'Sem permissão para este cliente.');
  END IF;
  IF v_b.desfeito_em IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'bloco_ja_desfeito',
      'mensagem', format('O bloco já foi desfeito em %s.', to_char(v_b.desfeito_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')));
  END IF;
  -- linha que saiu do bloco por outro caminho: recusa, dizendo qual
  SELECT string_agg(coalesce(s.excel_linha_origem::text, i.staging_id::text) || ' ("' || coalesce(s.match_status, 'apagada') || '")', ', ')
    INTO v_fora
    FROM classificacao_bloco_itens i
    LEFT JOIN financeiro_classificacao_staging s ON s.staging_id = i.staging_id
   WHERE i.bloco_id = p_bloco_id AND i.staging_id IS NOT NULL
     AND (s.staging_id IS NULL OR s.match_status <> 'conferido_bloco' OR s.aplicado
          OR s.casamento_meta ->> 'bloco_id' IS DISTINCT FROM p_bloco_id::text);
  IF v_fora IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'linha_fora_do_bloco',
      'mensagem', format('A linha %s já saiu do bloco por outro caminho: desfazer recusado.', v_fora));
  END IF;

  UPDATE financeiro_classificacao_staging s
     SET match_status = e.value ->> 'match_status',
         match_lancamento_id = (e.value ->> 'match_lancamento_id')::uuid,
         match_lancamento_ids = CASE WHEN jsonb_typeof(e.value -> 'match_lancamento_ids') = 'array'
                                     THEN ARRAY(SELECT jsonb_array_elements_text(e.value -> 'match_lancamento_ids')::uuid)
                                     ELSE NULL END,
         casamento_meta = NULLIF(e.value -> 'casamento_meta', 'null'::jsonb),
         match_resolvido_em = (e.value ->> 'match_resolvido_em')::timestamptz,
         match_resolvido_por = (e.value ->> 'match_resolvido_por')::uuid,
         updated_at = now()
    FROM jsonb_each(v_b.estado_anterior) e
   WHERE s.staging_id = (e.key)::uuid;
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE classificacao_blocos
     SET desfeito_por = v_uid, desfeito_em = now(), desfeito_motivo = btrim(p_motivo)
   WHERE id = p_bloco_id;

  RETURN jsonb_build_object('ok', true, 'motivo', 'desfeito', 'linhas', n,
    'mensagem', format('Bloco desfeito: %s linha(s) voltaram ao estado anterior.', n));
END
$fn$;

-- ═══ 3c. casar 1x1 manual (linha sem par x um lancamento) ═══════════════════════════════════════════════════════════════
CREATE FUNCTION public.fn_classificacao_casar_manual(p_staging_id uuid, p_lancamento_id uuid, p_simular boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid uuid; v_s financeiro_classificacao_staging%ROWTYPE; v_l financeiro_lancamentos_v2%ROWTYPE;
  v_conta uuid; v_sg_pl int; v_sg_sis int; v_linha int; v_ret jsonb; v_dif numeric;
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  SELECT * INTO v_s FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'staging_nao_encontrada', 'mensagem', 'A linha da planilha não existe.');
  END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR v_s.cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao', 'mensagem', 'Sem permissão para este cliente.');
  END IF;
  IF v_s.aplicado THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'linha_aplicada',
      'mensagem', format('A linha %s já foi gravada no lançamento: reverta antes.', v_s.excel_linha_origem));
  END IF;
  IF v_s.match_status NOT IN ('sem_match', 'candidatos_proximos') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'linha_nao_elegivel', 'match_status', v_s.match_status,
      'mensagem', format('A linha %s não está sem par (está em "%s").', v_s.excel_linha_origem, v_s.match_status));
  END IF;
  v_conta := COALESCE(v_s.conta_origem_id, v_s.conta_destino_id);
  IF v_conta IS NULL OR v_s.excel_valor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'linha_sem_conta_ou_valor', 'mensagem', 'A linha não tem conta bancária ou valor.');
  END IF;
  SELECT * INTO v_l FROM financeiro_lancamentos_v2 WHERE id = p_lancamento_id AND cliente_id = v_s.cliente_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_inexistente', 'mensagem', 'O lançamento não existe neste cliente.');
  END IF;
  IF v_l.cancelado IS TRUE THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_cancelado', 'mensagem', 'O lançamento está cancelado.');
  END IF;
  IF v_l.status_transacao IS DISTINCT FROM 'realizado' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_nao_realizado',
      'mensagem', format('O lançamento não está realizado (%s).', coalesce(v_l.status_transacao, '—')));
  END IF;
  IF NOT (CASE WHEN v_l.tipo_operacao LIKE '3-%' THEN v_conta IN (v_l.conta_bancaria_id, v_l.conta_destino_id)
               ELSE v_l.conta_efetiva_id = v_conta END) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conta_incompativel', 'mensagem', 'O lançamento é de outra conta bancária.');
  END IF;
  v_sg_pl := CASE WHEN v_s.excel_tipo_operacao LIKE '1-%' THEN 1
                  WHEN v_s.excel_tipo_operacao LIKE '3-%' AND v_s.conta_destino_id = v_conta THEN 1 ELSE -1 END;
  v_sg_sis := CASE WHEN v_l.tipo_operacao LIKE '3-%' THEN CASE WHEN v_l.conta_destino_id = v_conta THEN 1 ELSE -1 END
                   ELSE COALESCE(NULLIF(v_l.sinal, '')::int, CASE WHEN v_l.tipo_operacao LIKE '1-%' THEN 1 ELSE -1 END) END;
  IF v_sg_pl <> v_sg_sis THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sinal_incoerente',
      'mensagem', format('A linha é %s e o lançamento é %s.',
        CASE WHEN v_sg_pl > 0 THEN 'entrada' ELSE 'saída' END, CASE WHEN v_sg_sis > 0 THEN 'entrada' ELSE 'saída' END));
  END IF;
  v_dif := round(abs(v_s.excel_valor), 2) - round(v_l.valor, 2);
  IF v_dif <> 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'valor_divergente', 'diferenca', v_dif,
      'mensagem', format('O valor da planilha (%s) difere do lançamento (%s) em %s.',
        translate(to_char(round(abs(v_s.excel_valor), 2), 'FM999,999,999,990.00'), ',.', '.,'),
        translate(to_char(round(v_l.valor, 2), 'FM999,999,999,990.00'), ',.', '.,'),
        translate(to_char(v_dif, 'FM999,999,999,990.00'), ',.', '.,')));
  END IF;
  SELECT excel_linha_origem INTO v_linha FROM financeiro_classificacao_staging
   WHERE sessao_id = v_s.sessao_id AND staging_id <> p_staging_id
     AND (match_lancamento_id = p_lancamento_id OR p_lancamento_id = ANY(COALESCE(match_lancamento_ids, ARRAY[]::uuid[])))
   ORDER BY excel_linha_origem LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_ja_escolhido', 'linha_conflitante', v_linha,
      'mensagem', format('O lançamento já foi escolhido pela linha %s desta importação.', v_linha));
  END IF;

  -- CLASSIFICADO: e' um bloco 1x1 (o mesmo caminho e as mesmas guardas, inclusive mes fechado)
  IF v_l.plano_conta_id IS NOT NULL THEN
    RETURN public.fn_classificacao_conferir_bloco(v_s.sessao_id, ARRAY[p_staging_id], ARRAY[p_lancamento_id], p_simular)
           || jsonb_build_object('caminho', 'bloco_1x1');
  END IF;
  -- nem classificado nem cru do extrato (o predicado de _fn_classificacao_precedencia_cru): nao ha regra para ele
  IF NOT (v_l.origem_lancamento IN ('extrato', 'ofx') AND v_l.subcentro IS NULL AND COALESCE(v_l.tipo_operacao, '') NOT LIKE '3-%') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_sem_regra',
      'mensagem', format('O lançamento não tem classificação e não veio do extrato (origem "%s"): classifique-o no Financeiro antes.',
        coalesce(v_l.origem_lancamento, '—')));
  END IF;

  -- CRU: par normal; a precedencia do cru sobe a planilha para a proposta (como no casador)
  v_ret := jsonb_build_object('ok', true, 'motivo', 'resolvido_manual', 'caminho', 'cru', 'simulado', coalesce(p_simular, false),
    'mensagem', 'Linha casada com o lançamento do extrato: a planilha sobe para a proposta.');
  BEGIN
    UPDATE financeiro_classificacao_staging
       SET match_lancamento_id = p_lancamento_id, match_lancamento_ids = NULL, match_status = 'resolvido_manual',
           -- a origem fica em casamento_meta: o estado_anterior do staging e' o do LANCAMENTO para o apply_row
           casamento_meta = COALESCE(casamento_meta, '{}'::jsonb) || jsonb_build_object('manual', true, 'status_anterior', v_s.match_status),
           match_resolvido_em = now(), match_resolvido_por = v_uid, updated_at = now()
     WHERE staging_id = p_staging_id;
    PERFORM public._fn_classificacao_precedencia_cru(v_s.sessao_id);
    IF coalesce(p_simular, false) THEN
      RAISE EXCEPTION USING ERRCODE = 'CBSIM', MESSAGE = 'simulacao do casar manual: desfeita';
    END IF;
  EXCEPTION WHEN SQLSTATE 'CBSIM' THEN
    RETURN v_ret;
  END;
  RETURN v_ret;
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_classificacao_conferir_bloco(uuid, uuid[], uuid[], boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_classificacao_desfazer_bloco(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_classificacao_casar_manual(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_conferir_bloco(uuid, uuid[], uuid[], boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_desfazer_bloco(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_casar_manual(uuid, uuid, boolean) TO authenticated, service_role;

-- ═══ 4. o Recasar e o excluir respeitam grupos e blocos (patch guardado por md5) ════════════════════════════════════════
-- No casar_sessao ha CINCO listas de status preservados (v_usados, a limpeza, o laco do passo 1, a contagem da chave e a
-- contagem final "nao_tocadas"); no excluir_sessao, uma. Todas ganham 'conferido_bloco', e o v_usados passa a incluir os
-- match_lancamento_ids das linhas preservadas.
DO $mig$
DECLARE
  v_antes text; v_novo text; v_args text; a text[]; b text[]; i int;
  c_velha constant text := $l$('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido')$l$;
  c_nova  constant text := $l$('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido','conferido_bloco')$l$;
BEGIN
  -- ── casar_sessao
  SELECT prosrc, pg_get_function_arguments(oid) INTO v_antes, v_args FROM pg_proc
   WHERE oid = 'public.fn_classificacao_casar_sessao(uuid,text)'::regprocedure;
  IF md5(v_antes) <> '6725e204e186454cab6e69eccef3a527' THEN
    RAISE EXCEPTION 'fn_classificacao_casar_sessao nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  END IF;
  IF (length(v_antes) - length(replace(v_antes, c_velha, ''))) / length(c_velha) <> 5 THEN
    RAISE EXCEPTION 'casar_sessao: esperava 5 listas de preservacao, achou %',
      (length(v_antes) - length(replace(v_antes, c_velha, ''))) / length(c_velha);
  END IF;
  a := ARRAY[
    -- 1. v_usados: o singular E os ids das preservadas
    $a1$  SELECT COALESCE(array_agg(match_lancamento_id), '{}'::uuid[]) INTO v_usados
  FROM financeiro_classificacao_staging
  WHERE sessao_id = p_sessao_id AND match_lancamento_id IS NOT NULL
    AND (aplicado OR match_status IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido'));
$a1$,
    -- 2. a limpeza
    $a2$     AND match_status NOT IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido');
$a2$,
    -- 3. o laco do passo 1
    $a3$       AND st.match_status NOT IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido')
$a3$,
    -- 4. a contagem da chave
    $a4$       AND s2.match_status NOT IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido');
$a4$,
    -- 5. a contagem final
    $a5$(aplicado OR match_status IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido'));
  RETURN jsonb_build_object('ok', true, 'sessao_id'$a5$
  ];
  b := ARRAY[
    $b1$  -- PR-CONC-ENRIQ-BLOCO-NM-A: os lancamentos das linhas preservadas, inclusive os de GRUPO e de BLOCO (match_lancamento_ids);
  -- antes so' o singular entrava, e o Recasar casava 1:1 um lancamento ja' explicado por um grupo
  SELECT COALESCE(array_agg(u.x), '{}'::uuid[]) INTO v_usados
  FROM (
    SELECT match_lancamento_id AS x FROM financeiro_classificacao_staging
     WHERE sessao_id = p_sessao_id AND match_lancamento_id IS NOT NULL
       AND (aplicado OR match_status IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido','conferido_bloco'))
    UNION
    SELECT unnest(match_lancamento_ids) FROM financeiro_classificacao_staging
     WHERE sessao_id = p_sessao_id AND match_lancamento_ids IS NOT NULL
       AND (aplicado OR match_status IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido','conferido_bloco'))
  ) u;
$b1$,
    $b2$     AND match_status NOT IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido','conferido_bloco');
$b2$,
    $b3$       AND st.match_status NOT IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido','conferido_bloco')
$b3$,
    $b4$       AND s2.match_status NOT IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido','conferido_bloco');
$b4$,
    $b5$(aplicado OR match_status IN ('ja_aplicado','resolvido_manual','resolvido_grupo','ambiguo_resolvido','conferido_bloco'));
  RETURN jsonb_build_object('ok', true, 'sessao_id'$b5$
  ];
  v_novo := v_antes;
  FOR i IN 1 .. array_length(a, 1) LOOP
    IF (length(v_novo) - length(replace(v_novo, a[i], ''))) / length(a[i]) <> 1 THEN
      RAISE EXCEPTION 'casar_sessao: a ancora % nao casa exatamente 1x', i;
    END IF;
    v_novo := replace(v_novo, a[i], b[i]);
  END LOOP;
  -- o CONCEITO: nenhuma lista velha sobra, e as cinco novas estao la'
  IF position(c_velha IN v_novo) > 0 THEN RAISE EXCEPTION 'casar_sessao: sobrou lista de preservacao sem conferido_bloco'; END IF;
  IF (length(v_novo) - length(replace(v_novo, c_nova, ''))) / length(c_nova) <> 6 THEN
    RAISE EXCEPTION 'casar_sessao: esperava 6 ocorrencias da lista nova (5 listas, o v_usados com 2), achou %',
      (length(v_novo) - length(replace(v_novo, c_nova, ''))) / length(c_nova);
  END IF;
  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_classificacao_casar_sessao(' || v_args || ') RETURNS jsonb'
       || ' LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS $fn$' || v_novo || '$fn$';
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_classificacao_casar_sessao(uuid,text)'::regprocedure))
     <> 'a6a6832f1be59a35d296d6b0b4273117' THEN
    RAISE EXCEPTION 'casar_sessao: o corpo novo nao bate com o md5 esperado (%). Migration abortada.',
      md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_classificacao_casar_sessao(uuid,text)'::regprocedure));
  END IF;

  -- ── excluir_sessao
  SELECT prosrc, pg_get_function_arguments(oid) INTO v_antes, v_args FROM pg_proc
   WHERE oid = 'public.fn_classificacao_excluir_sessao(uuid,boolean)'::regprocedure;
  IF md5(v_antes) <> '3257a535e1a43cf96f9e0cb784fc7cc0' THEN
    RAISE EXCEPTION 'fn_classificacao_excluir_sessao nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  END IF;
  IF (length(v_antes) - length(replace(v_antes, c_velha, ''))) / length(c_velha) <> 1 THEN
    RAISE EXCEPTION 'excluir_sessao: a lista de preservacao nao casa exatamente 1x';
  END IF;
  v_novo := replace(v_antes, c_velha, c_nova);
  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_classificacao_excluir_sessao(' || v_args || ') RETURNS jsonb'
       || ' LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''pg_catalog'', ''public'' AS $fn$' || v_novo || '$fn$';
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_classificacao_excluir_sessao(uuid,boolean)'::regprocedure))
     <> '4e2dec30571e7ef7a953deefce75a02b' THEN
    RAISE EXCEPTION 'excluir_sessao: o corpo novo nao bate com o md5 esperado (%). Migration abortada.',
      md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_classificacao_excluir_sessao(uuid,boolean)'::regprocedure));
  END IF;
END $mig$;
