-- CONC-BAIXA-NO-VINCULO-01 (correcao, 21/10/2026) — o VENCIMENTO do irmao, explicito.
--
-- A 20261028100900 copia o irmao coluna a coluna (lista lida do catalogo), entao o vencimento ja' vinha do original. Mas a varredura
-- do CRIAR-DO-EXTRATO-01 (`criar_do_extrato_01_test.sql`, T1: nenhum gerador do banco grava lancamento sem citar data_vencimento)
-- acusou `_fn_conc_baixa_no_vinculo` — com razao: a regra da casa e' o gerador DIZER o vencimento. Migration aplicada e' registro
-- historico; a troca entra aqui, guardada pelo md5 de origem: o irmao nasce com o VENCIMENTO ORIGINAL do lancamento dividido.

SET LOCAL lock_timeout = '3s';

DO $troca$
DECLARE v_def text; v_de text := $d$WHEN 'recorrencia_id' THEN 'NULL'$d$;
  v_para text := $p$WHEN 'data_vencimento' THEN 'data_vencimento' WHEN 'recorrencia_id' THEN 'NULL'$p$;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_conc_baixa_no_vinculo(uuid, text, text)'::regprocedure)
     <> '4d5b086013d6b7a420846f6c3617ed79' THEN
    RAISE EXCEPTION 'CONC-BAIXA-NO-VINCULO-01 (vencimento): corpo de origem de _fn_conc_baixa_no_vinculo divergente';
  END IF;
  v_def := pg_get_functiondef('public._fn_conc_baixa_no_vinculo(uuid, text, text)'::regprocedure);
  IF (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de) <> 1 THEN
    RAISE EXCEPTION 'CONC-BAIXA-NO-VINCULO-01 (vencimento): trecho de origem nao achado uma vez';
  END IF;
  EXECUTE replace(v_def, v_de, v_para);
END $troca$;
REVOKE ALL ON FUNCTION public._fn_conc_baixa_no_vinculo(uuid, text, text) FROM PUBLIC, anon, authenticated;

DO $confere$
BEGIN
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public._fn_conc_baixa_no_vinculo(uuid, text, text)'::regprocedure)
     NOT LIKE '%WHEN ''data_vencimento'' THEN ''data_vencimento''%' THEN
    RAISE EXCEPTION 'CONC-BAIXA-NO-VINCULO-01 (vencimento): troca nao entrou'; END IF;
  IF has_function_privilege('authenticated', 'public._fn_conc_baixa_no_vinculo(uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONC-BAIXA-NO-VINCULO-01 (vencimento): ACL aberta'; END IF;
END $confere$;
