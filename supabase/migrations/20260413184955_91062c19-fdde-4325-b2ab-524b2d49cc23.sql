
-- ============================================================
-- 1. Função central: can_close_valor_rebanho
--    Usa get_status_pilares_fechamento como fonte única
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_close_valor_rebanho(
  _fazenda_id uuid,
  _ano_mes text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _pilares jsonb;
  _p1_status text;
  _p1_detalhe jsonb;
BEGIN
  -- Fonte única: get_status_pilares_fechamento
  _pilares := public.get_status_pilares_fechamento(_fazenda_id, _ano_mes);

  _p1_status := _pilares->'p1_mapa_pastos'->>'status';
  _p1_detalhe := _pilares->'p1_mapa_pastos'->'detalhe';

  IF _p1_status = 'oficial' THEN
    RETURN jsonb_build_object(
      'pode_fechar', true,
      'p1_status', _p1_status
    );
  END IF;

  -- Bloqueado ou provisório → não pode fechar P2
  RETURN jsonb_build_object(
    'pode_fechar', false,
    'p1_status', _p1_status,
    'motivo', CASE
      WHEN _p1_status = 'bloqueado' THEN
        COALESCE(
          'P1 bloqueado: ' || (_p1_detalhe->>'motivo'),
          'P1 bloqueado'
        )
      WHEN _p1_status = 'provisorio' THEN
        'P1 provisório: ' ||
        COALESCE((_p1_detalhe->>'total_fechados')::text, '0') ||
        ' de ' ||
        COALESCE((_p1_detalhe->>'total_pastos')::text, '?') ||
        ' pastos fechados'
      ELSE
        'P1 com status desconhecido: ' || COALESCE(_p1_status, 'null')
    END
  );
END;
$function$;

-- ============================================================
-- 2. Substituir trigger para usar can_close_valor_rebanho
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_valor_rebanho_requer_p1_fechado()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
BEGIN
  -- Only enforce when transitioning TO 'fechado'
  IF NEW.status != 'fechado' THEN
    RETURN NEW;
  END IF;

  -- Skip if already was fechado (no re-validation needed)
  IF TG_OP = 'UPDATE' AND OLD.status = 'fechado' THEN
    RETURN NEW;
  END IF;

  -- Use central function as sole source of truth
  _result := public.can_close_valor_rebanho(NEW.fazenda_id, NEW.ano_mes);

  IF (_result->>'pode_fechar')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Não é possível fechar o Valor do Rebanho: %',
      COALESCE(_result->>'motivo', 'P1 não está oficial');
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure the trigger exists (recreate if needed)
DROP TRIGGER IF EXISTS trg_guard_valor_rebanho_requer_p1 ON public.valor_rebanho_fechamento;
CREATE TRIGGER trg_guard_valor_rebanho_requer_p1
  BEFORE INSERT OR UPDATE ON public.valor_rebanho_fechamento
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_valor_rebanho_requer_p1_fechado();

-- ============================================================
-- 3. Corrigir snapshots inconsistentes
--    Regra: snapshot validado só pode existir se P1=oficial
--    (i.e., todos pastos fechados + conciliação ok)
-- ============================================================
UPDATE public.valor_rebanho_realizado_validado v
SET status = 'invalidado', updated_at = now()
WHERE v.status = 'validado'
  AND (
    -- P2 não está fechado formalmente
    NOT EXISTS (
      SELECT 1 FROM public.valor_rebanho_fechamento f
      WHERE f.fazenda_id = v.fazenda_id
        AND f.ano_mes = v.ano_mes
        AND f.status = 'fechado'
    )
    OR
    -- P1 não está oficial (pastos não fechados ou divergência)
    COALESCE(
      (public.get_status_pilares_fechamento(v.fazenda_id, v.ano_mes)
        ->'p1_mapa_pastos'->>'status'),
      'provisorio'
    ) != 'oficial'
  );
