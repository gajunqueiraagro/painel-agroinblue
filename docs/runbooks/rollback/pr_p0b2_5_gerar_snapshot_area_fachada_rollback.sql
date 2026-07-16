-- ROLLBACK R5 (Migração 5 - gerar_snapshot_area). Primeiro na ordem de rollback (5->1).
-- Restaura o corpo ANTERIOR (pre-P0-B.2) de gerar_snapshot_area, capturado via
--   pg_get_functiondef. ATENCAO: o corpo anterior e SECURITY DEFINER SEM SET search_path
--   (estado real do disco/banco); restaurado verbatim. Nao reabre anon/PUBLIC.
CREATE OR REPLACE FUNCTION public.gerar_snapshot_area(p_fazenda_id uuid, p_ano_mes date, p_fechado_por uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  -- v2 (Passo B / 10-Mai-2026): Lista oficial isOperacionalPecuaria
  --   Pecuaria: cria, recria, engorda, vedado, reforma_pecuaria
  --   Agricultura: agricultura
  DECLARE
    v_id               UUID;
    v_cliente_id       UUID;
    v_status_op        TEXT;
    v_tem_pecuaria     BOOLEAN;
    v_area_produtiva   NUMERIC(10,2);
    v_area_pec         NUMERIC(10,2);
    v_area_agric       NUMERIC(10,2);
  BEGIN
    SELECT cliente_id,
           COALESCE(status_operacional, 'ativa'),
           COALESCE(tem_pecuaria, true)
    INTO   v_cliente_id, v_status_op, v_tem_pecuaria
    FROM   fazendas
    WHERE  id = p_fazenda_id;

    IF v_cliente_id IS NULL THEN
      RAISE EXCEPTION 'Fazenda % nao encontrada.', p_fazenda_id;
    END IF;

    IF v_status_op <> 'ativa' OR v_tem_pecuaria IS NOT TRUE THEN
      RETURN NULL;
    END IF;

    SELECT area_produtiva_ha
    INTO   v_area_produtiva
    FROM   fazenda_cadastros
    WHERE  fazenda_id = p_fazenda_id
      AND  cliente_id = v_cliente_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Fazenda % nao possui cadastro em fazenda_cadastros. Preencha o cadastro de area antes de fechar o P1.',
        p_fazenda_id;
    END IF;

    IF v_area_produtiva IS NULL OR v_area_produtiva <= 0 THEN
      RAISE EXCEPTION
        'Fazenda % nao possui area produtiva cadastrada. Preencha Configuracoes > Fazendas > Area antes de fechar o P1.',
        p_fazenda_id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM   pastos p
      WHERE  p.fazenda_id = p_fazenda_id
        AND  p.ativo = true
        AND  COALESCE(p.tipo_uso, '') <> 'divergencia'
        AND  NOT EXISTS (
          SELECT 1 FROM fechamento_pastos fp
          WHERE  fp.pasto_id = p.id
            AND  fp.ano_mes = to_char(p_ano_mes, 'YYYY-MM')
            AND  fp.status   = 'fechado'
        )
    ) THEN
      RAISE EXCEPTION
        'Nem todos os pastos ativos da fazenda % foram fechados para o mes %. Complete o fechamento antes de gerar o snapshot.',
        p_fazenda_id, p_ano_mes;
    END IF;

    SELECT
      COALESCE(SUM(CASE
        WHEN LOWER(fp.tipo_uso_mes) IN ('cria','recria','engorda','vedado','reforma_pecuaria')
        THEN p.area_produtiva_ha ELSE 0 END), 0),
      COALESCE(SUM(CASE
        WHEN LOWER(fp.tipo_uso_mes) = 'agricultura'
        THEN p.area_produtiva_ha ELSE 0 END), 0)
    INTO  v_area_pec, v_area_agric
    FROM  fechamento_pastos fp
    JOIN  pastos p ON p.id = fp.pasto_id
    WHERE fp.fazenda_id       = p_fazenda_id
      AND fp.ano_mes = to_char(p_ano_mes, 'YYYY-MM')
      AND fp.status           = 'fechado'
      AND p.area_produtiva_ha IS NOT NULL;

    INSERT INTO fechamento_area_snapshot (
      cliente_id, fazenda_id, ano_mes,
      area_total_ha, area_produtiva_ha,
      area_pecuaria_ha, area_agricultura_ha,
      origem_area, fechado_por
    )
    VALUES (
      v_cliente_id, p_fazenda_id, p_ano_mes,
      v_area_pec + v_area_agric, v_area_produtiva,
      v_area_pec, v_area_agric,
      'fechamento_p1', p_fechado_por
    )
    ON CONFLICT (fazenda_id, ano_mes) DO UPDATE SET
      area_total_ha       = EXCLUDED.area_total_ha,
      area_produtiva_ha   = EXCLUDED.area_produtiva_ha,
      area_pecuaria_ha    = EXCLUDED.area_pecuaria_ha,
      area_agricultura_ha = EXCLUDED.area_agricultura_ha,
      versao              = fechamento_area_snapshot.versao + 1,
      fechado_em          = now(),
      fechado_por         = EXCLUDED.fechado_por
    RETURNING id INTO v_id;

    RETURN v_id;
  END;
  $function$;
