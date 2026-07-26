-- PR-OC-FIN-CONTRATO-OBRIGACAO-01 — FIX de runtime: resolução de financeiro_plano_contas.id (uuid).
--   Defeito na migration 20260726160000 (já aplicada, mantida imutável): a resolução usava
--     SELECT count(*), max(pc.id) ...  → ERROR 42883 'function max(uuid) does not exist'.
--   Trilha corretiva PRÓPRIA. CREATE OR REPLACE de public.oc_gerar_obrigacoes preservando VERBATIM todo o
--   contrato e guards (SECURITY DEFINER, search_path, FOR UPDATE, tenant, status/rascunho/cancelada,
--   versão/40001, componente, documento, base integral, classificação obrigatória, favorecido,
--   idempotência, guarda de 2ª base, materialização/vínculos, REVOKE/GRANT). ÚNICA mudança: a resolução
--   do UUID passa a ser em DUAS etapas com predicados LITERALMENTE equivalentes —
--     (1) SELECT count(*) → decide none/ambiguous/ok; (2) somente quando count=1, SELECT pc.id ... LIMIT 1.
--   Sem MAX/MIN sobre uuid. Sem precedência global×cliente (mesma hierarquia continua ambiguous).
--   NÃO cria/altera tabela, coluna, constraint nem dados de negócio.

