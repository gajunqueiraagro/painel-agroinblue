
-- ============================================================
-- 1. Função de conciliação: saldo sistema vs saldo pastos
-- ============================================================
CREATE OR REPLACE FUNCTION public.validar_conciliacao_rebanho(
  _fazenda_id uuid,
  _ano_mes text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _ano int;
  _mes int;
  _end_date date;
  _result jsonb;
  _divergencias jsonb := '[]'::jsonb;
  _total_sistema int := 0;
  _total_pastos int := 0;
  _status text;
  rec record;
BEGIN
  _ano := split_part(_ano_mes, '-', 1)::int;
  _mes := split_part(_ano_mes, '-', 2)::int;
  -- Last day of month
  _end_date := (date_trunc('month', make_date(_ano, _mes, 1)) + interval '1 month - 1 day')::date;

  -- Build system balance per category (saldos_iniciais + lancamentos)
  FOR rec IN
    WITH cat_list AS (
      SELECT id, codigo, nome FROM categorias_rebanho
    ),
    saldo_ini AS (
      SELECT si.categoria, si.quantidade
      FROM saldos_iniciais si
      WHERE si.fazenda_id = _fazenda_id
        AND si.ano = _ano
    ),
    entradas AS (
      SELECT l.categoria, SUM(l.quantidade) AS qtd
      FROM lancamentos l
      WHERE l.fazenda_id = _fazenda_id
        AND l.cancelado = false
        AND l.data <= _end_date::text
        AND l.data >= (_ano || '-01-01')
        AND l.tipo IN ('nascimento','compra','transferencia_entrada')
      GROUP BY l.categoria
    ),
    saidas AS (
      SELECT l.categoria, SUM(l.quantidade) AS qtd
      FROM lancamentos l
      WHERE l.fazenda_id = _fazenda_id
        AND l.cancelado = false
        AND l.data <= _end_date::text
        AND l.data >= (_ano || '-01-01')
        AND l.tipo IN ('abate','venda','transferencia_saida','consumo','morte')
      GROUP BY l.categoria
    ),
    reclass_out AS (
      SELECT l.categoria, SUM(l.quantidade) AS qtd
      FROM lancamentos l
      WHERE l.fazenda_id = _fazenda_id
        AND l.cancelado = false
        AND l.data <= _end_date::text
        AND l.data >= (_ano || '-01-01')
        AND l.tipo = 'reclassificacao'
      GROUP BY l.categoria
    ),
    reclass_in AS (
      SELECT l.categoria_destino AS categoria, SUM(l.quantidade) AS qtd
      FROM lancamentos l
      WHERE l.fazenda_id = _fazenda_id
        AND l.cancelado = false
        AND l.data <= _end_date::text
        AND l.data >= (_ano || '-01-01')
        AND l.tipo = 'reclassificacao'
        AND l.categoria_destino IS NOT NULL
      GROUP BY l.categoria_destino
    ),
    sistema AS (
      SELECT
        c.codigo AS categoria,
        c.nome,
        COALESCE(si.quantidade, 0)
          + COALESCE(e.qtd, 0)
          - COALESCE(s.qtd, 0)
          - COALESCE(ro.qtd, 0)
          + COALESCE(ri.qtd, 0) AS saldo
      FROM cat_list c
      LEFT JOIN saldo_ini si ON si.categoria = c.codigo
      LEFT JOIN entradas e ON e.categoria = c.codigo
      LEFT JOIN saidas s ON s.categoria = c.codigo
      LEFT JOIN reclass_out ro ON ro.categoria = c.codigo
      LEFT JOIN reclass_in ri ON ri.categoria = c.codigo
    ),
    -- Pasture balance: sum from fechamento_pasto_itens for this month
    pasto_saldo AS (
      SELECT
        cr.codigo AS categoria,
        cr.nome,
        COALESCE(SUM(fpi.quantidade), 0) AS saldo
      FROM fechamento_pastos fp
      JOIN fechamento_pasto_itens fpi ON fpi.fechamento_id = fp.id
      JOIN categorias_rebanho cr ON cr.id = fpi.categoria_id
      WHERE fp.fazenda_id = _fazenda_id
        AND fp.ano_mes = _ano_mes
      GROUP BY cr.codigo, cr.nome
    ),
    comparacao AS (
      SELECT
        COALESCE(s.categoria, p.categoria) AS categoria,
        COALESCE(s.nome, p.nome) AS nome,
        COALESCE(s.saldo, 0) AS saldo_sistema,
        COALESCE(p.saldo, 0) AS saldo_pastos,
        COALESCE(s.saldo, 0) - COALESCE(p.saldo, 0) AS diferenca
      FROM sistema s
      FULL OUTER JOIN pasto_saldo p ON p.categoria = s.categoria
    )
    SELECT * FROM comparacao
    WHERE saldo_sistema != 0 OR saldo_pastos != 0
    ORDER BY categoria
  LOOP
    _total_sistema := _total_sistema + rec.saldo_sistema;
    _total_pastos := _total_pastos + rec.saldo_pastos;

    IF rec.diferenca != 0 THEN
      _divergencias := _divergencias || jsonb_build_object(
        'categoria', rec.categoria,
        'nome', rec.nome,
        'saldo_sistema', rec.saldo_sistema,
        'saldo_pastos', rec.saldo_pastos,
        'diferenca', rec.diferenca
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(_divergencias) = 0 THEN
    _status := 'conciliado';
  ELSE
    _status := 'divergente';
  END IF;

  RETURN jsonb_build_object(
    'status', _status,
    'total_sistema', _total_sistema,
    'total_pastos', _total_pastos,
    'diferenca_total', _total_sistema - _total_pastos,
    'divergencias', _divergencias
  );
END;
$$;

-- ============================================================
-- 2. Atualizar get_status_pilares_fechamento com conciliação
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_status_pilares_fechamento(
  _fazenda_id uuid,
  _ano_mes text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _p1_status text;
  _p2_status text;
  _p3_status text;
  _p4_status text;
  _p5_status text;
  _total_pastos int;
  _fechados int;
  _vr_status text;
  _fin_status text;
  _conciliacao jsonb;
  _conciliacao_status text;
  _p1_detail jsonb;
BEGIN
  -- ========== P1: Mapa de Pastos ==========
  SELECT count(*) INTO _total_pastos
  FROM pastos
  WHERE fazenda_id = _fazenda_id AND ativo = true AND entra_conciliacao = true;

  SELECT count(*) INTO _fechados
  FROM fechamento_pastos
  WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado';

  -- Run conciliation check
  _conciliacao := public.validar_conciliacao_rebanho(_fazenda_id, _ano_mes);
  _conciliacao_status := _conciliacao->>'status';

  IF _total_pastos = 0 THEN
    _p1_status := 'bloqueado';
  ELSIF _fechados >= _total_pastos AND _conciliacao_status = 'conciliado' THEN
    _p1_status := 'oficial';
  ELSIF _conciliacao_status = 'divergente' THEN
    _p1_status := 'bloqueado';
  ELSIF _fechados > 0 THEN
    _p1_status := 'provisorio';
  ELSE
    _p1_status := 'provisorio';
  END IF;

  _p1_detail := jsonb_build_object(
    'status', _p1_status,
    'total_pastos', _total_pastos,
    'fechados', _fechados,
    'conciliacao', _conciliacao
  );

  -- ========== P2: Valor do Rebanho ==========
  SELECT status INTO _vr_status
  FROM valor_rebanho_fechamento
  WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes
  LIMIT 1;

  IF _p1_status != 'oficial' THEN
    _p2_status := 'bloqueado';
  ELSIF _vr_status = 'fechado' THEN
    _p2_status := 'oficial';
  ELSE
    _p2_status := 'provisorio';
  END IF;

  -- ========== P3: Financeiro Caixa ==========
  SELECT status_fechamento INTO _fin_status
  FROM financeiro_fechamentos
  WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes
  LIMIT 1;

  IF _fin_status = 'fechado' THEN
    _p3_status := 'oficial';
  ELSE
    _p3_status := 'provisorio';
  END IF;

  -- ========== P4: Competência Econômica ==========
  IF _p1_status != 'oficial' THEN
    _p4_status := 'bloqueado';
  ELSE
    _p4_status := 'provisorio';
  END IF;

  -- ========== P5: Econômico Consolidado ==========
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
    'p1_mapa_pastos', _p1_detail,
    'p2_valor_rebanho', jsonb_build_object(
      'status', _p2_status, 'dependencia_p1', _p1_status
    ),
    'p3_financeiro_caixa', jsonb_build_object(
      'status', _p3_status
    ),
    'p4_competencia', jsonb_build_object(
      'status', _p4_status, 'dependencia_p1', _p1_status
    ),
    'p5_economico_consolidado', jsonb_build_object(
      'status', _p5_status,
      'p1', _p1_status, 'p2', _p2_status, 'p3', _p3_status, 'p4', _p4_status
    )
  );
END;
$$;

-- ============================================================
-- 3. Guard trigger: bloquear INSERT + UPDATE + DELETE estrutural
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_lancamento_mes_fechado_p1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _check_date text;
  _check_fazenda uuid;
  _ano_mes text;
  _is_structural_update bool := false;
BEGIN
  -- Determine which record to check
  IF TG_OP = 'DELETE' THEN
    _check_date := OLD.data;
    _check_fazenda := OLD.fazenda_id;
  ELSE
    _check_date := NEW.data;
    _check_fazenda := NEW.fazenda_id;
  END IF;

  -- Derive ano_mes from the lancamento date
  _ano_mes := substring(_check_date from 1 for 7);

  -- For UPDATE, only block if structural fields changed
  IF TG_OP = 'UPDATE' THEN
    IF OLD.data IS DISTINCT FROM NEW.data
       OR OLD.tipo IS DISTINCT FROM NEW.tipo
       OR OLD.quantidade IS DISTINCT FROM NEW.quantidade
       OR OLD.categoria IS DISTINCT FROM NEW.categoria
       OR OLD.categoria_destino IS DISTINCT FROM NEW.categoria_destino
       OR OLD.fazenda_id IS DISTINCT FROM NEW.fazenda_id
       OR OLD.fazenda_origem IS DISTINCT FROM NEW.fazenda_origem
       OR OLD.fazenda_destino IS DISTINCT FROM NEW.fazenda_destino
       OR (OLD.cancelado = false AND NEW.cancelado = true)
    THEN
      _is_structural_update := true;
    END IF;

    IF NOT _is_structural_update THEN
      -- Non-structural edit (peso, preço, obs) → allow
      RETURN NEW;
    END IF;

    -- Also check OLD month in case date changed
    IF OLD.data IS DISTINCT FROM NEW.data THEN
      DECLARE _old_ano_mes text := substring(OLD.data from 1 for 7);
      BEGIN
        IF EXISTS (
          SELECT 1 FROM public.fechamento_pastos fp
          JOIN public.pastos p ON p.fazenda_id = fp.fazenda_id
            AND p.ativo = true AND p.entra_conciliacao = true
          WHERE fp.fazenda_id = OLD.fazenda_id
            AND fp.ano_mes = _old_ano_mes
            AND fp.status = 'fechado'
          HAVING count(*) >= (
            SELECT count(*) FROM public.pastos
            WHERE fazenda_id = OLD.fazenda_id AND ativo = true AND entra_conciliacao = true
          )
        ) THEN
          RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1). Reabra o período para alterar campos estruturais.', _old_ano_mes;
        END IF;
      END;
    END IF;
  END IF;

  -- Check if target month is P1-closed (all active pastos closed)
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT count(*) AS fechados
      FROM public.fechamento_pastos
      WHERE fazenda_id = _check_fazenda
        AND ano_mes = _ano_mes
        AND status = 'fechado'
    ) fc
    CROSS JOIN (
      SELECT count(*) AS total
      FROM public.pastos
      WHERE fazenda_id = _check_fazenda
        AND ativo = true
        AND entra_conciliacao = true
    ) tp
    WHERE tp.total > 0 AND fc.fechados >= tp.total
  ) THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1). Reabra o período para inserir lançamentos.', _ano_mes;
    ELSIF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1). Reabra o período para excluir lançamentos.', _ano_mes;
    ELSE
      RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1). Reabra o período para alterar campos estruturais.', _ano_mes;
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- Create the trigger on lancamentos
DROP TRIGGER IF EXISTS trg_guard_lancamento_mes_fechado_p1 ON public.lancamentos;
CREATE TRIGGER trg_guard_lancamento_mes_fechado_p1
  BEFORE INSERT OR UPDATE OR DELETE ON public.lancamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_lancamento_mes_fechado_p1();

