-- PR-OC-CANCEL-GUARD-01 — guarda de INTEGRIDADE no cancelamento de Operação Comercial (Opção A).
--   O cancelamento continua SOFT (só status_comercial) e NÃO estorna/altera nada. A mudança: uma OC só
--   pode ser cancelada DIRETAMENTE quando NÃO possuir efeito downstream ATIVO. Se houver movimentação
--   zootécnica ativa, título financeiro ativo ou liquidação ativa → BLOQUEIA (P0001) com mensagem
--   orientadora, preservando os fatos (estorno é frente própria, futura).
--   Predicados de "ativo" (colunas booleanas soberanas, provadas no schema):
--     mov ativa  = zoo_operacao_movimentacoes ⋈ lancamentos (l.cancelado IS NOT TRUE);
--     título ativo = zoo_operacao_partes ⋈ financeiro_lancamentos_v2 (fl.cancelado IS NOT TRUE) — INDEPENDE
--                    de p.cancelada (o Financeiro V2 lê fl direto, sem olhar a parte);
--     liquidação ativa = zoo_operacao_liquidacoes (estornado IS NOT TRUE).
--   Compromisso/programação SEM materialização NÃO bloqueiam (sem fato consumível downstream; writer próprio).
--   Preserva integralmente: tenant/42501, motivo obrigatório, FOR UPDATE, P0002, version-lock 40001,
--   idempotência (já cancelada), evento 'cancelar'. Sem UI (callers já exibem a mensagem soberana).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oc_cancelar(
  p_operacao_id uuid, p_cliente_id uuid, p_versao_esperada integer, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_mov_ativa boolean; v_titulo_ativo boolean; v_liq_ativa boolean; v_dominios text;
BEGIN
  IF NOT (public.is_admin_agroinblue(v_actor) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_actor))) THEN
    RAISE EXCEPTION 'Acesso negado ao cliente %', p_cliente_id USING ERRCODE = '42501'; END IF;                 -- guard: tenant
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'Cancelamento exige motivo' USING ERRCODE = 'P0001'; END IF; -- guard: motivo
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais
    WHERE id = p_operacao_id AND cliente_id = p_cliente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;  -- guard: pertencimento
  IF v_op.status_comercial = 'cancelada' THEN                                                                    -- idempotência
    RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao, 'status_comercial','cancelada','idempotente', true); END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF; -- guard: versão

  -- GUARDA DE INTEGRIDADE (Opção A): detecta efeitos downstream ATIVOS. NÃO estorna/altera nada.
  SELECT EXISTS (SELECT 1 FROM public.zoo_operacao_movimentacoes m
                   JOIN public.lancamentos l ON l.id = m.movimentacao_id
                  WHERE m.operacao_id = p_operacao_id AND l.cancelado IS NOT TRUE) INTO v_mov_ativa;
  -- Título ativo INDEPENDE de p.cancelada: financeiro_lancamentos_v2 é consumido DIRETAMENTE pelo
  --   Financeiro V2 (useFinanceiroV2 filtra só por cancelado=false; NÃO junta zoo_operacao_partes). Um título
  --   com fl.cancelado=false segue em Contas a Pagar/projeções/fluxo mesmo com a parte marcada cancelada.
  --   Só é oficialmente inativo quando a coluna soberana fl.cancelado = true.
  SELECT EXISTS (SELECT 1 FROM public.zoo_operacao_partes p
                   JOIN public.financeiro_lancamentos_v2 fl ON fl.id = p.financeiro_lancamento_id
                  WHERE p.operacao_id = p_operacao_id AND p.financeiro_lancamento_id IS NOT NULL AND fl.cancelado IS NOT TRUE) INTO v_titulo_ativo;
  SELECT EXISTS (SELECT 1 FROM public.zoo_operacao_liquidacoes lq
                  WHERE lq.operacao_id = p_operacao_id AND lq.estornado IS NOT TRUE) INTO v_liq_ativa;
  IF v_mov_ativa OR v_titulo_ativo OR v_liq_ativa THEN
    v_dominios := array_to_string(ARRAY[
      CASE WHEN v_mov_ativa    THEN 'recebimento ativo' END,
      CASE WHEN v_titulo_ativo THEN 'título financeiro ativo' END,
      CASE WHEN v_liq_ativa    THEN 'liquidação ativa' END], ', ');
    RAISE EXCEPTION 'Cancelamento bloqueado: a operação possui efeitos ativos (%). Estorne esses efeitos antes de cancelar a operação.', v_dominios
      USING ERRCODE = 'P0001';
  END IF;

  -- Sem efeitos ativos → cancelamento SOFT (inalterado). Nenhuma tabela downstream é tocada.
  UPDATE public.zoo_operacoes_comerciais
    SET status_comercial = 'cancelada', cancelado_em = now(), cancelado_por = v_actor, cancelado_motivo = p_motivo,
        versao = versao + 1, updated_at = now(), updated_by = v_actor WHERE id = p_operacao_id;
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
  VALUES (p_cliente_id, p_operacao_id, 'cancelar', to_jsonb(v_op),
          jsonb_build_object('motivo', p_motivo, 'inconsistencia_operacional', false), v_actor, 'rpc');
  RETURN jsonb_build_object('ok', true, 'operacao_id', p_operacao_id, 'versao', v_op.versao + 1,
    'status_comercial','cancelada', 'inconsistencia_operacional', false);
END;
$function$;

-- Grants: padrão soberano vivo (postgres owner + service_role + authenticated), sem PUBLIC/anon.
REVOKE ALL ON FUNCTION public.oc_cancelar(uuid,uuid,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_cancelar(uuid,uuid,integer,text) TO authenticated, service_role;
