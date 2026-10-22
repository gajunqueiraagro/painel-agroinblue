-- OC-CANCELAR-CASCATA-01 (versao ENXUTA) — cancelar/excluir a OC nunca deixa filho vivo (Gabriel 21/10/2026). Caso: OC 858acb08
-- (venda 32 novilhas, conta corrente), "excluir" as 14h28: para cancelar foi preciso desvincular a saida adotada 9fcd9237 (ela
-- VOLTOU viva ao zootecnico) e o cancelamento devolveu o titulo vinculado 2db34764 "Venda 032 Novilhas" R$ 160.000 como avulso vivo
-- (`volta_para_conta_original`); os dois foram cancelados a mao as 14h34. E no modelo TITULO o `oc_cancelar` nao fechava compromisso
-- nem programacao (8eff43fa: compromisso R$ 150.000 "aberto"; cfdc86ae: 2 compromissos + 1 programacao).
--   1. `_oc_fechar_compromissos(op, motivo, simular)`: fecha os compromissos da OC SEM titulo pago — cancela os titulos em aberto
--      (financeiro + parte), parcelas, programacoes e o compromisso; trilha `cancelar_compromissos`. Com titulo pago, fica (e' dinheiro
--      que moveu: despesa paga a terceiro continua como estava).
--   2. `_oc_cancelar_conta_corrente`: nada volta avulso. Recebimento em aberto (vinculado ou nascido na OC) e' CANCELADO; o ja' recebido
--      ou conciliado RECUSA com a frase (desvincular e' gesto proprio, no ⋯ do recebimento). Saida (adotada ou registrada) e' CANCELADA,
--      com os titulos dela fora da OC; titulo pago da saida recusa. Mes fechado no P1 recusa ANTES (a frase diz qual e onde reabrir);
--      mes fechado no financeiro vira aviso. As despesas sem pagamento fecham junto (item 1).
--   3. `oc_cancelar`: o modelo titulo tambem fecha compromisso e programacao (item 1), depois das travas de sempre.
--   4. `oc_cancelar_rol`: o modelo titulo tambem lista os compromissos que fecham.
--   5. `oc_excluir_definitivamente`: "Use Cancelar operação" quando a OC nao esta' cancelada ou ainda tem vinculo vivo (e compromisso
--      em aberto conta); a policy de DELETE direto sai — so' se apaga pela RPC, que confere os filhos.
-- Os casos antigos (8eff43fa, cfdc86ae) NAO sao tocados aqui: depois do apply, pela funcao, com trilha.

CREATE FUNCTION pg_temp._trocar(p_fn regprocedure, p_md5 text, p_trocas text[]) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_def text; i int;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = p_fn) <> p_md5 THEN
    RAISE EXCEPTION 'OC-CANCELAR-CASCATA-01: corpo de origem de % divergente', p_fn;
  END IF;
  v_def := pg_get_functiondef(p_fn);
  FOR i IN 1 .. array_length(p_trocas, 1) / 2 LOOP
    IF (length(v_def) - length(replace(v_def, p_trocas[2 * i - 1], ''))) / length(p_trocas[2 * i - 1]) <> 1 THEN
      RAISE EXCEPTION 'OC-CANCELAR-CASCATA-01: trecho % de % nao achado uma vez', i, p_fn;
    END IF;
    v_def := replace(v_def, p_trocas[2 * i - 1], p_trocas[2 * i]);
  END LOOP;
  EXECUTE v_def;
END $f$;

