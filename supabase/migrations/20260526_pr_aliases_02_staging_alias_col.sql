-- ====================================================================
-- PR-Aliases-Core (26/05/2026) — Coluna alias_id_usado na staging
-- ====================================================================
-- CONTRATO ARQUITETURAL: registra qual alias resolveu cada proposta
-- canônica, sem heurística. Audit trail estruturado (não dentro do JSON
-- update_proposto) para queries auditoriais limpas.
--
-- NULL = proposta não usou alias (lookup direto no plano, OU sem
-- resolução — string legada preservada).
-- UUID = alias específico que mapeou esta proposta.
-- ====================================================================

ALTER TABLE public.financeiro_classificacao_staging
  ADD COLUMN alias_id_usado uuid NULL
    REFERENCES public.financeiro_subcentro_aliases(id) ON DELETE SET NULL;

CREATE INDEX idx_staging_alias_id_usado
  ON public.financeiro_classificacao_staging (alias_id_usado)
  WHERE alias_id_usado IS NOT NULL;

COMMENT ON COLUMN public.financeiro_classificacao_staging.alias_id_usado IS
'PR-Aliases-Core: FK para o alias que resolveu esta proposta para o plano canônico. NULL = lookup direto ou sem resolução. Audit trail.';
