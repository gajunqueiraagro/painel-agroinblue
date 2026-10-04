-- CONC-TOTAL-SEM-SALDO-01a — o agregado da conciliacao NAO concilia com conta que pesa sem saldo informado; a regua do ano
-- julga o mesmo conjunto de contas do resumo.
--
-- POR QUE (Gabriel, 04/10/2026, Vera out/26 em "Todas as contas"): "sistema tem 12 mil, extrato tem 101 mil. Como que a diferenca
-- confere? Erro primario." No subtotal e no total, `saldo_sistema` somava TODAS as contas, `saldo_extrato` so' as que tinham
-- saldo informado e `diferenca` so' as diferencas que existiam (`sum` ignora NULL); a conta 'pendente' so' entrava no contador
-- 'contas_pendentes'. Resultado: duas somas de conjuntos diferentes lado a lado, diferenca 0 e veredito 'conciliado'.
-- REVOGA EM PARTE a D3 de 03/10 ("pendente nao derruba o agregado", 20261027191800): a pendente PARADA continua nao derrubando.
--
-- CONTA QUE PESA SEM SALDO = linha de conta com status 'pendente' (falta o saldo informado) E saldo proprio no sistema <> 0 OU
-- entradas <> 0 OU saidas <> 0 no mes. A chave e' o STATUS, nunca o aviso 'sem_extrato' (5.068 conta-meses o tem).
--
-- O QUE MUDA
-- 1. `_fn_conciliacao_resumo`, SO' no bloco do agregado (niveis 'tipo' e 'total'); as linhas de CONTA nao mudam:
--    R1 status: 'nao_conciliado' se alguma conta diverge (como antes); senao 'pendente' se ha' conta que pesa sem saldo (NOVO) ou
--       se nenhuma esta' conciliada (como antes); senao 'conciliado'.
--    R2 motivo novo, depois de 'contas_pendentes': {motivo:'contas_sem_saldo', qtde, contas:[{conta_id, conta_nome}]}.
--    R3/R4 `saldo_extrato` e `diferenca` do agregado = NULL quando ha' conta que pesa sem saldo, em qualquer status (a diferenca
--       de cada conta segue na linha da conta).
--    R5 a pendente sem saldo e sem movimento nao pesa: nada muda por ela. R6 as demais colunas do agregado nao mudam.
-- 2. `fn_conciliacao_status_ano`: manda ao dono tambem a conta com saldo final <> 0 no mes ANTERIOR (a parada com saldo
--    herdado, que no resumo pesa). Sem isso a regua nao a calculava: o motivo saia com outra contagem e o status do mes podia
--    divergir do resumo. As linhas de conta que a regua devolve nao mudam (so' as com extrato ou lancamento no mes).
-- Assinaturas, retorno, SECURITY DEFINER, search_path, plan_cache_mode e ACL nao mudam (CREATE OR REPLACE do mesmo cabecalho).
-- `fn_conciliacao_resumo_mes` nao e' tocada. Nenhuma escrita em dado.
--
-- MEDIDO no ensaio (7 clientes, 2020-01 a 2026-12): 5.137 linhas de conta identicas por md5; 15 agregados passam de
-- 'conciliado' a 'pendente' (8 totais: NJ 2025-06 e 2026-03, Santa Rita 2024-07, 2024-08, 2025-01, 2025-10, 2025-11, 2025-12;
-- 7 subtotais da Santa Rita) e 28 so' ganham o motivo e os nulos; regua = resumo em 588 cliente-meses (status e motivos).
-- Tempo da regua (mediana de 5, antes x depois): +1% a +5% (NJ 2026 1.933 -> 1.973 ms); a lentidao que ja' existia nos anos
-- cheios (NJ 2024/2025 e Santa Rita 2023/2025 acima de 2 s) e' a divida CONC-REGUA-DESEMPENHO-01.

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)'::regprocedure)
       IS DISTINCT FROM '26f4a6df7c9db5bf546984bb4f422705'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliacao_status_ano(uuid, integer)'::regprocedure)
       IS DISTINCT FROM '35db738dfce0923a764f3d1fd2361177'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliacao_resumo_mes(uuid, text, uuid[])'::regprocedure)
       IS DISTINCT FROM '25aa2ac47b2bec06c951377cb2cecc84' THEN
    RAISE EXCEPTION 'dono, regua ou resumo publico fora do corpo esperado. Migration abortada.';
  END IF;
