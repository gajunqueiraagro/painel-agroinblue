-- OC-DOC-SAIDA-FAZENDA-01 (item 7f, Gabriel 15/10/2026) — OS DOCUMENTOS DA SAIDA DA FAZENDA NA ABA DOCUMENTOS DA OC.
-- DECISOES DO GABRIEL (15/10):
--   a) `nf_produtor` (NFP-e de saida emitida pelo produtor) existe SO' NO ABATE e la' nunca soma. Na venda e na compra a NFP-e
--      continua sendo a nota da operacao (nf_principal / nf_complementar), sem mudanca.
--   b) `gta`, `guia` (boleto ou DARE: Fundersul, Taxa Iagro, ICMS) e `declaracao` (Modelo B, Carta de garantia) existem no ABATE e
--      na VENDA e nunca somam. O valor da guia e da NFP-e vai como componente de natureza 'informativo' (ja' aceita pelo CHECK e
--      por `_oc_documento_aplicar`; as views nao a somam).
--   c) Boitel (b58bf556, 7f7de76f, 8dcafa8e): nenhuma NFP-e convertida.
-- O QUE ENTRA:
--   1. o CHECK das especies ganha as quatro.
--   2. `_oc_documento_soma_no_valor` (a UNICA regra; as duas views leem dela): abate = so' NF; venda = tudo MENOS gta, guia e
--      declaracao; compra (e o resto) = como hoje, tudo soma. IMUTAVEL; o CREATE OR REPLACE preserva a ACL.
--   3. `oc_documento_registrar` (patch guardado por md5, 2 ancoras): aceita as quatro; `nf_produtor` so' no abate; gta, guia e
--      declaracao so' no abate e na venda. `oc_documento_editar` NAO muda: nao conhece especie (a especie nao se edita).
--   4. conversao POR ID (17 documentos, o estado medido em 15/10), formato do Seguro/RAT: guarda pelo estado medido, ou ja'
--      convertido — senao aborta sem gravar nada; reaplicar muda 0 linhas. Nas tres guias com valor (02be1a41) o componente
--      passa de acrescimo a informativo. O TOTAL DOCUMENTADO (soma de `valor_liquido` da view) das OCs tocadas e' conferido antes
--      x depois DENTRO da migration e tem de ser igual — os 17 documentos ja' davam 0 nele.
--      nf_principal -> nf_produtor (3): 02be1a41 NF 009.320.918 (f7bd1855) e 009.320.868 (da5768b7); 2d39d7e9 NF 009.223.824 (2466d8d2).
--      outro -> guia (9): 6c93850c (Taxa Iagro, 377,85), 7c42d801 (Fundersul, 765,49), 15c6a4f9 (Fundersul, 1.913,72), ebf3fce8,
--        259cb004, d03ded12, 4f53e340, 1912022b, 9de3f142 (sem componente).
--      outro -> gta (5): 8824aa2a, 43a5ce9e, e0a2f381, 2de539f9, 7a8098bf (sem componente).
--   GESTO CONTRARIO (escrito, nao executado):
--     UPDATE public.zoo_operacao_documento_componentes SET natureza = 'acrescimo'
--      WHERE natureza = 'informativo' AND id IN ('df80f114-11fd-4104-b62b-f316eefe720d', '6980755f-4e9a-4da8-ac3d-27a7512b02b5',
--                                                'af9448c0-80da-42d0-ac08-661c2009316d');
--     UPDATE public.zoo_operacao_documentos SET especie = 'nf_principal' WHERE especie = 'nf_produtor' AND id IN (<os 3>);
--     UPDATE public.zoo_operacao_documentos SET especie = 'outro' WHERE especie IN ('guia', 'gta') AND id IN (<os 14>);
--     (e o CHECK, a regra e o registrar de volta aos corpos de origem)
-- oc_documento_registrar ff4b1f93d7f6c6c73e1c013c961426a4 -> f3e2d13d8a0ced0cac40cedcaf76c40d
--   (ACL, SECURITY DEFINER e search_path preservados, conferidos pelo proprio patch).
-- _oc_documento_soma_no_valor 34fe537fd56627873e3d9bd0beb923c6 -> 363dd22be903c436b6fd3bbe92842893 (ACL preservada)

SET LOCAL lock_timeout = '2s';

