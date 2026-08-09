-- =====================================================================
-- PR-FIN-DATAS-VENCIMENTO-02B
-- Corrige a semantica de datas do writer OFICIAL de parcelas de
-- financiamento: public.fn_reconciliar_parcela_financiamento.
--
--   A  lancamento nao realizado deixa de receber o vencimento em data_pagamento
--   B  o INSERT deixa de gravar ano_mes; o trigger 02E deriva da competencia
--   C  o UPDATE de data_pagamento deixa de gravar ano_mes junto
--
-- Base verbatim: 20260729160000_pr_fin_datas_04a_financiamento_vencimento.sql
-- md5 de origem: 52083ef0d29e0dbe571c7572ed995569
--
-- NAO altera competencia: ela ja vem de financiamentos.data_contrato, que a
-- medicao provou ser a data inicial da captacao (68 de 68 lancamentos de
-- captacao vinculados confirmam competencia, pagamento e ano_mes nessa data).
-- NAO altera o casamento parcela<->lancamento, que e estrutural: FK
-- lancamento_id/lancamento_juros_id, com fallback pelo marcador
-- 'parcela:<uuid>:parcela_principal|parcela_juros' em observacao.
-- NAO altera o bloco de limpeza de totalizadores legados, cuja comparacao com
-- data_pagamento nada tem a ver com o casamento e hoje e inerte (as 12 linhas
-- 'financiamento'/'financiamento_parcela' estao todas canceladas).
-- NAO faz backfill, DML em massa nem toca em linha historica alguma.
--
-- Quatro estados: origem -> converte; final -> no-op verdadeiro; corpo
-- divergente -> aborta; ambiente divergente -> aborta antes do replace.
-- Guarda SHA-256 do payload: aborta antes da primeira instrucao.
-- =====================================================================
DO $WRAP$
DECLARE
  c_esperado constant text := '8fb88bd01d3e8cff53338e492217916eab19663e3fce10ca764dd1f85684e9e3';
  v_payload  constant text := $PAYLOAD$DO $BODY$
DECLARE
  -- ---------------------------------------------------------------------
  -- PR-FIN-DATAS-VENCIMENTO-02B — corpo executavel
  -- Alteracao cirurgica de public.fn_reconciliar_parcela_financiamento.
  -- Tres pontos, e apenas tres:
  --   A  lancamento nao realizado deixa de receber o vencimento em data_pagamento
  --   B  o INSERT deixa de gravar ano_mes; quem deriva e o trigger 02E
  --   C  o UPDATE de data_pagamento deixa de gravar ano_mes junto
  -- Competencia, vencimento, casamento estrutural, bloco de limpeza de
  -- totalizadores legados, valores, classificacao, status, juros,
  -- cancelamento e calculo permanecem byte-identicos.
  -- Zero DML. Zero backfill. Nenhuma linha historica e alterada aqui.
  -- ---------------------------------------------------------------------
  c_md5_origem constant text := '52083ef0d29e0dbe571c7572ed995569';
  c_md5_final  constant text := '7655e41017b74e7f272938deb87e5d76';
  c_md5_acl    constant text := '09256151bffa802d1891f7a9fcb12d64';
  c_assinatura constant text := 'p_parcela_id uuid, p_dry_run boolean, p_recalcula_vt boolean, p_conta_bancaria_id uuid';
  c_tabelas    constant text[] := ARRAY['financiamentos','financiamento_parcelas','financiamento_destinacoes'];

  v_ddl constant text := $DDL$
