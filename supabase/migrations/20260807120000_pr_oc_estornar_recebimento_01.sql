-- PR-OC-ESTORNO-RECEBIMENTO-01 — writer COORDENADOR do estorno completo do Recebimento (V3: helpers
--   internos sem version bump; o coordenador é a única autoridade de versão, +1 determinístico).
--   Estorna TODAS as movimentações ativas (idempotente: ignora as já canceladas), reabrindo a entrega se
--   encerrada. Append-only: nada é deletado; zoo_operacao_movimentacoes preservada; financeiro/status final
--   intocados. O trigger P1 (guard_lancamento_mes_fechado_p1) permanece soberano: mês oficial → RAISE →
--   rollback integral. Cache NÃO é reconstruído aqui (retorna cache_rebuild_necessario=true + fazendas/anos).
--   Contratos públicos oc_reabrir_entrega/oc_estornar_movimentacao NÃO são alterados (helpers são novos e
--   internos; refatorar os públicos alteraria o payload de eventos comprovado — evitado, ver relatório).
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper interno: reabre a entrega SEM version bump. Sem auth/tenant/version-lock (o coordenador já fez).
--   Grava o evento granular 'reabrir_entrega' (com estorno_id) e limpa os metadados vivos de encerramento.
--   Retorna true se reabriu; false se já estava aberta.
CREATE OR REPLACE FUNCTION public._oc_estorno_reabrir_entrega(
  p_operacao_id uuid, p_cliente_id uuid, p_estorno_id uuid, p_actor uuid, p_motivo text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_op public.zoo_operacoes_comerciais;
BEGIN
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;
  IF NOT v_op.entrega_encerrada THEN RETURN false; END IF;
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'reabrir_entrega',
          jsonb_build_object('estorno_id', p_estorno_id, 'motivo', p_motivo, 'status_comercial', v_op.status_comercial,
            'entrega_encerrada_em_anterior', v_op.entrega_encerrada_em,
            'entrega_encerrada_por_anterior', v_op.entrega_encerrada_por,
            'entrega_encerrada_motivo_anterior', v_op.entrega_encerrada_motivo),
          p_actor, 'rpc');
  UPDATE public.zoo_operacoes_comerciais
    SET entrega_encerrada = false, entrega_encerrada_em = NULL, entrega_encerrada_por = NULL,
        entrega_encerrada_motivo = NULL, updated_at = now(), updated_by = p_actor
  WHERE id = p_operacao_id;   -- SEM versao+1 (o coordenador faz o único bump)
  RETURN true;
END;
$$;

-- Helper interno: estorna UMA movimentação (por link id) SEM version bump. Idempotente: se o lançamento já
--   está cancelado, retorna NULL (o coordenador ignora). Grava o evento granular 'estornar_movimentacao'
--   (com estorno_id). O UPDATE de lancamentos passa pelo guard P1 (proteção preservada). Retorna dados p/
--   agregação: {lancamento_id, quantidade, fazenda_id, ano}.
CREATE OR REPLACE FUNCTION public._oc_estorno_mov(
  p_link_id uuid, p_cliente_id uuid, p_estorno_id uuid, p_actor uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_link public.zoo_operacao_movimentacoes; v_lanc public.lancamentos;
BEGIN
  SELECT * INTO v_link FROM public.zoo_operacao_movimentacoes WHERE id = p_link_id AND cliente_id = p_cliente_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_lanc FROM public.lancamentos WHERE id = v_link.movimentacao_id AND cliente_id = p_cliente_id;
  IF NOT FOUND OR v_lanc.cancelado IS TRUE THEN RETURN NULL; END IF;   -- idempotente: já estornada → ignora
  UPDATE public.lancamentos SET cancelado = true, updated_at = now(), updated_by = p_actor
   WHERE id = v_link.movimentacao_id AND cliente_id = p_cliente_id AND cancelado IS NOT TRUE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, v_link.operacao_id, 'estornar_movimentacao',
          jsonb_build_object('estorno_id', p_estorno_id, 'movimentacao_id', p_link_id,
            'lancamento_id', v_link.movimentacao_id, 'lote_id', v_link.operacao_lote_id, 'motivo', p_motivo),
          p_actor, 'rpc');
  RETURN jsonb_build_object('lancamento_id', v_lanc.id, 'quantidade', coalesce(v_lanc.quantidade,0),
    'fazenda_id', v_lanc.fazenda_id, 'ano', extract(year FROM v_lanc.data)::int);
