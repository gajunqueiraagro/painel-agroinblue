
-- Step 1: Allow NULL and change default
ALTER TABLE public.lancamentos
  ALTER COLUMN status_operacional DROP NOT NULL,
  ALTER COLUMN status_operacional SET DEFAULT 'realizado';

-- Step 2: Migrate data
UPDATE public.lancamentos SET status_operacional = 'realizado' WHERE status_operacional = 'conciliado';
UPDATE public.lancamentos SET status_operacional = 'programado' WHERE status_operacional = 'confirmado';
UPDATE public.lancamentos SET status_operacional = NULL WHERE cenario = 'meta';

-- Step 3: Validation trigger
CREATE OR REPLACE FUNCTION public.validate_cenario_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.cenario = 'meta' AND NEW.status_operacional IS NOT NULL THEN
    RAISE EXCEPTION 'Registros META (cenario=meta) não podem ter status_operacional. Valor recebido: %', NEW.status_operacional;
  END IF;
  IF NEW.cenario = 'realizado' THEN
    IF NEW.status_operacional IS NULL THEN
      RAISE EXCEPTION 'Registros operacionais (cenario=realizado) precisam de status_operacional.';
    END IF;
    IF NEW.status_operacional NOT IN ('previsto', 'programado', 'agendado', 'realizado') THEN
      RAISE EXCEPTION 'status_operacional inválido: %. Valores aceitos: previsto, programado, agendado, realizado', NEW.status_operacional;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_cenario_status
BEFORE INSERT OR UPDATE ON public.lancamentos
FOR EACH ROW
EXECUTE FUNCTION public.validate_cenario_status();

-- Step 4: META permission guard
CREATE OR REPLACE FUNCTION public.guard_meta_admin_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.cenario = 'meta' THEN
    IF NOT public.is_admin_agroinblue(auth.uid()) THEN
      RAISE EXCEPTION 'Somente consultores (admin) podem criar registros META.';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.cenario = 'meta' AND NOT public.is_admin_agroinblue(auth.uid()) THEN
      RAISE EXCEPTION 'Somente consultores (admin) podem editar registros META.';
    END IF;
    IF NEW.cenario = 'meta' AND OLD.cenario != 'meta' AND NOT public.is_admin_agroinblue(auth.uid()) THEN
      RAISE EXCEPTION 'Somente consultores (admin) podem definir registros como META.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' AND OLD.cenario = 'meta' THEN
    IF NOT public.is_admin_agroinblue(auth.uid()) THEN
      RAISE EXCEPTION 'Somente consultores (admin) podem excluir registros META.';
    END IF;
    RETURN OLD;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER trg_guard_meta_admin_only
BEFORE INSERT OR UPDATE OR DELETE ON public.lancamentos
FOR EACH ROW
EXECUTE FUNCTION public.guard_meta_admin_only();

-- Step 5: Updated transfer triggers
CREATE OR REPLACE FUNCTION public.auto_create_transferencia_entrada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  dest_fazenda_id uuid;
  dest_cliente_id uuid;
  entrada_id uuid;
BEGIN
  IF NEW.tipo != 'transferencia_saida' THEN RETURN NEW; END IF;
  IF NEW.transferencia_par_id IS NOT NULL THEN RETURN NEW; END IF;

  dest_fazenda_id := public.resolve_transfer_destination_fazenda(NEW.fazenda_id, NEW.fazenda_destino);
  IF dest_fazenda_id IS NULL THEN RETURN NEW; END IF;

  SELECT cliente_id INTO dest_cliente_id FROM public.fazendas WHERE id = dest_fazenda_id;

  INSERT INTO public.lancamentos (
    fazenda_id, cliente_id, data, tipo, quantidade, categoria, categoria_destino,
    fazenda_origem, fazenda_destino, peso_medio_kg, peso_medio_arrobas,
    preco_medio_cabeca, observacao, transferencia_par_id, status_operacional, cenario
  ) VALUES (
    dest_fazenda_id, COALESCE(dest_cliente_id, NEW.cliente_id), NEW.data, 'transferencia_entrada',
    NEW.quantidade, NEW.categoria, NEW.categoria_destino,
    NEW.fazenda_origem, NEW.fazenda_destino, NEW.peso_medio_kg, NEW.peso_medio_arrobas,
    NEW.preco_medio_cabeca, NEW.observacao, NEW.id, NEW.status_operacional, NEW.cenario
  )
  RETURNING id INTO entrada_id;

  UPDATE public.lancamentos SET transferencia_par_id = entrada_id WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_transferencia_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  dest_fazenda_id uuid;
  dest_cliente_id uuid;
  entrada_id uuid;
