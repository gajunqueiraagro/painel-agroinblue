-- ═══════════════════════════════════════════════════════════════════════════════
-- PR-OC-SENTIDO-POR-PLANO-01 — o sentido do dinheiro vem do PLANO, nao do tipo da operacao
--
-- APLICADA no Proto em 30/08/2026 pelo arquiteto. Registro: 20260830122753.
--
-- O DEFEITO
-- `oc_materializar_programacao` derivava o fluxo do TIPO DA OPERACAO:
--     v_fluxo := CASE v_op.tipo_operacao WHEN 'compra' THEN 'pagar' ELSE 'receber' END;
-- Numa VENDA, portanto, TODO compromisso materializava como Entrada com sinal +1 —
-- inclusive o ADIANTAMENTO DE BOITEL, que e' dinheiro SAINDO do produtor para o boitel.
-- Na venda b58bf556 isso seriam R$ 96.783,50 entrando em vez de sair: R$ 193.567,00 de
-- diferenca no fluxo de caixa, com o plano de contas certo na linha e o sinal errado.
--
-- ⚠ A PREMISSA ESTAVA EM DOIS LUGARES, e essa e' a razao de ela ter sobrevivido: aqui e
-- no filtro do `NovoCompromissoDialog`, que numa venda so' oferece planos de '1-Entradas'
-- — o 5010 (Ajustes · Adiantamento de Boitel, que e' '2-Saidas') nao aparecia sequer para
-- ser escolhido. O front sai na mesma frente.
--
-- A CORRECAO, SEM DADO NOVO
-- O compromisso ja guarda `plano_conta_id`, e o plano ja carrega `tipo_operacao`. O
-- sentido estava a um JOIN de distancia — sem coluna nova, sem natureza nova, sem sinal
-- inventado. O `ELSE` preserva o comportamento antigo para compromisso sem plano.
--
-- ⚠ NENHUM COMPROMISSO EXISTENTE MUDA DE LADO: medido antes de aplicar, 46 compromissos,
-- ZERO divergentes entre a derivacao antiga e a nova.
--
-- ⚠ CORPO CONFERIDO POR md5 DE `pg_proc.prosrc`: e04f82df43ba2f4bc9482a7c19ce9fe8. O
-- restante da funcao e' o vigente de 20260829130000_pr_oc_fin_conta_materializacao_01,
-- copiado verbatim — a UNICA linha alterada e' a do `v_fluxo`.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.oc_materializar_programacao(p_operacao_id uuid, p_versao_esperada integer, p_programacao_id uuid, p_parcela_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_is_service boolean; v_is_admin boolean; v_tem_acesso boolean;
  v_op public.zoo_operacoes_comerciais;
  v_cli uuid;
  v_prog public.zoo_operacao_programacoes;
  v_parcela public.zoo_operacao_parcelas_programacao;
  v_comp public.zoo_operacao_compromissos;
  v_qtd int;
  v_fluxo text; v_tipo_op text; v_sinal text;
  v_data_venc date; v_fav uuid;
  v_parte_id uuid; v_tit_id uuid;
  v_parte_row jsonb; v_tit_row jsonb; v_parcela_row jsonb;
  v_nova_versao integer;
BEGIN
  v_is_service := (COALESCE(auth.role(), '') = 'service_role');
  v_is_admin   := (v_actor IS NOT NULL AND public.is_admin_agroinblue(v_actor));

  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  v_cli := v_op.cliente_id;
  v_tem_acesso := (v_actor IS NOT NULL AND v_cli IN (SELECT public.get_user_cliente_ids(v_actor)));
  IF NOT (v_is_service OR v_is_admin OR v_tem_acesso) THEN
    RAISE EXCEPTION 'Sem permissao para materializar nesta operacao (acesso ao cliente exigido)' USING ERRCODE = '42501';
  END IF;
  IF v_op.versao <> p_versao_esperada THEN
    RAISE EXCEPTION 'Conflito de versao (esperada %, atual %)', p_versao_esperada, v_op.versao USING ERRCODE = '40001'; END IF;
  IF v_op.rascunho THEN
    RAISE EXCEPTION 'Operacao em rascunho nao permite materializacao' USING ERRCODE = 'P0001'; END IF;
  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Operacao cancelada nao permite materializacao' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_prog FROM public.zoo_operacao_programacoes
    WHERE id = p_programacao_id AND cliente_id = v_cli FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Programacao % nao encontrada nesta operacao', p_programacao_id USING ERRCODE = 'P0001'; END IF;
  IF v_prog.status <> 'ativa' THEN
    RAISE EXCEPTION 'Programacao nao esta ativa (estado %).', v_prog.status USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_parcela FROM public.zoo_operacao_parcelas_programacao
    WHERE id = p_parcela_id AND programacao_id = p_programacao_id AND cliente_id = v_cli FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela % nao encontrada nesta programacao', p_parcela_id USING ERRCODE = 'P0001'; END IF;
  IF v_parcela.status <> 'prevista' THEN
    RAISE EXCEPTION 'Somente parcela prevista pode ser materializada (estado %).', v_parcela.status USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_comp FROM public.zoo_operacao_compromissos
    WHERE id = v_prog.compromisso_id AND cliente_id = v_cli FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compromisso da programacao nao encontrado' USING ERRCODE = 'P0001'; END IF;
  IF v_comp.operacao_id <> p_operacao_id THEN
    RAISE EXCEPTION 'Programacao pertence a outra operacao' USING ERRCODE = 'P0001'; END IF;
  IF v_comp.status <> 'programado' THEN
    RAISE EXCEPTION 'Compromisso deve estar programado para materializar (estado %).', v_comp.status USING ERRCODE = 'P0001'; END IF;

  IF v_parcela.conta_bancaria_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.financeiro_contas_bancarias cb
        WHERE cb.id = v_parcela.conta_bancaria_id AND cb.cliente_id = v_cli) THEN
    RAISE EXCEPTION 'Conta bancaria nao pertence a este cliente.' USING ERRCODE = 'P0001'; END IF;

  SELECT count(*) INTO v_qtd FROM public.zoo_operacao_parcelas_programacao WHERE programacao_id = p_programacao_id;
  v_fluxo     := CASE (SELECT pc.tipo_operacao
                        FROM public.financeiro_plano_contas pc
                       WHERE pc.id = v_comp.plano_conta_id)
                  WHEN '1-Entradas' THEN 'receber'
                  WHEN '2-Saídas'   THEN 'pagar'
                  ELSE CASE v_op.tipo_operacao WHEN 'compra' THEN 'pagar' ELSE 'receber' END
                END;
  v_data_venc := COALESCE(v_parcela.vencimento, v_op.data_pagamento_prevista, v_op.data_operacao);
  v_fav       := v_comp.favorecido_id;

  INSERT INTO public.zoo_operacao_partes (
    cliente_id, operacao_id, origem, natureza, componente, sequencia_parcela, quantidade_parcelas,
    valor, data_vencimento, descricao, incluso_no_total,
    favorecido_id, plano_conta_id, macro_custo, grupo_custo, centro_custo, subcentro, lote_id,
    programacao_parcela_id)
  VALUES (
    v_cli, p_operacao_id, 'programacao', v_comp.natureza, v_comp.componente, v_parcela.sequencia, v_qtd,
    v_parcela.valor, v_data_venc, v_comp.descricao, false,
    v_fav, v_comp.plano_conta_id, v_comp.macro_custo, v_comp.grupo_custo, v_comp.centro_custo, v_comp.subcentro, v_comp.lote_id,
    p_parcela_id)
  RETURNING id INTO v_parte_id;

  IF v_fluxo = 'receber' THEN v_tipo_op := '1-Entradas'; v_sinal := '1';
  ELSE v_tipo_op := '2-Saídas'; v_sinal := '-1'; END IF;

  INSERT INTO public.financeiro_lancamentos_v2 (
    cliente_id, fazenda_id, valor, sinal, tipo_operacao, data_competencia, data_pagamento, data_vencimento, ano_mes,
    favorecido_id, conta_bancaria_id, origem_lancamento, origem_tipo, status_transacao, cenario, sem_movimentacao_caixa,
    macro_custo, grupo_custo, centro_custo, subcentro, plano_conta_id,
    descricao, created_by, updated_by
  ) VALUES (
    v_cli, v_op.fazenda_id, v_parcela.valor, v_sinal, v_tipo_op,
    v_op.data_operacao, NULL::date, v_data_venc, to_char(v_data_venc,'YYYY-MM'),
    COALESCE(v_fav, v_op.contraparte_id), v_parcela.conta_bancaria_id, 'operacao_comercial',
    'oc:obrigacao:'||v_comp.natureza||':'||v_comp.componente, 'programado', v_op.cenario, false,
    v_comp.macro_custo, v_comp.grupo_custo, v_comp.centro_custo, v_comp.subcentro,
    v_comp.plano_conta_id,
    COALESCE(v_comp.descricao, v_op.tipo_operacao||' '||v_comp.componente), v_actor, v_actor
  ) RETURNING id INTO v_tit_id;

  UPDATE public.zoo_operacao_partes SET financeiro_lancamento_id = v_tit_id, updated_at = now() WHERE id = v_parte_id;
  UPDATE public.zoo_operacao_parcelas_programacao SET status = 'materializada', updated_at = now() WHERE id = p_parcela_id;

  SELECT to_jsonb(p)  INTO v_parte_row   FROM public.zoo_operacao_partes p              WHERE p.id = v_parte_id;
  SELECT to_jsonb(f)  INTO v_tit_row     FROM public.financeiro_lancamentos_v2 f        WHERE f.id = v_tit_id;
  SELECT to_jsonb(pp) INTO v_parcela_row FROM public.zoo_operacao_parcelas_programacao pp WHERE pp.id = p_parcela_id;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_novos, usuario_id, origem)
  VALUES (v_cli, p_operacao_id, 'materializar_parcela',
    jsonb_build_object(
      'operacao_id', p_operacao_id,
      'programacao_id', p_programacao_id,
      'programacao_parcela_id', p_parcela_id,
      'compromisso_id', v_comp.id,
      'parcela', v_parcela_row,
      'parte', v_parte_row,
      'titulo', v_tit_row,
      'versao', v_op.versao + 1),
    v_actor, 'rpc');

  UPDATE public.zoo_operacoes_comerciais
     SET versao = versao + 1, updated_at = now(), updated_by = v_actor
   WHERE id = p_operacao_id;
  SELECT versao INTO v_nova_versao FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;

  RETURN jsonb_build_object(
    'parcela', v_parcela_row, 'parte', v_parte_row, 'titulo', v_tit_row, 'operacao_versao', v_nova_versao);
END;
$function$;
