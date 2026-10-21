-- CONC-VALOR-CERTO-ACEITA-01 (Gabriel, 21/10/2026 10h13: "mesmo valor certo pode mudar ocasionalmente"; regra dele desde 06/10 —
-- recorrencia de valor certo tambem muda num mes, "nao pode engessar"). Corrige a regra do CONC-LIGAR-FUTURO-01a, que RECUSAVA o
-- lancamento de valor certo com extrato MAIOR.
--   · VALOR CERTO, extrato MAIOR: aceita COM CONFIRMACAO explicita. Sem ela, nada grava e volta a frase pronta para a tela perguntar —
--     "Este mês veio R$ X (previsto R$ Y). Ligar com o valor do extrato?". Com ela, o lancamento DAQUELE MES passa a valer o extrato
--     (realizado na data do extrato pela baixa no vinculo), com trilha (`financeiro_baixas_no_vinculo`, tipo 'valor_real', antes/depois,
--     motivo "valor do extrato"). A recorrencia/regra NAO muda.
--   · "A CONFIRMAR" (recorrencia tipo_valor 'estimado'): como antes — aceita o valor do extrato sem perguntar.
--   · Extrato MENOR: divide (CONC-BAIXA-NO-VINCULO-01).
--   · Titulo de OC e lancamento de financiamento nao trocam de valor por aqui (a OC/o contrato e' o dono do valor).
-- UMA FORMA SO': o nucleo `_fn_conc_valor_do_extrato` (troca o valor e grava a trilha) e' chamado pelos dois portoes —
-- `fn_conc_ligar_com_valor_real` (ganha `p_aceitar_valor_extrato`) e o "Casar com o banco" (`fn_espelho_casar`: o item leva
-- `aceitar_valor_extrato: true`; na simulacao volta `pergunta`, e gravar sem a confirmacao volta `motivo: 'confirmar_valor_extrato'`).
-- O 1:1 cru (`fn_vincular_extrato_lancamento`) segue recusando o maior, agora dizendo o caminho certo de cada caso.

SET LOCAL lock_timeout = '3s';

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conc_ligar_com_valor_real(uuid, uuid, text)'::regprocedure) <> '09f0cd1d3400c3be9807f8ecf106a377' THEN
    RAISE EXCEPTION 'CONC-VALOR-CERTO-ACEITA-01: corpo de origem de fn_conc_ligar_com_valor_real divergente'; END IF;
END $guarda$;

CREATE FUNCTION pg_temp._trocar(p_fn regprocedure, p_md5 text, p_trocas text[]) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_def text; i int;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p_fn) <> p_md5 THEN
    RAISE EXCEPTION 'CONC-VALOR-CERTO-ACEITA-01: corpo de origem de % divergente', p_fn;
  END IF;
  v_def := pg_get_functiondef(p_fn);
  FOR i IN 1 .. array_length(p_trocas, 1) / 2 LOOP
    IF (length(v_def) - length(replace(v_def, p_trocas[2 * i - 1], ''))) / length(p_trocas[2 * i - 1]) <> 1 THEN
      RAISE EXCEPTION 'CONC-VALOR-CERTO-ACEITA-01: trecho % de % nao achado uma vez', i, p_fn;
    END IF;
    v_def := replace(v_def, p_trocas[2 * i - 1], p_trocas[2 * i]);
  END LOOP;
  EXECUTE v_def;
END $f$;

