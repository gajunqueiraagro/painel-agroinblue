-- ============================================================================
-- PR-MESA-GRUPO-01 — Agrupamento manual de candidatos na Mesa (match N:1).
--
-- "O sistema explica, o operador decide. Nada é agrupado sozinho." [Princípio 9]
-- Etapa: MESA/ENRIQUECIMENTO. N lançamentos do sistema ↔ 1 linha Excel, por decisão
-- humana (caso Sindicato Rural / doc. 51804). Evolução do RESOLUCAO-01 — o 1:1
-- (resolver_proximos) fica INTACTO exceto pelo guard simétrico (delta 7).
--
-- Base: pacote Mesa (HEAD 2ab399c8). candidatos_proximos = janela ±10 ∩ ano_mes.
--
-- NOTA sobre estado_anterior (delta 4g/5): a coluna é jsonb, "dona" do apply
-- (snapshot dos campos do lançamento p/ reverter_row). Reusá-la p/ a ORIGEM do grupo
-- é SEGURO: linhas de grupo têm match_lancamento_id (singular) = NULL → apply_row
-- retorna 'sem_lancamento_vinculado' ANTES de tocar estado_anterior; e linhas nunca
-- aplicadas (candidatos_proximos/sem_match) têm estado_anterior = NULL antes de agrupar.
-- Guardo to_jsonb(match_status) e leio de volta com #>> '{}'.
-- ============================================================================

-- ── DELTA 1) coluna do grupo + CHECK de coerência (singular XOR plural) ───────
ALTER TABLE public.financeiro_classificacao_staging
  ADD COLUMN IF NOT EXISTS match_lancamento_ids uuid[] NULL;
ALTER TABLE public.financeiro_classificacao_staging
  DROP CONSTRAINT IF EXISTS financeiro_classificacao_staging_match_coerencia_check;
ALTER TABLE public.financeiro_classificacao_staging
  ADD CONSTRAINT financeiro_classificacao_staging_match_coerencia_check
  CHECK (NOT (match_lancamento_id IS NOT NULL AND match_lancamento_ids IS NOT NULL));

-- ── DELTA 2) CHECK de match_status += 'resolvido_grupo' ──────────────────────
ALTER TABLE public.financeiro_classificacao_staging
  DROP CONSTRAINT IF EXISTS financeiro_classificacao_staging_match_status_check;
ALTER TABLE public.financeiro_classificacao_staging
  ADD CONSTRAINT financeiro_classificacao_staging_match_status_check
  CHECK (match_status = ANY (ARRAY['exato','ambiguo','sem_match','ja_classificado','divergente','ambiguo_resolvido','ja_aplicado','sem_conta_para_match','candidatos_proximos','resolvido_manual','resolvido_grupo']));

-- ── DELTA 3) candidatos de GRUPO: candidatos_proximos verbatim EXCETO o valor ─
-- unitário (membros SOMAM, não igualam): ABS(valor) <= excel_valor + 0.005.
-- Demais filtros idênticos (±10 ∩ ano_mes, conta por ramo, tipo, realizado,
-- cancelado=false); ORDER BY distância. Mesma shape de retorno do candidatos_proximos.
CREATE OR REPLACE FUNCTION public.fn_classificacao_candidatos_grupo(p_staging_id uuid)
 RETURNS TABLE(lanc_id uuid, descricao text, observacao text, data_pagamento date, valor numeric, tipo_operacao text, subcentro_atual text, macro_atual text, grupo_atual text, favorecido_id uuid, favorecido_nome text, conta_bancaria_nome text, conta_destino_nome text, documento text, distancia_dias int)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_s RECORD; v_conta_origem_id uuid; v_conta_destino_id uuid; v_ano_mes text;
BEGIN
  SELECT * INTO v_s FROM public.financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_conta_origem_id  := COALESCE(v_s.conta_origem_id, public.fn_classificacao_resolver_conta(v_s.cliente_id, v_s.excel_conta_origem));
  v_conta_destino_id := COALESCE(v_s.conta_destino_id, public.fn_classificacao_resolver_conta(v_s.cliente_id, v_s.excel_conta_destino));
  v_ano_mes := COALESCE(v_s.excel_ano_mes, to_char(v_s.excel_data, 'YYYY-MM'));

  RETURN QUERY
  SELECT
    l.id, l.descricao, l.observacao, l.data_pagamento, l.valor,
    l.tipo_operacao, l.subcentro, l.macro_custo, l.grupo_custo,
    l.favorecido_id, fo.nome, cb.nome_exibicao, cd.nome_exibicao,
    l.numero_documento, ABS(l.data_pagamento - v_s.excel_data)::int
  FROM public.financeiro_lancamentos_v2 l
  LEFT JOIN public.financeiro_fornecedores     fo ON fo.id = l.favorecido_id
  LEFT JOIN public.financeiro_contas_bancarias cb ON cb.id = l.conta_bancaria_id
  LEFT JOIN public.financeiro_contas_bancarias cd ON cd.id = l.conta_destino_id
  WHERE l.cliente_id = v_s.cliente_id
    AND l.cancelado = false
    AND l.status_transacao = 'realizado'
    AND l.ano_mes = v_ano_mes
    AND l.data_pagamento BETWEEN v_s.excel_data - 10 AND v_s.excel_data + 10
    AND ABS(l.valor) <= v_s.excel_valor + 0.005
    AND l.tipo_operacao = v_s.excel_tipo_operacao
    AND (
      (l.tipo_operacao = '1-Entradas' AND (CASE WHEN v_conta_destino_id IS NOT NULL THEN l.conta_destino_id = v_conta_destino_id
                                                ELSE (l.conta_destino_id = v_conta_origem_id OR l.conta_bancaria_id = v_conta_origem_id) END)) OR
      (l.tipo_operacao = '2-Saídas'          AND l.conta_bancaria_id = v_conta_origem_id) OR
      (l.tipo_operacao = '3-Transferências'  AND l.conta_bancaria_id = v_conta_origem_id AND l.conta_destino_id = v_conta_destino_id)
    )
  ORDER BY ABS(l.data_pagamento - v_s.excel_data), l.id
  LIMIT 10;
