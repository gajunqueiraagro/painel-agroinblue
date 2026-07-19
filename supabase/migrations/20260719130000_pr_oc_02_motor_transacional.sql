-- PR-OC-02 — Motor transacional da Operação Comercial (6 RPCs).
-- Cada RPC é uma unidade atômica (o frontend faz UMA chamada por ação do usuário).
-- Invariantes: atomicidade/rollback integral; concorrência otimista por versao; idempotência;
--   máquina de estados (rascunho->confirmada->cancelada; financeiro nao_aplicavel->pendente->
--   sincronizado|divergente|erro); eventos append-only; isolamento por cliente_id.
-- Contratos confirmados por inspeção (19/07): helpers is_admin_agroinblue(uuid)/
--   get_user_cliente_ids(uuid) SECURITY DEFINER; FINV2 sinal TEXT ('1'/'-1'),
--   tipo_operacao '1-Entradas'/'2-Saídas'.
-- D1: vínculo soberano SOMENTE em zoo_operacao_partes.financeiro_lancamento_id — títulos OC
--   NÃO setam movimentacao_rebanho_id; a proteção do guard legado é replicada aqui (recusa
--   recriar/cancelar título realizado/agendado/conciliado -> marca divergente).
-- D2: fazenda_id do título derivada das movimentações; 1 fazenda -> usa; múltiplas -> NULL +
--   evento + status_financeiro='divergente' (nunca falha, nunca escolhe arbitrária).
-- Padrão de segurança: SECURITY DEFINER + search_path fixo; tenant-check por helper;
--   REVOKE FROM PUBLIC/anon + GRANT EXECUTE a authenticated.

