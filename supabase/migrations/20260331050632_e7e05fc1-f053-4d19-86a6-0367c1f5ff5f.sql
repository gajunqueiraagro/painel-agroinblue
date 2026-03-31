
-- Table: store KML geometries linked to fazendas
CREATE TABLE public.pasto_geometrias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  pasto_id uuid REFERENCES public.pastos(id) ON DELETE SET NULL,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nome_original text,
  geojson jsonb NOT NULL,
  cor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pasto_geometrias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.pasto_geometrias FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.pasto_geometrias FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.pasto_geometrias FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.pasto_geometrias FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));

-- Table: condition records for pastos
CREATE TABLE public.pasto_condicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pasto_id uuid NOT NULL REFERENCES public.pastos(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  data_registro date NOT NULL DEFAULT CURRENT_DATE,
  condicao text NOT NULL DEFAULT 'bom',
  altura_pasto_cm numeric,
  cobertura_perc numeric,
  observacoes text,
  registrado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pasto_condicoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.pasto_condicoes FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_insert" ON public.pasto_condicoes FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_update" ON public.pasto_condicoes FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));
CREATE POLICY "cliente_delete" ON public.pasto_condicoes FOR DELETE TO authenticated
  USING (cliente_id IN (SELECT get_user_cliente_ids(auth.uid())) OR is_admin_agroinblue(auth.uid()));

-- Storage bucket for KML/KMZ files
INSERT INTO storage.buckets (id, name, public) VALUES ('kml-files', 'kml-files', false);

CREATE POLICY "authenticated_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kml-files');
CREATE POLICY "authenticated_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kml-files');
CREATE POLICY "authenticated_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'kml-files');
