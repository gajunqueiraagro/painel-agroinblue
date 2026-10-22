-- CONC-SEM-TRAVA-01 (parte banco) — valor diferente do previsto NUNCA trava a conciliacao (Gabriel 21/10/2026: "o sistema tem que ser
-- inteligente; nao da para prever o futuro milimetricamente"). O banco manda; a conciliacao se adapta, explica e oferece o caminho.
-- Caso real: bloco Pix 30/06/2026 R$ 375.000 x "Venda 118 vacas - 1/2" R$ 215.000 respondia "os extratos somam 375000.00 e os
-- lancamentos so' 215000 — sobrariam 160000.00…" sem nenhuma opcao.
--   1. `_fn_conc_favorecido_do_extrato(cliente, texto)`: o fornecedor do cliente cujo nome (ou apelido) normalizado aparece no
--      historico do extrato (o Pix traz o nome) — o mais longo vence; nenhum -> nulo.
--   2. `_fn_conc_diferenca(extratos, lancamentos)`: a conta (liquido do banco x saldo livre dos lancamentos, com sinal, como o bloco
--      'exato'), a diferenca, o sentido (igual | a_menos | a_mais), a OC envolvida e as OPCOES validas, cada uma com o que faria e a RPC
--      que a executa:
--        igual    -> ligar (bloco exato);
--        a_menos  -> ligar_com_falta (bloco 'mais antigo primeiro': a falta fica em aberto no ultimo lancamento — CONC-BAIXA-NO-VINCULO);
--        a_mais   -> (a) acrescentar_lancamento (busca livre `fn_conc_buscar_para_ligar`, qualquer data/status nao realizado, futuro);
--                    (b) sobra_na_oc, se algum lancamento e' de OC em conta corrente: a sobra entra como recebimento a mais
--                        (pagamento a mais, na compra) e o saldo da OC absorve;
--                    (c) criar_diferenca: o lancamento da diferenca, com o favorecido do extrato (ou o do lancamento original) e a
--                        classificacao do lancamento original, na data do extrato.
--   3. `fn_conc_simular_diferenca` (porta, tenant_ok): a simulacao para a tela.
--   4. `fn_conc_ligar_com_diferenca(extratos, lancamentos, opcao, motivo, simular)` (porta): executa ligar / ligar_com_falta /
--      criar_diferenca / sobra_na_oc; o lancamento criado leva origem `conc:diferenca` e o motivo; tudo num bloco (desfazivel).
--   5. `fn_desfazer_bloco`: desfazer o bloco CANCELA o lancamento da diferenca que ele criou (e a parte dele na OC) — desfazer sempre.
--   6. `fn_conciliar_bloco`: as recusas de soma viram frase pronta (R$, sem codigo de regra) que aponta as opcoes.

CREATE FUNCTION pg_temp._trocar(p_fn regprocedure, p_md5 text, p_trocas text[]) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_def text; i int;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p_fn) <> p_md5 THEN
    RAISE EXCEPTION 'CONC-SEM-TRAVA-01: corpo de origem de % divergente', p_fn;
  END IF;
  v_def := pg_get_functiondef(p_fn);
  FOR i IN 1 .. array_length(p_trocas, 1) / 2 LOOP
    IF (length(v_def) - length(replace(v_def, p_trocas[2 * i - 1], ''))) / length(p_trocas[2 * i - 1]) <> 1 THEN
      RAISE EXCEPTION 'CONC-SEM-TRAVA-01: trecho % de % nao achado uma vez', i, p_fn;
    END IF;
    v_def := replace(v_def, p_trocas[2 * i - 1], p_trocas[2 * i]);
  END LOOP;
  EXECUTE v_def;
END $f$;

CREATE OR REPLACE FUNCTION public._fn_conc_brl(p numeric) RETURNS text LANGUAGE sql IMMUTABLE AS $f$
  SELECT 'R$ ' || translate(to_char(abs(coalesce(p, 0)), 'FM999,999,999,990.00'), ',.', '.,')
$f$;

