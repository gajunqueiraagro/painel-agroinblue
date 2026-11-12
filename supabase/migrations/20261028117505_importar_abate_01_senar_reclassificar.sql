-- IMPORTAR-ABATE-01 · D5, 2a parte (GO do Gabriel 07/11 17:3x, item 2 e 3): o SENAR JA' GRAVADO como "funrural" passa para o componente proprio.
-- Depende da 20261028117500 (senar_valor/senar_fonte, o componente 'senar', o sincronizador com a deducao do SENAR).
-- Por que uma funcao propria: as OCs sao FECHADAS e o `oc_salvar_abate` recusa OC fechada. A conta do lote NAO muda:
--   retencao do lote = funrural + senar e' a mesma antes e depois; o liquido e o bruto da entrega ficam; muda so' o componente da deducao.
-- fn_oc_abate_reclassificar_senar(p_operacao_id, p_senar_por_lote [{ordem, senar}], p_motivo, p_simular default true):
--   - por lote listado: senar = o informado; funrural = (funrural + senar de hoje) - senar (zero vira nulo, sem fonte);
--   - conta corrente: `oc_sincronizar_entregas` refaz as deducoes (a de Funrural diminui ou sai cancelada com motivo; a de SENAR nasce,
--     mesma conta, mesma data); recusa se a sincronizacao mexer em qualquer coisa que nao seja deducao, ou se a soma das entregas ou das
--     deducoes vivas mudar um centavo;
--   - trilha em `zoo_operacao_eventos` (acao 'reclassificar_senar', antes x depois por lote e o que a sincronizacao fez);
--   - p_simular: faz tudo num sub-bloco que se desfaz (ZS001) e devolve o mesmo relatorio. Nada fica.
-- fn_oc_abate_reclassificar_senar_desfazer(p_operacao_id, p_motivo, p_simular default true): le^ a ultima reclassificacao viva da OC e
--   devolve cada lote ao SENAR de antes (o mesmo caminho; o evento novo leva 'desfaz' = o id do desfeito; a trilha e' imutavel).
-- Interna: sem EXECUTE para PUBLIC/anon/authenticated (roda so' pelo canal do arquiteto, com as claims do admin; o sincronizador exige usuario).
-- Item 3: o `senar_proape` ("SENAR/PROAPE", 0 partes) fica INATIVO no catalogo (nunca apagado); volta com ativo = true.
SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.fn_oc_abate_reclassificar_senar(p_operacao_id uuid, p_senar_por_lote jsonb, p_motivo text,
                                                                  p_simular boolean DEFAULT true, p_desfaz uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_op public.zoo_operacoes_comerciais;
  v_item jsonb; r record;
  v_senar numeric; v_ret numeric; v_fun numeric;
  v_lotes jsonb := '[]'::jsonb;
  v_sync jsonb := NULL;
  v_ent_a numeric; v_ded_a numeric; v_ent_d numeric; v_ded_d numeric;
  v_deds_a jsonb; v_deds_d jsonb;
  v_res jsonb; v_det text;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin_agroinblue(v_actor) THEN
    RAISE EXCEPTION 'Reclassificar o SENAR: so'' o admin AgroinBlue' USING ERRCODE = '42501'; END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 10 THEN
    RAISE EXCEPTION 'Reclassificar o SENAR: informe o motivo' USING ERRCODE = 'P0001'; END IF;
  IF jsonb_typeof(p_senar_por_lote) IS DISTINCT FROM 'array' OR jsonb_array_length(p_senar_por_lote) = 0 THEN
    RAISE EXCEPTION 'Reclassificar o SENAR: informe o SENAR de cada lote ([{ordem, senar}])' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operacao % nao encontrada', p_operacao_id USING ERRCODE = 'P0002'; END IF;
  IF v_op.tipo_operacao <> 'abate' OR v_op.rascunho OR v_op.status_comercial = 'cancelada' THEN
    RAISE EXCEPTION 'Reclassificar o SENAR: so'' abate vivo (fora de rascunho)' USING ERRCODE = 'P0001'; END IF;

  BEGIN
    SELECT coalesce(sum(valor) FILTER (WHERE componente = 'entrega'), 0), coalesce(sum(valor) FILTER (WHERE natureza = 'deducao'), 0),
           coalesce(jsonb_agg(jsonb_build_object('componente', componente, 'valor', valor, 'data', data_vencimento) ORDER BY lote_id, componente, sequencia_parcela)
                    FILTER (WHERE natureza = 'deducao'), '[]'::jsonb)
      INTO v_ent_a, v_ded_a, v_deds_a
      FROM public.zoo_operacao_partes WHERE operacao_id = p_operacao_id AND NOT cancelada;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_senar_por_lote) LOOP
      SELECT a.id, l.ordem, a.funrural_valor, a.funrural_fonte, a.senar_valor, a.senar_fonte INTO r
        FROM public.zoo_operacao_lotes l JOIN public.zoo_operacao_abate a ON a.operacao_lote_id = l.id AND a.cenario = 'realizado'
       WHERE l.operacao_id = p_operacao_id AND l.ordem = (v_item->>'ordem')::int
       FOR UPDATE OF a;
      IF NOT FOUND THEN RAISE EXCEPTION 'Reclassificar o SENAR: o lote de ordem % nao tem abate realizado', v_item->>'ordem' USING ERRCODE = 'P0001'; END IF;
      v_senar := (v_item->>'senar')::numeric;
      IF v_senar IS NULL OR v_senar < 0 THEN
        RAISE EXCEPTION 'Reclassificar o SENAR: SENAR do lote % invalido', r.ordem USING ERRCODE = 'P0001'; END IF;
      IF (coalesce(r.funrural_valor, 0) <> 0 AND coalesce(r.funrural_fonte, 'reais') <> 'reais')
         OR (coalesce(r.senar_valor, 0) <> 0 AND coalesce(r.senar_fonte, 'reais') <> 'reais') THEN
        RAISE EXCEPTION 'Reclassificar o SENAR: o lote % tem retencao em %%; so'' em R$', r.ordem USING ERRCODE = 'P0001'; END IF;
      v_ret := coalesce(r.funrural_valor, 0) + coalesce(r.senar_valor, 0);
      IF v_senar > v_ret THEN
        RAISE EXCEPTION 'Reclassificar o SENAR: o SENAR do lote % (%) passa da retencao gravada (%)', r.ordem, v_senar, v_ret USING ERRCODE = 'P0001'; END IF;
      v_fun := v_ret - v_senar;
      UPDATE public.zoo_operacao_abate
         SET funrural_valor = nullif(v_fun, 0), funrural_fonte = CASE WHEN v_fun > 0 THEN 'reais' END,
             senar_valor = nullif(v_senar, 0), senar_fonte = CASE WHEN v_senar > 0 THEN 'reais' END,
             updated_at = now(), updated_by = v_actor
       WHERE id = r.id;
      v_lotes := v_lotes || jsonb_build_object('ordem', r.ordem,
                   'antes', jsonb_build_object('funrural', coalesce(r.funrural_valor, 0), 'senar', coalesce(r.senar_valor, 0)),
                   'depois', jsonb_build_object('funrural', v_fun, 'senar', v_senar));
    END LOOP;

    IF v_op.modelo_financeiro = 'conta_corrente' THEN
      v_sync := public.oc_sincronizar_entregas(p_operacao_id, v_op.versao, false);
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_sync->'criadas', '[]') || coalesce(v_sync->'atualizadas', '[]')
                                                    || coalesce(v_sync->'canceladas', '[]')) e
                  WHERE e->>'tipo' IS DISTINCT FROM 'deducao') THEN
        RAISE EXCEPTION 'Reclassificar o SENAR: a sincronizacao mexeria em entrega (%): nada feito', v_sync USING ERRCODE = 'P0001'; END IF;
    END IF;

    SELECT coalesce(sum(valor) FILTER (WHERE componente = 'entrega'), 0), coalesce(sum(valor) FILTER (WHERE natureza = 'deducao'), 0),
           coalesce(jsonb_agg(jsonb_build_object('componente', componente, 'valor', valor, 'data', data_vencimento) ORDER BY lote_id, componente, sequencia_parcela)
                    FILTER (WHERE natureza = 'deducao'), '[]'::jsonb)
      INTO v_ent_d, v_ded_d, v_deds_d
      FROM public.zoo_operacao_partes WHERE operacao_id = p_operacao_id AND NOT cancelada;
    IF v_ent_d IS DISTINCT FROM v_ent_a OR v_ded_d IS DISTINCT FROM v_ded_a THEN
      RAISE EXCEPTION 'Reclassificar o SENAR: a soma mudaria (entregas % -> %, deducoes % -> %): nada feito', v_ent_a, v_ent_d, v_ded_a, v_ded_d
        USING ERRCODE = 'P0001'; END IF;

    v_res := jsonb_build_object('ok', true, 'simulado', p_simular IS NOT FALSE, 'operacao_id', p_operacao_id, 'cliente_id', v_op.cliente_id,
               'modelo_financeiro', v_op.modelo_financeiro, 'lotes', v_lotes,
               'deducoes', jsonb_build_object('antes', v_deds_a, 'depois', v_deds_d), 'soma_entregas', v_ent_d, 'soma_deducoes', v_ded_d,
               'sincronizacao', v_sync);
    INSERT INTO public.zoo_operacao_eventos (cliente_id, operacao_id, acao, detalhes, dados_anteriores, dados_novos, usuario_id, origem)
    VALUES (v_op.cliente_id, p_operacao_id, 'reclassificar_senar',
            jsonb_build_object('motivo', btrim(p_motivo), 'sincronizacao', v_sync, 'frente', 'IMPORTAR-ABATE-01')
              || CASE WHEN p_desfaz IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('desfaz', p_desfaz) END,
            jsonb_build_object('lotes', (SELECT jsonb_agg(jsonb_build_object('ordem', x->'ordem') || (x->'antes')) FROM jsonb_array_elements(v_lotes) x),
                               'deducoes', v_deds_a),
            jsonb_build_object('lotes', (SELECT jsonb_agg(jsonb_build_object('ordem', x->'ordem') || (x->'depois')) FROM jsonb_array_elements(v_lotes) x),
                               'deducoes', v_deds_d),
            v_actor, 'fn_oc_abate_reclassificar_senar');
    IF p_simular IS NOT FALSE THEN
      RAISE EXCEPTION USING ERRCODE = 'ZS001', MESSAGE = 'previa', DETAIL = v_res::text;
    END IF;
  EXCEPTION WHEN SQLSTATE 'ZS001' THEN
    GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
    RETURN v_det::jsonb;
  END;
  RETURN v_res;
