
-- ============================================================
-- 1. Recriar get_status_pilares_fechamento com correções
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_status_pilares_fechamento(
  _fazenda_id uuid,
  _ano_mes text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _p1_status text;
  _p1_detalhe jsonb;
  _p2_status text;
  _p3_status text;
  _p4_status text;
  _p4_modo_transitorio boolean := false;
  _p5_status text;
  _total_pastos int;
  _total_fechados int;
  _conciliacao jsonb;
  _tem_divergencia boolean;
  _p2_existe boolean;
  _p3_existe boolean;
  _p4_existe boolean;
BEGIN
  -- ========== P1 - Mapa de Pastos ==========
  SELECT count(*) INTO _total_pastos
  FROM pastos
  WHERE fazenda_id = _fazenda_id AND ativo = true;

  SELECT count(*) INTO _total_fechados
  FROM fechamento_pastos
  WHERE fazenda_id = _fazenda_id
    AND ano_mes = _ano_mes
    AND status = 'fechado';

  -- Validar conciliação
  _conciliacao := validar_conciliacao_rebanho(_fazenda_id, _ano_mes);
  _tem_divergencia := (_conciliacao->>'conciliado')::boolean IS DISTINCT FROM true;

  IF _total_pastos = 0 THEN
    _p1_status := 'bloqueado';
    _p1_detalhe := jsonb_build_object('motivo', 'sem_pastos_ativos');
  ELSIF _total_fechados < _total_pastos THEN
    _p1_status := 'provisorio';
    _p1_detalhe := jsonb_build_object(
      'total_pastos', _total_pastos,
      'total_fechados', _total_fechados
    );
  ELSIF _tem_divergencia THEN
    _p1_status := 'bloqueado';
    _p1_detalhe := jsonb_build_object(
      'motivo', 'divergencia_rebanho',
      'divergencias', _conciliacao->'divergencias'
    );
  ELSE
    _p1_status := 'oficial';
    _p1_detalhe := jsonb_build_object(
      'total_pastos', _total_pastos,
      'total_fechados', _total_fechados,
      'conciliacao', _conciliacao
    );
  END IF;

  -- ========== P2 - Valor do Rebanho ==========
  IF _p1_status != 'oficial' THEN
    _p2_status := 'bloqueado';
  ELSE
    SELECT EXISTS(
      SELECT 1 FROM valor_rebanho_fechamento
      WHERE fazenda_id = _fazenda_id
        AND ano_mes = _ano_mes
        AND status = 'fechado'
    ) INTO _p2_existe;

    IF _p2_existe THEN
      _p2_status := 'oficial';
    ELSE
      _p2_status := 'provisorio';
    END IF;
  END IF;

  -- ========== P3 - Financeiro Caixa ==========
  SELECT EXISTS(
    SELECT 1 FROM financeiro_fechamentos
    WHERE fazenda_id = _fazenda_id
      AND ano_mes = _ano_mes
      AND status_fechamento = 'fechado'
  ) INTO _p3_existe;

  IF _p3_existe THEN
    _p3_status := 'oficial';
  ELSE
    _p3_status := 'provisorio';
  END IF;

  -- ========== P4 - Competência Econômica ==========
  IF _p1_status != 'oficial' THEN
    _p4_status := 'bloqueado';
    _p4_modo_transitorio := false;
  ELSE
    -- Verificar se existe fechamento formal de P4
    -- Como ainda não existe tela formal, usar regra transitória
    SELECT EXISTS(
      SELECT 1 FROM competencia_fechamento
      WHERE fazenda_id = _fazenda_id
        AND ano_mes = _ano_mes
        AND status = 'fechado'
    ) INTO _p4_existe;

    IF _p4_existe THEN
      _p4_status := 'oficial';
      _p4_modo_transitorio := false;
    ELSE
      -- Regra transitória: P1 oficial → P4 oficial transitório
      _p4_status := 'oficial';
      _p4_modo_transitorio := true;
    END IF;
  END IF;

  -- ========== P5 - Econômico Consolidado ==========
  IF _p1_status = 'oficial'
     AND _p2_status = 'oficial'
     AND _p3_status = 'oficial'
     AND _p4_status = 'oficial' THEN
    _p5_status := 'oficial';
  ELSIF _p1_status = 'bloqueado'
     OR _p2_status = 'bloqueado'
     OR _p4_status = 'bloqueado' THEN
    _p5_status := 'bloqueado';
  ELSE
    _p5_status := 'provisorio';
  END IF;

  RETURN jsonb_build_object(
    'fazenda_id', _fazenda_id,
    'ano_mes', _ano_mes,
    'p1_mapa_pastos', jsonb_build_object(
      'status', _p1_status,
      'detalhe', _p1_detalhe
    ),
    'p2_valor_rebanho', jsonb_build_object(
      'status', _p2_status
    ),
    'p3_financeiro_caixa', jsonb_build_object(
      'status', _p3_status
    ),
    'p4_competencia', jsonb_build_object(
      'status', _p4_status,
      'modo_transitorio', _p4_modo_transitorio
    ),
    'p5_economico_consolidado', jsonb_build_object(
      'status', _p5_status
    )
  );
END;
$$;

-- ============================================================
-- 2. Criar tabelas auxiliares se não existirem (P2 e P4)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.valor_rebanho_fechamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES fazendas(id),
  cliente_id uuid NOT NULL REFERENCES clientes(id),
  ano_mes text NOT NULL,
  status text NOT NULL DEFAULT 'aberto',
  fechado_em timestamptz,
  fechado_por uuid,
  reaberto_em timestamptz,
  reaberto_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fazenda_id, ano_mes)
);

