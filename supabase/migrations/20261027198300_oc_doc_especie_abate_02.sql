-- OC-DOC-ESPECIE-ABATE-01 passo 2 (Gabriel, 14/10/2026) — O FORMULARIO DO ABATE GRAVA OS CAMPOS PROPRIOS E A LISTA OS LE^.
-- O QUE ENTRA:
--   1. `oc_documento_registrar` e `oc_documento_editar` gravam `cab`, `peso_kg`, `data_abate`, `vencimento` e `dados` do payload
--      (patch guardado por md5). No editar a chave AUSENTE mantem o gravado; `dados` substitui o objeto inteiro ({} e nao-objeto
--      viram NULO). A ESPECIE CONTINUA SEM SE EDITAR (decisao do Gabriel: cancela e registra de novo).
--   2. `vw_oc_documentos` ganha NO FIM `cab`, `peso_kg`, `data_abate`, `vencimento` e `dados` (security_invoker, mesmas colunas
--      na mesma ordem antes delas).
--   3. o componente de SEGURO ganha tipo proprio, 'seguro' (nao ha CHECK de tipo em `zoo_operacao_documento_componentes`).
--      Backfill POR ID do unico 'outros' que e' seguro (medido em 14/10: 022f21b0, NF 000.008.812 do LT10 8c8a864d,
--      retencao_sem_caixa, "Seguro", 107,95). Guarda: o estado medido, ou ja' 'seguro' — senao aborta. Idempotente.
--      GESTO CONTRARIO (escrito, nao executado):
--        UPDATE public.zoo_operacao_documento_componentes SET tipo = 'outros'
--         WHERE id = '022f21b0-e5b2-4a10-86b0-62d968ef56fb' AND tipo = 'seguro';
-- oc_documento_registrar fe2748011c770db16c4985ffe0ad8969 -> ff4b1f93d7f6c6c73e1c013c961426a4
-- oc_documento_editar    bbbb340bead76a28324cdace6f1cdc66 -> a744b4c763131d628f78065349e2046b
--   (ACL, SECURITY DEFINER e search_path preservados, conferidos pelo proprio patch).

SET LOCAL lock_timeout = '2s';

-- 1. a view (as colunas novas no fim)
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
    (((COALESCE(v.total_acrescimos, (0)::numeric) - COALESCE(v.total_descontos_comerciais, (0)::numeric)) - COALESCE(v.total_retencoes_sem_caixa, (0)::numeric)) - COALESCE(v.total_despesas_desembolso, (0)::numeric)) AS liquido_proprio,
    d.cab,
    d.peso_kg,
    d.data_abate,
    d.vencimento,
    d.dados
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

-- 2. as duas RPCs (patch guardado por md5)
CREATE OR REPLACE FUNCTION pg_temp._oc_doc_abate_02_patch(p_nome text, p_origem text, p_destino text, p_pares text[])
 RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE
  v_src text; v_def text; v_novo text; i int; v_n int; v_acl text; v_sec boolean; v_cfg text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid), p.proacl::text, p.prosecdef, p.proconfig::text
    INTO STRICT v_src, v_def, v_acl, v_sec, v_cfg FROM pg_proc p
   WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace;
  IF md5(v_src) = p_destino THEN RETURN; END IF;   -- ja' aplicado
  IF md5(v_src) <> p_origem THEN
    RAISE EXCEPTION 'OC-DOC-ESPECIE-ABATE-01 passo 2: % com corpo de origem inesperado (md5 %)', p_nome, md5(v_src); END IF;
  v_novo := v_src;
  FOR i IN 1 .. array_length(p_pares, 1) / 2 LOOP
    v_n := (length(v_novo) - length(replace(v_novo, p_pares[2 * i - 1], ''))) / length(p_pares[2 * i - 1]);
    IF v_n <> 1 THEN RAISE EXCEPTION 'OC-DOC-ESPECIE-ABATE-01 passo 2: %, ancora % casa % vez(es), nao 1', p_nome, i, v_n; END IF;
    v_novo := replace(v_novo, p_pares[2 * i - 1], p_pares[2 * i]);
  END LOOP;
  IF md5(v_novo) <> p_destino THEN
    RAISE EXCEPTION 'OC-DOC-ESPECIE-ABATE-01 passo 2: % com corpo de destino inesperado (md5 %)', p_nome, md5(v_novo); END IF;
  IF (length(v_def) - length(replace(v_def, v_src, ''))) / length(v_src) <> 1 THEN
    RAISE EXCEPTION 'OC-DOC-ESPECIE-ABATE-01 passo 2: %: corpo nao localizado na definicao', p_nome; END IF;
  EXECUTE replace(v_def, v_src, v_novo);
  IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM p_destino
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM v_acl
     OR (SELECT p.prosecdef FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM v_sec
     OR (SELECT p.proconfig::text FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM v_cfg THEN
    RAISE EXCEPTION 'OC-DOC-ESPECIE-ABATE-01 passo 2: %: destino, ACL, SECURITY ou search_path nao conferem depois da troca', p_nome; END IF;
END $patch$;

SELECT pg_temp._oc_doc_abate_02_patch('oc_documento_registrar', 'fe2748011c770db16c4985ffe0ad8969', 'ff4b1f93d7f6c6c73e1c013c961426a4', ARRAY[
$a$    emitente_id, emitente_nome, emitente_documento)
  VALUES ($a$,
$b$    emitente_id, emitente_nome, emitente_documento,
    cab, peso_kg, data_abate, vencimento, dados)
  VALUES ($b$,
$c$NULLIF(p_payload->>'emitente_documento',''))
  RETURNING id INTO v_id;$c$,
$d$NULLIF(p_payload->>'emitente_documento',''),
    -- OC-DOC-ESPECIE-ABATE-01 passo 2: os campos do abate (valores seguem nos componentes).
    NULLIF(p_payload->>'cab','')::integer, NULLIF(p_payload->>'peso_kg','')::numeric,
    NULLIF(p_payload->>'data_abate','')::date, NULLIF(p_payload->>'vencimento','')::date,
    CASE WHEN jsonb_typeof(p_payload->'dados') = 'object' THEN NULLIF(p_payload->'dados', '{}'::jsonb) END)
  RETURNING id INTO v_id;$d$]);

