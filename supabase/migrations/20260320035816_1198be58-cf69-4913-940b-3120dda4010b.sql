-- Helper to resolve destination farm by name within same project membership scope
CREATE OR REPLACE FUNCTION public.resolve_transfer_destination_fazenda(
  _origem_fazenda_id uuid,
  _destino_nome text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f_dest.id
  FROM public.fazendas f_dest
  WHERE trim(lower(f_dest.nome)) = trim(lower(_destino_nome))
    AND EXISTS (
      SELECT 1
      FROM public.fazenda_membros mo
      JOIN public.fazenda_membros md ON md.user_id = mo.user_id
      WHERE mo.fazenda_id = _origem_fazenda_id
        AND md.fazenda_id = f_dest.id
    )
  ORDER BY f_dest.created_at ASC
  LIMIT 1
$$;

-- Create paired transfer entry automatically on insert
CREATE OR REPLACE FUNCTION public.auto_create_transferencia_entrada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  dest_fazenda_id uuid;
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

  INSERT INTO public.lancamentos (
    fazenda_id, data, tipo, quantidade, categoria, categoria_destino,
    fazenda_origem, fazenda_destino, peso_medio_kg, peso_medio_arrobas,
    preco_medio_cabeca, observacao, transferencia_par_id
  ) VALUES (
    dest_fazenda_id, NEW.data, 'transferencia_entrada', NEW.quantidade, NEW.categoria, NEW.categoria_destino,
    NEW.fazenda_origem, NEW.fazenda_destino, NEW.peso_medio_kg, NEW.peso_medio_arrobas,
    NEW.preco_medio_cabeca, NEW.observacao, NEW.id
  )
  RETURNING id INTO entrada_id;

  UPDATE public.lancamentos
  SET transferencia_par_id = entrada_id
  WHERE id = NEW.id;

  RETURN NEW;
END;
$function$;

-- Keep paired transfer entry synchronized on update
CREATE OR REPLACE FUNCTION public.sync_transferencia_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  dest_fazenda_id uuid;
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

    INSERT INTO public.lancamentos (
      fazenda_id, data, tipo, quantidade, categoria, categoria_destino,
      fazenda_origem, fazenda_destino, peso_medio_kg, peso_medio_arrobas,
      preco_medio_cabeca, observacao, transferencia_par_id
    ) VALUES (
      dest_fazenda_id, NEW.data, 'transferencia_entrada', NEW.quantidade, NEW.categoria, NEW.categoria_destino,
      NEW.fazenda_origem, NEW.fazenda_destino, NEW.peso_medio_kg, NEW.peso_medio_arrobas,
      NEW.preco_medio_cabeca, NEW.observacao, NEW.id
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
    observacao = NEW.observacao
  WHERE id = NEW.transferencia_par_id;

  RETURN NEW;
END;
$function$;

-- Backfill existing transferências de saída sem par
DO $$
DECLARE
  rec RECORD;
  dest_fazenda_id uuid;
  entrada_id uuid;
BEGIN
  FOR rec IN
    SELECT *
    FROM public.lancamentos
    WHERE tipo = 'transferencia_saida'
      AND transferencia_par_id IS NULL
  LOOP
    dest_fazenda_id := public.resolve_transfer_destination_fazenda(rec.fazenda_id, rec.fazenda_destino);

    IF dest_fazenda_id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.lancamentos (
      fazenda_id, data, tipo, quantidade, categoria, categoria_destino,
      fazenda_origem, fazenda_destino, peso_medio_kg, peso_medio_arrobas,
      preco_medio_cabeca, observacao, transferencia_par_id
    ) VALUES (
      dest_fazenda_id, rec.data, 'transferencia_entrada', rec.quantidade, rec.categoria, rec.categoria_destino,
      rec.fazenda_origem, rec.fazenda_destino, rec.peso_medio_kg, rec.peso_medio_arrobas,
      rec.preco_medio_cabeca, rec.observacao, rec.id
    )
    RETURNING id INTO entrada_id;

    UPDATE public.lancamentos
    SET transferencia_par_id = entrada_id
    WHERE id = rec.id;
  END LOOP;
END $$;