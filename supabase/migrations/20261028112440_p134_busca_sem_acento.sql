-- P134 (Gabriel 27/10/2026) — TODA BUSCA DO SISTEMA IGNORA ACENTO, CEDILHA E MAIUSCULA, nos dois lados ("maq" acha "Maquinas" com
-- acento; "manutencao" = "Manutencao" com til e cedilha). O texto gravado continua com acento: so' a COMPARACAO e' normalizada.
-- P136 vai junto: o filtro Produto da lista tambem olha os itens da nota do lancamento.
--
-- A REGRA JA' EXISTIA e e' promovida (ENCAIXE aprovado): no banco `_fn_normalizar_texto`, na tela `normalizarParaBusca`
-- (`src/lib/texto/busca.ts`), presas por UM arquivo de casos (`src/lib/texto/busca.casos.json`), lido pelo vitest e pelo teste SQL
-- gerado (`supabase/tests/p134_busca_sem_acento_test.sql`, `node scripts/gerar-teste-busca-sem-acento.mjs`).
--
-- (1) `_fn_normalizar_texto` FICA STABLE (decisao do Gabriel 27/10, no lugar do IMMUTABLE pedido antes), sem `SET search_path` e com
--     todos os nomes qualificados (`pg_catalog.*`, `public.unaccent('public.unaccent', …)`). MEDIDO: `unaccent` e' STABLE, entao uma
--     funcao IMMUTABLE que a chama nunca e' aberta na consulta (vira uma chamada por linha): a lista do NJ com Produto foi de ~80 ms
--     para 0,8–2,5 s. STABLE, sem SET e qualificada, ela e' aberta e o tempo volta ao de hoje (73–141 ms). Indice nao serve a busca
--     "contem" e nao foi preciso.
--     PROVA DE MESMO RESULTADO (antes de aplicar): a funcao de hoje x este corpo sobre os 47.484 textos distintos que ela normaliza
--     (fornecedores: nome, fantasia, cidade, apelidos e aliases_norm; lancamentos: descricao, historico, numero_documento; extrato;
--     itens da nota; plano; fazendas) — diferenca ZERO. Auto-teste: uma versao sem unaccent achou 1.319 diferencas.
-- (2) `fn_texto_casa(texto, termo)`: o termo normalizado esta' DENTRO do texto normalizado (termo vazio casa com tudo) — o espelho de
--     `casaNaBusca`. STABLE e aberta, como a (1).
--     As duas sao funcoes de texto puras: EXECUTE para `authenticated` (a RPC do Produto e os campos calculados da view rodam como
--     quem esta' logado); fechadas para PUBLIC/anon.
-- (3) `fn_fin_v2_lista_pagina`: Produto = a mesma normalizacao, com o termo normalizado UMA vez e os lancamentos cujos itens da nota
--     casam lidos UMA vez por chamada (documento vivo -> nota -> itens, o caminho do `lerItensGuardados`); Documento = a mesma
--     normalizacao no lugar do `lower(unaccent(...))` escrito na linha.
-- (4) `fn_financiamento_candidatas` ("buscar no contrato"): `fn_texto_casa` no lugar dos dois `ilike` (o `%`/`_` digitado deixa de ser
--     curinga).
-- (5) `fn_lancamento_descricoes_buscar`: as sugestoes do campo Produto do lancamento (`ProdutoAutocomplete`), que liam a tabela com
--     `.ilike` direto. SECURITY INVOKER: a RLS por tenant filtra.
-- (6) Campos calculados da `vw_financeiro_lancamentos_v2_doc` (`busca_descricao`, `busca_numero_documento`, `busca_documento_formatado`):
--     o caminho da view (a secao "sem caixa" e o conjunto da exportacao/cancelamento) filtra por eles com o termo ja' normalizado na tela.

-- (1)
CREATE OR REPLACE FUNCTION public._fn_normalizar_texto(p_texto text)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  SELECT NULLIF(pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(public.unaccent('public.unaccent'::regdictionary, COALESCE(p_texto, ''))), '\s+', ' ', 'g')), '')
$function$;
REVOKE ALL ON FUNCTION public._fn_normalizar_texto(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._fn_normalizar_texto(text) TO authenticated;

-- (2)
CREATE OR REPLACE FUNCTION public.fn_texto_casa(p_texto text, p_termo text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT pg_catalog.strpos(COALESCE(public._fn_normalizar_texto(p_texto), ''), COALESCE(public._fn_normalizar_texto(p_termo), '')) > 0
$function$;
REVOKE ALL ON FUNCTION public.fn_texto_casa(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_texto_casa(text, text) TO authenticated;

-- (3) e (4): patch do corpo vivo guardado pelo md5, por TEXTO literal (cada trecho com a contagem exata).
CREATE OR REPLACE FUNCTION pg_temp._troca_texto(p_fn regprocedure, p_md5 text, p_pares text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE d text := pg_get_functiondef(p_fn); i int; n int;
BEGIN
  IF md5(d) <> p_md5 THEN RAISE EXCEPTION '% mudou (md5 %, esperado %)', p_fn, md5(d), p_md5; END IF;
  FOR i IN 1..array_length(p_pares, 1) / 3 LOOP
    n := (length(d) - length(replace(d, p_pares[3*i-2], ''))) / length(p_pares[3*i-2]);
    IF n <> p_pares[3*i]::int THEN RAISE EXCEPTION '% trecho %: % ocorrencias, esperado %', p_fn, i, n, p_pares[3*i]; END IF;
    d := replace(d, p_pares[3*i-2], p_pares[3*i-1]);
  END LOOP;
  EXECUTE d;
END $$;

SELECT pg_temp._troca_texto('public.fn_fin_v2_lista_pagina(uuid,jsonb,jsonb,integer,integer)', '4e020323edd6685302bda917ed87f1e3', ARRAY[
  $p$  v_prod text; v_forn uuid; v_modo text;$p$,
  $r$  v_prod text; v_forn uuid; v_modo text;
  v_prod_n text; v_prod_itens uuid[];$r$, '1',
  $p$  v_prod   := case when btrim(coalesce(f->>'produto', '')) <> '' then f->>'produto' end;$p$,
  $r$  v_prod   := case when btrim(coalesce(f->>'produto', '')) <> '' then f->>'produto' end;
  -- P134/P136: o termo sem acento UMA vez, e os lancamentos cujos itens da nota casam UMA vez (documento vivo -> nota -> itens)
  v_prod_n := coalesce(public._fn_normalizar_texto(v_prod), '');
  if v_prod is not null then
    select coalesce(array_agg(distinct pd.lancamento_id), '{}') into v_prod_itens
      from public.nota_fiscal_itens pi
      join public.nota_fiscal pn on pn.id = pi.nota_id
      join public.financeiro_lancamento_documentos pd on pd.cliente_id = pn.cliente_id and pd.chave_acesso = pn.chave_acesso
     where pi.cliente_id = p_cliente and pd.cancelado is not true and pd.lancamento_id is not null
       and strpos(coalesce(public._fn_normalizar_texto(pi.descricao), ''), v_prod_n) > 0;
  end if;$r$, '1',
  $p$       and (v_prod is null or strpos(lower(coalesce(l.descricao, '')), lower(v_prod)) > 0)
$p$,
  $r$       and (v_prod is null or strpos(coalesce(public._fn_normalizar_texto(l.descricao), ''), v_prod_n) > 0 or l.id = any (v_prod_itens))
$r$, '1',
  $p$regexp_replace(lower(public.unaccent(v_doc)), $p$,
  $r$regexp_replace(coalesce(public._fn_normalizar_texto(v_doc), ''), $r$, '1']);

SELECT pg_temp._troca_texto('public.fn_financiamento_candidatas(uuid,text,uuid,jsonb)', '6bcbbc230ae474d29b30416efa8254a8', ARRAY[
  $p$(v_busca is not null and (l.descricao ilike '%' || v_busca || '%' or fo.nome ilike '%' || v_busca || '%'$p$,
  $r$(v_busca is not null and (public.fn_texto_casa(l.descricao, v_busca) or public.fn_texto_casa(fo.nome, v_busca)$r$, '2']);

-- (5)
CREATE OR REPLACE FUNCTION public.fn_lancamento_descricoes_buscar(p_cliente uuid, p_busca text, p_limite integer DEFAULT 30)
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT d FROM (
    SELECT DISTINCT l.descricao AS d
      FROM public.financeiro_lancamentos_v2 l
     WHERE l.cliente_id = p_cliente AND l.descricao IS NOT NULL AND public.fn_texto_casa(l.descricao, p_busca)
  ) x
  ORDER BY d
  LIMIT least(greatest(coalesce(p_limite, 30), 1), 100)
$function$;
REVOKE ALL ON FUNCTION public.fn_lancamento_descricoes_buscar(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lancamento_descricoes_buscar(uuid, text, integer) TO authenticated;

-- (6)
CREATE OR REPLACE FUNCTION public.busca_descricao(r public.vw_financeiro_lancamentos_v2_doc)
 RETURNS text LANGUAGE sql STABLE
AS $function$ SELECT COALESCE(public._fn_normalizar_texto(r.descricao), '') $function$;
CREATE OR REPLACE FUNCTION public.busca_numero_documento(r public.vw_financeiro_lancamentos_v2_doc)
 RETURNS text LANGUAGE sql STABLE
AS $function$ SELECT COALESCE(public._fn_normalizar_texto(r.numero_documento), '') $function$;
CREATE OR REPLACE FUNCTION public.busca_documento_formatado(r public.vw_financeiro_lancamentos_v2_doc)
 RETURNS text LANGUAGE sql STABLE
AS $function$ SELECT COALESCE(public._fn_normalizar_texto(r.documento_formatado), '') $function$;
REVOKE ALL ON FUNCTION public.busca_descricao(public.vw_financeiro_lancamentos_v2_doc) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.busca_numero_documento(public.vw_financeiro_lancamentos_v2_doc) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.busca_documento_formatado(public.vw_financeiro_lancamentos_v2_doc) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.busca_descricao(public.vw_financeiro_lancamentos_v2_doc) TO authenticated;
GRANT EXECUTE ON FUNCTION public.busca_numero_documento(public.vw_financeiro_lancamentos_v2_doc) TO authenticated;
GRANT EXECUTE ON FUNCTION public.busca_documento_formatado(public.vw_financeiro_lancamentos_v2_doc) TO authenticated;
