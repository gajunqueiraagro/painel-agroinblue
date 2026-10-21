-- OC-DESFAZER-PREVISTO-01b (correção, Gabriel 20/10/2026) — a GUARDA DE CLIENTE no `oc_desfazer_compromisso`.
--
-- A 20261028100800 recriou o `oc_desfazer_compromisso` (SECURITY DEFINER, recebe só ids) sem a guarda própria de cliente; a suíte
-- (`guardaDeClienteNasMigrations.test.ts`, SEG-AGRI-TENANT-01) acusou. Os donos que ele encadeia (estornar, cancelar programação,
-- cancelar compromisso) já checavam o acesso, mas a simulação lia a operação antes deles. Migration aplicada é registro histórico:
-- a guarda entra aqui, redefinindo a função INTEIRA (a mesma da 100800 + a guarda pelo cliente da operação,
-- `_fn_exigir_tenant_das_linhas`, 42501). O service_role segue passando, como nos donos.
-- Guarda por md5: só troca a definição da 100800 (origem); já com a guarda (destino), a recriação é a mesma.

DO $guarda$
DECLARE v_md5 text;
BEGIN
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc WHERE oid = 'public.oc_desfazer_compromisso(uuid, integer, uuid, text, boolean, boolean)'::regprocedure;
  IF v_md5 <> '2ef2bb0ce5ca58eb4e9f1bb55948ad5f' AND (SELECT prosrc FROM pg_proc
       WHERE oid = 'public.oc_desfazer_compromisso(uuid, integer, uuid, text, boolean, boolean)'::regprocedure) !~ '_fn_exigir_tenant_das_linhas' THEN
    RAISE EXCEPTION 'OC-DESFAZER-PREVISTO-01b: oc_desfazer_compromisso com origem inesperada %', v_md5;
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public.oc_desfazer_compromisso(p_operacao_id uuid, p_versao integer, p_compromisso_id uuid, p_motivo text,
  p_simular boolean DEFAULT false, p_confirmar_agendado boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public' AS $function$
DECLARE
  v_op public.zoo_operacoes_comerciais; v_comp public.zoo_operacao_compromissos; v_estorno uuid := gen_random_uuid();
  v_ver int; v_x jsonb; r record; v_titulos jsonb := '[]'::jsonb; v_agendados jsonb := '[]'::jsonb; v_progs int := 0;
  v_ret jsonb; v_motivo text; v_fl public.financeiro_lancamentos_v2; v_total int;
BEGIN
  SELECT * INTO v_op FROM public.zoo_operacoes_comerciais WHERE id = p_operacao_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operação não encontrada.' USING ERRCODE = 'P0002'; END IF;
  -- OC-DESFAZER-PREVISTO-01b (fix): a guarda de cliente na PRÓPRIA função (SECURITY DEFINER) — pelo cliente da operação. Os donos
  -- que ela encadeia já checavam; a regra da casa (SEG-AGRI-TENANT-01) exige a guarda aqui também. O service_role segue passando,
  -- como nos donos.
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    PERFORM public._fn_exigir_tenant_das_linhas(ARRAY[v_op.cliente_id]);
  END IF;
  IF NOT coalesce(p_simular, false) AND (p_motivo IS NULL OR btrim(p_motivo) = '') THEN
    RAISE EXCEPTION 'Informe o motivo para desfazer.' USING ERRCODE = 'P0001'; END IF;
  -- os donos exigem motivo; a simulação (sem motivo) passa um texto que nunca é gravado
  v_motivo := COALESCE(NULLIF(btrim(p_motivo), ''), 'simulação');
  SELECT * INTO v_comp FROM public.zoo_operacao_compromissos
   WHERE id = p_compromisso_id AND operacao_id = p_operacao_id AND cliente_id = v_op.cliente_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compromisso não encontrado nesta operação.' USING ERRCODE = 'P0001'; END IF;
  IF v_comp.status = 'cancelado' THEN RAISE EXCEPTION 'Este compromisso já foi cancelado.' USING ERRCODE = 'P0001'; END IF;
  v_ver := CASE WHEN p_simular THEN v_op.versao ELSE p_versao END;

  -- (1) FOLHA: cada parcela com título vivo é estornada pelo dono, que recusa realizado, conciliado ou com liquidação ativa
  --     (frase pronta, o lançamento no DETAIL). AGENDADO: só com a confirmação explícita; na simulação, entra na lista.
  FOR r IN
    SELECT pp.id AS parcela_id, pp.programacao_id, pp.sequencia, pp.valor, pp.vencimento
      FROM public.zoo_operacao_parcelas_programacao pp
      JOIN public.zoo_operacao_programacoes pr ON pr.id = pp.programacao_id
     WHERE pr.compromisso_id = p_compromisso_id AND pr.status = 'ativa'
       AND (pp.status IN ('materializada', 'paga')
            OR EXISTS (SELECT 1 FROM public.zoo_operacao_partes pt WHERE pt.programacao_parcela_id = pp.id AND pt.cancelada IS NOT TRUE))
     ORDER BY pp.sequencia
  LOOP
    SELECT l.* INTO v_fl FROM public.zoo_operacao_partes pt JOIN public.financeiro_lancamentos_v2 l ON l.id = pt.financeiro_lancamento_id
     WHERE pt.programacao_parcela_id = r.parcela_id AND pt.cancelada IS NOT TRUE AND l.cancelado IS NOT TRUE LIMIT 1;
    SELECT count(*) INTO v_total FROM public.zoo_operacao_parcelas_programacao q WHERE q.programacao_id = r.programacao_id AND q.status <> 'cancelada';
    IF v_fl.id IS NOT NULL AND v_fl.status_transacao = 'agendado' AND v_fl.conciliado_em IS NULL THEN
      v_agendados := v_agendados || jsonb_build_object('lancamento_id', v_fl.id, 'sequencia', r.sequencia, 'total', v_total,
        'valor', abs(v_fl.valor), 'data', COALESCE(v_fl.data_vencimento, r.vencimento), 'sinal', v_fl.sinal);
      IF NOT coalesce(p_simular, false) AND NOT coalesce(p_confirmar_agendado, false) THEN
        RAISE EXCEPTION 'O lançamento de % com vencimento em % está agendado no banco. Confirme o cancelamento do lançamento agendado.',
          public._fn_oc_brl(abs(v_fl.valor)), public._fn_oc_data(COALESCE(v_fl.data_vencimento, r.vencimento))
          USING ERRCODE = 'P0001', DETAIL = v_fl.id::text, HINT = public._fn_oc_lanc_que_trava(v_fl.id, r.parcela_id);
      END IF;
    END IF;
    v_x := public.oc_estornar_materializacao(p_operacao_id, v_op.cliente_id, v_ver, r.programacao_id, r.parcela_id, v_motivo, v_estorno);
    v_ver := (v_x->>'operacao_versao')::int;
    v_titulos := v_titulos || jsonb_build_object('sequencia', r.sequencia, 'total', v_total, 'parcela_id', r.parcela_id,
      'titulo_id', v_x->>'titulo_id', 'valor', r.valor, 'data', COALESCE(v_fl.data_vencimento, r.vencimento),
      'status', v_fl.status_transacao, 'sinal', v_fl.sinal);
  END LOOP;

  -- (2) a programação ativa
  FOR r IN SELECT pr.id FROM public.zoo_operacao_programacoes pr
            WHERE pr.compromisso_id = p_compromisso_id AND pr.status = 'ativa' ORDER BY pr.created_at LOOP
    v_x := public.oc_cancelar_programacao(p_operacao_id, v_op.cliente_id, v_ver, r.id, v_motivo, v_estorno);
    v_ver := (v_x->>'operacao_versao')::int;
    v_progs := v_progs + 1;
  END LOOP;

  -- (3) RAIZ: o compromisso
  v_x := public.oc_cancelar_compromisso(p_operacao_id, v_op.cliente_id, v_ver, p_compromisso_id, v_motivo, v_estorno);
  v_ver := (v_x->>'operacao_versao')::int;

  v_ret := jsonb_build_object('ok', true, 'simulado', coalesce(p_simular, false), 'estorno_id', v_estorno,
    'compromisso_id', p_compromisso_id, 'natureza', v_comp.natureza, 'componente', v_comp.componente,
    'valor_total', v_comp.valor_total, 'titulos_estornados', v_titulos, 'agendados', v_agendados,
    'programacoes_canceladas', v_progs, 'operacao_id', p_operacao_id,
    'operacao_versao', CASE WHEN p_simular THEN v_op.versao ELSE v_ver END);
  IF p_simular THEN RAISE EXCEPTION 'simulação do desfazer (desfeita)' USING ERRCODE = 'OCSIM'; END IF;
  RETURN v_ret;
EXCEPTION WHEN SQLSTATE 'OCSIM' THEN RETURN v_ret;
END; $function$;
REVOKE ALL ON FUNCTION public.oc_desfazer_compromisso(uuid, integer, uuid, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oc_desfazer_compromisso(uuid, integer, uuid, text, boolean, boolean) TO authenticated, service_role;

DO $confere$
BEGIN
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'public.oc_desfazer_compromisso(uuid, integer, uuid, text, boolean, boolean)'::regprocedure)
     !~ '_fn_exigir_tenant_das_linhas' THEN RAISE EXCEPTION 'OC-DESFAZER-PREVISTO-01b: guarda ausente'; END IF;
  IF has_function_privilege('anon', 'public.oc_desfazer_compromisso(uuid, integer, uuid, text, boolean, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'OC-DESFAZER-PREVISTO-01b: executável por anon'; END IF;
END $confere$;
