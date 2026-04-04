
-- ============================================================
-- Function: get_status_pilares_fechamento
-- Returns JSONB with status of each pillar for a fazenda+month
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_status_pilares_fechamento(
  _fazenda_id uuid,
  _ano_mes text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _p1_status text;
  _p2_status text;
  _p3_status text;
  _p4_status text;
  _p5_status text;
  _total_pastos int;
  _fechados int;
  _has_vr_fechamento bool;
  _vr_status text;
  _has_fin_fechamento bool;
  _fin_status text;
BEGIN
  -- ========== P1: Mapa de Pastos ==========
  -- Count active pastos vs closed fechamentos
  SELECT count(*) INTO _total_pastos
  FROM pastos
  WHERE fazenda_id = _fazenda_id
    AND ativo = true
    AND entra_conciliacao = true;

  SELECT count(*) INTO _fechados
  FROM fechamento_pastos
  WHERE fazenda_id = _fazenda_id
    AND ano_mes = _ano_mes
    AND status = 'fechado';

  IF _total_pastos = 0 THEN
    _p1_status := 'bloqueado'; -- no pastos configured
  ELSIF _fechados >= _total_pastos THEN
    _p1_status := 'oficial';
  ELSIF _fechados > 0 THEN
    _p1_status := 'provisorio'; -- partially closed
  ELSE
    _p1_status := 'provisorio'; -- none closed yet
  END IF;

  -- ========== P2: Valor do Rebanho ==========
  -- Depends on P1 being oficial
  SELECT status INTO _vr_status
  FROM valor_rebanho_fechamento
  WHERE fazenda_id = _fazenda_id
    AND ano_mes = _ano_mes
  LIMIT 1;

  IF _p1_status != 'oficial' THEN
    _p2_status := 'bloqueado'; -- P1 dependency not met
  ELSIF _vr_status = 'fechado' THEN
    _p2_status := 'oficial';
  ELSE
    _p2_status := 'provisorio';
  END IF;

  -- ========== P3: Financeiro Caixa ==========
  -- Independent pillar
  SELECT status_fechamento INTO _fin_status
  FROM financeiro_fechamentos
  WHERE fazenda_id = _fazenda_id
    AND ano_mes = _ano_mes
  LIMIT 1;

  IF _fin_status = 'fechado' THEN
    _p3_status := 'oficial';
  ELSE
    _p3_status := 'provisorio';
  END IF;

  -- ========== P4: Competência Econômica ==========
  -- Depends on P1 (rebanho), NOT on P3
  IF _p1_status != 'oficial' THEN
    _p4_status := 'bloqueado';
  ELSE
    -- For now, P4 follows P1 status since competência
    -- validation screen doesn't exist yet
    _p4_status := 'provisorio';
  END IF;

  -- ========== P5: Econômico Consolidado ==========
  -- Only oficial when P1+P2+P3+P4 are all oficial
  IF _p1_status = 'oficial' AND _p2_status = 'oficial'
     AND _p3_status = 'oficial' AND _p4_status = 'oficial' THEN
    _p5_status := 'oficial';
  ELSIF _p1_status = 'bloqueado' OR _p2_status = 'bloqueado'
     OR _p3_status = 'bloqueado' OR _p4_status = 'bloqueado' THEN
    _p5_status := 'bloqueado';
  ELSE
    _p5_status := 'provisorio';
  END IF;

  RETURN jsonb_build_object(
    'p1_mapa_pastos', jsonb_build_object(
      'status', _p1_status,
      'total_pastos', _total_pastos,
      'fechados', _fechados
    ),
    'p2_valor_rebanho', jsonb_build_object(
      'status', _p2_status,
      'dependencia_p1', _p1_status
    ),
    'p3_financeiro_caixa', jsonb_build_object(
      'status', _p3_status
    ),
    'p4_competencia', jsonb_build_object(
      'status', _p4_status,
      'dependencia_p1', _p1_status
    ),
    'p5_economico_consolidado', jsonb_build_object(
      'status', _p5_status,
      'p1', _p1_status,
      'p2', _p2_status,
      'p3', _p3_status,
      'p4', _p4_status
    )
  );
END;
$$;

-- ============================================================
-- Table: fechamento_reaberturas_log (audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fechamento_reaberturas_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL,
  cliente_id uuid NOT NULL,
  ano_mes text NOT NULL,
  pilar text NOT NULL, -- 'p1_mapa_pastos', 'p2_valor_rebanho', etc.
  acao text NOT NULL, -- 'reabertura', 'invalidacao_cascata'
  motivo text,
  usuario_id uuid,
  pilares_invalidados text[], -- cascading invalidations
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fechamento_reaberturas_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_select" ON public.fechamento_reaberturas_log
  FOR SELECT TO authenticated
  USING (
    cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))
    OR is_admin_agroinblue(auth.uid())
  );

