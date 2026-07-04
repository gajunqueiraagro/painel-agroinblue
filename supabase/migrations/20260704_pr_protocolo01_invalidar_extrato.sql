-- ============================================================================
-- PR-PROTOCOLO-01 — Protocolo de Invalidação de Origem (menor fatia: extrato)
-- ADR-2026-06 (Proveniência e Ciclo de Vida). Absorve e SUPERA a migration parked
-- 20260630_pr_p34 (que deixa de existir). Homologação = caso Vera Lígia.
--   1) extrato_bancario_v2: colunas de auditoria do "ignorado" (aditivo, NULL).
--   2) conciliacao_audit_log.acao: +3 ações (invalidar origem/decisão do derivado).
--   3) fn_invalidar_origem_extrato: lista derivados vivos + régua reflexo×independente
--      (bloco isolado; ADR) e o OPERADOR decide. Sem efeito até decisão completa.
--   4) fn_reverter_desconsideracao_extrato: corpo vigente + reset dos 3 campos de audit.
-- Nada cancela automaticamente. Validada em BEGIN/ROLLBACK; forward-only.
-- ============================================================================

-- ── 1) colunas de auditoria do "ignorado" (sem boolean; NULL = nunca/restaurado) ──
ALTER TABLE public.extrato_bancario_v2
  ADD COLUMN IF NOT EXISTS ignorado_em     timestamptz NULL,
  ADD COLUMN IF NOT EXISTS ignorado_por    uuid        NULL,
  ADD COLUMN IF NOT EXISTS ignorado_motivo text        NULL;

-- ── 2) estender o CHECK de acao (12 vigentes + 3 novos) ─────────────────────
ALTER TABLE public.conciliacao_audit_log DROP CONSTRAINT conciliacao_audit_log_acao_check;
ALTER TABLE public.conciliacao_audit_log ADD  CONSTRAINT conciliacao_audit_log_acao_check
  CHECK (acao = ANY (ARRAY[
    'conciliacao_criada'::text, 'conciliacao_desfeita'::text, 'conciliacao_substituida'::text,
    'extrato_marcado_orfao'::text, 'extrato_desmarcado_orfao'::text,
    'lancamento_marcado_orfao'::text, 'lancamento_desmarcado_orfao'::text,
    'importacao_revertida'::text, 'mes_reaberto'::text, 'mes_fechado'::text,
    'warning_mes_fechado'::text, 'warning_delete_extrato'::text,
    -- PR-PROTOCOLO-01
    'extrato_ignorado'::text, 'derivado_promovido_independente'::text, 'derivado_cancelado_com_origem'::text
  ]));

