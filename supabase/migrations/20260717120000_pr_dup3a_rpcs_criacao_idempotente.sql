-- ============================================================
-- DUP-3A: RPCs idempotentes de criacao/obtencao de cards mensais
-- SECURITY DEFINER: justificado pela CENTRALIZACAO SOBERANA da autorizacao
-- multi-tenant nas funcoes (padrao do projeto), independente do estado
-- atual das policies RLS. search_path = pg_catalog, public; objetos
-- public.* sempre qualificados. Fluxo normal em READ COMMITTED.
-- ============================================================

-- ---------- RPC 1: single ----------
CREATE OR REPLACE FUNCTION public.fn_obter_ou_criar_fechamento_pasto(
  p_fazenda_id       uuid,
  p_pasto_id         uuid,
  p_ano_mes          text,
  p_status_inicial   text DEFAULT 'aberto',
  p_tipo_uso_mes     text DEFAULT NULL,
  p_responsavel_nome text DEFAULT NULL
) RETURNS public.fechamento_pastos
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_cli  uuid;
  v_card public.fechamento_pastos;
  v_i    int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='nao_autenticado'; END IF;
  IF p_ano_mes IS NULL OR p_ano_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='competencia_invalida: YYYY-MM'; END IF;
  IF p_status_inicial IS NULL OR p_status_inicial NOT IN ('aberto','rascunho','fechado') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='status_inicial_invalido: aberto|rascunho|fechado'; END IF;

  SELECT f.cliente_id INTO v_cli FROM public.fazendas AS f WHERE f.id = p_fazenda_id;
  IF v_cli IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='fazenda_inexistente'; END IF;
  IF NOT (public.is_admin_agroinblue(v_uid)
      OR EXISTS (SELECT 1 FROM public.get_user_cliente_ids(v_uid) AS t(cliente_id)
                 WHERE t.cliente_id = v_cli)) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem_permissao'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pastos AS p
                 WHERE p.id = p_pasto_id AND p.fazenda_id = p_fazenda_id) THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='pasto_inexistente_ou_de_outra_fazenda'; END IF;

  -- Loop defensivo: INSERT -> SELECT -> repetir UMA vez -> erro deterministico.
  FOR v_i IN 1..2 LOOP
    INSERT INTO public.fechamento_pastos
      (pasto_id, fazenda_id, cliente_id, ano_mes, status, tipo_uso_mes, responsavel_nome)
    VALUES
      (p_pasto_id, p_fazenda_id, v_cli, p_ano_mes, p_status_inicial, p_tipo_uso_mes, p_responsavel_nome)
    ON CONFLICT (fazenda_id, pasto_id, ano_mes) DO NOTHING
    RETURNING * INTO v_card;

    IF v_card.id IS NOT NULL THEN RETURN v_card; END IF;   -- criado agora

    SELECT fp.* INTO v_card FROM public.fechamento_pastos AS fp
    WHERE fp.fazenda_id = p_fazenda_id AND fp.pasto_id = p_pasto_id AND fp.ano_mes = p_ano_mes;

    IF v_card.id IS NOT NULL THEN RETURN v_card; END IF;   -- existente (INALTERADO)
  END LOOP;

  RAISE EXCEPTION USING ERRCODE='40001',
    MESSAGE='falha_concorrencia_irrecuperavel: card nem criado nem encontrado apos 2 tentativas';
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_obter_ou_criar_fechamento_pasto(uuid,uuid,text,text,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_obter_ou_criar_fechamento_pasto(uuid,uuid,text,text,text,text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_obter_ou_criar_fechamento_pasto(uuid,uuid,text,text,text,text) TO authenticated;
COMMENT ON FUNCTION public.fn_obter_ou_criar_fechamento_pasto(uuid,uuid,text,text,text,text) IS
 'DUP-3A: cria ou obtem o card unico (fazenda,pasto,ano_mes). ON CONFLICT DO NOTHING (nunca DO UPDATE: obter nao dispara triggers de UPDATE). cliente_id derivado do banco. Loop defensivo 2x -> 40001. Invariante "criacao so pela RPC" vale apos DUP-3B.';

-- ---------- RPC 2: lote ----------
CREATE OR REPLACE FUNCTION public.fn_obter_ou_criar_fechamentos_lote(
  p_fazenda_id       uuid,
  p_pasto_ids        uuid[],
  p_ano_mes          text,
  p_status_inicial   text DEFAULT 'fechado',
  p_responsavel_nome text DEFAULT NULL
) RETURNS SETOF public.fechamento_pastos
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_cli       uuid;
  v_ids       uuid[];
  v_n_validos int;
  v_n_cards   int;
  v_i         int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='nao_autenticado'; END IF;
  IF p_ano_mes IS NULL OR p_ano_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='competencia_invalida: YYYY-MM'; END IF;
  IF p_status_inicial IS NULL OR p_status_inicial NOT IN ('aberto','rascunho','fechado') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='status_inicial_invalido'; END IF;

  -- Array: NULL/vazio/elemento NULL -> erro; deduplicar
  IF p_pasto_ids IS NULL OR array_length(p_pasto_ids,1) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='pasto_ids_vazio'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_pasto_ids) u(id) WHERE u.id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='pasto_ids_contem_null'; END IF;
  SELECT array_agg(DISTINCT u.id) INTO v_ids FROM unnest(p_pasto_ids) u(id);

  SELECT f.cliente_id INTO v_cli FROM public.fazendas AS f WHERE f.id = p_fazenda_id;
  IF v_cli IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='fazenda_inexistente'; END IF;
  IF NOT (public.is_admin_agroinblue(v_uid)
      OR EXISTS (SELECT 1 FROM public.get_user_cliente_ids(v_uid) AS t(cliente_id)
                 WHERE t.cliente_id = v_cli)) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem_permissao'; END IF;

  -- TODOS os pastos devem existir E pertencer a fazenda: proibido sucesso parcial
  SELECT count(*) INTO v_n_validos FROM public.pastos AS p
  WHERE p.id = ANY(v_ids) AND p.fazenda_id = p_fazenda_id;
  IF v_n_validos <> array_length(v_ids,1) THEN
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE=format('pastos_invalidos: %s de %s nao existem ou sao de outra fazenda',
                     array_length(v_ids,1)-v_n_validos, array_length(v_ids,1));
  END IF;

  -- Defesa pos-conflito (mesma da single, em modo conjunto):
  -- INSERT -> validar cardinalidade -> repetir UMA vez -> 40001.
  FOR v_i IN 1..2 LOOP
    INSERT INTO public.fechamento_pastos
      (pasto_id, fazenda_id, cliente_id, ano_mes, status, tipo_uso_mes, responsavel_nome)
    SELECT p.id, p_fazenda_id, v_cli, p_ano_mes, p_status_inicial, p.tipo_uso, p_responsavel_nome
    FROM public.pastos AS p
    WHERE p.id = ANY(v_ids)
    ON CONFLICT (fazenda_id, pasto_id, ano_mes) DO NOTHING;

    SELECT count(*) INTO v_n_cards
    FROM public.fechamento_pastos AS fp
    WHERE fp.fazenda_id = p_fazenda_id
      AND fp.ano_mes = p_ano_mes
      AND fp.pasto_id = ANY(v_ids);

    IF v_n_cards = array_length(v_ids,1) THEN
      -- exatamente 1 card por pasto distinto solicitado; SEM promessa de ordem
      RETURN QUERY
        SELECT fp.* FROM public.fechamento_pastos AS fp
        WHERE fp.fazenda_id = p_fazenda_id
          AND fp.ano_mes = p_ano_mes
          AND fp.pasto_id = ANY(v_ids);
      RETURN;
    END IF;
  END LOOP;

  RAISE EXCEPTION USING ERRCODE='40001',
    MESSAGE='falha_concorrencia_irrecuperavel_lote: quantidade de cards inferior aos pastos solicitados apos 2 tentativas';
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_obter_ou_criar_fechamentos_lote(uuid,uuid[],text,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_obter_ou_criar_fechamentos_lote(uuid,uuid[],text,text,text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_obter_ou_criar_fechamentos_lote(uuid,uuid[],text,text,text) TO authenticated;
COMMENT ON FUNCTION public.fn_obter_ou_criar_fechamentos_lote(uuid,uuid[],text,text,text) IS
 'DUP-3A lote: valida TODOS os pastos antes (sem sucesso parcial), deduplica ids, INSERT..ON CONFLICT DO NOTHING com defesa pos-conflito (2 tentativas -> 40001), retorna exatamente 1 card por pasto distinto, sem ordem garantida. tipo_uso_mes derivado de pastos.tipo_uso.';
