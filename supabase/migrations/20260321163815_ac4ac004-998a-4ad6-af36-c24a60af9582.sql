
-- Add created_by and updated_by columns
ALTER TABLE public.lancamentos 
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- Create trigger to auto-set created_by and updated_by
CREATE OR REPLACE FUNCTION public.set_lancamento_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by = auth.uid();
    NEW.updated_by = auth.uid();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_by = auth.uid();
    NEW.created_by = OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_lancamento_audit
  BEFORE INSERT OR UPDATE ON public.lancamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_lancamento_audit_fields();
