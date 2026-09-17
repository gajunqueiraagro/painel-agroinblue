-- Anexos (PDF/imagem) do extrato de uma conta num mes, para conferencia visual
-- humana do saldo. Varios por conta+mes. Bucket fin-documentos. Documento se
-- cancela, nao se apaga (sem DELETE pra nao-admin).
CREATE TABLE IF NOT EXISTS public.financeiro_saldo_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  conta_bancaria_id uuid NOT NULL REFERENCES public.financeiro_contas_bancarias(id),
  ano_mes text NOT NULL,
  nome text NOT NULL,
  tipo text,
  url text,
  tamanho_bytes bigint,
  uploaded_em timestamptz NOT NULL DEFAULT now(),
  uploaded_por uuid,
  cancelado boolean NOT NULL DEFAULT false,
  cancelado_em timestamptz,
  cancelado_por uuid,
  cancelado_motivo text,
  versao integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT ck_saldo_doc_ano_mes CHECK (ano_mes ~ '^\d{4}-\d{2}$'),
  CONSTRAINT ck_saldo_doc_cancelado CHECK ((cancelado = false) OR (cancelado = true AND cancelado_motivo IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ix_saldo_doc_conta_mes ON public.financeiro_saldo_documentos (cliente_id, conta_bancaria_id, ano_mes) WHERE cancelado = false;
ALTER TABLE public.financeiro_saldo_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY sel_saldo_doc ON public.financeiro_saldo_documentos FOR SELECT USING (public.is_admin_agroinblue() OR cliente_id IN (SELECT public.get_user_cliente_ids()));
CREATE POLICY ins_saldo_doc ON public.financeiro_saldo_documentos FOR INSERT WITH CHECK (public.is_admin_agroinblue() OR cliente_id IN (SELECT public.get_user_cliente_ids()));
CREATE POLICY upd_saldo_doc ON public.financeiro_saldo_documentos FOR UPDATE USING (public.is_admin_agroinblue() OR cliente_id IN (SELECT public.get_user_cliente_ids()));
COMMENT ON TABLE public.financeiro_saldo_documentos IS 'Anexos (PDF/imagem) do extrato de uma conta num mes, para conferencia visual humana do saldo. Varios por conta+mes. Bucket fin-documentos.';
