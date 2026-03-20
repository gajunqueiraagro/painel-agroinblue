
-- Function to check if two users share a fazenda
CREATE OR REPLACE FUNCTION public.shares_fazenda(_viewer_id uuid, _target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.fazenda_membros a
    JOIN public.fazenda_membros b ON a.fazenda_id = b.fazenda_id
    WHERE a.user_id = _viewer_id AND b.user_id = _target_user_id
  )
$$;

-- Allow members to see profiles of people in the same fazenda
CREATE POLICY "Members can view co-member profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.shares_fazenda(auth.uid(), user_id));

-- Allow fazenda_membros UPDATE for owners/gerentes (needed for role changes)
CREATE POLICY "Owners and gerentes can update membros"
  ON public.fazenda_membros
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fazenda_membros fm
      WHERE fm.fazenda_id = fazenda_membros.fazenda_id
        AND fm.user_id = auth.uid()
        AND fm.papel IN ('dono', 'gerente')
    )
  );
