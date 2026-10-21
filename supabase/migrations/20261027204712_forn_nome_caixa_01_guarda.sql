-- FORN-NOME-CAIXA-01 (noite de 20/10/2026) — a guarda de cliente nas duas funcoes da aplicacao preparada (o detector
-- `guardaDeClienteNasMigrations` a cobra: SECURITY DEFINER com parametro de cliente ou so' o id). Aplicar: `tenant_ok(cliente)`;
-- desfazer: pelo cliente da operacao (`_fn_exigir_tenant_das_linhas`). Sem usuario, 42501: quem roda em SQL poe antes o JWT do admin
-- (`select set_config('request.jwt.claims', json_build_object('sub', '<admin>', 'role', 'authenticated')::text, true);`).
-- So' a guarda muda; ACL (so' postgres / service_role) fica como estava (CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION public.fn_fornecedor_nome_caixa_aplicar(p_cliente uuid, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_itens jsonb; v_op uuid; v_ret jsonb;
BEGIN
  IF NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_cliente IS NULL OR NOT EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente) THEN
    RAISE EXCEPTION 'Cliente nao encontrado. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', x.id,
             'antes', jsonb_build_object('nome', x.nome, 'nome_fantasia', x.nome_fantasia, 'contato_nome', x.contato_nome, 'aliases', x.aliases),
             'depois', jsonb_build_object('nome', x.n_nome, 'nome_fantasia', x.n_fant, 'contato_nome', x.n_cont,
                         'aliases', public._fn_nome_caixa_apelido(public._fn_nome_caixa_apelido(x.aliases, x.nome, x.n_nome), x.nome_fantasia, x.n_fant)))
             ORDER BY x.nome, x.id), '[]'::jsonb)
      INTO v_itens
      FROM (SELECT f.id, f.nome, f.nome_fantasia, f.contato_nome, f.aliases,
                   public._fn_nome_caixa(f.nome) n_nome, public._fn_nome_caixa(f.nome_fantasia) n_fant, public._fn_nome_caixa(f.contato_nome) n_cont
              FROM financeiro_fornecedores f WHERE f.cliente_id = p_cliente) x
     WHERE x.n_nome IS DISTINCT FROM x.nome OR x.n_fant IS DISTINCT FROM x.nome_fantasia OR x.n_cont IS DISTINCT FROM x.contato_nome;

    INSERT INTO fornecedor_nome_caixa_operacoes (cliente_id, feita_por, itens) VALUES (p_cliente, auth.uid(), v_itens) RETURNING id INTO v_op;
    PERFORM set_config('app.nome_caixa_escritor', 'on', true);
    PERFORM set_config('app.motivo', 'nome padronizado em maiúscula/minúscula — FORN-NOME-CAIXA-01', true);
    UPDATE financeiro_fornecedores f
       SET nome = i->'depois'->>'nome', nome_fantasia = i->'depois'->>'nome_fantasia', contato_nome = i->'depois'->>'contato_nome',
           aliases = i->'depois'->'aliases', updated_at = now()
      FROM jsonb_array_elements(v_itens) i
     WHERE f.id = (i->>'id')::uuid AND f.cliente_id = p_cliente;
    PERFORM set_config('app.nome_caixa_escritor', 'off', true);
    v_ret := jsonb_build_object('operacao_id', v_op, 'simulado', p_simular, 'fornecedores', jsonb_array_length(v_itens),
      'nomes', (SELECT count(*) FROM jsonb_array_elements(v_itens) i WHERE i->'antes'->>'nome' IS DISTINCT FROM i->'depois'->>'nome'),
      'fantasias', (SELECT count(*) FROM jsonb_array_elements(v_itens) i WHERE i->'antes'->>'nome_fantasia' IS DISTINCT FROM i->'depois'->>'nome_fantasia'),
      'contatos', (SELECT count(*) FROM jsonb_array_elements(v_itens) i WHERE i->'antes'->>'contato_nome' IS DISTINCT FROM i->'depois'->>'contato_nome'));
    IF p_simular THEN RAISE EXCEPTION USING ERRCODE = 'NCSIM', MESSAGE = v_ret::text; END IF;
  EXCEPTION WHEN SQLSTATE 'NCSIM' THEN
    v_ret := SQLERRM::jsonb || jsonb_build_object('operacao_id', NULL);
  END;
  RETURN v_ret;
END $f$;

CREATE OR REPLACE FUNCTION public.fn_fornecedor_nome_caixa_desfazer(p_operacao uuid, p_motivo text, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_op fornecedor_nome_caixa_operacoes%ROWTYPE; v_volta int := 0; v_fica int := 0; v_ret jsonb;
BEGIN
  PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[(SELECT o.cliente_id FROM fornecedor_nome_caixa_operacoes o WHERE o.id = p_operacao)]);
  SELECT * INTO v_op FROM fornecedor_nome_caixa_operacoes WHERE id = p_operacao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao nao encontrada. Nada foi gravado.' USING ERRCODE = 'P0001'; END IF;
  IF v_op.desfeita_em IS NOT NULL THEN RAISE EXCEPTION 'Esta padronizacao ja foi desfeita. Nada foi gravado.' USING ERRCODE = 'P0001'; END IF;
  IF NOT p_simular AND coalesce(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Informe o motivo. Nada foi gravado.' USING ERRCODE = 'P0001'; END IF;
  BEGIN
    PERFORM set_config('app.nome_caixa_escritor', 'on', true);
    PERFORM set_config('app.motivo', 'desfeita a padronizacao de nome: ' || coalesce(p_motivo, ''), true);
    WITH alvo AS (
      SELECT (i->>'id')::uuid id, i->'antes' a, i->'depois' d FROM jsonb_array_elements(v_op.itens) i
    ), volta AS (
      UPDATE financeiro_fornecedores f
         SET nome = alvo.a->>'nome', nome_fantasia = alvo.a->>'nome_fantasia', contato_nome = alvo.a->>'contato_nome', aliases = alvo.a->'aliases',
             updated_at = now()
        FROM alvo
       WHERE f.id = alvo.id AND f.cliente_id = v_op.cliente_id
         AND f.nome IS NOT DISTINCT FROM alvo.d->>'nome' AND f.nome_fantasia IS NOT DISTINCT FROM alvo.d->>'nome_fantasia'
         AND f.contato_nome IS NOT DISTINCT FROM alvo.d->>'contato_nome' AND f.aliases IS NOT DISTINCT FROM alvo.d->'aliases'
      RETURNING f.id)
    SELECT count(*) INTO v_volta FROM volta;
    PERFORM set_config('app.nome_caixa_escritor', 'off', true);
    v_fica := jsonb_array_length(v_op.itens) - v_volta;
    UPDATE fornecedor_nome_caixa_operacoes SET desfeita_em = clock_timestamp(), desfeita_por = auth.uid(), desfeita_motivo = coalesce(nullif(btrim(p_motivo), ''), 'simulacao')
     WHERE id = p_operacao;
    v_ret := jsonb_build_object('operacao_id', p_operacao, 'simulado', p_simular, 'voltaram', v_volta, 'ficaram', v_fica);
    IF p_simular THEN RAISE EXCEPTION USING ERRCODE = 'NCSIM', MESSAGE = v_ret::text; END IF;
  EXCEPTION WHEN SQLSTATE 'NCSIM' THEN
    v_ret := SQLERRM::jsonb;
  END;
  RETURN v_ret;
END $f$;
