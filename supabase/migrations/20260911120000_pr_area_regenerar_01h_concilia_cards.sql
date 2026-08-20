-- PR-AREA-REGENERAR-01H — a regeneracao resolve o estado hibrido do mes.
--
-- O PROBLEMA. Quando a vigencia de um pasto muda para tras, ele passa a pertencer a
-- meses que ja estavam fechados. O mes fica HIBRIDO: fechado para os pastos que ja
-- tinham card, pendente para os que passaram a ser aplicaveis. E era esse estado que
-- impedia regenerar — a operacao que o resolveria.
--
-- Medido na Faz. Sta. Rita, jan/2020: 67 pastos aplicaveis, 65 com card. Sem card,
-- exatamente P_24 Reserva (212,00 ha) e P_25 Reserva (128,00 ha) — os 340 ha que
-- separam a reserva 400,12 da 740,12 que se espera.
--
-- A CONCILIACAO, em tres regras:
--   (1) aplicavel sem card -> cria card 'fechado' e VAZIO. A area nao depende de
--       rebanho; vazio e o estado honesto: o pasto existia, nao tinha gado lancado.
--   (2) card aberto e sem itens -> fecha. Card vazio aberto nao carrega informacao;
--       deixa-lo aberto so perpetua o hibrido.
--   (3) card aberto COM itens -> nao toca e ABORTA com cards_abertos_com_dados.
--       Ha dado lancado e alguem podia estar editando; fechar por conta propria
--       destruiria trabalho em curso.
-- A regra (3) e checada ANTES da (2): abortar depois de fechar metade seria o mesmo
-- resultado (a transacao volta), mas a leitura do codigo fica pior.
--
-- REUSO, NAO INSERT PARALELO. A criacao usa fn_obter_ou_criar_fechamentos_lote, que ja
-- conhece as colunas obrigatorias, o default de tipo_uso_mes (= pastos.tipo_uso), o
-- ON CONFLICT (fazenda_id, pasto_id, ano_mes) e a defesa de concorrencia com duas
-- tentativas. Ela aceita p_status_inicial='fechado' e e idempotente, entao passar a
-- lista inteira de aplicaveis e seguro — cria so o que falta.
-- Ela RECUSA array vazio ('pasto_ids_vazio'), entao a chamada so acontece quando ha
-- card faltando. Mes sem nenhum pasto aplicavel passa reto por aqui e vai morrer mais
-- adiante em area_produtiva_derivada_zero, que e o erro certo para esse caso.
--
-- OS CINCO TRIGGERS DE fechamento_pastos — o briefing citava um; sao cinco, e dois
-- fazem mais do que invalidar. Ver o relatorio do PR. Para esta funcao:
--   - trg_a8a_invalidar_snapshot (AFTER INSERT/DELETE/UPDATE OF status) invalida o
--     snapshot E chama fn_rebaixar_p1_oficial. Inofensivo aqui porque mes oficial ja
--     foi barrado la em cima; e a invalidacao que ele faz e a mesma que esta funcao faz
--     de proposito logo abaixo.
--   - guard_fechamento_pastos_snapshot (BEFORE UPDATE) LEVANTA EXCECAO se o mes tem
--     P2 validado ou fechado. So atinge o passo (2), que e UPDATE; o passo (1) e INSERT
--     e passa. Com 650 meses de P2 fechado na base, mes com card aberto E P2 fechado
--     aborta com a mensagem crua do trigger. Sao 8 meses hoje.
--   - propagar_saldo_inicial_pos_dezembro (AFTER UPDATE) grava saldos_iniciais de
--     janeiro seguinte quando um card de DEZEMBRO passa a fechado e era o ultimo aberto.
--     Nenhum dos meses com card aberto hoje e dezembro, mas o caminho existe.
--
-- fix-forward: 20260907120000, 20260908120000, 20260909120000 e 20260910120000 aplicadas.

