
CREATE TABLE public.chuvas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fazenda_id UUID NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  milimetros NUMERIC NOT NULL DEFAULT 0,
  observacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE(fazenda_id, data)
);

ALTER TABLE public.chuvas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view chuvas" ON public.chuvas FOR SELECT USING (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can insert chuvas" ON public.chuvas FOR INSERT WITH CHECK (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can update chuvas" ON public.chuvas FOR UPDATE USING (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can delete chuvas" ON public.chuvas FOR DELETE USING (is_fazenda_member(auth.uid(), fazenda_id));
