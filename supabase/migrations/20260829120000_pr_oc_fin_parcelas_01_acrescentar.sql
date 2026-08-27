-- PR-OC-FIN-PARCELAS-01 — 4o writer comportamental: oc_acrescentar_parcelas.
--
--   PROPOSITO: acrescentar parcelas a PROGRAMACAO ATIVA que ja existe, para alcancar o
--   saldo a programar de um compromisso programado parcialmente. Caso concreto: OC
--   765058f8, compromisso 92e9667f — valor 326.250,00, programacao ativa de 206.250,00
--   ja materializada e paga, e 120.000,00 que a tela mostrava (card "A programar",
--   d9aae3aa) sem oferecer caminho nenhum.
--
--   ⚠ POR QUE NAO E' "SEGUNDA PROGRAMACAO". Uma programacao ativa por compromisso e'
--   garantia ESTRUTURAL, nao apenas guard de funcao:
--       CREATE UNIQUE INDEX zoo_operacao_programacoes_ativa_uniq
--         ON zoo_operacao_programacoes (compromisso_id) WHERE status = 'ativa'
--   Relaxar o guard de oc_programar_compromisso nao bastaria — o INSERT bateria no
--   indice. Derrubar o indice foi considerado e RECUSADO: e' decisao deliberada do
--   modelo. Este writer respeita a garantia e cresce a programacao existente.
--
--   ESPELHO INVERTIDO DA IRMA. oc_programar_compromisso EXIGE ausencia de programacao
--   ativa; esta EXIGE presenca. Fora esse par, guards, ordem, codigos de erro e
--   aritmetica do teto sao copia da irma — nao reinvencao.
--
--   NAO TOCA EM PARCELA EXISTENTE: so INSERT. Materializado e pago ficam intactos, e o
--   compromisso permanece 'programado' (nao ha transicao de status a fazer).
--
--   CONTRATOS HERDADOS: SECURITY DEFINER, search_path pg_catalog,public; auth em 3
--   camadas; operacao FOR UPDATE + cliente derivado; version lock (40001); evento em
--   zoo_operacao_eventos; versao+1 obrigatorio; GRANT authenticated + service_role.
--
--   Requer PROTO (binbcdfbisgscrifztia). NUNCA em producao.

