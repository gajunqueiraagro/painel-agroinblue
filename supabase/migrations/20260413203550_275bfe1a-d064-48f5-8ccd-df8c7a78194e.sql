
CREATE OR REPLACE FUNCTION public.validar_conciliacao_rebanho(_fazenda_id uuid, _ano_mes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _divergencias jsonb := '[]'::jsonb;
  _conciliado boolean := true;
  _rec record;
  _ano int;
  _mes int;
  _mes_anterior text;
  _has_prev_closure boolean;
BEGIN
  _ano := split_part(_ano_mes, '-', 1)::int;
  _mes := split_part(_ano_mes, '-', 2)::int;

  IF _mes = 1 THEN
    _mes_anterior := (_ano - 1)::text || '-12';
  ELSE
    _mes_anterior := _ano::text || '-' || lpad((_mes - 1)::text, 2, '0');
  END IF;

  -- Check if previous month has any closed pasture items
  SELECT EXISTS (
    SELECT 1
    FROM fechamento_pasto_itens fpi
    JOIN fechamento_pastos fp ON fp.id = fpi.fechamento_id
    WHERE fp.fazenda_id = _fazenda_id AND fp.ano_mes = _mes_anterior AND fp.status = 'fechado'
  ) INTO _has_prev_closure;

  FOR _rec IN
    WITH saldo_sistema AS (
      SELECT cr.id AS categoria_id, cr.codigo AS categoria_codigo, cr.nome AS categoria_nome,
        COALESCE(si.qtd, 0) AS saldo_inicial
      FROM categorias_rebanho cr
      LEFT JOIN (
        -- Source 1: previous month's closed pasture items (preferred)
        SELECT fpi.categoria_id, SUM(fpi.quantidade) AS qtd
        FROM fechamento_pasto_itens fpi
        JOIN fechamento_pastos fp ON fp.id = fpi.fechamento_id
        WHERE fp.fazenda_id = _fazenda_id AND fp.ano_mes = _mes_anterior AND fp.status = 'fechado'
          AND _has_prev_closure = true
        GROUP BY fpi.categoria_id

        UNION ALL

        -- Source 2: saldos_iniciais fallback when no previous closure exists
        SELECT cr2.id AS categoria_id, si2.quantidade AS qtd
        FROM saldos_iniciais si2
        JOIN categorias_rebanho cr2 ON cr2.codigo = si2.categoria
        WHERE si2.fazenda_id = _fazenda_id
          AND si2.ano = _ano
          AND _has_prev_closure = false
      ) si ON si.categoria_id = cr.id
    ),
    movimentacoes AS (
      SELECT cr.id AS categoria_id,
        SUM(CASE WHEN l.tipo IN ('compra','nascimento','transferencia_entrada') THEN l.quantidade ELSE 0 END) AS entradas,
        SUM(CASE WHEN l.tipo IN ('venda','abate','morte','consumo','transferencia_saida') THEN l.quantidade ELSE 0 END) AS saidas
      FROM lancamentos l
      JOIN categorias_rebanho cr ON cr.codigo = l.categoria
      WHERE l.fazenda_id = _fazenda_id AND substring(l.data, 1, 7) = _ano_mes
        AND COALESCE(l.cancelado, false) = false
        AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
        AND l.tipo != 'saldo_inicial'  -- Exclude: already accounted in saldo_sistema
      GROUP BY cr.id
    ),
    reclass_saida AS (
      SELECT cr.id AS categoria_id, SUM(l.quantidade) AS qtd
      FROM lancamentos l JOIN categorias_rebanho cr ON cr.codigo = l.categoria
      WHERE l.fazenda_id = _fazenda_id AND substring(l.data, 1, 7) = _ano_mes
        AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL
        AND COALESCE(l.cancelado, false) = false
        AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
      GROUP BY cr.id
    ),
    reclass_entrada AS (
      SELECT cr.id AS categoria_id, SUM(l.quantidade) AS qtd
      FROM lancamentos l JOIN categorias_rebanho cr ON cr.codigo = l.categoria_destino
      WHERE l.fazenda_id = _fazenda_id AND substring(l.data, 1, 7) = _ano_mes
        AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL
        AND COALESCE(l.cancelado, false) = false
        AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
      GROUP BY cr.id
    ),
    saldo_final_sistema AS (
      SELECT ss.categoria_id, ss.categoria_nome,
        ss.saldo_inicial + COALESCE(m.entradas, 0) - COALESCE(m.saidas, 0)
        - COALESCE(rs.qtd, 0) + COALESCE(re.qtd, 0) AS saldo_sistema
      FROM saldo_sistema ss
      LEFT JOIN movimentacoes m ON m.categoria_id = ss.categoria_id
      LEFT JOIN reclass_saida rs ON rs.categoria_id = ss.categoria_id
      LEFT JOIN reclass_entrada re ON re.categoria_id = ss.categoria_id
    ),
    saldo_pastos AS (
      SELECT fpi.categoria_id, SUM(fpi.quantidade) AS saldo_pastos
      FROM fechamento_pasto_itens fpi JOIN fechamento_pastos fp ON fp.id = fpi.fechamento_id
      WHERE fp.fazenda_id = _fazenda_id AND fp.ano_mes = _ano_mes AND fp.status = 'fechado'
      GROUP BY fpi.categoria_id
    )
    SELECT COALESCE(sfs.categoria_id, sp.categoria_id) AS categoria_id,
      COALESCE(sfs.categoria_nome, cr2.nome) AS categoria_nome,
      COALESCE(sfs.saldo_sistema, 0) AS saldo_sistema,
      COALESCE(sp.saldo_pastos, 0) AS saldo_pastos,
      COALESCE(sfs.saldo_sistema, 0) - COALESCE(sp.saldo_pastos, 0) AS diferenca
    FROM saldo_final_sistema sfs
    FULL OUTER JOIN saldo_pastos sp ON sp.categoria_id = sfs.categoria_id
    LEFT JOIN categorias_rebanho cr2 ON cr2.id = sp.categoria_id
    WHERE COALESCE(sfs.saldo_sistema, 0) != COALESCE(sp.saldo_pastos, 0)
       OR (COALESCE(sfs.saldo_sistema, 0) != 0 AND sp.saldo_pastos IS NULL)
       OR (sfs.saldo_sistema IS NULL AND COALESCE(sp.saldo_pastos, 0) != 0)
  LOOP
    _conciliado := false;
    _divergencias := _divergencias || jsonb_build_object(
      'categoria_id', _rec.categoria_id, 'categoria', _rec.categoria_nome,
      'saldo_sistema', _rec.saldo_sistema, 'saldo_pastos', _rec.saldo_pastos,
      'diferenca', _rec.diferenca
    );
  END LOOP;

  RETURN jsonb_build_object('conciliado', _conciliado, 'divergencias', _divergencias);
END;
$function$;
