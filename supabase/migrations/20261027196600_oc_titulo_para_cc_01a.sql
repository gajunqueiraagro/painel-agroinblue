-- OC-TITULO-PARA-CC-01a (Gabriel, 11/10/2026): MIGRAR UMA OC DO MODELO TITULO PARA O MODELO CONTA CORRENTE — SO' SIMULACAO NESTE PASSO.
-- No modelo titulo, parcela paga com valor diferente do negociado (93.000 pagos = 91.000 de gado + 2.000 de frete) nao tem gesto
-- de ajuste; na conta corrente ja' existe (oc_explicar_saldo). Esta migration NAO migra nenhuma OC: cria as duas funcoes.
--   (1) _oc_fechar_casca_titulo(operacao, estorno_id, motivo) — INTERNA, chamada so' pela RPC de migracao (D1). Fecha a casca do
--       titulo SEM TOCAR O LANCAMENTO do financeiro: estorna a liquidacao automatica -> cancela SO' a parte principal/principal ->
--       marca a parcela 'cancelada' -> a programacao sem parcela viva vira 'cancelada' (os valores que oc_cancelar_programacao ja'
--       usa) -> o compromisso principal sem programacao ativa vira 'cancelado' (o estado da unica OC ja' em conta corrente que
--       tinha compromisso principal: a compra de homologacao de 29/09). Um estorno_id e um motivo em tudo.
--   (2) oc_migrar_para_conta_corrente(operacao, p_simular default true): ORQUESTRA os escritores que existem —
--       _oc_vincular_recebimento (o mesmo que oc_vincular_lancamento chama no ramo conta corrente) e oc_sincronizar_entregas. Nao
--       reescreve regra de classificacao, de rateio nem de DRE. Em simulacao LEVANTA P0001 com o relatorio no MESSAGE: nada fica.
-- D2: a diferenca de DRE e' AVISO, nunca recusa (e' o saldo que oc_explicar_saldo explica depois).
-- D3: OC sem saida de gado registrada e' recusada.
-- ⚠ O QUE MUDA NO LANCAMENTO DO TITULO, e so' pelos escritores de sempre (passo iv): `compoe_dre` (sai do DRE pela parte, gatilho
--   trg_oc_parte_recalcula_dre + _oc_cc_fora_do_dre), `movimentacao_rebanho_id` (o elo antigo se solta) e, em VENDA, competencia e
--   safra (FIN-COMPETENCIA-VENDA-01a). Valor, pagamento, vencimento, conta, plano, status e conciliacao NAO mudam (a guarda e' do
--   proprio _oc_vincular_recebimento).
-- ⚠ A LIQUIDACAO AUTOMATICA estornada em (1) e' REATIVADA pela ponte (oc_sincronizar_liquidacao_de_financeiro, a mesma linha)
--   quando a parte 'recebimento' nasce: na conta corrente o recebimento pago liquida, como nas 168 linhas que ja' existem.
-- FORA: abate (o modelo recusa), boitel, rascunho, cancelada, operacao de teste. NENHUM DADO E' ALTERADO por esta migration.
SET LOCAL lock_timeout = '2s';

