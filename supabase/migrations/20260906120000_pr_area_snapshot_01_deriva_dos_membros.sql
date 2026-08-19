-- PR-AREA-SNAPSHOT-01 — fn_gerar_area_de_snapshot deriva dos pastos congelados.
--
-- INVERSAO DA FONTE. Ate aqui a funcao lia as seis colunas digitadas em
-- fazenda_cadastros e fotografava aquilo. Consequencias medidas em runtime:
--   - Faz. Sta. Luzia fechava com area_pecuaria_ha = 852,62 sem um unico pasto
--     pecuario desde julho/2023 — era o numero digitado no cadastro;
--   - o eucalipto ia para area_agricultura_ha, e como o PainelConsultorTab monta
--     SILVICULTURA a partir dos pastos ao vivo, o mesmo hectare aparecia duas vezes;
--   - e as seis colunas do cadastro nao sao editaveis por tela nenhuma desde 77cec994.
--
-- A fonte passa a ser fechamento_pastos_membros: a fotografia daquele fechamento.
-- NAO consultar pastos ao vivo nem fn_pastos_aplicaveis_mes — o snapshot deve
-- refletir o conjunto materializado, nao o estado atual do cadastro.
--
-- tipo_uso_mes E SOBERANO sobre tipo_uso: os membros congelam o tipo CADASTRAL, e o
-- uso OPERACIONAL do mes esta em fechamento_pastos.tipo_uso_mes. Classificacao =
-- COALESCE(fp.tipo_uso_mes, m.tipo_uso).
--
-- coalesce(sum(...) FILTER (...), 0) em CADA parcela: sum com FILTER devolve NULL
-- quando nenhuma linha casa, e NULL + x = NULL. Sem o coalesce, area_produtiva_ha
-- sairia NULL em toda fazenda sem alguma das tres familias produtivas.
--
-- area_total_ha continua vindo de fazenda_cadastros: e a area da MATRICULA,
-- documento digitado, sem correspondente nos pastos. Terceira referencia do sistema;
-- divergir da soma dos pastos e informacao permanente, nao erro.
--
-- PROTECAO PR1 INTACTA: mes ja fotografado e PRESERVADO. ON CONFLICT DO NOTHING,
-- nunca DO UPDATE. Este PR muda DE ONDE vem a foto, nao a regra de imutabilidade —
-- os meses ja fechados seguem exatamente como estao. Regeneracao historica e frente
-- propria.
--
-- Assinatura, RETURNS, LANGUAGE, SECURITY DEFINER, search_path, checagens de auth e
-- permissao, fn_lock_p1, revalidacao de vigencia e o bloco final de contagem:
-- preservados verbatim.

