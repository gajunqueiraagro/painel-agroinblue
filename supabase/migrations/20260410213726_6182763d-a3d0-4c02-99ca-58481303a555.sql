
-- 1) Remove FK constraint on cliente_id in financeiro_plano_contas
ALTER TABLE public.financeiro_plano_contas DROP CONSTRAINT IF EXISTS financeiro_plano_contas_cliente_id_fkey;

-- 2) Make cliente_id nullable (keep column for backward compat during transition)
ALTER TABLE public.financeiro_plano_contas ALTER COLUMN cliente_id DROP NOT NULL;

-- 3) Deduplicate: keep one row per unique (tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro)
-- Mark duplicates as inactive first, then delete them
DELETE FROM public.financeiro_plano_contas
WHERE id NOT IN (
  SELECT DISTINCT ON (tipo_operacao, macro_custo, COALESCE(grupo_custo,''), centro_custo, COALESCE(subcentro,''))
    id
  FROM public.financeiro_plano_contas
  WHERE ativo = true
  ORDER BY tipo_operacao, macro_custo, COALESCE(grupo_custo,''), centro_custo, COALESCE(subcentro,''), created_at ASC
);

-- 4) Set all remaining rows to cliente_id = NULL (global)
UPDATE public.financeiro_plano_contas SET cliente_id = NULL;

-- 5) Create unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS uq_plano_contas_global
ON public.financeiro_plano_contas (tipo_operacao, macro_custo, COALESCE(grupo_custo,''), centro_custo, COALESCE(subcentro,''))
WHERE ativo = true;

-- 6) Create financeiro_dividendos table
CREATE TABLE public.financeiro_dividendos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  ordem_exibicao integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7) RLS on financeiro_dividendos
ALTER TABLE public.financeiro_dividendos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view dividendos"
ON public.financeiro_dividendos FOR SELECT
TO authenticated
USING (public.is_cliente_member(auth.uid(), cliente_id));

CREATE POLICY "Managers can insert dividendos"
ON public.financeiro_dividendos FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin_agroinblue(auth.uid())
  OR (
    public.is_cliente_member(auth.uid(), cliente_id)
    AND public.get_user_perfil(auth.uid(), cliente_id) IN ('gestor_cliente', 'financeiro')
  )
);

CREATE POLICY "Managers can update dividendos"
ON public.financeiro_dividendos FOR UPDATE
TO authenticated
USING (
  public.is_admin_agroinblue(auth.uid())
  OR (
    public.is_cliente_member(auth.uid(), cliente_id)
    AND public.get_user_perfil(auth.uid(), cliente_id) IN ('gestor_cliente', 'financeiro')
  )
);

CREATE POLICY "Managers can delete dividendos"
ON public.financeiro_dividendos FOR DELETE
TO authenticated
USING (
  public.is_admin_agroinblue(auth.uid())
  OR (
    public.is_cliente_member(auth.uid(), cliente_id)
    AND public.get_user_perfil(auth.uid(), cliente_id) IN ('gestor_cliente', 'financeiro')
  )
);

-- 8) Index for quick lookup
CREATE INDEX idx_financeiro_dividendos_cliente ON public.financeiro_dividendos (cliente_id, ativo, ordem_exibicao);

-- 9) Update resolve_classificacao_from_plano to NOT filter by cliente_id
CREATE OR REPLACE FUNCTION public.resolve_classificacao_from_plano()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plano RECORD;
BEGIN
  IF NEW.subcentro IS NULL OR btrim(NEW.subcentro) = '' THEN
    RETURN NEW;
  END IF;

  -- Look up the official plano de contas entry (global, no client filter)
  SELECT id, macro_custo, grupo_custo, centro_custo, escopo_negocio, tipo_operacao
  INTO v_plano
  FROM public.financeiro_plano_contas
  WHERE ativo = true
    AND subcentro = NEW.subcentro
    AND tipo_operacao = NEW.tipo_operacao
  LIMIT 1;

  -- Fallback: match without tipo_operacao
  IF v_plano IS NULL THEN
    SELECT id, macro_custo, grupo_custo, centro_custo, escopo_negocio, tipo_operacao
    INTO v_plano
    FROM public.financeiro_plano_contas
    WHERE ativo = true
      AND subcentro = NEW.subcentro
    LIMIT 1;
  END IF;

  IF v_plano IS NOT NULL THEN
    NEW.plano_conta_id := v_plano.id;
    NEW.macro_custo    := v_plano.macro_custo;
    NEW.grupo_custo    := v_plano.grupo_custo;
    NEW.centro_custo   := v_plano.centro_custo;
    NEW.escopo_negocio := v_plano.escopo_negocio;
  END IF;

  RETURN NEW;
END;
$function$;
