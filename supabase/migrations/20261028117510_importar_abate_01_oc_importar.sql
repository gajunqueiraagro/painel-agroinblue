-- IMPORTAR-ABATE-01 · F1 (D6, Gabriel 07/11 08:49): a OC de abate nasce dos documentos do frigorifico, numa chamada so', com previa.
-- GABARITO: a OC 5d255b74 (EXP, lote 6), gravada pelo Code 5 pelas RPCs da tela. A importacao faz o MESMO caminho, na MESMA ordem:
--   oc_salvar_rascunho -> oc_salvar_lotes -> oc_salvar_abate -> oc_confirmar -> oc_registrar_movimentacao (por lote) -> oc_encerrar_entrega
--   -> oc_lancar_pelo_modal (o recebimento da NPR) -> oc_documento_registrar (cada documento, ligado a todos os lotes).
--   Nada de INSERT direto: as regras, travas e recusas sao as das RPCs da tela (mes fechado, versao, tenant, chave repetida).
-- D1 (a mesma nota ja' esta' no sistema): pela chave da NF do frigorifico (`_oc_documento_nota_repetida`). Achou -> NAO CRIA; devolve
--   hoje x pacote (`nada_muda` e as diferencas), qualquer que seja o p_simular.
-- Previa: `p_simular` (padrao TRUE) faz tudo num sub-bloco que se desfaz (ZG001) e devolve o mesmo resumo. Nada fica.
-- Conferencia antes de criar: soma dos liquidos dos lotes = o recebimento (meio centavo); com o bruto da NF, liquido + SENAR + Funrural = bruto.
-- Trilha: evento 'importar_abate' na OC (o desfazer da 117520 so' aceita OC que nasceu daqui).
-- O pacote (montado pela tela, `pacoteDoAbate.ts`):
--   { fazenda_id, contraparte_id, data_abate, categoria, peso_vivo_medio_kg, observacoes, chave_nf,
--     lotes: [{ordem, cab, peso_carcaca_kg, preco_arroba, valor_liquido, senar, funrural, observacao}],
--     recebimento: {valor, vencimento, documento, observacao},
--     documentos: [payload do oc_documento_registrar, sem `lotes`] }
SET LOCAL lock_timeout = '2s';

-- o resumo que se compara (o mesmo formato da OC gravada e do pacote)
CREATE OR REPLACE FUNCTION public._oc_importar_resumo_da_oc(p_operacao_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'data', o.data_operacao,
    'lotes', coalesce((SELECT jsonb_agg(jsonb_build_object('ordem', l.ordem, 'cab', l.qtd_negociada, 'categoria', l.categoria_negociada,
                         'peso_vivo_medio_kg', round(l.peso_medio_negociado_kg, 2), 'peso_carcaca_kg', round(a.peso_carcaca_kg, 2),
                         'preco_arroba', round(a.preco_arroba, 4), 'valor_liquido', round(a.valor_liquido, 2),
                         'senar', round(coalesce(a.senar_valor, 0), 2), 'funrural', round(coalesce(a.funrural_valor, 0), 2)) ORDER BY l.ordem)
                         FROM public.zoo_operacao_lotes l
                         LEFT JOIN public.zoo_operacao_abate a ON a.operacao_lote_id = l.id AND a.cenario = 'realizado'
                        WHERE l.operacao_id = o.id), '[]'::jsonb),
    'recebimento', (SELECT jsonb_build_object('valor', round(sum(pt.valor), 2), 'vencimento', min(pt.data_vencimento))
                      FROM public.zoo_operacao_partes pt
                     WHERE pt.operacao_id = o.id AND NOT pt.cancelada AND pt.componente = 'recebimento'),
    'documentos', coalesce((SELECT jsonb_agg(d.especie || ':' || coalesce(d.numero, '') ORDER BY d.especie, d.numero)
                              FROM public.zoo_operacao_documentos d WHERE d.operacao_id = o.id AND NOT d.cancelado), '[]'::jsonb))
    FROM public.zoo_operacoes_comerciais o WHERE o.id = p_operacao_id
$function$;

CREATE OR REPLACE FUNCTION public._oc_importar_resumo_do_pacote(p jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT jsonb_build_object(
    'data', (p->>'data_abate')::date,
    'lotes', coalesce((SELECT jsonb_agg(jsonb_build_object('ordem', (l->>'ordem')::int, 'cab', (l->>'cab')::int, 'categoria', p->>'categoria',
                         'peso_vivo_medio_kg', round((p->>'peso_vivo_medio_kg')::numeric, 2), 'peso_carcaca_kg', round((l->>'peso_carcaca_kg')::numeric, 2),
                         'preco_arroba', round((l->>'preco_arroba')::numeric, 4), 'valor_liquido', round((l->>'valor_liquido')::numeric, 2),
                         'senar', round(coalesce((l->>'senar')::numeric, 0), 2), 'funrural', round(coalesce((l->>'funrural')::numeric, 0), 2))
                         ORDER BY (l->>'ordem')::int)
                         FROM jsonb_array_elements(p->'lotes') l), '[]'::jsonb),
    'recebimento', jsonb_build_object('valor', round((p->'recebimento'->>'valor')::numeric, 2), 'vencimento', (p->'recebimento'->>'vencimento')::date),
    'documentos', coalesce((SELECT jsonb_agg((d->>'especie') || ':' || coalesce(d->>'numero', '') ORDER BY d->>'especie', d->>'numero')
                              FROM jsonb_array_elements(p->'documentos') d), '[]'::jsonb))
$function$;

CREATE OR REPLACE FUNCTION public.oc_importar_abate(p_cliente_id uuid, p_pacote jsonb, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_chave text; v_rep jsonb; v_hoje jsonb; v_pac jsonb; v_dif jsonb := '[]'::jsonb; k text;
  v_op uuid; v_ver int; r jsonb; l jsonb; d jsonb; v_lotes jsonb := '[]'::jsonb; v_ids jsonb := '[]'::jsonb;
  v_abate jsonb := '[]'::jsonb; v_pv numeric; v_cat text; v_data date;
  v_soma_liq numeric; v_soma_ret numeric; v_bruto numeric; v_res jsonb; v_det text; v_ndoc int := 0; v_lote uuid;
BEGIN
  IF p_cliente_id IS NULL OR NOT public.tenant_ok(p_cliente_id) THEN
    RAISE EXCEPTION 'Importar o abate: sem acesso a este cliente' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_pacote->'lotes') IS DISTINCT FROM 'array' OR jsonb_array_length(p_pacote->'lotes') = 0 THEN
    RAISE EXCEPTION 'Importar o abate: o acerto nao trouxe nenhuma faixa (lote)' USING ERRCODE = 'P0001'; END IF;
  v_data := (p_pacote->>'data_abate')::date;
  v_pv := (p_pacote->>'peso_vivo_medio_kg')::numeric;
  v_cat := p_pacote->>'categoria';
  IF v_data IS NULL OR v_cat IS NULL OR coalesce(v_pv, 0) <= 0 THEN
    RAISE EXCEPTION 'Importar o abate: falta a data do abate, a categoria ou o peso vivo medio' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fazendas f WHERE f.id = (p_pacote->>'fazenda_id')::uuid AND f.cliente_id = p_cliente_id) THEN
    RAISE EXCEPTION 'Importar o abate: a fazenda nao e'' deste cliente' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.financeiro_fornecedores c WHERE c.id = (p_pacote->>'contraparte_id')::uuid
                    AND c.cliente_id = p_cliente_id AND c.ativo) THEN
    RAISE EXCEPTION 'Importar o abate: o frigorifico nao esta'' no cadastro (ativo) deste cliente' USING ERRCODE = 'P0001'; END IF;
  IF coalesce((p_pacote->'recebimento'->>'valor')::numeric, 0) <= 0 OR (p_pacote->'recebimento'->>'vencimento') IS NULL THEN
    RAISE EXCEPTION 'Importar o abate: falta o valor ou o vencimento do recebimento (NPR)' USING ERRCODE = 'P0001'; END IF;

  -- a conta fecha antes de criar
  SELECT sum((x->>'valor_liquido')::numeric), sum(coalesce((x->>'senar')::numeric, 0) + coalesce((x->>'funrural')::numeric, 0))
    INTO v_soma_liq, v_soma_ret FROM jsonb_array_elements(p_pacote->'lotes') x;
  IF abs(v_soma_liq - (p_pacote->'recebimento'->>'valor')::numeric) > 0.005 THEN
    RAISE EXCEPTION 'Importar o abate: a soma dos liquidos dos lotes (%) nao e'' o recebimento (%)', v_soma_liq, p_pacote->'recebimento'->>'valor'
      USING ERRCODE = 'P0001'; END IF;
  SELECT (c->>'valor')::numeric INTO v_bruto
    FROM jsonb_array_elements(coalesce(p_pacote->'documentos', '[]')) dd, jsonb_array_elements(coalesce(dd->'componentes', '[]')) c
   WHERE dd->>'especie' = 'nf_principal' AND c->>'tipo' = 'valor_bruto' LIMIT 1;
  IF v_bruto IS NOT NULL AND abs(v_soma_liq + v_soma_ret - v_bruto) > 0.005 THEN
    RAISE EXCEPTION 'Importar o abate: liquido + retencoes (%) nao e'' o bruto da NF (%)', v_soma_liq + v_soma_ret, v_bruto USING ERRCODE = 'P0001'; END IF;

  -- D1: a mesma NF ja' esta' numa OC viva -> nao cria; devolve hoje x pacote
  v_chave := coalesce(nullif(p_pacote->>'chave_nf', ''),
                      (SELECT dd->>'chave_acesso' FROM jsonb_array_elements(coalesce(p_pacote->'documentos', '[]')) dd
                        WHERE dd->>'especie' = 'nf_principal' LIMIT 1));
  v_pac := public._oc_importar_resumo_do_pacote(p_pacote);
  IF v_chave IS NOT NULL THEN
    v_rep := public._oc_documento_nota_repetida(p_cliente_id, v_chave);
    IF v_rep IS NOT NULL THEN
      v_hoje := public._oc_importar_resumo_da_oc((v_rep->>'operacao_id')::uuid);
      FOR k IN SELECT jsonb_object_keys(v_pac) LOOP
        IF k = 'lotes' THEN
          v_dif := v_dif || coalesce((SELECT jsonb_agg(jsonb_build_object('campo', 'lote ' || coalesce(h->>'ordem', n->>'ordem') || ' · ' || c.key,
                                         'hoje', h->c.key, 'pacote', n->c.key))
                                        FROM jsonb_array_elements(v_hoje->'lotes') WITH ORDINALITY h0(h, i)
                                        FULL JOIN jsonb_array_elements(v_pac->'lotes') WITH ORDINALITY n0(n, j) ON (h->>'ordem') = (n->>'ordem')
                                        CROSS JOIN LATERAL jsonb_each(coalesce(n, h)) c
                                       WHERE h IS NULL OR n IS NULL OR h->c.key IS DISTINCT FROM n->c.key), '[]'::jsonb);
        ELSIF v_hoje->k IS DISTINCT FROM v_pac->k THEN
          v_dif := v_dif || jsonb_build_object('campo', k, 'hoje', v_hoje->k, 'pacote', v_pac->k);
        END IF;
      END LOOP;
      RETURN jsonb_build_object('ok', true, 'ja_existe', true, 'simulado', true, 'operacao_id', v_rep->>'operacao_id', 'rotulo', v_rep->>'rotulo',
               'nada_muda', jsonb_array_length(v_dif) = 0, 'diferencas', v_dif, 'hoje', v_hoje, 'pacote', v_pac);
    END IF;
  END IF;

  BEGIN
    r := public.oc_salvar_rascunho(NULL, p_cliente_id, NULL, jsonb_build_object(
           'tipo_operacao', 'abate', 'data_operacao', v_data, 'cenario', 'realizado', 'fazenda_id', p_pacote->>'fazenda_id',
           'contraparte_id', p_pacote->>'contraparte_id', 'numero_documento', NULL, 'observacoes', p_pacote->>'observacoes',
           'movimentacoes', '[]'::jsonb, 'partes', '[]'::jsonb));
    v_op := (r->>'operacao_id')::uuid;
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id = v_op;

    FOR l IN SELECT x FROM jsonb_array_elements(p_pacote->'lotes') x ORDER BY (x->>'ordem')::int LOOP
      v_lotes := v_lotes || jsonb_build_object('ordem', (l->>'ordem')::int, 'categoria_negociada', v_cat, 'qtd_negociada', (l->>'cab')::int,
                   'peso_medio_negociado_kg', v_pv, 'criterio_valor', 'kg', 'valor_informado', NULL, 'observacao', l->>'observacao');
    END LOOP;
    r := public.oc_salvar_lotes(v_op, p_cliente_id, v_ver, v_lotes);
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id = v_op;

    FOR l IN SELECT x FROM jsonb_array_elements(p_pacote->'lotes') x ORDER BY (x->>'ordem')::int LOOP
      SELECT id INTO v_lote FROM public.zoo_operacao_lotes WHERE operacao_id = v_op AND ordem = (l->>'ordem')::int;
      v_ids := v_ids || to_jsonb(v_lote);
      v_abate := v_abate || (jsonb_build_object('operacao_lote_id', v_lote, 'peso_carcaca_kg', (l->>'peso_carcaca_kg')::numeric,
                   'peso_carcaca_fonte', 'total',
                   'rendimento_carcaca_pct', round((l->>'peso_carcaca_kg')::numeric / ((l->>'cab')::int * v_pv) * 100, 4),
                   'peso_total_kg_nf', NULL, 'preco_arroba', (l->>'preco_arroba')::numeric, 'preco_fonte', 'arroba',
                   'valor_liquido', (l->>'valor_liquido')::numeric)
                 || CASE WHEN coalesce((l->>'senar')::numeric, 0) > 0
                         THEN jsonb_build_object('senar_valor', (l->>'senar')::numeric, 'senar_fonte', 'reais') ELSE '{}'::jsonb END
                 || CASE WHEN coalesce((l->>'funrural')::numeric, 0) > 0
                         THEN jsonb_build_object('funrural_valor', (l->>'funrural')::numeric, 'funrural_fonte', 'reais') ELSE '{}'::jsonb END);
    END LOOP;
    r := public.oc_salvar_abate(v_op, p_cliente_id, v_ver, 'realizado', v_abate);
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id = v_op;
    r := public.oc_confirmar(v_op, p_cliente_id, v_ver);

    FOR l IN SELECT x FROM jsonb_array_elements(p_pacote->'lotes') x ORDER BY (x->>'ordem')::int LOOP
      SELECT id INTO v_lote FROM public.zoo_operacao_lotes WHERE operacao_id = v_op AND ordem = (l->>'ordem')::int;
      r := public.oc_registrar_movimentacao(v_op, p_cliente_id, v_lote, v_data, v_cat, (l->>'cab')::int, v_pv, NULL, NULL);
    END LOOP;
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id = v_op;
    r := public.oc_encerrar_entrega(v_op, p_cliente_id, v_ver, 'encerramento pela importacao do abate');
    SELECT versao INTO v_ver FROM public.zoo_operacoes_comerciais WHERE id = v_op;

    r := public.oc_lancar_pelo_modal(v_op, v_ver, 'principal', NULL, NULL, NULL,
           jsonb_build_array(jsonb_build_object('valor', (p_pacote->'recebimento'->>'valor')::numeric,
                                                'vencimento', p_pacote->'recebimento'->>'vencimento', 'conta_id', NULL)),
           NULL, NULL, p_pacote->'recebimento'->>'documento', p_pacote->'recebimento'->>'observacao', NULL, false);

    FOR d IN SELECT x FROM jsonb_array_elements(coalesce(p_pacote->'documentos', '[]')) x LOOP
      r := public.oc_documento_registrar(v_op, p_cliente_id, (d - 'lotes') || jsonb_build_object('lotes', v_ids));
      v_ndoc := v_ndoc + 1;
    END LOOP;

    INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, dados_novos, usuario_id, origem)
    VALUES (p_cliente_id, v_op, 'importar_abate',
            jsonb_build_object('frente', 'IMPORTAR-ABATE-01', 'chave_nf', v_chave, 'documentos', v_ndoc, 'lotes', jsonb_array_length(v_ids)),
            v_pac, auth.uid(), 'oc_importar_abate');

    v_res := jsonb_build_object('ok', true, 'ja_existe', false, 'simulado', p_simular IS NOT FALSE, 'operacao_id', v_op,
               'resumo', public._oc_importar_resumo_da_oc(v_op), 'pacote', v_pac,
               'status_comercial', (SELECT status_comercial FROM public.zoo_operacoes_comerciais WHERE id = v_op));
    IF p_simular IS NOT FALSE THEN
      RAISE EXCEPTION USING ERRCODE = 'ZG001', MESSAGE = 'previa', DETAIL = v_res::text;
    END IF;
  EXCEPTION WHEN SQLSTATE 'ZG001' THEN
    GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
    RETURN v_det::jsonb - 'operacao_id';
  END;
  RETURN v_res;
END
$function$;

REVOKE ALL ON FUNCTION public._oc_importar_resumo_da_oc(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._oc_importar_resumo_do_pacote(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.oc_importar_abate(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_importar_abate(uuid, jsonb, boolean) TO authenticated;