CREATE OR REPLACE FUNCTION public.fn_gerar_area_de_snapshot(p_fechamento_p1_snapshot_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  s RECORD;
  v_ano_mes_date date;
  v_area_id uuid;
  v_prod numeric; v_pec numeric; v_agric numeric; v_silv numeric; v_total numeric;
  v_reserva numeric; v_app numeric; v_benf numeric; v_outras numeric;
  v_membros int; v_sem_card int; v_nao_fechados int; v_apto boolean;
  v_preservada boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='nao_autenticado';
  END IF;

  SELECT id, fechamento_p1_id, fazenda_id, cliente_id, ano_mes, status
    INTO s FROM public.fechamento_p1_snapshot WHERE id=p_fechamento_p1_snapshot_id;
  IF s.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='snapshot_inexistente';
  END IF;

  IF NOT (public.is_admin_agroinblue(v_uid)
    OR EXISTS (SELECT 1 FROM public.get_user_cliente_ids(v_uid) AS t(cliente_id) WHERE t.cliente_id=s.cliente_id)) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem_permissao';
  END IF;

  PERFORM public.fn_lock_p1(s.fazenda_id, s.ano_mes);
  SELECT status INTO s.status FROM public.fechamento_p1_snapshot WHERE id=s.id;
  IF s.status <> 'vigente'::public.snapshot_status THEN
    RAISE EXCEPTION USING ERRCODE='P0001',
      MESSAGE='snapshot_nao_vigente: snapshot deixou de ser vigente (invalidado/substituido) antes da geracao da area';
  END IF;

  v_ano_mes_date := to_date(s.ano_mes || '-01', 'YYYY-MM-DD');

  -- PROTECAO PR1: se ja existe area para fazenda+mes, PRESERVAR (nao recalcula,
  -- nao sobrescreve, nao versiona). Sob fn_lock_p1, checagem+INSERT serializados.
  SELECT id INTO v_area_id
    FROM public.fechamento_area_snapshot
   WHERE fazenda_id = s.fazenda_id AND ano_mes = v_ano_mes_date;

  IF v_area_id IS NOT NULL THEN
    v_preservada := true;
  ELSE
    -- Reparticao DERIVADA dos membros congelados deste snapshot.
    -- 'divergencia' fica de fora de toda soma: e pasto de controle de contagem,
    -- nao area. Somente membros com entra_conciliacao = true.
    SELECT
      coalesce(sum(coalesce(m.area_considerada_ha,0)) FILTER (
        WHERE COALESCE(fp.tipo_uso_mes, m.tipo_uso) IN ('cria','recria','engorda','vedado','reforma_pecuaria')), 0),
      coalesce(sum(coalesce(m.area_considerada_ha,0)) FILTER (
        WHERE COALESCE(fp.tipo_uso_mes, m.tipo_uso) = 'agricultura'), 0),
      coalesce(sum(coalesce(m.area_considerada_ha,0)) FILTER (
        WHERE COALESCE(fp.tipo_uso_mes, m.tipo_uso) = 'eucalipto'), 0),
      coalesce(sum(coalesce(m.area_considerada_ha,0)) FILTER (
        WHERE COALESCE(fp.tipo_uso_mes, m.tipo_uso) = 'reserva'), 0),
      coalesce(sum(coalesce(m.area_considerada_ha,0)) FILTER (
        WHERE COALESCE(fp.tipo_uso_mes, m.tipo_uso) = 'app'), 0),
      coalesce(sum(coalesce(m.area_considerada_ha,0)) FILTER (
        WHERE COALESCE(fp.tipo_uso_mes, m.tipo_uso) = 'benfeitorias'), 0),
      coalesce(sum(coalesce(m.area_considerada_ha,0)) FILTER (
        WHERE COALESCE(fp.tipo_uso_mes, m.tipo_uso) NOT IN (
          'cria','recria','engorda','vedado','reforma_pecuaria',
          'agricultura','eucalipto','reserva','app','benfeitorias')), 0)
      INTO v_pec, v_agric, v_silv, v_reserva, v_app, v_benf, v_outras
      FROM public.fechamento_pastos_membros m
      LEFT JOIN public.fechamento_pastos fp ON fp.id = m.fechamento_pasto_id
     WHERE m.snapshot_id = s.id
       AND m.entra_conciliacao = true
       AND COALESCE(fp.tipo_uso_mes, m.tipo_uso) IS DISTINCT FROM 'divergencia';

    -- Produtiva = pecuaria + agricultura + silvicultura. Ambiental e infraestrutura
    -- ficam FORA: produtiva e a area que gera receita (decisao de produto, 19/08/2026).
    v_prod := v_pec + v_agric + v_silv;

    -- A CHECK area_produtiva_positiva rejeitaria com erro generico de constraint.
    -- Levantar antes, com mensagem propria. Area produtiva zero nao deve virar
    -- denominador de indicador por hectare, e o erro explicito e melhor que o zero
    -- silencioso — uma fazenda so-ambiental cai aqui, por desenho.
    IF v_prod IS NULL OR v_prod <= 0 THEN
      RAISE EXCEPTION USING ERRCODE='P0002',
        MESSAGE='area_produtiva_derivada_zero: nenhum pasto de pecuaria, agricultura ou silvicultura no conjunto do mes';
    END IF;

    -- area_total_ha e a MATRICULA, digitada. Nao derivavel dos pastos.
    SELECT area_total_ha INTO v_total
      FROM public.fazenda_cadastros
     WHERE fazenda_id=s.fazenda_id AND cliente_id=s.cliente_id;

    INSERT INTO public.fechamento_area_snapshot (
      cliente_id, fazenda_id, ano_mes,
      area_total_ha, area_produtiva_ha, area_pecuaria_ha, area_agricultura_ha,
      area_silvicultura_ha, area_reserva_ha, area_app_ha, area_benfeitorias_ha, area_outras_ha,
      origem_area, versao, fechado_em, fechado_por, fechamento_p1_snapshot_id, schema_version)
    VALUES (
      s.cliente_id, s.fazenda_id, v_ano_mes_date,
      v_total,
      v_prod, v_pec, v_agric, v_silv, v_reserva, v_app, v_benf, v_outras,
      'fechamento_p1', 1, now(), v_uid, s.id, 1)
    ON CONFLICT (fazenda_id, ano_mes) DO NOTHING
    RETURNING id INTO v_area_id;

    IF v_area_id IS NULL THEN
      v_preservada := true;
      SELECT id INTO v_area_id
        FROM public.fechamento_area_snapshot
       WHERE fazenda_id = s.fazenda_id AND ano_mes = v_ano_mes_date;
    END IF;
  END IF;

  SELECT count(*)::int,
         count(*) FILTER (WHERE fechamento_pasto_id IS NULL)::int,
         count(*) FILTER (WHERE card_fechado=false)::int
    INTO v_membros, v_sem_card, v_nao_fechados
    FROM public.fechamento_pastos_membros WHERE snapshot_id=s.id;
  v_apto := (v_sem_card=0 AND v_nao_fechados=0);

  RETURN jsonb_build_object(
    'area_snapshot_id', v_area_id,
    'fechamento_p1_snapshot_id', s.id,
    'area_preservada', v_preservada,
    'membros_count', v_membros,
    'membros_sem_card', v_sem_card,
    'membros_nao_fechados', v_nao_fechados,
    'apto_para_oficializacao', v_apto);
END $function$;

COMMENT ON FUNCTION public.fn_gerar_area_de_snapshot(uuid) IS
  'INTERNA (sem grant). Gera a area do snapshot de conjunto. PR-AREA-SNAPSHOT-01: a reparticao DERIVA de fechamento_pastos_membros (fotografia do fechamento), classificando por COALESCE(fechamento_pastos.tipo_uso_mes, membros.tipo_uso) — tipo_uso_mes e soberano. Produtiva = pecuaria + agricultura + silvicultura; ambiental e infraestrutura ficam fora. area_total_ha continua vindo de fazenda_cadastros: e a MATRICULA, digitada. PR1 preservado: mes ja fotografado nao e recalculado (ON CONFLICT DO NOTHING, nunca DO UPDATE).';
