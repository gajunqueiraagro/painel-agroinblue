CREATE OR REPLACE FUNCTION public.list_security_definer_views()
RETURNS TABLE(view_schema text, view_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT schemaname::text, viewname::text
  FROM pg_catalog.pg_views
  WHERE definition ILIKE '%security_definer%';
$$;