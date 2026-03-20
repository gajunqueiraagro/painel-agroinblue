-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Fazendas table
CREATE TABLE public.fazendas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.fazendas ENABLE ROW LEVEL SECURITY;

-- Fazenda membros (shared access)
CREATE TABLE public.fazenda_membros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fazenda_id UUID NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  papel TEXT NOT NULL DEFAULT 'membro' CHECK (papel IN ('dono', 'membro')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(fazenda_id, user_id)
);
ALTER TABLE public.fazenda_membros ENABLE ROW LEVEL SECURITY;

-- Helper function to check fazenda membership
CREATE OR REPLACE FUNCTION public.is_fazenda_member(_user_id UUID, _fazenda_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fazenda_membros
    WHERE user_id = _user_id AND fazenda_id = _fazenda_id
  )
$$;

-- RLS for fazendas
CREATE POLICY "Members can view their fazendas" ON public.fazendas
  FOR SELECT USING (public.is_fazenda_member(auth.uid(), id));
CREATE POLICY "Auth users can create fazendas" ON public.fazendas
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can update fazendas" ON public.fazendas
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owners can delete fazendas" ON public.fazendas
  FOR DELETE USING (auth.uid() = owner_id);

-- RLS for fazenda_membros
CREATE POLICY "Members can view membros" ON public.fazenda_membros
  FOR SELECT USING (public.is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Owners can add membros" ON public.fazenda_membros
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.fazendas WHERE id = fazenda_id AND owner_id = auth.uid())
    OR auth.uid() = user_id
  );
CREATE POLICY "Owners can remove membros" ON public.fazenda_membros
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.fazendas WHERE id = fazenda_id AND owner_id = auth.uid())
  );

-- Lancamentos table
CREATE TABLE public.lancamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fazenda_id UUID NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  tipo TEXT NOT NULL,
  quantidade INTEGER NOT NULL,
  categoria TEXT NOT NULL,
  categoria_destino TEXT,
  fazenda_origem TEXT,
  fazenda_destino TEXT,
  peso_medio_kg NUMERIC,
  peso_medio_arrobas NUMERIC,
  preco_medio_cabeca NUMERIC,
  observacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view lancamentos" ON public.lancamentos
  FOR SELECT USING (public.is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can insert lancamentos" ON public.lancamentos
  FOR INSERT WITH CHECK (public.is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can update lancamentos" ON public.lancamentos
  FOR UPDATE USING (public.is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can delete lancamentos" ON public.lancamentos
  FOR DELETE USING (public.is_fazenda_member(auth.uid(), fazenda_id));

-- Saldos iniciais table
CREATE TABLE public.saldos_iniciais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fazenda_id UUID NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  categoria TEXT NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(fazenda_id, ano, categoria)
);
ALTER TABLE public.saldos_iniciais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view saldos" ON public.saldos_iniciais
  FOR SELECT USING (public.is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can insert saldos" ON public.saldos_iniciais
  FOR INSERT WITH CHECK (public.is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can update saldos" ON public.saldos_iniciais
  FOR UPDATE USING (public.is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can delete saldos" ON public.saldos_iniciais
  FOR DELETE USING (public.is_fazenda_member(auth.uid(), fazenda_id));

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_lancamentos_updated_at
  BEFORE UPDATE ON public.lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();