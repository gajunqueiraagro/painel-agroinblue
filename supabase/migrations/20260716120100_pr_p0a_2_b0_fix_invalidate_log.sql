-- PR-P1-GOV-REABERTURA-P0A — Migration 2 (B0): corrige INSERT de log em
--   invalidate_snapshot_on_pasto_change para o contrato enxuto de 8 colunas.
-- Drift confirmado (FASE 0): os INSERT atuais referenciam colunas inexistentes
--   (acao, pilares_invalidados, usuario_id) -> qualquer reabertura de mes com P2
--   validado/fechado aborta. Correcao: mapear para as 8 colunas reais
--   (fazenda_id, cliente_id, ano_mes, pilar, motivo, reaberto_por, reaberto_em),
--   consolidando acao + pilares afetados no texto de `motivo`.
-- PRESERVADO byte a byte do corpo atual (capturado via pg_get_functiondef): assinatura,
--   RETURNS trigger, LANGUAGE plpgsql, SECURITY DEFINER, SET search_path=public,
--   ramo OLD/DELETE, Camada 2 (invalidacao do mes), Camada 3 (cascata
--   ano_mes > _ano_mes AND status='validado'), GET DIAGNOSTICS, RETURN NULL.
-- NAO toca a tabela fechamento_reaberturas_log. NAO recria acao/pilares_invalidados/usuario_id.
-- Divergencia do snippet canonico do handoff (NEW.fazenda_id/NEW.cliente_id):
--   preservados os locais _fazenda_id/_cliente_id do fluxo existente, pois a funcao
--   os deriva de OLD/NEW para suportar o ramo DELETE; usar NEW.* literal quebraria
--   esse ramo. Instrucao governante: "preservar toda a logica".

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
      -- Log de auditoria para cada mês afetado em cascata (8 colunas reais)
      INSERT INTO public.fechamento_reaberturas_log (
        fazenda_id, cliente_id, ano_mes, pilar, motivo, reaberto_por, reaberto_em
      ) VALUES (
        _fazenda_id, _cliente_id, _cascade_rec.ano_mes,
        'p2_valor_rebanho',
        'invalidacao_cascata_snapshot: Cascata automática: mês ' || _ano_mes
          || ' foi alterado após validação [pilares afetados: p2_valor_rebanho, p5_economico_consolidado]',
        auth.uid(), now()
      );
    END LOOP;

    -- Log do mês original invalidado (8 colunas reais)
    INSERT INTO public.fechamento_reaberturas_log (
      fazenda_id, cliente_id, ano_mes, pilar, motivo, reaberto_por, reaberto_em
    ) VALUES (
      _fazenda_id, _cliente_id, _ano_mes,
      'p2_valor_rebanho',
      'invalidacao_snapshot_automatica: Snapshot invalidado automaticamente por alteração em fechamento de pastos'
        || ' [pilares afetados: p2_valor_rebanho, p5_economico_consolidado]',
      auth.uid(), now()
    );
  END IF;

  RETURN NULL; -- AFTER trigger
END;
$function$;
