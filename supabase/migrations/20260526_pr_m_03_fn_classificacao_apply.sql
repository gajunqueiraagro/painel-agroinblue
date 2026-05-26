-- ====================================================================
-- PR-M (26/05/2026) — fn_classificacao_apply
-- ====================================================================
-- APLICA a classificação proposta em financeiro_lancamentos_v2 para
-- TODAS as linhas da staging com match_status='exato' E aplicado=false
-- da sessão informada. UPDATE conservador: NÃO sobrescreve campos já
-- preenchidos no banco (usa COALESCE).
--
-- ATENÇÃO — REGRA OPERACIONAL CRÍTICA:
--   Esta função é IRREVERSÍVEL automaticamente. Antes de chamar:
--
--     1. SELECT match_status, COUNT(*) AS qt
--        FROM financeiro_classificacao_staging
--        WHERE sessao_id = $1
--        GROUP BY match_status;
--
--     2. SELECT staging_id, excel_linha_origem, excel_subcentro,
--               match_lancamento_id, update_proposto
--        FROM financeiro_classificacao_staging
--        WHERE sessao_id = $1 AND match_status = 'exato'
--        ORDER BY excel_linha_origem;
--
--     3. Validar amostra com operador. CONFERIR especialmente que
--        update_proposto.subcentro bate com a expectativa.
--
--     4. SÓ ENTÃO: SELECT fn_classificacao_apply('<uuid>'::uuid);
--
-- Rollback cirúrgico (após apply):
--   Cada UPDATE preserva snapshot pré-UPDATE em estado_anterior (jsonb).
--   Para reverter UMA linha:
--     UPDATE financeiro_lancamentos_v2 l
--     SET subcentro     = s.estado_anterior->>'subcentro',
--         macro_custo   = s.estado_anterior->>'macro_custo',
--         grupo_custo   = s.estado_anterior->>'grupo_custo',
--         centro_custo  = s.estado_anterior->>'centro_custo',
--         plano_conta_id = NULLIF(s.estado_anterior->>'plano_conta_id','')::uuid,
--         favorecido_id = NULLIF(s.estado_anterior->>'favorecido_id','')::uuid
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

CREATE OR REPLACE FUNCTION public.fn_classificacao_apply(
  p_sessao_id uuid
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
  v_aplicados        int := 0;
  v_pulados_nao_null int := 0;
  v_erros            int := 0;
  v_proposto         jsonb;
BEGIN
  IF p_sessao_id IS NULL THEN
    RAISE EXCEPTION 'p_sessao_id obrigatório';
  END IF;

  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  FOR v_staging IN
    SELECT *
    FROM financeiro_classificacao_staging
    WHERE sessao_id = p_sessao_id
      AND match_status = 'exato'
      AND aplicado = false
      AND match_lancamento_id IS NOT NULL
    ORDER BY excel_linha_origem
  LOOP
    BEGIN
      -- Carrega lançamento atual
      SELECT * INTO v_lanc
      FROM financeiro_lancamentos_v2
      WHERE id = v_staging.match_lancamento_id;

      IF NOT FOUND THEN
        -- Lanc deletado/cancelado entre populate e apply
        UPDATE financeiro_classificacao_staging
        SET erro_apply = 'lancamento nao encontrado',
            aplicado = false
        WHERE staging_id = v_staging.staging_id;
        v_erros := v_erros + 1;
        CONTINUE;
      END IF;

      -- Defesa em profundidade: NÃO atualizar se subcentro já está preenchido
      -- (o populate só marca 'exato' quando NULL, mas pode ter mudado entre
      -- populate e apply — janela de corrida).
      IF v_lanc.subcentro IS NOT NULL THEN
        UPDATE financeiro_classificacao_staging
        SET erro_apply = 'subcentro ja preenchido no banco apos populate (corrida)',
            aplicado = false,
            match_status = 'ja_classificado'
        WHERE staging_id = v_staging.staging_id;
        v_pulados_nao_null := v_pulados_nao_null + 1;
        CONTINUE;
      END IF;

      -- Snapshot pré-UPDATE
      v_estado_anterior := jsonb_build_object(
        'subcentro',     v_lanc.subcentro,
        'macro_custo',   v_lanc.macro_custo,
        'grupo_custo',   v_lanc.grupo_custo,
        'centro_custo',  v_lanc.centro_custo,
        'plano_conta_id', v_lanc.plano_conta_id,
        'favorecido_id', v_lanc.favorecido_id
      );

      v_proposto := v_staging.update_proposto;

      -- UPDATE conservador: COALESCE garante que campos não sobrescrevem
      -- existentes. Como já confirmamos subcentro NULL acima, o subcentro
      -- do Excel sempre entra; macro/grupo/centro/plano/favorecido entram
      -- só se o banco estiver NULL nesses campos.
      UPDATE financeiro_lancamentos_v2
      SET subcentro      = COALESCE(subcentro,     v_proposto->>'subcentro'),
          macro_custo    = COALESCE(macro_custo,   v_proposto->>'macro_custo'),
          grupo_custo    = COALESCE(grupo_custo,   v_proposto->>'grupo_custo'),
          centro_custo   = COALESCE(centro_custo,  v_proposto->>'centro_custo'),
          plano_conta_id = COALESCE(plano_conta_id,
                                     NULLIF(v_proposto->>'plano_conta_id','')::uuid),
          favorecido_id  = COALESCE(favorecido_id,
                                     NULLIF(v_proposto->>'favorecido_id','')::uuid),
          updated_at     = now()
      WHERE id = v_staging.match_lancamento_id;

      -- Marca staging como aplicado + grava snapshot
      UPDATE financeiro_classificacao_staging
      SET aplicado = true,
          aplicado_em = now(),
          aplicado_por = v_user_id,
          estado_anterior = v_estado_anterior,
          erro_apply = NULL
      WHERE staging_id = v_staging.staging_id;

      v_aplicados := v_aplicados + 1;

    EXCEPTION WHEN OTHERS THEN
      UPDATE financeiro_classificacao_staging
      SET erro_apply = SQLERRM,
          aplicado = false
      WHERE staging_id = v_staging.staging_id;
      v_erros := v_erros + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'sessao_id', p_sessao_id,
    'aplicados', v_aplicados,
    'pulados_subcentro_preenchido', v_pulados_nao_null,
    'erros', v_erros
  );
END;
$$;

COMMENT ON FUNCTION fn_classificacao_apply IS
  'PR-M: aplica UPDATE em financeiro_lancamentos_v2 a partir da staging. APENAS rows match_status=exato e aplicado=false. NUNCA sobrescreve campos já preenchidos (COALESCE). Sempre grava estado_anterior para rollback. Chamada manual explícita — sem trigger/job automático.';
