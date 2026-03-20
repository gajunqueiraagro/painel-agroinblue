-- Fix fazendas INSERT policy to be explicit for authenticated users
DROP POLICY "Auth users can create fazendas" ON public.fazendas;
CREATE POLICY "Auth users can create fazendas" ON public.fazendas
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

-- Fix fazenda_membros INSERT policy - owner inserting themselves needs to work
DROP POLICY "Owners can add membros" ON public.fazenda_membros;
CREATE POLICY "Authenticated can add membros" ON public.fazenda_membros
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.fazendas WHERE id = fazenda_id AND owner_id = auth.uid())
    OR auth.uid() = user_id
  );