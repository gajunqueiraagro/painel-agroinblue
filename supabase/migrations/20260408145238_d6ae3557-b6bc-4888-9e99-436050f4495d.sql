
-- ============================================================
-- CAMADA 1: BEFORE trigger — Bloqueio de edição
-- ============================================================

-- 1a. Bloqueio em fechamento_pastos
CREATE OR REPLACE FUNCTION public.guard_fechamento_pastos_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  -- Allow reopening operations (status changes to reaberto/rascunho from fechado)
  IF TG_OP = 'UPDATE'
     AND NEW.status IN ('reaberto', 'rascunho')
     AND OLD.status = 'fechado' THEN
    RETURN NEW;
  END IF;

  -- Block if validated snapshot exists OR P2 is formally closed
  IF EXISTS (
    SELECT 1 FROM valor_rebanho_realizado_validado
    WHERE fazenda_id = NEW.fazenda_id
      AND ano_mes = NEW.ano_mes
      AND status = 'validado'
  ) OR EXISTS (
    SELECT 1 FROM valor_rebanho_fechamento
    WHERE fazenda_id = NEW.fazenda_id
      AND ano_mes = NEW.ano_mes
      AND status = 'fechado'
  ) THEN
    RAISE EXCEPTION
      'Mês % possui Valor do Rebanho validado ou P2 fechado. Reabra o pilar P2 antes de alterar pastos.',
      NEW.ano_mes;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_fechamento_pastos_snapshot
  BEFORE INSERT OR UPDATE ON public.fechamento_pastos
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_fechamento_pastos_snapshot();

-- 1b. Bloqueio em fechamento_pasto_itens
CREATE OR REPLACE FUNCTION public.guard_pasto_itens_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  _ano_mes text;
  _fazenda_id uuid;
BEGIN
  SELECT fp.ano_mes, fp.fazenda_id
  INTO _ano_mes, _fazenda_id
  FROM fechamento_pastos fp
  WHERE fp.id = COALESCE(NEW.fechamento_id, OLD.fechamento_id);

  IF _ano_mes IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM valor_rebanho_realizado_validado
      WHERE fazenda_id = _fazenda_id
        AND ano_mes = _ano_mes
        AND status = 'validado'
    ) OR EXISTS (
      SELECT 1 FROM valor_rebanho_fechamento
      WHERE fazenda_id = _fazenda_id
        AND ano_mes = _ano_mes
        AND status = 'fechado'
    )
  ) THEN
    RAISE EXCEPTION
      'Mês % possui Valor do Rebanho validado ou P2 fechado. Reabra o pilar P2 antes de alterar itens de pasto.',
      _ano_mes;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER trg_guard_pasto_itens_snapshot
  BEFORE INSERT OR UPDATE OR DELETE ON public.fechamento_pasto_itens
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_pasto_itens_snapshot();

-- ============================================================
-- CAMADA 2 + 3: AFTER trigger — Invalidação + Cascata
-- ============================================================

CREATE OR REPLACE FUNCTION public.invalidate_snapshot_on_pasto_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  _ano_mes text;
  _fazenda_id uuid;
  _cliente_id uuid;
  _invalidated_count int;
  _cascade_rec record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _ano_mes := OLD.ano_mes;
    _fazenda_id := OLD.fazenda_id;
  ELSE
    _ano_mes := NEW.ano_mes;
    _fazenda_id := NEW.fazenda_id;
  END IF;

  -- Camada 2: Invalidar snapshot do mês alterado
  UPDATE valor_rebanho_realizado_validado
  SET status = 'invalidado', updated_at = now()
  WHERE fazenda_id = _fazenda_id
    AND ano_mes = _ano_mes
    AND status = 'validado';

  GET DIAGNOSTICS _invalidated_count = ROW_COUNT;

  -- Se invalidou algo, aplicar cascata nos meses seguintes
  IF _invalidated_count > 0 THEN
    -- Buscar cliente_id para auditoria
    SELECT cliente_id INTO _cliente_id
    FROM fazendas WHERE id = _fazenda_id;

    -- Camada 3: Marcar meses seguintes como cadeia_quebrada
    FOR _cascade_rec IN
      UPDATE valor_rebanho_realizado_validado
      SET status = 'cadeia_quebrada', updated_at = now()
      WHERE fazenda_id = _fazenda_id
        AND ano_mes > _ano_mes
        AND status = 'validado'
      RETURNING ano_mes
    LOOP
      -- Log de auditoria para cada mês afetado em cascata
      INSERT INTO fechamento_reaberturas_log (
        fazenda_id, cliente_id, ano_mes, pilar, acao, motivo,
        pilares_invalidados, usuario_id
      ) VALUES (
        _fazenda_id, _cliente_id, _cascade_rec.ano_mes,
        'p2_valor_rebanho', 'invalidacao_cascata_snapshot',
        'Cascata automática: mês ' || _ano_mes || ' foi alterado após validação',
        ARRAY['p2_valor_rebanho', 'p5_economico_consolidado'],
        auth.uid()
      );
    END LOOP;

    -- Log do mês original invalidado
    INSERT INTO fechamento_reaberturas_log (
      fazenda_id, cliente_id, ano_mes, pilar, acao, motivo,
      pilares_invalidados, usuario_id
    ) VALUES (
      _fazenda_id, _cliente_id, _ano_mes,
      'p2_valor_rebanho', 'invalidacao_snapshot_automatica',
      'Snapshot invalidado automaticamente por alteração em fechamento de pastos',
      ARRAY['p2_valor_rebanho', 'p5_economico_consolidado'],
      auth.uid()
    );
  END IF;

  RETURN NULL; -- AFTER trigger