END;
$function$;

-- ── DELTA 4) resolver_grupo: escolha humana de N membros (validações NA ORDEM) ─
CREATE OR REPLACE FUNCTION public.fn_classificacao_resolver_grupo(p_staging_id uuid, p_lancamento_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_staging  financeiro_classificacao_staging%ROWTYPE;
  v_user_id  uuid;
  v_n        int;
  v_distintos int;
  v_vivos    int;
  v_cand     int;
  v_conflito_linha int;
  v_soma     numeric;
  v_dif      numeric;
BEGIN
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_nao_encontrada'); END IF;

  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id)
          OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  -- (a) status elegível
  IF v_staging.match_status NOT IN ('candidatos_proximos','sem_match') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'status_nao_elegivel', 'match_status', v_staging.match_status);
  END IF;

  -- (b) array não-vazio, sem duplicatas internas, length >= 2
  IF p_lancamento_ids IS NULL OR array_length(p_lancamento_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lista_vazia');
  END IF;
  v_n := array_length(p_lancamento_ids, 1);
  SELECT COUNT(DISTINCT x) INTO v_distintos FROM unnest(p_lancamento_ids) AS x;
  IF v_distintos <> v_n THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ids_duplicados');
  END IF;
  IF v_n < 2 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'use_resolver_proximos');
  END IF;

  -- (c) todos existem e vivos (cancelado=false)
  SELECT COUNT(*) INTO v_vivos FROM financeiro_lancamentos_v2
   WHERE id = ANY(p_lancamento_ids) AND cancelado = false;
  IF v_vivos <> v_n THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_inexistente_ou_cancelado');
  END IF;

  -- (d) todos pertencem ao conjunto de candidatos_grupo(p_staging_id)
  SELECT COUNT(*) INTO v_cand
    FROM public.fn_classificacao_candidatos_grupo(p_staging_id) c
   WHERE c.lanc_id = ANY(p_lancamento_ids);
  IF v_cand <> v_n THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'candidato_invalido');
  END IF;

  -- (e) GUARD ANTI-DUPLO bidirecional: nenhum id pode estar em match_lancamento_id
  -- (singular) NEM em match_lancamento_ids (array) de OUTRA linha da MESMA sessão.
  SELECT excel_linha_origem INTO v_conflito_linha
    FROM financeiro_classificacao_staging
   WHERE sessao_id = v_staging.sessao_id
     AND staging_id <> p_staging_id
     AND (match_lancamento_id = ANY(p_lancamento_ids)
          OR COALESCE(match_lancamento_ids, ARRAY[]::uuid[]) && p_lancamento_ids)
   ORDER BY excel_linha_origem
   LIMIT 1;
  IF v_conflito_linha IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_ja_escolhido',
      'linha_conflitante', v_conflito_linha,
      'mensagem', format('Um dos lançamentos já foi escolhido pela linha %s desta sessão.', v_conflito_linha));
  END IF;

  -- (f) SUM(ABS(valor)) = excel_valor ± 0.005
  SELECT SUM(ABS(valor)) INTO v_soma FROM financeiro_lancamentos_v2 WHERE id = ANY(p_lancamento_ids);
  v_dif := v_soma - v_staging.excel_valor;
  IF ABS(v_dif) > 0.005 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'soma_divergente', 'soma', v_soma, 'diferenca', v_dif);
  END IF;

  -- (g) grava: origem em estado_anterior (jsonb), array, status resolvido_grupo, auditoria.
  UPDATE financeiro_classificacao_staging
  SET estado_anterior      = to_jsonb(v_staging.match_status),
      match_lancamento_ids = p_lancamento_ids,
      match_lancamento_id  = NULL,
      match_status         = 'resolvido_grupo',
      match_resolvido_em   = now(),
      match_resolvido_por  = v_user_id,
      updated_at           = now()
  WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object('ok', true, 'motivo', 'resolvido_grupo',
    'match_lancamento_ids', to_jsonb(p_lancamento_ids), 'soma', v_soma, 'match_status', 'resolvido_grupo');
