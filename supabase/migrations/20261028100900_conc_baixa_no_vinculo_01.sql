-- CONC-BAIXA-NO-VINCULO-01 (Gabriel, 21/10/2026) — todo vinculo com extrato da' baixa; o parcial nunca fica mudo.
-- Base: FASE 0 CONC-CONCILIADO-SEM-BAIXA-01. Decisao: baixa no proprio vinculo (nao trava), parcial vira divisao explicita.
--
-- (1) O gatilho de promocao (`fn_promover_lancamento_realizado_ao_conciliar`) passa a promover tambem PREVISTO — era o buraco do
--     1:1 manual e do "vincular exatos" (a2baca6c / 84fc61e5 ficaram previstos com vinculo vivo).
-- (2) DIVISAO NO FIM DA TRANSACAO, num lugar so': gatilho de restricao ADIADO em `conciliacao_bancaria_itens`. Por que adiado: o 1:N
--     e o grupo gravam varios vinculos de um mesmo lancamento em comandos seguidos; so' no fim da transacao se sabe se o lancamento
--     ficou inteiro ou parcial. Cobre o 1:1, o grupo, o bloco e qualquer caminho futuro sem reescrever cada um (os corpos de
--     fn_vincular_extrato_lancamento / fn_vincular_grupo_conciliacao / fn_conciliar_bloco NAO mudam).
--     Parcial (aplicado vivo < valor): o lancamento se DIVIDE — o original fica com o aplicado, realizado na data do ultimo extrato
--     vivo, ligado ao extrato; a falta vira um IRMAO em aberto (programado; mesmo fornecedor, classificacao, competencia, conta,
--     vencimento), ligado ao original por `saldo_de_id`, com trilha em `financeiro_baixas_no_vinculo`.
--     FORA da divisao (medido; ver o relatorio): transferencia; TITULO DE OC (uma parte viva por parcela da programacao — indice
--     zoo_operacao_partes_parcela_prog_ativa_uniq; o parcial da OC ja' e' explicito na liquidacao automatica e no "Falta" da OC);
--     lancamento de financiamento (a parcela acompanha o valor do lancamento). Nesses, o parcial segue o caminho de hoje.
-- (3) DESFAZER JUNTA DE VOLTA: desfeito o vinculo do original, o irmao ainda em aberto e' cancelado e o original volta ao valor e ao
--     estado anteriores. Irmao ja' pago (vinculo vivo ou realizado) recusa com a frase pronta e o id no DETAIL.
-- (4) TRAVA no fim: vinculo vivo exige lancamento realizado (ou conciliado) com data de pagamento. NAO exige data = data do extrato.
--     Excecao unica: o titulo de OC com recebimento parcial (registrado na OC). Lancamento de META nao se liga (zero hoje).
-- (5) Gestos de conserto (por gesto, com trilha e estado anterior): `fn_conc_baixar_vinculado` (baixa/divisao de um vinculado que
--     ficou sem baixa) e `fn_conc_ligar_com_valor_real` (recorrencia estimada aceita o valor do extrato e liga 1:1).
-- O desvio `app.conc_dividindo` deixa o guarda de "casado nao rebaixa" aceitar SO' a troca de valor/estado feita aqui — o mesmo
-- idioma do `app.conciliar_bloco` (CONC-BLOCOS-01).

SET LOCAL lock_timeout = '3s';

DO $guarda$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_promover_lancamento_realizado_ao_conciliar()'::regprocedure)
     <> '60ba6710d8417f6e1dbcde95031d7b74' THEN
    RAISE EXCEPTION 'CONC-BAIXA-NO-VINCULO-01: corpo de origem de fn_promover_lancamento_realizado_ao_conciliar divergente';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.guard_lancamento_casado_nao_rebaixa()'::regprocedure)
     <> '03f42e7f9cacb14e9e8d33420c60887e' THEN
    RAISE EXCEPTION 'CONC-BAIXA-NO-VINCULO-01: corpo de origem de guard_lancamento_casado_nao_rebaixa divergente';
  END IF;
  IF to_regclass('public.financeiro_baixas_no_vinculo') IS NOT NULL THEN
    RAISE EXCEPTION 'CONC-BAIXA-NO-VINCULO-01: financeiro_baixas_no_vinculo ja existe';
  END IF;