CREATE FUNCTION public._oc_fechar_casca_titulo(p_operacao_id uuid, p_estorno_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  r record;
  v_partes jsonb := '[]'::jsonb;
  v_liq int := 0; v_parc int := 0; v_prog int := 0; v_comp int := 0; v_n int;
BEGIN
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Operacao nao encontrada'; END IF;
  IF v_op.modelo_financeiro <> 'titulo' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Operacao ja esta em conta corrente'; END IF;
  IF p_estorno_id IS NULL OR p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Fechar a casca do titulo exige estorno_id e motivo'; END IF;
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt
              WHERE pt.operacao_id = p_operacao_id AND pt.cancelada = false AND pt.natureza = 'principal'
                AND pt.componente <> 'principal') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('Operacao no modelo titulo com parte principal de componente %s: nao migra',
      (SELECT string_agg(DISTINCT pt.componente, ', ') FROM public.zoo_operacao_partes pt
        WHERE pt.operacao_id = p_operacao_id AND pt.cancelada = false AND pt.natureza = 'principal' AND pt.componente <> 'principal')); END IF;
  -- liquidacao MANUAL ativa num titulo principal: a ponte recusaria a parte nova. Nao ha' caso hoje (medido: 0); nao se inventa estorno.
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_liquidacoes q
              JOIN public.zoo_operacao_partes pt ON pt.financeiro_lancamento_id = q.financeiro_lancamento_id
             WHERE pt.operacao_id = p_operacao_id AND pt.cancelada = false AND pt.natureza = 'principal'
               AND q.estornado = false AND q.origem <> 'financeiro') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Operacao com liquidacao manual ativa no principal: estorne-a antes de migrar'; END IF;

  FOR r IN
    SELECT pt.id, pt.financeiro_lancamento_id AS lanc, pt.programacao_parcela_id AS parcela, pt.valor, pt.sequencia_parcela,
           (f.id IS NOT NULL AND f.cancelado IS NOT TRUE) AS lanc_vivo
      FROM public.zoo_operacao_partes pt
      LEFT JOIN public.financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id
     WHERE pt.operacao_id = p_operacao_id AND pt.cancelada = false AND pt.natureza = 'principal' AND pt.componente = 'principal'
     ORDER BY pt.sequencia_parcela, pt.id
  LOOP
    -- (a) a liquidacao automatica do titulo
    IF r.lanc IS NOT NULL THEN
      UPDATE public.zoo_operacao_liquidacoes
         SET estornado = true, estornado_em = now(), estornado_por = v_actor, estorno_motivo = p_motivo,
             updated_at = now(), updated_by = v_actor
       WHERE financeiro_lancamento_id = r.lanc AND operacao_id = p_operacao_id AND estornado = false AND origem = 'financeiro';
      GET DIAGNOSTICS v_n = ROW_COUNT; v_liq := v_liq + v_n;
    END IF;
    -- (b) SO' a parte: o lancamento nao e' tocado (o gatilho da parte so' age em recebimento/devolucao)
    UPDATE public.zoo_operacao_partes
       SET cancelada = true, cancelada_em = now(), cancelada_por = v_actor, cancelada_motivo = p_motivo, updated_at = now()
     WHERE id = r.id;
    -- (c) a parcela da programacao
    IF r.parcela IS NOT NULL THEN
      UPDATE public.zoo_operacao_parcelas_programacao SET status = 'cancelada', updated_at = now()
       WHERE id = r.parcela AND status <> 'cancelada';
      GET DIAGNOSTICS v_n = ROW_COUNT; v_parc := v_parc + v_n;
    END IF;
    v_partes := v_partes || jsonb_build_object('parte_id', r.id, 'lancamento_id', r.lanc, 'lancamento_vivo', r.lanc_vivo,
                  'parcela_id', r.parcela, 'sequencia', r.sequencia_parcela, 'valor', r.valor);
  END LOOP;

  -- (d) parcela PREVISTA (nunca materializada) de programacao do principal: sai junto, como em oc_cancelar_programacao
  UPDATE public.zoo_operacao_parcelas_programacao pp SET status = 'cancelada', updated_at = now()
    FROM public.zoo_operacao_programacoes pg
    JOIN public.zoo_operacao_compromissos c ON c.id = pg.compromisso_id
   WHERE pp.programacao_id = pg.id AND c.operacao_id = p_operacao_id AND c.natureza = 'principal' AND pp.status = 'prevista';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_parc := v_parc + v_n;
  -- (e) programacao do principal sem parcela viva
  UPDATE public.zoo_operacao_programacoes pg SET status = 'cancelada', updated_at = now()
    FROM public.zoo_operacao_compromissos c
   WHERE c.id = pg.compromisso_id AND c.operacao_id = p_operacao_id AND c.natureza = 'principal' AND pg.status = 'ativa'
     AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_parcelas_programacao pp
                      WHERE pp.programacao_id = pg.id AND pp.status <> 'cancelada');
  GET DIAGNOSTICS v_prog = ROW_COUNT;
  -- (f) compromisso principal sem programacao ativa: na conta corrente nao ha' compromisso do principal
  UPDATE public.zoo_operacao_compromissos c SET status = 'cancelado', updated_at = now()
   WHERE c.operacao_id = p_operacao_id AND c.natureza = 'principal' AND c.status <> 'cancelado'
     AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_programacoes pg WHERE pg.compromisso_id = c.id AND pg.status = 'ativa');
  GET DIAGNOSTICS v_comp = ROW_COUNT;

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
  VALUES (v_op.cliente_id, p_operacao_id, 'fechar_casca_titulo',
          jsonb_build_object('estorno_id', p_estorno_id, 'motivo', p_motivo, 'partes', v_partes, 'liquidacoes_estornadas', v_liq,
                             'parcelas_marcadas', v_parc, 'programacoes_fechadas', v_prog, 'compromissos_cancelados', v_comp),
          v_actor, 'rpc');

  RETURN jsonb_build_object('partes', v_partes, 'liquidacoes_estornadas', v_liq, 'parcelas_marcadas', v_parc,
                            'programacoes_fechadas', v_prog, 'compromissos_cancelados', v_comp);
END;
$function$;

