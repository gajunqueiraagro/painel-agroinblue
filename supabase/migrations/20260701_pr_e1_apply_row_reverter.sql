-- ============================================================================
-- PR-E1 — Revisão manual por lançamento: core de escrita por linha + reversão,
-- e refatoração do lote para compartilhar o core (regra única).
--
-- Decisões (aprovadas):
--  1. overwrite manual: proposto VENCE se presente; campos não-propostos mantêm
--     o valor atual (nunca nula sem proposta).
--  2. apply_row aceita não-exato RESOLVIDO; exige match_lancamento_id
--     (sem_match continua bloqueado).
--  3. reversão incluída (fn_classificacao_reverter_row).
--  4. re-apply preserva o estado_anterior ORIGINAL (não re-snapshota).
--  5. guard de ownership cliente×usuário via padrão existente
--     (is_admin_agroinblue + get_user_cliente_ids / cliente_membros).
--  6. retorno jsonb { ok, aplicado, motivo, lancamento_id, estado_anterior }.
--
-- Escrita: SOMENTE nos 6 campos classificatórios de financeiro_lancamentos_v2
-- (subcentro/macro/grupo/centro/plano_conta_id/favorecido_id) + marca staging.
-- NUNCA cria lançamento. Fazenda/Produto fora (fazenda = frente futura).
-- ============================================================================

-- ── Core: aplica UMA linha da staging ao lançamento vinculado ────────────────
CREATE OR REPLACE FUNCTION public.fn_classificacao_apply_row(
  p_staging_id uuid,
  p_overwrite  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_staging  financeiro_classificacao_staging%ROWTYPE;
  v_lanc     financeiro_lancamentos_v2%ROWTYPE;
  v_proposto jsonb;
  v_estado   jsonb;
  v_user_id  uuid;
BEGIN
  IF p_staging_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'p_staging_id obrigatorio', 'lancamento_id', NULL, 'estado_anterior', NULL);
  END IF;

  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'staging_nao_encontrada', 'lancamento_id', NULL, 'estado_anterior', NULL);
  END IF;

  -- Guard de ownership (cliente×usuário) — padrão existente (cliente_membros).
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id)
          OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'sem_permissao', 'lancamento_id', v_staging.match_lancamento_id, 'estado_anterior', NULL);
  END IF;

  -- Exige match resolvido (sem_match / ambíguo não resolvido → bloqueado).
  IF v_staging.match_lancamento_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'sem_lancamento_vinculado', 'lancamento_id', NULL, 'estado_anterior', NULL);
  END IF;

  SELECT * INTO v_lanc FROM financeiro_lancamentos_v2 WHERE id = v_staging.match_lancamento_id;
  IF NOT FOUND OR v_lanc.cancelado = true THEN
    UPDATE financeiro_classificacao_staging
      SET erro_apply = 'lancamento nao encontrado ou cancelado', aplicado = false
      WHERE staging_id = p_staging_id;
    RETURN jsonb_build_object('ok', false, 'aplicado', false, 'motivo', 'lancamento_inexistente_ou_cancelado', 'lancamento_id', v_staging.match_lancamento_id, 'estado_anterior', NULL);
  END IF;

  -- Conservador (lote): não sobrescreve subcentro já preenchido.
  IF NOT p_overwrite AND v_lanc.subcentro IS NOT NULL THEN
    UPDATE financeiro_classificacao_staging
      SET erro_apply = 'subcentro ja preenchido no banco (conservador)', aplicado = false, match_status = 'ja_classificado'
      WHERE staging_id = p_staging_id;
    RETURN jsonb_build_object('ok', true, 'aplicado', false, 'motivo', 'pulado_subcentro_preenchido', 'lancamento_id', v_lanc.id, 'estado_anterior', NULL);
  END IF;

  v_proposto := v_staging.update_proposto;

  -- Snapshot: preserva o ORIGINAL em re-apply (não re-snapshota).
  v_estado := COALESCE(v_staging.estado_anterior, jsonb_build_object(
    'subcentro',      v_lanc.subcentro,
    'macro_custo',    v_lanc.macro_custo,
    'grupo_custo',    v_lanc.grupo_custo,
    'centro_custo',   v_lanc.centro_custo,
    'plano_conta_id', v_lanc.plano_conta_id,
    'favorecido_id',  v_lanc.favorecido_id
  ));

  IF p_overwrite THEN
    -- Manual: proposto VENCE se presente; não-propostos mantêm o atual.
    UPDATE financeiro_lancamentos_v2 SET
      subcentro      = COALESCE(v_proposto->>'subcentro',    subcentro),
      macro_custo    = COALESCE(v_proposto->>'macro_custo',  macro_custo),
      grupo_custo    = COALESCE(v_proposto->>'grupo_custo',  grupo_custo),
      centro_custo   = COALESCE(v_proposto->>'centro_custo', centro_custo),
      plano_conta_id = COALESCE(NULLIF(v_proposto->>'plano_conta_id','')::uuid, plano_conta_id),
      favorecido_id  = COALESCE(NULLIF(v_proposto->>'favorecido_id','')::uuid, favorecido_id),
      updated_at     = now()
    WHERE id = v_lanc.id;
  ELSE
    -- Conservador (lote): só preenche NULL.
    UPDATE financeiro_lancamentos_v2 SET
      subcentro      = COALESCE(subcentro,      v_proposto->>'subcentro'),
      macro_custo    = COALESCE(macro_custo,    v_proposto->>'macro_custo'),
      grupo_custo    = COALESCE(grupo_custo,    v_proposto->>'grupo_custo'),
      centro_custo   = COALESCE(centro_custo,   v_proposto->>'centro_custo'),
      plano_conta_id = COALESCE(plano_conta_id, NULLIF(v_proposto->>'plano_conta_id','')::uuid),
      favorecido_id  = COALESCE(favorecido_id,  NULLIF(v_proposto->>'favorecido_id','')::uuid),
      updated_at     = now()
    WHERE id = v_lanc.id;
  END IF;

  UPDATE financeiro_classificacao_staging
    SET aplicado = true, aplicado_em = now(), aplicado_por = v_user_id, estado_anterior = v_estado, erro_apply = NULL
    WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object(
    'ok', true, 'aplicado', true,
    'motivo', CASE WHEN p_overwrite THEN 'aplicado_overwrite' ELSE 'aplicado_conservador' END,
    'lancamento_id', v_lanc.id, 'estado_anterior', v_estado
  );
