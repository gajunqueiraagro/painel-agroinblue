-- CONC-SEM-TRAVA-01 (tela, parte 2) — o executor ganha `desconto_na_oc` (ver 20261028110680) e o desfazer do bloco o reverte.

CREATE FUNCTION pg_temp._trocar(p_fn regprocedure, p_md5 text, p_trocas text[]) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_def text; i int;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p_fn) <> p_md5 THEN
    RAISE EXCEPTION 'CONC-SEM-TRAVA-01 tela: corpo de origem de % divergente', p_fn;
  END IF;
  v_def := pg_get_functiondef(p_fn);
  FOR i IN 1 .. array_length(p_trocas, 1) / 2 LOOP
    IF (length(v_def) - length(replace(v_def, p_trocas[2 * i - 1], ''))) / length(p_trocas[2 * i - 1]) <> 1 THEN
      RAISE EXCEPTION 'CONC-SEM-TRAVA-01 tela: trecho % de % nao achado uma vez', i, p_fn;
    END IF;
    v_def := replace(v_def, p_trocas[2 * i - 1], p_trocas[2 * i]);
  END LOOP;
  EXECUTE v_def;
END $f$;

DO $g$ BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conc_ligar_com_diferenca(uuid[], uuid[], text, text, boolean)'::regprocedure) <> '50946fc8ada3a0b4f14fc2e9910e2f8b' THEN
    RAISE EXCEPTION 'CONC-SEM-TRAVA-01 tela: fn_conc_ligar_com_diferenca divergente';
  END IF;
END $g$;

