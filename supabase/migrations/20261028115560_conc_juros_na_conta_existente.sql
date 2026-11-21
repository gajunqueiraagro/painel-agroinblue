-- CONC-DESCONCILIAR-EDSON-01 · JUROS-DUP (FILA 18/11 10:24, Gabriel/contador): juros e multa de pagamento em atraso vão em
-- "Despesas Financeiras Administrativo" (bb93569c, no plano padrão desde 21/09). A "Juros/multa por atraso" (f618f5d4) que a 115540 criou é
-- PARALELA a ela → (1) o gesto "É juros/multa" do casar passa a lançar na existente; (2) toda linha na nova vai para a existente (hoje as 6
-- do JUROS-6); (3) a nova é INATIVADA (não se apaga; o desfazer está no relatório). "Desconto obtido" fica: não havia equivalente.
-- A função é o bloco da 115550 copiado, só com a conta trocada.

-- (1) a linha de juros da NF nasce na conta existente
CREATE OR REPLACE FUNCTION public._fn_conc_linha_da_nf(p_nf uuid, p_tipo text, p_valor numeric, p_data date, p_extrato_id uuid, p_motivo text, p_plano_conta_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE l public.financeiro_lancamentos_v2; v_plano uuid; v_novo uuid; v_uid uuid := auth.uid(); v_nro text; v_conta uuid;
  v_desc boolean := p_tipo = 'desconto'; v_taxa boolean := p_tipo = 'taxa'; v_valor numeric := round(abs(coalesce(p_valor, 0)), 2);
  v_motivo text := coalesce(nullif(btrim(p_motivo), ''), CASE WHEN p_tipo = 'desconto' THEN 'desconto' WHEN p_tipo = 'taxa' THEN 'taxa' ELSE 'juros/multa' END);
BEGIN
  IF p_tipo IS NULL OR p_tipo NOT IN ('juros', 'desconto', 'taxa') OR v_valor <= 0 THEN
    RAISE EXCEPTION 'Linha da NF: tipo ou valor inválido (% / %). Nada foi gravado.', coalesce(p_tipo, '-'), coalesce(p_valor::text, '-') USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = p_nf;
  IF NOT FOUND OR l.cancelado IS TRUE OR l.tipo_operacao NOT LIKE '2-%' THEN
    RAISE EXCEPTION 'A linha de juros/taxa/desconto só nasce de uma nota de saída viva. Nada foi gravado.' USING ERRCODE = 'P0001', DETAIL = p_nf::text;
  END IF;
  IF v_taxa THEN
    -- FILA 18/11 09:22: "outra despesa sem nota (taxa)" — a conta é a que o operador escolheu: de saída, ativa, do plano deste cliente
    SELECT pc.id INTO v_plano FROM public.financeiro_plano_contas pc
     WHERE pc.id = p_plano_conta_id AND pc.ativo AND pc.tipo_operacao LIKE '2-%' AND (pc.cliente_id IS NULL OR pc.cliente_id = l.cliente_id);
    IF v_plano IS NULL THEN
      RAISE EXCEPTION 'Escolha a conta (subcentro) de saída da taxa. Nada foi gravado.' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    SELECT pc.id INTO v_plano FROM public.financeiro_plano_contas pc
     WHERE pc.cliente_id IS NULL AND pc.ativo AND pc.subcentro = CASE WHEN v_desc THEN 'Desconto obtido' ELSE 'Despesas Financeiras Administrativo' END;
  END IF;
  IF v_plano IS NULL THEN
    RAISE EXCEPTION 'A conta "%" não está no plano de contas. Nada foi gravado.', CASE WHEN v_desc THEN 'Desconto obtido' ELSE 'Despesas Financeiras Administrativo' END
      USING ERRCODE = 'P0001';
  END IF;
  -- o nº da NF: o do lançamento; sem ele, o da nota anexada
  v_nro := coalesce(nullif(btrim(l.numero_documento), ''),
                    (SELECT nullif(btrim(d.numero), '') FROM public.vw_lancamento_documentos d
                      WHERE d.lancamento_id = l.id AND d.cancelado IS NOT TRUE AND d.especie LIKE 'nf%' AND nullif(btrim(d.numero), '') IS NOT NULL
                      ORDER BY d.uploaded_em NULLS LAST LIMIT 1),
                    's/nº');
  v_conta := coalesce(l.conta_bancaria_id, (SELECT e.conta_bancaria_id FROM public.extrato_bancario_v2 e WHERE e.id = p_extrato_id));
  INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, ano_mes, valor, tipo_operacao, sinal, descricao, status_transacao,
      data_pagamento, conta_bancaria_id, conta_destino_id, data_competencia, data_vencimento, plano_conta_id, favorecido_id, cenario,
      origem_lancamento, origem_tipo, numero_documento, sem_movimentacao_caixa, forma_pagamento, observacao, created_by, updated_by)
  VALUES (l.cliente_id, l.fazenda_id, to_char(p_data, 'YYYY-MM'), v_valor,
          CASE WHEN v_desc THEN '1-Entradas' ELSE l.tipo_operacao END, CASE WHEN v_desc THEN '1' ELSE '-1' END,
          format('%s da NF nº %s', CASE WHEN v_desc THEN 'Desconto obtido' WHEN v_taxa THEN 'Taxa (sem nota)' ELSE 'Juros/multa' END, v_nro), 'realizado',
          p_data, CASE WHEN v_desc THEN NULL ELSE v_conta END, CASE WHEN v_desc THEN v_conta ELSE NULL END, p_data, p_data, v_plano,
          l.favorecido_id, coalesce(l.cenario, 'realizado'), 'conciliacao', 'conc:' || p_tipo, l.numero_documento, v_desc,
          CASE WHEN v_desc THEN NULL ELSE l.forma_pagamento END,
          format('%s de %s da NF nº %s (lançamento %s), no casar com o extrato de %s. Motivo: %s',
                 CASE WHEN v_desc THEN 'Desconto obtido' WHEN v_taxa THEN 'Taxa (sem nota)' ELSE 'Juros/multa' END, public._fn_oc_brl(v_valor), v_nro, l.id,
                 public._fn_oc_data(p_data), v_motivo),
          v_uid, v_uid)
  RETURNING id INTO v_novo;
  INSERT INTO public.financeiro_baixas_no_vinculo (cliente_id, tipo, lancamento_id, irmao_id, valor_original, valor_aplicado, antes, depois,
      origem, motivo, feita_por)
  VALUES (l.cliente_id, p_tipo, l.id, v_novo, l.valor, v_valor, '{}'::jsonb,
          jsonb_build_object('linha_id', v_novo, 'extrato_id', p_extrato_id, 'data', p_data, 'plano_conta_id', v_plano), 'conserto', v_motivo, v_uid);
  RETURN v_novo;
