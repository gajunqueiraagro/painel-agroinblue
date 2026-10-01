-- CONC-TRANSF-SEGUNDA-PONTA-02 — a meia ponta tem prioridade sobre o par novo.
--
-- Fato (homologacao do Gabriel, 01/10 14:47, NJ abr/2026): duas transferencias Sicredi Lavoura -> Itau de 400.000,00 —
-- 2a9ff323 (ligada so' ao debito Lavoura 27/04) e dc30e5b8 (ligada so' ao credito Itau 28/04). Livres: credito Itau 27/04 e
-- debito Lavoura 28/04. fn_transferencias_meia_ponta listou as 2 meias certas, MAS fn_transferencias_sugeridas listou os
-- mesmos dois livres como par novo (+-1 dia); o Confirmar gravou o par primeiro, fn_transferencia_de_extratos CRIOU a 3a
-- transferencia de4e99d5 e as meias ficaram sem extrato.
--
-- REGRA: extrato livre que completa uma transferencia ja' ligada do outro lado NUNCA entra em par novo. A meia ponta religa
-- o que existe; o par novo cria.
-- 1. _fn_meia_ponta_compativel(extrato) -> a transferencia que ele completa, ou NULL: a regra UNICA, usada pela lista
--    (fn_transferencias_meia_ponta), pela gravacao (fn_transferencia_segunda_ponta) e pelas duas irmas abaixo.
--    1:1 dos dois lados: uma transferencia compativel para o extrato, e um extrato livre compativel para a transferencia.
-- 2. fn_transferencias_sugeridas: no CTE x (os livres) sai quem tem meia ponta. Patch guardado por md5 (so' isso muda).
-- 3. fn_transferencia_de_extratos: saida OU entrada com meia ponta -> {ok:false, motivo:'tem_meia_ponta'} antes de criar
--    ou casar (defesa no gravar, nao so' na lista). Patch guardado por md5.
-- 4. fn_transferencias_meia_ponta e fn_transferencia_segunda_ponta: corpo integral (o da 20261027185700, copiado do arquivo)
--    passando pela regra unica; a segunda ponta recusa 'ambigua' quando os testes passam e a regra nao aponta o par.
-- GESTO CONTRARIO: os quatro corpos de origem estao no ledger (20261001173005 e anteriores); DROP de _fn_meia_ponta_compativel.

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_transferencias_meia_ponta(uuid,text)'::regprocedure) <> '1fa70f9b03f628657ca4015285940f68' THEN
    RAISE EXCEPTION 'CONC-TRANSF-SEGUNDA-PONTA-02: corpo de origem de fn_transferencias_meia_ponta divergente — abortado';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_transferencia_segunda_ponta(uuid,uuid,boolean)'::regprocedure) <> '1a5a6b4fe25d704c31f4a251985eb03f' THEN
    RAISE EXCEPTION 'CONC-TRANSF-SEGUNDA-PONTA-02: corpo de origem de fn_transferencia_segunda_ponta divergente — abortado';
  END IF;
END $guarda$;

-- ═══════════════════ 1. A REGRA UNICA ═══════════════════
CREATE FUNCTION public._fn_meia_ponta_compativel(p_extrato uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- o extrato LIVRE (os mesmos da lista: nao cancelado, nao ignorado, valor <> 0, sem vinculo vivo)
  WITH e AS (
    SELECT x.* FROM extrato_bancario_v2 x
     WHERE x.id = p_extrato AND x.cancelado_em IS NULL AND x.status <> 'ignorado' AND x.valor <> 0
       AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.extrato_id = x.id AND c.desfeito_em IS NULL)
  ), c AS (
    -- a transferencia compativel: plural, nao cancelada, nao meta, com caixa, mesmo valor, na DIRECAO do extrato,
    -- |data - extrato| <= 1, e EXATAMENTE 1 vinculo vivo, em OUTRA conta
    SELECT l.id, COALESCE(l.data_pagamento, l.data_vencimento) dl
      FROM e JOIN financeiro_lancamentos_v2 l
        ON l.cliente_id = e.cliente_id
       AND l.tipo_operacao = '3-Transferências'
       AND l.cancelado IS NOT TRUE
       AND COALESCE(l.cenario, 'realizado') <> 'meta'
       AND l.sem_movimentacao_caixa IS NOT TRUE
       AND round(l.valor, 2) = round(abs(e.valor), 2)
       AND ((e.valor < 0 AND l.conta_bancaria_id = e.conta_bancaria_id) OR (e.valor > 0 AND l.conta_destino_id = e.conta_bancaria_id))
       AND abs(COALESCE(l.data_pagamento, l.data_vencimento) - e.data_movimento) <= 1
     WHERE (SELECT count(*) FROM conciliacao_bancaria_itens v WHERE v.lancamento_id = l.id AND v.desfeito_em IS NULL) = 1
       AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens v JOIN extrato_bancario_v2 y ON y.id = v.extrato_id
                        WHERE v.lancamento_id = l.id AND v.desfeito_em IS NULL AND y.conta_bancaria_id = e.conta_bancaria_id)
  )
  -- 1:1 dos dois lados: uma so' transferencia para o extrato, e um so' extrato livre (este) para a transferencia
  SELECT c.id FROM c, e
   WHERE (SELECT count(*) FROM c) = 1
     AND (SELECT count(*) FROM extrato_bancario_v2 o
           WHERE o.cliente_id = e.cliente_id AND o.conta_bancaria_id = e.conta_bancaria_id
             AND o.cancelado_em IS NULL AND o.status <> 'ignorado' AND sign(o.valor) = sign(e.valor)
             AND round(abs(o.valor), 2) = round(abs(e.valor), 2) AND abs(c.dl - o.data_movimento) <= 1
             AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens v WHERE v.extrato_id = o.id AND v.desfeito_em IS NULL)) = 1
