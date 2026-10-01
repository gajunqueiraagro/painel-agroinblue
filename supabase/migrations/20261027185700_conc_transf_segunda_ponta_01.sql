-- CONC-TRANSF-SEGUNDA-PONTA-01 — a MEIA TRANSFERENCIA (uma ponta conciliada, a outra solta) entra no "Transferencias
-- entre contas" e fecha com a dupla ponta.
--
-- Fato (medido no proto em 01/10, NJ): o backfill de jun/2026 que cancelou crus duplicados ('backfill_lancamento_cancelado')
-- deixou SOLTA a segunda ponta de transferencias que ja tinham a outra conciliada — 58 extratos livres de mar a jul, todos
-- com exatamente 1 transferencia compativel. Nada as fechava: fn_transferencias_sugeridas so lista pares com AS DUAS pontas
-- livres, _fn_transferencia_existente exige transferencia sem vinculo vivo e o Casar recusa ("lancamento ja possui vinculo
-- ativo").
--
-- O MODELO NAO MUDA (PR-CONC-TRANSFERENCIAS-01): 1 lancamento '3-Transferências', origem = conta_bancaria_id, destino =
-- conta_destino_id, UM vinculo vivo por PONTA. A ligacao da segunda ponta e' a que ja existe —
-- fn_vincular_extrato_lancamento(..., p_dupla_ponta := true) — e e' a UNICA porta de gravacao deste PR.
-- fn_transferencias_sugeridas, fn_transferencia_de_extratos e _fn_transferencia_existente NAO sao tocadas.
--
-- 1. fn_transferencias_meia_ponta(p_cliente_id, p_ano_mes) — LEITURA. Extrato livre (como a irma: nao cancelado, nao
--    ignorado, valor <> 0, sem vinculo vivo, um dia de folga nas bordas do mes) x transferencia compativel (plural, nao
--    cancelada, nao meta, com caixa, mesmo valor, na DIRECAO do extrato, |data - extrato| <= 1, EXATAMENTE 1 vinculo vivo e
--    ele em OUTRA conta). So' o par 1:1 dos dois lados. A linha e' do mes quando a ponta livre OU a ponta ja ligada cai nele
--    — o mesmo criterio da irma ("uma das duas pontas no mes"); assim o extrato da borda nao aparece em dois meses
--    (medido: mar..jul 58 linhas, 58 extratos distintos; com a folga sozinha seriam 64, com 6 repetidos).
-- 2. fn_transferencia_segunda_ponta(p_extrato, p_lancamento, p_simular) — TRANSACIONAL, FOR UPDATE. Revalida as regras de 1
--    para o par e recusa com motivo; grava pelo vincular com dupla ponta. Nao muda status nem data do lancamento (ja
--    realizado pela primeira ponta).
-- GESTO CONTRARIO: DROP das duas funcoes; vinculo gravado por elas se desfaz como qualquer outro (desfazer da conciliacao).

CREATE FUNCTION public.fn_transferencias_meia_ponta(p_cliente_id uuid, p_ano_mes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid; v_de date; v_ate date; v_linhas jsonb;
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  IF NOT (public.is_admin_agroinblue(v_uid) OR p_cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem permissao para este cliente';
  END IF;
  IF p_ano_mes IS NULL OR p_ano_mes !~ '^[0-9]{4}-[0-9]{2}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'p_ano_mes deve ser AAAA-MM';
  END IF;
  v_de := to_date(p_ano_mes || '-01', 'YYYY-MM-DD');
  v_ate := (v_de + interval '1 month' - interval '1 day')::date;

  WITH x AS (
    -- os livres: os mesmos da irma (nao ignorados, sem vinculo vivo; um dia de folga nas bordas do mes)
    SELECT e.id, e.conta_bancaria_id conta, e.data_movimento d, e.valor, e.descricao, cb.nome_exibicao nome_conta
      FROM extrato_bancario_v2 e
      JOIN financeiro_contas_bancarias cb ON cb.id = e.conta_bancaria_id
     WHERE e.cliente_id = p_cliente_id AND e.cancelado_em IS NULL AND e.status <> 'ignorado' AND e.valor <> 0
       AND e.data_movimento BETWEEN v_de - 1 AND v_ate + 1
       AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.extrato_id = e.id AND c.desfeito_em IS NULL)
  ), t AS (
    -- a transferencia compativel, na DIRECAO do extrato, com a sua unica ponta viva em OUTRA conta
    SELECT x.id eid, l.id lid, pc.extrato_id pid
      FROM x
      JOIN financeiro_lancamentos_v2 l
        ON l.cliente_id = p_cliente_id
       AND l.tipo_operacao = '3-Transferências'
       AND l.cancelado IS NOT TRUE
       AND COALESCE(l.cenario, 'realizado') <> 'meta'
       AND l.sem_movimentacao_caixa IS NOT TRUE
       AND round(l.valor, 2) = round(abs(x.valor), 2)
       AND ((x.valor < 0 AND l.conta_bancaria_id = x.conta) OR (x.valor > 0 AND l.conta_destino_id = x.conta))
       AND abs(COALESCE(l.data_pagamento, l.data_vencimento) - x.d) <= 1
      JOIN conciliacao_bancaria_itens pc ON pc.lancamento_id = l.id AND pc.desfeito_em IS NULL
      JOIN extrato_bancario_v2 pe ON pe.id = pc.extrato_id AND pe.conta_bancaria_id <> x.conta
     WHERE (SELECT count(*) FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL) = 1
  ), g AS (
    SELECT t.*, count(*) OVER (PARTITION BY t.eid) ne, count(*) OVER (PARTITION BY t.lid) nl FROM t
  ), linhas AS (
    SELECT x.d, x.valor, x.id,
      jsonb_build_object(
        'extrato', jsonb_build_object('id', x.id, 'data', x.d, 'valor', x.valor, 'conta_id', x.conta,
                                      'conta', x.nome_conta, 'descricao', x.descricao),
        'transferencia_id', g.lid,
        'ponta_ligada', jsonb_build_object('extrato_id', pe.id, 'data', pe.data_movimento, 'valor', pe.valor,
                                           'conta_id', pe.conta_bancaria_id, 'conta', pcb.nome_exibicao)
      ) linha
      FROM g
      JOIN x ON x.id = g.eid
      JOIN extrato_bancario_v2 pe ON pe.id = g.pid
      JOIN financeiro_contas_bancarias pcb ON pcb.id = pe.conta_bancaria_id
     WHERE g.ne = 1 AND g.nl = 1
       AND (x.d BETWEEN v_de AND v_ate OR pe.data_movimento BETWEEN v_de AND v_ate)
  )
  SELECT COALESCE(jsonb_agg(l.linha ORDER BY l.d, l.valor, l.id), '[]'::jsonb)
    INTO v_linhas
    FROM linhas l;

  RETURN jsonb_build_object('ok', true, 'ano_mes', p_ano_mes, 'linhas', v_linhas, 'total', jsonb_array_length(v_linhas));
END;
$function$;

CREATE FUNCTION public.fn_transferencia_segunda_ponta(p_extrato uuid, p_lancamento uuid, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid; e extrato_bancario_v2%ROWTYPE; l financeiro_lancamentos_v2%ROWTYPE;
  v_valor numeric; v_vivos int; v_aqui int; v_meses text[]; v_fazendas uuid[];
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  -- FOR UPDATE: duas confirmacoes do mesmo extrato ao mesmo tempo — a segunda espera e o encontra ja' conciliado
  SELECT * INTO e FROM extrato_bancario_v2 WHERE id = p_extrato AND cancelado_em IS NULL FOR UPDATE;
  IF e.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'extrato_nao_encontrado'); END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR e.cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem permissao para este cliente';
  END IF;
  IF e.status = 'ignorado' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'extrato_ignorado'); END IF;

  SELECT * INTO l FROM financeiro_lancamentos_v2 WHERE id = p_lancamento FOR UPDATE;
  IF l.id IS NULL OR l.cliente_id IS DISTINCT FROM e.cliente_id OR l.tipo_operacao IS DISTINCT FROM '3-Transferências'
     OR l.cancelado IS TRUE OR COALESCE(l.cenario, 'realizado') = 'meta' OR l.sem_movimentacao_caixa IS TRUE THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_e_transferencia');
  END IF;
  IF e.valor = 0 OR round(l.valor, 2) <> round(abs(e.valor), 2) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'valores_diferentes');
  END IF;
  IF NOT ((e.valor < 0 AND l.conta_bancaria_id = e.conta_bancaria_id)
       OR (e.valor > 0 AND l.conta_destino_id = e.conta_bancaria_id)) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'direcao_errada');
  END IF;
  IF abs(COALESCE(l.data_pagamento, l.data_vencimento) - e.data_movimento) > 1 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fora_da_janela');
  END IF;

  SELECT count(*), count(*) FILTER (WHERE x.conta_bancaria_id = e.conta_bancaria_id)
    INTO v_vivos, v_aqui
    FROM conciliacao_bancaria_itens c JOIN extrato_bancario_v2 x ON x.id = c.extrato_id
   WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL;
  -- a ponta desta conta ja' ligada vem ANTES do "extrato ja' conciliado": repetir o mesmo par diz o que de fato houve
  IF v_aqui > 0 THEN RETURN jsonb_build_object('ok', false, 'motivo', 'ponta_ja_ligada'); END IF;
  IF EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.extrato_id = e.id AND c.desfeito_em IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'extrato_ja_conciliado');
  END IF;
  IF v_vivos <> 1 THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sem_outra_ponta'); END IF;

  -- mes fechado: a mesma regra da irma (os meses do extrato e do lancamento, nas fazendas do lancamento e da conta)
  v_meses := ARRAY[to_char(e.data_movimento, 'YYYY-MM'), l.ano_mes];
  SELECT array_agg(DISTINCT z) INTO v_fazendas
    FROM unnest(ARRAY[l.fazenda_id,
                      (SELECT fazenda_id FROM financeiro_contas_bancarias WHERE id = e.conta_bancaria_id)]) z
   WHERE z IS NOT NULL;
  IF EXISTS (SELECT 1 FROM financeiro_fechamentos f
              WHERE f.cliente_id = e.cliente_id AND f.status_fechamento = 'fechado'
                AND f.ano_mes = ANY(v_meses) AND f.fazenda_id = ANY(v_fazendas)) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'mes_fechado');
  END IF;

  v_valor := round(abs(e.valor), 2);
  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'acao', 'casar_existente',
      'lancamento_id', l.id, 'extrato_id', e.id, 'valor', v_valor);
  END IF;

  -- a segunda ponta pela MESMA rotina do vincular — a unica porta; o lancamento nao muda (ja realizado pela primeira)
  PERFORM public.fn_vincular_extrato_lancamento(e.id, l.id, v_valor, true);

  RETURN jsonb_build_object('ok', true, 'simulado', false, 'acao', 'casar_existente',
    'lancamento_id', l.id, 'extrato_id', e.id, 'valor', v_valor, 'vinculos', 1);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_transferencias_meia_ponta(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_transferencia_segunda_ponta(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_transferencias_meia_ponta(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_transferencia_segunda_ponta(uuid, uuid, boolean) TO authenticated, service_role;