END $guarda$;

-- ═══════════════════ 1. O ELO E A TRILHA ═══════════════════
ALTER TABLE public.financeiro_lancamentos_v2 ADD COLUMN saldo_de_id uuid REFERENCES public.financeiro_lancamentos_v2(id);
COMMENT ON COLUMN public.financeiro_lancamentos_v2.saldo_de_id IS
  'CONC-BAIXA-NO-VINCULO-01: este lancamento e'' o SALDO em aberto de um vinculo parcial do lancamento indicado (o original).';

CREATE TABLE public.financeiro_baixas_no_vinculo (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id     uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo           text NOT NULL CHECK (tipo IN ('divisao', 'juncao', 'baixa', 'valor_real')),
  lancamento_id  uuid NOT NULL REFERENCES public.financeiro_lancamentos_v2(id),
  irmao_id       uuid REFERENCES public.financeiro_lancamentos_v2(id),
  valor_original numeric,
  valor_aplicado numeric,
  valor_saldo    numeric,
  antes          jsonb NOT NULL DEFAULT '{}'::jsonb,
  depois         jsonb NOT NULL DEFAULT '{}'::jsonb,
  origem         text NOT NULL CHECK (origem IN ('gatilho', 'conserto')),
  motivo         text,
  feita_por      uuid,
  feita_em       timestamptz NOT NULL DEFAULT now(),
  desfeita_em    timestamptz,
  desfeita_por   uuid,
  desfeita_motivo text
);
CREATE UNIQUE INDEX financeiro_baixas_no_vinculo_divisao_viva ON public.financeiro_baixas_no_vinculo (lancamento_id)
  WHERE tipo = 'divisao' AND desfeita_em IS NULL;
CREATE INDEX financeiro_baixas_no_vinculo_cliente ON public.financeiro_baixas_no_vinculo (cliente_id, feita_em);
ALTER TABLE public.financeiro_baixas_no_vinculo ENABLE ROW LEVEL SECURITY;
CREATE POLICY financeiro_baixas_no_vinculo_select ON public.financeiro_baixas_no_vinculo FOR SELECT TO authenticated
  USING (public.tenant_ok(cliente_id));
REVOKE ALL ON TABLE public.financeiro_baixas_no_vinculo FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.financeiro_baixas_no_vinculo TO authenticated;
-- escrita SO' pelas funcoes abaixo (SECURITY DEFINER)

-- ═══════════════════ 2. O GUARDA DE "CASADO" ACEITA O DESVIO DA DIVISAO ═══════════════════
CREATE OR REPLACE FUNCTION public.guard_lancamento_casado_nao_rebaixa()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $function$
begin
  -- CONC-BAIXA-NO-VINCULO-01: a divisao / juncao do parcial (`_fn_conc_baixa_no_vinculo`, `_fn_trg_conc_juntar_ao_desfazer`) troca
  -- o valor de um lancamento casado de proposito, com trilha. So' esse desvio passa.
  if coalesce(current_setting('app.conc_dividindo', true), 'off') = 'on' then
    return new;
  end if;
  if not public._fin_lancamento_casado_com_extrato(old.id) then
    return new;
  end if;
  raise exception using errcode = 'P0001',
    message = 'Lancamento casado com o extrato: desfaca a conciliacao no Espelho para alterar';
end
$function$;