CREATE OR REPLACE FUNCTION public.oc_gerar_obrigacoes(
    p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_esperada text;
  v_base_entrada boolean;
  v_item jsonb;
  v_natureza text; v_componente text; v_fluxo text;
  v_valor numeric; v_venc date; v_seq int; v_qtd int;
  v_incluso boolean; v_sem_caixa boolean; v_materializar boolean;
  v_doc_id uuid; v_doc_comp_id uuid; v_fav uuid; v_chave text;
  v_origem text; v_tipo_op text; v_sinal text; v_data_pag date;
  v_parte_id uuid; v_tit_id uuid; v_existente uuid;
  v_criadas jsonb := '[]'::jsonb;
  v_base numeric; v_soma_principal numeric;
  v_plano_tipo text; v_plano_cnt int; v_plano_resolved uuid; v_plano_informado uuid;
  v_ex_valor numeric; v_ex_nat text; v_ex_comp text;
  v_chaves_principais text[];
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE='42501'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id=p_operacao_id AND cliente_id=p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE='P0002'; END IF;
  IF v_op.rascunho OR v_op.status_comercial='rascunho' THEN
    RAISE EXCEPTION 'Rascunho nao permite geracao de obrigacoes' USING ERRCODE='P0001'; END IF;
  IF v_op.status_comercial <> 'fechada' THEN
    RAISE EXCEPTION 'Somente operacoes fechadas geram obrigacoes (estado %)', v_op.status_comercial USING ERRCODE='P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE='40001'; END IF;

  v_esperada    := CASE v_op.tipo_operacao WHEN 'compra' THEN 'pagar' ELSE 'receber' END;
  v_base_entrada := (v_op.tipo_operacao IN ('venda','abate'));

  -- (a) COERÊNCIA DA BASE — sobre o CONJUNTO SUBMETIDO (soma das partes principais do payload).
  v_base := v_op.valor_acordado;
  v_soma_principal := COALESCE((
      SELECT SUM(COALESCE(NULLIF(e->>'valor','')::numeric, 0))
        FROM jsonb_array_elements(COALESCE(p_payload->'obrigacoes','[]'::jsonb)) e
       WHERE e->>'natureza' = 'principal'), 0);
  IF v_soma_principal > 0 THEN
    IF v_base IS NULL OR v_base <= 0 THEN
      RAISE EXCEPTION 'Base negociada ausente ou invalida (valor_acordado=%)', v_base USING ERRCODE='P0001'; END IF;
    IF v_soma_principal <> v_base THEN
      RAISE EXCEPTION 'A obrigacao principal (R$ %) deve corresponder ao valor integral negociado (R$ %)', v_soma_principal, v_base USING ERRCODE='P0001'; END IF;
  END IF;

  -- GUARDA SERVER-SIDE contra 2ª base obrigacional integral (sob o lock FOR UPDATE, serializa concorrência).
  IF v_soma_principal > 0 THEN
    v_chaves_principais := ARRAY(
      SELECT e->>'chave_idempotencia'
        FROM jsonb_array_elements(COALESCE(p_payload->'obrigacoes','[]'::jsonb)) e
       WHERE e->>'natureza' = 'principal' AND NULLIF(e->>'chave_idempotencia','') IS NOT NULL);
    IF EXISTS (
        SELECT 1 FROM public.zoo_operacao_partes pp
         WHERE pp.operacao_id = p_operacao_id
           AND pp.natureza = 'principal'
           AND pp.cancelada IS NOT TRUE
           AND (pp.chave_idempotencia IS NULL OR pp.chave_idempotencia <> ALL(v_chaves_principais))) THEN
      RAISE EXCEPTION 'Ja existe obrigacao principal ativa nesta operacao; saneamento necessario antes de gerar outra base integral' USING ERRCODE='P0001';
    END IF;
    IF COALESCE(array_length(v_chaves_principais, 1), 0) <> (SELECT count(DISTINCT c) FROM unnest(v_chaves_principais) c) THEN
      RAISE EXCEPTION 'Chaves de idempotencia principais duplicadas no payload' USING ERRCODE='P0001';
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'obrigacoes','[]'::jsonb))
  LOOP
    v_natureza  := v_item->>'natureza';
    v_componente := v_item->>'componente';
    v_fluxo     := v_item->>'natureza_fluxo';
    v_valor     := COALESCE(NULLIF(v_item->>'valor','')::numeric, 0);
    v_venc      := NULLIF(v_item->>'data_vencimento','')::date;
    v_seq       := COALESCE(NULLIF(v_item->>'sequencia_parcela','')::int, 1);
    v_qtd       := COALESCE(NULLIF(v_item->>'quantidade_parcelas','')::int, 1);
    v_incluso   := COALESCE((v_item->>'incluso_no_total')::boolean, false);
    v_sem_caixa := COALESCE((v_item->>'sem_movimentacao_caixa')::boolean, false);
    v_materializar := COALESCE((v_item->>'materializar')::boolean, true);
    v_doc_id    := NULLIF(v_item->>'documento_id','')::uuid;
    v_doc_comp_id := NULLIF(v_item->>'documento_componente_id','')::uuid;
    v_fav       := NULLIF(v_item->>'favorecido_id','')::uuid;
    v_chave     := NULLIF(v_item->>'chave_idempotencia','');

    IF v_sem_caixa THEN v_materializar := false; END IF;

    IF v_fluxo IS NULL OR v_fluxo <> v_esperada THEN
      RAISE EXCEPTION 'natureza_fluxo % incompativel com tipo % (esperado %)', v_fluxo, v_op.tipo_operacao, v_esperada USING ERRCODE='P0001'; END IF;
    IF v_valor <= 0 THEN RAISE EXCEPTION 'Valor da obrigacao deve ser > 0' USING ERRCODE='P0001'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.zoo_componentes_financeiros c
                   WHERE c.natureza=v_natureza AND c.codigo=v_componente AND c.ativo IS TRUE) THEN
      RAISE EXCEPTION 'Componente %/% inexistente ou inativo no catalogo', v_natureza, v_componente USING ERRCODE='P0001'; END IF;
    IF v_doc_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.zoo_operacao_documentos d
          WHERE d.id=v_doc_id AND d.operacao_id=p_operacao_id AND d.cliente_id=p_cliente_id) THEN
      RAISE EXCEPTION 'Documento % nao pertence a operacao %', v_doc_id, p_operacao_id USING ERRCODE='P0001'; END IF;

    -- FAVORECIDO obrigatório e do tenant (cliente ou global). Contraparte da OC é só default; nunca alterada.
    IF v_fav IS NULL THEN
      RAISE EXCEPTION 'Favorecido obrigatorio.' USING ERRCODE='P0001'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.financeiro_fornecedores f
                    WHERE f.id = v_fav AND (f.cliente_id = p_cliente_id OR f.cliente_id IS NULL)) THEN
      RAISE EXCEPTION 'Favorecido nao pertence a este cliente ou nao existe.' USING ERRCODE='P0001'; END IF;

    -- (b) CLASSIFICAÇÃO OBRIGATÓRIA — resolução do UUID em DUAS ETAPAS (sem max(uuid)):
    --     (1) contagem decide none/ambiguous/ok; (2) somente quando count=1, seleciona o id único (LIMIT 1
    --         seguro pós-contagem). Predicados LITERALMENTE equivalentes entre count e resolução.
    v_plano_tipo := CASE v_fluxo WHEN 'pagar' THEN '2-Saídas' ELSE '1-Entradas' END;
    IF NULLIF(v_item->>'subcentro','') IS NULL THEN
      RAISE EXCEPTION 'Selecione uma classificacao financeira valida.' USING ERRCODE='P0001'; END IF;
    SELECT count(*) INTO v_plano_cnt
      FROM public.financeiro_plano_contas pc
     WHERE pc.ativo IS TRUE
       AND (pc.cliente_id IS NULL OR pc.cliente_id = p_cliente_id)
       AND pc.tipo_operacao = v_plano_tipo
       AND pc.macro_custo IS NOT DISTINCT FROM NULLIF(v_item->>'macro_custo','')
       AND pc.grupo_custo IS NOT DISTINCT FROM NULLIF(v_item->>'grupo_custo','')
       AND pc.centro_custo IS NOT DISTINCT FROM NULLIF(v_item->>'centro_custo','')
       AND pc.subcentro   IS NOT DISTINCT FROM NULLIF(v_item->>'subcentro','');
    IF v_plano_cnt = 0 THEN
      RAISE EXCEPTION 'A classificacao escolhida nao pertence a este cliente ou nao existe.' USING ERRCODE='P0001'; END IF;
    IF v_plano_cnt > 1 THEN
      RAISE EXCEPTION 'Ha mais de um plano aplicavel. Selecione o plano correto.' USING ERRCODE='P0001'; END IF;
    SELECT pc.id INTO v_plano_resolved
      FROM public.financeiro_plano_contas pc
     WHERE pc.ativo IS TRUE
       AND (pc.cliente_id IS NULL OR pc.cliente_id = p_cliente_id)
       AND pc.tipo_operacao = v_plano_tipo
       AND pc.macro_custo IS NOT DISTINCT FROM NULLIF(v_item->>'macro_custo','')
       AND pc.grupo_custo IS NOT DISTINCT FROM NULLIF(v_item->>'grupo_custo','')
       AND pc.centro_custo IS NOT DISTINCT FROM NULLIF(v_item->>'centro_custo','')
       AND pc.subcentro   IS NOT DISTINCT FROM NULLIF(v_item->>'subcentro','')
     LIMIT 1;
    v_plano_informado := NULLIF(v_item->>'plano_conta_id','')::uuid;
    IF v_plano_informado IS NOT NULL AND v_plano_informado <> v_plano_resolved THEN
      RAISE EXCEPTION 'O plano informado nao corresponde ao subcentro selecionado.' USING ERRCODE='P0001'; END IF;

    v_origem := CASE WHEN v_doc_id IS NOT NULL THEN 'documento' ELSE 'manual' END;
    v_chave  := COALESCE(v_chave, CASE WHEN v_doc_comp_id IS NOT NULL THEN 'doc_comp:'||v_doc_comp_id::text ELSE NULL END);

    -- (c) IDEMPOTÊNCIA — chave obrigatória; idêntico = idempotente; conteúdo diferente = conflito.
    IF v_chave IS NULL THEN
      RAISE EXCEPTION 'Chave de idempotencia ausente.' USING ERRCODE='P0001'; END IF;
    v_existente := NULL;
    SELECT id, valor, natureza, componente INTO v_existente, v_ex_valor, v_ex_nat, v_ex_comp
      FROM public.zoo_operacao_partes
     WHERE operacao_id=p_operacao_id AND chave_idempotencia=v_chave;
    IF v_existente IS NOT NULL THEN
      IF v_ex_valor <> v_valor OR v_ex_nat <> v_natureza OR v_ex_comp <> v_componente THEN
        RAISE EXCEPTION 'Conflito de idempotencia: a chave % ja existe com conteudo diferente', v_chave USING ERRCODE='P0001'; END IF;
      v_criadas := v_criadas || jsonb_build_object('parte_id', v_existente, 'idempotente', true);
      CONTINUE;
    END IF;

    INSERT INTO public.zoo_operacao_partes (
      cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas,
      valor, data_vencimento, descricao, incluso_no_total, sem_movimentacao_caixa,
      documento_id, documento_componente_id, favorecido_id, chave_idempotencia,
      plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro)
    VALUES (
      p_cliente_id, p_operacao_id, v_origem, v_natureza, v_componente, v_seq, v_qtd,
      v_valor, v_venc, v_item->>'descricao', v_incluso, v_sem_caixa,
      v_doc_id, v_doc_comp_id, v_fav, v_chave,
      v_plano_resolved, v_item->>'macro_custo', v_item->>'grupo_custo',
      v_item->>'centro_custo', v_item->>'subcentro')
    RETURNING id INTO v_parte_id;

    v_tit_id := NULL;
    IF v_materializar THEN
      IF v_fluxo = 'receber' THEN v_tipo_op := '1-Entradas'; v_sinal := '1';
      ELSE v_tipo_op := '2-Saídas'; v_sinal := '-1'; END IF;
      v_data_pag := COALESCE(v_venc, v_op.data_pagamento_prevista, v_op.data_operacao);

      INSERT INTO public.financeiro_lancamentos_v2 (
        cliente_id, fazenda_id, valor, sinal, tipo_operacao, data_competencia, data_pagamento, ano_mes,
        favorecido_id, origem_lancamento, origem_tipo, status_transacao, cenario, sem_movimentacao_caixa,
        macro_custo, grupo_custo, centro_custo, subcentro, plano_conta_id,
        descricao, created_by, updated_by
      ) VALUES (
        p_cliente_id, v_op.fazenda_id, v_valor, v_sinal, v_tipo_op,
        v_op.data_operacao, v_data_pag, to_char(v_op.data_operacao,'YYYY-MM'),
        COALESCE(v_fav, v_op.contraparte_id), 'operacao_comercial',
        'oc:obrigacao:'||v_natureza||':'||v_componente, 'programado', v_op.cenario, false,
        v_item->>'macro_custo', v_item->>'grupo_custo', v_item->>'centro_custo', v_item->>'subcentro',
        v_plano_resolved,
        COALESCE(v_item->>'descricao', v_op.tipo_operacao||' '||v_componente), v_actor, v_actor
      ) RETURNING id INTO v_tit_id;

      UPDATE public.zoo_operacao_partes SET financeiro_lancamento_id=v_tit_id, updated_at=now() WHERE id=v_parte_id;
    END IF;

    v_criadas := v_criadas || jsonb_build_object('parte_id', v_parte_id, 'titulo_id', v_tit_id, 'materializado', (v_tit_id IS NOT NULL));
  END LOOP;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'gerar_obrigacao', jsonb_build_object('resultado', v_criadas), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'obrigacoes', v_criadas);
END;
$function$;

REVOKE ALL ON FUNCTION public.oc_gerar_obrigacoes(uuid,uuid,integer,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_gerar_obrigacoes(uuid,uuid,integer,jsonb) TO authenticated;