CREATE OR REPLACE FUNCTION public.fn_conc_ligar_com_diferenca(p_extratos uuid[], p_lancamentos uuid[], p_opcao text, p_motivo text,
                                                             p_simular boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_uid uuid := auth.uid(); s jsonb; v_cli uuid; op jsonb; v_prev jsonb; v_mod public.financeiro_lancamentos_v2; v_novo uuid;
  v_oc public.zoo_operacoes_comerciais; v_bloco jsonb; v_vinc jsonb;
  v_l public.financeiro_lancamentos_v2; v_g jsonb; v_z uuid; v_expl jsonb; v_pp uuid; v_opid uuid;  -- CONC-SEM-TRAVA-01 tela: desconto na OC
BEGIN
  v_cli := (SELECT min(e.cliente_id::text)::uuid FROM public.extrato_bancario_v2 e WHERE e.id = ANY (p_extratos));
  IF v_cli IS NULL OR NOT coalesce(public.tenant_ok(v_cli), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem acesso a este registro';
  END IF;
  s := public._fn_conc_diferenca(p_extratos, p_lancamentos);
  IF (s->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = (s->>'motivo') || ': ' || (s->>'mensagem');
  END IF;
  SELECT x INTO op FROM jsonb_array_elements(s->'opcoes') x WHERE x->>'codigo' = p_opcao;
  IF op IS NULL OR p_opcao = 'acrescentar_lancamento' THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('opcao_invalida: %s Opções para este conjunto: %s.', s->>'frase',
      (SELECT string_agg(x->>'frase', ' / ') FROM jsonb_array_elements(s->'opcoes') x));
  END IF;
  IF coalesce(p_simular, false) THEN
    RETURN s || jsonb_build_object('simulado', true, 'opcao', op);
  END IF;
  IF coalesce(btrim(p_motivo), '') = '' THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'motivo_obrigatorio: diga por que o valor do banco é diferente do previsto.';
  END IF;

  IF p_opcao = 'ligar' THEN
    v_bloco := public.fn_conciliar_bloco(p_extratos, p_lancamentos, 'exato', false);
  ELSIF p_opcao = 'desconto_na_oc' THEN
    -- o recebimento que fica aberto e' parcelado em "o que entrou" + "a falta"; a falta e' cancelada e vira DESCONTO na OC (explicacao);
    -- o extrato liga exato ao que entrou. O desfazer do bloco tira a explicacao e reativa a falta (`conciliacao_blocos.extras`).
    v_prev := op->'previa';
    SELECT * INTO v_l FROM public.financeiro_lancamentos_v2 WHERE id = (v_prev->>'lancamento_id')::uuid;
    v_g := public.oc_recebimento_gesto(v_l.id, 'parcelar', 'Desconto na conciliação: ' || btrim(p_motivo),
      jsonb_build_array(
        jsonb_build_object('valor', abs(v_l.valor) - (v_prev->>'desconto')::numeric, 'vencimento', s->>'data_extrato'),
        jsonb_build_object('valor', (v_prev->>'desconto')::numeric, 'vencimento', coalesce(v_l.data_vencimento, (s->>'data_extrato')::date))),
      false);
    SELECT t::uuid INTO v_z FROM jsonb_array_elements_text(v_g->'titulos') t
     WHERE (SELECT abs(f.valor) FROM public.financeiro_lancamentos_v2 f WHERE f.id = t::uuid) = (v_prev->>'desconto')::numeric LIMIT 1;
    IF v_z IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Não foi possível separar a falta do recebimento. Nada foi gravado.'; END IF;
    -- so' a parcela da falta sai (o cancelar programado do compromisso levaria a parcela que entrou junto): titulo, parte e parcela,
    -- com o evento na OC; o desfazer do bloco as reativa
    UPDATE public.financeiro_lancamentos_v2 SET cancelado = true, cancelado_em = now(), cancelado_por = v_uid,
           cancelado_motivo = 'Desconto na conciliação: ' || btrim(p_motivo), updated_at = now(), updated_by = v_uid
     WHERE id = v_z;
    UPDATE public.zoo_operacao_partes SET cancelada = true, cancelada_em = now(), cancelada_por = v_uid,
           cancelada_motivo = 'Desconto na conciliação: ' || btrim(p_motivo), updated_at = now()
     WHERE financeiro_lancamento_id = v_z AND cancelada = false
     RETURNING programacao_parcela_id, operacao_id INTO v_pp, v_opid;
    UPDATE public.zoo_operacao_parcelas_programacao SET status = 'cancelada', updated_at = now() WHERE id = v_pp;
    INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
    VALUES (v_cli, v_opid, 'desconto_na_conciliacao', jsonb_build_object('lancamento_cancelado', v_z, 'parcela_id', v_pp,
            'valor', v_prev->>'desconto', 'extratos', to_jsonb(p_extratos), 'motivo', btrim(p_motivo)), v_uid, 'rpc');
    SELECT * INTO v_oc FROM public.zoo_operacoes_comerciais WHERE id = (v_prev->>'operacao_id')::uuid;
    v_expl := public.oc_explicar_saldo(v_oc.id, v_oc.versao, 'desconto_comercial', (v_prev->>'desconto')::numeric, NULL, NULL,
      'Desconto na conciliação do extrato de ' || to_char((s->>'data_extrato')::date, 'DD/MM/YYYY') || ': ' || btrim(p_motivo), NULL, false);
    -- a alocacao e' a mesma do "deixar a falta em aberto" (so' os que recebem); o que ficava aberto agora fecha exato
    v_bloco := public.fn_conciliar_bloco(p_extratos,
      (SELECT array_agg((a->>'lancamento_id')::uuid) FROM jsonb_array_elements(s->'opcoes') o, jsonb_array_elements(o->'alocacao') a
        WHERE o->>'codigo' = 'ligar_com_falta'), 'exato', false);
    UPDATE public.conciliacao_blocos SET extras = coalesce(extras, '{}'::jsonb) || jsonb_build_object('desconto', jsonb_build_object(
        'operacao_id', v_oc.id, 'explicacao_parte_id', v_expl->>'parte_id', 'lancamento_cancelado', v_z, 'valor', v_prev->>'desconto'))
     WHERE id = (v_bloco->>'bloco_id')::uuid;
    v_vinc := v_expl;
  ELSIF p_opcao = 'ligar_com_falta' THEN
    v_bloco := public.fn_conciliar_bloco(p_extratos,
      (SELECT array_agg((a->>'lancamento_id')::uuid) FROM jsonb_array_elements(op->'alocacao') a), 'mais_antigo_primeiro', false);
  ELSE
    -- o lancamento da diferenca: classificacao, conta e lado do lancamento original; favorecido do extrato (ou o original);
    -- data do extrato; origem `conc:diferenca` (o desfazer do bloco o cancela)
    v_prev := (SELECT x->'previa' FROM jsonb_array_elements(s->'opcoes') x WHERE x->>'codigo' = 'criar_diferenca');
    SELECT * INTO v_mod FROM public.financeiro_lancamentos_v2 WHERE id = (v_prev->>'modelo_id')::uuid;
    INSERT INTO public.financeiro_lancamentos_v2 (cliente_id, fazenda_id, ano_mes, valor, tipo_operacao, sinal, descricao, status_transacao,
        conta_bancaria_id, conta_destino_id, data_competencia, data_vencimento, macro_custo, grupo_custo, centro_custo, subcentro,
        escopo_negocio, plano_conta_id, safra_id, favorecido_id, cenario, origem_lancamento, origem_tipo, observacao, created_by)
    VALUES (v_mod.cliente_id, v_mod.fazenda_id, to_char((v_prev->>'data')::date, 'YYYY-MM'), (v_prev->>'valor')::numeric,
        v_mod.tipo_operacao, v_mod.sinal, v_prev->>'descricao', 'previsto',
        v_mod.conta_bancaria_id, v_mod.conta_destino_id, (v_prev->>'data')::date, (v_prev->>'data')::date,
        v_mod.macro_custo, v_mod.grupo_custo, v_mod.centro_custo, v_mod.subcentro, v_mod.escopo_negocio, v_mod.plano_conta_id, v_mod.safra_id,
        (v_prev->>'favorecido_id')::uuid, 'realizado', 'conciliacao', 'conc:diferenca',
        'Diferença do banco (' || p_opcao || '): ' || btrim(p_motivo), v_uid)
    RETURNING id INTO v_novo;
    IF p_opcao = 'sobra_na_oc' THEN
      SELECT * INTO v_oc FROM public.zoo_operacoes_comerciais WHERE id = (op->>'operacao_id')::uuid;
      v_vinc := public.oc_vincular_lancamento(v_oc.id, v_oc.versao, v_novo, NULL,
        'Sobra do extrato de ' || to_char((v_prev->>'data')::date, 'DD/MM/YYYY') || ': ' || btrim(p_motivo));
    END IF;
    v_bloco := public.fn_conciliar_bloco(p_extratos, p_lancamentos || v_novo, 'exato', false);
  END IF;

  RETURN jsonb_build_object('ok', true, 'opcao', p_opcao, 'bloco', v_bloco, 'lancamento_criado', v_novo, 'oc', v_vinc,
    'frase', CASE p_opcao
      WHEN 'ligar' THEN 'Ligado.'
      WHEN 'ligar_com_falta' THEN format('Ligado; %s ficou em aberto.', public._fn_conc_brl((s->>'diferenca')::numeric))
      WHEN 'criar_diferenca' THEN format('Ligado, com o lançamento da diferença de %s.', public._fn_conc_brl((s->>'diferenca')::numeric))
      WHEN 'desconto_na_oc' THEN format('Ligado; %s virou desconto na operação comercial.', public._fn_conc_brl((op->'previa'->>'desconto')::numeric))
      ELSE format('Ligado; a sobra de %s entrou na operação comercial.', public._fn_conc_brl((s->>'diferenca')::numeric)) END);
END
$function$;

-- o desfazer do bloco reverte o desconto: tira a explicacao da OC e reativa a falta que fora cancelada
SELECT pg_temp._trocar('public.fn_desfazer_bloco(uuid, text)'::regprocedure, '63eda56de9be8026bf16ade574151fa6', ARRAY[
  $a$  UPDATE conciliacao_blocos SET desfeito_em = now(), desfeito_por = v_uid, desfeito_motivo = p_motivo WHERE id = p_bloco;$a$,
  $a$  -- CONC-SEM-TRAVA-01 tela: o desconto na OC deste bloco volta (explicacao removida, falta reativada)
  IF v_b.extras ? 'desconto' THEN
    PERFORM public.oc_desfazer_explicacao((v_b.extras->'desconto'->>'operacao_id')::uuid,
      (SELECT o.versao FROM zoo_operacoes_comerciais o WHERE o.id = (v_b.extras->'desconto'->>'operacao_id')::uuid),
      (v_b.extras->'desconto'->>'explicacao_parte_id')::uuid, 'Bloco desfeito: ' || p_motivo, false);
    UPDATE financeiro_lancamentos_v2 SET cancelado = false, cancelado_em = NULL, cancelado_por = NULL, cancelado_motivo = NULL,
           updated_at = now(), updated_by = v_uid
     WHERE id = (v_b.extras->'desconto'->>'lancamento_cancelado')::uuid;
    UPDATE zoo_operacao_partes SET cancelada = false, cancelada_em = NULL, cancelada_por = NULL, cancelada_motivo = NULL, updated_at = now()
     WHERE financeiro_lancamento_id = (v_b.extras->'desconto'->>'lancamento_cancelado')::uuid AND cancelada;
    UPDATE zoo_operacao_parcelas_programacao SET status = 'materializada', updated_at = now()
     WHERE id = (SELECT pt.programacao_parcela_id FROM zoo_operacao_partes pt
                  WHERE pt.financeiro_lancamento_id = (v_b.extras->'desconto'->>'lancamento_cancelado')::uuid LIMIT 1)
       AND status = 'cancelada';
  END IF;
  UPDATE conciliacao_blocos SET desfeito_em = now(), desfeito_por = v_uid, desfeito_motivo = p_motivo WHERE id = p_bloco;$a$
]);

DO $confere$
BEGIN
  IF position('desconto_na_oc' in pg_get_functiondef('public.fn_conc_ligar_com_diferenca(uuid[], uuid[], text, text, boolean)'::regprocedure)) = 0
     OR position('extras ? ''desconto''' in pg_get_functiondef('public.fn_desfazer_bloco(uuid, text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'CONC-SEM-TRAVA-01 tela: conferencia final falhou';
  END IF;
END $confere$;
