-- FORN-FILIAL-01 aplicado nos existentes (Gabriel, 21/10/2026: OK para "completar cidade" e "limpar nome"; os "revisar" NAO; a razao
-- social NUNCA e' trocada pela da Receita). A proposta (cadastro a cadastro, com a cidade da Receita e o nome sem o sufixo de cidade)
-- fica FORA do repo, em ~/agroinblue-local; aqui so' o caminho com trilha e desfazer, no molde do FORN-NOME-CAIXA-01.
-- `fn_fornecedor_filial_aplicar(cliente, itens, simular)`: `itens` = `[{"id", "municipio", "uf"}]` (completar cidade) e/ou
-- `[{"id", "nome_antes", "nome_depois"}]` (limpar nome). Cada parte so' grava se o cadastro AINDA esta' como a proposta o viu:
--   cidade — municipio E uf vazios hoje (cidade ja' preenchida nunca e' sobrescrita);
--   nome — o nome de hoje e' o `nome_antes` ou a caixa padronizada dele (a FORN-NOME-CAIXA-01 passou depois da proposta); grava a caixa
--   padronizada do `nome_depois` e o nome de hoje vira apelido (a busca e o extrato continuam achando).
-- O que nao grava volta em `recusados` com o motivo. Trilha `fornecedor_filial_operacoes` (antes/depois de nome, apelidos, municipio,
-- uf) + `app.motivo` + `audit_log`. Desfazer `fn_fornecedor_filial_desfazer(operacao, motivo, simular)`: volta o cadastro que esta'
-- exatamente como a aplicacao o deixou. Guarda `tenant_ok`; ACL so' postgres / service_role (nenhuma tela chama).
SET LOCAL lock_timeout = '2s';

CREATE TABLE IF NOT EXISTS public.fornecedor_filial_operacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  feita_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  feita_por uuid,
  itens jsonb NOT NULL,           -- [{id, antes {nome, aliases, municipio, uf}, depois {...}}]
  desfeita_em timestamptz, desfeita_por uuid, desfeita_motivo text,
  CONSTRAINT fornecedor_filial_op_desfeita_chk CHECK ((desfeita_em IS NULL) = (desfeita_motivo IS NULL))
);
ALTER TABLE public.fornecedor_filial_operacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fornecedor_filial_op_select ON public.fornecedor_filial_operacoes;
CREATE POLICY fornecedor_filial_op_select ON public.fornecedor_filial_operacoes FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));
REVOKE ALL ON public.fornecedor_filial_operacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fornecedor_filial_operacoes TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_fornecedor_filial_aplicar(p_cliente uuid, p_itens jsonb, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_itens jsonb; v_recusa jsonb; v_op uuid; v_ret jsonb;
BEGIN
  IF NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_cliente IS NULL OR NOT EXISTS (SELECT 1 FROM clientes WHERE id = p_cliente) THEN
    RAISE EXCEPTION 'Cliente nao encontrado. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_itens tem de ser uma lista. Nada foi gravado.' USING ERRCODE = '22023';
  END IF;
  BEGIN
    WITH p AS (
      SELECT (i->>'id')::uuid id, nullif(btrim(i->>'municipio'), '') mun, nullif(upper(btrim(i->>'uf')), '') uf,
             i->>'nome_antes' n_antes, nullif(btrim(i->>'nome_depois'), '') n_depois
        FROM jsonb_array_elements(p_itens) i
    ), x AS (
      SELECT p.id, f.id IS NOT NULL achou, f.nome, f.aliases, f.municipio, f.uf,
             (p.mun IS NOT NULL AND p.uf IS NOT NULL) quer_cidade,
             (p.mun IS NOT NULL AND p.uf IS NOT NULL AND coalesce(btrim(f.municipio), '') = '' AND coalesce(btrim(f.uf), '') = '') cidade_ok,
             p.mun, p.uf p_uf,
             (p.n_depois IS NOT NULL) quer_nome,
             (p.n_depois IS NOT NULL AND (f.nome = p.n_antes OR f.nome = public._fn_nome_caixa(p.n_antes))) nome_ok,
             public._fn_nome_caixa(p.n_depois) n_novo
        FROM p LEFT JOIN financeiro_fornecedores f ON f.id = p.id AND f.cliente_id = p_cliente
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', x.id,
             'antes', jsonb_build_object('nome', x.nome, 'aliases', x.aliases, 'municipio', x.municipio, 'uf', x.uf),
             'depois', jsonb_build_object(
                 'nome', CASE WHEN x.nome_ok THEN x.n_novo ELSE x.nome END,
                 'aliases', CASE WHEN x.nome_ok THEN public._fn_nome_caixa_apelido(x.aliases, x.nome, x.n_novo) ELSE x.aliases END,
                 'municipio', CASE WHEN x.cidade_ok THEN x.mun ELSE x.municipio END,
                 'uf', CASE WHEN x.cidade_ok THEN x.p_uf ELSE x.uf END))
             ORDER BY x.id) FILTER (WHERE x.achou AND (x.cidade_ok OR (x.nome_ok AND x.n_novo IS DISTINCT FROM x.nome))), '[]'::jsonb),
           coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'motivo',
             CASE WHEN NOT x.achou THEN 'nao e cadastro deste cliente'
                  WHEN x.quer_cidade AND NOT x.cidade_ok THEN 'cidade ja preenchida'
                  ELSE 'o nome mudou desde a proposta' END) ORDER BY x.id)
             FILTER (WHERE NOT x.achou OR (x.quer_cidade AND NOT x.cidade_ok) OR (x.quer_nome AND NOT x.nome_ok)), '[]'::jsonb)
      INTO v_itens, v_recusa
      FROM x;

    INSERT INTO fornecedor_filial_operacoes (cliente_id, feita_por, itens) VALUES (p_cliente, auth.uid(), v_itens) RETURNING id INTO v_op;
    -- o nome gravado ja' e' a caixa padronizada: o gatilho da caixa nao age (nao poe outro apelido)
    PERFORM set_config('app.nome_caixa_escritor', 'on', true);
    PERFORM set_config('app.motivo', 'cidade da Receita e nome sem o sufixo de cidade — FORN-FILIAL-01 (sem os a revisar)', true);
    UPDATE financeiro_fornecedores f
       SET nome = i->'depois'->>'nome', aliases = i->'depois'->'aliases', municipio = i->'depois'->>'municipio', uf = i->'depois'->>'uf',
           updated_at = now()
      FROM jsonb_array_elements(v_itens) i
     WHERE f.id = (i->>'id')::uuid AND f.cliente_id = p_cliente;
    PERFORM set_config('app.nome_caixa_escritor', 'off', true);
    v_ret := jsonb_build_object('operacao_id', v_op, 'simulado', p_simular, 'fornecedores', jsonb_array_length(v_itens),
      'cidades', (SELECT count(*) FROM jsonb_array_elements(v_itens) i WHERE i->'antes'->>'municipio' IS DISTINCT FROM i->'depois'->>'municipio'),
      'nomes', (SELECT count(*) FROM jsonb_array_elements(v_itens) i WHERE i->'antes'->>'nome' IS DISTINCT FROM i->'depois'->>'nome'),
      'recusados', v_recusa);
    IF p_simular THEN RAISE EXCEPTION USING ERRCODE = 'FFSIM', MESSAGE = v_ret::text; END IF;
  EXCEPTION WHEN SQLSTATE 'FFSIM' THEN
    v_ret := SQLERRM::jsonb || jsonb_build_object('operacao_id', NULL);
  END;
  RETURN v_ret;
