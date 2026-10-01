-- CONC-BLOCOS-TELA-01 — desempate do "mais antigo primeiro" da fn_conciliar_bloco (so' a ordenacao dos lancamentos).
--
-- Era: competencia -> vencimento -> id. O id e' aleatorio: na NF 9294773 (duas vendas de 24/08) a parcial caiu na 20,24 t
-- por sorte. Medido em 01/10: as duas vendas tem o MESMO created_at (lancamento e colheita nasceram na mesma transacao do
-- backfill de 16/09), hora_chegada/ticket/romaneio nulos — nenhum campo guarda a ordem da planilha. Vale para as 10 NFs do
-- backfill; so' as 3 lancadas pelo modal (9373486, 9375891, 9380244) tem created_at distintos.
-- Decisao do Gabriel (01/10): competencia -> vencimento -> created_at do lancamento -> MAIOR valor primeiro -> id.
-- Sem coluna nova. Corpo integral; prosrc md5 b0ebe73662fa77ea25c1dbf8d5cf62d4 -> 2d9d54084c7c40e0d7e2b0b473cf7a42.

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliar_bloco(uuid[], uuid[], text, boolean)'::regprocedure) <> 'b0ebe73662fa77ea25c1dbf8d5cf62d4' THEN
    RAISE EXCEPTION 'CONC-BLOCOS-TELA-01: corpo de origem de fn_conciliar_bloco divergente — abortado';
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public.fn_conciliar_bloco(p_extratos uuid[], p_lancamentos uuid[], p_regra text, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cli uuid; v_conta uuid; v_sinal_ext int; v_n_ext int; v_n_lan int;
  r record;
  -- extratos e lancamentos na ORDEM da alocacao
  e_id uuid[] := '{}'; e_data date[] := '{}'; e_valor numeric[] := '{}'; e_rest numeric[] := '{}';
  l_id uuid[] := '{}'; l_desc text[] := '{}'; l_saldo numeric[] := '{}'; l_rest numeric[] := '{}'; l_quitou date[] := '{}';
  i int := 1; j int := 1; m numeric;
  v_soma_ext numeric := 0; v_soma_lan numeric := 0;
  v_matriz jsonb := '[]'::jsonb; v_quitados jsonb := '[]'::jsonb; v_parcial jsonb := NULL; v_resumo jsonb; v_ret jsonb;
  v_bloco uuid; v_estado jsonb := '{}'::jsonb; v_soma numeric; v_status text;
  c_tol constant numeric := 0.005;
BEGIN
  IF p_regra IS NULL OR p_regra NOT IN ('exato', 'mais_antigo_primeiro') THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('regra_invalida: a regra %s nao existe (exato | mais_antigo_primeiro).', coalesce(p_regra, '-'));
  END IF;
  v_n_ext := coalesce(array_length(p_extratos, 1), 0);
  v_n_lan := coalesce(array_length(p_lancamentos, 1), 0);
  IF v_n_ext = 0 OR v_n_lan = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'bloco_vazio: o bloco precisa de pelo menos um extrato e um lancamento.';
  END IF;
  IF v_n_ext <> (SELECT count(DISTINCT x) FROM unnest(p_extratos) x) OR v_n_lan <> (SELECT count(DISTINCT x) FROM unnest(p_lancamentos) x) THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'membro_repetido: o mesmo extrato ou lancamento aparece duas vezes no bloco.';
  END IF;

  -- ── extratos, por data (desempate id)
  FOR r IN SELECT e.* FROM extrato_bancario_v2 e WHERE e.id = ANY(p_extratos) ORDER BY e.data_movimento, e.id LOOP
    IF r.cancelado_em IS NOT NULL OR r.ignorado_em IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('extrato_inativo: o extrato de %s (%s) esta cancelado ou ignorado.', to_char(r.data_movimento, 'DD/MM'), r.valor);
    END IF;
    IF v_cli IS NULL THEN v_cli := r.cliente_id; v_conta := r.conta_bancaria_id; v_sinal_ext := sign(r.valor); END IF;
    IF r.cliente_id IS DISTINCT FROM v_cli THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'cliente_divergente: os extratos do bloco sao de clientes diferentes.';
    END IF;
    IF r.conta_bancaria_id IS DISTINCT FROM v_conta THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('conta_diferente: o extrato de %s (%s) e'' de outra conta bancaria — um bloco e'' de uma conta so''.', to_char(r.data_movimento, 'DD/MM'), r.valor);
    END IF;
    IF sign(r.valor) = 0 OR sign(r.valor) <> v_sinal_ext THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'direcao_mista: o bloco mistura entradas e saidas do banco.';
    END IF;
    IF EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.extrato_id = r.id AND c.desfeito_em IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('extrato_ja_vinculado: o extrato de %s (%s) ja tem vinculo — desfaca antes.', to_char(r.data_movimento, 'DD/MM'), r.valor);
    END IF;
    e_id := e_id || r.id; e_data := e_data || r.data_movimento; e_valor := e_valor || abs(r.valor); e_rest := e_rest || abs(r.valor);
    v_soma_ext := v_soma_ext + abs(r.valor);
  END LOOP;
  IF coalesce(array_length(e_id, 1), 0) <> v_n_ext THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'extrato_nao_encontrado: algum extrato do bloco nao existe.';
  END IF;
  IF NOT public.tenant_ok(v_cli) THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'sem_permissao: operacao nao autorizada para este cliente.';
  END IF;

  -- ── lancamentos, por competencia (desempate vencimento, created_at, maior valor, id), com o SALDO LIVRE (abs(valor) - aplicado vivo)
  FOR r IN
    SELECT l.*, abs(l.valor) - coalesce((SELECT sum(c.valor_aplicado) FROM conciliacao_bancaria_itens c
                                          WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL), 0) AS saldo_livre
      FROM financeiro_lancamentos_v2 l WHERE l.id = ANY(p_lancamentos)
     -- CONC-BLOCOS-TELA-01 (decisao do Gabriel, 01/10): competencia -> vencimento -> created_at (a ordem real de
     -- lancamento das cargas do modal) -> MAIOR valor (as 10 NFs do backfill de 16/09 empatam no created_at) -> id.
     ORDER BY l.data_competencia NULLS LAST, l.data_vencimento NULLS LAST, l.created_at NULLS LAST, abs(l.valor) DESC, l.id
  LOOP
    IF r.cancelado IS TRUE THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('lancamento_cancelado: "%s" esta cancelado.', coalesce(r.descricao, r.id::text));
    END IF;
    IF r.cliente_id IS DISTINCT FROM v_cli THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('cliente_divergente: "%s" e'' de outro cliente.', coalesce(r.descricao, r.id::text));
    END IF;
    IF coalesce(r.cenario, 'realizado') = 'meta' THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('lancamento_meta: "%s" e'' do cenario meta — meta nao se concilia.', coalesce(r.descricao, r.id::text));
    END IF;
    IF r.conta_efetiva_id IS DISTINCT FROM v_conta THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('conta_diferente: "%s" e'' de outra conta bancaria (a conta dele, pela direcao, nao e'' a do extrato).', coalesce(r.descricao, r.id::text));
    END IF;
    IF (v_sinal_ext < 0 AND r.sinal IS DISTINCT FROM '-1') OR (v_sinal_ext > 0 AND r.sinal IS DISTINCT FROM '1') THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('direcao_incoerente: "%s" e'' %s e o extrato e'' %s.', coalesce(r.descricao, r.id::text),
        CASE WHEN r.sinal = '1' THEN 'entrada' ELSE 'saida' END, CASE WHEN v_sinal_ext > 0 THEN 'entrada' ELSE 'saida' END);
    END IF;
    IF EXISTS (SELECT 1 FROM financeiro_fechamentos f WHERE f.cliente_id = r.cliente_id AND f.fazenda_id = r.fazenda_id
                AND f.ano_mes = r.ano_mes AND f.status_fechamento = 'fechado') THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('mes_fechado: "%s" e'' da competencia %s, mes fechado.', coalesce(r.descricao, r.id::text), r.ano_mes);
    END IF;
    IF r.saldo_livre <= c_tol THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('sem_saldo_livre: "%s" ja esta inteiro conciliado.', coalesce(r.descricao, r.id::text));
    END IF;
    l_id := l_id || r.id; l_desc := l_desc || coalesce(r.descricao, ''); l_saldo := l_saldo || r.saldo_livre;
    l_rest := l_rest || r.saldo_livre; l_quitou := l_quitou || NULL::date;
    v_estado := v_estado || jsonb_build_object(r.id::text, jsonb_build_object('status_transacao', r.status_transacao, 'data_pagamento', r.data_pagamento));
    v_soma_lan := v_soma_lan + r.saldo_livre;
  END LOOP;
  IF coalesce(array_length(l_id, 1), 0) <> v_n_lan THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'lancamento_nao_encontrado: algum lancamento do bloco nao existe.';
  END IF;

  -- ── a regra
  IF p_regra = 'exato' AND abs(v_soma_ext - v_soma_lan) > c_tol THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('soma_diverge: os extratos somam %s e os lancamentos (saldo livre) %s — diferenca %s. A regra exato exige soma igual.',
      v_soma_ext, v_soma_lan, v_soma_ext - v_soma_lan);
  END IF;
  IF p_regra = 'mais_antigo_primeiro' AND v_soma_ext > v_soma_lan + c_tol THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('soma_extratos_maior: os extratos somam %s e os lancamentos so'' %s — sobrariam %s do banco sem lancamento. Acrescente o lancamento que falta.',
      v_soma_ext, v_soma_lan, v_soma_ext - v_soma_lan);
  END IF;

  -- ── alocacao gulosa: extrato mais antigo no lancamento mais antigo
  WHILE i <= v_n_ext AND j <= v_n_lan LOOP
    m := least(e_rest[i], l_rest[j]);
    IF m > c_tol THEN
      v_matriz := v_matriz || jsonb_build_object('extrato_id', e_id[i], 'extrato_data', e_data[i], 'extrato_valor', e_valor[i],
                                                 'lancamento_id', l_id[j], 'descricao', l_desc[j], 'valor_aplicado', round(m, 2));
      e_rest[i] := e_rest[i] - m; l_rest[j] := l_rest[j] - m;
      IF l_rest[j] <= c_tol THEN l_quitou[j] := e_data[i]; END IF;
    END IF;
    IF e_rest[i] <= c_tol THEN i := i + 1; END IF;
    IF l_rest[j] <= c_tol THEN j := j + 1; END IF;
  END LOOP;

  FOR j IN 1..v_n_lan LOOP
    IF l_rest[j] <= c_tol THEN
      v_quitados := v_quitados || jsonb_build_object('lancamento_id', l_id[j], 'descricao', l_desc[j], 'data_pagamento', l_quitou[j]);
    ELSIF l_rest[j] >= l_saldo[j] - c_tol THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('lancamento_sem_alocacao: "%s" nao recebe nada destes extratos — tire-o do bloco.', l_desc[j]);
    ELSE
      v_parcial := jsonb_build_object('lancamento_id', l_id[j], 'descricao', l_desc[j], 'aplicado', round(l_saldo[j] - l_rest[j], 2), 'falta', round(l_rest[j], 2));
    END IF;
  END LOOP;

  v_resumo := jsonb_build_object('soma_extratos', v_soma_ext, 'soma_lancamentos', v_soma_lan, 'diferenca', v_soma_ext - v_soma_lan,
                                 'quitados', v_quitados, 'parcial', v_parcial);
  v_ret := jsonb_build_object('ok', true, 'simulado', coalesce(p_simular, true), 'regra', p_regra, 'conta_bancaria_id', v_conta,
                              'matriz', v_matriz, 'resumo', v_resumo);
  IF coalesce(p_simular, true) THEN RETURN v_ret; END IF;

  -- ── gravacao
  INSERT INTO conciliacao_blocos (cliente_id, conta_bancaria_id, regra, criado_por, estado_anterior, resumo)
  VALUES (v_cli, v_conta, p_regra, v_uid, v_estado, v_ret) RETURNING id INTO v_bloco;

  PERFORM set_config('app.conciliar_bloco', 'on', true);
  INSERT INTO conciliacao_bancaria_itens (cliente_id, extrato_id, lancamento_id, valor_aplicado, grupo_id,
                                          criado_por, tipo_aprovacao, aprovado_por, aprovado_em)
  SELECT v_cli, (x->>'extrato_id')::uuid, (x->>'lancamento_id')::uuid, (x->>'valor_aplicado')::numeric, v_bloco,
         v_uid, 'agrupamento_manual', v_uid, now()
    FROM jsonb_array_elements(v_matriz) x;
  PERFORM set_config('app.conciliar_bloco', 'off', true);

  -- promove SO' o quitado, com a data do extrato que quitou; o parcial fica como estava. O valor NUNCA muda.
  UPDATE financeiro_lancamentos_v2 l
     SET status_transacao = 'realizado', data_pagamento = (q->>'data_pagamento')::date, updated_by = v_uid, updated_at = now()
    FROM jsonb_array_elements(v_quitados) q
   WHERE l.id = (q->>'lancamento_id')::uuid AND l.status_transacao IN ('programado', 'agendado')
     AND l.cancelado IS NOT TRUE AND coalesce(l.cenario, 'realizado') <> 'meta';

  FOR i IN 1..v_n_ext LOOP
    SELECT coalesce(sum(valor_aplicado), 0) INTO v_soma FROM conciliacao_bancaria_itens WHERE extrato_id = e_id[i] AND desfeito_em IS NULL;
    v_status := CASE WHEN v_soma <= 0 THEN 'nao_conciliado' WHEN v_soma + c_tol >= e_valor[i] THEN 'conciliado' ELSE 'parcial' END;
    UPDATE extrato_bancario_v2 SET status = v_status WHERE id = e_id[i] AND status IS DISTINCT FROM v_status;
  END LOOP;

  RETURN v_ret || jsonb_build_object('bloco_id', v_bloco);
END
$function$;

DO $confere$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_conciliar_bloco(uuid[], uuid[], text, boolean)'::regprocedure) <> '2d9d54084c7c40e0d7e2b0b473cf7a42' THEN
    RAISE EXCEPTION 'CONC-BLOCOS-TELA-01: corpo de destino de fn_conciliar_bloco divergente — abortado';
  END IF;
END $confere$;

REVOKE ALL ON FUNCTION public.fn_conciliar_bloco(uuid[], uuid[], text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conciliar_bloco(uuid[], uuid[], text, boolean) TO authenticated, service_role;
