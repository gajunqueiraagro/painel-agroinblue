-- P120 (Gabriel 27/10/2026) — META NUNCA VAI AO FINANCEIRO. O abate META de 66 garrotes do NJ (15/02/2026) virou lancamento em
-- financeiro_lancamentos_v2 com cenario = 'meta' (painel do abate, desde o a5fc23f3 de 21/04): 52 ativos em 5 clientes, todos do rebanho.
-- (a) Gatilho BEFORE INSERT OR UPDATE OF cenario: recusa gravar cenario = 'meta' (INSERT, ou UPDATE que PASSA a meta). Os 52 que ja' existem
--     continuam editaveis/cancelaveis (o cancelamento deles espera o P109 — decisao do Gabriel).
-- (b) `fn_candidatos_conciliacao` ignora cenario = 'meta' (era o UNICO lugar em que os 52 apareciam indevidamente: candidato para casar com
--     o extrato da conta). A `fn_sugestoes_extrato` le' os candidatos dela, e fica coberta junto. Patch guardado por md5.
SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public._fn_lancamento_sem_meta_trg()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $f$
BEGIN
  IF NEW.cenario = 'meta' AND (TG_OP = 'INSERT' OR OLD.cenario IS DISTINCT FROM 'meta') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'Meta não vai ao financeiro: lançamento de cenário META não é gravado (P120). Nada foi gravado.';
  END IF;
  RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION public._fn_lancamento_sem_meta_trg() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_00_sem_meta
  BEFORE INSERT OR UPDATE OF cenario ON public.financeiro_lancamentos_v2
  FOR EACH ROW EXECUTE FUNCTION public._fn_lancamento_sem_meta_trg();

CREATE OR REPLACE FUNCTION pg_temp._troca_texto(p_fn regprocedure, p_md5 text, p_pares text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE d text := pg_get_functiondef(p_fn); i int; n int;
BEGIN
  IF md5(d) <> p_md5 THEN RAISE EXCEPTION '% mudou (md5 %, esperado %)', p_fn, md5(d), p_md5; END IF;
  FOR i IN 1..array_length(p_pares, 1) / 3 LOOP
    n := (length(d) - length(replace(d, p_pares[3*i-2], ''))) / length(p_pares[3*i-2]);
    IF n <> p_pares[3*i]::int THEN RAISE EXCEPTION '% trecho %: % ocorrencias, esperado %', p_fn, i, n, p_pares[3*i]; END IF;
    d := replace(d, p_pares[3*i-2], p_pares[3*i-1]);
  END LOOP;
  EXECUTE d;
END $$;

SELECT pg_temp._troca_texto('public.fn_candidatos_conciliacao(uuid,uuid,integer)', '624887728c95c5772707c798694a3d2a', ARRAY[
  $p$     where t.cliente_id = p_cliente_id
       and t.cancelado is not true
$p$,
  $r$     where t.cliente_id = p_cliente_id
       and t.cancelado is not true
       and t.cenario is distinct from 'meta'   -- P120: meta nunca e' candidato a casar com o extrato
$r$, '1']);
