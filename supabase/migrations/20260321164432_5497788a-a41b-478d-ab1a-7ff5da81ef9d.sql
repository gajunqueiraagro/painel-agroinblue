
CREATE TABLE public.fazenda_cadastros (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  ie text,
  proprietario_nome text,
  cpf_cnpj text,
  endereco text,
  email text,
  telefone text,
  banco text,
  pix text,
  area_total numeric,
  area_produtiva numeric,
  inscricao_rural text,
  roteiro text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(fazenda_id)
);

ALTER TABLE public.fazenda_cadastros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view cadastro"
  ON public.fazenda_cadastros FOR SELECT
  TO public
  USING (is_fazenda_member(auth.uid(), fazenda_id));

CREATE POLICY "Members can insert cadastro"
  ON public.fazenda_cadastros FOR INSERT
  TO public
  WITH CHECK (is_fazenda_member(auth.uid(), fazenda_id));

CREATE POLICY "Members can update cadastro"
  ON public.fazenda_cadastros FOR UPDATE
  TO public
  USING (is_fazenda_member(auth.uid(), fazenda_id));

CREATE POLICY "Members can delete cadastro"
  ON public.fazenda_cadastros FOR DELETE
  TO public
  USING (is_fazenda_member(auth.uid(), fazenda_id));

CREATE TRIGGER update_fazenda_cadastros_updated_at
  BEFORE UPDATE ON public.fazenda_cadastros
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
