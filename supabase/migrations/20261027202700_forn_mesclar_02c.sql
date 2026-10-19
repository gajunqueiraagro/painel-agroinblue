-- FORN-MESCLAR-02c (Gabriel, 19/10/2026) — sugestoes de mesclagem por NOME PARECIDO, e documentos diferentes nunca se mesclam.
--   1. fn_fornecedor_repetidos: alem de documento e nome normalizado, liga cadastros de nome PARECIDO (sem acento, caixa,
--      "Pec.3M-" e sufixo societario; trigrama >= 0,6 com a primeira palavra parecida, ou um nome contido no outro com 2+
--      palavras), so' do mesmo lado do "Pec.3M-" (rateio). Motivo 'parecido', listado depois de 'documento' e 'nome'. NUNCA JUNTA
--      DOCUMENTOS DIFERENTES (o documento do cadastro inclui o dos mesclados nele); componente que junta dois documentos por um
--      cadastro sem documento no meio e' repartido por documento. Os fornecedores do grupo ganham `nome_fantasia`.
--   2. _fn_fornecedor_mesclar_recusa(uuid, uuid[]): o "cnpj_diferente" passa a ver os documentos dos cadastros MESCLADOS em cada
--      participante; frase "CNPJs diferentes — são empresas diferentes: …".
-- Corpo integral, guardado por md5 de origem e de destino; SECURITY, search_path e ACL preservados (CREATE OR REPLACE).
SET LOCAL lock_timeout = '2s';

DO $g$ BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_fornecedor_repetidos(uuid)'::regprocedure) <> '6417588b6df870a665b3c6abcc4cb923' THEN
    RAISE EXCEPTION 'fn_fornecedor_repetidos: corpo de origem inesperado';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_fornecedor_mesclar_recusa(uuid, uuid[])'::regprocedure) <> '8e1067640a9ef8a58b78cf50984225f7' THEN
    RAISE EXCEPTION '_fn_fornecedor_mesclar_recusa: corpo de origem inesperado';
  END IF;
END $g$;