ALTER TABLE public.valor_rebanho_fechamento ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'valor_rebanho_fechamento' AND policyname = 'cliente_select') THEN
    CREATE POLICY "cliente_select" ON public.valor_rebanho_fechamento
      FOR SELECT TO authenticated
      USING ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'valor_rebanho_fechamento' AND policyname = 'cliente_insert') THEN
    CREATE POLICY "cliente_insert" ON public.valor_rebanho_fechamento
      FOR INSERT TO authenticated
      WITH CHECK ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'valor_rebanho_fechamento' AND policyname = 'cliente_update') THEN
    CREATE POLICY "cliente_update" ON public.valor_rebanho_fechamento
      FOR UPDATE TO authenticated
      USING ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.competencia_fechamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES fazendas(id),
  cliente_id uuid NOT NULL REFERENCES clientes(id),
  ano_mes text NOT NULL,
  status text NOT NULL DEFAULT 'aberto',
  fechado_em timestamptz,
  fechado_por uuid,
  reaberto_em timestamptz,
  reaberto_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fazenda_id, ano_mes)
);

ALTER TABLE public.competencia_fechamento ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'competencia_fechamento' AND policyname = 'cliente_select') THEN
    CREATE POLICY "cliente_select" ON public.competencia_fechamento
      FOR SELECT TO authenticated
      USING ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'competencia_fechamento' AND policyname = 'cliente_insert') THEN
    CREATE POLICY "cliente_insert" ON public.competencia_fechamento
      FOR INSERT TO authenticated
      WITH CHECK ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'competencia_fechamento' AND policyname = 'cliente_update') THEN
    CREATE POLICY "cliente_update" ON public.competencia_fechamento
      FOR UPDATE TO authenticated
      USING ((cliente_id IN (SELECT get_user_cliente_ids(auth.uid()))) OR is_admin_agroinblue(auth.uid()));
  END IF;
END $$;