CREATE OR REPLACE FUNCTION public.fn_reconciliar_parcela_financiamento(p_parcela_id uuid, p_dry_run boolean DEFAULT true, p_recalcula_vt boolean DEFAULT false, p_conta_bancaria_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$




DECLARE
  v_parcela financiamento_parcelas%ROWTYPE;
  v_contrato financiamentos%ROWTYPE;
  v_lanc_p financeiro_lancamentos_v2%ROWTYPE;
  v_lanc_j financeiro_lancamentos_v2%ROWTYPE;
  v_lixo financeiro_lancamentos_v2%ROWTYPE;
  v_found_p boolean := false;
  v_found_j boolean := false;
  v_plano_p_id uuid;
  v_plano_j_id uuid;
  v_status text;
  v_data_pag date;
  v_vt_calc numeric;
  v_acoes jsonb := '[]'::jsonb;
  v_alertas jsonb := '[]'::jsonb;
  v_today date := CURRENT_DATE;
  v_desc_p text;
  v_desc_j text;
  v_novo_p jsonb;
  v_novo_j jsonb;
  v_lixo_acao text;
  v_lixo_motivo text;
  -- exec
  v_executado jsonb := '{}'::jsonb;
  v_acao_iter jsonb;
  v_acao_tipo text;
  v_novo jsonb;
  v_new_id uuid;
  v_alvo uuid;
  v_campo text;
  v_depois text;
  v_ids_criados jsonb := '[]'::jsonb;
  v_ids_atualizados jsonb := '[]'::jsonb;
  v_ids_cancelados jsonb := '[]'::jsonb;
  v_parcela_updates jsonb := '{}'::jsonb;
  v_acoes_executadas jsonb := '[]'::jsonb;
  v_audit_tag text;
  v_tipo_op_p text;
  v_tipo_op_j text;
  v_rc int;
  v_conta_desejada uuid;   -- PR-FIN-CPR-01: conta alvo (override do operador → fallback contrato)
BEGIN
  SELECT * INTO v_parcela FROM financiamento_parcelas WHERE id = p_parcela_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro','parcela_nao_encontrada','parcela_id',p_parcela_id);
  END IF;
  IF v_parcela.status = 'cancelado' THEN
    RETURN jsonb_build_object('skip','parcela_cancelada','parcela_id',p_parcela_id);
  END IF;

  SELECT * INTO v_contrato FROM financiamentos WHERE id = v_parcela.financiamento_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('erro','contrato_nao_encontrado',
      'financiamento_id',v_parcela.financiamento_id,'parcela_id',p_parcela_id);
  END IF;

  -- PR-FIN-CPR-01 (1a): conta desejada = override do operador → fallback do contrato.
  v_conta_desejada := COALESCE(p_conta_bancaria_id, v_contrato.conta_bancaria_id);

  IF v_contrato.tipo_financiamento = 'pecuaria' THEN
    v_plano_p_id := '0d42d354-926a-4a10-ab3a-f082adaef972'::uuid;
    v_plano_j_id := '5d4a5c70-311d-4302-98f0-b2846d9738fc'::uuid;
  ELSIF v_contrato.tipo_financiamento = 'agricultura' THEN
    v_plano_p_id := '576eb57d-5fb6-4461-9614-a9268b9a50fb'::uuid;
    v_plano_j_id := '0c489373-7035-4b89-8fb4-42ac42796fa5'::uuid;
  ELSE
    v_alertas := v_alertas || jsonb_build_object('tipo','tipo_financiamento_invalido',
      'valor',v_contrato.tipo_financiamento);
  END IF;

  -- Le tipo_operacao oficial dos planos (UTF-8 limpo, fonte soberana)
  SELECT tipo_operacao INTO v_tipo_op_p FROM financeiro_plano_contas WHERE id = v_plano_p_id;
  SELECT tipo_operacao INTO v_tipo_op_j FROM financeiro_plano_contas WHERE id = v_plano_j_id;
  IF v_tipo_op_p IS NULL OR v_tipo_op_j IS NULL THEN
    v_alertas := v_alertas || jsonb_build_object(
      'tipo','plano_conta_sem_tipo_operacao',
      'plano_p_id', v_plano_p_id, 'plano_p_tipo_op', v_tipo_op_p,
      'plano_j_id', v_plano_j_id, 'plano_j_tipo_op', v_tipo_op_j
    );
  END IF;

  v_status := CASE
    WHEN v_parcela.status = 'pago' THEN 'realizado'
    WHEN v_parcela.status = 'pendente' AND v_parcela.data_vencimento > v_today THEN 'programado'
    WHEN v_parcela.status = 'pendente' AND v_parcela.data_vencimento <= v_today THEN 'previsto'
    ELSE 'pendente'
  END;
  -- PR-FIN-DATAS-VENCIMENTO-02B, ponto A: vencimento nao e pagamento.
  -- Lancamento nao realizado nasce e permanece sem data_pagamento.
  v_data_pag := CASE
    WHEN v_status = 'realizado' THEN v_parcela.data_pagamento
    ELSE NULL::date
  END;
  v_desc_p := 'Amortiza' || chr(231) || chr(227) || 'o ' || COALESCE(v_contrato.descricao,'') || ' ' || COALESCE(v_contrato.numero_contrato,'');
  v_desc_j := 'Juros ' || COALESCE(v_contrato.descricao,'') || ' ' || COALESCE(v_contrato.numero_contrato,'');

  v_vt_calc := COALESCE(v_parcela.valor_principal,0) + COALESCE(v_parcela.valor_juros,0);
  IF ROUND(COALESCE(v_parcela.valor_total,0)::numeric, 2) <> ROUND(v_vt_calc::numeric, 2) THEN
    v_alertas := v_alertas || jsonb_build_object('tipo','vt_divergente',
      'vt_cadastrado',v_parcela.valor_total,'vt_calculado',v_vt_calc,
      'diff', v_parcela.valor_total - v_vt_calc);
    IF p_recalcula_vt THEN
      v_acoes := v_acoes || jsonb_build_object('acao','recalcular_vt_parcela',
        'parcela_id',v_parcela.id,'vt_antes',v_parcela.valor_total,'vt_depois',v_vt_calc);
    END IF;
  END IF;

  IF v_status = 'realizado' AND v_parcela.data_pagamento IS NULL THEN
    v_alertas := v_alertas || jsonb_build_object('tipo','pago_sem_data_pagamento');
  END IF;

  IF v_parcela.lancamento_id IS NOT NULL
     AND v_parcela.lancamento_id = v_parcela.lancamento_juros_id THEN
    v_alertas := v_alertas || jsonb_build_object('tipo','fk_redundante',
      'lanc_compartilhado',v_parcela.lancamento_id);
  END IF;

  v_novo_p := jsonb_build_object(
    'valor', v_parcela.valor_principal,
    'descricao', v_desc_p,
    'data_pagamento', v_data_pag,
    'data_competencia', v_contrato.data_contrato,
    'data_vencimento', v_parcela.data_vencimento,
    'status_transacao', v_status,
    'sinal','-1',
    'tipo_operacao', v_tipo_op_p,
    'plano_conta_id', v_plano_p_id,
    'favorecido_id', v_contrato.credor_id,
    'financiamento_id', v_parcela.financiamento_id,
    'origem_lancamento','parcela_financiamento',
    'origem_tipo','parcela_principal',
    'conta_bancaria_id', COALESCE(p_conta_bancaria_id, v_contrato.conta_bancaria_id),
    'cliente_id', v_contrato.cliente_id,
    'fazenda_id', v_contrato.fazenda_id,
    'cenario','realizado',
    'cancelado',false,
    'observacao', 'parcela:' || v_parcela.id::text || ':parcela_principal'
  );
  v_novo_j := jsonb_build_object(
    'valor', v_parcela.valor_juros,
    'descricao', v_desc_j,
    'data_pagamento', v_data_pag,
    'data_competencia', v_contrato.data_contrato,
    'data_vencimento', v_parcela.data_vencimento,
    'status_transacao', v_status,
    'sinal','-1',
    'tipo_operacao', v_tipo_op_j,
    'plano_conta_id', v_plano_j_id,
    'favorecido_id', v_contrato.credor_id,
    'financiamento_id', v_parcela.financiamento_id,
    'origem_lancamento','parcela_financiamento',
    'origem_tipo','parcela_juros',
    'conta_bancaria_id', COALESCE(p_conta_bancaria_id, v_contrato.conta_bancaria_id),
    'cliente_id', v_contrato.cliente_id,
    'fazenda_id', v_contrato.fazenda_id,
    'cenario','realizado',
    'cancelado',false,
    'observacao', 'parcela:' || v_parcela.id::text || ':parcela_juros'
  );

  IF COALESCE(v_parcela.valor_principal,0) > 0 THEN
    v_found_p := false;
    IF v_parcela.lancamento_id IS NOT NULL
       AND v_parcela.lancamento_id IS DISTINCT FROM v_parcela.lancamento_juros_id THEN
      SELECT * INTO v_lanc_p FROM financeiro_lancamentos_v2
        WHERE id = v_parcela.lancamento_id AND cancelado = false;
      v_found_p := FOUND;
    END IF;

    -- C1: lookup por observacao quando FK nao apontou para registro valido (orfao oficial)
    IF NOT v_found_p THEN
      SELECT * INTO v_lanc_p FROM financeiro_lancamentos_v2
        WHERE observacao = 'parcela:' || v_parcela.id::text || ':parcela_principal'
          AND cancelado = false
          AND financiamento_id = v_contrato.id
          AND origem_lancamento = 'parcela_financiamento'
          AND origem_tipo = 'parcela_principal'
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
        LIMIT 1;
      IF FOUND THEN
        v_found_p := true;
        v_acoes := v_acoes || jsonb_build_object(
          'acao','re_vincular_principal',
          'motivo','orfao_oficial_recuperado_por_observacao',
          'lanc_id', v_lanc_p.id::text
        );
      END IF;
    END IF;

    IF NOT v_found_p THEN
      v_acoes := v_acoes || jsonb_build_object('acao','criar_principal',
        'motivo', CASE
          WHEN v_parcela.lancamento_id IS NULL THEN 'lancamento_id_ausente'
          WHEN v_parcela.lancamento_id = v_parcela.lancamento_juros_id THEN 'fk_redundante_com_juros'
          ELSE 'lanc_atual_cancelado_ou_inexistente'
        END,
        'novo_lancamento', v_novo_p,
        'parcela_update', jsonb_build_object('lancamento_id','<new_id>'));
    ELSIF v_lanc_p.origem_tipo IS DISTINCT FROM 'parcela_principal'
          OR v_lanc_p.origem_lancamento IS DISTINCT FROM 'parcela_financiamento' THEN
      v_acoes := v_acoes
        || jsonb_build_object('acao','cancelar_lanc_atual','lanc_id', v_lanc_p.id,
             'valor', v_lanc_p.valor,
             'origem_lancamento_atual', v_lanc_p.origem_lancamento,
             'origem_tipo_atual', v_lanc_p.origem_tipo,
             'motivo','origem_invalida_para_principal')
        || jsonb_build_object('acao','criar_principal','motivo','substituir_lanc_invalido',
             'novo_lancamento', v_novo_p,
             'parcela_update', jsonb_build_object('lancamento_id','<new_id>'));
    ELSE
      IF ROUND(v_lanc_p.valor::numeric,2) <> ROUND(v_parcela.valor_principal::numeric,2) THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_principal',
          'lanc_id',v_lanc_p.id,'campo','valor',
          'antes',v_lanc_p.valor,'depois',v_parcela.valor_principal);
      END IF;
      IF v_lanc_p.favorecido_id IS DISTINCT FROM v_contrato.credor_id THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_principal',
          'lanc_id',v_lanc_p.id,'campo','favorecido_id',
          'antes',v_lanc_p.favorecido_id,'depois',v_contrato.credor_id);
      END IF;
      IF v_lanc_p.status_transacao IS DISTINCT FROM v_status THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_principal',
          'lanc_id',v_lanc_p.id,'campo','status_transacao',
          'antes',v_lanc_p.status_transacao,'depois',v_status);
      END IF;
      IF v_lanc_p.data_pagamento IS DISTINCT FROM v_data_pag THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_principal',
          'lanc_id',v_lanc_p.id,'campo','data_pagamento',
          'antes',v_lanc_p.data_pagamento,'depois',v_data_pag);
      END IF;
      -- PR-FIN-DATAS-04A: vencimento contratual da parcela (fonte soberana). NULL-safe.
      IF v_lanc_p.data_vencimento IS DISTINCT FROM v_parcela.data_vencimento THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_principal',
          'lanc_id',v_lanc_p.id,'campo','data_vencimento',
          'antes',v_lanc_p.data_vencimento,'depois',v_parcela.data_vencimento);
      END IF;
      IF v_lanc_p.financiamento_id IS DISTINCT FROM v_parcela.financiamento_id THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_principal',
          'lanc_id',v_lanc_p.id,'campo','financiamento_id',
          'antes',v_lanc_p.financiamento_id,'depois',v_parcela.financiamento_id);
      END IF;
      IF v_lanc_p.plano_conta_id IS DISTINCT FROM v_plano_p_id THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_principal',
          'lanc_id',v_lanc_p.id,'campo','plano_conta_id',
          'antes',v_lanc_p.plano_conta_id,'depois',v_plano_p_id);
      END IF;
      -- PR-FIN-CPR-01 (1b): propaga conta bancária no principal (nunca sobrescreve com NULL).
      IF v_conta_desejada IS NOT NULL
         AND v_lanc_p.conta_bancaria_id IS DISTINCT FROM v_conta_desejada THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_principal',
          'lanc_id', v_lanc_p.id, 'campo','conta_bancaria_id',
          'antes', to_jsonb(v_lanc_p.conta_bancaria_id),
          'depois', to_jsonb(v_conta_desejada));
      END IF;
    END IF;
  ELSE
    IF v_parcela.lancamento_id IS NOT NULL THEN
      -- C5: cancelar lancamento atual ANTES de limpar FK (impede orfao)
      IF EXISTS (SELECT 1 FROM financeiro_lancamentos_v2
                 WHERE id = v_parcela.lancamento_id AND cancelado = false) THEN
        v_acoes := v_acoes || jsonb_build_object('acao','cancelar_lanc_atual',
          'motivo','vp_zero','lanc_id',v_parcela.lancamento_id);
      END IF;
      v_acoes := v_acoes || jsonb_build_object('acao','limpar_fk_principal',
        'motivo','vp_zero','lanc_id_atual',v_parcela.lancamento_id,
        'parcela_update', jsonb_build_object('lancamento_id', null));
    END IF;
  END IF;

  IF COALESCE(v_parcela.valor_juros,0) > 0 THEN
    v_found_j := false;
    IF v_parcela.lancamento_juros_id IS NOT NULL THEN
      SELECT * INTO v_lanc_j FROM financeiro_lancamentos_v2
        WHERE id = v_parcela.lancamento_juros_id AND cancelado = false;
      v_found_j := FOUND;
    END IF;

    -- C1: lookup por observacao quando FK nao apontou para registro valido (orfao oficial)
    IF NOT v_found_j THEN
      SELECT * INTO v_lanc_j FROM financeiro_lancamentos_v2
        WHERE observacao = 'parcela:' || v_parcela.id::text || ':parcela_juros'
          AND cancelado = false
          AND financiamento_id = v_contrato.id
          AND origem_lancamento = 'parcela_financiamento'
          AND origem_tipo = 'parcela_juros'
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
        LIMIT 1;
      IF FOUND THEN
        v_found_j := true;
        v_acoes := v_acoes || jsonb_build_object(
          'acao','re_vincular_juros',
          'motivo','orfao_oficial_recuperado_por_observacao',
          'lanc_id', v_lanc_j.id::text
        );
      END IF;
    END IF;

    IF NOT v_found_j THEN
      v_acoes := v_acoes || jsonb_build_object('acao','criar_juros',
        'motivo', CASE
          WHEN v_parcela.lancamento_juros_id IS NULL THEN 'lancamento_juros_id_ausente'
          ELSE 'lanc_juros_atual_cancelado_ou_inexistente'
        END,
        'novo_lancamento', v_novo_j,
        'parcela_update', jsonb_build_object('lancamento_juros_id','<new_id>'));
    ELSIF v_lanc_j.origem_tipo IS DISTINCT FROM 'parcela_juros'
          OR v_lanc_j.origem_lancamento IS DISTINCT FROM 'parcela_financiamento' THEN
      v_acoes := v_acoes
        || jsonb_build_object('acao','cancelar_lanc_atual','lanc_id', v_lanc_j.id,
             'valor', v_lanc_j.valor,
             'origem_lancamento_atual', v_lanc_j.origem_lancamento,
             'origem_tipo_atual', v_lanc_j.origem_tipo,
             'motivo','origem_invalida_para_juros')
        || jsonb_build_object('acao','criar_juros','motivo','substituir_lanc_invalido',
             'novo_lancamento', v_novo_j,
             'parcela_update', jsonb_build_object('lancamento_juros_id','<new_id>'));
    ELSE
      IF ROUND(v_lanc_j.valor::numeric,2) <> ROUND(v_parcela.valor_juros::numeric,2) THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_juros',
          'lanc_id',v_lanc_j.id,'campo','valor',
          'antes',v_lanc_j.valor,'depois',v_parcela.valor_juros);
      END IF;
      IF v_lanc_j.favorecido_id IS DISTINCT FROM v_contrato.credor_id THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_juros',
          'lanc_id',v_lanc_j.id,'campo','favorecido_id',
          'antes',v_lanc_j.favorecido_id,'depois',v_contrato.credor_id);
      END IF;
      IF v_lanc_j.status_transacao IS DISTINCT FROM v_status THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_juros',
          'lanc_id',v_lanc_j.id,'campo','status_transacao',
          'antes',v_lanc_j.status_transacao,'depois',v_status);
      END IF;
      IF v_lanc_j.data_pagamento IS DISTINCT FROM v_data_pag THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_juros',
          'lanc_id',v_lanc_j.id,'campo','data_pagamento',
          'antes',v_lanc_j.data_pagamento,'depois',v_data_pag);
      END IF;
      -- PR-FIN-DATAS-04A: vencimento contratual da parcela (fonte soberana). NULL-safe.
      IF v_lanc_j.data_vencimento IS DISTINCT FROM v_parcela.data_vencimento THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_juros',
          'lanc_id',v_lanc_j.id,'campo','data_vencimento',
          'antes',v_lanc_j.data_vencimento,'depois',v_parcela.data_vencimento);
      END IF;
      IF v_lanc_j.financiamento_id IS DISTINCT FROM v_parcela.financiamento_id THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_juros',
          'lanc_id',v_lanc_j.id,'campo','financiamento_id',
          'antes',v_lanc_j.financiamento_id,'depois',v_parcela.financiamento_id);
      END IF;
      IF v_lanc_j.plano_conta_id IS DISTINCT FROM v_plano_j_id THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_juros',
          'lanc_id',v_lanc_j.id,'campo','plano_conta_id',
          'antes',v_lanc_j.plano_conta_id,'depois',v_plano_j_id);
      END IF;
      -- PR-FIN-CPR-01 (1c): propaga conta bancária nos juros (nunca sobrescreve com NULL).
      IF v_conta_desejada IS NOT NULL
         AND v_lanc_j.conta_bancaria_id IS DISTINCT FROM v_conta_desejada THEN
        v_acoes := v_acoes || jsonb_build_object('acao','atualizar_juros',
          'lanc_id', v_lanc_j.id, 'campo','conta_bancaria_id',
          'antes', to_jsonb(v_lanc_j.conta_bancaria_id),
          'depois', to_jsonb(v_conta_desejada));
      END IF;
    END IF;
  ELSE
    IF v_parcela.lancamento_juros_id IS NOT NULL THEN
      -- C5: cancelar lancamento atual ANTES de limpar FK (impede orfao)
      IF EXISTS (SELECT 1 FROM financeiro_lancamentos_v2
                 WHERE id = v_parcela.lancamento_juros_id AND cancelado = false) THEN
        v_acoes := v_acoes || jsonb_build_object('acao','cancelar_lanc_atual',
          'motivo','vj_zero','lanc_id',v_parcela.lancamento_juros_id);
      END IF;
      v_acoes := v_acoes || jsonb_build_object('acao','limpar_fk_juros',
        'motivo','vj_zero','lanc_id_atual',v_parcela.lancamento_juros_id,
        'parcela_update', jsonb_build_object('lancamento_juros_id', null));
    END IF;
  END IF;

  FOR v_lixo IN
    SELECT * FROM financeiro_lancamentos_v2 lv
    WHERE lv.cancelado = false
      AND lv.id IS DISTINCT FROM v_parcela.lancamento_id
      AND lv.id IS DISTINCT FROM v_parcela.lancamento_juros_id
      AND (
        (
          lv.financiamento_id = v_parcela.financiamento_id
          AND lv.origem_lancamento = 'financiamento'
          AND lv.origem_tipo = 'financiamento_parcela'
          AND lv.data_pagamento = COALESCE(v_parcela.data_pagamento, v_parcela.data_vencimento)
        )
        OR
        (
          lv.observacao = v_parcela.id::text
          AND lv.origem_lancamento = 'parcela_financiamento'
          AND lv.origem_tipo IN ('parcela_principal','parcela_juros')
        )
      )
  LOOP
    IF v_lixo.origem_lancamento = 'financiamento' AND v_lixo.origem_tipo = 'financiamento_parcela' THEN
      v_lixo_acao := 'cancelar_totalizado_relacionado';
      v_lixo_motivo := 'origem_financiamento_parcela_substituida';
    ELSE
      v_lixo_acao := 'cancelar_lanc_legado_observacao_parcela';
      v_lixo_motivo := 'observacao_parcela_legada_orfa';
    END IF;
    v_acoes := v_acoes || jsonb_build_object(
      'acao', v_lixo_acao,
      'lanc_id', v_lixo.id,
      'valor', v_lixo.valor,
      'origem_lancamento_atual', v_lixo.origem_lancamento,
      'origem_tipo_atual', v_lixo.origem_tipo,
      'observacao_atual', v_lixo.observacao,
      'motivo', v_lixo_motivo);
  END LOOP;

  -- BLOCO DE EXECUCAO REAL
  IF NOT p_dry_run THEN
    v_audit_tag := '[motor:' || to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS') || ':parcela:' || v_parcela.id::text || ']';
    BEGIN
      FOR v_acao_iter IN SELECT * FROM jsonb_array_elements(v_acoes)
      LOOP
        v_acao_tipo := v_acao_iter->>'acao';

        IF v_acao_tipo = 'criar_principal' THEN
          v_novo := v_acao_iter->'novo_lancamento';
          INSERT INTO financeiro_lancamentos_v2 (
            valor, descricao, data_pagamento, data_competencia, data_vencimento, status_transacao,
            sinal, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro,
            escopo_negocio, plano_conta_id, favorecido_id, financiamento_id,
            origem_lancamento, origem_tipo, conta_bancaria_id, cliente_id, fazenda_id,
            cenario, cancelado, observacao, sem_movimentacao_caixa
          ) VALUES (
            (v_novo->>'valor')::numeric,
            v_novo->>'descricao',
            (v_novo->>'data_pagamento')::date,
            (v_novo->>'data_competencia')::date,
            (v_novo->>'data_vencimento')::date,
            v_novo->>'status_transacao',
            v_novo->>'sinal', v_novo->>'tipo_operacao',
            v_novo->>'macro_custo', v_novo->>'grupo_custo',
            v_novo->>'centro_custo', v_novo->>'subcentro',
            v_novo->>'escopo_negocio',
            NULLIF(v_novo->>'plano_conta_id','')::uuid,
            NULLIF(v_novo->>'favorecido_id','')::uuid,
            NULLIF(v_novo->>'financiamento_id','')::uuid,
            v_novo->>'origem_lancamento', v_novo->>'origem_tipo',
            NULLIF(v_novo->>'conta_bancaria_id','')::uuid,
            NULLIF(v_novo->>'cliente_id','')::uuid,
            NULLIF(v_novo->>'fazenda_id','')::uuid,
            v_novo->>'cenario',
            (v_novo->>'cancelado')::boolean,
            v_novo->>'observacao',
            false
          ) RETURNING id INTO v_new_id;
          UPDATE financiamento_parcelas SET lancamento_id = v_new_id WHERE id = p_parcela_id;
          v_ids_criados := v_ids_criados || jsonb_build_object('tipo','principal','id',v_new_id::text,'valor',(v_novo->>'valor')::numeric);
          v_parcela_updates := v_parcela_updates || jsonb_build_object('lancamento_id', v_new_id::text);

        ELSIF v_acao_tipo = 'criar_juros' THEN
          v_novo := v_acao_iter->'novo_lancamento';
          INSERT INTO financeiro_lancamentos_v2 (
            valor, descricao, data_pagamento, data_competencia, data_vencimento, status_transacao,
            sinal, tipo_operacao, macro_custo, grupo_custo, centro_custo, subcentro,
            escopo_negocio, plano_conta_id, favorecido_id, financiamento_id,
            origem_lancamento, origem_tipo, conta_bancaria_id, cliente_id, fazenda_id,
            cenario, cancelado, observacao, sem_movimentacao_caixa
          ) VALUES (
            (v_novo->>'valor')::numeric,
            v_novo->>'descricao',
            (v_novo->>'data_pagamento')::date,
            (v_novo->>'data_competencia')::date,
            (v_novo->>'data_vencimento')::date,
            v_novo->>'status_transacao',
            v_novo->>'sinal', v_novo->>'tipo_operacao',
            v_novo->>'macro_custo', v_novo->>'grupo_custo',
            v_novo->>'centro_custo', v_novo->>'subcentro',
            v_novo->>'escopo_negocio',
            NULLIF(v_novo->>'plano_conta_id','')::uuid,
            NULLIF(v_novo->>'favorecido_id','')::uuid,
            NULLIF(v_novo->>'financiamento_id','')::uuid,
            v_novo->>'origem_lancamento', v_novo->>'origem_tipo',
            NULLIF(v_novo->>'conta_bancaria_id','')::uuid,
            NULLIF(v_novo->>'cliente_id','')::uuid,
            NULLIF(v_novo->>'fazenda_id','')::uuid,
            v_novo->>'cenario',
            (v_novo->>'cancelado')::boolean,
            v_novo->>'observacao',
            false
          ) RETURNING id INTO v_new_id;
          UPDATE financiamento_parcelas SET lancamento_juros_id = v_new_id WHERE id = p_parcela_id;
          v_ids_criados := v_ids_criados || jsonb_build_object('tipo','juros','id',v_new_id::text,'valor',(v_novo->>'valor')::numeric);
          v_parcela_updates := v_parcela_updates || jsonb_build_object('lancamento_juros_id', v_new_id::text);

        ELSIF v_acao_tipo IN ('atualizar_principal','atualizar_juros') THEN
          v_alvo := (v_acao_iter->>'lanc_id')::uuid;
          v_campo := v_acao_iter->>'campo';
          v_depois := v_acao_iter->>'depois';
          IF v_campo = 'valor' THEN
            UPDATE financeiro_lancamentos_v2 SET valor = NULLIF(v_depois,'')::numeric WHERE id = v_alvo;
          ELSIF v_campo = 'favorecido_id' THEN
            UPDATE financeiro_lancamentos_v2 SET favorecido_id = NULLIF(v_depois,'')::uuid WHERE id = v_alvo;
          ELSIF v_campo = 'status_transacao' THEN
            UPDATE financeiro_lancamentos_v2 SET status_transacao = v_depois WHERE id = v_alvo;
          ELSIF v_campo = 'data_pagamento' THEN
            -- 02B ponto C: quem deriva ano_mes e o trigger 02E, a partir da competencia.
            UPDATE financeiro_lancamentos_v2 SET data_pagamento = NULLIF(v_depois,'')::date WHERE id = v_alvo;
          ELSIF v_campo = 'financiamento_id' THEN
            UPDATE financeiro_lancamentos_v2 SET financiamento_id = NULLIF(v_depois,'')::uuid WHERE id = v_alvo;
          ELSIF v_campo = 'plano_conta_id' THEN
            UPDATE financeiro_lancamentos_v2 SET plano_conta_id = NULLIF(v_depois,'')::uuid WHERE id = v_alvo;
          ELSIF v_campo = 'conta_bancaria_id' THEN
            UPDATE financeiro_lancamentos_v2 SET conta_bancaria_id = NULLIF(v_depois,'')::uuid WHERE id = v_alvo;
          ELSIF v_campo = 'data_vencimento' THEN
            UPDATE financeiro_lancamentos_v2 SET data_vencimento = NULLIF(v_depois,'')::date WHERE id = v_alvo;
          END IF;
          v_ids_atualizados := v_ids_atualizados || jsonb_build_object(
            'id', v_alvo::text, 'campo', v_campo,
            'antes', v_acao_iter->'antes', 'depois', v_acao_iter->'depois');

        ELSIF v_acao_tipo IN ('cancelar_lanc_atual','cancelar_totalizado_relacionado','cancelar_lanc_legado_observacao_parcela') THEN
          v_alvo := (v_acao_iter->>'lanc_id')::uuid;
          UPDATE financeiro_lancamentos_v2
            SET cancelado = true,
                observacao = v_audit_tag || ' cancel:' || (v_acao_iter->>'motivo') || ' | ' || COALESCE(observacao,'')
            WHERE id = v_alvo AND cancelado = false;
          GET DIAGNOSTICS v_rc = ROW_COUNT;
          IF v_rc <> 1 THEN
            RAISE EXCEPTION 'cancelamento_falhou lanc_id=% rc=% acao_tipo=%', v_alvo, v_rc, v_acao_tipo
              USING HINT = 'Nao limpar FK enquanto cancelamento nao confirmado';
          END IF;
          v_ids_cancelados := v_ids_cancelados || jsonb_build_object(
            'id', v_alvo::text, 'motivo', v_acao_iter->>'motivo',
            'valor', v_acao_iter->'valor', 'acao_origem', v_acao_tipo);

        ELSIF v_acao_tipo = 're_vincular_principal' THEN
          v_alvo := (v_acao_iter->>'lanc_id')::uuid;
          UPDATE financiamento_parcelas SET lancamento_id = v_alvo WHERE id = p_parcela_id;
          GET DIAGNOSTICS v_rc = ROW_COUNT;
          IF v_rc <> 1 THEN
            RAISE EXCEPTION 're_vincular_principal_falhou parcela=% lanc=% rc=%', p_parcela_id, v_alvo, v_rc;
          END IF;
          v_parcela_updates := v_parcela_updates || jsonb_build_object('lancamento_id', v_alvo::text);

        ELSIF v_acao_tipo = 're_vincular_juros' THEN
          v_alvo := (v_acao_iter->>'lanc_id')::uuid;
          UPDATE financiamento_parcelas SET lancamento_juros_id = v_alvo WHERE id = p_parcela_id;
          GET DIAGNOSTICS v_rc = ROW_COUNT;
          IF v_rc <> 1 THEN
            RAISE EXCEPTION 're_vincular_juros_falhou parcela=% lanc=% rc=%', p_parcela_id, v_alvo, v_rc;
          END IF;
          v_parcela_updates := v_parcela_updates || jsonb_build_object('lancamento_juros_id', v_alvo::text);

        ELSIF v_acao_tipo = 'limpar_fk_principal' THEN
          UPDATE financiamento_parcelas SET lancamento_id = NULL WHERE id = p_parcela_id;
          v_parcela_updates := v_parcela_updates || jsonb_build_object('lancamento_id', null);

        ELSIF v_acao_tipo = 'limpar_fk_juros' THEN
          UPDATE financiamento_parcelas SET lancamento_juros_id = NULL WHERE id = p_parcela_id;
          v_parcela_updates := v_parcela_updates || jsonb_build_object('lancamento_juros_id', null);

        ELSIF v_acao_tipo = 'recalcular_vt_parcela' THEN
          UPDATE financiamento_parcelas
            SET valor_total = (v_acao_iter->>'vt_depois')::numeric
            WHERE id = p_parcela_id;
          v_parcela_updates := v_parcela_updates || jsonb_build_object('valor_total', (v_acao_iter->>'vt_depois')::numeric);
        END IF;

        v_acoes_executadas := v_acoes_executadas || v_acao_iter;
      END LOOP;

      v_executado := jsonb_build_object(
        'status','sucesso',
        'audit_tag', v_audit_tag,
        'qtd_acoes_executadas', jsonb_array_length(v_acoes_executadas),
        'ids_criados', v_ids_criados,
        'ids_atualizados', v_ids_atualizados,
        'ids_cancelados', v_ids_cancelados,
        'parcela_updates', v_parcela_updates
      );

    EXCEPTION
      WHEN OTHERS THEN
        RAISE;
    END;
  END IF;

  RETURN jsonb_build_object(
    'parcela_id', p_parcela_id,
    'financiamento_id', v_parcela.financiamento_id,
    'contrato', jsonb_build_object(
      'numero_contrato', v_contrato.numero_contrato,
      'descricao', v_contrato.descricao,
      'tipo', v_contrato.tipo_financiamento,
      'credor_id', v_contrato.credor_id),
    'parcela', jsonb_build_object(
      'numero_parcela', v_parcela.numero_parcela,
      'valor_principal', v_parcela.valor_principal,
      'valor_juros', v_parcela.valor_juros,
      'valor_total_cadastrado', v_parcela.valor_total,
      'valor_total_calculado', v_vt_calc,
      'status_parcela', v_parcela.status,
      'data_vencimento', v_parcela.data_vencimento,
      'data_pagamento_parcela', v_parcela.data_pagamento),
    'inputs_resolvidos', jsonb_build_object(
      'status_transacao', v_status,
      'data_pagamento_lanc', v_data_pag,
      'plano_conta_principal', v_plano_p_id,
      'plano_conta_juros', v_plano_j_id),
    'dry_run', p_dry_run,
    'p_recalcula_vt', p_recalcula_vt,
    'alertas', v_alertas,
    'acoes', v_acoes,
    'executado', v_executado,
    'resumo', jsonb_build_object(
      'qtd_acoes', jsonb_array_length(v_acoes),
      'qtd_alertas', jsonb_array_length(v_alertas),
      'reconciliada', (jsonb_array_length(v_acoes) = 0 AND jsonb_array_length(v_alertas) = 0))
  );