-- ═══════════════════ O NUCLEO: O VALOR DO EXTRATO, COM TRILHA ═══════════════════
CREATE OR REPLACE FUNCTION public._fn_conc_valor_do_extrato(p_lancamento_id uuid, p_extrato_id uuid, p_valor numeric, p_motivo text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $function$
DECLARE l public.financeiro_lancamentos_v2; v_uid uuid := auth.uid(); v_novo numeric;
BEGIN
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento_id FOR UPDATE;
  v_novo := (CASE WHEN l.valor < 0 THEN -1 ELSE 1 END) * round(abs(p_valor), 2);
  IF v_novo = l.valor THEN RETURN; END IF;
  INSERT INTO public.financeiro_baixas_no_vinculo (cliente_id, tipo, lancamento_id, valor_original, valor_aplicado, antes, depois,
      origem, motivo, feita_por)
  VALUES (l.cliente_id, 'valor_real', l.id, l.valor, round(abs(p_valor), 2),
          jsonb_build_object('valor', l.valor, 'valor_do_mes_em', l.valor_do_mes_em, 'valor_do_mes_origem', l.valor_do_mes_origem,
                             'extrato_id', p_extrato_id),
          jsonb_build_object('valor', v_novo, 'valor_do_mes_origem', 'manual'),
          'conserto', coalesce(nullif(btrim(p_motivo), ''), 'valor do extrato'), v_uid);
  UPDATE public.financeiro_lancamentos_v2
     SET valor = v_novo, valor_do_mes_em = now(), valor_do_mes_origem = 'manual',
         updated_at = now(), updated_by = coalesce(v_uid, updated_by)
   WHERE id = l.id;
END;
$function$;
REVOKE ALL ON FUNCTION public._fn_conc_valor_do_extrato(uuid, uuid, numeric, text) FROM PUBLIC, anon, authenticated;

-- ═══════════════════ O PORTAO 1: ligar com o valor do extrato ═══════════════════
DROP FUNCTION public.fn_conc_ligar_com_valor_real(uuid, uuid, text);
CREATE FUNCTION public.fn_conc_ligar_com_valor_real(p_extrato_id uuid, p_lancamento_id uuid, p_motivo text DEFAULT NULL,
    p_aceitar_valor_extrato boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $function$
DECLARE l public.financeiro_lancamentos_v2; e public.extrato_bancario_v2; v_livre numeric; v_ext numeric; v_estimado boolean; v_ret jsonb;
  v_motivo text := coalesce(nullif(btrim(p_motivo), ''), 'valor do extrato');
BEGIN
  PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[(SELECT cliente_id FROM public.extrato_bancario_v2 WHERE id = p_extrato_id),
                                                   (SELECT cliente_id FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento_id)]);
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento_id FOR UPDATE;
  SELECT * INTO e FROM public.extrato_bancario_v2 WHERE id = p_extrato_id;
  IF l.cliente_id IS DISTINCT FROM e.cliente_id THEN RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501'; END IF;
  IF l.status_transacao NOT IN ('previsto', 'programado', 'agendado') OR l.cancelado IS TRUE THEN
    RAISE EXCEPTION 'Só o lançamento ainda em aberto aceita o valor do extrato. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  IF public._fin_lancamento_casado_com_extrato(l.id) THEN
    RAISE EXCEPTION 'Este lançamento já está ligado a um extrato. Nada foi gravado.' USING ERRCODE = 'P0001', DETAIL = l.id::text;
  END IF;
  v_ext := round(abs(e.valor), 2);
  v_livre := round(abs(l.valor) - public._fn_lancamento_aplicado_vivo(l.id), 2);
  v_estimado := EXISTS (SELECT 1 FROM public.financeiro_recorrencias rr WHERE rr.id = l.recorrencia_id AND rr.tipo_valor = 'estimado');
  IF v_estimado THEN
    -- "A confirmar": o valor do mes e' o do extrato, sem perguntar
    PERFORM public._fn_conc_valor_do_extrato(l.id, e.id, v_ext, v_motivo);
  ELSIF v_ext > v_livre + 0.005 THEN
    IF EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt WHERE pt.financeiro_lancamento_id = l.id AND pt.cancelada IS NOT TRUE)
       OR l.financiamento_id IS NOT NULL OR EXISTS (SELECT 1 FROM public.financiamento_parcelas fp WHERE l.id IN (fp.lancamento_id, fp.lancamento_juros_id)) THEN
      RAISE EXCEPTION 'O extrato de % é maior que o lançamento (% em aberto), e o valor deste lançamento é da operação comercial ou do contrato: corrija lá antes de ligar. Nada foi gravado.',
        public._fn_oc_brl(v_ext), public._fn_oc_brl(v_livre) USING ERRCODE = 'P0001', DETAIL = l.id::text;
    END IF;
    IF NOT coalesce(p_aceitar_valor_extrato, false) THEN
      -- valor certo: pergunta, sem gravar
      RETURN jsonb_build_object('ok', false, 'precisa_confirmar', true, 'lancamento_id', l.id, 'extrato_id', e.id,
        'valor_extrato', v_ext, 'valor_previsto', v_livre,
        'frase', format('Este mês veio %s (previsto %s). Ligar com o valor do extrato?', public._fn_oc_brl(v_ext), public._fn_oc_brl(v_livre)));
    END IF;
    PERFORM public._fn_conc_valor_do_extrato(l.id, e.id, v_ext + (abs(l.valor) - v_livre), v_motivo);
  END IF;
  -- igual, aceito ou MENOR (divide no fim da transacao)
  v_ret := public.fn_vincular_extrato_lancamento(p_extrato_id, p_lancamento_id, least(v_ext, round(abs((SELECT valor FROM public.financeiro_lancamentos_v2 WHERE id = l.id)) - public._fn_lancamento_aplicado_vivo(l.id), 2)), false);
  RETURN v_ret || jsonb_build_object('valor_do_extrato', v_estimado OR v_ext > v_livre + 0.005);
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_conc_ligar_com_valor_real(uuid, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conc_ligar_com_valor_real(uuid, uuid, text, boolean) TO authenticated, service_role;

-- ═══════════════════ O PORTAO 2: o "Casar com o banco" pergunta antes de reescrever o valor certo ═══════════════════
SELECT pg_temp._trocar('public.fn_espelho_casar(uuid, jsonb, boolean, text)'::regprocedure, 'e58fbb02b5597e7d23abca15c3764352', ARRAY[
  $a$  v_ids uuid[] := '{}'; v_vals numeric[] := '{}'; v_r jsonb; v_lid uuid; v_val numeric; v_dir int;$a$,
  $a$  v_ids uuid[] := '{}'; v_vals numeric[] := '{}'; v_r jsonb; v_lid uuid; v_val numeric; v_dir int;
  -- CONC-VALOR-CERTO-ACEITA-01: o valor certo que sobe para o do extrato so' com a confirmacao do item
  v_perg jsonb; v_aceitos uuid[] := '{}'; v_novos numeric[] := '{}';$a$,
  $b$    IF v_val <= 0 THEN RETURN jsonb_build_object('ok', false, 'motivo', 'valor_invalido', 'lancamento_id', v_lid); END IF;$b$,
  $b$    IF v_val <= 0 THEN RETURN jsonb_build_object('ok', false, 'motivo', 'valor_invalido', 'lancamento_id', v_lid); END IF;
    -- CONC-VALOR-CERTO-ACEITA-01: o item MAIOR que o lancamento de valor certo (fora OC, contrato e "a confirmar") pede confirmacao
    IF v_val > abs(v_lan.valor) + 0.005
       AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt WHERE pt.financeiro_lancamento_id = v_lid AND pt.cancelada IS NOT TRUE)
       AND NOT EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 fx WHERE fx.id = v_lid AND fx.financiamento_id IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM public.financiamento_parcelas fp WHERE v_lid IN (fp.lancamento_id, fp.lancamento_juros_id))
       AND NOT EXISTS (SELECT 1 FROM public.financeiro_lancamentos_v2 fx JOIN public.financeiro_recorrencias rr ON rr.id = fx.recorrencia_id
                        WHERE fx.id = v_lid AND rr.tipo_valor = 'estimado') THEN
      IF coalesce((v_item->>'aceitar_valor_extrato')::boolean, false) THEN
        v_aceitos := v_aceitos || v_lid; v_novos := v_novos || v_val;
      ELSIF v_perg IS NULL THEN
        v_perg := jsonb_build_object('lancamento_id', v_lid, 'valor_extrato', v_val, 'valor_previsto', round(abs(v_lan.valor), 2),
          'frase', format('Este mês veio %s (previsto %s). Ligar com o valor do extrato?', public._fn_oc_brl(v_val), public._fn_oc_brl(abs(v_lan.valor))));
      END IF;
    END IF;$b$,
  $c$  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'no_extrato', v_alvo, 'soma', v_soma, 'itens', v_n, 'data_extrato', v_ext.data_movimento);
  END IF;
