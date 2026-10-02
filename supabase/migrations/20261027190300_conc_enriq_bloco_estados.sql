-- PR-CONC-ENRIQ-BLOCO-ESTADOS — o bloco e o casar aceitam toda linha ainda nao resolvida; soltar o par; a tela le a regra.
--
-- Homologacao do Gabriel (02/10, NJ, BB, set/26, sessao 8d6efeb7): o Extrato da planilha oferecia caixinha a toda linha sem
-- lado Sistema, e as RPCs do NM-A so' aceitavam 'sem_match'/'candidatos_proximos' — o Rabobank (linha 10, 'sugestao_grupo',
-- 1 x 2 que fecha em 0,00) era recusado. Tela e banco discordavam sobre a mesma linha.
--
-- 1. `_fn_classificacao_linha_livre(staging)`: a UNICA definicao de linha livre — nao aplicada E (status de linha ainda nao
--    resolvida OU par morto: `match_lancamento_id` aponta para lancamento inexistente ou cancelado).
-- 2. `fn_classificacao_conferir_bloco` e `fn_classificacao_casar_manual` (corpos do arquivo 20261027190200, verbatim, com a
--    guarda trocada): usam a funcao; a recusa diz o que fazer ("ja' tem par (...). Solte o par antes de conferir.").
--    O casar manual guarda o estado anterior COMPLETO em `casamento_meta.anterior`.
-- 3. `fn_classificacao_soltar_par`: a linha volta a 'sem_match' com `solto_de`. NAO escreve no lancamento.
--    ⚠ NAO LIMPA A PROPOSTA (`update_proposto`), inclusive o que o operador editou a' mao — decisao do Gabriel (02/10): nao ha
--      caminho existente que limpe a proposta de um par desfeito (a limpeza do Recasar so' zera match_lancamento_id/_ids e
--      casamento_meta), e o proximo par (casar manual com cru -> precedencia) ou o Recasar a refaz.
-- 4. `vw_classificacao_staging_preview` ganha, NO FIM, `linha_livre` (pela funcao) e `lanc_cancelado` (so' para a tela
--    ESCREVER o motivo do par morto). Patch guardado por md5 da definicao.
-- ⚠ A FUNCAO DO ITEM 1 TEM EXECUTE PARA `authenticated`: a view e' security_invoker e roda como quem consulta; sem o EXECUTE
--   a tela quebraria. Ela so' le' (STABLE) e, sob a RLS de quem chama, so' ve' lancamentos do proprio cliente.

-- ═══ 0. guarda de origem: os dois corpos que serao substituidos sao os do NM-A ═══════════════════════════════════════
DO $g$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_classificacao_conferir_bloco(uuid,uuid[],uuid[],boolean)'::regprocedure))
     <> '0491ba4970ecdedbc31f7456cc7c647f' THEN
    RAISE EXCEPTION 'fn_classificacao_conferir_bloco nao esta no corpo do NM-A. Migration abortada.';
  END IF;
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_classificacao_casar_manual(uuid,uuid,boolean)'::regprocedure))
     <> '04fee4775e9fd5a157e5622d24b0fa07' THEN
    RAISE EXCEPTION 'fn_classificacao_casar_manual nao esta no corpo do NM-A. Migration abortada.';
  END IF;
END $g$;

-- ═══ 1. a linha livre ═════════════════════════════════════════════════════════════════════════════════════════════════
CREATE FUNCTION public._fn_classificacao_linha_livre(s public.financeiro_classificacao_staging)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $f$
  SELECT NOT s.aplicado AND (
    s.match_status IN ('sem_match', 'candidatos_proximos', 'sugestao_grupo', 'sugestao_split', 'ambiguo')
    OR (s.match_lancamento_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM public.financeiro_lancamentos_v2 l WHERE l.id = s.match_lancamento_id AND l.cancelado IS NOT TRUE)))
$f$;
REVOKE ALL ON FUNCTION public._fn_classificacao_linha_livre(public.financeiro_classificacao_staging) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._fn_classificacao_linha_livre(public.financeiro_classificacao_staging) TO authenticated, service_role;

