-- PR-CONC-TRANSFERENCIAS-01 — Transferencias entre contas: sugerir pares de OFX de contas diferentes e fechar as
-- duas pontas num lancamento.
--
-- ⚠ O MODELO NAO MUDA: 1 lancamento '3-Transferências' sinal -1, conta_bancaria_id = origem, conta_destino_id =
--   destino, plano 18010 "Transferência entre Contas Bancárias", realizado; UM vinculo vivo por PONTA em
--   conciliacao_bancaria_itens. Os 6 do NJ que ja' tinham as duas pontas conciliadas sao a prova de que ele fecha.
--
-- ⚠ O QUE FALTAVA (FASE 0, 30/09): as sugestoes que existiam trabalhavam sobre LANCAMENTOS (fn_transferencias_espelhadas
--   e fn_transferencia_unir, na Mesa) — depois do "Criar lancamentos em lote", fora da ordem do fluxo do mes; o detector
--   sobre o EXTRATO (useExtratoParesOfx) morava numa tela sem importador; e o Casar recusava a segunda ponta
--   (`lancamento ja possui vinculo ativo`). No NJ set/26 havia 12 pares de OFX soltos, e nenhuma peca os fechava.
--
-- ⚠ O QUE MUDA:
--   1. public._fn_transferencia_existente(...) — a transferencia JA LANCADA compativel com um par (mesmo valor, mesmas
--      contas na mesma direcao, +-1 dia de qualquer ponta, sem vinculo vivo). Uma regra so', lida pela sugestao e
--      pela confirmacao. Interna: nao e' SECURITY DEFINER e nao se executa pela API.
--   2. public.fn_transferencias_sugeridas(cliente, ano_mes) — LEITURA. Extratos livres (nao ignorados, sem vinculo
--      vivo), contas diferentes, valor oposto exato, |dias| <= 1, com uma das pontas no mes. 1:1 dos dois lados =
--      'limpo'; o no' que so' se resolve pelo mesmo dia = 'mesmo_dia' (e so' quando TODO vizinho das duas pontas tem o
--      seu proprio par do mesmo dia — resolver nao pode roubar a unica saida de ninguem); o resto = 'ambiguo', com as
--      contrapartes possiveis.
--   3. public.fn_transferencia_de_extratos(saida, entrada, simular) — TRANSACIONAL. Valida e: (a) casa as duas pontas
--      na transferencia existente, ou (b) cria a transferencia (18010, data = da saida, descricao = da saida). Os dois
--      vinculos saem da MESMA rotina do vincular (fn_vincular_extrato_lancamento).
--   4. fn_vincular_extrato_lancamento ganha p_dupla_ponta boolean DEFAULT false. Com false, o corpo faz EXATAMENTE o
--      que fazia (os dois trechos novos so' agem com true). Com true, so' numa transferencia e na ponta da sua
--      direcao: o vinculo vivo que recusa e o saldo livre que se confere passam a ser os DAQUELA conta.
--      Patch guardado por md5 (regra do CLAUDE.md): origem b22fd273a0e05f0f55839b4ec4ba007b, cada ancora 1x, destino
--      conferido. As duas ancoras sao os dois conceitos que olham vinculo por lancamento: a recusa (1 ocorrencia de
--      "c.lancamento_id = p_lancamento_id AND c.desfeito_em IS NULL") e a sobre-aplicacao do lado do lancamento
--      (1 de "ci.lancamento_id = p_lancamento_id"). O "vinculo ativo duplicado para o par" fica como estava.
--      A assinatura muda (DROP + CREATE): os chamadores de hoje — fn_espelho_casar e fn_vincular_exatos_mes por
--      posicao, a tela por nome — chamam com 3 argumentos e caem no default false.
--   5. guard_transferencia_conta_destino passa a ver o plural '3-Transferências' (o que todo escritor grava) alem do
--      singular. Medido antes: 0 transferencias no plural sem conta_destino_id no proto inteiro, 2 no singular (as duas
--      canceladas). A semantica fica a de sempre: INSERT sem destino recusa; UPDATE so' recusa quem REMOVE um destino
--      que existia — registro legado sem destino continua editavel.
--   6. DROP de fn_marcar_extrato_transferencia: conciliava UMA ponta so' e nao tinha chamador (zero no repo alem do
--      types.ts gerado, zero no banco). A tabela transferencia_ofx_pares FICA (historico: 13 decisoes), sem escrita nova.
--
-- ⚠ Todo UPDATE com WHERE (pg_safeupdate, a tela roda sob ele). ACL: as duas RPCs novas so' para authenticated e
--   service_role; a interna so' para o dono.

