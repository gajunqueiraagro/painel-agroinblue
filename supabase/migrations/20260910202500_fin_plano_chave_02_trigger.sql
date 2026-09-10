-- 20260910202500_fin_plano_chave_02_trigger.sql
-- PR-FIN-PLANO-CHAVE-02 (trigger): plano_conta_id e a FONTE; o texto (subcentro, macro,
-- grupo, centro, escopo) e cache. Quem manda e o que MUDOU na gravacao:
--   chave mudou (ou INSERT com chave)     -> chave resolve o texto
--   so o texto mudou (front legado)       -> texto resolve a chave
--   nada dos dois mudou, chave presente   -> chave
--   sem chave                             -> texto
--   chave aponta para plano inativo       -> cai para o texto
-- O front de hoje (que manda so o texto) continua funcionando sem alteracao.
-- Passo seguinte: FIN-PLANO-CHAVE-02 no front (payload manda plano_conta_id).
-- APLICADA no proto em 2026-09-10 via Management API, apos teste em ROLLBACK.

CREATE OR REPLACE FUNCTION public.resolve_classificacao_from_plano()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      v_plano RECORD;
      v_chave_manda boolean;
    BEGIN
      -- GUARD (PR-FIN-RESOLVE-SCOPE-01): em UPDATE, so resolver quando uma das 4 colunas soberanas mudou.
      IF TG_OP = 'UPDATE'
         AND NEW.subcentro      IS NOT DISTINCT FROM OLD.subcentro
         AND NEW.tipo_operacao  IS NOT DISTINCT FROM OLD.tipo_operacao
         AND NEW.plano_conta_id IS NOT DISTINCT FROM OLD.plano_conta_id
         AND NEW.macro_custo    IS NOT DISTINCT FROM OLD.macro_custo
      THEN
        RETURN NEW;
      END IF;

      -- PR-FIN-PLANO-CHAVE-02: a CHAVE e a fonte; o texto e cache.
      -- Quem manda e o que MUDOU nesta gravacao:
      --   chave mudou (ou INSERT com chave)      -> chave resolve o texto
      --   so o texto mudou                       -> texto resolve a chave (front legado)
      --   nenhum dos dois mudou, chave presente  -> chave
      --   sem chave                              -> texto
      v_chave_manda := NEW.plano_conta_id IS NOT NULL AND (
          TG_OP = 'INSERT'
          OR NEW.plano_conta_id IS DISTINCT FROM OLD.plano_conta_id
          OR NEW.subcentro IS NOT DISTINCT FROM OLD.subcentro
      );

      IF v_chave_manda THEN
        SELECT id, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio
          INTO v_plano
          FROM public.financeiro_plano_contas
         WHERE id = NEW.plano_conta_id AND ativo = true
         LIMIT 1;
        IF FOUND THEN
          NEW.subcentro      := v_plano.subcentro;
          NEW.macro_custo    := v_plano.macro_custo;
          NEW.grupo_custo    := v_plano.grupo_custo;
          NEW.centro_custo   := v_plano.centro_custo;
          NEW.escopo_negocio := v_plano.escopo_negocio;
          RETURN NEW;
        END IF;
        -- chave aponta para plano inexistente/inativo: cai para o texto
      END IF;

      -- Tentativa 1: por subcentro + tipo_operacao
      IF NEW.subcentro IS NOT NULL THEN
        SELECT id, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio
          INTO v_plano
          FROM public.financeiro_plano_contas
         WHERE ativo = true AND subcentro = NEW.subcentro AND tipo_operacao = NEW.tipo_operacao
         LIMIT 1;
        IF FOUND THEN
          NEW.macro_custo    := v_plano.macro_custo;
          NEW.grupo_custo    := v_plano.grupo_custo;
          NEW.centro_custo   := v_plano.centro_custo;
          NEW.escopo_negocio := v_plano.escopo_negocio;
          NEW.plano_conta_id := v_plano.id;
          RETURN NEW;
        END IF;

        -- Tentativa 2: so por subcentro
        SELECT id, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio
          INTO v_plano
          FROM public.financeiro_plano_contas
         WHERE ativo = true AND subcentro = NEW.subcentro
         LIMIT 1;
        IF FOUND THEN
          NEW.macro_custo    := v_plano.macro_custo;
          NEW.grupo_custo    := v_plano.grupo_custo;
          NEW.centro_custo   := v_plano.centro_custo;
          NEW.escopo_negocio := v_plano.escopo_negocio;
          NEW.plano_conta_id := v_plano.id;
          RETURN NEW;
        END IF;

        -- B1: subcentro fora do plano. Bloqueia, exceto dividendos (por cliente, fora do plano global).
        IF NEW.macro_custo IS DISTINCT FROM 'Dividendos' THEN
          RAISE EXCEPTION 'Subcentro "%" nao existe no plano de contas. Selecione um subcentro canonico.', NEW.subcentro
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;

      RETURN NEW;
    END;
    $function$;
