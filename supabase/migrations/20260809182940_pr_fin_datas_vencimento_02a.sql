-- PR-FIN-DATAS-VENCIMENTO-02A — criacao ATOMICA de contrato + cronograma.
--
-- PROBLEMA QUE RESOLVE
--   `useContratos.criarContrato` fazia INSERT do contrato via PostgREST,
--   commitava, e so entao gerava as parcelas numa SEGUNDA chamada. Falha na
--   segunda deixava contrato ORFAO, sem cronograma. E o gerador client-side
--   gravava o dia de vencimento em `data_pagamento`, deixando `data_vencimento`
--   nula — o defeito das 126 obrigacoes legadas.
--
-- ESTA MIGRATION CRIA EXATAMENTE UM OBJETO:
--   public.fn_contrato_criar_e_gerar(...) -> jsonb
--
-- Contrato e cronograma na MESMA transacao: falha em qualquer obrigacao
-- reverte tambem o contrato recem-criado.
--
-- Novas obrigacoes nascem corretas: data_vencimento preenchida,
-- data_pagamento NULL, status 'programado', ano_mes derivado pelo 02E.
--
-- NAO FAZ: backfill; alteracao das 126 legadas; policy alguma; exclusao
-- fisica; alteracao de PK/FK/indice; e NAO TOCA na RPC publicada do 01B.
--
-- DIVIDA REGISTRADA: PR-FIN-CONTRATO-HELPER-01 — a regra de cronograma fica
-- duplicada entre esta funcao e fn_contrato_editar_e_regenerar. Extrair helper
-- exigiria reescrever o corpo do 01B, que e objeto auditado e publicado.
--
-- IDEMPOTENCIA: ausente -> cria; identica -> no-op verdadeiro;
-- divergente -> aborta; ACL divergente -> aborta.

DO $mig$
DECLARE
  c_corpo constant text :=
$corpo$
DECLARE
  c_dominio  constant int := 8801104;      -- namespace do advisory lock desta frente
  v_uid      uuid := (SELECT auth.uid());
  v_cliente  uuid;
  v_id       uuid := gen_random_uuid();     -- id SEMPRE gerado no servidor
  v_n        int;
  v_hoje     date := CURRENT_DATE;
  v_fim      date;
  v_criadas  bigint;
  v_versao   timestamptz;
  v_ct       public.financeiro_contratos%ROWTYPE;
