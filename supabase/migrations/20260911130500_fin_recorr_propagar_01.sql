-- 20260911130500_fin_recorr_propagar_01.sql
-- FIN-RECORR-PROPAGA-01 (banco) + FIN-SAFRA-ADM-03.
-- (1) resolve_classificacao_from_plano v3: safra_id entra no guard e no UPDATE OF do trigger;
--     ao fim de qualquer resolucao, escopo administrativo => safra_id = NULL (regra na fonte).
-- (2) fn_recorrencia_propagar: a recorrencia e a fonte da classificacao dos lancamentos gerados.
-- APLICADA no proto em 2026-09-11 via Management API, apos teste em ROLLBACK.

CREATE OR REPLACE FUNCTION public.resolve_classificacao_from_plano()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      v_plano RECORD;
      v_chave_manda boolean;
    BEGIN
      -- GUARD (PR-FIN-RESOLVE-SCOPE-01): em UPDATE, so resolver quando uma das 4 colunas soberanas mudou.
      IF TG_OP = 'UPDATE'
         AND NEW.subcentro      IS NOT DISTINCT FROM OLD.subcentro
         AND NEW.tipo_operacao  IS NOT DISTINCT FROM OLD.tipo_operacao
         AND NEW.plano_conta_id IS NOT DISTINCT FROM OLD.plano_conta_id
         AND NEW.macro_custo    IS NOT DISTINCT FROM OLD.macro_custo
         AND NEW.safra_id       IS NOT DISTINCT FROM OLD.safra_id   -- FIN-SAFRA-ADM-03: safra so muda passando pela regra
      THEN
        RETURN NEW;
      END IF;

      <<resolve>>
      BEGIN
      -- PR-FIN-PLANO-CHAVE-02: a CHAVE e a fonte; o texto e cache.
      -- Quem manda e o que MUDOU nesta gravacao:
      --   chave mudou (ou INSERT com chave)      -> chave resolve o texto
      --   so o texto mudou                       -> texto resolve a chave (front legado)
      --   nenhum dos dois mudou, chave presente  -> chave
      --   sem chave                              -> texto
      v_chave_manda := NEW.plano_conta_id IS NOT NULL AND (
          TG_OP = 'INSERT'
          OR NEW.plano_conta_id IS DISTINCT FROM OLD.plano_conta_id
          OR NEW.subcentro IS NOT DISTINCT FROM OLD.subcentro
      );

      IF v_chave_manda THEN
        SELECT id, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio
          INTO v_plano
          FROM public.financeiro_plano_contas
         WHERE id = NEW.plano_conta_id AND ativo = true
         LIMIT 1;
        IF FOUND THEN
          NEW.subcentro      := v_plano.subcentro;
          NEW.macro_custo    := v_plano.macro_custo;
          NEW.grupo_custo    := v_plano.grupo_custo;
          NEW.centro_custo   := v_plano.centro_custo;
          NEW.escopo_negocio := v_plano.escopo_negocio;
          EXIT resolve;
        END IF;
        -- chave aponta para plano inexistente/inativo: cai para o texto
      END IF;

      -- Tentativa 1: por subcentro + tipo_operacao
      IF NEW.subcentro IS NOT NULL THEN
        SELECT id, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio
          INTO v_plano
          FROM public.financeiro_plano_contas
         WHERE ativo = true AND subcentro = NEW.subcentro AND tipo_operacao = NEW.tipo_operacao
         LIMIT 1;
        IF FOUND THEN
          NEW.macro_custo    := v_plano.macro_custo;
          NEW.grupo_custo    := v_plano.grupo_custo;
          NEW.centro_custo   := v_plano.centro_custo;
          NEW.escopo_negocio := v_plano.escopo_negocio;
          NEW.plano_conta_id := v_plano.id;
          EXIT resolve;
        END IF;

        -- Tentativa 2: so por subcentro
        SELECT id, macro_custo, grupo_custo, centro_custo, subcentro, escopo_negocio
          INTO v_plano
          FROM public.financeiro_plano_contas
         WHERE ativo = true AND subcentro = NEW.subcentro
         LIMIT 1;
        IF FOUND THEN
          NEW.macro_custo    := v_plano.macro_custo;
          NEW.grupo_custo    := v_plano.grupo_custo;
          NEW.centro_custo   := v_plano.centro_custo;
          NEW.escopo_negocio := v_plano.escopo_negocio;
          NEW.plano_conta_id := v_plano.id;
          EXIT resolve;
        END IF;

        -- B1: subcentro fora do plano. Bloqueia, exceto dividendos (por cliente, fora do plano global).
        IF NEW.macro_custo IS DISTINCT FROM 'Dividendos' THEN
          RAISE EXCEPTION 'Subcentro "%" nao existe no plano de contas. Selecione um subcentro canonico.', NEW.subcentro
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;

      END;

      -- FIN-SAFRA-ADM-03: lancamento administrativo nao tem safra (regra na fonte; o modal so avisa)
      IF NEW.escopo_negocio = 'administrativo' THEN
        NEW.safra_id := NULL;
      END IF;
      RETURN NEW;
    END;
    $function$;

DROP TRIGGER IF EXISTS trg_resolve_classificacao_plano ON public.financeiro_lancamentos_v2;
CREATE TRIGGER trg_resolve_classificacao_plano BEFORE INSERT OR UPDATE OF subcentro, tipo_operacao, plano_conta_id, macro_custo, safra_id ON public.financeiro_lancamentos_v2 FOR EACH ROW EXECUTE FUNCTION resolve_classificacao_from_plano();

