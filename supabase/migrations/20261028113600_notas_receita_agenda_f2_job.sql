-- NOTAS-RECEITA-AGENDA-01 · F2 (job) · Code 1 · 27/11 — plano aprovado pelo Gabriel. O agendador ÚNICO da busca da Receita, no servidor:
-- a cada 5 min o pg_cron chama a borda `fiscal-dfe-agenda` (pg_net), que busca quem está devido (`_fn_fiscal_dfe_devidos`, F1), um titular
-- por vez, pela busca de sempre. Não depende de sessão de Code nem de máquina ligada.
-- · A URL da borda e a chave do servidor moram no VAULT (`fiscal_dfe_agenda_url`, `fiscal_dfe_agenda_chave`), gravadas fora deste arquivo
--   (nenhum segredo em migration). Sem os dois segredos, o disparo não faz nada (devolve null) — o mesmo lote serve à produção.
-- · Cada titular continua no máximo 1×/h (o `nao_antes_de` da busca) e o 656 segura o mesmo CPF/CNPJ (F1). A rodada só começa titular
--   novo nos primeiros 25 s (a borda tem 150 s).
-- DESFAZER: SELECT cron.unschedule('fiscal_dfe_agenda'); DROP FUNCTION _fn_fiscal_dfe_agenda_disparar();

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION public._fn_fiscal_dfe_agenda_disparar()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $$
DECLARE v_url text; v_chave text;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'fiscal_dfe_agenda_url';
  SELECT decrypted_secret INTO v_chave FROM vault.decrypted_secrets WHERE name = 'fiscal_dfe_agenda_chave';
  IF coalesce(v_url, '') !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/fiscal-dfe-agenda$' OR coalesce(v_chave, '') = '' THEN
    RETURN NULL;
  END IF;
  RETURN net.http_post(url := v_url, body := '{}'::jsonb,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_chave, 'Content-Type', 'application/json'),
    timeout_milliseconds := 10000);
END $$;
REVOKE ALL ON FUNCTION public._fn_fiscal_dfe_agenda_disparar() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('fiscal_dfe_agenda', '*/5 * * * *', $job$SELECT public._fn_fiscal_dfe_agenda_disparar()$job$);