END $f$;

CREATE OR REPLACE FUNCTION public.fn_fornecedor_filial_desfazer(p_operacao uuid, p_motivo text, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_op fornecedor_filial_operacoes%ROWTYPE; v_volta int := 0; v_fica int := 0; v_ret jsonb;
BEGIN
  PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[(SELECT o.cliente_id FROM fornecedor_filial_operacoes o WHERE o.id = p_operacao)]);
  SELECT * INTO v_op FROM fornecedor_filial_operacoes WHERE id = p_operacao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao nao encontrada. Nada foi gravado.' USING ERRCODE = 'P0001'; END IF;
  IF v_op.desfeita_em IS NOT NULL THEN RAISE EXCEPTION 'Esta aplicacao ja foi desfeita. Nada foi gravado.' USING ERRCODE = 'P0001'; END IF;
  IF NOT p_simular AND coalesce(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Informe o motivo. Nada foi gravado.' USING ERRCODE = 'P0001'; END IF;
  BEGIN
    PERFORM set_config('app.nome_caixa_escritor', 'on', true);
    PERFORM set_config('app.motivo', 'desfeita a cidade/nome da filial: ' || coalesce(p_motivo, ''), true);
    WITH alvo AS (
      SELECT (i->>'id')::uuid id, i->'antes' a, i->'depois' d FROM jsonb_array_elements(v_op.itens) i
    ), volta AS (
      UPDATE financeiro_fornecedores f
         SET nome = alvo.a->>'nome', aliases = alvo.a->'aliases', municipio = alvo.a->>'municipio', uf = alvo.a->>'uf', updated_at = now()
        FROM alvo
       WHERE f.id = alvo.id AND f.cliente_id = v_op.cliente_id
         AND f.nome IS NOT DISTINCT FROM alvo.d->>'nome' AND f.aliases IS NOT DISTINCT FROM alvo.d->'aliases'
         AND f.municipio IS NOT DISTINCT FROM alvo.d->>'municipio' AND f.uf IS NOT DISTINCT FROM alvo.d->>'uf'
      RETURNING f.id)
    SELECT count(*) INTO v_volta FROM volta;
    PERFORM set_config('app.nome_caixa_escritor', 'off', true);
    v_fica := jsonb_array_length(v_op.itens) - v_volta;
    UPDATE fornecedor_filial_operacoes SET desfeita_em = clock_timestamp(), desfeita_por = auth.uid(), desfeita_motivo = coalesce(nullif(btrim(p_motivo), ''), 'simulacao')
     WHERE id = p_operacao;
    v_ret := jsonb_build_object('operacao_id', p_operacao, 'simulado', p_simular, 'voltaram', v_volta, 'ficaram', v_fica);
    IF p_simular THEN RAISE EXCEPTION USING ERRCODE = 'FFSIM', MESSAGE = v_ret::text; END IF;
  EXCEPTION WHEN SQLSTATE 'FFSIM' THEN
    v_ret := SQLERRM::jsonb;
  END;
  RETURN v_ret;
END $f$;

REVOKE ALL ON FUNCTION public.fn_fornecedor_filial_aplicar(uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_fornecedor_filial_desfazer(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_filial_aplicar(uuid, jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_filial_desfazer(uuid, text, boolean) TO service_role;
