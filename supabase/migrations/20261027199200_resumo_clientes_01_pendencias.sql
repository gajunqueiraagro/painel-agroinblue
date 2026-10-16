-- RESUMO-CLIENTES-01 passo a (Gabriel 16/10/2026) — as pendências que o CONSULTOR registra por cliente ("cobrar de quem, o quê, até
-- quando"). Só o admin AGROinBLUE lê e escreve; o cliente (e o usuário do cliente) nunca vê. Nada é apagado: a pendência se resolve.
-- Tabela nova e fria: sem trava em tabela quente. Sem função nova (escrita direta sob RLS).
-- ⚠ AUDIT: o repo não tem gatilho genérico de `audit_log` (os três que existem são de chuvas, lançamentos e financeiro); fica o
--   carimbo `atualizada_em` / `atualizada_por` por gatilho.
SET LOCAL lock_timeout = '2s';

CREATE TABLE public.consultor_pendencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  prazo date,
  cobrar_de text NOT NULL CHECK (btrim(cobrar_de) <> ''),
  o_que text NOT NULL CHECK (btrim(o_que) <> ''),
  origem_tipo text CHECK (origem_tipo IN ('oc', 'conciliacao', 'fechamento', 'outro')),
  origem_ref text,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'cobrada', 'resolvida')),
  ultima_cobranca_em date,
  ultima_cobranca_canal text CHECK (ultima_cobranca_canal IN ('whatsapp', 'email', 'telefone')),
  resolvida_em timestamptz,
  criada_por uuid DEFAULT auth.uid(),
  criada_em timestamptz NOT NULL DEFAULT now(),
  atualizada_por uuid,
  atualizada_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consultor_pendencias_cobranca_chk CHECK ((ultima_cobranca_em IS NULL) = (ultima_cobranca_canal IS NULL)),
  CONSTRAINT consultor_pendencias_resolvida_chk CHECK ((status = 'resolvida') = (resolvida_em IS NOT NULL))
);
CREATE INDEX consultor_pendencias_cliente_status_idx ON public.consultor_pendencias (cliente_id, status);
CREATE INDEX consultor_pendencias_status_prazo_idx ON public.consultor_pendencias (status, prazo);

CREATE FUNCTION public.consultor_pendencias_carimbo() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $f$
BEGIN
  NEW.atualizada_em := now();
  NEW.atualizada_por := auth.uid();
  RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION public.consultor_pendencias_carimbo() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_consultor_pendencias_carimbo BEFORE UPDATE ON public.consultor_pendencias
  FOR EACH ROW EXECUTE FUNCTION public.consultor_pendencias_carimbo();

ALTER TABLE public.consultor_pendencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY consultor_pendencias_select_admin ON public.consultor_pendencias FOR SELECT TO authenticated
  USING (public.is_admin_agroinblue(auth.uid()));
CREATE POLICY consultor_pendencias_insert_admin ON public.consultor_pendencias FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_agroinblue(auth.uid()));
CREATE POLICY consultor_pendencias_update_admin ON public.consultor_pendencias FOR UPDATE TO authenticated
  USING (public.is_admin_agroinblue(auth.uid())) WITH CHECK (public.is_admin_agroinblue(auth.uid()));

REVOKE ALL ON public.consultor_pendencias FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.consultor_pendencias TO authenticated;
GRANT ALL ON public.consultor_pendencias TO service_role;
