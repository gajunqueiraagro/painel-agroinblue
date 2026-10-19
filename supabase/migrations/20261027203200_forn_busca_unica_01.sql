-- FORN-BUSCA-UNICA-01 (Gabriel 19/10/2026) — a busca de fornecedor no banco: `fn_fornecedor_buscar`, ESPELHO DECLARADO da funcao da
-- tela `buscarFornecedores` (`src/lib/fornecedores/buscaDeFornecedor.ts`). Os dois lados sao presos pela MESMA lista de casos
-- (`buscaDeFornecedor.casos.json`): o vitest roda a funcao da tela, `supabase/tests/forn_busca_unica_01_test.sql` (gerado dela) roda
-- esta RPC. Quem mexer na regra de um lado muda o outro e o arquivo de casos.
--
-- A REGRA (a mesma da tela):
--   NORMALIZACAO = `_fn_normalizar_texto` (sem acento, minusculas, espacos juntados; a unica do banco) — na tela, `normalizarNome`.
--   DIGITOS DA BUSCA = `_fn_fornecedor_busca_digitos` (so digitos com ponto, barra, traco ou espaco; senao nulo) — `digitosDaBusca`.
--   DIGITOS DO DOCUMENTO = `_fn_fornecedor_busca_doc` (tudo que nao e' digito sai) — `digitosDoDocumento`.
--   CASA: o termo dentro da razao social (`nome_norm`), da fantasia ou de um apelido (`aliases_norm`: nomes e documentos dos
--     absorvidos, textos aprendidos); busca so de numero: os digitos dentro do documento ou de um apelido que e' documento. Vazio casa.
--   SITUACAO: 'ativos' (ativo e nao mesclado) · 'inativos' (inativo ou mesclado) · 'todos'.
--   ORDEM: ativo de verdade → comeca com o termo (razao social, fantasia ou documento) → mais uso (lancamentos vivos) → razao social
--     normalizada (COLLATE "C") → id.
-- Retorno: {total, itens: [a linha do cadastro + uso, ativo_de_verdade, dono_nome]} com `p_limite` (nulo = todos) e `p_offset`.
-- SECURITY DEFINER com `tenant_ok` (42501, sem usuario tambem); EXECUTE so' `authenticated` e `service_role`. So' leitura.
SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public._fn_fornecedor_busca_digitos(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $f$
  SELECT CASE WHEN s <> '' AND s ~ '^[0-9]+$' THEN s END
    FROM (SELECT regexp_replace(coalesce(p, ''), '[./[:space:]-]', '', 'g') s) x
$f$;
REVOKE ALL ON FUNCTION public._fn_fornecedor_busca_digitos(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._fn_fornecedor_busca_doc(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $f$
  SELECT regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g')
$f$;
REVOKE ALL ON FUNCTION public._fn_fornecedor_busca_doc(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_fornecedor_buscar(p_cliente uuid, p_busca text, p_situacao text DEFAULT 'ativos',
  p_limite integer DEFAULT 100, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public SET plan_cache_mode = force_custom_plan AS $f$
DECLARE
  v_q text := coalesce(public._fn_normalizar_texto(p_busca), '');
  v_d text := public._fn_fornecedor_busca_digitos(p_busca);
  v jsonb;
BEGIN
  IF NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF p_situacao NOT IN ('ativos', 'inativos', 'todos') THEN
    RAISE EXCEPTION 'situacao invalida: %', p_situacao USING ERRCODE = '22023';
  END IF;
  WITH uso AS (
    SELECT l.favorecido_id id, count(*) n FROM public.financeiro_lancamentos_v2 l
     WHERE l.cliente_id = p_cliente AND l.cancelado IS NOT TRUE AND l.favorecido_id IS NOT NULL GROUP BY l.favorecido_id
  ), p AS (
    SELECT f.*, coalesce(f.nome_norm, '') nn, coalesce(public._fn_normalizar_texto(f.nome_fantasia), '') fnn,
           public._fn_fornecedor_busca_doc(f.cpf_cnpj) dg, coalesce(f.aliases_norm, '{}'::text[]) al,
           (coalesce(f.ativo, true) AND f.fundido_em_id IS NULL) ativo_v, coalesce(u.n, 0) uso_n
      FROM public.financeiro_fornecedores f LEFT JOIN uso u ON u.id = f.id
     WHERE f.cliente_id = p_cliente
  ), c AS (
    SELECT p.*,
           (v_q <> '' AND (starts_with(p.nn, v_q) OR starts_with(p.fnn, v_q) OR (v_d IS NOT NULL AND starts_with(p.dg, v_d)))) comeca
      FROM p
     WHERE (p_situacao = 'todos' OR (p_situacao = 'ativos') = p.ativo_v)
       AND (v_q = ''
            OR strpos(p.nn, v_q) > 0 OR strpos(p.fnn, v_q) > 0
            OR EXISTS (SELECT 1 FROM unnest(p.al) a WHERE strpos(a, v_q) > 0)
            OR (v_d IS NOT NULL AND (strpos(p.dg, v_d) > 0
                OR EXISTS (SELECT 1 FROM unnest(p.al) a WHERE strpos(coalesce(public._fn_fornecedor_busca_digitos(a), ''), v_d) > 0))))
  ), o AS (
    SELECT c.*, row_number() OVER (ORDER BY c.ativo_v DESC, c.comeca DESC, c.uso_n DESC, c.nn COLLATE "C", c.id::text COLLATE "C") ord,
           count(*) OVER () total
      FROM c
  )
  SELECT jsonb_build_object(
           'total', coalesce(max(o.total), 0),
           'itens', coalesce(jsonb_agg(
             (to_jsonb(f) - 'aliases') || jsonb_build_object('uso', o.uso_n, 'ativo_de_verdade', o.ativo_v, 'dono_nome', d.nome)
             ORDER BY o.ord) FILTER (WHERE o.ord > coalesce(p_offset, 0)
                                       AND (p_limite IS NULL OR o.ord <= coalesce(p_offset, 0) + p_limite)), '[]'::jsonb))
    INTO v
    FROM o JOIN public.financeiro_fornecedores f ON f.id = o.id
    LEFT JOIN public.financeiro_fornecedores d ON d.id = o.fundido_em_id;
  RETURN v;
END $f$;
REVOKE ALL ON FUNCTION public.fn_fornecedor_buscar(uuid, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fornecedor_buscar(uuid, text, text, integer, integer) TO authenticated, service_role;
