
CREATE TABLE public.fechamento_executivo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  fazenda_id uuid REFERENCES public.fazendas(id) ON DELETE CASCADE,
  ano integer NOT NULL,
  mes integer NOT NULL,
  periodo_texto text NOT NULL DEFAULT '',
  status_fechamento text NOT NULL DEFAULT 'rascunho',
  versao integer NOT NULL DEFAULT 1,
  usuario_gerador uuid,
  data_geracao timestamptz NOT NULL DEFAULT now(),
  data_fechamento timestamptz,
  observacoes_manuais text,
  pdf_url text,
  json_snapshot_indicadores jsonb NOT NULL DEFAULT '{}'::jsonb,
  json_snapshot_textos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cliente_id, fazenda_id, ano, mes, versao)
);

ALTER TABLE public.fechamento_executivo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.fechamento_executivo FOR SELECT TO authenticated
  USING ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));

CREATE POLICY "cliente_insert" ON public.fechamento_executivo FOR INSERT TO authenticated
  WITH CHECK ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));

CREATE POLICY "cliente_update" ON public.fechamento_executivo FOR UPDATE TO authenticated
  USING ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));

CREATE POLICY "cliente_delete" ON public.fechamento_executivo FOR DELETE TO authenticated
  USING ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));

CREATE TRIGGER update_fechamento_executivo_updated_at
  BEFORE UPDATE ON public.fechamento_executivo
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
