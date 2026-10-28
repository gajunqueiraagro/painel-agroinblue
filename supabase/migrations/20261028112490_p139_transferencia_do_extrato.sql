-- P139 (Gabriel, pedido desde 30/09; ENCAIXE aprovado 27/10 15:5x) — CRIAR TRANSFERENCIA PELA LINHA DO EXTRATO, num gesto, com espelho,
-- lote, aviso de gemea e sugestao. Gabarito: Financas ADR-0055 (copiado do AGRO e melhorado); aqui a REGRA volta com as tabelas e nomes
-- do AGRO, e a transferencia continua UMA linha com conta de destino.
--
-- (1) NUCLEO DE CRIACAO EXTRAIDO SEM MUDANCA: `_fn_lancamento_de_extrato_criar` recebe os MESMOS parametros da
--     `fn_criar_lancamento_de_extrato` e roda o MESMO bloco (do `v_valor := abs(v_ext.valor)` ate' o INSERT do lancamento), que e'
--     RECORTADO do corpo vivo por esta migration (guardado pelo md5 do bloco, 5f81bee2…) — verbatim por construcao, nada redigitado.
--     A `fn_criar_lancamento_de_extrato` passa a chamar o nucleo e rele^ `v_valor`/`v_tipo` do lancamento criado; o resto dela (o
--     vinculo direto, o status do extrato, o retorno) fica como estava.
-- (2) `_fn_espelhos_transferencia(extrato, outra_conta, excluir)`: o movimento de OUTRA conta do cliente com valor OPOSTO, ate' 3 dias,
--     livre (sem vinculo vivo, nao ignorado, nao cancelado, nao meia ponta), na conta pedida (nula = qualquer). Ordem: distancia, data, id.
--     E' a UNICA regra de espelho: a porta nova e o "Transferencias entre contas" (`fn_transferencias_sugeridas`, que era ±1) usam ela.
-- (3) `fn_transferencia_do_extrato(...)` (porta; `p_simular` padrao TRUE): valor, data e a conta vem do movimento; origem/destino pelo
--     SINAL; a outra conta e' do operador. A simulacao devolve o que a tela mostra (espelhos, o escolhido, gemea, transferencia existente).
--     · TRANSFERENCIA JA' LANCADA ou MEIA PONTA (`_fn_transferencia_existente`/`_fn_meia_ponta_compativel`): acao `casar_existente` — liga
--       o movimento a ela (como o casar_existente da `fn_transferencia_de_extratos`), nunca cria outra.
--     · ESPELHO: o escolhido (tem de estar na lista), ou "sem espelho", ou o mais proximo se for UNICO; empate nao se adivinha (fica sem).
--     · GEMEA (mesma conta, dia e valor, de OUTRA importacao, ja' conciliada): AVISO com confirmacao (`p_confirmar_gemea`), nunca recusa
--       muda: sem confirmar, a gravacao diz por que e nao grava.
--     · Grava: o nucleo (1) cria a transferencia; o vinculo do movimento e o do espelho passam pelo gravador unico
--       `fn_vincular_extrato_lancamento` (o espelho como segunda ponta).
-- (4) `fn_transferencias_do_extrato_lote(p_itens, p_simular)`: o mesmo, linha a linha, TUDO OU NADA (uma transacao); cada espelho serve
--     a uma linha so', e nenhuma linha do lote e' espelho de outra.
-- (5) `fn_extrato_transferencias_provaveis(conta, de, ate)`: a sugestao por linha livre — titular de OUTRA conta ativa no historico
--     (documento com 11+ digitos; nome inteiro; nome cortado: 3+ palavras seguidas, 10+ letras, comeco do nome) ou "aplicacao/resgate
--     AUTOMATICO" -> a UNICA conta de investimento ativa do MESMO banco. So' sugere quando ha' UMA candidata; nunca grava.
-- Funcoes publicas nascem fechadas: REVOKE de PUBLIC/anon, GRANT a authenticated, tenant_ok (42501). As internas: so' o dono.

-- ── (1) o nucleo, recortado do corpo vivo ───────────────────────────────────────────────────────────────────────────────────────────
DO $nucleo$
DECLARE
  d text := pg_get_functiondef('public.fn_criar_lancamento_de_extrato(uuid,uuid,text,text,text,uuid,text,date,uuid,text,text,jsonb,date,text,uuid)'::regprocedure);
  c_ini constant text := '  v_valor   := abs(v_ext.valor);';
  c_fim constant text := ') RETURNING id INTO v_lanc_id;';
  i int; j int; bloco text; novo text;
BEGIN
  IF md5(d) <> 'a80253d46ae1aa210f1076c60df9132c' THEN RAISE EXCEPTION 'fn_criar_lancamento_de_extrato mudou (md5 %)', md5(d); END IF;
  i := strpos(d, c_ini); j := strpos(d, c_fim);
  IF i = 0 OR j = 0 OR (length(d) - length(replace(d, c_ini, ''))) / length(c_ini) <> 1
     OR (length(d) - length(replace(d, c_fim, ''))) / length(c_fim) <> 1 THEN RAISE EXCEPTION 'marcas do nucleo nao casam 1x'; END IF;
  bloco := substr(d, i, j - i + length(c_fim));
  IF md5(bloco) <> '5f81bee27d527323b7feb1874df8ba0a' OR length(bloco) <> 5302 THEN RAISE EXCEPTION 'bloco do nucleo mudou (md5 %)', md5(bloco); END IF;

  EXECUTE $cab$CREATE OR REPLACE FUNCTION public._fn_lancamento_de_extrato_criar(p_extrato_id uuid, p_fazenda_id uuid, p_subcentro text DEFAULT NULL::text, p_descricao text DEFAULT NULL::text, p_observacao text DEFAULT NULL::text, p_favorecido_id uuid DEFAULT NULL::uuid, p_numero_documento text DEFAULT NULL::text, p_data_competencia date DEFAULT NULL::date, p_safra_id uuid DEFAULT NULL::uuid, p_tipo_documento text DEFAULT NULL::text, p_forma_pagamento text DEFAULT NULL::text, p_dados_pagamento jsonb DEFAULT NULL::jsonb, p_data_vencimento date DEFAULT NULL::date, p_tipo_operacao text DEFAULT NULL::text, p_outra_conta uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
-- P139: o NUCLEO de criacao da fn_criar_lancamento_de_extrato, recortado verbatim do corpo dela (md5 do bloco 5f81bee2…).
-- Interna: quem chama ja' conferiu o tenant, o extrato livre e a fazenda. Devolve o id do lancamento criado.
DECLARE
  v_uid      uuid := auth.uid();
  v_ext      extrato_bancario_v2%ROWTYPE;
  v_sinal    text;
  v_tipo     text;
  v_valor    numeric;
  v_ano_mes  text;
  v_lanc_id  uuid;
  v_faz      uuid;
  v_origem   uuid;
  v_destino  uuid;
  v_pc_id    uuid;
  v_pc_sub   text;
  v_transf   boolean := false;
BEGIN
  SELECT * INTO v_ext FROM extrato_bancario_v2 WHERE id = p_extrato_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'extrato nao encontrado: %', p_extrato_id; END IF;
$cab$ || bloco || $rod$

  RETURN v_lanc_id;
END;
$function$$rod$;

  -- a fn_criar passa a chamar o nucleo (e rele^ o valor e o tipo do que ele criou, que o resto dela usa)
  novo := replace(d, bloco,
    '  v_lanc_id := public._fn_lancamento_de_extrato_criar(p_extrato_id, p_fazenda_id, p_subcentro, p_descricao, p_observacao,'
    || E'\n    p_favorecido_id, p_numero_documento, p_data_competencia, p_safra_id, p_tipo_documento, p_forma_pagamento, p_dados_pagamento,'
    || E'\n    p_data_vencimento, p_tipo_operacao, p_outra_conta);'
    || E'\n  -- P139: o nucleo (o bloco que ficava aqui) mora em _fn_lancamento_de_extrato_criar; o resto usa o valor e o tipo do criado'
    || E'\n  SELECT l.valor, l.tipo_operacao INTO v_valor, v_tipo FROM financeiro_lancamentos_v2 l WHERE l.id = v_lanc_id;');
  EXECUTE novo;

  -- conferencia: o nucleo contem o bloco inteiro, e a fn_criar nao o contem mais
  IF strpos(pg_get_functiondef('public._fn_lancamento_de_extrato_criar(uuid,uuid,text,text,text,uuid,text,date,uuid,text,text,jsonb,date,text,uuid)'::regprocedure), bloco) = 0
     OR strpos(pg_get_functiondef('public.fn_criar_lancamento_de_extrato(uuid,uuid,text,text,text,uuid,text,date,uuid,text,text,jsonb,date,text,uuid)'::regprocedure), bloco) > 0 THEN
    RAISE EXCEPTION 'o recorte do nucleo nao conferiu';
  END IF;
END $nucleo$;
REVOKE ALL ON FUNCTION public._fn_lancamento_de_extrato_criar(uuid,uuid,text,text,text,uuid,text,date,uuid,text,text,jsonb,date,text,uuid) FROM PUBLIC, anon, authenticated;

-- ── (2) o espelho (a regra unica, ±3 dias) ──────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._fn_espelhos_transferencia(p_extrato uuid, p_outra_conta uuid DEFAULT NULL, p_excluir uuid[] DEFAULT '{}')
 RETURNS TABLE(id uuid, conta_id uuid, data date, descricao text, valor numeric, distancia integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT o.id, o.conta_bancaria_id, o.data_movimento, o.descricao, o.valor, abs(o.data_movimento - e.data_movimento)
    FROM extrato_bancario_v2 e
    JOIN extrato_bancario_v2 o
      ON o.cliente_id = e.cliente_id
     AND o.conta_bancaria_id <> e.conta_bancaria_id
     AND (p_outra_conta IS NULL OR o.conta_bancaria_id = p_outra_conta)
     AND round(o.valor, 2) = round(-e.valor, 2)
     AND abs(o.data_movimento - e.data_movimento) <= 3
   WHERE e.id = p_extrato
     AND o.cancelado_em IS NULL AND o.status <> 'ignorado' AND o.valor <> 0
     AND NOT (o.id = ANY (coalesce(p_excluir, '{}')))
     AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.extrato_id = o.id AND c.desfeito_em IS NULL)
     AND public._fn_meia_ponta_compativel(o.id) IS NULL
   ORDER BY abs(o.data_movimento - e.data_movimento), o.data_movimento, o.id
$function$;
REVOKE ALL ON FUNCTION public._fn_espelhos_transferencia(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;

-- ── (3) a porta: nucleo interno (com a lista de excluidos do lote) + a publica ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._fn_transferencia_do_extrato(p_extrato uuid, p_outra_conta uuid, p_espelho uuid, p_sem_espelho boolean,
  p_confirmar_gemea boolean, p_descricao text, p_simular boolean, p_excluir uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  e extrato_bancario_v2%ROWTYPE; oc financeiro_contas_bancarias%ROWTYPE;
  v_valor numeric; v_origem uuid; v_destino uuid; v_exist uuid; v_meia boolean := false;
  v_espelhos jsonb; v_esp uuid; v_n_min int; v_gemeas jsonb; v_lanc uuid; v_acao text; v_ex financeiro_lancamentos_v2%ROWTYPE;
BEGIN
  SELECT * INTO e FROM extrato_bancario_v2 WHERE id = p_extrato FOR UPDATE;
  IF NOT FOUND OR e.cancelado_em IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'O movimento do banco não existe mais (foi excluído ou reimportado). Atualize a tela.';
  END IF;
  IF e.status = 'ignorado' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('O movimento de %s (%s) está ignorado: volte-o antes de criar a transferência.',
      to_char(e.data_movimento, 'DD/MM/YYYY'), public._fn_oc_brl(e.valor));
  END IF;
  IF e.valor = 0 THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Movimento de valor zero não vira transferência.'; END IF;
  IF EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.extrato_id = e.id AND c.desfeito_em IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('O movimento de %s (%s) já tem par: desconcilie antes de transformá-lo em transferência.',
      to_char(e.data_movimento, 'DD/MM/YYYY'), public._fn_oc_brl(e.valor));
  END IF;
  v_valor := round(abs(e.valor), 2);

  -- a gemea: mesma conta, dia e valor, de OUTRA importacao, ja' conciliada (o caso Santa Rita 10/09: o banco mudou o historico)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'descricao', o.descricao, 'data', o.data_movimento, 'valor', o.valor::text)
                            ORDER BY o.id), '[]'::jsonb)
    INTO v_gemeas
    FROM extrato_bancario_v2 o
   WHERE o.cliente_id = e.cliente_id AND o.conta_bancaria_id = e.conta_bancaria_id AND o.id <> e.id
     AND o.data_movimento = e.data_movimento AND o.valor = e.valor AND o.cancelado_em IS NULL
     AND coalesce(o.importacao_id::text, '') <> coalesce(e.importacao_id::text, '')
     AND EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.extrato_id = o.id AND c.desfeito_em IS NULL);

  -- a transferencia que JA' existe: a meia ponta (ligada do outro lado) ou a lancada sem vinculo, nas contas pedidas
  v_exist := public._fn_meia_ponta_compativel(e.id);
  v_meia := v_exist IS NOT NULL;
  IF p_outra_conta IS NOT NULL THEN
    SELECT * INTO oc FROM financeiro_contas_bancarias WHERE id = p_outra_conta;
    IF NOT FOUND OR oc.cliente_id IS DISTINCT FROM e.cliente_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A outra conta não é deste cliente.';
    END IF;
    IF oc.id = e.conta_bancaria_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A outra conta da transferência não pode ser a do próprio movimento.';
    END IF;
    IF oc.ativa IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('A conta %s está inativa.', coalesce(oc.nome_exibicao, oc.nome_conta));
    END IF;
    v_origem  := CASE WHEN e.valor < 0 THEN e.conta_bancaria_id ELSE oc.id END;
    v_destino := CASE WHEN e.valor < 0 THEN oc.id ELSE e.conta_bancaria_id END;
    IF v_exist IS NULL THEN
      v_exist := public._fn_transferencia_existente(e.cliente_id, v_origem, v_destino, v_valor, e.data_movimento, e.data_movimento);
    END IF;
  END IF;

  IF v_exist IS NOT NULL THEN
    v_acao := 'casar_existente';
    SELECT * INTO v_ex FROM financeiro_lancamentos_v2 WHERE id = v_exist;
    v_espelhos := '[]'::jsonb;
  ELSE
    IF p_outra_conta IS NULL THEN
      IF p_simular THEN
        RETURN jsonb_build_object('ok', true, 'simulado', true, 'acao', 'escolher_conta', 'extrato_id', e.id, 'valor', v_valor::text,
          'data', e.data_movimento, 'gemeas', v_gemeas, 'espelhos', '[]'::jsonb);
      END IF;
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('Escolha a conta %s da transferência.',
        CASE WHEN e.valor < 0 THEN 'de destino' ELSE 'de origem' END);
    END IF;
    v_acao := 'criar';
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'data', s.data, 'descricao', s.descricao, 'valor', s.valor::text,
                                                 'distancia', s.distancia) ORDER BY s.distancia, s.data, s.id), '[]'::jsonb)
      INTO v_espelhos FROM public._fn_espelhos_transferencia(e.id, p_outra_conta, p_excluir) s;
    IF coalesce(p_sem_espelho, false) THEN
      v_esp := NULL;
    ELSIF p_espelho IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_espelhos) x WHERE (x->>'id')::uuid = p_espelho) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('O espelho escolhido não serve: precisa ser da conta %s, valor %s, até 3 dias, sem par.',
          coalesce(oc.nome_exibicao, oc.nome_conta), public._fn_oc_brl(-e.valor));
      END IF;
      v_esp := p_espelho;
    ELSE
      -- o mais proximo, se for UNICO na menor distancia; empate nao se adivinha
      SELECT min((x->>'distancia')::int) INTO v_n_min FROM jsonb_array_elements(v_espelhos) x;
      IF (SELECT count(*) FROM jsonb_array_elements(v_espelhos) x WHERE (x->>'distancia')::int = v_n_min) = 1 THEN
        SELECT (x->>'id')::uuid INTO v_esp FROM jsonb_array_elements(v_espelhos) x WHERE (x->>'distancia')::int = v_n_min;
      END IF;
    END IF;
  END IF;

  IF p_simular THEN
    RETURN jsonb_build_object('ok', true, 'simulado', true, 'acao', v_acao, 'extrato_id', e.id, 'valor', v_valor::text,
      'data', e.data_movimento, 'origem', v_origem, 'destino', v_destino, 'espelhos', v_espelhos, 'espelho_id', v_esp,
      'gemeas', v_gemeas,
      'existente', CASE WHEN v_exist IS NULL THEN NULL ELSE jsonb_build_object('id', v_ex.id, 'descricao', v_ex.descricao,
        'data', coalesce(v_ex.data_pagamento, v_ex.data_vencimento), 'origem', v_ex.conta_bancaria_id, 'destino', v_ex.conta_destino_id,
        'meia_ponta', v_meia) END);
  END IF;

  IF jsonb_array_length(v_gemeas) > 0 AND NOT coalesce(p_confirmar_gemea, false) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = format('Já existe um movimento igual (%s, %s) de outra importação, conciliado: pode ser duplicado. Confirme para criar mesmo assim, ou ignore este como duplicado. Nada foi gravado.',
      to_char(e.data_movimento, 'DD/MM/YYYY'), public._fn_oc_brl(e.valor));
  END IF;

  IF v_acao = 'casar_existente' THEN
    PERFORM public.fn_vincular_extrato_lancamento(e.id, v_exist, v_valor, v_meia);
    v_lanc := v_exist;
  ELSE
    v_lanc := public._fn_lancamento_de_extrato_criar(e.id, NULL, NULL, p_descricao, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
                                                      '3-Transferências', p_outra_conta);
    PERFORM public.fn_vincular_extrato_lancamento(e.id, v_lanc, v_valor, false);
    IF v_esp IS NOT NULL THEN
      PERFORM public.fn_vincular_extrato_lancamento(v_esp, v_lanc, v_valor, true);
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'simulado', false, 'acao', v_acao, 'extrato_id', e.id, 'lancamento_id', v_lanc,
    'espelho_id', CASE WHEN v_acao = 'criar' THEN v_esp END, 'valor', v_valor::text);
