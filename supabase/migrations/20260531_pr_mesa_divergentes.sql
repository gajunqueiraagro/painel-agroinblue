-- ====================================================================
-- PR-MESA-DIVERGENTES (31/05/2026) — fn_classificacao_apply_divergente
-- ====================================================================
-- APLICA a reclassificação proposta pelo Excel em financeiro_lancamentos_v2
-- para UMA linha (p_staging_id) da staging com match_status='divergente'
-- E aplicado=false E match_lancamento_id IS NOT NULL.
--
-- DIFERENÇA OPERACIONAL para fn_classificacao_apply (exatos):
--   - Recebe p_staging_id (UMA row), não p_sessao_id. Trava de batch é
--     estrutural: a RPC não aceita sessão.
--   - SOBRESCREVE os campos do lançamento com os valores do update_proposto.
--     Não usa COALESCE (o objetivo aqui é substituir classificação existente).
--   - Não tem a defesa "pular se subcentro preenchido" — o caminho divergente
--     PRESUME que o banco tem classificação e o operador está confirmando
--     trocá-la pela do Excel.
--
-- IRREVERSIBILIDADE / ROLLBACK CIRÚRGICO:
--   Cada UPDATE preserva snapshot pré-UPDATE em estado_anterior (jsonb), igual
--   à fn_classificacao_apply. Reverter UMA linha:
--     UPDATE financeiro_lancamentos_v2 l
--     SET subcentro     = s.estado_anterior->>'subcentro',
--         macro_custo   = s.estado_anterior->>'macro_custo',
--         grupo_custo   = s.estado_anterior->>'grupo_custo',
--         centro_custo  = s.estado_anterior->>'centro_custo',
--         plano_conta_id = NULLIF(s.estado_anterior->>'plano_conta_id','')::uuid
--     FROM financeiro_classificacao_staging s
--     WHERE s.staging_id = '<staging_id>' AND l.id = s.match_lancamento_id;
--
--     UPDATE financeiro_classificacao_staging
--     SET aplicado=false, aplicado_em=NULL, aplicado_por=NULL,
--         estado_anterior=NULL
--     WHERE staging_id = '<staging_id>';
--
-- NÃO há trigger ou job que chame esta função automaticamente.
-- ====================================================================

DROP FUNCTION IF EXISTS public.fn_classificacao_apply_divergente(uuid);

