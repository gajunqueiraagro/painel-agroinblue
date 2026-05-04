-- Migration: add_rebuild_zoot_cache_triggers
-- Data: 2026-05-04
-- Objetivo: reconstruir zoot_mensal_cache automaticamente após escrita em lancamentos
--           e fechamento_pastos, usando refresh granular por mês (não ano inteiro).
-- Impacto: ~200ms por operação normal. Imports em lote devem desabilitar o trigger
--           antes do import e rodar refresh_zoot_cache manualmente depois.

-- ============================================================
-- 1. Função de rebuild para lancamentos
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_fn_rebuild_zoot_cache_lancamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_faz uuid;
  v_ano int;
  v_mes int;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_faz := NEW.fazenda_id;
    v_ano := EXTRACT(YEAR  FROM NEW.data::date)::int;
    v_mes := EXTRACT(MONTH FROM NEW.data::date)::int;
    PERFORM refresh_zoot_cache(v_faz, v_ano, v_mes);
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF TG_OP = 'DELETE'
       OR OLD.fazenda_id <> NEW.fazenda_id
       OR OLD.data::date <> NEW.data::date
    THEN
      v_faz := OLD.fazenda_id;
      v_ano := EXTRACT(YEAR  FROM OLD.data::date)::int;
      v_mes := EXTRACT(MONTH FROM OLD.data::date)::int;
      PERFORM refresh_zoot_cache(v_faz, v_ano, v_mes);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_rebuild_zoot_cache_lancamento ON public.lancamentos;
CREATE TRIGGER trg_rebuild_zoot_cache_lancamento
  AFTER INSERT OR UPDATE OR DELETE
  ON public.lancamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_rebuild_zoot_cache_lancamento();

-- ============================================================
-- 2. Função de rebuild para fechamento_pastos
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_fn_rebuild_zoot_cache_fechamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_faz  uuid;
  v_ames text;
  v_ano  int;
  v_mes  int;
BEGIN
  v_faz  := CASE WHEN TG_OP = 'DELETE' THEN OLD.fazenda_id ELSE NEW.fazenda_id END;
  v_ames := CASE WHEN TG_OP = 'DELETE' THEN OLD.ano_mes    ELSE NEW.ano_mes    END;
  v_ano  := split_part(v_ames, '-', 1)::int;
  v_mes  := split_part(v_ames, '-', 2)::int;
  PERFORM refresh_zoot_cache(v_faz, v_ano, v_mes);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_rebuild_zoot_cache_fechamento ON public.fechamento_pastos;
CREATE TRIGGER trg_rebuild_zoot_cache_fechamento
  AFTER INSERT OR UPDATE OR DELETE
  ON public.fechamento_pastos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_rebuild_zoot_cache_fechamento();
