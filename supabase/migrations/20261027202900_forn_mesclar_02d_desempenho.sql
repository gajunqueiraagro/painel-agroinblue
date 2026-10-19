-- FORN-MESCLAR-02d (desempenho) — `fn_fornecedor_repetidos` abaixo de 500 ms no NJ, com a MESMA saida.
-- Medido no vivo depois da 20261027202800 (19/10/2026, 5 chamadas seguidas no NJ): 453–895 ms. Duas trocas, nenhuma de regra:
--   (1) `herda` so' percorre os absorvidos COM documento: `herdados` so' agrega o documento do proprio absorvido (h.id), entao o
--       absorvido sem documento nunca contribuiu (NJ: 792 absorvidos, 15 com documento);
--   (2) `doc` so' chama `_fn_fornecedor_chave_documento` quando ha' texto no CPF/CNPJ (a funcao tem SET search_path e nao e'
--       embutida pelo planejador; para vazio ela ja' devolvia nulo).
-- Prova (transacao revertida, 19/10): saida identica por md5 nos 7 clientes; NJ 195–261 ms contra 453–570 no mesmo momento.
-- Corpo integral; guarda de origem (e1036611…) e de destino (fdf5fd9b…); SECURITY DEFINER, search_path e ACL preservados.
SET LOCAL lock_timeout = '2s';
DO $g$ BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_fornecedor_repetidos(uuid)'::regprocedure) <> 'e1036611d3f7d02e587c0bd0e8b03c3e' THEN
    RAISE EXCEPTION 'fn_fornecedor_repetidos: corpo de origem inesperado';
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
  /* FORN-MESCLAR-02d — o aperto: (a) NUNCA se ligam por parecido dois nomes cujas palavras SIGNIFICATIVAS sao as mesmas (a diferenca e'
     so' sigla de UF, numero, codigo de ate' 2 letras ou sufixo de filial/unidade: Detran-MS x Detran-SP, NF 01 x NF 02, BG x 3M);
     (b) trigrama >= 0,75 (era 0,6) ou as palavras significativas de um contidas nas do outro com 2+ delas; (c) o NOME FANTASIA conta
     como nome igual (razao social de um = fantasia do outro, ou fantasias iguais); (d) grupo com UM par de mesmo nome (ou nome x
     fantasia) e' 'nome' — antes era preciso todos.
     FORN-MESCLAR-02c — um grupo e' um COMPONENTE ligado por documento (digitos), nome normalizado OU NOME PARECIDO: sem acento,
     caixa, "Pec.3M-" e sufixo societario, com trigrama >= 0,6 (e a primeira palavra parecida) ou um nome contido no outro com 2+
     palavras; so' se comparam nomes que dividem uma palavra rara (3+ letras, ate' 20 nomes do mesmo lado). Nunca cruza o "Pec.3M-"
     (rateio). NUNCA JUNTA DOCUMENTOS DIFERENTES: o documento de um cadastro inclui os dos cadastros mesclados nele; aresta entre
     documentos diferentes nao existe, e o componente que ainda assim junta dois documentos (por um cadastro sem documento no meio)
     e' repartido por documento — o sem documento fica com o documento dos vizinhos quando e' um so', senao sai.
     motivo: 'documento' (dois com o mesmo documento) > 'nome' (todos ligados por documento ou nome igual) > 'parecido'. */
  WITH RECURSIVE herda (id, dono) AS (
    SELECT x.id, x.fundido_em_id FROM public.financeiro_fornecedores x
     WHERE x.cliente_id = p_cliente AND x.fundido_em_id IS NOT NULL AND nullif(btrim(x.cpf_cnpj), '') IS NOT NULL
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
           CASE WHEN nullif(btrim(f.cpf_cnpj), '') IS NOT NULL THEN public._fn_fornecedor_chave_documento(f.cpf_cnpj) END doc,
           btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(f.nome_norm, ''),
             '\(\s*\d+\s*\)', ' ', 'g'), '[^a-z0-9]+', ' ', 'g'),
             '\m(s a|sa|ltda|me|epp|eireli|cia|companhia)\M', ' ', 'g'), '\s+', ' ', 'g')) chave_nome,
           CASE WHEN nullif(btrim(f.nome_fantasia), '') IS NOT NULL THEN
             btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(public._fn_normalizar_texto(f.nome_fantasia), ''),
               '\(\s*\d+\s*\)', ' ', 'g'), '[^a-z0-9]+', ' ', 'g'),
               '\m(s a|sa|ltda|me|epp|eireli|cia|companhia)\M', ' ', 'g'), '\s+', ' ', 'g')) END chave_fant
      FROM public.financeiro_fornecedores f
     WHERE f.cliente_id = p_cliente AND f.fundido_em_id IS NULL
  ), f AS MATERIALIZED (
    SELECT b.*, btrim(regexp_replace(b.chave_nome, '^pec 3m( |$)', '')) chave_par,
           /* as palavras SIGNIFICATIVAS: fora UF, numero/codigo com digito, ate' 2 letras e filial/unidade/matriz/loja/sede */
           /* (comparadas como CONJUNTO: @> e <@ nos dois sentidos) */
           regexp_split_to_array(btrim(regexp_replace(regexp_replace(regexp_replace(b.chave_nome, '^pec 3m( |$)', ''),
             '\m(\w{1,2}|\w*\d\w*|ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to|filial|unidade|matriz|loja|sede)\M', ' ', 'g'),
             '\s+', ' ', 'g')), ' ') sig,
           array_remove(ARRAY[b.doc], NULL) || coalesce(h.docs, '{}'::text[]) docs
      FROM base b LEFT JOIN herdados h ON h.id = b.id
  ), palavras AS MATERIALIZED (
    /* so' as palavras SIGNIFICATIVAS entram na comparacao (02d): nome que so' divide UF, numero ou sigla nem e' comparado */
    SELECT DISTINCT f.id, f.rateio, w FROM f, unnest(f.sig) w WHERE w <> ''
  ), raras AS (
    SELECT rateio, w FROM palavras GROUP BY rateio, w HAVING count(*) BETWEEN 2 AND 20
  ), candidatos AS MATERIALIZED (
    SELECT DISTINCT a.id a, b.id b FROM raras r JOIN palavras a ON a.rateio = r.rateio AND a.w = r.w
      JOIN palavras b ON b.rateio = r.rateio AND b.w = r.w AND a.id < b.id
  ), parecidos AS MATERIALIZED (
    SELECT c.a, c.b FROM candidatos c JOIN f x ON x.id = c.a JOIN f y ON y.id = c.b
     WHERE x.chave_par <> y.chave_par AND x.sig <> '{""}' AND y.sig <> '{""}' AND NOT (x.sig @> y.sig AND x.sig <@ y.sig)
       AND ((cardinality(x.sig) >= 2 AND x.sig <@ y.sig) OR (cardinality(y.sig) >= 2 AND y.sig <@ x.sig)
            OR (public.similarity(x.chave_par, y.chave_par) >= 0.75
                AND public.similarity(split_part(x.chave_par, ' ', 1), split_part(y.chave_par, ' ', 1)) >= 0.4))
  ), arestas0 AS (
    SELECT a.id a, b.id b, 1 forca FROM f a JOIN f b ON b.doc = a.doc AND b.rateio = a.rateio AND a.id <> b.id WHERE a.doc IS NOT NULL
    UNION ALL
    SELECT a.id, b.id, 2 FROM f a JOIN f b ON b.chave_nome = a.chave_nome AND b.rateio = a.rateio AND a.id <> b.id WHERE a.chave_nome <> ''
    UNION ALL
    /* o nome fantasia conta como nome: razao social de um = fantasia do outro, ou fantasias iguais (nos dois sentidos) */
    SELECT a.id, b.id, 2 FROM f a JOIN f b ON b.chave_fant = a.chave_nome AND b.rateio = a.rateio AND a.id <> b.id WHERE a.chave_nome <> ''
    UNION ALL
    SELECT b.id, a.id, 2 FROM f a JOIN f b ON b.chave_fant = a.chave_nome AND b.rateio = a.rateio AND a.id <> b.id WHERE a.chave_nome <> ''
    UNION ALL
    SELECT a.id, b.id, 2 FROM f a JOIN f b ON b.chave_fant = a.chave_fant AND b.rateio = a.rateio AND a.id <> b.id WHERE a.chave_fant <> ''
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
    SELECT DISTINCT m.grupo FROM arestas e JOIN membro m ON m.id = e.a JOIN membro m2 ON m2.id = e.b AND m2.grupo = m.grupo
     WHERE e.forca = 2
  ), grupos AS (
    SELECT m.grupo, count(*) qtd,
           count(DISTINCT x.doc) FILTER (WHERE x.doc IS NOT NULL) < count(x.doc) tem_doc,
           bool_or(fo.grupo IS NOT NULL) por_nome
      FROM membro m JOIN f x ON x.id = m.id LEFT JOIN forte fo ON fo.grupo = m.grupo
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

DO $g$ BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_fornecedor_repetidos(uuid)'::regprocedure) <> 'fdf5fd9b4ea8082cfbf8071a9aa96766' THEN
    RAISE EXCEPTION 'fn_fornecedor_repetidos: corpo de destino inesperado';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_fornecedor_repetidos(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_fornecedor_repetidos(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL inesperada';
  END IF;
END $g$;