CREATE OR REPLACE FUNCTION public.fn_fornecedor_repetidos(p_cliente uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v jsonb;
BEGIN
  IF NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  /* FORN-MESCLAR-02c — um grupo e' um COMPONENTE ligado por documento (digitos), nome normalizado OU NOME PARECIDO: sem acento,
     caixa, "Pec.3M-" e sufixo societario, com trigrama >= 0,6 (e a primeira palavra parecida) ou um nome contido no outro com 2+
     palavras; so' se comparam nomes que dividem uma palavra rara (3+ letras, ate' 20 nomes do mesmo lado). Nunca cruza o "Pec.3M-"
     (rateio). NUNCA JUNTA DOCUMENTOS DIFERENTES: o documento de um cadastro inclui os dos cadastros mesclados nele; aresta entre
     documentos diferentes nao existe, e o componente que ainda assim junta dois documentos (por um cadastro sem documento no meio)
     e' repartido por documento — o sem documento fica com o documento dos vizinhos quando e' um so', senao sai.
     motivo: 'documento' (dois com o mesmo documento) > 'nome' (todos ligados por documento ou nome igual) > 'parecido'. */
  WITH RECURSIVE herda (id, dono) AS (
    SELECT x.id, x.fundido_em_id FROM public.financeiro_fornecedores x
     WHERE x.cliente_id = p_cliente AND x.fundido_em_id IS NOT NULL
    UNION
    SELECT h.id, y.fundido_em_id FROM herda h JOIN public.financeiro_fornecedores y ON y.id = h.dono WHERE y.fundido_em_id IS NOT NULL
  ), herdados AS MATERIALIZED (
    SELECT h.dono id, array_agg(DISTINCT public._fn_fornecedor_chave_documento(x.cpf_cnpj)) docs
      FROM herda h JOIN public.financeiro_fornecedores x ON x.id = h.id
     WHERE public._fn_fornecedor_chave_documento(x.cpf_cnpj) IS NOT NULL
     GROUP BY h.dono
  ), base AS MATERIALIZED (
    SELECT f.id, f.nome, f.nome_fantasia, f.cpf_cnpj, coalesce(f.ativo, true) ativo, f.created_at,
           (f.nome ~* '^\s*pec\.3m-') rateio,
           public._fn_fornecedor_chave_documento(f.cpf_cnpj) doc,
           btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(f.nome_norm, ''),
             '\(\s*\d+\s*\)', ' ', 'g'), '[^a-z0-9]+', ' ', 'g'),
             '\m(s a|sa|ltda|me|epp|eireli|cia|companhia)\M', ' ', 'g'), '\s+', ' ', 'g')) chave_nome
      FROM public.financeiro_fornecedores f
     WHERE f.cliente_id = p_cliente AND f.fundido_em_id IS NULL
  ), f AS MATERIALIZED (
    SELECT b.*, btrim(regexp_replace(b.chave_nome, '^pec 3m( |$)', '')) chave_par,
           ARRAY(SELECT DISTINCT d FROM unnest(array_remove(ARRAY[b.doc], NULL) || coalesce(h.docs, '{}'::text[])) d ORDER BY d) docs
      FROM base b LEFT JOIN herdados h ON h.id = b.id
  ), palavras AS MATERIALIZED (
    SELECT DISTINCT f.id, f.rateio, w FROM f, unnest(string_to_array(f.chave_par, ' ')) w WHERE length(w) >= 3
  ), raras AS (
    SELECT rateio, w FROM palavras GROUP BY rateio, w HAVING count(*) BETWEEN 2 AND 20
  ), candidatos AS MATERIALIZED (
    SELECT DISTINCT a.id a, b.id b FROM raras r JOIN palavras a ON a.rateio = r.rateio AND a.w = r.w
      JOIN palavras b ON b.rateio = r.rateio AND b.w = r.w AND a.id < b.id
  ), parecidos AS MATERIALIZED (
    SELECT c.a, c.b FROM candidatos c JOIN f x ON x.id = c.a JOIN f y ON y.id = c.b
     WHERE x.chave_par <> y.chave_par AND x.chave_par <> '' AND y.chave_par <> ''
       AND ((length(x.chave_par) <= length(y.chave_par) AND x.chave_par LIKE '% %' AND ' ' || y.chave_par || ' ' LIKE '% ' || x.chave_par || ' %')
            OR (length(y.chave_par) < length(x.chave_par) AND y.chave_par LIKE '% %' AND ' ' || x.chave_par || ' ' LIKE '% ' || y.chave_par || ' %')
            OR (public.similarity(x.chave_par, y.chave_par) >= 0.6
                AND public.similarity(split_part(x.chave_par, ' ', 1), split_part(y.chave_par, ' ', 1)) >= 0.4))
  ), arestas0 AS (
    SELECT a.id a, b.id b, 1 forca FROM f a JOIN f b ON b.doc = a.doc AND b.rateio = a.rateio AND a.id <> b.id WHERE a.doc IS NOT NULL
    UNION ALL
    SELECT a.id, b.id, 2 FROM f a JOIN f b ON b.chave_nome = a.chave_nome AND b.rateio = a.rateio AND a.id <> b.id WHERE a.chave_nome <> ''
    UNION ALL
    SELECT a, b, 3 FROM parecidos UNION ALL SELECT b, a, 3 FROM parecidos
  ), arestas AS MATERIALIZED (
    SELECT e.a, e.b, min(e.forca) forca FROM arestas0 e JOIN f x ON x.id = e.a JOIN f y ON y.id = e.b
     WHERE cardinality(x.docs) = 0 OR cardinality(y.docs) = 0 OR x.docs && y.docs
     GROUP BY e.a, e.b
  ), alcance (a, b) AS (
    SELECT a, b FROM arestas
    UNION
    SELECT r.a, e.b FROM alcance r JOIN arestas e ON e.a = r.b WHERE e.b <> r.a
  ), comp AS MATERIALIZED (
    SELECT n.id, least(n.id::text, coalesce(min(r.b::text), n.id::text)) grupo
      FROM (SELECT DISTINCT a id FROM arestas) n LEFT JOIN alcance r ON r.a = n.id GROUP BY n.id
  ), conflito AS MATERIALIZED (
    SELECT c.grupo FROM comp c JOIN f x ON x.id = c.id CROSS JOIN LATERAL unnest(x.docs) d GROUP BY c.grupo HAVING count(DISTINCT d) > 1
  ), doc_vizinho AS (
    SELECT e.a id, min(y.docs[1]) doc, count(DISTINCT y.docs[1]) n FROM arestas e JOIN f y ON y.id = e.b
     WHERE cardinality(y.docs) > 0 GROUP BY e.a
  ), membro AS MATERIALIZED (
    SELECT c.id, CASE
             WHEN k.grupo IS NULL THEN c.grupo
             WHEN cardinality(x.docs) > 0 THEN c.grupo || ':' || x.docs[1]
             WHEN dv.n = 1 THEN c.grupo || ':' || dv.doc
           END grupo
      FROM comp c JOIN f x ON x.id = c.id LEFT JOIN conflito k ON k.grupo = c.grupo LEFT JOIN doc_vizinho dv ON dv.id = c.id
  ), forte AS (
    SELECT DISTINCT e.a id, m.grupo FROM arestas e JOIN membro m ON m.id = e.a JOIN membro m2 ON m2.id = e.b AND m2.grupo = m.grupo
     WHERE e.forca < 3
  ), grupos AS (
    SELECT m.grupo, count(*) qtd,
           count(DISTINCT x.doc) FILTER (WHERE x.doc IS NOT NULL) < count(x.doc) tem_doc,
           count(*) = count(fo.id) por_nome
      FROM membro m JOIN f x ON x.id = m.id LEFT JOIN forte fo ON fo.id = m.id AND fo.grupo = m.grupo
     WHERE m.grupo IS NOT NULL GROUP BY m.grupo HAVING count(*) > 1
  ), lista AS (
    SELECT m.grupo,
           jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'nome_fantasia', x.nome_fantasia, 'cpf_cnpj', x.cpf_cnpj, 'ativo', x.ativo)
                     ORDER BY (x.doc IS NULL), x.ativo DESC, x.created_at, x.id) fornecedores,
           min(x.nome) primeiro
      FROM membro m JOIN f x ON x.id = m.id WHERE m.grupo IS NOT NULL GROUP BY m.grupo
  ), rotulo AS (
    SELECT g.grupo, g.qtd, l.fornecedores, l.primeiro,
           CASE WHEN g.tem_doc THEN 'documento' WHEN g.por_nome THEN 'nome' ELSE 'parecido' END motivo,
           CASE WHEN g.tem_doc THEN 1 WHEN g.por_nome THEN 2 ELSE 3 END ordem
      FROM grupos g JOIN lista l ON l.grupo = g.grupo
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('motivo', r.motivo, 'chave', r.grupo, 'qtd', r.qtd, 'fornecedores', r.fornecedores)
                            ORDER BY r.ordem, r.primeiro), '[]'::jsonb)
    INTO v FROM rotulo r;
  RETURN v;
