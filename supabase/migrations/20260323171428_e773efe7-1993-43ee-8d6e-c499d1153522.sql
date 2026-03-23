
-- 1. Tabela de categorias padrão do rebanho
CREATE TABLE public.categorias_rebanho (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  ordem_exibicao integer NOT NULL DEFAULT 0
);

ALTER TABLE public.categorias_rebanho ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view categorias" ON public.categorias_rebanho
  FOR SELECT TO authenticated USING (true);

-- Seed das categorias padrão
INSERT INTO public.categorias_rebanho (codigo, nome, ordem_exibicao) VALUES
  ('desmama_m', 'Desmama M', 1),
  ('garrotes', 'Garrotes', 2),
  ('bois', 'Bois', 3),
  ('touros', 'Touros', 4),
  ('desmama_f', 'Desmama F', 5),
  ('novilhas', 'Novilhas', 6),
  ('vacas', 'Vacas', 7),
  ('mamotes_m', 'Mamotes M', 8),
  ('mamotes_f', 'Mamotes F', 9);

-- 2. Tabela de pastos
CREATE TABLE public.pastos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  lote_padrao text,
  area_produtiva_ha numeric,
  tipo_uso text NOT NULL DEFAULT 'recria',
  qualidade integer CHECK (qualidade >= 1 AND qualidade <= 10),
  entra_conciliacao boolean NOT NULL DEFAULT true,
  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pastos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view pastos" ON public.pastos
  FOR SELECT TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can insert pastos" ON public.pastos
  FOR INSERT TO authenticated WITH CHECK (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can update pastos" ON public.pastos
  FOR UPDATE TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can delete pastos" ON public.pastos
  FOR DELETE TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));

-- Trigger updated_at
CREATE TRIGGER update_pastos_updated_at
  BEFORE UPDATE ON public.pastos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Fechamento mensal de pastos
CREATE TABLE public.fechamento_pastos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pasto_id uuid NOT NULL REFERENCES public.pastos(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  ano_mes text NOT NULL,
  status text NOT NULL DEFAULT 'rascunho',
  responsavel_nome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pasto_id, ano_mes)
);

ALTER TABLE public.fechamento_pastos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view fechamento_pastos" ON public.fechamento_pastos
  FOR SELECT TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can insert fechamento_pastos" ON public.fechamento_pastos
  FOR INSERT TO authenticated WITH CHECK (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can update fechamento_pastos" ON public.fechamento_pastos
  FOR UPDATE TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));
CREATE POLICY "Members can delete fechamento_pastos" ON public.fechamento_pastos
  FOR DELETE TO authenticated USING (is_fazenda_member(auth.uid(), fazenda_id));

CREATE TRIGGER update_fechamento_pastos_updated_at
  BEFORE UPDATE ON public.fechamento_pastos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Itens do fechamento (por categoria)
CREATE TABLE public.fechamento_pasto_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id uuid NOT NULL REFERENCES public.fechamento_pastos(id) ON DELETE CASCADE,
  categoria_id uuid NOT NULL REFERENCES public.categorias_rebanho(id),
  quantidade integer NOT NULL DEFAULT 0,
  peso_medio_kg numeric,
  lote text,
  observacoes text,
  origem_dado text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fechamento_pasto_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view fechamento_pasto_itens" ON public.fechamento_pasto_itens
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.fechamento_pastos fp WHERE fp.id = fechamento_id AND is_fazenda_member(auth.uid(), fp.fazenda_id))
  );
CREATE POLICY "Members can insert fechamento_pasto_itens" ON public.fechamento_pasto_itens
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.fechamento_pastos fp WHERE fp.id = fechamento_id AND is_fazenda_member(auth.uid(), fp.fazenda_id))
  );
CREATE POLICY "Members can update fechamento_pasto_itens" ON public.fechamento_pasto_itens
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.fechamento_pastos fp WHERE fp.id = fechamento_id AND is_fazenda_member(auth.uid(), fp.fazenda_id))
  );
CREATE POLICY "Members can delete fechamento_pasto_itens" ON public.fechamento_pasto_itens
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.fechamento_pastos fp WHERE fp.id = fechamento_id AND is_fazenda_member(auth.uid(), fp.fazenda_id))
  );
