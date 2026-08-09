-- =====================================================================
-- PR-SEC-RLS-FINANCIAMENTOS-01
-- Fecha o P0 de isolamento por tenant em tres tabelas do dominio de
-- financiamentos e na RPC fn_endividamento_mensal.
--
--   public.financiamentos             : policy permissiva -> 4 nominais
--   public.financiamento_parcelas     : policy permissiva -> 4 nominais
--   public.financiamento_destinacoes  : policy permissiva -> 3 nominais (sem DELETE)
--   public.fn_endividamento_mensal    : SECDEF sem autorizacao -> guarda P0002
--
-- Predicado canonico vivo (23 tabelas), forma envolta do PR-SEC-RLS-CONTRATOS-01A:
--   is_admin_agroinblue((SELECT auth.uid()))
--   OR cliente_id IN (SELECT cliente_id FROM get_user_cliente_ids((SELECT auth.uid())))
--
-- NAO altera: shape, dados, triggers, FKs, indices, calculo de endividamento,
-- default privileges globais, nem qualquer objeto fora dos quatro acima.
-- NAO cria policy para service_role: rolbypassrls = true (medido).
-- NAO reivindica correcao de anon: anon ja estava sem grant antes desta migration.
--
-- Idempotente em quatro estados: ausente/permissivo -> corrige; final identico ->
-- no-op verdadeiro (zero comandos); divergente ou parcial -> aborta preservando;
-- corpo da RPC divergente -> aborta, nunca sobrescreve cegamente.
--
-- Guarda SHA-256 do payload: aborta ANTES da primeira instrucao se o conteudo
-- executavel nao for exatamente o auditado.
-- =====================================================================
DO $WRAP$
DECLARE
  c_esperado constant text := '011e1a1437eb9c62a217f8737e5577d314a0ac2ebadbeb55d957f58d5a442815';
  v_payload  constant text := $PAYLOAD$DO $BODY$
DECLARE
  -- ---------------------------------------------------------------------
  -- PR-SEC-RLS-FINANCIAMENTOS-01 — corpo executavel
  -- Fecha o P0 de isolamento por tenant em tres tabelas e na RPC
  -- fn_endividamento_mensal. Idempotente em quatro estados.
  -- ---------------------------------------------------------------------
  c_pred constant text :=
    '(is_admin_agroinblue(( SELECT auth.uid() AS uid)) OR (cliente_id IN ( SELECT t.cliente_id'
    || E'\n   FROM get_user_cliente_ids(( SELECT auth.uid() AS uid)) t(cliente_id))))';

  c_md5_rpc_origem constant text := '94b5c55d93625d648548e091c67f5bf5';
  c_md5_rpc_final  constant text := 'ee2d17f71f0e1fbe0c43be73ff07a5e5';

  c_tabelas constant text[] := ARRAY['financiamentos','financiamento_parcelas','financiamento_destinacoes'];

  v_ddl_rpc constant text := $DDL$