-- ═══ 2a. conferir o bloco (corpo do NM-A, guarda trocada) ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_classificacao_conferir_bloco(
  p_sessao_id uuid, p_staging_ids uuid[], p_lancamento_ids uuid[], p_simular boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid uuid; v_cli uuid; v_conta uuid;
  v_n int; v_m int; v_k int; v_txt text; v_linha int;
  v_sp numeric; v_ss numeric; v_dif numeric;
  v_estado jsonb; v_ret jsonb; v_bloco uuid;
  v_desc text; v_tem_par boolean;
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
  -- PR-CONC-ENRIQ-BLOCO-ESTADOS: a linha livre tem UMA definicao, `_fn_classificacao_linha_livre` (a view a expoe a' tela)
  SELECT s.excel_linha_origem, s.match_status, l.descricao, (s.match_lancamento_id IS NOT NULL)
    INTO v_linha, v_txt, v_desc, v_tem_par
    FROM financeiro_classificacao_staging s LEFT JOIN financeiro_lancamentos_v2 l ON l.id = s.match_lancamento_id
   WHERE s.staging_id = ANY(p_staging_ids) AND NOT public._fn_classificacao_linha_livre(s)
   ORDER BY s.excel_linha_origem LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'linha_nao_elegivel', 'linha', v_linha, 'match_status', v_txt,
      'mensagem', CASE WHEN v_tem_par
        THEN format('A linha %s já tem par (%s). Solte o par antes de conferir.', v_linha, coalesce(v_desc, '—'))
        ELSE format('A linha %s não está livre (está em "%s").', v_linha, v_txt) END);
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

-- ═══ 2b. casar 1x1 manual (corpo do NM-A, guarda trocada, estado anterior completo) ═════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_classificacao_casar_manual(p_staging_id uuid, p_lancamento_id uuid, p_simular boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid uuid; v_s financeiro_classificacao_staging%ROWTYPE; v_l financeiro_lancamentos_v2%ROWTYPE;
  v_conta uuid; v_sg_pl int; v_sg_sis int; v_linha int; v_ret jsonb; v_dif numeric;
  v_desc text;
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
  -- PR-CONC-ENRIQ-BLOCO-ESTADOS: a mesma regra do bloco, numa funcao so'
  IF NOT public._fn_classificacao_linha_livre(v_s) THEN
    SELECT descricao INTO v_desc FROM financeiro_lancamentos_v2 WHERE id = v_s.match_lancamento_id;
    RETURN jsonb_build_object('ok', false, 'motivo', 'linha_nao_elegivel', 'match_status', v_s.match_status,
      'mensagem', CASE WHEN v_s.match_lancamento_id IS NOT NULL
        THEN format('A linha %s já tem par (%s). Solte o par antes de conferir.', v_s.excel_linha_origem, coalesce(v_desc, '—'))
        ELSE format('A linha %s não está livre (está em "%s").', v_s.excel_linha_origem, v_s.match_status) END);
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
           -- PR-CONC-ENRIQ-BLOCO-ESTADOS: o estado anterior COMPLETO (a linha pode ter vindo de grupo sugerido ou de par morto)
           casamento_meta = COALESCE(casamento_meta, '{}'::jsonb) || jsonb_build_object('manual', true, 'status_anterior', v_s.match_status,
             'anterior', jsonb_build_object('match_lancamento_id', v_s.match_lancamento_id,
               'match_lancamento_ids', to_jsonb(v_s.match_lancamento_ids), 'casamento_meta', v_s.casamento_meta)),
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

-- ═══ 3. soltar o par ══════════════════════════════════════════════════════════════════════════════════════════════════
-- Aceita linha NAO aplicada com par (`match_lancamento_id`) em exato / divergente / ja_classificado / ja_aplicado /
-- ambiguo_resolvido / resolvido_manual. Recusa: aplicada (reverta antes na Mesa), em bloco (desfaca o bloco), sem par.
-- A linha vira 'sem_match' e `casamento_meta` ganha {solto_de, status_anterior}. NAO toca o lancamento NEM a proposta.
CREATE FUNCTION public.fn_classificacao_soltar_par(p_staging_id uuid, p_simular boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_uid uuid; v_s financeiro_classificacao_staging%ROWTYPE; v_desc text; v_ret jsonb;
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
      'mensagem', format('A linha %s já foi gravada no lançamento: reverta antes na Mesa.', v_s.excel_linha_origem));
  END IF;
  IF v_s.match_status = 'conferido_bloco' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'linha_em_bloco',
      'mensagem', format('A linha %s está num bloco conferido: desfaça o bloco.', v_s.excel_linha_origem));
  END IF;
  IF v_s.match_lancamento_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'linha_sem_par',
      'mensagem', format('A linha %s não tem par para soltar.', v_s.excel_linha_origem));
  END IF;
  IF v_s.match_status NOT IN ('exato', 'divergente', 'ja_classificado', 'ja_aplicado', 'ambiguo_resolvido', 'resolvido_manual') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'status_nao_soltavel', 'match_status', v_s.match_status,
      'mensagem', format('A linha %s está em "%s": não há par para soltar.', v_s.excel_linha_origem, v_s.match_status));
  END IF;
  SELECT descricao INTO v_desc FROM financeiro_lancamentos_v2 WHERE id = v_s.match_lancamento_id;
  v_ret := jsonb_build_object('ok', true, 'motivo', 'solto', 'simulado', coalesce(p_simular, false),
    'solto_de', v_s.match_lancamento_id, 'status_anterior', v_s.match_status,
    'mensagem', format('Par solto: a linha %s deixa de apontar para "%s".', v_s.excel_linha_origem, coalesce(v_desc, '—')));
  BEGIN
    UPDATE financeiro_classificacao_staging
       SET match_status = 'sem_match', match_lancamento_id = NULL,
           casamento_meta = COALESCE(casamento_meta, '{}'::jsonb)
             || jsonb_build_object('solto_de', v_s.match_lancamento_id, 'status_anterior', v_s.match_status),
           updated_at = now()
     WHERE staging_id = p_staging_id;
    IF coalesce(p_simular, false) THEN
      RAISE EXCEPTION USING ERRCODE = 'CBSIM', MESSAGE = 'simulacao do soltar par: desfeita';
    END IF;
  EXCEPTION WHEN SQLSTATE 'CBSIM' THEN
    RETURN v_ret;
  END;
  RETURN v_ret;
