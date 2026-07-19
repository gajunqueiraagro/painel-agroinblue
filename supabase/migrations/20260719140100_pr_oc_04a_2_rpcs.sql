-- PR-OC-04A parte 2 — RPCs endurecidas: fonte financeira soberana (partes),
--   consolidação atômica dos resumos, catálogo de componentes, seq/qtd por
--   componente (server-side), oc_salvar_rascunho (upsert), oc_reabrir, invariantes
--   de confirmação, responsável (snapshot). NÃO aplicar por este PR.

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper de identidade REUTILIZÁVEL: nome de exibição de um usuário, tenant-safe
--   (SECURITY DEFINER lê profiles independentemente de RLS). ÚNICO ponto de
--   resolução de nome — não espalhar profiles/email/fallback pelas RPCs.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolver_nome_usuario(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT COALESCE(NULLIF(btrim(p.nome), ''), p.email) FROM public.profiles p WHERE p.user_id = p_user_id LIMIT 1),
    '(sem nome)');
$$;
-- Interno ao motor: SECURITY DEFINER + UUID arbitrário sobre profiles/auth.users.
--   Sem GRANT ao app — só as RPCs SECURITY DEFINER (executando como owner) o chamam.
REVOKE ALL ON FUNCTION public.resolver_nome_usuario(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper interno: valida catálogo, substitui as partes, computa sequencia/qtd
--   POR COMPONENTE (row_number/count sobre (natureza, componente) na ordem do
--   array) e deriva os 4 resumos na operação. Não é público.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._oc_aplicar_partes(p_operacao_id uuid, p_cliente_id uuid, p_parcelas jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invalido text;
BEGIN
  -- Valida componentes contra o catálogo ATIVO antes de depender da FK.
  SELECT string_agg(DISTINCT (e->>'natureza') || '/' || COALESCE(e->>'componente','(nulo)'), ', ')
    INTO v_invalido
  FROM jsonb_array_elements(COALESCE(p_parcelas, '[]'::jsonb)) e
  WHERE NOT EXISTS (
    SELECT 1 FROM public.zoo_componentes_financeiros c
    WHERE c.natureza = e->>'natureza' AND c.codigo = e->>'componente' AND c.ativo IS TRUE);
  IF v_invalido IS NOT NULL THEN
    RAISE EXCEPTION 'Componente(s) inexistente(s)/inativo(s) no catalogo: %', v_invalido USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.zoo_operacao_partes WHERE operacao_id = p_operacao_id;

  INSERT INTO public.zoo_operacao_partes (
    cliente_id, operacao_id, natureza, componente, sequencia_parcela, quantidade_parcelas,
    valor, data_vencimento, descricao, incluso_no_total, plano_conta_id,
    macro_custo, grupo_custo, centro_custo, subcentro)
  SELECT
    p_cliente_id, p_operacao_id, x.natureza, x.componente,
    row_number() OVER (PARTITION BY x.natureza, x.componente ORDER BY x.ord),
    count(*)     OVER (PARTITION BY x.natureza, x.componente),
    x.valor, x.data_vencimento, x.descricao, x.incluso, x.plano_conta_id,
    x.macro, x.grupo, x.centro, x.subcentro
  FROM (
    SELECT
      e->>'natureza' AS natureza, e->>'componente' AS componente,
      COALESCE(NULLIF(e->>'valor','')::numeric, 0) AS valor,
      NULLIF(e->>'data_vencimento','')::date AS data_vencimento,
      e->>'descricao' AS descricao,
      COALESCE((e->>'incluso_no_total')::boolean, true) AS incluso,
      NULLIF(e->>'plano_conta_id','')::uuid AS plano_conta_id,
      e->>'macro_custo' AS macro, e->>'grupo_custo' AS grupo, e->>'centro_custo' AS centro, e->>'subcentro' AS subcentro,
      ord
    FROM jsonb_array_elements(COALESCE(p_parcelas, '[]'::jsonb)) WITH ORDINALITY AS t(e, ord)
  ) x;

  -- Deriva os resumos das partes e grava na operação (fonte soberana = partes).
  UPDATE public.zoo_operacoes_comerciais o
  SET valor_bruto = r.bruto, descontos = r.descontos, acrescimos = r.acrescimos,
      valor_total = r.bruto + r.acrescimos - r.descontos
  FROM (
    SELECT
      COALESCE(sum(valor) FILTER (WHERE natureza='principal' AND incluso_no_total), 0) AS bruto,
      COALESCE(sum(valor) FILTER (WHERE natureza='deducao'   AND incluso_no_total), 0) AS descontos,
      COALESCE(sum(valor) FILTER (WHERE natureza='acrescimo' AND incluso_no_total), 0) AS acrescimos
    FROM public.zoo_operacao_partes WHERE operacao_id = p_operacao_id
  ) r
  WHERE o.id = p_operacao_id;
END;
$$;
REVOKE ALL ON FUNCTION public._oc_aplicar_partes(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- oc_salvar_rascunho — RPC SOBERANA (upsert transacional).
--   p_operacao_id NULL => cria; preenchido => atualiza (exige versao + rascunho).
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_id uuid;
  v_nome text;
  v_mov text;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501';
  END IF;

  -- Snapshot do responsável resolvido no servidor (helper único, tenant-safe).
  v_nome := public.resolver_nome_usuario(v_actor);

  IF p_operacao_id IS NULL THEN
    -- CREATE
    INSERT INTO public.zoo_operacoes_comerciais (
      cliente_id, tipo_operacao, data_operacao, responsavel, responsavel_nome_snapshot,
      cenario, contraparte_id, tipo_precificacao, preco_unitario, condicao_pagamento, data_pagamento_prevista,
      observacoes, status_comercial, status_financeiro, versao, created_by, updated_by)
    VALUES (
      p_cliente_id, p_payload->>'tipo_operacao', (p_payload->>'data_operacao')::date, v_nome, v_nome,
      COALESCE(p_payload->>'cenario','realizado'), NULLIF(p_payload->>'contraparte_id','')::uuid,
      p_payload->>'tipo_precificacao', NULLIF(p_payload->>'preco_unitario','')::numeric,
      p_payload->>'condicao_pagamento', NULLIF(p_payload->>'data_pagamento_prevista','')::date,
      p_payload->>'observacoes', 'rascunho', 'nao_aplicavel', 1, v_actor, v_actor)
    RETURNING id INTO v_id;

    FOR v_mov IN SELECT value FROM jsonb_array_elements_text(COALESCE(p_payload->'movimentacoes','[]'::jsonb))
    LOOP
      INSERT INTO public.zoo_operacao_movimentacoes (cliente_id, operacao_id, movimentacao_id, created_by)
      VALUES (p_cliente_id, v_id, v_mov::uuid, v_actor);
    END LOOP;

    PERFORM public._oc_aplicar_partes(v_id, p_cliente_id, COALESCE(p_payload->'partes','[]'::jsonb));

    INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
    VALUES (p_cliente_id, v_id, 'criar_rascunho', p_payload, v_actor, 'rpc');

    SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = v_id;
    RETURN jsonb_build_object('ok', true, 'operacao_id', v_id, 'versao', 1,
      'status_comercial', 'rascunho', 'status_financeiro', 'nao_aplicavel', 'valor_total', v_op.valor_total);
  END IF;

  -- UPDATE
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.status_comercial <> 'rascunho' THEN
    RAISE EXCEPTION 'So rascunho pode ser salvo (estado %); use oc_reabrir', v_op.status_comercial USING ERRCODE = 'P0001';
  END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001';
  END IF;

  UPDATE public.zoo_operacoes_comerciais SET
    tipo_operacao           = COALESCE(p_payload->>'tipo_operacao', tipo_operacao),
    data_operacao           = COALESCE(NULLIF(p_payload->>'data_operacao','')::date, data_operacao),
    contraparte_id          = CASE WHEN p_payload ? 'contraparte_id' THEN NULLIF(p_payload->>'contraparte_id','')::uuid ELSE contraparte_id END,
    tipo_precificacao       = CASE WHEN p_payload ? 'tipo_precificacao' THEN p_payload->>'tipo_precificacao' ELSE tipo_precificacao END,
    preco_unitario          = CASE WHEN p_payload ? 'preco_unitario' THEN NULLIF(p_payload->>'preco_unitario','')::numeric ELSE preco_unitario END,
    condicao_pagamento      = CASE WHEN p_payload ? 'condicao_pagamento' THEN p_payload->>'condicao_pagamento' ELSE condicao_pagamento END,
    data_pagamento_prevista = CASE WHEN p_payload ? 'data_pagamento_prevista' THEN NULLIF(p_payload->>'data_pagamento_prevista','')::date ELSE data_pagamento_prevista END,
    observacoes             = CASE WHEN p_payload ? 'observacoes' THEN p_payload->>'observacoes' ELSE observacoes END,
    versao = versao + 1, updated_at = now(), updated_by = v_actor
  WHERE id = p_operacao_id;

  -- Movimentações são read-only após a criação (G2): p_payload->'movimentacoes' ignorado.
  PERFORM public._oc_aplicar_partes(p_operacao_id, p_cliente_id, COALESCE(p_payload->'partes','[]'::jsonb));

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'salvar_rascunho', to_jsonb(v_op), p_payload, v_actor, 'rpc');

  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;
  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao,
    'status_comercial', v_op.status_comercial, 'status_financeiro', v_op.status_financeiro, 'valor_total', v_op.valor_total);
END;
$$;
REVOKE ALL ON FUNCTION public.oc_salvar_rascunho(uuid, uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_salvar_rascunho(uuid, uuid, integer, jsonb) TO authenticated;

-- oc_criar_rascunho: helper de compatibilidade — delega ao ramo CREATE da soberana.
CREATE OR REPLACE FUNCTION public.oc_criar_rascunho(p_cliente_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.oc_salvar_rascunho(NULL, p_cliente_id, NULL, p_payload);
END;
$$;

-- oc_alterar_parcelas: passa a usar o helper (catálogo + seq/qtd + resumos).
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
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operacao cancelada nao permite alterar parcelas' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_financeiro NOT IN ('nao_aplicavel','pendente') THEN
    RAISE EXCEPTION 'Parcelas so podem ser alteradas antes da sincronizacao (status=%)', v_op.status_financeiro USING ERRCODE = 'P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_partes WHERE operacao_id = p_operacao_id AND financeiro_lancamento_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Ha partes vinculadas a titulos; cancele/ressincronize antes' USING ERRCODE = 'P0001'; END IF;

  PERFORM public._oc_aplicar_partes(p_operacao_id, p_cliente_id, p_parcelas);
  UPDATE public.zoo_operacoes_comerciais SET versao = versao + 1, updated_at = now(), updated_by = v_actor WHERE id = p_operacao_id;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'alterar_parcelas', p_parcelas, v_actor, 'rpc');

  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;
  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao,
    'status_comercial', v_op.status_comercial, 'status_financeiro', v_op.status_financeiro, 'valor_total', v_op.valor_total);
END;
$$;

-- oc_editar_negociacao: DEIXA DE PERSISTIR resumos (valor_bruto/descontos/acrescimos/valor_total).
--   Assinatura preservada (ignora essas chaves). Resumos derivam só das partes.
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
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operacao cancelada nao pode ser editada' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_financeiro = 'sincronizado' THEN
    RAISE EXCEPTION 'Operacao sincronizada; reabra/ressincronize antes' USING ERRCODE = 'P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;

  UPDATE public.zoo_operacoes_comerciais SET
    tipo_operacao           = COALESCE(p_payload->>'tipo_operacao', tipo_operacao),
    data_operacao           = COALESCE(NULLIF(p_payload->>'data_operacao','')::date, data_operacao),
    contraparte_id          = CASE WHEN p_payload ? 'contraparte_id' THEN NULLIF(p_payload->>'contraparte_id','')::uuid ELSE contraparte_id END,
    tipo_precificacao       = CASE WHEN p_payload ? 'tipo_precificacao' THEN p_payload->>'tipo_precificacao' ELSE tipo_precificacao END,
    preco_unitario          = CASE WHEN p_payload ? 'preco_unitario' THEN NULLIF(p_payload->>'preco_unitario','')::numeric ELSE preco_unitario END,
    condicao_pagamento      = CASE WHEN p_payload ? 'condicao_pagamento' THEN p_payload->>'condicao_pagamento' ELSE condicao_pagamento END,
    data_pagamento_prevista = CASE WHEN p_payload ? 'data_pagamento_prevista' THEN NULLIF(p_payload->>'data_pagamento_prevista','')::date ELSE data_pagamento_prevista END,
    observacoes             = CASE WHEN p_payload ? 'observacoes' THEN p_payload->>'observacoes' ELSE observacoes END,
    status_financeiro       = CASE WHEN status_financeiro IN ('divergente','erro') THEN 'pendente' ELSE status_financeiro END,
    versao = versao + 1, updated_at = now(), updated_by = v_actor
  WHERE id = p_operacao_id;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, dados_novos, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'editar_negociacao', to_jsonb(v_op), p_payload, v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao + 1,
    'status_comercial', v_op.status_comercial,
    'status_financeiro', CASE WHEN v_op.status_financeiro IN ('divergente','erro') THEN 'pendente' ELSE v_op.status_financeiro END);
