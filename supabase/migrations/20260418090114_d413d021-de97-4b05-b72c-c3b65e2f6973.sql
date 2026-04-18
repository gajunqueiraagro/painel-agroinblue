CREATE OR REPLACE FUNCTION public.get_status_pilares_fechamento(_fazenda_id uuid, _ano_mes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _p1_status text;
  _p1_detalhe jsonb;
  _p2_status text;
  _p3_status text;
  _p4_status text;
  _p4_modo_transitorio boolean := false;
  _p5_status text;
  _total_pastos int;
  _total_fechados int;
  _conciliacao jsonb;
  _tem_divergencia boolean;
  _p2_existe boolean;
  _p3_existe boolean;
  _p4_existe boolean;
BEGIN
  -- ========== P1 - Mapa de Pastos ==========
  SELECT count(*) INTO _total_pastos
  FROM pastos
  WHERE fazenda_id = _fazenda_id
    AND ativo = true
    AND (data_inicio IS NULL OR data_inicio <= (_ano_mes || '-01')::date);

  SELECT count(*) INTO _total_fechados
  FROM fechamento_pastos
  WHERE fazenda_id = _fazenda_id
    AND ano_mes = _ano_mes
    AND status = 'fechado';

  -- Validar conciliação
  _conciliacao := validar_conciliacao_rebanho(_fazenda_id, _ano_mes);
  _tem_divergencia := (_conciliacao->>'conciliado')::boolean IS DISTINCT FROM true;

  IF _total_pastos = 0 THEN
    _p1_status := 'bloqueado';
    _p1_detalhe := jsonb_build_object('motivo', 'sem_pastos_ativos');
  ELSIF _total_fechados < _total_pastos THEN
    _p1_status := 'provisorio';
    _p1_detalhe := jsonb_build_object(
      'total_pastos', _total_pastos,
      'total_fechados', _total_fechados
    );
  ELSIF _tem_divergencia THEN
    _p1_status := 'bloqueado';
    _p1_detalhe := jsonb_build_object(
      'motivo', 'divergencia_rebanho',
      'divergencias', _conciliacao->'divergencias'
    );
  ELSE
    _p1_status := 'oficial';
    _p1_detalhe := jsonb_build_object(
      'total_pastos', _total_pastos,
      'total_fechados', _total_fechados,
      'conciliacao', _conciliacao
    );
  END IF;

  -- ========== P2 - Valor do Rebanho ==========
  IF _p1_status != 'oficial' THEN
    _p2_status := 'bloqueado';
  ELSE
    SELECT EXISTS(
      SELECT 1 FROM valor_rebanho_fechamento
      WHERE fazenda_id = _fazenda_id
        AND ano_mes = _ano_mes
        AND status = 'fechado'
    ) INTO _p2_existe;

    IF _p2_existe THEN
      _p2_status := 'oficial';
    ELSE
      _p2_status := 'provisorio';
    END IF;
  END IF;

  -- ========== P3 - Financeiro Caixa ==========
  SELECT EXISTS(
    SELECT 1 FROM financeiro_fechamentos
    WHERE fazenda_id = _fazenda_id
      AND ano_mes = _ano_mes
      AND status_fechamento = 'fechado'
  ) INTO _p3_existe;

  IF _p3_existe THEN
    _p3_status := 'oficial';
  ELSE
    _p3_status := 'provisorio';
  END IF;

  -- ========== P4 - Competência Econômica ==========
  IF _p1_status != 'oficial' THEN
    _p4_status := 'bloqueado';
    _p4_modo_transitorio := false;
  ELSE
    SELECT EXISTS(
      SELECT 1 FROM competencia_fechamento
      WHERE fazenda_id = _fazenda_id
        AND ano_mes = _ano_mes
        AND status = 'fechado'
    ) INTO _p4_existe;

    IF _p4_existe THEN
      _p4_status := 'oficial';
      _p4_modo_transitorio := false;
    ELSE
      _p4_status := 'oficial';
      _p4_modo_transitorio := true;
    END IF;
  END IF;

  -- ========== P5 - Econômico Consolidado ==========
  IF _p1_status = 'oficial'
     AND _p2_status = 'oficial'
     AND _p3_status = 'oficial'
     AND _p4_status = 'oficial' THEN
    _p5_status := 'oficial';
  ELSIF _p1_status = 'bloqueado'
     OR _p2_status = 'bloqueado'
     OR _p4_status = 'bloqueado' THEN
    _p5_status := 'bloqueado';
  ELSE
    _p5_status := 'provisorio';
  END IF;

  RETURN jsonb_build_object(
    'fazenda_id', _fazenda_id,
    'ano_mes', _ano_mes,
    'p1_mapa_pastos', jsonb_build_object(
      'status', _p1_status,
      'detalhe', _p1_detalhe
    ),
    'p2_valor_rebanho', jsonb_build_object(
      'status', _p2_status
    ),
    'p3_financeiro_caixa', jsonb_build_object(
      'status', _p3_status
    ),
    'p4_competencia', jsonb_build_object(
      'status', _p4_status,
      'modo_transitorio', _p4_modo_transitorio
    ),
    'p5_economico_consolidado', jsonb_build_object(
      'status', _p5_status
    )
  );
END;
$function$;