-- AUDIT-SEG-01 (Gabriel 20/10/2026) — parte 2. ⚠ APLICAR SO' ANTES DAS 07h OU DEPOIS DAS 20h (regra da casa): ALTER TABLE em
-- audit_log e CREATE TRIGGER em financeiro_lancamentos_v2 sao DDL em tabela quente. lock_timeout de 2 s: sem a trava, aborta.
--
-- (a) audit_log.via (text, nulo): por onde o evento entrou. Com usuario = a rotina que a RPC declarou em `app.via`
--     (set_config('app.via', '<funcao>', true)), ou nulo; SEM usuario = 'sistema:<app.via>' ou 'sistema'. O autor sem usuario
--     fica NULO — a tela nao chama mais nulo de "sistema" por conta propria: le' o `via`.
-- (b) a CRIACAO de lancamento financeiro entra na trilha: trg_audit_financeiro_v2 passa a AFTER INSERT OR UPDATE (era so'
--     UPDATE; o ramo INSERT da funcao nunca rodava — 0 eventos "criou" em 60 dias, medido em 20/10).

SET LOCAL lock_timeout = '2s';

ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS via text;

CREATE OR REPLACE FUNCTION public._fn_trilha_via()
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
           WHEN auth.uid() IS NULL THEN 'sistema' || COALESCE(':' || NULLIF(current_setting('app.via', true), ''), '')
           ELSE NULLIF(current_setting('app.via', true), '')
         END
$$;
REVOKE ALL ON FUNCTION public._fn_trilha_via() FROM PUBLIC, anon, authenticated;

-- O `via` do audit_log e' preenchido no mesmo gatilho BEFORE INSERT do autor (para todo escritor, inclusive o das RPCs).
CREATE OR REPLACE FUNCTION public._fn_trilha_autor()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NOT NULL OR current_user IN ('anon', 'authenticated') THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object(TG_ARGV[0], v_uid, TG_ARGV[1], now()));
  END IF;
  IF TG_TABLE_NAME = 'audit_log' THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object('via', COALESCE(to_jsonb(NEW)->>'via', public._fn_trilha_via())));
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._fn_trilha_autor() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_financeiro_v2 ON public.financeiro_lancamentos_v2;
CREATE TRIGGER trg_audit_financeiro_v2
  AFTER INSERT OR UPDATE ON public.financeiro_lancamentos_v2
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_financeiro_v2();

DO $confere$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgname = 'trg_audit_financeiro_v2'
                 AND t.tgrelid = 'public.financeiro_lancamentos_v2'::regclass AND t.tgtype & 4 > 0 AND t.tgtype & 16 > 0) THEN
    RAISE EXCEPTION 'AUDIT-SEG-01: trg_audit_financeiro_v2 sem INSERT/UPDATE';
  END IF;
END $confere$;