BEGIN
  -- =====================================================================
  -- 1. AUTENTICACAO — antes de tudo. Sem uid nao ha o que resolver.
  -- =====================================================================
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'operacao nao autorizada' USING ERRCODE = 'P0002';
  END IF;

  -- =====================================================================
  -- 2. TENANT RESOLVIDO NO SERVIDOR.
  --    O browser NUNCA envia cliente_id. O tenant vem da fazenda informada,
  --    e a fazenda so e aceita se pertencer a um cliente do usuario.
  --    Assim a resolucao e a autorizacao sao a MESMA operacao — nao ha
  --    janela entre "descobrir o tenant" e "verificar se pode".
  -- =====================================================================
  IF p_fazenda_id IS NULL THEN
    RAISE EXCEPTION 'operacao nao autorizada' USING ERRCODE = 'P0002';
  END IF;

  SELECT f.cliente_id INTO v_cliente
    FROM public.fazendas f
   WHERE f.id = p_fazenda_id
     AND ( public.is_admin_agroinblue(v_uid)
        OR EXISTS (SELECT 1 FROM public.get_user_cliente_ids(v_uid) t(cliente_id)
                    WHERE t.cliente_id = f.cliente_id) );

  IF v_cliente IS NULL THEN
    -- Anti-oraculo: fazenda inexistente e fazenda de outro tenant produzem
    -- exatamente esta resposta, com o mesmo ERRCODE.
    RAISE EXCEPTION 'operacao nao autorizada' USING ERRCODE = 'P0002';
  END IF;

  -- =====================================================================
  -- 3. LOCK — serializa criacoes concorrentes do mesmo tenant, evitando
  --    corrida entre duas criacoes que dependam do mesmo estado.
  -- =====================================================================
  PERFORM pg_advisory_xact_lock(c_dominio, pg_catalog.hashtext(v_cliente::text));

  -- =====================================================================
  -- 4. VALIDACAO DOS CAMPOS — SOMENTE APOS a autorizacao, para que a
  --    diferenca de mensagem nunca revele existencia de recurso alheio.
  -- =====================================================================
  IF p_data_inicio IS NULL THEN
    RAISE EXCEPTION 'data de inicio obrigatoria' USING ERRCODE = 'P0001';
  END IF;
  IF p_data_fim IS NOT NULL AND p_data_fim < p_data_inicio THEN
    RAISE EXCEPTION 'data final anterior a data de inicio' USING ERRCODE = 'P0001';
  END IF;
  IF p_dia_pagamento IS NULL OR p_dia_pagamento < 1 OR p_dia_pagamento > 31 THEN
    RAISE EXCEPTION 'dia de vencimento invalido' USING ERRCODE = 'P0001';
  END IF;
  IF p_valor IS NULL OR p_valor < 0 THEN
    RAISE EXCEPTION 'valor invalido' USING ERRCODE = 'P0001';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('ativo','pausado','encerrado') THEN
    RAISE EXCEPTION 'status inicial invalido' USING ERRCODE = 'P0001';
  END IF;

  IF p_conta_bancaria_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.financeiro_contas_bancarias b
        WHERE b.id = p_conta_bancaria_id AND b.cliente_id = v_cliente) THEN
    RAISE EXCEPTION 'conta bancaria invalida para este contrato' USING ERRCODE = 'P0001';
  END IF;
  IF p_fornecedor_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.financeiro_fornecedores fo
        WHERE fo.id = p_fornecedor_id AND fo.cliente_id = v_cliente) THEN
    RAISE EXCEPTION 'fornecedor invalido para este contrato' USING ERRCODE = 'P0001';
  END IF;

  -- =====================================================================
  -- 5. CRIAR O CONTRATO. id, cliente_id e carimbos sao do servidor.
  --    A tabela NAO tem PK (drift do PR-SEC-SCHEMA-CONTRATOS-02), entao o
  --    id gerado e conferido logo apos: colisao aborta a transacao inteira.
  -- =====================================================================
  INSERT INTO public.financeiro_contratos (
    id, cliente_id, fazenda_id, fornecedor_id, produto, valor, frequencia,
    data_inicio, data_fim, dia_pagamento, forma_pagamento, dados_pagamento,
    conta_bancaria_id, subcentro, centro_custo, macro_custo, observacao, status
  ) VALUES (
    v_id, v_cliente, p_fazenda_id, p_fornecedor_id, p_produto, p_valor, p_frequencia,
    p_data_inicio, p_data_fim, p_dia_pagamento, p_forma_pagamento, p_dados_pagamento,
    p_conta_bancaria_id, p_subcentro, p_centro_custo, p_macro_custo, p_observacao, p_status
  );

  SELECT count(*) INTO v_n FROM public.financeiro_contratos WHERE id = v_id;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'identidade de contrato inesperada' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_ct FROM public.financeiro_contratos WHERE id = v_id;

  -- =====================================================================
  -- 6. CRONOGRAMA.
  --    Regra DUPLICADA de forma controlada a partir da RPC 01B ja auditada
  --    e publicada. A extracao de helper compartilhado exigiria reescrever o
  --    corpo do 01B, que e objeto auditado — proibido nesta frente.
  --    Divida registrada: PR-FIN-CONTRATO-HELPER-01.
  --
  --    Paridade: fim = data_fim ou 31/12 do ano corrente; competencias
  --    mensais desde data_inicio (data + N months clampa como o
  --    addMonthsClamped do front); vencimento = dia_pagamento clamped ao
  --    ultimo dia do mes; valor plano; teto de 37 (o laco original testa
  --    `length > 36` DEPOIS do push, entao produz ate 37).
  --
  --    Datas no contrato correto: vencimento preenchido, pagamento NULL,
  --    ano_mes OMITIDO — o trigger do 02E deriva de data_competencia.
  --
  --    Contrato nao-ativo nasce sem cronograma, como no gerador atual, que
  --    retorna 0 quando status <> 'ativo'.
  -- =====================================================================
  IF v_ct.status = 'ativo' THEN
    v_fim := COALESCE(v_ct.data_fim, make_date(EXTRACT(year FROM v_hoje)::int, 12, 31));

    WITH serie AS (
      SELECT n, (v_ct.data_inicio + (n || ' months')::interval)::date AS comp
        FROM generate_series(0, 36) AS n
    ), calc AS (
      SELECT s.n, s.comp,
             (date_trunc('month', s.comp)::date
               + (LEAST(v_ct.dia_pagamento,
                        EXTRACT(day FROM (date_trunc('month', s.comp) + interval '1 month - 1 day'))::int
                       ) - 1)) AS venc
        FROM serie s
       WHERE s.comp <= v_fim
    )
    INSERT INTO public.financeiro_lancamentos_v2 (
      cliente_id, fazenda_id, contrato_id, origem_lancamento,
      tipo_operacao, status_transacao, valor,
      data_competencia, data_vencimento, data_pagamento,
      descricao, macro_custo, centro_custo, subcentro, observacao,
      numero_documento, favorecido_id, forma_pagamento, dados_pagamento, conta_bancaria_id
    )
    SELECT v_ct.cliente_id, v_ct.fazenda_id, v_ct.id, 'contrato',
           '2-Saídas', 'programado', v_ct.valor,
           c.comp, c.venc, NULL::date,
           v_ct.produto, v_ct.macro_custo, v_ct.centro_custo, v_ct.subcentro, v_ct.observacao,
           NULL, v_ct.fornecedor_id, v_ct.forma_pagamento,
           -- contrato.dados_pagamento e text; lancamento e jsonb. Paridade com
           -- o que o front enviava via PostgREST: string vira escalar JSON.
           CASE WHEN v_ct.dados_pagamento IS NULL THEN NULL::jsonb
                ELSE to_jsonb(v_ct.dados_pagamento) END,
           v_ct.conta_bancaria_id
      FROM calc c
     ORDER BY c.n;
    GET DIAGNOSTICS v_criadas = ROW_COUNT;
  ELSE
    v_criadas := 0;
  END IF;

  v_versao := v_ct.updated_at;

  -- =====================================================================
  -- 7. Retorno minimo. O contrato_id volta porque pertence ao proprio
  --    usuario e o front precisa dele; nenhum id de obrigacao e devolvido.
  -- =====================================================================
  RETURN jsonb_build_object(
    'ok', true,
    'contrato_id', v_id,
    'criadas', v_criadas,
    'versao', v_versao
  );
