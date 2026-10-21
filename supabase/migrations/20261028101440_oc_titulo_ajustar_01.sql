-- OC-CORRECOES-01 C1 · OC-TITULO-AJUSTAR-01 — o titulo de OC EM ABERTO tem vencimento, conta e classificacao editaveis no proprio
-- modal do lancamento (Gabriel 21/10: tentou mudar o vencimento do Receb. 3/3 R$ 160.000 da OC 0731374f de 30/07 para 30/06 e nao
-- deu; o aviso do modal ate' dizia "data prevista e conta continuam editaveis", e o campo estava travado).
-- ⚠ NAO E' SO' DESTRAVAR O CAMPO: a OC guarda o vencimento e a conta tambem na parcela da programacao e na parte, e a classificacao
--   na parte e no compromisso. Mudar so' o lancamento faria a OC e a Conferencia dizerem duas coisas. `oc_titulo_ajustar` muda os
--   TRES juntos, com a trilha na OC (antes/depois, quem, motivo) e a versao da OC subindo.
-- Regras:
--   · so' titulo EM ABERTO (previsto | programado | agendado), nao cancelado e SEM vinculo vivo com extrato — realizado e conciliado
--     recusam com a frase de onde ir;
--   · vale com a OC fechada (e' ajuste do titulo, nao da negociacao); OC cancelada recusa;
--   · o VALOR nao muda por aqui (segue a regra da OC: muda pela OC ou parcelando);
--   · classificacao: a conta do plano (ativa, do cliente ou global, do mesmo tipo do lancamento); o compromisso acompanha quando o
--     titulo e' a UNICA parcela viva dele — com mais parcelas, a classificacao e' do compromisso inteiro e recusa com a frase.
-- p_campos: { data_vencimento?: 'aaaa-mm-dd', conta_bancaria_id?: uuid, plano_conta_id?: uuid }

CREATE OR REPLACE FUNCTION public.oc_titulo_ajustar(p_lancamento_id uuid, p_campos jsonb, p_motivo text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_l public.financeiro_lancamentos_v2; v_l2 public.financeiro_lancamentos_v2;
  v_parte public.zoo_operacao_partes; v_op public.zoo_operacoes_comerciais;
  v_parc public.zoo_operacao_parcelas_programacao; v_comp public.zoo_operacao_compromissos;
  v_plano public.financeiro_plano_contas;
  v_venc date; v_conta uuid; v_tem_venc boolean; v_tem_conta boolean; v_tem_plano boolean;
  v_entrada boolean; v_vivas int; v_comp_acao text := 'mantido';
  v_motivo text := coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'ajuste no lançamento');
BEGIN
  IF p_campos IS NULL OR jsonb_typeof(p_campos) <> 'object' THEN
    RAISE EXCEPTION 'Nada a ajustar. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_campos) k WHERE k NOT IN ('data_vencimento', 'conta_bancaria_id', 'plano_conta_id')) THEN
    RAISE EXCEPTION 'Por aqui só se ajustam vencimento, conta e classificação. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_l FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF NOT coalesce(public.tenant_ok(v_l.cliente_id), false) THEN
    RAISE EXCEPTION 'Sem acesso a este registro.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_parte FROM public.zoo_operacao_partes
   WHERE financeiro_lancamento_id = v_l.id AND cancelada = false FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este lançamento não é título de operação comercial; ajuste pelo modal como sempre.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = v_parte.operacao_id FOR UPDATE;
  IF v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'A operação está cancelada. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  IF v_l.cancelado IS TRUE THEN
    RAISE EXCEPTION 'O lançamento está cancelado. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens ci WHERE ci.lancamento_id = v_l.id AND ci.desfeito_em IS NULL) THEN
    RAISE EXCEPTION 'Conciliado com o extrato: desfaça a conciliação na Conferência (Financeiro › Conciliação) antes de ajustar. Nada foi gravado.'
      USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(v_l.status_transacao, '') NOT IN ('previsto', 'programado', 'agendado') THEN
    RAISE EXCEPTION 'Já realizado: para ajustar, estorne o recebimento/pagamento no lançamento primeiro. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;

  v_tem_venc := p_campos ? 'data_vencimento';
  v_tem_conta := p_campos ? 'conta_bancaria_id';
  v_tem_plano := p_campos ? 'plano_conta_id';
  v_venc := NULLIF(p_campos->>'data_vencimento', '')::date;
  v_conta := NULLIF(p_campos->>'conta_bancaria_id', '')::uuid;
  IF v_tem_venc AND v_venc IS NULL THEN
    RAISE EXCEPTION 'O vencimento não pode ficar vazio. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  IF v_tem_conta AND v_conta IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.financeiro_contas_bancarias b WHERE b.id = v_conta AND b.cliente_id = v_l.cliente_id) THEN
    RAISE EXCEPTION 'A conta bancária não é deste cliente. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  IF v_tem_plano THEN
    SELECT * INTO v_plano FROM public.financeiro_plano_contas WHERE id = NULLIF(p_campos->>'plano_conta_id', '')::uuid;
    IF NOT FOUND OR v_plano.ativo IS NOT TRUE THEN
      RAISE EXCEPTION 'A conta do plano não existe ou está inativa. Nada foi gravado.' USING ERRCODE = 'P0001'; END IF;
    IF v_plano.cliente_id IS NOT NULL AND v_plano.cliente_id <> v_l.cliente_id THEN
      RAISE EXCEPTION 'A conta do plano é de outro cliente. Nada foi gravado.' USING ERRCODE = 'P0001'; END IF;
    IF v_plano.tipo_operacao IS DISTINCT FROM v_l.tipo_operacao THEN
      RAISE EXCEPTION 'A conta do plano (%) não confere com o tipo do lançamento (%). Nada foi gravado.', v_plano.tipo_operacao, v_l.tipo_operacao
        USING ERRCODE = 'P0001'; END IF;
  END IF;

  IF v_parte.programacao_parcela_id IS NOT NULL THEN
    SELECT * INTO v_parc FROM public.zoo_operacao_parcelas_programacao WHERE id = v_parte.programacao_parcela_id FOR UPDATE;
    SELECT c.* INTO v_comp FROM public.zoo_operacao_compromissos c
      JOIN public.zoo_operacao_programacoes pr ON pr.compromisso_id = c.id WHERE pr.id = v_parc.programacao_id FOR UPDATE OF c;
  END IF;
  IF v_tem_plano AND v_comp.id IS NOT NULL AND v_plano.id IS DISTINCT FROM v_comp.plano_conta_id THEN
    SELECT count(*) INTO v_vivas FROM public.zoo_operacao_parcelas_programacao pp
      JOIN public.zoo_operacao_programacoes pr ON pr.id = pp.programacao_id
     WHERE pr.compromisso_id = v_comp.id AND pp.status <> 'cancelada';
    IF v_vivas > 1 THEN
      RAISE EXCEPTION 'A classificação é do compromisso inteiro (% parcelas): mude pela operação, aba Financeiro. Nada foi gravado.', v_vivas
        USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.zoo_operacao_compromissos
       SET plano_conta_id = v_plano.id, subcentro = v_plano.subcentro, centro_custo = v_plano.centro_custo, updated_at = now()
     WHERE id = v_comp.id;
    v_comp_acao := 'reclassificado';
  END IF;

  v_entrada := coalesce(v_l.tipo_operacao, '') LIKE '1%';
  UPDATE public.financeiro_lancamentos_v2 SET
    data_vencimento   = CASE WHEN v_tem_venc THEN v_venc ELSE data_vencimento END,
    conta_destino_id  = CASE WHEN v_tem_conta AND v_entrada THEN v_conta ELSE conta_destino_id END,
    conta_bancaria_id = CASE WHEN v_tem_conta AND NOT v_entrada THEN v_conta ELSE conta_bancaria_id END,
    plano_conta_id    = CASE WHEN v_tem_plano THEN v_plano.id           ELSE plano_conta_id END,
    subcentro         = CASE WHEN v_tem_plano THEN v_plano.subcentro    ELSE subcentro END,
    centro_custo      = CASE WHEN v_tem_plano THEN v_plano.centro_custo ELSE centro_custo END,
    grupo_custo       = CASE WHEN v_tem_plano THEN v_plano.grupo_custo  ELSE grupo_custo END,
    macro_custo       = CASE WHEN v_tem_plano THEN v_plano.macro_custo  ELSE macro_custo END,
    updated_at = now(), updated_by = v_actor
  WHERE id = v_l.id RETURNING * INTO v_l2;
  UPDATE public.zoo_operacao_partes SET
    data_vencimento = CASE WHEN v_tem_venc THEN v_venc ELSE data_vencimento END,
    plano_conta_id  = CASE WHEN v_tem_plano THEN v_plano.id ELSE plano_conta_id END,
    subcentro       = CASE WHEN v_tem_plano THEN v_plano.subcentro ELSE subcentro END,
    centro_custo    = CASE WHEN v_tem_plano THEN v_plano.centro_custo ELSE centro_custo END,
    updated_at = now()
  WHERE id = v_parte.id;
  IF v_parc.id IS NOT NULL THEN
    UPDATE public.zoo_operacao_parcelas_programacao SET
      vencimento        = CASE WHEN v_tem_venc THEN v_venc ELSE vencimento END,
      conta_bancaria_id = CASE WHEN v_tem_conta THEN v_conta ELSE conta_bancaria_id END,
      updated_at = now()
    WHERE id = v_parc.id;
  END IF;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, dados_novos, detalhes, usuario_id, origem)
  VALUES (v_l.cliente_id, v_op.id, 'ajustar_titulo',
    jsonb_build_object('data_vencimento', v_l.data_vencimento, 'conta_destino_id', v_l.conta_destino_id, 'conta_bancaria_id', v_l.conta_bancaria_id,
                       'plano_conta_id', v_l.plano_conta_id, 'subcentro', v_l.subcentro),
    jsonb_build_object('data_vencimento', v_l2.data_vencimento, 'conta_destino_id', v_l2.conta_destino_id, 'conta_bancaria_id', v_l2.conta_bancaria_id,
                       'plano_conta_id', v_l2.plano_conta_id, 'subcentro', v_l2.subcentro),
    jsonb_build_object('motivo', v_motivo, 'lancamento_id', v_l.id, 'parte_id', v_parte.id, 'parcela_id', v_parc.id,
                       'compromisso_id', v_comp.id, 'compromisso_acao', v_comp_acao, 'campos', p_campos,
                       'versao_anterior', v_op.versao, 'versao_nova', v_op.versao + 1),
    v_actor, 'rpc');
  UPDATE public.zoo_operacoes_comerciais SET versao = versao + 1, updated_at = now(), updated_by = v_actor WHERE id = v_op.id;

  RETURN jsonb_build_object('ok', true, 'lancamento_id', v_l.id, 'operacao_id', v_op.id, 'operacao_versao', v_op.versao + 1,
    'compromisso_acao', v_comp_acao, 'parcela_ajustada', v_parc.id IS NOT NULL);
END
$function$;

REVOKE ALL ON FUNCTION public.oc_titulo_ajustar(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_titulo_ajustar(uuid, jsonb, text) TO authenticated, service_role;