-- ═══════════════════ 1. FECHAR OS COMPROMISSOS SEM PAGAMENTO ═══════════════════
CREATE OR REPLACE FUNCTION public._oc_fechar_compromissos(p_operacao_id uuid, p_motivo text, p_simular boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid; v_op public.zoo_operacoes_comerciais; v_lista jsonb; v_ids uuid[];
BEGIN
  BEGIN v_actor := auth.uid(); EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;
  WITH c AS (
    SELECT c.* FROM public.zoo_operacao_compromissos c
     WHERE c.operacao_id = p_operacao_id AND c.status <> 'cancelado'
       AND NOT EXISTS (
         SELECT 1 FROM public.zoo_operacao_programacoes pr
           JOIN public.zoo_operacao_parcelas_programacao pp ON pp.programacao_id = pr.id
           JOIN public.zoo_operacao_partes pt ON pt.programacao_parcela_id = pp.id AND pt.cancelada = false
           JOIN public.financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id AND f.cancelado IS NOT TRUE
          WHERE pr.compromisso_id = c.id
            AND (f.status_transacao IN ('realizado', 'conciliado') OR f.conciliado_em IS NOT NULL
                 OR EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens ci WHERE ci.lancamento_id = f.id AND ci.desfeito_em IS NULL))))
  SELECT coalesce(jsonb_agg(jsonb_build_object('compromisso_id', c.id, 'componente', c.componente, 'descricao', c.descricao,
           'valor', c.valor_total, 'status', c.status,
           'vencimento', (SELECT min(pp.vencimento) FROM public.zoo_operacao_programacoes pr
                            JOIN public.zoo_operacao_parcelas_programacao pp ON pp.programacao_id = pr.id
                           WHERE pr.compromisso_id = c.id AND pp.status <> 'cancelada'),
           'titulos_em_aberto', (SELECT count(*) FROM public.zoo_operacao_programacoes pr
                            JOIN public.zoo_operacao_parcelas_programacao pp ON pp.programacao_id = pr.id
                            JOIN public.zoo_operacao_partes pt ON pt.programacao_parcela_id = pp.id AND pt.cancelada = false
                            JOIN public.financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id AND f.cancelado IS NOT TRUE
                           WHERE pr.compromisso_id = c.id)) ORDER BY c.created_at), '[]'::jsonb),
         array_agg(c.id)
    INTO v_lista, v_ids FROM c;
  IF coalesce(p_simular, false) OR v_ids IS NULL THEN
    RETURN v_lista;
  END IF;
  -- titulos em aberto destes compromissos: cancelados (nunca apagados), e a parte junto
  UPDATE public.financeiro_lancamentos_v2 f
     SET cancelado = true, cancelado_em = now(), cancelado_por = v_actor, cancelado_motivo = 'Cancelamento da OC: ' || coalesce(p_motivo, ''),
         updated_at = now(), updated_by = v_actor
    FROM public.zoo_operacao_programacoes pr, public.zoo_operacao_parcelas_programacao pp, public.zoo_operacao_partes pt
   WHERE pr.compromisso_id = ANY (v_ids) AND pp.programacao_id = pr.id AND pt.programacao_parcela_id = pp.id AND pt.cancelada = false
     AND f.id = pt.financeiro_lancamento_id AND f.cancelado IS NOT TRUE;
  UPDATE public.zoo_operacao_partes pt
     SET cancelada = true, cancelada_em = now(), cancelada_por = v_actor, cancelada_motivo = 'Cancelamento da OC: ' || coalesce(p_motivo, ''),
         updated_at = now()
    FROM public.zoo_operacao_programacoes pr, public.zoo_operacao_parcelas_programacao pp
   WHERE pr.compromisso_id = ANY (v_ids) AND pp.programacao_id = pr.id AND pt.programacao_parcela_id = pp.id AND pt.cancelada = false;
  UPDATE public.zoo_operacao_parcelas_programacao pp SET status = 'cancelada', updated_at = now()
    FROM public.zoo_operacao_programacoes pr
   WHERE pp.programacao_id = pr.id AND pr.compromisso_id = ANY (v_ids) AND pp.status <> 'cancelada';
  UPDATE public.zoo_operacao_programacoes SET status = 'cancelada' WHERE compromisso_id = ANY (v_ids) AND status <> 'cancelada';
  UPDATE public.zoo_operacao_compromissos SET status = 'cancelado', updated_at = now() WHERE id = ANY (v_ids);
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, dados_novos, usuario_id, origem)
  VALUES (v_op.cliente_id, p_operacao_id, 'cancelar_compromissos',
          jsonb_build_object('motivo', 'Cancelamento da OC: ' || coalesce(p_motivo, '')), jsonb_build_object('compromissos', v_lista), v_actor, 'rpc');
  RETURN v_lista;
END
$function$;
REVOKE ALL ON FUNCTION public._oc_fechar_compromissos(uuid, text, boolean) FROM PUBLIC, anon, authenticated;