END;
$function$;

-- (2) e (3) as linhas da nova vão para a existente; a nova sai de uso (sem apagar)
DO $$
DECLARE v_n int;
BEGIN
  SET LOCAL lock_timeout = '2s';
  PERFORM set_config('app.via', 'JUROS-DUP CONC-DESCONCILIAR-EDSON-01 (Gabriel 18/11 10:24)', true);
  IF NOT EXISTS (SELECT 1 FROM public.financeiro_plano_contas WHERE id = 'bb93569c-9355-42d3-b92f-fe858170abd6' AND cliente_id IS NULL AND ativo
                   AND subcentro = 'Despesas Financeiras Administrativo' AND tipo_operacao = '2-Saídas') THEN
    RAISE EXCEPTION 'JUROS-DUP: a conta "Despesas Financeiras Administrativo" não está como medida. Nada gravado.';
  END IF;
  UPDATE public.financeiro_lancamentos_v2 SET plano_conta_id = 'bb93569c-9355-42d3-b92f-fe858170abd6', updated_at = now()
   WHERE plano_conta_id = 'f618f5d4-fe31-43df-9828-c121472fcf33';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'JUROS-DUP: % lançamento(s) movido(s) para Despesas Financeiras Administrativo', v_n;
  UPDATE public.financeiro_plano_contas SET ativo = false, updated_at = now()
   WHERE id = 'f618f5d4-fe31-43df-9828-c121472fcf33' AND cliente_id IS NULL AND subcentro = 'Juros/multa por atraso';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 OR EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 WHERE plano_conta_id = 'f618f5d4-fe31-43df-9828-c121472fcf33') THEN
    RAISE EXCEPTION 'JUROS-DUP: a conta nova não saiu de uso limpa. Nada gravado.';
  END IF;
END $$;
