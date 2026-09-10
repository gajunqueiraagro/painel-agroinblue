-- 20260910160000_fin_plano_chave_01.sql
-- PR-FIN-PLANO-CHAVE-01: plano_conta_id sempre gravado.
-- (1) trigger passa a escrever a chave ao resolver por subcentro (antes so copiava macro/grupo/centro/escopo);
-- (2) backfill dos lancamentos nao cancelados que tem subcentro em texto e chave nula.
-- Corpo da funcao lido do banco (md5 f285a4c23a7ec7ebca9d14fcda876c9f) e alterado em 6 linhas:
--   "SELECT id, ..." nas 3 tentativas e "NEW.plano_conta_id := v_plano.id" nas 3 (na T3 e no-op: mesmo id).
-- APLICADA no proto em 2026-09-10 via Management API, apos teste em ROLLBACK.

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
        SELECT id, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio
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
          NEW.plano_conta_id := v_plano.id;  -- PR-FIN-PLANO-CHAVE-01: chave sempre gravada
          RETURN NEW;
        END IF;

        -- Tentativa 2: só por subcentro (sem tipo_operacao)
        SELECT id, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio
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
          NEW.plano_conta_id := v_plano.id;  -- PR-FIN-PLANO-CHAVE-01: chave sempre gravada
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
        SELECT id, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio
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
          NEW.plano_conta_id := v_plano.id;  -- PR-FIN-PLANO-CHAVE-01: chave sempre gravada
        END IF;
      END IF;

      RETURN NEW;
    END;
    $function$;

-- (2) BACKFILL. Executado com session_replication_role = replica: sem 52 mil linhas de
-- auditoria, sem marcar "editado manualmente", sem recomputar DRE (as copias nao mudam).
-- Cancelados nao sao tocados. Nomes de subcentro sao unicos entre os globais ativos e nao
-- colidem com os por cliente (conferido 10/09).
SET LOCAL session_replication_role = replica;

UPDATE financeiro_lancamentos_v2 l
   SET plano_conta_id = p.id
  FROM financeiro_plano_contas p
 WHERE coalesce(l.cancelado,false) = false
   AND l.plano_conta_id IS NULL
   AND l.subcentro IS NOT NULL AND l.subcentro <> ''
   AND p.ativo
   AND p.subcentro = l.subcentro
   AND (p.cliente_id IS NULL OR p.cliente_id = l.cliente_id);

-- (3) Complementos aplicados na mesma tarde, com audit/editado_manual desligados na transacao:
--   - 524 lancamentos com copia de macro/grupo/centro defasada realinhados pelo plano;
--   - 6 faturas de cartao (tipo transferencia) com subcentro de despesa corrigidas para
--     'Transferência entre Contas Bancárias' (o modal gravava o que nao mostrava; FIN-TRANSF-SUBCENTRO-01).
UPDATE financeiro_lancamentos_v2 l
   SET subcentro = 'Transferência entre Contas Bancárias'
 WHERE coalesce(l.cancelado,false) = false
   AND l.tipo_operacao = '3-Transferências'
   AND l.descricao ILIKE '%fatura%'
   AND l.subcentro <> 'Transferência entre Contas Bancárias'
   AND l.data_competencia >= '2026-01-01';

UPDATE financeiro_lancamentos_v2 l
   SET macro_custo = p.macro_custo, grupo_custo = p.grupo_custo, centro_custo = p.centro_custo
  FROM financeiro_plano_contas p
 WHERE p.id = l.plano_conta_id
   AND coalesce(l.cancelado,false) = false
   AND (l.macro_custo IS DISTINCT FROM p.macro_custo
     OR l.grupo_custo IS DISTINCT FROM p.grupo_custo
     OR l.centro_custo IS DISTINCT FROM p.centro_custo);

-- Esperado apos aplicar (nao cancelados): com chave 69.369; texto sem chave 358;
-- copias divergentes 0; tipo do lancamento != tipo do plano 0 (fora a grafia legada '3-Transferência').
