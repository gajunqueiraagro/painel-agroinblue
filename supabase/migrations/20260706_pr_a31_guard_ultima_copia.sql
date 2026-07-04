-- ============================================================================
-- PR-A3.1 — Segurança operacional na desconsideração de OFX: avisar quando a
-- ação remove a ÚLTIMA ocorrência válida de um documento (= remover dinheiro
-- real do banco). Delta ADITIVO sobre fn_invalidar_origem_extrato (corpo vigente
-- do pg_proc == migration 20260704_pr_protocolo01). NÃO impede a operação.
--   1a) 2 colunas aditivas (nullable) na própria linha do extrato.
--   1b) fn com 3 deltas: (i) cálculo última-cópia + impacto; (ii) campos no
--       retorno LISTAR/motivo_obrigatorio; (iii) persistência na fase APLICAR.
-- NADA MAIS muda: derivados, decisões, guards, permissões e mensagens intactos.
-- Nenhum saldo agregado gravado (evita segunda fonte de saldo).
-- ============================================================================

-- ── 1a) colunas de auditoria do impacto (na própria linha; sem default custoso) ──
ALTER TABLE public.extrato_bancario_v2
  ADD COLUMN IF NOT EXISTS ignorado_ultima_copia boolean,
  ADD COLUMN IF NOT EXISTS ignorado_impacto       numeric;

-- ── 1b) fn com os 3 deltas (resto verbatim do corpo vigente) ────────────────
CREATE OR REPLACE FUNCTION public.fn_invalidar_origem_extrato(p_extrato_id uuid, p_motivo text, p_decisoes jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- PR-A3.1 — proteção "última cópia válida".
  v_gemeas_vivas int;
  v_ultima_copia boolean;
  v_impacto      numeric;
BEGIN
  -- (a) guards — retorno estruturado, sem RAISE (extrato não tem coluna 'cancelado')
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'extrato_inexistente'); END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR v_ext.cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao'); END IF;
  -- (motivo NÃO é guard aqui: a abertura do dialog chama a RPC sem motivo só para LISTAR
  --  os derivados; o motivo é obrigatório no front, no passo de confirmação.)

  -- (a.2) PR-A3.1 DELTA (i) — "última ocorrência válida" deste documento nesta conta.
  -- Gêmea VIVA = mesmo documento + mesma conta, não cancelada e NÃO ignorada.
  -- IS DISTINCT FROM 'ignorado' conta status NULL como cópia VIVA. documento NULL → última.
  IF v_ext.documento IS NULL THEN
    v_gemeas_vivas := 0;
  ELSE
    SELECT count(*) INTO v_gemeas_vivas FROM extrato_bancario_v2 g
      WHERE g.conta_bancaria_id = v_ext.conta_bancaria_id
        AND g.documento = v_ext.documento
        AND g.id <> v_ext.id
        AND g.cancelado_em IS NULL
        AND g.status IS DISTINCT FROM 'ignorado';
  END IF;
  v_ultima_copia := (v_gemeas_vivas = 0);
  -- impacto = o que SAI do OFX válido ao confirmar (signed).
  v_impacto := v_ext.valor * (CASE v_ext.tipo_movimento WHEN 'credito' THEN 1 ELSE -1 END) * -1;

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
  -- PR-A3.1 DELTA (ii): + campos de última-cópia/impacto.
  IF v_derivados <> '[]'::jsonb AND v_pendente THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'decisao_pendente', 'derivados', v_derivados,
      'ultima_copia_valida', v_ultima_copia, 'gemeas_vivas', v_gemeas_vivas,
      'impacto_valor', v_impacto, 'documento', v_ext.documento);
  END IF;

  -- (b/motivo) CONSUMAÇÃO: não é mais listagem (todas as decisões vieram, OU não há
  -- derivados = invalidação efetiva). Motivo obrigatório NO BANCO (defesa dupla, nunca só front).
  -- PR-A3.1 DELTA (ii): + campos de última-cópia/impacto (o dialog exibe o aviso ao LISTAR).
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'motivo_obrigatorio',
      'ultima_copia_valida', v_ultima_copia, 'gemeas_vivas', v_gemeas_vivas,
      'impacto_valor', v_impacto, 'documento', v_ext.documento);
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
    -- PR-A3.1 DELTA (iii): persiste última-cópia + impacto na própria linha.
    UPDATE extrato_bancario_v2
       SET status = 'ignorado',
           ignorado_em     = COALESCE(ignorado_em, now()),
           ignorado_por    = COALESCE(ignorado_por, v_uid),
           ignorado_motivo = COALESCE(ignorado_motivo, btrim(p_motivo)),
           ignorado_ultima_copia = v_ultima_copia,
           ignorado_impacto      = v_impacto
     WHERE id = p_extrato_id;
    INSERT INTO conciliacao_audit_log (acao, actor_user_id, cliente_id, extrato_id, motivo, payload_depois)
    VALUES ('extrato_ignorado', v_uid, v_ext.cliente_id, p_extrato_id, btrim(p_motivo),
            jsonb_build_object('status','ignorado'));

  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'erro_cancelamento', 'detalhe', SQLERRM);
  END;

  RETURN jsonb_build_object('ok', true, 'ignorado', true, 'cancelados', v_cancelados, 'promovidos', v_promovidos);
END $function$;
