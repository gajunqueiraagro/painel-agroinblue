-- RECORRENCIA-GERA-A-VIGENCIA-INTEIRA-01, parte 2 de 2 (depende da 20261027195500).
-- fn_recorrencia_gerar: percorre as vagas desde o inicio da vigencia + o avanco, no MESMO INSERT; mes fechado nao gera,
-- na vaga E no avanco, e vai em nao_gerados; retorno ganha gerado_de / gerado_ate. Assinatura, SECURITY e ACL iguais.
SET LOCAL lock_timeout = '2s';

DO $guarda$
DECLARE v text;
BEGIN
  SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid = 'public.fn_recorrencia_gerar(uuid, date, boolean)'::regprocedure;
  IF v IS DISTINCT FROM 'f1e0139104f7207c3d86216ba90966ba' THEN RAISE EXCEPTION 'origem: fn_recorrencia_gerar md5 %', v; END IF;
  SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid = 'public._fn_recorrencia_vagas(public.financeiro_recorrencias, date[], date, date, boolean)'::regprocedure;
  IF v IS DISTINCT FROM 'f13b4eca5ba0663b71ffac881c24897d' THEN RAISE EXCEPTION 'origem: _fn_recorrencia_vagas md5 %', v; END IF;
END
$guarda$;

CREATE OR REPLACE FUNCTION public.fn_recorrencia_gerar(p_recorrencia_id uuid, p_ate date DEFAULT NULL::date, p_simular boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_r public.financeiro_recorrencias;
  v_desloc int;
  v_ini date; v_fim date;
  v_n int := 0;
  v_comp date; v_venc date; v_ultimo date := NULL;
  -- FIN-RECORRENCIA-GERAR-PREENCHE-VAGA-01
  v_ocupadas date[]; v_eh_vaga boolean; v_vagas jsonb := '[]'::jsonb;
  -- RECORRENCIA-GERA-A-VIGENCIA-INTEIRA-01
  v_motivo text; v_nao jsonb := '[]'::jsonb; v_primeiro date := NULL;
BEGIN
  SELECT * INTO v_r FROM public.financeiro_recorrencias
   WHERE id = p_recorrencia_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recorrencia inexistente'; END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR v_r.cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  IF NOT v_r.ativo THEN RAISE EXCEPTION 'recorrencia cancelada nao gera'; END IF;

  -- deslocamento e vencimento: em public._fn_recorrencia_vencimento (movidos VERBATIM; uma formula so', que
  -- a busca de vagas e a previsao da propagacao tambem usam).

  -- janela: da marca dagua (mes seguinte) ou do inicio, ate o teto (p_ate so encurta)
  v_ini := greatest(
    date_trunc('month', v_r.data_inicio)::date,
    coalesce((date_trunc('month', v_r.ultimo_lancamento_gerado) + interval '1 month')::date, date_trunc('month', v_r.data_inicio)::date)
  );
  v_fim := least(date_trunc('month', v_r.data_fim)::date,
                 coalesce(date_trunc('month', p_ate)::date, date_trunc('month', v_r.data_fim)::date));

  -- VAGAS (FIN-RECORRENCIA-GERAR-PREENCHE-VAGA-01): competencias da regra SEM lancamento ABAIXO da janela (entre
  -- o INICIO DA VIGENCIA e a marca), com as travas de public._fn_recorrencia_vagas: respeita o fim da vigencia, e
  -- CANCELADO CONTA COMO OCUPADO (nao recria o que alguem cancelou).
  -- RECORRENCIA-GERA-A-VIGENCIA-INTEIRA-01 (Gabriel, 10/10/2026; SUBSTITUI o "nunca antes do mes corrente" de 30/09):
  -- a serie comeca no inicio da vigencia, meses PASSADOS inclusive. MES FECHADO continua sem gerar, na vaga E no avanco,
  -- mas nao some: vai em 'nao_gerados' com o motivo. Quem diz que o mes esta' fechado e' a busca de vagas (um dono).
  -- Entram no MESMO laco e no MESMO INSERT do avanco — vencimento, valor e classificacao sao os dele. A janela de
  -- avanco (v_ini..v_fim) segue igual, e o indice uniq_lanc_recorrencia_competencia continua a guarda final.
  SELECT array_agg(fl.data_competencia) INTO v_ocupadas
    FROM public.financeiro_lancamentos_v2 fl
   WHERE fl.recorrencia_id = v_r.id;
  FOR v_comp, v_eh_vaga, v_motivo IN
    SELECT vg.competencia, true, vg.motivo FROM public._fn_recorrencia_vagas(v_r, v_ocupadas, p_ate, NULL, true) vg WHERE vg.competencia < v_ini
    UNION ALL
    SELECT gs::date, false, f.motivo FROM generate_series(v_ini, v_fim, interval '1 month') gs
      LEFT JOIN public._fn_recorrencia_vagas(v_r, NULL, p_ate, v_fim, true) f ON f.competencia = gs::date
    ORDER BY 1
  LOOP
    v_venc := public._fn_recorrencia_vencimento(v_r, v_comp);
    -- o que NAO pode ser gerado nao some: fica escrito, com o motivo (so' quando o gerar o criaria)
    IF v_motivo IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.financeiro_lancamentos_v2 fl
         WHERE fl.recorrencia_id = v_r.id AND fl.data_competencia = v_comp
           AND fl.cancelado IS NOT TRUE
      ) THEN
        v_nao := v_nao || jsonb_build_object('competencia', to_char(v_comp, 'YYYY-MM'), 'vencimento', v_venc, 'motivo', v_motivo);
      END IF;
      CONTINUE;
    END IF;
    IF NOT p_simular THEN
      INSERT INTO public.financeiro_lancamentos_v2 (
        cliente_id, fazenda_id, descricao, favorecido_id,
        conta_bancaria_id, conta_destino_id,
        subcentro, safra_id, forma_pagamento, observacao,
        valor, tipo_operacao, sinal,
        data_competencia, data_vencimento,
        status_transacao, cenario, ano_mes,
        sem_movimentacao_caixa, cancelado, origem_lancamento,
        recorrencia_id, created_by, updated_by
      )
      SELECT
        v_r.cliente_id, v_r.fazenda_id, v_r.descricao, v_r.favorecido_id,
        CASE WHEN v_r.valor_base < 0 THEN v_r.conta_bancaria_id ELSE NULL END,
        CASE WHEN v_r.valor_base > 0 THEN v_r.conta_bancaria_id ELSE NULL END,
        v_r.subcentro, v_r.safra_id, v_r.forma_pagamento, v_r.observacao,
        abs(v_r.valor_base), v_r.tipo_operacao,
        CASE WHEN v_r.valor_base > 0 THEN '1' ELSE '-1' END,  -- convencao da casa (82 mil registros: '1'/'-1')
        v_comp, v_venc,
        'previsto', 'realizado', to_char(v_comp, 'YYYY-MM'),
        false, false, 'recorrencia',
        v_r.id, v_uid, v_uid
      WHERE NOT EXISTS (
        SELECT 1 FROM public.financeiro_lancamentos_v2 fl
         WHERE fl.recorrencia_id = v_r.id AND fl.data_competencia = v_comp
           AND fl.cancelado IS NOT TRUE
      );
      IF FOUND THEN v_n := v_n + 1; v_ultimo := v_comp; v_primeiro := coalesce(v_primeiro, v_comp);
        IF v_eh_vaga THEN v_vagas := v_vagas || jsonb_build_object('competencia', to_char(v_comp, 'YYYY-MM'), 'vencimento', v_venc); END IF;
      END IF;
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM public.financeiro_lancamentos_v2 fl
         WHERE fl.recorrencia_id = v_r.id AND fl.data_competencia = v_comp
           AND fl.cancelado IS NOT TRUE
      ) THEN v_n := v_n + 1; v_ultimo := v_comp; v_primeiro := coalesce(v_primeiro, v_comp);
        IF v_eh_vaga THEN v_vagas := v_vagas || jsonb_build_object('competencia', to_char(v_comp, 'YYYY-MM'), 'vencimento', v_venc); END IF;
      END IF;
    END IF;
  END LOOP;

  IF NOT p_simular AND v_ultimo IS NOT NULL THEN
    UPDATE public.financeiro_recorrencias
       SET ultimo_lancamento_gerado = v_ultimo, updated_at = now(), updated_by = v_uid
     WHERE id = v_r.id
       AND (ultimo_lancamento_gerado IS NULL OR ultimo_lancamento_gerado < v_ultimo);
  END IF;

  RETURN jsonb_build_object('ok', true, 'gerados', v_n,
    'de', to_char(v_ini,'YYYY-MM'), 'ate', to_char(v_fim,'YYYY-MM'),
    'simulacao', p_simular, 'vagas', v_vagas,
    'nao_gerados', v_nao,
    'gerado_de', to_char(v_primeiro, 'YYYY-MM'), 'gerado_ate', to_char(v_ultimo, 'YYYY-MM'));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_recorrencia_gerar(uuid, date, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_recorrencia_gerar(uuid, date, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_recorrencia_gerar(uuid, date, boolean) TO authenticated;

DO $confere$
DECLARE v text;
BEGIN
  IF has_function_privilege('anon', 'public.fn_recorrencia_gerar(uuid, date, boolean)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_recorrencia_gerar(uuid, date, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL do gerar errada';
  END IF;
  SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid = 'public.fn_recorrencia_gerar(uuid, date, boolean)'::regprocedure;
  IF v IS DISTINCT FROM '9fb51f246db33435d545fd74d714c3b9' THEN RAISE EXCEPTION 'destino: fn_recorrencia_gerar md5 %', v; END IF;
  SELECT md5(prosrc) INTO v FROM pg_proc WHERE oid = 'public.fn_recorrencia_propagar(uuid, text, boolean)'::regprocedure;
  IF v IS DISTINCT FROM '6a932aa9771cbfb81ae09bbef4572f57' THEN RAISE EXCEPTION 'destino: fn_recorrencia_propagar mudou (md5 %)', v; END IF;
END
$confere$;