CREATE OR REPLACE FUNCTION public.fn_endividamento_mensal(p_cliente_id uuid, p_ano integer)
 RETURNS TABLE(mes integer, divida_inicial_pec numeric, captacao_pec numeric, amortizacao_pec numeric, juros_pec numeric, divida_final_pec numeric, divida_inicial_agri numeric, captacao_agri numeric, amortizacao_agri numeric, juros_agri numeric, divida_final_agri numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  -- PR-SEC-RLS-FINANCIAMENTOS-01 GUARD
  -- Autorizacao ANTES de qualquer acesso a dado. Uma unica saida de recusa:
  -- tenant inexistente, tenant alheio, ausencia de membership e uid nulo
  -- produzem a MESMA mensagem e o MESMO SQLSTATE. Zero enumeracao de tenants.
  v_uid uuid := (SELECT auth.uid());
  v_autorizado boolean := false;
BEGIN
  IF v_uid IS NOT NULL AND p_cliente_id IS NOT NULL THEN
    IF public.is_admin_agroinblue(v_uid) THEN
      v_autorizado := EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = p_cliente_id);
    ELSE
      v_autorizado := EXISTS (
        SELECT 1 FROM public.get_user_cliente_ids(v_uid) t(cliente_id)
         WHERE t.cliente_id = p_cliente_id
      );
    END IF;
  END IF;

  IF NOT v_autorizado THEN
    RAISE EXCEPTION 'Cliente nao encontrado ou sem acesso.' USING ERRCODE = 'P0002';
  END IF;

  -- ---------------------------------------------------------------------
  -- CALCULO — copiado VERBATIM da versao vigente (md5 94b5c55d93625d648548e091c67f5bf5).
  -- Unica alteracao: qualificacao de schema em public.financiamentos e
  -- public.financiamento_parcelas, exigida pelo search_path fixo.
  -- ---------------------------------------------------------------------
  RETURN QUERY
  WITH
    meses AS (SELECT generate_series(1, 12) AS mes),
    fin AS (
      SELECT id, tipo_financiamento, data_contrato, valor_total, valor_entrada, status
      FROM public.financiamentos
      WHERE cliente_id = p_cliente_id
        AND status <> 'cancelado'
    ),
    parc AS (
      SELECT p.financiamento_id, p.valor_principal, p.valor_juros,
             p.data_pagamento, p.status,
             f.tipo_financiamento, f.data_contrato
      FROM public.financiamento_parcelas p
      JOIN fin f ON f.id = p.financiamento_id
      WHERE p.cliente_id = p_cliente_id
    ),
    cortes AS (
      SELECT
        m.mes,
        (p_ano::text || '-' || lpad(m.mes::text, 2, '0') || '-01')::date AS dia1,
        (date_trunc('month', (p_ano::text || '-' || lpad(m.mes::text, 2, '0') || '-01')::date)
          + interval '1 month - 1 day')::date AS ultimo_dia,
        (date_trunc('month', (p_ano::text || '-' || lpad(m.mes::text, 2, '0') || '-01')::date)
          - interval '1 day')::date AS dia_anterior
      FROM meses m
    ),
    divida_inicial AS (
      SELECT c.mes, p.tipo_financiamento, SUM(p.valor_principal) AS v
      FROM cortes c
      JOIN parc p
        ON p.data_contrato <= c.dia_anterior
       AND (p.data_pagamento IS NULL OR p.data_pagamento > c.dia_anterior)
      GROUP BY 1, 2
    ),
    divida_final AS (
      SELECT c.mes, p.tipo_financiamento, SUM(p.valor_principal) AS v
      FROM cortes c
      JOIN parc p
        ON p.data_contrato <= c.ultimo_dia
       AND (p.data_pagamento IS NULL OR p.data_pagamento > c.ultimo_dia)
      GROUP BY 1, 2
    ),
    captacao AS (
      SELECT EXTRACT(MONTH FROM f.data_contrato)::int AS mes,
             f.tipo_financiamento,
             SUM(f.valor_total - COALESCE(f.valor_entrada, 0)) AS v
      FROM fin f
      WHERE EXTRACT(YEAR FROM f.data_contrato) = p_ano
      GROUP BY 1, 2
    ),
    amortizacao AS (
      SELECT EXTRACT(MONTH FROM p.data_pagamento)::int AS mes,
             p.tipo_financiamento,
             SUM(p.valor_principal) AS v
      FROM parc p
      WHERE p.status = 'pago'
        AND EXTRACT(YEAR FROM p.data_pagamento) = p_ano
      GROUP BY 1, 2
    ),
    juros AS (
      SELECT EXTRACT(MONTH FROM p.data_pagamento)::int AS mes,
             p.tipo_financiamento,
             SUM(p.valor_juros) AS v
      FROM parc p
      WHERE p.status = 'pago'
        AND EXTRACT(YEAR FROM p.data_pagamento) = p_ano
      GROUP BY 1, 2
    )
  SELECT
    m.mes,
    COALESCE(di_p.v, 0)::numeric AS divida_inicial_pec,
    COALESCE(c_p.v,  0)::numeric AS captacao_pec,
    COALESCE(a_p.v,  0)::numeric AS amortizacao_pec,
    COALESCE(j_p.v,  0)::numeric AS juros_pec,
    COALESCE(df_p.v, 0)::numeric AS divida_final_pec,
    COALESCE(di_a.v, 0)::numeric AS divida_inicial_agri,
    COALESCE(c_a.v,  0)::numeric AS captacao_agri,
    COALESCE(a_a.v,  0)::numeric AS amortizacao_agri,
    COALESCE(j_a.v,  0)::numeric AS juros_agri,
    COALESCE(df_a.v, 0)::numeric AS divida_final_agri
  FROM meses m
  LEFT JOIN divida_inicial di_p ON di_p.mes = m.mes AND di_p.tipo_financiamento = 'pecuaria'
  LEFT JOIN divida_inicial di_a ON di_a.mes = m.mes AND di_a.tipo_financiamento = 'agricultura'
  LEFT JOIN captacao       c_p  ON c_p.mes  = m.mes AND c_p.tipo_financiamento  = 'pecuaria'
  LEFT JOIN captacao       c_a  ON c_a.mes  = m.mes AND c_a.tipo_financiamento  = 'agricultura'
  LEFT JOIN amortizacao    a_p  ON a_p.mes  = m.mes AND a_p.tipo_financiamento  = 'pecuaria'
  LEFT JOIN amortizacao    a_a  ON a_a.mes  = m.mes AND a_a.tipo_financiamento  = 'agricultura'
  LEFT JOIN juros          j_p  ON j_p.mes  = m.mes AND j_p.tipo_financiamento  = 'pecuaria'
  LEFT JOIN juros          j_a  ON j_a.mes  = m.mes AND j_a.tipo_financiamento  = 'agricultura'
  LEFT JOIN divida_final   df_p ON df_p.mes = m.mes AND df_p.tipo_financiamento = 'pecuaria'
  LEFT JOIN divida_final   df_a ON df_a.mes = m.mes AND df_a.tipo_financiamento = 'agricultura'
  ORDER BY m.mes;
