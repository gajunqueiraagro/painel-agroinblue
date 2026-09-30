-- FIN-RECORRENCIA-GERAR-PREENCHE-VAGA-01 — o Gerar garante a SERIE COMPLETA da recorrencia.
--
-- ⚠ O DEFEITO (medido, NJ, 30/09): nas Folhas de FGTS, Allison, Zandonadi, Gustavo Maia e Patrick as 4 parcelas
--   antigas nasceram na regra velha (comp = mes do vencimento: 09..12/26) e as novas na regra nova (comp = mes anterior:
--   venc 05/02/27 -> 01/27 ...). Depois de propagar "Futuros e passados", as antigas vao a 08..11/26 e a competencia
--   12/26 (venc jan/27) fica VAGA. fn_recorrencia_gerar so' avancava a partir da marca (jun/27): nunca a criaria.
--
-- ⚠ O QUE MUDA (decisoes do Gabriel, 30/09):
--   - public._fn_recorrencia_vencimento(r, comp): o deslocamento e o vencimento SAIRAM do gerar VERBATIM para ca'.
--     Uma formula so', usada pelo gerar, pela busca de vagas e pela previsao da propagacao.
--   - public._fn_recorrencia_vagas(r, ocupadas, ate, marca): as travas das vagas numa funcao so' —
--       competencia >= mes CORRENTE (nunca historico) e >= inicio da vigencia; <= marca, fim da vigencia e p_ate;
--       CANCELADO CONTA COMO OCUPADO (o chamador passa as competencias de TODOS os lancamentos, cancelados inclusive);
--       pula mes fechado de financeiro_fechamentos (status 'fechado', por cliente/ano_mes).
--     Ocupacao compara o MES (date_trunc), nao a data exata.
--   - fn_recorrencia_gerar: o laco percorre as vagas (abaixo da janela) + a janela de avanco de sempre, com o MESMO
--     INSERT. A janela, a guarda NOT EXISTS do avanco e a marca ficam iguais (vaga abaixo da marca nao move a marca:
--     o UPDATE ja' exige ultimo_lancamento_gerado < v_ultimo). Retorno ganha 'vagas' [{competencia, vencimento}].
--   - fn_recorrencia_propagar: SO' a chave 'vagas' na projecao de cada escopo, pela mesma funcao (competencias finais
--     do escopo + as dos cancelados = ocupadas; marca = a que resultaria). Nenhuma outra linha mudou.
--   - O AVANCO NAO MUDA: ele continua recriando competencia cuja unica linha esta' cancelada e nao olha mes fechado.
--     Registrado como divida no CLAUDE.md (decisao do Gabriel: PR proprio).
--
-- ⚠ CORPOS DE ORIGEM conferidos por md5 antes de editar: gerar 5557de4fa31e308ec976d6c3fdc7789b, propagar
--   fffb05ea7d287d84c78997ee068bbdf2. As duas funcoes internas NAO sao SECURITY DEFINER e ninguem as executa por
--   fora (REVOKE de PUBLIC, anon e authenticated): quem as chama e' o gerar e o propagar, SECURITY DEFINER, que rodam
--   como o dono. Todo UPDATE/DELETE com WHERE (pg_safeupdate).
CREATE OR REPLACE FUNCTION public._fn_recorrencia_vencimento(p_r public.financeiro_recorrencias, p_comp date)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_r public.financeiro_recorrencias := p_r;
  v_comp date := p_comp;
  v_desloc int;
  v_venc date;
BEGIN
  -- deslocamento competencia->vencimento derivado da ANCORA (nunca gravado)
  v_desloc := (extract(year from v_r.primeiro_vencimento)::int * 12 + extract(month from v_r.primeiro_vencimento)::int)
            - (extract(year from v_r.data_inicio)::int * 12 + extract(month from v_r.data_inicio)::int);

    -- vencimento: mes da competencia + deslocamento, no DIA PRETENDIDO (aparado por mes curto)
    v_venc := least(
      (date_trunc('month', v_comp) + make_interval(months => v_desloc))::date
        + (v_r.dia_vencimento - 1),
      (date_trunc('month', v_comp) + make_interval(months => v_desloc + 1) - interval '1 day')::date
    );
    RETURN v_venc;
