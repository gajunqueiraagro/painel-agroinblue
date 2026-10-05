-- FIN-NFE-XML-01b1 — banco do "Importar XML" (05/10/2026). So' banco; a tela e' o 01b2.
--
-- POR QUE
--   O PR seguinte poe "Importar XML" no formulario do documento NF e ANEXA o proprio XML como arquivo do documento.
--   Faltavam duas coisas:
--   (1) os buckets `fin-documentos` e `oc-documentos` so' aceitam application/pdf, image/jpeg e image/png;
--   (2) nao existe quem responda "esta chave de acesso ja' esta' registrada neste cliente?". Decisao do Gabriel: nota ja'
--       registrada AVISA, mostra onde esta' e deixa seguir — nao bloqueia.
--
-- ESTADO ANTERIOR (medido em 05/10/2026)
--   storage.buckets  fin-documentos  allowed_mime_types = {application/pdf,image/jpeg,image/png}  file_size_limit = 10485760
--   storage.buckets  oc-documentos   allowed_mime_types = {application/pdf,image/jpeg,image/png}  file_size_limit = 10485760
--   fn_documento_chave_ja_registrada  nao existia
--   78 documentos ativos com chave; 34 gravados com espaco, pontuacao ou prefixo (44 digitos por baixo); 7 chaves repetidas,
--   todas legitimas (6 = a mesma nota no lancamento e na OC do mesmo negocio; 1 = uma nota de compra em duas OCs); dois
--   documentos ativos presos em lancamento CANCELADO (0826a4ee e a97bed09).
--
-- O QUE MUDA
--   A. Os dois buckets passam a aceitar tambem `text/xml` e `application/xml`. Os tres tipos de antes e o limite ficam.
--      Idempotente: so' acrescenta o que falta.
--   B. `fn_documento_chave_ja_registrada(p_cliente, p_chave, p_ignorar_documento)` — o DONO UNICO da pergunta. So' leitura.
--      · compara SO' DIGITOS (`regexp_replace(chave, '\D', '', 'g')`) nas DUAS tabelas; chave que nao da' 44 digitos devolve
--        vazio (nao e' erro);
--      · NAO CONTA: documento cancelado; documento de lancamento cancelado; documento de OC cancelada (a OC excluida
--        definitivamente nao tem mais linha, nem documento); o proprio `p_ignorar_documento`;
--      · ⚠ DOCUMENTO LIGADO A VARIAS PARCELAS (`financeiro_documento_vinculos`): conta enquanto o lancamento DONO ou ALGUMA
--        parcela ligada estiver viva — a NF de uma compra parcelada nao some porque a parcela 1 foi cancelada;
--      · devolve uma linha por ocorrencia, com o que a tela precisa para dizer ONDE esta' e abrir.
--   SEGURANCA: SECURITY DEFINER com `tenant_ok(p_cliente)` e recusa 42501 — a regra vigente para leitura DEFINER
--   (SEG-TENANT-VARREDURA-01B: "leitura tambem recusa com 42501, nunca devolve vazio"). As funcoes de documento mais antigas
--   (`fin_documento_confronto` etc.) usam `is_admin_agroinblue OR get_user_cliente_ids`, que e' o mesmo teste por outro nome;
--   `tenant_ok` e' o dono atual. Funcao nova nasce FECHADA (01C): o GRANT a `authenticated` vai aqui.
--
-- NAO MUDA: nenhuma tabela, nenhum indice, nenhuma coluna, nenhum dado de documento.

-- ── A. buckets ────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $buckets$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM storage.buckets WHERE id IN ('fin-documentos', 'oc-documentos');
  IF v_n <> 2 THEN RAISE EXCEPTION 'FIN-NFE-XML-01b1: esperava os 2 buckets de documento, achei %', v_n; END IF;

  UPDATE storage.buckets b
     SET allowed_mime_types = (
           SELECT array_agg(m ORDER BY ord)
             FROM (SELECT m, min(ord) AS ord
                     FROM unnest(COALESCE(b.allowed_mime_types, ARRAY[]::text[]) || ARRAY['text/xml', 'application/xml'])
                          WITH ORDINALITY AS t(m, ord)
                    GROUP BY m) x)
   WHERE b.id IN ('fin-documentos', 'oc-documentos')
     AND NOT (COALESCE(b.allowed_mime_types, ARRAY[]::text[]) @> ARRAY['text/xml', 'application/xml']);

  SELECT count(*) INTO v_n FROM storage.buckets
   WHERE id IN ('fin-documentos', 'oc-documentos')
     AND allowed_mime_types @> ARRAY['application/pdf', 'image/jpeg', 'image/png', 'text/xml', 'application/xml']
     AND file_size_limit = 10485760;
  IF v_n <> 2 THEN RAISE EXCEPTION 'FIN-NFE-XML-01b1: buckets fora do esperado depois do UPDATE (% de 2)', v_n; END IF;
END
$buckets$;

-- ── B. o dono de "nota ja' registrada" ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_documento_chave_ja_registrada(
  p_cliente uuid,
  p_chave text,
  p_ignorar_documento uuid DEFAULT NULL
)
RETURNS TABLE (
  origem text,
  documento_id uuid,
  lancamento_id uuid,
  operacao_id uuid,
  operacao_tipo text,
  numero text,
  serie text,
  descricao text,
  data date,
  valor numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_chave text := regexp_replace(COALESCE(p_chave, ''), '\D', '', 'g');
BEGIN
  IF p_cliente IS NULL OR NOT COALESCE(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501';
  END IF;
  IF length(v_chave) <> 44 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 'lancamento'::text,
         d.id,
         d.lancamento_id,
         NULL::uuid,
         NULL::text,
         d.numero,
         d.serie,
         l.descricao::text,
         COALESCE(d.data_emissao, l.data_competencia),
         d.valor_documento
    FROM public.financeiro_lancamento_documentos d
    JOIN public.financeiro_lancamentos_v2 l ON l.id = d.lancamento_id
   WHERE d.cliente_id = p_cliente
     AND d.cancelado IS NOT TRUE
     AND d.chave_acesso IS NOT NULL
     AND regexp_replace(d.chave_acesso, '\D', '', 'g') = v_chave
     AND (p_ignorar_documento IS NULL OR d.id <> p_ignorar_documento)
     AND (l.cancelado IS NOT TRUE
          OR EXISTS (SELECT 1
                       FROM public.financeiro_documento_vinculos v
                       JOIN public.financeiro_lancamentos_v2 lv ON lv.id = v.lancamento_id
                      WHERE v.documento_id = d.id AND lv.cancelado IS NOT TRUE))
  UNION ALL
  SELECT 'oc'::text,
         d.id,
         NULL::uuid,
         d.operacao_id,
         o.tipo_operacao::text,
         d.numero,
         d.serie,
         (initcap(o.tipo_operacao::text) || ' de ' || to_char(o.data_operacao, 'DD/MM/YYYY'))::text,
         COALESCE(d.data_emissao, o.data_operacao),
         (SELECT sum(c.valor)
            FROM public.zoo_operacao_documento_componentes c
           WHERE c.documento_id = d.id AND c.cancelado IS NOT TRUE AND c.tipo = 'valor_bruto')
    FROM public.zoo_operacao_documentos d
    JOIN public.zoo_operacoes_comerciais o ON o.id = d.operacao_id
   WHERE d.cliente_id = p_cliente
     AND d.cancelado IS NOT TRUE
     AND d.chave_acesso IS NOT NULL
     AND regexp_replace(d.chave_acesso, '\D', '', 'g') = v_chave
     AND (p_ignorar_documento IS NULL OR d.id <> p_ignorar_documento)
     AND o.status_comercial IS DISTINCT FROM 'cancelada'
   ORDER BY 1, 9, 2;
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_documento_chave_ja_registrada(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_documento_chave_ja_registrada(uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_documento_chave_ja_registrada(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_documento_chave_ja_registrada(uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.fn_documento_chave_ja_registrada(uuid, text, uuid) IS
  'FIN-NFE-XML-01b1: o dono de "esta chave de acesso ja esta registrada neste cliente?". Compara so digitos nas duas tabelas de documento; ignora cancelados. So leitura; tenant_ok + 42501.';

-- ── conferencia ───────────────────────────────────────────────────────────────────────────────────────────────────────
DO $confere$
DECLARE
  f regprocedure := 'public.fn_documento_chave_ja_registrada(uuid, text, uuid)'::regprocedure;
BEGIN
  IF has_function_privilege('anon', f, 'EXECUTE') THEN RAISE EXCEPTION 'FIN-NFE-XML-01b1: anon executa a funcao'; END IF;
  IF NOT has_function_privilege('authenticated', f, 'EXECUTE') THEN RAISE EXCEPTION 'FIN-NFE-XML-01b1: authenticated nao executa a funcao'; END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = f) THEN RAISE EXCEPTION 'FIN-NFE-XML-01b1: a funcao nao e SECURITY DEFINER'; END IF;
END
$confere$;