END
$fn$;
$DDL$;

  v_t              text;
  v_cmd            text;
  v_n              int;
  v_md5_rpc        text;
  v_fp_antes       text;
  v_fp_depois      text;
  v_permissivas    int := 0;
  v_nominais       int := 0;
  v_estado         text;
  v_rpc_estado     text;
  v_esperado_del   boolean;
  v_privs_esperados text[];
  v_privs_reais     text[];
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout','15s',true);
  PERFORM pg_catalog.set_config('statement_timeout','120s',true);

  -- =====================================================================
  -- PRE-CHECKS FATAIS DE SHAPE
  -- =====================================================================
  FOREACH v_t IN ARRAY c_tabelas LOOP
    SELECT count(*) INTO v_n
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = v_t AND c.relkind = 'r';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'SEC-FIN-01 P1: tabela public.% ausente ou nao e tabela comum', v_t;
    END IF;

    SELECT count(*) INTO v_n
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = v_t
       AND pg_get_userbyid(c.relowner) = 'postgres' AND c.relrowsecurity;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'SEC-FIN-01 P2: public.% sem owner postgres ou sem RLS habilitada', v_t;
    END IF;

    SELECT count(*) INTO v_n
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = v_t
       AND a.attname = 'cliente_id' AND NOT a.attisdropped
       AND pg_catalog.format_type(a.atttypid, a.atttypmod) = 'uuid';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'SEC-FIN-01 P3: public.% sem coluna cliente_id uuid', v_t;
    END IF;
  END LOOP;

  -- Helpers do predicado canonico precisam existir e ser executaveis por authenticated
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'is_admin_agroinblue'
     AND pg_catalog.pg_get_function_identity_arguments(p.oid) = '_user_id uuid'
     AND p.prosecdef;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'SEC-FIN-01 P4: is_admin_agroinblue(_user_id uuid) SECDEF ausente';
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_user_cliente_ids'
     AND pg_catalog.pg_get_function_identity_arguments(p.oid) = '_user_id uuid'
     AND p.prosecdef;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'SEC-FIN-01 P5: get_user_cliente_ids(_user_id uuid) SECDEF ausente';
  END IF;

  IF NOT pg_catalog.has_function_privilege('authenticated','public.is_admin_agroinblue(uuid)','EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated','public.get_user_cliente_ids(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'SEC-FIN-01 P6: authenticated perderia acesso aos helpers — armadilha de deny-all';
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'clientes' AND c.relkind = 'r';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'SEC-FIN-01 P7: public.clientes ausente — guarda de admin nao seria avaliavel';
  END IF;

  -- Fingerprint de dados: nada nesta migration pode alterar linha
  SELECT (SELECT count(*) FROM public.financiamentos)::text || '/'
      || (SELECT count(*) FROM public.financiamento_parcelas)::text || '/'
      || (SELECT count(*) FROM public.financiamento_destinacoes)::text
    INTO v_fp_antes;

  -- =====================================================================
  -- CLASSIFICACAO DE ESTADO
  -- =====================================================================
  SELECT count(*) INTO v_permissivas
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = ANY(c_tabelas)
     AND p.polname IN ('financiamentos_all','parcelas_all','financiamento_destinacoes_all')
     AND p.polcmd = '*' AND 0 = ANY(p.polroles)
     AND pg_get_expr(p.polqual, p.polrelid) = 'true'
     AND pg_get_expr(p.polwithcheck, p.polrelid) = 'true';

  SELECT count(*) INTO v_nominais
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = ANY(c_tabelas)
     AND p.polname LIKE '%\_sec01' AND p.polcmd <> '*'
     AND NOT (0 = ANY(p.polroles))
     AND p.polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'authenticated')];

  SELECT count(*) INTO v_n
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = ANY(c_tabelas);

  IF v_permissivas = 3 AND v_nominais = 0 AND v_n = 3 THEN
    v_estado := 'PERMISSIVO';
  ELSIF v_permissivas = 0 AND v_nominais = 11 AND v_n = 11 THEN
    v_estado := 'FINAL';
  ELSE
    RAISE EXCEPTION 'SEC-FIN-01 P8: estado de policies divergente/parcial — permissivas=%, nominais=%, total=%. Abortando sem alterar nada.',
      v_permissivas, v_nominais, v_n;
  END IF;

  SELECT md5(p.prosrc) INTO v_md5_rpc
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_endividamento_mensal'
     AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_cliente_id uuid, p_ano integer';
  IF v_md5_rpc IS NULL THEN
    RAISE EXCEPTION 'SEC-FIN-01 P9: fn_endividamento_mensal(uuid,integer) ausente';
  ELSIF v_md5_rpc = c_md5_rpc_origem THEN
    v_rpc_estado := 'PERMISSIVO';
  ELSIF v_md5_rpc = c_md5_rpc_final THEN
    v_rpc_estado := 'FINAL';
  ELSE
    RAISE EXCEPTION 'SEC-FIN-01 P10: corpo de fn_endividamento_mensal divergente (md5=%). Nao sobrescrevo cegamente.', v_md5_rpc;
  END IF;

  IF v_estado = 'FINAL' AND v_rpc_estado = 'FINAL' THEN
    RAISE NOTICE 'SEC-FIN-01: estado final ja vigente. NO-OP verdadeiro — nenhum comando emitido.';
    RETURN;
  END IF;

  IF v_estado <> v_rpc_estado THEN
    RAISE EXCEPTION 'SEC-FIN-01 P11: estado misto — policies=% e RPC=%. Abortando preservando.', v_estado, v_rpc_estado;
  END IF;

  -- =====================================================================
  -- APLICACAO — a partir daqui o estado e comprovadamente PERMISSIVO
  -- =====================================================================
  EXECUTE 'DROP POLICY financiamentos_all ON public.financiamentos';
  EXECUTE 'DROP POLICY parcelas_all ON public.financiamento_parcelas';
  EXECUTE 'DROP POLICY financiamento_destinacoes_all ON public.financiamento_destinacoes';

  FOREACH v_t IN ARRAY c_tabelas LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
      v_t || '_select_sec01', v_t, c_pred);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
      v_t || '_insert_sec01', v_t, c_pred);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      v_t || '_update_sec01', v_t, c_pred, c_pred);
    -- DELETE apenas onde ha consumidor vivo comprovado (ADR-2026-05 §4).
    -- financiamento_destinacoes nao tem consumidor de exclusao: sem policy e sem grant.
    IF v_t <> 'financiamento_destinacoes' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
        v_t || '_delete_sec01', v_t, c_pred);
    END IF;
  END LOOP;

  -- Grants: privilegios perigosos fora; contrato minimo dentro.
  FOREACH v_t IN ARRAY c_tabelas LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.%I FROM authenticated', v_t);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.%I FROM service_role', v_t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', v_t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', v_t);
    IF v_t = 'financiamento_destinacoes' THEN
      EXECUTE format('REVOKE DELETE ON TABLE public.%I FROM authenticated', v_t);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE public.%I TO authenticated', v_t);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', v_t);
    END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', v_t);
  END LOOP;

  -- RPC: guarda de autorizacao antes de qualquer acesso a dado.
  EXECUTE v_ddl_rpc;
  EXECUTE 'ALTER FUNCTION public.fn_endividamento_mensal(uuid, integer) OWNER TO postgres';
  EXECUTE 'REVOKE ALL ON FUNCTION public.fn_endividamento_mensal(uuid, integer) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.fn_endividamento_mensal(uuid, integer) FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.fn_endividamento_mensal(uuid, integer) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.fn_endividamento_mensal(uuid, integer) TO postgres';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.fn_endividamento_mensal(uuid, integer) TO service_role';

  -- =====================================================================
  -- POS-CHECKS FATAIS
  -- =====================================================================
  SELECT count(*) INTO v_n
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = ANY(c_tabelas);
  IF v_n <> 11 THEN
    RAISE EXCEPTION 'SEC-FIN-01 Q1: esperava 11 policies nas tres tabelas, encontrei %', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = ANY(c_tabelas)
     AND (p.polcmd = '*' OR 0 = ANY(p.polroles));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'SEC-FIN-01 Q2: sobrou policy FOR ALL ou aplicavel a PUBLIC (%)', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = ANY(c_tabelas)
     AND (coalesce(pg_get_expr(p.polqual, p.polrelid),'') = 'true'
       OR coalesce(pg_get_expr(p.polwithcheck, p.polrelid),'') = 'true');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'SEC-FIN-01 Q3: sobrou predicado USING(true)/CHECK(true) (%)', v_n;
  END IF;

  -- Predicado literal identico nas 11 policies (18 expressoes: 8 USING + 10 CHECK)
  SELECT count(*) INTO v_n
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = ANY(c_tabelas)
     AND coalesce(pg_get_expr(p.polqual, p.polrelid), c_pred) = c_pred
     AND coalesce(pg_get_expr(p.polwithcheck, p.polrelid), c_pred) = c_pred;
  IF v_n <> 11 THEN
    RAISE EXCEPTION 'SEC-FIN-01 Q4: predicado literal divergente em % de 11 policies', 11 - v_n;
  END IF;

  -- Um comando de cada, por tabela
  FOREACH v_t IN ARRAY c_tabelas LOOP
    v_esperado_del := (v_t <> 'financiamento_destinacoes');
    FOREACH v_cmd IN ARRAY ARRAY['r','a','w','d'] LOOP
      SELECT count(*) INTO v_n
        FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = v_t AND p.polcmd = v_cmd::"char";
      IF v_cmd = 'd' THEN
        IF v_n <> (CASE WHEN v_esperado_del THEN 1 ELSE 0 END) THEN
          RAISE EXCEPTION 'SEC-FIN-01 Q5: policies DELETE em % = % (esperado %)',
            v_t, v_n, (CASE WHEN v_esperado_del THEN 1 ELSE 0 END);
        END IF;
      ELSIF v_n <> 1 THEN
        RAISE EXCEPTION 'SEC-FIN-01 Q6: policies de comando % em % = % (esperado 1)', v_cmd, v_t, v_n;
      END IF;
    END LOOP;
  END LOOP;

  -- ACL nominal por origem (aclexplode), nunca so privilegio efetivo
  FOREACH v_t IN ARRAY c_tabelas LOOP
    v_privs_esperados := CASE WHEN v_t = 'financiamento_destinacoes'
                              THEN ARRAY['INSERT','SELECT','UPDATE']
                              ELSE ARRAY['DELETE','INSERT','SELECT','UPDATE'] END;
    SELECT coalesce(array_agg(x.privilege_type ORDER BY x.privilege_type), ARRAY[]::text[]) INTO v_privs_reais
      FROM (
        SELECT (aclexplode(c.relacl)).*
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = v_t
      ) x
     WHERE pg_get_userbyid(x.grantee) = 'authenticated';

    IF v_privs_reais <> v_privs_esperados THEN
      RAISE EXCEPTION 'SEC-FIN-01 Q7: ACL de authenticated em % = % (esperado %)', v_t, v_privs_reais, v_privs_esperados;
    END IF;

    SELECT count(*) INTO v_n
      FROM (
        SELECT (aclexplode(c.relacl)).*
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = v_t
      ) x
     WHERE coalesce(pg_get_userbyid(x.grantee),'PUBLIC') IN ('anon','PUBLIC');
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'SEC-FIN-01 Q8: % ainda concede privilegio a anon ou PUBLIC', v_t;
    END IF;

    SELECT count(*) INTO v_n
      FROM (
        SELECT (aclexplode(c.relacl)).*
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = v_t
      ) x
     WHERE pg_get_userbyid(x.grantee) IN ('authenticated','service_role')
       AND x.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN');
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'SEC-FIN-01 Q9: % ainda concede privilegio perigoso (%)', v_t, v_n;
    END IF;

    -- Efetivo, como conferencia cruzada
    IF pg_catalog.has_table_privilege('authenticated', 'public.' || quote_ident(v_t), 'TRUNCATE')
       OR pg_catalog.has_table_privilege('anon', 'public.' || quote_ident(v_t), 'SELECT') THEN
      RAISE EXCEPTION 'SEC-FIN-01 Q10: privilegio efetivo indevido em %', v_t;
    END IF;

    -- Shape preservado
    SELECT count(*) INTO v_n
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = v_t
       AND pg_get_userbyid(c.relowner) = 'postgres' AND c.relrowsecurity AND NOT c.relforcerowsecurity;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'SEC-FIN-01 Q11: owner/RLS/FORCE de % foi alterado', v_t;
    END IF;
  END LOOP;

  -- RPC: corpo, atributos e ACL
  SELECT md5(p.prosrc) INTO v_md5_rpc
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_endividamento_mensal'
     AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_cliente_id uuid, p_ano integer';
  IF v_md5_rpc <> c_md5_rpc_final THEN
    RAISE EXCEPTION 'SEC-FIN-01 Q12: corpo final da RPC divergente (md5=%)', v_md5_rpc;
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_endividamento_mensal'
     AND p.prosecdef
     AND pg_get_userbyid(p.proowner) = 'postgres'
     AND p.proconfig = ARRAY['search_path=public, pg_temp']
     AND p.provolatile = 's';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'SEC-FIN-01 Q13: atributos da RPC divergentes (SECDEF/owner/search_path/STABLE)';
  END IF;

  SELECT count(*) INTO v_n
    FROM (
      SELECT (aclexplode(p.proacl)).*
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'fn_endividamento_mensal'
    ) x
   WHERE coalesce(pg_get_userbyid(x.grantee),'PUBLIC') IN ('anon','PUBLIC');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'SEC-FIN-01 Q14: RPC ainda concede EXECUTE a anon ou PUBLIC';
  END IF;

  IF NOT pg_catalog.has_function_privilege('authenticated','public.fn_endividamento_mensal(uuid,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'SEC-FIN-01 Q15: authenticated perdeu EXECUTE da RPC';
  END IF;

  -- Zero alteracao de dados
  SELECT (SELECT count(*) FROM public.financiamentos)::text || '/'
      || (SELECT count(*) FROM public.financiamento_parcelas)::text || '/'
      || (SELECT count(*) FROM public.financiamento_destinacoes)::text
    INTO v_fp_depois;
  IF v_fp_depois <> v_fp_antes THEN
    RAISE EXCEPTION 'SEC-FIN-01 Q16: contagem de linhas mudou (% -> %)', v_fp_antes, v_fp_depois;
  END IF;

  RAISE NOTICE 'SEC-FIN-01: aplicado. 11 policies nominais, ACL contida, RPC com guarda. Linhas: %', v_fp_depois;
END
$BODY$;
$PAYLOAD$;
  v_hash text;
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout','15s',true);
  PERFORM pg_catalog.set_config('statement_timeout','120s',true);
  v_hash := encode(pg_catalog.sha256(pg_catalog.convert_to(v_payload,'UTF8')),'hex');
  IF v_hash <> c_esperado THEN
    RAISE EXCEPTION 'SEC-FIN-01: payload adulterado. sha256 esperado=% obtido=%. Nada foi executado.',
      c_esperado, v_hash;
  END IF;
  EXECUTE v_payload;
END
$WRAP$;
