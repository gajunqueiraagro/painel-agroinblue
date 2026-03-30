
-- 1. Add editado_manual field to financeiro_lancamentos for real protection
ALTER TABLE public.financeiro_lancamentos
  ADD COLUMN IF NOT EXISTS editado_manual boolean NOT NULL DEFAULT false;

-- 2. Add hash_importacao for robust deduplication
ALTER TABLE public.financeiro_lancamentos
  ADD COLUMN IF NOT EXISTS hash_importacao text;

-- 3. Add status column to financeiro_importacoes to support soft delete
-- (status already exists, but add cancelada_em for audit)
ALTER TABLE public.financeiro_importacoes
  ADD COLUMN IF NOT EXISTS cancelada_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cancelada_por uuid;

-- 4. Create index on hash_importacao for fast dedup lookups
CREATE INDEX IF NOT EXISTS idx_fin_lanc_hash_importacao
  ON public.financeiro_lancamentos (cliente_id, hash_importacao)
  WHERE hash_importacao IS NOT NULL;

-- 5. Create index on editado_manual for protection checks
CREATE INDEX IF NOT EXISTS idx_fin_lanc_editado_manual
  ON public.financeiro_lancamentos (importacao_id)
  WHERE editado_manual = true;

-- 6. Trigger: auto-set editado_manual=true when a user updates an imported record
CREATE OR REPLACE FUNCTION public.mark_editado_manual_on_update()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  -- Only mark if it was originally imported (has importacao_id) and not already marked
  IF OLD.importacao_id IS NOT NULL AND OLD.editado_manual = false THEN
    NEW.editado_manual = true;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_mark_editado_manual ON public.financeiro_lancamentos;
CREATE TRIGGER trg_mark_editado_manual
  BEFORE UPDATE ON public.financeiro_lancamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_editado_manual_on_update();
