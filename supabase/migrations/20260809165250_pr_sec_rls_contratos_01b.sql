-- PR-SEC-RLS-CONTRATOS-01B — edicao do contrato + regeneracao das obrigacoes
-- futuras, em UMA unica operacao server-side e UMA unica transacao.
--
-- CORRECAO v2 — o kit v1 foi reprovado por dois defeitos:
--   P1. o UPDATE do contrato acontecia no front, em transacao separada da RPC:
--       se a RPC falhasse, o contrato ficava alterado e o cronograma nao. Agora
--       o UPDATE mora DENTRO da RPC. Ou tudo, ou nada.
--   P2. uma obrigacao protegida dentro da janela sobrevivia ao DELETE, mas o
--       gerador criava OUTRA obrigacao na mesma competencia — duplicata
--       silenciosa. Decisao de produto adotada: se houver QUALQUER obrigacao
--       protegida na janela, ABORTA INTEGRALMENTE. Nao se pula competencia e
--       nao se produz cronograma parcial.
--
-- POR QUE SECURITY DEFINER E INDISPENSAVEL
--   Nao existe policy DELETE em public.financeiro_lancamentos_v2 e o 01B nao
--   cria nenhuma. Sem SECDEF nenhum papel do Data API remove as obrigacoes.
--
-- POR QUE A PROTECAO E CODIGO, E NAO O BANCO
--   conciliacao_bancaria_itens.lancamento_id e ON DELETE CASCADE: apagar uma
--   obrigacao conciliada apagaria o vinculo em SILENCIO. E a coluna
--   conciliado_em do lancamento esta MORTA. Nenhuma das duas serve de rede.
--
-- CRIA EXATAMENTE UM OBJETO:
--   public.fn_contrato_editar_e_regenerar(...) -> jsonb
--
-- NAO FAZ: policy alguma; exclusao fisica de contrato; alteracao de
-- PK/FK/indice; backfill; correcao das 126 linhas legadas.
--
-- IDEMPOTENCIA: ausente -> cria; identica -> no-op verdadeiro;
-- divergente (inclusive corpo v1) -> aborta; ACL divergente -> aborta.

DO $mig$
DECLARE
  c_corpo constant text :=
$corpo$
DECLARE
  c_dominio  constant int := 8801103;      -- namespace fixo do advisory lock (int4, int4)
  v_uid      uuid := (SELECT auth.uid());
  v_n        int;
  v_ct       public.financeiro_contratos%ROWTYPE;
  v_autorizado boolean;
  v_corte    date := p_a_partir_de;
  v_hoje     date := CURRENT_DATE;
  v_universo bigint;
  v_prevista bigint;
  v_protegidas bigint;
  v_removidas bigint;
  v_criadas  bigint;
  v_fim      date;
  v_versao   timestamptz;
  v_ids      uuid[];