END;
$$;

CREATE TRIGGER trg_invalidate_snapshot_on_pasto_change
  AFTER INSERT OR UPDATE OR DELETE ON public.fechamento_pastos
  FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_snapshot_on_pasto_change();

-- ============================================================
-- ATUALIZAÇÃO: reabrir_pilar_fechamento (3 args + motivo)
-- ============================================================

CREATE OR REPLACE FUNCTION public.reabrir_pilar_fechamento(
  _fazenda_id uuid, _ano_mes text, _pilar text, _motivo text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  _user_id uuid := auth.uid();
  _cliente_id uuid;
  _cascata text[] := '{}';
  _cascade_rec record;
BEGIN
  SELECT cliente_id INTO _cliente_id
  FROM fazendas WHERE id = _fazenda_id;

  IF _cliente_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Fazenda não encontrada');
  END IF;

  IF _pilar = 'p1_mapa_pastos' THEN
    UPDATE fechamento_pastos
    SET status = 'rascunho', updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado';

    -- Cascade P2: reabrir fechamento formal
    UPDATE valor_rebanho_fechamento
    SET status = 'reaberto', reaberto_por = _user_id, reaberto_em = now(), updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado';
    _cascata := array_append(_cascata, 'p2_valor_rebanho');

    -- Cascade P2: invalidar snapshot validado do mês
    UPDATE valor_rebanho_realizado_validado
    SET status = 'invalidado', updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'validado';

    -- Cascade: marcar meses seguintes como cadeia_quebrada
    FOR _cascade_rec IN
      UPDATE valor_rebanho_realizado_validado
      SET status = 'cadeia_quebrada', updated_at = now()
      WHERE fazenda_id = _fazenda_id AND ano_mes > _ano_mes AND status = 'validado'
      RETURNING ano_mes
    LOOP
      INSERT INTO fechamento_reaberturas_log (
        fazenda_id, cliente_id, ano_mes, pilar, acao, motivo,
        pilares_invalidados, usuario_id
      ) VALUES (
        _fazenda_id, _cliente_id, _cascade_rec.ano_mes,
        'p2_valor_rebanho', 'invalidacao_cascata_snapshot',
        'Cascata de reabertura do pilar ' || _pilar || ' em ' || _ano_mes,
        ARRAY['p2_valor_rebanho', 'p5_economico_consolidado'], _user_id
      );
    END LOOP;

    _cascata := array_append(_cascata, 'p4_competencia');
    _cascata := array_append(_cascata, 'p5_economico');

  ELSIF _pilar = 'p2_valor_rebanho' THEN
    UPDATE valor_rebanho_fechamento
    SET status = 'reaberto', reaberto_por = _user_id, reaberto_em = now(), updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado';

    -- Invalidar snapshot validado
    UPDATE valor_rebanho_realizado_validado
    SET status = 'invalidado', updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'validado';

    -- Cascata meses seguintes
    FOR _cascade_rec IN
      UPDATE valor_rebanho_realizado_validado
      SET status = 'cadeia_quebrada', updated_at = now()
      WHERE fazenda_id = _fazenda_id AND ano_mes > _ano_mes AND status = 'validado'
      RETURNING ano_mes
    LOOP
      INSERT INTO fechamento_reaberturas_log (
        fazenda_id, cliente_id, ano_mes, pilar, acao, motivo,
        pilares_invalidados, usuario_id
      ) VALUES (
        _fazenda_id, _cliente_id, _cascade_rec.ano_mes,
        'p2_valor_rebanho', 'invalidacao_cascata_snapshot',
        'Cascata de reabertura do pilar ' || _pilar || ' em ' || _ano_mes,
        ARRAY['p2_valor_rebanho', 'p5_economico_consolidado'], _user_id
      );
    END LOOP;

    _cascata := array_append(_cascata, 'p5_economico');

  ELSIF _pilar = 'p3_financeiro_caixa' THEN
    UPDATE financeiro_fechamentos
    SET status_fechamento = 'reaberto', reaberto_por = _user_id, reaberto_em = now(), updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status_fechamento = 'fechado';

    _cascata := array_append(_cascata, 'p5_economico');

  ELSE
    RETURN jsonb_build_object('error', 'Pilar inválido: ' || _pilar);
  END IF;

  INSERT INTO fechamento_reaberturas_log
    (fazenda_id, cliente_id, ano_mes, pilar, acao, motivo, usuario_id, pilares_invalidados)
  VALUES
    (_fazenda_id, _cliente_id, _ano_mes, _pilar, 'reabertura', _motivo, _user_id, _cascata);

  IF array_length(_cascata, 1) > 0 THEN
    INSERT INTO fechamento_reaberturas_log
      (fazenda_id, cliente_id, ano_mes, pilar, acao, motivo, usuario_id, pilares_invalidados)
    SELECT _fazenda_id, _cliente_id, _ano_mes, unnest(_cascata), 'invalidacao_cascata',
           'Cascata de reabertura do pilar ' || _pilar, _user_id, '{}';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'pilar_reaberto', _pilar,
    'cascata', to_jsonb(_cascata)
  );
