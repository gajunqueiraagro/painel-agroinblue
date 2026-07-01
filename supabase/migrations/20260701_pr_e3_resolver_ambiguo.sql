-- ============================================================================
-- PR-E3 — Resolver linhas AMBÍGUAS escolhendo um candidato.
--
-- Decisões (aprovadas):
--  - Status do ambíguo resolvido = NOVO valor 'ambiguo_resolvido' (Opção B):
--      • pode ser salvo manualmente via fn_classificacao_apply_row;
--      • NÃO é varrido pelo fn_classificacao_apply em lote (que filtra 'exato');
--      • continua exigindo revisão/Salvar do operador.
--  - Valida que p_lanc_id ∈ fn_classificacao_candidatos_ambiguo(p_staging_id).
--  - Inclui desfazer (fn_classificacao_desfazer_ambiguo) → volta para 'ambiguo'.
--  - Auditoria: match_resolvido_em / match_resolvido_por.
--  - sem_match / não-ambíguo BLOQUEADOS (exige match_status='ambiguo').
--  - Guard ownership cliente×usuário (padrão cliente_membros).
--
-- Escrita: SOMENTE na staging (match_lancamento_id, match_status, auditoria).
-- NUNCA toca financeiro_lancamentos_v2 (isso é o apply). A view liga lanc_* por
-- match_lancamento_id → a escolha reflete o comparativo na hora.
-- ============================================================================

-- ── CHECK de match_status passa a aceitar 'ambiguo_resolvido' ─────────────────
ALTER TABLE public.financeiro_classificacao_staging
  DROP CONSTRAINT IF EXISTS financeiro_classificacao_staging_match_status_check;
ALTER TABLE public.financeiro_classificacao_staging
  ADD CONSTRAINT financeiro_classificacao_staging_match_status_check
  CHECK (match_status = ANY (ARRAY['exato','ambiguo','sem_match','ja_classificado','divergente','ambiguo_resolvido']));

-- ── Auditoria da resolução ────────────────────────────────────────────────────
ALTER TABLE public.financeiro_classificacao_staging
  ADD COLUMN IF NOT EXISTS match_resolvido_em  timestamptz,
  ADD COLUMN IF NOT EXISTS match_resolvido_por uuid;

-- ── Resolver: escolhe um candidato válido e grava o match ────────────────────
CREATE OR REPLACE FUNCTION public.fn_classificacao_resolver_ambiguo(p_staging_id uuid, p_lanc_id uuid)
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
BEGIN
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_nao_encontrada'); END IF;

  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id)
          OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  -- Só ambíguo é resolvível (bloqueia sem_match / exato / etc).
  IF v_staging.match_status <> 'ambiguo' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_ambiguo', 'match_status', v_staging.match_status);
  END IF;

  IF p_lanc_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'lanc_id_obrigatorio'); END IF;

  -- Candidato precisa estar entre os oferecidos por candidatos_ambiguo.
  SELECT EXISTS(SELECT 1 FROM public.fn_classificacao_candidatos_ambiguo(p_staging_id) c WHERE c.lanc_id = p_lanc_id)
    INTO v_is_cand;
  IF NOT v_is_cand THEN RETURN jsonb_build_object('ok', false, 'motivo', 'candidato_invalido'); END IF;

  SELECT * INTO v_lanc FROM financeiro_lancamentos_v2 WHERE id = p_lanc_id;
  IF NOT FOUND OR v_lanc.cancelado = true THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_inexistente_ou_cancelado');
  END IF;

  UPDATE financeiro_classificacao_staging
  SET match_lancamento_id = p_lanc_id,
      match_status        = 'ambiguo_resolvido',
      match_resolvido_em  = now(),
      match_resolvido_por = v_user_id,
      updated_at          = now()
  WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object('ok', true, 'motivo', 'resolvido',
    'match_lancamento_id', p_lanc_id, 'match_status', 'ambiguo_resolvido');
END;
$function$;

-- ── Desfazer: volta a linha para 'ambiguo' (antes do apply) ──────────────────
CREATE OR REPLACE FUNCTION public.fn_classificacao_desfazer_ambiguo(p_staging_id uuid)
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

  IF v_staging.match_status <> 'ambiguo_resolvido' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_resolvido');
  END IF;
  -- Se já aplicado, precisa reverter o apply antes (fn_classificacao_reverter_row).
  IF v_staging.aplicado = true THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_aplicado_reverter_antes');
  END IF;

  UPDATE financeiro_classificacao_staging
  SET match_lancamento_id = NULL,
      match_status        = 'ambiguo',
      match_resolvido_em  = NULL,
      match_resolvido_por = NULL,
      updated_at          = now()
  WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object('ok', true, 'motivo', 'desfeito');
END;
$function$;