-- ═══════════════════ 2. A CONTA CORRENTE: NADA VOLTA AVULSO ═══════════════════
SELECT pg_temp._trocar('public._oc_cancelar_conta_corrente(uuid, text, boolean)'::regprocedure, 'ce1df3214bc973d23df784bba32ce70a', ARRAY[
  -- declaracoes
  $a$v_ev_vinculo uuid; v_restauros jsonb := '[]'::jsonb;  -- OC-DESVINCULAR-COMPETENCIA-01$a$,
  $a$v_ev_vinculo uuid; v_restauros jsonb := '[]'::jsonb;  -- OC-DESVINCULAR-COMPETENCIA-01
  v_fin_saida jsonb; v_avisos jsonb := '[]'::jsonb; v_fechados jsonb;  -- OC-CANCELAR-CASCATA-01$a$,
  -- recebimento: em aberto cancela; pago recusa (nunca volta avulso)
  $b$CASE WHEN x.plano_orig IS NOT NULL THEN 'volta_para_conta_original'
                        WHEN x.realizado THEN 'fica_manual'
                        ELSE 'cancela_programado' END$b$,
  $b$CASE WHEN x.realizado THEN 'pago' ELSE 'cancela' END$b$,
  -- a saida registrada nao recusa mais: ela e' cancelada junto; recusam o pago e o mes fechado
  $c$  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_saidas) s WHERE s->>'origem' = 'registrada') THEN
    v_bloq := v_bloq || jsonb_build_object('tipo', 'saida_registrada',
      'descricao', CASE WHEN v_op.tipo_operacao = 'compra'
        THEN 'Ha entrada registrada pela OC: estorne-a na aba Entrega antes de cancelar.'
        ELSE 'Ha saida registrada pela OC: estorne-a na aba Entrega antes de cancelar.' END);
  END IF;$c$,
  $c$  -- OC-CANCELAR-CASCATA-01: os titulos das saidas que nao sao da OC (a parcela da venda antiga adotada) vao junto
  SELECT coalesce(jsonb_agg(jsonb_build_object('titulo_id', f.id, 'data', coalesce(f.data_vencimento, f.data_competencia),
           'valor', f.valor, 'descricao', f.descricao, 'conta', f.subcentro,
           'pago', (f.status_transacao IN ('realizado', 'conciliado') OR f.conciliado_em IS NOT NULL
                    OR EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens ci WHERE ci.lancamento_id = f.id AND ci.desfeito_em IS NULL)))
           ORDER BY f.data_competencia), '[]')
    INTO v_fin_saida
    FROM public.financeiro_lancamentos_v2 f
   WHERE f.cancelado IS NOT TRUE
     AND f.movimentacao_rebanho_id IN (SELECT m.movimentacao_id FROM public.zoo_operacao_movimentacoes m WHERE m.operacao_id = p_operacao_id)
     AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt WHERE pt.financeiro_lancamento_id = f.id AND pt.operacao_id = p_operacao_id
                       AND pt.cancelada = false);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_receb) x WHERE x->>'acao' = 'pago') THEN
    v_bloq := v_bloq || jsonb_build_object('tipo', 'recebimento_pago', 'descricao',
      (SELECT string_agg(format('%s de %s (R$ %s) já %s', CASE WHEN v_op.tipo_operacao = 'compra' THEN 'Pagamento' ELSE 'Recebimento' END,
                to_char((x->>'data')::date, 'DD/MM/YYYY'), translate(to_char((x->>'valor')::numeric, 'FM999,999,999,990.00'), ',.', '.,'),
                CASE WHEN v_op.tipo_operacao = 'compra' THEN 'pago' ELSE 'recebido' END), '; ')
         FROM jsonb_array_elements(v_receb) x WHERE x->>'acao' = 'pago')
      || ': o dinheiro moveu e não se cancela com a operação. Se ele não é desta operação, use Desvincular no ⋯ dele; se é, a operação não se cancela.');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_fin_saida) x WHERE (x->>'pago')::boolean) THEN
    v_bloq := v_bloq || jsonb_build_object('tipo', 'titulo_da_saida_pago', 'descricao',
      (SELECT string_agg(format('"%s" de %s (R$ %s)', x->>'descricao', to_char((x->>'data')::date, 'DD/MM/YYYY'),
                translate(to_char((x->>'valor')::numeric, 'FM999,999,999,990.00'), ',.', '.,')), '; ')
         FROM jsonb_array_elements(v_fin_saida) x WHERE (x->>'pago')::boolean)
      || ' já pago, da saída da operação: estorne ou desconcilie no Financeiro antes de cancelar.');
  END IF;
  -- mes fechado no Mapa de Pastos (P1): a saida nao se cancela — diz qual e onde reabrir (a trava do banco recusaria depois)
  SELECT v_bloq || coalesce(jsonb_agg(DISTINCT jsonb_build_object('tipo', 'mes_fechado_p1', 'descricao',
           format('%s/%s fechado no Mapa de Pastos (P1): a %s de %s não se cancela. Reabra o período em Produção › Fechamento Área antes.',
             substring(l.data::text, 6, 2), substring(l.data::text, 1, 4),
             CASE WHEN v_op.tipo_operacao = 'compra' THEN 'entrada' ELSE 'saída' END, to_char(l.data, 'DD/MM/YYYY')))), '[]'::jsonb)
    INTO v_bloq
    FROM public.zoo_operacao_movimentacoes m JOIN public.lancamentos l ON l.id = m.movimentacao_id AND l.cancelado IS NOT TRUE
   WHERE m.operacao_id = p_operacao_id
     AND public._fn_status_pilares_fechamento(l.fazenda_id, substring(l.data::text, 1, 7)) #>> '{p1_mapa_pastos,status}' = 'oficial';
  -- mes fechado no financeiro: AVISO (o cancelamento do titulo nao e' barrado por ele)
  SELECT coalesce(jsonb_agg(DISTINCT format('%s/%s fechado no Financeiro: títulos desse mês serão cancelados mesmo assim.',
           substring(f.ano_mes, 6, 2), substring(f.ano_mes, 1, 4))), '[]'::jsonb)
    INTO v_avisos
    FROM public.financeiro_lancamentos_v2 f
   WHERE f.cancelado IS NOT TRUE
     AND (f.id IN (SELECT pt.financeiro_lancamento_id FROM public.zoo_operacao_partes pt WHERE pt.operacao_id = p_operacao_id AND pt.cancelada = false)
          OR f.id IN (SELECT (x->>'titulo_id')::uuid FROM jsonb_array_elements(v_fin_saida) x))
     AND EXISTS (SELECT 1 FROM public.financeiro_fechamentos fe WHERE fe.cliente_id = f.cliente_id AND fe.fazenda_id = f.fazenda_id
                  AND fe.ano_mes = f.ano_mes AND fe.status_fechamento = 'fechado');$c$,
  -- as saidas (adotadas e registradas) sao CANCELADAS, nao desvinculadas; os titulos delas fora da OC vao junto
  $d$    -- saidas adotadas: so' o vinculo sai; a saida continua no zootecnico como estava antes de ser adotada
    FOR r IN SELECT m.* FROM public.zoo_operacao_movimentacoes m WHERE m.operacao_id = p_operacao_id AND m.origem = 'adotada' LOOP
      DELETE FROM public.zoo_operacao_movimentacoes WHERE id = r.id;
      INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, detalhes, usuario_id, origem)
      VALUES (v_op.cliente_id, p_operacao_id, 'desvincular_movimentacao',
        (SELECT to_jsonb(r)), jsonb_build_object('lancamento_id', r.movimentacao_id, 'lote_id', r.operacao_lote_id,
          'motivo', 'Cancelamento da OC: ' || p_motivo, 'desvinculado_por', v_actor, 'desvinculado_em', now()), v_actor, 'rpc');
    END LOOP;$d$,
  $d$    -- OC-CANCELAR-CASCATA-01: as saidas (adotadas e registradas) sao CANCELADAS com a OC — nada volta vivo ao zootecnico;
    -- o vinculo fica (aponta o lancamento cancelado), e os titulos delas fora da OC sao cancelados junto
    FOR r IN SELECT m.* FROM public.zoo_operacao_movimentacoes m JOIN public.lancamentos l ON l.id = m.movimentacao_id AND l.cancelado IS NOT TRUE
              WHERE m.operacao_id = p_operacao_id LOOP
      UPDATE public.lancamentos SET cancelado = true, cancelado_em = now(), cancelado_por = v_actor, updated_at = now(), updated_by = v_actor
       WHERE id = r.movimentacao_id AND cancelado IS NOT TRUE;
      INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
      VALUES (v_op.cliente_id, p_operacao_id, 'cancelar_movimentacao',
        jsonb_build_object('lancamento_id', r.movimentacao_id, 'lote_id', r.operacao_lote_id, 'origem', r.origem,
          'motivo', 'Cancelamento da OC: ' || p_motivo), v_actor, 'rpc');
    END LOOP;
    UPDATE public.financeiro_lancamentos_v2
       SET cancelado = true, cancelado_em = now(), cancelado_por = v_actor, cancelado_motivo = 'Cancelamento da OC: ' || p_motivo,
           updated_at = now(), updated_by = v_actor
     WHERE id IN (SELECT (x->>'titulo_id')::uuid FROM jsonb_array_elements(v_fin_saida) x) AND cancelado IS NOT TRUE;
    -- as despesas (e qualquer compromisso) sem pagamento fecham junto; a paga fica
    v_fechados := public._oc_fechar_compromissos(p_operacao_id, p_motivo, false);$d$,
  $e$    'recebimentos', v_receb, 'saidas', v_saidas, 'compromissos', v_comps, 'despesas', v_desp, 'bloqueios', v_bloq, 'restauros', v_restauros);$e$,
  $e$    'recebimentos', v_receb, 'saidas', v_saidas, 'compromissos', v_comps, 'despesas', v_desp, 'bloqueios', v_bloq, 'restauros', v_restauros,
    'titulos_saida', v_fin_saida, 'avisos', v_avisos);$e$
]);