END;
$$;

-- ============================================================
-- ATUALIZAÇÃO: reabrir_pilar_fechamento (5 args com _usuario_id)
-- ============================================================

CREATE OR REPLACE FUNCTION public.reabrir_pilar_fechamento(
  _fazenda_id uuid, _ano_mes text, _pilar text,
  _motivo text DEFAULT NULL, _usuario_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  _cliente_id uuid;
  _pilares_invalidados text[] := ARRAY[]::text[];
  _pilares_reabertos text[] := ARRAY[]::text[];
  _p2_existia boolean := false;
  _p4_existia boolean := false;
  _cascade_rec record;
BEGIN
  SELECT cliente_id INTO _cliente_id
  FROM fazendas WHERE id = _fazenda_id;

  IF _cliente_id IS NULL THEN
    RAISE EXCEPTION 'Fazenda não encontrada: %', _fazenda_id;
  END IF;

  IF _pilar = 'p1_mapa_pastos' THEN
    UPDATE fechamento_pastos
    SET status = 'reaberto', updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado';

    _pilares_reabertos := array_append(_pilares_reabertos, 'p1_mapa_pastos');

    SELECT EXISTS(
      SELECT 1 FROM valor_rebanho_fechamento
      WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado'
    ) INTO _p2_existia;

    IF _p2_existia THEN
      UPDATE valor_rebanho_fechamento
      SET status = 'reaberto', reaberto_em = now(), reaberto_por = _usuario_id, updated_at = now()
      WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado';
      _pilares_reabertos := array_append(_pilares_reabertos, 'p2_valor_rebanho');
    ELSE
      _pilares_invalidados := array_append(_pilares_invalidados, 'p2_valor_rebanho');
    END IF;

    -- Invalidar snapshot validado do mês
    UPDATE valor_rebanho_realizado_validado
    SET status = 'invalidado', updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'validado';

    -- Cascata: marcar meses seguintes como cadeia_quebrada
    FOR _cascade_rec IN
      UPDATE valor_rebanho_realizado_validado
      SET status = 'cadeia_quebrada', updated_at = now()
      WHERE fazenda_id = _fazenda_id AND ano_mes > _ano_mes AND status = 'validado'
      RETURNING ano_mes
    LOOP
      INSERT INTO fechamento_reaberturas_log (
        fazenda_id, cliente_id, ano_mes, pilar, acao, motivo,
        pilares_invalidados, usuario_id
      ) VALUES (
        _fazenda_id, _cliente_id, _cascade_rec.ano_mes,
        'p2_valor_rebanho', 'invalidacao_cascata_snapshot',
        'Cascata de reabertura do pilar ' || _pilar || ' em ' || _ano_mes,
        ARRAY['p2_valor_rebanho', 'p5_economico_consolidado'], _usuario_id
      );
    END LOOP;

    SELECT EXISTS(
      SELECT 1 FROM competencia_fechamento
      WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado'
    ) INTO _p4_existia;

    IF _p4_existia THEN
      UPDATE competencia_fechamento
      SET status = 'reaberto', reaberto_em = now(), reaberto_por = _usuario_id, updated_at = now()
      WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado';
      _pilares_reabertos := array_append(_pilares_reabertos, 'p4_competencia');
    ELSE
      _pilares_invalidados := array_append(_pilares_invalidados, 'p4_competencia');
    END IF;

    _pilares_invalidados := array_append(_pilares_invalidados, 'p5_economico_consolidado');

  ELSIF _pilar = 'p2_valor_rebanho' THEN
    UPDATE valor_rebanho_fechamento
    SET status = 'reaberto', reaberto_em = now(), reaberto_por = _usuario_id, updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado';

    _pilares_reabertos := array_append(_pilares_reabertos, 'p2_valor_rebanho');

    -- Invalidar snapshot
    UPDATE valor_rebanho_realizado_validado
    SET status = 'invalidado', updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'validado';

    -- Cascata meses seguintes
    FOR _cascade_rec IN
      UPDATE valor_rebanho_realizado_validado
      SET status = 'cadeia_quebrada', updated_at = now()
      WHERE fazenda_id = _fazenda_id AND ano_mes > _ano_mes AND status = 'validado'
      RETURNING ano_mes
    LOOP
      INSERT INTO fechamento_reaberturas_log (
        fazenda_id, cliente_id, ano_mes, pilar, acao, motivo,
        pilares_invalidados, usuario_id
      ) VALUES (
        _fazenda_id, _cliente_id, _cascade_rec.ano_mes,
        'p2_valor_rebanho', 'invalidacao_cascata_snapshot',
        'Cascata de reabertura do pilar ' || _pilar || ' em ' || _ano_mes,
        ARRAY['p2_valor_rebanho', 'p5_economico_consolidado'], _usuario_id
      );
    END LOOP;

    _pilares_invalidados := array_append(_pilares_invalidados, 'p5_economico_consolidado');

  ELSIF _pilar = 'p3_financeiro_caixa' THEN
    UPDATE financeiro_fechamentos
    SET status_fechamento = 'reaberto', reaberto_por = _usuario_id, reaberto_em = now(), updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status_fechamento = 'fechado';

    _pilares_reabertos := array_append(_pilares_reabertos, 'p3_financeiro_caixa');
    _pilares_invalidados := array_append(_pilares_invalidados, 'p5_economico_consolidado');

  ELSIF _pilar = 'p4_competencia' THEN
    UPDATE competencia_fechamento
    SET status = 'reaberto', reaberto_em = now(), reaberto_por = _usuario_id, updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado';

    _pilares_reabertos := array_append(_pilares_reabertos, 'p4_competencia');
    _pilares_invalidados := array_append(_pilares_invalidados, 'p5_economico_consolidado');

  ELSE
    RAISE EXCEPTION 'Pilar desconhecido: %', _pilar;
  END IF;

  INSERT INTO fechamento_reaberturas_log (
    fazenda_id, cliente_id, ano_mes, pilar, acao, motivo,
    pilares_invalidados, usuario_id
  ) VALUES (
    _fazenda_id, _cliente_id, _ano_mes, _pilar, 'reabertura', _motivo,
    _pilares_reabertos || _pilares_invalidados, _usuario_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'pilar_reaberto', _pilar,
    'pilares_efetivamente_reabertos', to_jsonb(_pilares_reabertos),
    'pilares_logicamente_invalidados', to_jsonb(_pilares_invalidados)
  );
END;
$$;