CREATE OR REPLACE FUNCTION public.fn_regenerar_area_do_mes(
  p_fazenda_id uuid,
  p_ano_mes    text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_cliente_id     uuid;
  v_ano_mes_date   date;
  v_p1             RECORD;
  v_area_anterior  jsonb;
  v_area_nova      jsonb;
  v_area_snapshot_id uuid;
  v_ids_aplicaveis uuid[];
  v_cards_criados  int := 0;
  v_cards_fechados int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='nao_autenticado';
  END IF;

  IF p_ano_mes IS NULL OR p_ano_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='ano_mes_invalido: esperado YYYY-MM (01-12)';
  END IF;

  SELECT cliente_id INTO v_cliente_id FROM public.fazendas WHERE id=p_fazenda_id;
  IF v_cliente_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='fazenda_inexistente';
  END IF;

  IF NOT (public.is_admin_agroinblue(v_uid)
    OR EXISTS (SELECT 1 FROM public.get_user_cliente_ids(v_uid) AS t(cliente_id) WHERE t.cliente_id=v_cliente_id)) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sem_permissao';
  END IF;

  PERFORM public.fn_lock_p1(p_fazenda_id, p_ano_mes);
  v_ano_mes_date := to_date(p_ano_mes || '-01', 'YYYY-MM-DD');

  SELECT * INTO v_p1 FROM public.fechamento_p1
   WHERE fazenda_id=p_fazenda_id AND ano_mes=p_ano_mes;

  IF v_p1.id IS NOT NULL AND v_p1.status='oficial' THEN
    RAISE EXCEPTION USING ERRCODE='P0001',
      MESSAGE='mes_oficializado: reabra formalmente antes de regenerar';
  END IF;

  -- Prova do que foi substituido. A linha some do banco; sem isto a regeneracao
  -- seria irreversivel e silenciosa sobre o proprio numero que ela troca.
  SELECT to_jsonb(a) INTO v_area_anterior
    FROM public.fechamento_area_snapshot a
   WHERE a.fazenda_id=p_fazenda_id AND a.ano_mes=v_ano_mes_date;

  DELETE FROM public.fechamento_area_snapshot
   WHERE fazenda_id=p_fazenda_id AND ano_mes=v_ano_mes_date;

  -- ── CONCILIACAO DOS CARDS DO MES ──
  SELECT array_agg(a.pasto_id) INTO v_ids_aplicaveis
    FROM public.fn_pastos_aplicaveis_mes(p_fazenda_id, p_ano_mes) a;

  IF v_ids_aplicaveis IS NOT NULL AND array_length(v_ids_aplicaveis, 1) > 0 THEN
    SELECT count(*) INTO v_cards_criados
      FROM unnest(v_ids_aplicaveis) u(id)
     WHERE NOT EXISTS (SELECT 1 FROM public.fechamento_pastos fp
                        WHERE fp.fazenda_id = p_fazenda_id
                          AND fp.ano_mes    = p_ano_mes
                          AND fp.pasto_id   = u.id);

    -- (1) So chama havendo o que criar: a funcao recusa array vazio e cobrar dela um
    -- no-op custaria as duas passadas da defesa de concorrencia a toa.
    IF v_cards_criados > 0 THEN
      PERFORM public.fn_obter_ou_criar_fechamentos_lote(
        p_fazenda_id, v_ids_aplicaveis, p_ano_mes, 'fechado', NULL);
    END IF;
  END IF;

  -- (3) antes da (2): card aberto COM dados e trabalho de alguem, nao residuo.
  IF EXISTS (
    SELECT 1 FROM public.fechamento_pastos fp
     WHERE fp.fazenda_id = p_fazenda_id
       AND fp.ano_mes    = p_ano_mes
       AND fp.status    <> 'fechado'
       AND EXISTS (SELECT 1 FROM public.fechamento_pasto_itens i WHERE i.fechamento_id = fp.id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',
      MESSAGE='cards_abertos_com_dados: feche o mes manualmente antes de regenerar';
  END IF;

  -- (2) card aberto e vazio: fecha.
  UPDATE public.fechamento_pastos fp
     SET status = 'fechado'
   WHERE fp.fazenda_id = p_fazenda_id
     AND fp.ano_mes    = p_ano_mes
     AND fp.status    <> 'fechado'
     AND NOT EXISTS (SELECT 1 FROM public.fechamento_pasto_itens i WHERE i.fechamento_id = fp.id);
  GET DIAGNOSTICS v_cards_fechados = ROW_COUNT;

  -- Invalida o conjunto vigente para FORCAR a rematerializacao logo abaixo. Sem isto,
  -- gerar_snapshot_area reaproveita os membros antigos e a mudanca de vigencia nao chega
  -- na area.
  UPDATE public.fechamento_p1_snapshot
     SET status = 'invalidado'::public.snapshot_status,
         invalidado_em = now(),
         motivo_invalidacao = 'regeneracao_area'
   WHERE fazenda_id = p_fazenda_id
     AND ano_mes = p_ano_mes
     AND status = 'vigente'::public.snapshot_status;

  -- Sem vigente, materializa dos pastos aplicaveis de hoje e so entao gera a area.
  v_area_snapshot_id := public.gerar_snapshot_area(p_fazenda_id, v_ano_mes_date, v_uid);

  -- Simetrico do area_anterior: a linha que ficou no lugar da que foi apagada.
  SELECT to_jsonb(a) INTO v_area_nova
    FROM public.fechamento_area_snapshot a
   WHERE a.fazenda_id=p_fazenda_id AND a.ano_mes=v_ano_mes_date;

  RETURN jsonb_build_object(
    'regenerado',      true,
    'fazenda_id',      p_fazenda_id,
    'ano_mes',         p_ano_mes,
    'area_anterior',   v_area_anterior,
    'area_nova',       v_area_nova,
    'area_snapshot_id', v_area_snapshot_id,
    'cards_criados',   v_cards_criados,
    'cards_fechados',  v_cards_fechados,
    'regenerado_por',  v_uid,
    'regenerado_em',   now());
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_regenerar_area_do_mes(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_regenerar_area_do_mes(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_regenerar_area_do_mes(uuid, text) TO authenticated;