CREATE FUNCTION public.oc_migrar_para_conta_corrente(p_operacao_id uuid, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, public
AS $function$
DECLARE
  c_motivo constant text := 'migracao titulo -> conta corrente (OC-TITULO-PARA-CC-01a)';
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_estorno uuid;
  v_casca jsonb; v_cc jsonb; v_x jsonb; v_rel jsonb;
  v_ver int;
  r record;
  v_dre_a numeric; v_dre_d numeric; v_princ numeric; v_liq numeric; v_desp numeric;
  v_meses_a text[]; v_meses_d text[];
  v_avisos text[] := '{}';
  v_dif numeric;
BEGIN
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  -- uma recusa so', que nao diz se a operacao existe (a forma do SEG-TENANT-VARREDURA-01A); sem usuario tambem
  IF NOT FOUND OR NOT coalesce(public.tenant_ok(v_op.cliente_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem acesso a este registro'; END IF;
  IF v_op.modelo_financeiro <> 'titulo' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Operacao ja esta em conta corrente'; END IF;
  IF v_op.tipo_operacao NOT IN ('venda', 'compra') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Conta corrente, por enquanto, so em venda e compra'; END IF;
  IF v_op.rascunho OR v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Operacao em rascunho ou cancelada nao migra'; END IF;
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_boitel b WHERE b.operacao_id = p_operacao_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Venda em boitel nao usa conta corrente'; END IF;
  IF coalesce(v_op.is_teste, false) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Operacao de teste nao migra'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.zoo_operacao_lotes lo WHERE lo.operacao_id = p_operacao_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Operacao sem lote negociado'; END IF;
  -- D3: sem saida ativa com lote nao nasce entrega nenhuma, e o DRE da OC iria a zero
  IF NOT EXISTS (SELECT 1 FROM public.zoo_operacao_movimentacoes m
                   JOIN public.lancamentos l ON l.id = m.movimentacao_id AND l.cancelado IS NOT TRUE
                  WHERE m.operacao_id = p_operacao_id AND m.operacao_lote_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Registre a saida dos animais antes de migrar'; END IF;

  -- (i) ANTES. DRE da OC = os lancamentos vivos ligados a ela por parte viva que compoem o DRE, com o sinal do tipo.
  SELECT coalesce(sum(CASE WHEN f.tipo_operacao LIKE '1-%' THEN f.valor ELSE -f.valor END) FILTER (WHERE f.compoe_dre), 0),
         coalesce(sum(pt.valor) FILTER (WHERE pt.natureza = 'principal'), 0),
         coalesce(sum(pt.valor) FILTER (WHERE pt.natureza = 'obrigacao'), 0),
         coalesce(array_agg(DISTINCT to_char(f.data_competencia, 'YYYY-MM') ORDER BY to_char(f.data_competencia, 'YYYY-MM'))
                    FILTER (WHERE pt.natureza = 'principal' AND f.compoe_dre), '{}')
    INTO v_dre_a, v_princ, v_desp, v_meses_a
    FROM public.zoo_operacao_partes pt
    LEFT JOIN public.financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id AND f.cancelado IS NOT TRUE
   WHERE pt.operacao_id = p_operacao_id AND pt.cancelada = false;
  SELECT coalesce(sum(q.valor), 0) INTO v_liq FROM public.zoo_operacao_liquidacoes q
   WHERE q.operacao_id = p_operacao_id AND q.estornado = false;

  -- (ii) fecha a casca do titulo
  v_estorno := gen_random_uuid();
  v_casca := public._oc_fechar_casca_titulo(p_operacao_id, v_estorno, c_motivo);

  -- (iii) o modelo (versionado e com evento, como em oc_criar_do_legado)
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;
  UPDATE public.zoo_operacoes_comerciais
     SET modelo_financeiro = 'conta_corrente', versao = versao + 1, updated_at = now(), updated_by = v_actor
   WHERE id = p_operacao_id;
  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, dados_anteriores, dados_novos, detalhes, usuario_id, origem)
  VALUES (v_op.cliente_id, p_operacao_id, 'definir_modelo_financeiro', jsonb_build_object('modelo_financeiro', 'titulo'),
          jsonb_build_object('modelo_financeiro', 'conta_corrente'),
          jsonb_build_object('motivo', c_motivo, 'estorno_id', v_estorno, 'versao_anterior', v_ver, 'versao_nova', v_ver + 1),
          v_actor, 'rpc');

  -- (iv) cada lancamento que era de parte principal vira recebimento/pagamento, pelo escritor de sempre
  FOR r IN SELECT (x->>'lancamento_id')::uuid AS lanc FROM jsonb_array_elements(v_casca->'partes') x
            WHERE (x->>'lancamento_vivo')::boolean IS TRUE ORDER BY (x->>'sequencia')::int, x->>'parte_id'
  LOOP
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;
    v_x := public._oc_vincular_recebimento(p_operacao_id, v_ver, r.lanc, c_motivo, false);
    IF (v_x->>'ok')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('Lancamento %s nao virou recebimento: %s', left(r.lanc::text, 8), v_x::text); END IF;
    IF jsonb_array_length(coalesce(v_x->'avisos', '[]'::jsonb)) > 0 THEN
      v_avisos := v_avisos || format('lancamento %s: %s', left(r.lanc::text, 8),
        (SELECT string_agg(a->>'codigo', ', ') FROM jsonb_array_elements(v_x->'avisos') a));
    END IF;
  END LOOP;

  -- (v) as entregas (receita/custo na data de cada saida)
  SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id;
  PERFORM public.oc_sincronizar_entregas(p_operacao_id, v_ver, false);

  -- (vi) DEPOIS, pela mesma formula
  v_cc := public.oc_conta_corrente(p_operacao_id);
  SELECT coalesce(sum(CASE WHEN f.tipo_operacao LIKE '1-%' THEN f.valor ELSE -f.valor END) FILTER (WHERE f.compoe_dre), 0),
         coalesce(array_agg(DISTINCT to_char(f.data_competencia, 'YYYY-MM') ORDER BY to_char(f.data_competencia, 'YYYY-MM'))
                    FILTER (WHERE pt.origem = 'entrega' AND f.compoe_dre), '{}')
    INTO v_dre_d, v_meses_d
    FROM public.zoo_operacao_partes pt
    LEFT JOIN public.financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id AND f.cancelado IS NOT TRUE
   WHERE pt.operacao_id = p_operacao_id AND pt.cancelada = false;

  v_dif := round(v_dre_d - v_dre_a, 2);
  IF abs(v_dre_d - v_dre_a) > 0.005 THEN
    v_avisos := v_avisos || format('DRE muda em R$ %s', translate(to_char(v_dif, 'FM999,999,999,990.00'), ',.', '.,')); END IF;
  IF v_meses_a IS DISTINCT FROM v_meses_d THEN
    v_avisos := v_avisos || format('mes do DRE muda de %s para %s',
      coalesce(nullif(array_to_string(v_meses_a, ', '), ''), '(nenhum)'), coalesce(nullif(array_to_string(v_meses_d, ', '), ''), '(nenhum)')); END IF;
  IF v_op.tipo_operacao = 'venda' THEN
    v_avisos := v_avisos || 'competencia/safra do recebimento passam a ser as da saida'::text; END IF;
  IF coalesce((v_cc->>'saidas_sem_entrega')::int, 0) > 0 THEN
    v_avisos := v_avisos || format('%s saida(s) sem entrega', v_cc->>'saidas_sem_entrega'); END IF;

  -- (vii) o relatorio
  v_rel := jsonb_build_object(
    'operacao_id', p_operacao_id, 'tipo', v_op.tipo_operacao, 'cliente_id', v_op.cliente_id, 'estorno_id', v_estorno,
    'simulado', coalesce(p_simular, true),
    'antes', jsonb_build_object('dre', round(v_dre_a, 2), 'principal', round(v_princ, 2), 'liquidado', round(v_liq, 2),
                                'despesas', round(v_desp, 2), 'meses_titulo', to_jsonb(v_meses_a)),
    'depois', jsonb_build_object('dre', round(v_dre_d, 2), 'entregas', v_cc->'entregue', 'recebimentos', v_cc->'recebido',
                                 'programado', v_cc->'programado', 'saldo', v_cc->'saldo', 'situacao', v_cc->'situacao',
                                 'meses_entrega', to_jsonb(v_meses_d)),
    'casca', v_casca - 'partes' || jsonb_build_object('partes', jsonb_array_length(v_casca->'partes')),
    'dre_diferenca', v_dif, 'dre_bate', abs(v_dre_d - v_dre_a) <= 0.005, 'avisos', to_jsonb(v_avisos));

  INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, usuario_id, origem)
  VALUES (v_op.cliente_id, p_operacao_id, 'migrar_para_conta_corrente', v_rel, v_actor, 'rpc');

  -- (viii) simulacao: a excecao desfaz tudo e leva o relatorio
  IF coalesce(p_simular, true) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = v_rel::text;
  END IF;
  RETURN v_rel;
END;
$function$;

REVOKE ALL ON FUNCTION public._oc_fechar_casca_titulo(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.oc_migrar_para_conta_corrente(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_migrar_para_conta_corrente(uuid, boolean) TO authenticated, service_role;

DO $confere$
begin
  if has_function_privilege('anon', 'public.oc_migrar_para_conta_corrente(uuid, boolean)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.oc_migrar_para_conta_corrente(uuid, boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public._oc_fechar_casca_titulo(uuid, uuid, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._oc_fechar_casca_titulo(uuid, uuid, text)', 'EXECUTE') then
    raise exception 'ACL diferente do esperado';
  end if;
end
$confere$;
