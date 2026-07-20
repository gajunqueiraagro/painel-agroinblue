-- PR-OC-MODEL-01 parte 4 — ATIVAÇÃO ATÔMICA do novo vocabulário comercial.
--   Uma única transação (migration) faz: drop do CHECK antigo -> remap dos dados ->
--   novo CHECK -> revisão de TODAS as funções que gravam status_comercial. Não existe
--   janela de contrato quebrado: se qualquer passo falhar, a transação inteira reverte e
--   o estado anterior (partes 1-3 aplicadas, vocabulário antigo ainda vigente) é preservado.
-- Depende das partes 1-3 (colunas novas + _oc_conciliar_peso). NÃO aplicar por este PR.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── 1) Troca do vocabulário (sem CHECK durante o remap) ──────────────────────
-- Nome do CHECK CONFIRMADO por pré-flight: zoo_operacoes_comerciais_status_comercial_check.
--   DROP SEM IF EXISTS: se (por qualquer motivo) não existir, a M4 FALHA e reverte —
--   nunca mantém o CHECK antigo ativo silenciosamente.
ALTER TABLE public.zoo_operacoes_comerciais
  DROP CONSTRAINT zoo_operacoes_comerciais_status_comercial_check;

-- Remap (SET RHS avaliado contra a tupla ANTIGA, atômico):
--   rascunho legado -> status='programada' + rascunho técnico = TRUE (edição incompleta);
--   confirmada      -> status='fechada'    + rascunho = FALSE;
--   cancelada       -> status preservado   + rascunho = FALSE.
UPDATE public.zoo_operacoes_comerciais
   SET rascunho = (status_comercial = 'rascunho'),
       status_comercial = CASE status_comercial
                            WHEN 'rascunho'   THEN 'programada'
                            WHEN 'confirmada' THEN 'fechada'
                            ELSE status_comercial END
 WHERE status_comercial IN ('rascunho','confirmada','cancelada');

ALTER TABLE public.zoo_operacoes_comerciais ALTER COLUMN status_comercial SET DEFAULT 'programada';
ALTER TABLE public.zoo_operacoes_comerciais
  ADD CONSTRAINT zoo_operacoes_comerciais_status_comercial_check
  CHECK (status_comercial IN ('programada','fechada','cancelada'));

-- DEFAULT DEFINITIVO da flag: operação nova nasce como edição incompleta.
--   Só oc_salvar_rascunho, após validar o cadastro mínimo, grava rascunho=false.
ALTER TABLE public.zoo_operacoes_comerciais ALTER COLUMN rascunho SET DEFAULT true;

