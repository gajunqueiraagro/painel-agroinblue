
-- Add column to link paired transfer records
ALTER TABLE public.lancamentos ADD COLUMN transferencia_par_id uuid REFERENCES public.lancamentos(id) ON DELETE CASCADE DEFAULT NULL;

-- Function to auto-create transferencia_entrada on destination farm
CREATE OR REPLACE FUNCTION public.auto_create_transferencia_entrada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  dest_fazenda_id uuid;
BEGIN
  -- Only act on transferencia_saida
  IF NEW.tipo != 'transferencia_saida' THEN
    RETURN NEW;
  END IF;

  -- Skip if already has a pair (avoid recursion)
  IF NEW.transferencia_par_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Find destination fazenda by name among fazendas the owner has access to
  SELECT f.id INTO dest_fazenda_id
  FROM public.fazendas f
  JOIN public.fazenda_membros fm ON fm.fazenda_id = f.id
  WHERE f.nome = NEW.fazenda_destino
    AND fm.user_id = (SELECT fm2.user_id FROM public.fazenda_membros fm2 WHERE fm2.fazenda_id = NEW.fazenda_id LIMIT 1)
  LIMIT 1;

  IF dest_fazenda_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Create the paired entrada on destination farm
  INSERT INTO public.lancamentos (
    fazenda_id, data, tipo, quantidade, categoria, categoria_destino,
    fazenda_origem, fazenda_destino, peso_medio_kg, peso_medio_arrobas,
    preco_medio_cabeca, observacao, transferencia_par_id
  ) VALUES (
    dest_fazenda_id, NEW.data, 'transferencia_entrada', NEW.quantidade, NEW.categoria, NEW.categoria_destino,
    NEW.fazenda_origem, NEW.fazenda_destino, NEW.peso_medio_kg, NEW.peso_medio_arrobas,
    NEW.preco_medio_cabeca, NEW.observacao, NEW.id
  ) RETURNING id INTO dest_fazenda_id;

  -- Link the original to the pair
  UPDATE public.lancamentos SET transferencia_par_id = dest_fazenda_id WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

-- Trigger on insert
CREATE TRIGGER trg_auto_transferencia_entrada
AFTER INSERT ON public.lancamentos
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_transferencia_entrada();

-- Function to cascade updates from saida to entrada
CREATE OR REPLACE FUNCTION public.sync_transferencia_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.tipo != 'transferencia_saida' OR NEW.transferencia_par_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.lancamentos SET
    data = NEW.data,
    quantidade = NEW.quantidade,
    categoria = NEW.categoria,
    categoria_destino = NEW.categoria_destino,
    fazenda_origem = NEW.fazenda_origem,
    fazenda_destino = NEW.fazenda_destino,
    peso_medio_kg = NEW.peso_medio_kg,
    peso_medio_arrobas = NEW.peso_medio_arrobas,
    preco_medio_cabeca = NEW.preco_medio_cabeca,
    observacao = NEW.observacao
  WHERE id = NEW.transferencia_par_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_transferencia_update
AFTER UPDATE ON public.lancamentos
FOR EACH ROW
WHEN (OLD.tipo = 'transferencia_saida')
EXECUTE FUNCTION public.sync_transferencia_update();
