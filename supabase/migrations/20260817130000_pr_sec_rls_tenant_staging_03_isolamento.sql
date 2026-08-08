-- 20260817130000_pr_sec_rls_tenant_staging_03_isolamento.sql
-- PR-SEC-RLS-TENANT-STAGING-03 — BLOCO 2: isolamento tenant-safe do motor vivo do
-- Enriquecimento (Conciliação Bancária → Importar Banco / Enriquecer / Conciliação).
--
-- DEPENDE DE 20260817120000 (PR-CLEANUP-MESA-CLASSIFICACAO-01). Aplicar DEPOIS dela.
-- Com a quarentena aplicada, authenticated tem SOMENTE SELECT na staging. Por isso este
-- bloco e' a VERSAO REDUZIDA do desenho original: uma unica policy (SELECT), sem policy de
-- INSERT/UPDATE/DELETE, sem grants de coluna e sem trigger de imutabilidade — nada disso
-- tem consumidor depois que a tela legada saiu de circulacao.
--
-- O QUE FICA ABERTO HOJE E O QUE ESTE BLOCO FECHA
--   1) financeiro_classificacao_staging tem UMA policy: ALL / PUBLIC / USING(true) /
--      WITH CHECK(true). Qualquer authenticated le as 37.390 linhas dos 3 tenants.
--      Pior caso medido em 2026-08-08: um membro unico de Agnaldo Cedenho enxerga 35.473
--      linhas alheias. Depois: enxerga 1.917, as suas.
--   2) Tres funcoes SECURITY DEFINER nao verificavam identidade nenhuma:
--        fn_classificacao_apply             — o handler WHEN OTHERS gravava erro_apply em
--                                             linha de outro tenant (primitiva de escrita).
--        fn_classificacao_candidatos_proximos
--        fn_classificacao_candidatos_grupo  — devolviam ate 10/20 lancamentos de outro
--                                             tenant (descricao, valor, data, documento,
--                                             fornecedor, nomes de conta) a quem soubesse
--                                             um staging_id.
--      A quarta, fn_classificacao_candidatos_ambiguo, ficou sem EXECUTE para authenticated
--      no bloco 1 — neutralizada por ACL, nao por codigo. Registrada para hardening no
--      PR-CLEANUP-MESA-CLASSIFICACAO-02, que a remove junto com a tela legada.
--
-- ANTI-ORACULO. Nas tres funcoes, id/sessao INEXISTENTE e id/sessao ALHEIO produzem a
-- MESMA resposta: sem excecao, sem SQLSTATE, sem mensagem. Candidatas devolvem conjunto
-- vazio; apply devolve {sessao_id, aplicados:0, pulados_subcentro_preenchido:0, erros:0},
-- preservando a chave sessao_id do contrato atual.
--
-- CONTRATO PRESERVADO. Assinatura, tipo de retorno e colunas inalterados: apply -> jsonb com
-- as mesmas 4 chaves; proximos e grupo -> TABLE de 15 colunas, mesmos nomes e tipos.
-- Os corpos novos foram derivados por transformacao mecanica sobre os corpos vivos do proto
-- (md5(prosrc) conferido); nada foi redigitado.
--
-- service_role. EXECUTE revogado em fn_classificacao_apply: nao ha consumidor comprovado
-- (as 4 Edge Functions que usam service_role nao tocam classificacao) e, com a guarda nova,
-- uma chamada de service_role teria auth.uid() NULL e seria negada de qualquer forma.
-- O rollback restaura esse grant.
--
-- POR QUE UMA SO POLICY BASTA. postgres e service_role tem rolbypassrls=true e a tabela esta
-- com relforcerowsecurity=false; RLS so se aplica a authenticated, que agora so faz SELECT.
-- As 16 RPCs vivas continuam escrevendo como SECURITY DEFINER (owner postgres), intocadas.
--
-- IMPACTO FUNCIONAL ESPERADO NO FLUXO VIGENTE: ZERO.
--   Importar Banco  -> extrato_bancario_v2, nao toca a staging.
--   Enriquecer      -> le vw_classificacao_staging_preview e a lista de sessoes (ambas
--                      filtradas por cliente do proprio usuario) e escreve por RPC SECDEF.
--   Conciliação     -> extrato_bancario_v2 + financeiro_lancamentos_v2.
--
-- ENCAIXE ARQUITETURAL (Constituicao, Titulo IV.2)
--   (a) Ja existe? Sim: programa de isolamento de 27-28/07 e PR-SEC-RLS-TENANT-CORE-02.
--   (b) Reutilizar? Sim: o predicado canonico do CORE-02, sem variacao.
--   (c) Fonte soberana? cliente_id da propria linha — unica autoridade disponivel, ja que
--       sessao_id e' crypto.randomUUID() do browser e nenhuma das 141 sessoes existe em
--       mesa_sessao.
--   (d) Segunda forma? Nao. Sem RPC nova, sem view, sem indice.
--   (e) Tela ou plataforma? Plataforma.
--   (f) Divida? Reduz. Seguem abertas, registradas: mesa_par, financeiro_fornecedores,
--       excel_linhas_aux, mesa_lancamento_staging, financeiro_plano_contas, mesa_sessao,
--       financeiro_subcentro_aliases, mesa_ofx_validacao, financeiro_classificacao_regras.
--
-- Migration PREPARADA — aplicar somente pelo processo autorizado.


