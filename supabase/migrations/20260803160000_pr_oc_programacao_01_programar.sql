-- PR-PROGRAMACAO-01 — 2o writer comportamental: oc_programar_compromisso.
--
--   PROPOSITO: cria a PROGRAMACAO (plano de pagamento) + suas PARCELAS de UM compromisso existente.
--   NAO cria compromisso, NAO materializa titulo, NAO cria zoo_operacao_partes, NAO renegocia (2a
--   programacao ativa e BLOQUEADA, nunca substituida). 2o teto: Sigma parcelas <= compromisso.valor_total.
--
--   DECISOES DE PRODUTO: vencimento PODE ser NULL (intencao de pagamento); forma OPCIONAL; sequencia
--   OBRIGATORIAMENTE CONTIGUA 1..N; Sigma PARCIAL permitido (<=, nunca ==); a 1a programacao move o
--   compromisso aberto->programado; este writer APENAS cria (nao recalcula/reclassifica programacao existente).
--
--   CONTRATOS HERDADOS (oc_criar_compromisso): SECURITY DEFINER, search_path pg_catalog,public; auth 3
--   camadas; operacao FOR UPDATE + cliente derivado; version lock (40001); evento zoo_operacao_eventos
--   (dados_novos); versao+1 obrigatorio; GRANT authenticated+service_role. Padrao de INSERT multi-linha =
--   FOR loop sobre jsonb_array_elements (idioma de oc_gerar_obrigacoes). Sem trigger em compromissos.
--
--   Requer PROTO (binbcdfbisgscrifztia). NUNCA em producao.

