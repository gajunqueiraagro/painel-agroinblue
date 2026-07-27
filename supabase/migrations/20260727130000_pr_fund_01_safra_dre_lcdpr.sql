-- PR-FUND-01 — FUNDAÇÃO ADITIVA: escopo de Safra, compoe_dre e gera_lcdpr.
--   ADITIVO e NÃO destrutivo. Não altera o trigger vigente resolve_classificacao_from_plano.
--   Materialização INSERT-ONLY (fotografa a classificação; legado permanece NULL; SEM backfill).
--   Fora do escopo: DRE/relatórios, LCDPR-export, conta Virtual, OC, liquidação, telas.
--   Requer aplicação no PROTO (binbcdfbisgscrifztia). NUNCA em produção.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) financeiro_safras: escopo de negócio (nullable). CHECK aditivo aceitando os
--    três valores operacionais + NULL. Seguro: coluna nova ⇒ todas as linhas NULL,
--    nenhum dado vigente viola. (Diferente de financeiro_plano_contas.escopo_negocio,
--    que é texto livre sem CHECK — aqui a coluna nasce limpa e ganha integridade.)
--    NÃO faz backfill das safras existentes; NÃO altera nome/código/demais dados.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.financeiro_safras
  ADD COLUMN IF NOT EXISTS escopo_negocio text NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financeiro_safras_escopo_negocio_chk') THEN
    ALTER TABLE public.financeiro_safras
      ADD CONSTRAINT financeiro_safras_escopo_negocio_chk
      CHECK (escopo_negocio IS NULL OR escopo_negocio IN ('pecuaria','agricultura','administrativo'));
  END IF;
END $$;

COMMENT ON COLUMN public.financeiro_safras.escopo_negocio IS
  'Escopo de negócio da safra (pecuaria|agricultura|administrativo). NULL = não definido. PR-FUND-01.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) financeiro_plano_contas: dimensões gerenciais/fiscais.
--    compoe_dre: regra gerencial aprovada, PADRÃO Sim (NOT NULL DEFAULT true) —
--      as 156 linhas vigentes passam a true por padrão (decisão de produto).
--    gera_lcdpr: elegibilidade fiscal AINDA a validar → nullable, SEM default de massa.
--    NÃO altera escopo_negocio; NÃO reclassifica registros.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.financeiro_plano_contas
  ADD COLUMN IF NOT EXISTS compoe_dre boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS gera_lcdpr boolean NULL;

COMMENT ON COLUMN public.financeiro_plano_contas.compoe_dre IS
  'Default gerencial: a classificação compõe o DRE. PR-FUND-01 (padrão Sim).';
COMMENT ON COLUMN public.financeiro_plano_contas.gera_lcdpr IS
  'Default de elegibilidade fiscal LCDPR. NULL = ainda não definido/validado. PR-FUND-01.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) financeiro_lancamentos_v2: valores MATERIALIZADOS (fotografia da classificação).
--    Ambos nullable e SEM default de banco: NULL distingue o legado (≈81k linhas,
--    SEM backfill) do fato novo materializado.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.financeiro_lancamentos_v2
  ADD COLUMN IF NOT EXISTS compoe_dre boolean NULL,
  ADD COLUMN IF NOT EXISTS gera_lcdpr boolean NULL;

COMMENT ON COLUMN public.financeiro_lancamentos_v2.compoe_dre IS
  'Fotografia de compoe_dre da classificação no INSERT. NULL = legado (pré-PR-FUND-01). PR-FUND-01.';
COMMENT ON COLUMN public.financeiro_lancamentos_v2.gera_lcdpr IS
  'Fotografia de gera_lcdpr da classificação no INSERT. NULL = legado ou não definido. PR-FUND-01.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) MATERIALIZAÇÃO INSERT-ONLY. Trigger próprio (NÃO altera resolve_classificacao_from_plano).
--    Nome ordena APÓS trg_resolve_classificacao_plano ⇒ dispara depois da resolução
--    canônica (subcentro/macro/centro/plano já disponíveis). Só INSERT: nunca materializa
--    em UPDATE. Resolução canônica idêntica à vigente (prioriza plano_conta_id).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.materializar_dre_lcdpr_from_plano()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_found boolean := false;
  v_dre   boolean;
  v_lcdpr boolean;
BEGIN
  -- Resolução canônica (mesma ordem do trigger vigente): plano_conta_id (inequívoco) →
  --   subcentro+tipo_operacao → subcentro. Sem terceira regra divergente.
  IF NEW.plano_conta_id IS NOT NULL THEN
    SELECT pc.compoe_dre, pc.gera_lcdpr INTO v_dre, v_lcdpr
    FROM public.financeiro_plano_contas pc
    WHERE pc.id = NEW.plano_conta_id AND pc.ativo = true
    LIMIT 1;
    v_found := FOUND;
  ELSIF NEW.subcentro IS NOT NULL THEN
    SELECT pc.compoe_dre, pc.gera_lcdpr INTO v_dre, v_lcdpr
    FROM public.financeiro_plano_contas pc
    WHERE pc.ativo = true AND pc.subcentro = NEW.subcentro AND pc.tipo_operacao = NEW.tipo_operacao
    LIMIT 1;
    v_found := FOUND;
    IF NOT v_found THEN
      SELECT pc.compoe_dre, pc.gera_lcdpr INTO v_dre, v_lcdpr
      FROM public.financeiro_plano_contas pc
      WHERE pc.ativo = true AND pc.subcentro = NEW.subcentro
      LIMIT 1;
      v_found := FOUND;
    END IF;
  END IF;

  -- compoe_dre: preserva o informado explicitamente; senão fotografa o plano;
  --   sem plano resolvível ⇒ TRUE (padrão operacional aprovado).
  IF NEW.compoe_dre IS NULL THEN
    NEW.compoe_dre := CASE WHEN v_found THEN COALESCE(v_dre, true) ELSE true END;
  END IF;

  -- gera_lcdpr: preserva o informado explicitamente; senão fotografa SOMENTE quando o
  --   plano tiver valor EXPLÍCITO; caso contrário permanece NULL (não definido/validado).
  IF NEW.gera_lcdpr IS NULL AND v_found AND v_lcdpr IS NOT NULL THEN
    NEW.gera_lcdpr := v_lcdpr;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_zzz_materializar_dre_lcdpr ON public.financeiro_lancamentos_v2;
CREATE TRIGGER trg_zzz_materializar_dre_lcdpr
  BEFORE INSERT ON public.financeiro_lancamentos_v2
  FOR EACH ROW EXECUTE FUNCTION public.materializar_dre_lcdpr_from_plano();
