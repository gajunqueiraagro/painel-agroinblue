-- ROLLBACK R2 — Migration 2 (B0). Restaura o corpo ANTERIOR (pre-B0) de
--   invalidate_snapshot_on_pasto_change, capturado via pg_get_functiondef antes de M2.
-- ATENCAO: este corpo contem o drift original (colunas acao/pilares_invalidados/
--   usuario_id inexistentes na tabela enxuta). Restaura-lo REINTRODUZ o bug de
--   reabertura. Usar apenas como reversao literal do estado anterior. Nao reabre grants.
CREATE OR REPLACE FUNCTION public.invalidate_snapshot_on_pasto_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