-- ═══════════════════ 3. O MODELO TITULO TAMBEM FECHA COMPROMISSO E PROGRAMACAO ═══════════════════
SELECT pg_temp._trocar('public.oc_cancelar(uuid, uuid, integer, text)'::regprocedure, '530383d452a429073b20bb12e91fb7ff', ARRAY[
  $a$  UPDATE public.zoo_operacoes_comerciais
    SET status_comercial = 'cancelada', cancelado_em = now(), cancelado_por = v_actor, cancelado_motivo = p_motivo,$a$,
  $a$  -- OC-CANCELAR-CASCATA-01: compromisso, programacao e parcela sem pagamento fecham junto (nos dois modelos)
  PERFORM public._oc_fechar_compromissos(p_operacao_id, p_motivo, false);
  UPDATE public.zoo_operacoes_comerciais
    SET status_comercial = 'cancelada', cancelado_em = now(), cancelado_por = v_actor, cancelado_motivo = p_motivo,$a$
]);

-- ═══════════════════ 4. O ROL DO MODELO TITULO LISTA OS COMPROMISSOS ═══════════════════
SELECT pg_temp._trocar('public.oc_cancelar_rol(uuid)'::regprocedure, '53858a80201fa3aaf60970a0f0ea4eb4', ARRAY[
  $a$    RETURN jsonb_build_object('modelo', v_op.modelo_financeiro);$a$,
  $a$    RETURN jsonb_build_object('modelo', v_op.modelo_financeiro,
      'compromissos', public._oc_fechar_compromissos(p_operacao_id, NULL, true));  -- OC-CANCELAR-CASCATA-01$a$
]);

