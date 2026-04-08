
-- ============================================================
-- cfg_categoria_parametros — Parâmetros oficiais por categoria
-- ============================================================
-- NOTA ARQUITETURAL: o campo 'categoria_proxima' representa
-- o caminho DEFAULT de evolução na hierarquia.
-- NÃO representa todos os caminhos futuros possíveis.
-- Expansão para grafo de evolução fica para fase posterior.
-- ============================================================

CREATE TABLE public.cfg_categoria_parametros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_codigo TEXT NOT NULL,
  peso_min_kg NUMERIC NOT NULL,
  peso_max_kg NUMERIC NOT NULL,
  categoria_proxima TEXT,
  peso_evolucao_kg NUMERIC,
  ordem_hierarquia INT NOT NULL,
  grupo TEXT NOT NULL CHECK (grupo IN ('macho', 'femea')),
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_categoria_cliente UNIQUE (categoria_codigo, cliente_id)
);

-- Trigger updated_at
CREATE TRIGGER update_cfg_categoria_parametros_updated_at
  BEFORE UPDATE ON public.cfg_categoria_parametros
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.cfg_categoria_parametros ENABLE ROW LEVEL SECURITY;

-- Leitura: membros do cliente OU registros globais (is_default)
CREATE POLICY "Membros podem ver parâmetros do cliente ou globais"
  ON public.cfg_categoria_parametros FOR SELECT
  TO authenticated
  USING (
    cliente_id IS NULL
    OR public.is_cliente_member(auth.uid(), cliente_id)
    OR public.is_admin_agroinblue(auth.uid())
  );

-- Escrita: apenas admin
CREATE POLICY "Admin pode gerenciar parâmetros"
  ON public.cfg_categoria_parametros FOR ALL
  TO authenticated
  USING (public.is_admin_agroinblue(auth.uid()))
  WITH CHECK (public.is_admin_agroinblue(auth.uid()));

-- ============================================================
-- Seed: dados padrão globais
-- ============================================================
INSERT INTO public.cfg_categoria_parametros
  (categoria_codigo, peso_min_kg, peso_max_kg, categoria_proxima, peso_evolucao_kg, ordem_hierarquia, grupo, cliente_id, is_default)
VALUES
  ('mamotes_m', 30, 350, 'desmama_m', 150, 1, 'macho', NULL, true),
  ('desmama_m', 150, 350, 'garrotes', 200, 2, 'macho', NULL, true),
  ('garrotes',  200, 500, 'bois',     430, 3, 'macho', NULL, true),
  ('bois',      250, 750, NULL,       NULL, 4, 'macho', NULL, true),
  ('touros',    100, 1000, NULL,      NULL, 5, 'macho', NULL, true),
  ('mamotes_f', 30, 350, 'desmama_f', 150, 1, 'femea', NULL, true),
  ('desmama_f', 150, 350, 'novilhas', 200, 2, 'femea', NULL, true),
  ('novilhas',  200, 600, 'vacas',    350, 3, 'femea', NULL, true),
  ('vacas',     250, 750, NULL,       NULL, 4, 'femea', NULL, true);