BEGIN
  -- =====================================================================
  -- 1. VALIDACAO ESTRUTURAL — antes de qualquer leitura semantica.
  --    So o que nao cria oraculo: forma dos parametros de controle.
  -- =====================================================================
  IF p_contrato_id IS NULL THEN
    RAISE EXCEPTION 'contrato nao encontrado ou nao autorizado' USING ERRCODE = 'P0002';
  END IF;
  IF v_corte IS NULL THEN
    RAISE EXCEPTION 'data de corte obrigatoria' USING ERRCODE = 'P0001';
  END IF;
  -- O browser nunca amplia a janela para o passado. Data posterior so reduz.
  IF v_corte < v_hoje THEN
    RAISE EXCEPTION 'data de corte anterior a data corrente' USING ERRCODE = 'P0001';
  END IF;
  IF p_versao IS NULL THEN
    RAISE EXCEPTION 'versao do contrato obrigatoria' USING ERRCODE = 'P0001';
  END IF;

  -- =====================================================================
  -- 2. ADVISORY LOCK DETERMINISTICO — escopo de transacao.
  -- =====================================================================
  PERFORM pg_advisory_xact_lock(c_dominio, pg_catalog.hashtext(p_contrato_id::text));

  -- =====================================================================
  -- 3. CARDINALIDADE — a tabela NAO tem PK/UNIQUE/indice.
  --    Proibido escolher "a primeira linha".
  -- =====================================================================
  SELECT count(*) INTO v_n FROM public.financeiro_contratos WHERE id = p_contrato_id;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'contrato nao encontrado ou nao autorizado' USING ERRCODE = 'P0002';
  END IF;
  IF v_n > 1 THEN
    RAISE EXCEPTION 'identidade de contrato ambigua' USING ERRCODE = 'P0001';
  END IF;

  -- 4. LOCK DE LINHA
  SELECT * INTO v_ct FROM public.financeiro_contratos WHERE id = p_contrato_id FOR UPDATE;

  -- =====================================================================
  -- 5. AUTORIZACAO — resolvida no servidor. SECDEF ignora RLS; a autorizacao
  --    aqui NAO pode depender dela. cliente_id do browser nunca e aceito.
  -- =====================================================================
  v_autorizado := v_uid IS NOT NULL
    AND ( public.is_admin_agroinblue(v_uid)
       OR EXISTS (SELECT 1 FROM public.get_user_cliente_ids(v_uid) t(cliente_id)
                   WHERE t.cliente_id = v_ct.cliente_id) );
  IF NOT v_autorizado THEN
    RAISE EXCEPTION 'contrato nao encontrado ou nao autorizado' USING ERRCODE = 'P0002';
  END IF;

  -- =====================================================================
  -- 6. VERSAO PRE-UPDATE — comparacao estrita
  -- =====================================================================
  IF v_ct.updated_at IS DISTINCT FROM p_versao THEN
    RAISE EXCEPTION 'contrato alterado por outra operacao' USING ERRCODE = 'P0001';
  END IF;

  -- =====================================================================
  -- 7. VALIDACAO DOS NOVOS CAMPOS — somente APOS a autorizacao, para nao
  --    criar oraculo por diferenca de mensagem.
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
  IF p_status IS NULL OR p_status <> 'ativo' THEN
    -- Regenerar exige contrato ativo. Encerrar/pausar usa o UPDATE simples,
    -- sem regeneracao, no proprio front.
    RAISE EXCEPTION 'contrato nao esta ativo' USING ERRCODE = 'P0001';
  END IF;
  IF p_fazenda_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.fazendas f WHERE f.id = p_fazenda_id AND f.cliente_id = v_ct.cliente_id) THEN
    RAISE EXCEPTION 'fazenda invalida para este contrato' USING ERRCODE = 'P0001';
  END IF;
  IF p_conta_bancaria_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.financeiro_contas_bancarias b
        WHERE b.id = p_conta_bancaria_id AND b.cliente_id = v_ct.cliente_id) THEN
    RAISE EXCEPTION 'conta bancaria invalida para este contrato' USING ERRCODE = 'P0001';
  END IF;

  -- =====================================================================
  -- 8/9. JANELA E PROTEGIDAS
  --    Universo vivo da janela; removiveis; protegidas = universo - removiveis.
  --    A autoridade de conciliacao e a tabela de vinculo com desfeito_em IS NULL,
  --    jamais a coluna morta homonima existente no proprio lancamento.
  -- =====================================================================
  SELECT count(*) INTO v_universo
    FROM public.financeiro_lancamentos_v2 l
   WHERE l.contrato_id = p_contrato_id
     AND l.cliente_id  = v_ct.cliente_id
     AND l.origem_lancamento = 'contrato'
     AND COALESCE(l.cancelado, false) = false
     AND COALESCE(l.data_vencimento, l.data_competencia) >= v_corte;

  SELECT coalesce(array_agg(x.id), '{}'::uuid[]) INTO v_ids FROM (
    SELECT l.id
      FROM public.financeiro_lancamentos_v2 l
     WHERE l.contrato_id = p_contrato_id
       AND l.cliente_id  = v_ct.cliente_id
       AND l.origem_lancamento = 'contrato'
       AND COALESCE(l.cancelado, false) = false
       AND COALESCE(l.data_vencimento, l.data_competencia) >= v_corte
       AND l.status_transacao <> 'realizado'
       AND NOT EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens i
                        WHERE i.lancamento_id = l.id AND i.desfeito_em IS NULL)
       AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_liquidacoes q
                        WHERE q.financeiro_lancamento_id = l.id)
       AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_partes p
                        WHERE p.financeiro_lancamento_id = l.id)
       AND NOT EXISTS (SELECT 1 FROM public.financiamento_parcelas f
                        WHERE f.lancamento_id = l.id OR f.lancamento_juros_id = l.id)
       AND NOT EXISTS (SELECT 1 FROM public.financiamentos g
                        WHERE g.lancamento_captacao_id = l.id)
       AND NOT EXISTS (SELECT 1 FROM public.extrato_bancario_staging_itens e
                        WHERE e.lancamento_sugerido_id = l.id)
       AND NOT EXISTS (SELECT 1 FROM public.financeiro_classificacao_staging s
                        WHERE s.match_lancamento_id = l.id)
     FOR UPDATE OF l
  ) x;

  v_prevista   := coalesce(array_length(v_ids, 1), 0);
  v_protegidas := v_universo - v_prevista;

  -- 10. ABORTO INTEGRAL — decisao de produto: nada de cronograma parcial.
  IF v_protegidas > 0 THEN
    RAISE EXCEPTION 'existem obrigacoes protegidas no periodo informado' USING ERRCODE = 'P0003';
  END IF;

  -- =====================================================================
  -- 11. UPDATE DO CONTRATO — mesma transacao. Substituicao integral dos
  --     campos editaveis; id, cliente_id, created_at e created_by intocados.
  -- =====================================================================
  UPDATE public.financeiro_contratos SET
      fazenda_id        = p_fazenda_id,
      fornecedor_id     = p_fornecedor_id,
      produto           = p_produto,
      valor             = p_valor,
      frequencia        = p_frequencia,
      data_inicio       = p_data_inicio,
      data_fim          = p_data_fim,
      dia_pagamento     = p_dia_pagamento,
      forma_pagamento   = p_forma_pagamento,
      dados_pagamento   = p_dados_pagamento,
      conta_bancaria_id = p_conta_bancaria_id,
      subcentro         = p_subcentro,
      centro_custo      = p_centro_custo,
      macro_custo       = p_macro_custo,
      observacao        = p_observacao,
      status            = p_status,
      updated_at        = clock_timestamp()
   WHERE id = p_contrato_id;

  SELECT * INTO v_ct FROM public.financeiro_contratos WHERE id = p_contrato_id;

  -- =====================================================================
  -- 12/13/14. REMOVER o conjunto congelado
  -- =====================================================================
  DELETE FROM public.financeiro_lancamentos_v2 l WHERE l.id = ANY (v_ids);
  GET DIAGNOSTICS v_removidas = ROW_COUNT;

  -- 15. cardinalidade conferida
  IF v_removidas <> v_prevista THEN
    RAISE EXCEPTION 'conjunto alterado durante a operacao' USING ERRCODE = 'P0001';
  END IF;

  -- =====================================================================
  -- 16. NOVO CRONOGRAMA, a partir do CONTRATO JA ATUALIZADO.
  --     Paridade com useContratos.gerarLancamentos:
  --       fim = data_fim, ou 31/12 do ano corrente quando nula;
  --       competencias mensais desde data_inicio (data + N months clampa
  --       exatamente como o addMonthsClamped do front);
  --       vencimento = dia_pagamento clamped ao ultimo dia do mes;
  --       valor plano por parcela — a regra atual nao divide nem arredonda;
  --       teto de 37: o laco original testa `length > 36` DEPOIS do push.
  --     DIVERGENCIA DECLARADA: recorte por COALESCE(vencimento, competencia)
  --     >= corte, simetrico ao conjunto removivel.
  --     Datas ja no contrato correto: vencimento preenchido, pagamento NULL,
  --     ano_mes omitido para o trigger do 02E derivar da competencia.
  -- =====================================================================
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
         -- contrato.dados_pagamento e text; lancamento e jsonb. Paridade com o
         -- que o front envia via PostgREST: string vira escalar JSON.
         CASE WHEN v_ct.dados_pagamento IS NULL THEN NULL::jsonb
              ELSE to_jsonb(v_ct.dados_pagamento) END,
         v_ct.conta_bancaria_id
    FROM calc c
   WHERE COALESCE(c.venc, c.comp) >= v_corte
   ORDER BY c.n;
  GET DIAGNOSTICS v_criadas = ROW_COUNT;

  -- =====================================================================
  -- 17. VERSAO FINAL.
  --     O trigger set_updated_at_financeiro_contratos grava now(), que e o
  --     carimbo de INICIO DA TRANSACAO. A versao e, portanto, o carimbo da
  --     transacao: duas transacoes distintas sempre produzem versoes distintas,
  --     que e o que a trava de concorrencia exige. Dentro de UMA transacao a
  --     versao nao avanca — e correto, nao ha concorrencia ali. Por isso a
  --     guarda abaixo recusa apenas RETROCESSO.
  -- =====================================================================
  v_versao := v_ct.updated_at;
  IF v_versao < p_versao THEN
    RAISE EXCEPTION 'versao retrocedeu' USING ERRCODE = 'P0001';
  END IF;

  -- 18. Retorno minimo: nenhum id de linha, nenhum dado de tenant.
  RETURN jsonb_build_object(
    'ok', true,
    'removidas', v_removidas,
    'criadas', v_criadas,
    'versao', v_versao
  );