CREATE OR REPLACE FUNCTION public.fn_recorrencia_propagar(p_recorrencia_id uuid, p_escopo text DEFAULT 'futuros', p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_r public.financeiro_recorrencias;
  v_fut int := 0; v_pas int := 0; v_sinal_ruim int := 0;
  v_ap_fut int := 0; v_ap_pas int := 0;
BEGIN
  -- FIN-RECORR-PROPAGA-01: a recorrencia e a fonte da classificacao dos lancamentos que gerou.
  -- p_escopo: 'futuros' | 'todos' | 'nenhum'. p_simular=true so conta (mesmo predicado do update).
  -- Futuro = status previsto/programado/agendado/meta, sem data_pagamento, sem conciliacao.
  -- Passado = todo o resto nao cancelado. Cancelados nunca sao tocados.
  -- Propaga: descricao, favorecido, fazenda, conta (pelo tipo), subcentro (chave/grupo/centro/escopo via trigger),
  -- safra (trigger zera se administrativo), forma_pagamento, observacao. Valor SO nos futuros.
  -- Nunca toca: datas, tipo_operacao, sinal, valor de passado. Sinal trocado na regra = recusa.
  SELECT * INTO v_r FROM public.financeiro_recorrencias WHERE id = p_recorrencia_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recorrencia inexistente'; END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR v_r.cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  IF p_escopo NOT IN ('futuros','todos','nenhum') THEN RAISE EXCEPTION 'p_escopo invalido: %', p_escopo; END IF;

  SELECT count(*) FILTER (WHERE status_transacao IN ('previsto','programado','agendado','meta') AND data_pagamento IS NULL AND conciliado_em IS NULL),
         count(*) FILTER (WHERE NOT (status_transacao IN ('previsto','programado','agendado','meta') AND data_pagamento IS NULL AND conciliado_em IS NULL)),
         count(*) FILTER (WHERE tipo_operacao IS DISTINCT FROM v_r.tipo_operacao)
    INTO v_fut, v_pas, v_sinal_ruim
    FROM public.financeiro_lancamentos_v2
   WHERE recorrencia_id = p_recorrencia_id AND coalesce(cancelado,false) = false;

  IF p_escopo <> 'nenhum' AND v_sinal_ruim > 0 THEN
    RAISE EXCEPTION 'A recorrencia mudou de entrada para saida (ou o inverso). Trocar o sinal exige nova recorrencia; os % lancamentos gerados nao foram alterados.', v_sinal_ruim
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_simular OR p_escopo = 'nenhum' THEN
    RETURN jsonb_build_object('futuros', v_fut, 'passados', v_pas, 'aplicados_futuros', 0, 'aplicados_passados', 0, 'simulado', p_simular);
  END IF;

  -- propagacao de regra nao e edicao manual do lancamento
  ALTER TABLE public.financeiro_lancamentos_v2 DISABLE TRIGGER trg_financeiro_lancamento_v2_editado_manual;

  -- futuros: tudo, inclusive valor
  UPDATE public.financeiro_lancamentos_v2 l
     SET descricao = v_r.descricao, favorecido_id = v_r.favorecido_id, fazenda_id = v_r.fazenda_id,
         conta_bancaria_id = CASE WHEN v_r.valor_base < 0 THEN v_r.conta_bancaria_id ELSE NULL END,
         conta_destino_id  = CASE WHEN v_r.valor_base > 0 THEN v_r.conta_bancaria_id ELSE NULL END,
         subcentro = v_r.subcentro, safra_id = v_r.safra_id,
         forma_pagamento = v_r.forma_pagamento, observacao = v_r.observacao,
         valor = abs(v_r.valor_base), updated_by = v_uid
   WHERE l.recorrencia_id = p_recorrencia_id AND coalesce(l.cancelado,false) = false
     AND l.status_transacao IN ('previsto','programado','agendado','meta') AND l.data_pagamento IS NULL AND l.conciliado_em IS NULL;
  GET DIAGNOSTICS v_ap_fut = ROW_COUNT;

  IF p_escopo = 'todos' THEN
    -- passados: classificacao e identificacao; nunca valor nem datas
    UPDATE public.financeiro_lancamentos_v2 l
       SET descricao = v_r.descricao, favorecido_id = v_r.favorecido_id, fazenda_id = v_r.fazenda_id,
           conta_bancaria_id = CASE WHEN v_r.valor_base < 0 THEN v_r.conta_bancaria_id ELSE NULL END,
           conta_destino_id  = CASE WHEN v_r.valor_base > 0 THEN v_r.conta_bancaria_id ELSE NULL END,
           subcentro = v_r.subcentro, safra_id = v_r.safra_id,
           forma_pagamento = v_r.forma_pagamento, observacao = v_r.observacao, updated_by = v_uid
     WHERE l.recorrencia_id = p_recorrencia_id AND coalesce(l.cancelado,false) = false
       AND NOT (l.status_transacao IN ('previsto','programado','agendado','meta') AND l.data_pagamento IS NULL AND l.conciliado_em IS NULL);
    GET DIAGNOSTICS v_ap_pas = ROW_COUNT;
  END IF;

  ALTER TABLE public.financeiro_lancamentos_v2 ENABLE TRIGGER trg_financeiro_lancamento_v2_editado_manual;

  RETURN jsonb_build_object('futuros', v_fut, 'passados', v_pas, 'aplicados_futuros', v_ap_fut, 'aplicados_passados', v_ap_pas, 'simulado', false);
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_recorrencia_propagar(uuid, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_recorrencia_propagar(uuid, text, boolean) TO authenticated;
