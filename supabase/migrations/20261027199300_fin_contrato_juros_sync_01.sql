-- FIN-CONTRATO-JUROS-SYNC-01 (Gabriel 16/10/2026) — no FINANCIAMENTO / EMPRÉSTIMO, mudar o valor do lançamento vinculado a uma parcela
-- (o principal, `lancamento_id`, ou o dos juros, `lancamento_juros_id`) atualiza a parcela na MESMA transação: `valor_principal` /
-- `valor_juros` e `valor_total` (= principal + juros). Um dono só: `_fn_parcela_acompanha_lancamento`, chamado pelo gatilho e pela
-- correção de dado abaixo.
-- ⚠ PARCELAMENTO FICA FORA: o escritor dele é `fn_parcelamento_editar_parcelas`, e o modal do lançamento já passa por ele.
-- ⚠ SEM LAÇO: o motor (`fn_reconciliar_parcela_financiamento`) escreve parcela -> lançamento; o gatilho devolve o mesmo valor e não
--   escreve nada (a atualização só roda quando o valor da parcela é diferente).
-- ⚠ GUARDA DE CLIENTE: a parcela só é tocada se o contrato é do MESMO cliente do lançamento (quem gravou o lançamento passou pela RLS).
-- ⚠ Tabela quente (`financeiro_lancamentos_v2`): aplicada fora da janela 07h/20h por exceção do Gabriel, só em 16/10/2026.
-- Antes: nenhuma função muda (só nascem a interna e a do gatilho).
SET LOCAL lock_timeout = '2s';

CREATE FUNCTION public._fn_parcela_acompanha_lancamento(p_lancamento uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_n integer;
BEGIN
  UPDATE public.financiamento_parcelas q
     SET valor_principal = CASE WHEN q.lancamento_id = l.id THEN round(abs(l.valor), 2) ELSE q.valor_principal END,
         valor_juros     = CASE WHEN q.lancamento_juros_id = l.id THEN round(abs(l.valor), 2) ELSE q.valor_juros END,
         valor_total     = coalesce(CASE WHEN q.lancamento_id = l.id THEN round(abs(l.valor), 2) ELSE q.valor_principal END, 0)
                         + coalesce(CASE WHEN q.lancamento_juros_id = l.id THEN round(abs(l.valor), 2) ELSE q.valor_juros END, 0)
    FROM public.financeiro_lancamentos_v2 l, public.financiamentos f
   WHERE l.id = p_lancamento
     AND NOT l.cancelado
     AND f.id = q.financiamento_id
     AND f.cliente_id = l.cliente_id
     AND f.natureza IS DISTINCT FROM 'parcelamento'
     AND f.status IS DISTINCT FROM 'cancelado'
     AND q.status IS DISTINCT FROM 'cancelado'
     AND (q.lancamento_id = l.id OR q.lancamento_juros_id = l.id)
     AND ((q.lancamento_id = l.id AND q.valor_principal IS DISTINCT FROM round(abs(l.valor), 2))
       OR (q.lancamento_juros_id = l.id AND q.valor_juros IS DISTINCT FROM round(abs(l.valor), 2)));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $f$;
REVOKE ALL ON FUNCTION public._fn_parcela_acompanha_lancamento(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_parcela_acompanha_lancamento(uuid) TO service_role;

/* A correção da parcela 3 do C_14130608-0 (Santa Rita), PELO DONO: juros = o do lançamento c3ff68f8 (128.579,30, decisão do Gabriel
   16/10), total 357.916,03. Só no estado medido; senão aborta. */
DO $c$
DECLARE r record; n integer;
BEGIN
  SELECT p.valor_principal, p.valor_juros, p.valor_total, l.valor INTO r
    FROM public.financiamento_parcelas p JOIN public.financeiro_lancamentos_v2 l ON l.id = p.lancamento_juros_id
   WHERE p.id = '49368ecf-debb-498c-afbd-3612756167ec' AND l.id = 'c3ff68f8-479f-40e4-9a70-ef348b155b87';
  IF r IS NULL OR r.valor_principal IS DISTINCT FROM 229336.73::numeric OR r.valor_juros IS DISTINCT FROM 128602.00::numeric
     OR r.valor_total IS DISTINCT FROM 357938.73::numeric OR r.valor IS DISTINCT FROM 128579.30::numeric THEN
    RAISE EXCEPTION 'FIN-CONTRATO-JUROS-SYNC-01: parcela 3 fora do estado medido (%). Abortado.', r;
  END IF;
  n := public._fn_parcela_acompanha_lancamento('c3ff68f8-479f-40e4-9a70-ef348b155b87');
  SELECT valor_juros, valor_total INTO r FROM public.financiamento_parcelas WHERE id = '49368ecf-debb-498c-afbd-3612756167ec';
  IF n IS DISTINCT FROM 1 OR r.valor_juros IS DISTINCT FROM 128579.30::numeric OR r.valor_total IS DISTINCT FROM 357916.03::numeric THEN
    RAISE EXCEPTION 'FIN-CONTRATO-JUROS-SYNC-01: correção não fechou (% linhas, %). Abortado.', n, r;
  END IF;
END $c$;

CREATE FUNCTION public.trg_fn_parcela_acompanha_lancamento() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  PERFORM public._fn_parcela_acompanha_lancamento(NEW.id);
  RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION public.trg_fn_parcela_acompanha_lancamento() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_zz_parcela_acompanha_lancamento AFTER UPDATE OF valor ON public.financeiro_lancamentos_v2
  FOR EACH ROW WHEN (NEW.valor IS DISTINCT FROM OLD.valor)
  EXECUTE FUNCTION public.trg_fn_parcela_acompanha_lancamento();