END $guarda$;

-- ═══ o dono: o bloco do agregado (patch guardado por md5) ═══
DO $mig$
DECLARE
  v_src text; v_def text; v_novo text; v_depois text; a1 text; b1 text; a2 text; b2 text; a3 text; b3 text; a text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid) INTO v_src, v_def FROM pg_proc p WHERE p.oid = 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)'::regprocedure;
  IF md5(v_src) <> '26f4a6df7c9db5bf546984bb4f422705' THEN
    RAISE EXCEPTION 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean): corpo de origem inesperado (md5 %). Migration abortada.', md5(v_src);
  END IF;
  a1 := $a1$  v_npend int; v_vazio jsonb; v_vazio_pos jsonb;
$a1$;
  b1 := $b1$  v_npend int; v_vazio jsonb; v_vazio_pos jsonb; v_nsem int; v_semsaldo jsonb;
$b1$;
  a2 := $a2$      count(*) FILTER (WHERE y->>'status' = 'pendente')
      INTO tem_extrato, saldo_inicial, entradas, saidas, saldo_sistema, saldo_extrato, diferenca, banco,
           extratos_sem_par, lancamentos_sem_par, retido_em_depositos,
           entradas_terceiros, entradas_transferencias, saidas_terceiros, saidas_transferencias, diferenca_entradas, diferenca_saidas,
           v_next, v_nfal, v_falhas, v_npend
$a2$;
  b2 := $b2$      count(*) FILTER (WHERE y->>'status' = 'pendente'),
      -- CONC-TOTAL-SEM-SALDO-01a: a CONTA QUE PESA SEM SALDO — 'pendente' (falta o saldo informado) E com saldo no sistema ou
      -- movimento no mes. A chave e' o STATUS, nunca o aviso 'sem_extrato' (quase toda conta o tem). A conta parada (sem saldo
      -- e sem movimento) nao pesa: segue so' em 'contas_pendentes'.
      count(*) FILTER (WHERE y->>'status' = 'pendente'
                         AND (coalesce((y->>'p_sis')::numeric, 0) <> 0 OR coalesce((y->>'entradas')::numeric, 0) <> 0
                              OR coalesce((y->>'saidas')::numeric, 0) <> 0)),
      jsonb_agg(jsonb_build_object('conta_id', y->'conta_id', 'conta_nome', y->'conta_nome') ORDER BY i)
        FILTER (WHERE y->>'status' = 'pendente'
                  AND (coalesce((y->>'p_sis')::numeric, 0) <> 0 OR coalesce((y->>'entradas')::numeric, 0) <> 0
                       OR coalesce((y->>'saidas')::numeric, 0) <> 0))
      INTO tem_extrato, saldo_inicial, entradas, saidas, saldo_sistema, saldo_extrato, diferenca, banco,
           extratos_sem_par, lancamentos_sem_par, retido_em_depositos,
           entradas_terceiros, entradas_transferencias, saidas_terceiros, saidas_transferencias, diferenca_entradas, diferenca_saidas,
           v_next, v_nfal, v_falhas, v_npend, v_nsem, v_semsaldo
$b2$;
  a3 := $a3$    ELSIF v_next = 0 THEN
      v_status := 'pendente';
    ELSE
      v_status := 'conciliado';
    END IF;
    IF v_npend > 0 THEN
      v_mot := v_mot || jsonb_build_array(jsonb_build_object('motivo', 'contas_pendentes', 'qtde', v_npend));
    END IF;
