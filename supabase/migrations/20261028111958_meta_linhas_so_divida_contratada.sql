-- P109 (FIN-META-01, decisao 1 do Gabriel 27/10) — na meta de caixa, parcela de financiamento so' da DIVIDA CONTRATADA: natureza
-- 'financiamento' e 'consorcio' (o cronograma do contrato e' o plano da divida). A compra parcelada ('parcelamento': racao, vacina,
-- semen, cerca...) fica FORA: e' realizado/previsto da meta de custo e ja' aparece do outro lado da regua; meta nunca mistura com
-- previsto/programado/agendado. Criterio 1 continua: NJ Nutricao 2026 em caixa R$ 3.920.235,00.
-- E (decisao 2) os PROJETOS de investimento so' no regime 'caixa', no mes do desembolso; em 'competencia' (o DRE) nao entram — ali o
-- investimento aparece so' pela depreciacao, como hoje (o DRE continua identico; o filtro do DRE na 111957 fica redundante e inofensivo).
-- Aplicada por ANCORA sobre o pg_get_functiondef (casa UMA vez); o corpo de partida e' o da 111956 (md5 ad04a5fc).
SET LOCAL lock_timeout = '2s';
DO $p$
DECLARE d text; v_old text; v_new text; n int;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_meta_linhas(uuid, integer, text)'::regprocedure)
     IS DISTINCT FROM 'ad04a5fc2df9a675a7d0daf6b6f296e6' THEN
    RAISE EXCEPTION 'fn_meta_linhas: corpo de origem inesperado.';
  END IF;
  d := pg_get_functiondef('public.fn_meta_linhas(uuid, integer, text)'::regprocedure);
  v_old := $a$    JOIN public.financiamentos fi ON fi.id = fp.financiamento_id AND fi.cliente_id = p_cliente
$a$;
  v_new := $a$    JOIN public.financiamentos fi ON fi.id = fp.financiamento_id AND fi.cliente_id = p_cliente
                                 AND fi.natureza IN ('financiamento', 'consorcio')  -- P109: a compra parcelada nao e' meta
$a$;
  n := (length(d) - length(replace(d, v_old, ''))) / length(v_old);
  IF n <> 1 THEN RAISE EXCEPTION 'fn_meta_linhas: a ancora do financiamento casou % vezes.', n; END IF;
  d := replace(d, v_old, v_new);
  v_old := $a$   WHERE m.cliente_id = p_cliente AND m.ano = p_ano AND m.status IS DISTINCT FROM 'cancelado' AND coalesce(x.v, 0) <> 0
$a$;
  v_new := $a$   WHERE p_regime = 'caixa'  -- P109: o projeto e' desembolso; no DRE (competencia) o investimento aparece so' pela depreciacao
     AND m.cliente_id = p_cliente AND m.ano = p_ano AND m.status IS DISTINCT FROM 'cancelado' AND coalesce(x.v, 0) <> 0
$a$;
  n := (length(d) - length(replace(d, v_old, ''))) / length(v_old);
  IF n <> 1 THEN RAISE EXCEPTION 'fn_meta_linhas: a ancora dos projetos casou % vezes.', n; END IF;
  EXECUTE replace(d, v_old, v_new);
END $p$;

COMMENT ON FUNCTION public.fn_meta_linhas(uuid, integer, text) IS
  'P109 FIN-META-01: a meta por (fazenda, plano_conta_id, mes) e origem, no regime pedido — o dono unico da meta (digitada, projetos, calculada do rebanho, adiantamento de boitel e parcelas de financiamento/consorcio no caixa, espelho da deducao).';