-- I.0 PRE-CHECKS FATAIS ------------------------------------------------------------------------
DO $$
DECLARE
  v_n int; v_sobrando text;
BEGIN
  -- bloco 1 tem de ter passado antes
  IF NOT pg_catalog.has_table_privilege('authenticated','public.financeiro_classificacao_staging','SELECT') THEN
    RAISE EXCEPTION 'STAGING-03: authenticated sem SELECT — estado inesperado';
  END IF;
  SELECT string_agg(p, ',' ORDER BY p) INTO v_sobrando
    FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
   WHERE pg_catalog.has_table_privilege('authenticated','public.financeiro_classificacao_staging',p);
  IF v_sobrando IS NOT NULL THEN
    RAISE EXCEPTION 'STAGING-03: aplique 20260817120000 (quarentena) antes — authenticated ainda tem: %', v_sobrando;
  END IF;

  -- policy de origem
  SELECT count(*) INTO v_n FROM pg_policy
   WHERE polrelid = 'public.financeiro_classificacao_staging'::regclass;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'STAGING-03: esperava exatamente 1 policy, encontrei %', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy
                  WHERE polrelid='public.financeiro_classificacao_staging'::regclass
                    AND polname='financeiro_classificacao_staging_all') THEN
    RAISE EXCEPTION 'STAGING-03: policy financeiro_classificacao_staging_all ausente';
  END IF;

  -- corpos vivos: congelar md5 para o rollback poder ser conferido
  PERFORM set_config('app.st03_md5_' || p.proname,  md5(p.prosrc), true)
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('fn_classificacao_apply','fn_classificacao_candidatos_proximos',
                        'fn_classificacao_candidatos_grupo');

  IF (SELECT md5(prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='fn_classificacao_apply')
     <> 'b16bf7bc40b6b8ec2c1672889045346f' THEN
    RAISE EXCEPTION 'STAGING-03: fn_classificacao_apply divergente do corpo esperado';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='fn_classificacao_candidatos_proximos')
     <> '79235f4f935335276a1814b17115b4db' THEN
    RAISE EXCEPTION 'STAGING-03: fn_classificacao_candidatos_proximos divergente do corpo esperado';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='fn_classificacao_candidatos_grupo')
     <> '0c40e51d3b3461d1394cc66779169d8e' THEN
    RAISE EXCEPTION 'STAGING-03: fn_classificacao_candidatos_grupo divergente do corpo esperado';
  END IF;

  RAISE NOTICE 'STAGING-03 pre-checks OK: quarentena aplicada, 1 policy de origem, 3 corpos conferidos.';
END $$;


-- I.1 POLICY tenant-safe de leitura ------------------------------------------------------------
DROP POLICY financeiro_classificacao_staging_all ON public.financeiro_classificacao_staging;