CREATE FUNCTION public.fn_classificacao_apply_divergente(
  p_staging_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staging          financeiro_classificacao_staging%ROWTYPE;
  v_lanc             financeiro_lancamentos_v2%ROWTYPE;
  v_estado_anterior  jsonb;
  v_user_id          uuid;
  v_proposto         jsonb;
  v_has_subcentro    boolean;
  v_has_macro        boolean;
  v_has_grupo        boolean;
  v_has_centro       boolean;
  v_has_plano        boolean;
BEGIN
  IF p_staging_id IS NULL THEN
    RAISE EXCEPTION 'p_staging_id obrigatório';
  END IF;

  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- Carrega staging row
  SELECT * INTO v_staging
  FROM financeiro_classificacao_staging
  WHERE staging_id = p_staging_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'staging_id % não encontrado', p_staging_id;
  END IF;

  -- Guards de elegibilidade
  IF v_staging.match_status <> 'divergente' THEN
    RAISE EXCEPTION 'staging_id % não é divergente (match_status=%)',
      p_staging_id, v_staging.match_status;
  END IF;

  IF v_staging.aplicado = true THEN
    RAISE EXCEPTION 'staging_id % já foi aplicado', p_staging_id;
  END IF;

  IF v_staging.match_lancamento_id IS NULL THEN
    RAISE EXCEPTION 'staging_id % sem match_lancamento_id', p_staging_id;
  END IF;

  -- Carrega lançamento atual
  SELECT * INTO v_lanc
  FROM financeiro_lancamentos_v2
  WHERE id = v_staging.match_lancamento_id;

  IF NOT FOUND THEN
    UPDATE financeiro_classificacao_staging
    SET erro_apply = 'lancamento nao encontrado',
        aplicado = false
    WHERE staging_id = p_staging_id;
    RAISE EXCEPTION 'lançamento % não encontrado', v_staging.match_lancamento_id;
  END IF;

  IF v_lanc.cancelado = true THEN
    UPDATE financeiro_classificacao_staging
    SET erro_apply = 'lancamento cancelado',
        aplicado = false
    WHERE staging_id = p_staging_id;
    RAISE EXCEPTION 'lançamento % está cancelado', v_staging.match_lancamento_id;
  END IF;

  -- Snapshot pré-UPDATE
  v_estado_anterior := jsonb_build_object(
    'subcentro',      v_lanc.subcentro,
    'macro_custo',    v_lanc.macro_custo,
    'grupo_custo',    v_lanc.grupo_custo,
    'centro_custo',   v_lanc.centro_custo,
    'plano_conta_id', v_lanc.plano_conta_id,
    'favorecido_id',  v_lanc.favorecido_id
  );

  v_proposto := v_staging.update_proposto;

  -- Detecta quais campos vieram no update_proposto (sobrescreve só os presentes)
  v_has_subcentro := v_proposto ? 'subcentro';
  v_has_macro     := v_proposto ? 'macro_custo';
  v_has_grupo     := v_proposto ? 'grupo_custo';
  v_has_centro    := v_proposto ? 'centro_custo';
  v_has_plano     := v_proposto ? 'plano_conta_id';

  BEGIN
    -- UPDATE sobrescrevendo SOMENTE os campos presentes em update_proposto.
    -- Diferente de fn_classificacao_apply: sem COALESCE — objetivo é trocar.
    UPDATE financeiro_lancamentos_v2
    SET subcentro      = CASE WHEN v_has_subcentro
                              THEN v_proposto->>'subcentro'
                              ELSE subcentro END,
        macro_custo    = CASE WHEN v_has_macro
                              THEN v_proposto->>'macro_custo'
                              ELSE macro_custo END,
        grupo_custo    = CASE WHEN v_has_grupo
                              THEN v_proposto->>'grupo_custo'
                              ELSE grupo_custo END,
        centro_custo   = CASE WHEN v_has_centro
                              THEN v_proposto->>'centro_custo'
                              ELSE centro_custo END,
        plano_conta_id = CASE WHEN v_has_plano
                              THEN NULLIF(v_proposto->>'plano_conta_id','')::uuid
                              ELSE plano_conta_id END,
        updated_at     = now()
    WHERE id = v_staging.match_lancamento_id;

  EXCEPTION WHEN OTHERS THEN
    UPDATE financeiro_classificacao_staging
    SET erro_apply = SQLERRM,
        aplicado = false
    WHERE staging_id = p_staging_id;
    RAISE EXCEPTION '% (apply bloqueado)', SQLERRM;
  END;

  -- Marca staging como aplicado + grava snapshot
  UPDATE financeiro_classificacao_staging
  SET aplicado = true,
      aplicado_em = now(),
      aplicado_por = v_user_id,
      estado_anterior = v_estado_anterior,
      erro_apply = NULL
  WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object(
    'staging_id', p_staging_id,
    'lancamento_id', v_staging.match_lancamento_id,
    'aplicado', true
  );
END;
$$;

COMMENT ON FUNCTION public.fn_classificacao_apply_divergente(uuid) IS
  'PR-MESA-DIVERGENTES: aplica reclassificação proposta pelo Excel em UMA linha de financeiro_lancamentos_v2 (match_status=divergente, aplicado=false). SOBRESCREVE campos presentes em update_proposto (sem COALESCE). Recebe p_staging_id — trava de batch estrutural. Snapshot em estado_anterior para rollback. Chamada manual com confirmação explícita do operador na UI.';