-- ═══════════════════ 3. PROMOCAO: PREVISTO TAMBEM ═══════════════════
CREATE OR REPLACE FUNCTION public.fn_promover_lancamento_realizado_ao_conciliar()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  -- CONC-BLOCOS-01: o motor de blocos (fn_conciliar_bloco) liga este desvio enquanto grava os vinculos e promove ELE
  -- MESMO, so' o lancamento QUITADO, com a data do extrato que quitou. Os caminhos 1:1 e 1:N nao ligam o desvio:
  -- para eles nada muda (promove no 1o vinculo, como sempre).
  IF coalesce(current_setting('app.conciliar_bloco', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;
  -- CONC-BAIXA-NO-VINCULO-01: PREVISTO tambem da' baixa (era o buraco do 1:1 manual e do "vincular exatos"). O parcial e' dividido
  -- no fim da transacao (`_fn_trg_conc_baixa_no_vinculo`).
  UPDATE public.financeiro_lancamentos_v2
  SET status_transacao = 'realizado',
      data_pagamento   = COALESCE(data_pagamento, NEW.snapshot_extrato_data),
      updated_at       = now()
  WHERE id = NEW.lancamento_id
    AND status_transacao IN ('previsto','programado','agendado')
    AND cancelado IS NOT TRUE
    AND COALESCE(cenario, 'realizado') <> 'meta';
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.fn_promover_lancamento_realizado_ao_conciliar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_promover_lancamento_realizado_ao_conciliar() TO authenticated, service_role;

-- ═══════════════════ 4. O NUCLEO: BAIXA OU DIVISAO DE UM LANCAMENTO VINCULADO ═══════════════════
-- Devolve o que fez ({acao: nada|baixa|divisao, ...}). Idempotente: inteiro e realizado => nada.
CREATE OR REPLACE FUNCTION public._fn_conc_baixa_no_vinculo(p_lancamento_id uuid, p_origem text, p_motivo text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $function$
DECLARE
  l public.financeiro_lancamentos_v2; v_ap numeric; v_data date; v_n int; v_total numeric; v_saldo numeric; v_sinal numeric;
  v_oc boolean; v_fin boolean; v_irmao uuid := gen_random_uuid(); v_cols text; v_vals text; v_antes jsonb; v_uid uuid := auth.uid();
  v_obs text;
BEGIN
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento_id FOR UPDATE;
  IF NOT FOUND OR l.cancelado IS TRUE OR coalesce(l.cenario, 'realizado') = 'meta' THEN
    RETURN jsonb_build_object('acao', 'nada');
  END IF;
  SELECT coalesce(sum(c.valor_aplicado), 0), max(e.data_movimento), count(*) INTO v_ap, v_data, v_n
    FROM public.conciliacao_bancaria_itens c JOIN public.extrato_bancario_v2 e ON e.id = c.extrato_id
   WHERE c.lancamento_id = p_lancamento_id AND c.desfeito_em IS NULL;
  IF v_n = 0 THEN RETURN jsonb_build_object('acao', 'nada'); END IF;
  v_total := abs(l.valor);
  v_sinal := CASE WHEN l.valor < 0 THEN -1 ELSE 1 END;
  v_oc := EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt WHERE pt.financeiro_lancamento_id = l.id AND pt.cancelada IS NOT TRUE);
  v_fin := l.financiamento_id IS NOT NULL OR EXISTS (SELECT 1 FROM public.financiamento_parcelas fp
                                                      WHERE l.id IN (fp.lancamento_id, fp.lancamento_juros_id));
  v_antes := jsonb_build_object('valor', l.valor, 'status_transacao', l.status_transacao, 'data_pagamento', l.data_pagamento,
                                'conciliado_em', l.conciliado_em);

  -- PARCIAL elegivel: divide
  IF l.tipo_operacao NOT LIKE '3-%' AND NOT v_oc AND NOT v_fin AND v_ap > 0 AND v_ap < v_total - 0.005 THEN
    v_saldo := round(v_total - v_ap, 2);
    v_obs := format('Saldo de %s do lançamento %s (vínculo parcial com o extrato de %s).',
                    public._fn_oc_brl(v_saldo), l.id, public._fn_oc_data(v_data));
    -- o irmao: copia de todas as colunas gravaveis, com as trocas abaixo (a coluna gerada fica de fora)
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum),
           string_agg(CASE a.attname
             WHEN 'id' THEN '$1' WHEN 'valor' THEN '$3' WHEN 'saldo_de_id' THEN '$2' WHEN 'observacao' THEN '$4'
             WHEN 'created_by' THEN '$5' WHEN 'updated_by' THEN '$5'
             WHEN 'status_transacao' THEN '''programado''' WHEN 'data_pagamento' THEN 'NULL' WHEN 'conciliado_em' THEN 'NULL'
             WHEN 'created_at' THEN 'now()' WHEN 'updated_at' THEN 'now()'
             WHEN 'hash_importacao' THEN 'NULL' WHEN 'lote_importacao_id' THEN 'NULL' WHEN 'staging_id' THEN 'NULL'
             WHEN 'duplicado_de_id' THEN 'NULL' WHEN 'status_duplicidade' THEN 'NULL' WHEN 'nivel_duplicidade' THEN 'NULL'
             WHEN 'importado_duplicado' THEN 'false' WHEN 'editado_manual' THEN 'false'
             WHEN 'orfao_definitivo' THEN 'false' WHEN 'orfao_definitivo_motivo' THEN 'NULL' WHEN 'orfao_definitivo_por' THEN 'NULL'
             WHEN 'orfao_definitivo_em' THEN 'NULL' WHEN 'cancelado' THEN 'false' WHEN 'cancelado_em' THEN 'NULL'
             WHEN 'cancelado_por' THEN 'NULL' WHEN 'cancelado_motivo' THEN 'NULL' WHEN 'transferencia_grupo_id' THEN 'NULL'
             -- uniq_lanc_recorrencia_competencia: uma recorrencia viva por competencia — o irmao fica preso ao original, nao a ela
             WHEN 'recorrencia_id' THEN 'NULL' WHEN 'valor_do_mes_em' THEN 'NULL' WHEN 'valor_do_mes_origem' THEN 'NULL'
             ELSE quote_ident(a.attname) END, ', ' ORDER BY a.attnum)
      INTO v_cols, v_vals
      FROM pg_attribute a
     WHERE a.attrelid = 'public.financeiro_lancamentos_v2'::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '';
    EXECUTE format('INSERT INTO public.financeiro_lancamentos_v2 (%s) SELECT %s FROM public.financeiro_lancamentos_v2 WHERE id = $2',
                   v_cols, v_vals)
      USING v_irmao, l.id, v_sinal * v_saldo, CASE WHEN l.observacao IS NULL OR btrim(l.observacao) = '' THEN v_obs
                                                   ELSE l.observacao || E'\n' || v_obs END, v_uid;
    PERFORM set_config('app.conc_dividindo', 'on', true);
    UPDATE public.financeiro_lancamentos_v2
       SET valor = v_sinal * round(v_ap, 2),
           status_transacao = CASE WHEN status_transacao IN ('realizado', 'conciliado') THEN status_transacao ELSE 'realizado' END,
           data_pagamento = coalesce(data_pagamento, v_data),
           updated_at = now(), updated_by = coalesce(v_uid, updated_by)
     WHERE id = l.id;
    PERFORM set_config('app.conc_dividindo', 'off', true);
    INSERT INTO public.financeiro_baixas_no_vinculo (cliente_id, tipo, lancamento_id, irmao_id, valor_original, valor_aplicado, valor_saldo,
        antes, depois, origem, motivo, feita_por)
    SELECT l.cliente_id, 'divisao', l.id, v_irmao, l.valor, v_sinal * round(v_ap, 2), v_sinal * v_saldo, v_antes,
           jsonb_build_object('valor', x.valor, 'status_transacao', x.status_transacao, 'data_pagamento', x.data_pagamento),
           p_origem, p_motivo, v_uid
      FROM public.financeiro_lancamentos_v2 x WHERE x.id = l.id;
    RETURN jsonb_build_object('acao', 'divisao', 'lancamento_id', l.id, 'irmao_id', v_irmao, 'aplicado', round(v_ap, 2),
                              'saldo', v_saldo, 'data_pagamento', coalesce(l.data_pagamento, v_data));
  END IF;

  -- INTEIRO (ou fora da divisao) sem baixa: baixa na data do ultimo extrato vivo. O parcial de OC fica como a OC o registra.
  IF l.status_transacao NOT IN ('realizado', 'conciliado') AND NOT (v_oc AND v_ap < v_total - 0.005) THEN
    UPDATE public.financeiro_lancamentos_v2
       SET status_transacao = 'realizado', data_pagamento = coalesce(data_pagamento, v_data),
           updated_at = now(), updated_by = coalesce(v_uid, updated_by)
     WHERE id = l.id;
    IF p_origem = 'conserto' THEN
      INSERT INTO public.financeiro_baixas_no_vinculo (cliente_id, tipo, lancamento_id, valor_original, valor_aplicado, antes, depois,
          origem, motivo, feita_por)
      SELECT l.cliente_id, 'baixa', l.id, l.valor, round(v_ap, 2), v_antes,
             jsonb_build_object('valor', x.valor, 'status_transacao', x.status_transacao, 'data_pagamento', x.data_pagamento),
             p_origem, p_motivo, v_uid
        FROM public.financeiro_lancamentos_v2 x WHERE x.id = l.id;
    END IF;
    RETURN jsonb_build_object('acao', 'baixa', 'lancamento_id', l.id, 'data_pagamento', coalesce(l.data_pagamento, v_data));
  END IF;
  RETURN jsonb_build_object('acao', 'nada');
END;
$function$;
REVOKE ALL ON FUNCTION public._fn_conc_baixa_no_vinculo(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- ═══════════════════ 5. O GATILHO ADIADO: DIVIDE E TRAVA NO FIM DA TRANSACAO ═══════════════════
CREATE OR REPLACE FUNCTION public._fn_trg_conc_baixa_no_vinculo()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $function$
DECLARE l public.financeiro_lancamentos_v2; v_ap numeric;
BEGIN
  -- o vinculo pode ter sido desfeito depois, na mesma transacao: so' conta o que esta vivo no fim
  IF NOT EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens c WHERE c.id = NEW.id AND c.desfeito_em IS NULL) THEN
    RETURN NULL;
  END IF;
  PERFORM public._fn_conc_baixa_no_vinculo(NEW.lancamento_id, 'gatilho', NULL);
  -- TRAVA: vinculo vivo exige baixa (realizado com data de pagamento). Excecao: titulo de OC com recebimento parcial.
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = NEW.lancamento_id;
  -- META nunca se liga a extrato (medido 21/10/2026: zero vinculos vivos em META)
  IF coalesce(l.cenario, 'realizado') = 'meta' THEN
    RAISE EXCEPTION 'Lançamento de META não se liga a extrato. Nada foi gravado.' USING ERRCODE = 'P0001', DETAIL = l.id::text;
  END IF;
  IF l.cancelado IS NOT TRUE
     AND NOT (l.status_transacao IN ('realizado', 'conciliado') AND l.data_pagamento IS NOT NULL) THEN
    v_ap := public._fn_lancamento_aplicado_vivo(l.id);
    IF NOT (v_ap < abs(l.valor) - 0.005 AND EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt
                                                    WHERE pt.financeiro_lancamento_id = l.id AND pt.cancelada IS NOT TRUE)) THEN
      RAISE EXCEPTION 'O lançamento de % ficou ligado ao extrato sem baixa. Nada foi gravado.', public._fn_oc_brl(abs(l.valor))
        USING ERRCODE = 'P0001', DETAIL = l.id::text;
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public._fn_trg_conc_baixa_no_vinculo() FROM PUBLIC, anon, authenticated;