END
$function$;
REVOKE ALL ON FUNCTION public._fn_transferencia_do_extrato(uuid, uuid, uuid, boolean, boolean, text, boolean, uuid[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_transferencia_do_extrato(p_extrato uuid, p_outra_conta uuid DEFAULT NULL, p_espelho uuid DEFAULT NULL,
  p_sem_espelho boolean DEFAULT false, p_confirmar_gemea boolean DEFAULT false, p_descricao text DEFAULT NULL, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_cli uuid := (SELECT x.cliente_id FROM public.extrato_bancario_v2 x WHERE x.id = p_extrato);
BEGIN
  IF v_cli IS NULL OR NOT coalesce(public.tenant_ok(v_cli), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem acesso a este registro';
  END IF;
  RETURN public._fn_transferencia_do_extrato(p_extrato, p_outra_conta, p_espelho, p_sem_espelho, p_confirmar_gemea, p_descricao,
                                             coalesce(p_simular, true), '{}');
END
$function$;
REVOKE ALL ON FUNCTION public.fn_transferencia_do_extrato(uuid, uuid, uuid, boolean, boolean, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_transferencia_do_extrato(uuid, uuid, uuid, boolean, boolean, text, boolean) TO authenticated;

-- ── (4) o lote: tudo ou nada ──────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_transferencias_do_extrato_lote(p_itens jsonb, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  it jsonb; v_ext uuid; v_cli uuid; v_clis uuid[]; v_excl uuid[]; r jsonb; v_res jsonb := '[]'::jsonb; v_criadas int := 0; v_esp int := 0;
BEGIN
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'O lote veio vazio.';
  END IF;
  SELECT array_agg((x->>'extrato_id')::uuid) INTO v_excl FROM jsonb_array_elements(p_itens) x;
  IF (SELECT count(DISTINCT z) FROM unnest(v_excl) z) <> array_length(v_excl, 1) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'O mesmo movimento veio duas vezes no lote.';
  END IF;
  SELECT array_agg(DISTINCT x.cliente_id) INTO v_clis FROM public.extrato_bancario_v2 x WHERE x.id = ANY (v_excl);
  IF v_clis IS NULL OR array_length(v_clis, 1) <> 1 OR (SELECT count(*) FROM public.extrato_bancario_v2 x WHERE x.id = ANY (v_excl)) <> array_length(v_excl, 1)
     OR NOT coalesce(public.tenant_ok(v_clis[1]), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem acesso a este registro';
  END IF;
  FOR it IN SELECT x FROM jsonb_array_elements(p_itens) x LOOP
    v_ext := (it->>'extrato_id')::uuid;
    r := public._fn_transferencia_do_extrato(v_ext, nullif(it->>'outra_conta', '')::uuid, nullif(it->>'espelho_id', '')::uuid,
           coalesce((it->>'sem_espelho')::boolean, false), coalesce((it->>'confirmar_gemea')::boolean, false), NULL,
           coalesce(p_simular, true), array_remove(v_excl, v_ext));
    IF nullif(r->>'espelho_id', '') IS NOT NULL THEN
      v_excl := v_excl || (r->>'espelho_id')::uuid; v_esp := v_esp + 1;
    END IF;
    IF r->>'acao' IN ('criar', 'casar_existente') THEN v_criadas := v_criadas + 1; END IF;
    v_res := v_res || jsonb_build_array(r);
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'simulado', coalesce(p_simular, true), 'itens', v_res, 'transferencias', v_criadas, 'espelhos', v_esp);
END
$function$;
REVOKE ALL ON FUNCTION public.fn_transferencias_do_extrato_lote(jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_transferencias_do_extrato_lote(jsonb, boolean) TO authenticated;

-- ── (5) a sugestao ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_extrato_transferencias_provaveis(p_conta uuid, p_de date, p_ate date)
 RETURNS TABLE(extrato_id uuid, conta_sugerida uuid, conta_nome text, motivo text, candidatas integer)
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  WITH c AS (
    SELECT cb.* FROM financeiro_contas_bancarias cb WHERE cb.id = p_conta AND public.tenant_ok(cb.cliente_id)
  ), l AS (
    SELECT e.id, e.descricao,
           coalesce(public._fn_normalizar_texto(e.descricao), '') AS txt,
           regexp_replace(coalesce(e.descricao, ''), '[.\-/[:space:]]', '', 'g') AS dig
      FROM extrato_bancario_v2 e, c
     WHERE e.conta_bancaria_id = c.id AND e.data_movimento BETWEEN p_de AND p_ate
       AND e.cancelado_em IS NULL AND e.status <> 'ignorado' AND e.valor <> 0
       AND NOT EXISTS (SELECT 1 FROM conciliacao_bancaria_itens v WHERE v.extrato_id = e.id AND v.desfeito_em IS NULL)
  ), outras AS (
    SELECT o.id, coalesce(o.nome_exibicao, o.nome_conta) AS nome, o.tipo_conta, o.banco,
           coalesce(public._fn_normalizar_texto(o.titular_nome), '') AS tit,
           regexp_replace(coalesce(o.titular_documento, ''), '\D', '', 'g') AS doc
      FROM financeiro_contas_bancarias o, c
     WHERE o.cliente_id = c.cliente_id AND o.id <> c.id AND o.ativa IS TRUE AND coalesce(o.tipo_conta, '') <> 'cartao'
  ), titular AS (
    -- documento (11+ digitos) no historico; ou o COMECO do nome do titular (o nome inteiro, ou as 3+ primeiras palavras com 10+
    -- letras — o banco corta o nome) aparece como palavras inteiras no historico
    SELECT l.id AS extrato_id, o.id AS conta, o.nome,
           CASE WHEN length(o.doc) >= 11 AND strpos(l.dig, o.doc) > 0 THEN 'titular_documento' ELSE 'titular_nome' END AS motivo
      FROM l JOIN outras o ON (
            (length(o.doc) >= 11 AND strpos(l.dig, o.doc) > 0)
         OR (o.tit <> '' AND EXISTS (
              SELECT 1
                FROM (SELECT string_to_array(btrim(regexp_replace(o.tit, '[^a-z0-9]+', ' ', 'g')), ' ') AS w) n,
                     generate_series(least(3, cardinality(n.w)), cardinality(n.w)) k
               WHERE length(array_to_string(n.w[1:k], ' ')) >= 10
                 AND (' ' || btrim(regexp_replace(l.txt, '[^a-z0-9]+', ' ', 'g')) || ' ') LIKE ('% ' || array_to_string(n.w[1:k], ' ') || ' %'))))
  ), palavra AS (
    -- "aplicacao/resgate AUTOMATICO" -> a UNICA conta de investimento ativa do MESMO banco
    SELECT l.id AS extrato_id, o.id AS conta, o.nome, 'aplicacao_automatica'::text AS motivo
      FROM l, c JOIN outras o ON o.tipo_conta = 'inv' AND coalesce(o.banco, '') <> '' AND o.banco = c.banco
     WHERE l.txt ~ '\m(aplic|resg)[a-z]*\.?\s+automat'
  ), cand AS (
    SELECT t.*, 1 AS prioridade FROM titular t
    UNION ALL
    SELECT p.*, 2 FROM palavra p WHERE NOT EXISTS (SELECT 1 FROM titular t WHERE t.extrato_id = p.extrato_id)
  ), n AS (
    SELECT cand.extrato_id, count(DISTINCT cand.conta)::int AS candidatas FROM cand GROUP BY cand.extrato_id
  )
  SELECT DISTINCT ON (n.extrato_id) n.extrato_id,
         CASE WHEN n.candidatas = 1 THEN cand.conta END,
         CASE WHEN n.candidatas = 1 THEN cand.nome END,
         CASE WHEN n.candidatas = 1 THEN cand.motivo ELSE 'varias' END,
         n.candidatas
    FROM n JOIN cand ON cand.extrato_id = n.extrato_id
   ORDER BY n.extrato_id, cand.prioridade, cand.conta
$function$;
REVOKE ALL ON FUNCTION public.fn_extrato_transferencias_provaveis(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_extrato_transferencias_provaveis(uuid, date, date) TO authenticated;

-- ── (2b) "Transferencias entre contas" usa o MESMO espelho (era ±1 escrito na linha) ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp._troca_texto(p_fn regprocedure, p_md5 text, p_pares text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE d text := pg_get_functiondef(p_fn); i int; n int;
BEGIN
  IF md5(d) <> p_md5 THEN RAISE EXCEPTION '% mudou (md5 %, esperado %)', p_fn, md5(d), p_md5; END IF;
  FOR i IN 1..array_length(p_pares, 1) / 3 LOOP
    n := (length(d) - length(replace(d, p_pares[3*i-2], ''))) / length(p_pares[3*i-2]);
    IF n <> p_pares[3*i]::int THEN RAISE EXCEPTION '% trecho %: % ocorrencias, esperado %', p_fn, i, n, p_pares[3*i]; END IF;
    d := replace(d, p_pares[3*i-2], p_pares[3*i-1]);
  END LOOP;
  EXECUTE d;
END $$;
SELECT pg_temp._troca_texto('public.fn_transferencias_sugeridas(uuid,text)', '6aa35805ba8586eb4abc7c58ab986808', ARRAY[
  $p$AND e.data_movimento BETWEEN v_de - 1 AND v_ate + 1$p$,
  $r$AND e.data_movimento BETWEEN v_de - 3 AND v_ate + 3$r$, '1',
  $p$AND e.conta <> s.conta AND abs(e.d - s.d) <= 1$p$,
  $r$AND e.conta <> s.conta AND e.id IN (SELECT m.id FROM public._fn_espelhos_transferencia(s.id, NULL) m)  -- P139: o espelho e' UMA regra (±3)$r$, '1']);