END;
$function$;

-- ── Reversão: restaura o estado_anterior no lançamento e reabre a staging ────
CREATE OR REPLACE FUNCTION public.fn_classificacao_reverter_row(p_staging_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_staging financeiro_classificacao_staging%ROWTYPE;
  v_estado  jsonb;
  v_user_id uuid;
BEGIN
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_nao_encontrada'); END IF;

  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id)
          OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  IF v_staging.aplicado = false OR v_staging.estado_anterior IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nada_a_reverter');
  END IF;
  IF v_staging.match_lancamento_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_lancamento_vinculado');
  END IF;

  v_estado := v_staging.estado_anterior;
  UPDATE financeiro_lancamentos_v2 SET
    subcentro      = v_estado->>'subcentro',
    macro_custo    = v_estado->>'macro_custo',
    grupo_custo    = v_estado->>'grupo_custo',
    centro_custo   = v_estado->>'centro_custo',
    plano_conta_id = NULLIF(v_estado->>'plano_conta_id','')::uuid,
    favorecido_id  = NULLIF(v_estado->>'favorecido_id','')::uuid,
    updated_at     = now()
  WHERE id = v_staging.match_lancamento_id;

  UPDATE financeiro_classificacao_staging
    SET aplicado = false, aplicado_em = NULL, aplicado_por = NULL, estado_anterior = NULL, erro_apply = NULL
    WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object('ok', true, 'motivo', 'revertido', 'lancamento_id', v_staging.match_lancamento_id, 'estado_restaurado', v_estado);
END;
$function$;

-- ── Lote: agora ITERA chamando o core (regra única, conservador) ─────────────
CREATE OR REPLACE FUNCTION public.fn_classificacao_apply(p_sessao_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id        uuid;
  v_res       jsonb;
  v_aplicados int := 0;
  v_pulados   int := 0;
  v_erros     int := 0;
BEGIN
  IF p_sessao_id IS NULL THEN RAISE EXCEPTION 'p_sessao_id obrigatorio'; END IF;

  FOR v_id IN
    SELECT staging_id FROM financeiro_classificacao_staging
    WHERE sessao_id = p_sessao_id
      AND match_status = 'exato' AND aplicado = false AND match_lancamento_id IS NOT NULL
    ORDER BY excel_linha_origem
  LOOP
    v_res := public.fn_classificacao_apply_row(v_id, false);  -- lote = conservador
    IF (v_res->>'aplicado')::boolean THEN
      v_aplicados := v_aplicados + 1;
    ELSIF v_res->>'motivo' = 'pulado_subcentro_preenchido' THEN
      v_pulados := v_pulados + 1;
    ELSE
      v_erros := v_erros + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'sessao_id', p_sessao_id,
    'aplicados', v_aplicados,
    'pulados_subcentro_preenchido', v_pulados,
    'erros', v_erros
  );
END;
$function$;