-- ═══════════════════ 1. O FAVORECIDO DO EXTRATO ═══════════════════
CREATE OR REPLACE FUNCTION public._fn_conc_favorecido_do_extrato(p_cliente uuid, p_texto text)
 RETURNS uuid LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $function$
  WITH t AS (SELECT public._fn_normalizar_texto(coalesce(p_texto, '')) AS n),
  cand AS (
    SELECT f.id, greatest(
             CASE WHEN length(coalesce(f.nome_norm, '')) >= 5 AND position(f.nome_norm IN t.n) > 0 THEN length(f.nome_norm) ELSE 0 END,
             coalesce((SELECT max(length(a)) FROM unnest(coalesce(f.aliases_norm, '{}'::text[])) a
                        WHERE length(a) >= 5 AND position(a IN t.n) > 0), 0)) AS casa
      FROM public.financeiro_fornecedores f, t
     WHERE f.cliente_id = p_cliente AND f.fundido_em_id IS NULL AND coalesce(f.ativo, true))
  SELECT id FROM cand WHERE casa > 0 ORDER BY casa DESC, id LIMIT 1
$function$;

-- ═══════════════════ 2. A CONTA E AS OPCOES ═══════════════════
CREATE OR REPLACE FUNCTION public._fn_conc_diferenca(p_extratos uuid[], p_lancamentos uuid[])
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_cli uuid; v_liq numeric := 0; v_sinal int; v_data date; v_hist text; v_soma_lan numeric := 0; v_dif numeric; v_sentido text;
  v_mod public.financeiro_lancamentos_v2; v_fav uuid; v_fav_origem text; v_ocs jsonb; v_oc jsonb; v_opcoes jsonb := '[]'::jsonb;
  v_frase text; v_desc_mod text; c_tol constant numeric := 0.005; r record; v_lado text;
  v_resta numeric; v_aloc jsonb := '[]'::jsonb; v_ultimo text; v_aberto numeric := 0; v_fora int := 0;
