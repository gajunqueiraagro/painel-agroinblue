-- PR-AREA-REGENERAR-01A — fn_regenerar_area_do_mes.
--
-- POR QUE EXISTE. Regenerar a area de um mes ja fotografado exige hoje DOIS atos, e o
-- primeiro esta fora do alcance do operador:
--   1. apagar a linha de fechamento_area_snapshot por SQL administrativo;
--   2. reabrir e fechar o mes na tela.
-- O passo 1 e inacessivel por desenho: fechamento_area_snapshot so tem policy de
-- SELECT para authenticated, entao o front nao apaga; e a PROTECAO PR1 de
-- fn_gerar_area_de_snapshot preserva o mes ja fotografado (ON CONFLICT DO NOTHING),
-- entao refechar tambem nao regenera. As duas defesas estao CORRETAS — foi assim que
-- o snapshot virou fotografia confiavel. O que faltava era uma porta explicita.
--
-- Foram ~240 meses reconstruidos a mao em 20/08/2026 e restam ~500.
--
-- ESTA FUNCAO E A PORTA, NAO UM BURACO NA PAREDE:
--   - fn_gerar_area_de_snapshot NAO foi alterada. A protecao PR1 dela continua
--     intacta; aqui a linha e apagada ANTES da chamada, entao o ON CONFLICT nem
--     chega a disparar e a funcao percorre o caminho normal de primeira geracao.
--   - nenhuma policy nova e nenhum grant novo em TABELA. Quem alcanca o DELETE e o
--     SECURITY DEFINER (owner postgres, e a tabela nao tem FORCE ROW LEVEL SECURITY).
--     Afrouxar a policy daria a qualquer authenticated o poder de apagar area
--     fechada por caminho nenhum controlado — o oposto do que se quer.
--   - mes OFICIAL nao regenera. Selo se rompe formalmente, com reabertura, nunca
--     por efeito colateral de uma regeneracao.
--
-- fn_lock_p1 usa pg_advisory_xact_lock, que e reentrante na mesma transacao: tomar o
-- lock aqui e tomar de novo dentro de fn_gerar_area_de_snapshot nao trava.
--
-- ano_mes e TEXT 'YYYY-MM' em fechamento_p1 e DATE (dia 1) em
-- fechamento_area_snapshot. A conversao acontece uma vez, em v_ano_mes_date.

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
  v_snap_id        uuid;
  v_area_anterior  jsonb;
  v_resultado      jsonb;
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

  SELECT sn.id INTO v_snap_id
    FROM public.fechamento_p1_snapshot sn
   WHERE sn.fechamento_p1_id = v_p1.id
     AND sn.status = 'vigente'::public.snapshot_status;

  IF v_snap_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='conjunto_nao_vigente: feche o mes antes de regenerar';
  END IF;

  -- Prova do que foi substituido. A linha some do banco; sem isto a regeneracao
  -- seria irreversivel e silenciosa sobre o proprio numero que ela troca.
  SELECT to_jsonb(a) INTO v_area_anterior
    FROM public.fechamento_area_snapshot a
   WHERE a.fazenda_id=p_fazenda_id AND a.ano_mes=v_ano_mes_date;

  DELETE FROM public.fechamento_area_snapshot
   WHERE fazenda_id=p_fazenda_id AND ano_mes=v_ano_mes_date;

  v_resultado := public.fn_gerar_area_de_snapshot(v_snap_id);

  RETURN jsonb_build_object(
    'regenerado',      true,
    'fazenda_id',      p_fazenda_id,
    'ano_mes',         p_ano_mes,
    'area_anterior',   v_area_anterior,
    'resultado',       v_resultado,
    'regenerado_por',  v_uid,
    'regenerado_em',   now());
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_regenerar_area_do_mes(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_regenerar_area_do_mes(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_regenerar_area_do_mes(uuid, text) TO authenticated;