END;
$$;

-- oc_confirmar: + invariantes (soma principal > 0, valor_total derivado > 0).
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
  v_soma_principal numeric;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.status_comercial = 'confirmada' THEN
    RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao,
      'status_comercial','confirmada','status_financeiro', v_op.status_financeiro, 'idempotente', true);
  END IF;
  IF v_op.status_comercial <> 'rascunho' THEN
    RAISE EXCEPTION 'Operacao em estado % nao pode ser confirmada', v_op.status_comercial USING ERRCODE = 'P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  IF v_op.contraparte_id IS NULL THEN
    RAISE EXCEPTION 'Operacao exige contraparte para ser confirmada' USING ERRCODE = 'P0001'; END IF;
  SELECT count(*) INTO v_nmov FROM public.zoo_operacao_movimentacoes WHERE operacao_id = p_operacao_id;
  IF v_nmov = 0 THEN RAISE EXCEPTION 'Operacao exige ao menos uma movimentacao vinculada' USING ERRCODE = 'P0001'; END IF;
  SELECT count(*), COALESCE(sum(valor) FILTER (WHERE incluso_no_total), 0)
    INTO v_nprincipal, v_soma_principal
    FROM public.zoo_operacao_partes WHERE operacao_id = p_operacao_id AND natureza = 'principal';
  IF v_nprincipal = 0 THEN RAISE EXCEPTION 'Operacao exige ao menos uma parte principal' USING ERRCODE = 'P0001'; END IF;
  IF v_soma_principal <= 0 THEN RAISE EXCEPTION 'Soma das partes principais incluidas deve ser > 0' USING ERRCODE = 'P0001'; END IF;
  IF v_op.valor_total IS NULL OR v_op.valor_total <= 0 THEN
    RAISE EXCEPTION 'Valor total (liquido) deve ser > 0 para confirmar' USING ERRCODE = 'P0001'; END IF;

  UPDATE public.zoo_operacoes_comerciais
    SET status_comercial = 'confirmada', status_financeiro = 'pendente',
        versao = versao + 1, updated_at = now(), updated_by = v_actor
  WHERE id = p_operacao_id;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'confirmar', to_jsonb(v_op), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao + 1,
    'status_comercial','confirmada','status_financeiro','pendente');