-- ═══ 4. fn_vincular_extrato_lancamento: p_dupla_ponta ═══════════════════════════════════════════════════════════════
DO $patch$
DECLARE
  v_src  text;
  v_novo text;
  n      int;
  a1_old text := $a1o$    WHERE c.lancamento_id = p_lancamento_id AND c.desfeito_em IS NULL
  ) THEN
    RAISE EXCEPTION 'lancamento ja possui vinculo ativo: %', p_lancamento_id;
  END IF;$a1o$;
  a1_new text := $a1n$    WHERE c.lancamento_id = p_lancamento_id AND c.desfeito_em IS NULL
      -- PR-CONC-TRANSFERENCIAS-01: com p_dupla_ponta, so' o vinculo na MESMA conta (a mesma ponta) recusa
      AND (NOT p_dupla_ponta OR EXISTS (SELECT 1 FROM extrato_bancario_v2 x
                                        WHERE x.id = c.extrato_id AND x.conta_bancaria_id = v_ext.conta_bancaria_id))
  ) THEN
    RAISE EXCEPTION 'lancamento ja possui vinculo ativo: %', p_lancamento_id;
  END IF;

  -- PR-CONC-TRANSFERENCIAS-01: a dupla ponta so' existe na transferencia, e cada ponta na sua direcao
  -- (saida do banco na conta de origem, entrada na de destino)
  IF p_dupla_ponta AND NOT (
       v_lan.tipo_operacao LIKE '3-%'
       AND ((v_ext.valor < 0 AND v_lan.conta_bancaria_id = v_ext.conta_bancaria_id)
         OR (v_ext.valor > 0 AND v_lan.conta_destino_id  = v_ext.conta_bancaria_id))) THEN
    RAISE EXCEPTION 'dupla ponta so vale para a ponta de uma transferencia: %', p_lancamento_id;
  END IF;$a1n$;
  a2_old text := $a2o$WHERE ci.lancamento_id = p_lancamento_id AND ci.desfeito_em IS NULL), 0)) + 0.005 THEN$a2o$;
  a2_new text := $a2n$WHERE ci.lancamento_id = p_lancamento_id AND ci.desfeito_em IS NULL
                     AND (NOT p_dupla_ponta OR EXISTS (SELECT 1 FROM public.extrato_bancario_v2 x
                          WHERE x.id = ci.extrato_id AND x.conta_bancaria_id = v_ext.conta_bancaria_id))), 0)) + 0.005 THEN$a2n$;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc
   WHERE oid = 'public.fn_vincular_extrato_lancamento(uuid,uuid,numeric)'::regprocedure;
  IF md5(v_src) <> 'b22fd273a0e05f0f55839b4ec4ba007b' THEN
    RAISE EXCEPTION 'fn_vincular_extrato_lancamento: corpo de origem divergente (md5 %)', md5(v_src);
  END IF;
  n := (length(v_src) - length(replace(v_src, a1_old, ''))) / length(a1_old);
  IF n <> 1 THEN RAISE EXCEPTION 'ancora 1 (recusa por lancamento) casou % vezes', n; END IF;
  n := (length(v_src) - length(replace(v_src, a2_old, ''))) / length(a2_old);
  IF n <> 1 THEN RAISE EXCEPTION 'ancora 2 (sobre-aplicacao do lancamento) casou % vezes', n; END IF;
  v_novo := replace(replace(v_src, a1_old, a1_new), a2_old, a2_new);
  IF md5(v_novo) <> 'c03d4cb4fd603a9a356becbdd01315e5' THEN
    RAISE EXCEPTION 'fn_vincular_extrato_lancamento: corpo de destino divergente (md5 %)', md5(v_novo);
  END IF;

  DROP FUNCTION public.fn_vincular_extrato_lancamento(uuid, uuid, numeric);
  EXECUTE 'CREATE FUNCTION public.fn_vincular_extrato_lancamento('
       || 'p_extrato_id uuid, p_lancamento_id uuid, p_valor_aplicado numeric DEFAULT NULL::numeric, '
       || 'p_dupla_ponta boolean DEFAULT false) '
       || 'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS '
       || quote_literal(v_novo);