-- ── 3) RPC: invalidar origem (extrato) com protocolo de derivados ───────────
CREATE OR REPLACE FUNCTION public.fn_invalidar_origem_extrato(
  p_extrato_id uuid,
  p_motivo     text,
  p_decisoes   jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid       uuid := auth.uid();
  v_ext       extrato_bancario_v2%ROWTYPE;
  v_der       record;
  v_n_ativos  int;
  v_sugestao  text;
  v_tipo      text;
  v_justif    text;
  v_derivados jsonb := '[]'::jsonb;
  v_pendente  boolean := false;
  v_item      jsonb;
  v_lid       uuid;
  v_decisao   text;
  v_cancelados int := 0;
  v_promovidos int := 0;
BEGIN
  -- (a) guards — retorno estruturado, sem RAISE (extrato não tem coluna 'cancelado')
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'extrato_inexistente'); END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR v_ext.cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao'); END IF;
  -- (motivo NÃO é guard aqui: a abertura do dialog chama a RPC sem motivo só para LISTAR
  --  os derivados; o motivo é obrigatório no front, no passo de confirmação.)

  -- (b) DERIVADOS VIVOS + régua. Lançamentos ativos ligados ao extrato via CBI
  --     (desfeitas INCLUÍDAS — a cbi desfeita é a memória do elo).
  FOR v_der IN
    SELECT DISTINCT l.id, l.valor, l.descricao, l.origem_lancamento, l.editado_manual, l.created_at
    FROM financeiro_lancamentos_v2 l
    JOIN conciliacao_bancaria_itens cbi ON cbi.lancamento_id = l.id
    WHERE cbi.extrato_id = p_extrato_id AND l.cancelado = false
  LOOP
    SELECT count(*) INTO v_n_ativos FROM conciliacao_bancaria_itens
      WHERE lancamento_id = v_der.id AND desfeito_em IS NULL;

    -- ═══ HEURÍSTICA INICIAL REFLEXO × INDEPENDENTE (EVOLUTIVA) ═══
    -- Única casa da régua (ADR-2026-06). Bloco será extraído para
    -- função compartilhada quando a Mesa virar o 2º consumidor.
    -- Evoluções previstas: anexos/NF, aprovação, workflow.
    IF v_der.editado_manual IS TRUE THEN
      v_sugestao := 'manter_independente'; v_tipo := 'edicao_manual';
      v_justif   := 'Lançamento com edição/enriquecimento manual (origem '''||coalesce(v_der.origem_lancamento,'?')||''', criado em '||to_char(v_der.created_at,'DD/MM/YYYY')||').';
    ELSIF v_der.origem_lancamento IS NULL OR v_der.origem_lancamento NOT IN ('ofx','extrato') THEN
      v_sugestao := 'manter_independente'; v_tipo := 'origem_nao_reflexo';
      v_justif   := 'Origem '''||coalesce(v_der.origem_lancamento,'?')||''' não é reflexo de extrato.';
    ELSIF v_n_ativos > 1 THEN
      v_sugestao := 'manter_independente'; v_tipo := 'multiplos_vinculos';
      v_justif   := 'Possui '||v_n_ativos||' vínculos ativos.';
    ELSE
      v_sugestao := 'cancelar_junto'; v_tipo := 'reflexo_puro';
      v_justif   := 'Reflexo puro da origem: sem edição manual, origem '''||coalesce(v_der.origem_lancamento,'?')||''', vínculo simples.';
    END IF;
    -- ═══ fim da régua ═══

    v_derivados := v_derivados || jsonb_build_object(
      'lancamento_id', v_der.id, 'valor', v_der.valor, 'descricao', v_der.descricao,
      'origem_lancamento', v_der.origem_lancamento, 'editado_manual', v_der.editado_manual,
      'sugestao', v_sugestao, 'justificativa_tipo', v_tipo, 'justificativa', v_justif);

    IF p_decisoes IS NULL OR NOT (p_decisoes ? v_der.id::text) THEN v_pendente := true; END IF;
  END LOOP;

  -- (d) decisão pendente → devolve a lista, SEM NENHUM EFEITO (motivo é OPCIONAL na listagem)
  IF v_derivados <> '[]'::jsonb AND v_pendente THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'decisao_pendente', 'derivados', v_derivados);
  END IF;

  -- (b/motivo) CONSUMAÇÃO: não é mais listagem (todas as decisões vieram, OU não há
  -- derivados = invalidação efetiva). Motivo obrigatório NO BANCO (defesa dupla, nunca só front).
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'motivo_obrigatorio');
  END IF;

  -- (d+e) aplicar tudo numa subtransação: erro de guard (mês fechado etc) → nada aplicado
  BEGIN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_derivados)
    LOOP
      v_lid     := (v_item->>'lancamento_id')::uuid;
      v_decisao := p_decisoes->>(v_lid::text);
      IF v_decisao = 'cancelar_junto' THEN
        -- o trigger trg_cbi_desfazer_on_cancelamento desfaz vínculos + audita (NÃO duplicar)
        UPDATE financeiro_lancamentos_v2
           SET cancelado = true, cancelado_em = now(), cancelado_por = v_uid,
               cancelado_motivo = 'origem_ignorada:'||p_extrato_id
         WHERE id = v_lid;
        INSERT INTO conciliacao_audit_log (acao, actor_user_id, cliente_id, extrato_id, lancamento_id, motivo, payload_depois)
        VALUES ('derivado_cancelado_com_origem', v_uid, v_ext.cliente_id, p_extrato_id, v_lid, p_motivo,
                jsonb_build_object('decisao','cancelar_junto',
                  'sugestao_sistema', v_item->>'sugestao', 'justificativa_tipo', v_item->>'justificativa_tipo',
                  'justificativa_sistema', v_item->>'justificativa',
                  'seguiu_sugestao', ((v_item->>'sugestao') = 'cancelar_junto')));
        v_cancelados := v_cancelados + 1;
      ELSE  -- manter_independente
        INSERT INTO conciliacao_audit_log (acao, actor_user_id, cliente_id, extrato_id, lancamento_id, motivo, payload_depois)
        VALUES ('derivado_promovido_independente', v_uid, v_ext.cliente_id, p_extrato_id, v_lid, p_motivo,
                jsonb_build_object('decisao','manter_independente',
                  'sugestao_sistema', v_item->>'sugestao', 'justificativa_tipo', v_item->>'justificativa_tipo',
                  'justificativa_sistema', v_item->>'justificativa',
                  'seguiu_sugestao', ((v_item->>'sugestao') = 'manter_independente')));
        v_promovidos := v_promovidos + 1;
      END IF;
    END LOOP;

    -- extrato ignorado + auditoria (idempotente: já ignorado → não reescreve ignorado_em)
    UPDATE extrato_bancario_v2
       SET status = 'ignorado',
           ignorado_em     = COALESCE(ignorado_em, now()),
           ignorado_por    = COALESCE(ignorado_por, v_uid),
           ignorado_motivo = COALESCE(ignorado_motivo, btrim(p_motivo))
     WHERE id = p_extrato_id;
    INSERT INTO conciliacao_audit_log (acao, actor_user_id, cliente_id, extrato_id, motivo, payload_depois)
    VALUES ('extrato_ignorado', v_uid, v_ext.cliente_id, p_extrato_id, btrim(p_motivo),
            jsonb_build_object('status','ignorado'));

  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'erro_cancelamento', 'detalhe', SQLERRM);
  END;

  RETURN jsonb_build_object('ok', true, 'ignorado', true, 'cancelados', v_cancelados, 'promovidos', v_promovidos);
END $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_invalidar_origem_extrato(uuid,text,jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_invalidar_origem_extrato(uuid,text,jsonb) TO authenticated;

-- ── 4) reverter: corpo VIGENTE + reset dos 3 campos de audit no UPDATE final ─
CREATE OR REPLACE FUNCTION public.fn_reverter_desconsideracao_extrato(p_extrato_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ext     record;
  v_alvo    text;
  v_tem_cbi boolean;
BEGIN
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'extrato % nao encontrado', p_extrato_id;
  END IF;

  IF v_ext.status IS DISTINCT FROM 'ignorado' THEN
    RAISE EXCEPTION 'extrato % nao esta desconsiderado (status atual: %)',
      p_extrato_id, v_ext.status;
  END IF;

  v_tem_cbi := EXISTS(
    SELECT 1 FROM conciliacao_bancaria_itens
    WHERE extrato_id = p_extrato_id AND desfeito_em IS NULL
  );

  v_alvo := CASE WHEN v_tem_cbi THEN 'conciliado' ELSE 'nao_conciliado' END;

  UPDATE extrato_bancario_v2
     SET status = v_alvo,
         ignorado_em = NULL, ignorado_por = NULL, ignorado_motivo = NULL
   WHERE id = p_extrato_id;

  RETURN v_alvo;
END
$function$;