CREATE POLICY financeiro_classificacao_staging_select_tenant
    ON public.financeiro_classificacao_staging
    AS PERMISSIVE FOR SELECT
    TO authenticated
    USING (
    (select is_admin_agroinblue((select auth.uid())))
    OR cliente_id IN (SELECT t.cliente_id FROM get_user_cliente_ids((select auth.uid())) t(cliente_id))
    );


-- I.2 SECURITY DEFINER com guarda de tenant e search_path fixado -------------------------------
CREATE OR REPLACE FUNCTION public.fn_classificacao_apply(p_sessao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_id        uuid;
  v_res       jsonb;
  v_aplicados int := 0;
  v_pulados   int := 0;
  v_erros     int := 0;
BEGIN
  IF p_sessao_id IS NULL THEN RAISE EXCEPTION 'p_sessao_id obrigatorio'; END IF;

  FOR v_id IN
    -- PR-SEC-RLS-TENANT-STAGING-03 — a autorizacao vive no proprio cursor. Sessao
    -- inexistente e sessao alheia produzem ambas ZERO iteracoes, logo o mesmo retorno
    -- {aplicados:0, pulados:0, erros:0}: sem oraculo. E o handler WHEN OTHERS abaixo
    -- passa a alcancar somente linhas autorizadas, por construcao.
    SELECT staging_id FROM financeiro_classificacao_staging
    WHERE sessao_id = p_sessao_id
      AND ( public.is_admin_agroinblue((SELECT auth.uid()))
            OR cliente_id IN (SELECT t.cliente_id
                                FROM public.get_user_cliente_ids((SELECT auth.uid())) t(cliente_id)) )
      AND match_status = 'exato' AND aplicado = false AND match_lancamento_id IS NOT NULL
    ORDER BY excel_linha_origem
  LOOP
    BEGIN
      v_res := public.fn_classificacao_apply_row(v_id, false);
      IF (v_res->>'aplicado')::boolean THEN
        v_aplicados := v_aplicados + 1;
      ELSIF v_res->>'motivo' = 'pulado_subcentro_preenchido' THEN
        v_pulados := v_pulados + 1;
      ELSE
        v_erros := v_erros + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- defesa redundante: o cursor ja filtrou, mas o predicado se repete aqui para que
      -- nenhuma alteracao futura do loop reabra escrita em linha de outro tenant.
      UPDATE financeiro_classificacao_staging
        SET erro_apply = SQLERRM, aplicado = false
        WHERE staging_id = v_id
          AND ( public.is_admin_agroinblue((SELECT auth.uid()))
                OR cliente_id IN (SELECT t.cliente_id
                                    FROM public.get_user_cliente_ids((SELECT auth.uid())) t(cliente_id)) );
      v_erros := v_erros + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'sessao_id', p_sessao_id,
    'aplicados', v_aplicados,
    'pulados_subcentro_preenchido', v_pulados,
    'erros', v_erros
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_classificacao_candidatos_proximos(p_staging_id uuid)
 RETURNS TABLE(lanc_id uuid, descricao text, observacao text, data_pagamento date, valor numeric, tipo_operacao text, subcentro_atual text, macro_atual text, grupo_atual text, favorecido_id uuid, favorecido_nome text, conta_bancaria_nome text, conta_destino_nome text, documento text, distancia_dias int)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_s RECORD; v_conta_origem_id uuid; v_conta_destino_id uuid; v_ano_mes text;
BEGIN
  SELECT * INTO v_s FROM public.financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- PR-SEC-RLS-TENANT-STAGING-03 — guarda de tenant ANTES de qualquer leitura de
  -- financeiro_lancamentos_v2. Resposta identica para id inexistente e id alheio:
  -- conjunto vazio, sem excecao, sem mensagem. Elimina o oraculo.
  IF NOT ( public.is_admin_agroinblue((SELECT auth.uid()))
           OR v_s.cliente_id IN (SELECT t.cliente_id
                                   FROM public.get_user_cliente_ids((SELECT auth.uid())) t(cliente_id)) ) THEN
    RETURN;
  END IF;

  v_conta_origem_id  := COALESCE(v_s.conta_origem_id, public.fn_classificacao_resolver_conta(v_s.cliente_id, v_s.excel_conta_origem));
  v_conta_destino_id := COALESCE(v_s.conta_destino_id, public.fn_classificacao_resolver_conta(v_s.cliente_id, v_s.excel_conta_destino));
  v_ano_mes := COALESCE(v_s.excel_ano_mes, to_char(v_s.excel_data, 'YYYY-MM'));

  RETURN QUERY
  SELECT
    l.id, l.descricao, l.observacao, l.data_pagamento, l.valor,
    l.tipo_operacao, l.subcentro, l.macro_custo, l.grupo_custo,
    l.favorecido_id, fo.nome, cb.nome_exibicao, cd.nome_exibicao,
    l.numero_documento, ABS(l.data_pagamento - v_s.excel_data)::int
  FROM public.financeiro_lancamentos_v2 l
  LEFT JOIN public.financeiro_fornecedores     fo ON fo.id = l.favorecido_id
  LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id = l.conta_bancaria_id
  LEFT JOIN public.financeiro_contas_bancarias cd ON cd.id = l.conta_destino_id
  WHERE l.cliente_id = v_s.cliente_id
    AND l.cancelado = false
    AND l.status_transacao = 'realizado'
    AND l.ano_mes = v_ano_mes
    AND l.data_pagamento BETWEEN v_s.excel_data - 10 AND v_s.excel_data + 10
    AND ABS(l.valor) BETWEEN v_s.excel_valor - 0.005 AND v_s.excel_valor + 0.005
    AND l.tipo_operacao = v_s.excel_tipo_operacao
    AND (
      (l.tipo_operacao = '1-Entradas' AND (CASE WHEN v_conta_destino_id IS NOT NULL THEN l.conta_destino_id = v_conta_destino_id
                                                ELSE (l.conta_destino_id = v_conta_origem_id OR l.conta_bancaria_id = v_conta_origem_id) END)) OR
      (l.tipo_operacao = '2-Saídas'          AND l.conta_bancaria_id = v_conta_origem_id) OR
      (l.tipo_operacao = '3-Transferências'  AND l.conta_bancaria_id = v_conta_origem_id AND l.conta_destino_id = v_conta_destino_id)
    )
  ORDER BY ABS(l.data_pagamento - v_s.excel_data), l.id
  LIMIT 10;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_classificacao_candidatos_grupo(p_staging_id uuid)
 RETURNS TABLE(lanc_id uuid, descricao text, observacao text, data_pagamento date, valor numeric, tipo_operacao text, subcentro_atual text, macro_atual text, grupo_atual text, favorecido_id uuid, favorecido_nome text, conta_bancaria_nome text, conta_destino_nome text, documento text, distancia_dias int)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_s RECORD; v_conta_origem_id uuid; v_conta_destino_id uuid; v_ano_mes text;
BEGIN
  SELECT * INTO v_s FROM public.financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- PR-SEC-RLS-TENANT-STAGING-03 — guarda de tenant ANTES de qualquer leitura de
  -- financeiro_lancamentos_v2. Resposta identica para id inexistente e id alheio:
  -- conjunto vazio, sem excecao, sem mensagem. Elimina o oraculo.
  IF NOT ( public.is_admin_agroinblue((SELECT auth.uid()))
           OR v_s.cliente_id IN (SELECT t.cliente_id
                                   FROM public.get_user_cliente_ids((SELECT auth.uid())) t(cliente_id)) ) THEN
    RETURN;
  END IF;

  v_conta_origem_id  := COALESCE(v_s.conta_origem_id, public.fn_classificacao_resolver_conta(v_s.cliente_id, v_s.excel_conta_origem));
  v_conta_destino_id := COALESCE(v_s.conta_destino_id, public.fn_classificacao_resolver_conta(v_s.cliente_id, v_s.excel_conta_destino));
  v_ano_mes := COALESCE(v_s.excel_ano_mes, to_char(v_s.excel_data, 'YYYY-MM'));

  RETURN QUERY
  SELECT
    l.id, l.descricao, l.observacao, l.data_pagamento, l.valor,
    l.tipo_operacao, l.subcentro, l.macro_custo, l.grupo_custo,
    l.favorecido_id, fo.nome, cb.nome_exibicao, cd.nome_exibicao,
    l.numero_documento, ABS(l.data_pagamento - v_s.excel_data)::int
  FROM public.financeiro_lancamentos_v2 l
  LEFT JOIN public.financeiro_fornecedores     fo ON fo.id = l.favorecido_id
  LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id = l.conta_bancaria_id
  LEFT JOIN public.financeiro_contas_bancarias cd ON cd.id = l.conta_destino_id
  WHERE l.cliente_id = v_s.cliente_id
    AND l.cancelado = false
    AND l.status_transacao = 'realizado'
    AND l.ano_mes = v_ano_mes
    AND l.data_pagamento BETWEEN v_s.excel_data - 10 AND v_s.excel_data + 10
    AND ABS(l.valor) <= v_s.excel_valor + 0.005
    AND l.tipo_operacao = v_s.excel_tipo_operacao
    AND (
      (l.tipo_operacao = '1-Entradas' AND (CASE WHEN v_conta_destino_id IS NOT NULL THEN l.conta_destino_id = v_conta_destino_id
                                                ELSE (l.conta_destino_id = v_conta_origem_id OR l.conta_bancaria_id = v_conta_origem_id) END)) OR
      (l.tipo_operacao = '2-Saídas'          AND l.conta_bancaria_id = v_conta_origem_id) OR
      (l.tipo_operacao = '3-Transferências'  AND l.conta_bancaria_id = v_conta_origem_id AND l.conta_destino_id = v_conta_destino_id)
    )
  -- PR-GRUPO-ORDER-01: valor igual ao Excel PRIMEIRO; depois menor diferença de valor;
  -- depois menor distância de data; id no desempate determinístico.
  ORDER BY (ABS(l.valor - v_s.excel_valor) <= 0.005) DESC,
           ABS(l.valor - v_s.excel_valor) ASC,
           ABS(l.data_pagamento - v_s.excel_data),
           l.id
  LIMIT 20;
END;
$function$;


-- I.3 ACL nominal das tres funcoes (nao depender do default) -----------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_apply(uuid)                    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_candidatos_proximos(uuid)      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_candidatos_grupo(uuid)         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_apply(uuid)                    FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_candidatos_proximos(uuid)      FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_candidatos_grupo(uuid)         FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_classificacao_apply(uuid)                    FROM service_role;

GRANT  EXECUTE ON FUNCTION public.fn_classificacao_apply(uuid)                    TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_classificacao_candidatos_proximos(uuid)      TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_classificacao_candidatos_grupo(uuid)         TO authenticated;


-- I.4 POS-CHECKS FATAIS ------------------------------------------------------------------------
DO $$
DECLARE
  v_n int; v_cmd "char"; v_perm boolean; v_roles oid[];
BEGIN
  SELECT count(*) INTO v_n FROM pg_policy
   WHERE polrelid='public.financeiro_classificacao_staging'::regclass;
  IF v_n <> 1 THEN RAISE EXCEPTION 'STAGING-03: esperava 1 policy no fim, encontrei %', v_n; END IF;

  SELECT polcmd, polpermissive, polroles INTO v_cmd, v_perm, v_roles
    FROM pg_policy WHERE polrelid='public.financeiro_classificacao_staging'::regclass
      AND polname='financeiro_classificacao_staging_select_tenant';
  IF v_cmd IS NULL THEN RAISE EXCEPTION 'STAGING-03: policy nova ausente'; END IF;
  IF v_cmd <> 'r' THEN RAISE EXCEPTION 'STAGING-03: policy nova nao e SELECT (%)', v_cmd; END IF;
  IF NOT v_perm THEN RAISE EXCEPTION 'STAGING-03: policy nova nao e PERMISSIVE'; END IF;
  IF v_roles = '{0}'::oid[] THEN RAISE EXCEPTION 'STAGING-03: policy nova aponta para PUBLIC'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.oid = ANY(v_roles) AND r.rolname='authenticated') THEN
    RAISE EXCEPTION 'STAGING-03: policy nova nao e TO authenticated';
  END IF;

  -- search_path fixado nas tres
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public'
                AND p.proname IN ('fn_classificacao_apply','fn_classificacao_candidatos_proximos',
                                  'fn_classificacao_candidatos_grupo')
                AND coalesce(array_to_string(p.proconfig,','),'') <> 'search_path=pg_catalog, public') THEN
    RAISE EXCEPTION 'STAGING-03: search_path nao ficou fixado em pg_catalog, public nas tres funcoes';
  END IF;

  -- as tres seguem SECURITY DEFINER e owner postgres
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public'
                AND p.proname IN ('fn_classificacao_apply','fn_classificacao_candidatos_proximos',
                                  'fn_classificacao_candidatos_grupo')
                AND (NOT p.prosecdef OR pg_get_userbyid(p.proowner) <> 'postgres')) THEN
    RAISE EXCEPTION 'STAGING-03: SECDEF/owner alterado indevidamente';
  END IF;

  -- ACL alvo
  IF pg_catalog.has_function_privilege('service_role','public.fn_classificacao_apply(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'STAGING-03: service_role ainda executa fn_classificacao_apply';
  END IF;
  IF NOT (pg_catalog.has_function_privilege('authenticated','public.fn_classificacao_apply(uuid)','EXECUTE')
      AND pg_catalog.has_function_privilege('authenticated','public.fn_classificacao_candidatos_proximos(uuid)','EXECUTE')
      AND pg_catalog.has_function_privilege('authenticated','public.fn_classificacao_candidatos_grupo(uuid)','EXECUTE')) THEN
    RAISE EXCEPTION 'STAGING-03: authenticated perdeu EXECUTE — o Enriquecimento quebraria';
  END IF;
  IF pg_catalog.has_function_privilege('anon','public.fn_classificacao_candidatos_grupo(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'STAGING-03: anon ainda executa candidatos_grupo';
  END IF;

  RAISE NOTICE 'STAGING-03 pos-checks OK: 1 policy SELECT TO authenticated; 3 SECDEF com guarda e search_path fixo; service_role sem EXECUTE em apply.';
END $$;


-- ==============================================================================================
-- MANUAL ROLLBACK — NAO EXECUTA. Bloco integralmente comentado.
-- Reverter reabre: (i) leitura cross-tenant das 37.390 linhas por qualquer authenticated;
-- (ii) leitura de lancamentos de outro tenant pelas candidatas; (iii) escrita de erro_apply
-- em linha alheia pelo handler do apply. Medida de emergencia com prazo, nunca repouso.
--
-- Os tres CREATE OR REPLACE abaixo sao o texto VIVO do proto em 2026-08-08, extraido por
-- base64/pg_get_functiondef e conferido por md5(prosrc). Restauram byte a byte:
--   fn_classificacao_apply                = b16bf7bc40b6b8ec2c1672889045346f
--   fn_classificacao_candidatos_proximos  = 79235f4f935335276a1814b17115b4db
--   fn_classificacao_candidatos_grupo     = 0c40e51d3b3461d1394cc66779169d8e
-- ----------------------------------------------------------------------------------------------
-- DROP POLICY financeiro_classificacao_staging_select_tenant ON public.financeiro_classificacao_staging;
-- CREATE POLICY financeiro_classificacao_staging_all
--     ON public.financeiro_classificacao_staging
--     AS PERMISSIVE FOR ALL TO PUBLIC
--     USING (true) WITH CHECK (true);
--
-- GRANT EXECUTE ON FUNCTION public.fn_classificacao_apply(uuid) TO service_role;
--
-- CREATE OR REPLACE FUNCTION public.fn_classificacao_apply(p_sessao_id uuid)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_id        uuid;
--   v_res       jsonb;
--   v_aplicados int := 0;
--   v_pulados   int := 0;
--   v_erros     int := 0;
-- BEGIN
--   IF p_sessao_id IS NULL THEN RAISE EXCEPTION 'p_sessao_id obrigatorio'; END IF;
--
--   FOR v_id IN
--     SELECT staging_id FROM financeiro_classificacao_staging
--     WHERE sessao_id = p_sessao_id
--       AND match_status = 'exato' AND aplicado = false AND match_lancamento_id IS NOT NULL
--     ORDER BY excel_linha_origem
--   LOOP
--     BEGIN
--       v_res := public.fn_classificacao_apply_row(v_id, false);
--       IF (v_res->>'aplicado')::boolean THEN
--         v_aplicados := v_aplicados + 1;
--       ELSIF v_res->>'motivo' = 'pulado_subcentro_preenchido' THEN
--         v_pulados := v_pulados + 1;
--       ELSE
--         v_erros := v_erros + 1;
--       END IF;
--     EXCEPTION WHEN OTHERS THEN
--       UPDATE financeiro_classificacao_staging
--         SET erro_apply = SQLERRM, aplicado = false
--         WHERE staging_id = v_id;
--       v_erros := v_erros + 1;
--     END;
--   END LOOP;
--
--   RETURN jsonb_build_object(
--     'sessao_id', p_sessao_id,
--     'aplicados', v_aplicados,
--     'pulados_subcentro_preenchido', v_pulados,
--     'erros', v_erros
--   );
-- END;
-- $function$;

-- CREATE OR REPLACE FUNCTION public.fn_classificacao_candidatos_proximos(p_staging_id uuid)
--  RETURNS TABLE(lanc_id uuid, descricao text, observacao text, data_pagamento date, valor numeric, tipo_operacao text, subcentro_atual text, macro_atual text, grupo_atual text, favorecido_id uuid, favorecido_nome text, conta_bancaria_nome text, conta_destino_nome text, documento text, distancia_dias int)
--  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_s RECORD; v_conta_origem_id uuid; v_conta_destino_id uuid; v_ano_mes text;
-- BEGIN
--   SELECT * INTO v_s FROM public.financeiro_classificacao_staging WHERE staging_id = p_staging_id;
--   IF NOT FOUND THEN RETURN; END IF;
--
--   v_conta_origem_id  := COALESCE(v_s.conta_origem_id, public.fn_classificacao_resolver_conta(v_s.cliente_id, v_s.excel_conta_origem));
--   v_conta_destino_id := COALESCE(v_s.conta_destino_id, public.fn_classificacao_resolver_conta(v_s.cliente_id, v_s.excel_conta_destino));
--   v_ano_mes := COALESCE(v_s.excel_ano_mes, to_char(v_s.excel_data, 'YYYY-MM'));
--
--   RETURN QUERY
--   SELECT
--     l.id, l.descricao, l.observacao, l.data_pagamento, l.valor,
--     l.tipo_operacao, l.subcentro, l.macro_custo, l.grupo_custo,
--     l.favorecido_id, fo.nome, cb.nome_exibicao, cd.nome_exibicao,
--     l.numero_documento, ABS(l.data_pagamento - v_s.excel_data)::int
--   FROM public.financeiro_lancamentos_v2 l
--   LEFT JOIN public.financeiro_fornecedores     fo ON fo.id = l.favorecido_id
--   LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id = l.conta_bancaria_id
--   LEFT JOIN public.financeiro_contas_bancarias cd ON cd.id = l.conta_destino_id
--   WHERE l.cliente_id = v_s.cliente_id
--     AND l.cancelado = false
--     AND l.status_transacao = 'realizado'
--     AND l.ano_mes = v_ano_mes
--     AND l.data_pagamento BETWEEN v_s.excel_data - 10 AND v_s.excel_data + 10
--     AND ABS(l.valor) BETWEEN v_s.excel_valor - 0.005 AND v_s.excel_valor + 0.005
--     AND l.tipo_operacao = v_s.excel_tipo_operacao
--     AND (
--       (l.tipo_operacao = '1-Entradas' AND (CASE WHEN v_conta_destino_id IS NOT NULL THEN l.conta_destino_id = v_conta_destino_id
--                                                 ELSE (l.conta_destino_id = v_conta_origem_id OR l.conta_bancaria_id = v_conta_origem_id) END)) OR
--       (l.tipo_operacao = '2-Saídas'          AND l.conta_bancaria_id = v_conta_origem_id) OR
--       (l.tipo_operacao = '3-Transferências'  AND l.conta_bancaria_id = v_conta_origem_id AND l.conta_destino_id = v_conta_destino_id)
--     )
--   ORDER BY ABS(l.data_pagamento - v_s.excel_data), l.id
--   LIMIT 10;
-- END;
-- $function$;

-- CREATE OR REPLACE FUNCTION public.fn_classificacao_candidatos_grupo(p_staging_id uuid)
--  RETURNS TABLE(lanc_id uuid, descricao text, observacao text, data_pagamento date, valor numeric, tipo_operacao text, subcentro_atual text, macro_atual text, grupo_atual text, favorecido_id uuid, favorecido_nome text, conta_bancaria_nome text, conta_destino_nome text, documento text, distancia_dias int)
--  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_s RECORD; v_conta_origem_id uuid; v_conta_destino_id uuid; v_ano_mes text;
-- BEGIN
--   SELECT * INTO v_s FROM public.financeiro_classificacao_staging WHERE staging_id = p_staging_id;
--   IF NOT FOUND THEN RETURN; END IF;
--
--   v_conta_origem_id  := COALESCE(v_s.conta_origem_id, public.fn_classificacao_resolver_conta(v_s.cliente_id, v_s.excel_conta_origem));
--   v_conta_destino_id := COALESCE(v_s.conta_destino_id, public.fn_classificacao_resolver_conta(v_s.cliente_id, v_s.excel_conta_destino));
--   v_ano_mes := COALESCE(v_s.excel_ano_mes, to_char(v_s.excel_data, 'YYYY-MM'));
--
--   RETURN QUERY
--   SELECT
--     l.id, l.descricao, l.observacao, l.data_pagamento, l.valor,
--     l.tipo_operacao, l.subcentro, l.macro_custo, l.grupo_custo,
--     l.favorecido_id, fo.nome, cb.nome_exibicao, cd.nome_exibicao,
--     l.numero_documento, ABS(l.data_pagamento - v_s.excel_data)::int
--   FROM public.financeiro_lancamentos_v2 l
--   LEFT JOIN public.financeiro_fornecedores     fo ON fo.id = l.favorecido_id
--   LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id = l.conta_bancaria_id
--   LEFT JOIN public.financeiro_contas_bancarias cd ON cd.id = l.conta_destino_id
--   WHERE l.cliente_id = v_s.cliente_id
--     AND l.cancelado = false
--     AND l.status_transacao = 'realizado'
--     AND l.ano_mes = v_ano_mes
--     AND l.data_pagamento BETWEEN v_s.excel_data - 10 AND v_s.excel_data + 10
--     AND ABS(l.valor) <= v_s.excel_valor + 0.005
--     AND l.tipo_operacao = v_s.excel_tipo_operacao
--     AND (
--       (l.tipo_operacao = '1-Entradas' AND (CASE WHEN v_conta_destino_id IS NOT NULL THEN l.conta_destino_id = v_conta_destino_id
--                                                 ELSE (l.conta_destino_id = v_conta_origem_id OR l.conta_bancaria_id = v_conta_origem_id) END)) OR
--       (l.tipo_operacao = '2-Saídas'          AND l.conta_bancaria_id = v_conta_origem_id) OR
--       (l.tipo_operacao = '3-Transferências'  AND l.conta_bancaria_id = v_conta_origem_id AND l.conta_destino_id = v_conta_destino_id)
--     )
--   -- PR-GRUPO-ORDER-01: valor igual ao Excel PRIMEIRO; depois menor diferença de valor;
--   -- depois menor distância de data; id no desempate determinístico.
--   ORDER BY (ABS(l.valor - v_s.excel_valor) <= 0.005) DESC,
--            ABS(l.valor - v_s.excel_valor) ASC,
--            ABS(l.data_pagamento - v_s.excel_data),
--            l.id
--   LIMIT 20;
-- END;
-- $function$;
--
-- DO $rb$
-- BEGIN
--   IF (SELECT md5(prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--        WHERE n.nspname='public' AND p.proname='fn_classificacao_apply')
--      <> 'b16bf7bc40b6b8ec2c1672889045346f' THEN
--     RAISE EXCEPTION 'rollback STAGING-03: fn_classificacao_apply nao voltou ao md5 original';
--   END IF;
--   RAISE NOTICE 'rollback STAGING-03 OK. ISOLAMENTO REVERTIDO — exposicao cross-tenant reaberta.';
-- END $rb$;
-- ==============================================================================================