END
$patch$;

REVOKE ALL ON FUNCTION public.fn_vincular_extrato_lancamento(uuid, uuid, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_vincular_extrato_lancamento(uuid, uuid, numeric, boolean) TO authenticated, service_role;

-- ═══ 1. a transferencia ja lancada compativel com um par ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._fn_transferencia_existente(
  p_cliente uuid, p_conta_saida uuid, p_conta_entrada uuid, p_valor numeric, p_dia_saida date, p_dia_entrada date)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- O plural so': e' o tipo que o vincular reconhece como transferencia ao casar a ponta de ENTRADA.
  -- Mais de uma compativel: a de data mais perto da saida, depois a mais antiga.
  SELECT l.id
    FROM financeiro_lancamentos_v2 l
   WHERE l.cliente_id = p_cliente
     AND l.tipo_operacao = '3-Transferências'
     AND l.cancelado IS NOT TRUE
     AND COALESCE(l.cenario, 'realizado') <> 'meta'
     AND l.sem_movimentacao_caixa IS NOT TRUE
     AND round(l.valor, 2) = round(p_valor, 2)
     AND l.conta_bancaria_id = p_conta_saida
     AND l.conta_destino_id = p_conta_entrada
     AND (abs(COALESCE(l.data_pagamento, l.data_vencimento) - p_dia_saida) <= 1
       OR abs(COALESCE(l.data_pagamento, l.data_vencimento) - p_dia_entrada) <= 1)
     AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c
                      WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL)
   ORDER BY abs(COALESCE(l.data_pagamento, l.data_vencimento) - p_dia_saida), l.created_at, l.id
   LIMIT 1
$function$;

REVOKE ALL ON FUNCTION public._fn_transferencia_existente(uuid, uuid, uuid, numeric, date, date) FROM PUBLIC, anon, authenticated;

