-- PR-AREA-REGENERAR-01C — fn_regenerar_area_do_mes devolve area_nova.
--
-- O 01A (20260907120000) devolve area_anterior, o to_jsonb da linha antes do DELETE.
-- Faltava o outro lado: `resultado` e o retorno de fn_gerar_area_de_snapshot, e ele
-- NAO carrega valor de area nenhum — so area_snapshot_id, fechamento_p1_snapshot_id,
-- area_preservada, membros_count, membros_sem_card, membros_nao_fechados e
-- apto_para_oficializacao. So o ID da linha nova.
--
-- Sem a area nova a tela nao mostra antes x depois, e o antes x depois E a prova que
-- justifica um botao que apaga uma linha do banco. O operador precisa ver o que
-- mudou — inclusive quando NADA mudou, que tambem e informacao.
--
-- Buscar do lado do front sairia caro e sujo: fechamento_area_snapshot nao esta em
-- src/integrations/supabase/types.ts, entao um .from() ali exigiria (supabase as any)
-- .from, que NAO e a excecao zero-cast do CLAUDE.md — a excecao e so .rpc. O dado sai
-- daqui, onde ja esta na mao.
--
-- FIX-FORWARD. A migration 20260907120000 ja foi aplicada no Proto e nao se edita.
-- Este arquivo e um CREATE OR REPLACE completo: TUDO fora da leitura de area_nova e
-- copia verbatim do 01A — assinatura, os seis erros com os mesmos ERRCODE e MESSAGE,
-- o regex de ano_mes, a permissao, fn_lock_p1, o bloqueio de mes oficializado, o
-- DELETE, a chamada a fn_gerar_area_de_snapshot e os tres grants.
--
-- fn_gerar_area_de_snapshot continua INTOCADA.
--
-- area_nova NULL nao levanta erro: a regeneracao ja aconteceu e a linha ja esta
-- gravada quando esta leitura roda. Falhar aqui derrubaria por causa do relatorio um
-- trabalho que deu certo. NULL diz 'nao consegui ler', que e o que teria acontecido.

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
  v_area_nova      jsonb;
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
    'resultado',       v_resultado,
    'regenerado_por',  v_uid,
    'regenerado_em',   now());
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_regenerar_area_do_mes(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_regenerar_area_do_mes(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_regenerar_area_do_mes(uuid, text) TO authenticated;
