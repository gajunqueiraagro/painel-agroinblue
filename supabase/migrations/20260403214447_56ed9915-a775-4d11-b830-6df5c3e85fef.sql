
CREATE OR REPLACE FUNCTION public.auto_create_transferencia_entrada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Resolve the cliente_id for the destination fazenda
  SELECT cliente_id INTO dest_cliente_id FROM public.fazendas WHERE id = dest_fazenda_id;

  INSERT INTO public.lancamentos (
    fazenda_id, cliente_id, data, tipo, quantidade, categoria, categoria_destino,
    fazenda_origem, fazenda_destino, peso_medio_kg, peso_medio_arrobas,
    preco_medio_cabeca, observacao, transferencia_par_id, status_operacional
  ) VALUES (
    dest_fazenda_id, COALESCE(dest_cliente_id, NEW.cliente_id), NEW.data, 'transferencia_entrada', NEW.quantidade, NEW.categoria, NEW.categoria_destino,
    NEW.fazenda_origem, NEW.fazenda_destino, NEW.peso_medio_kg, NEW.peso_medio_arrobas,
    NEW.preco_medio_cabeca, NEW.observacao, NEW.id, NEW.status_operacional
  )
  RETURNING id INTO entrada_id;

  UPDATE public.lancamentos
  SET transferencia_par_id = entrada_id
  WHERE id = NEW.id;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_transferencia_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  dest_fazenda_id uuid;
  dest_cliente_id uuid;
  entrada_id uuid;
BEGIN
  IF NEW.tipo != 'transferencia_saida' THEN
    RETURN NEW;
  END IF;

  dest_fazenda_id := public.resolve_transfer_destination_fazenda(NEW.fazenda_id, NEW.fazenda_destino);

  -- Legacy safety: if the pair does not exist yet, create it on first edit
  IF NEW.transferencia_par_id IS NULL THEN
    IF dest_fazenda_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT cliente_id INTO dest_cliente_id FROM public.fazendas WHERE id = dest_fazenda_id;

    INSERT INTO public.lancamentos (
      fazenda_id, cliente_id, data, tipo, quantidade, categoria, categoria_destino,
      fazenda_origem, fazenda_destino, peso_medio_kg, peso_medio_arrobas,
      preco_medio_cabeca, observacao, transferencia_par_id, status_operacional
    ) VALUES (
      dest_fazenda_id, COALESCE(dest_cliente_id, NEW.cliente_id), NEW.data, 'transferencia_entrada', NEW.quantidade, NEW.categoria, NEW.categoria_destino,
      NEW.fazenda_origem, NEW.fazenda_destino, NEW.peso_medio_kg, NEW.peso_medio_arrobas,
      NEW.preco_medio_cabeca, NEW.observacao, NEW.id, NEW.status_operacional
    )
    RETURNING id INTO entrada_id;

    UPDATE public.lancamentos
    SET transferencia_par_id = entrada_id
    WHERE id = NEW.id;

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
    status_operacional = NEW.status_operacional
  WHERE id = NEW.transferencia_par_id;

  RETURN NEW;
END;
$function$;
