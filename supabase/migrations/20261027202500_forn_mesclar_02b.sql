-- FORN-MESCLAR-02b (Gabriel 19/10/2026, mock aprovado 08:27) — mesclar N cadastros ESCOLHENDO o valor de cada campo, com a trilha de
-- TODOS os campos e o desfazer que volta campos e referencias; sugestoes que juntam no MESMO grupo o que se liga por documento OU por
-- nome (o caso da Vera: "Luiz Fernando da Silva" sem CNPJ, "LUIZ FERNANDO DA SILVA LTDA" e "Casa do Agronegocio" com o mesmo CNPJ).
-- Evolui as funcoes que existem (nada paralelo); guarda de md5 de origem em cada corpo trocado.
--   _fn_fornecedor_mesclar_campos()       (nova, fechada) o dono da lista de campos escolhiveis e das colunas de cada um
--   _fn_fornecedor_plano_ok(plano, cli)   (nova, fechada) o subcentro padrao esta' no plano do cliente (ativo; global ou dele)
--   _fn_fornecedor_mesclar_recusa(m, a, valores) (nova sobrecarga) a de 2 argumentos + o mapa de valores: campo desconhecido, origem fora
--                                          do grupo, subcentro fora do plano -> recusa com frase
--   _fn_fornecedor_mesclar_exec(m, a, valores)   (troca a de 2 argumentos) aplica os valores no que fica ANTES dos apelidos; a trilha guarda
--                                          a linha INTEIRA do que fica e dos absorvidos; o retorno ganha `campos`, `resultado` e `por_tabela`
--   fn_fornecedor_mesclar(m, a, simular, valores) (troca a de 3) — sem `p_valores`, o mesmo de antes
--   _fn_fornecedor_mesclagem_desfazer_exec        devolve tambem os campos do que fica (mesclagem antiga, sem a linha: so' o de antes)
--   fn_fornecedor_repetidos               grupos = componentes ligados por documento OU nome, do mesmo lado do "Pec.3M-"; com documento primeiro
--   fn_fornecedor_uso                     + recorrencias, financiamentos, operacoes (chaves no fim; as de antes iguais)
-- Campo sem escolha = o valor do que fica; vazio no que fica = o primeiro preenchido dos absorvidos (na ordem de `p_absorver`). O
-- subcentro padrao fora do plano nunca e' escolhivel nem copiado. "Pec.3M-" segue barrado pela recusa de sempre.
set local lock_timeout = '2s';

DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('public._fn_fornecedor_mesclar_exec(uuid,uuid[])', '6b03510ec1daeb90f4eb9e1532043a68'),
      ('public._fn_fornecedor_mesclagem_desfazer_exec(uuid,text)', '7a5e0d0e19d2c82c9997b07d5b6364ce'),
      ('public.fn_fornecedor_mesclar(uuid,uuid[],boolean)', 'd7ff87f6690ee585c0ce79140ba988fe'),
      ('public.fn_fornecedor_repetidos(uuid)', 'd66b4eab7d0f354f622c3ada39ebe688'),
      ('public.fn_fornecedor_uso(uuid)', 'b0db5051379bda5855b3488f55a40494'),
      ('public._fn_fornecedor_mesclar_recusa(uuid,uuid[])', '8e1067640a9ef8a58b78cf50984225f7')) x(f, m) LOOP
    IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = r.f::regprocedure) IS DISTINCT FROM r.m THEN
      RAISE EXCEPTION 'FORN-MESCLAR-02b: % fora do corpo esperado (%)', r.f, r.m;
    END IF;
  END LOOP;
END $g$;

