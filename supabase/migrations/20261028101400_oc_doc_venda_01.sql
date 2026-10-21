-- OC-DOC-VENDA-01 — a aba Documentos da VENDA e' a do ABATE (Gabriel 21/10 14h26: "ja esta feito, e so copiar").
--   1. ESPECIES DA VENDA no mesmo cadastro: a saida da fazenda igual ao abate (NF do produtor, GTA, guia, declaracao, outro) e,
--      no lugar do frigorifico, "Da operacao": `contrato` (contrato/pedido de venda), `nf_entrada` (NF de entrada do comprador) e
--      `comprovante`. As tres novas so' existem na venda.
--   2. O QUE SOMA (decisao do Gabriel, 21/10): na venda a NF DO PRODUTOR e' a nota da venda e SOMA (o componente vai como acrescimo
--      — a tela decide a natureza pelo tipo da OC); a NF de entrada do comprador, o contrato e o comprovante sao INFORMATIVOS.
--      O que ja' existe na venda (nf_principal, nf_complementar, recibo, outro) continua somando como hoje.
--   3. NOTA REPETIDA PELA CHAVE (decisao do Gabriel, 21/10: o cliente inteiro): a mesma chave de acesso (44 digitos) viva em
--      QUALQUER OC do cliente e' barrada no registrar e no editar (23505, DETAIL = {operacao_id, tipo_operacao, rotulo}); o editar
--      so' confere quando a chave MUDA (o par antigo ja' repetido — 1 no proto, medido em 21/10 — continua editavel).
--      `oc_documento_nota_repetida` e' a mesma pergunta para a tela (a faixa avisa antes de gravar, com o link).
-- Reescrita guardada pelo md5 do corpo de origem.

CREATE FUNCTION pg_temp._trocar(p_fn regprocedure, p_md5 text, p_trocas text[]) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_def text; i int;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p_fn) <> p_md5 THEN
    RAISE EXCEPTION 'OC-DOC-VENDA-01: corpo de origem de % divergente', p_fn;
  END IF;
  v_def := pg_get_functiondef(p_fn);
  FOR i IN 1 .. array_length(p_trocas, 1) / 2 LOOP
    IF (length(v_def) - length(replace(v_def, p_trocas[2 * i - 1], ''))) / length(p_trocas[2 * i - 1]) <> 1 THEN
      RAISE EXCEPTION 'OC-DOC-VENDA-01: trecho % de % nao achado uma vez', i, p_fn;
    END IF;
    v_def := replace(v_def, p_trocas[2 * i - 1], p_trocas[2 * i]);
  END LOOP;
  EXECUTE v_def;
END $f$;

-- ═══════════════════ 1. AS ESPECIES ═══════════════════
ALTER TABLE public.zoo_operacao_documentos DROP CONSTRAINT zoo_operacao_documentos_especie_check;
ALTER TABLE public.zoo_operacao_documentos ADD CONSTRAINT zoo_operacao_documentos_especie_check CHECK (especie = ANY (ARRAY[
  'nf_principal', 'nf_complementar', 'recibo', 'outro', 'npr', 'acerto', 'romaneio', 'nf_produtor', 'gta', 'guia', 'declaracao',
  'contrato', 'nf_entrada', 'comprovante']));

-- ═══════════════════ 2. O QUE SOMA ═══════════════════
CREATE OR REPLACE FUNCTION public._oc_documento_soma_no_valor(p_tipo_operacao text, p_especie text)
 RETURNS boolean LANGUAGE sql IMMUTABLE AS $function$
  SELECT CASE
    WHEN p_tipo_operacao = 'abate' THEN p_especie IN ('nf_principal', 'nf_complementar')
    -- OC-DOC-VENDA-01: contrato, NF de entrada do comprador e comprovante sao informativos
    WHEN p_tipo_operacao = 'venda' THEN p_especie NOT IN ('gta', 'guia', 'declaracao', 'contrato', 'nf_entrada', 'comprovante')
    ELSE true END;
$function$;

-- ═══════════════════ 3. A NOTA REPETIDA ═══════════════════
-- O documento vivo do cliente com a mesma chave (44 digitos), fora `p_ignorar`; nulo quando nao ha'. O rotulo nomeia a OC como o
-- operador a conhece (tipo, data, contraparte) — nunca o uuid.
CREATE OR REPLACE FUNCTION public._oc_documento_nota_repetida(p_cliente_id uuid, p_chave text, p_ignorar uuid DEFAULT NULL)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
  SELECT jsonb_build_object('documento_id', d.id, 'operacao_id', o.id, 'tipo_operacao', o.tipo_operacao,
           'rotulo', initcap(coalesce(o.tipo_operacao, 'operação')) || coalesce(' de ' || to_char(o.data_operacao, 'DD/MM/YYYY'), '')
                     || coalesce(' · ' || nullif(btrim(f.nome), ''), ''))
    FROM public.zoo_operacao_documentos d
    JOIN public.zoo_operacoes_comerciais o ON o.id = d.operacao_id
    LEFT JOIN public.financeiro_fornecedores f ON f.id = o.contraparte_id
   WHERE d.cliente_id = p_cliente_id AND d.cancelado = false
     AND length(regexp_replace(coalesce(p_chave, ''), '\D', '', 'g')) = 44
     AND regexp_replace(coalesce(d.chave_acesso, ''), '\D', '', 'g') = regexp_replace(p_chave, '\D', '', 'g')
     AND d.id IS DISTINCT FROM p_ignorar
   ORDER BY d.uploaded_em
   LIMIT 1;
$function$;

