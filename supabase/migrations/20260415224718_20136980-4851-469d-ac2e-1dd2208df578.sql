
CREATE TABLE public.meta_parametros_nutricao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  ano integer NOT NULL,
  cria_custo_cab_mes numeric(10,2) DEFAULT 0,
  recria_custo_cab_mes numeric(10,2) DEFAULT 0,
  engorda_periodo_dias integer DEFAULT 80,
  engorda_consumo_kg_ms numeric(10,2) DEFAULT 5,
  engorda_custo_kg_ms numeric(10,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fazenda_id, ano)
);

ALTER TABLE public.meta_parametros_nutricao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros do cliente podem ver parametros nutricao"
  ON public.meta_parametros_nutricao FOR SELECT TO authenticated
  USING (
    cliente_id IN (SELECT cm.cliente_id FROM public.cliente_membros cm WHERE cm.user_id = auth.uid() AND cm.ativo = true)
  );

CREATE POLICY "Membros do cliente podem inserir parametros nutricao"
  ON public.meta_parametros_nutricao FOR INSERT TO authenticated
  WITH CHECK (
    cliente_id IN (SELECT cm.cliente_id FROM public.cliente_membros cm WHERE cm.user_id = auth.uid() AND cm.ativo = true)
  );

CREATE POLICY "Membros do cliente podem atualizar parametros nutricao"
  ON public.meta_parametros_nutricao FOR UPDATE TO authenticated
  USING (
    cliente_id IN (SELECT cm.cliente_id FROM public.cliente_membros cm WHERE cm.user_id = auth.uid() AND cm.ativo = true)
  );

CREATE POLICY "Membros do cliente podem deletar parametros nutricao"
  ON public.meta_parametros_nutricao FOR DELETE TO authenticated
  USING (
    cliente_id IN (SELECT cm.cliente_id FROM public.cliente_membros cm WHERE cm.user_id = auth.uid() AND cm.ativo = true)
  );

CREATE TRIGGER update_meta_parametros_nutricao_updated_at
  BEFORE UPDATE ON public.meta_parametros_nutricao
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
