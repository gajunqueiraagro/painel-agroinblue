-- CRIAR-DO-EXTRATO-01 — todo gerador do banco grava `financeiro_lancamentos_v2` COM vencimento.
--
-- Roda como `postgres`, numa transacao que TERMINA EM RAISE: nada fica no banco.
-- Sucesso = a excecao final comeca com "OK". Qualquer outra excecao e' falha e diz qual prova caiu.
--
-- T0  a varredura sabe achar: uma funcao nova que insere SEM vencimento tem de aparecer (a lei do auto-teste).
-- T1  nenhuma funcao do `public` que faz INSERT em financeiro_lancamentos_v2 deixa de citar data_vencimento; a falha NOMEIA.
-- T2  a captacao do contrato vence na data do contrato, no INSERT e no UPDATE que a reativa.
-- T3  o desmembramento da Mesa (mesa_split) cai no pagamento (data do extrato) e na competencia quando o consolidado nao tem.
-- T4  a promocao da staging (mesa_excel) vence no pagamento ou, sem ele, na competencia.

DO $teste$
DECLARE
  v_n int; v_lista text; v_def text; v_ok text := '';
  c_varredura constant text :=
    $q$SELECT count(*), string_agg(p.oid::regprocedure::text, ', ' ORDER BY 1)
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prokind = 'f'
          AND pg_get_functiondef(p.oid) ~* 'insert\s+into\s+(public\.)?financeiro_lancamentos_v2'
          AND pg_get_functiondef(p.oid) !~* 'data_vencimento'$q$;
BEGIN
  -- T0: uma funcao que insere sem vencimento aparece na varredura
  CREATE FUNCTION public._teste_cde01_sem_vencimento() RETURNS void LANGUAGE sql
    AS 'insert into public.financeiro_lancamentos_v2 (cliente_id) select null::uuid where false';
  EXECUTE c_varredura INTO v_n, v_lista;
  IF v_n < 1 OR v_lista !~ '_teste_cde01_sem_vencimento' THEN
    RAISE EXCEPTION 'T0 a varredura nao achou a funcao sem vencimento plantada (% achadas: %)', v_n, v_lista;
  END IF;
  DROP FUNCTION public._teste_cde01_sem_vencimento();
  v_ok := v_ok || 'T0 ok (a varredura acha o gerador plantado sem vencimento); ';

  -- T1: nenhum gerador do banco sem vencimento
  EXECUTE c_varredura INTO v_n, v_lista;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T1 % gerador(es) do banco gravam lancamento sem citar data_vencimento: %', v_n, left(v_lista, 600);
  END IF;
  v_ok := v_ok || 'T1 ok (0 geradores sem vencimento); ';

  -- T2: captacao do contrato
  v_def := pg_get_functiondef('public._fn_financiamento_salvar_cabecalho_exec(uuid, jsonb)'::regprocedure);
  IF position('data_pagamento = n.data_contrato, data_vencimento = n.data_contrato,' in v_def) = 0 THEN
    RAISE EXCEPTION 'T2 o UPDATE da captacao nao grava o vencimento'; END IF;
  IF position('data_competencia, data_pagamento, data_vencimento, ano_mes, origem_lancamento, origem_tipo' in v_def) = 0
     OR position('n.data_contrato, n.data_contrato, to_char(n.data_contrato, ''YYYY-MM''), ''financiamento''' in v_def) = 0 THEN
    RAISE EXCEPTION 'T2 o INSERT da captacao nao grava o vencimento = data do contrato'; END IF;
  v_ok := v_ok || 'T2 ok (captacao: vencimento = data do contrato); ';

  -- T3: mesa_split
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_classificacao_split_substituir';
  IF position('v_lan.data_vencimento, v_ext.data_movimento, v_comp)' in v_def) = 0 THEN
    RAISE EXCEPTION 'T3 o mesa_split nao cai no pagamento/competencia quando o consolidado nao tem vencimento'; END IF;
  v_ok := v_ok || 'T3 ok (mesa_split: proposta > consolidado > pagamento > competencia); ';

  -- T4: promocao da staging
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_promover_staging';
  IF position('ano_mes, data_pagamento, data_competencia, data_vencimento,' in v_def) = 0
     OR position('COALESCE(v_row.data_pagamento, v_row.data_competencia),' in v_def) = 0 THEN
    RAISE EXCEPTION 'T4 a promocao da staging nao grava vencimento = pagamento/competencia'; END IF;
  v_ok := v_ok || 'T4 ok (mesa_excel: pagamento > competencia); ';

  RAISE EXCEPTION 'OK — %', v_ok;
END
$teste$;
