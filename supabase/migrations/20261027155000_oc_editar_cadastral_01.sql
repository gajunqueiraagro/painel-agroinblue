-- OC-EDITAR-CADASTRAL-01 — com a OC FECHADA so' os campos CADASTRAIS se editam, e a troca de contraparte leva junto
-- o favorecido dos compromissos que ainda nao geraram titulo (decisoes do Gabriel, 26/09/2026).
--
--   `oc_editar_dados_operacao`: md5(prosrc) ba017ed7d9f81a86fc4d096085085cb2 -> (ver o fim do arquivo).
--   CORPO INTEGRAL, sem comentario interno (comentario dentro de $$ entra no prosrc) — a explicacao mora aqui.
--
--   (a) `data_operacao` SAI DA LISTA. Pelo contrato de 30/08 (PR-OC-EDICAO-POS-FECHAMENTO-01) ela era "segura", e
--       deixou de ser: a data da OC vira COMPETENCIA no Vincular (VINCULAR-LANC-OC-01), semeia o vencimento da
--       previsao e decide o mes do P1. A lista fica `contraparte_id`, `observacoes`, `numero_documento`. Chave fora
--       dela continua estourando NOMEANDO a chave.
--   (b) TROCA DE CONTRAPARTE: o compromisso NAO CANCELADO, SEM TITULO VIVO, cujo favorecido era a contraparte
--       ANTERIOR passa para a nova — `oc_materializar_programacao` carimba no titulo o favorecido do COMPROMISSO, entao
--       sem isto o proximo titulo nasceria com a contraparte antiga. "Aberto" na decisao do Gabriel e' "ainda sem
--       titulo", nao o status literal: medido, sao 144 `programado` e 1 `aberto`.
--       ⚠ TITULO JA GERADO NUNCA MUDA (o favorecido do titulo e' do Financeiro); compromisso com qualquer parte viva
--         com `financeiro_lancamento_id` fica como esta'. Obrigacao com favorecido PROPRIO (frete, taxas) nao casa
--         com a contraparte anterior e nao muda.
--       ⚠ Nada em `zoo_operacao_partes`, `financeiro_lancamentos_v2`, `conciliacao_bancaria_itens` ou hash e' tocado.
--         As tres tabelas de compromisso/programacao nao tem trigger (conferido).
--       O evento `editar_dados` leva `compromissos` em `dados_anteriores`/`dados_novos` (id + favorecido de/para), e o
--       retorno devolve `compromissos_atualizados`.
--   ACL: REVOKE de PUBLIC e anon; EXECUTE so' authenticated e service_role (o proacl de antes ja era esse).

CREATE OR REPLACE FUNCTION public.oc_editar_dados_operacao(p_operacao_id uuid, p_cliente_id uuid, p_payload jsonb, p_versao_esperada integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor      uuid := auth.uid();
  v_is_service boolean;
  v_is_admin   boolean;
  v_tem_acesso boolean;
  v_op         public.zoo_operacoes_comerciais;
  v_novo       public.zoo_operacoes_comerciais;
  v_chave      text;
  v_antes      jsonb := '{}'::jsonb;
  v_depois     jsonb := '{}'::jsonb;
  v_comp_antes jsonb := '[]'::jsonb;
  v_comp_depois jsonb := '[]'::jsonb;
  v_permitidas text[] := ARRAY['contraparte_id','observacoes','numero_documento'];
BEGIN
  v_is_service := (COALESCE(auth.role(), '') = 'service_role');
  v_is_admin   := (v_actor IS NOT NULL AND public.is_admin_agroinblue(v_actor));
  v_tem_acesso := (v_actor IS NOT NULL AND p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor)));
  IF NOT (v_is_service OR v_is_admin OR v_tem_acesso) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Payload deve ser um objeto JSON' USING ERRCODE = 'P0001';
  END IF;

  FOR v_chave IN SELECT jsonb_object_keys(p_payload) LOOP
    IF NOT (v_chave = ANY (v_permitidas)) THEN
      RAISE EXCEPTION 'Campo % nao pode ser editado por oc_editar_dados_operacao', v_chave
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002';
  END IF;

  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operacao cancelada nao pode ser editada' USING ERRCODE = 'P0001';
  END IF;

  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao
      USING ERRCODE = '40001';
  END IF;

  IF p_payload ? 'contraparte_id'    THEN v_antes := v_antes || jsonb_build_object('contraparte_id',    to_jsonb(v_op.contraparte_id)); END IF;
  IF p_payload ? 'observacoes'       THEN v_antes := v_antes || jsonb_build_object('observacoes',       to_jsonb(v_op.observacoes)); END IF;
  IF p_payload ? 'numero_documento'  THEN v_antes := v_antes || jsonb_build_object('numero_documento',  to_jsonb(v_op.numero_documento)); END IF;

  UPDATE public.zoo_operacoes_comerciais SET
    contraparte_id   = CASE WHEN p_payload ? 'contraparte_id'   THEN NULLIF(p_payload->>'contraparte_id','')::uuid ELSE contraparte_id   END,
    observacoes      = CASE WHEN p_payload ? 'observacoes'      THEN NULLIF(p_payload->>'observacoes','')          ELSE observacoes      END,
    numero_documento = CASE WHEN p_payload ? 'numero_documento' THEN NULLIF(p_payload->>'numero_documento','')     ELSE numero_documento END,
    versao     = versao + 1,
    updated_at = now(),
    updated_by = v_actor
  WHERE id = p_operacao_id;

  SELECT * INTO v_novo FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;

  IF p_payload ? 'contraparte_id'
     AND v_op.contraparte_id IS NOT NULL AND v_novo.contraparte_id IS NOT NULL
     AND v_novo.contraparte_id IS DISTINCT FROM v_op.contraparte_id THEN
    WITH elegiveis AS (
      SELECT c.id
        FROM public.zoo_operacao_compromissos c
       WHERE c.operacao_id = p_operacao_id
         AND c.cliente_id = p_cliente_id
         AND c.status <> 'cancelado'
         AND c.favorecido_id = v_op.contraparte_id
         AND NOT EXISTS (
           SELECT 1
             FROM public.zoo_operacao_programacoes pg
             JOIN public.zoo_operacao_parcelas_programacao pp ON pp.programacao_id = pg.id
             JOIN public.zoo_operacao_partes p ON p.programacao_parcela_id = pp.id
            WHERE pg.compromisso_id = c.id
              AND p.cancelada = false
              AND p.financeiro_lancamento_id IS NOT NULL)
       FOR UPDATE OF c
    ), upd AS (
      UPDATE public.zoo_operacao_compromissos c
         SET favorecido_id = v_novo.contraparte_id, updated_at = now()
        FROM elegiveis e
       WHERE c.id = e.id
      RETURNING c.id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', upd.id, 'favorecido_id', v_op.contraparte_id) ORDER BY upd.id), '[]'::jsonb),
           COALESCE(jsonb_agg(jsonb_build_object('id', upd.id, 'favorecido_id', v_novo.contraparte_id) ORDER BY upd.id), '[]'::jsonb)
      INTO v_comp_antes, v_comp_depois
      FROM upd;
  END IF;

  IF p_payload ? 'contraparte_id'    THEN v_depois := v_depois || jsonb_build_object('contraparte_id',    to_jsonb(v_novo.contraparte_id)); END IF;
  IF p_payload ? 'observacoes'       THEN v_depois := v_depois || jsonb_build_object('observacoes',       to_jsonb(v_novo.observacoes)); END IF;
  IF p_payload ? 'numero_documento'  THEN v_depois := v_depois || jsonb_build_object('numero_documento',  to_jsonb(v_novo.numero_documento)); END IF;
  IF jsonb_array_length(v_comp_depois) > 0 THEN
    v_antes  := v_antes  || jsonb_build_object('compromissos', v_comp_antes);
    v_depois := v_depois || jsonb_build_object('compromissos', v_comp_depois);
  END IF;

  INSERT INTO public.zoo_operacao_eventos (
    cliente_id, operacao_id, acao, detalhes, dados_anteriores, dados_novos, usuario_id, origem)
  VALUES (
    p_cliente_id, p_operacao_id, 'editar_dados',
    jsonb_build_object('mensagem', 'Edicao de dados da operacao com status ' || v_op.status_comercial),
    v_antes, v_depois, v_actor, 'rpc');

  RETURN jsonb_build_object(
    'ok',               true,
    'operacao_id',      p_operacao_id,
    'versao',           v_novo.versao,
    'status_comercial', v_novo.status_comercial,
    'rascunho',         v_novo.rascunho,
    'valor_total',      v_novo.valor_total,
    'compromissos_atualizados', jsonb_array_length(v_comp_depois));
END;
$function$;

REVOKE ALL ON FUNCTION public.oc_editar_dados_operacao(uuid, uuid, jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.oc_editar_dados_operacao(uuid, uuid, jsonb, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.oc_editar_dados_operacao(uuid, uuid, jsonb, integer) TO authenticated, service_role;
