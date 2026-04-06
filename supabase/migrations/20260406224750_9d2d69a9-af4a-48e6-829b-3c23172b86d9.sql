
-- 1. Update auto_create_transferencia_entrada to also handle cenario = 'meta'
CREATE OR REPLACE FUNCTION public.auto_create_transferencia_entrada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dest_fazenda_id uuid;
  dest_cliente_id uuid;
  entrada_id uuid;
BEGIN
  IF NEW.tipo != 'transferencia_saida' THEN
    RETURN NEW;
  END IF;

  IF NEW.transferencia_par_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  dest_fazenda_id := public.resolve_transfer_destination_fazenda(NEW.fazenda_id, NEW.fazenda_destino);

  IF dest_fazenda_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT cliente_id INTO dest_cliente_id FROM public.fazendas WHERE id = dest_fazenda_id;

  INSERT INTO public.lancamentos (
    fazenda_id, cliente_id, data, tipo, quantidade, categoria, categoria_destino,
    fazenda_origem, fazenda_destino, peso_medio_kg, peso_medio_arrobas,
    preco_medio_cabeca, observacao, transferencia_par_id, status_operacional, cenario
  ) VALUES (
    dest_fazenda_id, COALESCE(dest_cliente_id, NEW.cliente_id), NEW.data, 'transferencia_entrada', NEW.quantidade, NEW.categoria, NEW.categoria_destino,
    NEW.fazenda_origem, NEW.fazenda_destino, NEW.peso_medio_kg, NEW.peso_medio_arrobas,
    NEW.preco_medio_cabeca, NEW.observacao, NEW.id, NEW.status_operacional, NEW.cenario
  )
  RETURNING id INTO entrada_id;

  UPDATE public.lancamentos
  SET transferencia_par_id = entrada_id
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

-- 2. Update sync_transferencia_update to also handle cenario = 'meta'
CREATE OR REPLACE FUNCTION public.sync_transferencia_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dest_fazenda_id uuid;
  dest_cliente_id uuid;
  entrada_id uuid;
BEGIN
  IF NEW.tipo != 'transferencia_saida' THEN
    RETURN NEW;
  END IF;

  dest_fazenda_id := public.resolve_transfer_destination_fazenda(NEW.fazenda_id, NEW.fazenda_destino);

  IF NEW.transferencia_par_id IS NULL THEN
    IF dest_fazenda_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT cliente_id INTO dest_cliente_id FROM public.fazendas WHERE id = dest_fazenda_id;

    INSERT INTO public.lancamentos (
      fazenda_id, cliente_id, data, tipo, quantidade, categoria, categoria_destino,
      fazenda_origem, fazenda_destino, peso_medio_kg, peso_medio_arrobas,
      preco_medio_cabeca, observacao, transferencia_par_id, status_operacional, cenario
    ) VALUES (
      dest_fazenda_id, COALESCE(dest_cliente_id, NEW.cliente_id), NEW.data, 'transferencia_entrada', NEW.quantidade, NEW.categoria, NEW.categoria_destino,
      NEW.fazenda_origem, NEW.fazenda_destino, NEW.peso_medio_kg, NEW.peso_medio_arrobas,
      NEW.preco_medio_cabeca, NEW.observacao, NEW.id, NEW.status_operacional, NEW.cenario
    )
    RETURNING id INTO entrada_id;

    UPDATE public.lancamentos
    SET transferencia_par_id = entrada_id
    WHERE id = NEW.id;

    RETURN NEW;
  END IF;

  -- Sync: soft-delete propagation
  IF NEW.cancelado = true AND OLD.cancelado = false THEN
    UPDATE public.lancamentos
    SET cancelado = true,
        cancelado_em = NEW.cancelado_em,
        cancelado_por = NEW.cancelado_por
    WHERE id = NEW.transferencia_par_id
      AND cancelado = false;
    RETURN NEW;
  END IF;

  UPDATE public.lancamentos
  SET
    fazenda_id = COALESCE(dest_fazenda_id, fazenda_id),
    data = NEW.data,
    quantidade = NEW.quantidade,
    categoria = NEW.categoria,
    categoria_destino = NEW.categoria_destino,
    fazenda_origem = NEW.fazenda_origem,
    fazenda_destino = NEW.fazenda_destino,
    peso_medio_kg = NEW.peso_medio_kg,
    peso_medio_arrobas = NEW.peso_medio_arrobas,
    preco_medio_cabeca = NEW.preco_medio_cabeca,
    observacao = NEW.observacao,
    status_operacional = NEW.status_operacional,
    cenario = NEW.cenario
  WHERE id = NEW.transferencia_par_id;

  RETURN NEW;
END;
$$;