BEGIN
  IF NEW.tipo != 'transferencia_saida' THEN RETURN NEW; END IF;

  IF NEW.transferencia_par_id IS NULL THEN
    IF NEW.fazenda_destino IS NULL THEN RETURN NEW; END IF;
    dest_fazenda_id := public.resolve_transfer_destination_fazenda(NEW.fazenda_id, NEW.fazenda_destino);
    IF dest_fazenda_id IS NULL THEN RETURN NEW; END IF;
    SELECT cliente_id INTO dest_cliente_id FROM public.fazendas WHERE id = dest_fazenda_id;

    INSERT INTO public.lancamentos (
      fazenda_id, cliente_id, data, tipo, quantidade, categoria, categoria_destino,
      fazenda_origem, fazenda_destino, peso_medio_kg, peso_medio_arrobas,
      preco_medio_cabeca, observacao, transferencia_par_id, status_operacional, cenario
    ) VALUES (
      dest_fazenda_id, COALESCE(dest_cliente_id, NEW.cliente_id), NEW.data, 'transferencia_entrada',
      NEW.quantidade, NEW.categoria, NEW.categoria_destino,
      NEW.fazenda_origem, NEW.fazenda_destino, NEW.peso_medio_kg, NEW.peso_medio_arrobas,
      NEW.preco_medio_cabeca, NEW.observacao, NEW.id, NEW.status_operacional, NEW.cenario
    )
    RETURNING id INTO entrada_id;

    UPDATE public.lancamentos SET transferencia_par_id = entrada_id WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  -- Soft-delete propagation
  IF NEW.cancelado = true AND OLD.cancelado = false THEN
    UPDATE public.lancamentos
    SET cancelado = true, cancelado_em = NEW.cancelado_em, cancelado_por = NEW.cancelado_por
    WHERE id = NEW.transferencia_par_id AND cancelado = false;
    RETURN NEW;
  END IF;

  -- Sync update
  dest_fazenda_id := public.resolve_transfer_destination_fazenda(NEW.fazenda_id, NEW.fazenda_destino);

  UPDATE public.lancamentos
  SET fazenda_id = COALESCE(dest_fazenda_id, fazenda_id),
      data = NEW.data, quantidade = NEW.quantidade, categoria = NEW.categoria,
      categoria_destino = NEW.categoria_destino, fazenda_origem = NEW.fazenda_origem,
      fazenda_destino = NEW.fazenda_destino, peso_medio_kg = NEW.peso_medio_kg,
      peso_medio_arrobas = NEW.peso_medio_arrobas, preco_medio_cabeca = NEW.preco_medio_cabeca,
      observacao = NEW.observacao, status_operacional = NEW.status_operacional, cenario = NEW.cenario
  WHERE id = NEW.transferencia_par_id;

  RETURN NEW;
END;
$$;

