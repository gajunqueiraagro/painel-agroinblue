-- FECH-DOCS-01 (Gabriel, 12/10/2026): "Documentos do mes" — o livro do campeiro. Os papeis que o campo manda no mes (mapa de
-- rebanho, nascimentos, entradas, vendas, transferencias, mortes) ficam guardados por FAZENDA + MES, para conferencia humana no
-- Fechamento Area e em Lancar > Pecuaria. E' CADASTRO DE ARQUIVO: nenhum calculo, nenhum leitor do motor.
--   D1 tabela irma de `financeiro_saldo_documentos` (20261027121900), trocando a conta pela fazenda e ganhando `especie`.
--      Documento se CANCELA (com motivo), nunca se apaga: nao ha' policy nem privilegio de DELETE para `authenticated`.
--   D2 `especie` e' vocabulario fechado (CHECK). O arquivo nasce 'outro' com o nome que veio; renomear = UPDATE de especie/nome
--      com versao + 1 (a tela confere a versao que leu).
--   Bucket privado `pec-documentos`, com as MESMAS quatro policies do `fin-documentos` (a primeira pasta do caminho e' o cliente).
--   PDF, JPG e PNG ate' 10 MB — o que a tela diz que aceita.
-- NENHUMA FUNCAO E' CRIADA; nenhum dado existente e' tocado.
SET LOCAL lock_timeout = '2s';

CREATE TABLE public.pecuaria_fechamento_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  fazenda_id uuid NOT NULL REFERENCES public.fazendas(id),
  ano_mes text NOT NULL,
  especie text NOT NULL DEFAULT 'outro',
  nome text NOT NULL,
  url text,
  tamanho_bytes bigint,
  uploaded_em timestamptz NOT NULL DEFAULT now(),
  uploaded_por uuid,
  cancelado boolean NOT NULL DEFAULT false,
  cancelado_motivo text,
  cancelado_em timestamptz,
  cancelado_por uuid,
  versao integer NOT NULL DEFAULT 1,
  CONSTRAINT ck_pec_fech_doc_ano_mes CHECK (ano_mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT ck_pec_fech_doc_especie CHECK (especie IS NOT NULL AND especie IN
    ('mapa_rebanho', 'nascimentos', 'entradas', 'vendas', 'transferencias', 'mortes', 'outro')),
  CONSTRAINT ck_pec_fech_doc_nome CHECK (btrim(nome) <> ''),
  CONSTRAINT ck_pec_fech_doc_cancelado CHECK ((cancelado = false) OR (cancelado = true AND cancelado_motivo IS NOT NULL AND btrim(cancelado_motivo) <> ''))
);
CREATE INDEX ix_pec_fech_doc_fazenda_mes ON public.pecuaria_fechamento_documentos (cliente_id, fazenda_id, ano_mes);
COMMENT ON TABLE public.pecuaria_fechamento_documentos IS
  'FECH-DOCS-01 — documentos do mes da fazenda (livro do campeiro): PDF/imagem por fazenda + mes, com especie. Cancela-se com motivo, nunca se apaga. Bucket pec-documentos.';

ALTER TABLE public.pecuaria_fechamento_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY sel_pec_fech_doc ON public.pecuaria_fechamento_documentos FOR SELECT
  USING (public.is_admin_agroinblue() OR cliente_id IN (SELECT public.get_user_cliente_ids()));
CREATE POLICY ins_pec_fech_doc ON public.pecuaria_fechamento_documentos FOR INSERT
  WITH CHECK (public.is_admin_agroinblue() OR cliente_id IN (SELECT public.get_user_cliente_ids()));
CREATE POLICY upd_pec_fech_doc ON public.pecuaria_fechamento_documentos FOR UPDATE
  USING (public.is_admin_agroinblue() OR cliente_id IN (SELECT public.get_user_cliente_ids()))
  WITH CHECK (public.is_admin_agroinblue() OR cliente_id IN (SELECT public.get_user_cliente_ids()));

-- sem DELETE: nem policy, nem privilegio
REVOKE ALL ON TABLE public.pecuaria_fechamento_documentos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pecuaria_fechamento_documentos TO authenticated;
GRANT ALL ON TABLE public.pecuaria_fechamento_documentos TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pec-documentos', 'pec-documentos', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY pec_doc_admin ON storage.objects FOR ALL TO authenticated
  USING ((bucket_id = 'pec-documentos') AND public.is_admin_agroinblue(auth.uid()))
  WITH CHECK ((bucket_id = 'pec-documentos') AND public.is_admin_agroinblue(auth.uid()));
CREATE POLICY pec_doc_select ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'pec-documentos') AND ((storage.foldername(name))[1] IN (SELECT (public.get_user_cliente_ids(auth.uid()))::text)));
CREATE POLICY pec_doc_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'pec-documentos') AND ((storage.foldername(name))[1] IN (SELECT (public.get_user_cliente_ids(auth.uid()))::text)));
CREATE POLICY pec_doc_update ON storage.objects FOR UPDATE TO authenticated
  USING ((bucket_id = 'pec-documentos') AND ((storage.foldername(name))[1] IN (SELECT (public.get_user_cliente_ids(auth.uid()))::text)));

DO $confere$
begin
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.pecuaria_fechamento_documentos'::regclass) then
    raise exception 'FECH-DOCS-01: RLS desligada'; end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'pecuaria_fechamento_documentos') <> 3
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pecuaria_fechamento_documentos' and cmd in ('DELETE', 'ALL')) then
    raise exception 'FECH-DOCS-01: policies da tabela fora do esperado (3: SELECT, INSERT, UPDATE)'; end if;
  if has_table_privilege('authenticated', 'public.pecuaria_fechamento_documentos', 'DELETE')
     or has_table_privilege('anon', 'public.pecuaria_fechamento_documentos', 'SELECT')
     or not has_table_privilege('authenticated', 'public.pecuaria_fechamento_documentos', 'SELECT')
     or not has_table_privilege('authenticated', 'public.pecuaria_fechamento_documentos', 'INSERT')
     or not has_table_privilege('authenticated', 'public.pecuaria_fechamento_documentos', 'UPDATE') then
    raise exception 'FECH-DOCS-01: privilegios da tabela fora do esperado'; end if;
  if (select count(*) from storage.buckets where id = 'pec-documentos' and public = false and file_size_limit = 10485760) <> 1 then
    raise exception 'FECH-DOCS-01: bucket pec-documentos fora do esperado'; end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'pec\_doc\_%') <> 4 then
    raise exception 'FECH-DOCS-01: policies do bucket fora do esperado (4)'; end if;
end
$confere$;