END
$fn$;
REVOKE ALL ON FUNCTION public.fn_classificacao_soltar_par(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_classificacao_soltar_par(uuid, boolean) TO authenticated, service_role;

-- ═══ 4. a view expoe a regra (e o motivo do par morto) — patch guardado por md5 ════════════════════════════════════
DO $v$
DECLARE
  d text;
  a constant text := $a$((s.update_proposto -> '_planilha'::text) ->> 'forma_pagamento'::text) AS planilha_forma_pagamento
   FROM ($a$;
BEGIN
  d := pg_get_viewdef('public.vw_classificacao_staging_preview'::regclass);
  IF md5(d) <> '45dcdfbc165f2baddec9e5bad7769fb7' THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview nao esta na definicao esperada (md5 %). Migration abortada.', md5(d);
  END IF;
  IF (length(d) - length(replace(d, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview: a ancora do fim do SELECT nao casa exatamente 1x';
  END IF;
  d := replace(d, a, $b$((s.update_proposto -> '_planilha'::text) ->> 'forma_pagamento'::text) AS planilha_forma_pagamento,
    public._fn_classificacao_linha_livre(s.*) AS linha_livre,
    l.cancelado AS lanc_cancelado
   FROM ($b$);
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_classificacao_staging_preview WITH (security_invoker = true) AS ' || d;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.vw_classificacao_staging_preview'::regclass
                 AND reloptions @> ARRAY['security_invoker=true']) THEN
    RAISE EXCEPTION 'vw_classificacao_staging_preview perdeu security_invoker';
  END IF;
END $v$;