END $f$;

CREATE OR REPLACE FUNCTION public._fn_fornecedor_mesclar_recusa(p_manter uuid, p_absorver uuid[])
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public AS $r$
DECLARE
  v_m record; v_a record; v_docs text[]; v_n int;
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
  -- FORN-MESCLAR-RATEIO-01: "Pec.3M-" marca o pagamento por RATEIO (NF em nome do Higino); so' se mescla com o MESMO lado.
  -- Espelho declarado de `ehRateio` (src/lib/fornecedores/fornecedorTexto.ts) e do criterio de `fn_fornecedor_repetidos`.
  FOR v_a IN SELECT f.nome FROM public.financeiro_fornecedores f
              WHERE f.id = ANY (p_absorver) AND (f.nome ~* '^\s*pec\.3m-') IS DISTINCT FROM (coalesce(v_m.nome, '') ~* '^\s*pec\.3m-')
              ORDER BY f.nome LIMIT 1 LOOP
    RETURN jsonb_build_object('motivo', 'rateio_misto',
      'frase', format('"%s" e "%s" não se mesclam: "Pec.3M-" marca o pagamento por rateio (nota fiscal em nome do Higino) e o cadastro com o prefixo é diferente do sem prefixo de propósito.', v_m.nome, v_a.nome));
  END LOOP;
  -- FORN-MESCLAR-02c: o documento de um cadastro inclui o dos cadastros MESCLADOS nele (a empresa absorvida segue sendo dele).
  -- Antes so' o `cpf_cnpj` atual contava: um cadastro sem CNPJ que absorveu a empresa A passava como "sem documento" e se mesclava
  -- na empresa B. Documentos diferentes = empresas diferentes, nunca se mesclam.
  WITH RECURSIVE herda (id, dono) AS (
    SELECT x.id, x.fundido_em_id FROM public.financeiro_fornecedores x WHERE x.fundido_em_id = ANY (p_absorver || p_manter)
    UNION
    SELECT y.id, h.dono FROM herda h JOIN public.financeiro_fornecedores y ON y.fundido_em_id = h.id
  ), docs AS (
    SELECT f.cpf_cnpj, f.nome, NULL::text herdado_em FROM public.financeiro_fornecedores f WHERE f.id = ANY (p_absorver || p_manter)
    UNION ALL
    SELECT x.cpf_cnpj, x.nome, d.nome FROM herda h JOIN public.financeiro_fornecedores x ON x.id = h.id
      JOIN public.financeiro_fornecedores d ON d.id = h.dono
  )
  SELECT count(DISTINCT public._fn_fornecedor_chave_documento(cpf_cnpj)),
         array_agg(DISTINCT CASE WHEN herdado_em IS NULL THEN format('%s (%s)', cpf_cnpj, nome)
                                 ELSE format('%s (%s, mesclado em %s)', cpf_cnpj, nome, herdado_em) END)
    INTO v_n, v_docs
    FROM docs WHERE public._fn_fornecedor_chave_documento(cpf_cnpj) IS NOT NULL;
  IF v_n > 1 THEN
    RETURN jsonb_build_object('motivo', 'cnpj_diferente',
      'frase', 'CNPJs diferentes — são empresas diferentes: ' || array_to_string(v_docs, ' e ') || '.');
  END IF;
  RETURN NULL;
END $r$;

DO $g$ BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_fornecedor_repetidos(uuid)'::regprocedure) <> 'bbc615ae579ad8f1ba0c41b02936754a' THEN
    RAISE EXCEPTION 'fn_fornecedor_repetidos: corpo de destino inesperado';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public._fn_fornecedor_mesclar_recusa(uuid, uuid[])'::regprocedure) <> 'e2e75bf3f9121d533784c4d83c26f5fc' THEN
    RAISE EXCEPTION '_fn_fornecedor_mesclar_recusa: corpo de destino inesperado';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_fornecedor_repetidos(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_fornecedor_repetidos(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_fornecedor_mesclar_recusa(uuid, uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL inesperada';
  END IF;
END $g$;