END
$corpo$;

  c_args constant text :=
    'p_fazenda_id uuid, p_fornecedor_id uuid, p_produto text, p_valor numeric, '
    'p_frequencia text, p_data_inicio date, p_data_fim date, p_dia_pagamento integer, '
    'p_forma_pagamento text, p_dados_pagamento text, p_conta_bancaria_id uuid, '
    'p_subcentro text, p_centro_custo text, p_macro_custo text, p_observacao text, p_status text';

  c_com constant text :=
    'PR-FIN-DATAS-VENCIMENTO-02A. Cria contrato e cronograma em uma unica transacao. '
    'Tenant resolvido no servidor a partir da fazenda autorizada; cliente_id nunca vem do '
    'cliente. Obrigacoes nascem com data_vencimento preenchida, data_pagamento nula e status '
    'programado; ano_mes e derivado pelo trigger do 02E. Nao faz backfill. Nao cria policy.';

  v_oid oid; v_acl text; v_n int; v_div text := '';
BEGIN
  -- pre-checks de ambiente
  IF to_regclass('public.financeiro_contratos') IS NULL
     OR to_regclass('public.financeiro_lancamentos_v2') IS NULL THEN
    RAISE EXCEPTION '02A P1: tabelas do dominio ausentes'; END IF;

  SELECT count(*) INTO v_n FROM pg_policy WHERE polrelid='public.financeiro_contratos'::regclass;
  IF v_n <> 3 THEN RAISE EXCEPTION '02A P2: esperadas as 3 policies do 01A, encontrei %', v_n; END IF;

  SELECT count(*) INTO v_n FROM pg_policy
   WHERE polrelid='public.financeiro_lancamentos_v2'::regclass AND polcmd='d';
  IF v_n <> 0 THEN RAISE EXCEPTION '02A P3: existe policy DELETE em lancamentos_v2'; END IF;

  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgrelid='public.financeiro_lancamentos_v2'::regclass
     AND tgname='trg_00_ano_mes_from_competencia';
  IF v_n <> 1 THEN RAISE EXCEPTION '02A P4: trigger do 02E ausente — ano_mes nao seria derivado'; END IF;

  -- P5. A RPC do 01B precisa estar presente e INTOCADA.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace nn ON nn.oid=p.pronamespace
   WHERE nn.nspname='public' AND p.proname='fn_contrato_editar_e_regenerar'
     AND md5(p.prosrc)='0582f5631538289295cc22d8b4965d86';
  IF v_n <> 1 THEN RAISE EXCEPTION '02A P5: RPC do 01B ausente ou com corpo alterado — abortando'; END IF;

  SELECT count(*) INTO v_n FROM pg_proc WHERE proname='fn_contrato_regenerar_obrigacoes';
  IF v_n <> 0 THEN RAISE EXCEPTION '02A P6: existe a funcao do kit v1 do 01B — abortando'; END IF;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace nn ON nn.oid=p.pronamespace
   WHERE nn.nspname='public' AND p.proname IN ('get_user_cliente_ids','is_admin_agroinblue')
     AND p.prosecdef AND p.provolatile='s';
  IF v_n <> 2 THEN RAISE EXCEPTION '02A P7: predicado canonico ausente ou divergente'; END IF;

  -- deteccao de estado
  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace nn ON nn.oid=p.pronamespace
   WHERE nn.nspname='public' AND p.proname='fn_contrato_criar_e_gerar';

  IF v_oid IS NOT NULL THEN
    IF pg_get_function_identity_arguments(v_oid) IS DISTINCT FROM c_args THEN v_div := v_div||' assinatura;'; END IF;
    IF (SELECT prosrc FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM c_corpo THEN v_div := v_div||' corpo;'; END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_oid) THEN v_div := v_div||' secdef;'; END IF;
    IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=v_oid) <> 'postgres'::name THEN v_div := v_div||' owner;'; END IF;
    IF (SELECT array_to_string(proconfig,',') FROM pg_proc WHERE oid=v_oid)
       IS DISTINCT FROM 'search_path=public, pg_temp' THEN v_div := v_div||' search_path;'; END IF;
    SELECT coalesce(string_agg(coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type,
             ',' ORDER BY coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC'), a.privilege_type),'(vazia)')
      INTO v_acl FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     WHERE p.oid=v_oid;
    IF v_acl <> 'authenticated:EXECUTE,postgres:EXECUTE' THEN v_div := v_div||format(' ACL(%s);', v_acl); END IF;
    IF obj_description(v_oid,'pg_proc') IS DISTINCT FROM c_com THEN v_div := v_div||' comentario;'; END IF;

    IF v_div <> '' THEN
      RAISE EXCEPTION '02A: funcao EXISTE e DIVERGE em:% — abortando SEM alterar nada', v_div;
    END IF;
    RAISE NOTICE '02A: funcao ja existe e e INTEGRALMENTE identica — NO-OP VERDADEIRO, nenhum comando emitido';
  ELSE
    EXECUTE format(
      'CREATE FUNCTION public.fn_contrato_criar_e_gerar('
      'p_fazenda_id uuid, p_fornecedor_id uuid, p_produto text, p_valor numeric, '
      'p_frequencia text, p_data_inicio date, p_data_fim date, p_dia_pagamento int, '
      'p_forma_pagamento text, p_dados_pagamento text, p_conta_bancaria_id uuid, '
      'p_subcentro text, p_centro_custo text, p_macro_custo text, p_observacao text, p_status text'
      ') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO %L, %L AS %L',
      'public','pg_temp', c_corpo);
    EXECUTE 'ALTER FUNCTION public.fn_contrato_criar_e_gerar('||c_args||') OWNER TO postgres';
    EXECUTE 'REVOKE ALL ON FUNCTION public.fn_contrato_criar_e_gerar('||c_args||') FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.fn_contrato_criar_e_gerar('||c_args||') FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.fn_contrato_criar_e_gerar('||c_args||') FROM service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.fn_contrato_criar_e_gerar('||c_args||') TO authenticated';
    EXECUTE format('COMMENT ON FUNCTION public.fn_contrato_criar_e_gerar(%s) IS %L', c_args, c_com);
    RAISE NOTICE '02A: funcao CRIADA (SECDEF, owner=postgres, EXECUTE apenas para authenticated)';
  END IF;

  -- pos-checks
  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace nn ON nn.oid=p.pronamespace
   WHERE nn.nspname='public' AND p.proname='fn_contrato_criar_e_gerar';
  IF v_oid IS NULL THEN RAISE EXCEPTION '02A Q1: funcao ausente apos a migration'; END IF;
  SELECT count(*) INTO v_n FROM pg_proc p WHERE p.oid=v_oid AND p.prosecdef
     AND p.prorettype='pg_catalog.jsonb'::regtype
     AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
     AND pg_get_userbyid(p.proowner)='postgres'::name
     AND array_to_string(p.proconfig,',')='search_path=public, pg_temp'
     AND pg_get_function_identity_arguments(p.oid)=c_args;
  IF v_n <> 1 THEN RAISE EXCEPTION '02A Q2: assinatura ou atributos divergentes'; END IF;
  SELECT coalesce(string_agg(coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type,
           ',' ORDER BY coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC'), a.privilege_type),'(vazia)')
    INTO v_acl FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid=v_oid;
  IF v_acl <> 'authenticated:EXECUTE,postgres:EXECUTE' THEN
    RAISE EXCEPTION '02A Q3: ACL divergente — obtida [%]', v_acl; END IF;
  IF has_function_privilege('anon', v_oid, 'EXECUTE')
     OR has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION '02A Q4: anon ou service_role com EXECUTE efetivo'; END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION '02A Q4: authenticated sem EXECUTE'; END IF;
  IF obj_description(v_oid,'pg_proc') IS DISTINCT FROM c_com THEN
    RAISE EXCEPTION '02A Q5: comentario divergente'; END IF;

  -- objetos fora do escopo preservados
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace nn ON nn.oid=p.pronamespace
   WHERE nn.nspname='public' AND p.proname='fn_contrato_editar_e_regenerar'
     AND md5(p.prosrc)='0582f5631538289295cc22d8b4965d86';
  IF v_n <> 1 THEN RAISE EXCEPTION '02A Q6: a RPC do 01B foi alterada'; END IF;
  SELECT count(*) INTO v_n FROM pg_policy WHERE polrelid='public.financeiro_contratos'::regclass;
  IF v_n <> 3 THEN RAISE EXCEPTION '02A Q7: policies do 01A alteradas'; END IF;
  SELECT count(*) INTO v_n FROM pg_policy
   WHERE polrelid='public.financeiro_lancamentos_v2'::regclass AND polcmd='d';
  IF v_n <> 0 THEN RAISE EXCEPTION '02A Q8: surgiu policy DELETE'; END IF;
  SELECT count(*) INTO v_n FROM pg_index WHERE indrelid='public.financeiro_contratos'::regclass;
  IF v_n <> 0 THEN RAISE EXCEPTION '02A Q9: indice criado — fora do escopo'; END IF;

  RAISE NOTICE '02A pos-checks OK: SECDEF/plpgsql/jsonb/owner=postgres/search_path fixado, ACL=[%], RPC 01B intocada, policies e shape preservados', v_acl;
END
$mig$;