END;
$function$;

CREATE OR REPLACE FUNCTION public._fn_recorrencia_vagas(p_r public.financeiro_recorrencias, p_ocupadas date[], p_ate date DEFAULT NULL::date, p_marca date DEFAULT NULL::date)
 RETURNS TABLE(competencia date, vencimento date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- Competencias da regra SEM lancamento entre max(mes corrente, inicio da vigencia) e min(marca, fim, p_ate).
  -- p_marca NULL = a marca gravada na recorrencia; sem marca nenhuma, nao ha' vaga (a serie ainda nao comecou).
  SELECT gs::date AS competencia, public._fn_recorrencia_vencimento(p_r, gs::date) AS vencimento
    FROM generate_series(
           greatest(date_trunc('month', current_date), date_trunc('month', p_r.data_inicio)),
           least(date_trunc('month', coalesce(p_marca, p_r.ultimo_lancamento_gerado)),
                 date_trunc('month', p_r.data_fim),
                 coalesce(date_trunc('month', p_ate), date_trunc('month', p_r.data_fim))),
           interval '1 month') AS gs
   WHERE coalesce(p_marca, p_r.ultimo_lancamento_gerado) IS NOT NULL
     -- cancelado conta como ocupado: o chamador passa TODAS as competencias da recorrencia
     AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p_ocupadas, '{}'::date[])) AS o(d)
                      WHERE date_trunc('month', o.d) = gs)
     -- mes fechado nao recebe lancamento novo
     AND NOT EXISTS (SELECT 1 FROM public.financeiro_fechamentos ff
                      WHERE ff.cliente_id = p_r.cliente_id AND ff.status_fechamento = 'fechado'
                        AND ff.ano_mes = to_char(gs, 'YYYY-MM'))
   ORDER BY 1;
