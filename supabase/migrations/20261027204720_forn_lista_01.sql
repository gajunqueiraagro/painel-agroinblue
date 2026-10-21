-- FORN-LISTA-01 (Gabriel, mock "Lista de Fornecedores"; noite de 20/10/2026) — a lista de Cadastros › Fornecedores, aba Cadastro, por UMA
-- leitura do banco: busca, situacao, contagem por situacao, ordenacao por qualquer coluna e paginacao no servidor.
--   · A BUSCA E' A BUSCA UNICA: quem casa o texto e' `fn_fornecedor_buscar(cliente, busca, 'todos', NULL)` — esta funcao NAO repete a regra.
--   · SITUACAO: ativo = ativo e nao mesclado (o "ativo de verdade" da busca unica); mesclado = tem `fundido_em_id`; inativo = o resto.
--   · LANCAMENTOS e ULTIMO USO: ESPELHO DECLARADO de `fn_fornecedor_uso` (lancamentos vivos; max(pagamento, senao competencia)) — quem
--     mexer num confere o outro.
--   · "SEM CPF/CNPJ" fica com o validador unico do front (CNPJ alfanumerico, digito verificador): a leitura devolve, para o recorte da
--     situacao, os pares (id, cpf_cnpj); a tela conta e, com o filtro ligado, devolve os ids em `p_ids` para ordenar e paginar aqui.
--   · ORDEM: razao_social (padrao) · nome_fantasia · documento · cidade · lancamentos · ultimo_uso · situacao; vazio sempre por ultimo;
--     empate pela razao social normalizada e pelo id.
CREATE OR REPLACE FUNCTION public.fn_fornecedor_lista(
  p_cliente uuid, p_busca text DEFAULT NULL, p_situacao text DEFAULT 'ativos', p_ids uuid[] DEFAULT NULL,
  p_ordem text DEFAULT 'razao_social', p_desc boolean DEFAULT false, p_limite integer DEFAULT 100, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public SET plan_cache_mode = force_custom_plan AS $f$
DECLARE v jsonb; v_casam uuid[];
BEGIN
  IF NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_situacao NOT IN ('ativos', 'inativos', 'mesclados', 'todos') THEN
    RAISE EXCEPTION 'situacao invalida: %', p_situacao USING ERRCODE = '22023';
  END IF;
  IF p_ordem NOT IN ('razao_social', 'nome_fantasia', 'documento', 'cidade', 'lancamentos', 'ultimo_uso', 'situacao') THEN
    RAISE EXCEPTION 'ordem invalida: %', p_ordem USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_busca), '') <> '' THEN
    SELECT coalesce(array_agg((i->>'id')::uuid), '{}') INTO v_casam
      FROM jsonb_array_elements(public.fn_fornecedor_buscar(p_cliente, p_busca, 'todos', NULL, 0)->'itens') i;
  END IF;
  WITH uso AS (
    SELECT l.favorecido_id id, count(*) n, max(coalesce(l.data_pagamento, l.data_competencia)) ult
      FROM financeiro_lancamentos_v2 l
     WHERE l.cliente_id = p_cliente AND l.cancelado IS NOT TRUE AND l.favorecido_id IS NOT NULL
     GROUP BY l.favorecido_id
  ), b AS (
    SELECT f.*, coalesce(u.n, 0) uso_n, u.ult,
           CASE WHEN f.fundido_em_id IS NOT NULL THEN 'mesclado' WHEN coalesce(f.ativo, true) THEN 'ativo' ELSE 'inativo' END sit
      FROM financeiro_fornecedores f LEFT JOIN uso u ON u.id = f.id
     WHERE f.cliente_id = p_cliente AND (v_casam IS NULL OR f.id = ANY (v_casam))
  ), s AS (
    SELECT b.* FROM b
     WHERE (p_situacao = 'todos' OR b.sit = left(p_situacao, length(p_situacao) - 1))
  ), l AS (
    SELECT s.* FROM s WHERE p_ids IS NULL OR s.id = ANY (p_ids)
  ), o AS (
    SELECT l.*, row_number() OVER (ORDER BY
             CASE WHEN NOT p_desc THEN CASE p_ordem
               WHEN 'razao_social' THEN l.nome_norm WHEN 'nome_fantasia' THEN nullif(public._fn_normalizar_texto(l.nome_fantasia), '')
               WHEN 'documento' THEN nullif(public._fn_fornecedor_busca_doc(l.cpf_cnpj), '')
               WHEN 'cidade' THEN nullif(public._fn_normalizar_texto(concat_ws(' ', l.municipio, l.uf)), '')
               WHEN 'situacao' THEN CASE l.sit WHEN 'ativo' THEN '1' WHEN 'inativo' THEN '2' ELSE '3' END END END COLLATE "C" ASC NULLS LAST,
             CASE WHEN p_desc THEN CASE p_ordem
               WHEN 'razao_social' THEN l.nome_norm WHEN 'nome_fantasia' THEN nullif(public._fn_normalizar_texto(l.nome_fantasia), '')
               WHEN 'documento' THEN nullif(public._fn_fornecedor_busca_doc(l.cpf_cnpj), '')
               WHEN 'cidade' THEN nullif(public._fn_normalizar_texto(concat_ws(' ', l.municipio, l.uf)), '')
               WHEN 'situacao' THEN CASE l.sit WHEN 'ativo' THEN '1' WHEN 'inativo' THEN '2' ELSE '3' END END END COLLATE "C" DESC NULLS LAST,
             CASE WHEN p_ordem = 'lancamentos' AND NOT p_desc THEN l.uso_n END ASC,
             CASE WHEN p_ordem = 'lancamentos' AND p_desc THEN l.uso_n END DESC,
             CASE WHEN p_ordem = 'ultimo_uso' AND NOT p_desc THEN l.ult END ASC NULLS LAST,
             CASE WHEN p_ordem = 'ultimo_uso' AND p_desc THEN l.ult END DESC NULLS LAST,
             l.nome_norm COLLATE "C", l.id::text COLLATE "C") ord,
           count(*) OVER () total
      FROM l
  )
  SELECT jsonb_build_object(
    'total', coalesce((SELECT max(o.total) FROM o), 0),
    'contagens', (SELECT jsonb_build_object(
        'ativos', count(*) FILTER (WHERE b.sit = 'ativo'), 'inativos', count(*) FILTER (WHERE b.sit = 'inativo'),
        'mesclados', count(*) FILTER (WHERE b.sit = 'mesclado'), 'todos', count(*)) FROM b),
    'documentos', (SELECT coalesce(jsonb_agg(jsonb_build_array(s.id, s.cpf_cnpj)), '[]'::jsonb) FROM s),
    'itens', coalesce((SELECT jsonb_agg((to_jsonb(f) - 'aliases' - 'aliases_norm')
                 || jsonb_build_object('lancamentos', o.uso_n, 'ultimo_uso', o.ult, 'situacao', o.sit, 'dono_nome', d.nome) ORDER BY o.ord)
               FROM o JOIN financeiro_fornecedores f ON f.id = o.id
               LEFT JOIN financeiro_fornecedores d ON d.id = o.fundido_em_id
              WHERE o.ord > coalesce(p_offset, 0) AND (p_limite IS NULL OR o.ord <= coalesce(p_offset, 0) + p_limite)), '[]'::jsonb))
    INTO v;
  RETURN v;
END $f$;
REVOKE ALL ON FUNCTION public.fn_fornecedor_lista(uuid, text, text, uuid[], text, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_lista(uuid, text, text, uuid[], text, boolean, integer, integer) TO authenticated, service_role;