END;
$$;

-- Coordenador público.
CREATE OR REPLACE FUNCTION public.oc_estornar_recebimento(
  p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_motivo text, p_estorno_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_estorno_id uuid; v_reabriu boolean := false;
  v_link_id uuid; v_mov jsonb; v_movs jsonb := '[]'::jsonb; v_qtd numeric := 0; v_n int := 0;
  v_fazendas jsonb; v_anos jsonb;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'Estorno de recebimento exige motivo' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operacao cancelada; recupere-a antes de estornar (oc_reabrir_para_estorno)' USING ERRCODE = 'P0001'; END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.zoo_operacao_movimentacoes m JOIN public.lancamentos l ON l.id = m.movimentacao_id
                  WHERE m.operacao_id = p_operacao_id AND l.cancelado IS NOT TRUE) THEN
    RAISE EXCEPTION 'A operacao nao possui recebimento ativo para estornar.' USING ERRCODE = 'P0001'; END IF;

  v_estorno_id := coalesce(p_estorno_id, gen_random_uuid());

  IF v_op.entrega_encerrada THEN
    v_reabriu := public._oc_estorno_reabrir_entrega(p_operacao_id, p_cliente_id, v_estorno_id, v_actor, p_motivo);
  END IF;

  FOR v_link_id IN
    SELECT m.id FROM public.zoo_operacao_movimentacoes m JOIN public.lancamentos l ON l.id = m.movimentacao_id
     WHERE m.operacao_id = p_operacao_id AND l.cancelado IS NOT TRUE ORDER BY m.created_at
  LOOP
    v_mov := public._oc_estorno_mov(v_link_id, p_cliente_id, v_estorno_id, v_actor, p_motivo);
    IF v_mov IS NOT NULL THEN
      v_movs := v_movs || jsonb_build_array(v_mov);
      v_qtd := v_qtd + coalesce((v_mov->>'quantidade')::numeric, 0);
      v_n := v_n + 1;
    END IF;
  END LOOP;

  SELECT jsonb_agg(DISTINCT e->>'fazenda_id'), jsonb_agg(DISTINCT (e->>'ano')::int)
    INTO v_fazendas, v_anos FROM jsonb_array_elements(v_movs) e;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'estornar_recebimento', to_jsonb(v_op),
          jsonb_build_object('estorno_id', v_estorno_id, 'motivo', p_motivo, 'reabriu_entrega', v_reabriu,
            'movimentacoes_estornadas', v_n, 'quantidade_estornada', v_qtd, 'movimentacoes', v_movs,
            'fazendas_afetadas', v_fazendas, 'anos_afetados', v_anos,
            'versao_anterior', v_op.versao, 'versao_nova', v_op.versao + 1),
          v_actor, 'rpc');

  UPDATE public.zoo_operacoes_comerciais SET versao = versao + 1, updated_at = now(), updated_by = v_actor
   WHERE id = p_operacao_id;   -- ÚNICO bump determinístico +1

  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'operacao_versao', v_op.versao + 1,
    'estorno_id', v_estorno_id, 'movimentacoes_estornadas', v_n, 'quantidade_estornada', v_qtd,
    'fazendas_afetadas', coalesce(v_fazendas, '[]'::jsonb), 'anos_afetados', coalesce(v_anos, '[]'::jsonb),
    'cache_rebuild_necessario', true);
END;
$$;

-- Grants: helpers INTERNOS = nenhum grant (só o owner/definer os chama). Coordenador = padrão soberano.
REVOKE ALL ON FUNCTION public._oc_estorno_reabrir_entrega(uuid,uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._oc_estorno_mov(uuid,uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.oc_estornar_recebimento(uuid,uuid,integer,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_estornar_recebimento(uuid,uuid,integer,text,uuid) TO authenticated, service_role;
