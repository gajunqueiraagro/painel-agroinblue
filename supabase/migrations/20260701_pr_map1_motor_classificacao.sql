-- ============================================================================
-- PR-MAP-1 — Base do Motor de Classificação Financeira.
--
-- Cria a tabela genérica de regras contextuais + a função resolver_contexto
-- (tiers determinísticos: regra composta → alias simples → plano direto
-- exato/unaccent/folha). NÃO toca o populate ainda (PR-MAP-2). Sem fuzzy/IA,
-- sem aprendizado. Resultado principal = plano_conta_id; subcentro/macro/grupo/
-- centro SEMPRE derivados do plano.
-- ============================================================================

-- ── Tabela de regras contextuais ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.financeiro_classificacao_regras (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    uuid,                              -- null = global
  ativo         boolean NOT NULL DEFAULT true,
  prioridade    int     NOT NULL DEFAULT 100,      -- maior vence
  origem        text    NOT NULL DEFAULT 'manual', -- 'seed'|'manual'|'aprendizado'
  -- CONDIÇÕES (NULL = ignora a dimensão):
  cond_subcentro     text,   -- igualdade normalizada (unaccent/lower/trim)
  cond_fornecedor    text,   -- contains (ILIKE, normalizado)
  cond_produto       text,   -- contains
  cond_observacao    text,   -- contains  (NJ)
  cond_conta_origem  text,   -- igualdade
  cond_conta_destino text,   -- igualdade
  cond_fazenda       text,   -- igualdade (código)
  cond_safra         text,   -- igualdade normalizada
  cond_tipo_operacao text,   -- igualdade
  cond_data_de       date,
  cond_data_ate      date,
  cond_valor_min     numeric,
  cond_valor_max     numeric,
  -- RESULTADO:
  plano_conta_id uuid NOT NULL REFERENCES public.financeiro_plano_contas(id),
  -- META:
  especificidade int GENERATED ALWAYS AS (
    (cond_subcentro     IS NOT NULL)::int + (cond_fornecedor    IS NOT NULL)::int +
    (cond_produto       IS NOT NULL)::int + (cond_observacao    IS NOT NULL)::int +
    (cond_conta_origem  IS NOT NULL)::int + (cond_conta_destino IS NOT NULL)::int +
    (cond_fazenda       IS NOT NULL)::int + (cond_safra         IS NOT NULL)::int +
    (cond_tipo_operacao IS NOT NULL)::int +
    ((cond_data_de IS NOT NULL OR cond_data_ate IS NOT NULL))::int +
    ((cond_valor_min IS NOT NULL OR cond_valor_max IS NOT NULL))::int
  ) STORED,
  observacao_regra text,
  created_by  uuid DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_class_regra_nao_vazia CHECK (
    cond_subcentro IS NOT NULL OR cond_fornecedor IS NOT NULL OR cond_produto IS NOT NULL
    OR cond_observacao IS NOT NULL OR cond_conta_origem IS NOT NULL OR cond_conta_destino IS NOT NULL
    OR cond_fazenda IS NOT NULL OR cond_safra IS NOT NULL OR cond_tipo_operacao IS NOT NULL
    OR cond_data_de IS NOT NULL OR cond_data_ate IS NOT NULL
    OR cond_valor_min IS NOT NULL OR cond_valor_max IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_class_regras_cliente_ativo ON public.financeiro_classificacao_regras (cliente_id, ativo);
CREATE INDEX IF NOT EXISTS idx_class_regras_subcentro     ON public.financeiro_classificacao_regras (lower(cond_subcentro));

-- RLS consistente com o padrão financeiro (permissiva; controle real via RPCs).
ALTER TABLE public.financeiro_classificacao_regras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financeiro_classificacao_regras_all ON public.financeiro_classificacao_regras;
CREATE POLICY financeiro_classificacao_regras_all ON public.financeiro_classificacao_regras
  FOR ALL USING (true) WITH CHECK (true);

-- ── Função resolver_contexto (read-only, tiers 1→3) ──────────────────────────
CREATE OR REPLACE FUNCTION public.fn_classificacao_resolver_contexto(p_cliente_id uuid, p_ctx jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_sub text; v_forn text; v_prod text; v_obs text; v_co text; v_cd text;
  v_faz text; v_safra text; v_tipo text; v_data date; v_valor numeric; v_folha text;
  v_regra record; v_alias record; v_plano record;
  v_pc uuid; v_tier text; v_regra_id uuid; v_alias_id uuid;
BEGIN
  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id)
          OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'tier', NULL, 'motivo', 'sem_permissao');
  END IF;

  v_sub   := NULLIF(trim(p_ctx->>'subcentro'), '');
  v_forn  := NULLIF(trim(p_ctx->>'fornecedor'), '');
  v_prod  := NULLIF(trim(p_ctx->>'produto'), '');
  v_obs   := NULLIF(trim(p_ctx->>'observacao'), '');
  v_co    := NULLIF(trim(p_ctx->>'conta_origem'), '');
  v_cd    := NULLIF(trim(p_ctx->>'conta_destino'), '');
  v_faz   := NULLIF(trim(p_ctx->>'fazenda_codigo'), '');
  v_safra := NULLIF(trim(COALESCE(p_ctx->>'safra', p_ctx->>'ano_mes')), '');
  v_tipo  := NULLIF(trim(p_ctx->>'tipo_operacao'), '');
  v_data  := NULLIF(p_ctx->>'data', '')::date;
  v_valor := NULLIF(p_ctx->>'valor', '')::numeric;

  -- TIER 1 — regra contextual composta (todas as condições ≠ null batendo).
  SELECT r.id AS id, r.plano_conta_id AS plano_conta_id INTO v_regra
  FROM public.financeiro_classificacao_regras r
  WHERE r.ativo = true
    AND (r.cliente_id = p_cliente_id OR r.cliente_id IS NULL)
    AND (r.cond_subcentro     IS NULL OR unaccent(lower(trim(r.cond_subcentro)))     = unaccent(lower(COALESCE(v_sub,''))))
    AND (r.cond_fornecedor    IS NULL OR (v_forn IS NOT NULL AND unaccent(lower(v_forn)) LIKE '%'||unaccent(lower(r.cond_fornecedor))||'%'))
    AND (r.cond_produto       IS NULL OR (v_prod IS NOT NULL AND unaccent(lower(v_prod)) LIKE '%'||unaccent(lower(r.cond_produto))||'%'))
    AND (r.cond_observacao    IS NULL OR (v_obs  IS NOT NULL AND unaccent(lower(v_obs))  LIKE '%'||unaccent(lower(r.cond_observacao))||'%'))
    AND (r.cond_conta_origem  IS NULL OR unaccent(lower(trim(r.cond_conta_origem)))  = unaccent(lower(COALESCE(v_co,''))))
    AND (r.cond_conta_destino IS NULL OR unaccent(lower(trim(r.cond_conta_destino))) = unaccent(lower(COALESCE(v_cd,''))))
    AND (r.cond_fazenda       IS NULL OR lower(trim(r.cond_fazenda)) = lower(COALESCE(v_faz,'')))
    AND (r.cond_safra         IS NULL OR unaccent(lower(trim(r.cond_safra))) = unaccent(lower(COALESCE(v_safra,''))))
    AND (r.cond_tipo_operacao IS NULL OR r.cond_tipo_operacao = v_tipo)
    AND (r.cond_data_de       IS NULL OR (v_data  IS NOT NULL AND v_data  >= r.cond_data_de))
    AND (r.cond_data_ate      IS NULL OR (v_data  IS NOT NULL AND v_data  <= r.cond_data_ate))
    AND (r.cond_valor_min     IS NULL OR (v_valor IS NOT NULL AND v_valor >= r.cond_valor_min))
    AND (r.cond_valor_max     IS NULL OR (v_valor IS NOT NULL AND v_valor <= r.cond_valor_max))
  ORDER BY r.prioridade DESC, r.especificidade DESC, r.created_at DESC
  LIMIT 1;
  IF FOUND THEN v_pc := v_regra.plano_conta_id; v_tier := 'regra'; v_regra_id := v_regra.id; END IF;

  -- TIER 2 — alias simples (subcentro → plano).
  IF v_pc IS NULL AND v_sub IS NOT NULL THEN
    SELECT a.id AS id, a.plano_conta_id AS plano_conta_id INTO v_alias
    FROM public.financeiro_subcentro_aliases a
    WHERE a.ativo = true
      AND (a.cliente_id = p_cliente_id OR a.cliente_id IS NULL)
      AND lower(trim(a.alias_text)) = lower(trim(v_sub))
    ORDER BY (a.cliente_id IS NOT NULL) DESC, a.created_at DESC
    LIMIT 1;
    IF FOUND THEN v_pc := v_alias.plano_conta_id; v_tier := 'alias'; v_alias_id := v_alias.id; END IF;
  END IF;

  -- TIER 3 — plano direto: exato → unaccent → folha (unaccent).
  IF v_pc IS NULL AND v_sub IS NOT NULL THEN
    SELECT id INTO v_pc FROM financeiro_plano_contas
     WHERE ativo AND (cliente_id = p_cliente_id OR cliente_id IS NULL)
       AND lower(trim(subcentro)) = lower(v_sub) LIMIT 1;
    IF v_pc IS NOT NULL THEN v_tier := 'plano_exato'; END IF;

    IF v_pc IS NULL THEN
      SELECT id INTO v_pc FROM financeiro_plano_contas
       WHERE ativo AND (cliente_id = p_cliente_id OR cliente_id IS NULL)
         AND unaccent(lower(trim(subcentro))) = unaccent(lower(v_sub)) LIMIT 1;
      IF v_pc IS NOT NULL THEN v_tier := 'plano_unaccent'; END IF;
    END IF;

    IF v_pc IS NULL THEN
      v_folha := trim(split_part(v_sub, '/', array_length(string_to_array(v_sub, '/'), 1)));
      SELECT id INTO v_pc FROM financeiro_plano_contas
       WHERE ativo AND (cliente_id = p_cliente_id OR cliente_id IS NULL)
         AND unaccent(lower(trim(subcentro))) = unaccent(lower(v_folha)) LIMIT 1;
      IF v_pc IS NOT NULL THEN v_tier := 'plano_folha'; END IF;
    END IF;
  END IF;

  IF v_pc IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'tier', NULL, 'regra_id', NULL, 'alias_id', NULL,
      'plano_conta_id', NULL, 'subcentro', NULL, 'macro_custo', NULL, 'grupo_custo', NULL,
      'centro_custo', NULL, 'confianca', NULL);
  END IF;

  SELECT subcentro, macro_custo, grupo_custo, centro_custo INTO v_plano
  FROM financeiro_plano_contas WHERE id = v_pc;

  RETURN jsonb_build_object('ok', true, 'tier', v_tier, 'regra_id', v_regra_id, 'alias_id', v_alias_id,
    'plano_conta_id', v_pc, 'subcentro', v_plano.subcentro, 'macro_custo', v_plano.macro_custo,
    'grupo_custo', v_plano.grupo_custo, 'centro_custo', v_plano.centro_custo, 'confianca', 'deterministica');
END;
$function$;