CREATE CONSTRAINT TRIGGER trg_zzz_conc_baixa_no_vinculo
  AFTER INSERT OR UPDATE OF desfeito_em ON public.conciliacao_bancaria_itens
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.desfeito_em IS NULL)
  EXECUTE FUNCTION public._fn_trg_conc_baixa_no_vinculo();

-- ═══════════════════ 6. DESFAZER JUNTA DE VOLTA ═══════════════════
CREATE OR REPLACE FUNCTION public._fn_trg_conc_juntar_ao_desfazer()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $function$
DECLARE d public.financeiro_baixas_no_vinculo; i public.financeiro_lancamentos_v2; v_vivos int; v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO d FROM public.financeiro_baixas_no_vinculo
   WHERE lancamento_id = NEW.lancamento_id AND tipo = 'divisao' AND desfeita_em IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO i FROM public.financeiro_lancamentos_v2 WHERE id = d.irmao_id FOR UPDATE;
  IF i.cancelado IS NOT TRUE AND (i.status_transacao IN ('realizado', 'conciliado')
       OR EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens c WHERE c.lancamento_id = i.id AND c.desfeito_em IS NULL)) THEN
    RAISE EXCEPTION 'Não dá para desfazer: o saldo de % deste lançamento já foi pago (lançamento de %). Desfaça o pagamento do saldo antes. Nada foi alterado.',
      public._fn_oc_brl(abs(i.valor)), public._fn_oc_data(coalesce(i.data_pagamento, i.data_vencimento))
      USING ERRCODE = 'P0001', DETAIL = i.id::text;
  END IF;
  -- o irmao em aberto sai (cancelado com o motivo; a casa nao apaga lancamento)
  IF i.cancelado IS NOT TRUE THEN
    UPDATE public.financeiro_lancamentos_v2
       SET cancelado = true, cancelado_em = now(), cancelado_por = v_uid,
           cancelado_motivo = format('Saldo juntado de volta ao lançamento %s (vínculo desfeito).', d.lancamento_id),
           updated_at = now(), updated_by = coalesce(v_uid, updated_by)
     WHERE id = i.id;
  END IF;
  SELECT count(*) INTO v_vivos FROM public.conciliacao_bancaria_itens c WHERE c.lancamento_id = d.lancamento_id AND c.desfeito_em IS NULL;
  PERFORM set_config('app.conc_dividindo', 'on', true);
  UPDATE public.financeiro_lancamentos_v2 x
     SET valor = (d.antes->>'valor')::numeric,
         status_transacao = CASE WHEN v_vivos = 0 THEN d.antes->>'status_transacao' ELSE x.status_transacao END,
         data_pagamento   = CASE WHEN v_vivos = 0 THEN (d.antes->>'data_pagamento')::date ELSE x.data_pagamento END,
         updated_at = now(), updated_by = coalesce(v_uid, x.updated_by)
   WHERE x.id = d.lancamento_id;
  PERFORM set_config('app.conc_dividindo', 'off', true);
  UPDATE public.financeiro_baixas_no_vinculo SET desfeita_em = now(), desfeita_por = v_uid, desfeita_motivo = NEW.desfeito_motivo
   WHERE id = d.id;
  INSERT INTO public.financeiro_baixas_no_vinculo (cliente_id, tipo, lancamento_id, irmao_id, valor_original, valor_aplicado, valor_saldo,
      antes, depois, origem, motivo, feita_por)
  VALUES (d.cliente_id, 'juncao', d.lancamento_id, d.irmao_id, d.valor_original, d.valor_aplicado, d.valor_saldo,
          d.depois, d.antes, 'gatilho', NEW.desfeito_motivo, v_uid);
  -- outro vinculo vivo ainda no original: a conta refaz-se sobre o que sobrou (divide de novo pelo novo aplicado)
  IF v_vivos > 0 THEN
    PERFORM public._fn_conc_baixa_no_vinculo(d.lancamento_id, 'gatilho', NEW.desfeito_motivo);
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public._fn_trg_conc_juntar_ao_desfazer() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_zzz_conc_juntar_ao_desfazer
  AFTER UPDATE OF desfeito_em ON public.conciliacao_bancaria_itens
  FOR EACH ROW WHEN (OLD.desfeito_em IS NULL AND NEW.desfeito_em IS NOT NULL)
  EXECUTE FUNCTION public._fn_trg_conc_juntar_ao_desfazer();