$function$;
REVOKE ALL ON FUNCTION public._fn_meia_ponta_compativel(uuid) FROM PUBLIC, anon, authenticated;

-- ═══════════════════ 4. LISTA E SEGUNDA PONTA PELA REGRA UNICA (corpo integral) ═══════════════════
CREATE OR REPLACE FUNCTION public.fn_transferencias_meia_ponta(p_cliente_id uuid, p_ano_mes text)
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
    -- CONC-TRANSF-SEGUNDA-PONTA-02: a regra de compatibilidade (direcao, valor, janela, UMA ponta viva em outra conta, 1:1
    -- dos dois lados) mora numa funcao so', _fn_meia_ponta_compativel — a mesma que a irma usa para NAO por o extrato em par
    SELECT x.id eid, public._fn_meia_ponta_compativel(x.id) lid FROM x
  ), linhas AS (
    SELECT x.d, x.valor, x.id,
      jsonb_build_object(
        'extrato', jsonb_build_object('id', x.id, 'data', x.d, 'valor', x.valor, 'conta_id', x.conta,
                                      'conta', x.nome_conta, 'descricao', x.descricao),
        'transferencia_id', t.lid,
        'ponta_ligada', jsonb_build_object('extrato_id', pe.id, 'data', pe.data_movimento, 'valor', pe.valor,
                                           'conta_id', pe.conta_bancaria_id, 'conta', pcb.nome_exibicao)
      ) linha
      FROM t
      JOIN x ON x.id = t.eid
      JOIN conciliacao_bancaria_itens pc ON pc.lancamento_id = t.lid AND pc.desfeito_em IS NULL
      JOIN extrato_bancario_v2 pe ON pe.id = pc.extrato_id
      JOIN financeiro_contas_bancarias pcb ON pcb.id = pe.conta_bancaria_id
     WHERE t.lid IS NOT NULL
       AND (x.d BETWEEN v_de AND v_ate OR pe.data_movimento BETWEEN v_de AND v_ate)
  )
  SELECT COALESCE(jsonb_agg(l.linha ORDER BY l.d, l.valor, l.id), '[]'::jsonb)
    INTO v_linhas
    FROM linhas l;

  RETURN jsonb_build_object('ok', true, 'ano_mes', p_ano_mes, 'linhas', v_linhas, 'total', jsonb_array_length(v_linhas));
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_transferencia_segunda_ponta(p_extrato uuid, p_lancamento uuid, p_simular boolean DEFAULT true)
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
  -- CONC-TRANSF-SEGUNDA-PONTA-02: quem decide e' a regra unica — os testes acima so' dizem POR QUE nao serve. Passou neles
  -- e a regra ainda nao aponta esta transferencia: ha' outro movimento ou outra transferencia compativel (nao e' 1:1).
  IF public._fn_meia_ponta_compativel(e.id) IS DISTINCT FROM l.id THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ambigua');
  END IF;

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