CREATE POLICY "cliente_insert" ON public.fechamento_reaberturas_log
  FOR INSERT TO authenticated
  WITH CHECK (
    cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))
    OR is_admin_agroinblue(auth.uid())
  );

-- No UPDATE or DELETE policies - audit log is immutable

-- ============================================================
-- Function: reabrir_pilar_fechamento
-- Reopens a pillar with cascading invalidation + audit log
-- ============================================================
CREATE OR REPLACE FUNCTION public.reabrir_pilar_fechamento(
  _fazenda_id uuid,
  _ano_mes text,
  _pilar text,
  _motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _cliente_id uuid;
  _cascata text[] := '{}';
BEGIN
  -- Get cliente_id from fazenda
  SELECT cliente_id INTO _cliente_id
  FROM fazendas WHERE id = _fazenda_id;

  IF _cliente_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Fazenda não encontrada');
  END IF;

  -- Execute reopening based on pillar
  IF _pilar = 'p1_mapa_pastos' THEN
    -- Reopen all fechamento_pastos for this month
    UPDATE fechamento_pastos
    SET status = 'rascunho', updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado';

    -- Cascade: invalidate P2 (Valor do Rebanho)
    UPDATE valor_rebanho_fechamento
    SET status = 'reaberto', reaberto_por = _user_id, reaberto_em = now(), updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado';

    IF FOUND THEN
      _cascata := array_append(_cascata, 'p2_valor_rebanho');
    END IF;

  ELSIF _pilar = 'p2_valor_rebanho' THEN
    UPDATE valor_rebanho_fechamento
    SET status = 'reaberto', reaberto_por = _user_id, reaberto_em = now(), updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado';

  ELSIF _pilar = 'p3_financeiro_caixa' THEN
    UPDATE financeiro_fechamentos
    SET status_fechamento = 'reaberto', reaberto_por = _user_id, reaberto_em = now(), updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status_fechamento = 'fechado';

  ELSE
    RETURN jsonb_build_object('error', 'Pilar inválido: ' || _pilar);
  END IF;

  -- Log the reopening
  INSERT INTO fechamento_reaberturas_log
    (fazenda_id, cliente_id, ano_mes, pilar, acao, motivo, usuario_id, pilares_invalidados)
  VALUES
    (_fazenda_id, _cliente_id, _ano_mes, _pilar, 'reabertura', _motivo, _user_id, _cascata);

  -- Log cascading invalidations separately
  IF array_length(_cascata, 1) > 0 THEN
    INSERT INTO fechamento_reaberturas_log
      (fazenda_id, cliente_id, ano_mes, pilar, acao, motivo, usuario_id, pilares_invalidados)
    SELECT _fazenda_id, _cliente_id, _ano_mes, unnest(_cascata), 'invalidacao_cascata',
           'Cascata de reabertura do pilar ' || _pilar, _user_id, '{}';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'pilar_reaberto', _pilar,
    'cascata', _cascata
  );
END;
$$;
