-- PR-AREA-REGENERAR-01D — regenerar materializa o conjunto quando nao existe.
--
-- O 01A/01C exigiam snapshot P1 vigente e abortavam com 'conjunto_nao_vigente'. Isso
-- limitava o botao a meses que ja passaram por materializacao — e fechamento_p1_snapshot
-- e tabela RECENTE: o registro mais antigo e de julho/2026. As fazendas fechadas antes
-- disso tem area e nao tem snapshot (Sta. Tereza 79 meses de area contra 3 snapshots,
-- Sto. Expedito 79 contra 7, Sta. Rita 79 contra 4, Monterrey 67 contra 5).
--
-- Ou seja: a funcao servia para tudo, menos para a PRIMEIRA passagem — que e onde
-- estao os ~500 meses a reconstruir.
--
-- A guarda sai e a chamada passa a ser gerar_snapshot_area(uuid, date, uuid), a mesma
-- que a tela ja usa no fechamento. Ela resolve o caso ausente inteiro: procura snapshot
-- vigente, nao achando chama fn_materializar_conjunto_mes, confere que o snapshot criado
-- PERMANECEU vigente, e so entao chama fn_gerar_area_de_snapshot. Achando, usa o que ja
-- existe — entao para mes ja materializado o comportamento nao muda.
--
-- p_ano_mes dela e DATE, nao text: v_ano_mes_date, que ja existia aqui. E p_fechado_por
-- tem que ser igual a auth.uid() ou NULL, senao ela levanta 'autoria_invalida' — vai
-- v_uid, que e o proprio auth.uid() lido no topo.
--
-- `resultado` SAI do retorno e entra `area_snapshot_id`. gerar_snapshot_area devolve
-- uuid, nao o jsonb de diagnostico que fn_gerar_area_de_snapshot devolvia; manter o nome
-- `resultado` com conteudo de outro formato seria pior que trocar. O front do 01B le so
-- area_anterior e area_nova, entao a troca nao quebra a tela.
--
-- O BLOQUEIO DE MES OFICIALIZADO PERMANECE. Materializar nao afrouxa selo.
--
-- fn_lock_p1 e pg_advisory_xact_lock, reentrante: este lock, o de gerar_snapshot_area e
-- o de fn_materializar_conjunto_mes convivem na mesma transacao.
--
-- SEM AREA ORFA. Nao ha bloco EXCEPTION em nenhum ponto desta cadeia: se qualquer coisa
-- falhar depois do DELETE, a excecao sobe e a transacao inteira aborta — o DELETE volta
-- e o mes fica com a area que tinha. O mes so perde a linha antiga se ganhar a nova.
--
-- fix-forward: 20260907120000 e 20260908120000 ja aplicadas, nao se editam.

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

  -- Materializa o conjunto se ainda nao houver, e so entao gera a area.
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