END;
$function$;

-- ── DELTA 5) desfazer_grupo: volta ao status de ORIGEM (estado_anterior) ──────
CREATE OR REPLACE FUNCTION public.fn_classificacao_desfazer_grupo(p_staging_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_staging financeiro_classificacao_staging%ROWTYPE; v_user_id uuid; v_origem text;
BEGIN
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_nao_encontrada'); END IF;

  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id)
          OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  IF v_staging.match_status <> 'resolvido_grupo' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_resolvido_grupo');
  END IF;
  IF v_staging.aplicado = true THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_aplicado_reverter_antes');
  END IF;

  -- origem gravada no resolver; default seguro se ausente/inesperada.
  v_origem := COALESCE(v_staging.estado_anterior #>> '{}', 'candidatos_proximos');
  IF v_origem NOT IN ('candidatos_proximos','sem_match') THEN v_origem := 'candidatos_proximos'; END IF;

  UPDATE financeiro_classificacao_staging
  SET match_lancamento_ids = NULL,
      match_lancamento_id  = NULL,
      match_status         = v_origem,
      estado_anterior      = NULL,
      match_resolvido_em   = NULL,
      match_resolvido_por  = NULL,
      updated_at           = now()
  WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object('ok', true, 'motivo', 'desfeito', 'match_status', v_origem);
END;
$function$;

-- ── DELTA 7) guard SIMÉTRICO no resolver_proximos (1:1) ──────────────────────
-- CREATE OR REPLACE verbatim do resolver_proximos (RESOLUCAO-01) com UMA mudança: o
-- guard anti-duplo passa a olhar TAMBÉM os arrays (lançamento já em GRUPO de outra
-- linha bloqueia o 1:1). Nada mais muda no 1:1.
CREATE OR REPLACE FUNCTION public.fn_classificacao_resolver_proximos(p_staging_id uuid, p_lancamento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_staging financeiro_classificacao_staging%ROWTYPE;
  v_user_id uuid;
  v_is_cand boolean;
  v_lanc    financeiro_lancamentos_v2%ROWTYPE;
  v_conflito_linha int;
BEGIN
  SELECT * INTO v_staging FROM financeiro_classificacao_staging WHERE staging_id = p_staging_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'staging_nao_encontrada'); END IF;

  BEGIN v_user_id := auth.uid(); EXCEPTION WHEN OTHERS THEN v_user_id := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_user_id)
          OR v_staging.cliente_id IN (SELECT public.get_user_cliente_ids(v_user_id))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  END IF;

  -- Só 'candidatos_proximos' é resolvível por aqui (bloqueia sem_match/exato/etc).
  IF v_staging.match_status <> 'candidatos_proximos' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_candidatos_proximos', 'match_status', v_staging.match_status);
  END IF;

  IF p_lancamento_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_id_obrigatorio'); END IF;

  -- Candidato precisa estar entre os oferecidos pela janela (não aceita id arbitrário).
  SELECT EXISTS(SELECT 1 FROM public.fn_classificacao_candidatos_proximos(p_staging_id) c WHERE c.lanc_id = p_lancamento_id)
    INTO v_is_cand;
  IF NOT v_is_cand THEN RETURN jsonb_build_object('ok', false, 'motivo', 'candidato_invalido'); END IF;

  SELECT * INTO v_lanc FROM financeiro_lancamentos_v2 WHERE id = p_lancamento_id;
  IF NOT FOUND OR v_lanc.cancelado = true THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_inexistente_ou_cancelado');
  END IF;

  -- GUARD ANTI-DUPLO-MATCH (PR-MESA-GRUPO-01 delta 7: agora BIDIRECIONAL) — outra
  -- linha da MESMA sessão já usou este lançamento em match singular OU em grupo?
  SELECT excel_linha_origem INTO v_conflito_linha
    FROM financeiro_classificacao_staging
   WHERE sessao_id = v_staging.sessao_id
     AND staging_id <> p_staging_id
     AND (match_lancamento_id = p_lancamento_id
          OR p_lancamento_id = ANY(COALESCE(match_lancamento_ids, ARRAY[]::uuid[])))
   ORDER BY excel_linha_origem
   LIMIT 1;
  IF v_conflito_linha IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lancamento_ja_escolhido',
      'linha_conflitante', v_conflito_linha,
      'mensagem', format('Lançamento já escolhido pela linha %s desta sessão.', v_conflito_linha));
  END IF;

  UPDATE financeiro_classificacao_staging
  SET match_lancamento_id = p_lancamento_id,
      match_status        = 'resolvido_manual',
      match_resolvido_em  = now(),
      match_resolvido_por = v_user_id,
      updated_at          = now()
  WHERE staging_id = p_staging_id;

  RETURN jsonb_build_object('ok', true, 'motivo', 'resolvido',
    'match_lancamento_id', p_lancamento_id, 'match_status', 'resolvido_manual');
END;
$function$;