$a3$;
  b3 := $b3$    -- CONC-TOTAL-SEM-SALDO-01a (Gabriel, 04/10: "sistema tem 12 mil, extrato tem 101 mil. Como que a diferenca confere?"):
    -- o agregado NAO concilia com conta que pesa sem saldo informado. Revoga em parte a D3 de 03/10 ("pendente nao derruba"):
    -- a pendente PARADA continua nao derrubando; a que tem saldo ou movimento torna o grupo e o total 'pendente'.
    ELSIF v_next = 0 OR v_nsem > 0 THEN
      v_status := 'pendente';
    ELSE
      v_status := 'conciliado';
    END IF;
    IF v_npend > 0 THEN
      v_mot := v_mot || jsonb_build_array(jsonb_build_object('motivo', 'contas_pendentes', 'qtde', v_npend));
    END IF;
    -- com conta que pesa sem saldo, a soma do extrato seria PARCIAL ao lado de uma soma cheia do sistema, e a soma das
    -- diferencas ignoraria quem nao tem saldo: as duas ficam NULAS (a diferenca de cada conta segue na linha da conta), em
    -- qualquer status. O motivo diz quantas e quais.
    IF v_nsem > 0 THEN
      v_mot := v_mot || jsonb_build_array(jsonb_build_object('motivo', 'contas_sem_saldo', 'qtde', v_nsem, 'contas', v_semsaldo));
      saldo_extrato := NULL; diferenca := NULL;
    END IF;
$b3$;
  FOREACH a IN ARRAY ARRAY[a1, a2, a3] LOOP
    IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
      RAISE EXCEPTION 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean): ancora nao casa exatamente 1x: %', left(a, 60);
    END IF;
  END LOOP;
  v_novo := replace(replace(replace(v_def, a1, b1), a2, b2), a3, b3);
  EXECUTE v_novo;
  SELECT p.prosrc INTO v_depois FROM pg_proc p WHERE p.oid = 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)'::regprocedure;
  IF md5(v_depois) <> '04aa7a4d773b7d58dcdf94d7e9415daf' THEN
    RAISE EXCEPTION 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean): corpo resultante inesperado (md5 %)', md5(v_depois);
  END IF;
END $mig$;

-- ═══ a regua do ano: o mesmo conjunto de contas do resumo (patch guardado por md5) ═══
DO $mig$
DECLARE
  v_src text; v_def text; v_novo text; v_depois text; a1 text; b1 text; a2 text; b2 text; a3 text; b3 text; a text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid) INTO v_src, v_def FROM pg_proc p WHERE p.oid = 'public.fn_conciliacao_status_ano(uuid, integer)'::regprocedure;
  IF md5(v_src) <> '35db738dfce0923a764f3d1fd2361177' THEN
    RAISE EXCEPTION 'public.fn_conciliacao_status_ano(uuid, integer): corpo de origem inesperado (md5 %). Migration abortada.', md5(v_src);
  END IF;
  a1 := $a1$DECLARE v_mov jsonb; v_sal jsonb; v_mes text;$a1$;
  b1 := $b1$DECLARE v_mov jsonb; v_sal jsonb; v_ant jsonb; v_mes text;$b1$;
  a2 := $a2$           GROUP BY s.ano_mes) m;
  FOR i IN 1..12 LOOP