-- 1. especies
ALTER TABLE public.zoo_operacao_documentos DROP CONSTRAINT zoo_operacao_documentos_especie_check;
ALTER TABLE public.zoo_operacao_documentos ADD CONSTRAINT zoo_operacao_documentos_especie_check
  CHECK (especie = ANY (ARRAY['nf_principal'::text, 'nf_complementar'::text, 'recibo'::text, 'outro'::text,
                              'npr'::text, 'acerto'::text, 'romaneio'::text,
                              'nf_produtor'::text, 'gta'::text, 'guia'::text, 'declaracao'::text]));

-- 2. a regra (o total documentado de antes, para a conferencia do passo 4, e' lido ANTES de trocar a regra)
CREATE TEMP TABLE _oc_saida_total_antes ON COMMIT DROP AS
  SELECT v.operacao_id, sum(v.valor_liquido) AS total
    FROM public.vw_oc_documentos v
   WHERE NOT v.cancelado AND v.operacao_id IN (SELECT d.operacao_id FROM public.zoo_operacao_documentos d WHERE d.id IN (
     'f7bd1855-e785-436c-998b-c1af6347563b', 'da5768b7-838b-45b8-aa5c-333d009275f2', '2466d8d2-6fd2-4a90-a88e-9b71dd5e51a9',
     '6c93850c-8ada-47b5-9ddd-1d4b70283e90', '7c42d801-2992-48e2-a6b5-f2aa2f0717bc', '15c6a4f9-42a4-4e71-8bb0-03e808b3075f',
     'ebf3fce8-4593-45a7-a479-9f711fdc576b', '259cb004-23f8-4ce2-b640-cc24f972d8ff', 'd03ded12-3a8b-4409-bef1-182697681cfe',
     '4f53e340-16da-4404-8b64-68949ac40eec', '1912022b-7981-4a13-83a8-0a7624febe62', '9de3f142-8f07-48fb-8899-0ede0e824bb1',
     '8824aa2a-9e32-4240-b08c-2d46f942c003', '43a5ce9e-90f7-451a-a28b-550e2e4f63eb', 'e0a2f381-7cd9-4916-8648-77635297a530',
     '2de539f9-6d46-4322-8c2a-f98818f4b1af', '7a8098bf-f0bb-46db-8c0f-4a4dd2fb1d9f'))
   GROUP BY v.operacao_id;

CREATE OR REPLACE FUNCTION public._oc_documento_soma_no_valor(p_tipo_operacao text, p_especie text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $fn$
  SELECT CASE WHEN p_tipo_operacao = 'abate' THEN p_especie IN ('nf_principal', 'nf_complementar')
              WHEN p_tipo_operacao = 'venda' THEN p_especie NOT IN ('gta', 'guia', 'declaracao')
              ELSE true END;
$fn$;

-- 3. o registrar (patch guardado por md5)
CREATE OR REPLACE FUNCTION pg_temp._oc_saida_patch(p_nome text, p_origem text, p_destino text, p_pares text[])
 RETURNS void LANGUAGE plpgsql AS $patch$
DECLARE
  v_src text; v_def text; v_novo text; i int; v_n int; v_acl text; v_sec boolean; v_cfg text;
BEGIN
  SELECT p.prosrc, pg_get_functiondef(p.oid), p.proacl::text, p.prosecdef, p.proconfig::text
    INTO STRICT v_src, v_def, v_acl, v_sec, v_cfg FROM pg_proc p
   WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace;
  IF md5(v_src) = p_destino THEN RETURN; END IF;   -- ja' aplicado
  IF md5(v_src) <> p_origem THEN
    RAISE EXCEPTION 'OC-DOC-SAIDA-FAZENDA-01: % com corpo de origem inesperado (md5 %)', p_nome, md5(v_src); END IF;
  v_novo := v_src;
  FOR i IN 1 .. array_length(p_pares, 1) / 2 LOOP
    v_n := (length(v_novo) - length(replace(v_novo, p_pares[2 * i - 1], ''))) / length(p_pares[2 * i - 1]);
    IF v_n <> 1 THEN RAISE EXCEPTION 'OC-DOC-SAIDA-FAZENDA-01: %, ancora % casa % vez(es), nao 1', p_nome, i, v_n; END IF;
    v_novo := replace(v_novo, p_pares[2 * i - 1], p_pares[2 * i]);
  END LOOP;
  IF md5(v_novo) <> p_destino THEN
    RAISE EXCEPTION 'OC-DOC-SAIDA-FAZENDA-01: % com corpo de destino inesperado (md5 %)', p_nome, md5(v_novo); END IF;
  IF (length(v_def) - length(replace(v_def, v_src, ''))) / length(v_src) <> 1 THEN
    RAISE EXCEPTION 'OC-DOC-SAIDA-FAZENDA-01: %: corpo nao localizado na definicao', p_nome; END IF;
  EXECUTE replace(v_def, v_src, v_novo);
  IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM p_destino
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM v_acl
     OR (SELECT p.prosecdef FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM v_sec
     OR (SELECT p.proconfig::text FROM pg_proc p WHERE p.proname = p_nome AND p.pronamespace = 'public'::regnamespace) IS DISTINCT FROM v_cfg THEN
    RAISE EXCEPTION 'OC-DOC-SAIDA-FAZENDA-01: %: destino, ACL, SECURITY ou search_path nao conferem depois da troca', p_nome; END IF;
END $patch$;

SELECT pg_temp._oc_saida_patch('oc_documento_registrar', 'ff4b1f93d7f6c6c73e1c013c961426a4', 'f3e2d13d8a0ced0cac40cedcaf76c40d', ARRAY[
$a1$  IF v_especie NOT IN ('nf_principal','nf_complementar','recibo','outro','npr','acerto','romaneio') THEN$a1$,
$b1$  IF v_especie NOT IN ('nf_principal','nf_complementar','recibo','outro','npr','acerto','romaneio',
                        'nf_produtor','gta','guia','declaracao') THEN$b1$,
$a2$  IF v_especie IN ('npr','acerto','romaneio') AND v_op.tipo_operacao IS DISTINCT FROM 'abate' THEN
    RAISE EXCEPTION 'Especie % so existe no abate', v_especie USING ERRCODE='P0001'; END IF;$a2$,
$b2$  IF v_especie IN ('npr','acerto','romaneio','nf_produtor') AND v_op.tipo_operacao IS DISTINCT FROM 'abate' THEN
    RAISE EXCEPTION 'Especie % so existe no abate', v_especie USING ERRCODE='P0001'; END IF;
  -- OC-DOC-SAIDA-FAZENDA-01: GTA, guia e declaracao sao documentos da saida da fazenda, no ABATE e na VENDA.
  IF v_especie IN ('gta','guia','declaracao') AND v_op.tipo_operacao NOT IN ('abate','venda') THEN
    RAISE EXCEPTION 'Especie % so existe no abate e na venda', v_especie USING ERRCODE='P0001'; END IF;$b2$]);

-- 4. a conversao por id (guarda do estado medido; idempotente) e o total documentado antes x depois
DO $conv$
DECLARE n int; m_doc int; m_comp int; d text;
BEGIN
  CREATE TEMP TABLE _oc_saida_docs (id uuid, de text, para text) ON COMMIT DROP;
  INSERT INTO _oc_saida_docs VALUES
    ('f7bd1855-e785-436c-998b-c1af6347563b', 'nf_principal', 'nf_produtor'),
    ('da5768b7-838b-45b8-aa5c-333d009275f2', 'nf_principal', 'nf_produtor'),
    ('2466d8d2-6fd2-4a90-a88e-9b71dd5e51a9', 'nf_principal', 'nf_produtor'),
    ('6c93850c-8ada-47b5-9ddd-1d4b70283e90', 'outro', 'guia'), ('7c42d801-2992-48e2-a6b5-f2aa2f0717bc', 'outro', 'guia'),
    ('15c6a4f9-42a4-4e71-8bb0-03e808b3075f', 'outro', 'guia'), ('ebf3fce8-4593-45a7-a479-9f711fdc576b', 'outro', 'guia'),
    ('259cb004-23f8-4ce2-b640-cc24f972d8ff', 'outro', 'guia'), ('d03ded12-3a8b-4409-bef1-182697681cfe', 'outro', 'guia'),
    ('4f53e340-16da-4404-8b64-68949ac40eec', 'outro', 'guia'), ('1912022b-7981-4a13-83a8-0a7624febe62', 'outro', 'guia'),
    ('9de3f142-8f07-48fb-8899-0ede0e824bb1', 'outro', 'guia'),
    ('8824aa2a-9e32-4240-b08c-2d46f942c003', 'outro', 'gta'), ('43a5ce9e-90f7-451a-a28b-550e2e4f63eb', 'outro', 'gta'),
    ('e0a2f381-7cd9-4916-8648-77635297a530', 'outro', 'gta'), ('2de539f9-6d46-4322-8c2a-f98818f4b1af', 'outro', 'gta'),
    ('7a8098bf-f0bb-46db-8c0f-4a4dd2fb1d9f', 'outro', 'gta');
  CREATE TEMP TABLE _oc_saida_comps (id uuid, documento_id uuid, valor numeric) ON COMMIT DROP;
  INSERT INTO _oc_saida_comps VALUES
    ('df80f114-11fd-4104-b62b-f316eefe720d', '6c93850c-8ada-47b5-9ddd-1d4b70283e90', 377.85),
    ('6980755f-4e9a-4da8-ac3d-27a7512b02b5', '7c42d801-2992-48e2-a6b5-f2aa2f0717bc', 765.49),
    ('af9448c0-80da-42d0-ac08-661c2009316d', '15c6a4f9-42a4-4e71-8bb0-03e808b3075f', 1913.72);

  -- guarda: cada documento vivo e na especie de origem ou ja' na de destino; cada componente vivo, no documento, com o valor medido
  SELECT count(*) INTO n FROM public.zoo_operacao_documentos x JOIN _oc_saida_docs s ON s.id = x.id
   WHERE x.cancelado = false AND x.especie IN (s.de, s.para);
  IF n IS DISTINCT FROM 17 THEN RAISE EXCEPTION 'OC-DOC-SAIDA-FAZENDA-01: % de 17 documentos no estado medido. Nada foi gravado.', n; END IF;
  SELECT count(*) INTO n FROM public.zoo_operacao_documento_componentes c JOIN _oc_saida_comps s ON s.id = c.id
   WHERE c.cancelado = false AND c.documento_id = s.documento_id AND c.valor = s.valor AND c.natureza IN ('acrescimo', 'informativo');
  IF n IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'OC-DOC-SAIDA-FAZENDA-01: % de 3 componentes no estado medido. Nada foi gravado.', n; END IF;
  SELECT count(*) INTO n FROM public.zoo_operacao_documento_componentes c
   WHERE c.cancelado = false AND c.documento_id IN (SELECT id FROM _oc_saida_docs) AND c.id NOT IN (SELECT id FROM _oc_saida_comps);
  IF n IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'OC-DOC-SAIDA-FAZENDA-01: % componente(s) fora do medido nos 17 documentos. Nada foi gravado.', n; END IF;

  UPDATE public.zoo_operacao_documentos x SET especie = s.para FROM _oc_saida_docs s WHERE x.id = s.id AND x.especie = s.de;
  GET DIAGNOSTICS m_doc = ROW_COUNT;
  UPDATE public.zoo_operacao_documento_componentes c SET natureza = 'informativo'
   WHERE c.id IN (SELECT id FROM _oc_saida_comps) AND c.natureza = 'acrescimo';
  GET DIAGNOSTICS m_comp = ROW_COUNT;

  -- o total documentado de cada OC tocada: igual antes x depois
  SELECT string_agg(left(a.operacao_id::text, 8) || ' ' || a.total || ' -> ' || coalesce(b.total::text, '∅'), '; ') INTO d
    FROM _oc_saida_total_antes a
    LEFT JOIN (SELECT v.operacao_id, sum(v.valor_liquido) AS total FROM public.vw_oc_documentos v WHERE NOT v.cancelado GROUP BY v.operacao_id) b
      ON b.operacao_id = a.operacao_id
   WHERE b.total IS DISTINCT FROM a.total;
  IF d IS NOT NULL THEN RAISE EXCEPTION 'OC-DOC-SAIDA-FAZENDA-01: o total documentado mudou (%). Nada foi gravado.', d; END IF;
  IF (SELECT count(*) FROM _oc_saida_total_antes) IS DISTINCT FROM 9 THEN
    RAISE EXCEPTION 'OC-DOC-SAIDA-FAZENDA-01: % de 9 OCs na conferencia do total. Nada foi gravado.', (SELECT count(*) FROM _oc_saida_total_antes); END IF;
  RAISE NOTICE 'OC-DOC-SAIDA-FAZENDA-01: % documentos e % componentes convertidos; total documentado das 9 OCs igual', m_doc, m_comp;
END $conv$;