-- ═══ 2. a sugestao ═════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_transferencias_sugeridas(p_cliente_id uuid, p_ano_mes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
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
    -- os livres: nao ignorados e sem vinculo vivo (desfeito_em IS NULL); um dia de folga nas bordas do mes
    SELECT e.id, e.conta_bancaria_id conta, e.data_movimento d, e.valor, e.descricao, cb.nome_exibicao nome_conta
      FROM extrato_bancario_v2 e
      JOIN financeiro_contas_bancarias cb ON cb.id = e.conta_bancaria_id
     WHERE e.cliente_id = p_cliente_id AND e.cancelado_em IS NULL AND e.status <> 'ignorado' AND e.valor <> 0
       AND e.data_movimento BETWEEN v_de - 1 AND v_ate + 1
       AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.extrato_id = e.id AND c.desfeito_em IS NULL)
  ), ed AS (
    SELECT s.id sid, e.id eid, (s.d = e.d) mesmo_dia
      FROM x s JOIN x e ON s.valor < 0 AND e.valor > 0 AND round(e.valor, 2) = round(-s.valor, 2)
                        AND e.conta <> s.conta AND abs(e.d - s.d) <= 1
     WHERE s.d BETWEEN v_de AND v_ate OR e.d BETWEEN v_de AND v_ate
  ), g AS (
    SELECT ed.sid, ed.eid, count(*) OVER (PARTITION BY ed.sid) ns, count(*) OVER (PARTITION BY ed.eid) ne FROM ed
  ), sd AS (
    SELECT ed.sid, ed.eid, count(*) OVER (PARTITION BY ed.sid) ns, count(*) OVER (PARTITION BY ed.eid) ne
      FROM ed WHERE ed.mesmo_dia
  ), sdm AS (
    SELECT sd.sid, sd.eid FROM sd WHERE sd.ns = 1 AND sd.ne = 1
  ), res AS (
    SELECT g.sid, g.eid, 'limpo'::text como FROM g WHERE g.ns = 1 AND g.ne = 1
    UNION ALL
    -- o mesmo dia so' resolve quando TODO vizinho das duas pontas tem o seu proprio par do mesmo dia
    SELECT m.sid, m.eid, 'mesmo_dia'
      FROM sdm m
     WHERE NOT EXISTS (SELECT 1 FROM g WHERE g.sid = m.sid AND g.ns = 1 AND g.ne = 1)
       AND NOT EXISTS (SELECT 1 FROM ed WHERE ed.sid = m.sid AND ed.eid NOT IN (SELECT sdm.eid FROM sdm))
       AND NOT EXISTS (SELECT 1 FROM ed WHERE ed.eid = m.eid AND ed.sid NOT IN (SELECT sdm.sid FROM sdm))
  ), linhas AS (
    SELECT s.d, s.valor, s.id,
      jsonb_build_object(
        'saida', jsonb_build_object('id', s.id, 'data', s.d, 'valor', s.valor, 'conta_id', s.conta,
                                    'conta', s.nome_conta, 'descricao', s.descricao),
        'como', COALESCE(r.como, 'ambiguo'),
        'entrada', CASE WHEN r.eid IS NOT NULL THEN
          jsonb_build_object('id', e.id, 'data', e.d, 'valor', e.valor, 'conta_id', e.conta,
                             'conta', e.nome_conta, 'descricao', e.descricao) END,
        'existente_id', CASE WHEN r.eid IS NOT NULL THEN
          public._fn_transferencia_existente(p_cliente_id, s.conta, e.conta, e.valor, s.d, e.d) END,
        'candidatas', CASE WHEN r.eid IS NOT NULL THEN '[]'::jsonb ELSE COALESCE((
          SELECT jsonb_agg(jsonb_build_object('id', c.id, 'data', c.d, 'valor', c.valor, 'conta_id', c.conta,
                                              'conta', c.nome_conta, 'descricao', c.descricao,
                                              'existente_id', public._fn_transferencia_existente(
                                                p_cliente_id, s.conta, c.conta, c.valor, s.d, c.d))
                           ORDER BY abs(c.d - s.d), c.d, c.id)
            FROM ed JOIN x c ON c.id = ed.eid
           WHERE ed.sid = s.id AND ed.eid NOT IN (SELECT res.eid FROM res)), '[]'::jsonb) END
      ) linha
      FROM (SELECT DISTINCT g.sid FROM g) ss
      JOIN x s ON s.id = ss.sid
      LEFT JOIN res r ON r.sid = ss.sid
      LEFT JOIN x e ON e.id = r.eid
  )
  SELECT COALESCE(jsonb_agg(l.linha ORDER BY l.d, l.valor, l.id), '[]'::jsonb)
    INTO v_linhas
    FROM linhas l
   WHERE l.linha->>'como' <> 'ambiguo' OR jsonb_array_length(l.linha->'candidatas') > 0;

  RETURN jsonb_build_object(
    'ok', true, 'ano_mes', p_ano_mes, 'linhas', v_linhas,
    'total', jsonb_array_length(v_linhas),
    'resolvidas', (SELECT count(*) FROM jsonb_array_elements(v_linhas) z WHERE z->>'como' <> 'ambiguo'),
    'ambiguas', (SELECT count(*) FROM jsonb_array_elements(v_linhas) z WHERE z->>'como' = 'ambiguo'));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_transferencias_sugeridas(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_transferencias_sugeridas(uuid, text) TO authenticated, service_role;

-- ═══ 3. a confirmacao ══════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_transferencia_de_extratos(p_saida uuid, p_entrada uuid, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid; s extrato_bancario_v2%ROWTYPE; e extrato_bancario_v2%ROWTYPE;
  v_valor numeric; v_exist uuid; v_lanc uuid; v_faz uuid; v_meses text[]; v_fazendas uuid[]; pc record;
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  -- FOR UPDATE: duas confirmacoes do mesmo par ao mesmo tempo — a segunda espera e encontra o par ja' conciliado
  SELECT * INTO s FROM extrato_bancario_v2 WHERE id = p_saida AND cancelado_em IS NULL FOR UPDATE;
  SELECT * INTO e FROM extrato_bancario_v2 WHERE id = p_entrada AND cancelado_em IS NULL FOR UPDATE;
  IF s.id IS NULL OR e.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'extrato_nao_encontrado'); END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR s.cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem permissao para este cliente';
  END IF;
  IF s.cliente_id <> e.cliente_id THEN RETURN jsonb_build_object('ok', false, 'motivo', 'clientes_diferentes'); END IF;
  IF s.conta_bancaria_id = e.conta_bancaria_id THEN RETURN jsonb_build_object('ok', false, 'motivo', 'mesma_conta'); END IF;
  IF NOT (s.valor < 0 AND e.valor > 0) THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sinais_nao_opostos'); END IF;
  IF round(-s.valor, 2) <> round(e.valor, 2) THEN RETURN jsonb_build_object('ok', false, 'motivo', 'valores_diferentes'); END IF;
  IF s.status = 'ignorado' OR e.status = 'ignorado' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'extrato_ignorado'); END IF;
  IF EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c
              WHERE c.extrato_id IN (s.id, e.id) AND c.desfeito_em IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'extrato_ja_conciliado');
  END IF;

  v_valor := round(e.valor, 2);
  v_exist := public._fn_transferencia_existente(s.cliente_id, s.conta_bancaria_id, e.conta_bancaria_id, v_valor,
                                                s.data_movimento, e.data_movimento);
  v_meses := ARRAY[to_char(s.data_movimento, 'YYYY-MM'), to_char(e.data_movimento, 'YYYY-MM')];
  IF v_exist IS NOT NULL THEN
    SELECT l.fazenda_id, v_meses || l.ano_mes INTO v_faz, v_meses FROM financeiro_lancamentos_v2 l WHERE l.id = v_exist;
  ELSE
    -- transferencia e' administrativa: a fazenda "Administrativo" do cliente (a regra de escopoDoSubcentro.ts);
    -- sem ela, a da conta de origem, depois a de destino
    SELECT f.id INTO v_faz FROM fazendas f
     WHERE f.cliente_id = s.cliente_id AND f.nome ILIKE '%administrat%' ORDER BY f.created_at, f.id LIMIT 1;
    IF v_faz IS NULL THEN
      SELECT COALESCE(co.fazenda_id, cd.fazenda_id) INTO v_faz
        FROM financeiro_contas_bancarias co, financeiro_contas_bancarias cd
       WHERE co.id = s.conta_bancaria_id AND cd.id = e.conta_bancaria_id;
    END IF;
  END IF;
  IF v_faz IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sem_fazenda'); END IF;

  SELECT array_agg(DISTINCT z) INTO v_fazendas
    FROM unnest(ARRAY[v_faz,
                      (SELECT fazenda_id FROM financeiro_contas_bancarias WHERE id = s.conta_bancaria_id),
                      (SELECT fazenda_id FROM financeiro_contas_bancarias WHERE id = e.conta_bancaria_id)]) z
   WHERE z IS NOT NULL;
  IF EXISTS (SELECT 1 FROM financeiro_fechamentos f
              WHERE f.cliente_id = s.cliente_id AND f.status_fechamento = 'fechado'
                AND f.ano_mes = ANY(v_meses) AND f.fazenda_id = ANY(v_fazendas)) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'mes_fechado');
  END IF;

  SELECT p.id, p.subcentro, p.macro_custo, p.grupo_custo, p.centro_custo INTO pc
    FROM financeiro_plano_contas p
   WHERE p.cliente_id IS NULL AND p.ordem_exibicao = 18010 AND p.subcentro = 'Transferência entre Contas Bancárias'
     AND p.ativo IS NOT FALSE
   ORDER BY p.id LIMIT 1;
  IF pc.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'plano 18010 nao encontrado'; END IF;

  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true,
      'acao', CASE WHEN v_exist IS NOT NULL THEN 'casar_existente' ELSE 'criar' END,
      'lancamento_id', v_exist, 'valor', v_valor, 'data', s.data_movimento,
      'conta_origem_id', s.conta_bancaria_id, 'conta_destino_id', e.conta_bancaria_id, 'fazenda_id', v_faz);
  END IF;

  IF v_exist IS NULL THEN
    INSERT INTO financeiro_lancamentos_v2 (
      id, cliente_id, fazenda_id, conta_bancaria_id, conta_destino_id,
      ano_mes, data_pagamento, data_competencia, data_vencimento,
      valor, sinal, tipo_operacao,
      plano_conta_id, subcentro, macro_custo, grupo_custo, centro_custo, descricao,
      cenario, status_transacao, sem_movimentacao_caixa, origem_lancamento,
      cancelado, created_by, updated_by
    ) VALUES (
      gen_random_uuid(), s.cliente_id, v_faz, s.conta_bancaria_id, e.conta_bancaria_id,
      to_char(s.data_movimento, 'YYYY-MM'), s.data_movimento, s.data_movimento, s.data_movimento,
      v_valor, '-1', '3-Transferências',
      pc.id, pc.subcentro, pc.macro_custo, pc.grupo_custo, pc.centro_custo,
      COALESCE(NULLIF(btrim(s.descricao), ''), 'Transferência entre contas'),
      'realizado', 'realizado', false, 'extrato',
      false, v_uid, v_uid
    ) RETURNING id INTO v_lanc;
  ELSE
    v_lanc := v_exist;
    -- o banco e' a verdade do pagamento, como no casar (fn_espelho_casar)
    UPDATE financeiro_lancamentos_v2
       SET status_transacao = 'realizado', data_pagamento = s.data_movimento, updated_by = v_uid, updated_at = now()
     WHERE id = v_lanc
       AND (status_transacao IS DISTINCT FROM 'realizado' OR data_pagamento IS DISTINCT FROM s.data_movimento);
  END IF;

  -- os dois vinculos pela MESMA rotina do vincular: a saida como sempre, a entrada como segunda ponta
  PERFORM public.fn_vincular_extrato_lancamento(s.id, v_lanc, v_valor, false);
  PERFORM public.fn_vincular_extrato_lancamento(e.id, v_lanc, v_valor, true);

  RETURN jsonb_build_object('ok', true, 'simulado', false,
    'acao', CASE WHEN v_exist IS NOT NULL THEN 'casar_existente' ELSE 'criar' END,
    'lancamento_id', v_lanc, 'valor', v_valor, 'vinculos', 2);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_transferencia_de_extratos(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_transferencia_de_extratos(uuid, uuid, boolean) TO authenticated, service_role;

-- ═══ 5. a trava de conta destino ve o plural ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.guard_transferencia_conta_destino()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- For transfers, conta_destino_id is required
  -- PR-CONC-TRANSFERENCIAS-01: a trava so' via o singular '3-Transferência'; o plural '3-Transferências', que e' o que
  -- todo escritor grava hoje, passava sem ela.
  IF NEW.tipo_operacao IN ('3-Transferência', '3-Transferências') AND NEW.conta_destino_id IS NULL THEN
    -- On INSERT: always block
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Transferência deve ter conta de destino obrigatoriamente.';
    END IF;
    -- On UPDATE: block only if OLD had a value (prevent removing existing destination)
    -- Allow updates to other fields on legacy records that already had NULL
    IF TG_OP = 'UPDATE' AND OLD.conta_destino_id IS NOT NULL THEN
      RAISE EXCEPTION 'Não é permitido remover a conta de destino de uma transferência.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ═══ 6. aposenta a marcacao de UMA ponta ═══════════════════════════════════════════════════════════════════════════
DROP FUNCTION public.fn_marcar_extrato_transferencia(uuid, uuid, text);

-- ═══ conferencia da ACL ════════════════════════════════════════════════════════════════════════════════════════════
DO $acl$
BEGIN
  IF has_function_privilege('anon', 'public.fn_transferencias_sugeridas(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_transferencia_de_extratos(uuid,uuid,boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_vincular_extrato_lancamento(uuid,uuid,numeric,boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public._fn_transferencia_existente(uuid,uuid,uuid,numeric,date,date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_transferencia_existente(uuid,uuid,uuid,numeric,date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL aberta numa funcao de PR-CONC-TRANSFERENCIAS-01';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_transferencias_sugeridas(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_transferencia_de_extratos(uuid,uuid,boolean)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_vincular_extrato_lancamento(uuid,uuid,numeric,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL fechada demais: authenticated sem EXECUTE';
  END IF;
END
$acl$;
