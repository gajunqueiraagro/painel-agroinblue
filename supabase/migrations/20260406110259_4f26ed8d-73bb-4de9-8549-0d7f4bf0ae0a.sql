
-- 1. Adicionar coluna cenario
ALTER TABLE public.lancamentos
ADD COLUMN cenario text NOT NULL DEFAULT 'realizado';

-- 2. Índice parcial para queries meta
CREATE INDEX idx_lancamentos_cenario_meta
ON public.lancamentos (fazenda_id, cenario)
WHERE cenario = 'meta';

-- 3. Atualizar guard_lancamento_mes_fechado_p1 para ignorar meta
CREATE OR REPLACE FUNCTION public.guard_lancamento_mes_fechado_p1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _ano_mes text;
  _fazenda_id uuid;
  _p1_status text;
  _status_json jsonb;
BEGIN
  -- Cenário meta não participa de fechamento
  IF TG_OP = 'INSERT' AND NEW.cenario = 'meta' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.cenario = 'meta' THEN RETURN NEW; END IF;
  IF TG_OP = 'DELETE' AND OLD.cenario = 'meta' THEN RETURN OLD; END IF;

  -- Derivar ano_mes e fazenda_id do registro afetado
  IF TG_OP = 'DELETE' THEN
    _ano_mes := substring(OLD.data, 1, 7);
    _fazenda_id := OLD.fazenda_id;
  ELSIF TG_OP = 'INSERT' THEN
    _ano_mes := substring(NEW.data, 1, 7);
    _fazenda_id := NEW.fazenda_id;
  ELSE -- UPDATE
    _ano_mes := substring(OLD.data, 1, 7);
    _fazenda_id := OLD.fazenda_id;
  END IF;

  _status_json := get_status_pilares_fechamento(_fazenda_id, _ano_mes);
  _p1_status := _status_json->'p1_mapa_pastos'->>'status';

  IF _p1_status != 'oficial' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Reabra o período para excluir lançamentos.', _ano_mes;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Reabra o período para inserir novos lançamentos.', _ano_mes;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (OLD.data IS DISTINCT FROM NEW.data)
       OR (OLD.tipo IS DISTINCT FROM NEW.tipo)
       OR (OLD.quantidade IS DISTINCT FROM NEW.quantidade)
       OR (OLD.categoria IS DISTINCT FROM NEW.categoria)
       OR (OLD.categoria_destino IS DISTINCT FROM NEW.categoria_destino)
       OR (OLD.fazenda_id IS DISTINCT FROM NEW.fazenda_id)
       OR (OLD.fazenda_destino IS DISTINCT FROM NEW.fazenda_destino)
       OR (OLD.fazenda_origem IS DISTINCT FROM NEW.fazenda_origem)
       OR (OLD.cancelado IS DISTINCT FROM NEW.cancelado)
    THEN
      RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Reabra o período para alterar campos estruturais.', _ano_mes;
    END IF;

    IF substring(OLD.data, 1, 7) IS DISTINCT FROM substring(NEW.data, 1, 7)
       OR OLD.fazenda_id IS DISTINCT FROM NEW.fazenda_id THEN
      _status_json := get_status_pilares_fechamento(NEW.fazenda_id, substring(NEW.data, 1, 7));
      _p1_status := _status_json->'p1_mapa_pastos'->>'status';
      IF _p1_status = 'oficial' THEN
        RAISE EXCEPTION 'O mês destino % também está fechado no Mapa de Pastos (P1 oficial).', substring(NEW.data, 1, 7);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4. Atualizar auto_create_transferencia_entrada para ignorar meta
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

  -- Meta não gera par automático
  IF NEW.cenario = 'meta' THEN
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
$function$;

-- 5. Atualizar sync_transferencia_update para ignorar meta
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

  -- Meta não sincroniza transferências
  IF NEW.cenario = 'meta' THEN
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