-- ── 2) oc_salvar_rascunho (novo vocabulário + dados negociados + conciliação de peso) ──
CREATE OR REPLACE FUNCTION public.oc_salvar_rascunho(
  p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_id uuid; v_nome text; v_mov text; v_completo boolean; v_peso jsonb;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501';
  END IF;
  v_nome := public.resolver_nome_usuario(v_actor);

  IF p_operacao_id IS NULL THEN
    INSERT INTO public.zoo_operacoes_comerciais (
      cliente_id, fazenda_id, tipo_operacao, data_operacao, responsavel, responsavel_nome_snapshot,
      cenario, contraparte_id, tipo_precificacao, preco_unitario, condicao_pagamento, data_pagamento_prevista,
      qtd_negociada, categoria_negociada, peso_medio_negociado_kg, peso_total_negociado_kg, peso_negociado_soberano,
      valor_estimado, valor_acordado, observacoes, status_comercial, rascunho, status_financeiro, versao, created_by, updated_by)
    VALUES (
      p_cliente_id, NULLIF(p_payload->>'fazenda_id','')::uuid, p_payload->>'tipo_operacao', (p_payload->>'data_operacao')::date,
      v_nome, v_nome, COALESCE(p_payload->>'cenario','realizado'), NULLIF(p_payload->>'contraparte_id','')::uuid,
      p_payload->>'tipo_precificacao', NULLIF(p_payload->>'preco_unitario','')::numeric,
      p_payload->>'condicao_pagamento', NULLIF(p_payload->>'data_pagamento_prevista','')::date,
      NULLIF(p_payload->>'qtd_negociada','')::integer, p_payload->>'categoria_negociada',
      NULLIF(p_payload->>'peso_medio_negociado_kg','')::numeric, NULLIF(p_payload->>'peso_total_negociado_kg','')::numeric,
      NULLIF(p_payload->>'peso_negociado_soberano',''),
      NULLIF(p_payload->>'valor_estimado','')::numeric, NULLIF(p_payload->>'valor_acordado','')::numeric,
      p_payload->>'observacoes', 'programada', true, 'nao_aplicavel', 1, v_actor, v_actor)
    RETURNING id INTO v_id;
    FOR v_mov IN SELECT value FROM jsonb_array_elements_text(COALESCE(p_payload->'movimentacoes','[]'::jsonb))
    LOOP
      INSERT INTO public.zoo_operacao_movimentacoes (cliente_id, operacao_id, movimentacao_id, created_by)
      VALUES (p_cliente_id, v_id, v_mov::uuid, v_actor);
    END LOOP;
    PERFORM public._oc_aplicar_partes(v_id, p_cliente_id, COALESCE(p_payload->'partes','[]'::jsonb));
    INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
    VALUES (p_cliente_id, v_id, 'criar_rascunho', p_payload, v_actor, 'rpc');
    p_operacao_id := v_id;
  ELSE
    SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
      WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
    IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'Operacao cancelada nao pode ser editada' USING ERRCODE = 'P0001'; END IF;
    IF v_op.status_comercial = 'fechada' THEN RAISE EXCEPTION 'Negociacao fechada; reabra para editar (oc_reabrir)' USING ERRCODE = 'P0001'; END IF;
    IF v_op.versao <> p_versao_esperada THEN
      RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
    UPDATE public.zoo_operacoes_comerciais SET
      fazenda_id              = CASE WHEN p_payload ? 'fazenda_id' THEN NULLIF(p_payload->>'fazenda_id','')::uuid ELSE fazenda_id END,
      tipo_operacao           = COALESCE(p_payload->>'tipo_operacao', tipo_operacao),
      data_operacao           = COALESCE(NULLIF(p_payload->>'data_operacao','')::date, data_operacao),
      contraparte_id          = CASE WHEN p_payload ? 'contraparte_id' THEN NULLIF(p_payload->>'contraparte_id','')::uuid ELSE contraparte_id END,
      tipo_precificacao       = CASE WHEN p_payload ? 'tipo_precificacao' THEN p_payload->>'tipo_precificacao' ELSE tipo_precificacao END,
      preco_unitario          = CASE WHEN p_payload ? 'preco_unitario' THEN NULLIF(p_payload->>'preco_unitario','')::numeric ELSE preco_unitario END,
      condicao_pagamento      = CASE WHEN p_payload ? 'condicao_pagamento' THEN p_payload->>'condicao_pagamento' ELSE condicao_pagamento END,
      data_pagamento_prevista = CASE WHEN p_payload ? 'data_pagamento_prevista' THEN NULLIF(p_payload->>'data_pagamento_prevista','')::date ELSE data_pagamento_prevista END,
      qtd_negociada           = CASE WHEN p_payload ? 'qtd_negociada' THEN NULLIF(p_payload->>'qtd_negociada','')::integer ELSE qtd_negociada END,
      categoria_negociada     = CASE WHEN p_payload ? 'categoria_negociada' THEN p_payload->>'categoria_negociada' ELSE categoria_negociada END,
      peso_medio_negociado_kg = CASE WHEN p_payload ? 'peso_medio_negociado_kg' THEN NULLIF(p_payload->>'peso_medio_negociado_kg','')::numeric ELSE peso_medio_negociado_kg END,
      peso_total_negociado_kg = CASE WHEN p_payload ? 'peso_total_negociado_kg' THEN NULLIF(p_payload->>'peso_total_negociado_kg','')::numeric ELSE peso_total_negociado_kg END,
      peso_negociado_soberano = CASE WHEN p_payload ? 'peso_negociado_soberano' THEN NULLIF(p_payload->>'peso_negociado_soberano','') ELSE peso_negociado_soberano END,
      valor_estimado          = CASE WHEN p_payload ? 'valor_estimado' THEN NULLIF(p_payload->>'valor_estimado','')::numeric ELSE valor_estimado END,
      valor_acordado          = CASE WHEN p_payload ? 'valor_acordado' THEN NULLIF(p_payload->>'valor_acordado','')::numeric ELSE valor_acordado END,
      observacoes             = CASE WHEN p_payload ? 'observacoes' THEN p_payload->>'observacoes' ELSE observacoes END,
      versao = versao + 1, updated_at = now(), updated_by = v_actor
    WHERE id = p_operacao_id;
    PERFORM public._oc_aplicar_partes(p_operacao_id, p_cliente_id, COALESCE(p_payload->'partes','[]'::jsonb));
    INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, dados_novos, usuario_id, origem)
    VALUES (p_cliente_id, p_operacao_id, 'salvar_rascunho', to_jsonb(v_op), p_payload, v_actor, 'rpc');
  END IF;

  -- Conciliação de peso negociado (Decisão 5): valida coerência e grava ambos (sem conflito silencioso).
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;
  IF v_op.qtd_negociada IS NOT NULL AND (v_op.peso_medio_negociado_kg IS NOT NULL OR v_op.peso_total_negociado_kg IS NOT NULL) THEN
    v_peso := public._oc_conciliar_peso(v_op.qtd_negociada, v_op.peso_medio_negociado_kg, v_op.peso_total_negociado_kg);
    UPDATE public.zoo_operacoes_comerciais
      SET peso_medio_negociado_kg = NULLIF(v_peso->>'medio','')::numeric,
          peso_total_negociado_kg = NULLIF(v_peso->>'total','')::numeric
    WHERE id = p_operacao_id;
  END IF;

  -- Cadastro mínimo => sai do rascunho técnico (Programada operacional).
  SELECT (o.fazenda_id IS NOT NULL AND o.tipo_operacao IS NOT NULL AND o.contraparte_id IS NOT NULL
          AND o.data_operacao IS NOT NULL AND o.qtd_negociada IS NOT NULL AND o.categoria_negociada IS NOT NULL
          AND o.tipo_precificacao IS NOT NULL AND o.preco_unitario IS NOT NULL)
    INTO v_completo FROM public.zoo_operacoes_comerciais o WHERE o.id = p_operacao_id;
  UPDATE public.zoo_operacoes_comerciais SET rascunho = NOT v_completo WHERE id = p_operacao_id;

  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;
  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao,
    'status_comercial', v_op.status_comercial, 'rascunho', v_op.rascunho, 'valor_total', v_op.valor_total);
