-- 1. Add new columns
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS peso_vivo_total numeric;
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS rendimento_carcaca numeric;
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS comprador_fornecedor text;
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS origem_registro text NOT NULL DEFAULT 'manual';
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS lote text;
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS sexo text;
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS finalidade text;

-- 2. Add comments for documentation
COMMENT ON COLUMN public.lancamentos.peso_medio_kg IS 'Peso vivo médio por cabeça (kg)';
COMMENT ON COLUMN public.lancamentos.peso_vivo_total IS 'Peso vivo total = quantidade × peso_medio_kg (kg). Derivável, armazenado para auditoria de importação.';
COMMENT ON COLUMN public.lancamentos.peso_carcaca_kg IS 'Peso médio de carcaça por cabeça (kg). Total = quantidade × peso_carcaca_kg.';
COMMENT ON COLUMN public.lancamentos.rendimento_carcaca IS 'Rendimento de carcaça (%). Ex: 52.5 = 52,5%.';
COMMENT ON COLUMN public.lancamentos.comprador_fornecedor IS 'Nome do comprador (vendas/abates) ou fornecedor (compras).';
COMMENT ON COLUMN public.lancamentos.origem_registro IS 'Origem: manual | importacao_historica | importacao | automatico';
COMMENT ON COLUMN public.lancamentos.lote IS 'Identificação do lote zootécnico.';
COMMENT ON COLUMN public.lancamentos.sexo IS 'Sexo do lote: macho | femea | misto';
COMMENT ON COLUMN public.lancamentos.finalidade IS 'Finalidade: cria | recria | engorda | reprodução';

-- 3. Validation trigger function
CREATE OR REPLACE FUNCTION public.validate_lancamento_campos_por_tipo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Skip validation for cancellations
  IF TG_OP = 'UPDATE' AND NEW.cancelado = true THEN
    RETURN NEW;
  END IF;

  -- Skip validation for meta scenario (less strict)
  IF NEW.cenario = 'meta' THEN
    RETURN NEW;
  END IF;

  -- Universal: fazenda_id, data, categoria, quantidade are already NOT NULL in schema

  -- Block manual insertion of transferencia_entrada (auto-created by pair trigger)
  IF NEW.tipo = 'transferencia_entrada' AND NEW.transferencia_par_id IS NULL THEN
    RAISE EXCEPTION 'Transferência de entrada não pode ser criada manualmente. Use transferência de saída para gerar o par automaticamente.';
  END IF;

  -- Type-specific validation
  CASE NEW.tipo
    WHEN 'saldo_inicial' THEN
      -- Minimal: just fazenda, data, categoria, quantidade (all NOT NULL already)
      -- saldo_inicial must not have financial fields
      NULL;

    WHEN 'nascimento' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Nascimento deve ter quantidade > 0.';
      END IF;

    WHEN 'compra' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Compra deve ter quantidade > 0.';
      END IF;

    WHEN 'venda', 'venda_pe' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Venda deve ter quantidade > 0.';
      END IF;

    WHEN 'abate' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Abate deve ter quantidade > 0.';
      END IF;

    WHEN 'morte' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Morte deve ter quantidade > 0.';
      END IF;

    WHEN 'consumo' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Consumo deve ter quantidade > 0.';
      END IF;

    WHEN 'transferencia_saida' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Transferência deve ter quantidade > 0.';
      END IF;
      IF NEW.fazenda_destino IS NULL THEN
        RAISE EXCEPTION 'Transferência de saída deve informar fazenda de destino.';
      END IF;

    WHEN 'transferencia_entrada' THEN
      -- Auto-created, minimal validation
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Transferência de entrada deve ter quantidade > 0.';
      END IF;

    WHEN 'reclassificacao' THEN
      IF NEW.quantidade <= 0 THEN
        RAISE EXCEPTION 'Reclassificação deve ter quantidade > 0.';
      END IF;
      IF NEW.categoria_destino IS NULL THEN
        RAISE EXCEPTION 'Reclassificação deve informar categoria de destino.';
      END IF;
      IF NEW.categoria = NEW.categoria_destino THEN
        RAISE EXCEPTION 'Reclassificação: categoria de origem e destino não podem ser iguais.';
      END IF;

    ELSE
      -- Unknown type: allow but log warning via NOTICE
      RAISE NOTICE 'Tipo de lançamento desconhecido: %', NEW.tipo;
  END CASE;

  -- Auto-derive peso_vivo_total if not provided
  IF NEW.peso_vivo_total IS NULL AND NEW.peso_medio_kg IS NOT NULL AND NEW.quantidade > 0 THEN
    NEW.peso_vivo_total := NEW.quantidade::numeric * NEW.peso_medio_kg;
  END IF;

  -- Auto-derive rendimento_carcaca if both weights available
  IF NEW.rendimento_carcaca IS NULL 
     AND NEW.peso_medio_kg IS NOT NULL AND NEW.peso_medio_kg > 0
     AND NEW.peso_carcaca_kg IS NOT NULL AND NEW.peso_carcaca_kg > 0 THEN
    NEW.rendimento_carcaca := round((NEW.peso_carcaca_kg / NEW.peso_medio_kg) * 100, 2);
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Attach trigger (before insert or update)
DROP TRIGGER IF EXISTS trg_validate_lancamento_campos ON public.lancamentos;
CREATE TRIGGER trg_validate_lancamento_campos
  BEFORE INSERT OR UPDATE ON public.lancamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_lancamento_campos_por_tipo();

-- 5. Mark existing records with origin
UPDATE public.lancamentos SET origem_registro = 'manual' WHERE origem_registro IS NULL;