CREATE OR REPLACE FUNCTION public.oc_programar_compromisso(
  p_operacao_id uuid,
  p_versao_esperada integer,
  p_compromisso_id uuid,
  p_payload jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_is_service boolean; v_is_admin boolean; v_tem_acesso boolean;
  v_op public.zoo_operacoes_comerciais;
  v_cli uuid;
  v_comp public.zoo_operacao_compromissos;
  v_prog_id uuid; v_nova_versao integer;
  v_n int; v_minseq int; v_maxseq int; v_distinct int;
  v_soma_novo numeric; v_soma_outras numeric;
  v_item jsonb; v_seq int; v_valor numeric; v_venc date; v_conta uuid; v_forma text;
  v_prog_row jsonb; v_parcelas_json jsonb;
BEGIN
  -- 1) AUTH 3 camadas.
  v_is_service := (COALESCE(auth.role(), '') = 'service_role');
  v_is_admin   := (v_actor IS NOT NULL AND public.is_admin_agroinblue(v_actor));

  -- 2) operacao FOR UPDATE; cliente DERIVADO; version lock.
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  v_cli := v_op.cliente_id;
  v_tem_acesso := (v_actor IS NOT NULL AND v_cli IN (SELECT public.get_user_cliente_ids(v_actor)));
  IF NOT (v_is_service OR v_is_admin OR v_tem_acesso) THEN
    RAISE EXCEPTION 'Sem permissao para programar compromisso nesta operacao (acesso ao cliente exigido)' USING ERRCODE = '42501';
  END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;

  -- 3) estados da operacao.
  IF v_op.rascunho THEN
    RAISE EXCEPTION 'Operacao em rascunho nao permite programacao' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operacao cancelada nao permite programacao' USING ERRCODE = 'P0001'; END IF;

  -- 4) compromisso FOR UPDATE: pertence a operacao+cliente; nao cancelado.
  SELECT * INTO v_comp FROM public.zoo_operacao_compromissos
    WHERE id = p_compromisso_id AND operacao_id = p_operacao_id AND cliente_id = v_cli FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compromisso % nao encontrado nesta operacao', p_compromisso_id USING ERRCODE = 'P0001'; END IF;
  -- Ajuste 1: SO 'aberto' recebe a PRIMEIRA programacao. 'programado' (mesmo sem programacao ativa,
  --   cenario futuro pos-renegociacao) NAO recebe "primeira" programacao por este writer — seria
  --   reprogramacao disfarcada (frente propria). 'cancelado' idem.
  IF v_comp.status = 'cancelado' THEN
    RAISE EXCEPTION 'Compromisso cancelado nao pode ser programado.' USING ERRCODE = 'P0001'; END IF;
  IF v_comp.status = 'programado' THEN
    RAISE EXCEPTION 'Compromisso ja programado. Reprogramacao e frente propria.' USING ERRCODE = 'P0001'; END IF;
  IF v_comp.status <> 'aberto' THEN
    RAISE EXCEPTION 'Compromisso deve estar aberto para a primeira programacao (estado %).', v_comp.status USING ERRCODE = 'P0001'; END IF;

  -- 5) UNICIDADE: nao pode haver 2a programacao ativa (renegociacao e frente propria).
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_programacoes pr
              WHERE pr.compromisso_id = p_compromisso_id AND pr.status = 'ativa') THEN
    RAISE EXCEPTION 'Compromisso ja possui programacao ativa. Renegociacao e frente propria.' USING ERRCODE = 'P0001'; END IF;

  -- 6) validar parcelas: array nao-vazio; sequencias CONTIGUAS 1..N; valor>0; conta do tenant.
  IF jsonb_typeof(p_payload->'parcelas') <> 'array' OR jsonb_array_length(COALESCE(p_payload->'parcelas','[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos uma parcela.' USING ERRCODE = 'P0001'; END IF;
  SELECT count(*), COALESCE(SUM((e->>'valor')::numeric),0),
         min((e->>'sequencia')::int), max((e->>'sequencia')::int), count(DISTINCT (e->>'sequencia')::int)
    INTO v_n, v_soma_novo, v_minseq, v_maxseq, v_distinct
    FROM jsonb_array_elements(p_payload->'parcelas') e;
  IF v_minseq <> 1 OR v_maxseq <> v_n OR v_distinct <> v_n THEN
    RAISE EXCEPTION 'As sequencias das parcelas devem ser contiguas comecando em 1.' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'parcelas') e WHERE COALESCE((e->>'valor')::numeric, 0) <= 0) THEN
    RAISE EXCEPTION 'Valor de parcela deve ser > 0.' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'parcelas') e
              WHERE NULLIF(e->>'conta_bancaria_id','') IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM public.financeiro_contas_bancarias cb
                                 WHERE cb.id = (e->>'conta_bancaria_id')::uuid AND cb.cliente_id = v_cli)) THEN
    RAISE EXCEPTION 'Conta bancaria nao pertence a este cliente.' USING ERRCODE = 'P0001'; END IF;

  -- 7) 2o TETO (a prova de renegociacao futura): novas + parcelas das DEMAIS programacoes ATIVAS <= valor_total.
  --    Hoje o 2o somatorio e 0 (UNIQUE impede 2a ativa), mas escrito para sobreviver a renegociacao.
  --   Ajuste 2: filtro POSITIVO (coerente com o 1o writer): programacao status='ativa' E parcela status
  --   IN ('prevista','materializada','paga'). Nao usar '<> cancelada' (estados futuros nao contariam por engano).
  SELECT COALESCE(SUM(pp.valor), 0) INTO v_soma_outras
    FROM public.zoo_operacao_parcelas_programacao pp
    JOIN public.zoo_operacao_programacoes pr ON pr.id = pp.programacao_id
   WHERE pr.compromisso_id = p_compromisso_id AND pr.status = 'ativa'
     AND pp.status IN ('prevista','materializada','paga');
  IF round(v_soma_novo + v_soma_outras, 2) > round(v_comp.valor_total, 2) THEN
    RAISE EXCEPTION 'Soma das parcelas (%) excede o valor do compromisso (%).',
      round(v_soma_novo + v_soma_outras, 2), round(v_comp.valor_total, 2) USING ERRCODE = 'P0001'; END IF;

  -- 8) INSERT programacao (status='ativa').
  INSERT INTO public.zoo_operacao_programacoes (cliente_id, compromisso_id, condicoes, status)
  VALUES (v_cli, p_compromisso_id, p_payload->>'condicoes', 'ativa')
  RETURNING id INTO v_prog_id;

  -- 9) INSERT N parcelas (status='prevista') — FOR loop (idioma de oc_gerar_obrigacoes).
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'parcelas')
  LOOP
    v_seq   := (v_item->>'sequencia')::int;
    v_valor := (v_item->>'valor')::numeric;
    v_venc  := NULLIF(v_item->>'vencimento','')::date;          -- PODE ser NULL
    v_conta := NULLIF(v_item->>'conta_bancaria_id','')::uuid;   -- OPCIONAL
    v_forma := NULLIF(v_item->>'forma','');                     -- OPCIONAL
    INSERT INTO public.zoo_operacao_parcelas_programacao
      (cliente_id, programacao_id, sequencia, valor, vencimento, conta_bancaria_id, forma, status)
    VALUES (v_cli, v_prog_id, v_seq, v_valor, v_venc, v_conta, v_forma, 'prevista');
  END LOOP;

  -- 10) transicao compromisso aberto->programado (CHECK aceita 'programado'; sem trigger reativo).
  UPDATE public.zoo_operacao_compromissos SET status = 'programado', updated_at = now() WHERE id = p_compromisso_id;

  SELECT to_jsonb(pr) INTO v_prog_row FROM public.zoo_operacao_programacoes pr WHERE pr.id = v_prog_id;
  SELECT jsonb_agg(to_jsonb(pp) ORDER BY pp.sequencia) INTO v_parcelas_json
    FROM public.zoo_operacao_parcelas_programacao pp WHERE pp.programacao_id = v_prog_id;

  -- 11) evento (literal do padrao de oc_criar_compromisso).
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (v_cli, p_operacao_id, 'programar_compromisso',
    jsonb_build_object('compromisso_id', p_compromisso_id, 'programacao', v_prog_row, 'parcelas', v_parcelas_json),
    v_actor, 'rpc');

  -- 12) versao+1 + re-leitura.
  UPDATE public.zoo_operacoes_comerciais
     SET versao = versao + 1, updated_at = now(), updated_by = v_actor
   WHERE id = p_operacao_id;
  SELECT versao INTO v_nova_versao FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;

  RETURN jsonb_build_object('programacao', v_prog_row, 'parcelas', COALESCE(v_parcelas_json, '[]'::jsonb), 'operacao_versao', v_nova_versao);
END;
$function$;

-- Grants: writer comportamental. authenticated + service_role executam; corpo autoriza por tenant/admin/service.
REVOKE ALL ON FUNCTION public.oc_programar_compromisso(uuid, integer, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.oc_programar_compromisso(uuid, integer, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.oc_programar_compromisso(uuid, integer, uuid, jsonb) TO authenticated, service_role;
