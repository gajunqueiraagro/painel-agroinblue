-- P128b (NOTA-JA-LANCADA; decisões (a)–(d) do Gabriel, 28/10/2026 07:1x) — COMPLETAR COM A NOTA numa gravação só, com o ANTES guardado e o
-- DESFAZER que volta tudo. A prévia campo a campo da tela é ESTA função com `p_simular` (uma regra só, no banco): ela diz, por lançamento e
-- por campo, o de hoje → o que fica, o que tem cadeado (e por quê) e o efeito no DRE.
-- (a) Dentro da transação: os CAMPOS pedidos (descrição, fornecedor, fazenda, conta, subcentro, nº documento, competência, safra; e, só nas
--     programadas, valor e vencimento — o caminho "Completar e atualizar as não pagas") + a JUNÇÃO das soltas (`fn_parcelamento_juntar_lancamentos`,
--     a do P96a, DEPOIS de padronizar: ela exige o mesmo fornecedor/fazenda/classificação) + o ANTES de cada lançamento. O arquivo da nota e as
--     parcelas que faltam seguem pelo caminho de hoje logo depois (o storage não entra numa transação) e se registram na operação
--     (`fn_nota_completar_registrar`) para o desfazer cancelá-los.
-- (b) `fn_nota_completar_desfazer`: desfaz a junção, volta cada campo ao antes, CANCELA (nunca apaga) os lançamentos criados e os documentos
--     anexados pela operação.
-- (c) O desfazer RECUSA se alguém mexeu depois num campo que a operação mudou (diz o lançamento e o campo); nunca passa por cima.
-- (d) Competência que muda sem safra pedida: a safra é a da competência (`_fn_safra_da_competencia`, a regra única do P138). Conciliada e
--     realizada recebem a classificação (P93); conta, valor e vencimento delas NUNCA mudam (cadeado; o banco recusa). Classificação dividida:
--     subcentro e safra só pelo "Dividir". Mês fechado (de onde sai ou para onde vai): recusa.
-- `app.via` = 'nota-completar' (a Auditoria diz a rotina junto do autor). SECURITY DEFINER com `tenant_ok`; REVOKE de PUBLIC/anon.
SET LOCAL lock_timeout = '2s';