-- 6. Atualizar validar_conciliacao_rebanho para filtrar apenas realizado
CREATE OR REPLACE FUNCTION public.validar_conciliacao_rebanho(_fazenda_id uuid, _ano_mes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      SELECT
        cr.id AS categoria_id,
        cr.codigo AS categoria_codigo,
        cr.nome AS categoria_nome,
        COALESCE(si.qtd, 0) AS saldo_inicial
      FROM categorias_rebanho cr
      LEFT JOIN (
        SELECT
          fpi.categoria_id,
          SUM(fpi.quantidade) AS qtd
        FROM fechamento_pasto_itens fpi
        JOIN fechamento_pastos fp ON fp.id = fpi.fechamento_id
        WHERE fp.fazenda_id = _fazenda_id
          AND fp.ano_mes = _mes_anterior
          AND fp.status = 'fechado'
        GROUP BY fpi.categoria_id
      ) si ON si.categoria_id = cr.id
    ),
    movimentacoes AS (
      SELECT
        cr.id AS categoria_id,
        SUM(CASE
          WHEN l.tipo IN ('compra','nascimento','transferencia_entrada') THEN l.quantidade
          WHEN l.tipo = 'reclassificacao' AND l.categoria_destino IS NOT NULL THEN 0
          ELSE 0
        END) AS entradas,
        SUM(CASE
          WHEN l.tipo IN ('venda','abate','morte','consumo','transferencia_saida') THEN l.quantidade
          WHEN l.tipo = 'reclassificacao' THEN 0
          ELSE 0
        END) AS saidas
      FROM lancamentos l
      JOIN categorias_rebanho cr ON cr.codigo = l.categoria
      WHERE l.fazenda_id = _fazenda_id
        AND substring(l.data, 1, 7) = _ano_mes
        AND COALESCE(l.cancelado, false) = false
        AND COALESCE(l.status_operacional, 'confirmado') != 'previsto'
        AND l.cenario = 'realizado'
      GROUP BY cr.id
    ),
    reclass_saida AS (
      SELECT
        cr.id AS categoria_id,
        SUM(l.quantidade) AS qtd
      FROM lancamentos l
      JOIN categorias_rebanho cr ON cr.codigo = l.categoria
      WHERE l.fazenda_id = _fazenda_id
        AND substring(l.data, 1, 7) = _ano_mes
        AND l.tipo = 'reclassificacao'
        AND l.categoria_destino IS NOT NULL
        AND COALESCE(l.cancelado, false) = false
        AND COALESCE(l.status_operacional, 'confirmado') != 'previsto'
        AND l.cenario = 'realizado'
      GROUP BY cr.id
    ),
    reclass_entrada AS (
      SELECT
        cr.id AS categoria_id,
        SUM(l.quantidade) AS qtd
      FROM lancamentos l
      JOIN categorias_rebanho cr ON cr.codigo = l.categoria_destino
      WHERE l.fazenda_id = _fazenda_id
        AND substring(l.data, 1, 7) = _ano_mes
        AND l.tipo = 'reclassificacao'
        AND l.categoria_destino IS NOT NULL
        AND COALESCE(l.cancelado, false) = false
        AND COALESCE(l.status_operacional, 'confirmado') != 'previsto'
        AND l.cenario = 'realizado'
      GROUP BY cr.id
    ),
    saldo_final_sistema AS (
      SELECT
        ss.categoria_id,
        ss.categoria_nome,
        ss.saldo_inicial
          + COALESCE(m.entradas, 0)
          - COALESCE(m.saidas, 0)
          - COALESCE(rs.qtd, 0)
          + COALESCE(re.qtd, 0) AS saldo_sistema
      FROM saldo_sistema ss
      LEFT JOIN movimentacoes m ON m.categoria_id = ss.categoria_id
      LEFT JOIN reclass_saida rs ON rs.categoria_id = ss.categoria_id
      LEFT JOIN reclass_entrada re ON re.categoria_id = ss.categoria_id
    ),
    saldo_pastos AS (
      SELECT
        fpi.categoria_id,
        SUM(fpi.quantidade) AS saldo_pastos
      FROM fechamento_pasto_itens fpi
      JOIN fechamento_pastos fp ON fp.id = fpi.fechamento_id
      WHERE fp.fazenda_id = _fazenda_id
        AND fp.ano_mes = _ano_mes
        AND fp.status = 'fechado'
      GROUP BY fpi.categoria_id
    )
    SELECT
      COALESCE(sfs.categoria_id, sp.categoria_id) AS categoria_id,
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
      'categoria_id', _rec.categoria_id,
      'categoria', _rec.categoria_nome,
      'saldo_sistema', _rec.saldo_sistema,
      'saldo_pastos', _rec.saldo_pastos,
      'diferenca', _rec.diferenca
    );
  END LOOP;

  RETURN jsonb_build_object(
    'conciliado', _conciliado,
    'divergencias', _divergencias
  );
END;
$function$;