END;
$$;

-- oc_reabrir: confirmada -> rascunho, reusando o predicado soberano de proteção.
CREATE OR REPLACE FUNCTION public.oc_reabrir(
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
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operacao cancelada nao pode ser reaberta' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'rascunho' THEN
    RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao,
      'status_comercial','rascunho','status_financeiro', v_op.status_financeiro, 'idempotente', true);
  END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;

  -- Predicado soberano (idêntico a oc_sincronizar/oc_cancelar): título protegido bloqueia.
  SELECT count(*) INTO v_protegidos
    FROM public.zoo_operacao_partes pt
    JOIN public.financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id
   WHERE pt.operacao_id = p_operacao_id
     AND f.cancelado IS NOT TRUE
     AND (f.status_transacao IN ('realizado','agendado') OR f.conciliado_em IS NOT NULL);
  IF v_protegidos > 0 THEN
    -- Erro controlado: NENHUMA mutação (estado, versão, vínculos, títulos preservados).
    RAISE EXCEPTION 'Reabertura bloqueada: % titulo(s) realizado/agendado/conciliado', v_protegidos USING ERRCODE = 'P0001';
  END IF;

  -- Títulos OC não protegidos: cancela e desvincula.
  UPDATE public.financeiro_lancamentos_v2 f
    SET cancelado = true, cancelado_em = now(), cancelado_por = v_actor
    FROM public.zoo_operacao_partes pt
   WHERE pt.operacao_id = p_operacao_id AND pt.financeiro_lancamento_id = f.id AND f.cancelado IS NOT TRUE;
  UPDATE public.zoo_operacao_partes SET financeiro_lancamento_id = NULL
   WHERE operacao_id = p_operacao_id AND financeiro_lancamento_id IS NOT NULL;

  UPDATE public.zoo_operacoes_comerciais
    SET status_comercial = 'rascunho', status_financeiro = 'nao_aplicavel',
        versao = versao + 1, updated_at = now(), updated_by = v_actor
  WHERE id = p_operacao_id;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'reabrir', to_jsonb(v_op), jsonb_build_object('motivo', p_motivo), v_actor, 'rpc');

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao + 1,
    'status_comercial','rascunho','status_financeiro','nao_aplicavel');
END;
$$;
REVOKE ALL ON FUNCTION public.oc_reabrir(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_reabrir(uuid, uuid, integer, text) TO authenticated;
