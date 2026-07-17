-- PR-PASTOS-PR1 — Proteção contra recálculo silencioso da área histórica
--
-- DEFEITO COMPROVADO (perícia de imutabilidade)
-- ---------------------------------------------
-- fn_gerar_area_de_snapshot (corpo VIGENTE no Proto) lê fazenda_cadastros VIVO
-- e grava com ON CONFLICT (fazenda_id, ano_mes) DO UPDATE SET area_*=EXCLUDED,
-- versao=versao+1, fechado_em=now(). Como gerar_snapshot_area a chama SEMPRE,
-- qualquer reexecução do fechamento (novo clique, reabertura+refechamento, ou
-- alteracao posterior de fazenda_cadastros) SOBRESCREVE a area historica do mes
-- pelo cadastro atual e incrementa a versao. A fotografia anterior e perdida.
--
-- REGRA DE NEGOCIO APROVADA (PR1)
-- -------------------------------
-- O fechamento NORMAL deve PRESERVAR a area ja existente para fazenda+mes:
--   . primeiro fechamento (sem area do mes): cria a linha com o cadastro vigente;
--   . reexecucao (area do mes ja existe): reutiliza a fotografia — NAO rele
--     fazenda_cadastros, NAO atualiza areas, NAO incrementa versao, NAO muda
--     fechado_em nem fechamento_p1_snapshot_id.
-- O recalculo historico so podera ocorrer por acao explicita "Corrigir cadastro"
-- (UX de PR futuro), governada por rebaixamento/oficializacao — FORA deste PR.
--
-- FIX-FORWARD. CREATE OR REPLACE preservando assinatura, seguranca, lock e
-- revalidacao de vigencia. Nao edita a migration ja aplicada (20260716140300).
-- Nao altera gerar_snapshot_area: a protecao fica no ponto unico de escrita da
-- area. Nao altera dado. Funcao continua VOLATILE (faz INSERT no 1o fechamento).

CREATE OR REPLACE FUNCTION public.fn_gerar_area_de_snapshot(
  p_fechamento_p1_snapshot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  s RECORD;
  v_ano_mes_date date;
  v_area_id uuid;
  v_prod numeric; v_pec numeric; v_agric numeric; v_total numeric;
  v_reserva numeric; v_benf numeric; v_outras numeric;
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
  SELECT status INTO s.status FROM public.fechamento_p1_snapshot WHERE id=s.id;  -- relê sob lock
  IF s.status <> 'vigente'::public.snapshot_status THEN
    RAISE EXCEPTION USING ERRCODE='P0001',
      MESSAGE='snapshot_nao_vigente: snapshot deixou de ser vigente (invalidado/substituido) antes da geracao da area';
  END IF;

  v_ano_mes_date := to_date(s.ano_mes || '-01', 'YYYY-MM-DD');

  -- PROTECAO PR1: se ja existe area para fazenda+mes, PRESERVAR. Nao le cadastro,
  -- nao sobrescreve, nao versiona. Sob fn_lock_p1, a checagem e o INSERT abaixo
  -- sao serializados: sem corrida.
  SELECT id INTO v_area_id
    FROM public.fechamento_area_snapshot
   WHERE fazenda_id = s.fazenda_id AND ano_mes = v_ano_mes_date;

  IF v_area_id IS NOT NULL THEN
    v_preservada := true;
  ELSE
    -- Primeiro fechamento do mes: fotografa o cadastro vigente.
    SELECT area_produtiva_ha, area_pecuaria_ha, area_agricultura_ha, area_total_ha,
           area_reserva_ha, area_benfeitorias_ha, area_outras_ha
      INTO v_prod, v_pec, v_agric, v_total, v_reserva, v_benf, v_outras
      FROM public.fazenda_cadastros
     WHERE fazenda_id=s.fazenda_id AND cliente_id=s.cliente_id;
    IF v_prod IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='fazenda_cadastros_sem_area';
    END IF;

    -- ON CONFLICT DO NOTHING como rede residual (nao DO UPDATE): mesmo sob corrida
    -- teorica, nunca sobrescreve area existente.
    INSERT INTO public.fechamento_area_snapshot (
      cliente_id, fazenda_id, ano_mes,
      area_total_ha, area_produtiva_ha, area_pecuaria_ha, area_agricultura_ha,
      area_reserva_ha, area_benfeitorias_ha, area_outras_ha,
      origem_area, versao, fechado_em, fechado_por, fechamento_p1_snapshot_id, schema_version)
    VALUES (
      s.cliente_id, s.fazenda_id, v_ano_mes_date,
      coalesce(v_total, coalesce(v_pec,0)+coalesce(v_agric,0)),
      v_prod, v_pec, v_agric, v_reserva, v_benf, v_outras,
      'fechamento_p1', 1, now(), v_uid, s.id, 1)
    ON CONFLICT (fazenda_id, ano_mes) DO NOTHING
    RETURNING id INTO v_area_id;

    IF v_area_id IS NULL THEN
      -- corrida: linha surgiu entre o SELECT e o INSERT; reutiliza a existente.
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

REVOKE EXECUTE ON FUNCTION public.fn_gerar_area_de_snapshot(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_gerar_area_de_snapshot(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_gerar_area_de_snapshot(uuid) FROM authenticated;

COMMENT ON FUNCTION public.fn_gerar_area_de_snapshot(uuid) IS
  'INTERNA (sem grant). Gera a area do snapshot de conjunto. PR1: PRESERVA a area historica — se ja existe fechamento_area_snapshot para (fazenda, ano_mes), reutiliza sem reler fazenda_cadastros, sem atualizar areas, sem versionar, sem mudar fechado_em. So o PRIMEIRO fechamento do mes fotografa o cadastro. ON CONFLICT DO NOTHING (nunca DO UPDATE). Recalculo historico exige acao explicita de correcao cadastral (UX futura, governada por oficializacao). Retorna area_preservada=true quando reutilizou.';