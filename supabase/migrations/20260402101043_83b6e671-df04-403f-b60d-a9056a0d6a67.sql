
DROP POLICY "system_insert" ON public.audit_log;

CREATE POLICY "system_insert" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))
    OR is_admin_agroinblue(auth.uid())
  );