-- ============================================================
-- 4. Atualizar reabrir_pilar_fechamento com cascata P2+P4+P5
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
SET search_path TO 'public'
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _cliente_id uuid;
  _cascata text[] := '{}';
BEGIN
  SELECT cliente_id INTO _cliente_id
  FROM fazendas WHERE id = _fazenda_id;

  IF _cliente_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Fazenda não encontrada');
  END IF;

  IF _pilar = 'p1_mapa_pastos' THEN
    -- Reopen all fechamento_pastos
    UPDATE fechamento_pastos
    SET status = 'rascunho', updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado';

    -- Cascade P2
    UPDATE valor_rebanho_fechamento
    SET status = 'reaberto', reaberto_por = _user_id, reaberto_em = now(), updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado';
    _cascata := array_append(_cascata, 'p2_valor_rebanho');

    -- Cascade P4 (competência derives from P1)
    _cascata := array_append(_cascata, 'p4_competencia');

    -- Cascade P5 (derived, always affected)
    _cascata := array_append(_cascata, 'p5_economico');

  ELSIF _pilar = 'p2_valor_rebanho' THEN
    UPDATE valor_rebanho_fechamento
    SET status = 'reaberto', reaberto_por = _user_id, reaberto_em = now(), updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado';

    _cascata := array_append(_cascata, 'p5_economico');

  ELSIF _pilar = 'p3_financeiro_caixa' THEN
    UPDATE financeiro_fechamentos
    SET status_fechamento = 'reaberto', reaberto_por = _user_id, reaberto_em = now(), updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status_fechamento = 'fechado';

    _cascata := array_append(_cascata, 'p5_economico');

  ELSE
    RETURN jsonb_build_object('error', 'Pilar inválido: ' || _pilar);
  END IF;

  -- Log principal
  INSERT INTO fechamento_reaberturas_log
    (fazenda_id, cliente_id, ano_mes, pilar, acao, motivo, usuario_id, pilares_invalidados)
  VALUES
    (_fazenda_id, _cliente_id, _ano_mes, _pilar, 'reabertura', _motivo, _user_id, _cascata);

  -- Log each cascaded pillar
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
