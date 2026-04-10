
-- 1. Replace guard trigger to remove import-based deletion block
CREATE OR REPLACE FUNCTION public.guard_financeiro_lancamento_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Historical import records are read-only for non-admins (UPDATE only)
  IF TG_OP = 'UPDATE'
     AND OLD.origem_lancamento = 'importacao_historica'
     AND NOT public.is_admin_agroinblue(auth.uid()) THEN
    RAISE EXCEPTION 'Lançamentos históricos no V2 são somente leitura para perfis não-admin.';
  END IF;

  -- No longer block DELETE for imported records - soft delete (cancelado=true) is the standard

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

-- 2. Replace the restrictive delete policy with a universal one
DROP POLICY IF EXISTS "cliente_delete_v2_controlado" ON public.financeiro_lancamentos_v2;

CREATE POLICY "cliente_delete_v2_universal"
ON public.financeiro_lancamentos_v2
FOR DELETE
TO authenticated
USING (
  cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid()))
);

-- 3. Also update can_manage function to not block by origin for deletions
CREATE OR REPLACE FUNCTION public.can_manage_financeiro_lancamento_v2(_cliente_id uuid, _origem_lancamento text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_admin_agroinblue(auth.uid())
    OR (
      _cliente_id IN (SELECT public.get_user_cliente_ids(auth.uid()))
      AND public.get_user_perfil(auth.uid(), _cliente_id) IN ('gestor_cliente'::public.perfil_acesso, 'financeiro'::public.perfil_acesso)
    );
$function$;
