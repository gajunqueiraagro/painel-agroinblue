-- FORN-NOME-CAIXA-01 aplicado nos existentes (Gabriel, 21/10/2026 12h42: OK para os SEM duvida; os da coluna "duvida" ficam como estao).
-- A aplicacao preparada (`fn_fornecedor_nome_caixa_aplicar(cliente, simular)`) aplica TODO campo que muda no cliente; os da duvida sao
-- por CAMPO (nome, fantasia ou contato de um cadastro). Esta e' a MESMA funcao com a lista do que PULAR: `p_pular` = jsonb
-- `[{"id": "<fornecedor>", "campo": "nome"|"nome_fantasia"|"contato_nome"}, ...]` — o campo pulado fica como esta' (nao entra no
-- "depois", nem no apelido). Mesma trilha (`fornecedor_nome_caixa_operacoes`, `app.motivo`, `audit_log`) e o MESMO desfazer
-- (`fn_fornecedor_nome_caixa_desfazer(operacao, motivo, simular)`, que volta cada cadastro que ninguem mexeu depois). Mesma guarda
-- (`tenant_ok`) e mesma ACL (so' postgres / service_role). A de dois parametros fica como esta'.
SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.fn_fornecedor_nome_caixa_aplicar(p_cliente uuid, p_simular boolean, p_pular jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_itens jsonb; v_op uuid; v_ret jsonb; v_pular jsonb := coalesce(p_pular, '[]'::jsonb);
BEGIN
  IF NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_cliente IS NULL OR NOT EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente) THEN
    RAISE EXCEPTION 'Cliente nao encontrado. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(v_pular) <> 'array' THEN
    RAISE EXCEPTION 'p_pular tem de ser uma lista. Nada foi gravado.' USING ERRCODE = '22023';
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
                   CASE WHEN v_pular @> jsonb_build_array(jsonb_build_object('id', f.id::text, 'campo', 'nome')) THEN f.nome
                        ELSE public._fn_nome_caixa(f.nome) END n_nome,
                   CASE WHEN v_pular @> jsonb_build_array(jsonb_build_object('id', f.id::text, 'campo', 'nome_fantasia')) THEN f.nome_fantasia
                        ELSE public._fn_nome_caixa(f.nome_fantasia) END n_fant,
                   CASE WHEN v_pular @> jsonb_build_array(jsonb_build_object('id', f.id::text, 'campo', 'contato_nome')) THEN f.contato_nome
                        ELSE public._fn_nome_caixa(f.contato_nome) END n_cont
              FROM financeiro_fornecedores f WHERE f.cliente_id = p_cliente) x
     WHERE x.n_nome IS DISTINCT FROM x.nome OR x.n_fant IS DISTINCT FROM x.nome_fantasia OR x.n_cont IS DISTINCT FROM x.contato_nome;

    INSERT INTO fornecedor_nome_caixa_operacoes (cliente_id, feita_por, itens) VALUES (p_cliente, auth.uid(), v_itens) RETURNING id INTO v_op;
    PERFORM set_config('app.nome_caixa_escritor', 'on', true);
    PERFORM set_config('app.motivo', 'nome padronizado em maiúscula/minúscula — FORN-NOME-CAIXA-01 (sem os da dúvida)', true);
    UPDATE financeiro_fornecedores f
       SET nome = i->'depois'->>'nome', nome_fantasia = i->'depois'->>'nome_fantasia', contato_nome = i->'depois'->>'contato_nome',
           aliases = i->'depois'->'aliases', updated_at = now()
      FROM jsonb_array_elements(v_itens) i
     WHERE f.id = (i->>'id')::uuid AND f.cliente_id = p_cliente;
    PERFORM set_config('app.nome_caixa_escritor', 'off', true);
    v_ret := jsonb_build_object('operacao_id', v_op, 'simulado', p_simular, 'fornecedores', jsonb_array_length(v_itens),
      'nomes', (SELECT count(*) FROM jsonb_array_elements(v_itens) i WHERE i->'antes'->>'nome' IS DISTINCT FROM i->'depois'->>'nome'),
      'fantasias', (SELECT count(*) FROM jsonb_array_elements(v_itens) i WHERE i->'antes'->>'nome_fantasia' IS DISTINCT FROM i->'depois'->>'nome_fantasia'),
      'contatos', (SELECT count(*) FROM jsonb_array_elements(v_itens) i WHERE i->'antes'->>'contato_nome' IS DISTINCT FROM i->'depois'->>'contato_nome'),
      'pulados', jsonb_array_length(v_pular));
    IF p_simular THEN RAISE EXCEPTION USING ERRCODE = 'NCSIM', MESSAGE = v_ret::text; END IF;
  EXCEPTION WHEN SQLSTATE 'NCSIM' THEN
    v_ret := SQLERRM::jsonb || jsonb_build_object('operacao_id', NULL);
  END;
  RETURN v_ret;
END $f$;
REVOKE ALL ON FUNCTION public.fn_fornecedor_nome_caixa_aplicar(uuid, boolean, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_nome_caixa_aplicar(uuid, boolean, jsonb) TO service_role;