-- ─────────────────────────────────────────────────────────────────────────────
-- oc_criar_rascunho
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_criar_rascunho(p_cliente_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_op_id uuid;
  v_mov   text;
  v_pj    jsonb;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE='42501';
  END IF;

  INSERT INTO public.zoo_operacoes_comerciais (
    cliente_id, tipo_operacao, data_operacao, responsavel, cenario, contraparte_id,
    tipo_precificacao, preco_unitario, condicao_pagamento, data_pagamento_prevista,
    valor_bruto, descontos, acrescimos, valor_total, observacoes,
    status_comercial, status_financeiro, versao, created_by, updated_by
  ) VALUES (
    p_cliente_id,
    p_payload->>'tipo_operacao',
    (p_payload->>'data_operacao')::date,
    p_payload->>'responsavel',
    COALESCE(p_payload->>'cenario','realizado'),
    NULLIF(p_payload->>'contraparte_id','')::uuid,
    p_payload->>'tipo_precificacao',
    NULLIF(p_payload->>'preco_unitario','')::numeric,
    p_payload->>'condicao_pagamento',
    NULLIF(p_payload->>'data_pagamento_prevista','')::date,
    NULLIF(p_payload->>'valor_bruto','')::numeric,
    COALESCE(NULLIF(p_payload->>'descontos','')::numeric, 0),
    COALESCE(NULLIF(p_payload->>'acrescimos','')::numeric, 0),
    NULLIF(p_payload->>'valor_total','')::numeric,
    p_payload->>'observacoes',
    'rascunho', 'nao_aplicavel', 1, v_actor, v_actor
  ) RETURNING id INTO v_op_id;

  FOR v_mov IN SELECT value FROM jsonb_array_elements_text(COALESCE(p_payload->'movimentacoes','[]'::jsonb))
  LOOP
    INSERT INTO public.zoo_operacao_movimentacoes (cliente_id, operacao_id, movimentacao_id, created_by)
    VALUES (p_cliente_id, v_op_id, v_mov::uuid, v_actor);
  END LOOP;

  FOR v_pj IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'partes','[]'::jsonb))
  LOOP
    INSERT INTO public.zoo_operacao_partes (
      cliente_id, operacao_id, natureza, componente, sequencia_parcela, quantidade_parcelas,
      valor, data_vencimento, descricao, incluso_no_total, plano_conta_id,
      macro_custo, grupo_custo, centro_custo, subcentro
    ) VALUES (
      p_cliente_id, v_op_id,
      v_pj->>'natureza',
      COALESCE(v_pj->>'componente','principal'),
      COALESCE(NULLIF(v_pj->>'sequencia_parcela','')::int, 1),
      COALESCE(NULLIF(v_pj->>'quantidade_parcelas','')::int, 1),
      COALESCE(NULLIF(v_pj->>'valor','')::numeric, 0),
      NULLIF(v_pj->>'data_vencimento','')::date,
      v_pj->>'descricao',
      COALESCE((v_pj->>'incluso_no_total')::boolean, true),
      NULLIF(v_pj->>'plano_conta_id','')::uuid,
      v_pj->>'macro_custo', v_pj->>'grupo_custo', v_pj->>'centro_custo', v_pj->>'subcentro'
    );
  END LOOP;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, v_op_id, 'criar_rascunho', p_payload, v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', v_op_id, 'versao', 1,
    'status_comercial','rascunho','status_financeiro','nao_aplicavel');
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- oc_editar_negociacao
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_editar_negociacao(
  p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id=p_operacao_id AND cliente_id=p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operação % não encontrada', p_operacao_id USING ERRCODE='P0002'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operação cancelada não pode ser editada' USING ERRCODE='P0001'; END IF;
  IF v_op.status_financeiro = 'sincronizado' THEN
    RAISE EXCEPTION 'Operação sincronizada — ajuste as parcelas/ressincronize antes de editar a negociação' USING ERRCODE='P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versão (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE='40001'; END IF;

  UPDATE public.zoo_operacoes_comerciais SET
    tipo_operacao           = COALESCE(p_payload->>'tipo_operacao', tipo_operacao),
    data_operacao           = COALESCE(NULLIF(p_payload->>'data_operacao','')::date, data_operacao),
    responsavel             = CASE WHEN p_payload ? 'responsavel' THEN p_payload->>'responsavel' ELSE responsavel END,
    contraparte_id          = CASE WHEN p_payload ? 'contraparte_id' THEN NULLIF(p_payload->>'contraparte_id','')::uuid ELSE contraparte_id END,
    tipo_precificacao       = CASE WHEN p_payload ? 'tipo_precificacao' THEN p_payload->>'tipo_precificacao' ELSE tipo_precificacao END,
    preco_unitario          = CASE WHEN p_payload ? 'preco_unitario' THEN NULLIF(p_payload->>'preco_unitario','')::numeric ELSE preco_unitario END,
    condicao_pagamento      = CASE WHEN p_payload ? 'condicao_pagamento' THEN p_payload->>'condicao_pagamento' ELSE condicao_pagamento END,
    data_pagamento_prevista = CASE WHEN p_payload ? 'data_pagamento_prevista' THEN NULLIF(p_payload->>'data_pagamento_prevista','')::date ELSE data_pagamento_prevista END,
    valor_bruto             = CASE WHEN p_payload ? 'valor_bruto' THEN NULLIF(p_payload->>'valor_bruto','')::numeric ELSE valor_bruto END,
    descontos               = COALESCE(NULLIF(p_payload->>'descontos','')::numeric, descontos),
    acrescimos              = COALESCE(NULLIF(p_payload->>'acrescimos','')::numeric, acrescimos),
    valor_total             = CASE WHEN p_payload ? 'valor_total' THEN NULLIF(p_payload->>'valor_total','')::numeric ELSE valor_total END,
    observacoes             = CASE WHEN p_payload ? 'observacoes' THEN p_payload->>'observacoes' ELSE observacoes END,
    -- tentativa de sync anterior falhou: editar volta a pendente (exige nova sincronização)
    status_financeiro       = CASE WHEN status_financeiro IN ('divergente','erro') THEN 'pendente' ELSE status_financeiro END,
    versao = versao+1, updated_at=now(), updated_by=v_actor
  WHERE id=p_operacao_id;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'editar_negociacao', to_jsonb(v_op), p_payload, v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao+1,
    'status_comercial', v_op.status_comercial,
    'status_financeiro', CASE WHEN v_op.status_financeiro IN ('divergente','erro') THEN 'pendente' ELSE v_op.status_financeiro END);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- oc_alterar_parcelas  (regrava as partes; só antes da sincronização)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_alterar_parcelas(
  p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_parcelas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_pj jsonb;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id=p_operacao_id AND cliente_id=p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operação % não encontrada', p_operacao_id USING ERRCODE='P0002'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operação cancelada não permite alterar parcelas' USING ERRCODE='P0001'; END IF;
  IF v_op.status_financeiro NOT IN ('nao_aplicavel','pendente') THEN
    RAISE EXCEPTION 'Parcelas só podem ser alteradas antes da sincronização (status_financeiro=%)', v_op.status_financeiro USING ERRCODE='P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versão (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE='40001'; END IF;
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_partes WHERE operacao_id=p_operacao_id AND financeiro_lancamento_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Há partes vinculadas a títulos; cancele/ressincronize antes de alterar parcelas' USING ERRCODE='P0001'; END IF;

  DELETE FROM public.zoo_operacao_partes WHERE operacao_id=p_operacao_id;

  FOR v_pj IN SELECT value FROM jsonb_array_elements(COALESCE(p_parcelas,'[]'::jsonb))
  LOOP
    INSERT INTO public.zoo_operacao_partes (
      cliente_id, operacao_id, natureza, componente, sequencia_parcela, quantidade_parcelas,
      valor, data_vencimento, descricao, incluso_no_total, plano_conta_id,
      macro_custo, grupo_custo, centro_custo, subcentro
    ) VALUES (
      p_cliente_id, p_operacao_id,
      v_pj->>'natureza',
      COALESCE(v_pj->>'componente','principal'),
      COALESCE(NULLIF(v_pj->>'sequencia_parcela','')::int, 1),
      COALESCE(NULLIF(v_pj->>'quantidade_parcelas','')::int, 1),
      COALESCE(NULLIF(v_pj->>'valor','')::numeric, 0),
      NULLIF(v_pj->>'data_vencimento','')::date,
      v_pj->>'descricao',
      COALESCE((v_pj->>'incluso_no_total')::boolean, true),
      NULLIF(v_pj->>'plano_conta_id','')::uuid,
      v_pj->>'macro_custo', v_pj->>'grupo_custo', v_pj->>'centro_custo', v_pj->>'subcentro'
    );
  END LOOP;

  UPDATE public.zoo_operacoes_comerciais SET versao=versao+1, updated_at=now(), updated_by=v_actor
  WHERE id=p_operacao_id;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'alterar_parcelas', p_parcelas, v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao+1,
    'status_comercial', v_op.status_comercial, 'status_financeiro', v_op.status_financeiro);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- oc_confirmar  (rascunho -> confirmada; idempotente se já confirmada)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_confirmar(
  p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_nmov int;
  v_nprincipal int;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id=p_operacao_id AND cliente_id=p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operação % não encontrada', p_operacao_id USING ERRCODE='P0002'; END IF;

  IF v_op.status_comercial = 'confirmada' THEN
    RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao,
      'status_comercial','confirmada','status_financeiro', v_op.status_financeiro, 'idempotente', true);
  END IF;
  IF v_op.status_comercial <> 'rascunho' THEN
    RAISE EXCEPTION 'Operação em estado % não pode ser confirmada', v_op.status_comercial USING ERRCODE='P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versão (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE='40001'; END IF;

  IF v_op.contraparte_id IS NULL THEN
    RAISE EXCEPTION 'Operação exige contraparte para ser confirmada' USING ERRCODE='P0001'; END IF;
  SELECT count(*) INTO v_nmov FROM public.zoo_operacao_movimentacoes WHERE operacao_id=p_operacao_id;
  IF v_nmov = 0 THEN
    RAISE EXCEPTION 'Operação exige ao menos uma movimentação vinculada' USING ERRCODE='P0001'; END IF;
  SELECT count(*) INTO v_nprincipal FROM public.zoo_operacao_partes WHERE operacao_id=p_operacao_id AND natureza='principal';
  IF v_nprincipal = 0 THEN
    RAISE EXCEPTION 'Operação exige ao menos uma parte principal' USING ERRCODE='P0001'; END IF;

  UPDATE public.zoo_operacoes_comerciais
    SET status_comercial='confirmada', status_financeiro='pendente',
        versao=versao+1, updated_at=now(), updated_by=v_actor
  WHERE id=p_operacao_id;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'confirmar', to_jsonb(v_op), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao+1,
    'status_comercial','confirmada','status_financeiro','pendente');
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- oc_sincronizar  (confirmada: gera/atualiza títulos FINV2 a partir das partes)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_sincronizar(
  p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_hash text;
  v_protegidos int;
  v_fazendas uuid[];
  v_fazenda uuid;
  v_multi boolean := false;
  v_base_entrada boolean;
  v_parte public.zoo_operacao_partes;
  v_tit_id uuid;
  v_tipo_op text;
  v_sinal text;
  v_data_pag date;
  v_status_fin text;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id=p_operacao_id AND cliente_id=p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operação % não encontrada', p_operacao_id USING ERRCODE='P0002'; END IF;
  IF v_op.status_comercial <> 'confirmada' THEN
    RAISE EXCEPTION 'Só operações confirmadas podem sincronizar (estado atual %)', v_op.status_comercial USING ERRCODE='P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versão (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE='40001'; END IF;

  -- hash determinístico das partes (idempotência)
  SELECT md5(COALESCE(string_agg(
      natureza||'|'||componente||'|'||sequencia_parcela||'|'||COALESCE(valor::text,'')||'|'||
      COALESCE(data_vencimento::text,'')||'|'||COALESCE(grupo_custo,'')||'|'||COALESCE(subcentro,''),
      ';' ORDER BY natureza, componente, sequencia_parcela),''))
    INTO v_hash
    FROM public.zoo_operacao_partes WHERE operacao_id=p_operacao_id;

  IF v_op.status_financeiro='sincronizado' AND v_op.hash_financeiro_esperado IS NOT DISTINCT FROM v_hash THEN
    RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao,
      'status_comercial', v_op.status_comercial, 'status_financeiro','sincronizado', 'idempotente', true);
  END IF;

  -- D1: proteção — título já vinculado que esteja realizado/agendado/conciliado bloqueia recriação
  SELECT count(*) INTO v_protegidos
    FROM public.zoo_operacao_partes pt
    JOIN public.financeiro_lancamentos_v2 f ON f.id=pt.financeiro_lancamento_id
   WHERE pt.operacao_id=p_operacao_id
     AND f.cancelado IS NOT TRUE
     AND (f.status_transacao IN ('realizado','agendado') OR f.conciliado_em IS NOT NULL);
  IF v_protegidos > 0 THEN
    UPDATE public.zoo_operacoes_comerciais
      SET status_financeiro='divergente', ultima_tentativa_em=now(),
          erro_sincronizacao=format('%s titulo(s) realizado/agendado/conciliado — sincronizacao bloqueada; ajuste pelo Financeiro Oficial', v_protegidos),
          updated_at=now(), updated_by=v_actor
    WHERE id=p_operacao_id;
    INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
    VALUES (p_cliente_id, p_operacao_id, 'sincronizar_divergente', jsonb_build_object('protegidos', v_protegidos), v_actor, 'rpc');
    RETURN jsonb_build_object('ok', false, 'operacao_id', p_operacao_id, 'versao', v_op.versao,
      'status_comercial', v_op.status_comercial, 'status_financeiro','divergente', 'motivo','titulos_realizados');
  END IF;

  -- D2: fazenda derivada das movimentações
  SELECT array_agg(DISTINCT l.fazenda_id) INTO v_fazendas
    FROM public.zoo_operacao_movimentacoes m
    JOIN public.lancamentos l ON l.id=m.movimentacao_id AND l.cliente_id=m.cliente_id
   WHERE m.operacao_id=p_operacao_id;
  IF array_length(v_fazendas,1)=1 THEN v_fazenda := v_fazendas[1]; ELSE v_fazenda := NULL; v_multi := (array_length(v_fazendas,1) > 1); END IF;

  -- soft-cancela títulos OC anteriores (não protegidos) e limpa vínculo
  UPDATE public.financeiro_lancamentos_v2 f
    SET cancelado=true, cancelado_em=now(), cancelado_por=v_actor
    FROM public.zoo_operacao_partes pt
   WHERE pt.operacao_id=p_operacao_id AND pt.financeiro_lancamento_id=f.id AND f.cancelado IS NOT TRUE;
  UPDATE public.zoo_operacao_partes SET financeiro_lancamento_id=NULL
   WHERE operacao_id=p_operacao_id AND financeiro_lancamento_id IS NOT NULL;

  v_base_entrada := (v_op.tipo_operacao IN ('venda','abate'));

  -- gera um título por parte e grava o vínculo soberano
  FOR v_parte IN SELECT * FROM public.zoo_operacao_partes WHERE operacao_id=p_operacao_id
                 ORDER BY natureza, componente, sequencia_parcela
  LOOP
    IF (v_base_entrada AND v_parte.natureza <> 'deducao') OR ((NOT v_base_entrada) AND v_parte.natureza='deducao') THEN
      v_tipo_op := '1-Entradas'; v_sinal := '1';
    ELSE
      v_tipo_op := '2-Saídas'; v_sinal := '-1';
    END IF;
    v_data_pag := COALESCE(v_parte.data_vencimento, v_op.data_pagamento_prevista, v_op.data_operacao);

    INSERT INTO public.financeiro_lancamentos_v2 (
      cliente_id, fazenda_id, valor, sinal, tipo_operacao, data_competencia, data_pagamento, ano_mes,
      favorecido_id, origem_lancamento, origem_tipo, status_transacao, cenario,
      macro_custo, grupo_custo, centro_custo, subcentro, plano_conta_id,
      descricao, created_by, updated_by
    ) VALUES (
      p_cliente_id, v_fazenda, COALESCE(v_parte.valor,0), v_sinal, v_tipo_op,
      v_op.data_operacao, v_data_pag, to_char(v_op.data_operacao,'YYYY-MM'),
      v_op.contraparte_id, 'operacao_comercial', 'oc:'||v_parte.natureza||':'||v_parte.componente, 'programado', v_op.cenario,
      v_parte.macro_custo, v_parte.grupo_custo, v_parte.centro_custo, v_parte.subcentro, v_parte.plano_conta_id,
      COALESCE(v_parte.descricao, v_op.tipo_operacao||' '||v_parte.componente), v_actor, v_actor
    ) RETURNING id INTO v_tit_id;

    UPDATE public.zoo_operacao_partes SET financeiro_lancamento_id=v_tit_id, updated_at=now() WHERE id=v_parte.id;
  END LOOP;

  v_status_fin := CASE WHEN v_multi THEN 'divergente' ELSE 'sincronizado' END;

  UPDATE public.zoo_operacoes_comerciais
    SET status_financeiro=v_status_fin,
        sincronizado_em=CASE WHEN v_multi THEN sincronizado_em ELSE now() END,
        ultima_tentativa_em=now(),
        erro_sincronizacao=CASE WHEN v_multi THEN 'multiplas fazendas nas movimentacoes; titulos gravados com fazenda_id nulo — classificar' ELSE NULL END,
        hash_financeiro_esperado=v_hash, versao=versao+1, updated_at=now(), updated_by=v_actor
  WHERE id=p_operacao_id;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, CASE WHEN v_multi THEN 'sincronizar_multi_fazenda' ELSE 'sincronizar' END,
          jsonb_build_object('fazenda_id', v_fazenda, 'multi_fazenda', v_multi, 'hash', v_hash), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao+1,
    'status_comercial', v_op.status_comercial, 'status_financeiro', v_status_fin, 'multi_fazenda', v_multi);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- oc_cancelar  (soft; realizado/agendado/conciliado -> divergente, não força)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_cancelar(
  p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_protegidos int;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id=p_operacao_id AND cliente_id=p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operação % não encontrada', p_operacao_id USING ERRCODE='P0002'; END IF;

  IF v_op.status_comercial = 'cancelada' THEN
    RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao,
      'status_comercial','cancelada','status_financeiro', v_op.status_financeiro, 'idempotente', true);
  END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versão (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE='40001'; END IF;

  SELECT count(*) INTO v_protegidos
    FROM public.zoo_operacao_partes pt
    JOIN public.financeiro_lancamentos_v2 f ON f.id=pt.financeiro_lancamento_id
   WHERE pt.operacao_id=p_operacao_id
     AND f.cancelado IS NOT TRUE
     AND (f.status_transacao IN ('realizado','agendado') OR f.conciliado_em IS NOT NULL);
  IF v_protegidos > 0 THEN
    UPDATE public.zoo_operacoes_comerciais
      SET status_financeiro='divergente', ultima_tentativa_em=now(),
          erro_sincronizacao=format('cancelamento bloqueado: %s titulo(s) realizado/agendado/conciliado', v_protegidos),
          updated_at=now(), updated_by=v_actor
    WHERE id=p_operacao_id;
    INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
    VALUES (p_cliente_id, p_operacao_id, 'cancelar_divergente', jsonb_build_object('protegidos', v_protegidos, 'motivo', p_motivo), v_actor, 'rpc');
    RETURN jsonb_build_object('ok', false, 'operacao_id', p_operacao_id, 'versao', v_op.versao,
      'status_comercial', v_op.status_comercial, 'status_financeiro','divergente', 'motivo','titulos_realizados');
  END IF;

  UPDATE public.financeiro_lancamentos_v2 f
    SET cancelado=true, cancelado_em=now(), cancelado_por=v_actor
    FROM public.zoo_operacao_partes pt
   WHERE pt.operacao_id=p_operacao_id AND pt.financeiro_lancamento_id=f.id AND f.cancelado IS NOT TRUE;

  UPDATE public.zoo_operacoes_comerciais
    SET status_comercial='cancelada', status_financeiro='nao_aplicavel',
        cancelado_em=now(), cancelado_por=v_actor, cancelado_motivo=p_motivo,
        versao=versao+1, updated_at=now(), updated_by=v_actor
  WHERE id=p_operacao_id;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'cancelar', to_jsonb(v_op), jsonb_build_object('motivo', p_motivo), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao+1,
    'status_comercial','cancelada','status_financeiro','nao_aplicavel');
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Privilégios: mínimos (SECURITY DEFINER; caller precisa só de EXECUTE)
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.oc_criar_rascunho(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oc_editar_negociacao(uuid, uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oc_alterar_parcelas(uuid, uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oc_confirmar(uuid, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oc_sincronizar(uuid, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oc_cancelar(uuid, uuid, integer, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.oc_criar_rascunho(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.oc_editar_negociacao(uuid, uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.oc_alterar_parcelas(uuid, uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.oc_confirmar(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.oc_sincronizar(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.oc_cancelar(uuid, uuid, integer, text) TO authenticated;