BEGIN
  IF coalesce(array_length(p_extratos, 1), 0) = 0 OR coalesce(array_length(p_lancamentos, 1), 0) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'vazio', 'mensagem', 'Escolha ao menos um extrato e um lançamento.');
  END IF;
  SELECT min(e.cliente_id::text)::uuid, sum(e.valor), max(e.data_movimento),
         (array_agg(e.descricao ORDER BY abs(e.valor) DESC, e.id))[1]
    INTO v_cli, v_liq, v_data, v_hist
    FROM public.extrato_bancario_v2 e WHERE e.id = ANY (p_extratos);
  IF v_cli IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'extrato_nao_encontrado', 'mensagem', 'O extrato escolhido não existe mais.');
  END IF;
  IF (SELECT count(DISTINCT x.cli) FROM (SELECT e.cliente_id cli FROM public.extrato_bancario_v2 e WHERE e.id = ANY (p_extratos)
        UNION SELECT l.cliente_id FROM public.financeiro_lancamentos_v2 l WHERE l.id = ANY (p_lancamentos)) x) > 1 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'cliente_divergente', 'mensagem', 'Os itens escolhidos são de clientes diferentes.');
  END IF;
  IF abs(v_liq) <= c_tol THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'liquido_zero',
      'mensagem', 'Os extratos escolhidos se anulam (entrada e saída do mesmo valor): use o par de estorno.');
  END IF;
  v_sinal := sign(v_liq)::int;
  v_lado := CASE WHEN v_sinal > 0 THEN 'recebido' ELSE 'pago' END;
  -- o saldo livre de cada lancamento, com sinal pela direcao do liquido do banco (a mesma conta do bloco 'exato')
  FOR r IN SELECT l.*, abs(l.valor) - coalesce((SELECT sum(c.valor_aplicado) FROM public.conciliacao_bancaria_itens c
                                                  WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL), 0) AS livre
             FROM public.financeiro_lancamentos_v2 l WHERE l.id = ANY (p_lancamentos) AND l.cancelado IS NOT TRUE
             ORDER BY abs(l.valor) DESC, l.id LOOP
    v_soma_lan := v_soma_lan + r.livre * CASE WHEN (v_sinal < 0 AND r.sinal = '-1') OR (v_sinal > 0 AND r.sinal = '1') THEN 1 ELSE -1 END;
    IF v_mod.id IS NULL THEN v_mod := r; END IF;
  END LOOP;
  v_dif := round(abs(v_liq) - v_soma_lan, 2);
  v_sentido := CASE WHEN abs(v_dif) <= c_tol THEN 'igual' WHEN v_dif < 0 THEN 'a_menos' ELSE 'a_mais' END;
  v_desc_mod := coalesce(v_mod.descricao, 'lançamento');

  -- a OC envolvida (algum lancamento com parte viva)
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('operacao_id', o.id, 'tipo', o.tipo_operacao, 'modelo', o.modelo_financeiro,
           'status', o.status_comercial, 'versao', o.versao)), '[]'::jsonb)
    INTO v_ocs
    FROM public.zoo_operacao_partes pt JOIN public.zoo_operacoes_comerciais o ON o.id = pt.operacao_id
   WHERE pt.financeiro_lancamento_id = ANY (p_lancamentos) AND pt.cancelada = false;
  SELECT x INTO v_oc FROM jsonb_array_elements(v_ocs) x
   WHERE x->>'modelo' = 'conta_corrente' AND x->>'status' <> 'cancelada' LIMIT 1;

  v_fav := public._fn_conc_favorecido_do_extrato(v_cli, v_hist);
  v_fav_origem := CASE WHEN v_fav IS NOT NULL THEN 'extrato' ELSE 'lancamento' END;
  v_fav := coalesce(v_fav, v_mod.favorecido_id);

  IF v_sentido = 'igual' THEN
    v_frase := format('O banco e os lançamentos batem: %s.', public._fn_conc_brl(v_liq));
    v_opcoes := jsonb_build_array(jsonb_build_object('codigo', 'ligar', 'rpc', 'fn_conc_ligar_com_diferenca',
      'frase', 'Ligar os lançamentos ao extrato.'));
  ELSIF v_sentido = 'a_menos' THEN
    v_frase := format('O banco tem %s e os lançamentos %s: %s %s a menos.', public._fn_conc_brl(v_liq), public._fn_conc_brl(v_soma_lan),
      CASE WHEN v_sinal > 0 THEN 'recebeu' ELSE 'pagou' END, public._fn_conc_brl(v_dif));
    -- a alocacao do bloco 'mais antigo primeiro' (a mesma ordem dele): so' entram os lancamentos que recebem; o ultimo fica com o
    -- que falta em aberto; os que nao recebem nada ficam como estao
    v_resta := abs(v_liq);
    FOR r IN SELECT l.id, l.descricao, abs(l.valor) - coalesce((SELECT sum(c.valor_aplicado) FROM public.conciliacao_bancaria_itens c
                                                  WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL), 0) AS livre
               FROM public.financeiro_lancamentos_v2 l WHERE l.id = ANY (p_lancamentos) AND l.cancelado IS NOT TRUE
              ORDER BY l.data_competencia NULLS LAST, l.data_vencimento NULLS LAST, l.created_at NULLS LAST, abs(l.valor) DESC, l.id LOOP
      IF v_resta <= c_tol THEN v_fora := v_fora + 1; CONTINUE; END IF;
      v_aloc := v_aloc || jsonb_build_object('lancamento_id', r.id, 'descricao', r.descricao, 'aplica', least(r.livre, v_resta),
                                              'fica_aberto', greatest(r.livre - v_resta, 0));
      IF r.livre > v_resta THEN v_ultimo := r.descricao; v_aberto := r.livre - v_resta; END IF;
      v_resta := v_resta - least(r.livre, v_resta);
    END LOOP;
    v_opcoes := jsonb_build_array(jsonb_build_object('codigo', 'ligar_com_falta', 'rpc', 'fn_conc_ligar_com_diferenca', 'alocacao', v_aloc,
      'frase', format('Ligar o que entrou%s%s.', CASE WHEN v_ultimo IS NULL THEN ' (os lançamentos que recebem fecham inteiros)'
          ELSE format(': "%s" fica com %s em aberto', v_ultimo, public._fn_conc_brl(v_aberto)) END,
        CASE WHEN v_fora = 0 THEN '' WHEN v_fora = 1 THEN '; 1 lançamento não recebe nada agora e continua em aberto'
             ELSE format('; %s lançamentos não recebem nada agora e continuam em aberto', v_fora) END)));
  ELSE
    v_frase := format('O banco tem %s e os lançamentos %s: sobram %s. Escolha o destino da sobra.',
      public._fn_conc_brl(v_liq), public._fn_conc_brl(v_soma_lan), public._fn_conc_brl(v_dif));
    v_opcoes := jsonb_build_array(jsonb_build_object('codigo', 'acrescentar_lancamento', 'rpc', 'fn_conc_buscar_para_ligar',
      'frase', format('Acrescentar o lançamento que falta (%s): busca por descrição, favorecido ou valor, em qualquer data, inclusive futura.',
        public._fn_conc_brl(v_dif))));
    IF v_oc IS NOT NULL THEN
      v_opcoes := v_opcoes || jsonb_build_object('codigo', 'sobra_na_oc', 'rpc', 'fn_conc_ligar_com_diferenca', 'operacao_id', v_oc->>'operacao_id',
        'frase', format('Lançar a sobra de %s na operação comercial como %s; o saldo da operação absorve.', public._fn_conc_brl(v_dif),
          CASE WHEN v_oc->>'tipo' = 'compra' THEN 'pagamento a mais ao vendedor' ELSE 'recebimento a mais (adiantamento do comprador)' END));
    END IF;
    v_opcoes := v_opcoes || jsonb_build_object('codigo', 'criar_diferenca', 'rpc', 'fn_conc_ligar_com_diferenca',
      'frase', format('Criar o lançamento da diferença: %s em %s, na conta de "%s"%s.', public._fn_conc_brl(v_dif), to_char(v_data, 'DD/MM/YYYY'),
        coalesce(v_mod.subcentro, 'sem classificação'),
        CASE WHEN v_fav IS NULL THEN ', sem favorecido' WHEN v_fav_origem = 'extrato' THEN ', favorecido do extrato' ELSE ', favorecido do lançamento original' END),
      'previa', jsonb_build_object('valor', v_dif, 'data', v_data, 'favorecido_id', v_fav, 'favorecido_origem', v_fav_origem,
        'plano_conta_id', v_mod.plano_conta_id, 'subcentro', v_mod.subcentro, 'modelo_id', v_mod.id,
        'descricao', format('Diferença do extrato de %s · %s', to_char(v_data, 'DD/MM/YYYY'), v_desc_mod)));
  END IF;

  RETURN jsonb_build_object('ok', true, 'cliente_id', v_cli, 'direcao', CASE WHEN v_sinal > 0 THEN 'entrada' ELSE 'saida' END,
    'data_extrato', v_data, 'soma_extratos', round(abs(v_liq), 2), 'soma_lancamentos', round(v_soma_lan, 2), 'diferenca', v_dif,
    'sentido', v_sentido, 'ocs', v_ocs, 'frase', v_frase, 'opcoes', v_opcoes);
