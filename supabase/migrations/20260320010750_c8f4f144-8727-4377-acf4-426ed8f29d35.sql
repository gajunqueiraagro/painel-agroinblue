-- Allow owners to SELECT their own fazendas (needed for INSERT...RETURNING)
CREATE POLICY "Owners can view own fazendas" ON public.fazendas
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

-- Auto-add owner as membro on fazenda creation
CREATE OR REPLACE FUNCTION public.auto_add_owner_as_membro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.fazenda_membros (fazenda_id, user_id, papel)
  VALUES (NEW.id, NEW.owner_id, 'dono');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_fazenda_created
  AFTER INSERT ON public.fazendas
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_add_owner_as_membro();