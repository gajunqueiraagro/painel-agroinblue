-- CONC-BLOCOS-01 (PR C1 do CONC-MANDIOCA-01) — motor de BLOCOS de conciliacao: N extratos x M lancamentos gravados
-- atomicamente como UM bloco, sem nunca reescrever o valor de lancamento, com parcial explicito e desfazer. Sem tela
-- (a tela e' o PR C2). Este motor E' o "2b" do PR-CONC-ENRIQ-AGRUP-2a: uma implementacao so'.
--
-- 1. conciliacao_blocos: o bloco e o estado anterior (status_transacao, data_pagamento) de cada lancamento, para o
--    gesto contrario. Os vinculos do bloco sao linhas de conciliacao_bancaria_itens com grupo_id = bloco.id e
--    tipo_aprovacao 'agrupamento_manual' (a CHECK de grupo ja' exige um dos dois tipos de agrupamento; nada muda nela).
--    ⚠ SEM FK grupo_id -> conciliacao_blocos NESTE PR: medido em 01/10, 154 vinculos (53 grupos, 144 vivos) ja' tem
--    grupo_id SEM bloco (agrupamento_manual 116, agrupamento_legado 38). A FK exige antes um bloco 'legado' para cada um
--    dos 53 — proposta registrada, nao aplicada.
-- 2. fn_conciliar_bloco(p_extratos, p_lancamentos, p_regra, p_simular):
--    'exato'                 soma|extratos| = soma do saldo livre dos lancamentos (tol 0,005); todos quitados.
--    'mais_antigo_primeiro'  extratos por data; lancamentos por competencia (desempate vencimento, id); alocacao
--                            gulosa; no maximo o ULTIMO fica parcial; soma dos extratos MAIOR que a dos lancamentos
--                            e' recusa (nunca sobra extrato aberto escondido); lancamento que nao recebe nada, recusa.
--    Nunca altera financeiro_lancamentos_v2.valor. Promove a realizado SO' o lancamento QUITADO, com data_pagamento =
--    data do extrato que o quitou; o parcial continua como estava. p_simular = true nao grava nada.
-- 3. fn_desfazer_bloco(p_bloco, p_motivo): o gesto contrario — desfaz os vinculos do bloco e restaura status e data
--    pelo estado_anterior.
-- 4. O gatilho de promocao (fn_promover_lancamento_realizado_ao_conciliar, md5 7141a465) ganha UM desvio por
--    configuracao de sessao ('app.conciliar_bloco', o idioma de 'app.propagando_plano'), ligado so' pelo motor
--    enquanto ele grava. Os caminhos 1:1 (fn_vincular_extrato_lancamento) e 1:N (fn_vincular_grupo_conciliacao) nao o
--    ligam: o comportamento deles e' o mesmo (prova antes x depois no relatorio).
-- As guardas de origem do desmembrar (recorrencia, financiamento...) NAO se aplicam: casar pagamento nao destroi nada.

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_promover_lancamento_realizado_ao_conciliar()'::regprocedure)
     <> '7141a46516c70fde2b9f904a65750cb2' THEN
    RAISE EXCEPTION 'CONC-BLOCOS-01: corpo de origem de fn_promover_lancamento_realizado_ao_conciliar divergente — abortado';
  END IF;
  IF to_regclass('public.conciliacao_blocos') IS NOT NULL THEN
    RAISE EXCEPTION 'CONC-BLOCOS-01: conciliacao_blocos ja existe — abortado';
  END IF;
END $guarda$;

-- ═══════════════════ 1. TABELA ═══════════════════
CREATE TABLE public.conciliacao_blocos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  conta_bancaria_id uuid NOT NULL REFERENCES public.financeiro_contas_bancarias(id),
  regra             text NOT NULL CHECK (regra IN ('exato', 'mais_antigo_primeiro')),
  criado_por        uuid,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  desfeito_por      uuid,
  desfeito_em       timestamptz,
  desfeito_motivo   text,
  -- { "<lancamento_id>": { "status_transacao": ..., "data_pagamento": ... } } — o que o desfazer restaura
  estado_anterior   jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- a resposta do motor no momento da gravacao (matriz + resumo), para auditoria
  resumo            jsonb
);
CREATE INDEX conciliacao_blocos_cliente_idx ON public.conciliacao_blocos (cliente_id, conta_bancaria_id) WHERE desfeito_em IS NULL;
ALTER TABLE public.conciliacao_blocos ENABLE ROW LEVEL SECURITY;
CREATE POLICY conciliacao_blocos_select ON public.conciliacao_blocos FOR SELECT TO authenticated USING (public.tenant_ok(cliente_id));
REVOKE ALL ON TABLE public.conciliacao_blocos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.conciliacao_blocos TO authenticated;
-- escrita SO' pelas duas funcoes abaixo (SECURITY DEFINER)

-- ═══════════════════ 4. GATILHO DE PROMOCAO: o desvio do motor ═══════════════════
CREATE OR REPLACE FUNCTION public.fn_promover_lancamento_realizado_ao_conciliar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- CONC-BLOCOS-01: o motor de blocos (fn_conciliar_bloco) liga este desvio enquanto grava os vinculos e promove ELE
  -- MESMO, so' o lancamento QUITADO, com a data do extrato que quitou. Os caminhos 1:1 e 1:N nao ligam o desvio:
  -- para eles nada muda (promove no 1o vinculo, como sempre).
  IF coalesce(current_setting('app.conciliar_bloco', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;
  UPDATE public.financeiro_lancamentos_v2
  SET status_transacao = 'realizado',
      data_pagamento   = COALESCE(data_pagamento, NEW.snapshot_extrato_data),
      updated_at       = now()
  WHERE id = NEW.lancamento_id
    AND status_transacao IN ('programado','agendado')
    AND cancelado IS NOT TRUE
    AND COALESCE(cenario, 'realizado') <> 'meta';
  RETURN NEW;
END;
$function$;

DO $confere$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_promover_lancamento_realizado_ao_conciliar()'::regprocedure)
     <> '60ba6710d8417f6e1dbcde95031d7b74' THEN
    RAISE EXCEPTION 'CONC-BLOCOS-01: corpo de destino do gatilho de promocao divergente — abortado';
  END IF;
END $confere$;

-- ═══════════════════ 2. O MOTOR ═══════════════════
CREATE FUNCTION public.fn_conciliar_bloco(p_extratos uuid[], p_lancamentos uuid[], p_regra text, p_simular boolean DEFAULT true)
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

  -- ── lancamentos, por competencia (desempate vencimento, id), com o SALDO LIVRE (abs(valor) - aplicado vivo)
  FOR r IN
    SELECT l.*, abs(l.valor) - coalesce((SELECT sum(c.valor_aplicado) FROM conciliacao_bancaria_itens c
                                          WHERE c.lancamento_id = l.id AND c.desfeito_em IS NULL), 0) AS saldo_livre
      FROM financeiro_lancamentos_v2 l WHERE l.id = ANY(p_lancamentos)
     ORDER BY l.data_competencia NULLS LAST, l.data_vencimento NULLS LAST, l.id
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

-- ═══════════════════ 3. O GESTO CONTRARIO ═══════════════════
CREATE FUNCTION public.fn_desfazer_bloco(p_bloco uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_b conciliacao_blocos%ROWTYPE; r record; v_ext uuid[]; v_soma numeric; v_status text; v_n int; k text;
BEGIN
  SELECT * INTO v_b FROM conciliacao_blocos WHERE id = p_bloco FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'bloco_nao_encontrado: o bloco nao existe.'; END IF;
  IF NOT public.tenant_ok(v_b.cliente_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'sem_permissao: operacao nao autorizada para este cliente.';
  END IF;
  IF v_b.desfeito_em IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('bloco_ja_desfeito: o bloco foi desfeito em %s.', to_char(v_b.desfeito_em, 'DD/MM/YYYY HH24:MI'));
  END IF;
  IF coalesce(btrim(p_motivo), '') = '' THEN
    RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = 'motivo_obrigatorio: diga por que o bloco esta sendo desfeito.';
  END IF;
  FOR r IN SELECT l.* FROM financeiro_lancamentos_v2 l WHERE l.id IN (SELECT k2::uuid FROM jsonb_object_keys(v_b.estado_anterior) k2) LOOP
    IF EXISTS (SELECT 1 FROM financeiro_fechamentos f WHERE f.cliente_id = r.cliente_id AND f.fazenda_id = r.fazenda_id
                AND f.ano_mes = r.ano_mes AND f.status_fechamento = 'fechado') THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('mes_fechado: "%s" e'' da competencia %s, mes fechado.', coalesce(r.descricao, r.id::text), r.ano_mes);
    END IF;
    -- outro vinculo vivo, de FORA do bloco e POSTERIOR a ele, no mesmo lancamento: restaurar o status o desmentiria
    IF EXISTS (SELECT 1 FROM conciliacao_bancaria_itens c WHERE c.lancamento_id = r.id AND c.desfeito_em IS NULL
                AND c.grupo_id IS DISTINCT FROM p_bloco AND c.aprovado_em > v_b.criado_em) THEN
      RAISE EXCEPTION USING ERRCODE = 'CBLOC', MESSAGE = format('vinculo_posterior: "%s" recebeu outro vinculo depois do bloco — desfaca aquele antes.', coalesce(r.descricao, r.id::text));
    END IF;
  END LOOP;

  SELECT array_agg(DISTINCT extrato_id) INTO v_ext FROM conciliacao_bancaria_itens WHERE grupo_id = p_bloco AND desfeito_em IS NULL;
  UPDATE conciliacao_bancaria_itens SET desfeito_em = now(), desfeito_por = v_uid, desfeito_motivo = 'bloco_desfeito'
   WHERE grupo_id = p_bloco AND desfeito_em IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- restaura status e data de pagamento pelo estado anterior (o valor nunca mudou)
  FOR k IN SELECT jsonb_object_keys(v_b.estado_anterior) LOOP
    UPDATE financeiro_lancamentos_v2
       SET status_transacao = v_b.estado_anterior->k->>'status_transacao',
           data_pagamento   = (v_b.estado_anterior->k->>'data_pagamento')::date,
           updated_by = v_uid, updated_at = now()
     WHERE id = k::uuid
       AND (status_transacao IS DISTINCT FROM v_b.estado_anterior->k->>'status_transacao'
            OR data_pagamento IS DISTINCT FROM (v_b.estado_anterior->k->>'data_pagamento')::date);
  END LOOP;

  IF v_ext IS NOT NULL THEN
    FOR r IN SELECT e.id, abs(e.valor) AS v FROM extrato_bancario_v2 e WHERE e.id = ANY(v_ext) LOOP
      SELECT coalesce(sum(valor_aplicado), 0) INTO v_soma FROM conciliacao_bancaria_itens WHERE extrato_id = r.id AND desfeito_em IS NULL;
      v_status := CASE WHEN v_soma <= 0 THEN 'nao_conciliado' WHEN v_soma + 0.005 >= r.v THEN 'conciliado' ELSE 'parcial' END;
      UPDATE extrato_bancario_v2 SET status = v_status WHERE id = r.id AND status IS DISTINCT FROM v_status;
    END LOOP;
  END IF;

  UPDATE conciliacao_blocos SET desfeito_em = now(), desfeito_por = v_uid, desfeito_motivo = p_motivo WHERE id = p_bloco;
  RETURN jsonb_build_object('ok', true, 'bloco_id', p_bloco, 'vinculos_desfeitos', v_n,
                            'lancamentos_restaurados', (SELECT count(*) FROM jsonb_object_keys(v_b.estado_anterior)));
END
$function$;

-- ═══════════════════ 5. ACL ═══════════════════
REVOKE ALL ON FUNCTION public.fn_conciliar_bloco(uuid[], uuid[], text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_desfazer_bloco(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conciliar_bloco(uuid[], uuid[], text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_desfazer_bloco(uuid, text) TO authenticated, service_role;
