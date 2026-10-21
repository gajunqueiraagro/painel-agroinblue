-- FORN-01b (Gabriel, 21/10/2026) — a lista de Cadastros › Fornecedores e a aba "Sem cadastro" so' com o que e' real.
--   · fn_fornecedor_lista: "Lanç." conta so' o cenario REALIZADO vivo (nao cancelado); "Último uso" = o ultimo desses com data
--     (pagamento, senao vencimento, senao competencia — a "data" da `_fn_sem_cadastro_base`) ATE' HOJE (America/Sao_Paulo). Antes
--     contava o previsto futuro e a Meta ("01/06/2027" de 9 previstos de recorrencia). Deixa de ser espelho de `fn_fornecedor_uso`:
--     aquela conta TODAS as referencias (as que a mesclagem move), esta mostra o uso real.
--   · _fn_sem_cadastro_base: so' cenario realizado (as 12 deducoes de abate de cenario Meta saem); lancamento gerado pelo sistema
--     (`origem_tipo` preenchido: consumo_rebanho, abate:*, oc:*) sai — nao tem fornecedor por natureza; e a DESCRICAO so' vale como
--     texto de fornecedor no que veio de extrato/importacao (`origem_lancamento`: importacao_incremental, extrato, ofx, excel,
--     mesa_excel, mesa_split, migracao). Saem por isso o `manual` (descricao digitada) e a `conciliacao` (ajuste do sistema).
--     O texto da PLANILHA (staging) continua valendo em qualquer origem.
CREATE OR REPLACE FUNCTION public._fn_sem_cadastro_base(p_cliente uuid)
RETURNS TABLE(lancamento_id uuid, texto text, chave text, origem text, valor numeric, data date, descricao text, fazenda_id uuid,
              status text, rateio boolean)
LANGUAGE sql STABLE SET search_path = public AS $f$
  SELECT l.id, t.texto, public._fn_normalizar_texto(t.texto), t.origem, abs(l.valor),
         coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia), l.descricao, l.fazenda_id, l.status_transacao,
         (t.texto ~* '^\s*pec\.3m-')
    FROM public.financeiro_lancamentos_v2 l
    LEFT JOIN LATERAL (SELECT btrim(s.excel_fornecedor) txt FROM public.financeiro_classificacao_staging s
                        WHERE s.match_lancamento_id = l.id AND nullif(btrim(s.excel_fornecedor), '') IS NOT NULL
                          AND btrim(s.excel_fornecedor) <> '-'
                        ORDER BY s.created_at DESC LIMIT 1) p ON true
    CROSS JOIN LATERAL (SELECT coalesce(p.txt, btrim(l.descricao)) texto, CASE WHEN p.txt IS NOT NULL THEN 'planilha' ELSE 'descricao' END origem) t
   WHERE l.cliente_id = p_cliente AND l.favorecido_id IS NULL AND l.cancelado IS NOT TRUE
     AND coalesce(l.tipo_operacao, '') NOT LIKE '3-%' AND l.financiamento_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_partes z WHERE z.financeiro_lancamento_id = l.id AND z.cancelada = false)
     AND public._fn_normalizar_texto(t.texto) IS NOT NULL
     -- FORN-01b: so' o cenario REALIZADO (Meta nao vai para o financeiro); lancamento GERADO PELO SISTEMA (origem_tipo) fica fora;
     -- a DESCRICAO so' vale como fornecedor escrito no que veio de extrato ou importacao
     AND l.cenario = 'realizado' AND l.origem_tipo IS NULL
     AND (t.origem = 'planilha'
          OR l.origem_lancamento IN ('importacao_incremental', 'extrato', 'ofx', 'excel', 'mesa_excel', 'mesa_split', 'migracao'))
$f$;

CREATE OR REPLACE FUNCTION public.fn_fornecedor_lista(
  p_cliente uuid, p_busca text DEFAULT NULL, p_situacao text DEFAULT 'ativos', p_ids uuid[] DEFAULT NULL,
  p_ordem text DEFAULT 'razao_social', p_desc boolean DEFAULT false, p_limite integer DEFAULT 100, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public SET plan_cache_mode = force_custom_plan AS $f$
DECLARE v jsonb; v_casam uuid[]; v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
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
    SELECT l.favorecido_id id, count(*) n,
           max(coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia))
             FILTER (WHERE coalesce(l.data_pagamento, l.data_vencimento, l.data_competencia) <= v_hoje) ult
      FROM financeiro_lancamentos_v2 l
     WHERE l.cliente_id = p_cliente AND l.cancelado IS NOT TRUE AND l.favorecido_id IS NOT NULL AND l.cenario = 'realizado'
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
