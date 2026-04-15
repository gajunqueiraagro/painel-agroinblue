-- Add attachment URL columns to lancamentos
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS anexo_nf_url text,
  ADD COLUMN IF NOT EXISTS anexo_acerto_url text;

-- Create storage bucket for abate attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('abate-anexos', 'abate-anexos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for abate-anexos bucket
CREATE POLICY "Authenticated users can view abate attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'abate-anexos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can upload abate attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'abate-anexos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update abate attachments"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'abate-anexos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete abate attachments"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'abate-anexos' AND auth.role() = 'authenticated');