END
$corpo$;

  c_args constant text :=
    'p_contrato_id uuid, p_versao timestamp with time zone, p_a_partir_de date, '
    'p_fazenda_id uuid, p_fornecedor_id uuid, p_produto text, p_valor numeric, '
    'p_frequencia text, p_data_inicio date, p_data_fim date, p_dia_pagamento integer, '
    'p_forma_pagamento text, p_dados_pagamento text, p_conta_bancaria_id uuid, '
    'p_subcentro text, p_centro_custo text, p_macro_custo text, p_observacao text, p_status text';

  c_com constant text :=
    'PR-SEC-RLS-CONTRATOS-01B. Edita o contrato e regenera as obrigacoes futuras em uma unica '
    'transacao. Aborta integralmente se houver qualquer obrigacao protegida na janela. Remove '
    'apenas obrigacoes mutaveis sem vinculo vivo; recria o cronograma com data_vencimento '
    'preenchida e data_pagamento nula. Nao exclui contrato. Nao cria policy. Autorizacao '
    'resolvida no servidor.';

  v_oid oid; v_acl text; v_n int; v_div text := '';
BEGIN
  -- pre-checks de ambiente
  IF to_regclass('public.financeiro_contratos') IS NULL
     OR to_regclass('public.financeiro_lancamentos_v2') IS NULL THEN
    RAISE EXCEPTION '01B P1: tabelas do dominio ausentes'; END IF;
  SELECT count(*) INTO v_n FROM pg_policy WHERE polrelid='public.financeiro_contratos'::regclass;
  IF v_n <> 3 THEN RAISE EXCEPTION '01B P2: esperadas as 3 policies do 01A, encontrei %', v_n; END IF;
  SELECT count(*) INTO v_n FROM pg_policy
   WHERE polrelid='public.financeiro_lancamentos_v2'::regclass AND polcmd='d';
  IF v_n <> 0 THEN RAISE EXCEPTION '01B P3: existe policy DELETE em lancamentos_v2'; END IF;
  SELECT count(*) INTO v_n FROM pg_index WHERE indrelid='public.financeiro_contratos'::regclass;
  IF v_n <> 0 THEN RAISE EXCEPTION '01B P4: a tabela ganhou indice — reavaliar identidade'; END IF;
  SELECT count(*) INTO v_n FROM (SELECT id FROM public.financeiro_contratos GROUP BY id HAVING count(*)>1) d;
  IF v_n <> 0 THEN RAISE EXCEPTION '01B P5: % id(s) duplicado(s) em financeiro_contratos', v_n; END IF;
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace nn ON nn.oid=p.pronamespace
   WHERE nn.nspname='public' AND p.proname IN ('get_user_cliente_ids','is_admin_agroinblue')
     AND p.prosecdef AND p.provolatile='s';
  IF v_n <> 2 THEN RAISE EXCEPTION '01B P6: predicado canonico ausente ou divergente'; END IF;

  -- P7. Qualquer funcao homonima com OUTRA assinatura (ex.: o corpo v1) aborta.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace nn ON nn.oid=p.pronamespace
   WHERE nn.nspname='public' AND p.proname='fn_contrato_regenerar_obrigacoes';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '01B P7: existe a funcao do kit v1 (fn_contrato_regenerar_obrigacoes) — abortando';
  END IF;

  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace nn ON nn.oid=p.pronamespace
   WHERE nn.nspname='public' AND p.proname='fn_contrato_editar_e_regenerar';

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
      RAISE EXCEPTION '01B: funcao EXISTE e DIVERGE em:% — abortando SEM alterar nada', v_div;
    END IF;
    RAISE NOTICE '01B: funcao ja existe e e INTEGRALMENTE identica — NO-OP VERDADEIRO, nenhum comando emitido';
  ELSE
    EXECUTE format(
      'CREATE FUNCTION public.fn_contrato_editar_e_regenerar('
      'p_contrato_id uuid, p_versao timestamptz, p_a_partir_de date, '
      'p_fazenda_id uuid, p_fornecedor_id uuid, p_produto text, p_valor numeric, '
      'p_frequencia text, p_data_inicio date, p_data_fim date, p_dia_pagamento int, '
      'p_forma_pagamento text, p_dados_pagamento text, p_conta_bancaria_id uuid, '
      'p_subcentro text, p_centro_custo text, p_macro_custo text, p_observacao text, p_status text'
      ') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO %L, %L AS %L',
      'public','pg_temp', c_corpo);
    EXECUTE 'ALTER FUNCTION public.fn_contrato_editar_e_regenerar('||c_args||') OWNER TO postgres';
    EXECUTE 'REVOKE ALL ON FUNCTION public.fn_contrato_editar_e_regenerar('||c_args||') FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.fn_contrato_editar_e_regenerar('||c_args||') FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.fn_contrato_editar_e_regenerar('||c_args||') FROM service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.fn_contrato_editar_e_regenerar('||c_args||') TO authenticated';
    EXECUTE format('COMMENT ON FUNCTION public.fn_contrato_editar_e_regenerar(%s) IS %L', c_args, c_com);
    RAISE NOTICE '01B: funcao CRIADA (SECDEF, owner=postgres, EXECUTE apenas para authenticated)';
  END IF;

  -- pos-checks
  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace nn ON nn.oid=p.pronamespace
   WHERE nn.nspname='public' AND p.proname='fn_contrato_editar_e_regenerar';
  IF v_oid IS NULL THEN RAISE EXCEPTION '01B Q1: funcao ausente apos a migration'; END IF;
  SELECT count(*) INTO v_n FROM pg_proc p WHERE p.oid=v_oid AND p.prosecdef
     AND p.prorettype='pg_catalog.jsonb'::regtype
     AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
     AND pg_get_userbyid(p.proowner)='postgres'::name
     AND array_to_string(p.proconfig,',')='search_path=public, pg_temp'
     AND pg_get_function_identity_arguments(p.oid)=c_args;
  IF v_n <> 1 THEN RAISE EXCEPTION '01B Q2: assinatura ou atributos divergentes'; END IF;
  SELECT coalesce(string_agg(coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type,
           ',' ORDER BY coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC'), a.privilege_type),'(vazia)')
    INTO v_acl FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid=v_oid;
  IF v_acl <> 'authenticated:EXECUTE,postgres:EXECUTE' THEN
    RAISE EXCEPTION '01B Q3: ACL divergente — obtida [%]', v_acl; END IF;
  IF has_function_privilege('anon', v_oid, 'EXECUTE')
     OR has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION '01B Q4: anon ou service_role com EXECUTE efetivo'; END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION '01B Q4: authenticated sem EXECUTE'; END IF;
  IF obj_description(v_oid,'pg_proc') IS DISTINCT FROM c_com THEN
    RAISE EXCEPTION '01B Q5: comentario divergente'; END IF;
  SELECT count(*) INTO v_n FROM pg_policy WHERE polrelid='public.financeiro_contratos'::regclass;
  IF v_n <> 3 THEN RAISE EXCEPTION '01B Q6: policies do 01A alteradas'; END IF;
  SELECT count(*) INTO v_n FROM pg_policy WHERE polrelid='public.financeiro_lancamentos_v2'::regclass;
  IF v_n <> 3 THEN RAISE EXCEPTION '01B Q7: policies de lancamentos_v2 alteradas'; END IF;
  SELECT count(*) INTO v_n FROM pg_policy
   WHERE polrelid='public.financeiro_lancamentos_v2'::regclass AND polcmd='d';
  IF v_n <> 0 THEN RAISE EXCEPTION '01B Q8: surgiu policy DELETE'; END IF;
  SELECT count(*) INTO v_n FROM pg_index WHERE indrelid='public.financeiro_contratos'::regclass;
  IF v_n <> 0 THEN RAISE EXCEPTION '01B Q9: indice criado — fora do escopo'; END IF;

  RAISE NOTICE '01B pos-checks OK: SECDEF/plpgsql/jsonb/owner=postgres/search_path fixado, ACL=[%], anon e service_role sem EXECUTE, policies e shape preservados', v_acl;
END
$mig$;
