-- OC-DOC-ESPECIE-ABATE-01 passo 1 (Gabriel, 14/10/2026) — AS ESPECIES DO ABATE, OS CAMPOS QUE A CONFERENCIA COMPARA, E SO' A NF SOMA.
--   O abate tem quatro documentos de verdade: a NF de entrada do frigorifico, a NPR (Nota Promissoria Rural), o Acerto (resumo
--   de abate do frigorifico) e o Romaneio. So' a NF e' o valor da operacao; NPR, Acerto e Romaneio CONFEREM (passo 3).
-- O QUE ENTRA:
--   1. especies `npr`, `acerto`, `romaneio` (troca do CHECK); `oc_documento_registrar` as aceita SO' no abate (patch guardado por md5).
--   2. colunas nulas `cab`, `peso_kg`, `data_abate`, `vencimento` e `dados jsonb` (ordem_compra, lote_frigorifico, preco_arroba,
--      nf_referida {numero, valor}). VALORES (bruto, retencoes, liquido, valor da NPR) CONTINUAM NOS COMPONENTES — um lugar so'.
--   3. `_oc_documento_soma_no_valor(tipo_operacao, especie)`: no ABATE so' `nf_principal` e `nf_complementar` somam; compra e venda
--      como hoje (tudo soma). E' A UNICA REGRA; as duas views leem dela. Pura e IMUTAVEL; EXECUTE para `authenticated` porque as
--      views sao `security_invoker` (sem o grant a tela leria "permission denied for function").
--   4. `vw_oc_documentos`: `valor_liquido` passa a ser o liquido SO' do documento que soma (0 no que nao soma); entram NO FIM
--      `soma_no_valor` e `liquido_proprio` (o liquido do documento, some ou nao — a conferencia do passo 3 le^ dele).
--      `vw_lancamento_documentos` (ramo da OC): `valor_documento` = o LIQUIDO (acrescimos − descontos − retencoes − despesas;
--      informativo fora) e so' do que soma (0 no que nao soma). Antes era a soma de TODOS os componentes, retencoes inclusive:
--      a NF 8812 do LT10 aparecia com 99.734,92 no Financeiro (o liquido e' 96.535,70). Fecha a FIN-DOC-OC-VALOR-LIQUIDO-01.
--   5. backfill das 38 especies do abate, POR ID, mapeadas pelo que o operador escreveu no numero (20 acerto, 10 romaneio, 8 npr);
--      os 14 "outro" restantes nao mudam. Guarda: cada id no estado medido ('outro', vivo, abate, numero na regra) ou ja' na especie
--      alvo — senao aborta tudo. Reexecutar nao muda nada.
--      GESTO CONTRARIO (escrito, nao executado):
--        UPDATE public.zoo_operacao_documentos SET especie = 'outro'
--         WHERE especie IN ('acerto', 'romaneio', 'npr') AND id = ANY (<os 38 ids das tres listas abaixo>);
-- oc_documento_registrar 9fa70022d3228b078e0dc01db255d1e3 -> fe2748011c770db16c4985ffe0ad8969 (ACL, SECURITY DEFINER e search_path preservados).

SET LOCAL lock_timeout = '2s';

-- 1. especies
ALTER TABLE public.zoo_operacao_documentos DROP CONSTRAINT zoo_operacao_documentos_especie_check;
ALTER TABLE public.zoo_operacao_documentos ADD CONSTRAINT zoo_operacao_documentos_especie_check
  CHECK (especie = ANY (ARRAY['nf_principal'::text, 'nf_complementar'::text, 'recibo'::text, 'outro'::text,
                              'npr'::text, 'acerto'::text, 'romaneio'::text]));

-- 2. colunas
ALTER TABLE public.zoo_operacao_documentos
  ADD COLUMN cab integer,
  ADD COLUMN peso_kg numeric,
  ADD COLUMN data_abate date,
  ADD COLUMN vencimento date,
  ADD COLUMN dados jsonb;
ALTER TABLE public.zoo_operacao_documentos
  ADD CONSTRAINT zoo_operacao_documentos_cab_check CHECK (cab IS NULL OR cab > 0),
  ADD CONSTRAINT zoo_operacao_documentos_peso_check CHECK (peso_kg IS NULL OR peso_kg > 0),
  ADD CONSTRAINT zoo_operacao_documentos_dados_check CHECK (dados IS NULL OR jsonb_typeof(dados) = 'object');

-- 3. a regra
CREATE OR REPLACE FUNCTION public._oc_documento_soma_no_valor(p_tipo_operacao text, p_especie text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $fn$
  SELECT CASE WHEN p_tipo_operacao = 'abate' THEN p_especie IN ('nf_principal', 'nf_complementar') ELSE true END;
$fn$;
REVOKE ALL ON FUNCTION public._oc_documento_soma_no_valor(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._oc_documento_soma_no_valor(text, text) TO authenticated, service_role;

-- 4. views (mesmas colunas, na mesma ordem; as novas no fim)
CREATE OR REPLACE VIEW public.vw_oc_documentos WITH (security_invoker = true) AS
 SELECT d.cliente_id,
    d.operacao_id,
    d.id AS documento_id,
    d.especie,
    d.numero,
    d.serie,
    d.chave_acesso,
    d.data_emissao,
    d.url,
    d.documento_origem_id,
    d.observacao,
    d.emitente_id,
    d.emitente_nome,
    d.emitente_documento,
    d.cancelado,
        CASE
            WHEN d.cancelado THEN 'cancelado'::text
            ELSE 'ativo'::text
        END AS situacao,
    COALESCE(v.total_acrescimos, (0)::numeric) AS total_acrescimos,
    COALESCE(v.total_descontos_comerciais, (0)::numeric) AS total_descontos_comerciais,
    COALESCE(v.total_retencoes_sem_caixa, (0)::numeric) AS total_retencoes_sem_caixa,
    COALESCE(v.total_despesas_desembolso, (0)::numeric) AS total_despesas_desembolso,
        CASE
            WHEN public._oc_documento_soma_no_valor(o.tipo_operacao, d.especie)
            THEN (((COALESCE(v.total_acrescimos, (0)::numeric) - COALESCE(v.total_descontos_comerciais, (0)::numeric)) - COALESCE(v.total_retencoes_sem_caixa, (0)::numeric)) - COALESCE(v.total_despesas_desembolso, (0)::numeric))
            ELSE (0)::numeric
        END AS valor_liquido,
    COALESCE(cc.qtd_componentes, (0)::bigint) AS qtd_componentes,
    COALESCE(ll.qtd_lotes, (0)::bigint) AS qtd_lotes,
    public._oc_documento_soma_no_valor(o.tipo_operacao, d.especie) AS soma_no_valor,
    (((COALESCE(v.total_acrescimos, (0)::numeric) - COALESCE(v.total_descontos_comerciais, (0)::numeric)) - COALESCE(v.total_retencoes_sem_caixa, (0)::numeric)) - COALESCE(v.total_despesas_desembolso, (0)::numeric)) AS liquido_proprio
   FROM ((((zoo_operacao_documentos d
     JOIN zoo_operacoes_comerciais o ON ((o.id = d.operacao_id)))
     LEFT JOIN LATERAL ( SELECT sum(c.valor) FILTER (WHERE (c.natureza = 'acrescimo'::text)) AS total_acrescimos,
            sum(c.valor) FILTER (WHERE (c.natureza = 'desconto_comercial'::text)) AS total_descontos_comerciais,
            sum(c.valor) FILTER (WHERE (c.natureza = 'retencao_sem_caixa'::text)) AS total_retencoes_sem_caixa,
            sum(c.valor) FILTER (WHERE (c.natureza = 'despesa_desembolso'::text)) AS total_despesas_desembolso
           FROM zoo_operacao_documento_componentes c
          WHERE ((c.documento_id = d.id) AND (c.cancelado = false))) v ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) AS qtd_componentes
           FROM zoo_operacao_documento_componentes c
          WHERE ((c.documento_id = d.id) AND (c.cancelado = false))) cc ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) AS qtd_lotes
           FROM zoo_operacao_documento_lotes l
          WHERE (l.documento_id = d.id)) ll ON (true));

CREATE OR REPLACE VIEW public.vw_lancamento_documentos WITH (security_invoker = true) AS
 SELECT d.cliente_id,
    d.lancamento_id,
    d.id AS documento_id,
    'lancamento'::text AS origem,
    NULL::uuid AS operacao_id,
    d.nome,
    d.tipo,
    d.url,
    d.tamanho_bytes,
    d.uploaded_em,
    d.uploaded_por,
    d.especie,
    d.numero,
    d.serie,
    d.chave_acesso,
    d.data_emissao,
    d.valor_documento,
    d.emitente_id,
    d.emitente_nome,
    d.emitente_documento,
    d.observacao,
    d.cancelado,
    d.cancelado_em,
    d.cancelado_motivo,
    d.versao,
    ((1 + ( SELECT count(*) AS count
           FROM financeiro_documento_vinculos vv
          WHERE (vv.documento_id = d.id))))::integer AS ligado_a_qtd
   FROM financeiro_lancamento_documentos d
UNION ALL
 SELECT od.cliente_id,
    pt.financeiro_lancamento_id AS lancamento_id,
    od.id AS documento_id,
    'operacao'::text AS origem,
    od.operacao_id,
    od.nome,
    od.tipo,
    od.url,
    od.tamanho_bytes,
    od.uploaded_em,
    od.uploaded_por,
    od.especie,
    od.numero,
    od.serie,
    od.chave_acesso,
    od.data_emissao,
    ( SELECT
                CASE
                    WHEN public._oc_documento_soma_no_valor(oo.tipo_operacao, od.especie)
                    THEN (COALESCE(sum(c.valor) FILTER (WHERE (c.natureza = 'acrescimo'::text)), (0)::numeric)
                        - COALESCE(sum(c.valor) FILTER (WHERE (c.natureza = ANY (ARRAY['desconto_comercial'::text, 'retencao_sem_caixa'::text, 'despesa_desembolso'::text]))), (0)::numeric))
                    ELSE (0)::numeric
                END AS "coalesce"
           FROM zoo_operacao_documento_componentes c
          WHERE ((c.documento_id = od.id) AND (c.cancelado IS NOT TRUE))) AS valor_documento,
    od.emitente_id,
    od.emitente_nome,
    od.emitente_documento,
    od.observacao,
    od.cancelado,
    od.cancelado_em,
    od.cancelado_motivo,
    od.versao,
    NULL::integer AS ligado_a_qtd
   FROM ((zoo_operacao_documentos od
     JOIN zoo_operacoes_comerciais oo ON ((oo.id = od.operacao_id)))
     JOIN zoo_operacao_partes pt ON (((pt.operacao_id = od.operacao_id) AND (pt.financeiro_lancamento_id IS NOT NULL) AND (pt.cancelada IS NOT TRUE))))
UNION ALL
 SELECT d.cliente_id,
    v.lancamento_id,
    d.id AS documento_id,
    'lancamento'::text AS origem,
    NULL::uuid AS operacao_id,
    d.nome,
    d.tipo,
    d.url,
    d.tamanho_bytes,
    d.uploaded_em,
    d.uploaded_por,
    d.especie,
    d.numero,
    d.serie,
    d.chave_acesso,
    d.data_emissao,
    d.valor_documento,
    d.emitente_id,
    d.emitente_nome,
    d.emitente_documento,
    d.observacao,
    d.cancelado,
    d.cancelado_em,
    d.cancelado_motivo,
    d.versao,
    ((1 + ( SELECT count(*) AS count
           FROM financeiro_documento_vinculos vv
          WHERE (vv.documento_id = d.id))))::integer AS ligado_a_qtd
   FROM (financeiro_documento_vinculos v
     JOIN financeiro_lancamento_documentos d ON (((d.id = v.documento_id) AND (d.cliente_id = v.cliente_id))));

-- 5. oc_documento_registrar aceita as especies do abate, so' no abate (patch guardado por md5)
CREATE OR REPLACE FUNCTION pg_temp._oc_doc_especie_patch(p_nome text, p_origem text, p_destino text, p_pares text[])
 RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE
  v_src text; v_def text; v_novo text; i int; v_n int; v_acl text; v_sec boolean; v_cfg text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid), p.proacl::text, p.prosecdef, p.proconfig::text
    INTO STRICT v_src, v_def, v_acl, v_sec, v_cfg FROM pg_proc p
   WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace;
  IF md5(v_src) = p_destino THEN RETURN; END IF;   -- ja' aplicado
  IF md5(v_src) <> p_origem THEN
    RAISE EXCEPTION 'OC-DOC-ESPECIE-ABATE-01: % com corpo de origem inesperado (md5 %)', p_nome, md5(v_src); END IF;
  v_novo := v_src;
  FOR i IN 1 .. array_length(p_pares, 1) / 2 LOOP
    v_n := (length(v_novo) - length(replace(v_novo, p_pares[2 * i - 1], ''))) / length(p_pares[2 * i - 1]);
    IF v_n <> 1 THEN RAISE EXCEPTION 'OC-DOC-ESPECIE-ABATE-01: %, ancora % casa % vez(es), nao 1', p_nome, i, v_n; END IF;
    v_novo := replace(v_novo, p_pares[2 * i - 1], p_pares[2 * i]);
  END LOOP;
  IF md5(v_novo) <> p_destino THEN
    RAISE EXCEPTION 'OC-DOC-ESPECIE-ABATE-01: % com corpo de destino inesperado (md5 %)', p_nome, md5(v_novo); END IF;
  IF (length(v_def) - length(replace(v_def, v_src, ''))) / length(v_src) <> 1 THEN
    RAISE EXCEPTION 'OC-DOC-ESPECIE-ABATE-01: %: corpo nao localizado na definicao', p_nome; END IF;
  EXECUTE replace(v_def, v_src, v_novo);
  IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM p_destino
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM v_acl
     OR (SELECT p.prosecdef FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM v_sec
     OR (SELECT p.proconfig::text FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM v_cfg THEN
    RAISE EXCEPTION 'OC-DOC-ESPECIE-ABATE-01: %: destino, ACL, SECURITY ou search_path nao conferem depois da troca', p_nome; END IF;
END $patch$;

SELECT pg_temp._oc_doc_especie_patch('oc_documento_registrar', '9fa70022d3228b078e0dc01db255d1e3', 'fe2748011c770db16c4985ffe0ad8969', ARRAY[
$a$  IF v_especie NOT IN ('nf_principal','nf_complementar','recibo','outro') THEN
    RAISE EXCEPTION 'Especie invalida: %', v_especie USING ERRCODE='P0001'; END IF;$a$,
$b$  IF v_especie NOT IN ('nf_principal','nf_complementar','recibo','outro','npr','acerto','romaneio') THEN
    RAISE EXCEPTION 'Especie invalida: %', v_especie USING ERRCODE='P0001'; END IF;
  -- OC-DOC-ESPECIE-ABATE-01: NPR, acerto e romaneio sao documentos do ABATE.
  IF v_especie IN ('npr','acerto','romaneio') AND v_op.tipo_operacao IS DISTINCT FROM 'abate' THEN
    RAISE EXCEPTION 'Especie % so existe no abate', v_especie USING ERRCODE='P0001'; END IF;$b$]);

-- 6. backfill das 38 especies (por id; guarda do estado medido; idempotente)
DO $backfill$
DECLARE
  c_acerto constant uuid[] := ARRAY[
    '1266e2f2-aec9-44e7-b1da-928c9c7c3a1e','1838a92a-cce0-407b-86b3-6e44487b9a94','24a66aa7-1202-47bc-90e5-73ce2536805a',
    '36f1b684-01e9-4a74-a744-c32794b322fa','54039fa3-1900-4347-a555-57254b4f3e52','5482f466-58af-483a-b36a-32ced1ab0587',
    '59ecf203-49c1-4f7f-a1db-d96eda791960','730022dc-d8b5-4ed4-9e9d-b952ede0604e','79bad692-30b3-4a9f-b79a-75f6b39d8e3c',
    '7f113756-17f3-48cb-8b0d-c091c8fa8f14','8ae3d2d4-5fb7-48c9-abb9-6366883318a8','9625042c-0b5d-43a1-a5dc-9370515730ef',
    '9e88b06f-63eb-46cc-bc2b-e88f4365b5ba','b9912198-b868-414e-9ea6-c06d022f16e4','c02fd2dd-c13e-45a5-857d-63c2c5aec6dc',
    'c480510d-cafb-4595-86af-87964e3ff2d3','e347cfd8-95fc-432c-a9b2-30cdb9e7208c','e5ae28b3-0278-4cca-b00c-8fdd43a6c98c',
    'fb4f717c-cef7-4d64-85d0-14053d90fd34','fefd4624-7a08-4224-aae9-d9ec3502d0a7']::uuid[];
  c_romaneio constant uuid[] := ARRAY[
    '06fcd35f-b4c9-4eac-a3e1-e0bf62dd35bf','189450b6-9bb1-4086-9446-04e81f0d802a','2ba6e304-b642-4ab0-9f42-5858921284c8',
    '3073f521-49f6-4e05-84c3-b2e3b3cedae5','64e7fb7b-c058-4d6e-b428-9b76e2c1fcae','6d5005bd-f1b9-4b64-a68c-0c7923e839fc',
    '74cb6669-636a-4e3a-a4a4-3b1f41581d5b','8f9231d1-e47c-4124-96db-387526f6e4ba','96fb34b0-c18d-4763-8160-3d1e5501c217',
    'aeb0f71c-36b3-43ce-98fc-95cf93fdcfd4']::uuid[];
  c_npr constant uuid[] := ARRAY[
    '155c7267-68d0-4b32-9c3d-849aed304b60','263a6aaf-5044-448f-8fd4-2a07c8e12ccf','58334bd9-7fd9-4dd8-afc4-8a5b22b3a737',
    '58c3cdeb-3101-41af-bc29-493652436828','5a050170-b492-451e-ad58-01e2d5c44c99','afedd2d1-e4ea-4e95-935e-80240d06566b',
    'e69c1300-50ef-4ec6-9d70-41c2488e1963','e954034e-9e95-47a2-bd05-76a8a07581de']::uuid[];
  n int;
BEGIN
  SELECT count(*) INTO n FROM public.zoo_operacao_documentos d JOIN public.zoo_operacoes_comerciais o ON o.id = d.operacao_id
   WHERE o.tipo_operacao = 'abate' AND d.cancelado IS NOT TRUE AND (
         (d.id = ANY (c_acerto)   AND d.numero ILIKE 'acerto%'   AND d.especie IN ('outro', 'acerto'))
      OR (d.id = ANY (c_romaneio) AND d.numero ILIKE 'romaneio%' AND d.especie IN ('outro', 'romaneio'))
      OR (d.id = ANY (c_npr)      AND d.numero ILIKE 'npr%'      AND d.especie IN ('outro', 'npr')));
  IF n IS DISTINCT FROM 38 THEN
    RAISE EXCEPTION 'OC-DOC-ESPECIE-ABATE-01: backfill fora do estado medido (% de 38). Nada foi gravado.', n; END IF;
  UPDATE public.zoo_operacao_documentos SET especie = 'acerto'   WHERE id = ANY (c_acerto)   AND especie = 'outro';
  UPDATE public.zoo_operacao_documentos SET especie = 'romaneio' WHERE id = ANY (c_romaneio) AND especie = 'outro';
  UPDATE public.zoo_operacao_documentos SET especie = 'npr'      WHERE id = ANY (c_npr)      AND especie = 'outro';
END $backfill$;

-- 7. conferencia
DO $conf$
BEGIN
  IF (SELECT c.reloptions FROM pg_class c WHERE c.oid = 'public.vw_oc_documentos'::regclass) IS DISTINCT FROM ARRAY['security_invoker=true']
     OR (SELECT c.reloptions FROM pg_class c WHERE c.oid = 'public.vw_lancamento_documentos'::regclass) IS DISTINCT FROM ARRAY['security_invoker=true'] THEN
    RAISE EXCEPTION 'OC-DOC-ESPECIE-ABATE-01: as views perderam security_invoker'; END IF;
  IF has_function_privilege('anon', 'public._oc_documento_soma_no_valor(text, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public._oc_documento_soma_no_valor(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'OC-DOC-ESPECIE-ABATE-01: ACL da regra'; END IF;
END $conf$;