END
$function$;

CREATE OR REPLACE FUNCTION public.fn_oc_abate_reclassificar_senar_desfazer(p_operacao_id uuid, p_motivo text, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ev public.zoo_operacao_eventos;
  v_res jsonb;
BEGIN
  -- a ultima reclassificacao da OC que ainda nao foi desfeita
  SELECT * INTO v_ev FROM public.zoo_operacao_eventos e
   WHERE e.operacao_id = p_operacao_id AND e.acao = 'reclassificar_senar' AND NOT (e.detalhes ? 'desfaz')
     AND NOT EXISTS (SELECT 1 FROM public.zoo_operacao_eventos d
                      WHERE d.operacao_id = p_operacao_id AND d.acao = 'reclassificar_senar' AND d.detalhes->>'desfaz' = e.id::text)
   ORDER BY e.created_at DESC LIMIT 1;
  IF v_ev.id IS NULL THEN
    RAISE EXCEPTION 'Desfazer o SENAR: esta OC nao tem reclassificacao a desfazer' USING ERRCODE = 'P0001'; END IF;
  v_res := public.fn_oc_abate_reclassificar_senar(p_operacao_id,
             (SELECT jsonb_agg(jsonb_build_object('ordem', x->'ordem', 'senar', x->'senar')) FROM jsonb_array_elements(v_ev.dados_anteriores->'lotes') x),
             p_motivo, p_simular, v_ev.id);   -- a trilha e' imutavel: o evento NOVO leva a marca 'desfaz'; o antigo fica como esta'
  RETURN v_res || jsonb_build_object('desfaz', v_ev.id);
END
$function$;

REVOKE ALL ON FUNCTION public.fn_oc_abate_reclassificar_senar(uuid, jsonb, text, boolean, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_oc_abate_reclassificar_senar_desfazer(uuid, text, boolean) FROM PUBLIC, anon, authenticated;

-- item 3: o SENAR/PROAPE sai de uso (inativo; nunca apagado). Guarda: a linha existe, esta' ativa e nao tem uso.
DO $p$ DECLARE n int; BEGIN
  IF EXISTS (SELECT 1 FROM public.zoo_operacao_partes WHERE componente = 'senar_proape') THEN
    RAISE EXCEPTION 'IMPORTAR-ABATE-01: senar_proape tem uso: nada aplicado'; END IF;
  UPDATE public.zoo_componentes_financeiros SET ativo = false, updated_at = now() WHERE codigo = 'senar_proape' AND ativo;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'IMPORTAR-ABATE-01: senar_proape ativo esperado 1, achei %', n; END IF;
END $p$;