END;
$$;

-- ── 3) oc_confirmar (programada -> fechada; só acordo mínimo) ─────────────────
CREATE OR REPLACE FUNCTION public.oc_confirmar(
  p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_actor uuid := auth.uid(); v_op public.zoo_operacoes_comerciais;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.status_comercial = 'fechada' THEN
    RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao, 'status_comercial','fechada','idempotente', true); END IF;
  IF v_op.status_comercial <> 'programada' THEN
    RAISE EXCEPTION 'Operacao em estado % nao pode ser fechada', v_op.status_comercial USING ERRCODE = 'P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  IF v_op.rascunho THEN RAISE EXCEPTION 'Cadastro comercial incompleto (rascunho tecnico)' USING ERRCODE = 'P0001'; END IF;
  IF v_op.contraparte_id IS NULL OR v_op.qtd_negociada IS NULL OR v_op.categoria_negociada IS NULL
     OR v_op.tipo_precificacao IS NULL OR v_op.preco_unitario IS NULL THEN
    RAISE EXCEPTION 'Acordo comercial minimo ausente' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.zoo_operacoes_comerciais
    SET status_comercial = 'fechada', versao = versao + 1, updated_at = now(), updated_by = v_actor WHERE id = p_operacao_id;
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'fechar', to_jsonb(v_op), v_actor, 'rpc');
  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao + 1, 'status_comercial','fechada');
END;
$$;