$a2$;
  b2 := $b2$           GROUP BY s.ano_mes) m;
  -- CONC-TOTAL-SEM-SALDO-01a: as contas com saldo final <> 0 no mes ANTERIOR a cada mes do ano — a conta PARADA COM SALDO
  -- HERDADO. Sem movimento e sem saldo informado no mes ela ficava fora do calculo (so' somava em 'contas_pendentes'), mas no
  -- resumo ela PESA (o sistema dela e' o saldo herdado, e falta o informado): a regua tem de julgar o MESMO conjunto de contas
  -- do resumo, senao o total do mes diria uma coisa aqui e outra la'.
  SELECT jsonb_object_agg(m.mes, m.contas) INTO v_ant
    FROM (SELECT to_char(to_date(s.ano_mes, 'YYYY-MM') + interval '1 month', 'YYYY-MM') AS mes,
                 jsonb_agg(DISTINCT s.conta_bancaria_id) AS contas
            FROM financeiro_saldos_bancarios_v2 s
           WHERE s.cliente_id = p_cliente_id AND s.conta_bancaria_id IS NOT NULL
             AND s.ano_mes >= (p_ano - 1)::text || '-12' AND s.ano_mes <= p_ano::text || '-11'
             AND s.saldo_final IS NOT NULL AND s.saldo_final <> 0
           GROUP BY 1) m;
  FOR i IN 1..12 LOOP
$b2$;
  a3 := $a3$                            OR b.id IN (SELECT jsonb_array_elements_text(coalesce(v_sal->v_mes, '[]'::jsonb))::uuid)
$a3$;
  b3 := $b3$                            OR b.id IN (SELECT jsonb_array_elements_text(coalesce(v_sal->v_mes, '[]'::jsonb))::uuid)
                            OR b.id IN (SELECT jsonb_array_elements_text(coalesce(v_ant->v_mes, '[]'::jsonb))::uuid)
$b3$;
  FOREACH a IN ARRAY ARRAY[a1, a2, a3] LOOP
    IF (length(v_def) - length(replace(v_def, a, ''))) / length(a) <> 1 THEN
      RAISE EXCEPTION 'public.fn_conciliacao_status_ano(uuid, integer): ancora nao casa exatamente 1x: %', left(a, 60);
    END IF;
  END LOOP;
  v_novo := replace(replace(replace(v_def, a1, b1), a2, b2), a3, b3);
  EXECUTE v_novo;
  SELECT p.prosrc INTO v_depois FROM pg_proc p WHERE p.oid = 'public.fn_conciliacao_status_ano(uuid, integer)'::regprocedure;
  IF md5(v_depois) <> 'ab397ac3b920cc3ffec95ed91914ef6d' THEN
    RAISE EXCEPTION 'public.fn_conciliacao_status_ano(uuid, integer): corpo resultante inesperado (md5 %)', md5(v_depois);
  END IF;
END $mig$;

-- ═══ guardas de destino ═══
DO $guarda$
DECLARE r record; f text;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)'::regprocedure)
       IS DISTINCT FROM '04aa7a4d773b7d58dcdf94d7e9415daf'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliacao_status_ano(uuid, integer)'::regprocedure)
       IS DISTINCT FROM 'ab397ac3b920cc3ffec95ed91914ef6d'
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliacao_resumo_mes(uuid, text, uuid[])'::regprocedure)
       IS DISTINCT FROM '25aa2ac47b2bec06c951377cb2cecc84' THEN
    RAISE EXCEPTION 'corpo de destino inesperado';
  END IF;
  FOREACH f IN ARRAY ARRAY['public._fn_conciliacao_resumo(uuid, text, uuid[], boolean, boolean)',
                           'public.fn_conciliacao_resumo_mes(uuid, text, uuid[])',
                           'public.fn_conciliacao_status_ano(uuid, integer)'] LOOP
    SELECT p.oid, p.proconfig, p.prosecdef INTO r FROM pg_proc p WHERE p.oid = f::regprocedure;
    IF NOT ('plan_cache_mode=force_custom_plan' = ANY (r.proconfig)) OR NOT ('search_path=pg_catalog, public' = ANY (r.proconfig))
       OR NOT r.prosecdef OR has_function_privilege('anon', r.oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', r.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', r.oid, 'EXECUTE') <> (f NOT LIKE 'public.\_fn%')
       OR EXISTS (SELECT 1 FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid = r.oid)) x WHERE x.grantee = 0) THEN
      RAISE EXCEPTION '%: config/ACL inesperados (%)', f, r.proconfig;
    END IF;
  END LOOP;
END $guarda$;