-- ============================================================
-- 3. Recriar validar_conciliacao_rebanho filtrando previsto
-- ============================================================
CREATE OR REPLACE FUNCTION public.validar_conciliacao_rebanho(
  _fazenda_id uuid,
  _ano_mes text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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

  -- Mês anterior para saldo inicial
  IF _mes = 1 THEN
    _mes_anterior := (_ano - 1)::text || '-12';
  ELSE
    _mes_anterior := _ano::text || '-' || lpad((_mes - 1)::text, 2, '0');
  END IF;

  -- Comparar saldo do sistema vs saldo dos pastos por categoria
  FOR _rec IN
    WITH saldo_sistema AS (
      -- Saldo inicial: soma dos itens do mês anterior (fechamento_pasto_itens)
      SELECT
        cr.id AS categoria_id,
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
      -- Movimentações do mês (excluindo previsto e cancelados)
      SELECT
        categoria_id,
        SUM(CASE
          WHEN tipo IN ('compra','nascimento','transferencia_entrada','reclassificacao_entrada') THEN quantidade
          WHEN tipo IN ('venda','abate','morte','consumo','transferencia_saida','reclassificacao_saida') THEN -quantidade
          ELSE 0
        END) AS delta
      FROM lancamentos
      WHERE fazenda_id = _fazenda_id
        AND ano_mes = _ano_mes
        AND cancelado = false
        AND COALESCE(status_operacional, 'conciliado') != 'previsto'
      GROUP BY categoria_id
    ),
    saldo_final_sistema AS (
      SELECT
        ss.categoria_id,
        ss.categoria_nome,
        ss.saldo_inicial + COALESCE(m.delta, 0) AS saldo_sistema
      FROM saldo_sistema ss
      LEFT JOIN movimentacoes m ON m.categoria_id = ss.categoria_id
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
$$;

-- ============================================================
-- 4. Recriar guard trigger baseado no status oficial do P1
-- ============================================================
DROP TRIGGER IF EXISTS trg_guard_lancamento_mes_fechado_p1 ON lancamentos;
DROP FUNCTION IF EXISTS public.guard_lancamento_mes_fechado_p1();

CREATE OR REPLACE FUNCTION public.guard_lancamento_mes_fechado_p1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ano_mes text;
  _fazenda_id uuid;
  _p1_status text;
  _status_json jsonb;
BEGIN
  -- Determinar ano_mes e fazenda_id do registro afetado
  IF TG_OP = 'DELETE' THEN
    _ano_mes := OLD.ano_mes;
    _fazenda_id := OLD.fazenda_id;
  ELSIF TG_OP = 'INSERT' THEN
    _ano_mes := NEW.ano_mes;
    _fazenda_id := NEW.fazenda_id;
  ELSE -- UPDATE
    _ano_mes := OLD.ano_mes;
    _fazenda_id := OLD.fazenda_id;
  END IF;

  -- Verificar status real do P1
  _status_json := get_status_pilares_fechamento(_fazenda_id, _ano_mes);
  _p1_status := _status_json->'p1_mapa_pastos'->>'status';

  -- Se P1 não está oficial, permitir tudo
  IF _p1_status != 'oficial' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- P1 está oficial — aplicar bloqueios

  -- DELETE: sempre bloquear
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Reabra o período para excluir lançamentos.', _ano_mes;
  END IF;

  -- INSERT: sempre bloquear
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Reabra o período para inserir novos lançamentos.', _ano_mes;
  END IF;

  -- UPDATE: verificar campos estruturais
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.data IS DISTINCT FROM NEW.data)
       OR (OLD.tipo IS DISTINCT FROM NEW.tipo)
       OR (OLD.quantidade IS DISTINCT FROM NEW.quantidade)
       OR (OLD.categoria_id IS DISTINCT FROM NEW.categoria_id)
       OR (OLD.fazenda_id IS DISTINCT FROM NEW.fazenda_id)
       OR (OLD.fazenda_destino_id IS DISTINCT FROM NEW.fazenda_destino_id)
       OR (OLD.ano_mes IS DISTINCT FROM NEW.ano_mes)
       OR (OLD.cancelado IS DISTINCT FROM NEW.cancelado)
    THEN
      RAISE EXCEPTION 'Mês % está fechado no Mapa de Pastos (P1 oficial). Reabra o período para alterar campos estruturais.', _ano_mes;
    END IF;

    -- Verificar se mudou de fazenda/mês (novo destino também pode estar fechado)
    IF (OLD.fazenda_id IS DISTINCT FROM NEW.fazenda_id)
       OR (OLD.ano_mes IS DISTINCT FROM NEW.ano_mes) THEN
      -- Verificar o novo mês/fazenda
      _status_json := get_status_pilares_fechamento(NEW.fazenda_id, NEW.ano_mes);
      _p1_status := _status_json->'p1_mapa_pastos'->>'status';
      IF _p1_status = 'oficial' THEN
        RAISE EXCEPTION 'O mês destino % também está fechado no Mapa de Pastos (P1 oficial).', NEW.ano_mes;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_lancamento_mes_fechado_p1
  BEFORE INSERT OR UPDATE OR DELETE ON lancamentos
  FOR EACH ROW
  EXECUTE FUNCTION guard_lancamento_mes_fechado_p1();

-- ============================================================
-- 5. Recriar reabrir_pilar_fechamento com cascata corrigida
-- ============================================================
CREATE OR REPLACE FUNCTION public.reabrir_pilar_fechamento(
  _fazenda_id uuid,
  _ano_mes text,
  _pilar text,
  _motivo text DEFAULT NULL,
  _usuario_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cliente_id uuid;
  _pilares_invalidados text[] := ARRAY[]::text[];
  _pilares_reabertos text[] := ARRAY[]::text[];
  _p2_existia boolean := false;
  _p4_existia boolean := false;
BEGIN
  -- Buscar cliente_id
  SELECT cliente_id INTO _cliente_id
  FROM fazendas WHERE id = _fazenda_id;

  IF _cliente_id IS NULL THEN
    RAISE EXCEPTION 'Fazenda não encontrada: %', _fazenda_id;
  END IF;

  -- ========== Reabertura do P1 ==========
  IF _pilar = 'p1_mapa_pastos' THEN
    -- Reabrir pastos fechados
    UPDATE fechamento_pastos
    SET status = 'reaberto', updated_at = now()
    WHERE fazenda_id = _fazenda_id
      AND ano_mes = _ano_mes
      AND status = 'fechado';

    _pilares_reabertos := array_append(_pilares_reabertos, 'p1_mapa_pastos');

    -- Cascata P2: invalidar se existia fechado
    SELECT EXISTS(
      SELECT 1 FROM valor_rebanho_fechamento
      WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado'
    ) INTO _p2_existia;

    IF _p2_existia THEN
      UPDATE valor_rebanho_fechamento
      SET status = 'reaberto', reaberto_em = now(), reaberto_por = _usuario_id, updated_at = now()
      WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado';
      _pilares_reabertos := array_append(_pilares_reabertos, 'p2_valor_rebanho');
    ELSE
      _pilares_invalidados := array_append(_pilares_invalidados, 'p2_valor_rebanho');
    END IF;

    -- Cascata P4: invalidar se existia fechado
    SELECT EXISTS(
      SELECT 1 FROM competencia_fechamento
      WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado'
    ) INTO _p4_existia;

    IF _p4_existia THEN
      UPDATE competencia_fechamento
      SET status = 'reaberto', reaberto_em = now(), reaberto_por = _usuario_id, updated_at = now()
      WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado';
      _pilares_reabertos := array_append(_pilares_reabertos, 'p4_competencia');
    ELSE
      _pilares_invalidados := array_append(_pilares_invalidados, 'p4_competencia');
    END IF;

    -- P5 sempre invalidado logicamente (é derivado)
    _pilares_invalidados := array_append(_pilares_invalidados, 'p5_economico_consolidado');

  -- ========== Reabertura do P2 ==========
  ELSIF _pilar = 'p2_valor_rebanho' THEN
    UPDATE valor_rebanho_fechamento
    SET status = 'reaberto', reaberto_em = now(), reaberto_por = _usuario_id, updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado';

    _pilares_reabertos := array_append(_pilares_reabertos, 'p2_valor_rebanho');
    _pilares_invalidados := array_append(_pilares_invalidados, 'p5_economico_consolidado');

  -- ========== Reabertura do P3 ==========
  ELSIF _pilar = 'p3_financeiro_caixa' THEN
    UPDATE financeiro_fechamentos
    SET status_fechamento = 'reaberto', reaberto_em = now(), reaberto_por = _usuario_id, updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status_fechamento = 'fechado';

    _pilares_reabertos := array_append(_pilares_reabertos, 'p3_financeiro_caixa');
    _pilares_invalidados := array_append(_pilares_invalidados, 'p5_economico_consolidado');

  -- ========== Reabertura do P4 ==========
  ELSIF _pilar = 'p4_competencia' THEN
    UPDATE competencia_fechamento
    SET status = 'reaberto', reaberto_em = now(), reaberto_por = _usuario_id, updated_at = now()
    WHERE fazenda_id = _fazenda_id AND ano_mes = _ano_mes AND status = 'fechado';

    _pilares_reabertos := array_append(_pilares_reabertos, 'p4_competencia');
    _pilares_invalidados := array_append(_pilares_invalidados, 'p5_economico_consolidado');

  ELSE
    RAISE EXCEPTION 'Pilar desconhecido: %', _pilar;
  END IF;

  -- Log de auditoria
  INSERT INTO fechamento_reaberturas_log (
    fazenda_id, cliente_id, ano_mes, pilar, acao, motivo,
    pilares_invalidados, usuario_id
  ) VALUES (
    _fazenda_id, _cliente_id, _ano_mes, _pilar, 'reabertura', _motivo,
    _pilares_reabertos || _pilares_invalidados, _usuario_id
  );

  RETURN jsonb_build_object(
    'sucesso', true,
    'pilar_reaberto', _pilar,
    'pilares_efetivamente_reabertos', to_jsonb(_pilares_reabertos),
    'pilares_logicamente_invalidados', to_jsonb(_pilares_invalidados)
  );
END;
$$;