-- ── 4) oc_cancelar (só comercial; preserva fatos; exige motivo; flag inconsistência) ──
CREATE OR REPLACE FUNCTION public.oc_cancelar(
  p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_actor uuid := auth.uid(); v_op public.zoo_operacoes_comerciais; v_fatos boolean;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'Cancelamento exige motivo' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN
    RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao, 'status_comercial','cancelada','idempotente', true); END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.zoo_operacao_movimentacoes WHERE operacao_id = p_operacao_id)
      OR EXISTS (SELECT 1 FROM public.zoo_operacao_liquidacoes WHERE operacao_id = p_operacao_id AND estornado IS NOT TRUE)
      OR EXISTS (SELECT 1 FROM public.zoo_operacao_partes WHERE operacao_id = p_operacao_id AND financeiro_lancamento_id IS NOT NULL)
    INTO v_fatos;
  UPDATE public.zoo_operacoes_comerciais
    SET status_comercial = 'cancelada', cancelado_em = now(), cancelado_por = v_actor, cancelado_motivo = p_motivo,
        versao = versao + 1, updated_at = now(), updated_by = v_actor WHERE id = p_operacao_id;
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'cancelar', to_jsonb(v_op),
          jsonb_build_object('motivo', p_motivo, 'inconsistencia_operacional', v_fatos), v_actor, 'rpc');
  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao + 1,
    'status_comercial','cancelada', 'inconsistencia_operacional', v_fatos);
END;
$$;

-- ── 5) oc_sincronizar — CÓPIA VERBATIM do PR-OC-02, alterando SÓ o guard (confirmada->fechada) ──
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
  IF v_op.status_comercial <> 'fechada' THEN     -- [MODEL-01] era 'confirmada'; veda rascunho e cancelada
    RAISE EXCEPTION 'Só operações fechadas podem sincronizar (estado atual %)', v_op.status_comercial USING ERRCODE='P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versão (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE='40001'; END IF;

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

  SELECT array_agg(DISTINCT l.fazenda_id) INTO v_fazendas
    FROM public.zoo_operacao_movimentacoes m
    JOIN public.lancamentos l ON l.id=m.movimentacao_id AND l.cliente_id=m.cliente_id
   WHERE m.operacao_id=p_operacao_id;
  IF array_length(v_fazendas,1)=1 THEN v_fazenda := v_fazendas[1]; ELSE v_fazenda := NULL; v_multi := (array_length(v_fazendas,1) > 1); END IF;

  UPDATE public.financeiro_lancamentos_v2 f
    SET cancelado=true, cancelado_em=now(), cancelado_por=v_actor
    FROM public.zoo_operacao_partes pt
   WHERE pt.operacao_id=p_operacao_id AND pt.financeiro_lancamento_id=f.id AND f.cancelado IS NOT TRUE;
  UPDATE public.zoo_operacao_partes SET financeiro_lancamento_id=NULL
   WHERE operacao_id=p_operacao_id AND financeiro_lancamento_id IS NOT NULL;

  v_base_entrada := (v_op.tipo_operacao IN ('venda','abate'));

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

-- ── 6) oc_reabrir (fechada -> programada; preserva os outros eixos — Decisão 7) ──
CREATE OR REPLACE FUNCTION public.oc_reabrir(
  p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_actor uuid := auth.uid(); v_op public.zoo_operacoes_comerciais;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'Operacao cancelada nao pode ser reaberta' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'programada' THEN
    RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao, 'status_comercial','programada','idempotente', true); END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  UPDATE public.zoo_operacoes_comerciais
    SET status_comercial = 'programada', versao = versao + 1, updated_at = now(), updated_by = v_actor WHERE id = p_operacao_id;
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'reabrir', to_jsonb(v_op), jsonb_build_object('motivo', p_motivo), v_actor, 'rpc');
  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao + 1, 'status_comercial','programada');
END;
$$;

-- ACLs preservadas por CREATE OR REPLACE (funções já existiam com REVOKE/GRANT). Reforço explícito:
REVOKE ALL ON FUNCTION public.oc_sincronizar(uuid, uuid, integer)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.oc_reabrir(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_sincronizar(uuid, uuid, integer)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.oc_reabrir(uuid, uuid, integer, text) TO authenticated;
