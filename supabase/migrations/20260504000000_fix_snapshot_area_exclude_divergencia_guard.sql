-- Migration: fix_snapshot_area_exclude_divergencia_guard
-- Data: 2026-05-04
-- Motivo: Pasto "Divergencia do Campeiro" (tipo_uso='divergencia') e um pasto
--         virtual criado para conciliacao de divergencias do campeiro. Ele e ativo=true
--         e entra_conciliacao=true, mas NAO e um pasto produtivo real.
--         A guard de "nem todos os pastos ativos foram fechados" estava incluindo esse
--         pasto no check, causando RAISE EXCEPTION mesmo quando todos os pastos reais
--         estavam fechados.
-- Correcao: adicionar filtro AND COALESCE(p.tipo_uso, '') <> 'divergencia' na guard.
-- Impacto: apenas a guard de verificacao de fechamento. O SUM de area nao e afetado
--          pois tipo_uso_mes='divergencia' ja caia no ELSE 0 do CASE.

CREATE OR REPLACE FUNCTION public.gerar_snapshot_area(
  p_fazenda_id uuid,
  p_ano_mes    date,
  p_fechado_por uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cliente_id        uuid;
  v_area_produtiva    NUMERIC(10,2);
  v_area_pec          NUMERIC(10,2);
  v_area_agric        NUMERIC(10,2);
BEGIN
  SELECT cliente_id
  INTO   v_cliente_id
  FROM   fazendas
  WHERE  id = p_fazenda_id;

  IF v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Fazenda % nao encontrada.', p_fazenda_id;
  END IF;

  SELECT area_produtiva_ha
  INTO   v_area_produtiva
  FROM   fazenda_cadastros
  WHERE  fazenda_id = p_fazenda_id
  LIMIT  1;

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
    SELECT 1 FROM pastos p
    WHERE  p.fazenda_id = p_fazenda_id
      AND  p.ativo = true
      AND  COALESCE(p.tipo_uso, '') <> 'divergencia'
      AND  NOT EXISTS (
             SELECT 1 FROM fechamento_pastos fp
             WHERE  fp.pasto_id = p.id
               AND  fp.ano_mes  = to_char(p_ano_mes, 'YYYY-MM')
           )
  ) THEN
    RAISE EXCEPTION
      'Nem todos os pastos ativos da fazenda % foram fechados para o mes %. Complete o fechamento antes de gerar o snapshot.',
      p_fazenda_id, p_ano_mes;
  END IF;

  SELECT
    COALESCE(SUM(CASE
      WHEN fp.tipo_uso_mes IN ('cria','recria','engorda','reforma_pecuaria','vedado')
      THEN p.area_produtiva_ha ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN fp.tipo_uso_mes = 'agricultura'
      THEN p.area_produtiva_ha ELSE 0 END), 0)
  INTO  v_area_pec, v_area_agric
  FROM  fechamento_pastos fp
  JOIN  pastos p ON p.id = fp.pasto_id
  WHERE fp.fazenda_id       = p_fazenda_id
    AND fp.ano_mes          = to_char(p_ano_mes, 'YYYY-MM')
    AND p.area_produtiva_ha IS NOT NULL;

  INSERT INTO fechamento_area_snapshot (
    cliente_id, fazenda_id, ano_mes,
    area_total_ha, area_produtiva_ha,
    area_pecuaria_ha, area_agricultura_ha,
    origem_area, fechado_por
  ) VALUES (
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
    origem_area         = EXCLUDED.origem_area,
    fechado_por         = EXCLUDED.fechado_por,
    versao              = fechamento_area_snapshot.versao + 1,
    fechado_em          = now();
END;
$$;