-- ═══════════════════ 5. EXCLUIR: SO' PELA RPC, E "USE CANCELAR OPERACAO" ═══════════════════
SELECT pg_temp._trocar('public.oc_excluir_definitivamente(uuid, uuid, text)'::regprocedure, 'f098532d0a37eb9e178518610adc89f7', ARRAY[
  $a$    RAISE EXCEPTION 'Somente operacao CANCELADA pode ser excluida (estado atual: %).', v_op.status_comercial$a$,
  $a$    RAISE EXCEPTION 'Use Cancelar operação primeiro: só a operação cancelada se exclui, e o cancelamento fecha tudo o que ela carrega (estado atual: %).', v_op.status_comercial$a$,
  $b$  IF v_mov_ativa > 0 OR v_titulo_ativo > 0 OR v_liq_ativa > 0 OR v_concil_ativa > 0 THEN$b$,
  $b$  -- OC-CANCELAR-CASCATA-01: compromisso ou programacao em aberto tambem e' filho vivo
  SELECT v_titulo_ativo + count(*) INTO v_titulo_ativo FROM public.zoo_operacao_compromissos c
   WHERE c.operacao_id = p_operacao_id AND c.status <> 'cancelado';
  IF v_mov_ativa > 0 OR v_titulo_ativo > 0 OR v_liq_ativa > 0 OR v_concil_ativa > 0 THEN$b$,
  $c$    RAISE EXCEPTION 'Exclusao bloqueada: a operacao ainda tem efeitos ativos (%). Estorne esses efeitos antes de excluir.', v_impedimentos$c$,
  $c$    RAISE EXCEPTION 'Exclusão bloqueada: a operação ainda carrega efeitos vivos (%). Use Cancelar operação, que fecha tudo junto, e exclua depois.', v_impedimentos$c$
]);
DROP POLICY IF EXISTS zoo_operacoes_comerciais_delete ON public.zoo_operacoes_comerciais;

DO $confere$
BEGIN
  IF position('_oc_fechar_compromissos' in pg_get_functiondef('public.oc_cancelar(uuid, uuid, integer, text)'::regprocedure)) = 0
     OR position('cancelar_movimentacao' in pg_get_functiondef('public._oc_cancelar_conta_corrente(uuid, text, boolean)'::regprocedure)) = 0
     OR position('Use Cancelar operação' in pg_get_functiondef('public.oc_excluir_definitivamente(uuid, uuid, text)'::regprocedure)) = 0
     OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.zoo_operacoes_comerciais'::regclass AND polcmd = 'd') THEN
    RAISE EXCEPTION 'OC-CANCELAR-CASCATA-01: conferencia final falhou';
  END IF;
END $confere$;
