-- NOTA-FORNECEDOR-COMPARAR-01 (parte 2 de 2) — as funcoes `fn_fornecedor_atualizar_campos` e `_desfazer`; a tabela da trilha e a
-- explicacao inteira estao na 20261028111450.
SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.fn_fornecedor_atualizar_campos(p_fornecedor uuid, p_campos jsonb, p_origem text, p_referencia text,
  p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE c_permitidas constant text[] := ARRAY['nome', 'nome_fantasia', 'cpf_cnpj', 'inscricao_estadual', 'logradouro', 'numero', 'complemento',
          'bairro', 'cep', 'municipio', 'uf'];
        v_f jsonb; v_cli uuid; v_k text; v_v text; v_trilha jsonb := '{}'::jsonb; v_set text := ''; v_ret jsonb; v_id uuid; v_fora text[];
BEGIN
  SELECT to_jsonb(f), f.cliente_id INTO v_f, v_cli FROM public.financeiro_fornecedores f WHERE f.id = p_fornecedor;
  PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[v_cli]);
  IF v_f IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Cadastro não encontrado. Nada foi gravado.'; END IF;
  IF p_origem NOT IN ('nota', 'receita', 'tela') THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Origem inválida. Nada foi gravado.'; END IF;
  SELECT array_agg(k) INTO v_fora FROM jsonb_object_keys(coalesce(p_campos, '{}'::jsonb)) k WHERE k <> ALL (c_permitidas);
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = format('Campo que não se atualiza por aqui: %s. Nada foi gravado.', array_to_string(v_fora, ', '));
  END IF;
  FOR v_k, v_v IN SELECT key, nullif(btrim(value), '') FROM jsonb_each_text(coalesce(p_campos, '{}'::jsonb)) LOOP
    IF (v_f->>v_k) IS DISTINCT FROM v_v THEN
      v_trilha := v_trilha || jsonb_build_object(v_k, jsonb_build_object('antes', v_f->v_k, 'depois', to_jsonb(v_v)));
      v_set := v_set || format('%s%I = %L', CASE WHEN v_set = '' THEN '' ELSE ', ' END, v_k, v_v);
    END IF;
  END LOOP;
  IF v_set = '' THEN
    RETURN jsonb_build_object('ok', true, 'simulado', p_simular, 'alteracao_id', NULL, 'campos', '{}'::jsonb);
  END IF;
  BEGIN
    EXECUTE format('UPDATE public.financeiro_fornecedores SET %s WHERE id = %L', v_set, p_fornecedor);
    -- a trilha guarda o que FICOU gravado (o gatilho padroniza a caixa do nome)
    SELECT to_jsonb(f) INTO v_f FROM public.financeiro_fornecedores f WHERE f.id = p_fornecedor;
    SELECT coalesce(jsonb_object_agg(k, jsonb_build_object('antes', v_trilha->k->'antes', 'depois', v_f->k)), '{}'::jsonb)
      INTO v_trilha FROM jsonb_object_keys(v_trilha) k;
    INSERT INTO public.fornecedor_campos_alteracoes (cliente_id, fornecedor_id, origem, referencia, campos)
    VALUES (v_cli, p_fornecedor, p_origem, p_referencia, v_trilha) RETURNING id INTO v_id;
    v_ret := jsonb_build_object('ok', true, 'simulado', p_simular, 'alteracao_id', CASE WHEN p_simular THEN NULL ELSE v_id END, 'campos', v_trilha);
    IF p_simular THEN RAISE EXCEPTION USING ERRCODE = 'FCSIM', MESSAGE = v_ret::text; END IF;
  EXCEPTION WHEN sqlstate 'FCSIM' THEN
    RETURN sqlerrm::jsonb;
  END;
  RETURN v_ret;
END $f$;

CREATE OR REPLACE FUNCTION public.fn_fornecedor_atualizar_campos_desfazer(p_alteracao uuid, p_motivo text, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_a record; v_f jsonb; v_k text; v_set text := ''; v_voltaram text[] := '{}'; v_ficaram text[] := '{}'; v_ret jsonb;
BEGIN
  SELECT * INTO v_a FROM public.fornecedor_campos_alteracoes WHERE id = p_alteracao;
  PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[v_a.cliente_id]);
  IF v_a.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Alteração não encontrada. Nada foi gravado.'; END IF;
  IF v_a.desfeita_em IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Esta alteração já foi desfeita. Nada foi gravado.'; END IF;
  IF NOT p_simular AND nullif(btrim(coalesce(p_motivo, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Informe o motivo para desfazer. Nada foi gravado.';
  END IF;
  SELECT to_jsonb(f) INTO v_f FROM public.financeiro_fornecedores f WHERE f.id = v_a.fornecedor_id;
  FOR v_k IN SELECT jsonb_object_keys(v_a.campos) LOOP
    IF (v_f->v_k) IS NOT DISTINCT FROM (v_a.campos->v_k->'depois') THEN
      v_voltaram := v_voltaram || v_k;
      v_set := v_set || format('%s%I = %L', CASE WHEN v_set = '' THEN '' ELSE ', ' END, v_k, v_a.campos->v_k->>'antes');
    ELSE
      v_ficaram := v_ficaram || v_k;
    END IF;
  END LOOP;
  BEGIN
    IF v_set <> '' THEN EXECUTE format('UPDATE public.financeiro_fornecedores SET %s WHERE id = %L', v_set, v_a.fornecedor_id); END IF;
    UPDATE public.fornecedor_campos_alteracoes
       SET desfeita_em = now(), desfeita_por = auth.uid(), desfeita_motivo = coalesce(nullif(btrim(p_motivo), ''), 'simulação')
     WHERE id = p_alteracao;
    v_ret := jsonb_build_object('ok', true, 'simulado', p_simular, 'voltaram', to_jsonb(v_voltaram), 'ficaram', to_jsonb(v_ficaram));
    IF p_simular THEN RAISE EXCEPTION USING ERRCODE = 'FCSIM', MESSAGE = v_ret::text; END IF;
  EXCEPTION WHEN sqlstate 'FCSIM' THEN
    RETURN sqlerrm::jsonb;
  END;
  RETURN v_ret;
END $f$;

REVOKE ALL ON FUNCTION public.fn_fornecedor_atualizar_campos(uuid, jsonb, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_fornecedor_atualizar_campos_desfazer(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_atualizar_campos(uuid, jsonb, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_atualizar_campos_desfazer(uuid, text, boolean) TO authenticated, service_role;