$function$;

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
  -- max(mes corrente, inicio) e a marca), com as travas de public._fn_recorrencia_vagas: nunca antes do mes corrente,
  -- respeita o fim da vigencia e o mes fechado, e CANCELADO CONTA COMO OCUPADO (nao recria o que alguem cancelou).
  -- Entram no MESMO laco e no MESMO INSERT do avanco — vencimento, valor e classificacao sao os dele. A janela de
  -- avanco (v_ini..v_fim) segue igual, e o indice uniq_lanc_recorrencia_competencia continua a guarda final.
  SELECT array_agg(fl.data_competencia) INTO v_ocupadas
    FROM public.financeiro_lancamentos_v2 fl
   WHERE fl.recorrencia_id = v_r.id;
  FOR v_comp, v_eh_vaga IN
    SELECT vg.competencia, true FROM public._fn_recorrencia_vagas(v_r, v_ocupadas, p_ate, NULL) vg WHERE vg.competencia < v_ini
    UNION ALL
    SELECT gs::date, false FROM generate_series(v_ini, v_fim, interval '1 month') gs
    ORDER BY 1
  LOOP
    v_venc := public._fn_recorrencia_vencimento(v_r, v_comp);
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
      IF FOUND THEN v_n := v_n + 1; v_ultimo := v_comp;
        IF v_eh_vaga THEN v_vagas := v_vagas || jsonb_build_object('competencia', to_char(v_comp, 'YYYY-MM'), 'vencimento', v_venc); END IF;
      END IF;
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM public.financeiro_lancamentos_v2 fl
         WHERE fl.recorrencia_id = v_r.id AND fl.data_competencia = v_comp
           AND fl.cancelado IS NOT TRUE
      ) THEN v_n := v_n + 1; v_ultimo := v_comp;
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
    'simulacao', p_simular, 'vagas', v_vagas);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_recorrencia_propagar(p_recorrencia_id uuid, p_escopo text DEFAULT 'futuros'::text, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_r public.financeiro_recorrencias;
  v_fut int := 0; v_pas int := 0; v_sinal_ruim int := 0;
  v_ap_fut int := 0; v_ap_pas int := 0;
  -- FIN-RECORRENCIA-PROPAGA-COMPETENCIA-01
  v_desloc int;
  v_marca_antes date; v_marca_depois date;
  v_ap_comp int := 0;
  v_comp jsonb; v_proj jsonb := '{}'::jsonb; v_e text; v_md date; v_max date; v_n int;
  -- fix2
  v_row record; v_aviso text;
BEGIN
  -- FIN-RECORR-PROPAGA-01: a recorrencia e a fonte da classificacao dos lancamentos que gerou.
  -- p_escopo: 'futuros' | 'todos' | 'nenhum'. p_simular=true so conta (mesmo predicado do update).
  -- Futuro = status previsto/programado/agendado/meta, sem data_pagamento, sem conciliacao.
  -- Passado = todo o resto nao cancelado. Cancelados nunca sao tocados.
  -- Propaga: descricao, favorecido, fazenda, conta (pelo tipo), subcentro (chave/grupo/centro/escopo via trigger),
  -- safra (trigger zera se administrativo), forma_pagamento, observacao. Valor SO nos futuros.
  -- Nunca toca: vencimento, pagamento, tipo_operacao, sinal, valor de passado, vinculo de conciliacao.
  -- Sinal trocado na regra = recusa.
  -- COMPETENCIA SEGUE A REGRA (FIN-RECORRENCIA-PROPAGA-COMPETENCIA-01, Gabriel 30/09): competencia =
  -- 1o dia do (mes do vencimento - deslocamento), com o deslocamento de fn_recorrencia_gerar. Futuros sempre
  -- que o escopo os inclui; passados (inclusive realizados/conciliados) so em 'todos'. Pula - sem abortar - o
  -- lancamento cuja competencia atual OU nova caia em mes FECHADO em financeiro_fechamentos. Ao fim, a marca
  -- ultimo_lancamento_gerado desce/sobe para a maior competencia viva, e o proximo gerar cria o que faltou.
  SELECT * INTO v_r FROM public.financeiro_recorrencias WHERE id = p_recorrencia_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recorrencia inexistente'; END IF;
  IF NOT (public.is_admin_agroinblue(v_uid) OR v_r.cliente_id IN (SELECT public.get_user_cliente_ids(v_uid))) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
  IF p_escopo NOT IN ('futuros','todos','nenhum') THEN RAISE EXCEPTION 'p_escopo invalido: %', p_escopo; END IF;

  SELECT count(*) FILTER (WHERE status_transacao IN ('previsto','programado','agendado','meta') AND data_pagamento IS NULL AND conciliado_em IS NULL),
         count(*) FILTER (WHERE NOT (status_transacao IN ('previsto','programado','agendado','meta') AND data_pagamento IS NULL AND conciliado_em IS NULL)),
         count(*) FILTER (WHERE tipo_operacao IS DISTINCT FROM v_r.tipo_operacao)
    INTO v_fut, v_pas, v_sinal_ruim
    FROM public.financeiro_lancamentos_v2
   WHERE recorrencia_id = p_recorrencia_id AND coalesce(cancelado,false) = false;

  IF p_escopo <> 'nenhum' AND v_sinal_ruim > 0 THEN
    RAISE EXCEPTION 'A recorrencia mudou de entrada para saida (ou o inverso). Trocar o sinal exige nova recorrencia; os % lancamentos gerados nao foram alterados.', v_sinal_ruim
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── COMPETENCIA (FIN-RECORRENCIA-PROPAGA-COMPETENCIA-01) ─────────────────────────────────────────────
  -- Deslocamento competencia->vencimento: a MESMA formula de fn_recorrencia_gerar (fonte unica; nunca gravado).
  v_desloc := (extract(year from v_r.primeiro_vencimento)::int * 12 + extract(month from v_r.primeiro_vencimento)::int)
            - (extract(year from v_r.data_inicio)::int * 12 + extract(month from v_r.data_inicio)::int);
  v_marca_antes := v_r.ultimo_lancamento_gerado;

  -- Todos os lancamentos vivos da recorrencia: a competencia que a regra pede e a final em cada escopo.
  -- Sem vencimento, a competencia fica como esta (nao ha de onde deriva-la).
  DROP TABLE IF EXISTS pg_temp._rec_prop_comp;
  CREATE TEMP TABLE _rec_prop_comp ON COMMIT DROP AS
  SELECT l.id AS lancamento_id, l.data_vencimento AS venc, l.data_competencia AS comp_antiga,
         CASE WHEN l.data_vencimento IS NULL THEN l.data_competencia
              ELSE (date_trunc('month', l.data_vencimento) - make_interval(months => v_desloc))::date END AS comp_nova,
         (l.status_transacao IN ('previsto','programado','agendado','meta') AND l.data_pagamento IS NULL AND l.conciliado_em IS NULL) AS futuro,
         false AS fechado, NULL::date AS comp_fim_fut, NULL::date AS comp_fim_todos
    FROM public.financeiro_lancamentos_v2 l
   WHERE l.recorrencia_id = p_recorrencia_id AND coalesce(l.cancelado,false) = false;

  -- MES FECHADO = financeiro_fechamentos.status_fechamento = 'fechado' no mes da competencia ATUAL ou NOVA, por
  -- cliente/ano_mes (decisao do Gabriel, 30/09). NAO financeiro_saldos_bancarios_v2.status_mes: aquele e'
  -- fechamento de CAIXA por conta, e trocar competencia nao mexe em caixa (vencimento, pagamento e vinculo ficam).
  -- Nenhum trigger de financeiro_lancamentos_v2 barra mes fechado (guard_financeiro_mes_fechado nao esta ligado a
  -- tabela nenhuma), entao o pulo e' daqui. Em 30/09 nao ha' NENHUMA linha 'fechado' na tabela: o pulo nao dispara
  -- hoje, e isso e' esperado.
  UPDATE _rec_prop_comp c SET fechado = true
   WHERE c.comp_nova IS DISTINCT FROM c.comp_antiga
     AND EXISTS (SELECT 1 FROM public.financeiro_fechamentos ff
                  WHERE ff.cliente_id = v_r.cliente_id AND ff.status_fechamento = 'fechado'
                    AND ff.ano_mes IN (to_char(c.comp_antiga, 'YYYY-MM'), to_char(c.comp_nova, 'YYYY-MM')));
  UPDATE _rec_prop_comp c
     SET comp_fim_fut   = CASE WHEN c.comp_nova IS DISTINCT FROM c.comp_antiga AND NOT c.fechado AND c.futuro THEN c.comp_nova ELSE c.comp_antiga END,
         comp_fim_todos = CASE WHEN c.comp_nova IS DISTINCT FROM c.comp_antiga AND NOT c.fechado THEN c.comp_nova ELSE c.comp_antiga END
   -- fix1: o PostgREST roda sob pg_safeupdate, que recusa UPDATE sem WHERE mesmo em tabela temporaria.
   WHERE c.lancamento_id IS NOT NULL;

  -- Projecao por escopo: quantas mudam, a marca que resultaria, o que o proximo gerar criaria (so o que ficou
  -- faltando ate' a marca antiga; dali em diante o gerar segue como sempre) e competencias repetidas (so listar).
  FOREACH v_e IN ARRAY ARRAY['futuros','todos'] LOOP
    SELECT max(CASE WHEN v_e = 'todos' THEN comp_fim_todos ELSE comp_fim_fut END),
           count(*) FILTER (WHERE comp_nova IS DISTINCT FROM comp_antiga AND NOT fechado AND (futuro OR v_e = 'todos'))
      INTO v_max, v_n FROM _rec_prop_comp;
    -- a marca so' se move quando alguma competencia muda: uma propagacao so' de classificacao nunca a toca
    -- (senao um mes cancelado de proposito voltaria no proximo gerar).
    v_md := CASE WHEN v_n > 0 THEN coalesce(v_max, v_marca_antes) ELSE v_marca_antes END;
    v_proj := v_proj || jsonb_build_object(v_e, jsonb_build_object(
      'alteradas', v_n,
      'marca_depois', v_md,
      'a_gerar', (SELECT coalesce(jsonb_agg(to_char(g.m, 'YYYY-MM') ORDER BY g.m), '[]'::jsonb)
                    FROM generate_series((date_trunc('month', v_md) + interval '1 month')::date,
                                         least(greatest(v_marca_antes, v_md), date_trunc('month', v_r.data_fim)::date),
                                         interval '1 month') AS g(m)
                   WHERE v_md IS NOT NULL AND v_marca_antes IS NOT NULL
                     AND NOT EXISTS (SELECT 1 FROM _rec_prop_comp c
                                      WHERE (CASE WHEN v_e = 'todos' THEN c.comp_fim_todos ELSE c.comp_fim_fut END) = g.m::date)),
      'duplicidades', (SELECT coalesce(jsonb_agg(jsonb_build_object('competencia', to_char(d.k, 'YYYY-MM'), 'n', d.n) ORDER BY d.k), '[]'::jsonb)
                         FROM (SELECT (CASE WHEN v_e = 'todos' THEN comp_fim_todos ELSE comp_fim_fut END) AS k, count(*) AS n
                                 FROM _rec_prop_comp GROUP BY 1 HAVING count(*) > 1) d),
      -- FIN-RECORRENCIA-GERAR-PREENCHE-VAGA-01: as VAGAS que o proximo Gerar preenche abaixo da marca resultante, pela
      -- MESMA funcao que o gerar usa para gravar (competencias finais deste escopo + as dos cancelados = ocupadas).
      'vagas', (SELECT coalesce(jsonb_agg(jsonb_build_object('competencia', to_char(vg.competencia, 'YYYY-MM'), 'vencimento', vg.vencimento) ORDER BY vg.competencia), '[]'::jsonb)
                  FROM public._fn_recorrencia_vagas(v_r,
                         ARRAY(SELECT (CASE WHEN v_e = 'todos' THEN c.comp_fim_todos ELSE c.comp_fim_fut END) FROM _rec_prop_comp c
                               UNION ALL
                               SELECT l.data_competencia FROM public.financeiro_lancamentos_v2 l
                                WHERE l.recorrencia_id = p_recorrencia_id AND l.cancelado IS TRUE),
                         NULL, v_md) vg),
      -- fix2: COLISAO REAL = o estado final repete a competencia (o indice uniq_lanc_recorrencia_competencia recusaria).
      -- Vira AVISO LEGIVEL na simulacao e RECUSA antes de gravar na execucao. Nomeia a primeira competencia repetida e
      -- quem a segura (o lancamento que nao se move); se o dono e' um passado fora do escopo 'futuros', sugere o outro.
      'aviso', (SELECT CASE
                  WHEN o.lancamento_id IS NOT NULL THEN
                    format('competência %s já ocupada pelo lançamento venc %s — %s', to_char(d.k, 'MM/YY'),
                           coalesce(to_char(o.venc, 'DD/MM'), 'sem vencimento'),
                           CASE WHEN v_e = 'futuros' AND NOT o.futuro AND NOT o.fechado
                                THEN 'escolha Futuros e passados ou ajuste manual' ELSE 'ajuste manual' END)
                  ELSE format('competência %s ficaria com %s lançamentos (venc %s) — ajuste manual', to_char(d.k, 'MM/YY'), d.n, d.vencs)
                  END || CASE WHEN d.total > 1 THEN format(' (e mais %s competência(s) repetida(s))', d.total - 1) ELSE '' END
                  FROM (SELECT x.k, x.n, x.vencs, count(*) OVER () AS total
                          FROM (SELECT (CASE WHEN v_e = 'todos' THEN comp_fim_todos ELSE comp_fim_fut END) AS k, count(*) AS n,
                                       string_agg(coalesce(to_char(venc, 'DD/MM'), '—'), ', ' ORDER BY venc) AS vencs
                                  FROM _rec_prop_comp GROUP BY 1 HAVING count(*) > 1) x
                         ORDER BY x.k LIMIT 1) d
                  LEFT JOIN LATERAL (SELECT c.* FROM _rec_prop_comp c
                                      WHERE (CASE WHEN v_e = 'todos' THEN c.comp_fim_todos ELSE c.comp_fim_fut END) = d.k
                                        AND (CASE WHEN v_e = 'todos' THEN c.comp_fim_todos ELSE c.comp_fim_fut END) IS NOT DISTINCT FROM c.comp_antiga
                                      ORDER BY c.venc LIMIT 1) o ON true)));
  END LOOP;

  v_comp := jsonb_build_object(
    'desloc', v_desloc,
    'marca_antes', v_marca_antes,
    'futuros', (SELECT jsonb_build_object(
                  'alteradas', count(*) FILTER (WHERE NOT fechado),
                  'puladas_mes_fechado', count(*) FILTER (WHERE fechado),
                  'lista', coalesce((SELECT jsonb_agg(jsonb_build_object('lancamento_id', s.lancamento_id, 'venc', s.venc, 'comp_antiga', s.comp_antiga, 'comp_nova', s.comp_nova) ORDER BY s.venc)
                                       FROM (SELECT * FROM _rec_prop_comp WHERE futuro AND NOT fechado AND comp_nova IS DISTINCT FROM comp_antiga ORDER BY venc LIMIT 50) s), '[]'::jsonb))
                  FROM _rec_prop_comp WHERE futuro AND comp_nova IS DISTINCT FROM comp_antiga),
    'passados', (SELECT jsonb_build_object(
                  'alteradas', count(*) FILTER (WHERE NOT fechado),
                  'puladas_mes_fechado', count(*) FILTER (WHERE fechado),
                  'lista', coalesce((SELECT jsonb_agg(jsonb_build_object('lancamento_id', s.lancamento_id, 'venc', s.venc, 'comp_antiga', s.comp_antiga, 'comp_nova', s.comp_nova) ORDER BY s.venc)
                                       FROM (SELECT * FROM _rec_prop_comp WHERE NOT futuro AND NOT fechado AND comp_nova IS DISTINCT FROM comp_antiga ORDER BY venc LIMIT 50) s), '[]'::jsonb))
                  FROM _rec_prop_comp WHERE NOT futuro AND comp_nova IS DISTINCT FROM comp_antiga),
    'meses_fechados', (SELECT coalesce(jsonb_agg(DISTINCT ff.ano_mes ORDER BY ff.ano_mes), '[]'::jsonb)
                         FROM _rec_prop_comp c JOIN public.financeiro_fechamentos ff
                           ON ff.cliente_id = v_r.cliente_id AND ff.status_fechamento = 'fechado'
                          AND ff.ano_mes IN (to_char(c.comp_antiga, 'YYYY-MM'), to_char(c.comp_nova, 'YYYY-MM'))
                        WHERE c.fechado),
    'projecao', v_proj);

  IF p_simular OR p_escopo = 'nenhum' THEN
    RETURN jsonb_build_object('futuros', v_fut, 'passados', v_pas, 'aplicados_futuros', 0, 'aplicados_passados', 0, 'simulado', p_simular)
        || jsonb_build_object('competencia', v_comp);
  END IF;

  -- fix2: colisao real recusa ANTES de qualquer gravacao, com a mesma frase que a simulacao mostrou.
  v_aviso := v_proj -> p_escopo ->> 'aviso';
  IF v_aviso IS NOT NULL THEN
    RAISE EXCEPTION 'Nada foi propagado: %', v_aviso USING ERRCODE = 'check_violation';
  END IF;

  -- propagacao de regra nao e edicao manual do lancamento
  ALTER TABLE public.financeiro_lancamentos_v2 DISABLE TRIGGER trg_financeiro_lancamento_v2_editado_manual;

  -- futuros: tudo, inclusive valor
  UPDATE public.financeiro_lancamentos_v2 l
     SET descricao = v_r.descricao, favorecido_id = v_r.favorecido_id, fazenda_id = v_r.fazenda_id,
         conta_bancaria_id = CASE WHEN v_r.valor_base < 0 THEN v_r.conta_bancaria_id ELSE NULL END,
         conta_destino_id  = CASE WHEN v_r.valor_base > 0 THEN v_r.conta_bancaria_id ELSE NULL END,
         subcentro = v_r.subcentro, safra_id = v_r.safra_id,
         forma_pagamento = v_r.forma_pagamento, observacao = v_r.observacao,
         valor = abs(v_r.valor_base), updated_by = v_uid
   WHERE l.recorrencia_id = p_recorrencia_id AND coalesce(l.cancelado,false) = false
     AND l.status_transacao IN ('previsto','programado','agendado','meta') AND l.data_pagamento IS NULL AND l.conciliado_em IS NULL;
  GET DIAGNOSTICS v_ap_fut = ROW_COUNT;

  IF p_escopo = 'todos' THEN
    -- passados: classificacao e identificacao; nunca valor nem vencimento/pagamento (a competencia vem abaixo)
    UPDATE public.financeiro_lancamentos_v2 l
       SET descricao = v_r.descricao, favorecido_id = v_r.favorecido_id, fazenda_id = v_r.fazenda_id,
           conta_bancaria_id = CASE WHEN v_r.valor_base < 0 THEN v_r.conta_bancaria_id ELSE NULL END,
           conta_destino_id  = CASE WHEN v_r.valor_base > 0 THEN v_r.conta_bancaria_id ELSE NULL END,
           subcentro = v_r.subcentro, safra_id = v_r.safra_id,
           forma_pagamento = v_r.forma_pagamento, observacao = v_r.observacao, updated_by = v_uid
     WHERE l.recorrencia_id = p_recorrencia_id AND coalesce(l.cancelado,false) = false
       AND NOT (l.status_transacao IN ('previsto','programado','agendado','meta') AND l.data_pagamento IS NULL AND l.conciliado_em IS NULL);
    GET DIAGNOSTICS v_ap_pas = ROW_COUNT;
  END IF;

  -- competencia pela regra: futuros sempre; passados so' em 'todos'; mes fechado pulado (ver acima).
  -- ano_mes acompanha pelo trg_00_ano_mes_from_competencia.
  -- fix2: EM ORDEM SEGURA, LINHA A LINHA. O indice unico uniq_lanc_recorrencia_competencia (recorrencia, competencia)
  -- e' conferido a cada linha, nao no fim do comando: deslocar set->ago e out->set num UPDATE so' falhava quando a
  -- ordem fisica tocava out antes de set (NJ, 30/09 15:12). Recuos primeiro, da competencia mais antiga para a mais
  -- nova (cada um cai num mes ja' liberado); depois avancos, da mais nova para a mais antiga. Colisao do estado
  -- final ja' foi recusada acima; um unique_violation aqui so' sobra com direcoes misturadas por edicao manual, e vira
  -- mensagem legivel (o erro cru do indice nao chega a tela). As demais colunas ficaram no UPDATE de cima: so' a
  -- competencia muda de chave, e so' ela precisa de ordem.
  BEGIN
    FOR v_row IN
      SELECT c.lancamento_id, c.comp_nova
        FROM _rec_prop_comp c
       WHERE c.comp_nova IS DISTINCT FROM c.comp_antiga AND NOT c.fechado AND (c.futuro OR p_escopo = 'todos')
       ORDER BY CASE WHEN c.comp_nova < c.comp_antiga THEN 0 WHEN c.comp_nova > c.comp_antiga THEN 1 ELSE 2 END,
                CASE WHEN c.comp_nova < c.comp_antiga THEN c.comp_antiga END ASC,
                CASE WHEN c.comp_nova > c.comp_antiga THEN c.comp_antiga END DESC,
                c.lancamento_id
    LOOP
      UPDATE public.financeiro_lancamentos_v2
         SET data_competencia = v_row.comp_nova, updated_by = v_uid
       WHERE id = v_row.lancamento_id;
      v_ap_comp := v_ap_comp + 1;
    END LOOP;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Nada foi propagado: as competencias desta recorrencia nao se deslocam sem repetir um mes no caminho (lancamentos editados a mao em direcoes diferentes) — ajuste manual'
      USING ERRCODE = 'check_violation';
  END;

  ALTER TABLE public.financeiro_lancamentos_v2 ENABLE TRIGGER trg_financeiro_lancamento_v2_editado_manual;

  -- marca d'agua: a maior competencia viva, para o proximo fn_recorrencia_gerar criar o que ficou faltando. A
  -- propagacao NAO cria lancamento. So' se move quando alguma competencia mudou (ver a projecao).
  v_marca_depois := v_marca_antes;
  IF v_ap_comp > 0 THEN
    SELECT max(data_competencia) INTO v_max FROM public.financeiro_lancamentos_v2
     WHERE recorrencia_id = p_recorrencia_id AND coalesce(cancelado,false) = false;
    IF v_max IS NOT NULL AND v_max IS DISTINCT FROM v_marca_antes THEN
      UPDATE public.financeiro_recorrencias
         SET ultimo_lancamento_gerado = v_max, updated_at = now(), updated_by = v_uid
       WHERE id = v_r.id;
      v_marca_depois := v_max;
    END IF;
  END IF;

  RETURN jsonb_build_object('futuros', v_fut, 'passados', v_pas, 'aplicados_futuros', v_ap_fut, 'aplicados_passados', v_ap_pas, 'simulado', false)
      || jsonb_build_object('competencia', v_comp || jsonb_build_object(
           'aplicadas', v_ap_comp,
           'marca_depois', v_marca_depois,
           'a_gerar', v_proj -> p_escopo -> 'a_gerar',
           'duplicidades', v_proj -> p_escopo -> 'duplicidades'));
END;
$function$;

REVOKE ALL ON FUNCTION public._fn_recorrencia_vencimento(public.financeiro_recorrencias, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._fn_recorrencia_vagas(public.financeiro_recorrencias, date[], date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_recorrencia_gerar(uuid, date, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_recorrencia_gerar(uuid, date, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_recorrencia_gerar(uuid, date, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_recorrencia_propagar(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_recorrencia_propagar(uuid, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_recorrencia_propagar(uuid, text, boolean) TO authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.fn_recorrencia_gerar(uuid, date, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_recorrencia_propagar(uuid, text, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public._fn_recorrencia_vagas(public.financeiro_recorrencias, date[], date, date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public._fn_recorrencia_vencimento(public.financeiro_recorrencias, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FIN-RECORRENCIA-GERAR-PREENCHE-VAGA-01: anon ainda alcanca uma das funcoes da recorrencia';
  END IF;
  IF has_function_privilege('authenticated', 'public._fn_recorrencia_vagas(public.financeiro_recorrencias, date[], date, date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._fn_recorrencia_vencimento(public.financeiro_recorrencias, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FIN-RECORRENCIA-GERAR-PREENCHE-VAGA-01: as funcoes internas nao podem ser chamadas pela API';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_recorrencia_gerar(uuid, date, boolean)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_recorrencia_propagar(uuid, text, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FIN-RECORRENCIA-GERAR-PREENCHE-VAGA-01: authenticated perdeu o EXECUTE do gerar/propagar';
  END IF;
END
$$;
