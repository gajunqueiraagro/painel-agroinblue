
-- Table: analise_consultor (mirrors fechamento_executivo structure)
CREATE TABLE public.analise_consultor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  fazenda_id uuid REFERENCES public.fazendas(id) ON DELETE CASCADE,
  ano integer NOT NULL,
  mes integer NOT NULL,
  versao integer NOT NULL DEFAULT 1,
  usuario_gerador uuid,
  data_geracao timestamptz NOT NULL DEFAULT now(),
  data_fechamento timestamptz,
  periodo_texto text NOT NULL DEFAULT '',
  status_fechamento text NOT NULL DEFAULT 'rascunho',
  observacoes_manuais text,
  json_blocos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX idx_analise_consultor_cliente ON public.analise_consultor(cliente_id);
CREATE INDEX idx_analise_consultor_periodo ON public.analise_consultor(cliente_id, ano, mes);

-- updated_at trigger
CREATE TRIGGER trg_analise_consultor_updated
  BEFORE UPDATE ON public.analise_consultor
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.analise_consultor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.analise_consultor FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));

CREATE POLICY "cliente_insert" ON public.analise_consultor FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));

CREATE POLICY "cliente_update" ON public.analise_consultor FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));

CREATE POLICY "cliente_delete" ON public.analise_consultor FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