$c$,
  $c$  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'no_extrato', v_alvo, 'soma', v_soma, 'itens', v_n, 'data_extrato', v_ext.data_movimento)
           || CASE WHEN v_perg IS NOT NULL THEN jsonb_build_object('pergunta', v_perg) ELSE '{}'::jsonb END;
  END IF;
  -- CONC-VALOR-CERTO-ACEITA-01: gravar sem a confirmacao nao grava nada — volta a pergunta
  IF v_perg IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'confirmar_valor_extrato', 'pergunta', v_perg);
  END IF;
  -- o valor do extrato aceito: pelo nucleo, com trilha (o UPDATE abaixo ja' encontra o valor novo)
  FOR i IN 1..coalesce(array_length(v_aceitos, 1), 0) LOOP
    PERFORM public._fn_conc_valor_do_extrato(v_aceitos[i], p_extrato_id, v_novos[i], 'valor do extrato');
  END LOOP;
$c$
]);

-- ═══════════════════ O 1:1 CRU: a recusa do maior diz o caminho de cada caso ═══════════════════
SELECT pg_temp._trocar('public.fn_vincular_extrato_lancamento(uuid, uuid, numeric, boolean)'::regprocedure, '723a6d2216cf8d781b556d012f6cecb0', ARRAY[
  $d$        ELSE format('O extrato de %s é maior que o lançamento (%s em aberto). Corrija o valor do lançamento antes de ligar. Nada foi gravado.',$d$,
  $d$        WHEN EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt WHERE pt.financeiro_lancamento_id = p_lancamento_id AND pt.cancelada IS NOT TRUE)
        THEN format('O extrato de %s é maior que o lançamento (%s em aberto), e o valor deste lançamento é da operação comercial: corrija lá antes de ligar. Nada foi gravado.',
                    public._fn_oc_brl(v_valor), public._fn_oc_brl(abs(v_lan.valor) - public._fn_lancamento_aplicado_vivo(p_lancamento_id)))
        -- CONC-VALOR-CERTO-ACEITA-01: valor certo tambem muda num mes — o caminho e' aceitar o valor do extrato (com confirmacao)
        ELSE format('O extrato de %s é maior que o lançamento (%s em aberto). Para ligar, confirme o valor do extrato deste mês. Nada foi gravado.',$d$
]);

DO $confere$
BEGIN
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_espelho_casar(uuid, jsonb, boolean, text)'::regprocedure) NOT LIKE '%confirmar_valor_extrato%'
     OR (SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_vincular_extrato_lancamento(uuid, uuid, numeric, boolean)'::regprocedure) LIKE '%Corrija o valor do lançamento antes de ligar%' THEN
    RAISE EXCEPTION 'CONC-VALOR-CERTO-ACEITA-01: troca nao entrou'; END IF;
  IF has_function_privilege('anon', 'public.fn_conc_ligar_com_valor_real(uuid, uuid, text, boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_conc_valor_do_extrato(uuid, uuid, numeric, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_espelho_casar(uuid, jsonb, boolean, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONC-VALOR-CERTO-ACEITA-01: ACL aberta'; END IF;
END $confere$;
