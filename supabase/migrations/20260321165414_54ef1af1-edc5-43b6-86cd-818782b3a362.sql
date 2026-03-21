
DROP POLICY IF EXISTS "Members can insert cadastro" ON public.fazenda_cadastros;

CREATE POLICY "Members can insert cadastro"
  ON public.fazenda_cadastros
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_fazenda_member(auth.uid(), fazenda_id));
