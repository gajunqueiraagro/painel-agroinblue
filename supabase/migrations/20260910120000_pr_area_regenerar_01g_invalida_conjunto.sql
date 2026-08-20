-- PR-AREA-REGENERAR-01G — regenerar REFAZ o conjunto, nao reaproveita.
--
-- BUG MEDIDO EM RUNTIME. gerar_snapshot_area so materializa QUANDO NAO HA snapshot
-- vigente. Havendo, ela reaproveita o conjunto existente e gera a area a partir dos
-- membros congelados antigos — que sao a fotografia do cadastro de OUTRO dia.
--
-- Efeito: mudar a vigencia de um pasto e regenerar nao surtia efeito nos meses que ja
-- tinham conjunto. Na Faz. Sta. Rita, P_24 Reserva (212 ha) e P_25 Reserva (128 ha)
-- tiveram data_inicio removida para valer desde 2020; fn_pastos_aplicaveis_mes ja as
-- devolve em '2020-01' (67 aplicaveis, as duas incluidas), mas regenerar jan/2020
-- continuava produzindo reserva 400,12 em vez de 740,12. Os cards das duas so existem
-- em mai, jun e jul/2026 — tres meses de 79.
--
-- A REGRA QUE FALTAVA: mudou a vigencia de um pasto, o conjunto daquele mes precisa ser
-- REFEITO. Regenerar area e reprocessar, nao recalcular sobre conjunto velho.
--
-- O passo novo invalida o snapshot vigente antes de chamar gerar_snapshot_area. Sem
-- vigente, ela cai no ramo de fn_materializar_conjunto_mes e o conjunto nasce dos pastos
-- aplicaveis de HOJE.
--
-- O SNAPSHOT ANTIGO NAO E APAGADO. Fica com status 'invalidado', invalidado_em e
-- motivo_invalidacao='regeneracao_area', e os membros congelados dele permanecem
-- (fechamento_pastos_membros so cai por ON DELETE CASCADE, e nada e deletado aqui). O
-- rastro fica inteiro; o que muda e que aqueles membros deixam de ser a referencia do mes.
--
-- O CUSTO, DITO POR EXTENSO: o conjunto novo sai do cadastro de HOJE, com a vigencia de
-- hoje. Regenerar jan/2020 reconstroi o que o cadastro ATUAL diz que valia em jan/2020 —
-- nao o que foi materializado na epoca. Para a reconstrucao em curso isso e exatamente o
-- que se quer, porque a epoca e que estava errada. Mas e uma escolha, nao um detalhe.
--
-- ux_fp1snap_vigente e UNIQUE parcial em (fechamento_p1_id) WHERE status='vigente':
-- invalidar ANTES de materializar e o que mantem o indice satisfeito quando a nova linha
-- vigente entra.
--
-- O BLOQUEIO DE MES OFICIALIZADO PERMANECE, e agora pesa mais: mes selado nao pode ter
-- o conjunto invalidado por baixo do selo.
--
-- fix-forward: 20260907120000, 20260908120000 e 20260909120000 ja aplicadas.

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
    'regenerado_por',  v_uid,
    'regenerado_em',   now());
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_regenerar_area_do_mes(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_regenerar_area_do_mes(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_regenerar_area_do_mes(uuid, text) TO authenticated;
