-- OC-CANCELAR-CASCATA-01 — cancelar/excluir a OC nunca deixa filho vivo. Sobre dados reais do proto, admin simulado; termina em
-- RAISE 'OK' (desfaz tudo).
--   T1 conta corrente: escolhe uma venda viva com saida e sem bloqueio no rol; cancela -> nenhuma saida, titulo (da OC ou da saida),
--      compromisso, programacao ou parcela fica vivo; nada volta avulso; trilha `cancelar_movimentacao`
--   T2 depois, `oc_excluir_definitivamente` apaga a OC e o que ela carregava continua cancelado (nenhum orfao vivo)
--   T3 modelo titulo: o rol lista o compromisso aberto da 8eff43fa e `_oc_fechar_compromissos` o fecha com trilha
--   T4 excluir OC viva diz "Use Cancelar operação"; DELETE direto pela API nao existe mais (sem policy de DELETE)
set local statement_timeout = '120s';
select set_config('request.jwt.claims', '{"sub":"7bd0b6ad-2527-4be1-af58-f2cc0c0edd8e","role":"authenticated"}', true);

DO $t$
DECLARE
  o record; rol jsonb; achou boolean := false; movs uuid[]; fins uuid[]; comps uuid[]; n int; r jsonb; msg text;
BEGIN
  -- T1
  FOR o IN SELECT op.id, op.cliente_id, op.versao FROM public.zoo_operacoes_comerciais op
            WHERE op.modelo_financeiro = 'conta_corrente' AND op.tipo_operacao = 'venda' AND op.status_comercial <> 'cancelada'
              AND EXISTS (SELECT 1 FROM public.zoo_operacao_movimentacoes m JOIN public.lancamentos l ON l.id = m.movimentacao_id
                           AND l.cancelado IS NOT TRUE WHERE m.operacao_id = op.id)
            ORDER BY op.created_at LOOP
    rol := public.oc_cancelar_rol(o.id);
    IF jsonb_array_length(rol->'bloqueios') = 0 THEN achou := true; EXIT; END IF;
  END LOOP;
  IF NOT achou THEN RAISE EXCEPTION 'T1 sem OC de conta corrente cancelavel para provar'; END IF;
  SELECT array_agg(m.movimentacao_id) INTO movs FROM public.zoo_operacao_movimentacoes m WHERE m.operacao_id = o.id;
  SELECT array_agg(DISTINCT x) INTO fins FROM (
    SELECT pt.financeiro_lancamento_id x FROM public.zoo_operacao_partes pt WHERE pt.operacao_id = o.id AND pt.financeiro_lancamento_id IS NOT NULL
    UNION SELECT f.id FROM public.financeiro_lancamentos_v2 f WHERE f.movimentacao_rebanho_id = ANY (movs)) s;
  SELECT array_agg(c.id) INTO comps FROM public.zoo_operacao_compromissos c WHERE c.operacao_id = o.id;
  PERFORM public.oc_cancelar(o.id, o.cliente_id, o.versao, 'teste OC-CANCELAR-CASCATA-01');
  SELECT count(*) INTO n FROM public.lancamentos WHERE id = ANY (movs) AND cancelado IS NOT TRUE;
  IF n > 0 THEN RAISE EXCEPTION 'T1 % saida(s) viva(s) na OC %', n, o.id; END IF;
  SELECT count(*) INTO n FROM public.financeiro_lancamentos_v2 f WHERE f.id = ANY (fins) AND f.cancelado IS NOT TRUE
     AND NOT (f.status_transacao IN ('realizado', 'conciliado') OR f.conciliado_em IS NOT NULL);
  IF n > 0 THEN RAISE EXCEPTION 'T1 % titulo(s) em aberto vivo(s) na OC %', n, o.id; END IF;
  SELECT count(*) INTO n FROM public.financeiro_lancamentos_v2 f WHERE f.id = ANY (fins) AND f.cancelado IS NOT TRUE AND f.origem_lancamento = 'manual'
     AND f.updated_at = now();
  IF n > 0 THEN RAISE EXCEPTION 'T1 % titulo(s) devolvido(s) avulso(s)', n; END IF;
  SELECT count(*) INTO n FROM public.zoo_operacao_compromissos c WHERE c.id = ANY (comps) AND c.status <> 'cancelado'
     AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_programacoes pr JOIN public.zoo_operacao_parcelas_programacao pp ON pp.programacao_id = pr.id
                      JOIN public.zoo_operacao_partes pt ON pt.programacao_parcela_id = pp.id AND pt.cancelada = false
                      JOIN public.financeiro_lancamentos_v2 f ON f.id = pt.financeiro_lancamento_id AND f.cancelado IS NOT TRUE
                     WHERE pr.compromisso_id = c.id AND f.status_transacao IN ('realizado', 'conciliado'));
  IF n > 0 THEN RAISE EXCEPTION 'T1 % compromisso(s) sem pagamento vivo(s)', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.zoo_operacao_eventos e WHERE e.operacao_id = o.id AND e.acao = 'cancelar_movimentacao') THEN
    RAISE EXCEPTION 'T1 sem trilha da saida cancelada'; END IF;

  -- T2
  PERFORM public.oc_excluir_definitivamente(o.id, o.cliente_id, 'teste OC-CANCELAR-CASCATA-01');
  IF EXISTS (SELECT 1 FROM public.zoo_operacoes_comerciais WHERE id = o.id) THEN RAISE EXCEPTION 'T2 nao excluiu'; END IF;
  SELECT count(*) INTO n FROM public.lancamentos WHERE id = ANY (movs) AND cancelado IS NOT TRUE;
  IF n > 0 THEN RAISE EXCEPTION 'T2 saida viva depois de excluir'; END IF;

  -- T3
  SELECT id, cliente_id INTO o FROM public.zoo_operacoes_comerciais WHERE left(id::text, 8) = '8eff43fa';
  rol := public.oc_cancelar_rol(o.id);
  IF rol->>'modelo' <> 'titulo' OR jsonb_array_length(rol->'compromissos') <> 1 OR (rol->'compromissos'->0->>'valor')::numeric <> 150000 THEN
    RAISE EXCEPTION 'T3 rol: %', rol; END IF;
  r := public._oc_fechar_compromissos(o.id, 'teste', false);
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_compromissos c WHERE c.operacao_id = o.id AND c.status <> 'cancelado')
     OR NOT EXISTS (SELECT 1 FROM public.zoo_operacao_eventos e WHERE e.operacao_id = o.id AND e.acao = 'cancelar_compromissos') THEN
    RAISE EXCEPTION 'T3 nao fechou com trilha'; END IF;

  -- T4
  SELECT op.id, op.cliente_id INTO o FROM public.zoo_operacoes_comerciais op WHERE op.status_comercial <> 'cancelada' ORDER BY op.created_at LIMIT 1;
  msg := null; BEGIN PERFORM public.oc_excluir_definitivamente(o.id, o.cliente_id, 'x'); EXCEPTION WHEN OTHERS THEN msg := sqlerrm; END;
  IF msg NOT LIKE 'Use Cancelar operação primeiro%' THEN RAISE EXCEPTION 'T4 frase: %', msg; END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.zoo_operacoes_comerciais'::regclass AND polcmd IN ('d', '*')) THEN
    RAISE EXCEPTION 'T4 ainda ha policy de DELETE'; END IF;

  RAISE EXCEPTION 'OK';
END $t$;
