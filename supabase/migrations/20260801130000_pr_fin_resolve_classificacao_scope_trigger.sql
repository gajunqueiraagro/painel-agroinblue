-- PR-FIN-RESOLVE-SCOPE-01 — Escopa trg_resolve_classificacao_plano para NÃO bloquear/reclassificar
--   em UPDATE administrativo (ex.: status_transacao, cancelado, data_pagamento).
--
--   PROBLEMA: o trigger vigente (criado em 20260625_resolve_classificacao_bloqueio_subcentro_orfao)
--   é BEFORE INSERT OR UPDATE sem UPDATE OF, sem WHEN e sem comparacao OLD x NEW. Assim, QUALQUER
--   UPDATE reexecuta a resolucao e o bloqueio B1 — inclusive um UPDATE que so muda status_transacao.
--   Isso (a) bloqueia o backfill status='meta'->'previsto' nas linhas legadas com subcentro orfao, e
--   (b) pode reescrever silenciosamente macro/grupo/centro/escopo em updates administrativos.
--
--   CORRECAO (2 partes, minimas e reversiveis):
--   1) GUARD interno OLD x NEW: em UPDATE, so resolve/valida quando pelo menos uma das 4 colunas
--      SOBERANAS mudou de valor — subcentro, tipo_operacao, plano_conta_id, macro_custo. Se as 4
--      permanecerem identicas, RETURN NEW imediato (sem consultar plano, sem revalidar, sem reescrever,
--      sem bloquear orfao). INSERT segue SEMPRE validado (T1/T2/B1/T3 intactos).
--   2) UPDATE OF nas mesmas 4 colunas no trigger: updates administrativos nem chamam a funcao.
--
--   ESCOPO SOBERANO x DERIVADO: grupo_custo, centro_custo e escopo_negocio NAO entram no guard —
--   sao saidas derivadas da funcao e nao devem, isoladamente, provocar nova resolucao.
--
--   PRESERVACAO: ramos T1/T2/B1/T3 copiados byte-a-byte de 20260625; mensagem e ERRCODE
--   ('check_violation') da excecao B1 inalterados; excecao macro_custo='Dividendos' inalterada;
--   sem SET search_path, sem SECURITY DEFINER, sem mudanca de volatility/owner; sem EXCEPTION handler;
--   sem session_replication_role; sem desabilitar triggers.
--
--   NAO ALTERA: trg_zzz_materializar_dre_lcdpr, materializar_dre_lcdpr_from_plano(), fn_compoe_dre_por_macro(),
--   dados existentes, os ~4.733 registros legados cancelados, nem o ledger. O nome do trigger e a ordem
--   r->z (resolve antes de zzz) sao preservados.
--
--   PRE-REQUISITO: DEVE ser aplicada ANTES de 20260802120000 (backfill meta->previsto).
--   Requer PROTO (binbcdfbisgscrifztia). NUNCA em producao.

CREATE OR REPLACE FUNCTION public.resolve_classificacao_from_plano()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      v_plano RECORD;
    BEGIN
      -- GUARD (PR-FIN-RESOLVE-SCOPE-01): em UPDATE, so resolver/validar quando ao menos uma das 4
      -- colunas soberanas mudou de valor. grupo/centro/escopo sao derivados e NAO entram no guard.
      IF TG_OP = 'UPDATE'
         AND NEW.subcentro      IS NOT DISTINCT FROM OLD.subcentro
         AND NEW.tipo_operacao  IS NOT DISTINCT FROM OLD.tipo_operacao
         AND NEW.plano_conta_id IS NOT DISTINCT FROM OLD.plano_conta_id
         AND NEW.macro_custo    IS NOT DISTINCT FROM OLD.macro_custo
      THEN
        RETURN NEW;
      END IF;

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

-- Recria SOMENTE trg_resolve_classificacao_plano com UPDATE OF nas 4 colunas soberanas.
-- Preserva nome e ordem r->z (BEFORE ROW, dispara antes de trg_zzz_materializar_dre_lcdpr).
DROP TRIGGER IF EXISTS trg_resolve_classificacao_plano ON public.financeiro_lancamentos_v2;
CREATE TRIGGER trg_resolve_classificacao_plano
  BEFORE INSERT OR UPDATE OF subcentro, tipo_operacao, plano_conta_id, macro_custo
  ON public.financeiro_lancamentos_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_classificacao_from_plano();