-- Step 6: Updated conciliation function
CREATE OR REPLACE FUNCTION public.validar_conciliacao_rebanho(_fazenda_id uuid, _ano_mes text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _divergencias jsonb := '[]'::jsonb;
  _conciliado boolean := true;
  _rec record;
  _ano int;
  _mes int;
  _mes_anterior text;
BEGIN
  _ano := split_part(_ano_mes, '-', 1)::int;
  _mes := split_part(_ano_mes, '-', 2)::int;

  IF _mes = 1 THEN
    _mes_anterior := (_ano - 1)::text || '-12';
  ELSE
    _mes_anterior := _ano::text || '-' || lpad((_mes - 1)::text, 2, '0');
  END IF;

  FOR _rec IN
    WITH saldo_sistema AS (
      SELECT cr.id AS categoria_id, cr.codigo AS categoria_codigo, cr.nome AS categoria_nome,
        COALESCE(si.qtd, 0) AS saldo_inicial
      FROM categorias_rebanho cr
      LEFT JOIN (
        SELECT fpi.categoria_id, SUM(fpi.quantidade) AS qtd
        FROM fechamento_pasto_itens fpi
        JOIN fechamento_pastos fp ON fp.id = fpi.fechamento_id
        WHERE fp.fazenda_id = _fazenda_id AND fp.ano_mes = _mes_anterior AND fp.status = 'fechado'
        GROUP BY fpi.categoria_id
      ) si ON si.categoria_id = cr.id
    ),
    movimentacoes AS (
      SELECT cr.id AS categoria_id,
        SUM(CASE WHEN l.tipo IN ('compra','nascimento','transferencia_entrada') THEN l.quantidade ELSE 0 END) AS entradas,
        SUM(CASE WHEN l.tipo IN ('venda','abate','morte','consumo','transferencia_saida') THEN l.quantidade ELSE 0 END) AS saidas
      FROM lancamentos l
      JOIN categorias_rebanho cr ON cr.codigo = l.categoria
      WHERE l.fazenda_id = _fazenda_id AND substring(l.data, 1, 7) = _ano_mes
        AND COALESCE(l.cancelado, false) = false
        AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
      GROUP BY cr.id
    ),
    reclass_saida AS (
      SELECT cr.id AS categoria_id, SUM(l.quantidade) AS qtd
      FROM lancamentos l JOIN categorias_rebanho cr ON cr.codigo = l.categoria
      WHERE l.fazenda_id = _fazenda_id AND substring(l.data, 1, 7) = _ano_mes
        AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL
        AND COALESCE(l.cancelado, false) = false
        AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
      GROUP BY cr.id
    ),
    reclass_entrada AS (
      SELECT cr.id AS categoria_id, SUM(l.quantidade) AS qtd
      FROM lancamentos l JOIN categorias_rebanho cr ON cr.codigo = l.categoria_destino
      WHERE l.fazenda_id = _fazenda_id AND substring(l.data, 1, 7) = _ano_mes
        AND l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL
        AND COALESCE(l.cancelado, false) = false
        AND l.cenario = 'realizado' AND l.status_operacional = 'realizado'
      GROUP BY cr.id
    ),
    saldo_final_sistema AS (
      SELECT ss.categoria_id, ss.categoria_nome,
        ss.saldo_inicial + COALESCE(m.entradas, 0) - COALESCE(m.saidas, 0)
        - COALESCE(rs.qtd, 0) + COALESCE(re.qtd, 0) AS saldo_sistema
      FROM saldo_sistema ss
      LEFT JOIN movimentacoes m ON m.categoria_id = ss.categoria_id
      LEFT JOIN reclass_saida rs ON rs.categoria_id = ss.categoria_id
      LEFT JOIN reclass_entrada re ON re.categoria_id = ss.categoria_id
    ),
    saldo_pastos AS (
      SELECT fpi.categoria_id, SUM(fpi.quantidade) AS saldo_pastos
      FROM fechamento_pasto_itens fpi JOIN fechamento_pastos fp ON fp.id = fpi.fechamento_id
      WHERE fp.fazenda_id = _fazenda_id AND fp.ano_mes = _ano_mes AND fp.status = 'fechado'
      GROUP BY fpi.categoria_id
    )
    SELECT COALESCE(sfs.categoria_id, sp.categoria_id) AS categoria_id,
      COALESCE(sfs.categoria_nome, cr2.nome) AS categoria_nome,
      COALESCE(sfs.saldo_sistema, 0) AS saldo_sistema,
      COALESCE(sp.saldo_pastos, 0) AS saldo_pastos,
      COALESCE(sfs.saldo_sistema, 0) - COALESCE(sp.saldo_pastos, 0) AS diferenca
    FROM saldo_final_sistema sfs
    FULL OUTER JOIN saldo_pastos sp ON sp.categoria_id = sfs.categoria_id
    LEFT JOIN categorias_rebanho cr2 ON cr2.id = sp.categoria_id
    WHERE COALESCE(sfs.saldo_sistema, 0) != COALESCE(sp.saldo_pastos, 0)
       OR (COALESCE(sfs.saldo_sistema, 0) != 0 AND sp.saldo_pastos IS NULL)
       OR (sfs.saldo_sistema IS NULL AND COALESCE(sp.saldo_pastos, 0) != 0)
  LOOP
    _conciliado := false;
    _divergencias := _divergencias || jsonb_build_object(
      'categoria_id', _rec.categoria_id, 'categoria', _rec.categoria_nome,
      'saldo_sistema', _rec.saldo_sistema, 'saldo_pastos', _rec.saldo_pastos,
      'diferenca', _rec.diferenca
    );
  END LOOP;

  RETURN jsonb_build_object('conciliado', _conciliado, 'divergencias', _divergencias);
END;
$$;
