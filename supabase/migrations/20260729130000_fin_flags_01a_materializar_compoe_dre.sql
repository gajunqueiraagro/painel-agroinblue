-- FIN-FLAGS-01A — Fase 4: MATERIALIZAÇÃO de compoe_dre em INSERT e UPDATE.
--   Estende a função central já existente (materializar_dre_lcdpr_from_plano) e passa o trigger
--   trg_zzz_materializar_dre_lcdpr a disparar em INSERT OR UPDATE. Uma única função central para
--   compoe_dre; o comportamento de gera_lcdpr é PRESERVADO VERBATIM (materializa só no INSERT).
--   Nome `zzz` continua ordenando APÓS trg_resolve_classificacao_plano (que roda em INSERT e UPDATE
--   e resolve macro/grupo/centro a partir de subcentro/plano) ⇒ a classificação já está resolvida
--   quando materializamos, e o snapshot é visto pelo trg_audit_financeiro_v2 (AFTER UPDATE).
--   Requer PROTO (binbcdfbisgscrifztia). NUNCA em produção.

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper central da MATRIZ (fonte única, sem acesso a tabela ⇒ IMMUTABLE).
--   Transferência (tipo_operacao ILIKE '3-%') é SOBERANA e retorna false.
--   Fora da matriz ⇒ NULL (nunca `true` por exclusão). Usado pelo trigger e pelo backfill.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_compoe_dre_por_macro(p_tipo text, p_macro text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN p_tipo ILIKE '3-%' THEN false                                   -- transferência soberana
    WHEN p_macro IN ('Transferências','Entre Contas','Dividendos',
                     'Entrada Financeira','Saída Financeira','Financeiro') THEN false
    WHEN p_macro IN ('Receita Operacional','Custeio Produção','Deduções de Receitas',
                     'Investimento na Fazenda','Investimento em Bovinos','Tributos') THEN true
    ELSE NULL                                                            -- sem regra determinística
  END;
$fn$;

COMMENT ON FUNCTION public.fn_compoe_dre_por_macro(text, text) IS
  'Matriz DRE soberana (FIN-FLAGS-01A): transferência 3-* ⇒ false; macros da matriz ⇒ true/false; '
  'fora da matriz ⇒ NULL. Sem acesso a tabela; IMMUTABLE.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Função central: compoe_dre (INSERT + UPDATE) + gera_lcdpr (INSERT, preservado).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.materializar_dre_lcdpr_from_plano()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_found boolean := false;
  v_dre   boolean;   -- compoe_dre do plano (FALLBACK: só quando a macro está fora da matriz)
  v_lcdpr boolean;   -- gera_lcdpr herdado do plano (LÓGICA PRESERVADA — PR-FUND-01)
  v_reclass boolean;
BEGIN
  -- Resolução canônica do plano (por plano_conta_id → subcentro+tipo → subcentro), idêntica ao
  -- comportamento vigente. Base para gera_lcdpr e para o FALLBACK de compoe_dre. A matriz por macro
  -- é SOBERANA sobre o plano: o plano só decide quando a macro não tem regra na matriz.
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

  -- ══════════════════ compoe_dre ══════════════════
  -- PRECEDÊNCIA SOBERANA: (1) transferência 3-* → false; (2) matriz por macro; (3) plano só como
  -- FALLBACK quando a macro está fora da matriz; (4) NULL sem regra segura. Nunca ELSE true / COALESCE(...,true).
  IF TG_OP = 'INSERT' THEN
    IF NEW.tipo_operacao ILIKE '3-%' THEN
      NEW.compoe_dre := false;                                 -- (1) transferência soberana (sobrepõe explícito)
    ELSIF NEW.compoe_dre IS NOT NULL THEN
      NULL;                                                    -- override explícito informado: preservar
    ELSE
      NEW.compoe_dre := COALESCE(
        public.fn_compoe_dre_por_macro(NEW.tipo_operacao, NEW.macro_custo),  -- (2) matriz por macro (soberana)
        CASE WHEN v_found THEN v_dre END);                                    -- (3) plano só se a macro estiver fora da matriz; senão (4) NULL
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.tipo_operacao ILIKE '3-%' THEN
      NEW.compoe_dre := false;                                 -- (1) transferência soberana
    ELSE
      -- Reclassificação estrutural? (resolve_classificacao já reescreveu NEW.macro/grupo/centro)
      v_reclass := (
           NEW.plano_conta_id IS DISTINCT FROM OLD.plano_conta_id
        OR NEW.macro_custo    IS DISTINCT FROM OLD.macro_custo
        OR NEW.grupo_custo    IS DISTINCT FROM OLD.grupo_custo
        OR NEW.centro_custo   IS DISTINCT FROM OLD.centro_custo
        OR NEW.subcentro      IS DISTINCT FROM OLD.subcentro
        OR NEW.tipo_operacao  IS DISTINCT FROM OLD.tipo_operacao
      );
      IF v_reclass THEN
        -- Descarta override manual anterior e recalcula com a MESMA precedência: matriz → plano(fallback) → NULL.
        NEW.compoe_dre := COALESCE(
          public.fn_compoe_dre_por_macro(NEW.tipo_operacao, NEW.macro_custo),  -- (2) matriz soberana
          CASE WHEN v_found THEN v_dre END);                                    -- (3) plano fallback / (4) NULL
      ELSE
        NULL;                                                  -- sem reclassificação: preserva o valor enviado (override manual)
      END IF;
    END IF;
  END IF;

  -- ══════════════════ gera_lcdpr (PRESERVADO — só INSERT; não alterar) ══════════════════
  IF TG_OP = 'INSERT' AND NEW.gera_lcdpr IS NULL AND v_found AND v_lcdpr IS NOT NULL THEN
    NEW.gera_lcdpr := v_lcdpr;
  END IF;

  RETURN NEW;
END;
$fn$;

-- Trigger passa a cobrir INSERT OR UPDATE (era INSERT-only). Ordem determinística por nome:
-- trg_resolve_classificacao_plano < trg_zzz_materializar_dre_lcdpr < update_fin_lanc_v2_updated_at.
DROP TRIGGER IF EXISTS trg_zzz_materializar_dre_lcdpr ON public.financeiro_lancamentos_v2;
CREATE TRIGGER trg_zzz_materializar_dre_lcdpr
  BEFORE INSERT OR UPDATE ON public.financeiro_lancamentos_v2
  FOR EACH ROW EXECUTE FUNCTION public.materializar_dre_lcdpr_from_plano();
