-- ============================================================================
-- B1 — resolve_classificacao_from_plano: bloqueia subcentro orfao (fora do plano).
-- Trigger soberano (trg_resolve_classificacao_plano, BEFORE INSERT OR UPDATE em
-- financeiro_lancamentos_v2). Cobre os 2 motores (fn_promover_staging Cenario B
-- e fn_classificacao_apply Cenario A) de uma vez.
--
-- DELTA vs versao anterior: no gap do bloco "NEW.subcentro IS NOT NULL", APOS a
-- Tentativa 2 falhar e ANTES do END IF, RAISE check_violation quando o subcentro
-- nao existe no plano — EXCETO macro_custo='Dividendos' (exclusivos por cliente,
-- fora do plano global por design; IS DISTINCT FROM trata macro NULL como bloqueio).
-- Tentativas 1/2/3 e seus RETURN NEW intactos. CREATE OR REPLACE (a trigger
-- referencia a funcao por nome -> nao precisa DROP/CREATE TRIGGER).
--
-- Aplicada no proto via Management API e validada (gates 1-4); versionada aqui.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.resolve_classificacao_from_plano()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      v_plano RECORD;
    BEGIN
      -- Tentativa 1: resolver por subcentro + tipo_operacao (comportamento original)
      IF NEW.subcentro IS NOT NULL THEN
        SELECT macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio
        INTO v_plano
        FROM public.financeiro_plano_contas
        WHERE ativo = true
          AND subcentro = NEW.subcentro
          AND tipo_operacao = NEW.tipo_operacao
        LIMIT 1;

        IF FOUND THEN
          NEW.macro_custo    := v_plano.macro_custo;
          NEW.grupo_custo    := v_plano.grupo_custo;
          NEW.centro_custo   := v_plano.centro_custo;
          NEW.escopo_negocio := v_plano.escopo_negocio;
          RETURN NEW;
        END IF;

        -- Tentativa 2: só por subcentro (sem tipo_operacao)
        SELECT macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio
        INTO v_plano
        FROM public.financeiro_plano_contas
        WHERE ativo = true
          AND subcentro = NEW.subcentro
        LIMIT 1;

        IF FOUND THEN
          NEW.macro_custo    := v_plano.macro_custo;
          NEW.grupo_custo    := v_plano.grupo_custo;
          NEW.centro_custo   := v_plano.centro_custo;
          NEW.escopo_negocio := v_plano.escopo_negocio;
          RETURN NEW;
        END IF;

        -- B1: subcentro preenchido mas fora do plano (T1 e T2 falharam).
        -- Bloquear gravacao de subcentro cru, EXCETO dividendos (exclusivos por cliente, fora do plano global).
        IF NEW.macro_custo IS DISTINCT FROM 'Dividendos' THEN
          RAISE EXCEPTION 'Subcentro "%" nao existe no plano de contas. Selecione um subcentro canonico.', NEW.subcentro
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;

      -- Tentativa 3 (NOVO): fallback por plano_conta_id quando subcentro é null
      IF NEW.subcentro IS NULL AND NEW.plano_conta_id IS NOT NULL THEN
        SELECT macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio
        INTO v_plano
        FROM public.financeiro_plano_contas
        WHERE id = NEW.plano_conta_id
          AND ativo = true
        LIMIT 1;

        IF FOUND THEN
          NEW.subcentro      := v_plano.subcentro;
          NEW.macro_custo    := v_plano.macro_custo;
          NEW.grupo_custo    := v_plano.grupo_custo;
          NEW.centro_custo   := v_plano.centro_custo;
          NEW.escopo_negocio := v_plano.escopo_negocio;
        END IF;
      END IF;

      RETURN NEW;
    END;
    $function$;
