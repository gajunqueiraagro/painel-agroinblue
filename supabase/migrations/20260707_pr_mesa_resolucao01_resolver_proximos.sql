-- ============================================================================
-- PR-MESA-RESOLUCAO-01 (banco) — Resolução manual de 'candidatos_proximos'.
--
-- Dá caller ao fluxo de decisão humana que o banco já suporta: espelha
-- fn_classificacao_resolver_ambiguo / _desfazer_ambiguo (20260701_pr_e3) para o
-- status 'candidatos_proximos' (PR-MESA-DATA-01). O operador escolhe UM candidato
-- da janela ±3d; o sistema NUNCA escolhe sozinho.
--
-- Decisão de status (menor cirurgia, declarada): a resolução leva a um status NOVO
-- 'resolvido_manual' — e NÃO reutiliza 'ambiguo_resolvido'. Motivo: o desfazer
-- precisa devolver a linha ao estado de ORIGEM ('candidatos_proximos'); reutilizar
-- 'ambiguo_resolvido' perderia essa origem (desfazer_ambiguo volta para 'ambiguo').
-- Status dedicado = desfazer determinístico, sem coluna extra de "origem".
--
-- GUARD ANTI-DUPLO-MATCH (não-negociável): bloqueia resolver a linha para um
-- lançamento que OUTRA linha da MESMA sessão já escolheu, citando a linha
-- conflitante. SEM índice UNIQUE (a herança ja_aplicado repete match legitimamente
-- no populate; o guard vale só para o ATO de resolver).
--
-- Escrita: SOMENTE na staging (match_lancamento_id, match_status, auditoria).
-- NUNCA toca financeiro_lancamentos_v2 (isso é o apply). O lote (fn_classificacao_apply)
-- varre só 'exato' → 'resolvido_manual' exige Salvar manual (igual ao ambiguo_resolvido).
-- ============================================================================

-- ── CHECK de match_status += 'resolvido_manual' ──────────────────────────────
-- Preserva os 9 valores vigentes (pós DATA-01) e acrescenta o novo.
ALTER TABLE public.financeiro_classificacao_staging
  DROP CONSTRAINT IF EXISTS financeiro_classificacao_staging_match_status_check;
ALTER TABLE public.financeiro_classificacao_staging
  ADD CONSTRAINT financeiro_classificacao_staging_match_status_check
  CHECK (match_status = ANY (ARRAY['exato','ambiguo','sem_match','ja_classificado','divergente','ambiguo_resolvido','ja_aplicado','sem_conta_para_match','candidatos_proximos','resolvido_manual']));

-- ── Resolver: escolhe UM candidato da janela ±3d e grava o match ─────────────
-- Espelho de fn_classificacao_resolver_ambiguo (e3) + guard anti-duplo-match.
CREATE OR REPLACE FUNCTION public.fn_classificacao_resolver_proximos(p_staging_id uuid, p_lancamento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_staging financeiro_classificacao_staging%ROWTYPE;
  v_user_id uuid;
  v_is_cand boolean;
  v_lanc    financeiro_lancamentos_v2%ROWTYPE;
  v_conflito_linha int;
BEGIN
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_nao_encontrada'); END IF;

  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id)
          OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  -- Só 'candidatos_proximos' é resolvível por aqui (bloqueia sem_match/exato/etc).
  IF v_staging.match_status <> 'candidatos_proximos' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_candidatos_proximos', 'match_status', v_staging.match_status);
  END IF;

  IF p_lancamento_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_id_obrigatorio'); END IF;

  -- Candidato precisa estar entre os oferecidos pela janela (não aceita id arbitrário).
  SELECT EXISTS(SELECT 1 FROM public.fn_classificacao_candidatos_proximos(p_staging_id) c WHERE c.lanc_id = p_lancamento_id)
    INTO v_is_cand;
  IF NOT v_is_cand THEN RETURN jsonb_build_object('ok', false, 'motivo', 'candidato_invalido'); END IF;

  SELECT * INTO v_lanc FROM financeiro_lancamentos_v2 WHERE id = p_lancamento_id;
  IF NOT FOUND OR v_lanc.cancelado = true THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_inexistente_ou_cancelado');
  END IF;

  -- GUARD ANTI-DUPLO-MATCH: outra linha da MESMA sessão já escolheu este lançamento?
  SELECT excel_linha_origem INTO v_conflito_linha
    FROM financeiro_classificacao_staging
   WHERE sessao_id = v_staging.sessao_id
     AND staging_id <> p_staging_id
     AND match_lancamento_id = p_lancamento_id
   ORDER BY excel_linha_origem
   LIMIT 1;
  IF v_conflito_linha IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_ja_escolhido',
      'linha_conflitante', v_conflito_linha,
      'mensagem', format('Lançamento já escolhido pela linha %s desta sessão.', v_conflito_linha));
  END IF;

  UPDATE financeiro_classificacao_staging
  SET match_lancamento_id = p_lancamento_id,
      match_status        = 'resolvido_manual',
      match_resolvido_em  = now(),
      match_resolvido_por = v_user_id,
      updated_at          = now()
  WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object('ok', true, 'motivo', 'resolvido',
    'match_lancamento_id', p_lancamento_id, 'match_status', 'resolvido_manual');
END;
$function$;

-- ── Desfazer: volta a linha para 'candidatos_proximos' (antes do apply) ──────
-- Espelho de fn_classificacao_desfazer_ambiguo (e3), revertendo à origem correta.
CREATE OR REPLACE FUNCTION public.fn_classificacao_desfazer_proximos(p_staging_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_staging financeiro_classificacao_staging%ROWTYPE; v_user_id uuid;
BEGIN
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_nao_encontrada'); END IF;

  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id)
          OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  IF v_staging.match_status <> 'resolvido_manual' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_resolvido');
  END IF;
  -- Se já aplicado, precisa reverter o apply antes (fn_classificacao_reverter_row).
  IF v_staging.aplicado = true THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_aplicado_reverter_antes');
  END IF;

  UPDATE financeiro_classificacao_staging
  SET match_lancamento_id = NULL,
      match_status        = 'candidatos_proximos',
      match_resolvido_em  = NULL,
      match_resolvido_por = NULL,
      updated_at          = now()
  WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object('ok', true, 'motivo', 'desfeito');
END;
$function$;