END
$function$;
REVOKE ALL ON FUNCTION public._fn_conc_diferenca(uuid[], uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_conc_favorecido_do_extrato(uuid, text) FROM PUBLIC, anon, authenticated;

-- ═══════════════════ 3. A SIMULACAO (porta) ═══════════════════
CREATE OR REPLACE FUNCTION public.fn_conc_simular_diferenca(p_extratos uuid[], p_lancamentos uuid[])
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_cli uuid := (SELECT min(e.cliente_id::text)::uuid FROM public.extrato_bancario_v2 e WHERE e.id = ANY (p_extratos));
BEGIN
  IF v_cli IS NULL OR NOT coalesce(public.tenant_ok(v_cli), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem acesso a este registro';
  END IF;
  RETURN public._fn_conc_diferenca(p_extratos, p_lancamentos);
END
$function$;
REVOKE ALL ON FUNCTION public.fn_conc_simular_diferenca(uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conc_simular_diferenca(uuid[], uuid[]) TO authenticated, service_role;

-- ═══════════════════ 4. EXECUTAR A OPCAO (porta) ═══════════════════
CREATE OR REPLACE FUNCTION public.fn_conc_ligar_com_diferenca(p_extratos uuid[], p_lancamentos uuid[], p_opcao text, p_motivo text,
                                                             p_simular boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_uid uuid := auth.uid(); s jsonb; v_cli uuid; op jsonb; v_prev jsonb; v_mod public.financeiro_lancamentos_v2; v_novo uuid;
  v_oc public.zoo_operacoes_comerciais; v_bloco jsonb; v_vinc jsonb;
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
      ELSE format('Ligado; a sobra de %s entrou na operação comercial.', public._fn_conc_brl((s->>'diferenca')::numeric)) END);
END
$function$;
REVOKE ALL ON FUNCTION public.fn_conc_ligar_com_diferenca(uuid[], uuid[], text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conc_ligar_com_diferenca(uuid[], uuid[], text, text, boolean) TO authenticated, service_role;

-- ═══════════════════ 5. DESFAZER O BLOCO CANCELA O LANCAMENTO DA DIFERENCA ═══════════════════
SELECT pg_temp._trocar('public.fn_desfazer_bloco(uuid, text)'::regprocedure, '6980866683e20dd34d511ec57a29e46b', ARRAY[
  $a$  UPDATE conciliacao_blocos SET desfeito_em = now(), desfeito_por = v_uid, desfeito_motivo = p_motivo WHERE id = p_bloco;$a$,
  $a$  -- CONC-SEM-TRAVA-01: o lancamento da diferenca que este bloco criou sai junto (e a parte dele na OC, se foi a sobra na OC)
  UPDATE zoo_operacao_partes pt SET cancelada = true, cancelada_em = now(), cancelada_por = v_uid,
         cancelada_motivo = 'Bloco desfeito: ' || p_motivo, updated_at = now()
    FROM financeiro_lancamentos_v2 l
   WHERE pt.financeiro_lancamento_id = l.id AND pt.cancelada = false AND l.origem_tipo = 'conc:diferenca'
     AND l.id IN (SELECT k2::uuid FROM jsonb_object_keys(v_b.estado_anterior) k2);
  UPDATE financeiro_lancamentos_v2 SET cancelado = true, cancelado_em = now(), cancelado_por = v_uid,
         cancelado_motivo = 'Bloco desfeito: ' || p_motivo, updated_at = now(), updated_by = v_uid
   WHERE origem_tipo = 'conc:diferenca' AND cancelado IS NOT TRUE
     AND id IN (SELECT k2::uuid FROM jsonb_object_keys(v_b.estado_anterior) k2);
  UPDATE conciliacao_blocos SET desfeito_em = now(), desfeito_por = v_uid, desfeito_motivo = p_motivo WHERE id = p_bloco;$a$
]);

-- ═══════════════════ 6. AS RECUSAS DE SOMA DO BLOCO: FRASE PRONTA QUE APONTA AS OPCOES ═══════════════════
SELECT pg_temp._trocar('public.fn_conciliar_bloco(uuid[], uuid[], text, boolean)'::regprocedure, '719372f3833c21aa4dc88b5f7f9b9045', ARRAY[
  $a$format('soma_diverge: os extratos somam %s e os lancamentos (saldo livre) %s — diferenca %s. A regra exato exige soma igual.',
      v_soma_ext, v_soma_lan, v_soma_ext - v_soma_lan)$a$,
  $a$format('soma_diverge: o banco tem %s e os lançamentos %s (diferença de %s). Escolha o que fazer com a diferença: ligar com a falta em aberto, acrescentar o lançamento que falta ou criar o lançamento da diferença.',
      public._fn_conc_brl(v_soma_ext), public._fn_conc_brl(v_soma_lan), public._fn_conc_brl(v_soma_ext - v_soma_lan))$a$,
  $b$format('soma_extratos_maior: os extratos somam %s e os lancamentos so'' %s — sobrariam %s do banco sem lancamento. Acrescente o lancamento que falta.',
      v_soma_ext, v_soma_lan, v_soma_ext - v_soma_lan)$b$,
  $b$format('soma_extratos_maior: o banco tem %s e os lançamentos %s: sobram %s. Escolha o destino da sobra: acrescentar o lançamento que falta, lançar na operação comercial ou criar o lançamento da diferença.',
      public._fn_conc_brl(v_soma_ext), public._fn_conc_brl(v_soma_lan), public._fn_conc_brl(v_soma_ext - v_soma_lan))$b$
]);

DO $confere$
BEGIN
  IF position('conc:diferenca' in pg_get_functiondef('public.fn_desfazer_bloco(uuid, text)'::regprocedure)) = 0
     OR position('Escolha o destino da sobra' in pg_get_functiondef('public.fn_conciliar_bloco(uuid[], uuid[], text, boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'CONC-SEM-TRAVA-01: conferencia final falhou';
  END IF;
END $confere$;
