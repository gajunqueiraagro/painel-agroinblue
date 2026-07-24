-- ============================================================================
-- PR-FIX-SALDO-CHAIN — integridade exata da cadeia de saldos bancários v2
-- Regra soberana: saldo_final(N) = saldo_inicial(N+1), sem tolerância.
--
-- 1) Normalização a 2 casas decimais na fonte (BEFORE trigger novo)
-- 2) Propagação sem furo: IS DISTINCT FROM no lugar de abs(...) > 0.01
-- 3) Reparo idempotente de dados legados (já aplicado no Proto em 24/07;
--    incluído aqui para outros ambientes)
-- ============================================================================

-- ── 1. Normalização de precisão na escrita (mata resíduo float na fonte) ──
CREATE OR REPLACE FUNCTION public.financeiro_saldos_v2_normalize_round()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.saldo_inicial := round(NEW.saldo_inicial::numeric, 2);
  NEW.saldo_final   := round(NEW.saldo_final::numeric, 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_saldos_v2_normalize_round
  ON public.financeiro_saldos_bancarios_v2;

-- Nome inicia com 'trg_' — em ordem alfabética dispara DEPOIS do
-- 'tr_financeiro_saldos_v2_apply_previous_extrato', arredondando
-- inclusive o valor que o apply copiou. Ordem intencional.
CREATE TRIGGER trg_saldos_v2_normalize_round
BEFORE INSERT OR UPDATE ON public.financeiro_saldos_bancarios_v2
FOR EACH ROW EXECUTE FUNCTION public.financeiro_saldos_v2_normalize_round();

-- ── 2. Propagação sem furo de 1 centavo ──
-- Assinatura inalterada → CREATE OR REPLACE direto (sem DROP).
CREATE OR REPLACE FUNCTION public.financeiro_saldos_v2_propagate_next_initial()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_next_ano_mes TEXT;
BEGIN
  v_next_ano_mes := to_char(
    to_date(NEW.ano_mes || '-01', 'YYYY-MM-DD') + interval '1 month',
    'YYYY-MM'
  );

  UPDATE public.financeiro_saldos_bancarios_v2 next
  SET saldo_inicial = round(NEW.saldo_final::numeric, 2),
      origem_saldo_inicial = 'automatico',
      updated_at = now()
  WHERE next.conta_bancaria_id = NEW.conta_bancaria_id
    AND next.ano_mes = v_next_ano_mes
    AND next.id <> NEW.id
    -- ANTES: abs(COALESCE(next.saldo_inicial,0) - COALESCE(NEW.saldo_final,0)) > 0.01
    -- Furo: divergência de exatamente 0,01 nunca era corrigida.
    AND next.saldo_inicial IS DISTINCT FROM round(NEW.saldo_final::numeric, 2);

  RETURN NULL;
END;
$$;

-- ── 3. Reparo idempotente de dados legados ──
UPDATE public.financeiro_saldos_bancarios_v2
SET saldo_final = round(saldo_final::numeric, 2)
WHERE saldo_final IS DISTINCT FROM round(saldo_final::numeric, 2);

UPDATE public.financeiro_saldos_bancarios_v2
SET saldo_inicial = round(saldo_inicial::numeric, 2)
WHERE saldo_inicial IS DISTINCT FROM round(saldo_inicial::numeric, 2);

UPDATE public.financeiro_saldos_bancarios_v2 b
SET saldo_inicial = a.saldo_final
FROM public.financeiro_saldos_bancarios_v2 a
WHERE a.conta_bancaria_id = b.conta_bancaria_id
  AND b.ano_mes = to_char(
        to_date(a.ano_mes || '-01', 'YYYY-MM-DD') + interval '1 month',
        'YYYY-MM')
  AND a.saldo_final IS DISTINCT FROM b.saldo_inicial;
