-- P116 (Gabriel 27/10/2026) — NENHUM EVENTO DA TRILHA SEM QUEM. O evento gravado sem usuario logado diz QUAL rotina: `sistema:<app.via>`,
-- e, sem rotina declarada, `sistema:manutenção` (as correcoes por migration de 22 e 23/10 sairam so' "sistema"). Nunca recusa a gravacao.
-- (a) `_fn_trilha_via()`: sem usuario -> 'sistema:' || COALESCE(app.via, 'manutenção'). Com usuario, igual a antes (a rotina ou nulo).
-- (b) `conciliacao_audit_log` (a segunda trilha da aba Auditoria do lancamento) ganha a mesma `via` e um gatilho BEFORE INSERT: sem
--     `actor_user_id`, o autor e' quem esta' logado; sem ninguem logado, a `via` diz a rotina. Os eventos antigos ficam como estao.
SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public._fn_trilha_via()
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
           WHEN auth.uid() IS NULL THEN 'sistema:' || COALESCE(NULLIF(current_setting('app.via', true), ''), 'manutenção')
           ELSE NULLIF(current_setting('app.via', true), '')
         END
$$;
REVOKE ALL ON FUNCTION public._fn_trilha_via() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.conciliacao_audit_log ADD COLUMN IF NOT EXISTS via text;

-- ⚠ SECURITY DEFINER (a licao do FORN-FILIAL-01-FIX): gatilho INVOKER chamando `_fn_trilha_via` (sem EXECUTE para authenticated) cai em
--   42501 no dia em que um usuario gravar a trilha direto. `auth.uid()` le' o JWT da sessao e vale igual dentro do DEFINER.
CREATE OR REPLACE FUNCTION public._fn_trilha_concil_autor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.actor_user_id IS NULL THEN
    NEW.actor_user_id := auth.uid();
  END IF;
  IF NEW.actor_user_id IS NULL THEN
    NEW.via := COALESCE(NULLIF(NEW.via, ''), public._fn_trilha_via());
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._fn_trilha_concil_autor() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_trilha_concil_autor
  BEFORE INSERT ON public.conciliacao_audit_log
  FOR EACH ROW EXECUTE FUNCTION public._fn_trilha_concil_autor();