SELECT pg_temp._oc_doc_abate_02_patch('oc_documento_editar', 'bbbb340bead76a28324cdace6f1cdc66', 'a744b4c763131d628f78065349e2046b', ARRAY[
$e$    emitente_documento = CASE WHEN p_payload ? 'emitente_documento' THEN NULLIF(p_payload->>'emitente_documento','') ELSE emitente_documento END,
$e$,
$f$    emitente_documento = CASE WHEN p_payload ? 'emitente_documento' THEN NULLIF(p_payload->>'emitente_documento','') ELSE emitente_documento END,
    -- OC-DOC-ESPECIE-ABATE-01 passo 2: chave ausente mantem o gravado; `dados` substitui o objeto inteiro.
    cab          = CASE WHEN p_payload ? 'cab' THEN NULLIF(p_payload->>'cab','')::integer ELSE cab END,
    peso_kg      = CASE WHEN p_payload ? 'peso_kg' THEN NULLIF(p_payload->>'peso_kg','')::numeric ELSE peso_kg END,
    data_abate   = CASE WHEN p_payload ? 'data_abate' THEN NULLIF(p_payload->>'data_abate','')::date ELSE data_abate END,
    vencimento   = CASE WHEN p_payload ? 'vencimento' THEN NULLIF(p_payload->>'vencimento','')::date ELSE vencimento END,
    dados        = CASE WHEN p_payload ? 'dados'
                        THEN CASE WHEN jsonb_typeof(p_payload->'dados') = 'object' THEN NULLIF(p_payload->'dados', '{}'::jsonb) END
                        ELSE dados END,
$f$]);

-- 3. o seguro por id (guarda do estado medido; idempotente)
DO $seguro$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.zoo_operacao_documento_componentes c
   WHERE c.id = '022f21b0-e5b2-4a10-86b0-62d968ef56fb' AND c.cancelado = false
     AND c.documento_id = '573424ad-eec7-42d8-9e10-6e233fbf0f71' AND c.natureza = 'retencao_sem_caixa' AND c.valor = 107.95
     AND (c.tipo = 'seguro' OR (c.tipo = 'outros' AND c.descricao = 'Seguro'));
  IF n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'OC-DOC-ESPECIE-ABATE-01 passo 2: componente de seguro fora do estado medido. Nada foi gravado.'; END IF;
  UPDATE public.zoo_operacao_documento_componentes SET tipo = 'seguro'
   WHERE id = '022f21b0-e5b2-4a10-86b0-62d968ef56fb' AND tipo = 'outros';
END $seguro$;

-- 4. conferencia
DO $conf$
BEGIN
  IF (SELECT c.reloptions FROM pg_class c WHERE c.oid = 'public.vw_oc_documentos'::regclass) IS DISTINCT FROM ARRAY['security_invoker=true']
     OR (SELECT c.relacl::text FROM pg_class c WHERE c.oid = 'public.vw_oc_documentos'::regclass)
        IS DISTINCT FROM '{postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=r/postgres}' THEN
    RAISE EXCEPTION 'OC-DOC-ESPECIE-ABATE-01 passo 2: a view perdeu security_invoker ou a ACL'; END IF;
END $conf$;