CREATE FUNCTION public._fn_fornecedor_mesclar_campos()
RETURNS TABLE (campo text, colunas text[])
LANGUAGE sql IMMUTABLE SET search_path = public AS $f$
  VALUES
    ('razao_social', ARRAY['nome']),
    ('nome_fantasia', ARRAY['nome_fantasia']),
    ('cpf_cnpj', ARRAY['cpf_cnpj', 'tipo_pessoa']),
    ('inscricao_estadual', ARRAY['inscricao_estadual']),
    ('inscricao_municipal', ARRAY['inscricao_municipal']),
    ('endereco', ARRAY['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'municipio', 'uf']),
    ('email', ARRAY['email']),
    ('telefone', ARRAY['telefone']),
    ('celular', ARRAY['celular']),
    ('contato', ARRAY['contato_nome']),
    ('pagamento', ARRAY['tipo_recebimento', 'pix_tipo_chave', 'pix_chave', 'banco', 'agencia', 'conta', 'tipo_conta',
                        'cpf_cnpj_pagamento', 'nome_favorecido', 'observacao_pagamento']),
    ('plano_padrao', ARRAY['plano_padrao_id']),
    ('observacao', ARRAY['observacao'])
$f$;
REVOKE ALL ON FUNCTION public._fn_fornecedor_mesclar_campos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_fornecedor_mesclar_campos() TO service_role;

CREATE FUNCTION public._fn_fornecedor_plano_ok(p_plano uuid, p_cliente uuid)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $f$
  SELECT EXISTS (SELECT 1 FROM public.financeiro_plano_contas p
                  WHERE p.id = p_plano AND p.ativo AND (p.cliente_id IS NULL OR p.cliente_id = p_cliente))
$f$;
REVOKE ALL ON FUNCTION public._fn_fornecedor_plano_ok(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_fornecedor_plano_ok(uuid, uuid) TO service_role;

/* o campo esta' preenchido na linha (alguma coluna dele com texto) */
CREATE FUNCTION public._fn_fornecedor_campo_preenchido(p_linha jsonb, p_colunas text[])
RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public AS $f$
  SELECT EXISTS (SELECT 1 FROM unnest(p_colunas) c WHERE nullif(btrim(coalesce(p_linha->>c, '')), '') IS NOT NULL
                   AND c <> 'tipo_pessoa')
$f$;
REVOKE ALL ON FUNCTION public._fn_fornecedor_campo_preenchido(jsonb, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_fornecedor_campo_preenchido(jsonb, text[]) TO service_role;

CREATE FUNCTION public._fn_fornecedor_mesclar_recusa(p_manter uuid, p_absorver uuid[], p_valores jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $f$
DECLARE
  v_r jsonb; v_k text; v_v text; v_cli uuid; v_plano uuid;
BEGIN
  v_r := public._fn_fornecedor_mesclar_recusa(p_manter, p_absorver);
  IF v_r IS NOT NULL OR p_valores IS NULL OR jsonb_typeof(p_valores) = 'null' THEN RETURN v_r; END IF;
  IF jsonb_typeof(p_valores) <> 'object' THEN
    RETURN jsonb_build_object('motivo', 'valores_invalidos', 'frase', 'Os valores escolhidos chegaram num formato que o banco não entende.');
  END IF;
  SELECT cliente_id INTO v_cli FROM public.financeiro_fornecedores WHERE id = p_manter;
  FOR v_k, v_v IN SELECT * FROM jsonb_each_text(p_valores) LOOP
    IF NOT EXISTS (SELECT 1 FROM public._fn_fornecedor_mesclar_campos() c WHERE c.campo = v_k) THEN
      RETURN jsonb_build_object('motivo', 'campo_desconhecido', 'frase', format('Campo "%s" não pode ser escolhido na mesclagem.', v_k));
    END IF;
    IF v_v IS NULL OR v_v !~* '^[0-9a-f-]{36}$' OR NOT (v_v::uuid = p_manter OR v_v::uuid = ANY (p_absorver)) THEN
      RETURN jsonb_build_object('motivo', 'origem_fora', 'frase', format('O valor de "%s" tem de vir de um dos cadastros desta mesclagem.', v_k));
    END IF;
    IF v_k = 'plano_padrao' THEN
      SELECT plano_padrao_id INTO v_plano FROM public.financeiro_fornecedores WHERE id = v_v::uuid;
      IF v_plano IS NOT NULL AND NOT public._fn_fornecedor_plano_ok(v_plano, v_cli) THEN
        RETURN jsonb_build_object('motivo', 'plano_fora', 'frase', 'O subcentro padrão escolhido está fora do plano de contas: não pode ser copiado.');
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION public._fn_fornecedor_mesclar_recusa(uuid, uuid[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_fornecedor_mesclar_recusa(uuid, uuid[], jsonb) TO service_role;

DROP FUNCTION public._fn_fornecedor_mesclar_exec(uuid, uuid[]);
CREATE FUNCTION public._fn_fornecedor_mesclar_exec(p_manter uuid, p_absorver uuid[], p_valores jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_m record; v_alvo record; v_abs uuid; v_ids uuid[]; v_c record; v_fonte uuid; v_linha jsonb;
  v_movidos jsonb := '[]'::jsonb; v_modulos jsonb := '{}'::jsonb; v_tabelas jsonb := '{}'::jsonb; v_antes jsonb; v_aliases text[]; v_log uuid;
  v_recusa jsonb; v_total int := 0; v_linhas jsonb; v_m_json jsonb; v_novo jsonb; v_campos jsonb := '{}'::jsonb; v_nome_antes text;
BEGIN
  v_recusa := public._fn_fornecedor_mesclar_recusa(p_manter, p_absorver, p_valores);
  IF v_recusa IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = (v_recusa->>'frase') || ' Nada foi mesclado.';
  END IF;
  SELECT * INTO v_m FROM public.financeiro_fornecedores WHERE id = p_manter FOR UPDATE;
  PERFORM 1 FROM public.financeiro_fornecedores WHERE id = ANY (p_absorver) FOR UPDATE;
  v_m_json := to_jsonb(v_m); v_nome_antes := v_m.nome;
  SELECT jsonb_object_agg(f.id::text, to_jsonb(f)) INTO v_linhas FROM public.financeiro_fornecedores f WHERE f.id = ANY (p_absorver);

  v_antes := jsonb_build_object(
    'mantido', jsonb_build_object('aliases', v_m.aliases),
    'absorvidos', (SELECT jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'cpf_cnpj', f.cpf_cnpj, 'ativo', f.ativo,
                     'fundido_em_id', f.fundido_em_id, 'fundido_em', f.fundido_em, 'fundido_por', f.fundido_por,
                     'fundido_motivo', f.fundido_motivo) ORDER BY f.nome)
                   FROM public.financeiro_fornecedores f WHERE f.id = ANY (p_absorver)),
    /* FORN-MESCLAR-02b — a linha INTEIRA de cada cadastro antes de mesclar: o desfazer devolve os campos do que fica por ela */
    'linhas', jsonb_build_object('mantido', v_m_json, 'absorvidos', v_linhas));

  /* os valores: escolhido > o do que fica > o primeiro preenchido dos absorvidos (na ordem da lista); subcentro fora do plano nunca entra */
  v_novo := v_m_json;
  FOR v_c IN SELECT * FROM public._fn_fornecedor_mesclar_campos() LOOP
    v_fonte := NULL;
    IF p_valores IS NOT NULL AND jsonb_typeof(p_valores) = 'object' AND p_valores ? v_c.campo THEN
      v_fonte := (p_valores->>v_c.campo)::uuid;
    ELSIF public._fn_fornecedor_campo_preenchido(v_m_json, v_c.colunas)
          AND (v_c.campo <> 'plano_padrao' OR public._fn_fornecedor_plano_ok(v_m.plano_padrao_id, v_m.cliente_id)) THEN
      v_fonte := p_manter;
    ELSE
      SELECT x INTO v_fonte FROM unnest(p_absorver) WITH ORDINALITY u(x, o)
       WHERE public._fn_fornecedor_campo_preenchido(v_linhas->(x::text), v_c.colunas)
         AND (v_c.campo <> 'plano_padrao' OR public._fn_fornecedor_plano_ok((v_linhas->(x::text)->>'plano_padrao_id')::uuid, v_m.cliente_id))
       ORDER BY o LIMIT 1;
    END IF;
    IF v_fonte IS NULL OR v_fonte = p_manter THEN
      v_campos := v_campos || jsonb_build_object(v_c.campo, p_manter);
      CONTINUE;
    END IF;
    v_linha := v_linhas->(v_fonte::text);
    SELECT v_novo || coalesce(jsonb_object_agg(c, v_linha->c), '{}'::jsonb) INTO v_novo FROM unnest(v_c.colunas) c;
    v_campos := v_campos || jsonb_build_object(v_c.campo, v_fonte);
  END LOOP;
  IF v_novo IS DISTINCT FROM v_m_json THEN
    UPDATE public.financeiro_fornecedores f
       SET nome = r.nome, nome_fantasia = r.nome_fantasia, cpf_cnpj = r.cpf_cnpj, tipo_pessoa = r.tipo_pessoa,
           inscricao_estadual = r.inscricao_estadual, inscricao_municipal = r.inscricao_municipal,
           cep = r.cep, logradouro = r.logradouro, numero = r.numero, complemento = r.complemento, bairro = r.bairro,
           municipio = r.municipio, uf = r.uf, email = r.email, telefone = r.telefone, celular = r.celular, contato_nome = r.contato_nome,
           tipo_recebimento = r.tipo_recebimento, pix_tipo_chave = r.pix_tipo_chave, pix_chave = r.pix_chave, banco = r.banco,
           agencia = r.agencia, conta = r.conta, tipo_conta = r.tipo_conta, cpf_cnpj_pagamento = r.cpf_cnpj_pagamento,
           nome_favorecido = r.nome_favorecido, observacao_pagamento = r.observacao_pagamento, plano_padrao_id = r.plano_padrao_id,
           observacao = r.observacao, updated_at = now()
      FROM jsonb_populate_record(NULL::public.financeiro_fornecedores, v_novo) r
     WHERE f.id = p_manter;
    SELECT * INTO v_m FROM public.financeiro_fornecedores WHERE id = p_manter;
  END IF;

  PERFORM set_config('app.propagando_plano', 'on', true);
  FOR v_alvo IN SELECT * FROM public._fn_fornecedor_mesclar_alvos() LOOP
    FOREACH v_abs IN ARRAY p_absorver LOOP
      EXECUTE format('WITH u AS (UPDATE public.%I SET %I = $1 WHERE %I = $2 RETURNING id) SELECT coalesce(array_agg(id), ''{}''::uuid[]) FROM u',
                     v_alvo.tabela, v_alvo.coluna, v_alvo.coluna)
        INTO v_ids USING p_manter, v_abs;
      IF cardinality(v_ids) > 0 THEN
        v_movidos := v_movidos || jsonb_build_object('modulo', v_alvo.modulo, 'tabela', v_alvo.tabela, 'coluna', v_alvo.coluna,
                                                     'de', v_abs, 'ids', to_jsonb(v_ids));
        v_modulos := jsonb_set(v_modulos, ARRAY[v_alvo.modulo], to_jsonb(coalesce((v_modulos->>v_alvo.modulo)::int, 0) + cardinality(v_ids)));
        v_tabelas := jsonb_set(v_tabelas, ARRAY[v_alvo.tabela || '.' || v_alvo.coluna],
                               to_jsonb(coalesce((v_tabelas->>(v_alvo.tabela || '.' || v_alvo.coluna))::int, 0) + cardinality(v_ids)));
        v_total := v_total + cardinality(v_ids);
      END IF;
    END LOOP;
  END LOOP;
  PERFORM set_config('app.propagando_plano', 'off', true);

  -- nome e CPF/CNPJ dos absorvidos (e os apelidos deles) viram apelidos do que fica, sem repetir; e o nome de antes do que fica, se mudou
  SELECT array_agg(DISTINCT a ORDER BY a) INTO v_aliases FROM (
    SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_m.aliases) = 'array' THEN v_m.aliases ELSE '[]'::jsonb END) a
    UNION SELECT v_nome_antes
    UNION SELECT f.nome FROM public.financeiro_fornecedores f WHERE f.id = ANY (p_absorver)
    UNION SELECT f.cpf_cnpj FROM public.financeiro_fornecedores f WHERE f.id = ANY (p_absorver) AND nullif(btrim(f.cpf_cnpj), '') IS NOT NULL
    UNION SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(f.aliases) = 'array' THEN f.aliases ELSE '[]'::jsonb END)
            FROM public.financeiro_fornecedores f WHERE f.id = ANY (p_absorver)
  ) x WHERE nullif(btrim(a), '') IS NOT NULL AND public._fn_normalizar_texto(a) IS DISTINCT FROM public._fn_normalizar_texto(v_m.nome);
  UPDATE public.financeiro_fornecedores SET aliases = to_jsonb(coalesce(v_aliases, '{}'::text[])), updated_at = now() WHERE id = p_manter;

  UPDATE public.financeiro_fornecedores
     SET ativo = false, fundido_em_id = p_manter, fundido_em = now(), fundido_por = auth.uid(),
         fundido_motivo = format('mesclado em %s', v_m.nome), updated_at = now()
   WHERE id = ANY (p_absorver);

  INSERT INTO public.fornecedor_mesclagem_log (cliente_id, mantido_id, absorvidos, movidos, antes, resumo)
  VALUES (v_m.cliente_id, p_manter, p_absorver, v_movidos, v_antes,
          jsonb_build_object('por_modulo', v_modulos, 'por_tabela', v_tabelas, 'total', v_total,
                             'apelidos', to_jsonb(coalesce(v_aliases, '{}'::text[])), 'campos', v_campos))
  RETURNING id INTO v_log;

  RETURN jsonb_build_object('mesclagem_id', v_log, 'mantido', jsonb_build_object('id', v_m.id, 'nome', v_m.nome, 'cpf_cnpj', v_m.cpf_cnpj),
    'absorvidos', v_antes->'absorvidos', 'por_modulo', v_modulos, 'total', v_total, 'apelidos', to_jsonb(coalesce(v_aliases, '{}'::text[])),
    'recusa', NULL, 'por_tabela', v_tabelas, 'campos', v_campos,
    'resultado', jsonb_build_object('nome', v_m.nome, 'nome_fantasia', v_m.nome_fantasia, 'cpf_cnpj', v_m.cpf_cnpj));
END $f$;
REVOKE ALL ON FUNCTION public._fn_fornecedor_mesclar_exec(uuid, uuid[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fn_fornecedor_mesclar_exec(uuid, uuid[], jsonb) TO service_role;

DROP FUNCTION public.fn_fornecedor_mesclar(uuid, uuid[], boolean);
CREATE FUNCTION public.fn_fornecedor_mesclar(p_manter uuid, p_absorver uuid[], p_simular boolean DEFAULT true, p_valores jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_clis uuid[]; v_r jsonb; v_recusa jsonb;
BEGIN
  -- o cliente das linhas: todas existem, sao do MESMO cliente e o usuario tem acesso (42501, sem usuario tambem)
  SELECT array_agg((SELECT f.cliente_id FROM public.financeiro_fornecedores f WHERE f.id = x)) INTO v_clis
    FROM unnest(array_prepend(p_manter, coalesce(p_absorver, '{}'::uuid[]))) x;
  PERFORM public._fn_exigir_tenant_das_linhas(v_clis);
  IF NOT coalesce(public.tenant_ok(v_clis[1]), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;

  v_recusa := public._fn_fornecedor_mesclar_recusa(p_manter, p_absorver, p_valores);
  IF v_recusa IS NOT NULL THEN
    IF p_simular THEN RETURN jsonb_build_object('simulado', true, 'recusa', v_recusa); END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = (v_recusa->>'frase') || ' Nada foi mesclado.';
  END IF;

  IF NOT p_simular THEN
    RETURN public._fn_fornecedor_mesclar_exec(p_manter, p_absorver, p_valores) || jsonb_build_object('simulado', false);
  END IF;
  BEGIN
    v_r := public._fn_fornecedor_mesclar_exec(p_manter, p_absorver, p_valores);
    RAISE EXCEPTION USING ERRCODE = 'FMSIM', MESSAGE = v_r::text;
  EXCEPTION
    WHEN SQLSTATE 'FMSIM' THEN RETURN (SQLERRM)::jsonb || jsonb_build_object('simulado', true, 'mesclagem_id', NULL);
    WHEN OTHERS THEN RETURN jsonb_build_object('simulado', true, 'recusa', jsonb_build_object('motivo', 'banco', 'frase', SQLERRM));
  END;
END $f$;
REVOKE ALL ON FUNCTION public.fn_fornecedor_mesclar(uuid, uuid[], boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_mesclar(uuid, uuid[], boolean, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._fn_fornecedor_mesclagem_desfazer_exec(p_mesclagem_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_l record; v_e jsonb; v_a jsonb; v_ids uuid[]; v_voltaram int := 0; v_ficaram int := 0; v_n int; v_lm jsonb;
BEGIN
  SELECT * INTO v_l FROM public.fornecedor_mesclagem_log WHERE id = p_mesclagem_id FOR UPDATE;
  IF v_l.desfeito_em IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Esta mesclagem já foi desfeita. Nada foi alterado.';
  END IF;
  IF nullif(btrim(coalesce(p_motivo, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Informe o motivo para desfazer a mesclagem. Nada foi alterado.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fornecedor_mesclagem_log o WHERE o.cliente_id = v_l.cliente_id AND o.desfeito_em IS NULL
              AND o.criado_em > v_l.criado_em AND (o.mantido_id = v_l.mantido_id OR o.mantido_id = ANY (v_l.absorvidos)
                   OR v_l.mantido_id = ANY (o.absorvidos) OR o.absorvidos && v_l.absorvidos)) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Há mesclagem mais nova com estes fornecedores: desfaça aquela antes. Nada foi alterado.';
  END IF;

  PERFORM set_config('app.propagando_plano', 'on', true);
  FOR v_e IN SELECT * FROM jsonb_array_elements(v_l.movidos) LOOP
    SELECT array_agg(x::uuid) INTO v_ids FROM jsonb_array_elements_text(v_e->'ids') x;
    -- so' volta a linha que AINDA aponta para o mantido; a que mudou depois fica e e' contada
    EXECUTE format('WITH u AS (UPDATE public.%I SET %I = $1 WHERE id = ANY ($2) AND %I = $3 RETURNING id) SELECT count(*) FROM u',
                   v_e->>'tabela', v_e->>'coluna', v_e->>'coluna')
      INTO v_n USING (v_e->>'de')::uuid, v_ids, v_l.mantido_id;
    v_voltaram := v_voltaram + v_n;
    v_ficaram := v_ficaram + cardinality(v_ids) - v_n;
  END LOOP;
  PERFORM set_config('app.propagando_plano', 'off', true);

  UPDATE public.financeiro_fornecedores
     SET aliases = CASE WHEN jsonb_typeof(v_l.antes->'mantido'->'aliases') = 'null' THEN NULL ELSE v_l.antes->'mantido'->'aliases' END, updated_at = now()
   WHERE id = v_l.mantido_id;
  /* FORN-MESCLAR-02b — os campos do que fica voltam ao que eram (mesclagem anterior a este PR nao guardou a linha: nada a devolver) */
  v_lm := v_l.antes->'linhas'->'mantido';
  IF v_lm IS NOT NULL AND jsonb_typeof(v_lm) = 'object' THEN
    UPDATE public.financeiro_fornecedores f
       SET nome = r.nome, nome_fantasia = r.nome_fantasia, cpf_cnpj = r.cpf_cnpj, tipo_pessoa = r.tipo_pessoa,
           inscricao_estadual = r.inscricao_estadual, inscricao_municipal = r.inscricao_municipal,
           cep = r.cep, logradouro = r.logradouro, numero = r.numero, complemento = r.complemento, bairro = r.bairro,
           municipio = r.municipio, uf = r.uf, email = r.email, telefone = r.telefone, celular = r.celular, contato_nome = r.contato_nome,
           tipo_recebimento = r.tipo_recebimento, pix_tipo_chave = r.pix_tipo_chave, pix_chave = r.pix_chave, banco = r.banco,
           agencia = r.agencia, conta = r.conta, tipo_conta = r.tipo_conta, cpf_cnpj_pagamento = r.cpf_cnpj_pagamento,
           nome_favorecido = r.nome_favorecido, observacao_pagamento = r.observacao_pagamento, plano_padrao_id = r.plano_padrao_id,
           observacao = r.observacao, updated_at = now()
      FROM jsonb_populate_record(NULL::public.financeiro_fornecedores, v_lm) r
     WHERE f.id = v_l.mantido_id;
  END IF;
  FOR v_a IN SELECT * FROM jsonb_array_elements(v_l.antes->'absorvidos') LOOP
    UPDATE public.financeiro_fornecedores
       SET ativo = (v_a->>'ativo')::boolean, fundido_em_id = (v_a->>'fundido_em_id')::uuid, fundido_em = (v_a->>'fundido_em')::timestamptz,
           fundido_por = (v_a->>'fundido_por')::uuid, fundido_motivo = v_a->>'fundido_motivo', updated_at = now()
     WHERE id = (v_a->>'id')::uuid;
  END LOOP;

  UPDATE public.fornecedor_mesclagem_log
     SET desfeito_em = now(), desfeito_por = auth.uid(), desfeito_motivo = btrim(p_motivo),
         desfeito_resumo = jsonb_build_object('voltaram', v_voltaram, 'ficaram', v_ficaram)
   WHERE id = p_mesclagem_id;
  RETURN jsonb_build_object('mesclagem_id', p_mesclagem_id, 'voltaram', v_voltaram, 'ficaram', v_ficaram, 'recusa', NULL);
END $f$;

CREATE OR REPLACE FUNCTION public.fn_fornecedor_repetidos(p_cliente uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v jsonb;
BEGIN
  IF NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  /* FORN-MESCLAR-02b — um grupo e' um COMPONENTE: o que se liga por documento (digitos) OU por nome normalizado entra no MESMO grupo
     (A e B com o mesmo nome, B e C com o mesmo CNPJ -> A, B, C). Nunca cruza o "Pec.3M-" (rateio). Grupos com documento primeiro. */
  WITH RECURSIVE f AS (
    SELECT f.id, f.nome, f.cpf_cnpj, coalesce(f.ativo, true) ativo, f.created_at,
           (f.nome ~* '^\s*pec\.3m-') rateio,
           public._fn_fornecedor_chave_documento(f.cpf_cnpj) doc,
           btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(public._fn_normalizar_texto(f.nome), ''),
             '\(\s*\d+\s*\)', ' ', 'g'), '[^a-z0-9]+', ' ', 'g'),
             '\m(s a|sa|ltda|me|epp|eireli|cia|companhia)\M', ' ', 'g'), '\s+', ' ', 'g')) chave_nome
      FROM public.financeiro_fornecedores f
     WHERE f.cliente_id = p_cliente AND f.fundido_em_id IS NULL
  ), arestas AS (
    SELECT a.id a, b.id b FROM f a JOIN f b ON b.doc = a.doc AND b.rateio = a.rateio AND a.id <> b.id WHERE a.doc IS NOT NULL
    UNION
    SELECT a.id, b.id FROM f a JOIN f b ON b.chave_nome = a.chave_nome AND b.rateio = a.rateio AND a.id <> b.id WHERE a.chave_nome <> ''
  ), alcance (a, b) AS (
    SELECT a, b FROM arestas
    UNION
    SELECT r.a, e.b FROM alcance r JOIN arestas e ON e.a = r.b WHERE e.b <> r.a
  ), comp AS (
    SELECT n.id, least(n.id::text, coalesce(min(r.b::text), n.id::text)) grupo
      FROM (SELECT DISTINCT a id FROM arestas) n LEFT JOIN alcance r ON r.a = n.id GROUP BY n.id
  ), grupos AS (
    SELECT c.grupo, count(*) qtd,
           EXISTS (SELECT 1 FROM comp c2 JOIN f x ON x.id = c2.id WHERE c2.grupo = c.grupo AND x.doc IS NOT NULL
                    GROUP BY x.doc HAVING count(*) > 1) tem_doc
      FROM comp c GROUP BY c.grupo
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'motivo', CASE WHEN g.tem_doc THEN 'documento' ELSE 'nome' END,
           'chave', g.grupo, 'qtd', g.qtd,
           'fornecedores', (SELECT jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'cpf_cnpj', x.cpf_cnpj, 'ativo', x.ativo)
                                              ORDER BY (x.doc IS NULL), x.ativo DESC, x.created_at, x.id)
                              FROM comp c JOIN f x ON x.id = c.id WHERE c.grupo = g.grupo))
         ORDER BY (NOT g.tem_doc), (SELECT min(x.nome) FROM comp c JOIN f x ON x.id = c.id WHERE c.grupo = g.grupo)), '[]'::jsonb)
    INTO v FROM grupos g;
  RETURN v;
END $f$;

CREATE OR REPLACE FUNCTION public.fn_fornecedor_uso(p_fornecedor uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
declare f record;
begin
  perform public._fn_exigir_tenant_das_linhas(array[(select x.cliente_id from public.financeiro_fornecedores x where x.id = p_fornecedor)]);
  select id, cliente_id, created_at into f from public.financeiro_fornecedores where id = p_fornecedor;
  return jsonb_build_object(
    'cadastrado_em', f.created_at,
    'lancamentos', (select count(*) from public.financeiro_lancamentos_v2 l
                     where l.favorecido_id = f.id and l.cliente_id = f.cliente_id and l.cancelado is not true),
    'ultimo_lancamento', (select max(coalesce(l.data_pagamento, l.data_competencia)) from public.financeiro_lancamentos_v2 l
                     where l.favorecido_id = f.id and l.cliente_id = f.cliente_id and l.cancelado is not true),
    'compras_parceladas', (select count(*) from public.financiamentos c
                     where c.credor_id = f.id and c.natureza = 'parcelamento' and coalesce(c.status, '') <> 'cancelado'),
    'documentos', (select count(*) from public.financeiro_lancamento_documentos d where d.emitente_id = f.id and d.cancelado is not true)
                + (select count(*) from public.zoo_operacao_documentos d where d.emitente_id = f.id and d.cancelado is not true),
    /* FORN-MESCLAR-02b — a aba Uso da mesclagem */
    'recorrencias', (select count(*) from public.financeiro_recorrencias r where r.favorecido_id = f.id and r.ativo),
    'financiamentos', (select count(*) from public.financiamentos c
                     where c.credor_id = f.id and c.natureza <> 'parcelamento' and coalesce(c.status, '') <> 'cancelado'),
    'operacoes', (select count(*) from public.zoo_operacoes_comerciais o where o.contraparte_id = f.id and o.cancelado_em is null));
end $f$;

DO $c$
BEGIN
  IF (SELECT proacl::text FROM pg_proc WHERE oid = 'public.fn_fornecedor_uso(uuid)'::regprocedure) <> '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'
     OR (SELECT proacl::text FROM pg_proc WHERE oid = 'public.fn_fornecedor_repetidos(uuid)'::regprocedure) <> '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public._fn_fornecedor_mesclagem_desfazer_exec(uuid,text)'::regprocedure)
     OR has_function_privilege('anon', 'public.fn_fornecedor_mesclar(uuid,uuid[],boolean,jsonb)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.fn_fornecedor_mesclar(uuid,uuid[],boolean,jsonb)', 'execute')
     OR has_function_privilege('authenticated', 'public._fn_fornecedor_mesclar_exec(uuid,uuid[],jsonb)', 'execute') THEN
    RAISE EXCEPTION 'FORN-MESCLAR-02b: ACL ou SECURITY inesperados';
  END IF;
END $c$;