-- ═══════════════════ 2. fn_transferencias_sugeridas: o livre com meia ponta nao entra em par (patch guardado) ═══════════════════
DO $mig$
DECLARE v_antes text; v_novo text; v_depois text; a text; b text;
BEGIN
  SELECT prosrc INTO v_antes FROM pg_proc WHERE oid = 'public.fn_transferencias_sugeridas(uuid,text)'::regprocedure;
  IF md5(v_antes) <> '9e14ac4e316afa193b2fa15eac309fff' THEN
    RAISE EXCEPTION 'fn_transferencias_sugeridas nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  END IF;
  -- o CONCEITO (o filtro dos livres) aparece uma vez: conciliacao_bancaria_itens so' no CTE x
  IF (length(v_antes) - length(replace(v_antes, 'conciliacao_bancaria_itens', ''))) / length('conciliacao_bancaria_itens') <> 1 THEN
    RAISE EXCEPTION 'o filtro dos livres nao aparece exatamente 1x em fn_transferencias_sugeridas';
  END IF;
  a := E'       AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.extrato_id = e.id AND c.desfeito_em IS NULL)\n  ), ed AS (';
  b := E'       AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.extrato_id = e.id AND c.desfeito_em IS NULL)\n'
    || E'       -- CONC-TRANSF-SEGUNDA-PONTA-02: o livre que completa uma transferencia ja ligada e'' meia ponta, nunca par novo\n'
    || E'       AND public._fn_meia_ponta_compativel(e.id) IS NULL\n  ), ed AS (';
  IF (length(v_antes) - length(replace(v_antes, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'a ancora do CTE x nao casa exatamente 1x em fn_transferencias_sugeridas';
  END IF;
  v_novo := replace(v_antes, a, b);
  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_transferencias_sugeridas(p_cliente_id uuid, p_ano_mes text)'
       || ' RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''public'' AS $fn$' || v_novo || '$fn$';
  SELECT prosrc INTO v_depois FROM pg_proc WHERE oid = 'public.fn_transferencias_sugeridas(uuid,text)'::regprocedure;
  IF md5(v_depois) <> '6436f1bda40a251b6d89b61e0bb11722' THEN
    RAISE EXCEPTION 'corpo resultante inesperado de fn_transferencias_sugeridas (md5 %)', md5(v_depois);
  END IF;
END $mig$;

-- ═══════════════════ 3. fn_transferencia_de_extratos: recusa 'tem_meia_ponta' (patch guardado) ═══════════════════
DO $mig$
DECLARE v_antes text; v_novo text; v_depois text; a text; b text;
BEGIN
  SELECT prosrc INTO v_antes FROM pg_proc WHERE oid = 'public.fn_transferencia_de_extratos(uuid,uuid,boolean)'::regprocedure;
  IF md5(v_antes) <> '9b3caeed0b910e73bb7f15550b100afc' THEN
    RAISE EXCEPTION 'fn_transferencia_de_extratos nao esta no corpo esperado (md5 %). Migration abortada.', md5(v_antes);
  END IF;
  -- o CONCEITO (a recusa do ja conciliado, ultima antes de criar ou casar) aparece uma vez
  IF (length(v_antes) - length(replace(v_antes, 'extrato_ja_conciliado', ''))) / length('extrato_ja_conciliado') <> 1 THEN
    RAISE EXCEPTION 'extrato_ja_conciliado nao aparece exatamente 1x em fn_transferencia_de_extratos';
  END IF;
  a := E'    RETURN jsonb_build_object(''ok'', false, ''motivo'', ''extrato_ja_conciliado'');\n  END IF;\n';
  b := a
    || E'  -- CONC-TRANSF-SEGUNDA-PONTA-02: saida ou entrada que completa uma transferencia ja ligada e'' meia ponta — o par\n'
    || E'  -- novo criaria uma terceira transferencia (o caso de4e99d5). Defesa no gravar, nao so'' na lista.\n'
    || E'  IF public._fn_meia_ponta_compativel(s.id) IS NOT NULL OR public._fn_meia_ponta_compativel(e.id) IS NOT NULL THEN\n'
    || E'    RETURN jsonb_build_object(''ok'', false, ''motivo'', ''tem_meia_ponta'');\n  END IF;\n';
  IF (length(v_antes) - length(replace(v_antes, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'a ancora da recusa do ja conciliado nao casa exatamente 1x em fn_transferencia_de_extratos';
  END IF;
  v_novo := replace(v_antes, a, b);
  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_transferencia_de_extratos(p_saida uuid, p_entrada uuid, p_simular boolean DEFAULT true)'
       || ' RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS $fn$' || v_novo || '$fn$';
  SELECT prosrc INTO v_depois FROM pg_proc WHERE oid = 'public.fn_transferencia_de_extratos(uuid,uuid,boolean)'::regprocedure;
  IF md5(v_depois) <> '223d4662dd1fc1e100adfddfb1b2bf04' THEN
    RAISE EXCEPTION 'corpo resultante inesperado de fn_transferencia_de_extratos (md5 %)', md5(v_depois);
  END IF;
END $mig$;

DO $confere$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_transferencias_meia_ponta(uuid,text)'::regprocedure) <> '4cd7e206a2727bb5bd0f3e50bf6b7f5b' THEN
    RAISE EXCEPTION 'corpo de destino de fn_transferencias_meia_ponta divergente';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_transferencia_segunda_ponta(uuid,uuid,boolean)'::regprocedure) <> '181b82950ac0ab26eb2a4e2d0c0338f6' THEN
    RAISE EXCEPTION 'corpo de destino de fn_transferencia_segunda_ponta divergente';
  END IF;
END $confere$;