-- A pergunta da tela: com a guarda de cliente.
CREATE OR REPLACE FUNCTION public.oc_documento_nota_repetida(p_cliente_id uuid, p_chave text, p_ignorar uuid DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
  IF p_cliente_id IS NULL OR NOT coalesce(public.tenant_ok(p_cliente_id), false) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501';
  END IF;
  RETURN public._oc_documento_nota_repetida(p_cliente_id, p_chave, p_ignorar);
END
$function$;

SELECT pg_temp._trocar('public.oc_documento_registrar(uuid, uuid, jsonb)'::regprocedure, 'f3e2d13d8a0ced0cac40cedcaf76c40d', ARRAY[
  $a$  IF v_especie NOT IN ('nf_principal','nf_complementar','recibo','outro','npr','acerto','romaneio',
                        'nf_produtor','gta','guia','declaracao') THEN$a$,
  $a$  IF v_especie NOT IN ('nf_principal','nf_complementar','recibo','outro','npr','acerto','romaneio',
                        'nf_produtor','gta','guia','declaracao','contrato','nf_entrada','comprovante') THEN$a$,
  $b$  IF v_especie IN ('npr','acerto','romaneio','nf_produtor') AND v_op.tipo_operacao IS DISTINCT FROM 'abate' THEN$b$,
  $b$  IF v_especie IN ('npr','acerto','romaneio') AND v_op.tipo_operacao IS DISTINCT FROM 'abate' THEN$b$,
  $c$  IF v_especie IN ('gta','guia','declaracao') AND v_op.tipo_operacao NOT IN ('abate','venda') THEN$c$,
  $c$  -- OC-DOC-VENDA-01: a NF do produtor tambem e' da saida da fazenda (no abate informativa; na venda e' a nota da venda)
  IF v_especie IN ('nf_produtor','gta','guia','declaracao') AND v_op.tipo_operacao NOT IN ('abate','venda') THEN$c$,
  $d$  v_nome := COALESCE(NULLIF(p_payload->>'nome',''), v_especie || COALESCE(' ' || NULLIF(p_payload->>'numero',''), ''));$d$,
  $d$  -- OC-DOC-VENDA-01: os documentos "da operacao" da venda
  IF v_especie IN ('contrato','nf_entrada','comprovante') AND v_op.tipo_operacao IS DISTINCT FROM 'venda' THEN
    RAISE EXCEPTION 'Especie % so existe na venda', v_especie USING ERRCODE='P0001'; END IF;
  -- OC-DOC-VENDA-01: a mesma nota (chave de acesso) nunca entra duas vezes no cliente
  DECLARE v_rep jsonb := public._oc_documento_nota_repetida(p_cliente_id, p_payload->>'chave_acesso', NULL);
  BEGIN
    IF v_rep IS NOT NULL THEN
      RAISE EXCEPTION 'Esta nota já está registrada (%). Nada foi gravado.', v_rep->>'rotulo'
        USING ERRCODE = '23505', DETAIL = v_rep::text;
    END IF;
  END;
  v_nome := COALESCE(NULLIF(p_payload->>'nome',''), v_especie || COALESCE(' ' || NULLIF(p_payload->>'numero',''), ''));$d$
]);

SELECT pg_temp._trocar('public.oc_documento_editar(uuid, uuid, integer, jsonb)'::regprocedure, 'a744b4c763131d628f78065349e2046b', ARRAY[
  $a$    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_doc.versao USING ERRCODE='40001'; END IF;$a$,
  $a$    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_doc.versao USING ERRCODE='40001'; END IF;
  -- OC-DOC-VENDA-01: a chave que MUDA nao pode ser a de outra nota viva do cliente (a mesma de antes segue editavel)
  IF p_payload ? 'chave_acesso'
     AND regexp_replace(coalesce(p_payload->>'chave_acesso', ''), '\D', '', 'g') <> regexp_replace(coalesce(v_doc.chave_acesso, ''), '\D', '', 'g') THEN
    DECLARE v_rep jsonb := public._oc_documento_nota_repetida(p_cliente_id, p_payload->>'chave_acesso', p_documento_id);
    BEGIN
      IF v_rep IS NOT NULL THEN
        RAISE EXCEPTION 'Esta nota já está registrada (%). Nada foi gravado.', v_rep->>'rotulo'
          USING ERRCODE = '23505', DETAIL = v_rep::text;
      END IF;
    END;
  END IF;$a$
]);

REVOKE ALL ON FUNCTION public._oc_documento_nota_repetida(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.oc_documento_nota_repetida(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_documento_nota_repetida(uuid, text, uuid) TO authenticated, service_role;

-- confere: as trocas entraram e a ACL
DO $confere$
BEGIN
  IF position('nf_entrada' in pg_get_functiondef('public.oc_documento_registrar(uuid, uuid, jsonb)'::regprocedure)) = 0
     OR position('_oc_documento_nota_repetida' in pg_get_functiondef('public.oc_documento_editar(uuid, uuid, integer, jsonb)'::regprocedure)) = 0
     OR has_function_privilege('anon', 'public.oc_documento_nota_repetida(uuid, text, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._oc_documento_nota_repetida(uuid, text, uuid)', 'EXECUTE')
     OR public._oc_documento_soma_no_valor('venda', 'nf_entrada') OR NOT public._oc_documento_soma_no_valor('venda', 'nf_produtor')
     OR public._oc_documento_soma_no_valor('abate', 'nf_produtor') THEN
    RAISE EXCEPTION 'OC-DOC-VENDA-01: conferencia final falhou';
  END IF;
END $confere$;