CREATE OR REPLACE FUNCTION public.oc_acrescentar_parcelas(
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
  v_soma_novo numeric; v_soma_outras numeric; v_soma_final numeric;
  v_max_seq int; v_seq int;
  v_item jsonb; v_valor numeric; v_venc date; v_conta uuid; v_forma text;
  v_novas_json jsonb;
BEGIN
  -- 1) auth em 3 camadas (verbatim da irma).
  v_is_service := (COALESCE(auth.role(), '') = 'service_role');
  v_is_admin   := (v_actor IS NOT NULL AND public.is_admin_agroinblue(v_actor));

  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  v_cli := v_op.cliente_id;
  v_tem_acesso := (v_actor IS NOT NULL AND v_cli IN (SELECT public.get_user_cliente_ids(v_actor)));
  IF NOT (v_is_service OR v_is_admin OR v_tem_acesso) THEN
    RAISE EXCEPTION 'Sem permissao para acrescentar parcelas nesta operacao (acesso ao cliente exigido)' USING ERRCODE = '42501';
  END IF;

  -- 2) version lock.
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;

  -- 3) estado da operacao.
  IF v_op.rascunho THEN
    RAISE EXCEPTION 'Operacao em rascunho nao permite programacao' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operacao cancelada nao permite programacao' USING ERRCODE = 'P0001'; END IF;

  -- 4) compromisso do tenant, travado.
  SELECT * INTO v_comp FROM public.zoo_operacao_compromissos
    WHERE id = p_compromisso_id AND operacao_id = p_operacao_id AND cliente_id = v_cli FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compromisso % nao encontrado nesta operacao', p_compromisso_id USING ERRCODE = 'P0001'; END IF;
  IF v_comp.status = 'cancelado' THEN
    RAISE EXCEPTION 'Compromisso cancelado nao pode receber parcelas.' USING ERRCODE = 'P0001'; END IF;

  -- 5) GUARD PROPRIO — aqui a programacao ativa e' REQUISITO, nao impedimento.
  --    A mensagem nomeia o outro writer: quem cai aqui esta no caminho errado, e o
  --    caminho certo existe.
  SELECT pr.id INTO v_prog_id FROM public.zoo_operacao_programacoes pr
   WHERE pr.compromisso_id = p_compromisso_id AND pr.status = 'ativa' FOR UPDATE;
  IF v_prog_id IS NULL THEN
    RAISE EXCEPTION 'Compromisso sem programacao ativa; use a primeira programacao.' USING ERRCODE = 'P0001'; END IF;

  -- 6) payload (mesmas validacoes da irma, MENOS a de sequencia contigua: aqui a
  --    sequencia e' do SERVIDOR, entao nao ha o que validar no que chega).
  IF jsonb_typeof(p_payload->'parcelas') <> 'array' OR jsonb_array_length(COALESCE(p_payload->'parcelas','[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos uma parcela.' USING ERRCODE = 'P0001'; END IF;
  SELECT COALESCE(SUM((e->>'valor')::numeric),0) INTO v_soma_novo
    FROM jsonb_array_elements(p_payload->'parcelas') e;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'parcelas') e WHERE COALESCE((e->>'valor')::numeric, 0) <= 0) THEN
    RAISE EXCEPTION 'Valor de parcela deve ser > 0.' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'parcelas') e
              WHERE NULLIF(e->>'conta_bancaria_id','') IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM public.financeiro_contas_bancarias cb
                                 WHERE cb.id = (e->>'conta_bancaria_id')::uuid AND cb.cliente_id = v_cli)) THEN
    RAISE EXCEPTION 'Conta bancaria nao pertence a este cliente.' USING ERRCODE = 'P0001'; END IF;

  -- 7) TETO — aritmetica IDENTICA a da irma, inclusive o recorte de status: parcela
  --    CANCELADA nao conta, porque nao consome o compromisso.
  SELECT COALESCE(SUM(pp.valor), 0) INTO v_soma_outras
    FROM public.zoo_operacao_parcelas_programacao pp
    JOIN public.zoo_operacao_programacoes pr ON pr.id = pp.programacao_id
   WHERE pr.compromisso_id = p_compromisso_id AND pr.status = 'ativa'
     AND pp.status IN ('prevista','materializada','paga');
  IF round(v_soma_novo + v_soma_outras, 2) > round(v_comp.valor_total, 2) THEN
    RAISE EXCEPTION 'Soma das parcelas (%) excede o valor do compromisso (%).',
      round(v_soma_novo + v_soma_outras, 2), round(v_comp.valor_total, 2) USING ERRCODE = 'P0001'; END IF;

  -- 8) SEQUENCIA CONTINUA A EXISTENTE, canceladas INCLUSIVE. `zoo_operacao_parcelas_
  --    programacao_seq_uniq` e' UNIQUE (programacao_id, sequencia) e nao distingue
  --    status: reaproveitar o numero de uma parcela cancelada violaria o indice.
  SELECT COALESCE(max(pp.sequencia), 0) INTO v_max_seq
    FROM public.zoo_operacao_parcelas_programacao pp
   WHERE pp.programacao_id = v_prog_id;

  -- WITH ORDINALITY + ORDER BY: a numeracao segue a ordem em que o cliente escreveu o
  --   array. Sem isso a ordem das linhas do jsonb_array_elements nao e' contratual.
  v_seq := v_max_seq;
  FOR v_item IN
    SELECT e FROM jsonb_array_elements(p_payload->'parcelas') WITH ORDINALITY AS t(e, ord) ORDER BY t.ord
  LOOP
    v_seq   := v_seq + 1;
    v_valor := (v_item->>'valor')::numeric;
    v_venc  := NULLIF(v_item->>'vencimento','')::date;
    v_conta := NULLIF(v_item->>'conta_bancaria_id','')::uuid;
    v_forma := NULLIF(v_item->>'forma','');
    -- `sequencia` NUNCA sai do payload: se o cliente mandar, e' ignorada de proposito.
    INSERT INTO public.zoo_operacao_parcelas_programacao
      (cliente_id, programacao_id, sequencia, valor, vencimento, conta_bancaria_id, forma, status)
    VALUES (v_cli, v_prog_id, v_seq, v_valor, v_venc, v_conta, v_forma, 'prevista');
  END LOOP;

  -- 9) so as NOVAS no retorno (sequencia > max anterior); as antigas nao foram tocadas.
  SELECT jsonb_agg(to_jsonb(pp) ORDER BY pp.sequencia) INTO v_novas_json
    FROM public.zoo_operacao_parcelas_programacao pp
   WHERE pp.programacao_id = v_prog_id AND pp.sequencia > v_max_seq;

  SELECT COALESCE(SUM(pp.valor), 0) INTO v_soma_final
    FROM public.zoo_operacao_parcelas_programacao pp
    JOIN public.zoo_operacao_programacoes pr ON pr.id = pp.programacao_id
   WHERE pr.compromisso_id = p_compromisso_id AND pr.status = 'ativa'
     AND pp.status IN ('prevista','materializada','paga');

  -- 10) evento PROPRIO: acrescentar nao e' programar, e a auditoria precisa distinguir.
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (v_cli, p_operacao_id, 'acrescentar_parcelas',
    jsonb_build_object('compromisso_id', p_compromisso_id, 'programacao_id', v_prog_id,
                       'sequencia_inicial', v_max_seq + 1,
                       'parcelas', COALESCE(v_novas_json, '[]'::jsonb),
                       'soma_programada', v_soma_final),
    v_actor, 'rpc');

  -- 11) versao+1 + re-leitura.
  UPDATE public.zoo_operacoes_comerciais
     SET versao = versao + 1, updated_at = now(), updated_by = v_actor
   WHERE id = p_operacao_id;
  SELECT versao INTO v_nova_versao FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;

  RETURN jsonb_build_object(
    'ok', true,
    'operacao_id', p_operacao_id,
    'operacao_versao', v_nova_versao,
    'programacao_id', v_prog_id,
    'parcelas_criadas', COALESCE(v_novas_json, '[]'::jsonb),
    'soma_programada', v_soma_final
  );
END;
$function$;

COMMENT ON FUNCTION public.oc_acrescentar_parcelas(uuid, integer, uuid, jsonb) IS
  'PR-OC-FIN-PARCELAS-01: acrescenta parcelas a programacao ATIVA de um compromisso, para alcancar o saldo a programar. Espelho invertido de oc_programar_compromisso (aquela exige ausencia de programacao ativa; esta exige presenca), preservando o indice zoo_operacao_programacoes_ativa_uniq. Sequencia atribuida pelo servidor a partir de max(sequencia)+1 da propria programacao, canceladas inclusive. Teto: Sigma parcelas nao canceladas <= compromisso.valor_total. So INSERT: nenhuma parcela existente e alterada, e o compromisso permanece programado.';

-- Grants: writer comportamental. authenticated + service_role executam; corpo autoriza por tenant/admin/service.
REVOKE ALL ON FUNCTION public.oc_acrescentar_parcelas(uuid, integer, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.oc_acrescentar_parcelas(uuid, integer, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.oc_acrescentar_parcelas(uuid, integer, uuid, jsonb) TO authenticated, service_role;