END;




$function$;
$DDL$;

  v_md5      text;
  v_acl      text;
  v_n        int;
  v_estado   text;
  v_fp_antes text;
  v_fp_pos   text;
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout','15s',true);
  PERFORM pg_catalog.set_config('statement_timeout','120s',true);

  -- =====================================================================
  -- PRE-CHECKS FATAIS DO AMBIENTE (estado 4: aborta ANTES do replace)
  -- =====================================================================

  -- E1 trigger 02E presente, habilitado e com o corpo auditado
  SELECT count(*) INTO v_n
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND n.nspname = 'public'
     AND c.relname = 'financeiro_lancamentos_v2'
     AND t.tgname = 'trg_00_ano_mes_from_competencia'
     AND t.tgenabled = 'O';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '02B E1: trigger 02E ausente ou desabilitado — ano_mes nao seria derivado';
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_ano_mes_from_competencia'
     AND md5(p.prosrc) = '74488066033372765adf6f7b1818ad2b';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '02B E2: corpo do 02E divergente — a autoridade de ano_mes nao e a auditada';
  END IF;

  -- E3 P0 de RLS publicado em 29833904 esta vigente
  SELECT count(*) INTO v_n
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = ANY(c_tabelas);
  IF v_n <> 11 THEN
    RAISE EXCEPTION '02B E3: esperava as 11 policies nominais do PR-SEC-RLS-FINANCIAMENTOS-01, encontrei %', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = ANY(c_tabelas)
     AND (p.polcmd = '*' OR 0 = ANY(p.polroles)
       OR coalesce(pg_get_expr(p.polqual, p.polrelid),'') = 'true'
       OR coalesce(pg_get_expr(p.polwithcheck, p.polrelid),'') = 'true');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '02B E4: existe policy permissiva nas tabelas de financiamento (%)', v_n;
  END IF;

  -- E5 colunas de data que o ponto A e B pressupoem
  SELECT count(*) INTO v_n
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'financeiro_lancamentos_v2'
     AND NOT a.attisdropped AND NOT a.attnotnull
     AND a.attname IN ('ano_mes','data_pagamento','data_vencimento','data_competencia');
  IF v_n <> 4 THEN
    RAISE EXCEPTION '02B E5: colunas de data de financeiro_lancamentos_v2 nao estao no shape esperado (%)', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'financiamentos'
     AND NOT a.attisdropped AND a.attname = 'data_contrato'
     AND pg_catalog.format_type(a.atttypid, a.atttypmod) = 'date';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '02B E6: financiamentos.data_contrato ausente — competencia da captacao indefinida';
  END IF;

  -- =====================================================================
  -- ATRIBUTOS E ESTADO DA FUNCAO
  -- =====================================================================
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
   WHERE n.nspname = 'public' AND p.proname = 'fn_reconciliar_parcela_financiamento'
     AND pg_catalog.pg_get_function_identity_arguments(p.oid) = c_assinatura
     AND pg_catalog.pg_get_function_result(p.oid) = 'jsonb'
     AND l.lanname = 'plpgsql'
     AND NOT p.prosecdef
     AND p.proconfig IS NULL
     AND pg_get_userbyid(p.proowner) = 'postgres';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '02B E7: assinatura/retorno/linguagem/SECDEF/search_path/owner divergentes';
  END IF;

  IF obj_description(
       (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'fn_reconciliar_parcela_financiamento'), 'pg_proc') IS NOT NULL THEN
    RAISE EXCEPTION '02B E8: funcao passou a ter COMMENT — estado nao auditado';
  END IF;

  SELECT md5(coalesce((SELECT string_agg(coalesce(pg_get_userbyid(a.grantee),'PUBLIC')||':'||a.privilege_type,'|'
              ORDER BY coalesce(pg_get_userbyid(a.grantee),'PUBLIC'), a.privilege_type)
           FROM aclexplode(p.proacl) a),''))
    INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_reconciliar_parcela_financiamento';
  IF v_acl <> c_md5_acl THEN
    RAISE EXCEPTION '02B E9: ACL da funcao divergente (md5=%). Nao altero ACL nesta frente.', v_acl;
  END IF;

  SELECT md5(p.prosrc) INTO v_md5
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_reconciliar_parcela_financiamento';

  IF v_md5 = c_md5_final THEN
    RAISE NOTICE '02B: estado final ja vigente. NO-OP verdadeiro — nenhum comando emitido.';
    RETURN;
  ELSIF v_md5 <> c_md5_origem THEN
    RAISE EXCEPTION '02B E10: corpo divergente (md5=%). Nao uso CREATE OR REPLACE cego.', v_md5;
  END IF;

  -- Fingerprint historico: esta migration nao pode tocar em linha alguma
  SELECT (SELECT count(*) FROM public.financiamentos)::text || '/'
      || (SELECT count(*) FROM public.financiamento_parcelas)::text || '/'
      || (SELECT count(*) FROM public.financeiro_lancamentos_v2)::text || '/'
      || (SELECT count(*) FROM public.financeiro_lancamentos_v2
           WHERE origem_lancamento = 'parcela_financiamento')::text || '/'
      || (SELECT count(*) FROM public.financeiro_lancamentos_v2
           WHERE origem_lancamento = 'parcela_financiamento' AND cancelado)::text
    INTO v_fp_antes;

  -- =====================================================================
  -- CONVERSAO (estado 1)
  -- =====================================================================
  EXECUTE v_ddl;

  -- =====================================================================
  -- POS-CHECKS FATAIS
  -- =====================================================================
  SELECT md5(p.prosrc) INTO v_md5
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_reconciliar_parcela_financiamento';
  IF v_md5 <> c_md5_final THEN
    RAISE EXCEPTION '02B Q1: corpo final divergente (md5=%)', v_md5;
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
   WHERE n.nspname = 'public' AND p.proname = 'fn_reconciliar_parcela_financiamento'
     AND pg_catalog.pg_get_function_identity_arguments(p.oid) = c_assinatura
     AND pg_catalog.pg_get_function_result(p.oid) = 'jsonb'
     AND l.lanname = 'plpgsql'
     AND NOT p.prosecdef
     AND p.proconfig IS NULL
     AND pg_get_userbyid(p.proowner) = 'postgres';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '02B Q2: atributos da funcao mudaram apos o replace';
  END IF;

  SELECT md5(coalesce((SELECT string_agg(coalesce(pg_get_userbyid(a.grantee),'PUBLIC')||':'||a.privilege_type,'|'
              ORDER BY coalesce(pg_get_userbyid(a.grantee),'PUBLIC'), a.privilege_type)
           FROM aclexplode(p.proacl) a),''))
    INTO v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_reconciliar_parcela_financiamento';
  IF v_acl <> c_md5_acl THEN
    RAISE EXCEPTION '02B Q3: ACL da funcao mudou (md5=%)', v_acl;
  END IF;

  -- Q4 unicidade: nenhuma sobrecarga criada
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_reconciliar_parcela_financiamento';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '02B Q4: existem % versoes da funcao', v_n;
  END IF;

  -- Q5 o bloco de limpeza de totalizadores legados continua byte-identico
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_reconciliar_parcela_financiamento'
     AND p.prosrc LIKE '%AND lv.data_pagamento = COALESCE(v_parcela.data_pagamento, v_parcela.data_vencimento)%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '02B Q5: bloco de limpeza de totalizadores legados foi alterado';
  END IF;

  -- Q6 o casamento estrutural continua intacto
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_reconciliar_parcela_financiamento'
     AND p.prosrc LIKE '%WHERE id = v_parcela.lancamento_id AND cancelado = false%'
     AND p.prosrc LIKE '%parcela:%' AND p.prosrc LIKE '%:parcela_principal%'
     AND p.prosrc LIKE '%:parcela_juros%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '02B Q6: casamento estrutural (FK + marcador de observacao) foi alterado';
  END IF;

  -- Q7 competencia segue vindo do contrato
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_reconciliar_parcela_financiamento'
     AND p.prosrc LIKE '%''data_competencia'', v_contrato.data_contrato%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '02B Q7: competencia deixou de vir de financiamentos.data_contrato';
  END IF;

  -- Q8 nenhuma escrita executavel de ano_mes sobrou
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
         LATERAL unnest(string_to_array(p.prosrc, chr(10))) AS linha
   WHERE n.nspname = 'public' AND p.proname = 'fn_reconciliar_parcela_financiamento'
     AND linha LIKE '%ano_mes%' AND btrim(linha) NOT LIKE '--%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '02B Q8: sobrou escrita executavel de ano_mes na funcao (% linhas)', v_n;
  END IF;

  -- Q9 zero DML
  SELECT (SELECT count(*) FROM public.financiamentos)::text || '/'
      || (SELECT count(*) FROM public.financiamento_parcelas)::text || '/'
      || (SELECT count(*) FROM public.financeiro_lancamentos_v2)::text || '/'
      || (SELECT count(*) FROM public.financeiro_lancamentos_v2
           WHERE origem_lancamento = 'parcela_financiamento')::text || '/'
      || (SELECT count(*) FROM public.financeiro_lancamentos_v2
           WHERE origem_lancamento = 'parcela_financiamento' AND cancelado)::text
    INTO v_fp_pos;
  IF v_fp_pos <> v_fp_antes THEN
    RAISE EXCEPTION '02B Q9: contagens mudaram (% -> %)', v_fp_antes, v_fp_pos;
  END IF;

  RAISE NOTICE '02B: aplicado. Pontos A/B/C. Casamento e competencia intocados. Fingerprint: %', v_fp_pos;
END
$BODY$;
$PAYLOAD$;
  v_hash text;
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout','15s',true);
  PERFORM pg_catalog.set_config('statement_timeout','120s',true);
  v_hash := encode(pg_catalog.sha256(pg_catalog.convert_to(v_payload,'UTF8')),'hex');
  IF v_hash <> c_esperado THEN
    RAISE EXCEPTION '02B: payload adulterado. sha256 esperado=% obtido=%. Nada foi executado.',
      c_esperado, v_hash;
  END IF;
  EXECUTE v_payload;
END
$WRAP$;
