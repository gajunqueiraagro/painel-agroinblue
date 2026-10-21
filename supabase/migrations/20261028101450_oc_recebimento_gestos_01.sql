-- OC-CORRECOES-01 C2 · OC-CC-GESTOS-LEGADO-01 — todo gesto nasce com o contrario (Gabriel 21/10). Os recebimentos/pagamentos da conta
-- corrente da OC que estavam com "disponivel em breve" / "ainda sem gesto" (print da OC 0731374f: Receb. R$ 215.000 e R$ 375.000,
-- programados antes do modal, SEM compromisso) ganham os tres gestos, numa RPC so':
--   'cancelar'    — o titulo SEM compromisso (legado): cancela o lancamento e a parte. (Com compromisso: o cancelar de sempre,
--                   `oc_cancelar_programacao`/`oc_cancelar_compromisso`, que a tela ja' chama.)
--   'desvincular' — o titulo SEM compromisso sai da OC (a parte cancela) e o lancamento VOLTA A AVULSO, intacto (origem
--                   'operacao_comercial' vira 'manual'). (Com compromisso: `oc_desvincular_lancamento`, que recusava o legado.)
--   'parcelar'    — divide o titulo em N parcelas (valor e vencimento de cada; a soma = o valor do titulo, ao centavo). SEM compromisso:
--                   CRIA o compromisso (a conta, o favorecido e a descricao do titulo) e a programacao, ADOTA o lancamento como parcela 1
--                   e materializa as demais. COM compromisso: a parcela do titulo vira a 1 e as novas entram na mesma programacao.
-- Regra unica de estado (a mesma do menu): so' titulo EM ABERTO (previsto | programado | agendado), nao cancelado e SEM vinculo vivo com
-- extrato — conciliado recusa mandando desconciliar na Conferencia; realizado recusa mandando estornar. Motivo obrigatorio; trilha na OC
-- (evento com antes/depois) e a versao da OC subindo. `p_simular` devolve o que faria e nao grava.

CREATE OR REPLACE FUNCTION public.oc_recebimento_gesto(p_lancamento_id uuid, p_gesto text, p_motivo text,
  p_parcelas jsonb DEFAULT NULL, p_simular boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_l public.financeiro_lancamentos_v2; v_parte public.zoo_operacao_partes; v_op public.zoo_operacoes_comerciais;
  v_parc public.zoo_operacao_parcelas_programacao; v_prog_id uuid; v_comp_id uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_n int; v_soma numeric; v_i int; v_p jsonb; v_pp uuid; v_seq int; v_r jsonb; v_titulos uuid[] := '{}';
  v_entrada boolean; v_conta uuid; v_ret jsonb; v_grupo int;
BEGIN
  IF p_gesto IS NULL OR p_gesto NOT IN ('cancelar', 'desvincular', 'parcelar') THEN
    RAISE EXCEPTION 'Gesto inválido: %. Nada foi gravado.', p_gesto USING ERRCODE = 'P0001';
  END IF;
  IF v_motivo IS NULL AND p_simular IS NOT TRUE THEN
    RAISE EXCEPTION 'Informe o motivo. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_l FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF NOT coalesce(public.tenant_ok(v_l.cliente_id), false) THEN
    RAISE EXCEPTION 'Sem acesso a este registro.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_parte FROM public.zoo_operacao_partes WHERE financeiro_lancamento_id = v_l.id AND cancelada = false FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Este lançamento não está ligado a uma operação comercial. Nada foi gravado.' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = v_parte.operacao_id FOR UPDATE;
  IF v_op.status_comercial = 'cancelada' THEN RAISE EXCEPTION 'A operação está cancelada. Nada foi gravado.' USING ERRCODE = 'P0001'; END IF;
  IF v_l.cancelado IS TRUE THEN RAISE EXCEPTION 'O lançamento está cancelado. Nada foi gravado.' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens ci WHERE ci.lancamento_id = v_l.id AND ci.desfeito_em IS NULL) THEN
    RAISE EXCEPTION 'Conciliado com o extrato: desfaça a conciliação na Conferência (Financeiro › Conciliação) primeiro. Nada foi gravado.'
      USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(v_l.status_transacao, '') NOT IN ('previsto', 'programado', 'agendado') THEN
    RAISE EXCEPTION 'Já é dinheiro (realizado): para desfazer, estorne no lançamento primeiro. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  IF p_gesto IN ('cancelar', 'desvincular') AND v_parte.programacao_parcela_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este título tem compromisso na operação: use o % do compromisso. Nada foi gravado.',
      CASE p_gesto WHEN 'cancelar' THEN 'Cancelar programado' ELSE 'Desvincular' END USING ERRCODE = 'P0001';
  END IF;
  IF p_gesto = 'parcelar' THEN
    IF p_parcelas IS NULL OR jsonb_typeof(p_parcelas) <> 'array' OR jsonb_array_length(p_parcelas) < 2 THEN
      RAISE EXCEPTION 'Informe ao menos duas parcelas. Nada foi gravado.' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_parcelas) x
                WHERE coalesce(NULLIF(x->>'valor', '')::numeric, 0) <= 0 OR NULLIF(x->>'vencimento', '') IS NULL) THEN
      RAISE EXCEPTION 'Toda parcela precisa de valor maior que zero e vencimento. Nada foi gravado.' USING ERRCODE = 'P0001';
    END IF;
    SELECT count(*), round(sum((x->>'valor')::numeric), 2) INTO v_n, v_soma FROM jsonb_array_elements(p_parcelas) x;
    IF v_soma <> round(abs(v_l.valor), 2) THEN
      RAISE EXCEPTION 'As parcelas somam R$ % e o título é de R$ %: a soma tem de bater ao centavo. Nada foi gravado.',
        translate(to_char(v_soma, 'FM999,999,990.00'), ',.', '.,'), translate(to_char(abs(v_l.valor), 'FM999,999,990.00'), ',.', '.,')
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_ret := jsonb_build_object('ok', true, 'gesto', p_gesto, 'simulado', coalesce(p_simular, false), 'operacao_id', v_op.id,
    'lancamento_id', v_l.id, 'legado', v_parte.programacao_parcela_id IS NULL, 'valor', abs(v_l.valor));
  IF p_simular THEN RETURN v_ret || jsonb_build_object('parcelas', coalesce(v_n, 0)); END IF;

  IF p_gesto = 'cancelar' THEN
    UPDATE public.zoo_operacao_partes SET cancelada = true, cancelada_em = now(), cancelada_por = v_actor, cancelada_motivo = v_motivo,
           updated_at = now() WHERE id = v_parte.id;
    UPDATE public.financeiro_lancamentos_v2 SET cancelado = true, cancelado_em = now(), cancelado_por = v_actor, cancelado_motivo = v_motivo,
           updated_at = now(), updated_by = v_actor WHERE id = v_l.id;
  ELSIF p_gesto = 'desvincular' THEN
    UPDATE public.zoo_operacao_partes SET cancelada = true, cancelada_em = now(), cancelada_por = v_actor, cancelada_motivo = v_motivo,
           updated_at = now() WHERE id = v_parte.id;
    UPDATE public.financeiro_lancamentos_v2
       SET origem_lancamento = CASE WHEN origem_lancamento = 'operacao_comercial' THEN 'manual' ELSE origem_lancamento END,
           origem_tipo = CASE WHEN coalesce(origem_tipo, '') LIKE 'oc:%' THEN NULL ELSE origem_tipo END,
           updated_at = now(), updated_by = v_actor
     WHERE id = v_l.id;
  ELSE
    v_entrada := coalesce(v_l.tipo_operacao, '') LIKE '1%';
    v_conta := CASE WHEN v_entrada THEN v_l.conta_destino_id ELSE v_l.conta_bancaria_id END;
    IF v_parte.programacao_parcela_id IS NULL THEN
      -- o legado ganha o compromisso (a conta, o favorecido e a descricao do titulo) e a programacao
      INSERT INTO public.zoo_operacao_compromissos (cliente_id, operacao_id, natureza, componente, favorecido_id, macro_custo, grupo_custo,
          centro_custo, subcentro, plano_conta_id, valor_total, descricao, status)
      VALUES (v_l.cliente_id, v_op.id, coalesce(v_parte.natureza, 'principal'), coalesce(v_parte.componente, 'recebimento'), v_l.favorecido_id,
          v_l.macro_custo, v_l.grupo_custo, v_l.centro_custo, v_l.subcentro, v_l.plano_conta_id, round(abs(v_l.valor), 2), v_l.descricao, 'programado')
      RETURNING id INTO v_comp_id;
      INSERT INTO public.zoo_operacao_programacoes (cliente_id, compromisso_id, status) VALUES (v_l.cliente_id, v_comp_id, 'ativa')
      RETURNING id INTO v_prog_id;
      INSERT INTO public.zoo_operacao_parcelas_programacao (cliente_id, programacao_id, sequencia, valor, vencimento, conta_bancaria_id, status)
      VALUES (v_l.cliente_id, v_prog_id, 1, (p_parcelas->0->>'valor')::numeric, (p_parcelas->0->>'vencimento')::date, v_conta, 'materializada')
      RETURNING * INTO v_parc;
      -- adotado: a parte passa a ser da programacao (e' o que a renumeracao do grupo conta: "Receb. 1/2", "2/2")
      UPDATE public.zoo_operacao_partes SET programacao_parcela_id = v_parc.id, origem = 'programacao', updated_at = now() WHERE id = v_parte.id;
      v_seq := 1;
    ELSE
      SELECT * INTO v_parc FROM public.zoo_operacao_parcelas_programacao WHERE id = v_parte.programacao_parcela_id FOR UPDATE;
      v_prog_id := v_parc.programacao_id;
      SELECT pr.compromisso_id INTO v_comp_id FROM public.zoo_operacao_programacoes pr WHERE pr.id = v_prog_id;
      UPDATE public.zoo_operacao_parcelas_programacao
         SET valor = (p_parcelas->0->>'valor')::numeric, vencimento = (p_parcelas->0->>'vencimento')::date, updated_at = now()
       WHERE id = v_parc.id;
      SELECT max(sequencia) INTO v_seq FROM public.zoo_operacao_parcelas_programacao WHERE programacao_id = v_prog_id;
    END IF;
    -- a parcela 1 e' o proprio titulo
    UPDATE public.financeiro_lancamentos_v2
       SET valor = (CASE WHEN v_l.valor < 0 THEN -1 ELSE 1 END) * (p_parcelas->0->>'valor')::numeric,
           data_vencimento = (p_parcelas->0->>'vencimento')::date, updated_at = now(), updated_by = v_actor
     WHERE id = v_l.id;
    UPDATE public.zoo_operacao_partes
       SET valor = (p_parcelas->0->>'valor')::numeric, data_vencimento = (p_parcelas->0->>'vencimento')::date, updated_at = now()
     WHERE id = v_parte.id;
    v_titulos := array[v_l.id];
    -- as demais nascem na mesma programacao e materializam pelo caminho de sempre
    FOR v_i IN 1 .. jsonb_array_length(p_parcelas) - 1 LOOP
      v_p := p_parcelas->v_i;
      INSERT INTO public.zoo_operacao_parcelas_programacao (cliente_id, programacao_id, sequencia, valor, vencimento, conta_bancaria_id, status)
      VALUES (v_l.cliente_id, v_prog_id, v_seq + v_i, (v_p->>'valor')::numeric, (v_p->>'vencimento')::date, v_conta, 'prevista')
      RETURNING id INTO v_pp;
      v_r := public.oc_materializar_programacao(v_op.id, (SELECT versao FROM public.zoo_operacoes_comerciais WHERE id = v_op.id), v_prog_id, v_pp);
      v_titulos := v_titulos || (v_r->'titulo'->>'id')::uuid;
    END LOOP;
    v_grupo := public._oc_renumerar_parcelas_do_grupo(v_parte.id);
  END IF;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, dados_novos, detalhes, usuario_id, origem)
  VALUES (v_l.cliente_id, v_op.id, CASE p_gesto WHEN 'cancelar' THEN 'cancelar_titulo_legado' WHEN 'desvincular' THEN 'desvincular_titulo_legado'
                                               ELSE 'parcelar_titulo' END,
    jsonb_build_object('lancamento', to_jsonb(v_l), 'parte', to_jsonb(v_parte)),
    jsonb_build_object('lancamento', (SELECT to_jsonb(x) FROM public.financeiro_lancamentos_v2 x WHERE x.id = v_l.id),
                       'titulos', to_jsonb(v_titulos), 'parcelas', p_parcelas),
    jsonb_build_object('motivo', v_motivo, 'gesto', p_gesto, 'legado', v_parte.programacao_parcela_id IS NULL, 'parte_id', v_parte.id,
                       'compromisso_id', v_comp_id, 'programacao_id', v_prog_id),
    v_actor, 'rpc');
  UPDATE public.zoo_operacoes_comerciais SET versao = versao + 1, updated_at = now(), updated_by = v_actor WHERE id = v_op.id;
  RETURN v_ret || jsonb_build_object('titulos', to_jsonb(v_titulos), 'compromisso_id', v_comp_id,
    'operacao_versao', (SELECT versao FROM public.zoo_operacoes_comerciais WHERE id = v_op.id));
END
$function$;

REVOKE ALL ON FUNCTION public.oc_recebimento_gesto(uuid, text, text, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_recebimento_gesto(uuid, text, text, jsonb, boolean) TO authenticated, service_role;