-- ═══════════════════ 7. OS GESTOS DE CONSERTO ═══════════════════
-- Baixa (ou divisao) de um lancamento que ficou vinculado sem baixa — o mesmo nucleo do gatilho, com motivo e trilha.
CREATE OR REPLACE FUNCTION public.fn_conc_baixar_vinculado(p_lancamento_id uuid, p_motivo text, p_simular boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $function$
DECLARE v_cli uuid; v_ret jsonb;
BEGIN
  SELECT cliente_id INTO v_cli FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento_id;
  PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[v_cli]);
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'Informe o motivo.' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conciliacao_bancaria_itens c WHERE c.lancamento_id = p_lancamento_id AND c.desfeito_em IS NULL) THEN
    RAISE EXCEPTION 'Este lançamento não está ligado a nenhum extrato. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  v_ret := public._fn_conc_baixa_no_vinculo(p_lancamento_id, 'conserto', p_motivo);
  IF p_simular THEN RAISE EXCEPTION 'simulação' USING ERRCODE = 'CBSIM'; END IF;
  RETURN v_ret;
EXCEPTION WHEN SQLSTATE 'CBSIM' THEN RETURN v_ret || jsonb_build_object('simulado', true);
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_conc_baixar_vinculado(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conc_baixar_vinculado(uuid, text, boolean) TO authenticated, service_role;

-- Recorrencia ESTIMADA aceita o valor real do extrato e liga 1:1 (o caso do Vivo). So' recorrencia ainda em aberto e livre.
CREATE OR REPLACE FUNCTION public.fn_conc_ligar_com_valor_real(p_extrato_id uuid, p_lancamento_id uuid, p_motivo text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $function$
DECLARE l public.financeiro_lancamentos_v2; e public.extrato_bancario_v2; v_uid uuid := auth.uid(); v_ret jsonb;
BEGIN
  PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[(SELECT cliente_id FROM public.extrato_bancario_v2 WHERE id = p_extrato_id),
                                                   (SELECT cliente_id FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento_id)]);
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN RAISE EXCEPTION 'Informe o motivo.' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = p_lancamento_id FOR UPDATE;
  SELECT * INTO e FROM public.extrato_bancario_v2 WHERE id = p_extrato_id;
  IF l.cliente_id IS DISTINCT FROM e.cliente_id THEN RAISE EXCEPTION 'sem acesso a este registro' USING ERRCODE = '42501'; END IF;
  IF l.recorrencia_id IS NULL OR l.status_transacao NOT IN ('previsto', 'programado', 'agendado') OR l.cancelado IS TRUE THEN
    RAISE EXCEPTION 'Só a recorrência ainda em aberto aceita o valor do extrato. Nada foi gravado.' USING ERRCODE = 'P0001';
  END IF;
  IF public._fin_lancamento_casado_com_extrato(l.id) THEN
    RAISE EXCEPTION 'Este lançamento já está ligado a um extrato. Nada foi gravado.' USING ERRCODE = 'P0001', DETAIL = l.id::text;
  END IF;
  INSERT INTO public.financeiro_baixas_no_vinculo (cliente_id, tipo, lancamento_id, valor_original, valor_aplicado, antes, depois,
      origem, motivo, feita_por)
  VALUES (l.cliente_id, 'valor_real', l.id, l.valor, abs(e.valor),
          jsonb_build_object('valor', l.valor, 'valor_do_mes_em', l.valor_do_mes_em, 'valor_do_mes_origem', l.valor_do_mes_origem,
                             'extrato_id', e.id),
          jsonb_build_object('valor', (CASE WHEN l.valor < 0 THEN -1 ELSE 1 END) * abs(e.valor), 'valor_do_mes_origem', 'manual'),
          'conserto', p_motivo, v_uid);
  UPDATE public.financeiro_lancamentos_v2
     SET valor = (CASE WHEN valor < 0 THEN -1 ELSE 1 END) * abs(e.valor), valor_do_mes_em = now(), valor_do_mes_origem = 'manual',
         updated_at = now(), updated_by = coalesce(v_uid, updated_by)
   WHERE id = l.id;
  v_ret := public.fn_vincular_extrato_lancamento(p_extrato_id, p_lancamento_id, abs(e.valor), false);
  RETURN v_ret;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_conc_ligar_com_valor_real(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conc_ligar_com_valor_real(uuid, uuid, text) TO authenticated, service_role;

DO $confere$
BEGIN
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_promover_lancamento_realizado_ao_conciliar()'::regprocedure)
     NOT LIKE '%''previsto'',''programado'',''agendado''%' THEN RAISE EXCEPTION 'CONC-BAIXA-NO-VINCULO-01: promocao sem previsto'; END IF;
  IF has_function_privilege('anon', 'public.fn_conc_baixar_vinculado(uuid, text, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_conc_ligar_com_valor_real(uuid, uuid, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_conc_baixa_no_vinculo(uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONC-BAIXA-NO-VINCULO-01: ACL aberta'; END IF;
END $confere$;