CREATE TABLE IF NOT EXISTS public.nota_completar_operacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL,
  chave text,
  financiamento_id uuid,
  criados uuid[] NOT NULL DEFAULT '{}',
  documentos uuid[] NOT NULL DEFAULT '{}',
  criado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
  criado_por uuid DEFAULT auth.uid(),
  desfeita_em timestamptz,
  desfeita_por uuid
);
CREATE TABLE IF NOT EXISTS public.nota_completar_backup (
  id bigserial PRIMARY KEY,
  operacao uuid NOT NULL REFERENCES public.nota_completar_operacao (id),
  lancamento_id uuid NOT NULL,
  antes jsonb NOT NULL,
  depois jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_nota_completar_backup_op ON public.nota_completar_backup (operacao);
ALTER TABLE public.nota_completar_operacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nota_completar_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nota_completar_operacao FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.nota_completar_backup FROM PUBLIC, anon, authenticated;

/* os campos que a operação pode mudar, como estão na linha (o antes / o depois) */
CREATE OR REPLACE FUNCTION public._fn_nota_completar_campos(l public.financeiro_lancamentos_v2)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT jsonb_build_object('descricao', l.descricao, 'favorecido_id', l.favorecido_id, 'fazenda_id', l.fazenda_id,
    'conta_bancaria_id', l.conta_bancaria_id, 'plano_conta_id', l.plano_conta_id, 'numero_documento', l.numero_documento,
    'data_competencia', l.data_competencia, 'safra_id', l.safra_id, 'valor', l.valor, 'data_vencimento', l.data_vencimento)
$$;
REVOKE ALL ON FUNCTION public._fn_nota_completar_campos(public.financeiro_lancamentos_v2) FROM PUBLIC, anon, authenticated;

/* o nome do valor de um campo, para a prévia ("Faz. Sto. Expedito", "Custo com Arrendamento de Pasto", "26/27-Pec"…) */
CREATE OR REPLACE FUNCTION public._fn_nota_completar_nome(p_campo text, p_valor text)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE p_campo
    WHEN 'favorecido_id' THEN (SELECT nome FROM financeiro_fornecedores WHERE id::text = p_valor)
    WHEN 'fazenda_id' THEN (SELECT nome FROM fazendas WHERE id::text = p_valor)
    WHEN 'conta_bancaria_id' THEN (SELECT coalesce(nome_exibicao, nome_conta) FROM financeiro_contas_bancarias WHERE id::text = p_valor)
    WHEN 'plano_conta_id' THEN (SELECT subcentro FROM financeiro_plano_contas WHERE id::text = p_valor)
    WHEN 'safra_id' THEN (SELECT codigo FROM financeiro_safras WHERE id::text = p_valor)
    ELSE p_valor END
$$;
REVOKE ALL ON FUNCTION public._fn_nota_completar_nome(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_nota_completar(p_cliente uuid, p_lancamentos jsonb, p_juntar boolean DEFAULT false,
                                                    p_chave text DEFAULT NULL, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
DECLARE
  c_campos constant text[] := ARRAY['descricao','favorecido_id','fazenda_id','conta_bancaria_id','plano_conta_id','numero_documento',
                                    'data_competencia','safra_id','valor','data_vencimento'];
  c_travados_pagos constant text[] := ARRAY['conta_bancaria_id','valor','data_vencimento'];
  c_classif constant text[] := ARRAY['plano_conta_id','safra_id'];
  e jsonb; l public.financeiro_lancamentos_v2; v_hoje jsonb; v_fica jsonb; k text; v_pago boolean; v_conc boolean;
  v_escopo text; v_safra uuid; v_campos jsonb; v_linhas jsonb := '[]'; v_recusas jsonb := '[]'; v_efeito jsonb;
  v_mudancas jsonb := '[]'; v_op uuid; v_ret jsonb; v_jr jsonb; v_ids uuid[] := '{}'; v_fin uuid; m text;
BEGIN
  IF p_cliente IS NULL OR NOT coalesce(public.tenant_ok(p_cliente), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem acesso a este registro';
  END IF;
  IF jsonb_typeof(p_lancamentos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lancamentos) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Nenhum lançamento para completar. Nada foi gravado.';
  END IF;

  FOR e IN SELECT x FROM jsonb_array_elements(p_lancamentos) x LOOP
    SELECT * INTO l FROM public.financeiro_lancamentos_v2 WHERE id = (e->>'id')::uuid AND cliente_id = p_cliente FOR UPDATE;
    IF NOT FOUND OR l.cancelado THEN
      v_recusas := v_recusas || jsonb_build_object('id', e->>'id', 'frase', 'Um dos lançamentos não está neste cliente ou foi cancelado.');
      CONTINUE;
    END IF;
    v_ids := v_ids || l.id;
    v_conc := l.status_transacao = 'conciliado' OR public._fin_lancamento_casado_com_extrato(l.id);
    v_pago := v_conc OR l.status_transacao = 'realizado' OR l.data_pagamento IS NOT NULL;
    v_hoje := public._fn_nota_completar_campos(l);
    v_fica := v_hoje;
    FOR k IN SELECT jsonb_object_keys(e - 'id') LOOP
      IF NOT (k = ANY (c_campos)) THEN
        v_recusas := v_recusas || jsonb_build_object('id', l.id, 'frase', format('O campo «%s» não muda por aqui.', k));
      ELSIF v_pago AND k = ANY (c_travados_pagos) AND (e->k) IS DISTINCT FROM (v_hoje->k)
            AND NOT (k = 'valor' AND (e->>k)::numeric = (v_hoje->>k)::numeric) THEN
        v_recusas := v_recusas || jsonb_build_object('id', l.id, 'frase',
          format('«%s» está %s: conta, valor e vencimento não mudam.', coalesce(l.descricao, 'lançamento'), CASE WHEN v_conc THEN 'conciliado' ELSE 'pago' END));
      ELSIF l.classificacao_dividida AND k = ANY (c_classif) AND (e->k) IS DISTINCT FROM (v_hoje->k) THEN
        v_recusas := v_recusas || jsonb_build_object('id', l.id, 'frase',
          format('«%s» tem a classificação dividida: subcentro e safra só por "Dividir" ou "Voltar para 1 conta".', coalesce(l.descricao, 'lançamento')));
      ELSE
        v_fica := jsonb_set(v_fica, ARRAY[k], e->k);
      END IF;
    END LOOP;
    /* (d) competência nova sem safra pedida: a safra da competência (a regra única do banco), se houver */
    IF (v_fica->>'data_competencia') IS DISTINCT FROM (v_hoje->>'data_competencia') AND NOT (e ? 'safra_id') AND NOT l.classificacao_dividida THEN
      SELECT pc.escopo_negocio INTO v_escopo FROM public.financeiro_plano_contas pc WHERE pc.id = (v_fica->>'plano_conta_id')::uuid;
      v_safra := public._fn_safra_da_competencia(p_cliente, v_escopo, (v_fica->>'data_competencia')::date);
      IF v_safra IS NOT NULL THEN v_fica := jsonb_set(v_fica, '{safra_id}', to_jsonb(v_safra)); END IF;
    END IF;
    /* mês fechado: de onde sai ou para onde vai (fazenda e competência de antes e de depois) */
    IF v_fica IS DISTINCT FROM v_hoje THEN
      SELECT x.mes INTO m FROM (VALUES ((v_hoje->>'fazenda_id')::uuid, to_char((v_hoje->>'data_competencia')::date, 'YYYY-MM')),
                                       ((v_fica->>'fazenda_id')::uuid, to_char((v_fica->>'data_competencia')::date, 'YYYY-MM'))) x(faz, mes)
       WHERE public._fn_lr_mes_fechado(p_cliente, x.faz, x.mes) LIMIT 1;
      IF m IS NOT NULL THEN
        v_recusas := v_recusas || jsonb_build_object('id', l.id, 'frase', format('O mês %s/%s está fechado: reabra antes de mudar «%s».',
          right(m, 2), left(m, 4), coalesce(l.descricao, 'o lançamento')));
      END IF;
    END IF;
    /* a linha da prévia: por campo, hoje → fica (com o nome), o que muda e o cadeado */
    SELECT jsonb_object_agg(c, jsonb_build_object(
             'hoje', v_hoje->c, 'fica', v_fica->c, 'muda', (v_hoje->c) IS DISTINCT FROM (v_fica->c),
             'hoje_nome', public._fn_nota_completar_nome(c, v_hoje->>c), 'fica_nome', public._fn_nota_completar_nome(c, v_fica->>c),
             'cadeado', CASE WHEN v_pago AND c = ANY (c_travados_pagos) THEN CASE WHEN v_conc THEN 'conciliada: conta, valor e vencimento não mudam'
                                                                                ELSE 'paga: conta, valor e vencimento não mudam' END
                             WHEN l.classificacao_dividida AND c = ANY (c_classif) THEN 'classificação dividida: só por "Dividir"' END))
      INTO v_campos FROM unnest(c_campos) c;
    v_linhas := v_linhas || jsonb_build_object('id', l.id, 'descricao', l.descricao, 'situacao',
      CASE WHEN v_conc THEN 'conciliada' WHEN v_pago THEN 'realizada' ELSE 'programada' END,
      'parcela_n', (SELECT fp.numero_parcela FROM public.financiamento_parcelas fp WHERE fp.lancamento_id = l.id ORDER BY 1 LIMIT 1),
      'campos', v_campos);
    IF v_fica IS DISTINCT FROM v_hoje THEN
      v_mudancas := v_mudancas || jsonb_build_object('id', l.id, 'hoje', v_hoje, 'fica', v_fica);
    END IF;
  END LOOP;

  /* o efeito no DRE: o valor que sai de (mês, subcentro) de hoje e entra no de depois — só onde a classificação ou o mês mudam */
  SELECT coalesce(jsonb_agg(jsonb_build_object('mes_de', x.mes_de, 'subcentro_de', x.sub_de, 'mes_para', x.mes_para, 'subcentro_para', x.sub_para,
           'valor', x.valor, 'lancamentos', x.n) ORDER BY x.mes_de, x.sub_de), '[]')
    INTO v_efeito
    FROM (SELECT to_char((mu->'hoje'->>'data_competencia')::date, 'YYYY-MM') mes_de,
                 public._fn_nota_completar_nome('plano_conta_id', mu->'hoje'->>'plano_conta_id') sub_de,
                 to_char((mu->'fica'->>'data_competencia')::date, 'YYYY-MM') mes_para,
                 public._fn_nota_completar_nome('plano_conta_id', mu->'fica'->>'plano_conta_id') sub_para,
                 sum((mu->'fica'->>'valor')::numeric) valor, count(*) n
            FROM jsonb_array_elements(v_mudancas) mu
           WHERE (mu->'hoje'->>'plano_conta_id') IS DISTINCT FROM (mu->'fica'->>'plano_conta_id')
              OR to_char((mu->'hoje'->>'data_competencia')::date, 'YYYY-MM') IS DISTINCT FROM to_char((mu->'fica'->>'data_competencia')::date, 'YYYY-MM')
           GROUP BY 1, 2, 3, 4) x;

  IF jsonb_array_length(v_recusas) > 0 THEN
    IF NOT coalesce(p_simular, true) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = (v_recusas->0->>'frase') || ' Nada foi gravado.';
    END IF;
    RETURN jsonb_build_object('ok', false, 'simulado', true, 'recusas', v_recusas, 'linhas', v_linhas, 'efeito_dre', v_efeito);
  END IF;

  BEGIN
    PERFORM set_config('app.via', 'nota-completar', true);
    INSERT INTO public.nota_completar_operacao (cliente_id, chave) VALUES (p_cliente, nullif(btrim(coalesce(p_chave, '')), '')) RETURNING id INTO v_op;
    /* padroniza PRIMEIRO (a junção exige o mesmo fornecedor/fazenda/classificação), guardando o antes e o depois de verdade (o que os
       gatilhos deixaram: a caixa da descrição, por exemplo) */
    FOR e IN SELECT x FROM jsonb_array_elements(v_mudancas) x LOOP
      UPDATE public.financeiro_lancamentos_v2 SET
          descricao = e->'fica'->>'descricao', favorecido_id = (e->'fica'->>'favorecido_id')::uuid, fazenda_id = (e->'fica'->>'fazenda_id')::uuid,
          conta_bancaria_id = (e->'fica'->>'conta_bancaria_id')::uuid, plano_conta_id = (e->'fica'->>'plano_conta_id')::uuid,
          numero_documento = e->'fica'->>'numero_documento', data_competencia = (e->'fica'->>'data_competencia')::date,
          safra_id = (e->'fica'->>'safra_id')::uuid, valor = (e->'fica'->>'valor')::numeric, data_vencimento = (e->'fica'->>'data_vencimento')::date
        WHERE id = (e->>'id')::uuid RETURNING * INTO l;
      INSERT INTO public.nota_completar_backup (operacao, lancamento_id, antes, depois)
      VALUES (v_op, l.id, e->'hoje', public._fn_nota_completar_campos(l));
    END LOOP;
    IF coalesce(p_juntar, false) THEN
      v_jr := public.fn_parcelamento_juntar_lancamentos(p_cliente, v_ids, NULL, false);
      v_fin := (v_jr->>'financiamento_id')::uuid;
      UPDATE public.nota_completar_operacao SET financiamento_id = v_fin WHERE id = v_op;
    END IF;
    v_ret := jsonb_build_object('ok', true, 'simulado', coalesce(p_simular, true), 'operacao', v_op, 'financiamento_id', v_fin,
      'mudaram', jsonb_array_length(v_mudancas), 'linhas', v_linhas, 'efeito_dre', v_efeito);
    IF coalesce(p_simular, true) THEN RAISE EXCEPTION USING ERRCODE = 'NCSIM', MESSAGE = v_ret::text; END IF;
  EXCEPTION
    WHEN SQLSTATE 'NCSIM' THEN
      RETURN (SQLERRM::jsonb) || jsonb_build_object('operacao', NULL, 'financiamento_id', NULL);
    WHEN SQLSTATE '22023' THEN
      /* a recusa da junção (P96a) na prévia volta como recusa; ao gravar, sobe */
      IF NOT coalesce(p_simular, true) THEN RAISE; END IF;
      RETURN jsonb_build_object('ok', false, 'simulado', true, 'recusas', jsonb_build_array(jsonb_build_object('frase',
        regexp_replace(SQLERRM, '\s*Nada foi gravado\.\s*$', ''))), 'linhas', v_linhas, 'efeito_dre', v_efeito);
  END;
  RETURN v_ret;
END $f$;
REVOKE ALL ON FUNCTION public.fn_nota_completar(uuid, jsonb, boolean, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_nota_completar(uuid, jsonb, boolean, text, boolean) TO authenticated;

/* (a) o que nasceu DEPOIS da transação (as parcelas que faltam; os documentos da nota): fica na operação para o desfazer */
CREATE OR REPLACE FUNCTION public.fn_nota_completar_registrar(p_operacao uuid, p_criados uuid[], p_documentos uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
DECLARE v_cli uuid;
BEGIN
  SELECT cliente_id INTO v_cli FROM public.nota_completar_operacao WHERE id = p_operacao AND desfeita_em IS NULL;
  IF v_cli IS NULL OR NOT coalesce(public.tenant_ok(v_cli), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem acesso a este registro';
  END IF;
  UPDATE public.nota_completar_operacao
     SET criados = (SELECT coalesce(array_agg(DISTINCT x), '{}') FROM unnest(criados || coalesce(p_criados, '{}')) x),
         documentos = (SELECT coalesce(array_agg(DISTINCT x), '{}') FROM unnest(documentos || coalesce(p_documentos, '{}')) x)
   WHERE id = p_operacao;
END $f$;
REVOKE ALL ON FUNCTION public.fn_nota_completar_registrar(uuid, uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_nota_completar_registrar(uuid, uuid[], uuid[]) TO authenticated;

/* (b)(c) DESFAZER: tudo ou nada. Recusa se alguém mexeu depois num campo que a operação mudou. */
CREATE OR REPLACE FUNCTION public.fn_nota_completar_desfazer(p_operacao uuid, p_simular boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $f$
DECLARE o public.nota_completar_operacao; v_mexidos jsonb; v_ret jsonb; v_n int; v_c int := 0; v_d int := 0;
BEGIN
  SELECT * INTO o FROM public.nota_completar_operacao WHERE id = p_operacao FOR UPDATE;
  IF NOT FOUND OR NOT coalesce(public.tenant_ok(o.cliente_id), false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'sem acesso a este registro';
  END IF;
  IF o.desfeita_em IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Esta operação já foi desfeita. Nada foi gravado.';
  END IF;
  /* (c) o que alguém mexeu depois: o lançamento e os campos */
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'descricao', l.descricao, 'campos',
           (SELECT jsonb_agg(c) FROM jsonb_object_keys(b.depois) c
             WHERE (b.depois->c) IS DISTINCT FROM (public._fn_nota_completar_campos(l)->c)))), '[]')
    INTO v_mexidos
    FROM public.nota_completar_backup b JOIN public.financeiro_lancamentos_v2 l ON l.id = b.lancamento_id
   WHERE b.operacao = p_operacao AND public._fn_nota_completar_campos(l) IS DISTINCT FROM b.depois;
  IF jsonb_array_length(v_mexidos) > 0 THEN
    IF NOT coalesce(p_simular, true) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = format('«%s» foi mudado depois (%s): o desfazer não passa por cima. Nada foi gravado.',
        coalesce(v_mexidos->0->>'descricao', 'um lançamento'), (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v_mexidos->0->'campos') x));
    END IF;
    RETURN jsonb_build_object('ok', false, 'simulado', true, 'mexidos_depois', v_mexidos);
  END IF;
  BEGIN
    PERFORM set_config('app.via', 'nota-completar-desfazer', true);
    IF o.financiamento_id IS NOT NULL THEN PERFORM public.fn_parcelamento_desfazer_juncao(o.financiamento_id, false); END IF;
    UPDATE public.financeiro_lancamentos_v2 l SET
        descricao = b.antes->>'descricao', favorecido_id = (b.antes->>'favorecido_id')::uuid, fazenda_id = (b.antes->>'fazenda_id')::uuid,
        conta_bancaria_id = (b.antes->>'conta_bancaria_id')::uuid, plano_conta_id = (b.antes->>'plano_conta_id')::uuid,
        numero_documento = b.antes->>'numero_documento', data_competencia = (b.antes->>'data_competencia')::date,
        safra_id = (b.antes->>'safra_id')::uuid, valor = (b.antes->>'valor')::numeric, data_vencimento = (b.antes->>'data_vencimento')::date
      FROM public.nota_completar_backup b WHERE b.operacao = p_operacao AND l.id = b.lancamento_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    UPDATE public.financeiro_lancamentos_v2 SET cancelado = true, cancelado_em = now(), cancelado_por = auth.uid(),
        cancelado_motivo = 'desfeito: completar com a nota'
      WHERE id = ANY (o.criados) AND NOT cancelado;
    GET DIAGNOSTICS v_c = ROW_COUNT;
    UPDATE public.financeiro_lancamento_documentos SET cancelado = true, cancelado_em = now(), cancelado_por = auth.uid(),
        cancelado_motivo = 'desfeito: completar com a nota'
      WHERE id = ANY (o.documentos) AND cancelado IS NOT TRUE;
    GET DIAGNOSTICS v_d = ROW_COUNT;
    UPDATE public.nota_completar_operacao SET desfeita_em = clock_timestamp(), desfeita_por = auth.uid() WHERE id = p_operacao;
    v_ret := jsonb_build_object('ok', true, 'simulado', coalesce(p_simular, true), 'voltaram', v_n, 'criados_cancelados', v_c,
      'documentos_cancelados', v_d, 'juncao_desfeita', o.financiamento_id IS NOT NULL);
    IF coalesce(p_simular, true) THEN RAISE EXCEPTION USING ERRCODE = 'NCSIM', MESSAGE = v_ret::text; END IF;
  EXCEPTION WHEN SQLSTATE 'NCSIM' THEN
    RETURN SQLERRM::jsonb;
  END;
  RETURN v_ret;
END $f$;
REVOKE ALL ON FUNCTION public.fn_nota_completar_desfazer(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_nota_completar_desfazer(uuid, boolean) TO authenticated;
