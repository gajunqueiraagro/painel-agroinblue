-- PR-CONC-CAIXA-PONTAS-PLANO-HOTFIX — fn_caixa_sistema_pontas sempre com plano CUSTOM
--
-- POR QUE (PARE de 03/10, no PR-CONC-SALDO-UMA-REGUA-01)
-- `fn_caixa_sistema_pontas` (CONC-CAIXA-PONTA-01) e' PL/pgSQL e roda a cada carregamento do Casar lancamentos / Conferencia
-- (chamada por `fn_extratos_espelhados`). Depois de 5 execucoes na mesma sessao o PL/pgSQL troca para o plano GENERICO, que
-- estima 2 linhas onde ha' 19.645 (o historico do Banco do Brasil do NJ). Medido na sessao do usuario, NJ BB set/26:
--   pontas      79 65 65 67 66 | 9451 9337 9391 ms   (da 6a chamada em diante)
--   espelhados 121 93 94 94 94 | 8847 8850 9067 ms
-- O PostgREST reusa conexoes e o teto do `authenticated` e' 8 s: a tela falha de forma intermitente nessa conta.
--
-- O QUE MUDA: SO' o `proconfig` — `plan_cache_mode = force_custom_plan` (planeja com os parametros a cada chamada).
-- Corpo, assinatura, ACL, SECURITY DEFINER e search_path INTACTOS (o md5 do corpo e' conferido antes e depois).
-- Medido com o SET (ROLLBACK), 20 chamadas na mesma sessao: pontas 59–84 ms; espelhados 93–136 ms.
-- `fn_extratos_espelhados` e' LANGUAGE sql (sem cache de plano generico do PL/pgSQL): estabiliza so' com o SET na pontas.
-- Saida identica: 69 conta-meses com extrato, md5 do retorno de `fn_extratos_espelhados` (sem `gerado_em`) igual com e sem
-- o SET, na MESMA transacao REPEATABLE READ (`DISCARD PLANS` antes de cada chamada sem o SET).

DO $guarda$
DECLARE v_md5 text;
BEGIN
  SELECT md5(p.prosrc) INTO v_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_caixa_sistema_pontas';
  IF v_md5 IS DISTINCT FROM '8a1cd4f9ecc02fa8eebb61a1c7093bd2' THEN
    RAISE EXCEPTION 'fn_caixa_sistema_pontas nao esta no corpo esperado (md5 %). Migration abortada.', v_md5;
  END IF;
END $guarda$;

ALTER FUNCTION public.fn_caixa_sistema_pontas(uuid, uuid, date, date) SET plan_cache_mode = force_custom_plan;

DO $guarda$
DECLARE v_md5 text; v_cfg text[];
BEGIN
  SELECT md5(p.prosrc), p.proconfig INTO v_md5, v_cfg FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_caixa_sistema_pontas';
  IF v_md5 IS DISTINCT FROM '8a1cd4f9ecc02fa8eebb61a1c7093bd2' THEN
    RAISE EXCEPTION 'o corpo mudou (md5 %): este PR so'' pode mexer no proconfig.', v_md5;
  END IF;
  IF NOT ('plan_cache_mode=force_custom_plan' = ANY (v_cfg)) OR NOT ('search_path=pg_catalog, public' = ANY (v_cfg)) THEN
    RAISE EXCEPTION 'proconfig inesperado: %', v_cfg;
  END IF;
END $guarda$;