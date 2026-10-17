-- FORN-MESCLAR-01 — mesclar fornecedores numa transacao, com trilha e "Desfazer mesclagem" (Gabriel 17/10/2026).
--
-- A mesclagem antiga (FornecedorFormDialog.handleMerge, travada por MESCLAR_LIGADO = false) movia SO' os lancamentos do
-- Financeiro, em tres idas soltas pela tela, sem trilha e sem volta: o resto (contratos de credito, recorrencias, OCs, documentos,
-- rebanho, agricultura) continuava apontando para o cadastro inativado.
--
-- AQUI: fn_fornecedor_mesclar(p_manter, p_absorver[], p_simular) move TODA referencia por id (a lista fixa de
-- _fn_fornecedor_mesclar_alvos: as 16 FKs para financeiro_fornecedores e as 7 colunas de id sem FK), junta nome e CPF/CNPJ dos
-- absorvidos nos apelidos do que fica, inativa os absorvidos com "mesclado em <nome>" (fundido_em_id / fundido_em / fundido_por /
-- fundido_motivo, colunas que ja' existiam) e grava a trilha em fornecedor_mesclagem_log — tudo numa transacao. CPF/CNPJ diferentes
-- RECUSAM com frase. fn_fornecedor_mesclagem_desfazer devolve cada linha movida ao absorvido de onde veio (so' as que ainda apontam
-- para o mantido), os apelidos e o estado dos absorvidos.
--
-- FICAM COMO ESTAO (instantaneos, texto, nao id): conciliacao_bancaria_itens.snapshot_favorecido_id, emitente_nome/emitente_documento
-- dos documentos, fornecedor_nome_snapshot / comprador_fornecedor / frigorifico de lancamentos, financeiro_classificacao_staging,
-- mesa_lancamento_staging (sem coluna id) e as tabelas de backup.
-- ⚠ O hash de importacao do lancamento inclui o favorecido: ele e' recalculado pelo gatilho de sempre (e volta no desfazer).
-- ⚠ O UPDATE em financeiro_lancamentos_v2 roda sob app.propagando_plano = 'on' (a marca da casa para copia que acompanha o
--   cadastro): sem ela o lancamento importado viraria "editado manualmente".
-- NENHUM DADO REAL E' MESCLADO por esta migration.

SET LOCAL lock_timeout = '2s';

CREATE TABLE IF NOT EXISTS public.fornecedor_mesclagem_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  mantido_id uuid NOT NULL REFERENCES public.financeiro_fornecedores(id),
  absorvidos uuid[] NOT NULL,
  movidos jsonb NOT NULL DEFAULT '[]'::jsonb,
  antes jsonb NOT NULL,
  resumo jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  criado_por uuid DEFAULT auth.uid(),
  desfeito_em timestamptz,
  desfeito_por uuid,
  desfeito_motivo text,
  desfeito_resumo jsonb,
  CONSTRAINT fornecedor_mesclagem_log_desfeito_chk CHECK ((desfeito_em IS NULL) = (desfeito_motivo IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_forn_mesclagem_cliente ON public.fornecedor_mesclagem_log (cliente_id, criado_em DESC);
ALTER TABLE public.fornecedor_mesclagem_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS forn_mesclagem_select_tenant ON public.fornecedor_mesclagem_log;
CREATE POLICY forn_mesclagem_select_tenant ON public.fornecedor_mesclagem_log FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));
REVOKE ALL ON public.fornecedor_mesclagem_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fornecedor_mesclagem_log TO authenticated;
GRANT ALL ON public.fornecedor_mesclagem_log TO service_role;

-- As referencias por id, com o modulo que a tela mostra na previa.
CREATE OR REPLACE FUNCTION public._fn_fornecedor_mesclar_alvos()
RETURNS TABLE (modulo text, tabela text, coluna text)
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
  VALUES
    ('Financeiro', 'financeiro_lancamentos_v2', 'favorecido_id'),
    ('Financeiro', 'financeiro_contratos', 'fornecedor_id'),
    ('Financeiro', 'financeiro_lancamento_documentos', 'emitente_id'),
    ('Recorrências', 'financeiro_recorrencias', 'favorecido_id'),
    ('Financiamentos', 'financiamentos', 'credor_id'),
    ('Financiamentos', 'financiamento_liberacoes', 'fornecedor_id'),
    ('Financiamentos', 'financiamento_destinacoes', 'fornecedor_id'),
    ('Financiamentos', 'financiamento_linhas_credito', 'credor_id'),
    ('Operação comercial', 'zoo_operacoes_comerciais', 'contraparte_id'),
    ('Operação comercial', 'zoo_operacao_partes', 'favorecido_id'),
    ('Operação comercial', 'zoo_operacao_compromissos', 'favorecido_id'),
    ('Operação comercial', 'zoo_operacao_documentos', 'emitente_id'),
    ('Operação comercial', 'zoo_operacao_boitel', 'frigorifico_id'),
    ('Rebanho', 'lancamentos', 'fornecedor_id'),
    ('Rebanho', 'lancamentos', 'comprador_fornecedor_id'),
    ('Rebanho', 'lancamentos', 'abate_fornecedor_id'),
    ('Agricultura', 'agri_colheita', 'industria_id'),
    ('Agricultura', 'agri_locais_estoque', 'fornecedor_id'),
    ('Agricultura', 'agri_barter_contratos', 'parceiro_fornecedor_id'),
    ('Agricultura', 'agri_operacoes_comerciais', 'contraparte_fornecedor_id'),
    ('Importação', 'excel_linhas_aux', 'favorecido_id'),
    ('Cadastro', 'financeiro_fornecedores', 'fundido_em_id')
$$;
REVOKE ALL ON FUNCTION public._fn_fornecedor_mesclar_alvos() FROM PUBLIC, anon, authenticated;

-- A chave de comparacao do documento: digitos e letras, em maiusculas (o espelho de chaveDoDocumento, documentoFiscal.ts).
CREATE OR REPLACE FUNCTION public._fn_fornecedor_chave_documento(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
  SELECT nullif(upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g')), '')
$$;
REVOKE ALL ON FUNCTION public._fn_fornecedor_chave_documento(text) FROM PUBLIC, anon, authenticated;

-- A recusa (NULO = pode mesclar). Uma regra so': a simulacao e a gravacao perguntam aqui.
CREATE OR REPLACE FUNCTION public._fn_fornecedor_mesclar_recusa(p_manter uuid, p_absorver uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public AS $$
DECLARE
  v_m record; v_a record; v_docs text[];
BEGIN
  IF p_absorver IS NULL OR cardinality(p_absorver) = 0 THEN
    RETURN jsonb_build_object('motivo', 'lista_vazia', 'frase', 'Escolha ao menos um fornecedor para absorver.');
  END IF;
  IF p_manter = ANY (p_absorver) THEN
    RETURN jsonb_build_object('motivo', 'mantido_na_lista', 'frase', 'O fornecedor que fica não pode estar entre os absorvidos.');
  END IF;
  IF cardinality(p_absorver) <> (SELECT count(DISTINCT x) FROM unnest(p_absorver) x) THEN
    RETURN jsonb_build_object('motivo', 'repetido', 'frase', 'Há fornecedor repetido na lista dos absorvidos.');
  END IF;
  SELECT * INTO v_m FROM public.financeiro_fornecedores WHERE id = p_manter;
  IF NOT coalesce(v_m.ativo, true) THEN
    RETURN jsonb_build_object('motivo', 'mantido_inativo', 'frase', format('O fornecedor que fica (%s) está inativo: reative-o antes de mesclar.', v_m.nome));
  END IF;
  IF v_m.fundido_em_id IS NOT NULL THEN
    RETURN jsonb_build_object('motivo', 'mantido_mesclado', 'frase', format('O fornecedor que fica (%s) já foi mesclado em outro.', v_m.nome));
  END IF;
  FOR v_a IN SELECT f.nome, f.fundido_em_id FROM public.financeiro_fornecedores f WHERE f.id = ANY (p_absorver) LOOP
    IF v_a.fundido_em_id IS NOT NULL THEN
      RETURN jsonb_build_object('motivo', 'ja_mesclado', 'frase', format('%s já foi mesclado em outro fornecedor: desfaça aquela mesclagem antes.', v_a.nome));
    END IF;
  END LOOP;
  SELECT array_agg(DISTINCT format('%s (%s)', f.cpf_cnpj, f.nome) ORDER BY format('%s (%s)', f.cpf_cnpj, f.nome))
    INTO v_docs
    FROM public.financeiro_fornecedores f
   WHERE f.id = ANY (p_absorver || p_manter) AND public._fn_fornecedor_chave_documento(f.cpf_cnpj) IS NOT NULL;
  IF (SELECT count(DISTINCT public._fn_fornecedor_chave_documento(f.cpf_cnpj)) FROM public.financeiro_fornecedores f
       WHERE f.id = ANY (p_absorver || p_manter) AND public._fn_fornecedor_chave_documento(f.cpf_cnpj) IS NOT NULL) > 1 THEN
    RETURN jsonb_build_object('motivo', 'cnpj_diferente',
      'frase', 'CPF/CNPJ diferentes: ' || array_to_string(v_docs, ' e ') || '. Fornecedores com documentos diferentes não se mesclam.');
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public._fn_fornecedor_mesclar_recusa(uuid, uuid[]) FROM PUBLIC, anon, authenticated;

-- O caminho que grava (a simulacao roda o MESMO e desfaz).
CREATE OR REPLACE FUNCTION public._fn_fornecedor_mesclar_exec(p_manter uuid, p_absorver uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_m record; v_alvo record; v_abs uuid; v_ids uuid[];
  v_movidos jsonb := '[]'::jsonb; v_modulos jsonb := '{}'::jsonb; v_antes jsonb; v_aliases text[]; v_log uuid;
  v_recusa jsonb; v_total int := 0;
BEGIN
  v_recusa := public._fn_fornecedor_mesclar_recusa(p_manter, p_absorver);
  IF v_recusa IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = (v_recusa->>'frase') || ' Nada foi mesclado.';
  END IF;
  SELECT * INTO v_m FROM public.financeiro_fornecedores WHERE id = p_manter FOR UPDATE;
  PERFORM 1 FROM public.financeiro_fornecedores WHERE id = ANY (p_absorver) FOR UPDATE;

  v_antes := jsonb_build_object(
    'mantido', jsonb_build_object('aliases', v_m.aliases),
    'absorvidos', (SELECT jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'cpf_cnpj', f.cpf_cnpj, 'ativo', f.ativo,
                     'fundido_em_id', f.fundido_em_id, 'fundido_em', f.fundido_em, 'fundido_por', f.fundido_por,
                     'fundido_motivo', f.fundido_motivo) ORDER BY f.nome)
                   FROM public.financeiro_fornecedores f WHERE f.id = ANY (p_absorver)));

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
        v_total := v_total + cardinality(v_ids);
      END IF;
    END LOOP;
  END LOOP;
  PERFORM set_config('app.propagando_plano', 'off', true);

  -- nome e CPF/CNPJ dos absorvidos (e os apelidos deles) viram apelidos do que fica, sem repetir
  SELECT array_agg(DISTINCT a ORDER BY a) INTO v_aliases FROM (
    SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_m.aliases) = 'array' THEN v_m.aliases ELSE '[]'::jsonb END) a
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
          jsonb_build_object('por_modulo', v_modulos, 'total', v_total, 'apelidos', to_jsonb(coalesce(v_aliases, '{}'::text[]))))
  RETURNING id INTO v_log;

  RETURN jsonb_build_object('mesclagem_id', v_log, 'mantido', jsonb_build_object('id', v_m.id, 'nome', v_m.nome, 'cpf_cnpj', v_m.cpf_cnpj),
    'absorvidos', v_antes->'absorvidos', 'por_modulo', v_modulos, 'total', v_total, 'apelidos', to_jsonb(coalesce(v_aliases, '{}'::text[])),
    'recusa', NULL);
END $$;
REVOKE ALL ON FUNCTION public._fn_fornecedor_mesclar_exec(uuid, uuid[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_fornecedor_mesclar(p_manter uuid, p_absorver uuid[], p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
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

  v_recusa := public._fn_fornecedor_mesclar_recusa(p_manter, p_absorver);
  IF v_recusa IS NOT NULL THEN
    IF p_simular THEN RETURN jsonb_build_object('simulado', true, 'recusa', v_recusa); END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = (v_recusa->>'frase') || ' Nada foi mesclado.';
  END IF;

  IF NOT p_simular THEN
    RETURN public._fn_fornecedor_mesclar_exec(p_manter, p_absorver) || jsonb_build_object('simulado', false);
  END IF;
  BEGIN
    v_r := public._fn_fornecedor_mesclar_exec(p_manter, p_absorver);
    RAISE EXCEPTION USING ERRCODE = 'FMSIM', MESSAGE = v_r::text;
  EXCEPTION
    WHEN SQLSTATE 'FMSIM' THEN RETURN (SQLERRM)::jsonb || jsonb_build_object('simulado', true, 'mesclagem_id', NULL);
    WHEN OTHERS THEN RETURN jsonb_build_object('simulado', true, 'recusa', jsonb_build_object('motivo', 'banco', 'frase', SQLERRM));
  END;
END $$;
REVOKE ALL ON FUNCTION public.fn_fornecedor_mesclar(uuid, uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_mesclar(uuid, uuid[], boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._fn_fornecedor_mesclagem_desfazer_exec(p_mesclagem_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_l record; v_e jsonb; v_a jsonb; v_ids uuid[]; v_voltaram int := 0; v_ficaram int := 0; v_n int;
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
END $$;
REVOKE ALL ON FUNCTION public._fn_fornecedor_mesclagem_desfazer_exec(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_fornecedor_mesclagem_desfazer(p_mesclagem_id uuid, p_motivo text, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_r jsonb;
BEGIN
  PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[(SELECT l.cliente_id FROM public.fornecedor_mesclagem_log l WHERE l.id = p_mesclagem_id)]);
  IF NOT p_simular THEN
    RETURN public._fn_fornecedor_mesclagem_desfazer_exec(p_mesclagem_id, p_motivo) || jsonb_build_object('simulado', false);
  END IF;
  BEGIN
    v_r := public._fn_fornecedor_mesclagem_desfazer_exec(p_mesclagem_id, coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'simulação'));
    RAISE EXCEPTION USING ERRCODE = 'FMSIM', MESSAGE = v_r::text;
  EXCEPTION
    WHEN SQLSTATE 'FMSIM' THEN RETURN (SQLERRM)::jsonb || jsonb_build_object('simulado', true);
    WHEN OTHERS THEN RETURN jsonb_build_object('simulado', true, 'recusa', jsonb_build_object('motivo', 'banco', 'frase', SQLERRM));
  END;
END $$;
REVOKE ALL ON FUNCTION public.fn_fornecedor_mesclagem_desfazer(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_mesclagem_desfazer(uuid, text, boolean) TO authenticated, service_role;

-- Sugestoes (so' sugere): mesmo CPF/CNPJ, ou o mesmo nome sem S.A./LTDA/ME/EIRELI/"(001)" e pontuacao. Ativos e inativos nao mesclados.
CREATE OR REPLACE FUNCTION public.fn_fornecedor_repetidos(p_cliente uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  WITH f AS (
    SELECT f.id, f.nome, f.cpf_cnpj, coalesce(f.ativo, true) ativo, f.created_at,
           public._fn_fornecedor_chave_documento(f.cpf_cnpj) doc,
           btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(public._fn_normalizar_texto(f.nome), ''),
             '\(\s*\d+\s*\)', ' ', 'g'), '[^a-z0-9]+', ' ', 'g'),
             '\m(s a|sa|ltda|me|epp|eireli|cia|companhia)\M', ' ', 'g'), '\s+', ' ', 'g')) chave_nome
      FROM public.financeiro_fornecedores f
     WHERE f.cliente_id = p_cliente AND f.fundido_em_id IS NULL
  ), grupos AS (
    SELECT 'documento' motivo, doc chave FROM f WHERE doc IS NOT NULL GROUP BY doc HAVING count(*) > 1
    UNION
    SELECT 'nome', chave_nome FROM f WHERE chave_nome <> '' GROUP BY chave_nome HAVING count(*) > 1
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('motivo', g.motivo, 'chave', g.chave,
           'fornecedores', (SELECT jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'cpf_cnpj', x.cpf_cnpj, 'ativo', x.ativo)
                                              ORDER BY x.ativo DESC, x.created_at, x.id)
                              FROM f x WHERE (g.motivo = 'documento' AND x.doc = g.chave) OR (g.motivo = 'nome' AND x.chave_nome = g.chave)))
         ORDER BY g.motivo, g.chave), '[]'::jsonb)
    INTO v FROM grupos g;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.fn_fornecedor_repetidos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_repetidos(uuid) TO authenticated, service_role;
